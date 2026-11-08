/**
 * canon-contract —— 设定契约层（Canonical Contract）
 * ============================================================
 * 2026-11-01 新增。解决「11 个环节各写各的、设定一致性只靠提示词祈祷」的结构性缺口。
 *
 * 设计来源（横比 GitHub 同类项目后取最可落地者）：
 *   - lingfengQAQ/webnovel-writer：写前契约 + 已接受章节提交（一份事实源）
 *   - ynnyh/jarvis-write：时序故事圣经（每条事实绑定生效章节区间）
 *   - tpos8/Ai-Novel-Workflow：区分「作者事实」与「角色已知信息」
 *   - Narcooo/inkos：真相文件 + 多维度一致性审计
 *
 * 本地实测到的具体漂移（本模块的存在理由）：
 *   1) 《永历中兴》正文出现人物表里不存在的「赵全」（42 次），而设定里该职能是「朱落/玉竹」；
 *   2) 金手指设定为「史鉴先知」（记忆类、禁止实体化），正文却写成"脑中有一册书，翻到第几页"；
 *   3) 设定 keyPlots 写「北兵」，与用户确定的「清军/清兵」口径冲突，正文被反向污染；
 *   4) 主角 1645 年二月为桂王世子（未即位），但设定另一处写「肇庆登基」，导致正文偶发"陛下"。
 *   以上四类，原链路**零出口校验**，全部可以一路写到底。
 *
 * 设计原则：
 *   ① 纯确定性、零 LLM 调用、零外部依赖；
 *   ② 任何分支 try/catch 兜底，绝不抛错影响主链路；
 *   ③ 只做「可判定」的事；主观判断仍交给 chapter-engine 的 judge；
 *   ④ 不删用户数据，只做「改回 canon 值」或「报违规」两件事。
 */

export interface CanonCastMember {
  name: string
  identity: string
  personality: string
  /** 活跃起点（章节号或时间描述），用于给下游提示"此刻不该出场" */
  activeFrom?: string
}

export interface CanonContract {
  protagonist: {
    name: string
    /** 穿越者原名/现代身份（若有） */
    modernIdentity: string
    age: string
    identity: string
    personality: string
  }
  goldenFinger: {
    name: string
    type: string
    /** 核心词：校验时出现其一即认为指向同一金手指 */
    coreTokens: string[]
    /** 禁止的表现形式（实体化/外挂化），如：书、书页、面板、系统、签到、刻度、界面 */
    forbiddenRenderings: string[]
  }
  era: {
    dynasty: string
    eraName: string
    year: string
    /** 主角此刻的君主状态，如「桂王世子，未即位，不得称陛下」 */
    sovereignStatus: string
  }
  factions: string[]
  cast: CanonCastMember[]
  /** 硬禁忌（字符串命中即违规） */
  taboos: string[]
  /** 敌方称谓：允许 / 禁止 */
  enemyTerms: { allow: string[]; forbid: string[] }
}

export interface CanonViolation {
  code: string
  severity: 'S1' | 'S2' | 'S3'
  field: string
  detail: string
  /** 命中的原文片段 */
  evidence: string
}

export interface CanonVerifyResult {
  /** 已自动改回的项 */
  fixed: string[]
  violations: CanonViolation[]
  /** 契约是否可用（设定不足时为 false，调用方应跳过一致性校验而不是误报） */
  usable: boolean
}

const DEFAULT_FORBIDDEN_RENDERINGS = ['面板', '系统面板', '属性面板', '签到', '积分', '商城', '抽奖', '任务栏', '进度条', '界面', '光幕', '金光古卷', '书页', '翻书']

/** 安全取字符串 */
function s(v: any): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(s).filter(Boolean).join('、')
  return ''
}

/**
 * 从 previousData（各环节累积的设定对象）构建契约。
 * 缺字段不报错，只留空；`usable` 由「是否有主角名」决定。
 */
