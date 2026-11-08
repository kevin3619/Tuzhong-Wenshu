/**
 * 🔥 精写引擎 · 质检层（audit）
 *
 * 全部为「可执行闸门」：不依赖具体大模型的自觉，而是用确定性规则 + 进程内 AI 率检测
 * （复用 detection.ts 的 runAiDetection 8 维算法）给出可复现的合格/不合格判定，
 * 并把不合格原因转成可直接喂给模型的「定点修复指令」。
 */

import { runAiDetection } from '../detection'
import type { LLMConfig } from '../llm'
import {
  countChinese,
  countTotalChars,
  dialogueRatio,
  longestParagraphInfo,
  paragraphRhythm,
  splitParagraphs,
  splitSentences,
  findHalfWidthPunct,
  checkQuoteBalance,
  findRepeatedPhrases,
  crossChapterOverlaps,
  hasEndingHook,
  tailOf,
} from './text-utils'
import type { AuditResult, ChapterMetrics } from './types'
import {
  runDegenerationCheck,
  runPunctuationCheck,
  runBannedPhraseCheck,
  summarizeFindings,
} from '../oh-story/signing-gates'
import type { GateFinding, GateVerdict } from '../oh-story/signing-gates'

// ============================================================
// 词库
// ============================================================

/** 网文 AI 套话（真人极少这么写；命中即扣分并要求定点替换）
 *  weight=2 → 硬伤级 AI 味（几乎只在 AI 文里出现）；weight=1 → 高频词，能删则删 */
const CLICHES: { phrase: string; fix: string; weight: number }[] = [
  { phrase: '瞳孔骤缩', fix: '用具体动作替代（如「手里的茶盏顿了一下」）', weight: 2 },
  { phrase: '瞳孔一缩', fix: '同上，改写为具体生理/动作反应', weight: 2 },
  { phrase: '倒吸一口凉气', fix: '改写为「后背一凉」等个人化反应', weight: 2 },
  { phrase: '嘴角勾起一抹', fix: '改为具体表情或直接写台词', weight: 2 },
  { phrase: '嘴角微微上扬', fix: '删除，或写「他笑了笑，没接话」', weight: 2 },
  { phrase: '眼中闪过一丝', fix: '用行为与台词体现情绪', weight: 2 },
  { phrase: '眼底深处', fix: '删除，直接写可见的动作', weight: 2 },
  { phrase: '心中一惊', fix: '改为身体反应或口语心理词（「坏了」）', weight: 2 },
  { phrase: '心中暗想', fix: '直接写心理活动，不加提示语', weight: 2 },
  { phrase: '心中暗道', fix: '同上', weight: 2 },
  { phrase: '心头一紧', fix: '改为具体动作/感受', weight: 2 },
  { phrase: '如遭雷击', fix: '改写为具体反应', weight: 2 },
  { phrase: '浑身一震', fix: '改写为具体动作', weight: 2 },
  { phrase: '身躯一震', fix: '改写为具体动作', weight: 2 },
  { phrase: '脸色一变', fix: '写具体变化（「脸白了一下」）或动作', weight: 1 },
  { phrase: '脸色铁青', fix: '写具体细节（「下颌绷紧」）', weight: 1 },
  { phrase: '深吸一口气', fix: '删掉，直接写下一动作', weight: 1 },
  { phrase: '缓缓', fix: '去掉副词或换更有力的动词', weight: 1 },
  { phrase: '轻轻', fix: '去掉副词', weight: 1 },
  { phrase: '默默', fix: '去掉副词', weight: 1 },
  { phrase: '静静', fix: '去掉副词', weight: 1 },
  { phrase: '意味深长', fix: '写具体台词/动作让读者自己品', weight: 2 },
  { phrase: '若有所思', fix: '写具体动作', weight: 2 },
  { phrase: '不置可否', fix: '写具体回应', weight: 2 },
  { phrase: '复杂的神色', fix: '写具体表情细节', weight: 2 },
  { phrase: '一抹', fix: '换具体量词/描写', weight: 1 },
  { phrase: '一丝', fix: '多数情况可删', weight: 1 },
  { phrase: '不可置信', fix: '写具体反应（「他张了张嘴，没出声」）', weight: 1 },
  { phrase: '难以置信', fix: '同上', weight: 1 },
  { phrase: '目瞪口呆', fix: '写具体失态动作', weight: 1 },
  { phrase: '鸦雀无声', fix: '写具体细节（「谁都没敢先开口」）', weight: 1 },
  { phrase: '全场哗然', fix: '写两三个具体人物的反应', weight: 2 },
  { phrase: '一片哗然', fix: '同上', weight: 2 },
  { phrase: '一时间', fix: '删除或具体化时间', weight: 1 },
  { phrase: '仿佛', fix: '减少比喻密度（每千字≤2次）', weight: 1 },
  { phrase: '宛如', fix: '同上', weight: 1 },
  { phrase: '不禁', fix: '删除', weight: 1 },
  { phrase: '不由得', fix: '删除', weight: 1 },
  { phrase: '不由自主', fix: '删除', weight: 1 },
  { phrase: '目光如炬', fix: '写具体动作', weight: 2 },
  { phrase: '眼神深邃', fix: '删除', weight: 2 },
  { phrase: '空气仿佛凝固', fix: '写具体的人的反应', weight: 2 },
  { phrase: '空气凝固', fix: '同上', weight: 2 },
  { phrase: '气氛压抑', fix: '同上', weight: 1 },
  { phrase: '心里一沉', fix: '改为口语心理词', weight: 1 },
  { phrase: '一阵寒意', fix: '写具体体感', weight: 1 },
  { phrase: '后背发凉', fix: '每章最多 1 次', weight: 1 },
]

