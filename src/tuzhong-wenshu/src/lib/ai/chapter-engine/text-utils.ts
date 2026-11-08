/**
 * 🔥 精写引擎 · 文本工具层
 *
 * 全部为确定性纯函数（不调大模型），是「可执行质量闸门」的地基：
 *   - 汉字/标点口径统一（与 platinum-gate 的 minChineseChars 同口径）
 *   - 标点归一（半角→全角、引号配对、省略号、去 markdown 残留）
 *   - 段落/句子切分、对话占比、结尾钩子判定
 *   - 重叠拼接（避免续写处出现「前文末尾原样复读」）
 *   - 12 字复读检测、9-gram 哈希（跨章查重）
 */

// ============================================================
// 计数与基础
// ============================================================

export function countChinese(s: string): number {
  if (!s) return 0
  const m = s.match(/[\u4e00-\u9fa5]/g)
  return m ? m.length : 0
}

export function countTotalChars(s: string): number {
  if (!s) return 0
  return s.replace(/\s/g, '').length
}

/**
 * 🔥 2026-10-26 T9：全系统**唯一**字数口径 =「去空白（含标点）字符数」。
 *   与 countTotalChars 同实现（保留旧名兼容）；**新代码一律用本名**，
 *   避免再出现"纯汉字 / 含标点总长"双口径（T1/T7 已实测该不一致导致同批正文判定相反）。
 *   依据：UI 目标字数滑块按 2000、中文网文平台字数含标点、契约 Verify 与 T3 写作口径。
 */
export function countWordUnits(s: string): number {
  return countTotalChars(s)
}

/** 口径的人类可读标签（提示词/报告统一引用，禁止再写其它说法） */
export const WORD_UNIT_LABEL = '去空白（含标点）字符数'

