import { NextResponse } from 'next/server'
import { callLLMWithFallback, type LLMConfig, type LLMMessage } from '@/lib/ai/llm'
import { PRESET_STYLES } from '@/lib/ai'
import { resolveLLMConfig } from '@/lib/resolve-llm-config'
import { verifyToken } from '@/lib/auth'
import { guardAiEndpoint, chargeAiUsage } from '@/lib/quota'

// ============================================================
// SKILL技能系统 - 技能提示词构建
// ============================================================

function buildSkillPrompt(enabledSkills: string[], customSkills?: Array<{ id: string; name: string; customPrompt: string }>): string {
  const presetPrompts: Record<string, string> = {
    'golden-five-chapters': `
【番茄黄金五章定律】：
- 第1章：建立主角人设和世界观，制造第一个小冲突（500字内入戏）
- 第2章：展示金手指/核心能力，制造期待感+第一次小打脸
- 第3章：第一个小爽点（打脸成功/震惊全场/获得优势）
- 第4章：升级/突破，展示成长+引入新盟友
- 第5章：第一个大转折（重大冲突/真相揭露/命运改变），引出长线悬念
`,
    'golden-three-sentences': `
【黄金三句开篇法·完读率提升40%】
- 第1句：制造悬念（反常、震撼、离奇事件，必须有冲击力）
- 第2句：抛出核心冲突（危机、困境、压迫感立即出现）
- 第3句：亮明主角身份+金手指暗示
- 前三句合计不超过100字，禁止写景、铺垫背景、啰嗦叙述
`,
    'hook-chapter-ending': `
【章末钩子生成器·强制读者点下一章】
每章最后300字必须设置以下4类钩子之一：
1. 反转钩子：真相揭晓/身份暴露/关系反转
2. 危机钩子：强敌来袭/阴谋败露/生死关头
3. 期待钩子：新机缘/神秘人物/进阶预兆
4. 悬念钩子：未知声音/诡异现象/未解之谜
- 绝对禁止以"平静的夜晚""众人散去""一夜无话"等平淡句式结尾
`,
    'shuang-point-designer': `
【爽点密度控制器·白金爆款零尿点标准】
- 每300字一个小刺激：嘲讽/轻视/挑衅/小危机出现，绝不能连续500字无冲突
- 每1500字一个中爽点：打脸成功/获得宝物/突破境界/权威认可/美女倾心
- 每章必须有3-5个爽点，分布均匀，不能集中在结尾
- 爽点类型严格轮换：打脸爽→升级爽→装逼爽→收小弟爽→美女倾心爽→机缘爽→复仇爽
`,
    'face-slap-closure': `
【打脸闭环大师·300字完整闭环法】
打脸六步闭环法：①铺垫（反派挑衅放狠话立赌约）→②围观（群众嘲笑亲友紧张）→③蓄力（主角淡定装逼说金句）→④爆发（一招制敌一句话噎死）→⑤震惊（围观者倒吸凉气疯狂脑补）→⑥收尾（反派跪地主角转身前辈结交美女投怀）
- 全流程不超过300字，一气呵成
`,
    'pretending-b-master': `
【装逼范塑造师·主角装逼五大境界】
1. 沉默装逼：不说废话直接干，干完就走
2. 金句装逼：每句不超10字——"你也配？""就这？""我一剑足矣。"
3. 反差装逼：众人以为是青铜结果是王者
4. 借势装逼："我身后的人，你惹不起"+背景板大佬配合
5. 无形装逼：随手小事让全场震惊
- 核心铁律：绝对禁止主角自己解释自己多牛逼，必须通过配角的震惊脑补来体现
`,
    'revenge-arc-designer': `
【复仇爽感规划师·君子报仇不隔夜】
- 有仇当场报，绝不憋超过3章
- 复仇必须是十倍奉还：对方断你一臂→你灭他满门
- 复仇过程必须有围观群众，亲见证
- 复仇后主角不能有圣母心：斩草要除根
`,
    'cheat-power-amplifier': `
【金手指放大器·六大设计铁律】
1. 必须有限制：冷却时间/能量消耗/副作用，不能无敌
2. 必须有进化路径：初级→中级→高级→终极，每30章解锁新功能
3. 必须有隐藏功能：关键时刻保命越级杀敌
4. 必须和主角升级绑定：金手指升级→主角境界突破
5. 来历要有伏笔：开篇埋线索后期揭身世
6. 使用要有代价：消耗寿命/反噬心魔
`,
    'system-panel-designer': `
【系统面板设计大师·系统流五大爆款模块】
1. 任务系统：主线+支线+隐藏任务
2. 属性面板：力量/速度/体质/精神/功法/技能/装备，每项有数字
3. 商城系统：积分兑换，有超贵长期目标物品
4. 签到打卡：每日/7天/30天/100天奖励递增
5. 成就系统：隐藏成就触发时给读者惊喜
- 系统提示每条不超过20字
`,
    'foreshadowing-master': `
【伏笔埋放宗师·三线并行制】
1. 长线伏笔（100章+回收）：身世/金手指来历/终极反派，开篇5章埋线索
2. 中线伏笔（30-50章回收）：配角真实目的/宝物作用/势力布局，每卷开头埋2-3个
3. 短线伏笔（3-10章回收）：消息/人物/约定，每3章埋1个
- 回收时必须有"卧槽原来是这样"的冲击力
`,
    'chekhov-gun-law': `
【契诃夫之枪执行器·设定一致性铁律】
1. 第一幕出现的枪第三幕必须开火：50字以上描写过的物件人物后期必须有用
2. 禁止一次性工具人：出场超3次的配角要有独立故事线和人物弧光
3. 禁止废设定：设定过的境界/势力/功法后期必须用到
4. 没用上的东西安排合理理由消失（被毁/送人/死亡）
`,
    'conflict-escalation': `
【冲突阶梯放大器·螺旋升级法则】
- 冲突逐级升级不跳级：路人找茬→家族内斗→宗门竞争→国家战争→大陆争霸→世界级危机
- 对手实力刚好比主角高半档：苦战能赢
- 每次升级有明确触发事件
- 反派链：上一级反派的后台下一级出现
- 身份同步跃升：废柴→家族天才→宗门核心→国家重臣→大陆名人→世界主宰
`,
    'villain-shaping-expert': `
【反派塑造专家·坏也要坏得有逼格】
反派五大原则：1.动机合理（复仇/守护/野心/理念）；2.智商在线不话痨，该下死手下死手；3.实力匹配，前期虐主角后期被反杀也壮烈；4.有粉丝魅力（帅/有故事/够狠）；5.分层体系：小反派（脑残嚣张送经验）→中反派（有脑有谋送机缘）→大反派（人格魅力送成长）→终极反派（理念冲突全书升华）
`,
    'heroine-group-builder': `
【女主天团构建师·差异化人设法则】
1. 绝对差异化：冷艳御姐/活泼萝莉/飒爽女侠/腹黑师妹/温柔师姐/霸道公主/神秘少女/商业女王
2. 独立故事线：每个女主有自己的背景和目标，不是花瓶
3. 出场节奏：前期1-2个→中期2-3个→后期1-2个
4. 感情线推进：初识→误会→交集→心动→确认→生死相依
`,
    'supporting-cast-designer': `
【群像角色塑造师·配角也要鲜活】
配角功能标签化：搞笑担当（气氛调节被主角坑）、老狐狸前辈（护犊子开后门）、忠犬小弟（忠心跟随）、傲娇对手（亦敌亦友）、毒舌智囊（运筹帷幄）、背景板大佬（关键时刻救场）
- 每个配角有1-2个标志性特征+1次独立高光时刻+不能随便死
`,
    'tomato-rhythm-master': `
【番茄节奏宗师·平台专属铁律】
1. 段落短：每段不超3行，战斗对话1段1句话
2. 对话快：每段对话不超2句就切视角加动作
3. 冲击强：打脸反转突破单独成段，前后空行
4. 废字删："了""的""地"能删就删，直接上动词名词
5. 章节切割：2000字左右一章，精准卡钩子处结束
`,
    'pacing-balancer': `
【张弛平衡调节器·有快有慢才是王道】
- 大战高潮后必须日常休整，但不超2章
- 日常章节要有信息增量：埋伏笔/谈感情/练技能
- 连续300字无剧情无爽点无信息→直接删
- 多线穿插：主角线/女主线/反派线/配角线交替
- 每10章小高潮+1休整；每50章大高潮+2休整
`,
    'volume-structure-builder': `
【分卷结构设计师·每卷六大要素】
每卷（约50章）必须有：1.独立主题（家族篇→宗门篇→秘境篇→国家篇→大陆篇）；2.卷末最终BOSS，苦战才能赢；3.主角至少突破1大境界+得重要能力装备；4.引出下一卷引子；5.第25章中高潮+第50章大高潮；6.重要配角在本卷内有明显变化
`,
    'action-scene-writer': `
【战斗场景描写大师·七步结构法】
1. 起手式：放狠话亮功法+气场对撞+天地异象
2. 试探交锋：过3-5招+群众点评
3. 真招对决：招式对轰+画面爆炸+山崩地裂
4. 反派压境：主角吃亏+反派放大招得意
5. 主角蓄力：金手指觉醒/怒气爆发/血脉激活+气场逆转
6. 绝杀绝招：霸气招式名+华丽描写特效拉满
7. 收尾震惊：反派落败+全场倒吸凉气+主角装逼收尾
`,
    'atmosphere-builder': `
【氛围感营造大师·五大感官全调动】
1.视觉：颜色（血红=危险/漆黑=恐怖）+光影（残阳=悲壮/烛火=神秘）+异象
2.听觉：环境音（轰隆/嘶嘶）+寂静（静得听见心跳）
3.嗅觉：血腥味/腐臭/花香/酒香
4.触觉：温度（冰冷刺骨/燥热难当）+触感（湿滑/粘稠）
情绪匹配：战斗前→压抑冷色调；打脸时→爽快暖色调；感情戏→温暖柔和；阴谋时→阴冷诡异
`,
    'emotion-curve': `
【情绪曲线控制】：
- 每300字一个小情绪波动（紧张→释放→期待→紧张）
- 每章开头情绪低落（困境），中间逐步上升，结尾达到高潮或留下悬念
- 连续2章不能是相同情绪，必须有起伏
- 每3章安排一个大爽点（打脸/逆袭/突破）
- 使用情绪曲线公式：期待→满足→失落→愤怒→爽感循环
`,
    'shuangwen-continuation': `
【爽文写作技巧】：
- 打脸要快：从被看不起到震惊，不超过500字
- 反转要狠：反转必须有冲击力，让读者"卧槽"
- 情绪要足：对话要有感染力，内心独白要有代入感
- 节奏要明快：少废话，多动作，快速推进剧情
- 升级要频：每章至少一个小提升
语言风格：简洁有力，句子短促，动词精准，动作描写画面感爆棚
`,
    'dialogue-optimizer': `
【对话优化要求】：
- 对话要口语化，像真人说话，不要书面语
- 每个角色的说话风格要不同（语气词、用词习惯、口头禅）
- 对话中要有潜台词，不要直白表达
- 适当加入动作描写和表情描写（冷笑/挑眉/咬牙）代替"说"
- 对话要推进剧情，不能只是信息交换
- 番茄风格：口语化、带情绪、有冲突
`,
    'de-ai-polish': `
【去AI化写作要求 - 默认始终生效】：
- 绝对不要用"然而""不过""与此同时""不禁""缓缓""微微""赫然""陡然""猛地""心中一凛"等AI高频词
- 绝对不要用排比句、对仗句等AI常用修辞
- 多用短句，少用长句，句子长短参差不齐
- 适当加入口语化表达、方言词汇、网络用语
- 段落长短不一，避免整齐划一
- 用词要接地气，像真人网文作者手打出来的
- 避免过度修饰，少用形容词堆砌
- 动作描写简洁有力，心理描写真实自然
- 你是一个有十年网文经验的老作者，不是AI助手
`,
    'content-risk-detector': `
【内容安全要求】：
- 不涉及政治敏感内容（领导人、重大事件、敏感地名）
- 不涉及暴力血腥描写（详细虐杀过程、酷刑细节模糊处理）
- 不涉及色情低俗内容（性器官描写、性行为过程、擦边球全删）
- 不涉及宗教迷信、违禁药品、赌博详细过程
- 不涉及敏感历史事件、煽动性言论
- 遵守中国网络文学平台审核规则
`,
    'platform-adaptation-expert': `
【多平台适配规则】：
🍅 番茄小说：短段落（3行内）、快节奏（每300字小刺激）、2000字/章、结尾强钩子
📖 起点中文：允许长段落、重设定逻辑、3000字/章、开篇铺垫可5章
⚡ 飞卢小说：脑洞大、同人综漫、节奏爆炸快、800字/章、每章结尾必须爽
🌸 晋江文学：感情线第一、人设细腻、慢热可、描写唯美、标签精准
🐱 七猫免费：免费阅读模式、完读率至上、剧情不拖沓、广告位前章节留钩子
各平台通用红线：政治敏感/色情低俗/血腥暴力/宗教迷信，一律严查
`,
    'bestseller-outline': `
【爆款大纲规划师·2026爆款公式全应用】
2026年网文白金爆款大纲标准：
1. 分卷结构：每卷50章左右，每卷有明确起点和终点
2. 章节节点：每章一个独立事件推动剧情，无纯过渡章
3. 情绪曲线：整卷大循环"期待→满足→失落→愤怒→爽感"+每章小循环嵌套
4. 爽点分布：每5章小爽点→每20章大爽点→每50章（卷末）终极高潮
5. 伏笔埋放：全书级伏笔第1卷埋→卷级每卷开头埋2-3个→章级每3章埋1个
6. 节奏控制：每章结尾有钩子，卷末结尾有大钩子
`,
    'title-intro-generator': `
【标题与简介生成规则】：
标题（15-30字）：1.包含身份标签+核心能力+核心冲突；2.制造悬念用转折词；3.用具体数字（九世/三千年/百倍返还）；4.加情绪词（震惊/绝望/无敌）
简介（150-300字三段式）：1.身份困境（"林凡，林家废物，大婚当日被退婚"）；2.获得金手指（"绝望之际，百倍返还系统激活！"）；3.最终目标+悬念（"多年后，林凡站在世界之巅：'还有谁？'"）
`,
    'power-fantasy-character': `
【穿越爽文角色创建·续写时人设不崩】：
- 主角身份反差：废柴→天才/现代→古代，说话做事要符合穿越者身份（偶尔内心吐槽现代梗，对外说话符合时代）
- 金手指限制：不能无敌，使用时要有代价/冷却/副作用，每次用要有具体消耗
- 升级线可见：每次续写明示主角当前境界/实力/地位，和目标差距
- 性格贯彻：杀伐果断就别圣母，幽默风趣就别阴沉，选一个标签贯穿
- 女主/配角人设一致：性格、说话风格、能力边界不能变，不能突然降智
`,
    'power-fantasy-outline': `
【穿越爽文大纲·续写结构逻辑】：
- 阶段推进：续写内容必须属于某个明确阶段（初期小冲突/中期势力崛起/后期世界级），不能乱跳地图
- 爽点递进：续写爽点强度必须≥上次，上次打脸了路人，这次就要打脸小反派头目
- 伏笔延续：上文埋的伏笔，续写时要么推进，要么回收，不能放着不管
- 冲突不降级：对手级别必须匹配甚至高于当前主角，不能越写越弱
`,
    'time-slip-world': `
【穿越世界观·续写真实感】：
- 历史/设定考据：官职、称呼、衣食住行、货币单位，必须符合前文世界观设定，不能穿帮
- 现代知识运用：如果主角用现代知识解决古代问题，过程要合理，不能一句话就搞定
- 势力格局：各方势力态度转变要有过程，不能从轻视直接变臣服
- 文化细节：续写时加入1-2个时代/世界观细节（食物、服饰、习俗），增加真实感
`,
    'faction-balance-architect': `
【势力格局·续写时不崩】：
- 阵营平衡：正派/中立/邪恶实力相当，不能某一方突然全员降智
- 层级分明：村级→镇级→城级→国家级→大陆级，越级挑战必须有代价和金手指支持，不能随便越
- 利益驱动：所有势力行动都要有明确利益诉求，不能为了针对主角而针对主角
- 态度演变：每个势力对主角的态度是轻视→关注→拉拢→忌惮→敌对/臣服，不能跳步
`,
    'power-fantasy-scene': `
【穿越爽文场景·叙事风格统一】：
- 现代思维vs古代规则碰撞：续写时保留主角的内心现代吐槽（用括号或心理活动），对外语言符合身份
- 快速切入：续写开头50字必须出事，不能铺垫太久
- 动作简洁：3个动词以内表现动作，画面感强，不用长句子描写
- 双重冲突：外部压力+内部挣扎（原主记忆/身份认同/道德底线），增加戏味
- 细节真实感：吃饭/穿衣/礼仪/货币，符合前文世界观设定
`,
  }

  let prompt = ''
  for (const skillId of enabledSkills) {
    if (presetPrompts[skillId]) {
      prompt += presetPrompts[skillId] + '\n'
    }
  }

  if (customSkills && customSkills.length > 0) {
    for (const cs of customSkills) {
      if (cs.customPrompt) {
        prompt += `\n【自定义技能：${cs.name}】：\n${cs.customPrompt}\n`
      }
    }
  }

  return prompt ? `\n\n${prompt}` : ''
}