/** 元叙事/脚手架（出现即废稿） */
const SCAFFOLD_RULES: { re: RegExp; label: string }[] = [
  { re: /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫]/, label: '带圈数字步骤编号（① ② ③ …）' },
  { re: /(^|\n)\s*(铺垫|蓄力|爆发|震惊|收尾|围观|反转|高潮|冲突|结果|场景|开头|结尾)\s*[：:]/, label: '步骤标签（如「铺垫：」「爆发：」）' },
  { re: /（\s*(战斗|打斗|剧情|场景|冲突|转折|说明|旁白|以下|注|战斗过程|战斗结果|剧情转折点|新人物登场|场景切换|打斗描写)[^）]{0,12}）/, label: '圆括号场景/写作说明标签' },
  { re: /(^|\n)\s*【?\s*第[一二三四五六七八九十\d]+(段|步|部分)/, label: '「第X段/第X步」阶段标题' },
  { re: /(^|\n)\s*(正文|续写|上段|本段|全文|小结|总结|字数|质检|说明|注)\s*[：:]/, label: '元叙事小标题（正文/续写/…）' },
  { re: /以上(是|为)(正文|本章|章节)|以下是(正文|本章)/, label: '「以上是正文」类元叙事' },
  { re: /值得注意的是|综上所述|由此可见|不言而喻|毋庸置疑|众所周知|总而言之/, label: '议论文连接词（AI 模板）' },
  { re: /\*\*|^#{1,6}\s|^\s*[-*]\s+\S/m, label: 'Markdown 标记残留' },
  { re: /作为(一个)?AI|我是(一个)?(AI|人工智能)|本(章|篇)内容由/, label: 'AI 自述' },
  { re: /（约?\d{3,5}\s*字）|共\s*\d{3,5}\s*字/, label: '字数标注混入正文' },
  // 🔥 2026-10-18：用户截图实录的新泄漏形态（生成指令元数据漏进正文）
  { re: /[（(]\s*(小?钩子\s*\d*|钩子\s*\d|对话占比|金手指(升级)?|悬念停顿|悬念\s*[钩点]|场景转换|视觉化|细节密度|爽点(标准|节拍)?|埋线|潜台词|动作戏|强刺激|情绪曲线|节奏标?准|信息密度)[^）)]{0,20}[）)]/, label: '括号内写作指令标注（如「（小钩子2）」「（对话占比25%）」）' },
  { re: /每\s*(300|三百)\s*字[^。。\n]{0,24}(钩子|刺激|爽点)|段落\s*≤\s*\d+\s*行/, label: '写作要求复述（每300字1个钩子/段落≤3行）' },
  { re: /(^|\n)[^\n]{0,40}→[^\n]*[（(][^）)]{0,24}[）)]/, label: '箭头式大纲步骤句混入正文' },
]