export function escapeRegex(s: string): string {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 稳定哈希（djb2 → base36），用于 n-gram / 台账 key */
export function hashString(s: string): string {
  let h = 5381
  const str = String(s || '')
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

// ============================================================
// 标点与格式归一
// ============================================================

const CJK = '\\u4e00-\\u9fa5\\u3000-\\u303f\\uff00-\\uffef'

/** 半角 → 全角（只处理夹在中文之间的标点，避免破坏数字/英文） */
export function normalizePunctuation(input: string): string {
  let s = String(input || '')
  if (!s) return s
  s = s.replace(/^\uFEFF/, '')

  // markdown / 脚手架残留
  s = s.replace(/\*\*([^*]*)\*\*/g, '$1')
  s = s.replace(/^#{1,6}\s*/gm, '')
  s = s.replace(/^>\s?/gm, '')
  s = s.replace(/`{1,3}/g, '')
  s = s.replace(/<ret>|<\/ret>|<end>|<br\s*\/?>/gi, '\n')
  s = s.replace(/（本章完）|\(本章完\)|【本章完】/g, '')

  // 省略号规范化：... / 。。。 → ……
  s = s.replace(/\.{3,}/g, '……')
  s = s.replace(/。{3,}/g, '……')
  s = s.replace(/…{3,}/g, '……')

  // 半角标点 → 全角（仅在两侧含中文时替换，保护 1.5% 、3:1 等）
  const zhNear = new RegExp('([' + CJK + '])[,]([^0-9])', 'g')
  s = s.replace(zhNear, '$1，$2')
  s = s.replace(new RegExp('([' + CJK + '])\\.(?![0-9' + CJK + ']*[0-9])', 'g'), '$1。')
  s = s.replace(new RegExp('([' + CJK + '])!', 'g'), '$1！')
  s = s.replace(new RegExp('([' + CJK + '])\\?', 'g'), '$1？')
  s = s.replace(new RegExp('([' + CJK + '])[,，]?\\s*([，、。！？；：])', 'g'), '$1$2')
  s = s.replace(new RegExp('([，。！？；：、])[，]', 'g'), '$1')
  s = s.replace(new RegExp('([，。！？；：]){2,}', 'g'), (m) => (m.indexOf('…') >= 0 ? '……' : m[0]))
  s = s.replace(/，{2,}/g, '，')
  s = s.replace(/([。！？；])，/g, '$1')
  s = s.replace(new RegExp('([' + CJK + '])~', 'g'), '$1。')

  // 引号配对：ASCII 双引号 → 中文弯引号（按奇偶配对）
  s = normalizeAsciiQuotes(s)

  // 🔥 2026-10-22 直角引号归一：模型（尤其 ⑤d 改写）爱用「」/『』，
  //   与正文原有的“” 混排会被终稿闸门判「引号不配对」（实测 ch31：「×36 / 」×32），
  //   同时导致 ⑤d 改写稿与原文匹配失败（indexOf 定位不到）→ 改写整轮跳过、疑似卡 6.4%。
  s = s.replace(/『/g, '“').replace(/』/g, '”').replace(/「/g, '“').replace(/」/g, '”')

  // 全角空格 / 行内多余空格
  s = s.replace(/\u3000/g, '')
  s = s.replace(new RegExp('([' + CJK + '])[ \\t]+([' + CJK + '])', 'g'), '$1$2')
  s = s.replace(/[ \t]+\n/g, '\n')
  s = s.replace(/[ \t]{2,}/g, ' ')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/** 把 ASCII 双引号成对换成“ ”（未配对的直接丢弃为“） */
export function normalizeAsciiQuotes(s: string): string {
  let out = ''
  let open = true
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"') {
      out += open ? '“' : '”'
      open = !open
    } else if (ch === '\u201c') {
      open = false
      out += ch
    } else if (ch === '\u201d') {
      open = true
      out += ch
    } else {
      out += ch
    }
  }
  // 单引号同理（成对）
  out = out.replace(/'([^'\n]{1,40})'/g, '‘$1’')
  return out
}

/** 未配对引号检查（返回问题描述数组） */
export function checkQuoteBalance(text: string): string[] {
  const issues: string[] = []
  const left = (text.match(/“/g) || []).length
  const right = (text.match(/”/g) || []).length
  if (left !== right) issues.push('引号“”不配对（“×' + left + ' / ”×' + right + '）')
  const l2 = (text.match(/「/g) || []).length
  const r2 = (text.match(/」/g) || []).length
  if (l2 !== r2) issues.push('引号「」不配对（「×' + l2 + ' / 」×' + r2 + '）')
  const l3 = (text.match(/『/g) || []).length
  const r3 = (text.match(/』/g) || []).length
  if (l3 !== r3) issues.push('引号『』不配对（『×' + l3 + ' / 』×' + r3 + '）')
  return issues
}

/** 半角标点残留（正文夹在中文中的 , . ! ? ; :） */
export function findHalfWidthPunct(text: string): string[] {
  const hits: string[] = []
  const re = new RegExp('[' + '\\u4e00-\\u9fa5' + '][,.!?;:]', 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    hits.push(m[0])
    if (hits.length >= 12) break
  }
  return hits
}

// ============================================================
// 段落 / 句子
// ============================================================

export function splitParagraphs(text: string): string[] {
  if (!text) return []
  return String(text)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

export function splitSentences(text: string): string[] {
  if (!text) return []
  const parts: string[] = []
  let buf = ''
  for (const ch of String(text)) {
    buf += ch
    if ('。！？…；!?'.indexOf(ch) >= 0) {
      parts.push(buf)
      buf = ''
    }
    if (ch === '\n') {
      if (buf.trim()) parts.push(buf)
      buf = ''
    }
  }
  if (buf.trim()) parts.push(buf)
  return parts.map((s) => s.trim()).filter(Boolean)
}

export function tailOf(text: string, n: number): string {
  if (!text) return ''
  const s = String(text)
  return s.length <= n ? s : s.slice(s.length - n)
}

export function headOf(text: string, n: number): string {
  if (!text) return ''
  const s = String(text)
  return s.length <= n ? s : s.slice(0, n)
}

/** 对话字数占比：引号内字符 / 总字符 */
export function dialogueRatio(text: string): number {
  if (!text) return 0
  // 🔥 2026-10-31 口径修正：**只算引号内的文字**，不把引号本身计入。
  //   旧实现用 match 取整段（含两侧引号）后 join，长度偏大约 15%，
  //   导致同一稿在「对话占比 ≥25%」闸门上出现相反结论（25.9% vs 21.3%）。
  //   三种引号都计入（兼容用「…」或半角 "…" 的章节）。
  let quoted = 0
  const pats = [/“([^”\n]*)”/g, /「([^」\n]*)」/g, /"([^"\n]*)"/g]
  for (const re of pats) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      quoted += countTotalChars(m[1] || '')
      if (m.index === re.lastIndex) re.lastIndex++
    }
  }
  const total = countTotalChars(text)
  if (!total) return 0
  return Math.round((quoted / total) * 1000) / 10
}

/** 段落节奏：段长标准差过小 → 机械等长（AI 特征） */
export function paragraphRhythm(text: string): { avg: number; stddev: number; count: number } {
  const paras = splitParagraphs(text)
  if (!paras.length) return { avg: 0, stddev: 0, count: 0 }
  const lens = paras.map((p) => countTotalChars(p))
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length
  const variance = lens.reduce((a, b) => a + (b - avg) * (b - avg), 0) / lens.length
  return { avg: Math.round(avg), stddev: Math.round(Math.sqrt(variance)), count: paras.length }
}

/**
 * 🔥 2026-10-31 番茄官方「格式混乱」红线：最长单段汉字数。
 *   官方要求单段 ≤60 字符（手机屏 3-4 行，含标点）。
 *   口径：按连续换行切段（\n+ 均为段界），段内汉字数取最大。
 *   返回 { max, over: 超限段数, samples: 前若干条超限段首 30 字 }，供闸门定位与修复指令引用。
 */
export function longestParagraphInfo(text: string, limit = 60): { max: number; over: number; samples: string[] } {
  const paras = splitParagraphs(text)
  let max = 0
  let over = 0
  const samples: string[] = []
  for (const p of paras) {
    // 🔥 2026-10-31 口径统一：按**字符数（含标点）**计，与番茄官方一致（官方按字符/行数判）。
    //   跳过列表项与标题行（它们不是正文段落，体检器 max_para_len 同样跳过）。
    const t = p.trim()
    if (!t || t.charAt(0) === '#' || t.charAt(0) === '-' || t.charAt(0) === '*') continue
    const n = t.length
    if (n > max) max = n
    if (n > limit) {
      over++
      if (samples.length < 3) samples.push(t.slice(0, 30))
    }
  }
  return { max, over, samples }
}

/** 结尾钩子判定：最后一段是否留有悬念/转折 */
export function hasEndingHook(text: string): boolean {
  const paras = splitParagraphs(text)
  if (!paras.length) return false
  const tail = paras.slice(-2).join('')
  const tailShort = tailOf(tail, 120)
  // 去掉句末收尾引号后再判定（“你到底是谁？” 这类以引号结尾的悬念问句）
  const probe = tailShort.trim().replace(/[”」』’"'）】]+$/, '')
  if (/[？?]$/.test(probe)) return true
  if (/……\s*$/.test(probe)) return true
  if (/！$/.test(probe) && /谁|哪|怎|何|为何|难道|竟然|居然/.test(probe)) return true
  // 🔥 2026-10-22 扩充钩子标记：净化层会删「突然/忽然/骤然/竟然」等副词，
  //   结尾若只剩「却见/只见/不料/岂料/尚未/脚步声/黑影」这类不删词也算留了悬念。
  return /却不知|殊不知|浑然不觉|还没有人知道|没有人注意到|却没想到|话音未落|就在这时|突然|忽然|骤然|冷不防|与此同时|下一刻|门外|远处|身后|却见|只见|不料|岂料|哪知|谁知|尚未|未及|脚步声|门轴|吱呀|撞开|扑来|黑影|人影|背后|却听|忽听|只听|听得/.test(tailShort)
}

// ============================================================
// 重叠拼接（场景装配）
// ============================================================

/** 找到 a 的尾部与 b 的头部最长重叠（≥minLen 字），返回 {a 保留长度, b 切掉长度, 重叠文本} */
export function findOverlap(a: string, b: string, minLen = 8, maxLen = 120): { keepA: number; cutB: number; overlap: string } {
  const limit = Math.min(maxLen, a.length, b.length)
  for (let len = limit; len >= minLen; len--) {
    const aTail = a.slice(a.length - len)
    if (b.startsWith(aTail)) return { keepA: a.length - len, cutB: len, overlap: aTail }
  }
  // 允许 b 头部有少量空白/引号差异
  const bTrim = b.replace(/^[\s“”"']+/, '')
  const cut0 = b.length - bTrim.length
  for (let len = Math.min(maxLen, a.length, bTrim.length); len >= minLen; len--) {
    const aTail = a.slice(a.length - len)
    if (bTrim.startsWith(aTail)) return { keepA: a.length - len, cutB: cut0 + len, overlap: aTail }
  }
  return { keepA: a.length, cutB: 0, overlap: '' }
}

/** 把新场景文本接到已有正文后面（自动处理复读重叠、段落空行） */
export function overlapJoin(base: string, next: string): string {
  if (!base) return next.trim()
  if (!next) return base
  let n = next.trim()
  // 去掉常见的“接上文”类衔接语
  n = n.replace(/^（?接上文）?[：:，,]?\s*/, '').replace(/^续[:：]?\s*/, '')

  // ① 句子级去重：新段开头若与 base 末尾句子相同（最多 3 句），整句丢弃
  try {
    const baseSents = splitSentences(base)
    const nextSents = splitSentences(n)
    let drop = 0
    while (drop < 3 && drop < nextSents.length && baseSents.length - 1 - drop >= 0) {
      const a = (baseSents[baseSents.length - 1 - drop] || '').replace(/[“”\s。！？…；，]/g, '')
      const b = (nextSents[drop] || '').replace(/[“”\s。！？…；，]/g, '')
      if (a && a === b) drop++
      else break
    }
    if (drop > 0) n = nextSents.slice(drop).join('').trim()
  } catch (_e) { /* 去重失败不影响主流程 */ }

  // ② 字符级重叠去重（短衔接也可命中：下限 6 字）
  const { cutB } = findOverlap(base, n, 6, 160)
  if (cutB > 0) n = n.slice(cutB)
  // 去掉新段开头重复的标点
  n = n.replace(/^[，。、；：！？…]+/, '')
  if (!n) return base
  return base.replace(/\s+$/, '') + '\n\n' + n.trim()
}

// ============================================================
// 复读与查重
// ============================================================

/** 章内复读：重复出现的 ≥minLen 字短语（按滑动窗口取最长有效重复）；minCount=至少重复几次才算 */
export function findRepeatedPhrases(text: string, minLen = 12, limit = 12, minCount = 2): string[] {
  const clean = String(text || '').replace(/\s/g, '')
  if (clean.length < minLen * 2) return []
  const seen = new Map<string, number>()
  // 步长固定 1：章内复读必须"抓得住"（3000-4000 字的 Map 开销可忽略）
  for (let i = 0; i + minLen <= clean.length; i++) {
    const g = clean.slice(i, i + minLen)
    if (/^[，。、；：！？…“”]+$/.test(g)) continue
    seen.set(g, (seen.get(g) || 0) + 1)
  }
  const out: { phrase: string; count: number }[] = []
  for (const [phrase, count] of seen) {
    if (count >= minCount) out.push({ phrase, count })
  }
  out.sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length)
  // 去掉互为子串的冗余项
  const picked: string[] = []
  for (const item of out) {
    if (picked.some((p) => p.indexOf(item.phrase) >= 0)) continue
    picked.push(item.phrase)
    if (picked.length >= limit) break
  }
  return picked
}

/** 9-gram 哈希（去标点后滑窗，抽样上限 maxGrams） */
export function ngramHashes(text: string, n = 9, maxGrams = 1200): string[] {
  const clean = String(text || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
  if (clean.length < n) return []
  const total = clean.length - n + 1
  const stride = Math.max(1, Math.ceil(total / maxGrams))
  const set = new Set<string>()
  for (let i = 0; i < total; i += stride) {
    set.add(hashString(clean.slice(i, i + n)))
  }
  return Array.from(set)
}

/** 当前章与历史章的 n-gram 交集 → 命中的具体短语（用于报告/修复指令） */
export function crossChapterOverlaps(text: string, historyHashes: Set<string>, limit = 8): string[] {
  const clean = String(text || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
  const n = 9
  if (clean.length < n) return []
  const hits: string[] = []
  let lastEnd = -999
  for (let i = 0; i + n <= clean.length; i++) {
    const gram = clean.slice(i, i + n)
    if (historyHashes.has(hashString(gram))) {
      if (i < lastEnd + 3) continue
      hits.push(gram)
      lastEnd = i + n
      if (hits.length >= limit) break
    }
  }
  return hits
}

/** 疑似姓名（正文里凭空出现的具名角色，用于「自创角色」抽查） */
export function suspiciousNewNames(text: string, knownNames: string[], limit = 10): string[] {
  const known = new Set((knownNames || []).filter(Boolean))
  const out: string[] = []
  const seen = new Set<string>()
  const re = /(?:^|[，。！？；：、“”\s])([\u4e00-\u9fa5]{2,3})(?:道|说|问|喊|笑|答|骂|喝|叹|低声|沉声|冷声)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)
    if (known.has(name)) continue
    if (/^(老人|众人|少年|青年|少女|小厮|护卫|亲兵|士兵|士卒|军士|先生|先生们|大人|陛下|将军|公子|姑娘|夫人|大人|这小子|那小子|这小子|对方|他们|我们|你们)$/.test(name)) continue
    out.push(name)
    if (out.length >= limit) break
  }
  return out
}

export function clampText(text: string, maxChinese: number): string {
  if (countChinese(text) <= maxChinese) return text
  const paras = splitParagraphs(text)
  let acc = ''
  let count = 0
  for (const p of paras) {
    const c = countChinese(p)
    if (count + c > maxChinese + 120) break
    acc += (acc ? '\n\n' : '') + p
    count += c
  }
  return acc || text
}