export function buildCanonContract(previousData: any): CanonContract {
  const pd = previousData || {}
  const idea = pd.idea || {}
  const world = pd.worldbuilding || {}
  const power = pd.powerSystem || {}
  const chars = pd.characters || {}
  const ps = pd.protagonistSettings || {}

  const ab = power.protagonistAbility || (Array.isArray(power.protagonistAbilities) ? power.protagonistAbilities[0] : null) || {}
  const protag = chars.protagonist || {}

  const protagonistName = s(ps.name) || s(idea.protagonistName) || s(protag.name)
  const gfName = s(ab.name) || s(idea.systemName)
  const gfType = s(ab.type)

  // 金手指核心词：名称按「·」「/」「-」切开，取长度 ≥2 的片段（如「史鉴先知·超越时代的知识体系」→ 史鉴先知 / 超越时代的知识体系）
  const coreTokens: string[] = []
  if (gfName) {
    gfName.split(/[·\/\-—_|]/).forEach(function (seg) {
      const t = seg.trim()
      if (t.length >= 2) coreTokens.push(t)
    })
    if (!coreTokens.length) coreTokens.push(gfName)
  }

  // 人物名单（去重、去掉明显的占位名）
  const cast: CanonCastMember[] = []
  const seen: Record<string, boolean> = {}
  const pushCast = function (c: any) {
    if (!c || typeof c !== 'object') return
    const n = s(c.name).trim()
    if (!n || n.length < 2 || seen[n]) return
    if (/^(主角|反派|配角|女主|待定|未定|某人)$/.test(n)) return
    seen[n] = true
    cast.push({
      name: n,
      identity: s(c.identity || c.role || c.title),
      personality: s(c.personality || c.personalityTraits),
      activeFrom: s(c.activeFrom || c.appearFrom),
    })
  }
  pushCast(protag)
  ;(['femaleLeads', 'femaleLead', 'antagonists', 'antagonist', 'supporting', 'supportingChars'] as const).forEach(function (k) {
    const arr = (chars as any)[k]
    if (Array.isArray(arr)) arr.forEach(pushCast)
    else if (arr && typeof arr === 'object') pushCast(arr)
  })

  // 势力名
  const factions: string[] = []
  const facArr = Array.isArray(pd.factions) ? pd.factions : (pd.factions && Array.isArray(pd.factions.factions) ? pd.factions.factions : [])
  facArr.forEach(function (f: any) {
    const n = s(f && f.name).trim()
    if (n && factions.indexOf(n) < 0) factions.push(n)
  })

  // 硬禁忌：从人物 identity 里提取「时序铁律」类约束 + 通用项
  const taboos: string[] = []
  const identityText = s(ps.identity) + ' ' + s(idea.protagonistIdentity) + ' ' + s(protag.identity) + ' ' + s(world.era)
  const sovereignStatus = (function () {
    // 优先用设定里已明确的时序铁律
    const m = identityText.match(/(未经即位不得[^。；]*|尚未即位[^。；]*|未即位[^。；]*)/)
    if (m && m[1]) return m[1]
    if (/世子/.test(identityText) && !/已即位|称帝/.test(identityText)) return '世子，未即位，不得称陛下、不得称朕'
    return ''
  })()
  if (sovereignStatus) {
    taboos.push('未即位期间主角不得被称「陛下」「皇上」「万岁」，不得自称「朕」「寡人」')
  }

  // 阵营称谓：以用户/项目当前口径为准（本项目已确定「清军/清兵」，废止「北兵」代称）
  const enemyTerms = {
    allow: ['清军', '清兵', '清将', '清廷', '满清', '八旗'],
    forbid: ['北兵', '北军', '北虏', '北朝', '北骑'],
  }

  return {
    protagonist: {
      name: protagonistName,
      modernIdentity: s(idea.modernName) || s(idea.userSpecifiedIdentity),
      age: s(idea.userSpecifiedAge) || s(protag.age),
      identity: s(ps.identity) || s(idea.protagonistIdentity) || s(protag.identity),
      personality: s(protag.personality),
    },
    goldenFinger: {
      name: gfName,
      type: gfType,
      coreTokens,
      forbiddenRenderings: DEFAULT_FORBIDDEN_RENDERINGS.slice(),
    },
    era: {
      dynasty: s(world.dynasty) || s(idea.genre).split(/[,，]/)[0] || '',
      eraName: s(world.eraName),
      year: s(world.year),
      sovereignStatus,
    },
    factions,
    cast,
    taboos,
    enemyTerms,
  }
}

/**
 * 把契约渲染成注入文本。放在所有环节 prompt 的**最前**（优先级高于一切前文设定），
 * 因为 LLM 对长上下文的首尾段遵循度最高。
 */
