/**
 * repairPlan.ts —— B2「全链路一键修复」共享计划 / 补丁引擎（纯函数，零依赖）
 *
 * 硬约束（SPEC §1.5）：
 *   1. 零 Next.js / React / node:fs 依赖 —— 必须能同时被 route.ts（服务端）与
 *      'use client' 组件 import。因此 A 类确定性修复应**优先在客户端本地执行**（零网络）。
 *   2. 只允许 import `./pitfallRules`（复用其真实判定与常量口径）。
 *
 * ── 设计要点 ──────────────────────────────────────────────────────────────────
 *   `runPitfallCheck` 返回的 PitfallItem.path **绝大多数是「组级粗粒度通配路径」**，
 *   例如：`chapters.volumes[].chapters[].title`、`chapters.volumes[].chapters[].summary|hook`、
 *   `characters.*.age`、`idea|synopsis|worldbuilding|...`。仅 `volumeSummary` 组使用
 *   **具体下标**路径 `chapters.volumes[i].summary`（逐条核对真实取值，非臆造）。
 *
 *   而 RepairPatch.path 必须能被客户端 `applyPatches()` 定位（setByPath 只支持 `.key` 与
 *   `[i]`，**不支持**通配），因此 `buildRepairPlan()` 把粗粒度通配路径**展开为具体下标路径**，
 *   使 `request.path === patch.path === 可定位路径`。一个判定命中多处 → 展开为多个
 *   RepairPlanItem（共享同一 `id`，`path` 不同，靠稳定唯一 `key` 区分）。
 *
 *   `key` 规则：`RepairPlanItem.key = \`${id}#${path}\``（全局唯一，供 UI 做 React key）。
 *   `RepairPatch.key` 与对应 plan item 的 `key` 一致。
 *
 * ── 所有 RepairFailure.reason 取值登记（不得出现未登记的 reason）─────────────────
 *   本模块导出常量 `REPAIR_REASONS`，取值全集：
 *     · no-unique-title-candidate          标题候选全库撞名、候选池用尽
 *     · volume-summary-unfixable           卷摘要无法裁定到 120-180
 *     · no-deterministic-target            粗粒度路径无法展开为具体目标
 *     · compliance-residual                合规替换后仍残留红线词
 *     · needs-llm                          A 类无解，需升级 LLM（characters role/arc/age-range）
 *     · upstream-object-field-needs-llm    对象型上游字段不宜整体覆写为字符串
 *     · upstream-derivation-insufficient   上游确定性派生未达 min
 *     · unsupported-non-string-field       数组/结构字段无法用 string 补丁承载（B 类）
 *     · timeout                            单条 LLM 超时 / 单批预算耗尽
 *     · error:<msg>                        内部异常（前缀）
 *   路由层另有（见 route.ts 头部登记）：no-llm-config / llm-invalid-title /
 *   llm-invalid-volume-summary / llm-invalid-output / llm-error:<msg>
 */

import {
  runPitfallCheck,
  sanitizeVolumeSummary,
  HISTORICAL_CHAR_BIRTH,
  HISTORICAL_BIRTH_UNKNOWN,
  HISTORICAL_BASE_YEAR,
  AGE_MIN,
  AGE_MAX,
  COMPLIANCE_RED_WORDS,
  META_NARRATIVE_WORDS,
  UPSTREAM_FIELDS,
  VOLUME_SUMMARY_MIN,
  VOLUME_SUMMARY_MAX,
  type PitfallItem,
} from './pitfallRules'

// ─────────────────────────────────────────────────────────────────────────────
// 类型（SPEC §1.5 冻结签名 + key 扩展）
// ─────────────────────────────────────────────────────────────────────────────

export type RepairMethod = 'deterministic' | 'llm'

export interface RepairPlanItem {
  id: string
  group: string
  path: string
  /** 稳定唯一标识，形如 `${id}#${path}`；供 UI 做 React key / 失败项去重 */
  key: string
  title: string
  detail: string
  method: RepairMethod
}

export interface RepairPatch {
  id: string
  path: string
  op: 'set' | 'delete'
  value: string
  method: RepairMethod
  /** 与对应 RepairPlanItem.key 一致（一一对应） */
  key?: string
  note?: string
}

export interface RepairFailure {
  id: string
  reason: string
}

/** 修复上下文构造选项。 */
export interface RepairContextOptions {
  /** true ⇒ 生成「只保留 B 类 LLM 修复所需最小字段」的瘦上下文（目标 < 60KB）。 */
  slim?: boolean
  /** slim 模式下需保留的条目（来自 buildRepairPlan 的 auto/llm/items）。 */
  items?: RepairPlanItem[]
}

/** 全部 RepairFailure.reason 取值（登记表，禁止散落裸串）。 */
export const REPAIR_REASONS = {
  NO_UNIQUE_TITLE: 'no-unique-title-candidate',
  VOLUME_SUMMARY_UNFIXABLE: 'volume-summary-unfixable',
  NO_DETERMINISTIC_TARGET: 'no-deterministic-target',
  COMPLIANCE_RESIDUAL: 'compliance-residual',
  NEEDS_LLM: 'needs-llm',
  UPSTREAM_OBJECT_FIELD: 'upstream-object-field-needs-llm',
  UPSTREAM_DERIVATION: 'upstream-derivation-insufficient',
  UNSUPPORTED_NON_STRING: 'unsupported-non-string-field',
  TIMEOUT: 'timeout',
} as const

export type RepairReason = (typeof REPAIR_REASONS)[keyof typeof REPAIR_REASONS]

// ─────────────────────────────────────────────────────────────────────────────
// 基础工具（本地重实现：pitfallRules 未导出这些内部函数）
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

/** 递归展平任意嵌套值为字符串（跳过内部修订键），用于派生与合规扫描。 */
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

function isFourCJK(t: string): boolean {
  return CJK_ONLY_4.test(asString(t).trim())
}

function isWildPath(path: string): boolean {
  const p = asString(path)
  return p.indexOf('[]') !== -1 || p.indexOf('*') !== -1 || p.indexOf('|') !== -1
}

function indexFromId(id: string, prefix: string): number | null {
  const s = asString(id)
  if (s.indexOf(prefix) !== 0) return null
  const n = Number(s.slice(prefix.length))
  return isFinite(n) ? n : null
}

