/**
 * 角色「徽章（封号/官职头衔）」与「角色定位（叙事职能）」规范化
 *
 * 单一实现，供两处共用：
 *  1) /api/ai-generate 的 characters 步骤收尾（新生成角色）
 *  2) /api/characters/normalize 的「一键校正」（修正历史批次遗留的脏数据）
 *
 * 背景（2026-09-05 用户实测）：定位大面积显示"竞争对手"、徽章出现"短命/支撑危局/
 * 江湖上有个响亮的绰号/江阴"等非头衔词。根因是判定文本层次混乱 + 直接采信 LLM 头衔。
 * 本模块的三条铁律：
 *  A. 敏感判定（对手/反派/变节）只看 阵营 + 身份首段，绝不看整段背景，也不看上一轮的旧标签
 *     （旧标签会自我强化：吴三桂 camp=清军阵营 却因旧 role="忠臣文官" 被判忠臣）。
 *  B. 忠诚/职能细分（忠臣文官/忠臣武将/亲随/长辈）才扩展到 身份+背景，且先剥掉世界观套话
 *     （"社会结构为文官集团、武勋集团、宦官集团三方博弈"会把武将污染成文官）。
 *  C. 徽章必须是头衔：按 用户名单 > 职能段 > 身份首段 > 正文扫描 > LLM 直出 取首个合法值，
 *     全部不合法则清空，由前端回退显示定位。
 */

// ============ 头衔合法性 ============
const TITLE_SUFFIX = /(帝|皇|王|侯|公|伯|子|男|主|妃|后|太子|亲王|郡王|国王|女王|君主|国主|监国|殿下|陛下|主公|尚书|大学士|学士|阁老|首辅|辅臣|丞相|宰相|司业|太傅|太保|少保|少师|大夫|卿|御史|知府|知县|主簿|通判|同知|太守|刺史|布政使|按察使|巡抚|总督|都督|将军|将领|总兵|提督|参将|副将|游击|千总|把总|守备|校尉|统领|总管|主事|佥事|参议|道台|兵备|千户|百户|指挥使|指挥同知|指挥佥事|元帅|统帅|司令|军长|师长|团长|营长|连长|排长|队长|首领|头领|盟主|帮主|太监|公公|内官|管事|管家|掌柜|东家|老板|会长|总裁|CEO|总监|经理|主管|教授|博士|导师|师父|师傅|师兄|师姐|师弟|师妹|道长|法师|方丈|主持|住持|大侠|侠客|剑客|杀手|刺客|掌门|宗主|长老|教主|门主|庄主|堂主|舵主|夫人|太太|小姐|公子|少爷|郡主|公主|王妃|世子|骑士|公爵|侯爵|伯爵|子爵|男爵|领主|主教|祭司|牧师|贤者|术士|医师|医生|神探|侦探|警探|主席|书记|市长|州长|议员|长官|衔|大人)$/
const TITLE_KEYWORD = /(帝|皇|王|侯|公|尚书|侍郎|大学士|学士|将军|将领|巡抚|总督|都督|总兵|提督|参将|副将|校尉|统领|总管|主事|佥事|丞相|宰相|首辅|阁老|御史|知府|知县|主簿|同知|通判|太监|太子|亲王|郡王|郡主|公主|王妃|夫人|掌门|宗主|长老|教主|会长|总裁|总监|经理|队长|师父|道长|法师|骑士|公爵|侯爵|伯爵|领主|主教|祭司|医师|大夫|掌柜|东家|老板|博士|教授|指挥使|元帅|统帅|刺史|太守|司业|郎中|员外|卿)/
const TITLE_BAD_PREFIX = /^(无|一|这|那|其|某|甲|乙)$/
// 头衔常见结尾字（补 TITLE_SUFFIX 长词表未覆盖的：权臣/奸佞/联络官/军需官/名将/义士/统领/队长/叔父…）
const TITLE_SUFFIX_ONE = /[臣官士将帅尉督长管家师傅保辅叔母父兄弟侯王帝公主妃后卿郎佞政事婢鬟仆僮]$/
// 「角色定位」枚举词不是头衔，禁止当徽章（否则错误定位会自我强化进徽章，如吴三桂徽章被写成"忠臣文官"）
const ROLE_LABEL_SET = /^(忠臣|忠臣文官|忠臣武将|反派|主角|女主|男配|女配|配角|盟友|亲随|亲信|竞争对手|宿敌|长辈|师父\/导师|师父|导师|中立|背叛者|野心家|幕后黑手|敌对势力|奸臣|权臣|佞臣|内廷总管|情报枢纽)$/

