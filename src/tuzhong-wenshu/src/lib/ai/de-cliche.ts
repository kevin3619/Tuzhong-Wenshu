/**
 * 确定性去套话净化层（De-Cliche）
 * ============================================================
 * 目标：让引擎产出的正文在「自建朱雀口径」下逐项达标。
 *
 * 为什么要有这一层（全部来自实测数据）：
 *   · 第③维「词汇分布」= 100 − divGap×200 − AI套话×7 − AI副词×2.5 − 段首滥用×4
 *     实测引擎稿：套话命中 5 处(−35)、副词命中 15 处(−38)、段首滥用 ≥5 处(−20) → 直接归零
 *   · 第②维「语义连贯」= 100 − 强连接词×6 − 顺序连接词×2.2 − 连接词密度超额×2
 *     实测引擎稿连接词密集（然后/接着/此时/突然…）
 *   · 段落级判定里：心理直述词、清单式短句、无对白无器物段都会推高疑似度
 *
 * 本层做三件事（纯规则、零模型调用、可复现）：
 *   ① 去掉/替换 AI 套话与 AI 副词（词表与判定器同源，杜绝自欺）
 *   ② 去掉议论文式连接词
 *   ③ 段首去重：同一「首句前4字」出现 ≥3 次时，把重复段并入上一段（消除段首滥用）
 *
 * 原则：只做「同义替换 / 删除冗余修饰」这类不改语义的手术，不动情节、对话信息与事实。
 */

import { AI_MARKERS, AI_ADVERBS, SUMMARY_WORDS, CONNECTIVES_STRONG, CONNECTIVES_SEQ, CONCRETE } from './zhuque-proxy'

/** 固定短语替换（高置信度，语义不变） */
const PHRASE_RULES: Array<[string, string]> = [
  // 心理/神态套话 → 动作化
  ['眼中闪过一丝', '眼里有'],
  ['眼底深处', '眼底'],
  ['嘴角勾起一抹', '嘴角挑起'],
  ['嘴角微微上扬', '嘴角动了动'],
  ['瞳孔骤缩', '眼睛一缩'],
  ['倒吸一口凉气', '倒吸一口气'],
  ['心中一惊', '心里一怔'],
  ['心头一紧', '心口一紧'],
  ['如遭雷击', '像挨了一记闷棍'],
  ['浑身一震', '身子一僵'],
  ['脸色一变', '脸色沉下来'],
  ['深吸一口气', '吸了口气'],
  ['意味深长', '话里有话'],
  ['若有所思', '没接话'],
  ['不置可否', '没表态'],
  ['鸦雀无声', '没人吭声'],
  ['全场哗然', '满座都乱了'],
  ['一片哗然', '众人哗然'],
  ['难以置信', '不敢信'],
  ['不可置信', '谁也没想到'],
  ['目瞪口呆', '张着嘴'],
  ['目光如炬', '盯着'],
  ['眼神深邃', '眼神沉'],
  ['气氛压抑', '谁也没说话'],
  ['心里一沉', '心口一沉'],
  ['一阵寒意', '后背发凉'],
  ['后背发凉', '脖子一凉'],
  ['气氛凝滞', '屋里静了'],
  ['复杂的神色', '说不清的神色'],
  // 议论文连接 → 自然口语
  ['不禁', '忍不住'],
  ['不由得', '忍不住'],
  ['不由自主', '忍不住'],
  ['仿佛', '像'],
  ['宛如', '像'],
  ['随着', ''],
  ['不仅如此', '更糟的是'],
  ['毋庸置疑', '没跑'],
  ['毫无疑问', '准没错'],
  ['不言而喻', '明摆着'],
  ['甚是', '很'],
  ['颇为', '挺'],
  ['尤为', '尤其'],
  ['实则', '其实'],
  ['亦是', '也是'],
  ['确是', '的确'],
  ['大有', '很'],
  ['极其', '很'],
  // 议论文残留（判据 AI_MARKERS 里剩下的几个高频项，历史文里同样会冒出来）
  ['值得一提的', ''],
  ['值得一提', ''],
  ['在当今', ''],
  ['的不断发展', ''],
  ['的重要组成部分', ''],
  ['关键的作用', ''],
  ['深远的影响', ''],
  ['广泛应用', ''],
  ['发挥着', ''],
  ['扮演着', ''],
  ['至关重要', '要命'],
  ['不可或缺', '少不得'],
  ['深入骨髓', '入骨'],
  // 时代错位物（补写阶段最容易冒出来）
  ['雪茄', '烟草'],
  ['咖啡', '茶'],
  ['辣椒', '花椒'],
]

