// 途中文枢 · 白金爆款章节机器门禁（绍宋级）
// 目标：把「提示词标准」变成「不达标就打回」的可执行闸门。
// 说明：本模块只做检测与定位，不代写正文；接入 ai-generate route.ts 的 content 质量门使用。
// 口径（2026-10-26 T9 统一）：判据以「去空白（含标点）字符数」为主；本文件内的汉字计数仅作参考指标。
//
// 🔥 2026-10-31 对齐番茄官方《作品签约标准说明》+《加强低质内容治理公告》：
//   本文件原先是「白金爆款（绍宋级）」内部口径，比番茄官方宽松，导致 600 章 100% 未通过官方标准却自认合格。
//   三处错位已按官方口径收敛：
//     单段长度  120 → 60  （官方：手机屏 3-4 行，超长段落属「格式混乱」）
//     对话占比  15% → 25% （官方：「文字流畅、情绪代入感强」，低于 25% 判代入感不足）
//     单章字数  1500 → 2000，并新增 3000 上限（官方 2000-3000 字；过少判「空洞水文」，过多判「机械扩写」）
export const PLATINUM_CHAPTER_STANDARD = {
  minChineseChars: 2000,
  // 🔥 官方单章上限：超过即判「机械扩写/重复堆砌」（原先无上限，90 章超限无人拦）
  maxChineseChars: 3000,
  minShuangBeats: 4,
  maxFlatChineseChars: 600,
  minDialogueRatio: 0.25,
  // 长章篇幅下 4 次过低易误杀；放宽到 6，仍能逮住真正的语义软循环
  softLoopThreshold: 6,
  maxParagraphChineseChars: 60  // 字符数（含标点），非汉字数
}

export interface PlatinumGateResult {
  passed: boolean
  issues: string[]
  metrics: {
    chineseChars: number
    /** 🔥 官方字数口径：去空白（含标点）字符数 —— 字数上下限判定用此值 */
    wordUnits: number
    shuangBeats: number
    maxFlatChinese: number
    dialogueRatio: number
    softLoops: string[]
  }
}

function countChineseChars(s: string): number {
  if (!s) return 0
  var m = s.match(/[一-龥]/g)
  return m ? m.length : 0
}

/**
 * 🔥 官方字数口径：去空白（含标点）字符数。
 *   与 chapter-engine/text-utils.countWordUnits 同实现（该文件不引外部依赖，保持本模块自洽）。
 *   字数上下限必须用此口径判定——纯汉字口径会系统性低估约 15-20%，导致超限章节漏放。
 */
function countWordUnits(s: string): number {
  if (!s) return 0
  return String(s).replace(/\s/g, '').length
}

function chineseCharsUpTo(s: string, idx: number): number {
  return countChineseChars(s.slice(0, idx))
}

// 爽点/强刺激候选：按出现位置统计（不按「是否出现过」放水）
var SHUANG_PATTERNS = [
  // 不含「震惊」：CONTENT_PROMPT 明令禁「震惊全场」等套话，避免守规矩的稿子反被判爽点不足
  '打脸|反杀|逆袭|碾压|吊打|秒杀|臣服|折服|叹服|跪地|轰动|哗然|晋级|突破|觉醒|收获|机缘|得宝|击败|战胜|揭穿|暴露|身份|地位',
  '陡然|突然|猛地|忽然|却见|只见|下一秒|转眼|刹那间'
]

function collectShuangPositions(text: string): number[] {
  var out: number[] = []
  for (var i = 0; i < SHUANG_PATTERNS.length; i++) {
    var re = new RegExp(SHUANG_PATTERNS[i], 'g')
    var m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      out.push(chineseCharsUpTo(text, m.index))
      if (m.index === re.lastIndex) re.lastIndex++
    }
  }
  return out.sort(function (a, b) { return a - b })
}

function normalizeDialogueQuotes(text: string): string {
  if (!text) return ''
  var out = text.replace(/"([^"\n]{1,400})"/g, '“$1”')
  out = out.replace(/"/g, '')
  return out
}

