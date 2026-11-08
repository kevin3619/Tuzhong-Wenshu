import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'
import { loadFsNovels } from '@/lib/novel-storage'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { resolveDataDirB } from '@/lib/data-dir'

const LOCAL_DATA_DIR = resolveDataDirB()
const CHAPTERS_DIR = join(LOCAL_DATA_DIR, 'chapters')

function loadSettingsMeta(): Record<string, { characterCount: number; aiTitle?: string }> {
  const metaMap: Record<string, { characterCount: number; aiTitle?: string }> = {}
  try {
    const f = join(LOCAL_DATA_DIR, 'settings.json')
    if (!existsSync(f)) return metaMap
    const raw = JSON.parse(readFileSync(f, 'utf-8'))
    if (!raw || typeof raw !== 'object') return metaMap
    for (const nid of Object.keys(raw)) {
      const entry = raw[nid]
      if (!entry || typeof entry !== 'object') continue
      const charsData = (entry as any).characters
      let cc = 0
      if (charsData && typeof charsData === 'object') {
        if ((charsData as any).protagonist) cc++
        if (Array.isArray((charsData as any).femaleLeads)) cc += (charsData as any).femaleLeads.length
        else if ((charsData as any).femaleLead) cc++
        if (Array.isArray((charsData as any).antagonists)) cc += (charsData as any).antagonists.length
        else if ((charsData as any).antagonist) cc++
        if (Array.isArray((charsData as any).supporting)) cc += (charsData as any).supporting.length
      }
      const ideaTitle = (entry as any).idea && typeof (entry as any).idea === 'object' ? ((entry as any).idea.title || '') : ''
      metaMap[nid] = { characterCount: cc, aiTitle: ideaTitle || undefined }
    }
  } catch (e) { console.error('[admin/all-works] 解析 settings.json 统计元数据失败:', e) }
  return metaMap
}

function loadCountData() {
  let chars: Record<string, any[]> = {}
  let vols: Record<string, any[]> = {}
  try {
    const charsFile = join(LOCAL_DATA_DIR, 'characters.json')
    if (existsSync(charsFile)) {
      const raw = JSON.parse(readFileSync(charsFile, 'utf-8'))
      if (raw && typeof raw === 'object') chars = raw
    }
  } catch (e) { console.error('[admin/all-works] 读取 characters.json 失败:', e) }
  try {
    const volsFile = join(LOCAL_DATA_DIR, 'volumes.json')
    if (existsSync(volsFile)) {
      const raw = JSON.parse(readFileSync(volsFile, 'utf-8'))
      if (raw && typeof raw === 'object') vols = raw
    }
  } catch (e) { console.error('[admin/all-works] 读取 volumes.json 失败:', e) }
  return { chars, vols }
}

function countCharactersForNovel(novelId: string, fsCharsMap: Record<string, any[]>, settingsMeta: Record<string, { characterCount: number; aiTitle?: string }>): number {
  const fsCount = Array.isArray(fsCharsMap[novelId]) ? fsCharsMap[novelId].length : 0
  const settingsCount = settingsMeta[novelId]?.characterCount || 0
  return Math.max(fsCount, settingsCount)
}

