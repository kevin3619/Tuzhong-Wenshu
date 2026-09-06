import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'
import { loadFsNovels } from '@/lib/novel-storage'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

function resolveDataDir(): string {
  const candidates = [
    join(process.cwd(), '.tuzhong-data'),
    join(process.cwd(), 'src', 'tuzhong-wenshu', '.tuzhong-data'),
    join(process.cwd(), '..', '.tuzhong-data'),
    '/www/wwwroot/tuzhong-wenshu/.tuzhong-data',
  ]
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch {
      // 继续尝试
    }
  }
  return join(process.cwd(), '.tuzhong-data')
}

const LOCAL_DATA_DIR = resolveDataDir()
const CHAPTERS_DIR = join(LOCAL_DATA_DIR, 'chapters')

function countSubEntries(novelId: string, prefix: string): number {
  try {
    const folder = join(CHAPTERS_DIR, String(novelId))
    if (!existsSync(folder)) return 0
    const list: string[] = readdirSync(folder) || []
    return list.filter(function (f) { return f.startsWith(prefix) && f.endsWith('.json') }).length
  } catch {
    return 0
  }
}

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const admin = await verifyAdmin(_request)
  if (!admin) return NextResponse.json({ success: false, code: 403, message: '无权限' }, { status: 403 })
  const { id } = await params
  if (!id) return NextResponse.json({ success: false, code: 400, message: '缺少用户ID' }, { status: 400 })

  try {
    const dbWorksRaw = await prisma.novel.findMany({
      where: { userId: id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, title: true, description: true, coverUrl: true, genre: true,
        status: true, targetWordCount: true, currentWordCount: true,
        createdAt: true, updatedAt: true,
        _count: { select: { chapters: true, characters: true, volumes: true } },
      },
    })
    const dbWorks = dbWorksRaw.map(function (w) {
      // 🔥 修复：用 novels/cover 代理端点替换 base64 封面（而非剥离为 null），避免响应过大导致传输中断，同时保留封面展示
      const hasCover = !!(w.coverUrl || null)
      const safeCover = hasCover ? '/tuzhong-wenshu/api/novels/cover?id=' + encodeURIComponent(String(w.id)) : null
      return {
        id: w.id,
        title: w.title,
        description: w.description || '',
        coverUrl: safeCover,
        genre: w.genre || null,
        status: w.status || 'writing',
        targetWordCount: w.targetWordCount ?? null,
        currentWordCount: Number(w.currentWordCount || 0),
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        _count: {
          chapters: Number(w._count?.chapters || 0),
          characters: Number(w._count?.characters || 0),
          volumes: Number(w._count?.volumes || 0),
        },
      }
    })

    const targetUser = await prisma.user.findUnique({
      where: { id }, select: { id: true, nickname: true, username: true, email: true, isAdmin: true },
    })
    const targetIsAdmin = targetUser?.isAdmin === true

    const seenIds = new Set(dbWorks.map(function (x) { return x.id }))
    const fsBooks = loadFsNovels()
    for (let i = 0; i < fsBooks.length; i++) {
      const b = fsBooks[i]
      if (!targetIsAdmin && String(b.userId || '') !== String(id)) continue
      if (seenIds.has(String(b.id))) continue
      seenIds.add(String(b.id))
      const wordCount = Number(b.wordCount || 0)
      const description = String(b.description || '')
      // 🔥 修复：用代理端点替换 base64 封面，避免响应过大，同时保留封面展示
      const bidStr = String(b.id)
      const hasFsCover = !!((b.cover as string) || (b.coverUrl as string))
      const safeFsCover = hasFsCover ? '/tuzhong-wenshu/api/novels/cover?id=' + encodeURIComponent(bidStr) : null
      dbWorks.push({
        id: bidStr,
        title: String(b.title || '未命名作品'),
        description: description,
        coverUrl: safeFsCover,
        genre: String(b.genre || ''),
        status: String(b.status || 'writing'),
        targetWordCount: (b.targetWordCount as number) ?? null,
        currentWordCount: wordCount,
        createdAt: (b.created_at as string) || (b.createdAt as string) || new Date().toISOString(),
        updatedAt: (b.updated_at as string) || (b.updatedAt as string) || (b.created_at as string) || new Date().toISOString(),
        _count: {
          chapters: countSubEntries(String(b.id), 'chapter_'),
          characters: countSubEntries(String(b.id), 'character_'),
          volumes: countSubEntries(String(b.id), 'volume_'),
        },
      })
    }

    dbWorks.sort(function (a, b) {
      const at = new Date(a.updatedAt || a.createdAt).getTime()
      const bt = new Date(b.updatedAt || b.createdAt).getTime()
      return bt - at
    })

    return NextResponse.json({ success: true, code: 200, data: dbWorks, user: targetUser })
  } catch (e) {
    console.error('[admin users/[id]/works GET] 错误:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, code: 500, message: isProd ? '服务器内部错误' : '获取作品列表失败: ' + (e instanceof Error ? e.message : '未知错误') }, { status: 500 })
  }
}