// 正文扫描用的官职词表（长词在前，避免被短词抢先匹配）
const OFFICE_WORDS = '大学士|东阁大学士|文渊阁大学士|武英殿大学士|华盖殿大学士|吏部尚书|兵部尚书|户部尚书|礼部尚书|刑部尚书|工部尚书|尚书|侍郎|郎中|员外郎|员外|巡抚|总督|都督|总兵|提督|参将|副将|游击|将军|将领|校尉|统领|千户|百户|指挥使|指挥同知|指挥佥事|元帅|统帅|刺史|太守|司业|主簿|通判|同知|知府|知县|御史|给事中|翰林|世子|郡主|公主|王妃|夫人|掌门|宗主|长老|会长|总裁|总监|经理|博士|教授|皇帝|帝王|摄政王|亲王|郡王|王爷|国主|监国|太监|公公|司礼监|秉笔|总管|主事|佥事|参议|道台|兵备|守备|千总|把总|首领|头领|盟主|帮主|队长|掌柜|东家|老板|医师|大夫|先生|大人|名将|猛将|战将|宿将|主将|部将|上将|偏将|裨将|权臣|奸臣|奸佞|佞臣|元辅|阁臣|言官|重臣|老臣|旧臣|名臣|遗臣|义士|谋士|死士|勇士|志士|国士|联络官|军需官|医官|文书|锦衣卫|缇骑|厂卫|掌印|都尉|护军|司马|长史|别驾|参军|团练使|经略|招讨|提调|巡检|叔父|舅父|国母|太妃|贵妃|昭仪|丫鬟|婢女|侍女|内侍|书童|小厮|仆从|王|帝|侯|公|卿'
const TITLE_SCAN_RE = new RegExp('([\\u4e00-\\u9fa5]{0,4}?(?:' + OFFICE_WORDS + '))')
const TITLE_CUT_RE = /(?:加|兼|带|署)/  // 多职连词截断（"广西巡抚加兵部尚书衔"→"广西巡抚"）；不切"领/衔"以免误伤"领侍卫内大臣""皇太后"
// 谓语/叙述用字：出现在头衔前缀里说明截到的是句子片段而非官职
// （"清后任大学士"→大学士；"两蹙名王"→剥到"王"后长度不足被拒；"江西大捷将军"→将军）
const PRE_VERB = /[任为既即拜授封建迁擢加署判掌统率死战攻守降叛立称废杀诛灭破陷走逃薨崩卒殁蹙蹶克折斩获擒囚缚贬谪配流戍屯驻镇牧知领守御征讨伐剿抚附身魂寄托假扮号自]/

function stripParens(x: unknown): string {
  return String(x == null ? '' : x).replace(/[（(][^）)]*[）)]/g, '').trim()
}

function preIsOk(pre: string): boolean {
  if (!pre) return true
  // 前缀只要不是"句子片段"即可保留：长度 ≤4、不含谓语动词字（"骑兵将领""亲卫队统领""大西军将领""湖广参政"都合法）
  if (pre.length > 4) return false
  if (PRE_VERB.test(pre)) return false
  return true
}

/** 补充职司/爵位后缀（明清官职名目繁多，主表未穷举） */
const TITLE_SUFFIX_EXTRA = /(典史|参军|编修|检讨|庶吉士|詹事|洗马|侍读|侍讲|中书舍人|给事|祭酒|待诏|待制|直阁|承宣|宣抚|招抚|经略|都护|都虞候|牙将|镇抚|总旗|小旗|招讨使|镇抚使|总宪|中丞|方伯|廉访使|观察使|都转运使|盐运使|提学使|县丞|教谕|训导|长史|司马|别驾|国姓爷|大将军|将军|司空|司徒|令尹|尚书令|太子太傅|太子太保|少傅|少保)$/

