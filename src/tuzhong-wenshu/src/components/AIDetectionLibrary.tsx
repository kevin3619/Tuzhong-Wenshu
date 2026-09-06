'use client'

import { useState } from 'react'
import {
  ShieldAlert, AlertTriangle, ScanSearch, FileSearch, Lightbulb,
  ChevronDown, ChevronRight, X, Check, BookOpen, Zap,
} from 'lucide-react'

// ===== 数据定义 =====

// 分级说明
const gradePool = [
  { color: 'red', dot: '🔴', title: '顶级高危特征', desc: '平台AI指纹库核心样本，人工编辑识别第一信号，少量多次出现就拉高AI评分' },
  { color: 'orange', dot: '🟠', title: '高危词汇/短语', desc: '慎用，禁止连续扎堆使用' },
  { color: 'yellow', dot: '🟡', title: '高危句式模板', desc: '禁止整句照搬，尽量重构语序' },
  { color: 'gray', dot: '⚫', title: 'AI专属行文逻辑', desc: '最深层、最难修改，单纯替换词语无法消除AI味（检测200维度里权重最高）' },
]

// 顶级高危特征
const topDangerPool = [
  {
    title: '1. 肢体神态模板（重中之重，「指尖发白」归类此处）',
    items: [
      '指尖泛白 / 指节发白 / 指节因用力而泛白',
      '眼底闪过一抹XX（了然、诧异、冷意、玩味、复杂情绪）',
      '勾起一抹似笑非笑的弧度、嘴角微微上扬',
      '咬紧下唇，直至渗出血丝',
      '深邃如黑曜石般的眼眸、深不见底的眸子',
      '一丝不易察觉/难以察觉的情绪',
      '眉头紧锁，倒吸一口凉气',
      '修长的手指微微颤抖、双手紧紧攥起',
      '瞳孔骤然收缩、猛地瞪大双眼，满脸不可置信',
      '浑身肌肉紧绷，背脊微微僵硬',
    ],
  },
  {
    title: '2. 叙事万能套话（人工审稿一眼识别）',
    items: [
      '打破现场微妙的平衡',
      '局势瞬间发生变化',
      '空气中弥漫着压抑的气息',
      '气氛陷入死寂',
      '一股寒意顺着脊椎往上爬',
      '思绪猛地炸开、脑海一片轰鸣',
    ],
  },
  {
    title: '3. 穿越/重生开篇专属高危指纹（番茄、起点新书开篇严查）',
    items: [
      '猛地睁开双眼，剧烈喘息',
      '鼻尖萦绕淡淡的铁锈血腥味',
      '头部传来撕裂般的剧痛',
      '陌生记忆如同潮水涌入脑海',
    ],
  },
]

// 高危词汇与固定短语
const highRiskWordsPool = [
  {
    title: '（1）空洞程度副词（AI极度偏爱堆砌）',
    items: ['极其', '分外', '无比', '颇为', '堪称', '不可思议', '难以置信', '至关重要', '举足轻重', '些许', '少许'],
  },
  {
    title: '（2）过渡连接词（连续出现直接标记机械化行文）',
    items: ['此外', '然而', '与此同时', '另一方面', '因此', '随之而来', '不难看出', '值得一提的是'],
  },
  {
    title: '（3）情绪标签短语（不要单独罗列情绪，改用动作替代）',
    items: ['意味深长', '若有所思', '神色复杂', '神色一凛', '神色微变', '心中一沉', '心头一紧'],
  },
  {
    title: '（4）五金店式比喻（AI通用模板比喻）',
    items: ['如同烙铁', '如同冰锥', '仿佛铁箍箍住心脏', '重锤砸在心口', '利刃划破空气'],
  },
  {
    title: '（5）书面化AI书面词（网文人类作者极少高频使用）',
    items: ['兜住', '接住', '维系', '制衡', '依托', '诸多', '诸多因素', '诸多隐患'],
  },
]