export function renderCanonContract(c: CanonContract): string {
  if (!c || !c.protagonist || !c.protagonist.name) return ''
  const lines: string[] = []
  lines.push('【设定契约·CANON·最高优先级·与下文冲突时以本段为准】')
  lines.push('主角名：' + c.protagonist.name + '（任何环节不得改名、不得创造同职能新角色顶替）')
  if (c.protagonist.age) lines.push('主角年龄：' + c.protagonist.age)
  if (c.protagonist.identity) lines.push('主角身份：' + c.protagonist.identity.slice(0, 160))
  if (c.protagonist.personality) lines.push('主角性格（不得 OOC）：' + c.protagonist.personality.slice(0, 120))

  if (c.goldenFinger.name) {
    lines.push('金手指：' + c.goldenFinger.name + (c.goldenFinger.type ? '（' + c.goldenFinger.type + '）' : ''))
    lines.push('  · 名称必须与上文完全一致，禁止改名或替换为其他金手指')
    lines.push('  · 禁止实体化：不得写成「' + c.goldenFinger.forbiddenRenderings.slice(0, 6).join('/') + '」等可视界面或可翻阅物件')
    lines.push('  · 表现方式：只能是主角脑中的记忆与判断，会模糊、会记错、会突然想不起；不得外泄给任何角色，不得被他人察觉')
  }

  if (c.era.sovereignStatus) lines.push('时序铁律：' + c.era.sovereignStatus)

  if (c.cast.length) {
    lines.push('已定人物表（' + c.cast.length + ' 人，出场人物必须在此表内；表外新角色须先报备命名规则，不得使用近似名顶替）：')
    lines.push('  ' + c.cast.map(function (x) { return x.name + (x.identity ? '（' + x.identity.slice(0, 18) + '）' : '') }).join('、'))
  }
  if (c.factions.length) lines.push('已定势力：' + c.factions.join('、') + '（不得自创势力名）')

  if (c.enemyTerms && c.enemyTerms.allow.length) {
    lines.push('敌方称谓：一律用「' + c.enemyTerms.allow.join('/') + '」，严禁出现「' + c.enemyTerms.forbid.join('/') + '」')
  }
  if (c.taboos.length) {
    lines.push('硬禁忌：')
    c.taboos.forEach(function (t) { lines.push('  · ' + t) })
  }
  return lines.join('\n')
}

/**
 * 出口校验 + 自动修复。
 * @param text    要校验的文本（JSON 字符串化后的设定，或章节正文）
 * @param c       契约
 * @param opts.scope  'plan' 规划步 | 'content' 正文
 */