/** 爽点判定：按句计，命中即算一个「爽点节拍」 */
const SHUANG_GROUPS: { name: string; re: RegExp }[] = [
  {
    name: '打脸',
    re: /打脸|脸(色)?(铁青|发白|都绿)|哑口无言|说不出(话|一个字)|愣在当场|呆住|目瞪口呆|讪讪|赔(笑|罪)|求饶|磕头|不敢再|后悔(得|莫及)|打碎了牙/,
  },
  {
    name: '碾压',
    re: /反手|一招|一击|击溃|斩杀|斩杀|秒(杀|掉)|碾压|轰飞|砸(飞|烂)|打得(他|对方|他们)|跪(下|地)|吐血|栽倒|暴退|惨叫|溃(败|散)|抱头|逃窜|连滚带爬/,
  },
  {
    name: '逆转',
    re: /(局势|局面|形势|风向)?(逆转|翻盘|反转|倒转)|峰回路转|想不到|谁也没想到|竟(然)?(是|能)|原来(是)?|早已(布|埋|准备)|螳螂捕蝉/,
  },
  {
    name: '收获',
    re: /到手|收入囊中|落入(他|我|自己)?(的)?手|机缘|宝物|粮草|银两|兵马|地(盘|方)|城池|人心|归附|投奔|获得|解锁|奖励|三成|翻(倍|番)/,
  },
  {
    name: '突破',
    re: /突破|晋升|进阶|境界|战力|更上一层|脱胎换骨|今非昔比|实力(大|暴)涨|登堂入室/,
  },
  {
    name: '震场',
    re: /全场(哗然|震动|皆惊)|一片哗然|鸦雀无声|落针可闻|面面相觑|骇然|惊呼(出声)?|失声|哗然|敬畏|服气|佩服|甘拜下风|心服口服/,
  },
]

// ============================================================
// 单章质检
// ============================================================

export interface AuditOptions {
  /** 目标字数（下限；口径：去空白含标点字符数，见 text-utils.countWordUnits） */
  targetWords: number
  /** 历史章 n-gram 哈希（跨章查重） */
  historyHashes?: Set<string>
  /** 已知人物名（用于自创角色抽查） */
  knownNames?: string[]
  /** 传入则叠加 LLM 增强判定（更准但更慢），否则纯算法 */
  llmConfig?: LLMConfig | null
  /** 章末必须有钩子（默认 true） */
  requireHook?: boolean
  /** 严格档：aiRate 阈值下调、爽点要求上调 */
  strict?: boolean
  /** 🔥 2026-10-19：主角名——用于「主角自称错误」检测（如主角对任何人自称「末将」） */
  protagonistName?: string
  /** 🔥 2026-10-19：作者在「平台AI检测配置」保存的 AI 率标准（如 1 = <1%）。传入则按作者标准做硬闸门 */
  maxAiRate?: number
  /**
   * 🔥 2026-10-31 番茄官方字数上限（去空白含标点字符数）。
   *   官方单章 2000-3000 字，超出判「机械扩写/重复堆砌」。
   *   不传则按 targetWords×1.25 兜底（引擎默认 2000 目标 → 2500 上限）。
   */
  maxWords?: number
  /**
   * 🔥 2026-10-31 番茄官方对话占比下限（0-1）。默认 0.25（官方「代入感不足」红线）。
   */
  minDialogueRatio?: number
  /**
   * 🔥 2026-10-31 番茄官方单段字数上限（汉字）。默认 60（手机屏 3-4 行硬约束，属「格式混乱」）。
   */
  maxParagraphChars?: number
}

/** 🔥 2026-10-19：主角自称错误检测（v2：按「引号前最近的人名=说话人」归属，杜绝误报）
 *  ——「末将/下官/奴婢」只用于己方下级在君上/上官面前自称；只有确认说话人=主角才算违规 */
