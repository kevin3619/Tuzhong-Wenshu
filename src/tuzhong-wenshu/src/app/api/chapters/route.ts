import { NextResponse, NextRequest } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { isAdminOnlyNovel, getRequestActor, loadNovelMetaOrNull } from '@/lib/permissions'

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
async function checkNovelAccess(request: Request | NextRequest, novelId: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const actor = await getRequestActor(request)
  if (actor.isAdmin) return { ok: true }
  if (isAdminOnlyNovel(String(novelId))) return { ok: false, status: 403, error: '无权访问此作品章节' }
  const meta = loadNovelMetaOrNull(String(novelId))
  if (!meta) return { ok: false, status: 404, error: '作品不存在' }
  if (!actor.userId) return { ok: false, status: 401, error: '请先登录' }
  if (meta.userId && String(meta.userId) !== String(actor.userId)) return { ok: false, status: 403, error: '无权访问此作品章节' }
  return { ok: true }
}

// GET /api/chapters?novelId=xxx&chapterId=xxx（可选）
// - 不带 chapterId：返回章节列表
// - 带 chapterId：返回章节正文
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')
  const chapterId = searchParams.get('chapterId')

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
          lite.wordCount = c.wordCount || (typeof c.content === 'string' ? c.content.replace(/\s/g, '').length : 0)
          lite.hasContent = typeof c.content === 'string' && c.content.length > 0 ? 1 : 0
        } else {
          lite[k] = (c as Record<string, unknown>)[k]
        }
      }
      if (lite.wordCount === undefined) lite.wordCount = c.wordCount || 0
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

    ensureDataDir()
    const chapterFile = getChapterFile(novelId)
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
    writeFileSync(chapterFile, JSON.stringify(chapters, null, 2), 'utf-8')

    return NextResponse.json({ data: newChapter }, { status: 201 })
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

    ensureDataDir()
    const chapterFile = getChapterFile(novelId)
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
          wordCount: content.replace(/\s/g, '').length,
          status: status || 'completed',
        }
        chapters.push(newChapter)
        writeFileSync(chapterFile, JSON.stringify(chapters, null, 2), 'utf-8')
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
      chapters[index].wordCount = content.replace(/\s/g, '').length
    }

    writeFileSync(chapterFile, JSON.stringify(chapters, null, 2), 'utf-8')

    return NextResponse.json({ data: chapters[index] })
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

    ensureDataDir()
    const chapterFile = getChapterFile(novelId)
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
          wordCount: ch.content.replace(/\s/g, '').length,
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

    writeFileSync(chapterFile, JSON.stringify(existingChapters, null, 2), 'utf-8')
    console.log(`[chapters] Batch save: ${savedCount} content, ${preCreateCount} pre-create, ${skippedCount} skipped, total: ${existingChapters.length}`)

    return NextResponse.json({ data: { savedCount, preCreateCount, skippedCount, total: existingChapters.length } })
  } catch (error) {
    console.error('[chapters] Batch save failed:', error)
    return NextResponse.json({ error: '批量保存失败' }, { status: 500 })
  }
}
