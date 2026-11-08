/**
 * pitfallRules.ts —— 「签约爆款避坑检查」全环节动态规则引擎（纯函数，零依赖）
 *
 * 设计目标（#226b B1）：
 *   把原先只检查「逐章正文」的 StepSignatureChecklist，扩展为覆盖 AI 全自动生成链路
 *   全部 11 个环节（idea / synopsis / worldbuilding / powerSystem / characters /
 *   factions / relationships / outline / keyPlots / chapters / 正文）的**真实判定**检查。
 *
 * 铁律：
 *   1. 本文件**不得 import 任何 Next.js / React / node 内置模块**，保证可在 node 中
 *      直接编译产物运行（用于生产数据端到端验证：见 _recon/test_pitfall_226.cjs）。
 *   2. 每一条规则都必须**真实判定**，严禁写死 `passed: true`。
 *   3. 数据源缺失时以「跳过该组」的方式表达（不产生假通过），全量数据下 7 个组全部运行。
 *
 * 检查组（group.key）：
 *   A compliance  合规红线（一票否决）—— 命中红线词表即 block
 *   B meta        元叙述 —— 章摘要/钩子自曝创作逻辑
 *   C titles      章节标题 —— 恰 4 汉字 / 全库唯一 / 不与卷名重复 / 无元叙述词
 *   D volumeSummary 卷摘要 —— sanitizeVolumeSummary 清洗后长度落在 120-180
 *   E characters  人物设定 —— age 数字且 14-70 / 史实按生年 / role 非空 / arcNodes 非空
 *   F upstream    上游必填 —— 8 个设计字段非空且达实质长度
 *   G platinum    白金标准 —— 开篇钩子 / 爽点密度 / 冲突密度 等启发式
 */

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

export type PitfallSeverity = 'block' | 'warn' | 'info'

export interface PitfallItem {
  /** 稳定规则 id（用于前端 key 与后续一键修复定位） */
  id: string
  severity: PitfallSeverity
  passed: boolean
  /** 规则标题（一句话） */
  title: string
  /** 判定明细（失败原因 / 通过说明 / 命中样例） */
  detail: string
  /** 数据路径（如 chapters.volumes[].chapters[].title） */
  path: string
}

export interface PitfallGroup {
  key: string
  label: string
  items: PitfallItem[]
}

export interface PitfallSummary {
  total: number
  passed: number
  failed: number
  /** severity=block 且未通过的数量 */
  block: number
}

export interface PitfallResult {
  groups: PitfallGroup[]
  summary: PitfallSummary
}

// ─────────────────────────────────────────────────────────────────────────────
// 常量表
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A 组红线词表（番茄签约评审 L0 合规层 · 一票否决）。
 * 与 src/app/api/settings/route.ts 的 _COMPLY_MAP 口径对齐（只读参考，不 import）。
 *
 * ⚠️ 用户明确要求保留的「剃发令 / 剃发之令」**不属于违规**，故不在此表内，任何检查都不得报它。
 */
export const COMPLIANCE_RED_WORDS: string[] = [
  '灭族', '鞑虏', '异族', '满汉存亡', '低维文明', '民族存亡', '民族尊严', '殖民',
  '南京条约', '甲午', '八国联军', '英法联军', '南京大屠杀', '屠杀', '满清余孽',
  '设省', '日不落',
  // 🔥 Bug⑧ 同源补全：以下为 settings/route.ts _COMPLY_MAP 已拦截、本表此前漏收的红线词，
  //    补齐以免「一票否决检查」放行 settings 已替换的高危词（剃发令/剃发之令仍属合规，不入表）。
  '满清', '满清清廷', '扬州十日', '嘉定三屠', '剃发易服', '殖民者',
  '中华民族', '日不落帝国', '东印度公司',
]

/** B 组元叙述词（自曝创作逻辑的脚手架句，禁止出现在章摘要 / 钩子）。 */
export const META_NARRATIVE_WORDS: string[] = [
  '章末', '下一章', '本章', '下章', '且看', '即将揭晓', '为下一章',
]

/** F 组上游必填字段 → 实质长度下限（按字段展平后字符串总长）。 */
export const UPSTREAM_FIELDS: { key: string; label: string; min: number }[] = [
  { key: 'idea', label: '核心创意', min: 40 },
  { key: 'synopsis', label: '内容简介', min: 100 },
  { key: 'worldbuilding', label: '世界观', min: 100 },
  { key: 'powerSystem', label: '力量体系', min: 60 },
  { key: 'factions', label: '势力阵营', min: 50 },
  { key: 'relationships', label: '人物关系', min: 50 },
  { key: 'keyPlots', label: '关键情节', min: 60 },
  { key: 'outline', label: '大纲', min: 60 },
]