// 高危固定句式
const highRiskPatternsPool = [
  {
    title: '1. 强制转折句式（AI最高频模板）',
    items: ['不是……而是……', '这哪里是……分明是……', '没有……没有……只是……'],
    example: '他不是恐惧，而是愤怒；这哪里是援助，分明是陷阱。',
  },
  {
    title: '2. 三连排比句式（系统重点特征，尽量避免连续三组并列）',
    items: ['有人……有人……还有人……'],
    example: '有人握紧兵器，有人面露惊恐，有人冷眼旁观。',
  },
  {
    title: '3. 程序化分析句式（网文大忌，像议论文，机器直接判定AI）',
    items: ['为了达成……的目的', '基于……现状考量', '从某种意义上来说'],
  },
  {
    title: '4. 标准分层叙事句式',
    items: ['首先……其次……最后……', '一方面……另一方面……'],
  },
  {
    title: '5. 万能环境烘托句式',
    items: ['夕阳将他的影子拉长，一半沐浴余晖，一半隐入阴影，藏着不为人知的秘密。', '风吹过，带来远方淡淡的XX气息。'],
  },
  {
    title: '6. 多余解释句式（人类写作极少额外解释角色行为）',
    items: ['XX这个举动，无疑向所有人传递了一个信号。', '他这番话，让在场众人心中各有想法。'],
  },
]

// AI专属行文逻辑
const aiLogicPool = [
  { title: '1. 情绪曲线过于平滑', desc: 'AI人物情绪升降规整：平静→震惊→愤怒→冷静，循序渐进，缺少人类写作突如其来的暴怒、走神、口是心非、矛盾心态', fix: '增加人物内心矛盾、前后言行不一致、突发的情绪跳变' },
  { title: '2. 句长分布过于均匀', desc: 'AI段落长短差距很小，很少出现极短碎句、超长长句穿插；人类写作长短句随机波动', fix: '刻意打散，插入短句、独立分段、省略句' },
  { title: '3. 过度交代因果，无留白', desc: 'AI习惯把所有前因后果完整讲清楚，不存在"留白"；人类写作会省略显而易见的信息', fix: '他往后退了半步。（不写"因为害怕"）' },
  { title: '4. 感官描写均衡堆砌', desc: 'AI喜欢同时写视觉、听觉、嗅觉、触觉全套感官；真人写作只会挑选1-2种重点感官', fix: '聚焦触觉+视觉，删除其他感官堆砌' },
  { title: '5. 动作描写冗余、层层叠加', desc: '人物做一个动作，附带多层神态修饰；真人写作动作简洁', fix: '删减神态修饰，保留核心动作' },
  { title: '6. 叙事视角轻微漂移', desc: '频繁在第三人称全知视角、主角限知视角来回切换，自己很难察觉，AI天生自带这个问题', fix: '锁定主角限知视角，减少全知叙述' },
  { title: '7. 极少出现"无用细节"', desc: '真人写作会出现无关小细节（衣角沾灰、地上石子、一杯冷茶）；AI所有细节都服务主线，不存在随性描写', fix: '加入与主线无关的生活化小细节' },
  { title: '8. 对话过于工整、礼貌、逻辑严谨', desc: '真人对话会有打断、结巴、废话、词不达意；AI对话逻辑完美，很少出现争执跑题、脱口而出的蠢话', fix: '加入打断、口语废话、口是心非' },
]

// 平台审核细微差异
const platformPool = [
  { name: '番茄小说', tag: '最严，200维检测', focus: '重点打击：开篇AI重生模板、大量神态描写、连续排比、水文式环境堆砌；新书前3章检测阈值最高，「指尖发白」一类短句开篇出现极易预警。', color: 'red' },
  { name: '起点中文网', tag: '侧重叙事逻辑', focus: '编辑人工权重更高，机器标记后编辑复核；最怕通篇工整模板描写、缺少人物个性化口语；不忌讳少量修辞，忌讳千篇一律的通用神态。', color: 'orange' },
  { name: '七猫免费小说', tag: '筛查心理独白', focus: '重点筛查大段环境空泛描写、无剧情推进的心理独白；长段落连续心理活动极易标记AI。', color: 'yellow' },
  { name: '纵横中文网', tag: '短语重复严格', focus: '对重复短语3-gram匹配严格，相同短语隔几段重复出现，系统持续扣分。', color: 'gray' },
]