/** 头衔是否像"封号/官职"（排除"短命/支撑危局/江阴"这类特征、职能、地名，以及定位枚举词） */
export function isTitleLike(t: unknown): boolean {
  var s = stripParens(t)
  if (!s || s.length < 2 || s.length > 12) return false
  if (TITLE_BAD_PREFIX.test(s)) return false
  if (ROLE_LABEL_SET.test(s)) return false
  if (COLLECTIVE_SUFFIX_RE.test(s)) return false
  if (/[，。、；:：—\s]/.test(s)) return false
  if (TITLE_SUFFIX.test(s)) return true
  if (TITLE_SUFFIX_EXTRA.test(s)) return true
  if (TITLE_SUFFIX_ONE.test(s) && s.length <= 8) return true
  return TITLE_KEYWORD.test(s) && s.length <= 8
}

/**
 * 清洗头衔候选；返回 '' 表示整条候选不合格
 *
 * 🔥 2026-09-05 二次修复（用户截图：艾能奇徽章"大西军将领"不准确）：
 *   "部队/建制/事件前缀 + 泛称"（大西军将领、清军将领、水师将领、江西反正将领）是群体描述而非个人头衔，
 *   必须整条拒绝（不是剥掉前缀留下"将领"），让徽章回退显示角色定位；
 *   "抗清名将""东阁大学士"这类含评价或具体职司的仍保留。
 */
const GENERIC_BARE_OFFICE = /^(将领|头目|首领|战士|兵将|人员|分子|干将|英雄|专家|高手|好手|能人|人物|同志|大人|先生|猛将|名将|战将|宿将|主将|偏将|裨将|部将|家将|牙将|上将)$/
// 匹配结束后紧跟这些字，说明截到的是复合词的一部分而非头衔（"游击战专家""水师队伍""将军府"）
const NEXT_BREAK_RE = /^[战斗队手性化度员府衙门司局院长官兵将]/
// 句子残字前缀（"原明山海关总兵"→"山海关总兵"）
const PRE_CRUFT_RE = /^[原前故旧曾为任系是乃之明清唐宋元汉]+/
// 🔥 群体泛称后缀：以这些词结尾的一律不是个人头衔（"大西军将领""清军将领""忠诚将领""江西反正将领"
//   "水师将领""骑兵将领""首领"），徽章应回退显示角色定位，而不是写一个群体描述
const COLLECTIVE_SUFFIX_RE = /(将领|头目|首领|战士|兵将|人员|分子|干将|专家|高手|好手|能人|人物|同志|大人|先生)$/
const UNIT_PREFIX_RE = /(军|营|部|队|旗|帮|会|门|派|府|卫|司|镇|藩|师|团|旅|连)$/
const EVENT_PREFIX_RE = /(反正|起义|投诚|归附|降清|叛变|内斗|投机)$/
const GENERIC_OFFICE_WORD = /^(将领|头目|首领|战士|兵将|人员|分子|干将)$/

export function cleanOfficeTitle(cand: unknown): string {
  var s = String(cand == null ? '' : cand).trim().replace(/[衔印]$/, '')
  if (!s) return ''
  var cut = s.split(TITLE_CUT_RE)[0]
  if (cut && cut.length >= 2) s = cut
  if (GENERIC_BARE_OFFICE.test(s)) return ''
  var m = s.match(new RegExp('^(.*?)(' + OFFICE_WORDS + ')$'))
  if (!m) return s
  var pre = m[1] || ''
  var word = m[2]
  if (GENERIC_OFFICE_WORD.test(word) && (UNIT_PREFIX_RE.test(pre) || EVENT_PREFIX_RE.test(pre))) return ''
  if (!pre) return s
  var fallback = GENERIC_OFFICE_WORD.test(word) ? '' : word
  if (PRE_VERB.test(pre)) return fallback
  if (!preIsOk(pre)) return fallback
  if (pre.length > 4) return fallback
  return s
}