function keyFromId(id: string, prefix: string): string | null {
  const s = asString(id)
  if (s.indexOf(prefix) !== 0) return null
  return s.slice(prefix.length)
}

function parentPath(path: string): string {
  const p = asString(path)
  const dot = p.lastIndexOf('.')
  return dot >= 0 ? p.slice(0, dot) : ''
}

function containsAnyWord(text: string, words: string[]): boolean {
  const t = asString(text)
  for (const w of words) if (w && t.indexOf(w) !== -1) return true
  return false
}

/** 稳定唯一 key：`${id}#${path}`。 */
function itemKey(id: string, path: string): string {
  return asString(id) + '#' + asString(path)
}

// ─────────────────────────────────────────────────────────────────────────────
// path 解析 / 读写（支持 .key 与 [i] 混合）
// ─────────────────────────────────────────────────────────────────────────────

type PathTok = { key: string } | { index: number }

function parsePath(path: string): PathTok[] {
  const out: PathTok[] = []
  const s = asString(path)
  let buf = ''
  const flush = () => { if (buf.length) { out.push({ key: buf }); buf = '' } }
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '.') { flush(); i++; continue }
    if (ch === '[') {
      flush()
      const close = s.indexOf(']', i)
      if (close === -1) { buf += ch; i++; continue }
      const inner = s.slice(i + 1, close)
      if (inner === '') out.push({ index: -1 })
      else { const n = Number(inner); out.push({ index: isNaN(n) ? -1 : n }) }
      i = close + 1
      continue
    }
    buf += ch
    i++
  }
  flush()
  return out
}

/** 按 path 取值；`[]` 通配（index=-1）返回 undefined。 */
export function getByPath(obj: any, path: string): any {
  const toks = parsePath(path)
  let cur = obj
  for (const t of toks) {
    if (cur == null) return undefined
    if ('index' in t) {
      if (t.index < 0) return undefined
      cur = cur[t.index]
    } else {
      cur = cur[t.key]
    }
  }
  return cur
}

/** 按 path 写值；自动创建中间容器（数组 / 对象）。`[]` 通配位不可写，静默跳过。 */
const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']
export function setByPath(obj: any, path: string, value: any): void {
  const toks = parsePath(path)
  if (toks.length === 0 || obj == null) return
  // 🔥 修复（P1 原型污染）：path 直接来自请求体（/api/ai/repair-all），旧实现无任何键名限制，
  //   '__proto__.x' 会写穿 Object.prototype 污染整个 Node 进程。
  if (toks.some((t: any) => 'key' in t && UNSAFE_KEYS.indexOf(String(t.key)) !== -1)) {
    console.warn('[repairPlan] 拒绝不安全的写入路径: ' + path)
    return
  }
  let cur = obj
  for (let i = 0; i < toks.length - 1; i++) {
    const t = toks[i]
    const next = toks[i + 1]
    const nextIsIndex = 'index' in next
    if ('index' in t) {
      if (t.index < 0) return
      if (cur[t.index] == null) cur[t.index] = nextIsIndex ? [] : {}
      cur = cur[t.index]
    } else {
      if (cur[t.key] == null) cur[t.key] = nextIsIndex ? [] : {}
      cur = cur[t.key]
    }
  }
  const last = toks[toks.length - 1]
  if ('index' in last) {
    if (last.index >= 0 && cur) cur[last.index] = value
  } else if (cur) {
    cur[last.key] = value
  }
}

function deleteByPath(obj: any, path: string): void {
  const toks = parsePath(path)
  if (toks.length === 0 || obj == null) return
  let cur = obj
  for (let i = 0; i < toks.length - 1; i++) {
    const t = toks[i]
    if ('index' in t) {
      if (t.index < 0) return
      cur = cur[t.index]
    } else {
      cur = cur[t.key]
    }
    if (cur == null) return
  }
  const last = toks[toks.length - 1]
  if ('index' in last) {
    if (last.index >= 0 && cur) {
      if (Array.isArray(cur)) cur.splice(last.index, 1)
      else delete cur[last.index]
    }
  } else if (cur) {
    delete cur[last.key]
  }
}

/** 深拷贝（JSON 安全即可）；不可序列化时退化为浅拷贝。 */
export function cloneData(data: any): any {
  if (data == null) return data
  try {
    return JSON.parse(JSON.stringify(data))
  } catch (_e) {
    if (Array.isArray(data)) return data.slice()
    if (isObj(data)) return Object.assign({}, data)
    return data
  }
}

/** 写入工作副本时保持数值型字段类型（age / intensity 等）。 */
function writeWorkValue(work: any, path: string, value: any): void {
  const prev = getByPath(work, path)
  let v: any = value
  if (typeof prev === 'number' && typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) v = Number(v)
  setByPath(work, path, v)
}

/**
 * 按 path 把 patches 应用到 data 的深拷贝，返回新对象；**不修改入参**。
 * 若目标字段原值为 number 且新值为纯数字字符串，则维持 number 类型。
 */
