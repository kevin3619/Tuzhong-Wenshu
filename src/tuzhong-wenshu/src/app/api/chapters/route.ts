import { NextResponse, NextRequest } from 'next/server'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { checkNovelAccessFor } from '@/lib/novel-access'
// 🔥 2026-10-26 T9：字数口径统一为「去空白（含标点）字符数」（原为纯汉字，与数据层/契约 Verify 不一致）
import { countChinese, countWordUnits, WORD_UNIT_LABEL, runChapterQualityGate, hookTypeOf } from '@/lib/ai/oh-story/quality-gate'
// 🔥 2026-10-26 T6：连载连续性台账（独立文件，不写章节记录）
import { recordChapterThreads, loadThreadLedger, threadStats, countResolvedBy } from '@/lib/ai/oh-story/threads'
import { atomicWriteJson, runExclusive } from '@/lib/file-lock'

/**
 * 统一字数口径（T9 裁定）：「去空白（含标点）字符数」。
 *   T7 实测新建章曾按纯汉字写、回填章按去空白写 ⇒ 同一本书两条写入口径不一致；此函数现在只认去空白口径。
 */
function chapterWordUnits(content: unknown): number {
  try { return countWordUnits(typeof content === 'string' ? content : '') } catch { return 0 }
}

/** 兼容旧名（仍指向统一口径），避免遗漏调用点 */
function chapterChineseCount(content: unknown): number {
  return chapterWordUnits(content)
}

export interface GateMetaOptions {
  /** G-04：上一章章尾钩子类型（相邻同型判定） */
  prevHookType?: string | null
  /** G-14：本章回收的旧期待条数 */
  resolvedThreadCount?: number
  /** G-14：本章新增期待条数 */
  newThreadCount?: number
  /** G-18：主角名 */
  protagonistName?: string
}

/**
 * 落盘前的章级门禁结论（纯确定性；异常不阻塞保存）。
 * 🔥 2026-10-26 T6：升级为统一门禁全量结论（含 G-08 状态/G-09 场景/G-14 契约/G-10 概念/G-04 相邻同型）。
 * 注意：写入 `_gateRev` 而**不**覆盖 `_rev`——`_rev` 是 writer 的产物溯源字段（实测值为
 * `t3-platinum-writer-2026-10-25+captain-fix-2026-10-25`），门禁不得改写它。
 */
function gateMetaOf(content: unknown, title?: unknown, chapterNumber?: unknown, opts: GateMetaOptions = {}): Record<string, unknown> {
  try {
    const text = typeof content === 'string' ? content : ''
    if (countChinese(text) < 200) return {}
    const cn = Number(chapterNumber)
    const r = runChapterQualityGate(text, {
      chapterNumber: isFinite(cn) && cn > 0 ? cn : undefined,
      chapterTitle: typeof title === 'string' ? title : undefined,
      sceneGate: true,
      maxNewConcepts: 3,
      prevHookType: opts.prevHookType === undefined ? null : opts.prevHookType,
      resolvedThreadCount: opts.resolvedThreadCount,
      newThreadCount: opts.newThreadCount,
      protagonistName: opts.protagonistName,
    })
    return {
      _gateRev: 't9-quality-gate@2026-10-26',
      _gateVerdict: r.verdict,
      _gateFindings: r.findings.slice(0, 12).map((f) => f.severity + '/' + f.rule + ':' + f.message),
      _gateScores: r.scores,
      _gateState: r.state ? r.state.changed : undefined,
      _gateScenes: r.scenes ? r.scenes.summary : undefined,
      _gateContract: r.contract ? r.contract.summary : undefined,
      _gateThreads: (opts.resolvedThreadCount !== undefined || opts.newThreadCount !== undefined)
        ? { resolved: opts.resolvedThreadCount || 0, fresh: opts.newThreadCount || 0 }
        : undefined,
    }
  } catch { return {} }
}

