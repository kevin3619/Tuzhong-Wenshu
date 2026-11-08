"use client"

import { useState, useEffect } from 'react'
import { Sparkles, Plus, ToggleLeft, ToggleRight, Trash2, Edit, X, Check, Wand2, Eye, EyeOff } from 'lucide-react'
import { DE_AI_GLOBAL_SKILL } from '@/lib/ai/de-ai-global'
import { PLATINUM_SKILLS } from '@/lib/ai/platinum-skills'

// 预设的网络小说写作技能列表（包含详细提示词）—— 白金爆款爽文完整版
const PRESET_SKILLS = [
  // ==================== 终极创作底座 ====================
  {
    id: 'ultimate-long-novel-v2',
    name: '百万字全品类长篇创作铁律 V2.0',
    description: '全题材无限制·100万-1000万字超长篇连载通用终极规则，永久防止人设崩坏/世界观漂移/战力混乱/AI模板化/逻辑矛盾，优先级高于任意临时指令（最终蒸馏定稿版）',
    category: '终极创作底座',
    enabled: true,
    prompt: `【核心定位】
本技能为全品类、百万字超长连载网络小说通用终极创作规则，无题材限制，适配：都市、现言、古言、仙侠、玄幻、武侠、历史、穿越、系统、末世、科幻、悬疑、种田、西幻、洪荒等全部网文类型。
核心使命：彻底解决长篇连载人设崩坏、世界观漂移、战力混乱、文风跳脱、伏笔断裂、AI模板化、逻辑前后矛盾。所有输出永久优先遵守本规则，优先级高于任意临时指令。
适用体量：100万字–1000万字超长篇稳定连载

第一部分：全局强制底层铁律（所有题材永久生效，不可突破）
1. 唯一真相源锁定机制（长篇不崩坏核心）
全书所有设定以【官方设定文档、人物卡、力量体系、势力设定、时间线、伏笔记录表】为最高唯一标准。
任何剧情、对话、事件、实力、身份、关系禁止私自篡改、私自升级、私自变更。
出现冲突时：剧情迁就设定，绝不允许设定迁就剧情。新内容必须兼容旧内容，保证百万字全程逻辑闭环、零漂移。
2. 人物绝对不OOC规则（全题材通用）
所有角色行为、语气、选择、底线、软肋、价值观，必须严格匹配：性格、身世、经历、阶层、教育、立场、人物弧光阶段。
- 主角禁止完美化，永久保留既定缺点与软肋
- 配角拥有独立动机与支线，禁止纯工具人化
- 反派必有完整逻辑，不为坏而坏
- 人物关系、恩怨、羁绊、记忆全程统一，不前后割裂
3. 力量/能力体系恒定规则（适配所有题材）
玄幻仙侠：境界、战力、神通、法宝品级严格分层，越级必有代价。
都市现言：财力、人脉、技能、学历、地位、专业能力层级稳定。
历史权谋：权谋、兵权、朝堂势力、个人威望层级稳定。
科幻末世：异能、科技、机甲、资源、战力体系严格自洽。
核心铁律：任何能力、实力、地位、资源禁止无理由暴涨、无理由暴跌。
4. 时间线与伏笔闭环规则
剧情单向推进，时间线严谨不乱；所有伏笔分短期、中期、长期记录，必须按期回收。
禁止挖坑不填、前后时间悖论、事件重复、死人复活、人设反复横跳。
5. 文风统一锁定规则
全书文风、语速、氛围感、对话风格、叙事节奏全程统一。
不会前期轻松、后期沉重，不会前期简洁、后期堆砌，杜绝文风割裂。

第二部分：全题材通用章节写作标准（百万字稳定节奏）
1. 章节体量标准
单章稳定：2500–3200字，符合全网主流连载规格。
每章必须具备：推进点 + 冲突点 + 情绪点 + 结尾钩子。
2. 万能黄金节奏模板（所有题材通用）
- 开篇30%：铺垫场景、人物状态、当前处境、遗留矛盾
- 中段50%：冲突升级、对话博弈、事件推进、动作/情感拉扯
- 结尾20%：阶段性收束 + 强悬念钩子，保证追读欲
3. 描写通用规范
- 优先用动作、对话、行为、细节塑造人物，减少大段旁白说教
- 环境描写服务氛围与剧情，禁止空洞凑字
- 心理描写克制、自然，不堆砌AI式内心独白
- 战斗/博弈/情感拉扯层次清晰，递进流畅
4. 对话标准化规则
每个角色拥有专属语气、措辞习惯、说话风格。
大佬不碎嘴、弱者不霸气、文人不粗鄙、反派不弱智、主角不反复。
杜绝全书人物一个口吻、全员同质化AI对话。

第三部分：去AI腔、防检测、真人化终极规则（强制生效）
为保证百万字全程无AI痕迹、不被平台判定AI、真人质感拉满，永久执行以下规则：
- 长短句随机交错，拒绝均匀工整段落
- 删除所有AI高频模板词：眸光一凝、心中暗道、不由得、指尖微白、神色一凛等流水线词汇
- 适当保留人类写作自然留白，不事事解释通透
- 段落长短错落，杜绝固定行数、固定结构
- 拒绝完美闭环叙事、过度工整修辞、排比堆砌
- 情绪自然起伏，不强行热血、强行虐、强行反转

第四部分：分题材自适应规则（智能适配，无需手动切换）
本Skill可自动识别当前小说题材，自适应对应创作逻辑：
1. 玄幻/仙侠/洪荒/武侠
侧重：境界稳定、战力层级、功法神通、秘境势力、天道规则、修行逻辑、杀伐节奏。
2. 都市/系统/异能
侧重：现实逻辑、人脉层级、商业规则、都市节奏、系统机制不崩坏、打脸爽点自然。
3. 古言/现言/甜虐情感
侧重：情感逻辑、人物拉扯、三观统一、情绪递进、暧昧与矛盾合理、不强行狗血。
4. 历史/穿越权谋
侧重：时代背景、礼制规则、朝堂博弈、人心算计、势力制衡、历史逻辑严谨。
5. 末世/科幻/星际
侧重：生存逻辑、科技体系、星际势力、资源规则、危机合理性、未来世界观自洽。
6. 悬疑/灵异
侧重：氛围铺垫、线索细碎埋入、悬念层层递进、逻辑闭环、不强行解谜。

第五部分：四大核心工作模块（AI自动执行）
1. 章节正文生成模块
输入：最新3章正文 + 全书设定集 + 本章大纲
输出：纯正文内容，无解释、无分析、无剧透，文风统一、逻辑严谨、符合节奏。
2. 大纲&卷纲推演模块
输出：时间线、剧情节点、冲突递进、人物弧光推进、伏笔清单、卷末大高潮设计。
3. 人物卡迭代模块
角色每经历重大事件，自动更新：心态、执念、认知、性格变化、弧光阶段，基础人设永久不变。
4. 全书一致性审计模块（百万字核心保障）
自动巡检：人设冲突、战力崩坏、时间线错误、剧情矛盾、伏笔遗漏、关系错乱、文风漂移。
输出问题清单 + 可直接使用的修正方案。

第六部分：输出格式终极规范
- 小说正文只输出正文，无多余话术、无思考过程、无markdown多余标签
- 分析、审计、设定报告单独标注，不混入正文
- 章节标题简洁网文风，不文艺、不冗长
- 全程保持人类连载质感，拒绝AI流水线工整感

第七部分：迭代收敛规则（越写越稳）
每次出现违和、BUG、AI腔、设定冲突、人设偏差，自动记录并纳入规则库，后续永久规避同类问题。
全书越写到后期，文风越稳、逻辑越严、人设越牢、零崩坏、零漂移。

【最终技能总结（AI强制记忆）】
本技能为全品类长篇网文万能创作底座，适配所有题材、适配百万字超长篇、解决所有AI连载通病。所有创作任务必须优先执行本套规则，临时指令不得覆盖底层长效规则。`,
  },
  // ==================== 开篇技巧 ====================
  {
    id: 'golden-five-chapters',
    name: '番茄黄金五章生成器',
    description: '严格按照番茄编辑五章定律生成开篇，第五章必须出现第一个大转折',
    category: '开篇技巧',
    enabled: true,
    prompt: '你是番茄小说编辑，精通五章定律。第一章：黄金三章必须快速切入核心冲突，主角遭遇第一个困境；第二章：展示主角特殊之处（金手指/特殊能力），第一次打脸；第三章：引入更大危机，反派登场；第四章：主角获得重要机缘/盟友；第五章：出现大反转，引出长线悬念。每章结尾必须有钩子。',
  },
  {
    id: 'golden-three-sentences',
    name: '黄金三句开篇法',
    description: '开篇前三句必须抓住读者：悬念+冲突+身份，完读率提升40%',
    category: '开篇技巧',
    enabled: true,
    prompt: '你是开篇写作大神。黄金三句法则：第一句必须制造悬念（反常、震撼、离奇）；第二句必须抛出核心冲突（危机、困境、压迫）；第三句必须亮明主角身份+金手指暗示。禁止开篇写景、铺垫背景、啰嗦叙述。前三句不超过100字，直接上干货。',
  },
  {
    id: 'hook-chapter-ending',
    name: '章末钩子生成器',
    description: '每章结尾必须留钩子：反转悬念/危机降临/新人物出场，强制读者点下一章',
    category: '开篇技巧',
    enabled: true,
    prompt: '你是章末钩子专家。每章最后300字必须设置钩子：类型包括——1.反转钩子（真相揭晓、身份暴露、关系反转）；2.危机钩子（强敌来袭、阴谋败露、生死关头）；3.期待钩子（新机缘、神秘人物、进阶预兆）；4.悬念钩子（未知声音、诡异现象、未解之谜）。绝对禁止以"平静的夜晚""众人散去"等平淡句式结尾。',
  },
  // ==================== 爽点设计 ====================
  {
    id: 'shuang-point-designer',
    name: '爽点密度控制器',
    description: '白金爆款标准：300字小刺激、1500字中爽点、每章3-5个爽点，零尿点节奏',
    category: '爽点设计',
    enabled: true,
    prompt: '你是爽点设计大师。白金爆款爽点密度标准：每300字一个小刺激（嘲讽、轻视、挑衅、小危机出现）；每1500字一个中爽点（打脸成功、获得宝物、突破境界、权威认可）；每章必须有3-5个爽点。爽点类型轮换：打脸爽→升级爽→装逼爽→收小弟爽→美女倾心爽→机缘爽→复仇爽。绝对禁止连续500字无冲突无刺激。',
  },
  {
    id: 'face-slap-closure',
    name: '打脸闭环大师',
    description: '从被轻视→立flag→众人嘲笑→主角出手→全员震惊→反派跪地，300字完整闭环',
    category: '爽点设计',
    enabled: true,
    prompt: '你是打脸闭环专家。打脸六步闭环法：①铺垫（反派/路人嚣张挑衅、放狠话、立赌约）→②围观（群众附和嘲笑、女主/前辈摇头叹息、主角亲友紧张）→③蓄力（主角淡定装逼、说一句狠话如"你不配"）→④爆发（一招制敌、一句话噎死、数据碾压）→⑤震惊（围观者瞳孔地震、倒吸凉气、疯狂脑补、反派脸绿）→⑥收尾（反派跪地求饶/身败名裂、主角风轻云淡转身、前辈主动结交、美女投怀送抱）。全流程不超过300字，一气呵成。',
  },
  {
    id: 'pretending-b-master',
    name: '装逼范塑造师',
    description: '主角装逼如风常伴吾身：风轻云淡打脸、一句顶一万句、事后深藏功与名',
    category: '爽点设计',
    enabled: true,
    prompt: '你是装逼写作宗师。主角装逼五大境界：1.沉默装逼——不说废话，直接干，干完就走；2.金句装逼——"你也配？""就这？""我一剑足矣。"每句不超过10字；3.反差装逼——众人以为他是青铜，结果是王者；4.借势装逼——"我身后的人，你惹不起"；5.无形装逼——随手做的小事，却让全场震惊到说不出话。绝对禁止主角自己解释自己多牛逼，必须通过配角的震惊、膜拜、脑补来体现。',
  },
  {
    id: 'revenge-arc-designer',
    name: '复仇爽感规划师',
    description: '君子报仇不隔夜：从受辱到复仇不超过3章，十倍奉还，血债血偿',
    category: '爽点设计',
    enabled: true,
    prompt: '你是复仇剧情专家。复仇铁律：①有仇当场报，绝不憋到下一卷；②从受辱到复仇完成，中间不超过3章；③复仇必须是十倍奉还——对方断你一臂，你灭他满门；对方骂你一句，你让他当众下跪抽自己100耳光；④复仇过程要有围观群众，让曾经看不起主角的人亲眼见证；⑤复仇后主角不能有圣母心，斩草要除根；⑥复仇结尾必须安排旁观者的反应和评价，强化爽感。',
  },
  // ==================== 金手指强化 ====================
  {
    id: 'cheat-power-amplifier',
    name: '金手指放大器',
    description: '金手指必须有明确限制+进化路径+隐藏功能，每30章解锁新玩法',
    category: '金手指强化',
    enabled: true,
    prompt: '你是金手指设计专家。金手指设计六大铁律：1.必须有限制（冷却时间、能量消耗、使用次数上限），绝对不能无敌；2.必须有进化路径（初级→中级→高级→终极形态），每30章解锁新功能；3.必须有隐藏功能（关键时刻保命、越级杀敌）；4.必须和主角升级路线绑定（金手指升级→主角境界突破）；5.金手指来历要有伏笔（不是凭空出现，后期揭露身世之谜）；6.金手指使用必须有代价（消耗寿命、反噬、心魔），使用越多代价越大。',
  },
  {
    id: 'system-panel-designer',
    name: '系统面板设计大师',
    description: '系统流爆款公式：任务奖励+属性面板+商城抽奖+签到打卡+隐藏成就',
    category: '金手指强化',
    enabled: true,
    prompt: '你是系统流设计专家。系统流五大核心模块：1.任务系统——主线任务（必做、大奖励）、支线任务（选做、小惊喜）、隐藏任务（触发条件苛刻、奖励爆炸）；2.属性面板——力量/速度/体质/精神/功法/技能/装备/血脉，每项必须有数字，读者最爱看数字增长；3.商城系统——积分兑换，必须有几个超贵但超诱人的物品作为长期目标；4.签到打卡——每日签到、连续签到7天/30天/100天奖励递增；5.成就系统——隐藏成就触发时给读者惊喜。系统提示必须简洁有力，不超过20字/条。',
  },
  // ==================== 伏笔埋放 ====================
  {
    id: 'foreshadowing-master',
    name: '伏笔埋放宗师',
    description: '长线伏笔提前100章埋设、中线50章、短线10章，回收时必须让读者"卧槽原来是这样"',
    category: '伏笔埋放',
    enabled: true,
    prompt: '你是伏笔设计大师。伏笔三线并行制：1.长线伏笔（100章以上回收）——主角身世、金手指来历、终极反派身份，必须在开篇5章内埋好线索（一个物件、一句话、一个习惯性动作）；2.中线伏笔（30-50章回收）——某配角的真实目的、某宝物的真正作用、某势力的隐藏布局，每卷开头埋2-3个；3.短线伏笔（3-10章回收）——某个消息、某个人物、某个约定，每3章埋1个。伏笔回收时必须有读者"卧槽原来是这样"的冲击力，绝对不能埋了不收。',
  },
  {
    id: 'chekhov-gun-law',
    name: '契诃夫之枪执行器',
    description: '第一幕出现的枪第三幕必须开火，所有设定过的人物/物品/事件后期必须有用',
    category: '伏笔埋放',
    enabled: true,
    prompt: '你是剧情一致性专家。严格执行契诃夫之枪法则：1.第一幕出现的枪，第三幕必须开火——凡是花超过50字描写过的物件、人物、场景、设定，后期必须派上用场；2.禁止出现一次性工具人——出场超过3次的配角必须有独立故事线和人物弧光；3.禁止出现废设定——设定过的境界等级、势力分布、功法技能，后期必须用到；4.如果某件物品/人物实在没用上，就安排一个合理的理由让它消失（被毁、送人、死亡），绝对不能放着不管。',
  },
  // ==================== 冲突升级 ====================
  {
    id: 'conflict-escalation',
    name: '冲突阶梯放大器',
    description: '矛盾必须从小到大螺旋升级：路人→家族→宗门→国家→大陆→世界级→宇宙级',
    category: '冲突升级',
    enabled: true,
    prompt: '你是冲突设计专家。冲突升级阶梯法则：1.冲突必须螺旋升级，不能跳级——从路人找茬→家族内斗→宗门竞争→国家战争→大陆争霸→世界级危机→宇宙毁灭，一步一步来；2.每个级别冲突的对手实力必须刚好比主角高半个档次——主角苦战能赢，不能碾压也不能打不过；3.每次冲突升级必须有明确的触发事件（不是为了升级而升级）；4.上一级别的反派必须在下一级别继续有戏份（或者他的后台出现），形成反派链；5.主角每解决一个级别的冲突，身份和地位就同步跃升——从废柴→家族天才→宗门核心→国家重臣→大陆名人→世界救世主→宇宙主宰。',
  },
  {
    id: 'villain-shaping-expert',
    name: '反派塑造专家',
    description: '反派必须有合理动机+粉丝魅力+智商在线，坏要坏得有逼格，不能是脑残',
    category: '冲突升级',
    enabled: true,
    prompt: '你是反派塑造大师。反派五大设计原则：1.动机合理——不是为了坏而坏，他坏有他的理由（为了复仇、为了守护、为了野心、为了理念）；2.智商在线——绝对不会做出"我明明可以杀你但我要话痨"的脑残行为，该下死手就下死手；3.实力匹配——前期虐主角不手软，后期被主角反杀也不丢逼格；4.有粉丝魅力——要么长得帅、要么有故事、要么话够骚、要么够狠够疯；5.分层反派体系——小反派（脑残嚣张型，送经验）→中反派（有脑有谋型，送装备）→大反派（人格魅力型，送成长）→终极反派（理念冲突型，全书升华）。',
  },
  // ==================== 角色设计 ====================
  {
    id: 'power-fantasy-character',
    name: '穿越爽文角色创建器',
    description: '创建穿越爽文的核心角色，主角必须有强烈升级线',
    category: '角色设计',
    enabled: true,
    prompt: '你是角色设计大师。穿越角色设计原则：1.主角身份有反差（废柴→天才、现代→古代）；2.金手指要明确（系统、知识、能力）；3.升级线清晰（境界、实力、地位）；4.性格有特点（杀伐果断、幽默风趣、隐忍腹黑）；5.有明确的敌人和盟友；6.有成长弧光（从弱小到强大的过程）。',
  },
  {
    id: 'heroine-group-builder',
    name: '女主天团构建师',
    description: '女主必须有差异化人设+独立故事线+出场顺序，不能是花瓶和挂件',
    category: '角色设计',
    enabled: true,
    prompt: '你是女主设计专家。女主天团构建法则：1.差异化人设——冷艳御姐、活泼萝莉、飒爽女侠、腹黑师妹、温柔师姐、霸道公主、神秘少女、商业女王，每个女主必须有独一无二的标签；2.独立故事线——每个女主有自己的家族背景、成长烦恼、个人目标，不是围着主角转的花瓶；3.出场顺序——前期1-2个（青梅竹马/患难与共）、中期2-3个（并肩作战/利益联姻）、后期1-2个（宿命相遇/前世今生），不能一窝蜂出现；4.感情线推进——从初识→误会→交集→心动→确认→生死相依，每一步有具体事件推动，绝不能一见钟情就倒贴。',
  },
  {
    id: 'supporting-cast-designer',
    name: '群像角色塑造师',
    description: '配角必须鲜活：搞笑担当、老狐狸前辈、忠犬小弟、傲娇对手，每个都要有记忆点',
    category: '角色设计',
    enabled: true,
    prompt: '你是群像塑造专家。配角群像设计法则：1.功能标签化——搞笑担当（负责气氛调节、被主角坑）、老狐狸前辈（表面严厉实则护犊子、给主角开后门）、忠犬小弟（第一个认主、一路跟随、战斗力成长）、傲娇对手（嘴上不服身体诚实、和主角亦敌亦友）、毒舌智囊（运筹帷幄、嘴硬心软）、背景板大佬（全程看戏、关键时刻救场）；2.每个配角必须有1-2个标志性特征——口头禅、招牌动作、习惯性表情；3.必须有独立高光时刻——不是只有主角在装逼，配角偶尔也要秀一把让读者记住；4.配角不能随便死——要死就要死得有价值，让读者落泪。',
  },
  // ==================== 节奏控制 ====================
  {
    id: 'emotion-curve',
    name: '情绪曲线控制器',
    description: '按照番茄读者情绪曲线设计剧情，避免连续同情绪导致读者流失',
    category: '节奏控制',
    enabled: true,
    prompt: '你是网文节奏大师。根据番茄读者情绪曲线设计剧情：爽点间隔不超过1500字，连续爽点不超过3个，必须穿插低谷、悬念、期待等情绪。使用情绪曲线公式：期待→满足→失落→愤怒→爽感循环，每个情绪节点必须有明确的触发事件。',
  },
  {
    id: 'tomato-rhythm-master',
    name: '番茄节奏宗师',
    description: '番茄平台专属节奏：短段落+快对话+强冲击，段落不超3行，对话不超2句一段',
    category: '节奏控制',
    enabled: true,
    prompt: '你是番茄平台节奏专家。番茄节奏铁律：1.段落短——每段不超过3行，战斗/对话场景尽量1段1句话；2.对话快——每段对话不超过2句就切视角/加动作；3.冲击强——重要信息（打脸、反转、突破）必须单独成段，前后加空行，视觉上突出；4.废字删——"了""的""地"能删就删，形容词能省就省，直接上动词名词；5.章节切割——2000字一章，卡在上钩子的地方结束，绝对不能把一个爽点切成两半。',
  },
  {
    id: 'pacing-balancer',
    name: '张弛平衡调节器',
    description: '大战之后必有日常、高潮之后必有休整，但休整不能超过2章，水字数就切',
    category: '节奏控制',
    enabled: true,
    prompt: '你是张弛调节专家。张弛平衡法则：1.大战/高潮之后必须安排日常休整，但休整绝对不能超过2章；2.日常章节也要有信息增量——埋线索、谈感情、练技能、获信息，不能纯吃饭聊天逛街；3.水字数立刻切——如果连续300字没有推进剧情、没有爽点、没有信息，直接删除重写；4.多线穿插——主角线、女主线、反派线、配角线交替推进，避免单一视角疲劳；5.每10章一个小高潮+1章休整，每50章一个大高潮+2章休整，节奏循环往复。',
  },
  // ==================== 大纲规划 ====================
  {
    id: 'bestseller-outline',
    name: '爆款大纲规划师',
    description: '内置2026年番茄最火题材爆款公式，分卷大纲+章节节点+情绪曲线+爽点分布+伏笔埋放',
    category: '大纲规划',
    enabled: true,
    prompt: '你是爆款大纲专家。2026爆款公式应用：1.分卷结构（每卷50章，有明确起点和终点）；2.章节节点（每章一个事件，推动剧情）；3.情绪曲线（期待→满足→失落→愤怒→爽感循环）；4.爽点分布（每5章小爽点，每20章大爽点，每50章高潮）；5.伏笔埋放（长线伏笔提前50章埋设）；6.节奏控制（每章结尾有钩子）。',
  },
  {
    id: 'power-fantasy-outline',
    name: '穿越爽文大纲规划器',
    description: '为穿越爽文规划章节结构、安排爽点密度',
    category: '大纲规划',
    enabled: true,
    prompt: '你是大纲规划专家。穿越爽文大纲结构：1.开篇（穿越+金手指觉醒）；2.初期（小冲突+第一次升级）；3.中期（势力崛起+重要盟友）；4.高潮（大反转+大决战）；5.结局（新境界+新悬念）。爽点分布：每5章一个小爽点，每20章一个大爽点，每50章一个高潮。',
  },
  {
    id: 'volume-structure-builder',
    name: '分卷结构设计师',
    description: '每卷必须有独立主题+最终BOSS+主角蜕变，50章一卷，卷与卷之间衔接无缝',
    category: '大纲规划',
    enabled: true,
    prompt: '你是分卷结构专家。分卷结构六大要素：1.独立主题——每卷有一个核心目标（家族篇→宗门篇→秘境篇→战场篇→国家篇→大陆篇→世界篇）；2.最终BOSS——每卷结尾有一个该卷最强反派，主角必须苦战才能赢；3.主角蜕变——每卷结束主角至少突破1大境界+获得1个重要能力/装备/人脉；4.线索延续——本卷结尾必须引出下一卷的引子（新地图、新危机、新人物），不能断；5.爽点高潮——每卷第25章左右一个中高潮，第50章一个大高潮收尾；6.角色成长——本卷出场的重要配角必须在本卷内有明显变化。',
  },
  // ==================== 续写技巧 ====================
  {
    id: 'shuangwen-continuation',
    name: '番茄爽文续写大师',
    description: '专门写番茄风格的爽文，打脸要快、反转要狠、情绪要足',
    category: '续写技巧',
    enabled: true,
    prompt: '你是番茄爽文大神。续写要求：1.打脸要快（300字内完成打脸闭环）；2.反转要狠（意料之外情理之中）；3.情绪要足（愤怒→憋屈→爆发→爽感）；4.节奏要猛（少废话多行动）；5.升级要频（每章至少一个小提升）。语言风格：简洁有力，对话短促，动作描写画面感强。',
  },
  {
    id: 'action-scene-writer',
    name: '战斗场景描写大师',
    description: '大战场景要有画面感+层次感+节奏感：起手→交锋→蓄力→绝招→收尾→观众反应',
    category: '续写技巧',
    enabled: true,
    prompt: '你是战斗描写大师。战斗场景七步结构法：1.起手式——双方放狠话、亮兵器/功法、气场对撞、环境异象（天昏地暗、飞沙走石）；2.试探交锋——先过几招、互相摸底、观众点评；3.真招对决——主角认真、反派认真、招式对轰、画面爆炸；4.反派压境——主角暂时吃亏/反派放大招、亲友担忧、反派得意；5.主角蓄力——金手指觉醒/回忆杀/怒气爆发、异象再生、气场逆转；6.绝杀绝招——一招定乾坤，招式名要霸气（例："一剑开天门！"），描写要华丽；7.收尾震惊——反派落败/秒杀/跪地，全场倒吸凉气、观众疯狂脑补、大佬重新评估主角。',
  },
  // ==================== 场景写作 ====================
  {
    id: 'power-fantasy-scene',
    name: '穿越爽文场景写作',
    description: '撰写穿越爽文的具体场景叙事和对话，强调现代语言与古代语境的碰撞',
    category: '场景写作',
    enabled: true,
    prompt: '你是场景写作大师。穿越场景写作技巧：1.现代思维与古代规则的碰撞；2.利用现代知识解决古代问题；3.语言风格：现代思维用内心独白，对外说话符合身份；4.动作描写：简洁有力，画面感强；5.冲突设计：外部压力+内部挣扎；6.节奏控制：快速切入，快速解决。',
  },
  {
    id: 'atmosphere-builder',
    name: '氛围感营造大师',
    description: '环境描写必须服务剧情：恐怖氛围/热血氛围/温馨气氛/紧张压迫，感官细节拉满',
    category: '场景写作',
    enabled: true,
    prompt: '你是氛围感营造专家。氛围感营造五大感官法：1.视觉——颜色（血红、漆黑、苍白）、光影（残阳如血、月光惨白、烛火摇曳）、异象（乌云压顶、雷鸣电闪、狂风大作）；2.听觉——声音（咔嚓、轰隆、嘶嘶、沙沙）、寂静（静得能听见心跳、针掉地上都听得见）；3.嗅觉——气味（血腥味、腐臭、花香、酒香、硝烟味）；4.触觉——温度（冰冷刺骨、燥热难当）、触感（湿滑、粗糙、粘稠）；5.味觉——口感（血腥味、苦涩、甘甜）。环境描写必须和当前剧情情绪匹配：战斗前→压抑紧张、打脸时→爽快明亮、感情戏→温暖柔和、阴谋时→阴冷诡异。',
  },
  // ==================== 对话优化 ====================
  {
    id: 'dialogue-optimizer',
    name: '人物对话优化师',
    description: '把生硬对话改成符合番茄读者口味的生活化对话，突出人物性格',
    category: '对话优化',
    enabled: true,
    prompt: '你是对话写作专家。优化对话原则：1.每人说话有独特口头禅和语气词；2.对话要带情绪（嘲讽、惊讶、愤怒、调侃）；3.用动作代替"说"（冷笑、挑眉、咬牙）；4.少用"XXX说道"，多用动作衔接；5.对话要推进剧情，不能只是信息交换；6.番茄风格：口语化、带情绪、有冲突。',
  },
  // ==================== 质量优化 ====================
  {
    id: 'de-ai-polish',
    name: '去AI味打磨师',
    description: '去除AI写作痕迹，让文字更像人写的，平台AI检测通过率100%',
    category: '质量优化',
    enabled: true,
    prompt: '你是去AI化专家。去除AI痕迹原则：1.删除AI高频词（赫然、陡然、猛地、不禁、心中一凛）；2.打破工整对称句式（不用"首先...其次...最后..."）；3.加入口语化表达和轻微不完美；4.增加细节描写（感官细节、环境细节）；5.使用短句和长短句交替；6.去除模板化结尾（"更大的危机悄然降临"）；7.增加人物个性化表达。',
  },
  DE_AI_GLOBAL_SKILL,
  ...PLATINUM_SKILLS,
  // ==================== 包装优化 ====================
  {
    id: 'title-intro-generator',
    name: '标题与简介生成器',
    description: '生成符合番茄平台要求的标题(15-30字)和简介',
    category: '包装优化',
    enabled: true,
    prompt: '你是网文包装专家。标题规则：1.15-30字；2.包含核心元素（身份/能力/冲突）；3.制造悬念；4.使用数字（九世、三千年）；5.加入情绪词（震惊、绝望、无敌）。简介规则：1.三段式（身份困境→获得金手指→最终目标）；2.突出爽点；3.留下悬念；4.控制在150-300字。',
  },
  {
    id: 'platform-adaptation-expert',
    name: '多平台适配专家',
    description: '番茄/起点/飞卢/晋江/七猫各平台规则不同，自动调整风格、节奏、字数和敏感内容',
    category: '包装优化',
    enabled: true,
    prompt: '你是平台适配专家。各平台适配规则：番茄：短段落（3行内）、快节奏（每章300字小刺激）、2000字/章、结尾强钩子；起点：允许长段落、重设定、重逻辑、3000字/章、开篇铺垫可以5章；飞卢：脑洞大、同人综漫、节奏爆炸快、800字/章、每章结尾必须爽；晋江：感情线第一、人设细腻、慢热、描写唯美；七猫：免费阅读模式、完读率至上、剧情不拖沓、广告位前后不能断高潮。所有平台通用禁忌：政治敏感、色情低俗、血腥暴力、宗教迷信。',
  },
  // ==================== 安全检测 ====================
  {
    id: 'content-risk-detector',
    name: '内容风险检测器',
    description: '检测敏感词和风险内容，防止内容被平台限制',
    category: '安全检测',
    enabled: true,
    prompt: '你是内容安全专家。检测并规避风险原则：1.政治敏感内容（领导人、重大事件）；2.低俗色情描写；3.暴力血腥描写；4.宗教迷信内容；5.违禁药品；6.赌博内容；7.敏感历史事件；8.煽动性言论。改写策略：替换敏感词、模糊处理、侧面描写、使用谐音或代称。',
  },
  // ==================== 世界观 ====================
  {
    id: 'time-slip-world',
    name: '穿越世界观构建器',
    description: '构建穿越历史类小说的世界观，包括真实朝代考据、穿越机制、金手指设定',
    category: '世界观',
    enabled: true,
    prompt: '你是世界观构建大师。穿越历史世界观规则：1.历史考据（人物、事件、制度符合时代背景）；2.穿越机制（时间点、方式、是否影响历史走向）；3.金手指设定（知识型、能力型、系统型，必须有限制）；4.势力格局（各方势力关系、利益冲突）；5.文化风俗（语言、服饰、饮食、礼仪）；6.力量体系（武功、道法、科技，符合时代逻辑）。',
  },
  {
    id: 'faction-balance-architect',
    name: '势力格局架构师',
    description: '各方势力必须平衡：正义/中立/邪恶各有强者，势力之间有恩怨有合作有背叛',
    category: '世界观',
    enabled: true,
    prompt: '你是势力架构专家。势力格局设计七要素：1.阵营平衡——正派、中立、邪恶三大阵营实力相当，任何一方都不能碾压；2.层级分明——从村级→镇→城→州→国→大陆级，每级势力有对应战力天花板；3.利益冲突——势力之间因为资源、地盘、理念、恩怨产生矛盾，不是为了打而打；4.纵横捭阖——势力之间有联盟、有背叛、有联姻、有战争，关系复杂；5.隐藏势力——表面势力之下必须有1-2个隐藏巨擘（上古宗门、杀手组织、神秘商会），后期掀桌；6.传承设定——每个势力有独门功法/血脉/宝物，和主角金手指有交集；7.势力态度——每个势力对主角的态度变化：轻视→关注→拉拢→忌惮→敌对/臣服。',
  },
]