/** E 组史实人物「生年表」（与 settings/route.ts 的 HISTORICAL_CHAR_BIRTH 保持同源口径）。 */
export const HISTORICAL_CHAR_BIRTH: Record<string, number> = {
  '朱由榔': 1623, '史可法': 1601, '瞿式耜': 1590, '何腾蛟': 1592, '李定国': 1621,
  '郑成功': 1624, '张煌言': 1620, '多尔衮': 1612, '多铎': 1614, '吴三桂': 1612,
  '孔有德': 1602, '张献忠': 1606, '郑芝龙': 1604, '朱由崧': 1607, '朱聿键': 1602,
  '黄道周': 1585, '堵胤锡': 1601, '马士英': 1591, '阮大铖': 1587, '阎应元': 1607,
  '黄淳耀': 1605,
  '张同敞': 1608, '朱聿鐭': 1605, '焦琏': 1599,
  // ↓ 用户 2026-09-17 拍板：采纳史料生年（原先归入「生年无考」，现按史料精确定年）
  '王太后': 1594, // 孝正太后王氏（王徽灵）→ 1646 年 52 岁
  '刘文秀': 1633, // → 1646 年 13 岁（少年义子将领）
  '艾能奇': 1626, // → 1646 年 20 岁
  '孙可望': 1619, // → 1646 年 27 岁（不予 1630/1625 说）
}

/**
 * 生年无可靠记载的史实人物：**不参与「年龄 vs 生年」判定**（不得编造生年）。
 * 注：王太后 / 刘文秀 / 艾能奇 / 孙可望 已于 2026-09-17 经用户拍板采纳史料生年，移出本表；
 *     庞天寿（南明司礼监宦官）生年无考、用户未采纳其 1588 说，保留在「无考」内。
 */
export const HISTORICAL_BIRTH_UNKNOWN: string[] = [
  '王氏', '戴贵人', '李成栋', '丁魁楚', '金声桓', '庞天寿',
]

/** 史实基准年（生年 → 该年年龄）。 */
export const HISTORICAL_BASE_YEAR = 1646
/**
 * 史实年龄容差：**0 = 精确**。
 * 用户铁律「有真实历史人物必须按真实史料设计，不能乱发挥」→ 卡片年龄必须严格等于 1646-生年。
 * ⚠️ 必须与 src/app/api/settings/route.ts 的 _guardCharacterAges 保持同口径（那边同为 0）。
 * 两侧一旦不一致，就会出现「守卫放水 + 检查器也放水」的双重漏判。
 */
export const AGE_TOLERANCE = 0
/** 虚构 / 兜底年龄区间。 */
export const AGE_MIN = 14
export const AGE_MAX = 70

/** 卷摘要清洗后长度区间（阈值来源：StepChapters.tsx:926）。 */
export const VOLUME_SUMMARY_MIN = 120
export const VOLUME_SUMMARY_MAX = 180

// ─────────────────────────────────────────────────────────────────────────────
// 通用工具
// ─────────────────────────────────────────────────────────────────────────────

const CJK_ONLY_4 = /^[\u4e00-\u9fa5]{4}$/

function isObj(v: any): boolean {
  return v !== null && typeof v === 'object'
}

function toArray(v: any): any[] {
  return Array.isArray(v) ? v : []
}

function asString(v: any): string {
  return v == null ? '' : String(v)
}

/** 递归展平任意嵌套值为字符串（用于「实质长度」与合规扫描），跳过内部修订键。 */
function flattenText(node: any, seen?: Set<any>, depth = 0): string {
  if (node == null) return ''
  if (depth > 12) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  if (!isObj(node)) return ''
  const _seen = seen || new Set<any>()
  if (_seen.has(node)) return ''
  _seen.add(node)
  let out = ''
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) out += flattenText(node[i], _seen, depth + 1) + '\n'
    return out
  }
  const SKIP = new Set(['_secRev', '_charsRev', '_charsRevAt', '_harem'])
  for (const k of Object.keys(node)) {
    if (SKIP.has(k)) continue
    out += flattenText(node[k], _seen, depth + 1) + '\n'
  }
  return out
}

/** 统计字符串在文本中的出现次数（纯子串计数）。 */
function countOccurrences(text: string, term: string): number {
  if (!text || !term) return 0
  let c = 0
  let idx = text.indexOf(term)
  while (idx !== -1) {
    c++
    idx = text.indexOf(term, idx + term.length)
  }
  return c
}

/** 归一化年龄为数字；无法解析返回 null。 */
function normAge(raw: any): number | null {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(/[^\d.]/g, ''))
  if (!isFinite(n) || n <= 0) return null
  return n
}

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeVolumeSummary —— 与 StepChapters.tsx:455 保持同源的纯函数副本
//   （StepChapters.tsx 属客户端组件，pitfallRules 禁止 import React，故此处等价重实现）
// ─────────────────────────────────────────────────────────────────────────────

