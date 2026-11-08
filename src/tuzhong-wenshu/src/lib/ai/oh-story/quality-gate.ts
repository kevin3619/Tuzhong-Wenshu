/**
 * oh-story 章级质量统一确定性门禁（quality-gate）
 * ============================================================
 * 对标 zenstory-ai/oh-story-claudecode：
 *   - skills/story-long-write/references/long-chapter-quality.md（7 组章级清单）
 *   - skills/story-review/references/quality-rubric.md（S1-S4 + APPROVE/CONCERNS/REJECT）
 *   - skills/story-deslop/scripts/{check-degeneration,normalize-punctuation}.js
 *   - skills/story-deslop/references/banned-words.md（AI 味分组信号）
 *
 * 与既有模块的分工（不替代，只做「单一出口聚合」）：
 *   - chapter-engine/audit.ts     ：字数/爽点/自称/标点/AI 率的引擎内闸门
 *   - oh-story/signing-gates.ts   ：oh-story 移植的分项检查（复读/截断/占位/工程词/番茄五项）
 *   - platinum-gate.ts            ：白金硬指标（爽点节拍/平铺段/对话占比/段落长度/章末硬钩）
 *   - 本模块                       ：① 补齐 T1 差距清单里上面三者都漏的项
 *                                   （金手指人格化、元叙事全量、英文残留、载体残留、
 *                                    重复坍塌、比喻密度、格式一致度）；
 *                                ② 把分项判级聚合成**唯一 verdict**，解决「两个门禁口径冲突」；
 *                                ③ 给出确定性清洗路径 cleanChapterText()；
 *                                ④ 产出 oh-story 五维评分（T1 的 G-15）。
 *
 * 设计原则：纯确定性、零 LLM 调用、零外部依赖、任何分支 try/catch 兜底绝不抛错。
 */

/* ------------------------------------------------------------------ */
/* 🔥 2026-10-26 T15：门禁调用口径常量（唯一真源）                      */
/* ------------------------------------------------------------------ */
/**
 * 固定门禁调用口径：消除「同一源码不同传参 ⇒ APPROVE 7/CONCERNS 53 vs 51/9」的歧义。
 * 扫描/回填一律通过 gateCaliberOptions() 取参；除 chapterTitle/chapterNumber/prevEnding/
 * prevHookType/historyHashes/期待债计数（逐章变化项）外，其余常量不得临时改值。
 */
// 🔥 T18：跨章重叠「刻意回收」白名单（编辑实读裁定后落库，与 T15 修 6 类误报同性质）
//   形态说明见 runChapterQualityGate 的「跨章重叠」段注释；后续新书的刻意回收在此追加。
const OVERLAP_WHITELIST: string[] = [
  '丁府愿以两广盐课二成佛山铁课三成换一路通行之凭事成之日愿献肇庆三水高要三城',   // ch7 密信正文 → ch45 当廷呈证逐字照搬（本作已登记的刻意回收）
  '肇庆卫在册一千二百实到七百三十火药存二十斤四门锁钥已换换者为赵虎旧辽东军户',   // ch7 情报底稿 → ch45 当廷呈证逐字照搬（同上，已登记）
]

export const GATE_CALIBER = {
  genre: '历史',
  userTargetWords: 2000,
  prevEndingWindow: 220,
  prevHookWindow: 220,
  historyNgramSize: 9,
  historyNgramCap: 50000,
  sceneGate: true,
  maxNewConcepts: 3,
  mainCastLimit: 3,
  // 🔥 2026-11-06 修复：删除硬编码主角锚点 protagonistName:'朱由榔'（该值从未被消费，
  //   主角名一律由调用方按当前作品传入 per.protagonistName）。
} as const

/** 逐章易变项的固定口径取参（调用方只填这几项，其余一律用常量） */
export function gateCaliberOptions(per: {
  chapterNumber: number
  chapterTitle?: string
  prevEnding?: string
  prevHookType?: string | null
  historyHashes?: Set<string>
  resolvedThreadCount?: number
  newThreadCount?: number
  protagonistName?: string
  knownConcepts?: string[]
}): QGateOptions {
  return {
    chapterNumber: per.chapterNumber,
    chapterTitle: per.chapterTitle,
    genre: GATE_CALIBER.genre,
    userTargetWords: GATE_CALIBER.userTargetWords,
    sceneGate: GATE_CALIBER.sceneGate,
    maxNewConcepts: GATE_CALIBER.maxNewConcepts,
    protagonistName: per.protagonistName,
    knownConcepts: per.knownConcepts,
    prevEnding: per.prevEnding ? String(per.prevEnding).slice(-GATE_CALIBER.prevEndingWindow) : '',
    prevHookType: per.prevHookType === undefined ? null : per.prevHookType,
    historyHashes: per.historyHashes,
    resolvedThreadCount: per.resolvedThreadCount,
    newThreadCount: per.newThreadCount,
  }
}

/* ------------------------------------------------------------------ */
/* 字数口径：单一来源 = 用户设定；默认 2000，区间 1800-2200            */
/* ------------------------------------------------------------------ */

import { stateDeltaFindings, extractStateDeltas, type StateCategory, type StateDeltaResult } from './state-delta'
import { runSceneGate, type SceneGateResult } from './scene-gate'
import { infoConceptFindings, openingGateFindings, hookDiversityFindings, type GateFindingLike } from './chapter-gates'
import { contractGateFindings, type ContractGateResult } from './contract-gate'

export interface WordBand {
  target: number
  min: number
  max: number
  /** 来源：user=用户设定 / default=默认口径 */
  source: 'user' | 'default'
}

/** 默认字数口径（oh-story：作者给的字数范围写在细纲，无则用默认） */
export const DEFAULT_WORD_BAND: WordBand = { target: 2000, min: 1800, max: 2200, source: 'default' }

/** 允许的用户设定范围（超出即夹取，避免写死 3000/2500-3500 一类旧口径回流） */
export const USER_WORD_MIN = 800
export const USER_WORD_MAX = 8000

/**
 * 单一来源解析字数带：
 *   - 用户显式给了目标字数 → 以此为 target，min/max = target ±10%（并夹取到 [800,8000]）
 *   - 未给 → 默认 target 2000 / 区间 1800-2200
 */
export function resolveWordBand(userTarget?: number | null): WordBand {
  const t = Number(userTarget)
  if (!isFinite(t) || t <= 0) return { ...DEFAULT_WORD_BAND }
  const target = Math.min(USER_WORD_MAX, Math.max(USER_WORD_MIN, Math.round(t)))
  const min = Math.max(USER_WORD_MIN, Math.round(target * 0.9))
  const max = Math.min(USER_WORD_MAX, Math.round(target * 1.1))
  return { target, min, max, source: 'user' }
}

/** 供提示词使用的字数字符串（禁止在提示词里再写死具体数字） */
export function wordBandLine(band: WordBand): string {
  return WORD_UNIT_LABEL + '目标 ' + band.target + ' 字，允许区间 ' + band.min + '-' + band.max + ' 字（由' +
    (band.source === 'user' ? '用户设定' : '系统默认口径') + '给定，不得自行改成其它数字）'
}