function dialogueRatio(text: string): number {
  var cjk = countChineseChars(text)
  if (!cjk) return 0
  var norm = normalizeDialogueQuotes(text)
  var quoted = 0
  var res = [/“([^”\n]{1,300})”/g, /「([^」\n]{1,300})」/g, /"([^"\n]{1,300})"/g]
  for (var i = 0; i < res.length; i++) {
    var re = res[i]
    var m: RegExpExecArray | null
    while ((m = re.exec(norm)) !== null) {
      quoted += countChineseChars(m[1] || '')
      if (m.index === re.lastIndex) re.lastIndex++
    }
  }
  return quoted / cjk
}

// 语义级软循环/填充语：同义换词反复抒同一情绪的退化形态。
// ⚠️ 铁律：只收「实测退化填充语 + 模板神态」，严禁常用名词（人工策展，防假阳性灾难）。
var SOFT_FILLS = [
  // 只收实测退化填充语与模板神态；「不由得/不禁」属常用叙述词，移出以防假阳性灾难
  '这片土地', '心中暗自', '喉头发紧', '深吸一口气', '倒吸一口凉气',
  '空气仿佛', '时间仿佛', '命运的齿轮'
]

function softLoopHits(text: string): string[] {
  var hits: string[] = []
  for (var i = 0; i < SOFT_FILLS.length; i++) {
    var p = SOFT_FILLS[i]
    var n = 0
    var idx = 0
    while ((idx = text.indexOf(p, idx)) !== -1) {
      n++
      idx += p.length
    }
    if (n >= PLATINUM_CHAPTER_STANDARD.softLoopThreshold) hits.push(p + '×' + n)
  }
  return hits
}

/**
 * 🔥 2026-10-31 口径统一：单段长度按「字符数（含标点）」计，不按纯汉字数。
 *   番茄官方按字符/行数判手机屏可读性（3-4 行）；60 汉字的段落含标点约 70 字符。
 *   若用汉字口径，拆到 60 汉字的稿子仍会被官方判超限 —— 全链路必须统一为字符口径。
 */
function longestParagraphChars(text: string): number {
  var max = 0
  // 段落按连续换行切（\n\n 与 \n 均视为段界），避免整块被误判成一段
  var lines = text.split(/\n+/)
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i]
    var t = ln.trim()
    if (!t || t.charAt(0) === '#' || t.charAt(0) === '-' || t.charAt(0) === '*') continue
    var n = t.length
    if (n > max) max = n
  }
  return max
}

function endHookIssue(text: string): string | null {
  var tail = text.slice(-180)
  if (/欲知后事|且听|下回分解|更大的危机|悄然降临|前路还很长|未来的路|便是/.test(tail)) {
    return '章末软钩/元叙述：禁用套话收尾，必须停在具体动作或一句话硬钩'
  }
  var hasPunct = /[?？!！]/.test(tail)
  var hasAction = /转身|推门|抬头|低头|握紧|松开|站起|跪下|倒下|闭上眼|拔出|挥|斩|踏|扑|跪|吼|喝|点头|摇头|抬手|落刀|碎|断/.test(tail)
  if (!hasPunct && !hasAction) return '章末无硬钩：缺少具体动作/反常细节/悬念句'
  return null
}

var CONTAM_PATTERNS: Array<[string, RegExp]> = [
  ['元叙述/自评清单泄漏', /[\u2713\u2714]|AI检测率|爽点密度|伏笔回收率|命运将会如何/],
  ['游戏系统流污染', /系统的提示音|系统提示|任务奖励|属性加成|奖励面板|请选择是否|您希望故事走向|A[.、]\s*\S[\s\S]{0,60}B[.、]\s*\S[\s\S]{0,60}C[.、]/]
]

function contamHits(text: string): string[] {
  var out: string[] = []
  for (var i = 0; i < CONTAM_PATTERNS.length; i++) {
    if (CONTAM_PATTERNS[i][1].test(text)) out.push(CONTAM_PATTERNS[i][0])
  }
  return out
}

var SHUANG_ANY = new RegExp('(?:' + SHUANG_PATTERNS[0] + '|' + SHUANG_PATTERNS[1] + ')')