export function sanitizeVolumeSummary(raw: string): string {
  if (!raw) return ''
  let summary = raw.trim()

  const _labelPatterns: RegExp[] = [
    /【概览】/g, /【背景】/g, /【发展】/g, /【高潮】/g, /【结局】/g, /【结尾】/g,
    /【关键事件】/g, /【核心事件】/g, /【主要事件】/g, /【重要事件】/g,
    /【人物】/g, /【冲突】/g, /【转折】/g, /【悬念】/g, /【伏笔】/g,
    /【核心冲突】/g, /【剧情概述】/g, /【剧情简介】/g, /【内容简介】/g,
    /【卷首语】/g, /【导语】/g, /【简介】/g, /【概述】/g, /【核心目标】/g,
    /【开篇】/g, /【开卷】/g, /【本卷概述】/g, /【章节安排】/g, /【主要人物】/g,
    /《概览》/g, /《背景》/g, /《发展》/g, /《高潮》/g, /《结局》/g,
    /《关键事件》/g, /《核心事件》/g, /《主要事件》/g,
    /\[概览\]/g, /\[背景\]/g, /\[发展\]/g, /\[高潮\]/g, /\[结局\]/g,
    /\[关键事件\]/g, /\[核心事件\]/g, /\[主要事件\]/g,
  ]
  _labelPatterns.forEach(function (pat) { summary = summary.replace(pat, '') })

  const _colonLabels: string[] = [
    '核心目标', '主要目标', '本卷目标', '卷目标',
    '开篇', '开卷', '卷开篇', '开端', '开头',
    '高潮', '卷高潮', '本卷高潮', '核心高潮',
    '关键事件', '核心事件', '主要事件', '重要事件', '事件',
    '结局', '结尾', '卷末', '收尾',
    '背景', '故事背景', '时代背景',
    '人物', '主要人物', '核心人物',
    '冲突', '核心冲突', '主要矛盾',
    '转折', '关键转折', '转折点',
    '悬念', '伏笔', '暗线',
    '概览', '概述', '简介', '导语', '卷首语', '摘要',
  ]
  _colonLabels.forEach(function (label) {
    const re = new RegExp('(^|[，。！？、；；\\n])\\s*' + label + '\\s*[：:]\\s*', 'g')
    summary = summary.replace(re, '$1')
  })
  summary = summary.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*[，,]?/, '')
  summary = summary.replace(/\n\s*\d+\s*[.、、:：]/g, '，')
  summary = summary.replace(/[；;]\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*/g, '，')

  summary = summary.replace(/^开篇[,，]?/, '')
  summary = summary.replace(/^开卷[,，]?/, '')
  while (summary.indexOf('本卷') >= 0 && summary.indexOf('本卷') < 20) {
    summary = summary.substring(summary.indexOf('本卷') + 2)
  }
  const clichePatterns: RegExp[] = [
    /[，,；;。]?[^。！？]{0,20}(实力|人脉|势力|格局)(均发生|发生)(不可逆|重大|巨大)?变化[。！？]?/g,
    /[，,；;]?主角在本卷.*?(发生|改变|变化)[。！？]?/g,
    /[，,；;]?构成了本卷波澜壮阔的篇章[。！？]?/g,
    /[，,；;]?也为下一卷(的全面爆发)?埋下了伏笔[。！？]?/g,
    /[，,；;]?为(后续|下一卷?)(剧情)?埋下伏笔[。！？]?/g,
    /[，,；;]?拉开了序幕[。！？]?/g,
    /[，,；;]?整个故事(由此)?正式拉开帷幕[。！？]?/g,
    /[，,；;]?承上启下[。！？]?/g,
    /[，,；;]?精彩纷呈[。！？]?/g,
    /[，,；;]?好戏才刚刚开始[。！？]?/g,
    /[，,；;]?故事才刚刚开始[。！？]?/g,
    /[，,；;]?更大的危机(正在|悄然)降临[。！？]?/g,
    /[，,；;]?前路暗藏凶险[。！？]?/g,
    /[，,；;]?为后续逆袭之路奠定坚实基础[。！？]?/g,
    /[，,；;]?为后续高潮做好充分准备[。！？]?/g,
    /[，,；;]?新的威胁悄然逼近[。！？]?/g,
    /[，,；;]?整个故事落下帷幕[。！？]?/g,
    /[，,；;]?吹响了.*?号角[。！？]?/g,
  ]
  clichePatterns.forEach(function (pat) { summary = summary.replace(pat, '') })
  summary = summary.replace(/[，,；;][^。！？；，,]{0,3}[；;]/g, '，')
  summary = summary.replace(/[，,]\s*[；;]\s*/g, '，')
  summary = summary.replace(/；\s*卷末/g, '，')
  summary = summary.replace(/卷末[^。！？]{0,20}[，,；;]/g, '')
  summary = summary.replace(/[。！？]{2,}/g, '。')
  summary = summary.replace(/[，,]{2,}/g, '，')
  summary = summary.replace(/[。！？]，/g, '。')
  summary = summary.replace(/，\s*。/g, '。')
  summary = summary.replace(/[，,；;][^。！？]{1,4}[。！？]/g, '。')
  summary = summary.replace(/^[，,；;。！？\s]+/, '')
  if (!/[。！？…]$/.test(summary)) summary = summary + '。'
  if (summary.length > 250) {
    const cutPoint = Math.max(summary.lastIndexOf('。', 248), summary.lastIndexOf('！', 248), summary.lastIndexOf('？', 248))
    if (cutPoint > 140) summary = summary.substring(0, cutPoint + 1)
    else summary = summary.slice(0, 248) + '。'
  }
  return summary
}