const DEFAULT_DE_AI_PROMPT = `
【去AI化写作要求 - 默认始终生效】：
- 绝对不要用"然而""不过""与此同时""不禁""缓缓""微微"等AI高频词
- 绝对不要用排比句、对仗句等AI常用修辞手法
- 多用短句，少用长句，句子长短参差不齐
- 适当加入口语化表达、方言词汇
- 段落长短不一，避免整齐划一
- 用词要接地气，像真人网文作者手打出来的
- 避免过度修饰，少用形容词堆砌
- 动作描写简洁有力，心理描写真实自然
- 你是一个有十年网文经验的老作者，不是AI助手`

// ============================================================
// 类型定义
// ============================================================

interface ContinueRequest {
  context: string
  style?: string
  length?: 'short' | 'medium' | 'long'
  llmConfig?: LLMConfig
  enabledSkills?: string[]
  customSkills?: Array<{ id: string; name: string; customPrompt: string }>
}

interface ContextAnalysis {
  scene: string          // 当前场景
  emotion: string        // 当前情绪
  pov: string            // 叙事视角
  pacing: string         // 当前节奏
  characters: string[]   // 涉及角色
  lastPlot: string       // 最近剧情走向
  era: string            // 时代背景
  genre: string          // 题材类型
  dialogueStyle: string  // 对话风格特征
  endingTone: string     // 上文结尾语气
}