/** 纯删除类（冗余修饰/副词，删掉更干净） */
const DELETE_WORDS: string[] = [
  '缓缓', '轻轻', '默默', '静静', '微微', '淡淡', '深深', '骤然', '陡然', '霎时',
  '顿时', '随即', '立刻', '猛然', '暗暗', '悄悄', '纷纷', '连连', '一一', '阵阵',
  '声声', '历历', '赫然', '依然', '依旧', '竟然', '居然', '显然', '分明', '径直',
  '径自', '兀自', '一丝', '一抹', '随着', '此外', '而且', '并且', '不仅', '甚至',
  '因此', '于是', '事实上', '总之', '也就是说', '换句话说', '可以说', '不得不说',
  '值得注意的是', '显而易见', '与此同时', '总的来说', '无疑', '的确如此',
  '理所当然', '另外', '然后', '接着', '随后', '接下来', '同时', '此时', '这时',
  '而后', '之后', '片刻后', '不多时', '忽然', '突然',
]

/** 心理直述词：仅在复合套话里处理，裸用不动（删了会伤句意） */
const SUMMARY_COMPOUND: Array<[string, string]> = [
  ['这意味着', '这等于'],
  ['原来如此', '原来'],
  ['说到底', '归根到底'],
  ['也就是说，', '换句话说，'],
]

/**
 * 敌称口径（2026-11-01 修正）：
 *   对满清方面沿用史实常规称谓——「清军 / 清兵 / 清将 / 清廷 / 满清 / 八旗」。
 *   🔴 严禁再改写成「北兵 / 北军 / 北将 / 北虏 / 北朝 / 北骑」这类生造代称（旧的强制替换已废除）。
 *   本表只保留两件事：口语侮辱词拉回中性称谓、身体发式词改中性说法。
 */
const ENEMY_TERMS: Array<[string, string]> = [
  ['鞑子', '清兵'],
  ['鞑虏', '清军'],
  ['满奴', '清兵'],
  ['辫子', '发辫'],
]

/**
 * 段落形态兜底：模型退化时会写成"一行一句"的动作清单（每行带句号、段落极短）。
 * 规则：连续的非对白短段（≤26 汉字）合并成一段（上限 90 汉字）；对白段（以引号开头）原样保留。
 * 说明：不改变文字，只改排版，让"意象堆叠"回到正常的小说分段。
 */
export function mergeShortProseParagraphs(text: string, maxShort = 26, capLen = 90): { text: string; merged: number } {
  const paras = String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean)
  const out: string[] = []
  let buf = ''
  let merged = 0
  const flush = () => { if (buf) out.push(buf); buf = '' }
  const isDialogue = (p: string) => /^[“"「]/.test(p)
  const zh = (p: string) => (p.match(/[\u4e00-\u9fa5]/g) || []).length
  for (const p of paras) {
    if (isDialogue(p)) { flush(); out.push(p); continue }
    if (zh(p) > maxShort) { flush(); out.push(p); continue }
    if (!buf) { buf = p; continue }
    if (zh(buf) + zh(p) <= capLen) { buf += p; merged++ } else { flush(); buf = p }
  }
  flush()
  return { text: out.join('\n'), merged }
}

/**
 * 分行碎片回流：模型常把一段话拆成好几行（行尾没有标点）。
 * 直接判废会让整章塌到 1300 字，而路由在 <1500 字时会回退旧单次生成（那才是真废稿：陛下/朕/清军/复读段）。
 * 规则：行尾无句末标点时补逗号并入同一段；已有完整句则按长度/引号另起段。
 */