// ─────────────────────────────────────────────────────────────────────────────
// 数据源提取
// ─────────────────────────────────────────────────────────────────────────────

interface Source {
  /** 上游设计字段（用于 A/F 组） */
  design: Record<string, any>
  /** 卷列表（含卷摘要与章规划） */
  volumes: any[]
  /** 逐章正文（genContent） */
  prose: any[]
  /** 人物卡集合（去重后的平铺列表） */
  characters: any[]
  /** 是否存在「设计态」数据（决定 F/C/D/G 组是否运行） */
  hasDesign: boolean
}

function collectCharacters(chars: any): any[] {
  const collected: any[] = []
  if (!isObj(chars)) return collected
  ;[chars.protagonist, chars.femaleLead, chars.antagonist].forEach((c) => { if (isObj(c)) collected.push(c) })
  toArray(chars.femaleLeads).forEach((c) => { if (isObj(c)) collected.push(c) })
  toArray(chars.antagonists).forEach((c) => { if (isObj(c)) collected.push(c) })
  toArray(chars.supporting).forEach((c) => { if (isObj(c)) collected.push(c) })
  // 去重（同一对象可能同时出现在多个桶）
  const seen = new Set<any>()
  return collected.filter((c) => { if (seen.has(c)) return false; seen.add(c); return true })
}

function extractSource(data: any): Source {
  const d = isObj(data) ? data : {}
  const chapters = isObj(d.chapters) ? d.chapters : {}
  let volumes = toArray(chapters.volumes)
  if (volumes.length === 0) volumes = toArray(d.volumes)
  let prose = toArray(chapters.generatedContent)
  if (prose.length === 0) prose = toArray(d.generatedContent)

  const designKeys = ['idea', 'synopsis', 'worldbuilding', 'powerSystem', 'factions', 'relationships', 'keyPlots', 'outline']
  const design: Record<string, any> = {}
  let hasDesign = false
  designKeys.forEach((k) => {
    design[k] = d[k]
    if (d[k] != null && flattenText(d[k]).trim().length > 0) hasDesign = true
  })
  if (volumes.length > 0) hasDesign = true

  const characters = collectCharacters(d.characters)

  return { design, volumes, prose, characters, hasDesign }
}

/** 展开所有「章规划」对象（含所属卷序号）。 */
function collectChapterPlans(volumes: any[]): { volIndex: number; chapter: any }[] {
  const out: { volIndex: number; chapter: any }[] = []
  volumes.forEach((v, vi) => {
    toArray(v && v.chapters).forEach((c) => { if (isObj(c)) out.push({ volIndex: vi, chapter: c }) })
  })
  return out
}

function volumeName(v: any, idx: number): string {
  const n = asString(v && v.name).trim()
  return n || ('第' + (idx + 1) + '卷')
}

// ─────────────────────────────────────────────────────────────────────────────
// 各检查组
// ─────────────────────────────────────────────────────────────────────────────

