/**
 * 朱雀口径 · 本地代理检测器（Zhuque Proxy）
 *
 * 为什么需要它：朱雀官方模型只能通过 EdgeOne Makers API 调用（要 key、要额度），
 *   而站内需要「每章都能跑一遍、跑得动、改完立刻能复检」的廉价闸门。
 *   本模块按朱雀公开的四个判定维度，在本地实现一个可复现的代理：
 *     ① 困惑度（AI 偏好高概率词组 → 文本可预测性偏高）
 *     ② 语义连贯（全文衔接过紧、无跳跃 → 连接词与顺序词过密）
 *     ③ 词汇分布（贴近主流大模型高频词与句式 → 模板词/成语/句首复读密集）
 *     ④ 结构特征（段段推进、段落整齐 → 段长过于均匀、缺少短段与闲笔）
 *
 * 重要口径：这是「代理估计」，不是朱雀官方结果。
 *   页面/接口必须显式标注 source='zhuque-proxy'、isOfficialZhuque=false。
 *   官方通道（/api/ai/zhuque-detect 带 key 时）才是最终判定。
 *
 * 标定依据（本项目实测的 4 组官方数据，见 zhuque-calibration.md）：
 *   旧版 ch1（站内 0.8%） → 官方疑似AI 100%
 *   旧版 ch2（站内 0.8%） → 官方疑似AI 100%
 *   活人感一稿 ch1（站内 5%） → 官方疑似AI 74.3%
 *   活人感二稿 ch1（站内 5%） → 官方疑似AI 43.7%
 */

import fs from 'fs'
import path from 'path'

export interface ZqSegment {
  label: 0 | 1 | 2
  labelName: string
  confidence: number
  length: number
  head: string
  text: string
  reasons: string[]
}

export interface ZqProxyResult {
  source: 'zhuque-proxy'
  isOfficialZhuque: false
  humanRatio: number
  aiRatio: number
  suspectedRatio: number
  targetSuspectedRatio: number
  pass: boolean
  overallHumanScore: number
  dimensions: Array<{ name: string; score: number; detail: string }>
  segments: ZqSegment[]
  note: string
}

interface NgramTable {
  builtAt: number
  corpusChars: number
  totalTri: number
  totalBi: number
  totalUni: number
  tri: Record<string, number>
  bi: Record<string, number>
  uni: Record<string, number>
  corpusMeanSurprisal?: number
  // 🔥 修复（类型缺失）：下方会读这个字段但接口未声明 → tsc TS2339；缺省时回退常数
  corpusWindowDiversity?: number
}

let tableCache: NgramTable | null = null

function tablePaths(): string[] {
  const out: string[] = []
  const cwd = process.cwd()
  out.push(path.join(cwd, '.tuzhong-data', 'zhuque-ngram.json'))
  out.push(path.join(cwd, 'zhuque-ngram.json'))
  out.push(path.join(cwd, 'src', 'tuzhong-wenshu', '.tuzhong-data', 'zhuque-ngram.json'))
  return out
}

export function loadNgramTable(): NgramTable | null {
  if (tableCache) return tableCache
  for (const p of tablePaths()) {
    try {
      if (!fs.existsSync(p)) continue
      const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as NgramTable
      if (raw && raw.tri && raw.bi) { tableCache = raw; return raw }
    } catch (_e) { /* ignore */ }
  }
  return null
}

/* ---------------- 词表 ---------------- */

