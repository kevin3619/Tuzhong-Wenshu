/**
 * oh-story · 连载连续性：伏笔/承诺台账（G-13，自包含，零 LLM）
 * ============================================================
 * 反修复 T1 实测的三个结构性缺陷：
 *   ① 旧实现 `extractForeshadows` 靠 12 个标记词白名单（却不知|殊不知|浑然不觉|…）
 *      ⇒ 非标记伏笔全部漏采（如「沙盘下压着三张请罪折」「求援的手书还扣在通政司」）；
 *   ② 无回收状态：埋了不收、读者感觉作者忘了；
 *   ③ 注入窗口只有「最近 3 章」且上限 6 条 ⇒ 早期埋的长线伏笔永远不再回灌。
 *
 * 本模块口径（确定性、去白名单化）：
 *   抽取 = 结构特征（未完成承诺 / 未解之谜 / 未完成动作 / 未完成交换 / 未解释物品）+
 *          排除"已完成"句（已…/成了/落定/到手/交还 + 结尾终止感）。
 *   状态 = 台账逐条跟踪 open → resolved：后续章节出现「同一实体的回收证据」（内容 3-gram 重叠 ≥2 且
 *          伴随回收标记）即判 resolved，并记录 resolvedAt 与证据句。
 *   注入 = 窗口从「最近 3 章」改为「全部 open thread（按最近优先，上限可配）」，且窗口外未回收的
 *          长线伏笔也纳入（这是旧实现最致命的缺口）。
 *   落盘 = 独立台账 `.tuzhong-data/thread-ledgers/<key>.json`，**不写入章节记录**（避免污染章节数据）。
 * 任何分支不抛错。
 */

import * as fs from 'fs'
import * as path from 'path'

export type ThreadStatus = 'open' | 'resolved'
export type ThreadKind = 'promise' | 'mystery' | 'unfinished-action' | 'exchange' | 'unexplained-object'

export interface ThreadRecord {
  /** 稳定 id：章号 + 文本哈希（同章同句只记一条） */
  id: string
  kind: ThreadKind
  /** 伏笔原文（截断到 80 字） */
  text: string
  /** 埋设章号 */
  chapterNumber: number
  status: ThreadStatus
  /** 回收章号（resolved 时有值） */
  resolvedAt?: number
  /** 回收证据句 */
  resolveEvidence?: string
  /** 用于回收匹配的内容 3-gram */
  grams: string[]
}

export interface ThreadLedger {
  key: string
  novelTitle: string
  updatedAt: number
  threads: ThreadRecord[]
}

/* ------------------------------------------------------------------ */
/* 抽取（去白名单化）                                                   */
/* ------------------------------------------------------------------ */

const PROMISE = /(发誓|立誓|誓要|定要|必[^。！？\n]{0,4}(报|还|取|夺|成)|答应|应下|许诺|应允|许他|许下|待[^。！？\n]{0,6}再|等[^。！？\n]{0,6}(再|之后)|事成[^。！？\n]{0,6}(之后|再说)|日后[^。！？\n]{0,6}(再|必)|来日[^。！？\n]{0,6}|他日[^。！？\n]{0,6})/
const MYSTERY = /(是谁|为何|怎么会|究竟|难道|不知[^。！？\n]{0,4}(是谁|何|底细)|底细|来历不明|没有署名|未署名|匿名|密信|血书|残片|半张|半截|一块[^。！？\n]{0,4}(玉|牌|印)|一枚|一截|字条|纸条|信物)/ 
const UNFINISHED_ACTION = /(正要|刚要|刚要[^。！？\n]{0,6}|话说到一半|说到一半|举到|按在|停在|没说完|咽了回去|住了口|戛然)/ 
const EXCHANGE = /(换取|以[^。！？\n]{0,10}换|换[^。！？\n]{0,6}(他|你|我)?[^。！？\n]{0,4}(的|一)|事成之后|成交|许他[^。！？\n]{0,8}为|若[^。！？\n]{0,10}则)/ 
const UNEXPLAINED_OBJECT = /(压着|扣在|锁在|藏[^。！？\n]{0,4}(着|在)|收在|搁在|搁下|一直[^。！？\n]{0,4}(没|未)|还[^。！？\n]{0,4}(没|未)|尚未|未曾|无人[^。！？\n]{0,4}(问|看|动|撕)|没有[^。！？\n]{0,4}(人|谁)去?[^。！？\n]{0,4}(问|看|动|撕)|没人去)/ 
/** "已完成"句排除：这些句子把伏笔写死了，不是伏笔 */
const RESOLVED_INLINE = /(已经[^。！？\n]{0,4}(收|到手|成|落定|交还|回信|解决|查明|定了)|到手了|落定了|查明了|收回了|交还了|解决了|画押了|按了印)$/