export function detectProtagonistAddressIssues(text: string, protoName: string, knownNames?: string[]): string[] {
  if (!protoName) return []
  const names = [protoName].concat((knownNames || []).filter((n) => n && n !== protoName))
  const issues: string[] = []
  const tokens = ['末将', '下官', '奴婢']
  for (const tk of tokens) {
    let idx = text.indexOf(tk)
    let hits = 0
    while (idx >= 0 && hits < 3) {
      const before = text.slice(Math.max(0, idx - 80), idx)
      // ① 必须位于对话引号内：最近一个引号是开引号且之后无闭引号
      if (!/[“"][^”"]{0,14}$/.test(before)) { idx = text.indexOf(tk, idx + 1); continue }
      // ② 说话人归属：引号之前最近出现的已知人名（距离越近越可信）
      let speaker = ''
      let bestPos = -1
      for (const nm of names) {
        const pos = before.lastIndexOf(nm)
        if (pos > bestPos) { bestPos = pos; speaker = nm }
      }
      // ③ 句读守卫：引语若另起一句（最近的人名在句号/问号/叹号之前），说明说话人已换人
      const lastTerm = Math.max(before.lastIndexOf('。'), before.lastIndexOf('！'), before.lastIndexOf('？'), before.lastIndexOf('…'))
      const sameClause = bestPos > lastTerm
      // ④ 只有「最近的说话人=主角」且同一小句引入引语，才算主角说错话
      if (speaker === protoName && sameClause && before.length - bestPos <= 40) {
        const seg = text.slice(Math.max(0, idx - 24), idx + 16).replace(/\s+/g, ' ')
        issues.push('「' + tk + '」误作主角自称（…' + seg + '…）——主角对任何人都不该自称「' + tk + '」，改为符合身份的自称（如「本世子/本王/我」）')
        hits++
      }
      idx = text.indexOf(tk, idx + 1)
    }
  }
  return issues
}