/** A. 合规红线组 —— 每条红线词一个检查项，命中即 block。 */
function buildComplianceGroup(src: Source): PitfallGroup {
  const segments: { path: string; text: string }[] = []

  // 上游设计字段
  const designMap: [string, string][] = [
    ['idea', 'idea'], ['synopsis', 'synopsis'], ['worldbuilding', 'worldbuilding'],
    ['outline', 'outline'], ['factions', 'factions'], ['keyPlots', 'keyPlots'],
    ['powerSystem', 'powerSystem'], ['relationships', 'relationships'],
  ]
  designMap.forEach(([k, label]) => {
    if (src.design[k] != null) segments.push({ path: label, text: flattenText(src.design[k]) })
  })

  // 卷级字段
  src.volumes.forEach((v, vi) => {
    if (v && typeof v.summary === 'string') segments.push({ path: `chapters.volumes[${vi}].summary`, text: v.summary })
    if (v && typeof v.coreObjective === 'string') segments.push({ path: `chapters.volumes[${vi}].coreObjective`, text: v.coreObjective })
    if (v && typeof v.name === 'string') segments.push({ path: `chapters.volumes[${vi}].name`, text: v.name })
  })

  // 章级字段（title / summary / hook 及深度字段）
  collectChapterPlans(src.volumes).forEach(({ volIndex, chapter }, ci) => {
    const base = `chapters.volumes[${volIndex}].chapters[${ci}]`
    const deepKeys = ['title', 'summary', 'hook', 'turningPoint', '_llmTitle', 'payoff', 'foreshadowing', 'conflict']
    deepKeys.forEach((k) => {
      if (typeof chapter[k] === 'string' && chapter[k]) segments.push({ path: `${base}.${k}`, text: chapter[k] })
    })
    toArray(chapter.shuangPoints).forEach((sp, si) => {
      if (typeof sp === 'string' && sp) segments.push({ path: `${base}.shuangPoints[${si}]`, text: sp })
    })
  })

  // 逐章正文
  src.prose.forEach((p, pi) => {
    if (p && typeof p.content === 'string' && p.content) segments.push({ path: `chapters.generatedContent[${pi}].content`, text: p.content })
  })

  const items: PitfallItem[] = COMPLIANCE_RED_WORDS.map((term, i) => {
    const hits: string[] = []
    let total = 0
    segments.forEach((seg) => {
      const c = countOccurrences(seg.text, term)
      if (c > 0) { total += c; if (hits.length < 8) hits.push(`${seg.path}(${c})`) }
    })
    const passed = total === 0
    return {
      id: `compliance-${i}`,
      severity: 'block' as PitfallSeverity,
      passed,
      title: passed ? `未命中红线词「${term}」` : `命中红线词「${term}」×${total}`,
      detail: passed
        ? '全部环节（上游设计 / 卷 / 章 / 正文）均未命中'
        : `命中位置：${hits.join('、')}${total > hits.length ? ' …' : ''}`,
      path: 'idea|synopsis|worldbuilding|outline|factions|keyPlots|chapters.volumes[].chapters[]',
    }
  })

  return { key: 'compliance', label: '⚖️ 合规红线（一票否决）', items }
}

/** B. 元叙述组 —— 章摘要 / 钩子（及正文）自曝创作逻辑。 */
function buildMetaGroup(src: Source): PitfallGroup | null {
  const plans = collectChapterPlans(src.volumes)
  const segments: { path: string; text: string }[] = []
  plans.forEach(({ volIndex, chapter }, ci) => {
    const base = `chapters.volumes[${volIndex}].chapters[${ci}]`
    if (typeof chapter.summary === 'string') segments.push({ path: `${base}.summary`, text: chapter.summary })
    if (typeof chapter.hook === 'string') segments.push({ path: `${base}.hook`, text: chapter.hook })
  })
  src.prose.forEach((p, pi) => {
    if (p && typeof p.content === 'string') segments.push({ path: `chapters.generatedContent[${pi}].content`, text: p.content })
  })
  if (segments.length === 0) return null

  const items: PitfallItem[] = META_NARRATIVE_WORDS.map((term, i) => {
    const hits: string[] = []
    let total = 0
    segments.forEach((seg) => {
      const c = countOccurrences(seg.text, term)
      if (c > 0) { total += c; if (hits.length < 8) hits.push(`${seg.path}(${c})`) }
    })
    const passed = total === 0
    return {
      id: `meta-${i}`,
      severity: 'warn' as PitfallSeverity,
      passed,
      title: passed ? `摘要/钩子无「${term}」` : `摘要/钩子出现「${term}」×${total}`,
      detail: passed ? '未出现元叙述脚手架句' : `出现位置：${hits.join('、')}${total > hits.length ? ' …' : ''}`,
      path: 'chapters.volumes[].chapters[].summary|hook',
    }
  })

  return { key: 'meta', label: '🎬 元叙述检查', items }
}