/**
 * 最长连续无刺激叙述块（累计汉字）。
 *
 * 2026-10-30 口径修正：旧口径是「相邻爽点关键词之间的汉字距离」，会把正常对话交锋整场判成平铺
 * （实测 ch2 对话行占比 43%、平均每段 21 字、无一段超 120 字，仍被判 677 字平铺；ch3 更被误判 1003 字），
 * 导致重试永远过不了闸，且越改越糟（模型被逼着堆关键词，反而破坏文气）。
 *
 * 新口径：逐段扫描，凡含「对话引号 / 疑问感叹 / 短促动作句(≤14汉字) / 爽点关键词」的段落视为刺激点并清零累计，
 * 其余纯叙述段累加，取全章最大值。既保留「禁止大段平铺」本意（连写数百字纯风景心理照样拦），又不再误杀对话戏。
 */
function maxFlatRun(text: string): number {
  var paras = text.split(/\n+/)
  var run = 0
  var max = 0
  for (var i = 0; i < paras.length; i++) {
    var p = paras[i]
    var n = countChineseChars(p)
    if (!n) continue
    var stim = n <= 14 || /[“”「」"]/.test(p) || /[?？!！]/.test(p) || SHUANG_ANY.test(p)
    if (stim) {
      if (run > max) max = run
      run = 0
    } else {
      run += n
    }
  }
  if (run > max) max = run
  return max
}

export function evaluateChapterStd(text: string): PlatinumGateResult {
  var issues: string[] = []
  var chineseChars = countChineseChars(text)
  var wordUnits = countWordUnits(text)
  var positions = collectShuangPositions(text)
  var beats = positions.length

  // 最大平铺段 = 最长连续无刺激叙述块累计汉字（口径见 maxFlatRun 注释）
  var maxFlat = maxFlatRun(text)

  // 🔥 2026-10-31 字数上下限：改用官方口径（去空白含标点字符数）。
  //   官方单章 2000-3000 字；少于下限判「空洞水文」，多于上限判「机械扩写/重复堆砌」。
  if (wordUnits < PLATINUM_CHAPTER_STANDARD.minChineseChars) {
    issues.push('正文字数' + wordUnits + ' < ' + PLATINUM_CHAPTER_STANDARD.minChineseChars + '（去空白含标点字符数；番茄单章下限，不足判「空洞水文」）')
  }
  if (wordUnits > PLATINUM_CHAPTER_STANDARD.maxChineseChars) {
    issues.push('正文字数' + wordUnits + ' > ' + PLATINUM_CHAPTER_STANDARD.maxChineseChars + '（去空白含标点字符数；番茄单章上限，超出判「机械扩写」）')
  }
  if (beats < PLATINUM_CHAPTER_STANDARD.minShuangBeats) {
    issues.push('爽点节拍不足：仅 ' + beats + ' 处，白金标准 ≥ ' + PLATINUM_CHAPTER_STANDARD.minShuangBeats + ' 处且分布均匀')
  }
  if (maxFlat > PLATINUM_CHAPTER_STANDARD.maxFlatChineseChars) {
    issues.push('存在 ' + maxFlat + ' 汉字无爽点/强刺激平铺段，白金标准 ≤ ' + PLATINUM_CHAPTER_STANDARD.maxFlatChineseChars)
  }

  var dr = dialogueRatio(text)
  if (dr < PLATINUM_CHAPTER_STANDARD.minDialogueRatio) {
    issues.push('对话占比过低：' + (dr * 100).toFixed(1) + '% < ' + (PLATINUM_CHAPTER_STANDARD.minDialogueRatio * 100).toFixed(0) + '%')
  }

  var soft = softLoopHits(text)
  if (soft.length) issues.push('语义软循环/填充语重复：' + soft.join('、'))
  var contam = contamHits(text)
  if (contam.length) issues.push('污染内容：' + contam.join('、'))

  var lp = longestParagraphChars(text)
  if (lp > PLATINUM_CHAPTER_STANDARD.maxParagraphChineseChars) {
    issues.push('存在超长段落：' + lp + ' 字符，手机端官方标准 ≤ ' + PLATINUM_CHAPTER_STANDARD.maxParagraphChineseChars)
  }

  var eh = endHookIssue(text)
  if (eh) issues.push(eh)

  if (/[A-Za-z]{5,}/.test(text)) issues.push('正文泄漏英文片段')

  return {
    passed: issues.length === 0,
    issues: issues,
    metrics: {
      chineseChars: chineseChars,
      wordUnits: wordUnits,
      shuangBeats: beats,
      maxFlatChinese: maxFlat,
      dialogueRatio: dr,
      softLoops: soft
    }
  }
}