// 改写对照表
const rewritePool = [
  {
    category: '一、顶级高危肢体神态（全网AI重灾区，必改！）',
    pairs: [
      { ai: '他五指收紧，指节因为用力微微泛白。', real: ['拳头死死攥着，指甲深深掐进掌心，皮肉挤出几道惨白的印子。', '手背青筋绷起，攥拳的力道几乎要捏碎掌骨。'], logic: '删掉"泛白"AI专属词，用掐痕、青筋、捏碎等具象结果替代静态描写。' },
      { ai: '他眼底闪过一抹冷意，神色微沉。', real: ['眼皮轻轻一压，方才松弛的眼神瞬间冷了下来。', '目光骤然一凝，落在来人身上，带着不加掩饰的疏离。'], logic: '杜绝"闪过一抹"万能AI句式，用眼神动态动作替代抽象情绪。' },
      { ai: '他嘴角勾起一抹似笑非笑的弧度，眼底藏着深意。', real: ['唇角轻轻挑了下，那笑意却没落到眼底。', '他扯了扯嘴角，笑容淡得近乎敷衍。'], logic: '' },
      { ai: '一双黑曜石般的眼眸深邃无比，让人看不真切。', real: ['他眼神沉沉的，一片晦暗，没人能摸清他的心思。', '瞳色暗沉，静静看着前方，情绪藏得密不透风。'], logic: '' },
      { ai: '他脸上掠过一丝不易察觉的错愕。', real: ['他愣了半秒，快得让人抓不住异样。'], logic: '' },
      { ai: '他瞳孔骤然收缩，脸上满是不可置信。', real: ['双眼猛地一睁，整个人瞬间僵在原地。', '这话落下，他呼吸陡然一顿，满脸错愕。'], logic: '' },
    ],
  },
  {
    category: '二、高危叙事套话（机器向量精准匹配，全删重写）',
    pairs: [
      { ai: '话音落下，全场陷入死寂，气氛无比压抑。', real: ['话音落地，周遭瞬间静得可怕，连众人的呼吸声都清晰可闻。'], logic: '' },
      { ai: '一股冰冷的寒意顺着脊椎缓缓往上攀爬。', real: ['后背猛地窜起一股凉气，顺着骨头缝蔓延全身。'], logic: '' },
      { ai: '闻言，他脑海轰然炸开，一阵嗡嗡作响。', real: ['这话像惊雷砸在心头，脑子瞬间一片空白。'], logic: '' },
      { ai: '房间内空气中弥漫着浓郁的压抑气息。', real: ['屋里沉闷得让人喘不过气，没人敢率先开口。'], logic: '' },
    ],
  },
  {
    category: '三、重生/穿越开篇专属高危（番茄/七猫严查，开篇必改）',
    pairs: [
      { ai: '他猛地睁开双眼，胸口剧烈起伏，大口喘息着。', real: ['眼皮骤然掀开，急促的呼吸冲破喉咙，胸口此起彼伏。'], logic: '' },
      { ai: '脑袋传来一阵撕裂般的剧痛，让他几近昏厥。', real: ['针扎似的痛感密密麻麻盘踞在脑海，疼得他眉心死死拧在一起。'], logic: '' },
      { ai: '无数陌生记忆如同潮水般涌入他的脑海。', real: ['零碎的画面疯狂钻进脑子里，陌生的过往硬生生砸进意识里。'], logic: '' },
    ],
  },
  {
    category: '四、空洞高危副词（AI重灾区，直接替换/删除）',
    pairs: [
      { ai: '他此刻心情无比复杂，场面颇为尴尬。', real: ['他心里五味杂陈，场面一时僵持住。'], logic: '全部删掉「极其、分外、颇为、些许、无比、难以置信」' },
      { ai: '这是至关重要的一步，意义非凡。', real: ['这一步走对了，后续一切皆可盘活。'], logic: '' },
    ],
  },
  {
    category: '五、AI固定致命句式（结构全改，禁止对称规整）',
    pairs: [
      { ai: '他不是害怕，而是愤怒。', real: ['他眼底没有半分惧意，只剩压不住的火气。'], logic: '禁用：不是……而是……' },
      { ai: '这哪里是帮忙，分明是添乱。', real: ['看似是出手相助，实则纯属捣乱搅局。'], logic: '禁用：这哪里是……分明是……' },
      { ai: '台下有人恐慌，有人愤怒，有人冷眼旁观。', real: ['台下瞬间乱作一团，有人吓得连连后退，也有人死死盯着场中，默不作声。'], logic: '禁用：有人……有人……还有人……' },
      { ai: '首先局势不利，其次人手不足，最后物资短缺。', real: ['眼下局势极差，人手紧缺不说，储备的物资也所剩无几。'], logic: '禁用：首先……其次……最后……' },
    ],
  },
  {
    category: '六、AI五金店烂大街比喻（全网统一模板，替换成原生描写）',
    pairs: [
      { ai: '一股寒意如冰锥刺入骨髓，心口如同被重锤砸中。', real: ['彻骨的冷意席卷全身，心脏猛地一沉，闷得发慌。'], logic: '' },
      { ai: '压抑感如同铁箍死死箍住心脏，让人窒息。', real: ['胸口堵得厉害，沉甸甸的，连呼吸都透着憋闷。'], logic: '' },
    ],
  },
  {
    category: '七、AI多余解释句式（人工一眼判AI，全部删除改写）',
    pairs: [
      { ai: '他的举动无疑向众人传递了一个不好的信号。', real: ['众人见状，心里各自打起了算盘。'], logic: '' },
      { ai: '他这番话，让在场众人心中各有想法。', real: ['话音落下，场中众人神色各异。'], logic: '' },
    ],
  },
  {
    category: '八、AI行文逻辑根治改写（核心去AI味，比改词更重要）',
    pairs: [
      { ai: '他很生气，所以往前踏出一步。（完整因果，机械生硬）', real: ['他抬步往前踏出一步，周身气压骤降。（只写动作，情绪让读者自行感受）'], logic: '改掉【完美因果】，学会留白' },
      { ai: '震惊→愤怒→冷静（循序渐进，过于规整）', real: ['先是错愕，随即莫名觉得可笑，眼底的火气反倒慢慢压了下去（矛盾、跳脱、更像真人）'], logic: '改掉【情绪平滑】，增加情绪跳变' },
      { ai: '风声呼啸，尘土飞扬，寒意刺骨，心头发慌（全套感官堆砌）', real: ['狂风卷着尘土扑面而来，冷得人面皮发紧。（聚焦触觉+视觉）'], logic: '改掉【感官堆砌】，只抓1-2个核心感官' },
    ],
  },
]