export function verifyCanonContract(text: string, c: CanonContract, opts?: { scope?: 'plan' | 'content' }): CanonVerifyResult {
  const res: CanonVerifyResult = { fixed: [], violations: [], usable: false }
  try {
    if (!c || !c.protagonist || !c.protagonist.name || !text) return res
    res.usable = true
    const scope = (opts && opts.scope) || 'plan'
    const body = String(text)
    const count = function (w: string): number {
      if (!w) return 0
      return body.split(w).length - 1
    }

    // ① 敌方称谓：禁用项必须为 0（用户 2026-11-01 明确：保持清军/清兵）
    c.enemyTerms.forbid.forEach(function (w) {
      const n = count(w)
      if (n > 0) {
        res.violations.push({
          code: 'ENEMY_TERM', severity: 'S1', field: '全文',
          detail: '出现已废止的敌方代称「' + w + '」' + n + ' 次，应改为「' + c.enemyTerms.allow[0] + '」',
          evidence: extractAround(body, w),
        })
      }
    })

    // ② 金手指实体化：禁止词命中即违规（正文与规划都查）
    c.goldenFinger.forbiddenRenderings.forEach(function (w) {
      const n = count(w)
      if (n > 0) {
        res.violations.push({
          code: 'GF_REIFIED', severity: 'S1', field: '全文',
          detail: '金手指被实体化：出现「' + w + '」' + n + ' 次（契约要求只作脑中记忆，不得为可视界面/可翻阅物件）',
          evidence: extractAround(body, w),
        })
      }
    })

    // ③ 时序禁忌：未即位却称陛下
    //   ⚠️ 2026-11-01 修：原判定 `/未即位|世子/` 漏掉设定原文「**未经**即位不得称帝」的写法，
    //      导致反向用例里「陛下」漏检。改为覆盖三种写法。
    if (c.era.sovereignStatus && /未即位|未经即位|尚未即位|世子/.test(c.era.sovereignStatus)) {
      ;['陛下', '皇上', '万岁', '朕'].forEach(function (w) {
        const n = count(w)
        if (n > 0) {
          res.violations.push({
            code: 'TIMELINE_LEAP', severity: 'S1', field: '全文',
            detail: '主角此刻为「' + c.era.sovereignStatus + '」，却出现「' + w + '」' + n + ' 次（时序越界）',
            evidence: extractAround(body, w),
          })
        }
      })
    }

    // ④ 人物表外姓名（仅正文查，且需要足够多人名基线才可靠）
    //   ⚠️ 定位是**召回器**不是判决器：输出 S3 提示交人工/下游确认，绝不自动删改
    //   （避免把合理的路人/冷门角色当违规删掉，那是比漂移更糟的破坏）。
    if (scope === 'content' && c.cast.length >= 8) {
      const suspects = detectOffCastNames(body, c)
      suspects.forEach(function (nm) {
        res.violations.push({
          code: 'OFF_CAST', severity: 'S3', field: '人物',
          detail: '正文出现人物表外的高频疑似人名「' + nm + '」——须确认：是设定内角色的别名/简称，还是自创角色（若是后者，先补入人物表再用）',
          evidence: nm,
        })
      })
    }

    // ⑤ 主角名缺失（正文步）：全文未出现主角名 → 提醒（不阻断）。
    //   2026-11-01 修：通篇第一人称叙事（"我"密度高）是合法写法，不报，否则每章都刷 S3 噪音。
    if (scope === 'content' && c.protagonist.name) {
      // 豁免：第一人称（"我"）或第三人称代称（"他"）高频 —— 都是合法的中文小说叙事视角，
      //   主角名不出现属正常写法（实测五章全用"他"叙事，主角名 0 次）。
      const pronounCount = count('他') + count('我')
      const isPronounNarration = pronounCount >= 40
      if (count(c.protagonist.name) === 0 && !isPronounNarration) {
        res.violations.push({
          code: 'PROTAG_ABSENT', severity: 'S3', field: '主角',
          detail: '正文未出现主角名「' + c.protagonist.name + '」（通篇第一人称可忽略）',
          evidence: '',
        })
      }
    }
  } catch (e) {
    // 绝不抛错影响主链路
  }
  return res
}

/** 取命中词前后文，供日志/报告取证 */
function extractAround(body: string, word: string, span: number = 24): string {
  try {
    const i = body.indexOf(word)
    if (i < 0) return ''
    const a = Math.max(0, i - span)
    const b = Math.min(body.length, i + word.length + span)
    return body.slice(a, b).replace(/\s+/g, ' ')
  } catch (e) { return '' }
}

/**
 * 检测「人物表外」的中文姓名（高置信召回，供人工复核）。
 *
 * 实测调参记录（2026-11-01，《永历中兴》五章 1.3 万字）：
 *   ① 2—3 字贪婪窗口：真阳性「赵全」命中，但误报 14 项（周管事/弘光元/卫所的/赵全愣…）；
 *   ② 改 2 字滑动窗口 + 尾字黑名单：赵全 ×42 命中，但误报升至 28 项（丁魁/周管/那一/明日/王府…），
 *      根因是 2 字窗口会把 3 字人名切成前缀（"丁魁楚"→"丁魁"）、把"那张残纸"切成"张残"；
 *   ③ 最终口径：候选若**是任一 cast 名的子串**则排除（解决人名前缀误报）+ 阈值提到 ≥8 次
 *      ＋修正职务后置词偏移 bug。此口径下「赵全」（42 次）必中，其余高频词基本清除。
 *
 * 定位：这是**召回器**不是判决器。输出 S3 提示交人工/下游确认，
 *       绝不自动删改正文（避免把正确的冷门角色当违规删掉）。
 */