function titleFromIdentityText(txt: unknown): string {
  var raw = String(txt == null ? '' : txt).replace(/[（(][^）)]*[）)]/g, '')
  // 逐个候选尝试：首个被拒绝（如"大西军将领"）时继续找下一个可用头衔，而不是一律放弃
  var re = new RegExp(TITLE_SCAN_RE.source, 'g')
  var m
  while ((m = re.exec(raw)) !== null) {
    // 命中词后面紧跟"战/队/府/员…"说明截到的是复合词片段（"游击战专家"），跳过
    var nextCh = raw.slice(re.lastIndex, re.lastIndex + 1)
    if (nextCh && NEXT_BREAK_RE.test(nextCh)) { if (m.index === re.lastIndex) re.lastIndex++; continue }
    var cleaned = cleanOfficeTitle(PRE_CRUFT_RE.test(m[1]) ? m[1].replace(PRE_CRUFT_RE, '') : m[1])
    if (cleaned && cleaned.length >= 2 && isTitleLike(cleaned)) return cleaned
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return ''
}

function titleFromDesign(designText: string, nm: string): string {
  var ud = String(designText || '')
  if (!ud || !nm) return ''
  var esc = String(nm).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  var m1 = ud.match(new RegExp('【' + esc + '】[^\\n]*?——\\s*([^（）\\n|，。、；;：:—－\\s]{2,12})'))
  if (m1 && m1[1]) return m1[1].trim()
  var m2 = ud.match(new RegExp(esc + '[^\\n]{0,40}?官职[：:|\\s]*([^，。\\n|；;：:—－\\s]{2,10})'))
  if (m2 && m2[1]) return m2[1].trim()
  return ''
}

// ============ 角色定位词表 ============
const BOILER_RE = /文官集团|武勋集团|宦官集团|勋贵集团|朝臣集团|文官武将|武将文臣|三方博弈|相互牵制|微妙博弈/g
const OWN_CAMP_RE = /主角阵营|我方|己方|本方|核心阵营|麾下|帐下|拥立|辅佐|效忠|忠臣|忠勇|义从|我朝|本国|奉.+为主/
const LOYAL_RE = /忠臣|忠诚|抗清|抗金|抗元|抗敌|义士|殉国|死守|坚守|支柱|柱石|中流砥柱|拥立|辅佐|效忠|名臣|民族英雄|楷模|典范|义从|麾下|帐下|救驾|护主|反正归明|归明|尽忠|老臣|股肱|心腹重臣|忠贞/
const TRAITOR_RE = /降清|降敌|降明|引清|叛明|叛清|叛变|叛将|通敌|内奸|奸细|出卖|带路|告密|仕清|贰臣|降臣|反覆|反复无常|见风使舵|投机|野心家|只忠于自己/
const RIVAL_RE = /(争位|争国|夺嫡|夺位|皇位|正统之争|争夺正统|称帝|监国|另立|对峙|政敌|党争|竞争|争统|(隆武|绍武|弘光|鲁王|唐王|福王|桂王)(帝|王|政权|朝廷)(?!旧臣|遗民))/
// 🔥 #219 修订：去掉 清军|清廷|满清|后金 裸名词——抗清英雄的传记里"清军"永远是敌军主语
//   （阎应元"清军下江南推行剃发，率六万义民守江阴"被误判反派），敌我轴只认
//   camp 字段与 降清/仕清/叛明 类动词（enemySide 判定已有），保留行为/品性词。
const VILLAIN_RE = /反派|敌对|敌营|敌酋|入侵|大敌|死敌|宿敌|BOSS|幕后主脑|屠城|奸臣|奸佞|权奸|佞臣|乱政|陷害忠良|暴虐|嗜杀/
const STAFF_RE = /太监|宦官|内官|内廷|司礼监|奴婢|侍女|丫鬟|宫女|亲随|亲卫|心腹|护卫|侍卫|斥候|长随|内务|军需|粮草|后勤|联络|情报|密探|文书|账房|管家|采办|医官|军医|匠作|督造|押运|传旨|秉笔|随堂|书办|差遣|锦衣卫|缇骑|厂卫|诏狱|细作|眼线|骨干|秘密行动/
const CIVIL_RE = /文官|大学士|学士|尚书|侍郎|巡抚|总督|首辅|阁老|御史|郎中|员外|知府|知县|主簿|翰林|丞相|宰相|司业|督师|参政|参议|布政|按察|道台|兵备|给事中|詹事|洗马|中书|侍读|侍讲|学政|提学|佥都御史|都御史|少卿|寺丞|县丞|教谕|训导|典史|长史|司马|别驾|参军|总管|主事/
const MIL_RE = /武将|将领|将军|总兵|提督|参将|副将|都督|统帅|指挥使|先锋|骑兵|水师|校尉|千户|百户|千总|把总|守备|游击|元帅|帅|名将|猛将|主力|军事|征战|战功|战果|大捷|击败|守城|督战|行伍|军伍|部队|攻城|野战|游击战|城防|救驾|立功|斩将|夺旗|开疆|拓土|统兵|领兵|掌兵|握兵|铁骑/
const ELD_RE = /太后|皇后|皇妃|贵妃|皇太|妃|公主|郡主|王妃|国母|母妃|母亲|祖母|长辈|叔父|伯父|族长|长老会?|祖父|外祖|父王|皇考/
const MENTOR_RE = /师父|师尊|导师|启蒙|座师|老师|师傅|太傅|少傅|先生|讲席|教习|师傅|艺业师父/
const ALLY_RE = /盟友|联合|策应|结盟|响应|归附|反正|支援|声援|配合|友军/
const MONARCH_HEAD_RE = /(帝|皇帝|天子|国王|女王|亲王|郡王|王爷|监国|国主|主公|君主)$/