// 配套实操方案
const promptConstraints = [
  '禁止使用指尖泛白、指节发白、眼底闪过一抹XX等模板神态描写',
  '杜绝「不是…而是…、有人…有人…」标准化句式',
  '不堆砌成套感官描写，减少空洞副词：极其、颇为、难以置信',
  '打散句子长度，长短句交错，避免段落篇幅高度统一',
  '减少直接概括人物情绪，优先用动作、对话侧面体现',
  '不添加多余因果解释，适当留白，不要把所有逻辑讲透',
  '人物对话允许出现打断、口语废话，不要过于严谨规整',
  '禁止连续使用过渡词：然而、与此同时、另一方面',
]

// 平台微调规则
const platformTweakPool = [
  { name: '番茄小说', rule: '前三章零模板神态、零排比、零空泛环境描写，短句为主，杜绝长段堆砌。' },
  { name: '起点中文网', rule: '重点优化叙事逻辑，去掉规整分析句，增加角色个性化言行。' },
  { name: '七猫小说', rule: '删除大段无用心理独白，所有心理描写绑定剧情动作。' },
  { name: '纵横中文网', rule: '杜绝短语重复，同一句式、短语间隔500字以上，绝不连续复用。' },
]

// ===== 颜色映射 =====
const colorMap: Record<string, { bg: string; border: string; text: string; dotBg: string }> = {
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dotBg: 'bg-red-500' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dotBg: 'bg-orange-500' },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dotBg: 'bg-yellow-500' },
  gray: { bg: 'bg-stone-100', border: 'border-stone-300', text: 'text-stone-700', dotBg: 'bg-stone-600' },
}

// ===== 主组件 =====
interface SectionHeaderProps {
  sectionKey: string
  icon: React.ElementType
  title: string
  subtitle?: string
  defaultOpen?: boolean
  isOpen: boolean
  onToggle: (key: string) => void
}