/* ------------------------------------------------------------------ */
/* 类型                                                               */
/* ------------------------------------------------------------------ */

export type QSeverity = 'S1' | 'S2' | 'S3' | 'S4'
export type QVerdict = 'APPROVE' | 'CONCERNS' | 'REJECT'
export type QCategory =
  | 'ai-cliche' | 'meta' | 'truncation' | 'english' | 'repetition'
  | 'carrier' | 'golden-finger' | 'hook' | 'simile' | 'format'
  | 'word-band' | 'logic' | 'continuity'
  // 🔥 2026-10-25 T6：G-08/G-09/G-10/G-14/G-18/G-04 六项门禁的归因类别
  | 'state' | 'scene' | 'info' | 'contract' | 'opening' | 'hook-diversity'

export interface QFinding {
  rule: string
  severity: QSeverity
  category: QCategory
  message: string
  evidence: string
  fix: string
}

export interface FiveDim {
  core_consistency: number
  expression: number
  format_consistency: number
  readability: number
  logic_coherence: number
  total: number
}

export interface QGateMetrics {
  /** 🔥 T9：字数口径唯一值（去空白含标点字符数） */
  wordUnits: number
  /** 参考指标：CJK 字符数（**不是**字数口径；字数口径见 countWordUnits） */
  chineseChars: number
  paragraphs: number
  sentences: number
  dialogueRatio: number
  maxParagraphChinese: number
  singleSentenceParagraphRatio: number
  similePer1000: number
  repeatedSentenceTop: number
  adjacentDuplicateLines: number
  ngramCollapseRatio: number
  hookType: string
  wordBand: WordBand & { status: 'in-band' | 'below' | 'above'; deviation: number }
  clicheHits: number
}

export interface QGateResult {
  verdict: QVerdict
  findings: QFinding[]
  /** 必须修（S1/S2）；供生成循环驱动定点重写 */
  blocking: string[]
  scores: FiveDim
  metrics: QGateMetrics
  engine: 'quality-gate@2026-10-25'
  /** 🔥 T6：七类状态变化抽取结果（G-08） */
  state?: StateDeltaResult
  /** 🔥 T6：场景三要素（G-09） */
  scenes?: SceneGateResult
  /** 🔥 T6：契约四问（G-14） */
  contract?: ContractGateResult
  /** 🔥 T6：本章新概念（G-10） */
  newConcepts?: string[]
}

export interface QCLeanResult {
  text: string
  changes: string[]
}

/* ------------------------------------------------------------------ */
/* 基础工具                                                           */
/* ------------------------------------------------------------------ */

const CJK = /[\u4e00-\u9fa5]/g
export function countChinese(s: string): number {
  if (!s) return 0
  const m = String(s).match(CJK)
  return m ? m.length : 0
}

/** 🔥 2026-10-26 T9：字数口径（唯一）=「去空白（含标点）字符数」；字带判定一律用它 */
export function countWordUnits(s: string): number {
  if (!s) return 0
  return String(s).replace(/\s/g, '').length
}

/** 口径标签（提示词/报告统一引用） */
export const WORD_UNIT_LABEL = '去空白（含标点）字符数'

function paragraphsOf(text: string): string[] {
  return String(text || '').split(/\n+/).map((p) => p.trim()).filter(Boolean)
}