// 名单解析器产出的原始职能词 → 标准定位枚举
function canonicalizeRoster(raw: string, enemySide: boolean): string {
  var s = String(raw || '').replace(/[—－·、，。;；：:\s]+/g, '').trim()
  if (!s) return ''
  if (/^(反派|奸臣|权奸|降臣|贰臣|野心家|敌酋|敌将|昏君|佞臣|汉奸|乱政|投机)/.test(s)) return '反派'
  if (/文官|学士|翰林|进士|幕僚|谋主|谋士|内阁|东林|巡抚|尚书|大学士|侍郎|御史|知府|知县|布政|参政|中书|司业|主簿|言官|给事中|詹事|学政|道台|兵备/.test(s)) return enemySide ? '反派' : '忠臣文官'
  if (/武将|将领|将军|总兵|提督|参将|副将|都督|统帅|元帅|督师|骑兵|水师|名将|猛将|主力|先锋|校尉|千户|百户|千总|把总|守备|游击|帅|铁骑|城防|军镇/.test(s)) return enemySide ? '反派' : '忠臣武将'
  if (/太监|宦官|内官|内廷|宫女|侍女|丫鬟|亲随|心腹|护卫|侍卫|亲卫|斥候|情报|密探|总管|内务|军需|联络|账房|管家|医官|文书|采办/.test(s)) return enemySide ? '反派' : '亲随'
  if (/宿敌|对手|竞争|争位|夺嫡|宗室|皇族|帝王|皇帝|王爷|亲王|郡王|政权|监国|称制/.test(s)) return '竞争对手'
  if (/师父|师尊|导师|太傅|师傅|座师|先生|讲席/.test(s)) return '师父/导师'
  if (/太后|皇后|王妃|国母|长辈|宗长辈/.test(s)) return '长辈'
  // "盟友/忠臣/配角/朋友/重要角色"等笼统词不覆盖，交给角色自身文本推断
  return ''
}

/**
 * 规范化单个角色的 title（徽章）与 rolePosition/role（定位）。
 * 直接原地修改传入对象，返回修改后的角色对象便于链式使用。
 */