function sentencesOf(text: string): string[] {
  return String(text || '')
    .split(/[。！？…\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
}

function grams3(s: string): string[] {
  const clean = String(s || '').replace(/[^\u4e00-\u9fa5]/g, '')
  const out: string[] = []
  for (let i = 0; i + 3 <= clean.length; i++) out.push(clean.slice(i, i + 3))
  return out
}

function hash(s: string): string {
  let h = 2166136261
  const t = String(s || '')
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/**
 * 去白名单化抽取：按结构特征判定，命中多个特征时取第一个匹配的类型，并给出置信度排序。
 * @returns 该章埋下的 thread 候选（去重、按出现顺序）
 */
export function extractThreads(text: string, chapterNumber: number, limit = 8): ThreadRecord[] {
  const out: ThreadRecord[] = []
  const seen = new Set<string>()
  try {
    for (const s of sentencesOf(text)) {
      if (s.length > 80) continue
      if (RESOLVED_INLINE.test(s)) continue
      let kind: ThreadKind | null = null
      // 优先级：承诺 > 交换 > 未完成动作 > 未解之谜 > 未解释物品
      if (PROMISE.test(s)) kind = 'promise'
      else if (EXCHANGE.test(s)) kind = 'exchange'
      else if (UNFINISHED_ACTION.test(s)) kind = 'unfinished-action'
      else if (MYSTERY.test(s)) kind = 'mystery'
      else if (UNEXPLAINED_OBJECT.test(s)) kind = 'unexplained-object'
      if (!kind) continue
      const key = s.slice(0, 16)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: 'T' + chapterNumber + '-' + hash(s).slice(0, 6),
        kind,
        text: s.length > 80 ? s.slice(0, 80) : s,
        chapterNumber,
        status: 'open',
        grams: grams3(s).slice(0, 40),
      })
      if (out.length >= limit) break
    }
    return out
  } catch (_e) {
    return out
  }
}

/* ------------------------------------------------------------------ */
/* 回收判定（resolved）                                                 */
/* ------------------------------------------------------------------ */

const RESOLVE_MARK = /(已经|已|成了|落定|到手|查明|交还|回信|解决|画押|按了印|拆开|打开|说出|交出|兑现|应验|果然|原来|真相|水落石出|收回|拿到|得到|定了)/

function overlapCount(a: string[], b: Set<string>): number {
  let n = 0
  for (const g of a) if (b.has(g)) n++
  return n
}

/**
 * 用后续章节判定每条 open thread 是否已回收。
 * 判定：后续某章的某句与 thread 的 3-gram 重叠 ≥2，且该句含回收标记 ⇒ resolved。
 */
export function resolveThreads(ledger: ThreadLedger, chapters: Array<{ chapterNumber: number; text: string }>): ThreadLedger {
  try {
    for (const th of ledger.threads) {
      if (th.status === 'resolved') continue
      const grams = new Set(th.grams || [])
      let done = false
      for (const c of chapters.slice().sort((a, b) => a.chapterNumber - b.chapterNumber)) {
        if (c.chapterNumber <= th.chapterNumber) continue
        for (const s of sentencesOf(c.text)) {
          if (!RESOLVE_MARK.test(s)) continue
          if (overlapCount(Array.from(grams), new Set(grams3(s))) >= 2) {
            th.status = 'resolved'
            th.resolvedAt = c.chapterNumber
            th.resolveEvidence = s.slice(0, 60)
            done = true
            break
          }
        }
        if (done) break
      }
    }
    return ledger
  } catch (_e) {
    return ledger
  }
}

/** 由章节序列构建完整台账（含回收判定） */
export function buildThreadLedger(key: string, novelTitle: string, chapters: Array<{ chapterNumber: number; text: string }>): ThreadLedger {
  const ledger: ThreadLedger = { key, novelTitle, updatedAt: Date.now(), threads: [] }
  try {
    const sorted = chapters.slice().sort((a, b) => a.chapterNumber - b.chapterNumber)
    for (const c of sorted) {
      const found = extractThreads(c.text, c.chapterNumber)
      for (const f of found) ledger.threads.push(f)
    }
    resolveThreads(ledger, sorted)
    return ledger
  } catch (_e) {
    return ledger
  }
}

/* ------------------------------------------------------------------ */
/* 注入窗口（扩展版）                                                   */
/* ------------------------------------------------------------------ */

export interface ThreadInjectResult {
  /** 注入用的伏笔句（含章号前缀，便于模型理解时序） */
  lines: string[]
  /** open 总数（未截断前的真实规模） */
  openTotal: number
  /** 其中"窗口外"（距今超过 3 章）的长线伏笔数 —— 旧实现完全不会注入这些 */
  staleOpen: number
}

/**
 * 取必须推进的 open thread。
 * 与旧实现（最近 3 章、上限 6 条）的差异：
 *   · 覆盖**全部 open thread**，并按「最久未推进优先」排序 → 长线伏笔不再永沉；
 *   · 上限可配（默认 12，旧实现 6）。
 */
export function openThreadsFor(ledger: ThreadLedger, currentChapter: number, max = 12): ThreadInjectResult {
  const out: ThreadInjectResult = { lines: [], openTotal: 0, staleOpen: 0 }
  try {
    const open = (ledger.threads || []).filter((t) => t.status === 'open' && t.chapterNumber < currentChapter)
    out.openTotal = open.length
    out.staleOpen = open.filter((t) => currentChapter - t.chapterNumber > 3).length
    // 最久未推进优先（章号小者先），同章按 id 稳定
    const sorted = open.slice().sort((a, b) => (a.chapterNumber - b.chapterNumber) || a.id.localeCompare(b.id))
    out.lines = sorted.slice(0, Math.max(1, max)).map((t) => '（第 ' + t.chapterNumber + ' 章埋设·' + t.kind + '）' + t.text)
    return out
  } catch (_e) {
    return out
  }
}

/** 由章节端文本即时构建（route 无台账时的兜底路径） */
export function openThreadsFromTexts(currentChapter: number, priorTexts: Array<{ chapterNumber: number; text: string }>, max = 12): ThreadInjectResult {
  const ledger = buildThreadLedger('inline', '', priorTexts)
  return openThreadsFor(ledger, currentChapter, max)
}

/* ------------------------------------------------------------------ */
/* 落盘（独立台账，不写章节记录）                                       */
/* ------------------------------------------------------------------ */

const LEDGER_DIR = path.join(process.cwd(), '.tuzhong-data', 'thread-ledgers')

const locks = new Map<string, Promise<any>>()

function sanitizeKey(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return 'unknown'
  return s.replace(/[^\w\-.]/g, '_').slice(0, 80)
}

export function threadLedgerPath(key: string): string {
  return path.join(LEDGER_DIR, sanitizeKey(key) + '.json')
}

export function loadThreadLedger(key: string): ThreadLedger {
  try {
    const p = threadLedgerPath(key)
    if (!fs.existsSync(p)) return { key, novelTitle: '', updatedAt: Date.now(), threads: [] }
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    if (!raw || !Array.isArray(raw.threads)) return { key, novelTitle: '', updatedAt: Date.now(), threads: [] }
    return {
      key,
      novelTitle: String(raw.novelTitle || ''),
      updatedAt: Number(raw.updatedAt || 0),
      threads: raw.threads.filter((t: any) => t && typeof t.text === 'string' && typeof t.chapterNumber === 'number'),
    }
  } catch (_e) {
    return { key, novelTitle: '', updatedAt: Date.now(), threads: [] }
  }
}

export function saveThreadLedger(ledger: ThreadLedger): boolean {
  try {
    if (!fs.existsSync(LEDGER_DIR)) fs.mkdirSync(LEDGER_DIR, { recursive: true })
    const p = threadLedgerPath(ledger.key)
    ledger.updatedAt = Date.now()
    const tmp = p + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(ledger, null, 1), 'utf-8')
    fs.renameSync(tmp, p)
    return true
  } catch (_e) {
    return false
  }
}