/** C. 章节标题组 —— 恰 4 汉字 / 全库唯一 / 不与卷名重复 / 无元叙述词。 */
function buildTitleGroup(src: Source): PitfallGroup | null {
  const plans = collectChapterPlans(src.volumes)
  if (plans.length === 0) return null
  const titles = plans.map(({ chapter }) => asString(chapter.title).trim())
  const volNames = new Set(src.volumes.map((v, i) => volumeName(v, i)).map((s) => s.trim()))

  // 恰 4 汉字
  const notFour: string[] = []
  titles.forEach((t) => { if (!CJK_ONLY_4.test(t)) { if (notFour.length < 12) notFour.push(`「${t}」(${t.length}字)`) } })
  const c1 = notFour.length === 0

  // 全库唯一
  const counter: Record<string, number> = {}
  titles.forEach((t) => { if (t) counter[t] = (counter[t] || 0) + 1 })
  const dups = Object.keys(counter).filter((t) => counter[t] > 1)
  const dupDetail = dups.slice(0, 12).map((t) => `「${t}」×${counter[t]}`)
  const c2 = dups.length === 0

  // 不与卷名重复
  const clash: string[] = []
  titles.forEach((t) => { if (t && volNames.has(t) && clash.indexOf(t) === -1) clash.push(t) })
  const c3 = clash.length === 0

  // 不含元叙述词
  const metaHit: string[] = []
  titles.forEach((t) => {
    const m = META_NARRATIVE_WORDS.find((w) => t.indexOf(w) !== -1)
    if (m) metaHit.push(`「${t}」含「${m}」`)
  })
  const c4 = metaHit.length === 0

  const items: PitfallItem[] = [
    {
      id: 'title-four-cjk', severity: 'block', passed: c1,
      title: c1 ? `${titles.length}/${titles.length} 章标题恰为 4 个汉字` : `存在非 4 汉字的章标题（${notFour.length} 个）`,
      detail: c1 ? '全部章标题均为 4 个汉字' : `违规样例：${notFour.join('、')}${notFour.length >= 12 ? ' …' : ''}`,
      path: 'chapters.volumes[].chapters[].title',
    },
    {
      id: 'title-unique', severity: 'warn', passed: c2,
      title: c2 ? `章节标题全库唯一（${titles.length} 条）` : `存在重复标题（${dups.length} 组）`,
      detail: c2 ? '无重复标题' : `重复：${dupDetail.join('、')}${dups.length > 12 ? ' …' : ''}`,
      path: 'chapters.volumes[].chapters[].title',
    },
    {
      id: 'title-vs-volume', severity: 'warn', passed: c3,
      title: c3 ? '章节标题不与卷名重复' : `有 ${clash.length} 个标题与卷名重复`,
      detail: c3 ? '无与卷名相同的标题' : `重复：${clash.join('、')}`,
      path: 'chapters.volumes[].name|chapters.volumes[].chapters[].title',
    },
    {
      id: 'title-no-meta', severity: 'warn', passed: c4,
      title: c4 ? '章节标题不含元叙述词' : `有 ${metaHit.length} 个标题含元叙述词`,
      detail: c4 ? '全部标题干净' : `违规：${metaHit.slice(0, 12).join('、')}`,
      path: 'chapters.volumes[].chapters[].title',
    },
  ]
  return { key: 'titles', label: '🏷️ 章节标题检查', items }
}

/** D. 卷摘要组 —— 清洗后长度 120-180，逐卷判定。 */
function buildVolumeSummaryGroup(src: Source): PitfallGroup | null {
  if (src.volumes.length === 0) return null
  const items: PitfallItem[] = src.volumes.map((v, i) => {
    const raw = asString(v && v.summary)
    const clean = sanitizeVolumeSummary(raw)
    const len = clean.length
    const ok = len >= VOLUME_SUMMARY_MIN && len <= VOLUME_SUMMARY_MAX
    return {
      id: `volsum-${i}`,
      severity: 'warn' as PitfallSeverity,
      passed: ok,
      title: ok
        ? `第${i + 1}卷摘要清洗后 ${len} 字 ✓`
        : `第${i + 1}卷摘要清洗后 ${len} 字（需 ${VOLUME_SUMMARY_MIN}-${VOLUME_SUMMARY_MAX}）`,
      detail: `原始 ${raw.length} 字 → 清洗后 ${len} 字；卷名「${volumeName(v, i)}」`,
      path: `chapters.volumes[${i}].summary`,
    }
  })
  return { key: 'volumeSummary', label: '📜 卷摘要检查', items }
}