/**
 * 落盘场景的统一收口：先记伏笔台账（独立文件 .tuzhong-data/thread-ledgers，不写章节记录），
 * 再按「上一章钩子类型 + 期待债计数」跑门禁，并把结论写回该章。
 */
function gateAndThreadsFor(novelId: string, chapters: Array<Record<string, unknown>>, idx: number): void {
  try {
    if (idx < 0 || idx >= chapters.length) return
    const text = typeof chapters[idx]?.content === 'string' ? String(chapters[idx].content) : ''
    if (countChinese(text) < 200) return
    const cn = Number(chapters[idx]?.chapterNumber)
    const prev = idx > 0 ? chapters[idx - 1] : null
    const prevText = prev && typeof prev.content === 'string' ? String(prev.content) : ''
    const prevHookType = countChinese(prevText) >= 200 ? hookTypeOf(prevText.slice(-220)) : null

    if (novelId && isFinite(cn) && cn > 0) {
      const priorTexts = chapters.slice(0, idx)
        .filter((c) => typeof c.content === 'string' && countChinese(String(c.content)) >= 200)
        .map((c) => ({ chapterNumber: Number(c.chapterNumber) || 0, text: String(c.content) }))
      recordChapterThreads(novelId, String(chapters[idx]?.title || ''), cn, text, priorTexts)
    }
    let resolvedThreadCount = 0
    let newThreadCount = 0
    if (novelId && isFinite(cn) && cn > 0) {
      const ledger = loadThreadLedger(novelId)
      resolvedThreadCount = countResolvedBy(ledger, cn, text).resolved
      newThreadCount = (ledger.threads || []).filter((t) => t.chapterNumber === cn).length
      const st = threadStats(ledger, cn)
      console.log('[chapters][threads] key=' + novelId + ' ch' + cn + ' open=' + st.open + ' resolved=' + st.resolved + ' staleOpen=' + st.staleOpen)
    }
    Object.assign(chapters[idx], gateMetaOf(text, chapters[idx]?.title, cn, { prevHookType, resolvedThreadCount, newThreadCount }))
  } catch (e) {
    console.log('[chapters][gate] 门禁/台账失败（不阻塞保存）:', e instanceof Error ? e.message : e)
  }
}

// ============ 章节数据服务端持久化 ============

const DATA_DIR = join(process.cwd(), '.tuzhong-data')
const CHAPTERS_DIR = join(DATA_DIR, 'chapters')

function cleanTitle(t: string): string {
  return t.replace(/【[^】]*】/g, '').replace(/[（(][^)）]*[)）]/g, '').replace(/\s+/g, '').toLowerCase()
}

function computeSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const aChars = new Set(a.split(''))
  const bChars = new Set(b.split(''))
  let common = 0
  aChars.forEach(function (c) { if (bChars.has(c)) common++ })
  const unionSize = new Set([...aChars, ...bChars]).size
  return unionSize > 0 ? common / unionSize : 0
}

function ensureDataDir() {
  if (!existsSync(CHAPTERS_DIR)) {
    mkdirSync(CHAPTERS_DIR, { recursive: true })
  }
}

function getChapterFile(novelId: string) {
  return join(CHAPTERS_DIR, `${novelId}.json`)
}

// 检查当前访问者是否有权限读取/写入指定 novel 的章节数据