/** 串行化读改写（同一作品并发提交时避免丢更新） */
export async function withThreadLedgerLock<T>(key: string, fn: (ledger: ThreadLedger) => T): Promise<T> {
  const prev = locks.get(key) || Promise.resolve()
  const next = prev.then(() => fn(loadThreadLedger(key))).catch((e) => { throw e })
  locks.set(key, next.catch(() => undefined))
  return next
}

/**
 * 记入一章：先按本章正文抽取新伏笔（open），再对既有 open 做一次回收判定。
 * 供 `src/app/api/chapters/route.ts` 在落盘正文后调用（不写章节数据）。
 */
export function recordChapterThreads(key: string, novelTitle: string, chapterNumber: number, text: string, priorTexts: Array<{ chapterNumber: number; text: string }> = []): ThreadLedger {
  const ledger = loadThreadLedger(key)
  if (novelTitle && !ledger.novelTitle) ledger.novelTitle = novelTitle
  // 覆盖式重记本章（同章重复提交幂等）
  ledger.threads = ledger.threads.filter((t) => t.chapterNumber !== chapterNumber)
  ledger.threads.push(...extractThreads(text, chapterNumber))
  // 回收判定：本章 + 既有后续（若本次是补写旧章，用已有 priorTexts）
  const chapters = [{ chapterNumber, text }, ...(priorTexts || [])].filter((c) => c && c.text)
  resolveThreads(ledger, chapters)
  saveThreadLedger(ledger)
  return ledger
}