export function normalizeCharacter(char: any, opts: { isProtagonist?: boolean; isFemaleLead?: boolean; designText?: string } = {}): any {
  if (!char || typeof char !== 'object' || !char.name) return char
  var designText = String(opts.designText || '')
  var isProtag = !!opts.isProtagonist
  var isFL = !!opts.isFemaleLead

  var rawRole = String(char.role || char.rolePosition || '').trim()
  var campStr = String(char.camp || '')
  var identity = String(char.identity || '')
  var background = String(char.background || '')
  var idHead = String(identity || background).split(/[；;，,。\n]/)[0].replace(/[（(][^）)]*[）)]/g, '').trim()

  // —— 铁律 A：敏感判定只用 阵营 + 身份首段，不含旧 role、不含整段背景 ——
  var selfCore = campStr + ' ' + idHead
  // —— 铁律 B：忠诚/职能细分用 阵营+身份+背景，并剥掉世界观套话与旧 role ——
  var officeText = String(campStr + ' ' + idHead + ' ' + identity + ' ' + background).replace(BOILER_RE, '')

  // 1) 徽章：用户名单 > 职能段 > 身份首段 > 正文扫描 > LLM 直出
  var llmTitle = String(char.title || '').trim()
  var derived = ''
  var roleTail = rawRole.indexOf('·') !== -1 ? String(rawRole.split('·').pop() || '').trim() : ''
  roleTail = cleanOfficeTitle(roleTail)
  if (roleTail && isTitleLike(roleTail)) derived = roleTail
  if (!derived) derived = cleanOfficeTitle(titleFromDesign(designText, String(char.name).trim()))
  if (!derived || !isTitleLike(derived)) {
    var headTitle = cleanOfficeTitle((String(idHead || '').split('·').pop() || '').trim())
    if (headTitle && headTitle.length >= 2 && headTitle.length <= 8 && isTitleLike(headTitle)) derived = headTitle
  }
  // 🔥 2026-09-05：LLM 直出的头衔若"有出处"（其限定部分确实出现在阵营/身份/背景里），
  //   优先于正文扫描——否则主角朱由榔的"永历帝"会被正文里"附身桂王世子"扫出的"世子"顶掉；
  //   而毫无出处的幻觉头衔（何腾蛟"江湖术士"）仍会被正文扫描出的真实官职（总督）替换
  var llmGrounded = false
  if (llmTitle && isTitleLike(llmTitle)) {
    var llmCore = llmTitle.replace(new RegExp('(?:' + OFFICE_WORDS + ')$'), '')
    llmGrounded = llmCore.length < 2 || String(campStr + ' ' + identity + ' ' + background).indexOf(llmCore) !== -1
    if (llmGrounded) derived = llmTitle
  }
  if (!derived || !isTitleLike(derived)) derived = titleFromIdentityText(identity + ' ' + background)
  var finalTitle = ''
  if (derived && isTitleLike(derived)) finalTitle = derived
  else if (llmTitle && llmTitle.length <= 12 && isTitleLike(llmTitle)) finalTitle = llmTitle
  char.title = finalTitle

  // 2) 定位：变节 → 忠诚/己方臣属 → 皇位竞争者 → 敌营反派 → 部属亲随 → 盟友 → 师长/长辈 → 配角
  var ownCamp = OWN_CAMP_RE.test(selfCore)
  var loyal = LOYAL_RE.test(officeText)
  var traitor = TRAITOR_RE.test(selfCore + ' ' + identity)
  // 🔥 铁证恶行（屠城/刽子手/被主角斩杀）优先于"后反正归明"这类中途转向词，
  //   否则李成栋（嘉定屠城者）会因"反正归明"被判成忠臣
  var hardVillain = /屠城|屠杀|刽子手|灭城|洗城|被主角斩|为主角所诛|诛杀|助纣为虐|祸国殃民|民怨沸腾|遗臭万年/.test(selfCore + ' ' + identity + ' ' + background)
  // 敌我轴只认"阵营字段 + 明确变节词"，不能认正文里出现的"大西军/流寇"等部队字号，
  // 否则李定国（大西军出身、永历盟友）会被误判成敌营
  var enemySide = /清|敌对|反派|敌营|后金|摄政|满州|满洲|三藩|明末降|伪清/.test(campStr) || /降清|引清|叛明|通敌|仕清|贰臣|敌对|反派/.test(selfCore)
  // 阵营字段已写明"朋友/盟友/主角阵营"时，即便他是另一个政权的宗室（隆武帝），也应归为盟友而非对手
  var friendlyCamp = /朋友|盟友|己方|我方|主角阵营|核心阵营|我方阵营/.test(campStr)

  var loyalCat = function (): string {
    if (STAFF_RE.test(officeText)) return '亲随'
    if (ELD_RE.test(officeText) && !/臣|将|帅/.test(officeText)) return '长辈'
    if (CIVIL_RE.test(officeText)) return '忠臣文官'
    if (MIL_RE.test(officeText)) return '忠臣武将'
    return '忠臣'
  }

  var cat = '配角'
  // 🔥 #219 roleConfirmed 权威定位直通：用户确认/修复脚本核实过的定位不再被启发式改写。
  //   旧启发式实证误判：阎应元（identity 首段以"清军"开头→反派）、郑成功（"海权之父"含父→长辈）、
  //   朱聿键（"明太祖九世孙"含祖→长辈），且 L245 rawRole 回退会让错误定位自我强化。
  //   用户在卡片下拉改定位时由前端把 roleConfirmed 置 true 并写入新值，即恢复权威语义。
  var _roleConfirmed = !!(char as any).roleConfirmed && !!rawRole && /^(忠臣|忠臣文官|忠臣武将|反派|主角|女主|女配|男配|配角|盟友|亲随|亲信|竞争对手|宿敌|长辈|中立|女主\d{1,2})$/.test(rawRole)
  if (isProtag) cat = '主角'
  else if (isFL && !_roleConfirmed) cat = '女主'
  else if (_roleConfirmed) cat = rawRole
  else if (hardVillain || traitor) cat = '反派'
  // 🔥 敌对阵营门禁：camp 明确是"清军阵营/敌对/反派"时，正文里的"麾下/统领/辅佐"是他对自己
  //   部属的统属关系而非效忠主角，不得把吴三桂这类人洗成忠臣
  else if ((loyal || ownCamp) && !enemySide) cat = loyalCat()
  else if (!friendlyCamp && RIVAL_RE.test(selfCore)) cat = '竞争对手'
  else if (VILLAIN_RE.test(selfCore) || ((loyal || ownCamp) && enemySide)) cat = '反派'
  // 另一政权的宗室/帝王：阵营写朋友→盟友；有争位内斗→竞争对手；否则按敌营反派
  else if (MONARCH_HEAD_RE.test(idHead)) cat = friendlyCamp ? '盟友' : (/争位|夺嫡|内斗|对峙|争夺正统|另立|自立/.test(officeText) ? '竞争对手' : '反派')
  else if (STAFF_RE.test(officeText) && !enemySide) cat = '亲随'
  else if ((CIVIL_RE.test(officeText) || MIL_RE.test(officeText)) && !enemySide) cat = loyalCat()
  else if (ALLY_RE.test(officeText)) cat = '盟友'
  else if (MENTOR_RE.test(officeText)) cat = '师父/导师'
  else if (ELD_RE.test(officeText)) cat = '长辈'
  else if (rawRole && ['忠臣', '忠臣文官', '忠臣武将', '亲随', '盟友', '反派', '竞争对手', '长辈', '师父/导师', '配角', '主角', '女主'].indexOf(rawRole) !== -1) cat = rawRole

  // 3) 用户自设名单的权威职能优先（先规范成标准枚举，再按敌我轴换算）
  var rosterCanon = canonicalizeRoster(String(char._rosterRole || ''), enemySide)
  if (rosterCanon && !isProtag && !isFL) cat = rosterCanon
  delete char._rosterRole
  char.role = cat
  char.rolePosition = cat
  return char
}