export function applyPatches(data: any, patches: RepairPatch[]): any {
  const out = cloneData(data)
  toArray(patches).forEach((p) => {
    if (!p || !p.path) return
    if (p.op === 'delete') { deleteByPath(out, p.path); return }
    writeWorkValue(out, p.path, p.value)
  })
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 数据遍历（章 / 卷 / 人物，均带具体下标 path）
// ─────────────────────────────────────────────────────────────────────────────

interface ChapterRef {
  volIndex: number
  chIndex: number
  vol: any
  chapter: any
  titlePath: string
  summaryPath: string
  hookPath: string
}

function volumeList(data: any): any[] {
  const d = isObj(data) ? data : {}
  const chapters = isObj(d.chapters) ? d.chapters : {}
  const vols = toArray(chapters.volumes)
  return vols.length > 0 ? vols : toArray(d.volumes)
}

function collectChapters(data: any): ChapterRef[] {
  const out: ChapterRef[] = []
  volumeList(data).forEach((v, vi) => {
    toArray(v && v.chapters).forEach((c, ci) => {
      if (!isObj(c)) return
      const base = `chapters.volumes[${vi}].chapters[${ci}]`
      out.push({
        volIndex: vi, chIndex: ci, vol: v, chapter: c,
        titlePath: `${base}.title`,
        summaryPath: `${base}.summary`,
        hookPath: `${base}.hook`,
      })
    })
  })
  return out
}

/**
 * 全库卷名。优先读取瘦上下文携带的 `volumeNames`（slim 模式），否则从卷结构派生。
 */
function collectVolumeNames(data: any): string[] {
  if (isObj(data) && Array.isArray(data.volumeNames) && data.volumeNames.length > 0) {
    return data.volumeNames.map((s: any) => asString(s).trim())
  }
  return volumeList(data).map((v, i) => {
    const n = asString(v && v.name).trim()
    return n || ('第' + (i + 1) + '卷')
  })
}

/**
 * 全库章标题。优先读取瘦上下文携带的 `titles`（slim 模式），否则从卷结构派生。
 * ⚠️ 标题全库唯一校验依赖此列表完整性。
 */
function collectAllTitles(data: any): string[] {
  if (isObj(data) && Array.isArray(data.titles) && data.titles.length > 0) {
    return data.titles.map((t: any) => asString(t).trim()).filter(Boolean)
  }
  const out: string[] = []
  collectChapters(data).forEach((c) => { const t = asString(c.chapter.title).trim(); if (t) out.push(t) })
  return out
}

interface CharRef { path: string; char: any }

function collectChars(data: any): CharRef[] {
  const d = isObj(data) ? data : {}
  const chars = isObj(d.characters) ? d.characters : null
  const out: CharRef[] = []
  if (!chars) return out
  ;['protagonist', 'femaleLead', 'antagonist'].forEach((k) => {
    if (isObj(chars[k])) out.push({ path: `characters.${k}`, char: chars[k] })
  })
  ;['femaleLeads', 'antagonists', 'supporting'].forEach((k) => {
    toArray(chars[k]).forEach((c, i) => { if (isObj(c)) out.push({ path: `characters.${k}[${i}]`, char: c }) })
  })
  return out
}

interface LeafTarget { path: string; text: string }

/** 展开任意值为若干「字符串叶子」并附带具体下标 path（用于对象型字段的安全清洗）。 */
function collectStringLeaves(value: any, basePath: string, depth = 0, seen?: Set<any>): LeafTarget[] {
  if (depth > 8) return []
  if (typeof value === 'string') return [{ path: basePath, text: value }]
  if (!isObj(value)) return []
  const _seen = seen || new Set<any>()
  if (_seen.has(value)) return []
  _seen.add(value)
  const out: LeafTarget[] = []
  if (Array.isArray(value)) {
    value.forEach((v, i) => { collectStringLeaves(v, `${basePath}[${i}]`, depth + 1, _seen).forEach((x) => out.push(x)) })
  } else {
    Object.keys(value).forEach((k) => {
      collectStringLeaves(value[k], `${basePath}.${k}`, depth + 1, _seen).forEach((x) => out.push(x))
    })
  }
  return out
}

interface TextSegment { path: string; text: string }

/** 合规扫描段（与 pitfallRules.buildComplianceGroup 的 segment 口径一致，带具体 path）。 */
function collectComplianceSegments(data: any): TextSegment[] {
  const d = isObj(data) ? data : {}
  const segs: TextSegment[] = []
  UPSTREAM_FIELDS.forEach((f) => {
    if (d[f.key] != null) segs.push({ path: f.key, text: flattenText(d[f.key]) })
  })
  volumeList(data).forEach((v, vi) => {
    if (v && typeof v.summary === 'string') segs.push({ path: `chapters.volumes[${vi}].summary`, text: v.summary })
    if (v && typeof v.coreObjective === 'string') segs.push({ path: `chapters.volumes[${vi}].coreObjective`, text: v.coreObjective })
    if (v && typeof v.name === 'string') segs.push({ path: `chapters.volumes[${vi}].name`, text: v.name })
  })
  collectChapters(data).forEach((c) => {
    const base = `chapters.volumes[${c.volIndex}].chapters[${c.chIndex}]`
    const deepKeys = ['title', 'summary', 'hook', 'turningPoint', '_llmTitle', 'payoff', 'foreshadowing', 'conflict']
    deepKeys.forEach((k) => {
      if (typeof c.chapter[k] === 'string' && c.chapter[k]) segs.push({ path: `${base}.${k}`, text: c.chapter[k] })
    })
    toArray(c.chapter.shuangPoints).forEach((sp, si) => {
      if (typeof sp === 'string' && sp) segs.push({ path: `${base}.shuangPoints[${si}]`, text: sp })
    })
  })
  const chapters = isObj(d.chapters) ? d.chapters : {}
  const prose = toArray(chapters.generatedContent).length > 0 ? toArray(chapters.generatedContent) : toArray(d.generatedContent)
  prose.forEach((p, pi) => {
    if (p && typeof p.content === 'string' && p.content) segs.push({ path: `chapters.generatedContent[${pi}].content`, text: p.content })
  })
  return segs
}

/** 元叙述扫描段（仅章摘要 / 钩子，**不含正文**——保护全书最贵资产）。 */
function collectMetaSegments(data: any): TextSegment[] {
  const segs: TextSegment[] = []
  collectChapters(data).forEach((c) => {
    const base = `chapters.volumes[${c.volIndex}].chapters[${c.chIndex}]`
    if (typeof c.chapter.summary === 'string') segs.push({ path: `${base}.summary`, text: c.chapter.summary })
    if (typeof c.chapter.hook === 'string') segs.push({ path: `${base}.hook`, text: c.chapter.hook })
  })
  return segs
}

// ─────────────────────────────────────────────────────────────────────────────
// 合规替换表（口径对齐 _recon/fix223a.cjs 的 COMPLIANCE 表；长优先）
//   补全 COMPLIANCE_RED_WORDS 中 fix223a 未覆盖的词：屠杀 / 满清余孽 / 设省 /
//   日不落 / 甲午 / 灭族。所有替换结果**不含任何红线词**。
// ─────────────────────────────────────────────────────────────────────────────

const COMPLIANCE_REPLACEMENTS: [RegExp, string][] = [
  [/灭族满清/g, '底定辽东'],
  [/满汉存亡之争/g, '治统之争'],
  [/满汉存亡/g, '治统存亡'],
  [/驱逐鞑虏/g, '安定天下'],
  [/满清余孽/g, '清廷余党'],
  [/鞑虏/g, '清廷'],
  [/异族殖民/g, '清廷入主'],
  [/异族/g, '关外'],
  [/低维文明之争/g, '治统与道统之争'],
  [/低维文明/g, '旧制窠臼'],
  [/民族存亡/g, '国祚存亡'],
  [/民族尊严/g, '华夏衣冠'],
  [/南京条约[^。；\n]*[。；]?/g, ''],
  [/英法联军[^。；\n]*[。；]?/g, ''],
  [/甲午战争[^。；\n]*[。；]?/g, ''],
  [/甲午[^。；\n]*[。；]?/g, ''],
  [/八国联军[^。；\n]*[。；]?/g, ''],
  [/南京大屠杀[^。；\n]*[。；]?/g, ''],
  [/屠杀/g, '屠戮'],
  [/日不落/g, '万世'],
  [/设省/g, '置省'],
  [/灭族/g, '倾覆'],
  [/荷兰殖民者/g, '荷兰东印度公司'],
  [/西班牙殖民者/g, '西班牙舰队'],
  [/葡萄牙殖民者/g, '葡萄牙舰队'],
  [/殖民全球/g, '经略四海'],
  [/殖民澳洲/g, '经略澳洲'],
  [/非洲殖民扩张/g, '非洲拓土'],
  [/殖民扩张/g, '拓土开疆'],
  [/殖民地/g, '海外行省'],
  [/殖民点/g, '商埠'],
  [/殖民者/g, '泰西势力'],
  [/殖民/g, '经略'],
]

function applyComplianceTable(raw: string): { text: string; changed: boolean } {
  let t = asString(raw)
  const before = t
  for (const [re, rep] of COMPLIANCE_REPLACEMENTS) t = t.replace(re, rep)
  if (t !== before) t = normalizeLightPunct(t)
  return { text: t, changed: t !== before }
}

/** 轻度标点收敛（删除型替换后使用，避免留下「，。」等病句）。 */
function normalizeLightPunct(raw: string): string {
  let t = asString(raw)
  for (let r = 0; r < 2; r++) {
    t = t
      .replace(/[，,]\s*[。]/g, '。')
      .replace(/[。]\s*[，,]/g, '。')
      .replace(/[，,]{2,}/g, '，')
      .replace(/[；;]{2,}/g, '；')
      .replace(/[。]{2,}/g, '。')
      .replace(/^\s*[，,；;。]+/, '')
  }
  return t.trim()
}

/** 去除元叙述脚手架句（长词优先，避免「为下一章」被「下一章」拆残）。 */
function stripMetaWords(raw: string): string {
  let t = asString(raw)
  const words = META_NARRATIVE_WORDS.slice().sort((a, b) => b.length - a.length)
  for (const w of words) t = t.split(w).join('')
  t = t.replace(/^[的为]\s*/, '')
  t = normalizeLightPunct(t)
  return t
}

// ─────────────────────────────────────────────────────────────────────────────
// 标题候选生成器 —— 仅「地名(+方位)」或「事件词+安全后缀」，
//   严禁「主体+随机动词」组合（会产生「清军设省」类病句）。
// ─────────────────────────────────────────────────────────────────────────────

const GEO_TERMS: string[] = [
  '肇庆', '桂林', '昆明', '扬州', '长沙', '广州', '衡州', '岳州', '梧州', '韶州',
  '惠州', '潮州', '雷州', '柳州', '南宁', '全州', '永州', '郴州', '宝庆', '武冈',
  '靖州', '沅州', '辰州', '常德', '荆州', '襄阳', '武昌', '汉阳', '黄州', '安庆',
  '徽州', '池州', '宁国', '杭州', '嘉兴', '湖州', '绍兴', '宁波', '台州', '温州',
  '福州', '泉州', '漳州', '汀州', '延平', '邵武', '赣州', '吉安', '袁州', '抚州',
  '建昌', '广信', '饶州', '南康', '九江', '南昌', '瑞州', '汉中', '商州', '西安',
  '凤翔', '延安', '平凉', '兰州', '甘州', '肃州', '宁夏', '榆林', '大同', '太原',
  '平阳', '汾州', '宣府', '蓟州', '保定', '真定', '顺德', '广平', '大名', '河间',
  '天津', '南阳', '归德', '汝宁', '开封', '洛阳', '郧阳', '承天', '德安', '临安',
  '衢州', '严州', '金华', '处州', '广德', '和州', '庐州', '凤阳', '徐州', '淮安',
  '济宁', '济南', '青州', '莱州', '登州', '辽东', '锦州', '宁远',
]

const DIRECTIONS: string[] = [
  '以东', '以西', '以南', '以北', '之东', '之西', '之南', '之北',
  '城下', '城关', '江畔', '渡口', '要冲',
]

const EVENT_TERMS: string[] = [
  '北伐', '南征', '东讨', '西征', '勤王', '靖难', '决战', '会战', '运筹', '定策',
  '定鼎', '立国', '中兴', '复国', '整军', '练兵', '筹饷', '议和', '招降', '纳降',
  '平叛', '平乱', '戡乱', '讨逆', '讨贼', '剿寇', '安边', '拓土', '开疆', '经略',
  '通商', '遣使', '结盟', '削藩', '夺权', '勤政', '变法', '革新', '整饬', '改元',
  '登极', '承统', '定都', '迁都', '巡狩', '亲征', '誓师', '出师', '班师', '献捷',
  '报捷', '大捷', '突围', '设伏', '劫营', '朝议', '廷议', '会盟', '册封', '赐爵',
  '封赏', '立储', '监国', '摄政', '东宫', '储位', '军心', '民心', '人心', '将略',
  '庙算', '边情', '海防', '漕运', '盐铁', '屯田', '开科', '清丈', '颁诏', '讨伐',
  '宣威', '定乱',
]

const SAFE_SUFFIXES: string[] = ['之变', '之争', '新政', '初定', '改制']

const GENERIC_TITLES: string[] = [
  '大势初定', '变局初开', '暗流初定', '风云初定', '乱局初定', '波澜初起',
  '潜流暗涌', '山河初定', '基业初定', '国祚初定', '天下初定', '局面初开',
  '人心初安', '新局初定', '远略初定', '草蛇灰线',
]

/** 预生成全部候选（固定顺序，确定性），过滤红线 / 元叙述词 / 非法组合。 */
function buildTitleCandidatePool(): string[] {
  const raw: string[] = []
  for (const g of GEO_TERMS) for (const d of DIRECTIONS) raw.push(g + d)
  for (const e of EVENT_TERMS) for (const s of SAFE_SUFFIXES) raw.push(e + s)
  for (const x of GENERIC_TITLES) raw.push(x)
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of raw) {
    if (!isFourCJK(c)) continue
    if (seen.has(c)) continue
    if (containsAnyWord(c, COMPLIANCE_RED_WORDS)) continue
    if (containsAnyWord(c, META_NARRATIVE_WORDS)) continue
    seen.add(c)
    out.push(c)
  }
  return out
}