/** 因果/递进类连接词：AI 味最重的一批 */
export const CONNECTIVES_STRONG = ['因此', '所以', '于是', '而且', '并且', '不仅', '甚至', '另外', '此外', '更重要的是', '事实上', '总之', '可见', '综上', '也就是说', '换句话说', '可以说', '不得不说', '某种意义上', '某种程度上', '无疑', '的确如此', '理所当然', '毋庸置疑', '值得注意的是', '显而易见', '与此同时', '总的来说', '不得不说']
/** 时序类连接词：中性偏 AI */
export const CONNECTIVES_SEQ = ['然后', '接着', '随后', '接下来', '同时', '此时', '这时', '忽然', '突然', '而后', '之后', '片刻后', '不多时']
/** 大模型模板词 / 站文风套话 */
export const AI_MARKERS = [
  '不仅如此', '值得一提', '值得一提的', '在当今', '随着', '的不断发展', '的深入', '的重要组成部分', '关键的作用', '深远的影响', '广泛应用', '发挥着', '扮演着', '至关重要', '不可或缺', '深入骨髓', '不言而喻', '毫无疑问', '毋庸置疑', '确是', '实则', '亦是', '尤为', '极其', '颇为', '甚是', '大有', '不禁', '不由得', '不由自主', '缓缓', '轻轻', '默默', '静静', '仿佛', '宛如', '一丝', '一抹', '瞳孔骤缩', '倒吸一口凉气', '嘴角勾起一抹', '嘴角微微上扬', '眼中闪过一丝', '眼底深处', '心中一惊', '心头一紧', '如遭雷击', '浑身一震', '脸色一变', '深吸一口气', '意味深长', '若有所思', '不置可否', '复杂的���色', '鸦雀无声', '全场哗然', '一片哗然', '时间��', '不由自主', '难以置信', '不可置信', '目瞪口呆', '目光如炬', '眼神深邃', '气氛压抑', '心里一沉', '一阵寒意', '后背发凉',
]
/** AI 偏好的副词/成语尾 */
export const AI_ADVERBS = ['骤然', '陡然', '霎时', '顿时', '随即', '立刻', '猛然', '暗暗', '悄悄', '缓缓', '静静', '纷纷', '连连', '一一', '阵阵', '声声', '历历', '赫然', '依然', '依旧', '竟然', '居然', '显然', '分明', '径直', '微微', '轻轻', '静静', '淡淡', '深深', '缓缓', '默默', '径自', '兀自']
/** 总结/解释/心理直述 */
export const SUMMARY_WORDS = ['心里', '心中', '他知道', '她知道', '这意味着', '原来如此', '说到底', '其实', '分明', '注定', '似乎', '仿佛', '宛如', '总而言之', '也就是说', '换句话说', '不由得想', '暗自', '不禁想', '显然', '毫无疑问']
/** 具体物件/身体感：出现即「现场感强」 */
export const CONCRETE = ['碗', '灯', '烛', '火', '雨', '水', '血', '泥', '刀', '箭', '旗', '印', '册', '纸', '马', '船', '门', '砖', '瓦', '绳', '手', '指', '牙', '喉', '肩', '膝', '眼', '脸', '袍', '袖', '靴', '伞', '药', '汗', '珠', '茶', '名册', '塘报', '箱笼', '炭', '油灯', '桨', '盾', '矛', '铳', '炮', '火药', '城', '墙', '街', '巷', '井', '砂', '绳', '秤', '算盘', '砚', '笔', '稿纸', '被', '席', '褥', '阶', '檐', '廊', '柱', '桌', '案', '炉', '罐', '汤', '粥', '饨', '糕', '糖', '盐', '银', '铜', '铁', '漆', '蜡', '灰', '霜', '雾', '沙', '尘', '布', '麻', '绳结']

function countHits(text: string, list: string[]): { n: number; hit: string[] } {
  let n = 0
  const hit: string[] = []
  for (const w of list) {
    let idx = text.indexOf(w)
    let c = 0
    while (idx !== -1) { c++; idx = text.indexOf(w, idx + w.length) }
    if (c > 0) { n += c; hit.push(w + '×' + c) }
  }
  return { n, hit }
}

/** 连续短句（≤12字）成串 —— 朱雀对「清单式罗列」最敏感 */
function maxShortRun(p: string): number {
  const ss = p.split(/[。！？]/).map(s => s.trim()).filter(Boolean)
  let maxRun = 0
  let run = 0
  for (const s of ss) {
    if (charCount(s) <= 12) { run++; if (run > maxRun) maxRun = run } else run = 0
  }
  return maxRun
}

/** 身份/背景交代句（「另一个人是…」「梧州养着水师，捏着盐引」这类设定说明书） */
const IDENTITY_INTRO = /另一个人是|前身是|上一世|这辈子|他本是|原是|身份是|二十二岁|另一个朝代|读史，抄史|历史系|史学出身|是\s*\S{0,8}世子|广西巡抚|梧州养着|握着盐引|养着水师/
/** 概括评价 / 命运预告（「他丢得比谁都稳」「这人的下场书里写得清清楚楚」） */
const FATE_SUMMARY = /下场|结局|书里写得|比谁都|注定|从此以后|往后余生|一辈子只干一件事|丢得比谁都|写得清清楚楚/
/** 具体动作与身体感：出现即「现场感强」 */
export const ACTION_WORDS = ['咬', '攥', '抖', '颤', '咽', '伸手', '抬手', '踩', '抓', '摔', '按', '推', '扯', '灌', '滑', '软', '硬', '凉', '烫', '痛', '酸', '麻', '跪', '爬', '挪', '探', '缩', '扶', '撑', '抹', '擦', '撞', '踢', '端', '捧', '折', '塞', '捏', '搓', '掀', '拔', '插', '搁', '丢', '捡', '数', '划', '舔', '含', '屏', '睁', '闭', '盯', '瞅', '递', '接', '塞进', '灌进', '滚进', '磕']

