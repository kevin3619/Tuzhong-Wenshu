/**
 * 🔥 精写引擎 · 断章台账（ledger）
 *
 * 逐章生成是「一次性、无状态」的调用，模型看不到已写完的章节正文，
 * 于是反复出现：同一桥段重复、同一句台词复读、上一章的损失下一章"自动复原"。
 * 台账把每章的关键事实（地点/出场人物/爽点/伏笔/结尾原句/9-gram 指纹）落盘，
 * 供后续章节注入上下文 + 跨章查重，形成"越写越连续"的闭环。
 */

import * as fs from 'fs'
import * as path from 'path'
import { countChinese, hashString, ngramHashes, tailOf, splitSentences, findRepeatedPhrases } from './text-utils'
import type { ChapterLedger, LedgerChapter } from './types'

const DATA_DIR = path.join(process.cwd(), '.tuzhong-data', 'chapter-ledgers')

/** 进程内互斥：同一作品的台账读改写串行化（pm2 fork 单进程足够） */
const locks = new Map<string, Promise<any>>()

async function withLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = locks.get(key) || Promise.resolve()
  const next = prev.then(() => fn()).catch((e) => {
    throw e
  })
  locks.set(key, next.catch(() => undefined))
  return next
}

function sanitizeKey(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return 'unknown'
  return s.replace(/[^\w\-.]/g, '_').slice(0, 80)
}

/** 台账 key：优先 novelId（排除向导的 'temp'），否则书名哈希 → 主角哈希 → 兜底 */
export function resolveLedgerKey(input: {
  novelKey?: string
  novelTitle?: string
  protagonistName?: string
  genre?: string
}): string {
  const nk = String(input.novelKey || '').trim()
  if (nk && nk !== 'temp' && nk !== 'new' && nk.length > 4) return sanitizeKey(nk)
  const title = String(input.novelTitle || '').trim()
  if (title) return 't_' + hashString(title)
  const proto = String(input.protagonistName || '').trim()
  if (proto) return 'p_' + hashString(proto + '|' + String(input.genre || ''))
  return 'unknown'
}

function ledgerPath(key: string): string {
  return path.join(DATA_DIR, sanitizeKey(key) + '.json')
}

export function loadLedger(key: string): ChapterLedger {
  try {
    const p = ledgerPath(key)
    if (!fs.existsSync(p)) return { key, novelTitle: '', chapters: [] }
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    if (!raw || !Array.isArray(raw.chapters)) return { key, novelTitle: '', chapters: [] }
    return {
      key,
      novelTitle: String(raw.novelTitle || ''),
      chapters: raw.chapters.filter((c: any) => c && typeof c.chapterNumber === 'number'),
    }
  } catch (_e) {
    return { key, novelTitle: '', chapters: [] }
  }
}

function saveLedger(ledger: ChapterLedger): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    const p = ledgerPath(ledger.key)
    fs.writeFileSync(p, JSON.stringify(ledger, null, 0), 'utf-8')
  } catch (e) {
    console.warn('[chapter-ledger] 台账写入失败:', e)
  }
}

/** 上一章结尾（供衔接）+ 前文摘要（前 N 章 digest 拼接） */
export function ledgerContext(ledger: ChapterLedger, chapterNumber: number, summaryCount = 3): { prevEnding: string; prevSummary: string; historyHashes: Set<string>; recentCast: string[]; openThreads: string[] } {
  const prev = ledger.chapters
    .filter((c) => c.chapterNumber < chapterNumber)
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
  const historyHashes = new Set<string>()
  for (const c of prev) for (const g of c.ngrams || []) historyHashes.add(g)
  const tailChapters = prev.slice(-summaryCount)
  const prevSummary = tailChapters
    .map((c) => '第' + c.chapterNumber + '章《' + c.title + '》：' + c.digest)
    .join('\n')
  const recentCastSet = new Set<string>()
  for (const c of prev.slice(-2)) for (const n of c.cast || []) recentCastSet.add(n)
  // 🔥 2026-10-22 未完承诺/伏笔（移植 oh-story 的「追踪」思路）：
  //   台账里一直记着每章埋下的伏笔句，但从没喂回下一章 → 埋了不收、读者感觉"作者忘了"。
  //   这里取最近 3 章的伏笔句（尚未回收的概率最高）注入下一章场景提示词。
  const openThreads: string[] = []
  const seenT = new Set<string>()
  for (const c of prev.slice(-3)) {
    for (const f of c.foreshadows || []) {
      const t = String(f || '').trim()
      if (!t || t.length < 6) continue
      const key = t.slice(0, 12)
      if (seenT.has(key)) continue
      seenT.add(key)
      openThreads.push(t.slice(0, 60))
      if (openThreads.length >= 6) break
    }
    if (openThreads.length >= 6) break
  }
  return {
    prevEnding: prev.length ? prev[prev.length - 1].endingTail : '',
    prevSummary,
    historyHashes,
    recentCast: Array.from(recentCastSet),
    openThreads,
  }
}