const TITLE_CANDIDATES: string[] = buildTitleCandidatePool()

interface RepairContext {
  usedTitles: Set<string>
  volNames: Set<string>
  titleCursor: number
  patchIndex: Map<string, number>
}

/** 从候选池按 cursor 顺序取第一个「全局唯一且不是卷名」的标题；用尽返回 null。 */
function nextUniqueTitle(used: Set<string>, volNames: Set<string>, cursorRef: { value: number }): string | null {
  const n = TITLE_CANDIDATES.length
  if (n === 0) return null
  for (let step = 0; step < n; step++) {
    const idx = (cursorRef.value + step) % n
    const cand = TITLE_CANDIDATES[idx]
    if (volNames.has(cand)) continue
    if (used.has(cand)) continue
    cursorRef.value = (idx + 1) % n
    used.add(cand)
    return cand
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// A 类修复原语：卷摘要 / 上游派生 / 人物年龄
// ─────────────────────────────────────────────────────────────────────────────

/** 从卷内各章的摘要 / 钩子中抽取可安全拼接的「实义句」（sanitize 稳定）。 */
function buildVolumeFillers(vol: any, existing: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  toArray(vol && vol.chapters).forEach((c) => {
    if (!isObj(c)) return
    const candidates: string[] = []
    if (typeof c.summary === 'string') candidates.push(c.summary)
    if (typeof c.hook === 'string') candidates.push(c.hook)
    if (typeof c.payoff === 'string') candidates.push(c.payoff)
    toArray(c.keyEvents).forEach((k) => { if (typeof k === 'string') candidates.push(k) })
    candidates.forEach((text) => {
      asString(text).split(/(?<=[。！？])/g).forEach((p) => {
        const s = p.trim()
        if (s.length < 10) return
        if (existing.indexOf(s) !== -1) return
        if (seen.has(s)) return
        if (containsAnyWord(s, META_NARRATIVE_WORDS)) return
        if (containsAnyWord(s, COMPLIANCE_RED_WORDS)) return
        if (sanitizeVolumeSummary(s) !== s) return
        seen.add(s)
        out.push(s)
      })
    })
  })
  return out
}

const VOLUME_SUMMARY_GENERIC_FILLERS: string[] = [
  '局势在明暗之间悄然推移，各方角力次第浮现，前路仍未分明。',
  '诸般事态层层推进，人物抉择与大局消长彼此牵动，悬念渐次收拢。',
  '旧有格局被逐步撬动，新的变量接连入局，走势愈发难以预料。',
  '朝野内外的角力未见停歇，每一步落子都在改写接下来的走向。',
]

/** 截断到 <= max，尽量落在句读边界；返回长度必然 <= max。 */
function cutToMax(s: string, max: number): string {
  if (s.length <= max) return s
  const region = s.slice(0, max)
  let cut = -1
  for (let i = region.length - 1; i >= 0; i--) {
    if ('。！？'.indexOf(region[i]) !== -1) { cut = i; break }
  }
  if (cut >= VOLUME_SUMMARY_MIN - 1) return region.slice(0, cut + 1)
  return s.slice(0, Math.max(1, max - 1)) + '。'
}

function isVolSumInRange(s: string): boolean {
  return s.length >= VOLUME_SUMMARY_MIN && s.length <= VOLUME_SUMMARY_MAX
}

/**
 * 卷摘要确定性修复：sanitize 同口径复算，然后裁定到 [120,180]。
 * 过长 → 句读边界截断；过短 → 优先拼接卷内真实章摘要句，不足再用通用兜底句。
 */
function fixVolumeSummaryLength(raw: any, vol: any): { value: string; ok: boolean } {
  let s = sanitizeVolumeSummary(asString(raw))
  if (s.length > VOLUME_SUMMARY_MAX) s = cutToMax(s, VOLUME_SUMMARY_MAX)
  if (isVolSumInRange(s)) return { value: s, ok: true }

  if (s.length < VOLUME_SUMMARY_MIN) {
    const fillers = buildVolumeFillers(vol, s)
    for (let i = 0; i < fillers.length && s.length < VOLUME_SUMMARY_MIN; i++) {
      const cand = s + (s && !/[。！？…]$/.test(s) ? '。' : '') + fillers[i]
      const next = sanitizeVolumeSummary(cand)
      s = next.length >= s.length ? next : cand
    }
    for (let i = 0; i < VOLUME_SUMMARY_GENERIC_FILLERS.length && s.length < VOLUME_SUMMARY_MIN; i++) {
      const cand = s + (s && !/[。！？…]$/.test(s) ? '。' : '') + VOLUME_SUMMARY_GENERIC_FILLERS[i]
      const next = sanitizeVolumeSummary(cand)
      s = next.length >= s.length ? next : cand
    }
  }

  if (s.length > VOLUME_SUMMARY_MAX) s = cutToMax(s, VOLUME_SUMMARY_MAX)

  const re = sanitizeVolumeSummary(s)
  if (isVolSumInRange(re)) return { value: re, ok: true }
  if (isVolSumInRange(s)) return { value: s, ok: true }
  return { value: re.length >= s.length ? re : s, ok: false }
}

const UPSTREAM_SOURCES: Record<string, string[]> = {
  idea: ['synopsis', 'outline', 'worldbuilding'],
  synopsis: ['idea', 'outline', 'keyPlots'],
  worldbuilding: ['idea', 'factions', 'powerSystem'],
  powerSystem: ['worldbuilding', 'characters'],
  factions: ['worldbuilding', 'relationships'],
  relationships: ['characters', 'factions'],
  keyPlots: ['outline', 'synopsis'],
  outline: ['synopsis', 'keyPlots'],
}

function deriveUpstreamValue(data: any, key: string): string | null {
  const field = UPSTREAM_FIELDS.find((f) => f.key === key)
  const min = field ? field.min : 60
  const d = isObj(data) ? data : {}
  const picks = UPSTREAM_SOURCES[key] || []
  let text = ''
  for (const k of picks) {
    const v = k === 'characters' ? d.characters : d[k]
    if (v == null) continue
    const t = flattenText(v).replace(/\s+/g, ' ').trim()
    if (!t) continue
    text = text ? (text + ' ' + t) : t
    if (text.length >= min) break
  }
  if (text.length < min) return null
  const cap = min + 300
  return text.length > cap ? text.slice(0, cap) : text
}

function normNum(raw: any): number | null {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(/[^\d.]/g, ''))
  return isFinite(n) && n > 0 ? n : null
}

function historicalAgeTargets(data: any): { path: string; expected: number }[] {
  const out: { path: string; expected: number }[] = []
  collectChars(data).forEach((c) => {
    const name = asString(c.char && c.char.name).trim()
    if (!name) return
    if (HISTORICAL_BIRTH_UNKNOWN.indexOf(name) >= 0) return
    const birth = HISTORICAL_CHAR_BIRTH[name]
    if (birth == null) return
    const expected = HISTORICAL_BASE_YEAR - birth
    const n = normNum(c.char.age)
    if (n == null || n !== expected) out.push({ path: `${c.path}.age`, expected })
  })
  return out
}

function ageRangeTargets(data: any): string[] {
  const out: string[] = []
  collectChars(data).forEach((c) => {
    const name = asString(c.char && c.char.name).trim()
    if (!name) return
    if (HISTORICAL_BIRTH_UNKNOWN.indexOf(name) >= 0) return
    if (HISTORICAL_CHAR_BIRTH[name] != null) return
    const n = normNum(c.char.age)
    if (n == null || n < AGE_MIN || n > AGE_MAX) out.push(`${c.path}.age`)
  })
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 展开：粗粒度通配 path → 具体下标 path
// ─────────────────────────────────────────────────────────────────────────────

function expandTitleTargets(data: any, id: string): string[] {
  const chs = collectChapters(data)
  if (id === 'title-four-cjk') {
    return chs.filter((c) => !isFourCJK(asString(c.chapter.title))).map((c) => c.titlePath)
  }
  if (id === 'title-vs-volume') {
    const volNames = new Set(collectVolumeNames(data).map((s) => s.trim()))
    return chs.filter((c) => { const t = asString(c.chapter.title).trim(); return !!t && volNames.has(t) }).map((c) => c.titlePath)
  }
  if (id === 'title-no-meta') {
    return chs.filter((c) => containsAnyWord(asString(c.chapter.title), META_NARRATIVE_WORDS)).map((c) => c.titlePath)
  }
  if (id === 'title-unique') {
    const seen = new Set<string>()
    const out: string[] = []
    chs.forEach((c) => {
      const t = asString(c.chapter.title).trim()
      if (!t) return
      if (seen.has(t)) out.push(c.titlePath)
      else seen.add(t)
    })
    return out
  }
  return []
}

function expandMetaTermTargets(data: any, id: string): string[] {
  const segs = collectMetaSegments(data)
  const i = indexFromId(id, 'meta-')
  if (i == null) return segs.filter((s) => containsAnyWord(s.text, META_NARRATIVE_WORDS)).map((s) => s.path)
  const term = META_NARRATIVE_WORDS[i]
  if (!term) return []
  return segs.filter((s) => s.text.indexOf(term) !== -1).map((s) => s.path)
}

function expandComplianceTermTargets(data: any, id: string): string[] {
  const i = indexFromId(id, 'compliance-')
  if (i == null) return []
  const term = COMPLIANCE_RED_WORDS[i]
  if (!term) return []
  return collectComplianceSegments(data)
    .filter((s) => s.text.indexOf(term) !== -1)
    .map((s) => s.path)
}

function expandCharTargets(data: any, id: string): string[] {
  if (id === 'char-age-historical') return historicalAgeTargets(data).map((t) => t.path)
  if (id === 'char-age-range') return ageRangeTargets(data)
  if (id === 'char-role') return collectChars(data).filter((c) => !asString(c.char.role).trim()).map((c) => `${c.path}.role`)
  if (id === 'char-arc') return collectChars(data).filter((c) => toArray(c.char.arcNodes).length === 0).map((c) => `${c.path}.arcNodes`)
  return []
}

function expandPlatinumTargets(data: any, id: string): string[] {
  const chs = collectChapters(data)
  const base = (c: ChapterRef) => `chapters.volumes[${c.volIndex}].chapters[${c.chIndex}]`
  if (id === 'platinum-shuang') {
    return chs.filter((c) => toArray(c.chapter.shuangPoints).length === 0).map((c) => `${base(c)}.shuangPoints`)
  }
  if (id === 'platinum-hook') return chs.filter((c) => !asString(c.chapter.hook).trim()).map((c) => c.hookPath)
  if (id === 'platinum-conflict') {
    return chs.filter((c) => !asString(c.chapter.conflict).trim() && !asString(c.chapter.turningPoint).trim()).map((c) => `${base(c)}.conflict`)
  }
  if (id === 'platinum-opening') {
    const out: string[] = []
    volumeList(data).forEach((v, vi) => {
      const first = toArray(v && v.chapters)[0]
      if (!first || !asString(first.hook).trim()) out.push(`chapters.volumes[${vi}].chapters[0].hook`)
    })
    return out
  }
  if (id === 'platinum-intensity') {
    return chs.filter((c) => {
      if (c.chapter.intensity == null) return false
      const n = Number(c.chapter.intensity)
      return !isFinite(n) || n < 1 || n > 10
    }).map((c) => `${base(c)}.intensity`)
  }
  return []
}

/** 依据 group + id 把一条未通过判定展开为具体下标目标 path。 */
function expandTargets(data: any, group: string, id: string): string[] {
  switch (group) {
    case 'volumeSummary': {
      const i = indexFromId(id, 'volsum-')
      return i == null ? [] : [`chapters.volumes[${i}].summary`]
    }
    case 'titles': return expandTitleTargets(data, id)
    case 'meta': return expandMetaTermTargets(data, id)
    case 'compliance': return expandComplianceTermTargets(data, id)
    case 'characters': return expandCharTargets(data, id)
    case 'upstream': { const key = keyFromId(id, 'upstream-'); return key ? [key] : [] }
    case 'platinum': return expandPlatinumTargets(data, id)
    default: return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 分级：A 类（确定性）/ B 类（LLM）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 该判定是否属于「A 类 · 确定性可解」。
 * 注意：characters 组仅 `char-age-historical` 属 A 类；role / arcNodes / age-range 需 LLM。
 * upstream 虽归 A 类（先尝试确定性派生），但派生不足时由调用方升级为 LLM。
 */
export function isDeterministicRepair(group: string, id: string): boolean {
  if (group === 'volumeSummary') return true
  if (group === 'titles') return true
  if (group === 'meta') return true
  if (group === 'compliance') return true
  if (group === 'upstream') return true
  if (group === 'characters') return id === 'char-age-historical'
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// buildRepairPlan —— 取 runPitfallCheck 未通过项，展开为具体下标计划
// ─────────────────────────────────────────────────────────────────────────────

export function buildRepairPlan(data: any): { items: RepairPlanItem[]; auto: RepairPlanItem[]; llm: RepairPlanItem[] } {
  const result = runPitfallCheck(data)
  const items: RepairPlanItem[] = []
  const seenKey = new Set<string>()

  const add = (it: PitfallItem, group: string, path: string) => {
    const key = itemKey(it.id, path)
    if (seenKey.has(key)) return
    seenKey.add(key)
    items.push({
      id: it.id, group, path, key, title: it.title, detail: it.detail,
      method: isDeterministicRepair(group, it.id) ? 'deterministic' : 'llm',
    })
  }

  result.groups.forEach((g) => {
    g.items.forEach((it) => {
      if (it.passed) return
      const targets = expandTargets(data, g.key, it.id)
      if (targets.length === 0) add(it, g.key, it.path)
      else targets.forEach((p) => add(it, g.key, p))
    })
  })

  const auto = items.filter((i) => i.method === 'deterministic')
  const llm = items.filter((i) => i.method === 'llm')
  return { items, auto, llm }
}

// ─────────────────────────────────────────────────────────────────────────────
// applyDeterministicRepairs —— A 类确定性修复（不改入参）
// ─────────────────────────────────────────────────────────────────────────────

interface TargetResult {
  patches?: RepairPatch[]
  changed?: boolean
  failReason?: string
}

/** 单目标修复：返回 patches（成功）/ changed=false（无需改动）/ failReason（无法确定性修复）。 */
function repairTarget(work: any, group: string, id: string, key: string, path: string, ctx: RepairContext): TargetResult {
  switch (group) {
    case 'volumeSummary': {
      const vol = getByPath(work, parentPath(path))
      const fixed = fixVolumeSummaryLength(getByPath(work, path), vol)
      if (!fixed.ok || !isVolSumInRange(fixed.value)) return { failReason: REPAIR_REASONS.VOLUME_SUMMARY_UNFIXABLE }
      return { patches: [{ id, key, path, op: 'set', value: fixed.value, method: 'deterministic', note: 'volume-summary-length' }] }
    }
    case 'titles': {
      const cur = asString(getByPath(work, path)).trim()
      const cursorRef = { value: ctx.titleCursor }
      const nc = nextUniqueTitle(ctx.usedTitles, ctx.volNames, cursorRef)
      ctx.titleCursor = cursorRef.value
      if (!nc) return { failReason: REPAIR_REASONS.NO_UNIQUE_TITLE }
      if (cur === nc) return { changed: false }
      return { patches: [{ id, key, path, op: 'set', value: nc, method: 'deterministic', note: 'chapter-title-4cjk-unique' }] }
    }
    case 'meta': {
      const leaves = collectStringLeaves(getByPath(work, path), path)
      const out: RepairPatch[] = []
      leaves.forEach((lf) => {
        const next = stripMetaWords(lf.text)
        if (next === lf.text) return
        if (containsAnyWord(next, META_NARRATIVE_WORDS)) return
        out.push({ id, key, path: lf.path, op: 'set', value: next, method: 'deterministic', note: 'meta-narrative-removed' })
      })
      return out.length ? { patches: out } : { changed: false }
    }
    case 'compliance': {
      const leaves = collectStringLeaves(getByPath(work, path), path)
      const out: RepairPatch[] = []
      for (const lf of leaves) {
        const rep = applyComplianceTable(lf.text)
        if (!rep.changed) continue
        if (containsAnyWord(rep.text, COMPLIANCE_RED_WORDS)) return { failReason: REPAIR_REASONS.COMPLIANCE_RESIDUAL }
        out.push({ id, key, path: lf.path, op: 'set', value: rep.text, method: 'deterministic', note: 'compliance-red-word' })
      }
      return out.length ? { patches: out } : { changed: false }
    }
    case 'characters': {
      if (id !== 'char-age-historical') return { failReason: REPAIR_REASONS.NEEDS_LLM }
      const name = asString(getByPath(work, parentPath(path) + '.name')).trim()
      const birth = HISTORICAL_CHAR_BIRTH[name]
      if (birth == null) return { failReason: REPAIR_REASONS.NEEDS_LLM }
      const expected = HISTORICAL_BASE_YEAR - birth
      const n = normNum(getByPath(work, path))
      if (n === expected) return { changed: false }
      return { patches: [{ id, key, path, op: 'set', value: String(expected), method: 'deterministic', note: 'historical-age-recompute' }] }
    }
    case 'upstream': {
      const raw = getByPath(work, path)
      if (Array.isArray(raw)) return { failReason: REPAIR_REASONS.NEEDS_LLM }
      if (isObj(raw)) return { failReason: REPAIR_REASONS.UPSTREAM_OBJECT_FIELD }
      const derived = deriveUpstreamValue(work, path)
      if (!derived) return { failReason: REPAIR_REASONS.UPSTREAM_DERIVATION }
      return { patches: [{ id, key, path, op: 'set', value: derived, method: 'deterministic', note: 'upstream-derived' }] }
    }
    default:
      return { failReason: REPAIR_REASONS.NEEDS_LLM }
  }
}

/**
 * A 类确定性修复：返回 patches（不改入参），无法确定性修复的进 failed。
 * 标题修复内置全库唯一校验（候选撞名→换候选；用尽→failed `no-unique-title-candidate`）。
 * 卷摘要修复用 `pitfallRules.sanitizeVolumeSummary` 同口径复算后落回 120–180。
 */
export function applyDeterministicRepairs(data: any, items: RepairPlanItem[]): { patches: RepairPatch[]; failed: RepairFailure[] } {
  const patches: RepairPatch[] = []
  const failed: RepairFailure[] = []
  const work = cloneData(data)
  const ctx: RepairContext = {
    usedTitles: new Set<string>(collectAllTitles(data)),
    volNames: new Set<string>(collectVolumeNames(data).map((s) => s.trim())),
    titleCursor: 0,
    patchIndex: new Map<string, number>(),
  }

  const emit = (p: RepairPatch) => {
    const idx = ctx.patchIndex.get(p.path)
    if (idx == null) { ctx.patchIndex.set(p.path, patches.length); patches.push(p) }
    else patches[idx] = p // last-wins：同一 path 的多次变换链式叠加后的最终值
    writeWorkValue(work, p.path, p.value)
  }

  toArray(items).forEach((item) => {
    if (!item) return
    try {
      const group = asString(item.group)
      const id = asString(item.id)
      const key = asString(item.key) || itemKey(id, asString(item.path))

      let targets: string[] = []
      if (!isWildPath(item.path) && getByPath(work, item.path) !== undefined) targets = [item.path]
      else targets = expandTargets(work, group, id)
      if (targets.length === 0 && group === 'upstream') targets = [item.path]
      if (targets.length === 0) { failed.push({ id, reason: REPAIR_REASONS.NO_DETERMINISTIC_TARGET }); return }

      let produced = false
      let anyFail: string | null = null
      targets.forEach((tp) => {
        const res = repairTarget(work, group, id, key, tp, ctx)
        if (res.patches) { res.patches.forEach(emit); produced = true }
        else if (res.failReason) anyFail = res.failReason
      })

      if (!produced && anyFail) failed.push({ id, reason: anyFail })
      // produced=false 且无 fail = 已无需改动（视作通过）
    } catch (e: any) {
      failed.push({ id: asString(item.id), reason: 'error:' + (e && e.message ? e.message : String(e)) })
    }
  })

  return { patches, failed }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildRepairContext —— 端到端一致的「上下文」构造器
// ─────────────────────────────────────────────────────────────────────────────

/** 从章路径中提取所属卷路径，如 `chapters.volumes[3].chapters[7].title` → `chapters.volumes[3]`。 */
function volPathOf(path: string): string {
  const m = asString(path).match(/^(chapters\.volumes\[\d+\])/)
  return m ? m[1] : ''
}

/**
 * 构造「修复上下文」。
 *  · 默认（full）：保留 A/B 类修复所需字段（卷 / 章 / 人物 / 8 个上游设计字段）。
 *  · `opts.slim = true`：**只保留 B 类 LLM 修复所需的最小字段**——目标路径的值 +
 *    必要邻接上下文（标题项带本章摘要/钩子与卷名；卷摘要项带本卷全部章摘要；
 *    人物项带姓名）+ 全库 titles / volumeNames（供唯一性校验）。目标 < 60KB。
 *    此时 `chapters` / `characters` / 设计字段均为**稀疏结构**，仅含被指向的节点。
 *
 * ⚠️ 标题全库唯一校验依赖「全集标题」——slim 与 full 都保留全库标题（`titles`）。
 */
export function buildRepairContext(data: any, opts?: RepairContextOptions): any {
  if (opts && opts.slim) return buildSlimRepairContext(data, toArray(opts.items))

  const d = isObj(data) ? data : {}
  const out: any = { chapters: { volumes: [] as any[] } }
  volumeList(d).forEach((v) => {
    out.chapters.volumes.push({
      name: v && v.name,
      order: v && v.order,
      coreObjective: v && v.coreObjective,
      summary: v && v.summary,
      chapters: toArray(v && v.chapters).map((c) => ({
        title: c && c.title,
        summary: c && c.summary,
        hook: c && c.hook,
        conflict: c && c.conflict,
        turningPoint: c && c.turningPoint,
        shuangPoints: c && c.shuangPoints,
        intensity: c && c.intensity,
        chapterNumber: c && c.chapterNumber,
      })),
    })
  })

  if (isObj(d.characters)) {
    const src = d.characters
    const chars: any = {}
    ;['protagonist', 'femaleLead', 'antagonist'].forEach((k) => {
      if (isObj(src[k])) chars[k] = { name: src[k].name, age: src[k].age, role: src[k].role, arcNodes: src[k].arcNodes }
    })
    ;['femaleLeads', 'antagonists', 'supporting'].forEach((k) => {
      const arr = toArray(src[k]).filter((c) => isObj(c)).map((c) => ({ name: c.name, age: c.age, role: c.role, arcNodes: c.arcNodes }))
      if (arr.length > 0) chars[k] = arr
    })
    out.characters = chars
  }

  UPSTREAM_FIELDS.forEach((f) => {
    if (d[f.key] != null) out[f.key] = d[f.key]
  })

  return out
}

/** 瘦上下文：目标路径值 + 邻接上下文 + 全库 titles/volumeNames。 */
function buildSlimRepairContext(data: any, items: RepairPlanItem[]): any {
  const d = isObj(data) ? data : {}
  const out: any = { __slim: true, titles: collectAllTitles(d), volumeNames: collectVolumeNames(d).map((s) => s.trim()) }

  const materialize = (path: string) => {
    if (!path || isWildPath(path)) return
    const v = getByPath(d, path)
    if (v !== undefined) setByPath(out, path, cloneData(v))
  }

  toArray(items).forEach((it) => {
    const group = asString(it.group)
    const path = asString(it.path)
    materialize(path)

    if (group === 'titles') {
      const base = path.replace(/\.[^.]+$/, '')
      materialize(base + '.summary')
      materialize(base + '.hook')
      const vp = volPathOf(path)
      if (vp) materialize(vp + '.name')
    } else if (group === 'volumeSummary') {
      const vp = volPathOf(path)
      if (vp) {
        materialize(vp + '.name')
        const vol = getByPath(d, vp)
        toArray(vol && vol.chapters).forEach((_c, i) => materialize(`${vp}.chapters[${i}].summary`))
      }
    } else if (group === 'characters') {
      materialize(path.replace(/\.(age|role|arcNodes)$/, '.name'))
    }
    // upstream：path 即字段键，materialize(path) 已覆盖
  })

  return out
}

export default buildRepairPlan