function sentencesOf(text: string): string[] {
  return String(text || '')
    .split(/[。！？…；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function stripQuotes(s: string): string {
  return String(s || '').replace(/[“”「」『』"']/g, '')
}

// 🔥 2026-10-26 T6：补半角收尾符（" ' ）——T3 新稿以半角引号收尾，
//   旧集合不含 " 导致 39/60 章被误判为 S1 截断（实测：ch2/ch4/ch7/ch9/ch10 末行均为 …说，"…"）
const TERMINAL = '。！？!?…”』」）)】…—~～"\''

/* ------------------------------------------------------------------ */
/* 规则词库（全部来自 T1 实测的 oh-story 分组信号）                     */
/* ------------------------------------------------------------------ */

/** AI 腔套话：分组；组内命中数与权重决定严重度 */
const CLICHE_GROUPS: Array<{ name: string; re: RegExp; weight: number }> = [
  { name: '动作清单/了一下', re: /(了一下|了下|拍了两下|停了一下|扯了下)/g, weight: 1 },
  { name: '语境敏感词', re: /(突然|陡然|骤然|猛然|瞬间|猛地|死死地|好像|似乎|沉声道|淡淡地说)/g, weight: 1 },
  { name: '工整并列', re: /(有的[^。！？\n]{2,18}，有的|一边[^。！？\n]{2,18}，一边|不是[^。！？\n]{1,16}，而是|没有[^。！？\n]{1,14}，没有[^。！？\n]{1,14}，只有)/g, weight: 2 },
  { name: '弱化装饰', re: /(微微|淡淡|缓缓|轻轻|一丝|一抹|些许|几分|隐约|微不可察|几不可闻|毫无征兆)/g, weight: 1 },
  { name: '万能状语/声线', re: /(，带着(一丝|几分|一抹|一种|些许)?[^。！？\n]{0,12}|声音不大，却带着|语气毫无波澜|平静无波|听不出情绪)/g, weight: 2 },
  { name: '通用反应', re: /(深吸一口气|深吸了一口气|不禁|眼中闪过|嘴角勾起|嘴角微扬|脸色一变|眉头微皱|瞳孔微缩|瞳孔一缩|指节泛白|目光移开|眼神锐利|目光锐利|头皮发紧|眼皮一跳|心口一沉|胃里翻涌)/g, weight: 2 },
  { name: '通用心理', re: /(心头一震|心中一动|心下了然|心中暗道|心底泛起|心中一凛|不由得|心中涌起)/g, weight: 2 },
  { name: '空泛定性', re: /(不容置疑|不容置喙|不易察觉|显而易见|毫无疑问|不可否认|前所未有|狡黠|深邃|凛冽)/g, weight: 2 },
  { name: '模板比喻', re: /(仿佛[^。！？\n]{0,14}(一般|似的)|犹如[^。！？\n]{0,14}(一般|般)|宛若[^。！？\n]{0,14}(一般|般)|宛如[^。！？\n]{0,14}(一般|般)|如同[^。！？\n]{0,14}(一般|般)|如潮水般|像潮水般|如闪电般|仿佛能穿透一切|像命运的齿轮)/g, weight: 2 },
  { name: '自动过渡/书面腔', re: /(映入眼帘|只见|此时此刻|不由自主|情不自禁|自然而然|话锋一转|取而代之的是)/g, weight: 2 },
  { name: '解释结论链', re: /(这意味着|真正重要的是|由此可见|终于明白|这才意识到|这才明白|这是最好的选择|所有人都会记住这一刻)/g, weight: 3 },
  { name: '意义膨胀/抽象收束', re: /(意义深远|未来可期|前途无量|充满希望|命运的(齿轮|棋局|獠牙)|宿命|注定|这一刻终于明白|从这一刻(起|开始)|才刚刚开始|不知道的是|殊不知|多年以后|冥冥之中|仿佛预示着)/g, weight: 3 },
  { name: '万能收束(本系统实测)', re: /(他深知|消失在夜色|非同小可|必须全力以赴|为了[^。！？\n]{0,8}必须|他知道，总有一天|深吸一口气[^。！？\n]{0,10}转身离去|转身离去[^。！？\n]{0,10}消失在)/g, weight: 3 },
]

/** 元叙事 / 工程词泄漏（T1 实测：现有实现只覆盖部分） */
const META_TIER1 = /(细纲|情节点|卷纲|功能标签|目标情绪|字数目标|章首钩子|章尾钩子|节拍表|分场|写作要求)/g
const META_TIER2 = /(第[一二三四五六七八九十百千万两0-9]+章|本章|这一章|上一章|下一章|上章|下章|前一章|后一章|前文|后文|伏笔|读者|任务描述)/g
/** 写作指令泄漏（括号标注/箭头步骤/字数标注） */
const WRITING_INSTRUCTION = /([（(]\s*(小?钩子\s*\d*|钩子\s*\d|对话占比|金手指(升级)?|悬念停顿|场景转换|视觉化|细节密度|爽点(标准|节拍)?|埋线|潜台词|动作戏|情绪曲线|信息密度|此处|以下|下文)[^）)]{0,20}[）)]|（约?\d{3,5}\s*字）|共\s*\d{3,5}\s*字)/g
/** Markdown / 载体标记 */
const MARKDOWN_ANY = /(\*\*|^#{1,6}\s|^\s*[-*+]\s+\S|`{1,3}|\|\s*-{2,})/m
const DIVIDER_LINE = /(^|\n)[ \t]*(-{3,}|\*{3,}|_{3,}|={3,}|#{2,}|~{3,})[ \t]*(\n|$)/
/** 英文残留 / 英文 AI 腔 */
const ENGLISH_BLOCK = /[A-Za-z]{5,}/g
const ENGLISH_AI_PREAMBLE = /^\s*(Sure|Certainly|Here'?s|As an AI|I (?:cannot|can't|am unable|apologize))/im
/** 生成拒绝语 / 占位符 */
const REFUSAL_OR_PLACEHOLDER = /(我(无法|不能)(继续(写|创作|生成|下去)|生成|创作|续写|完成)|未完待续|TODO|占位符|placeholder|待补充|待定)/g
/** AI 自指 */
const AI_SELF = /(作为(一个)?(AI|人工智能|大?语言模型)|本(章|篇)内容由|^I am an AI)/m

/** 金手指人格化（T1 新增项：历史/现实题材零容忍） */
const GOLDEN_FINGER_PERSONA: Array<{ name: string; re: RegExp }> = [
  { name: '系统被写成会说话的人格', re: /(系统(说|道|笑|冷笑|冷哼|沉默|回答|提醒|宣布|满意|无奈|愤怒|催促|解释|表示)|系统(的)?(声音|提示音)在[^。！？\n]{0,10}(响起|回荡))/g },
  { name: '静音拟声词提示音', re: /([「“]?\s*(叮|铛|嘀)\s*[！!」”]?[^。！？\n]{0,12}(系统|提示|奖励|绑定|签到))/g },
  { name: '属性面板/任务面板/奖励面板', re: /(属性面板|任务面板|奖励面板|签到面板|商城面板|面板弹出|经验值\s*\+?\s*\d|等级提升至|已解锁新技能)/g },
  { name: '金手指拟人（老爷爷/器灵式对话）', re: /((金手指|外挂|器灵|老爷爷)[^。！？\n]{0,8}(说|道|笑|叹气|提醒|指引|开口))/g },
  { name: '系统文专用排版泄漏', re: /(【\s*(系统提示|任务奖励|恭喜宿主|宿主|声望|好感度|属性)\s*】)/g },
]

/** 章尾软钩/总结/预告（oh-story 章尾必须落在变化上） */
const HOOK_SOFT_TAIL = /(欲知后事|且听下回|下回分解|更大的危机|悄然降临|前路还很长|未来的路|他终于明白|这才明白|才明白|他知道[，,]\s*总有一天|从这一刻(起|开始)|新的篇章|崭新的一页|才刚刚开始)/

/** 开头景物/天气铺陈（开篇即入戏的反面） */
const SCENERY_OPENING = /^\s*(天空|天色|窗外|阳光|乌云|风|雨|雪|夜色|月色|清晨|傍晚|朝阳|夕阳|暮色|晨雾|远山|山峦|江面|海面)/

/* ------------------------------------------------------------------ */
/* 章尾钩子类型（oh-story 章尾 13 式的确定性近似）                     */
/* ------------------------------------------------------------------ */

const HOOK_TYPES: Array<{ type: string; re: RegExp }> = [
  { type: '紧急危机', re: /(只剩|来不及|必须|否则|倒计时|今夜|三天后|明日|即刻)/ },
  { type: '未完成动作', re: /(刚要|正要|刚迈|话音未落|猛地|忽然|就在这时|门外|身后|一只手)/ },
  { type: '突发揭示/新信息', re: /(竟|原来|竟然是|没想到|不料|偏偏|谁知)/ },
  { type: '神秘物品', re: /(手里|怀中|袖中|包里|信封|照片|残片|半张|一枚|一截)/ },
  { type: '两难抉择', re: /(要么|还是|只能|别无选择|两个选择)/ },
  { type: '承诺/威胁', re: /(等着|走着瞧|定要|必杀|饶不了|算账)/ },
  { type: '疑问留白', re: /[？?]/ },
  { type: '动作收束', re: /(转身|推门|抬头|低头|握紧|松开|站起|跪下|倒下|闭眼|拔出|挥|斩|踏|扑|吼|喝|点头|摇头|抬手|落刀|碎|断)/ },
]

export function hookTypeOf(tail: string): string {
  for (const h of HOOK_TYPES) {
    if (h.re.test(tail)) return h.type
  }
  return 'none'
}

/* ------------------------------------------------------------------ */
/* 单一出口聚合：S1-S4 → APPROVE / CONCERNS / REJECT                   */
/* ------------------------------------------------------------------ */

export function verdictOf(findings: QFinding[]): QVerdict {
  if (!findings.length) return 'APPROVE'
  if (findings.some((f) => f.severity === 'S1')) return 'REJECT'
  if (findings.some((f) => f.severity === 'S2')) return 'CONCERNS'
  return 'APPROVE'
}

/* ------------------------------------------------------------------ */
/* 主门禁                                                             */
/* ------------------------------------------------------------------ */

export interface QGateOptions {
  chapterNumber?: number
  genre?: string
  /** 用户设定目标字数（单一来源）；缺省走 DEFAULT_WORD_BAND */
  userTargetWords?: number
  /** 章节标题（用于标题泄漏检测） */
  chapterTitle?: string
  /** 前文 9-gram 哈希（跨章重复坍塌） */
  historyHashes?: Set<string>
  /** 上一章结尾原文（接缝重复） */
  prevEnding?: string
  /** 是否为历史/现实题材（金手指人格化按 S1 判） */
  strictGenre?: boolean
  /* ---------- 🔥 2026-10-25 T6 新增（G-08/G-09/G-10/G-14/G-18/G-04） ---------- */
  /** G-08：细纲/节拍表声明的「本章应改变类别」 */
  expectCategories?: StateCategory[]
  /** G-09 开关（默认 true） */
  sceneGate?: boolean
  /** G-10：已知设定专名（命中即不算新概念） */
  knownConcepts?: string[]
  /** G-10：新概念上限（默认 3） */
  maxNewConcepts?: number
  /** G-18：主角名（前 3 章 300 字内出场判定） */
  protagonistName?: string
  /** G-18：第 1 章主要角色名单（≤3 判定） */
  mainCast?: string[]
  /** G-04：上一章章尾钩子类型（相邻同型判定） */
  prevHookType?: string | null
  /** G-14：在场配角/机构名 */
  castNames?: string[]
  /** G-14：本卷已解锁手段清单（缺省则跳过底牌判定） */
  unlockedMeans?: string[]
  /** G-14：本章回收/新增期待条数（threads 台账给出） */
  resolvedThreadCount?: number
  newThreadCount?: number
}

export function runChapterQualityGate(text: string, opts: QGateOptions = {}): QGateResult {
  const raw = String(text || '').replace(/\r\n/g, '\n')
  const findings: QFinding[] = []
  const add = (rule: string, severity: QSeverity, category: QCategory, message: string, evidence: string, fix: string) => {
    findings.push({ rule, severity, category, message, evidence: clip(evidence), fix })
  }

  // 🔥 T9：字数口径唯一 = 去空白（含标点）字符数；chineseChars 仅作参考指标保留
  const wordUnits = countWordUnits(raw)
  const chineseChars = countChinese(raw)
  const paras = paragraphsOf(raw)
  const sents = sentencesOf(raw)
  const dialogueChars = countChinese((raw.match(/[“「][^”」\n]{1,400}[”」]/g) || []).join(''))
  const dialogueRatio = chineseChars ? +(dialogueChars / chineseChars).toFixed(3) : 0
  const maxParagraphChinese = paras.reduce((m, p) => Math.max(m, countChinese(p)), 0)
  const singleSentParas = paras.filter((p) => countChinese(p) > 0 && countChinese(p) <= 24).length
  const singleSentenceParagraphRatio = paras.length ? +(singleSentParas / paras.length).toFixed(3) : 0

  /* ---------- ① 字数带（双侧带，不再单侧强制） ---------- */
  const band = resolveWordBand(opts.userTargetWords)
  const deviation = wordUnits - band.target
  let bandStatus: 'in-band' | 'below' | 'above' = 'in-band'
  if (wordUnits < band.min) bandStatus = 'below'
  else if (wordUnits > band.max) bandStatus = 'above'
  if (bandStatus !== 'in-band') {
    add('word-band', 'S3', 'word-band',
      '字数出带：' + wordUnits + ' 字（' + WORD_UNIT_LABEL + '；目标 ' + band.target + '，区间 ' + band.min + '-' + band.max + '，偏差 ' + (deviation > 0 ? '+' : '') + deviation + '）',
      paras[0] || '', '不自动补写/不自动删减；按 oh-story 收口流程交作者选（收下 / 改目标 / 重写）')
  }

  /* ---------- ② AI 腔套话 ---------- */
  let clicheHits = 0
  for (const g of CLICHE_GROUPS) {
    const m = raw.match(new RegExp(g.re.source, 'g'))
    const n = m ? m.length : 0
    if (!n) continue
    clicheHits += n * g.weight
    const per1000 = +(n / Math.max(1, chineseChars) * 1000).toFixed(2)
    // 🔥 T15：权重 1 组（动作清单/弱化装饰/语境敏感词）按千字密度判级——原 1.2/千即 S3 使
    //   「了一下」在 43 章报警（「顿了一下/看了一眼」是本作声口，不是缺陷）。抬阈：2.5/千 → S3，4/千 → S2。
    // 🔥 T15：权重 1 组（动作清单/弱化装饰/语境敏感词）是**风格信号**（oh-story 亦列为信号而非禁词），
    //   封顶 S3，不驱动 CONCERNS；权重>=3 组（解释结论链/意义膨胀/万能收束）仍可升 S2。
    const sev: QSeverity = g.weight >= 3 ? (n >= 2 ? 'S2' : 'S3') : (per1000 >= 2.5 ? 'S3' : 'S4')
    add('cliche-' + g.name, sev, 'ai-cliche',
      g.name + ' 命中 ' + n + ' 处（' + per1000 + '/千汉字，权重 ' + g.weight + '）',
      (m && m[0]) || '', '按上下文定点改写；删得掉就删，删不掉改成动作/器物/台词')
  }

  /* ---------- ③ 元叙事 / 标题泄漏 / 写作指令 ---------- */
  const t1 = raw.match(META_TIER1)
  if (t1) add('meta-tier1', 'S2', 'meta', '工程词泄漏：' + uniq(t1).slice(0, 4).join('、'), t1[0], '删除该术语，改用剧情内的自然表达')
  const t2 = raw.match(META_TIER2)
  if (t2) add('meta-tier2', 'S2', 'meta', '元叙事词：' + uniq(t2).slice(0, 4).join('、'), t2[0], '改成角色能感知的事件锚点或相对时间')
  const wi = raw.match(WRITING_INSTRUCTION)
  if (wi) add('writing-instruction', 'S2', 'meta', '写作指令/字数标注泄漏：' + wi.length + ' 处', wi[0], '整段删除或改写为叙事')
  // 🔥 T15 修正：原规则「标题子串出现在正文任意位置即 S2」误报严重（ch31「八十一日」/ch59「移跸苍梧」
  //   都是正文内的正常叙述/对话，不是标题行泄漏）。改为只认**标题行式泄漏**：
  //   ① 独立成行 或 ② 位于章首前 2 段且该行长度 ≈ 标题长度（±4 字）——这才是"把标题写进正文"。
  if (opts.chapterTitle) {
    const t = String(opts.chapterTitle).replace(/^第[一二三四五六七八九十百千万两0-9]+章[：:·\s]*/, '').trim()
    if (t && t.length >= 2) {
      const lines = raw.split('\n')
      const standalone = lines.some((ln) => {
        const x = ln.trim()
        return x.length > 0 && x === t
      })
      const inHeadLines = lines.slice(0, 6).some((ln) => {
        const x = ln.trim().replace(/^[《「“]|[》」”]$/g, '')
        return x.length > 0 && x.length <= t.length + 4 && x.indexOf(t) >= 0
      })
      const head2Paras = paras.slice(0, 2).join('\n')
      const headingLike = head2Paras.indexOf(t) >= 0 && head2Paras.split('\n').some((ln) => {
        const x = ln.trim()
        return x.length > 0 && x.length <= t.length + 6 && x.replace(/^[《「“]|[》」”]$/g, '').indexOf(t) === 0
      })
      if (standalone || inHeadLines || headingLike) {
        add('title-leak', 'S2', 'meta', '章节标题泄漏进正文（标题行式）：' + t, t, '删除正文内的标题文字（标题由系统单独渲染）')
      }
    }
  }
  if (AI_SELF.test(raw)) add('ai-self', 'S1', 'meta', 'AI 自指泄漏', raw.slice(0, 60), '删除该句')
  const rp = raw.match(REFUSAL_OR_PLACEHOLDER)
  if (rp) add('refusal-placeholder', 'S1', 'meta', '生成拒绝语/占位符：' + uniq(rp).slice(0, 3).join('、'), rp[0], '重写受影响段落')

  /* ---------- ④ 截断 ---------- */
  const lastLine = [...String(raw).split('\n')].reverse().find((x) => x.trim().length > 0) || ''
  if (lastLine.trim() && TERMINAL.indexOf(lastLine.trim().slice(-1)) < 0) {
    add('truncation', 'S1', 'truncation', '正文末行未以句末标点收尾，疑似被截断', lastLine.slice(-40), '补全结尾句或补齐句末标点')
  }

  /* ---------- ⑤ 英文残留 ---------- */
  const en = raw.match(ENGLISH_BLOCK)
  if (en) {
    const uniqEn = uniq(en)
    const sev: QSeverity = uniqEn.length >= 3 || en.length >= 5 ? 'S2' : 'S3'
    add('english-residue', sev, 'english', '英文残留 ' + en.length + ' 处：' + uniqEn.slice(0, 4).join('、'), uniqEn[0] || '', '删除或译为中文（人名/术语按设定表统一）')
  }
  if (ENGLISH_AI_PREAMBLE.test(raw)) add('english-ai-tone', 'S1', 'english', '英文 AI 腔开头', raw.slice(0, 40), '删除该行')

  /* ---------- ⑤b 半角引号使用（T3 新稿实测；半角引号在中文正文里属格式问题） ---------- */
  {
    const hw = (raw.match(/"/g) || []).length + (raw.match(/'/g) || []).length
    if (hw >= 4) {
      add('halfwidth-quote', 'S3', 'format',
        '正文使用半角引号 ' + hw + ' 处（中文正文应统一为全角 “ ”）',
        (raw.match(/[^\n]{0,12}"[^\n]{0,12}/) || [''])[0],
        '统一替换为全角引号；引号必须成对')
    }
  }

  /* ---------- ⑥ 载体残留（T1 门禁盲区：*** / ### / ___ 等） ---------- */
  const dv = raw.match(DIVIDER_LINE)
  if (dv) add('carrier-divider', 'S2', 'carrier', '正文出现独立分隔行（载体标记）', (dv[0] || '').trim() || dv[0], '删除分隔行，场景转换用空行或文字过渡')
  if (MARKDOWN_ANY.test(raw)) add('markdown-marker', 'S2', 'carrier', 'Markdown 标记残留', (raw.match(MARKDOWN_ANY) || [''])[0], '删除标记')

  /* ---------- ⑦ 重复坍塌 ---------- */
  const lines = raw.split('\n')
  let adjacentDuplicateLines = 0
  for (let i = 1; i < lines.length; i++) {
    const a = stripQuotes(lines[i - 1]).trim()
    const b = stripQuotes(lines[i]).trim()
    if (a.length >= 8 && a === b) adjacentDuplicateLines++
  }
  if (adjacentDuplicateLines) {
    add('adjacent-duplicate-line', 'S2', 'repetition', '相邻整行重复 ' + adjacentDuplicateLines + ' 处（模型复读）', lines[0], '删除重复行，保留一次')
  }
  const sentCount = new Map<string, { n: number; sample: string }>()
  for (const s of sents) {
    const key = stripQuotes(s).replace(/[，,、；;：:—…\s]/g, '')
    if (countChinese(key) < 12) continue
    const cur = sentCount.get(key) || { n: 0, sample: s }
    cur.n++
    sentCount.set(key, cur)
  }
  let repeatedSentenceTop = 0
  for (const [, v] of sentCount) {
    if (v.n > repeatedSentenceTop) repeatedSentenceTop = v.n
    if (v.n >= 2) {
      add('sentence-repeat', 'S2', 'repetition', '同一长句重复 ' + v.n + ' 次', v.sample, '只保留一处，其余改写成不同的动作/台词')
    }
  }
  // 9-gram 坍塌率：最高频 9-gram 出现次数 / 全部 9-gram 数
  let ngramCollapseRatio = 0
  {
    const clean = raw.replace(/[^\u4e00-\u9fa5]/g, '')
    if (clean.length >= 200) {
      const cnt = new Map<string, number>()
      let total = 0
      for (let i = 0; i + 9 <= clean.length; i++) {
        const g = clean.slice(i, i + 9)
        cnt.set(g, (cnt.get(g) || 0) + 1)
        total++
      }
      let top = 0
      for (const [, n] of cnt) if (n > top) top = n
      ngramCollapseRatio = total ? +(top / total).toFixed(4) : 0
      // 🔥 T15 修正：原阈值 top>=4 或 占比>=1% 会把长篇连载里的正常复现（人物/器物/套语）判成"坍塌"。
      //   改为按「最高频片段次数 + 占比」双条件抬阈：>=8 次 或 占比>=2% 才提示(S4/S3)；
      //   >=15 次且占比>=3% 才升 S2（真正的自我复制退化）。
      const collapseHit = top >= 8 || ngramCollapseRatio >= 0.02
      if (collapseHit) {
        const sev: 'S2' | 'S3' | 'S4' = (top >= 15 && ngramCollapseRatio >= 0.03) ? 'S2' : (top >= 12 ? 'S3' : 'S4')
        add('ngram-collapse', sev, 'repetition',
          '重复坍塌提示：最高频 9 字片段出现 ' + top + ' 次（占比 ' + (ngramCollapseRatio * 100).toFixed(2) + '%）',
          '', '改写或删除重复片段，避免整段句式自我复制')
      }
    }
  }
  // 跨章重叠
  if (opts.historyHashes && opts.historyHashes.size > 0) {
    const clean = raw.replace(/[^\u4e00-\u9fa5]/g, '')
    let hit = 0
    const overlaps: string[] = []
    for (let i = 0; i + 9 <= clean.length; i++) {
      const g = clean.slice(i, i + 9)
      if (opts.historyHashes.has(g)) { hit++; if (overlaps.length < 3) overlaps.push(g) }
    }
    // 🔥 T18 白名单（编辑实读裁定）：已登记的「刻意回收」不计入跨章重叠——
    //   典型形态：前章埋下的物件（密信/手书）在后章当廷呈证时整段照搬原文，属连载伏笔回收而非抄写。
    //   本作登记条目：ch7 密信（盐课/铁课/献三城）→ ch45 当廷呈证逐字照搬。
    if (hit > 0 && OVERLAP_WHITELIST.length > 0) {
      let whitelistedGrams = 0
      let matched = false
      for (const wlText of OVERLAP_WHITELIST) {
        if (wlText.length < 9) continue
        for (let i = 0; i + wlText.length <= clean.length; i++) {
          if (clean.slice(i, i + wlText.length) === wlText) {
            matched = true
            whitelistedGrams += Math.max(1, wlText.length - 8)
            i += wlText.length - 1
          }
        }
      }
      if (matched) {
        // 9-gram 滑窗在长 L 的白名单串内命中 max(1, L-8) 个 gram（L>=9 时为 L-8）
        hit = Math.max(0, hit - whitelistedGrams)
        overlaps.length = 0
      }
    }
    // 🔥 T15 修正：长篇连载中的人物/器物/官制/固定语必然跨章复现，原阈值（>=6 即 S3、>=12 即 S2）
    //   把 18 章判成问题（编辑复核：仅 2 组属"勿误删"）。改为 >=24 片 且占比>=3% 才 S3（仅提示级），>=40 才 S2。
    const ratio = chineseChars ? hit / Math.max(1, chineseChars / 9) : 0
    if (hit >= 24 && ratio >= 0.03) {
      add('cross-chapter-overlap', hit >= 40 ? 'S2' : 'S3', 'repetition',
        '与已写章节重复（提示）：' + hit + ' 个 9 字片段命中前文（占比 ' + (ratio * 100).toFixed(2) + '%）', overlaps.join('、'),
        '仅当整句/整段照搬时才改写；人物、器物、官制、固定语的跨章复现属正常')
    }
  }
  if (opts.prevEnding) {
    const tailClean = String(opts.prevEnding).replace(/[^\u4e00-\u9fa5]/g, '')
    const head = raw.replace(/[^\u4e00-\u9fa5]/g, '').slice(0, 400)
    let seam = 0
    const seen = new Set<string>()
    for (let i = 0; i + 9 <= tailClean.length; i++) seen.add(tailClean.slice(i, i + 9))
    for (let i = 0; i + 9 <= head.length; i++) if (seen.has(head.slice(i, i + 9))) seam++
    if (seam >= 4) add('seam-replay', 'S2', 'repetition', '章首复述上一章结尾：' + seam + ' 个 9 字片段重叠', '', '章首直接切入新冲突，不复述上一章结尾')
  }

  /* ---------- ⑧ 金手指人格化 ---------- */
  const strictGenre = opts.strictGenre !== undefined
    ? opts.strictGenre
    : /历史|权谋|朝堂|现实|都市|民国|军事/.test(String(opts.genre || ''))
  for (const g of GOLDEN_FINGER_PERSONA) {
    const m = raw.match(new RegExp(g.re.source, 'g'))
    if (!m || !m.length) continue
    add('golden-finger-' + g.name, strictGenre ? 'S1' : 'S2', 'golden-finger',
      (strictGenre ? '本题材零容忍：' : '') + g.name + '，命中 ' + m.length + ' 处',
      m[0], '金手指不得人格化/不得出现系统面板排版；改为当时身份可感知的器物、文书、军报或人物反应')
  }

  /* ---------- ⑨ 章尾硬钩 ---------- */
  const tail = raw.slice(-220)
  const hookType = hookTypeOf(tail)
  if (HOOK_SOFT_TAIL.test(tail)) {
    add('hook-soft-close', 'S2', 'hook', '章尾总结/预告式软收束', tail.slice(-60), '删掉感悟/升华/预告，停在具体动作、台词或未解之事')
  } else if (hookType === 'none') {
    // 🔥 T15 修正：编辑第三轮独立结论为「章尾硬钩 56 章」⇒ 4 章缺钩与门禁一致，但编辑判其为「仅提示」级别、
    //   不阻塞签约。故降为 S3（建议看），保留定位价值而不把达标章打成 CONCERNS。
    add('hook-missing', 'S3', 'hook', '章尾无硬钩（无危机/决定/发现/反转/疑问）', tail.slice(-60), '按章尾 13 式选一类落在具体拍子上')
  }

  /* ---------- ⑩ 比喻密度 ---------- */
  const simileMatches = raw.match(/(仿佛|犹如|宛若|宛如|如同|像)/g)
  const simileCount = simileMatches ? simileMatches.length : 0
  const similePer1000 = +(simileCount / Math.max(1, chineseChars) * 1000).toFixed(2)
  if (similePer1000 >= 6) add('simile-density', 'S2', 'simile', '比喻密度 ' + similePer1000 + '/千汉字（≥6）', '', '只留最有叙事功能的少数比喻，其余改成动作、物件、声音或后果')
  else if (similePer1000 >= 4) add('simile-density', 'S3', 'simile', '比喻密度偏高 ' + similePer1000 + '/千汉字（建议 ≤2）', '', '同上')

  /* ---------- ⑪ 格式一致度 ---------- */
  if (maxParagraphChinese > 120) add('paragraph-too-long', 'S3', 'format', '超长段落 ' + maxParagraphChinese + ' 汉字（手机端 ≤120）', '', '按戏剧单元拆段')
  // 🔥 T15 修正：原规则「短段占比 >35%」在卷1 命中 60/60（占比 62-71%）——**毫无区分力**，
  //   且与平台要求的"短段落、手机友好"直接冲突（番茄风格本来就是短段为主）。
  //   换抽取源：只抓真正的"电报体/动作清单"形态——**连续 ≥5 段、每段 ≤16 汉字、且全段无对白与场景连接**。
  {
    let run = 0, worst = 0, worstAt = 0
    paras.forEach((p, i) => {
      const n = countChinese(p)
      const hasDialogue = /[“”「」]/.test(p)
      const isTerse = n > 0 && n <= 16 && !hasDialogue
      if (isTerse) { run++; if (run > worst) { worst = run; worstAt = i + 1 } }
      else run = 0
    })
    if (worst >= 5) {
      add('fragment-paragraphs', worst >= 8 ? 'S3' : 'S4', 'format',
        '疑似电报体：连续 ' + worst + ' 段均为 ≤16 汉字且无对白（止于第 ' + worstAt + ' 段）',
        '', '把这组短段合并为连贯叙述，或为其中几段补动作/器物细节；仅提示，不阻断')
    }
  }
  const subjRun = longestSameSubjectRun(paras)
  if (subjRun >= 3) add('subject-density', 'S4', 'format', '连续 ' + subjRun + ' 段以同一主语开头', '', '段首点名、段中代词/省略、关键转折再点名')

  /* ---------- ⑫ 开篇即入戏（前 3 段） ---------- */
  const head3 = paras.slice(0, 3).join('\n')
  if (head3 && SCENERY_OPENING.test((paras[0] || '').trim())) {
    add('scenery-opening', 'S2', 'hook', '开篇为景物/天气铺陈（非入戏）', (paras[0] || '').slice(0, 40), '前 3 行直接切入冲突/悬念/对话或紧迫决断；环境五感全章只点染一两处且绑定人物处境')
  }

  /* ---------- ⑬ 逻辑连贯（确定性可判定部分） ---------- */
  const timeline = detectTimelineConflicts(raw)
  if (timeline.length) add('logic-timeline', 'S2', 'logic', '时间线/纪年疑似冲突：' + timeline.slice(0, 3).join('；'), '', '统一纪年与时间锚点')
  const address = detectAddressConflicts(raw)
  if (address.length) add('logic-address', 'S2', 'logic', '称谓/自称疑似冲突：' + address.slice(0, 3).join('；'), '', '按身份×对象×场合统一自称与他称')

  /* ---------- ⑭ G-08 七类状态变化（oh-story「本章至少改变七类状态之一」） ---------- */
  let stateRes: StateDeltaResult | undefined
  try {
    stateRes = extractStateDeltas(raw, { expectCategories: opts.expectCategories })
    for (const f of stateDeltaFindings(raw, { expectCategories: opts.expectCategories })) {
      add(f.rule, f.severity, 'state', f.message, f.evidence, f.fix)
    }
  } catch (_e) { /* 不阻塞 */ }

  /* ---------- ⑮ G-09 场景三要素（目标→阻碍→变化） ---------- */
  let sceneRes: SceneGateResult | undefined
  try {
    if (opts.sceneGate !== false) {
      sceneRes = runSceneGate(raw)
      for (const f of sceneRes.findings) add(f.rule, f.severity, 'scene', f.message, f.evidence, f.fix)
    }
  } catch (_e) { /* 不阻塞 */ }

  /* ---------- ⑯ G-10 新概念上限 ---------- */
  let newConcepts: string[] | undefined
  try {
    for (const f of infoConceptFindings(raw, { knownConcepts: opts.knownConcepts, maxNewConcepts: opts.maxNewConcepts })) {
      add(f.rule, f.severity, 'info', f.message, f.evidence, f.fix)
    }
    // 明细（供报告）
    const m = raw.match(/《[^》]{2,12}》|「[^」]{2,10}」/g)
    newConcepts = m ? Array.from(new Set(m.map((x) => x.replace(/[《》「」]/g, '')))) : []
  } catch (_e) { /* 不阻塞 */ }

  /* ---------- ⑰ G-18 前 3 章 opening-gate ---------- */
  try {
    for (const f of openingGateFindings(raw, {
      chapterNumber: Number(opts.chapterNumber || 0),
      protagonistName: opts.protagonistName,
      mainCast: opts.mainCast,
    })) {
      add(f.rule, f.severity, 'opening', f.message, f.evidence, f.fix)
    }
  } catch (_e) { /* 不阻塞 */ }

  /* ---------- ⑱ G-04 相邻两章钩子同型 ---------- */
  try {
    for (const f of (hookDiversityFindings as unknown as (a: string, b?: string | null, c?: { chapterNumber?: number }) => GateFindingLike[])(
      hookType, opts.prevHookType || null, { chapterNumber: opts.chapterNumber })) {
      add(f.rule, f.severity, 'hook-diversity', f.message, f.evidence, f.fix)
    }
  } catch (_e) { /* 不阻塞 */ }

  /* ---------- ⑲ G-14 契约四问 ---------- */
  let contractRes: ContractGateResult | undefined
  try {
    contractRes = contractGateFindings(raw, {
      protagonistName: opts.protagonistName,
      castNames: opts.castNames,
      unlockedMeans: opts.unlockedMeans,
      resolvedThreadCount: opts.resolvedThreadCount,
      newThreadCount: opts.newThreadCount,
      chapterNumber: opts.chapterNumber,
    })
    for (const f of contractRes.findings) add(f.rule, f.severity, 'contract', f.message, f.evidence, f.fix)
  } catch (_e) { /* 不阻塞 */ }

  /* ---------- 五维评分 ---------- */
  const scores = scoreFiveDim({ findings, chineseChars, dialogueRatio, maxParagraphChinese, singleSentenceParagraphRatio, similePer1000, clicheHits, repeatedSentenceTop, ngramCollapseRatio, bandStatus })

  return {
    verdict: verdictOf(findings),
    findings,
    blocking: findings.filter((f) => f.severity === 'S1' || f.severity === 'S2').map((f) => f.rule + '：' + f.message),
    scores,
    metrics: {
      wordUnits, chineseChars, paragraphs: paras.length, sentences: sents.length,
      dialogueRatio, maxParagraphChinese, singleSentenceParagraphRatio,
      similePer1000, repeatedSentenceTop, adjacentDuplicateLines, ngramCollapseRatio,
      hookType, clicheHits,
      wordBand: { ...band, status: bandStatus, deviation },
    },
    engine: 'quality-gate@2026-10-25',
    state: stateRes,
    scenes: sceneRes,
    contract: contractRes,
    newConcepts,
  }
}

/* ------------------------------------------------------------------ */
/* 五维评分（oh-story long-chapter-quality.md 二、五维评分）            */
/* ------------------------------------------------------------------ */

function clamp100(n: number): number { return Math.max(0, Math.min(100, Math.round(n))) }

function scoreFiveDim(m: {
  findings: QFinding[]
  chineseChars: number
  dialogueRatio: number
  maxParagraphChinese: number
  singleSentenceParagraphRatio: number
  similePer1000: number
  clicheHits: number
  repeatedSentenceTop: number
  ngramCollapseRatio: number
  bandStatus: 'in-band' | 'below' | 'above'
}): FiveDim {
  const has = (cat: string) => m.findings.filter((f) => f.category === cat)
  // 原始扣分：S1 22 / S2 12 / S3 5 / S4 2
  const raw = (cat: string) => has(cat).reduce((a, f) => a + (f.severity === 'S1' ? 22 : f.severity === 'S2' ? 12 : f.severity === 'S3' ? 5 : 2), 0)
  const rule = (r: string) => m.findings.some((f) => f.rule === r)
  // 字数出带在五维里显式计分（oh-story：字数偏离属「格式一致度」维度，判 S3、交作者处置）
  const bandPenalty = m.bandStatus === 'in-band' ? 0 : (m.bandStatus === 'below' ? 8 : 6)

  // 维度1 核心一致度：跨章连续性 / 接缝复述 / 逻辑冲突
  const core_consistency = clamp100(
    100 - raw('continuity') * 1.6 - raw('logic') * 1.6 - (rule('seam-replay') ? 8 : 0) -
    // 🔥 T6：G-08 状态推进缺失 / G-14 契约四问未过 = 本章对主线的"改变"与"因果权"出问题
    raw('state') * 1.5 - raw('contract') * 1.6 - raw('scene') * 1.1
  )
  // 维度2 表达：AI 腔套话 + 比喻密度
  const expression = clamp100(
    100 - raw('ai-cliche') * 1.7 - raw('simile') * 1.4 - Math.min(25, m.clicheHits * 1.1) -
    raw('hook-diversity') * 0.8
  )
  // 维度3 格式一致度：段落/短段/主语节奏 + 载体残留 + 字数出带
  const format_consistency = clamp100(
    100 - raw('format') * 1.5 - raw('carrier') * 1.6 - bandPenalty * 0.6 -
    (m.maxParagraphChinese > 200 ? 8 : 0) - (m.singleSentenceParagraphRatio > 0.5 ? 6 : 0)
  )
  // 维度4 可读性：元叙事 + 章尾 + 复读 + 截断 + 英文 + 字数出带
  const readability = clamp100(
    100 - raw('meta') * 1.3 - raw('hook') * 1.2 - raw('repetition') * 1.1 -
    raw('truncation') * 1.5 - raw('english') * 1.5 - bandPenalty * 0.5 -
    (m.repeatedSentenceTop >= 3 ? 8 : 0) - (m.ngramCollapseRatio >= 0.02 ? 6 : 0) -
    // 🔥 T6：G-10 设定超载（信息传递）/ G-18 开篇未入戏
    raw('info') * 1.2 - raw('opening') * 1.2
  )
  // 维度5 逻辑连贯：设定/时间线/角色信息 + 金手指人格化（世界观规则破坏）
  const logic_coherence = clamp100(
    100 - raw('logic') * 1.6 - raw('golden-finger') * 2 - raw('truncation') * 1.5 -
    // 🔥 T6：G-14 底牌透支属于世界观规则边界问题
    raw('contract') * 1.2
  )

  const total = clamp100(
    core_consistency * 0.22 + expression * 0.2 + format_consistency * 0.15 +
    readability * 0.23 + logic_coherence * 0.2
  )
  return { core_consistency, expression, format_consistency, readability, logic_coherence, total }
}

function detectTimelineConflicts(text: string): string[] {
  const out: string[] = []
  const years = uniq(text.match(/(永历|弘光|崇祯|隆武|绍武|顺治|康熙)([元一二三四五六七八九十百千万两0-9]+)年/g) || [])
  if (years.length > 2) out.push('同章出现 ' + years.length + ' 个年号纪年：' + years.slice(0, 4).join('/'))
  if (/顺治|康熙/.test(text) && /永历|弘光|崇祯/.test(text)) {
    const both = /(永历|弘光|崇祯)[^。！？\n]{0,10}年/.test(text) && /(顺治|康熙)[^。！？\n]{0,10}年/.test(text)
    if (both) out.push('明/清两边纪年混用')
  }
  // 🔥 T15 修正：删除「陛下 + 章节前 200 字出现『王|世子』」这条**字面**子规则——
  //   它把「他处出现『王/世子』」与「有人自称陛下」当成同一件事，ch56 即被它误报。
  //   确定性可判定的只保留：纪年混用（下面保留）与「同章内主角自称陛下」需引号内说话人可确认时才成立
  //   （无说话人归属信息 ⇒ 不判，交 LLM 评审）。此处不做字面猜测。
  return out
}

function detectAddressConflicts(text: string): string[] {
  const out: string[] = []
  const quotes = text.match(/[“「][^”」\n]{1,120}[”」]/g) || []
  for (const q of quotes.slice(0, 200)) {
    if (/末将/.test(q) && /(殿下|大王|主公|陛下)/.test(q) === false && /本王|本世子|朕/.test(q)) {
      out.push('自称混用：' + q.slice(0, 24))
    }
    if (/万岁/.test(q) && !/(即位|登基|大典|朝贺)/.test(text)) {
      out.push('未即位出现「万岁」朝贺语境：' + q.slice(0, 24))
      break
    }
  }
  return out
}

function longestSameSubjectRun(paras: string[]): number {
  let best = 0, cur = 0, last = ''
  for (const p of paras) {
    const m = p.match(/^([\u4e00-\u9fa5]{2,3})(?=[，,。！？、\s]|他|她|说|道|看|走|站|坐|把|将|从|向)/)
    const s = m ? m[1] : ''
    if (s && s === last) cur++
    else { cur = s ? 1 : 0; last = s }
    if (cur > best) best = cur
  }
  return best
}

/* ------------------------------------------------------------------ */
/* 确定性清洗路径（检测 → 可判定的就地清掉；其余交给定点改写）          */
/* ------------------------------------------------------------------ */

export function cleanChapterText(text: string): QCLeanResult {
  const changes: string[] = []
  let out = String(text || '').replace(/\r\n/g, '\n')

  // ① 独立分隔行（--- *** ___ === ### ~~~）
  const dvCount = (out.match(/^[ \t]*(-{3,}|\*{3,}|_{3,}|={3,}|#{2,}|~{3,})[ \t]*$/gm) || []).length
  if (dvCount) {
    out = out.replace(/^[ \t]*(-{3,}|\*{3,}|_{3,}|={3,}|#{2,}|~{3,})[ \t]*$/gm, '')
    changes.push('删除载体分隔行×' + dvCount)
  }

  // ② Markdown 标题/列表/加粗/反引号/表格线
  const mdBefore = out.length
  out = out.replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*+]\s+(?=\S)/gm, '')
    .replace(/`{1,3}/g, '')
  if (out.length !== mdBefore) changes.push('剔除 Markdown 标记')

  // ③ 写作指令标注 / 字数标注（括号类，整段剔除）
  const wiCount = (out.match(WRITING_INSTRUCTION) || []).length
  if (wiCount) {
    out = out.replace(new RegExp(WRITING_INSTRUCTION.source, 'g'), '')
    changes.push('剔除写作指令/字数标注×' + wiCount)
  }

  // ④ 英文 AI 腔开头行
  const lines = out.split('\n')
  const headLine = lines.findIndex((x) => x.trim().length > 0)
  if (headLine >= 0 && ENGLISH_AI_PREAMBLE.test(lines[headLine])) {
    lines.splice(0, headLine + 1)
    out = lines.join('\n')
    changes.push('删除英文 AI 腔开头行')
  }

  // ⑤ 首行章节标题泄漏（第X章 XXX / 书名）
  const l2 = out.split('\n')
  const firstIdx = l2.findIndex((x) => x.trim().length > 0)
  if (firstIdx >= 0) {
    const f = l2[firstIdx].trim()
    if (/^第[一二三四五六七八九十百千万两0-9]+章/.test(f) || /^《[^》]{1,20}》/.test(f)) {
      l2.splice(firstIdx, 1)
      out = l2.join('\n')
      changes.push('删除首行章节标题/书名行')
    }
  }

  // ⑥ 相邻整行重复折叠
  {
    const arr = out.split('\n')
    const kept: string[] = []
    let folded = 0
    for (let i = 0; i < arr.length; i++) {
      const a = stripQuotes(arr[i]).trim()
      const prev = kept.length ? stripQuotes(kept[kept.length - 1]).trim() : ''
      if (a && a.length >= 8 && a === prev) { folded++; continue }
      kept.push(arr[i])
    }
    if (folded) { out = kept.join('\n'); changes.push('折叠相邻整行重复×' + folded) }
  }

  // ⑦ 纯英文残留行（整行都是英文且非人名标注）
  {
    const arr = out.split('\n')
    const before = arr.length
    const kept = arr.filter((x) => !/^[\sA-Za-z0-9.,'"!?;:\-()]+$/.test(x) || x.trim().length < 12)
    if (kept.length !== before) { out = kept.join('\n'); changes.push('删除纯英文残行×' + (before - kept.length)) }
  }

  // ⑧ 首尾空白与空行收敛
  out = out.replace(/\n{3,}/g, '\n\n').trim()

  return { text: out, changes }
}

/* ------------------------------------------------------------------ */
/* 小工具                                                             */
/* ------------------------------------------------------------------ */

function clip(s: string, n = 120): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)))
}

/** 供调用方判断是否必须打回重写 */
export function mustRewrite(result: QGateResult): boolean {
  return result.verdict === 'REJECT' || result.findings.some((f) => f.severity === 'S1')
}

/** 简洁摘要（日志/汇报用） */
export function summarizeQGate(result: QGateResult): string {
  return result.verdict + ' 五维(总' + result.scores.total + ') 汉字' + result.metrics.chineseChars +
    ' 出带=' + result.metrics.wordBand.status + ' 章尾=' + result.metrics.hookType +
    ' 阻塞=' + result.blocking.length + (result.blocking.length ? ' [' + result.blocking.slice(0, 4).join(' | ') + ']' : '')
}