// GET /api/chapters?novelId=xxx&chapterId=xxx（可选）
// - 不带 chapterId：返回章节列表
// - 带 chapterId：返回章节正文
const checkNovelAccess = (request: Request | NextRequest, novelId: string) =>
  checkNovelAccessFor(request, novelId, '章节')

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')
  const chapterId = searchParams.get('chapterId')
  const wantFull = searchParams.get('full') === '1'

  if (!novelId) {
    return NextResponse.json({ error: '缺少 novelId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  try {
    const chapterFile = getChapterFile(novelId)
    let chapters: Array<{ id: string; content?: string; title: string; wordCount: number; status: string; chapterNumber?: number | string; order?: number | string }> = []

    if (existsSync(chapterFile)) {
      const data = readFileSync(chapterFile, 'utf-8')
      chapters = JSON.parse(data)
    } else {
      chapters = []
    }

    // 如果请求了特定章节的正文
    if (chapterId) {
      const chapter = chapters.find((c) => c.id === chapterId)
      if (chapter && chapter.content) {
        return NextResponse.json({ data: { content: chapter.content } })
      }
      return NextResponse.json({ data: { content: '' } })
    }

    // 🔥 章节去重：按 chapterNumber + 标题相似度检测重复章节
    // 当同一章节以两种格式（卷/flat）存在时，保留有内容的版本
    const deduped = new Map<string, typeof chapters[0]>()
    const usedTitles = new Set<string>()
    for (let i = 0; i < chapters.length; i++) {
      const c = chapters[i]
      const cn = String(c.chapterNumber || c.order || c.id || '')
      const title = String(c.title || '')
      const hasContent = !!(c.content && c.content.length > 0)
      const key = cn || title

      // 检查是否已有同章节号的条目
      const existing = deduped.get(key)
      if (existing) {
        const existingHasContent = !!(existing.content && existing.content.length > 0)
        // 保留有内容的那个，或保留更长的标题
        if (hasContent && !existingHasContent) {
          deduped.set(key, c)
        } else if (hasContent === existingHasContent && title.length > String(existing.title || '').length) {
          deduped.set(key, c)
        }
      } else {
        // 按标题去重：如果标题相似度高也视为重复
        let isDup = false
        for (const [, ex] of deduped) {
          const exTitle = String(ex.title || '')
          if (exTitle && title && exTitle !== title) {
            const sim = computeSimilarity(cleanTitle(title), cleanTitle(exTitle))
            if (sim > 0.7 && (cn === String(ex.chapterNumber || ex.order || ex.id || ''))) {
              isDup = true
              const exHasContent = !!(ex.content && ex.content.length > 0)
              if (hasContent && !exHasContent) {
                deduped.set(key, c)
              }
              break
            }
          }
        }
        if (!isDup) {
          deduped.set(key, c)
        }
      }
    }
    chapters = Array.from(deduped.values())

    // 重新排序
    chapters.sort(function (a, b) {
      const an = Number(a.chapterNumber || a.order || 0)
      const bn = Number(b.chapterNumber || b.order || 0)
      if (an && bn && an !== bn) return an - bn
      return 0
    })
    const lightChapters = chapters.map(function (c) {
      const lite: Record<string, unknown> = {}
      const keys = Object.keys(c)
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        if (k === 'content') {
          lite.wordCount = typeof c.content === 'string' ? chapterChineseCount(c.content) : (c.wordCount || 0)
          lite.hasContent = typeof c.content === 'string' && c.content.length >= 50 ? 1 : 0
        } else {
          lite[k] = (c as Record<string, unknown>)[k]
        }
      }
      if (lite.wordCount === undefined) lite.wordCount = c.wordCount || 0
      // 🔥 full=1 时附带完整正文（供向导「逐章生成正文」回填 generatedChapters，渲染正文面板）
      if (wantFull) lite.content = typeof c.content === 'string' ? c.content : ''
      return lite
    })
    return NextResponse.json({ data: lightChapters })
  } catch {
    return NextResponse.json({ error: '读取失败' }, { status: 500 })
  }
}