function SectionHeader(props: SectionHeaderProps) {
  const Icon = props.icon
  return (
    <button
      onClick={function () { props.onToggle(props.sectionKey) }}
      className="w-full flex items-center justify-between p-5 hover:bg-stone-50 transition-colors"
    >
      <div className="flex items-center space-x-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-stone-100 text-stone-700">
          <Icon className="w-5 h-5" />
        </div>
        <div className="text-left">
          <div className="text-base font-bold text-stone-900">{props.title}</div>
          {props.subtitle && <div className="text-xs text-stone-500 mt-0.5">{props.subtitle}</div>}
        </div>
      </div>
      {props.isOpen ? <ChevronDown className="w-5 h-5 text-stone-400" /> : <ChevronRight className="w-5 h-5 text-stone-400" />}
    </button>
  )
}

export default function AIDetectionLibrary() {
  const _expandedSections = useState<Record<string, boolean>>({
    'top-danger': true,
    'high-risk-words': false,
    'high-risk-patterns': false,
    'ai-logic': false,
    'platform-diff': false,
    'rewrite-table': false,
    'prompt-solution': false,
  })
  const expandedSections = _expandedSections[0]
  const setExpandedSections = _expandedSections[1]

  function toggleSection(key: string) {
    setExpandedSections(function (prev) {
      const next = Object.assign({}, prev)
      next[key] = !next[key]
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* 顶部说明区 */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <div className="p-6 border-b border-stone-100">
          <div className="flex items-center space-x-3 mb-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-white">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">全网网文平台 AI 双重判定特征库</h2>
              <p className="text-sm text-stone-500 mt-1">起点 / 番茄 / 七猫 / 纵横 通用</p>
            </div>
          </div>
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-sm text-blue-900 leading-relaxed">
            <p className="mb-2"><span className="font-bold">适用：</span>机器向量检测 + 人工审稿联合筛查</p>
            <p className="mb-2"><span className="font-bold">分级：</span>顶级高危（极易触发标记）、高危词汇短语、高危固定句式、AI专属行文逻辑</p>
            <p className="text-red-700 font-medium">⚠ 重要前提：不是出现一次就直接判定，而是高频集中出现、连续复用、大面积堆砌，系统综合打分触发预警；人工审稿见到多条特征叠加，直接判定AI粗制滥造。</p>
          </div>
        </div>

        {/* 分级说明卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-6">
          {gradePool.map(function (g) {
            const c = colorMap[g.color]
            return (
              <div key={g.title} className={'rounded-lg border p-4 ' + c.bg + ' ' + c.border}>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-lg">{g.dot}</span>
                  <span className={'font-bold text-sm ' + c.text}>{g.title}</span>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">{g.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* 一、顶级高危特征 */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <SectionHeader sectionKey="top-danger" icon={AlertTriangle} title="一、顶级高危特征（全网统一黑名单，重点规避）" subtitle="平台AI指纹库核心样本 · 少量多次出现就拉高AI评分" isOpen={!!expandedSections['top-danger']} onToggle={toggleSection} />
        {expandedSections['top-danger'] && (
          <div className="px-6 pb-6 space-y-5">
            {topDangerPool.map(function (section) {
              return (
                <div key={section.title} className="border border-red-100 rounded-lg overflow-hidden">
                  <div className="bg-red-50 px-4 py-2.5 border-b border-red-100">
                    <h4 className="text-sm font-bold text-red-800">{section.title}</h4>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {section.items.map(function (item, idx) {
                      return (
                        <div key={idx} className="flex items-start space-x-2 text-sm text-stone-700 bg-stone-50 rounded px-3 py-2">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                          <span className="font-mono">{item}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 二、高危词汇与固定短语 */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <SectionHeader sectionKey="high-risk-words" icon={AlertTriangle} title="二、高危词汇与固定短语（禁止密集重复使用）" subtitle="空洞副词 · 过渡连接词 · 情绪标签 · 五金店比喻 · 书面化AI词" isOpen={!!expandedSections['high-risk-words']} onToggle={toggleSection} />
        {expandedSections['high-risk-words'] && (
          <div className="px-6 pb-6 space-y-4">
            {highRiskWordsPool.map(function (section) {
              return (
                <div key={section.title} className="border border-orange-100 rounded-lg overflow-hidden">
                  <div className="bg-orange-50 px-4 py-2.5 border-b border-orange-100">
                    <h4 className="text-sm font-bold text-orange-800">{section.title}</h4>
                  </div>
                  <div className="p-4 flex flex-wrap gap-2">
                    {section.items.map(function (item, idx) {
                      return (
                        <span key={idx} className="inline-block text-xs font-mono text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-3 py-1">
                          {item}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 三、高危固定句式 */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <SectionHeader sectionKey="high-risk-patterns" icon={FileSearch} title="三、高危固定句式（模板句式，向量检测精准匹配）" subtitle="禁止整句照搬 · 尽量重构语序" isOpen={!!expandedSections['high-risk-patterns']} onToggle={toggleSection} />
        {expandedSections['high-risk-patterns'] && (
          <div className="px-6 pb-6 space-y-4">
            {highRiskPatternsPool.map(function (section) {
              return (
                <div key={section.title} className="border border-yellow-200 rounded-lg overflow-hidden">
                  <div className="bg-yellow-50 px-4 py-2.5 border-b border-yellow-200">
                    <h4 className="text-sm font-bold text-yellow-800">{section.title}</h4>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {section.items.map(function (item, idx) {
                        return (
                          <span key={idx} className="inline-block text-xs font-mono text-yellow-800 bg-yellow-100 border border-yellow-300 rounded px-2.5 py-1">
                            ❌ {item}
                          </span>
                        )
                      })}
                    </div>
                    {section.example && (
                      <div className="text-xs text-stone-500 italic bg-stone-50 rounded px-3 py-2 border-l-2 border-stone-300">
                        示例：{section.example}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 四、AI专属行文逻辑 */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <SectionHeader sectionKey="ai-logic" icon={ScanSearch} title="四、AI专属行文逻辑（最深层指纹！只替换词语无法消除）" subtitle="平台200维检测核心维度 · 比词汇句式权重更高" isOpen={!!expandedSections['ai-logic']} onToggle={toggleSection} />
        {expandedSections['ai-logic'] && (
          <div className="px-6 pb-6 space-y-3">
            {aiLogicPool.map(function (item) {
              return (
                <div key={item.title} className="border border-stone-200 rounded-lg overflow-hidden">
                  <div className="bg-stone-100 px-4 py-2.5 border-b border-stone-200 flex items-center space-x-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-stone-700" />
                    <h4 className="text-sm font-bold text-stone-800">{item.title}</h4>
                  </div>
                  <div className="p-4 space-y-2">
                    <p className="text-sm text-stone-600 leading-relaxed">{item.desc}</p>
                    {item.fix && (
                      <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 flex items-start space-x-1.5">
                        <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span><span className="font-bold">优化：</span>{item.fix}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 五、平台审核细微差异 */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <SectionHeader sectionKey="platform-diff" icon={BookOpen} title="五、起点 / 番茄 / 七猫 / 纵横 平台审核细微差异" subtitle="针对性调整 · 精准避审" isOpen={!!expandedSections['platform-diff']} onToggle={toggleSection} />
        {expandedSections['platform-diff'] && (
          <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {platformPool.map(function (p) {
              const c = colorMap[p.color]
              return (
                <div key={p.name} className={'rounded-lg border p-4 ' + c.bg + ' ' + c.border}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={'font-bold text-base ' + c.text}>{p.name}</h4>
                    <span className={'text-xs px-2 py-0.5 rounded-full bg-white border ' + c.border + ' ' + c.text}>{p.tag}</span>
                  </div>
                  <p className="text-sm text-stone-600 leading-relaxed">{p.focus}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 六、一对一改写对照表 */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <SectionHeader sectionKey="rewrite-table" icon={Lightbulb} title="六、一对一改写对照表（起点/番茄/七猫/纵横通用）" subtitle="零AI指纹 · 人工审稿默认真人手写 · 不丢氛围感" isOpen={!!expandedSections['rewrite-table']} onToggle={toggleSection} />
        {expandedSections['rewrite-table'] && (
          <div className="px-6 pb-6 space-y-5">
            {/* 改写原则 */}
            <div className="bg-gradient-to-r from-stone-50 to-stone-50 border border-stone-200 rounded-lg p-4">
              <h4 className="text-sm font-bold text-blue-900 mb-2">核心改写原则（根治AI味）</h4>
              <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                <li>删掉标准化神态副词（微微、些许、缓缓、悄然）</li>
                <li>抛弃「情绪直白概括」，全部换成具象动作/细节痕迹</li>
                <li>打散规整句式，拒绝排比、对称、完整因果句，适当留白</li>
                <li>拒绝通用模板，加入个性化、生活化、带瑕疵的真人细节</li>
              </ol>
            </div>

            {rewritePool.map(function (category) {
              return (
                <div key={category.category} className="border border-stone-200 rounded-lg overflow-hidden">
                  <div className="bg-stone-800 px-4 py-2.5">
                    <h4 className="text-sm font-bold text-white">{category.category}</h4>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {category.pairs.map(function (pair, idx) {
                      return (
                        <div key={idx} className="p-4 hover:bg-stone-50">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-2">
                            {/* AI原版 */}
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <div className="flex items-center space-x-1.5 mb-1.5">
                                <X className="w-4 h-4 text-red-500" />
                                <span className="text-xs font-bold text-red-700">AI原版</span>
                              </div>
                              <p className="text-sm text-red-900 leading-relaxed">{pair.ai}</p>
                            </div>
                            {/* 真人改写 */}
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                              <div className="flex items-center space-x-1.5 mb-1.5">
                                <Check className="w-4 h-4 text-green-500" />
                                <span className="text-xs font-bold text-green-700">真人改写</span>
                              </div>
                              <div className="space-y-1.5">
                                {pair.real.map(function (r, ridx) {
                                  return <p key={ridx} className="text-sm text-green-900 leading-relaxed">{ridx + 1}. {r}</p>
                                })}
                              </div>
                            </div>
                          </div>
                          {pair.logic && (
                            <div className="text-xs text-stone-500 italic flex items-start space-x-1.5">
                              <Lightbulb className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-yellow-500" />
                              <span><span className="font-bold">避坑逻辑：</span>{pair.logic}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 七、配套实操方案 */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <SectionHeader sectionKey="prompt-solution" icon={Zap} title="七、配套实操方案（用于AI生成输出时强制约束Prompt）" subtitle="从源头减少AI特征 · 可直接放入AI提示词" isOpen={!!expandedSections['prompt-solution']} onToggle={toggleSection} />
        {expandedSections['prompt-solution'] && (
          <div className="px-6 pb-6 space-y-4">
            {/* 写作硬性约束 */}
            <div className="bg-stone-900 rounded-lg p-5">
              <h4 className="text-sm font-bold text-green-400 mb-3 flex items-center space-x-2">
                <Zap className="w-4 h-4" />
                <span>写作硬性约束（可直接复制到AI提示词）</span>
              </h4>
              <div className="space-y-2">
                {promptConstraints.map(function (c, idx) {
                  return (
                    <div key={idx} className="flex items-start space-x-2 text-sm text-stone-300">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-green-900 text-green-400 text-xs font-bold flex-shrink-0">{idx + 1}</span>
                      <span>{c}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 平台专属微调规则 */}
            <div>
              <h4 className="text-sm font-bold text-stone-700 mb-3">四大平台专属微调规则</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {platformTweakPool.map(function (p) {
                  return (
                    <div key={p.name} className="border border-stone-200 rounded-lg p-3 bg-stone-50">
                      <div className="text-sm font-bold text-stone-800 mb-1">{p.name}</div>
                      <p className="text-xs text-stone-600 leading-relaxed">{p.rule}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 补充避坑提醒 */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="text-sm font-bold text-yellow-800 mb-2">补充避坑提醒</h4>
              <ul className="text-xs text-yellow-700 space-y-1.5 list-disc list-inside">
                <li>少量使用清单内词汇<span className="font-bold">不会直接判AI</span>；同一特征短篇幅内多次重复、多种高危特征叠加才会触发系统预警</li>
                <li>单纯同义词替换没用！<span className="font-bold">必须重构句式、调整叙事逻辑</span></li>
                <li>全书统一文风，不要一段AI文风、一段手写文风，<span className="font-bold">文风割裂是机器重点识别特征</span></li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