/** 规范化整个 characters 结果对象（原地修改并返回） */
export function normalizeCharactersTitlesAndRoles(characters: any, designText?: string): any {
  if (!characters || typeof characters !== 'object') return characters
  var ud = String(designText || '')
  try {
    normalizeCharacter(characters.protagonist, { isProtagonist: true, designText: ud })
    normalizeCharacter(characters.femaleLead, { isFemaleLead: true, designText: ud })
    ;(characters.femaleLeads || []).forEach(function (c: any) { normalizeCharacter(c, { isFemaleLead: true, designText: ud }) })
    ;(characters.antagonists || []).forEach(function (c: any) { normalizeCharacter(c, { designText: ud }) })
    ;(characters.supporting || []).forEach(function (c: any) { normalizeCharacter(c, { designText: ud }) })
    normalizeCharacter(characters.antagonist, { designText: ud })
  } catch (_e) { console.error('[character-normalize] 角色规范化失败（不影响主流程）:', _e) }
  return characters
}

/**
 * 按姓名去重：分批/增量生成时 existingCharacters 与新批次合并会把同一角色重复塞进数组
 * （实测《永历中兴》antagonists 里 丁魁楚…郑成功 整段出现两次，56 条记录只有 41 人）。
 * 保留首次出现（含更完整信息的那条），返回被移除的条数。
 */