function countChaptersFromFs(novelId: string): number {
  try {
    const f = join(CHAPTERS_DIR, String(novelId) + '.json')
    if (!existsSync(f)) return 0
    const data = JSON.parse(readFileSync(f, 'utf-8'))
    if (Array.isArray(data)) return data.length
    if (data && Array.isArray(data.chapters)) return data.chapters.length
    return 0
  } catch {
    return 0
  }
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, code: 403, message: '无权限' }, { status: 403 })

  try {
    const url = new URL(request.url)
    const filterUserId = (url.searchParams.get('userId') || url.searchParams.get('user_id') || '').trim()

    const { chars: charMap, vols: volMap } = loadCountData()
    const settingsMeta = loadSettingsMeta()

    const dbWorksRaw = await prisma.novel.findMany({
      orderBy: { updatedAt: 'desc' },
      where: filterUserId ? { userId: filterUserId } : undefined,
      select: {
        id: true, userId: true, title: true, description: true, coverUrl: true, genre: true,
        status: true, targetWordCount: true, currentWordCount: true,
        createdAt: true, updatedAt: true,
        _count: { select: { chapters: true, characters: true, volumes: true } },
        user: { select: { id: true, nickname: true, username: true } },
      },
    })

    const seenIds = new Set<string>()
    interface WorkBrief {
      id: string; userId: string; nickname: string; title: string; description: string;
      coverUrl: string | null; genre: string | null; status: string;
      targetWordCount: number | null; currentWordCount: number;
      createdAt: string | Date; updatedAt: string | Date;
      _count: { chapters: number; characters: number; volumes: number };
    }
    const result: WorkBrief[] = []

    for (let i = 0; i < dbWorksRaw.length; i++) {
      const w = dbWorksRaw[i]
      const wid = String(w.id)
      seenIds.add(wid)

      const fsChapters = countChaptersFromFs(wid)
      const fsChars = countCharactersForNovel(wid, charMap, settingsMeta)
      const fsVols = Array.isArray(volMap[wid]) ? volMap[wid].length : 0

      const dbChapters = Number(w._count?.chapters || 0)
      const dbChars = Number(w._count?.characters || 0)
      const dbVols = Number(w._count?.volumes || 0)

      const chaptersCount = Math.max(fsChapters, dbChapters)
      const charactersCount = Math.max(fsChars, dbChars)
      const volumesCount = Math.max(fsVols, dbVols)

      const hasCover = !!(w.coverUrl || null)
      const safeDbCover = hasCover ? '/tuzhong-wenshu/api/novels/cover?id=' + encodeURIComponent(wid) : null

      result.push({
        id: wid,
        userId: String(w.userId || ''),
        nickname: w.user?.nickname || w.user?.username || '',
        title: w.title || '未命名作品',
        description: w.description || '',
        coverUrl: safeDbCover,
        genre: w.genre || null,
        status: w.status || 'writing',
        targetWordCount: w.targetWordCount ?? null,
        currentWordCount: Number(w.currentWordCount || 0),
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        _count: {
          chapters: chaptersCount,
          characters: charactersCount,
          volumes: volumesCount,
        },
      })
    }

    const fsBooks = loadFsNovels()
    for (let i = 0; i < fsBooks.length; i++) {
      const b = fsBooks[i]
      const bid = String(b.id || '')
      const buid = String(b.userId || b.user_id || '')
      if (!bid) continue
      if (seenIds.has(bid)) continue
      if (filterUserId && buid !== filterUserId) continue
      seenIds.add(bid)

      const fsChapters = countChaptersFromFs(bid)
      const fsChars = countCharactersForNovel(bid, charMap, settingsMeta)
      const fsVols = Array.isArray(volMap[bid]) ? volMap[bid].length : 0

      const hasAnyCover = !!((b.cover as string) || (b.coverUrl as string))
      const safeCover = hasAnyCover ? '/tuzhong-wenshu/api/novels/cover?id=' + encodeURIComponent(bid) : null

      result.push({
        id: bid,
        userId: buid,
        nickname: '',
        title: String(b.title || '未命名作品'),
        description: String(b.description || ''),
        coverUrl: safeCover,
        genre: String(b.genre || ''),
        status: String(b.status || 'writing'),
        targetWordCount: (b.targetWordCount as number) ?? null,
        currentWordCount: Number(b.wordCount || 0),
        createdAt: (b.created_at as string) || (b.createdAt as string) || new Date().toISOString(),
        updatedAt: (b.updated_at as string) || (b.updatedAt as string) || (b.created_at as string) || new Date().toISOString(),
        _count: {
          chapters: fsChapters,
          characters: fsChars,
          volumes: fsVols,
        },
      })
    }

    result.sort(function (a, b) {
      const x = Number(new Date(a.updatedAt || a.createdAt).getTime() || 0)
      const y = Number(new Date(b.updatedAt || b.createdAt).getTime() || 0)
      return y - x
    })

    return NextResponse.json({ success: true, code: 200, data: result, total: result.length })
  } catch (e) {
    console.error('[all-works GET] 错误:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, code: 500, message: isProd ? '服务器内部错误' : '加载全平台作品失败：' + (e instanceof Error ? e.message : '未知错误') }, { status: 500 })
  }
}