/**
 * 本章回收了几条 old thread（供 G-14 期待债判定）。
 * 判定与 resolveThreads 一致：后续章句与 thread 的 3-gram 重叠 ≥2 且含回收标记。
 */
export function countResolvedBy(ledger: ThreadLedger, chapterNumber: number, text: string): { resolved: number; resolvedIds: string[] } {
  const out = { resolved: 0, resolvedIds: [] as string[] }
  try {
    const sents = sentencesOf(text)
    for (const t of (ledger.threads || [])) {
      if (t.status === 'resolved' || t.chapterNumber >= chapterNumber) continue
      const grams = new Set(t.grams || [])
      let hit = false
      for (const s of sents) {
        if (!RESOLVE_MARK.test(s)) continue
        if (overlapCount(Array.from(grams), new Set(grams3(s))) >= 2) { hit = true; break }
      }
      if (hit) { out.resolved++; out.resolvedIds.push(t.id) }
    }
    return out
  } catch (_e) {
    return out
  }
}

/** 台账统计（报告/门禁用） */
export function threadStats(ledger: ThreadLedger, currentChapter?: number): { total: number; open: number; resolved: number; staleOpen: number; kinds: Record<string, number> } {
  const t = ledger.threads || []
  const kinds: Record<string, number> = {}
  t.forEach((x) => { kinds[x.kind] = (kinds[x.kind] || 0) + 1 })
  const open = t.filter((x) => x.status === 'open')
  return {
    total: t.length,
    open: open.length,
    resolved: t.filter((x) => x.status === 'resolved').length,
    staleOpen: currentChapter ? open.filter((x) => currentChapter - x.chapterNumber > 3).length : 0,
    kinds,
  }
}