// POST /api/chapters - 创建新章节
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { novelId, title, order } = body

    if (!novelId || !title) {
      return NextResponse.json({ error: '缺少必要参数: novelId 和 title 不能为空' }, { status: 400 })
    }

    const access = await checkNovelAccess(request, novelId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
    }

    const chapterFile = getChapterFile(novelId)
    return await runExclusive(chapterFile, async () => {
      ensureDataDir()
      let chapters: Array<{ id: string; title: string; content: string; wordCount: number; status: string; order?: number }> = []

    if (existsSync(chapterFile)) {
      try {
        const data = readFileSync(chapterFile, 'utf-8')
        chapters = JSON.parse(data)
        if (!Array.isArray(chapters)) {
          chapters = []
        }
      } catch (parseError) {
        console.error('解析章节文件失败:', parseError)
        chapters = []
      }
    }

    const newChapter = {
      id: String(Date.now()),
      title,
      content: '',
      wordCount: 0,
      status: 'draft',
      order: order || chapters.length + 1,
      volumeId: body.volumeId || '',
    }

    chapters.push(newChapter)
    atomicWriteJson(chapterFile, chapters)

      return NextResponse.json({ data: newChapter }, { status: 201 })
    })
  } catch (error) {
    console.error('创建章节失败:', error)
    const errorMessage = error instanceof Error ? error.message : '创建失败'
    return NextResponse.json({ error: `创建失败: ${errorMessage}` }, { status: 500 })
  }
}

// PUT /api/chapters - 更新章节（保存正文内容）
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { novelId, chapterId, chapterIndex, content, title, status } = body

    if (!novelId) {
      return NextResponse.json({ error: '缺少必要参数: novelId 不能为空' }, { status: 400 })
    }

    if (!chapterId && chapterIndex === undefined) {
      return NextResponse.json({ error: '缺少必要参数: chapterId 或 chapterIndex 必须提供一个' }, { status: 400 })
    }

    const access = await checkNovelAccess(request, novelId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
    }

    const chapterFile = getChapterFile(novelId)
    return await runExclusive(chapterFile, async () => {
      ensureDataDir()
      let chapters: Array<Record<string, unknown>> = []

    if (existsSync(chapterFile)) {
      try {
        const data = readFileSync(chapterFile, 'utf-8')
        chapters = JSON.parse(data)
        if (!Array.isArray(chapters)) {
          chapters = []
        }
      } catch (parseError) {
        console.error('解析章节文件失败:', parseError)
        chapters = []
      }
    } else {
      // 如果文件不存在且提供了足够信息，创建新章节
      if (title && content !== undefined) {
        const newChapter = {
          id: chapterId || String(Date.now()),
          title,
          content,
          wordCount: chapterChineseCount(content),
          status: status || 'completed',
          _gateRev: 't9-quality-gate@2026-10-26',
        }
        chapters.push(newChapter)
        gateAndThreadsFor(novelId, chapters, chapters.length - 1)
        atomicWriteJson(chapterFile, chapters)
        return NextResponse.json({ data: newChapter })
      }
      return NextResponse.json({ error: '章节文件不存在' }, { status: 404 })
    }

    // 查找章节索引
    let index = -1
    if (chapterId) {
      index = chapters.findIndex((c) => c.id === chapterId)
    } else if (chapterIndex !== undefined && chapterIndex >= 0 && chapterIndex < chapters.length) {
      index = chapterIndex
    }

    if (index === -1) {
      return NextResponse.json({ error: '章节不存在' }, { status: 404 })
    }

    if (content !== undefined) chapters[index].content = content
    if (title !== undefined) chapters[index].title = title
    if (status !== undefined) chapters[index].status = status
    if (content !== undefined) {
      chapters[index].wordCount = chapterChineseCount(content)
      gateAndThreadsFor(novelId, chapters, index)
    }

    atomicWriteJson(chapterFile, chapters)

      return NextResponse.json({ data: chapters[index] })
    })
  } catch (error) {
    console.error('更新章节失败:', error)
    const errorMessage = error instanceof Error ? error.message : '更新失败'
    return NextResponse.json({ error: `更新失败: ${errorMessage}` }, { status: 500 })
  }
}