export function dedupeCharactersByName(characters: any): number {
  if (!characters || typeof characters !== 'object') return 0
  var seen: Record<string, boolean> = {}
  // 🔥 #218e：femaleLeads 名单豁免集——额外女主采用「femaleLeads + supporting 双挂载」渲染模型
  //   （UI 32 卡网格只渲染 supporting，femaleLeads[1+] 不双挂载就对用户不可见）。
  //   旧实现 uniq() 全局共享 seen：femaleLeads 先 uniq 时把额外女主名种进 seen，随后
  //   uniq(supporting) 会把双挂载卡当「跨数组重复」剔掉（实测戴贵人 supporting[0] 被剥）。
  var exempt: Record<string, boolean> = {}
  var removed = 0
  var uniq = function (arr: any[]): any[] {
    if (!Array.isArray(arr)) return arr
    var out: any[] = []
    arr.forEach(function (c: any) {
      if (!c || !c.name) { if (c) out.push(c); return }
      var key = String(c.name).trim()
      if (seen[key] && !exempt[key]) { removed++; return }
      seen[key] = true
      out.push(c)
    })
    return out
  }
  try {
    // 🔥 #218d 修复：seen 初始只含主角；femaleLeads 先做自身内部去重（旧版先把 femaleLeads
    //   名字种进 seen 再对自身 uniq → femaleLeads 必被整体清空，实测复现）；女主主卡名在其后
    //   种入（此时 femaleLeads 已完成去重，不会挤掉 femaleLeads[0]）。
    if (characters.protagonist && characters.protagonist.name) seen[String(characters.protagonist.name).trim()] = true
    characters.femaleLeads = uniq(characters.femaleLeads)
    // femaleLeads 完成去重后登记豁免：其名单内的名字允许在 supporting 中双挂载存在
    ;(characters.femaleLeads || []).forEach(function (c: any) {
      var n = String((c && c.name) || '').trim()
      if (n) exempt[n] = true
    })
    if (characters.femaleLead && characters.femaleLead.name) seen[String(characters.femaleLead.name).trim()] = true
    characters.antagonists = uniq(characters.antagonists)
    characters.supporting = uniq(characters.supporting)
    if (characters.femaleLead && characters.femaleLead.name) {
      var flKey = String(characters.femaleLead.name).trim()
      var dupInLeads = (characters.femaleLeads || []).some(function (c: any) { return c && String(c.name).trim() === flKey })
      if (dupInLeads) characters.femaleLead = characters.femaleLeads[0] || characters.femaleLead
    }
    if (characters.antagonist && characters.antagonist.name) {
      var akKey = String(characters.antagonist.name).trim()
      var dupInAnts = (characters.antagonists || []).some(function (c: any) { return c && String(c.name).trim() === akKey })
      if (dupInAnts) characters.antagonist = characters.antagonists[0] || characters.antagonist
    }
  } catch (_e) { console.error('[character-normalize] 反派去重失败（不影响主流程）:', _e) }
  return removed
}