function splitParagraphs(text: string): string[] {
  return String(text).replace(/\r/g, '').split(/\n+/).map(p => p.trim()).filter(Boolean)
}

function sentencesOf(p: string): string[] {
  return p.split(/[。！？…；!?]/).map(s => s.trim()).filter(Boolean)
}

function charCount(s: string): number {
  return (s.match(/[\u4e00-\u9fff]/g) || []).length
}

/* ---------------- ① 困惑度代理 ---------------- */

function surprisalOf(text: string, table: NgramTable | null): { mean: number; samples: number } {
  const clean = text.replace(/[^一-龥]/g, '')
  if (clean.length < 20) return { mean: 0, samples: 0 }
  if (!table) {
    // 无语料表时退化为「常用字占比」近似：越高越像模板文
    const common = '的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感'
    let hit = 0
    for (const ch of clean) if (common.indexOf(ch) >= 0) hit++
    return { mean: (hit / clean.length) * 10, samples: clean.length }
  }
  const V = Object.keys(table.tri).length + 1
  const Vb = Object.keys(table.bi).length + 1
  const Vu = Object.keys(table.uni).length + 1
  let sum = 0
  let cnt = 0
  for (let i = 0; i + 2 < clean.length; i++) {
    const t = clean.slice(i, i + 3)
    const b = clean.slice(i, i + 2)
    const u = clean[i]
    let p = 0
    const ct = table.tri[t]
    if (ct) p = ct / table.totalTri
    else {
      const cb = table.bi[b]
      if (cb) p = (cb / table.totalBi) * 0.35
      else {
        const cu = table.uni[u]
        p = cu ? (cu / table.totalUni) * 0.12 : 0.0001
      }
    }
    p = Math.max(p, 1 / (table.totalTri + V))
    sum += -Math.log2(p)
    cnt++
  }
  return { mean: cnt ? sum / cnt : 0, samples: cnt }
}

/* ---------------- 段落级疑似度 ---------------- */