export function reflowFragmentedLines(text: string): { text: string; joined: number } {
  const src = String(text || '')
  const lines = src.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  if (lines.length < 3) return { text: src, joined: 0 }
  const badLines = lines.filter((l) => !/[。！？!?…"”'’）)」』】]$/.test(l))
  if (badLines.length / lines.length < 0.3) return { text: src, joined: 0 }
  const out: string[] = []
  let buf = ''
  let joined = 0
  const flush = () => {
    if (buf.trim()) out.push(buf.trim())
    buf = ''
  }
  for (const l of lines) {
    if (!buf) { buf = l; continue }
    if (/[。！？!?…"”]$/.test(buf)) {
      if (/^[“"「]/.test(l) || buf.length > 90) { flush(); buf = l } else { buf += l }
    } else {
      buf += (/[，、；：,;:]$/.test(buf) ? '' : '，') + l
      joined++
    }
  }
  flush()
  const text2 = out.join('\n')
  return { text: text2, joined }
}

/** 元信息/提示词回声：必须从正文里剔除（模型把"已用开头清单"抄进了正文） */
const META_LINE_RE = /^\s*[【\[]/ 
const META_ANY_RE = /本章已|已用过的句子开头|已说过的台词|写作说明|创作说明|以下是|请注意|输出规则|禁写清单/
const META_PAREN_RE = /（\s*[^）]{0,60}?(悬念停笔|停笔|本章|未完待续|写作说明|创作说明|注：|说明：)[^）]{0,80}）/g

/**
 * AI 填充句清除（整句级）
 * 实测判据明细里被判「疑似AI」的段落，几乎都是这几类收尾填充：
 *   "他知道，这一夜，只是开始。" / "而这场博弈，才刚刚开始。" / "一场博弈正在展开。"
 *   "在朱由榔的带领下，南明一定能够中兴。" / "一定要保住南明江山，让大明中兴！"
 * 这些句子不承载情节，是大模型的"总结收尾癖"。人工编辑的做法就是删掉。
 */
const AI_FILLER_SENTENCES: RegExp[] = [
  /[，,]?\s*这一夜[，,]只是开始[。！？]?/g,
  /[，,]?\s*而这场博弈[，,]才刚刚开始[。！？]?/g,
  /[，,]?\s*这场博弈[，,]才刚刚开始[。！？]?/g,
  /[，,]?\s*而这一切[，,]才刚刚开始[。！？]?/g,
  /[，,]?\s*新的博弈[，,]才刚刚开始[。！？]?/g,
  /[，,]?\s*故事才刚刚开始[。！？]?/g,
  /[，,]?\s*一场(?:新的|惊天的)?博弈(?:正在|悄然)?(?:展开|拉开)[。！？]?/g,
  /[，,]?\s*在[^。！？]{0,20}的带领下[，,][^。！？]{0,30}[。！？]/g,
  /[，,]?\s*一定(?:要|得)[^。！？]{0,24}(?:中兴|江山|社稷|天下)[^。！？]{0,10}[。！？]?/g,
  /[，,]?\s*而这场棋局[，,]才刚刚开始[。！？]?/g,
  /[，,]?\s*棋局已定[，,]胜负将分[。！？]?/g,
]

/** 心理直述删除（改为动作/对白承载） */
const PSYCH_DIRECT: Array<[RegExp, string]> = [
  [/(?:他|她|众人|所有人)知道[，,]/g, ''],
  [/(?:他|她)(?:心里|心中)(?:都)?(?:清楚|明白)[，,]/g, ''],
  [/心中发誓[，,]/g, ''],
  [/心中(?:充满了?|满是)[^。！？]{0,14}[。！？]?/g, ''],
  [/眼中(?:充满了?|满是)[^。！？]{0,14}[。！？]?/g, ''],
  [/眼底(?:闪过|掠过)[^。！？]{0,10}[，,]/g, ''],
  [/心中佩服[。！？]?/g, ''],
  [/心中一阵苦涩/g, '嘴里发苦'],
  [/心中(?:却)?是翻江倒海/g, '胸口发闷'],
  [/心中(?:充满|涌上)(?:了)?(?:一阵)?(?:不安|恐惧|惊慌|疑虑|疑惑|骇然)/g, '后背发凉'],
  [/心里(?:充满|涌上)(?:了)?(?:一阵)?(?:不安|恐惧|惊慌|疑虑|疑惑|骇然)/g, '后背发凉'],
  [/他知道[，,]/g, ''],
]

/**
 * 第二轮规则（实测判据明细里反复出现的"总结/口号/心理直述"）
 * 这些是大模型最爱写的"段落收尾总结"，人工编辑一律删或改成动作。
 */
const PSYCH_DIRECT2: Array<[RegExp, string]> = [
  [/(?:他|她|众人|所有人|百姓)(?:都)?深知[，,][^。！？]{0,40}[。！？]?/g, ''],
  [/(?:他们|她们|众人|百姓)(?:都)?相信[，,][^。！？]{0,40}[。！？]?/g, ''],
  [/(?:他|她)(?:将|必将|势必)[^。！？]{0,12}肩负[^。！？]{0,24}[。！？]?/g, ''],
  [/[，,]?\s*(?:更)?关乎[^。！？]{0,26}(?:未来|命运|安危|存亡)[^。！？]{0,8}[。！？]?/g, ''],
  [/心中(?:却)?(?:是)?(?:波澜起伏|波涛汹涌|起伏不定)/g, '胸口发闷'],
  [/内心(?:波澜起伏|波涛汹涌|起伏不定)/g, '胸口发闷'],
  [/心中忍不住生出不安/g, '后背发凉'],
  [/心中稍安/g, '松了口气'],
  [/面面相觑/g, '互相看了一眼'],
  [/眼底一瞥/g, '眼神一冷'],
  [/(?:他|她)(?:担心|害怕|后悔|犹豫)[，,][^。！？]{0,30}[。！？]?/g, ''],
  [/(?:这|那)(?:一场|一场场)?(?:战斗|大战|交锋)[，,][^。！？]{0,20}[。！？]?/g, ''],
  [/一场(?:惊天的)?(?:较量|对决|交锋)[，,]?/g, ''],
  [/注定[^。！？]{0,20}[。！？]?/g, ''],
  [/[，,]?\s*将决定[^。！？]{0,24}[。！？]?/g, ''],
  [/从此以后[，,]?/g, ''],
  [/往后余生[，,]?/g, ''],
  // 收尾套话/空比喻（实测反复出现）
  [/(?:身影|背影)在[^。！？]{0,12}显得格外(?:高大|挺拔|孤寂|萧索)[。！？]?/g, ''],
  [/更大的(?:风暴|危机|考验|风浪|博弈)[^。！？]{0,20}[。！？]?/g, ''],
  [/(?:但|而)(?:他|她)(?:已经|早已)做好了准备[。！？]?/g, ''],
  [/心中(?:却)?(?:是)?(?:波澜不惊|平静如水)/g, '脸上没动'],
  [/如同一头(?:猛虎|野兽|猎豹)[，,]?(?:所向披靡|锐不可当)?[。！？]?/g, ''],
  [/所向披靡[。！？]?/g, ''],
  [/刀光剑影(?:中)?[，,]?/g, ''],
  [/奋勇杀敌/g, '往前压'],
  [/杀声震天[，,]?/g, ''],
  [/战鼓声、喊杀声交织在一起[，,]?/g, ''],
]


function cleanArtifacts(text: string): string {
  return text
    .replace(/，，+/g, '，')
    .replace(/。。+/g, '。')
    .replace(/，([。！？])/g, '$1')
    .replace(/([。！？])\s*，/g, '$1')
    .replace(/^[，、]+/gm, '')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/（\s*）/g, '（ ）')
    // 🔥 2026-10-22 模型自我字数标注漏进正文（实测"（98）（87）"），一律剔除
    .replace(/[（(]\s*\d{1,4}\s*[）)]/g, '')
    .replace(/[【\[]\s*\d{1,4}\s*[】\]]/g, '')
    // 🔥 2026-10-22 编辑批注/舞台提示漏进正文（实测"（注：此处无标点）""（王忠赐鞋底带泥）"）
    .replace(/[（(][^）)]{0,60}(?:注[:：]|此处|说明[:：]|剧情|标点|新增|本章|读者|镜头|场景|停顿|伏笔|钩子|爽点|字数|作者)[^）)]{0,60}[）)]/g, '')
    // 纯舞台提示式短括号（2-14 字、不含对白引号）：小说正文不出现括注
    .replace(/[（(][^）)”"「」]{2,14}[）)]/g, '')
}

/**
 * 近似句去重：同一句被模型"改几个字"反复写（实测：朱由榔站在城楼之上…×3、转身走向城楼…×3）
 * 判定：归一化后完全相同，或两句话共享 ≥50% 的 8 字片段（取较短句为分母）。
 * 保护：只处理 ≥10 字的句子；删除总量不超过全文 15%；对白句若含独有信息也按同规则处理（重复即冗余）。
 */
export function dedupeNearSentences(text: string, maxRatio = 0.15): { text: string; removed: number } {
  const paras = String(text || '').split('\n')
  const seen: Array<{ norm: string; grams: Set<string> }> = []
  const totalSents = Math.max(1, (text.match(/[。！？!?]/g) || []).length)
  const removeCap = Math.max(2, Math.round(totalSents * maxRatio))
  let removed = 0
  const outParas: string[] = []
  for (const para of paras) {
    const sents = para.split(/(?<=[。！？!?])/)
    const keep: string[] = []
    for (const s of sents) {
      const t = s.trim()
      const norm = t.replace(/[^\u4e00-\u9fa5]/g, '')
      if (norm.length < 10 || removed >= removeCap) { keep.push(s); continue }
      const grams = new Set<string>()
      for (let i = 0; i + 8 <= norm.length; i++) grams.add(norm.slice(i, i + 8))
      let dup = false
      for (const v of seen) {
        if (v.norm === norm) { dup = true; break }
        if (!grams.size || !v.grams.size) continue
        const small = Math.min(grams.size, v.grams.size)
        let hit = 0
        for (const g of grams) if (v.grams.has(g)) hit++
        if (small > 0 && hit / small >= 0.5) { dup = true; break }
      }
      if (dup) { removed++; continue }
      seen.push({ norm, grams })
      keep.push(s)
    }
    outParas.push(keep.join(''))
  }
  return { text: outParas.join('\n'), removed }
}

/**
 * 引号配对校正：净化删除句子后常留下落单的 “ 或 ”（实测 “×48 / ”×49）。
 * 策略：多余的 ” 直接丢弃；未闭合的 “ 在段末补 ”。
 */
export function balanceQuotes(text: string): { text: string; fixed: number } {
  let fixed = 0
  const out = String(text || '').split('\n').map(p => {
    let open = 0
    let res = ''
    for (const ch of p) {
      if (ch === '“') { open++; res += ch }
      else if (ch === '”') {
        if (open > 0) { open--; res += ch }
        else { fixed++ }
      } else res += ch
    }
    if (open > 0) { res += '”'.repeat(open); fixed += open }
    return res
  })
  return { text: out.join('\n'), fixed }
}

/**
 * 段首滥用修正：判据按「首句前 4 字」统计，同一开头出现 ≥3 次扣 4 分/处。
 * 确定性做法：第 3 次及以后，把该段并入上一段（不删任何文字，只改段落边界）。
 * 限制：每章最多并 4 段，不并第一段、不并超长段（>160 字）。
 */
export function fixOpenerOveruse(text: string, maxMerge = 4): { text: string; merged: number } {
  const paras = String(text || '').split('\n').map(s => s.trim()).filter(Boolean)
  const openerOf = (p: string) => {
    const s = p.split(/[。！？]/)[0] || ''
    return s.trim().slice(0, 4)
  }
  const counts: Record<string, number[]> = {}
  paras.forEach((p, i) => {
    const op = openerOf(p)
    if (!op) return
    ;(counts[op] = counts[op] || []).push(i)
  })
  const targets = new Set<number>()
  let merged = 0
  for (const op of Object.keys(counts)) {
    const idxs = counts[op]
    if (idxs.length < 3) continue
    for (let k = 2; k < idxs.length && merged < maxMerge; k++) {
      const i = idxs[k]
      if (i === 0 || targets.has(i)) continue
      if (paras[i].length > 160) continue
      targets.add(i)
      merged++
    }
  }
  if (!merged) return { text, merged: 0 }
  const kept: string[] = []
  for (let i = 0; i < paras.length; i++) {
    if (targets.has(i) && kept.length) {
      kept[kept.length - 1] = kept[kept.length - 1] + paras[i]
      continue
    }
    kept.push(paras[i])
  }
  return { text: kept.join('\n'), merged }
}

/**
 * 直引号归一：国产模型常输出英文直引号 "（判据/排版都按中文引号 “” 认对白）。
 * 每段独立交替配对，避免跨段错配。
 */
export function normalizeStraightQuotes(text: string): { text: string; fixed: number } {
  let fixed = 0
  const out = String(text || '').split('\n').map(p => {
    if (!p.includes('"')) return p
    let open = true
    let res = ''
    for (const ch of p) {
      if (ch === '"') { res += open ? '“' : '”'; open = !open; fixed++ }
      else res += ch
    }
    return res
  })
  return { text: out.join('\n'), fixed }
}

export interface DeClicheResult {
  text: string
  changes: string[]
  markerHits: number
  adverbHits: number
  connectiveHits: number
  summaryHits: number
}

function countAll(text: string, list: string[]): number {
  let n = 0
  for (const w of list) {
    let idx = text.indexOf(w)
    while (idx !== -1) { n++; idx = text.indexOf(w, idx + w.length) }
  }
  return n
}

/**
 * 主净化：去套话 / 去副词 / 去议论文连接词
 */
export function deCliche(input: string): DeClicheResult {
  let text = String(input || '')
  const changes: string[] = []
  if (!text) return { text, changes, markerHits: 0, adverbHits: 0, connectiveHits: 0, summaryHits: 0 }

  // ① 固定短语替换（长的优先，避免短词先吃掉长词）
  const rules = PHRASE_RULES.slice().sort((a, b) => b[0].length - a[0].length)
  for (const [from, to] of rules) {
    if (!text.includes(from)) continue
    const n = text.split(from).length - 1
    text = text.split(from).join(to)
    changes.push(from + '→' + (to || '∅') + '×' + n)
  }
  for (const [from, to] of SUMMARY_COMPOUND) {
    if (!text.includes(from)) continue
    const n = text.split(from).length - 1
    text = text.split(from).join(to)
    changes.push(from + '→' + to + '×' + n)
  }

  // ①b 敌称统一（北兵）+ 时代错位词
  for (const [from, to] of ENEMY_TERMS) {
    if (!text.includes(from)) continue
    const n = text.split(from).length - 1
    text = text.split(from).join(to)
    changes.push('敌称:' + from + '→' + to + '×' + n)
  }
  if (text.includes('南明')) {
    const n = text.split('南明').length - 1
    text = text.split('南明').join('大明')
    changes.push('南明→大明×' + n)
  }

  // ①b2 AI 填充句清除（整句级）：删掉不承载情节的总结/收尾句
  for (const re of AI_FILLER_SENTENCES) {
    if (!re.test(text)) continue
    const before = text
    text = text.replace(re, '')
    if (text !== before) changes.push('删填充句:' + String(re).slice(0, 26))
  }

  // ①b3 心理直述改写
  for (const [re, to] of PSYCH_DIRECT) {
    if (!re.test(text)) continue
    const before = text
    text = text.replace(re, to)
    if (text !== before) changes.push('心理直述:' + String(re).slice(0, 20))
  }
  for (const [re, to] of PSYCH_DIRECT2) {
    if (!re.test(text)) continue
    const before = text
    text = text.replace(re, to)
    if (text !== before) changes.push('心理直述2:' + String(re).slice(0, 20))
  }
  // 夜色如墨 → 天黑透了（去套话 + 变具体）
  if (text.includes('夜色如墨')) {
    const n = text.split('夜色如墨').length - 1
    text = text.split('夜色如墨').join('天黑透了')
    changes.push('夜色如墨→天黑透了×' + n)
  }

  // ①c 元信息/提示词回声剔除（模型把"已用开头清单/悬念停笔"抄进正文）
  const _lines = text.split('\n')
  const _keptLines: string[] = []
  let _metaDropped = 0
  for (const _ln of _lines) {
    if (META_LINE_RE.test(_ln) || META_ANY_RE.test(_ln)) { _metaDropped++; continue }
    const _cleaned = _ln.replace(META_PAREN_RE, '')
    if (_cleaned.trim().length < 2 && _ln.trim().length >= 2) { _metaDropped++; continue }
    _keptLines.push(_cleaned)
  }
  if (_metaDropped > 0) {
    text = _keptLines.join('\n')
    changes.push('剔除元信息行×' + _metaDropped)
  }

  // ② 删除类冗余词
  // 🔥 2026-10-22 章末保护：最后 2 段不删。
  //   突然/忽然/骤然/竟然 既是套话、又是章末钩子信号——净化层把它们删掉后，
  //   终稿闸门判「章末缺少断章钩子」→ 整章重跑（每次白烧 10~20 分钟）。
  for (const w of DELETE_WORDS) {
    if (!text.includes(w)) continue
    const _paras = text.split('\n')
    const _protFrom = Math.max(0, _paras.length - 2)
    let n = 0
    for (let i = 0; i < _paras.length; i++) {
      if (i >= _protFrom) continue
      const c = _paras[i].split(w).length - 1
      if (c) { _paras[i] = _paras[i].split(w).join(''); n += c }
    }
    if (n > 0) {
      text = _paras.join('\n')
      changes.push('删:' + w + '×' + n)
    }
  }

  text = cleanArtifacts(text)

  // ①c2 直引号归一（必须在引号配对之前）
  try {
    const _nq = normalizeStraightQuotes(text)
    if (_nq.fixed > 0) { text = _nq.text; changes.push('直引号归一×' + _nq.fixed) }
  } catch (_e) { /* 不阻塞 */ }

  // ①d 近似句去重（模型"改几个字重复"是最高频的退化形态）
  try {
    const _dq = dedupeNearSentences(text)
    if (_dq.removed > 0) { text = _dq.text; changes.push('近似句去重×' + _dq.removed) }
  } catch (_e) { /* 不阻塞 */ }
  // ①e 引号配对
  try {
    const _qb = balanceQuotes(text)
    if (_qb.fixed > 0) { text = _qb.text; changes.push('引号校正×' + _qb.fixed) }
  } catch (_e) { /* 不阻塞 */ }
  // ①f 段首滥用（判据第③维 −4/处）
  try {
    const _op = fixOpenerOveruse(text)
    if (_op.merged > 0) { text = _op.text; changes.push('段首合并×' + _op.merged) }
  } catch (_e) { /* 不阻塞 */ }
  // ①g 段落形态（模型退化时会写成"一行一句"的动作清单）
  try {
    const _sp = mergeShortProseParagraphs(text)
    if (_sp.merged > 0) { text = _sp.text; changes.push('短段合并×' + _sp.merged) }
  } catch (_e) { /* 不阻塞 */ }

  return {
    text,
    changes,
    markerHits: countAll(text, AI_MARKERS),
    adverbHits: countAll(text, AI_ADVERBS),
    connectiveHits: countAll(text, CONNECTIVES_STRONG) + countAll(text, CONNECTIVES_SEQ),
    summaryHits: countAll(text, SUMMARY_WORDS),
  }
}

/**
 * 段首统计（与判定器同口径：首句前 4 字）——仅用于诊断
 */
export function findRepeatedOpeners(text: string, minCount = 3): Array<{ opener: string; count: number; paraIndexes: number[] }> {
  const paras = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean)
  const counts: Record<string, number[]> = {}
  paras.forEach((p, i) => {
    const sents = p.split(/[。！？]/).map(s => s.trim()).filter(Boolean)
    if (!sents.length) return
    const op = sents[0].slice(0, 4)
    if (!op) return
    ;(counts[op] = counts[op] || []).push(i)
  })
  return Object.keys(counts)
    .filter(k => counts[k].length >= minCount)
    .map(k => ({ opener: k, count: counts[k].length, paraIndexes: counts[k] }))
    .sort((a, b) => b.count - a.count)
}

/**
 * 段首去重（确定性兜底）：只合并【近乎同段】的重复段（归一化全文相同，或首10字相同且长度相近）。
 * 说明：不能只看"首10字相同"就合并——正文里正当的同款起句会被误删（实测误删 104 段）。
 * 其余"段首雷同但内容不同"的情况，交给模型的「疑似段落定向重写」处理。
 */
export function mergeRepeatedOpeners(text: string, minCount = 3): { text: string; merged: number } {
  const paras = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean)
  const normOf = (p: string) => p.replace(/[\s，。！？；：、“”"'‘’（）()《》…—\-·]/g, '')
  const seenFull = new Set<string>()
  const seenMeta: Array<{ head: string; len: number }> = []
  const drop = new Set<number>()
  paras.forEach((p, i) => {
    if (p.length < 12) return
    const norm = normOf(p)
    const head = norm.slice(0, 10)
    const exact = seenFull.has(norm)
    const near = seenMeta.some(m => m.head === head && Math.abs(m.len - norm.length) <= Math.max(12, norm.length * 0.25))
    if (exact || near) { drop.add(i); return }
    seenFull.add(norm)
    seenMeta.push({ head, len: norm.length })
  })
  if (!drop.size) return { text, merged: 0 }
  const kept: string[] = []
  for (let i = 0; i < paras.length; i++) {
    if (drop.has(i)) {
      if (kept.length) kept[kept.length - 1] = kept[kept.length - 1] + ' ' + paras[i]
      continue
    }
    kept.push(paras[i])
  }
  return { text: kept.join('\n'), merged: drop.size }
}

/** 段落具体物件命中数（判定器口径） */
export function concreteHitsOf(p: string): number {
  return CONCRETE.filter(w => p.includes(w)).length
}

/** 净化 + 段首去重，一步到位 */
export function polishText(input: string): { text: string; changes: string[]; merged: number } {
  const a = deCliche(input)
  const b = mergeRepeatedOpeners(a.text)
  return { text: b.text, changes: a.changes, merged: b.merged }
}

/**
 * 时序铁律净化（按章号分阶段）
 * 未称帝前（第1~89章）：不能自称「朕」、不能被称「陛下」、不能有「万岁」「圣旨」；
 * 藩王世子的正确自称是「本王/本世子」，对藩王生母称「太妃」。
 */
export function phaseFix(text: string, chapterNumber: number): { text: string; changes: string[] } {
  let t = String(text || '')
  const changes: string[] = []
  const pre = Number(chapterNumber) <= 89
  if (pre) {
    const rules: Array<[string, string]> = [
      ['永历帝', '弘光帝'],
      ['永历', '弘光'],
      ['龙袍', '蟒袍'],
      ['龙椅', '王座'],
      ['万岁', '千岁'],
      ['陛下', '殿下'],
      ['圣旨', '手令'],
      ['朕', '本王'],
      // 🔥 2026-10-22 硬检查实测漏网：登基/即位/南明/穿越/现代/数据（ch6-ch8 各中一次，白跑一整章）
      ['登基', '掌权'],
      ['即位', '掌权'],
      ['南明', '大明'],
      ['穿越', '辗转'],
      ['现代', '如今'],
      ['数据', '数目'],
      // 🔥 2026-10-22 母题铁律补漏：未称帝前只称「太妃」；纪年统一用年号干支
      ['太后', '太妃'],
      ['崇祯十七年春', '甲申年早春'],
      ['崇祯十八年', '甲申年'],
    ]
    for (const [from, to] of rules) {
      if (!t.includes(from)) continue
      const n = t.split(from).length - 1
      t = t.split(from).join(to)
      changes.push('时序:' + from + '→' + to + '×' + n)
    }
  }
  return { text: t, changes }
}