/** E. 人物设定组 —— age / 史实生年 / role / arcNodes。 */
function buildCharacterGroup(src: Source): PitfallGroup | null {
  if (src.characters.length === 0) return null

  const ageBad: string[] = []
  const histBad: string[] = []
  const histInfo: string[] = []
  const roleBad: string[] = []
  const arcBad: string[] = []

  src.characters.forEach((c) => {
    const name = asString(c && c.name).trim() || '(无名)'
    const age = normAge(c && c.age)

    const birthUnknown = HISTORICAL_BIRTH_UNKNOWN.indexOf(name) >= 0
    const birth = birthUnknown ? undefined : HISTORICAL_CHAR_BIRTH[name]

    // age 为数字且落在 14-70 —— 仅适用于「非史料定年」角色
    // ⚠️ 史料定年者（如上表 刘文秀 生 1633 → 13 岁）由史料值说话，不受虚构年龄区间约束，
    //    否则会出现「按史料对、却被通用区间判越界」的自相矛盾。缺失值由下方史实分支处理。
    if (birth == null && (age == null || age < AGE_MIN || age > AGE_MAX)) {
      if (ageBad.length < 12) ageBad.push(`${name}:${c && c.age}`)
    }

    // 史实人物按生年 —— 精确口径：必须严格等于 1646-生年（AGE_TOLERANCE = 0）
    // 生年无考者（HISTORICAL_BIRTH_UNKNOWN）不参与判定，也不得为其编造生年
    if (birth != null) {
      const expected = HISTORICAL_BASE_YEAR - birth
      if (age == null) {
        if (histBad.length < 12) histBad.push(`${name}:缺 age（按史料应为 ${expected} 岁，生 ${birth}）`)
      } else if (age !== expected) {
        if (histBad.length < 12) histBad.push(`${name}:现 ${age} 岁，按史料应为 ${expected} 岁（生 ${birth}）`)
      }
    } else if (birthUnknown) {
      histInfo.push(`${name}:${age == null ? '(缺)' : age}(生年无考,不判定)`)
    }

    // role 非空
    if (!asString(c && c.role).trim()) { if (roleBad.length < 12) roleBad.push(name) }

    // arcNodes 非空
    if (!(toArray(c && c.arcNodes).length > 0)) { if (arcBad.length < 12) arcBad.push(name) }
  })

  const items: PitfallItem[] = [
    {
      id: 'char-age-range', severity: 'block', passed: ageBad.length === 0,
      title: ageBad.length === 0 ? `全部 ${src.characters.length} 张人物卡 age 为数字且 ${AGE_MIN}-${AGE_MAX}` : `有 ${ageBad.length} 张卡 age 越界/非数字`,
      detail: ageBad.length === 0 ? '年龄均在合理区间' : `违规：${ageBad.join('、')}${ageBad.length >= 12 ? ' …' : ''}`,
      path: 'characters.*.age',
    },
    {
      id: 'char-age-historical', severity: 'block', passed: histBad.length === 0,
      title: histBad.length === 0 ? '史实人物年龄与生年基准一致' : `有 ${histBad.length} 位史实人物年龄与史料不符`,
      detail: histBad.length === 0
        ? `基准=1646-生年（精确，容差 ${AGE_TOLERANCE}）；生年无考不判定：${histInfo.slice(0, 8).join('、') || '无'}`
        : `不符：${histBad.join('、')}${histBad.length >= 12 ? ' …' : ''}`,
      path: 'characters.*.age',
    },
    {
      id: 'char-role', severity: 'warn', passed: roleBad.length === 0,
      title: roleBad.length === 0 ? '全部人物卡 role 非空' : `有 ${roleBad.length} 张卡 role 为空`,
      detail: roleBad.length === 0 ? '定位字段完整' : `缺失：${roleBad.join('、')}`,
      path: 'characters.*.role',
    },
    {
      id: 'char-arc', severity: 'warn', passed: arcBad.length === 0,
      title: arcBad.length === 0 ? '全部人物卡 arcNodes 非空' : `有 ${arcBad.length} 张卡 arcNodes 为空`,
      detail: arcBad.length === 0 ? '角色弧光节点完整' : `缺失：${arcBad.join('、')}`,
      path: 'characters.*.arcNodes',
    },
  ]
  return { key: 'characters', label: '🎭 人物设定检查', items }
}

/** F. 上游必填组 —— 8 个设计字段非空且达实质长度（原假规则的真实化落点）。 */
function buildUpstreamGroup(src: Source): PitfallGroup | null {
  if (!src.hasDesign) return null
  const items: PitfallItem[] = UPSTREAM_FIELDS.map((f) => {
    const raw = src.design[f.key]
    const text = flattenText(raw).replace(/\s+/g, ' ').trim()
    const len = text.length
    const present = raw != null && len > 0
    const ok = present && len >= f.min
    return {
      id: `upstream-${f.key}`,
      severity: 'block' as PitfallSeverity,
      passed: ok,
      title: ok ? `${f.label}已填写（${len} 字）` : `${f.label}${present ? '内容过短' : '缺失'}（${len} 字 / 需 ${f.min}+）`,
      detail: ok ? '字段非空且达实质长度' : (present ? `当前 ${len} 字，低于下限 ${f.min} 字` : '字段为空或未生成'),
      path: f.key,
    }
  })
  return { key: 'upstream', label: '🧱 上游必填检查', items }
}