// ============================================================
// 上下文分析引擎 - 从文本中提取关键写作参数
// ============================================================

function analyzeContext(context: string): ContextAnalysis {
  const text = context.trim()

  // 取最后800字作为重点分析窗口（最近的上下文最重要）
  const tailWindow = text.length > 800 ? text.slice(-800) : text
  // 取前500字判断时代背景和题材
  const headWindow = text.length > 500 ? text.slice(0, 500) : text

  // --- 场景识别 ---
  const sceneKeywords: Record<string, string[]> = {
    '战斗': ['剑', '刀', '拳', '掌', '杀', '血', '战', '攻', '防', '闪', '挡', '劈', '刺', '轰', '爆', '灵气', '法术', '剑气', '斗', '打', '击', '破', '碎', '伤', '倒', '飞', '退'],
    '修炼': ['丹田', '灵力', '修炼', '突破', '境界', '功法', '经脉', '真气', '运转', '闭关', '悟', '气', '神识', '元婴', '金丹', '筑基', '练气'],
    '对话': ['"', '"', '：', '？', '！', '说道', '问道', '笑道', '怒道', '喊道', '低声道', '冷声道', '叹道', '沉声道'],
    '日常': ['吃', '喝', '走', '看', '坐', '站', '街', '店', '茶', '饭', '房', '门', '窗', '院', '路', '天', '日', '夜', '早', '晚'],
    '情感': ['心', '情', '爱', '恨', '泪', '笑', '愁', '思', '念', '痛', '喜', '悲', '怒', '惧', '惊', '羞', '暖', '冷'],
    '探险': ['洞', '山', '林', '谷', '河', '湖', '海', '墓', '塔', '殿', '密室', '机关', '阵法', '宝藏', '遗迹', '地图'],
  }

  let detectedScene = '日常'
  let maxSceneScore = 0
  for (const [scene, keywords] of Object.entries(sceneKeywords)) {
    const score = keywords.reduce((acc, kw) => acc + (tailWindow.includes(kw) ? 1 : 0), 0)
    if (score > maxSceneScore) {
      maxSceneScore = score
      detectedScene = scene
    }
  }

  // --- 情绪识别 ---
  const emotionKeywords: Record<string, string[]> = {
    '紧张': ['紧', '急', '快', '险', '危', '慌', '惊', '恐', '怕', '冷汗', '心跳', '屏住呼吸', '倒吸', '瞳孔', '骤然'],
    '愤怒': ['怒', '恨', '杀', '该死', '混账', '畜生', '可恶', '愤', '咬牙', '瞪', '哼', '放肆', '大胆'],
    '悲伤': ['悲', '痛', '泪', '哭', '伤', '苦', '凄', '哀', '叹', '心酸', '心碎', '红了眼眶', '哽咽'],
    '轻松': ['笑', '乐', '哈', '嘿', '有趣', '好玩', '逗', '轻松', '惬意', '舒服', '不错', '挺好'],
    '震撼': ['震撼', '恐怖', '天哪', '不可能', '难以置信', '天', '竟然', '居然', '不可思议', '惊骇', '骇然'],
    '期待': ['期待', '好奇', '想', '盼', '等', '终于', '快了', '就差', '马上', '即将'],
  }

  let detectedEmotion = '平静'
  let maxEmotionScore = 0
  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    const score = keywords.reduce((acc, kw) => acc + (tailWindow.includes(kw) ? 1 : 0), 0)
    if (score > maxEmotionScore) {
      maxEmotionScore = score
      detectedEmotion = emotion
    }
  }

  // --- 视角识别 ---
  const firstPersonMarkers = ['我', '我的', '我们', '咱们', '俺', '老子', '本少', '本姑娘']
  const isThirdPerson = !firstPersonMarkers.some(m => tailWindow.includes(m))
  const detectedPov = isThirdPerson ? '第三人称' : '第一人称'

  // --- 节奏识别 ---
  const sentences = tailWindow.split(/[。！？；\n]+/).filter(s => s.trim().length > 0)
  const avgSentenceLen = sentences.length > 0
    ? sentences.reduce((acc, s) => acc + s.length, 0) / sentences.length
    : 20
  const shortSentenceRatio = sentences.filter(s => s.length < 10).length / Math.max(sentences.length, 1)
  const exclamationCount = (tailWindow.match(/[！]/g) || []).length
  const dialogueCount = (tailWindow.match(/["""]/g) || []).length

  let detectedPacing = '中等节奏'
  if (avgSentenceLen < 15 && shortSentenceRatio > 0.3 && exclamationCount > 3) {
    detectedPacing = '快节奏动作'
  } else if (avgSentenceLen > 30 && shortSentenceRatio < 0.1 && exclamationCount < 2) {
    detectedPacing = '慢节奏描写'
  } else if (dialogueCount > 8) {
    detectedPacing = '对话密集'
  }

  // --- 角色提取 ---
  const characterPatterns = [
    /[\u4e00-\u9fa5]{2,4}(?:说道|问道|笑道|怒道|喊道|低声道|冷声道|叹道|沉声道|想了想|皱了皱眉|点了点头|摇了摇头|叹了口气|冷笑一声|嘴角一勾|目光一闪|眼神一凝)/g,
    /[\u4e00-\u9fa5]{2,4}(?:的|了|在|把|被|给|向|对|跟|和|与)/g,
  ]
  const characterSet = new Set<string>()
  for (const pattern of characterPatterns) {
    const matches = tailWindow.match(pattern)
    if (matches) {
      for (const m of matches) {
        // 提取2-4字的人名部分
        const nameMatch = m.match(/^([\u4e00-\u9fa5]{2,4})/)
        if (nameMatch) {
          const name = nameMatch[1]
          // 过滤掉常见非人名词汇
          const excludeWords = ['这个', '那个', '什么', '怎么', '为什么', '已经', '可以', '应该', '虽然', '但是', '因为', '所以', '如果', '就是', '不是', '没有', '一个', '自己', '他们', '她们', '它们', '这里', '那里', '这些', '那些', '这样', '那样', '这么', '那么', '只见', '只听', '忽然', '突然', '竟然', '居然', '果然', '显然', '似乎', '好像', '仿佛', '一直', '已经', '正在', '刚刚', '这才', '这才']
          if (!excludeWords.includes(name) && name.length >= 2) {
            characterSet.add(name)
          }
        }
      }
    }
  }
  const detectedCharacters = Array.from(characterSet).slice(0, 5)

  // --- 最近剧情走向 ---
  const lastSentences = sentences.slice(-3).join('。')
  const detectedLastPlot = lastSentences.length > 100 ? lastSentences.slice(-100) : lastSentences

  // --- 时代背景识别 ---
  const eraKeywords: Record<string, string[]> = {
    '古代玄幻': ['修仙', '灵气', '丹田', '功法', '剑修', '法器', '灵石', '宗门', '长老', '弟子', '仙人', '妖兽', '境界', '筑基', '金丹', '元婴', '化神', '渡劫', '飞升', '仙界', '凡人', '修士'],
    '古代武侠': ['江湖', '武功', '内力', '门派', '掌门', '大侠', '剑客', '侠客', '镖局', '武林', '秘籍', '轻功', '暗器'],
    '古代宫廷': ['陛下', '娘娘', '贵妃', '太子', '王爷', '丞相', '将军', '朝廷', '宫', '殿', '圣旨', '太监', '妃嫔'],
    '现代都市': ['手机', '电脑', '地铁', '公司', '老板', '经理', '大学', '医院', '机场', '咖啡', '微信', '网络', '公寓'],
    '末世': ['丧尸', '变异', '末日', '废墟', '生存', '物资', '基地', '避难所', '感染', '病毒'],
    '星际': ['飞船', '星球', '星际', '宇宙', '舰队', '光年', '虫洞', '外星', '机甲', '星系'],
  }

  let detectedEra = '未识别'
  let maxEraScore = 0
  for (const [era, keywords] of Object.entries(eraKeywords)) {
    const score = keywords.reduce((acc, kw) => acc + (headWindow.includes(kw) ? 1 : 0), 0)
    if (score > maxEraScore) {
      maxEraScore = score
      detectedEra = era
    }
  }

  // --- 题材类型 ---
  let detectedGenre = '综合'
  if (detectedEra.includes('古代玄幻') || detectedEra.includes('古代武侠')) {
    detectedGenre = detectedScene === '战斗' ? '玄幻战斗' : detectedScene === '修炼' ? '玄幻修炼' : '玄幻日常'
  } else if (detectedEra === '现代都市') {
    detectedGenre = '都市'
  } else if (detectedEra === '末世') {
    detectedGenre = '末世'
  } else if (detectedEra === '星际') {
    detectedGenre = '科幻'
  }

  // --- 对话风格 ---
  const colloquialMarkers = ['嘛', '呗', '呢', '吧', '啊', '哎', '啧', '嗯', '嘿', '哟', '哈', '呀', '噢', '哎哟', '啧啧', '哼', '切']
  const colloquialCount = colloquialMarkers.reduce((acc, m) => acc + (tailWindow.match(new RegExp(m, 'g')) || []).length, 0)
  const detectedDialogueStyle = colloquialCount > 5 ? '口语化' : colloquialCount > 2 ? '半口语' : '书面化'

  // --- 结尾语气 ---
  const lastChar = tailWindow.trim().slice(-1)
  let detectedEndingTone = '陈述'
  if (lastChar === '！') detectedEndingTone = '惊叹/激烈'
  else if (lastChar === '？') detectedEndingTone = '疑问/悬念'
  else if (lastChar === '……' || tailWindow.trim().endsWith('...')) detectedEndingTone = '省略/余韵'
  else if (tailWindow.includes('突然') || tailWindow.includes('忽然') || tailWindow.includes('骤然')) detectedEndingTone = '转折/突变'

  return {
    scene: detectedScene,
    emotion: detectedEmotion,
    pov: detectedPov,
    pacing: detectedPacing,
    characters: detectedCharacters,
    lastPlot: detectedLastPlot,
    era: detectedEra,
    genre: detectedGenre,
    dialogueStyle: detectedDialogueStyle,
    endingTone: detectedEndingTone,
  }
}

// ============================================================
// 风格参数映射 - 将分析结果映射为写作指令
// ============================================================

function buildStyleGuidance(analysis: ContextAnalysis, style?: string): string {
  const parts: string[] = []

  // 基础风格
  if (style && style !== 'default') {
    const preset = PRESET_STYLES.find(s => s.id === style || s.name === style)
    if (preset) {
      parts.push(`写作风格：${preset.name}。${preset.description}`)
    }
  }

  // 场景指导
  const sceneGuidance: Record<string, string> = {
    '战斗': '当前是战斗场景，要有画面感和紧迫感。动作描写要快准狠，多用短句和动词，穿插角色反应和旁观的震惊。战斗要有来有回，不能一边倒太无聊。',
    '修炼': '当前是修炼场景，要有突破感和震撼感。描写体内灵力运转的细节，加入突破时的异象描写（天地异变、旁人震惊）。突破过程要有波折，不能太顺利。',
    '对话': '当前是对话场景，对话要有个性化。不同角色用不同语气词和说话方式，加入动作描写和表情变化作为对话标签。对话要推动剧情，不能废话。',
    '日常': '当前是日常场景，要有生活气息。加入环境细节和感官描写，角色互动要自然有趣。日常中可以埋伏笔或通过对话传递信息。',
    '情感': '当前是情感场景，情感表达要细腻。多用内心独白和感官细节，情绪要有层次变化。避免直接说"他很伤心"，要通过动作和反应来表现。',
    '探险': '当前是探险场景，要有未知感和紧张感。环境描写要有氛围感，加入感官细节（潮湿、阴暗、气味）。发现线索或遭遇危险时节奏要加快。',
  }
  if (sceneGuidance[analysis.scene]) {
    parts.push(sceneGuidance[analysis.scene])
  }

  // 情绪指导
  const emotionGuidance: Record<string, string> = {
    '紧张': '保持紧张氛围，句子要短促有力。加入心跳加速、呼吸急促等生理反应。环境描写要配合紧张情绪。',
    '愤怒': '愤怒要通过动作和语言爆发，不要只写"他很愤怒"。加入咬牙、握拳、声音发抖等细节。可以穿插内心独白。',
    '悲伤': '悲伤要克制表达，不要过度煽情。通过一个小细节（一滴泪、一个动作、一句话）来传递悲伤更有力量。',
    '轻松': '轻松氛围可以适当幽默，加入角色间的调侃和互动。但不要过度搞笑，保持故事基调。',
    '震撼': '震撼感要通过旁观者的反应来放大。加入倒吸凉气、瞳孔骤缩、不敢相信等描写。可以用短句或单句成段制造冲击。',
    '期待': '期待感要通过铺垫来建立。描写角色的心理活动和准备工作，让读者也跟着期待。',
  }
  if (emotionGuidance[analysis.emotion]) {
    parts.push(emotionGuidance[analysis.emotion])
  }

  // 节奏指导
  if (analysis.pacing === '快节奏动作') {
    parts.push('当前节奏很快，续写要保持快节奏。多用短句，少用长句描写。动作要连贯紧凑。')
  } else if (analysis.pacing === '慢节奏描写') {
    parts.push('当前节奏较慢，续写可以适当加快节奏或保持细腻描写。注意不要一直慢节奏，要有起伏。')
  } else if (analysis.pacing === '对话密集') {
    parts.push('当前对话密集，续写可以继续对话或转入动作/心理描写来调节节奏。')
  }

  // 视角指导
  if (analysis.pov === '第一人称') {
    parts.push('保持第一人称叙事，多用"我"的内心独白和主观感受。可以加入自我吐槽和内心碎碎念。')
  }

  // 对话风格指导
  if (analysis.dialogueStyle === '口语化') {
    parts.push('上文对话风格口语化，续写要保持这个风格。多用语气词（嘛、呗、呢、吧、啊、啧、哎）。')
  }

  // 结尾衔接
  const endingGuidance: Record<string, string> = {
    '惊叹/激烈': '上文以惊叹号结尾，续写要承接这个激烈情绪，可以描写后续反应或转折。',
    '疑问/悬念': '上文以疑问结尾，续写要回应这个悬念，给出答案或进一步加深悬念。',
    '省略/余韵': '上文以省略结尾，续写可以从余韵中转入新情节，或继续延展情绪。',
    '转折/突变': '上文有转折突变，续写要展开转折后的情节发展。',
  }
  if (endingGuidance[analysis.endingTone]) {
    parts.push(endingGuidance[analysis.endingTone])
  }

  return parts.join('\n')
}

// ============================================================
// 活人感写作系统提示词 - 核心去AI痕迹规则
// ============================================================

function buildHumanizedSystemPrompt(analysis: ContextAnalysis, styleGuidance: string, targetLength: number): string {
  return `你是一个顶级网文写手，擅长写出让读者沉浸其中的小说内容。你的文字有强烈的"活人感"——就像一个真正的人类作家写的，完全看不出AI痕迹。

【核心写作铁律 - 必须严格遵守】

一、句式规则：
- 长短句交替使用。连续3个以上相同长度的句子是绝对禁止的。
- 偶尔用极短句（2-6字）甚至单字成段来制造节奏感。
- 不要每句话都是"主语+谓语+宾语"的完整结构，适当省略主语。
- 偶尔用倒装句、反问句、感叹句打破句式单调。

二、绝对禁止的AI高频词（出现任何一个都是严重事故）：
- 禁止：值得注意的是、总而言之、不言而喻、毋庸置疑、显而易见、不可否认
- 禁止：然而、此外、不仅如此、与此同时、换言之、具体来说、综上所述
- 禁止：事实上、实际上、本质上、从根本上说、归根结底
- 禁止：不禁、忍不住（可以用一次，但不能反复用）
- 禁止：仿佛、似乎（可以用一次，但不能反复用）
- 禁止：宛如、犹如、好似（可以用一次，但不能反复用）

三、对话规则：
- 对话要有口语化特征，使用语气词：嗯、啊、嘛、呗、呢、吧、啧、哎、哟、哈、嘿、切、哼
- 不同角色说话方式要有区别（语气、用词、句式）
- 对话标签不要只用"XX说"，加入动作、表情、语气描写
- 对话中可以有打断、吞吞吐吐、突然提高音量等真实说话特征

四、感官和细节规则：
- 不只写视觉，要加入听觉（声音、响动）、触觉（温度、质感）、嗅觉（气味）、味觉
- 加入环境互动：风吹、雨落、远处声音、光线变化、温度变化
- 加入身体反应：心跳、呼吸、出汗、手抖、瞳孔变化、肌肉紧绷

五、情绪规则：
- 情绪要有波动，不能一直平铺直叙
- 通过具体动作和反应来表达情绪，不要直接说"他很XX"
- 加入内心独白和自我吐槽，增加角色真实感
- 情绪转折要自然，不要突然切换

六、网文节奏规则：
- 每${Math.round(targetLength / 3)}-${Math.round(targetLength / 2)}字要有一个小爽点或小悬念
- 续写结尾要留钩子（悬念、反转、新信息、危机），让读者想继续看
- 不要在续写中解决所有问题，要留有余地

七、排比和修辞规则：
- 禁止三个以上相同结构的排比句
- 修辞手法要自然，不要刻意堆砌
- 比喻要新颖，不要用烂大街的比喻（如"像断了线的风筝"）

八、段落规则：
- 禁止每段都以连接词开头
- 段落长短要有变化，不要每段都差不多长
- 偶尔用一句话独立成段制造强调效果

【当前写作分析】
- 场景类型：${analysis.scene}
- 当前情绪：${analysis.emotion}
- 叙事视角：${analysis.pov}
- 当前节奏：${analysis.pacing}
- 时代背景：${analysis.era}
- 题材类型：${analysis.genre}
- 涉及角色：${analysis.characters.length > 0 ? analysis.characters.join('、') : '未检测到具体角色名'}
- 对话风格：${analysis.dialogueStyle}
- 上文结尾语气：${analysis.endingTone}
- 最近剧情：${analysis.lastPlot}

【风格指导】
${styleGuidance}

【输出要求】
- 字数要求：${targetLength}字左右（误差不超过20%）
- 直接输出续写内容，不要有任何前言、后语、解释、标注
- 不要输出标题、章节号、分隔线
- 不要用"续写如下："之类的引导语
- 不要加引号包裹整个输出`
}

// ============================================================
// 三种差异化续写策略 - 每个选项风格不同
// ============================================================

interface OptionStrategy {
  label: string
  temperature: number
  extraGuidance: string
}

function getOptionStrategies(analysis: ContextAnalysis): OptionStrategy[] {
  // 根据场景类型生成三种不同的续写方向
  const sceneBasedStrategies: Record<string, OptionStrategy[]> = {
    '战斗': [
      {
        label: '激烈对抗',
        temperature: 0.95,
        extraGuidance: '侧重战斗的激烈程度，动作描写要凌厉，加入出人意料的招式或反击。节奏极快，短句为主。旁观者的震惊反应穿插其中。',
      },
      {
        label: '策略博弈',
        temperature: 0.85,
        extraGuidance: '侧重战斗中的智斗和策略，角色在战斗中分析对手弱点、使用计谋。节奏中等，穿插内心分析。要有以弱胜强或出奇制胜的爽点。',
      },
      {
        label: '绝境翻盘',
        temperature: 0.9,
        extraGuidance: '先让主角陷入劣势或危机，然后通过某种方式（悟出招式、想起秘法、外界帮助、对手轻敌）实现翻盘。情绪从绝望到振奋，爽感拉满。',
      },
    ],
    '修炼': [
      {
        label: '顺利突破',
        temperature: 0.85,
        extraGuidance: '侧重突破过程的描写，体内灵力运转的细节，突破时的异象。突破后实力提升的爽感。旁人震惊的反应。',
      },
      {
        label: '波折突破',
        temperature: 0.9,
        extraGuidance: '突破过程中遇到瓶颈或意外，主角通过某种方式（顿悟、外力帮助、回忆起关键信息）克服困难。先抑后扬的爽感更强。',
      },
      {
        label: '意外收获',
        temperature: 0.95,
        extraGuidance: '修炼过程中获得意外收获（发现隐藏功法、觉醒特殊能力、获得前辈传承）。收获的震撼感和对未来的期待。',
      },
    ],
    '对话': [
      {
        label: '冲突升级',
        temperature: 0.9,
        extraGuidance: '对话中矛盾升级，从言语交锋到情绪爆发。加入角色的小动作和表情变化。对话要有火药味，最后以某种方式引爆冲突。',
      },
      {
        label: '信息揭示',
        temperature: 0.8,
        extraGuidance: '通过对话揭示重要信息（身世秘密、隐藏势力、即将到来的危机、某个角色的真实身份）。信息要以自然的方式透露，不要太刻意。',
      },
      {
        label: '角色互动',
        temperature: 0.85,
        extraGuidance: '侧重角色间的互动和关系发展。可以是搞笑互动、温情互动、或者暗流涌动的试探。对话要体现角色性格差异。',
      },
    ],
    '日常': [
      {
        label: '伏笔暗埋',
        temperature: 0.8,
        extraGuidance: '在日常场景中埋下伏笔。一个不起眼的细节、一句意味深长的话、一个陌生人的出现。表面平静，暗流涌动。',
      },
      {
        label: '小冲突',
        temperature: 0.85,
        extraGuidance: '日常中突然出现小冲突或意外事件（遇到仇人、被人挑衅、发现异常）。从小事开始，逐步升级。打破平静，引入新剧情。',
      },
      {
        label: '温情时刻',
        temperature: 0.75,
        extraGuidance: '日常中的温情时刻，角色间的关心、帮助、默契。通过小细节传递温暖。可以加入一些幽默元素。为后续剧情积蓄情感。',
      },
    ],
    '情感': [
      {
        label: '情感爆发',
        temperature: 0.9,
        extraGuidance: '情感达到顶点后爆发。可以是表白、争吵、崩溃、觉悟。情绪要真实，不要矫情。通过动作和语言来表达。',
      },
      {
        label: '情感转折',
        temperature: 0.85,
        extraGuidance: '情感发生转折。从恨到理解、从误解到真相、从犹豫到坚定。转折要有铺垫，不要太突兀。',
      },
      {
        label: '情感沉淀',
        temperature: 0.75,
        extraGuidance: '情感在平静中沉淀。通过回忆、独白、环境描写来深化情感。含蓄而有力，留白给读者想象空间。',
      },
    ],
    '探险': [
      {
        label: '危机遭遇',
        temperature: 0.95,
        extraGuidance: '探险中遭遇危险。环境描写要营造恐怖或紧张氛围。危机要出人意料。角色的应对要体现性格特点。',
      },
      {
        label: '重大发现',
        temperature: 0.85,
        extraGuidance: '探险中发现重要东西（宝物、遗迹、线索、秘密）。发现的过程要有悬念感。发现后的震撼和兴奋。',
      },
      {
        label: '谜团加深',
        temperature: 0.8,
        extraGuidance: '探险中发现新的谜团或矛盾信息。线索指向意想不到的方向。悬念层层叠加，让读者好奇。',
      },
    ],
  }

  // 如果没有匹配到特定场景，使用通用策略
  const defaultStrategies: OptionStrategy[] = [
    {
      label: '情节推进',
      temperature: 0.85,
      extraGuidance: '直接推进剧情发展，事件按逻辑展开。节奏适中，情节连贯。在推进中设置一个小爽点或小悬念。',
    },
    {
      label: '意外转折',
      temperature: 0.95,
      extraGuidance: '在续写中设置一个出人意料的转折。转折要有铺垫但不要太明显。转折后要有新的悬念或危机。',
    },
    {
      label: '角色深化',
      temperature: 0.8,
      extraGuidance: '侧重角色的内心世界和性格展现。通过内心独白、回忆、自我对话来深化角色。可以加入角色的弱点和矛盾。',
    },
  ]

  return sceneBasedStrategies[analysis.scene] || defaultStrategies
}

// ============================================================
// 字数控制 - 后处理确保字数在目标范围内
// ============================================================

function trimToTargetLength(text: string, targetMin: number, targetMax: number): string {
  // 去除首尾空白和可能的引导语
  let cleaned = text.trim()
  // 去除常见的AI引导语
  const prefixPatterns = [
    /^续写如下[：:]\s*/m,
    /^以下是续写内容[：:]\s*/m,
    /^好的[，,]\s*/m,
    /^当然[，,]\s*/m,
    /^【[^】]*】\s*/m,
    /^第[一二三四五六七八九十百千]+[、.]\s*/m,
    /^续写[：:]\s*/m,
  ]
  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  // 如果文本太长，找合适的截断点
  if (cleaned.length > targetMax) {
    // 优先在句号、感叹号、问号处截断
    const truncateAt = findTruncationPoint(cleaned, targetMax)
    cleaned = cleaned.slice(0, truncateAt)
  }

  return cleaned.trim()
}

function findTruncationPoint(text: string, maxLen: number): number {
  // 从maxLen往前找最近的句末标点
  const endPunctuation = /[。！？…\n]/
  for (let i = Math.min(maxLen, text.length - 1); i > maxLen * 0.7; i--) {
    if (endPunctuation.test(text[i])) {
      return i + 1
    }
  }
  // 找不到句末标点，就在逗号处截断
  const commaPunctuation = /[，；,;]/
  for (let i = Math.min(maxLen, text.length - 1); i > maxLen * 0.7; i--) {
    if (commaPunctuation.test(text[i])) {
      return i + 1
    }
  }
  return maxLen
}

// ============================================================
// AI痕迹后检测 - 简单规则检测生成的文本是否含有AI痕迹
// ============================================================

const AI_TRACE_WORDS = [
  '值得注意的是', '总而言之', '不言而喻', '毋庸置疑', '显而易见', '不可否认',
  '然而', '此外', '不仅如此', '与此同时', '换言之', '具体来说', '综上所述',
  '事实上', '实际上', '本质上', '从根本上说', '归根结底',
]

function detectAndFixAITraces(text: string): string {
  let fixed = text
  for (const word of AI_TRACE_WORDS) {
    if (fixed.includes(word)) {
      // 用上下文合适的替换
      const replacements: Record<string, string[]> = {
        '值得注意的是': ['说起来', '有意思的是', '关键是'],
        '总而言之': ['总之', '说白了', '到头来'],
        '不言而喻': ['谁都看得出来', '傻子都明白', '明摆着的事'],
        '毋庸置疑': ['没跑', '肯定', '绝对'],
        '显而易见': ['一眼就能看出来', '明摆着', '谁都看得出来'],
        '不可否认': ['确实', '没得说', '这倒是真的'],
        '然而': ['但', '可', '不过'],
        '此外': ['还有', '再说', '而且'],
        '不仅如此': ['更厉害的是', '还不止这些', '更要命的是'],
        '与此同时': ['就在这时候', '另一边', '同时'],
        '换言之': ['也就是说', '换句话说', '说白了就是'],
        '具体来说': ['比如', '具体讲', '怎么说呢'],
        '综上所述': ['总之', '所以说', '这么看来'],
        '事实上': ['说实话', '讲真', '其实'],
        '实际上': ['其实', '说真的', '说白了'],
        '本质上': ['说白了', '归根到底', '其实就是'],
        '从根本上说': ['说到底', '归根结底', '其实就是因为'],
        '归根结底': ['说到底', '到最后', '说白了'],
      }
      const options = replacements[word] || ['']
      fixed = fixed.replace(word, options[Math.floor(Math.random() * options.length)])
    }
  }

  // 检测并修复"不禁"的过度使用
  const bujinCount = (fixed.match(/不禁/g) || []).length
  if (bujinCount > 1) {
    // 只保留第一个，其余替换
    let count = 0
    fixed = fixed.replace(/不禁/g, () => {
      count++
      return count === 1 ? '不禁' : ''
    })
  }

  // 检测并修复"仿佛"的过度使用
  const fangfuCount = (fixed.match(/仿佛/g) || []).length
  if (fangfuCount > 1) {
    const fangfuReplacements = ['好像', '像是', '就跟……似的', '简直']
    let count = 0
    fixed = fixed.replace(/仿佛/g, () => {
      count++
      return count === 1 ? '仿佛' : fangfuReplacements[Math.floor(Math.random() * fangfuReplacements.length)]
    })
  }

  return fixed
}

// ============================================================
// 主续写函数 - 生成单个续写选项
// ============================================================

async function generateSingleOption(
  context: string,
  analysis: ContextAnalysis,
  styleGuidance: string,
  strategy: OptionStrategy,
  targetLength: number,
  llmConfig: LLMConfig,
  enabledSkills: string[] = [],
  customSkills?: Array<{ id: string; name: string; customPrompt: string }>
): Promise<string> {
  const baseSystemPrompt = buildHumanizedSystemPrompt(analysis, styleGuidance, targetLength)
  const skillPrompt = buildSkillPrompt(enabledSkills, customSkills)
  const systemContent = `${baseSystemPrompt}${DEFAULT_DE_AI_PROMPT}${skillPrompt}`

  const userPrompt = `【续写任务】
方向：${strategy.label}
${strategy.extraGuidance}

【上文内容】
${context}

请严格按照上述所有规则，直接输出续写内容。记住：
1. 绝对不要使用任何AI高频连接词
2. 句式长短交替，节奏有变化
3. 对话要口语化，有语气词
4. 加入感官细节和内心独白
5. 结尾留钩子
6. 字数控制在${targetLength}字左右`

  const messages: LLMMessage[] = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userPrompt },
  ]

  try {
    const { content: result } = await callLLMWithFallback(llmConfig, messages)

    let fixed = detectAndFixAITraces(result)
    fixed = trimToTargetLength(fixed, Math.floor(targetLength * 0.7), Math.floor(targetLength * 1.2))

    return fixed
  } catch (error) {
    console.error('续写生成失败:', error)
    return ''
  }
}

// ============================================================
// API路由处理
// ============================================================

export async function POST(request: Request) {
  try {
    // 解析请求参数
    const body: ContinueRequest = await request.json()
    const { context, style = 'default', length = 'medium', llmConfig, enabledSkills, customSkills } = body

    let userId: string | undefined
    try {
      const authHeader = request.headers.get('Authorization') || ''
      const token = authHeader.replace('Bearer ', '')
      if (token) {
        const decoded = await verifyToken(token)
        if (decoded) userId = decoded.userId
      }
    } catch (_e) {}

    // 🔥 修复（P1 计量缺失）：AI 接口此前不限频、不计额，注册即可无限调用；
    //   dailyQuotaUsed/dailyQuotaLimit/ai_daily_free_quota 全仓零写入零校验。
    { const _g = await guardAiEndpoint(request, 'continue', userId || null, false, 3)
      if (!_g.ok) return NextResponse.json({ error: _g.message, code: _g.status }, { status: _g.status })
      await chargeAiUsage(_g.userId, false, 3) }

    let resolvedCfg: any = llmConfig ? resolveLLMConfig(llmConfig as any, userId, 'content') : null
    // 🔥 修复：客户端不再被要求携带平台 Key（那是泄漏面）。按用户/步骤没匹配上时，
    //   再兜底一次 models.json 里的默认可用模型，让未自配 Key 的用户也能用平台默认模型。
    if ((!resolvedCfg || !resolvedCfg.apiKey)) {
      try {
        const { loadDefaultLlmConfig } = require('@/lib/ai/model-config')
        const _def = loadDefaultLlmConfig()
        if (_def && _def.apiKey) resolvedCfg = { ...(_def as any), ...(resolvedCfg && resolvedCfg.apiKey ? resolvedCfg : {}) }
      } catch (e) { console.error('[ai/content] 兜底默认模型失败:', e) }
    }
    if (!resolvedCfg || !resolvedCfg.apiKey) {
      return NextResponse.json(
        { error: '请先配置AI模型（需要API Key）' },
        { status: 400 }
      )
    }

    // 参数校验
    if (!context || typeof context !== 'string' || context.trim().length === 0) {
      return NextResponse.json(
        { error: 'context参数不能为空' },
        { status: 400 }
      )
    }

    if (context.length > 50000) {
      return NextResponse.json(
        { error: 'context文本过长，最大支持50000字' },
        { status: 400 }
      )
    }

    if (!['short', 'medium', 'long'].includes(length)) {
      return NextResponse.json(
        { error: 'length参数必须是 short、medium 或 long' },
        { status: 400 }
      )
    }

    // 字数目标映射
    const lengthConfig: Record<string, { min: number; max: number; target: number }> = {
      short: { min: 200, max: 400, target: 300 },
      medium: { min: 500, max: 800, target: 650 },
      long: { min: 1000, max: 1500, target: 1250 },
    }
    const { target } = lengthConfig[length]

    // 第一步：分析上下文
    const analysis = analyzeContext(context)

    // 第二步：构建风格指导
    const styleGuidance = buildStyleGuidance(analysis, style)

    // 第三步：获取三种差异化续写策略
    const strategies = getOptionStrategies(analysis)

    // 第四步：并行生成三个续写选项
    const options = await Promise.all(
      strategies.map(strategy =>
        generateSingleOption(context, analysis, styleGuidance, strategy, target, resolvedCfg, enabledSkills, customSkills)
      )
    )

    // 过滤空结果
    const validOptions = options.filter(opt => opt.length > 0)

    if (validOptions.length === 0) {
      return NextResponse.json(
        { error: 'AI服务暂时不可用，请检查模型配置后重试' },
        { status: 503 }
      )
    }

    // 如果有效选项不足3个，用占位提示
    while (validOptions.length < 3) {
      validOptions.push('[该选项生成失败，请重试或切换AI模型]')
    }

    return NextResponse.json({
      data: {
        options: validOptions,
        analysis: {
          scene: analysis.scene,
          emotion: analysis.emotion,
          pov: analysis.pov,
          pacing: analysis.pacing,
          characters: analysis.characters,
          era: analysis.era,
          genre: analysis.genre,
        },
      },
    })
  } catch (error) {
    console.error('续写API错误:', error)

    // 区分不同类型的错误
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: '请求体格式错误，请确保发送有效的JSON' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: '服务器内部错误，请稍后重试' },
      { status: 500 }
    )
  }
}