/** 从正文提取伏笔句（确定性，不烧模型） */
function extractForeshadows(text: string, limit = 5): string[] {
  const out: string[] = []
  for (const s of splitSentences(text)) {
    if (s.length < 6 || s.length > 60) continue
    // 🔥 2026-10-22 收紧：只收「真钩子/真未解之事」。
    //   原来把「远处/门外/与此同时/接下来」这类泛场景句也当伏笔，
    //   而这些句子会被回灌进下一章提示词当"必须推进的悬念" → 给模型灌噪声。
    if (/却不知|殊不知|浑然不觉|还没有人知道|没人知道|无人察觉|并未察觉|谁也没想到|料不到|只怕|偏偏|埋下|竟有|尚不知|未及|留下一句|撂下/.test(s)) {
      out.push(s.replace(/\s/g, ''))
      if (out.length >= limit) break
    }
  }
  return out
}

/** 生成单章台账记录（确定性摘要：首段关键句 + 结尾原句 + 结构信息） */
export function buildLedgerChapter(input: {
  chapterNumber: number
  title: string
  text: string
  locations?: string[]
  cast?: string[]
  shuangMarkers?: string[]
}): LedgerChapter {
  const paragraphs = String(input.text || '').split(/\n+/).map((p) => p.trim()).filter(Boolean)
  const digestParts = paragraphs.slice(0, 2).map((p) => p.slice(0, 60))
  const mid = paragraphs.length > 4 ? paragraphs[Math.floor(paragraphs.length / 2)].slice(0, 50) : ''
  const digest = [digestParts.join('；'), mid].filter(Boolean).join('；').slice(0, 220)
  return {
    chapterNumber: input.chapterNumber,
    title: input.title,
    digest,
    endingTail: tailOf(String(input.text || '').replace(/\s+/g, ''), 320),
    locations: (input.locations || []).filter(Boolean).slice(0, 8),
    cast: (input.cast || []).filter(Boolean).slice(0, 20),
    shuangPoints: (input.shuangMarkers || []).filter(Boolean).slice(0, 8),
    foreshadows: extractForeshadows(String(input.text || '')),
    repeatedPhrases: findRepeatedPhrases(String(input.text || ''), 12, 6),
    ngrams: ngramHashes(String(input.text || ''), 9, 1200),
    chineseChars: countChinese(String(input.text || '')),
    updatedAt: Date.now(),
  }
}

/** 记录一章（同章号覆盖写，串行化） */
export async function recordChapter(key: string, novelTitle: string, entry: LedgerChapter): Promise<void> {
  await withLock(key, () => {
    const ledger = loadLedger(key)
    if (novelTitle && !ledger.novelTitle) ledger.novelTitle = novelTitle
    ledger.chapters = ledger.chapters.filter((c) => c.chapterNumber !== entry.chapterNumber)
    ledger.chapters.push(entry)
    ledger.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber)
    // 台账只保留最近 200 章，防无限膨胀
    if (ledger.chapters.length > 200) ledger.chapters = ledger.chapters.slice(-200)
    saveLedger(ledger)
  })
}