/** G. 白金标准组 —— 源自 PLATINUM_STANDARDS_PREFIX 的可判定启发式。 */
function buildPlatinumGroup(src: Source): PitfallGroup | null {
  const plans = collectChapterPlans(src.volumes)
  if (plans.length === 0) return null
  const total = plans.length

  const noShuang: string[] = []
  const noHook: string[] = []
  const noConflict: string[] = []
  const badIntensity: string[] = []
  let volOpeningMissing = 0

  plans.forEach(({ volIndex, chapter }, ci) => {
    const tag = `v${volIndex + 1}c${ci + 1}:${asString(chapter.title) || '?'}`
    if (toArray(chapter.shuangPoints).length === 0) { if (noShuang.length < 12) noShuang.push(tag) }
    if (!asString(chapter.hook).trim()) { if (noHook.length < 12) noHook.push(tag) }
    const hasConflict = asString(chapter.conflict).trim().length > 0 || asString(chapter.turningPoint).trim().length > 0
    if (!hasConflict) { if (noConflict.length < 12) noConflict.push(tag) }
    if (chapter.intensity != null) {
      const n = Number(chapter.intensity)
      if (!isFinite(n) || n < 1 || n > 10) { if (badIntensity.length < 12) badIntensity.push(`${tag}:${chapter.intensity}`) }
    }
  })

  // 各卷首章开篇钩子
  src.volumes.forEach((v) => {
    const first = toArray(v && v.chapters)[0]
    if (!first || !asString(first.hook).trim()) volOpeningMissing++
  })

  const items: PitfallItem[] = [
    {
      id: 'platinum-shuang', severity: 'warn', passed: noShuang.length === 0,
      title: noShuang.length === 0 ? `每章均有爽点（${total}/${total}）` : `有 ${noShuang.length} 章无爽点`,
      detail: noShuang.length === 0 ? '章节爽点密度达标' : `缺爽点：${noShuang.join('、')}${noShuang.length >= 12 ? ' …' : ''}`,
      path: 'chapters.volumes[].chapters[].shuangPoints',
    },
    {
      id: 'platinum-hook', severity: 'warn', passed: noHook.length === 0,
      title: noHook.length === 0 ? `每章均有章末钩子（${total}/${total}）` : `有 ${noHook.length} 章无钩子`,
      detail: noHook.length === 0 ? '章节留存钩子达标' : `缺钩子：${noHook.join('、')}${noHook.length >= 12 ? ' …' : ''}`,
      path: 'chapters.volumes[].chapters[].hook',
    },
    {
      id: 'platinum-conflict', severity: 'warn', passed: noConflict.length === 0,
      title: noConflict.length === 0 ? `每章均有冲突/转折（${total}/${total}）` : `有 ${noConflict.length} 章无冲突/转折`,
      detail: noConflict.length === 0 ? '冲突密度达标' : `缺冲突：${noConflict.join('、')}${noConflict.length >= 12 ? ' …' : ''}`,
      path: 'chapters.volumes[].chapters[].conflict|turningPoint',
    },
    {
      id: 'platinum-opening', severity: 'warn', passed: volOpeningMissing === 0,
      title: volOpeningMissing === 0 ? '各卷首章均有开篇钩子' : `有 ${volOpeningMissing} 卷首章缺开篇钩子`,
      detail: volOpeningMissing === 0 ? '卷首钩子齐全' : '存在缺失开篇钩子的卷',
      path: 'chapters.volumes[].chapters[0].hook',
    },
    {
      id: 'platinum-intensity', severity: 'info', passed: badIntensity.length === 0,
      title: badIntensity.length === 0 ? '章节强度值均在 1-10' : `有 ${badIntensity.length} 章强度值越界`,
      detail: badIntensity.length === 0 ? '强度区间正常' : `越界：${badIntensity.join('、')}`,
      path: 'chapters.volumes[].chapters[].intensity',
    },
  ]
  return { key: 'platinum', label: '💎 白金标准检查', items }
}

// ─────────────────────────────────────────────────────────────────────────────
// 入口
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 运行全环节避坑检查。
 *
 * @param data 整包生成数据（generatedData）。也兼容仅含
 *   `{ chapters: { generatedContent: [...] } }` 的「仅正文」降级输入。
 * @returns 分组结果 + 汇总（total / passed / failed / block）。
 */
export function runPitfallCheck(data: any): PitfallResult {
  const src = extractSource(data)

  const groups: PitfallGroup[] = []
  groups.push(buildComplianceGroup(src))
  const meta = buildMetaGroup(src); if (meta) groups.push(meta)
  const titles = buildTitleGroup(src); if (titles) groups.push(titles)
  const volsum = buildVolumeSummaryGroup(src); if (volsum) groups.push(volsum)
  const chars = buildCharacterGroup(src); if (chars) groups.push(chars)
  const upstream = buildUpstreamGroup(src); if (upstream) groups.push(upstream)
  const platinum = buildPlatinumGroup(src); if (platinum) groups.push(platinum)

  let total = 0
  let passed = 0
  let block = 0
  groups.forEach((g) => {
    g.items.forEach((it) => {
      total++
      if (it.passed) passed++
      else if (it.severity === 'block') block++
    })
  })

  return {
    groups,
    summary: { total, passed, failed: total - passed, block },
  }
}

export default runPitfallCheck