// 🔥 PATCH /api/chapters - 批量保存章节（支持预创建章节条目和补充正文）
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { novelId, chapters: chaptersToSave } = body

    if (!novelId) {
      return NextResponse.json({ error: '缺少必要参数: novelId 不能为空' }, { status: 400 })
    }
    if (!Array.isArray(chaptersToSave) || chaptersToSave.length === 0) {
      return NextResponse.json({ error: '缺少必要参数: chapters 数组不能为空' }, { status: 400 })
    }

    const access = await checkNovelAccess(request, novelId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
    }

    const chapterFile = getChapterFile(novelId)
    return await runExclusive(chapterFile, async () => {
      ensureDataDir()
      let existingChapters: Record<string, unknown>[] = []

    if (existsSync(chapterFile)) {
      try {
        const data = readFileSync(chapterFile, 'utf-8')
        existingChapters = JSON.parse(data)
        if (!Array.isArray(existingChapters)) existingChapters = []
      } catch {
        existingChapters = []
      }
    }

    let savedCount = 0
    let skippedCount = 0
    let preCreateCount = 0

    for (let i = 0; i < chaptersToSave.length; i++) {
      const ch = chaptersToSave[i]
      if (!ch) { skippedCount++; continue }

      // 🔥 Bug4/6 修复：区分两种情况
      // case 1: 有 content（补充正文）- 要求 content >= 100 字
      // case 2: 没有 content 但有 title/chapterNumber（预创建章节条目）- 保存为 draft 状态
      const hasContent = ch.content && ch.content.length >= 100
      const hasMeta = !hasContent && (ch.title || ch.chapterNumber)

      if (!hasContent && !hasMeta) { skippedCount++; continue }

      // 查找已存在的章节
      const existingIdx = existingChapters.findIndex(function (ec) {
        if (ch.id && ec.id && ec.id === ch.id) return true
        if (ch.chapterNumber && ec.chapterNumber && ec.chapterNumber === ch.chapterNumber) return true
        return false
      })

      let chapterData: Record<string, unknown>
      if (hasContent) {
        chapterData = {
          id: ch.id || String(Date.now() + i),
          chapterNumber: ch.chapterNumber,
          title: ch.title || '',
          content: ch.content,
          wordCount: chapterChineseCount(ch.content),
          status: ch.status || 'completed',
          volume: ch.volume,
          volumeIndex: ch.volumeIndex || (ch.volume && typeof ch.volume === 'number' ? ch.volume : undefined),
        }
        savedCount++
      } else {
        // 预创建章节条目
        chapterData = {
          id: ch.id || String(Date.now() + i) + '_pre',
          chapterNumber: ch.chapterNumber || (existingChapters.length + preCreateCount + 1),
          title: ch.title || ('第' + (ch.chapterNumber || (existingChapters.length + preCreateCount + 1)) + '章'),
          content: '',
          wordCount: 0,
          status: 'draft',
          volume: ch.volume,
          volumeIndex: ch.volumeIndex || (ch.volume && typeof ch.volume === 'number' ? ch.volume : undefined),
          summary: ch.summary || '',
        }
        preCreateCount++
      }

      if (existingIdx >= 0) {
        // 修复 v4 Q7：移除无效的三元分支（两分支完全相同）
        existingChapters[existingIdx] = { ...existingChapters[existingIdx], ...chapterData }
      } else {
        // 新增章节
        existingChapters.push(chapterData)
      }
    }

    atomicWriteJson(chapterFile, existingChapters)
    console.log(`[chapters] Batch save: ${savedCount} content, ${preCreateCount} pre-create, ${skippedCount} skipped, total: ${existingChapters.length}`)

      return NextResponse.json({ data: { savedCount, preCreateCount, skippedCount, total: existingChapters.length } })
    })
  } catch (error) {
    console.error('[chapters] Batch save failed:', error)
    return NextResponse.json({ error: '批量保存失败' }, { status: 500 })
  }
}