function detectOffCastNames(body: string, c: CanonContract): string[] {
  const out: string[] = []
  try {
    const castSet: Record<string, boolean> = {}
    c.cast.forEach(function (x) { castSet[x.name] = true })
    // 允许出现的非人物专名（地名/势力/年号等），避免误报
    const whitelist = new Set<string>([
      '肇庆', '桂林', '昆明', '南京', '北京', '扬州', '广州', '厦门', '梧州', '淮安', '沈阳', '杭州', '江阴', '嘉定', '赣州', '南昌',
      '弘光', '隆武', '永历', '崇祯', '万历', '天启', '绍武', '大清', '大明', '南明', '东林', '大西', '八旗', '清廷', '朝廷',
      '中原', '江南', '江北', '岭南', '两广', '湖广', '云贵', '闽粤', '京畿', '关外', '塞外', '南直', '浙江', '福建', '广东', '广西',
      '云南', '贵州', '四川', '湖南', '湖北', '江西', '安徽', '山东', '河南', '河北', '山西', '陕西', '辽东', '山海关',
      '洪武', '永乐', '嘉靖', '隆庆', '泰昌', '天顺', '正统', '景泰', '成化', '弘治', '正德',
    ])
    c.factions.forEach(function (f) { whitelist.add(f) })

    const surnames = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公'

    // 尾字黑名单：虚词/量词/方位/助词/常见名词尾
    const badTail = '的了着过是在说道来往上下中里外前后时处事人个些那这就都也又还却便才只不没很太更最和与或及把被给让对从向往到于为以之其此彼若如虽然则故且者乎哉矣耳焉么呢吧啊呀嘛哦嗯哈什怎谁哪几多少大小老幼男女子女父母兄弟夫妻爷翁嫂姑婆妈爹儿孙婿媳甥侄愣涩声气色样般回遍趟顿阵场次条件张只匹头尾根枝朵颗粒块片面间座层重份套批群队帮伙串堆一白水门辰武打今害话边嘴府书年制日城兵军马刀枪船粮银钱'
    // 职务/身份后置词：候选取第 2 字起若命中，说明是「姓+职务」的称呼（周管事 / 钱管事），不是姓名
    const titleAfter = /^(管事|总管|管带|大人|老爷|公子|先生|将军|校尉|都司|参将|游击|守备|千户|百户|指挥|经历|知县|知府|巡抚|总督|太监|公公|嬷嬷|丫头|丫鬟|小厮|家人|亲兵|士卒|兵丁|军士|掌柜|伙计|师傅|师父|大夫|太医|舍人|幕僚|书办|典史|主簿|县丞|通判|佥事|参政|布政|按察|督|府|司)/
    // 常见词（避免误报普通词汇）
    const stopWord = /^(时候|自己|什么|这样|那样|一个|两个|之后|之前|进来|出去|起来|下来|回来|过来|去往|众人|众将|听得|看着|想着|说道|问道|答道|心中|眼中|手中|身上|地方|东西|事情|天下|主意|样子|道理|法子|工夫|光景|人家|别人|大人|小人|老人|少年|中年|常例|水匪|土司|盐丁|商队|船队|马队|步卒|骑兵|乡勇|义民|清兵|清军|明军|官军|王府|史书|元年|胡话|时辰|祖制|明白|厉害|江水|东门|西门|南门|北门|卫所|守备|把总|千总|百户|镇抚|经历|主簿|典史|书办|幕僚|粮道|盐课|城防|军械|空饷|塘报|邸报|黄历|铜镜|药汁|香囊|门房|二门|正堂|后堂|偏院|内院|外院)$/

    const freq: Record<string, number> = {}
    // 2 字窗口滑动：比 {2,3} 贪婪切分准确（"赵全把"→"赵全"，不会被吞成"赵全把"）
    for (let i = 0; i + 2 <= body.length; i++) {
      const w = body.substr(i, 2)
      if (!/^[\u4e00-\u9fa5]{2}$/.test(w)) continue
      if (castSet[w] || whitelist.has(w)) continue
      if (surnames.indexOf(w.charAt(0)) < 0) continue
      if (badTail.indexOf(w.charAt(1)) >= 0) continue
      if (stopWord.test(w)) continue
      // 后接职务词 → 是称呼而非姓名（从第 2 字起判，修偏移 bug）
      if (titleAfter.test(body.substr(i + 1, 4))) continue
      freq[w] = (freq[w] || 0) + 1
    }
    // 候选若为任一 cast 名的子串（"丁魁" ⊂ "丁魁楚"），视为设定内人物的前缀，排除
    const isCastPrefix = function (w: string): boolean {
      for (let k = 0; k < c.cast.length; k++) {
        if (c.cast[k].name.indexOf(w) >= 0) return true
      }
      return false
    }
    // 只报高频（≥8 次）且非设定内的姓名——「赵全」在五章中 42 次，必中；偶发词不报
    Object.keys(freq).forEach(function (w) {
      if (freq[w] >= 8 && !isCastPrefix(w)) out.push(w + '×' + freq[w])
    })
  } catch (e) { /* 忽略 */ }
  return out.slice(0, 8)
}