function paragraphSignals(p: string, ctx: { openerCounts: Record<string, number>; maxOpener: number }) {
  const hasDialog = /[“"]/.test(p)
  const concreteHits = CONCRETE.filter(w => p.includes(w)).length
  const summaryHits = countHits(p, SUMMARY_WORDS).n
  const aiHits = countHits(p, AI_MARKERS).n
  const adverbHits = countHits(p, AI_ADVERBS).n
  const listness = (p.match(/[、]/g) || []).length
  const sents = sentencesOf(p)
  const len = charCount(p)
  const opener = sents.length ? sents[0].slice(0, 4) : ''
  const openerRepeat = opener ? (ctx.openerCounts[opener] || 0) : 0
  const isOneSentence = sents.length <= 1
  const shortRun = maxShortRun(p)
  const identityIntro = IDENTITY_INTRO.test(p)
  const fateSummary = FATE_SUMMARY.test(p)
  const actionHits = ACTION_WORDS.filter(w => p.includes(w)).length
  const groupList = (p.match(/有人/g) || []).length
  const dialogChars = (p.match(/[“"][^“”"]*[”"]/g) || []).join('').length
  const dialogShare = len > 0 ? dialogChars / len : 0
  return { hasDialog, concreteHits, summaryHits, aiHits, adverbHits, listness, len, sents, opener, openerRepeat, isOneSentence, shortRun, identityIntro, fateSummary, actionHits, groupList, dialogShare }
}

export function runZhuqueProxy(text: string, opts?: { target?: number; threshold?: number }): ZqProxyResult {
  const target = opts && opts.target ? opts.target : 5
  const threshold = opts && opts.threshold ? opts.threshold : 3.0
  const paras = splitParagraphs(text)
  const totalLen = charCount(text) || 1
  const table = loadNgramTable()

  // 句首重复统计
  const openerCounts: Record<string, number> = {}
  paras.forEach(p => {
    const s = sentencesOf(p)
    if (!s.length) return
    const op = s[0].slice(0, 4)
    openerCounts[op] = (openerCounts[op] || 0) + 1
  })
  const maxOpener = Math.max(1, ...Object.values(openerCounts))

  const ctx = { openerCounts, maxOpener }
  const signals = paras.map(p => paragraphSignals(p, ctx))

  /* 维度① 困惑度 */
  const surp = surprisalOf(text, table)
  const corpusMean = table && table.corpusMeanSurprisal ? table.corpusMeanSurprisal : 0
  const surpDelta = corpusMean ? surp.mean - corpusMean : 0
  const dimPerplexity = Math.max(0, Math.min(100, Math.round(50 + surpDelta * 25)))

  /* 维度② 连贯过度（越高越像AI，因此取反） */
  const strongConn = countHits(text, CONNECTIVES_STRONG).n
  const seqConn = countHits(text, CONNECTIVES_SEQ).n
  const connPerK = ((strongConn + seqConn) / totalLen) * 1000
  const dimCoherence = Math.max(0, Math.min(100, Math.round(100 - strongConn * 6 - seqConn * 2.2 - Math.max(0, connPerK - 6) * 2)))

  /* 维度③ 词汇分布 */
  const aiMarkerHits = countHits(text, AI_MARKERS).n
  const adverbHits = countHits(text, AI_ADVERBS).n
  // 窗口化字去重率（500字窗口，长度无关），与语料基线比
  const cn = text.replace(/[^一-龥]/g, '')
  const W = 500
  let wsum = 0, wcnt = 0
  for (let i = 0; i + W <= cn.length; i += W) {
    wsum += new Set(cn.slice(i, i + W)).size / W
    wcnt++
  }
  const windowDiversity = wcnt ? wsum / wcnt : (new Set(cn).size / Math.max(1, cn.length))
  const corpusDiv = table && table.corpusWindowDiversity ? table.corpusWindowDiversity : 0.4919
  const divGap = corpusDiv ? Math.max(0, corpusDiv - windowDiversity) : 0
  const openerOveruse = Object.values(openerCounts).filter(c => c >= 3).length
  const dimLexicon = Math.max(0, Math.min(100, Math.round(
    100 - divGap * 200 - aiMarkerHits * 7 - adverbHits * 2.5 - openerOveruse * 4
  )))

  /* 维度④ 结构规整 */
  const paraLens = signals.map(s => s.len).filter(n => n > 0)
  const mean = paraLens.reduce((a, b) => a + b, 0) / Math.max(1, paraLens.length)
  const variance = paraLens.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, paraLens.length)
  const cv = Math.sqrt(variance) / Math.max(1, mean)
  const singleP = signals.filter(s => s.isOneSentence).length / Math.max(1, signals.length)
  const dialogP = signals.filter(s => s.hasDialog).length / Math.max(1, signals.length)
  const idleP = signals.filter(s => !s.hasDialog && s.concreteHits <= 1).length / Math.max(1, signals.length)
  const uniform = 1 - Math.min(1, cv / 0.9)
  const dimStructure = Math.max(0, Math.min(100, Math.round(
    100 - uniform * 26 - Math.max(0, 0.06 - singleP) * 220 - Math.max(0, 0.10 - dialogP) * 160 - Math.max(0, idleP - 0.28) * 90
  )))

  /* 段落级判定（与官方分段语义一致：叙述/说明/罗列 → 疑似AI；动作/对话/身体感 → 人工） */
  const segments: ZqSegment[] = []
  let suspectedChars = 0
  const paraScores: number[] = []
  signals.forEach((s) => {
    let sus = 0
    if (s.identityIntro) sus += 2.6
    if (s.fateSummary) sus += 2.6
    if (s.shortRun >= 3) sus += 2.4
    if (s.groupList >= 3) sus += 2.2
    if (!s.hasDialog) sus += 1.5
    if (s.concreteHits <= 1) sus += 1.5
    if (s.summaryHits >= 1) sus += 1.2 * Math.min(2, s.summaryHits)
    if (s.aiHits >= 1) sus += 0.8 * Math.min(2, s.aiHits)
    if (s.adverbHits >= 2) sus += 0.5
    if (s.listness >= 2) sus += 1.0
    if (s.len >= 35 && s.len <= 95 && !s.hasDialog) sus += 0.5
    if (s.openerRepeat >= 3) sus += 0.7
    if (s.actionHits >= 2) sus -= 2.0
    else if (s.actionHits === 1) sus -= 1.3
    if (s.dialogShare >= 0.40) sus -= 1.8
    else if (s.dialogShare >= 0.22) sus -= 1.2
    if (s.isOneSentence && s.len < 12) sus -= 0.8
    paraScores.push(sus)
  })

  // 合并连续同标签段落 → 语义块（与朱雀的分段语义一致），占比按块字数计
  const blocks: Array<{ label: 0 | 2; from: number; to: number; chars: number; score: number; reasons: string[] }> = []
  signals.forEach((s, i) => {
    const sus = paraScores[i]
    const isSuspect = sus >= threshold
    const label: 0 | 2 = isSuspect ? 2 : 0
    const last = blocks[blocks.length - 1]
    if (last && last.label === label) {
      last.to = i
      last.chars += s.len
      last.score = (last.score * (last.chars - s.len) + sus * s.len) / Math.max(1, last.chars)
      const reasons: string[] = []
      if (s.identityIntro) reasons.push('身份/背景说明句')
      if (s.fateSummary) reasons.push('概括评价/命运预告')
      if (s.shortRun >= 3) reasons.push('清单式罗列')
      if (!s.hasDialog && s.concreteHits <= 1) reasons.push('抽象叙述（无对白/少现场细节）')
      if (s.summaryHits >= 1) reasons.push('总结/解释/心理直述')
      if (s.aiHits >= 1) reasons.push('大模型模板词')
      if (!last.reasons.length) last.reasons = reasons
      else reasons.forEach(r => { if (!last.reasons.includes(r)) last.reasons.push(r) })
    } else {
      const reasons: string[] = []
      if (s.identityIntro) reasons.push('身份/背景说明句')
      if (s.fateSummary) reasons.push('概括评价/命运预告')
      if (s.shortRun >= 3) reasons.push('清单式罗列')
      if (!s.hasDialog && s.concreteHits <= 1) reasons.push('抽象叙述（无对白/少现场细节）')
      if (s.summaryHits >= 1) reasons.push('总结/解释/心理直述')
      if (s.aiHits >= 1) reasons.push('大模型模板词')
      blocks.push({ label, from: i, to: i, chars: s.len, score: sus, reasons })
    }
  })

  // 碎块并入邻块（朱雀按语义大块分段，短碎段不单独成块）
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].chars < 45 && blocks[i - 1]) {
      blocks[i - 1].to = blocks[i].to
      blocks[i - 1].chars += blocks[i].chars
      blocks.splice(i, 1)
      i--
    }
  }

  blocks.forEach(b => {
    if (b.label === 2) suspectedChars += b.chars
    const head = paras[b.from].slice(0, 40)
    const body = paras.slice(b.from, b.to + 1).join('\n')
    segments.push({
      label: b.label,
      labelName: b.label === 2 ? '疑似AI' : '人工',
      confidence: Math.max(0.05, Math.min(0.97, b.score / 6)),
      length: b.chars,
      head,
      text: body,
      reasons: b.reasons,
    })
  })

  const suspectedRatio = Math.round((suspectedChars / totalLen) * 1000) / 10
  const humanRatio = Math.round((100 - suspectedRatio) * 10) / 10
  const overallHumanScore = Math.round((dimPerplexity * 0.2 + dimCoherence * 0.25 + dimLexicon * 0.25 + dimStructure * 0.3))

  return {
    source: 'zhuque-proxy',
    isOfficialZhuque: false,
    humanRatio,
    aiRatio: 0,
    suspectedRatio,
    targetSuspectedRatio: target,
    pass: suspectedRatio <= target,
    overallHumanScore,
    dimensions: [
      { name: '困惑度代理（越高越像人写）', score: dimPerplexity, detail: '平均惊讶度 ' + surp.mean.toFixed(2) + ' bit/字' + (corpusMean ? '，语料基线 ' + corpusMean.toFixed(2) : '') },
      { name: '语义连贯（越高越松散越像人写）', score: dimCoherence, detail: '强连接词 ' + strongConn + ' 个 / 顺序词 ' + seqConn + ' 个（每千字 ' + connPerK.toFixed(1) + '）' },
      { name: '词汇分布（越高越像人写）', score: dimLexicon, detail: '模板词 ' + aiMarkerHits + ' / 副词成语 ' + adverbHits + ' / 重复句首 ' + openerOveruse + ' 处 / 窗口去重率 ' + windowDiversity.toFixed(3) + '（语料基线 ' + corpusDiv.toFixed(3) + '）' },
      { name: '结构特征（越高越参差越像人写）', score: dimStructure, detail: '段长CV ' + cv.toFixed(2) + ' / 单句段 ' + (singleP * 100).toFixed(0) + '% / 对白段 ' + (dialogP * 100).toFixed(0) + '% / 无现场感段 ' + (idleP * 100).toFixed(0) + '%' },
    ],
    segments,
    note: '朱雀口径本地代理估计（非朱雀官方结果）；官方判定请用带 Key 的 /api/ai/zhuque-detect。',
  }
}