export async function auditChapter(text: string, opts: AuditOptions): Promise<AuditResult> {
  const strict = opts.strict !== false
  const paragraphs = splitParagraphs(text)
  const sentences = splitSentences(text)
  const metrics: ChapterMetrics = {
    chineseChars: countChinese(text),
    totalChars: countTotalChars(text),
    paragraphCount: paragraphs.length,
    sentenceCount: sentences.length,
    avgSentenceChars: sentences.length ? Math.round(countTotalChars(text) / sentences.length) : 0,
    dialogueRatio: dialogueRatio(text),
    shuangCount: 0,
    shuangMarkers: [],
    hookTail: tailOf(text, 80),
  }

  // 爽点：按句去重计数
  const shuangHits: string[] = []
  const shuangGroups = new Set<string>()
  for (const s of sentences) {
    for (const g of SHUANG_GROUPS) {
      if (g.re.test(s)) {
        if (!shuangGroups.has(g.name)) shuangGroups.add(g.name)
        shuangHits.push(g.name)
        break
      }
    }
  }
  metrics.shuangCount = shuangHits.length
  metrics.shuangMarkers = Array.from(shuangGroups)

  // 套话（按权重计分：weight=2 为硬伤级 AI 味）
  const cliches: { phrase: string; count: number; weight: number }[] = []
  for (const c of CLICHES) {
    const count = (text.match(new RegExp(c.phrase, 'g')) || []).length
    if (count > 0) cliches.push({ phrase: c.phrase, count, weight: c.weight })
  }
  cliches.sort((a, b) => b.count * b.weight - a.count * a.weight)
  const clicheScore = cliches.reduce((a, b) => a + b.count * b.weight, 0)

  // 脚手架
  const scaffoldHits: string[] = []
  for (const rule of SCAFFOLD_RULES) {
    const m = text.match(rule.re)
    if (m) scaffoldHits.push(rule.label)
    if (scaffoldHits.length >= 8) break
  }

  // 标点
  const punctuationIssues: string[] = []
  punctuationIssues.push(...checkQuoteBalance(text))
  const half = findHalfWidthPunct(text)
  if (half.length >= 3) punctuationIssues.push('半角标点残留（如 ' + half.slice(0, 4).join(' ') + '）')
  // 🔥 半角直引号包裹对话（"殿下！"）——2026-10-18 用户截图实录
  const straightQuotes = (text.match(/"/g) || []).length
  if (straightQuotes >= 4) punctuationIssues.push('半角引号残留：正文出现 ' + straightQuotes + ' 个直引号 "…"（对话必须用中文引号“ ”）')
  const rhythm = paragraphRhythm(text)
  if (rhythm.count >= 6 && rhythm.stddev < 12) punctuationIssues.push('段落长度过于均匀（节奏机械，标准差 ' + rhythm.stddev + '）')

  // 复读 / 跨章重复
  const repeatedPhrases = findRepeatedPhrases(text, 12, 10, 3)
  const crossChapterOverlapsList = opts.historyHashes && opts.historyHashes.size > 0
    ? crossChapterOverlaps(text, opts.historyHashes, 8)
    : []

  // AI 率（算法；可选 LLM 增强）
  let aiRate = 50
  let aiScore = 5
  let aiIssues: string[] = []
  try {
    const det = await runAiDetection(text, opts.llmConfig || null)
    aiRate = Math.round(det.aiRate)
    aiScore = Math.round((100 - det.overallScore) / 10)
    aiIssues = (det.issues || []).slice(0, 6).map((i: any) => String(i && (i.description || i.detail || i.message || i.name) || ''))
      .filter(Boolean)
  } catch (_e) {
    // 检测失败不阻塞生成（按中性值处理，由其他闸门兜底）
    aiRate = 40
    aiScore = 4
  }

  // ---- 硬闸门 ----
  const fails: string[] = []
  // 🔥 T9：下限口径统一为「去空白（含标点）字符数」＝字带下限（target×0.9）
  // 🔥 2026-10-31：原判定误用 metrics.chineseChars（纯汉字），与全系统字数口径不一致 ——
  //   纯汉字口径比官方口径少 15-20%，导致同一稿在「字数下限」上出现相反结论。
  //   现统一用 metrics.totalChars（去空白含标点，与 countWordUnits 同源）。
  const minZh = Math.round(opts.targetWords * 0.9)
  if (metrics.totalChars < minZh) {
    fails.push('正文字数不足：仅 ' + metrics.totalChars + ' 字（去空白含标点；目标 ≥' + opts.targetWords + '，底线 ' + minZh + '）')
  }
  // 🔥 2026-10-31 番茄官方单章上限（去空白含标点字符数）：超出判「机械扩写/重复堆砌」
  const maxWu = Number(opts.maxWords || Math.round(opts.targetWords * 1.25))
  if (metrics.totalChars > maxWu) {
    fails.push('正文字数超限：' + metrics.totalChars + ' 字（去空白含标点；上限 ' + maxWu + '，超出部分判「机械扩写」）')
  }
  // 🔥 2026-10-31 番茄官方「格式混乱」红线：单段 ≤60 汉字（手机屏 3-4 行）
  const maxPara = Number(opts.maxParagraphChars || 60)
  const paraInfo = longestParagraphInfo(text, maxPara)
  if (paraInfo.max > maxPara) {
    fails.push('存在超长段落：最长 ' + paraInfo.max + ' 汉字（超 ' + maxPara + ' 字硬上限，共 ' + paraInfo.over + ' 段超限；官方判「格式混乱」）'
      + (paraInfo.samples.length ? '，例：' + paraInfo.samples.map((s) => '「' + s + '…」').join('、') : ''))
  }
  const minShuang = strict ? 3 : 2
  if (metrics.shuangCount < minShuang) {
    fails.push('爽点节拍不足：检测到 ' + metrics.shuangCount + ' 个（要求 ≥' + minShuang + '），且须覆盖不同类型（打脸/碾压/逆转/收获/突破/震场）')
  }
  if (shuangGroups.size < 2) {
    fails.push('爽点类型单一：只命中「' + (Array.from(shuangGroups).join('、') || '无') + '」，须至少两类叠加')
  }
  if (scaffoldHits.length > 0) {
    fails.push('混入元叙事/脚手架（' + scaffoldHits.join('；') + '）——必须是纯小说叙事')
  }
  const punctuationFatal = punctuationIssues.filter((p) => p.indexOf('不配对') >= 0 || p.indexOf('半角') >= 0)
  if (punctuationFatal.length > 0) {
    fails.push('标点问题（' + punctuationFatal.join('；') + '）')
  }
  // 🔥 主角自称错误（2026-10-19：主角对清将自称「末将」类硬伤直接判废；v2 按说话人归属防误报）
  const addrIssues = detectProtagonistAddressIssues(text, String(opts.protagonistName || ''), opts.knownNames)
  if (addrIssues.length > 0) {
    fails.push('主角自称错误：' + addrIssues.slice(0, 3).join('；'))
  }
  const clicheTotal = clicheScore
  if (clicheTotal >= (strict ? 14 : 20)) {
    fails.push('AI 套话堆砌：加权 ' + clicheTotal + ' 分（' + cliches.slice(0, 6).map((c) => c.phrase + '×' + c.count).join('、') + '）')
  }
  if (repeatedPhrases.length >= (strict ? 3 : 5)) {
    fails.push('章内复读：' + repeatedPhrases.slice(0, 4).map((p) => '「' + p + '」').join('、') + ' 反复出现')
  }
  if (crossChapterOverlapsList.length >= 4) {
    fails.push('与已写章节重复：' + crossChapterOverlapsList.slice(0, 4).map((p) => '「' + p + '」').join('、'))
  }
  if (aiRate >= (strict ? 45 : 55) && !(Number(opts.maxAiRate || 0) > 0)) {
    fails.push('AI 率偏高：' + aiRate + '%（阈值 ' + (strict ? 45 : 55) + '%）' + (aiIssues.length ? '；可疑点：' + aiIssues.slice(0, 3).join('；') : ''))
  }
  // 🔥 2026-10-19：作者平台标准优先——AI 率必须 ≤ 作者设定值（如 <1%），超一线即不通过并驱动去AI味修复
  const maxAiRate = Number(opts.maxAiRate || 0)
  if (maxAiRate > 0 && aiRate > maxAiRate) {
    fails.push('AI 率超标（作者设定 <' + maxAiRate + '%）：当前 ' + aiRate + '%，必须逐处去 AI 味' + (aiIssues.length ? '；可疑点：' + aiIssues.slice(0, 4).join('；') : ''))
  }
  if (opts.requireHook !== false && !hasEndingHook(text)) {
    fails.push('章末缺少断章钩子：结尾须留悬念/转折（疑问、突变、未解之事）')
  }
  // 🔥 2026-10-31 番茄官方「代入感不足」红线：对话占比 ≥25%
  //   原口径仅 6%（等于没有门槛）→ 219 章对话严重不足却全部放行。
  //   官方口径与 oh-story 历史题材样本校准值（对话约占 31%）一致，取 25% 作下限。
  const minDr = Number(opts.minDialogueRatio != null ? opts.minDialogueRatio : 25)
  if (metrics.dialogueRatio < minDr) {
    fails.push('对话占比过低（' + metrics.dialogueRatio + '% < ' + minDr + '%）：番茄官方判「代入感不足」；须把叙述性心理独白改写为人物对白')
  }
  // 🔥 2026-10-31：平均段长阈值从 320 收紧到 120。
  //   官方红线是「最长单段 ≤60 汉字」，上面已按最长段做硬闸门；
  //   此处保留均值维度作补充（均值 120 ≈ 平均每段 2-3 句，符合手机端阅读节奏）。
  if (rhythm.avg > 120) {
    fails.push('段落过长（平均 ' + rhythm.avg + ' 字/段 > 120）：须拆分成短段落，适配手机阅读')
  }

  // 🔥 2026-10-22：oh-story 签约级确定性门禁（截断/占位/乱码/工程词泄漏/标点致命）
  // 仅把「现有闸门未覆盖且 S2 及以上」的规则追加进 fails，banned-phrase 只记录不阻断，避免误杀导致无限重写。
  let signingFindings: GateFinding[] = []
  let signingVerdict: GateVerdict | undefined
  try {
    const degFindings = runDegenerationCheck(text)
    const punctFindings = runPunctuationCheck(text)
    const bannedFindings = runBannedPhraseCheck(text)
    signingFindings = [...degFindings, ...punctFindings, ...bannedFindings]
    signingVerdict = summarizeFindings(signingFindings).verdict

    const FATAL_RULES = new Set([
      'truncation',
      'placeholder',
      'garbled',
      'english-ai-tone',
      'meta-leak-tier1',
      'unpaired-quote',
      'unpaired-corner-quote',
      'repeated-punctuation',
    ])
    for (const f of signingFindings) {
      if (f.severity !== 'S1' && f.severity !== 'S2') continue
      if (!FATAL_RULES.has(f.rule)) continue
      const reason = '签约门禁：' + f.issue
      if (fails.some((x) => x.indexOf(f.issue) >= 0)) continue
      fails.push(reason + '｜原文「' + f.evidence + '」')
    }
  } catch (_e) {
    // 门禁异常不阻塞主流程
    signingFindings = []
  }

  return {
    metrics,
    cliches,
    scaffoldHits,
    punctuationIssues,
    repeatedPhrases,
    crossChapterOverlaps: crossChapterOverlapsList,
    aiRate,
    aiScore,
    aiIssues,
    signingFindings,
    signingVerdict,
    passed: fails.length === 0,
    fails,
  }
}

/** 把质检结论转成给模型的定点修复指令（只修不重写，尽量保字数与剧情） */
export function buildRepairInstruction(audit: AuditResult, targetWords: number, missingWords: number, maxAiRate?: number): string {
  const lines: string[] = []
  lines.push('【定点修复指令·在保留现有剧情与人物关系的前提下修改，禁止整章重写、禁止删减剧情】')
  const m = audit.metrics
  if (missingWords > 0) {
    lines.push('1) 字数补足：当前 ' + m.totalChars + ' 字（去空白含标点），需要补到 ' + targetWords + ' 字以上（还差约 ' + missingWords + ' 字）。补写方式：在不新增场景的前提下，把现有情节写细——补足动作过程、对话往来、环境细节、人物反应，禁止注水空话，禁止新增支线人物。')
  }
  // 🔥 2026-10-31 新增：超上限与超长段落修复指令（原先闸门无这两项，故无对应指令）
  const overWords = audit.fails.find((f) => f.indexOf('正文字数超限') >= 0)
  if (overWords) {
    lines.push('1b) 字数删减：' + overWords + '。删减方式：删掉重复复述、同一信息的二次描写、空转的心理独白与重复的环境铺陈，保留全部剧情节点、人物动作与对白。')
  }
  const overPara = audit.fails.find((f) => f.indexOf('存在超长段落') >= 0)
  if (overPara) {
    lines.push('1c) 拆段：' + overPara + '。在句号处断开（不要在句子中间硬切），把长段拆成 2-3 个短段；每段 1-3 句、20-60 汉字；对话单独成段；拆段不得改变任何字词与剧情顺序。')
  }
  const lowDr = audit.fails.find((f) => f.indexOf('对话占比过低') >= 0)
  if (lowDr) {
    lines.push('1d) 增加对话：' + lowDr + '。把叙述性的心理独白、背景交代、结论性陈述改写成人物之间的问答——让不同身份的人各说各的话（下属禀报用「殿下/大人」，主角用「我/本世子」），关键信息由对白承载。改写后不得增加新剧情、不得改变任何事实。')
  }
  if (m.shuangCount < 3) {
    lines.push('2) 爽点加码：把关键冲突写到位——挑衅方先嚣张到位，主角再反转出手（具体动作+一句硬台词），随后写围观者的具体反应（至少两个不同人物的不同反应），并让主角拿到实质收益（人/物/情报/地盘/名分）。')
  }
  if (audit.cliches.length > 0) {
    lines.push('3) 替换 AI 套话（逐处替换，不改剧情）：' + audit.cliches.slice(0, 10).map((c) => '「' + c.phrase + '」×' + c.count).join('、') + '。改成具体动作、具体物件、具体台词。')
  }
  if (audit.repeatedPhrases.length > 0) {
    lines.push('4) 消除复读：' + audit.repeatedPhrases.slice(0, 6).map((p) => '「' + p + '」').join('、') + ' 反复出现。把每一处重复只保留一次，其余改写成让剧情向前推进的不同动作/台词，绝对不允许同一句话或同一组问答连播。')
  }
  if (audit.crossChapterOverlaps.length > 0) {
    lines.push('5) 与前面章节撞句：' + audit.crossChapterOverlaps.slice(0, 5).map((p) => '「' + p + '」').join('、') + ' 在已写章节出现过。尤其是章开头：禁止复述上一章结尾的任何句子，开头直接从新的冲突/事件切入。')
  }
  if (audit.scaffoldHits.length > 0) {
    lines.push('6) 删除元叙事/脚手架内容：' + audit.scaffoldHits.join('；') + '（这些是写作方法标注，绝不能出现在正文里）。')
  }
  if (audit.punctuationIssues.length > 0) {
    lines.push('7) 标点修正：' + audit.punctuationIssues.join('；') + '（引号必须成对；中文句子里不得混入半角标点）。')
  }
  if (audit.metrics.dialogueRatio < 25 && !lowDr) {
    lines.push('8) 增加对话：把至少 3 处叙述改成人物一来一往的对话（口语短句，带身份口吻），对话中交代关键信息。')
  }
  if (!hasEndingHook(audit.metrics.hookTail)) {
    lines.push('9) 补断章钩子：章末最后两段必须留下未解悬念（谁在暗处、什么变故将至、哪句话没说完），不要收得太满。')
  }
  const addrFails = audit.fails.filter((f) => f.indexOf('误作主角自称') >= 0)
  if (addrFails.length > 0) {
    lines.push('10) 主角自称错误：' + addrFails.join('；') + '。这是绝对不能出现的身份错误——「末将」只能用于己方武将在自己的君上/上官面前自称；主角身为王世子/君主，对本方文武自称「本世子/本王/朕」（按时序），对敌方则用「我/本王」，语气不卑不亢。')
  }
  const judgeFails = audit.fails.filter((f) => f.indexOf('评审·') >= 0)
  if (judgeFails.length > 0) {
    lines.push('11) 对标白金责编评审问题（必须逐条改正，这是本次评审指出的硬伤）：' + judgeFails.map((f) => f.replace('评审·', '')).join('；'))
  }
  // 🔥 2026-10-19：降 AI 味专项指令——作者平台标准（如 <1%）不达标时逐处改写
  const aiFails = audit.fails.filter((f) => f.indexOf('AI 率') >= 0)
  if (aiFails.length > 0) {
    const parts: string[] = []
    if (audit.cliches.length > 0) parts.push('删除或具象化全部套话：' + audit.cliches.slice(0, 8).map((c) => '「' + c.phrase + '」×' + c.count).join('、'))
    if (audit.aiIssues.length > 0) parts.push('算法检测指出的问题：' + audit.aiIssues.slice(0, 4).join('；'))
    lines.push('12) 降 AI 味（硬性指标' + (maxAiRate ? '，作者平台标准 <' + maxAiRate + '%' : '') + '，当前 AI 率 ' + audit.aiRate + '%）：' + (parts.length ? parts.join('。') + '。' : '') +
      '逐处改写不改剧情：a) 打散整齐句式——句长长短交错（3~30 字波动），禁止连续四句长度接近；b) 换掉重复句首（同一词开头的句子全章不超过两次）；c) 对白口语化（可用「罢了/倒是/也罢/成不成」这类腔调），少用完整书面句；d) 删减「突然/顿时/缓缓/仿佛/终于/竟然」类副词，能删就删；e) 禁止议论式总结句与心理总结段（「他明白/他知道/他清楚/他发誓」），一律改写为动作、台词或具体细节；f) 不用「不仅…而且」「一方面…另一方面」这类书面连接词。')
  }
  lines.push('输出要求：直接输出修改后的【完整章节正文】（纯小说叙事，不要任何说明、不要标题、不要列表）。字数只增不减。')
  return lines.join('\n')
}