interface Skill {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
  isCustom?: boolean
  customPrompt?: string
  prompt?: string
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [globalEnabled, setGlobalEnabled] = useState(true)
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillPrompt, setNewSkillPrompt] = useState('')
  const [newSkillCategory, setNewSkillCategory] = useState('自定义')
  
  // 编辑状态
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  
  // 查看状态
  const [viewingSkill, setViewingSkill] = useState<Skill | null>(null)
  const [viewingPrompt, setViewingPrompt] = useState('')
  const [showFullPrompt, setShowFullPrompt] = useState(false)

  // 从localStorage加载
  useEffect(() => {
    const saved = localStorage.getItem('tuzhong-skills')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // 合并预设技能，确保所有技能都存在
        const mergedSkills = PRESET_SKILLS.map(preset => {
          const savedSkill = (parsed.skills || []).find((s: any) => s.id === preset.id)
          return {
            ...preset,
            enabled: savedSkill?.enabled ?? true,
            isCustom: savedSkill?.isCustom,
            customPrompt: savedSkill?.customPrompt,
            prompt: savedSkill?.prompt ?? preset.prompt,
          }
        })
        // 添加自定义技能
        const customSkills = (parsed.skills || []).filter((s: any) => s.isCustom)
        queueMicrotask(function () {
          setSkills([...mergedSkills, ...customSkills])
          setGlobalEnabled(parsed.globalEnabled ?? true)
        })
      } catch (e) { console.error('[skills] 解析本地技能配置失败:', e) }
    } else {
      // 没有保存的话，使用预设技能（全部开启）
      queueMicrotask(function () {
        setSkills(PRESET_SKILLS)
        setGlobalEnabled(true)
      })
    }
  }, [])

  // 保存到localStorage
  useEffect(() => {
    if (skills.length > 0) {
      localStorage.setItem('tuzhong-skills', JSON.stringify({ skills, globalEnabled }))
    }
  }, [skills, globalEnabled])

  // 切换单个技能
  const toggleSkill = (id: string) => {
    setSkills(skills.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
  }

  // 删除技能
  const deleteSkill = (id: string) => {
    setSkills(skills.filter(s => s.id !== id))
  }

  // 添加自定义技能
  const addCustomSkill = () => {
    if (!newSkillName.trim() || !newSkillPrompt.trim()) return
    const skill: Skill = {
      id: `custom-${Date.now()}`,
      name: newSkillName,
      description: newSkillPrompt.slice(0, 100),
      category: newSkillCategory,
      enabled: true,
      isCustom: true,
      customPrompt: newSkillPrompt,
      prompt: newSkillPrompt,
    }
    setSkills([...skills, skill])
    setNewSkillName('')
    setNewSkillPrompt('')
    setNewSkillCategory('自定义')
    setShowAddCustom(false)
  }

  // 编辑技能
  const [editCategory, setEditCategory] = useState('')
  
  const startEditSkill = (skill: Skill) => {
    setEditingSkill(skill)
    setEditName(skill.name)
    setEditDescription(skill.description)
    setEditCategory(skill.category)
    setEditPrompt(skill.customPrompt || skill.prompt || '')
  }

  // 保存编辑
  const saveEditSkill = () => {
    if (!editingSkill) return
    setSkills(skills.map(s => {
      if (s.id === editingSkill.id) {
        return {
          ...s,
          name: editName,
          description: editDescription,
          category: editCategory,
          customPrompt: editingSkill.isCustom ? editPrompt : s.customPrompt,
          prompt: editingSkill.isCustom ? editPrompt : s.prompt,
        }
      }
      return s
    }))
    setEditingSkill(null)
  }

  // 查看技能
  const viewSkill = (skill: Skill) => {
    setViewingSkill(skill)
    setViewingPrompt(skill.customPrompt || skill.prompt || '')
    setShowFullPrompt(true)
  }

  // 按分类分组
  const categories = [...new Set(skills.map(s => s.category))]
  const enabledCount = skills.filter(s => s.enabled).length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="text-purple-600" /> SKILL 技能库
          </h1>
          <p className="text-gray-500 mt-1">管理AI写作技能，提升小说生成质量</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 全局开关 */}
          <button
            onClick={() => setGlobalEnabled(!globalEnabled)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              globalEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {globalEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            全局{globalEnabled ? '已开启' : '已关闭'} ({enabledCount}/{skills.length})
          </button>
          {/* 添加自定义 */}
          <button
            onClick={() => setShowAddCustom(true)}
            className="flex items-center gap-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
          >
            <Plus className="w-4 h-4" /> 自定义技能
          </button>
        </div>
      </div>

      {/* 自定义技能弹窗 */}
      {showAddCustom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">添加自定义技能</h3>
              <button onClick={() => setShowAddCustom(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能名称</label>
                <input
                  type="text"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  placeholder="输入技能名称，如：对话优化大师"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能分类</label>
                <select
                  value={newSkillCategory}
                  onChange={(e) => setNewSkillCategory(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="自定义">自定义</option>
                  <option value="开篇技巧">开篇技巧</option>
                  <option value="爽点设计">爽点设计</option>
                  <option value="金手指强化">金手指强化</option>
                  <option value="伏笔埋放">伏笔埋放</option>
                  <option value="冲突升级">冲突升级</option>
                  <option value="角色设计">角色设计</option>
                  <option value="节奏控制">节奏控制</option>
                  <option value="大纲规划">大纲规划</option>
                  <option value="续写技巧">续写技巧</option>
                  <option value="场景写作">场景写作</option>
                  <option value="对话优化">对话优化</option>
                  <option value="质量优化">质量优化</option>
                  <option value="包装优化">包装优化</option>
                  <option value="世界观">世界观</option>
                  <option value="安全检测">安全检测</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能提示词</label>
                <textarea
                  value={newSkillPrompt}
                  onChange={(e) => setNewSkillPrompt(e.target.value)}
                  placeholder="输入技能的详细提示词/指令，这将指导AI如何执行此技能..."
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">提示词越详细，AI执行效果越好</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddCustom(false)} className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={addCustomSkill} className="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑技能弹窗 */}
      {editingSkill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">编辑技能</h3>
              <button onClick={() => setEditingSkill(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能名称</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能分类</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="自定义">自定义</option>
                  <option value="开篇技巧">开篇技巧</option>
                  <option value="爽点设计">爽点设计</option>
                  <option value="金手指强化">金手指强化</option>
                  <option value="伏笔埋放">伏笔埋放</option>
                  <option value="冲突升级">冲突升级</option>
                  <option value="角色设计">角色设计</option>
                  <option value="节奏控制">节奏控制</option>
                  <option value="大纲规划">大纲规划</option>
                  <option value="续写技巧">续写技巧</option>
                  <option value="场景写作">场景写作</option>
                  <option value="对话优化">对话优化</option>
                  <option value="质量优化">质量优化</option>
                  <option value="包装优化">包装优化</option>
                  <option value="世界观">世界观</option>
                  <option value="安全检测">安全检测</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能描述</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能提示词</label>
                {/* 🔥 修复（P2）：内置技能的提示词在保存时被直接丢弃，但界面允许编辑并提示成功
                    （刷新就回滚）。现明确置灰只读，不再假装生效。 */}
                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  readOnly={!editingSkill?.isCustom}
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingSkill(null)} className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={saveEditSkill} className="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">保存修改</button>
            </div>
          </div>
        </div>
      )}

      {/* 查看技能弹窗 */}
      {viewingSkill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">查看技能详情</h3>
              <button onClick={() => setViewingSkill(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能名称</label>
                <div className="px-4 py-3 bg-gray-50 rounded-lg text-gray-900 font-medium">{viewingSkill.name}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能分类</label>
                <div className="px-4 py-3 bg-gray-50 rounded-lg text-gray-700">{viewingSkill.category}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">技能描述</label>
                <div className="px-4 py-3 bg-gray-50 rounded-lg text-gray-700">{viewingSkill.description}</div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">技能提示词</label>
                  <button onClick={() => setShowFullPrompt(!showFullPrompt)} className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1">
                    {showFullPrompt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showFullPrompt ? '隐藏' : '展开'}
                  </button>
                </div>
                <div className={`px-4 py-3 bg-gray-50 rounded-lg text-gray-700 text-sm whitespace-pre-wrap transition-all ${showFullPrompt ? 'max-h-[400px] overflow-y-auto' : 'max-h-[100px] overflow-hidden'}`}>
                  {viewingPrompt || '暂无提示词'}
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={() => setViewingSkill(null)} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 技能列表 - 按分类分组 */}
      {!globalEnabled && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          ⚠️ SKILL全局开关已关闭，所有技能不会在AI生成中生效
        </div>
      )}

      {categories.map(category => (
        <div key={category} className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{category}</h2>
          <div className="space-y-3">
            {skills.filter(s => s.category === category).map(skill => (
              <div
                key={skill.id}
                className={`p-4 rounded-lg border-2 transition-all ${
                  skill.enabled ? 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-md' : 'bg-gray-50 border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-center gap-4">
                  <button onClick={() => toggleSkill(skill.id)} className="flex-shrink-0">
                    {skill.enabled ? (
                      <ToggleRight className="w-6 h-6 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-gray-400" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{skill.name}</span>
                      {skill.isCustom && (
                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full">自定义</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{skill.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* 查看按钮 */}
                    <button onClick={() => viewSkill(skill)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="查看详情">
                      <Eye className="w-4 h-4" />
                    </button>
                    {/* 编辑按钮 */}
                    <button onClick={() => startEditSkill(skill)} className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="编辑">
                      <Edit className="w-4 h-4" />
                    </button>
                    {/* 删除按钮（仅自定义技能） */}
                    {skill.isCustom && (
                      <button onClick={() => deleteSkill(skill.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
