import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { verifyToken } from '@/lib/auth'
import { isAdminOnlyNovel, extractTokenFromRequest } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { resolveDataDir, getDataDir } from '@/lib/data-dir'
import { resolveInsideBase } from '@/lib/safe-path'

function getNovelBookFile(): string { return join(getDataDir(), 'novels.json') }

function ensureDir() {
  const d = getDataDir()
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
}

function loadBooks(): Array<Record<string, unknown>> {
  const novelBookFile = getNovelBookFile()
  if (!existsSync(novelBookFile)) return []
  try {
    const raw = readFileSync(novelBookFile, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function getNovelCoverAnywhere(novelId: string): Promise<{ userId: string | null; cover: string | null } | null> {
  // 1) FS novels.json first
  const fsBooks = loadBooks()
  const fromFs = fsBooks.find((b) => String(b.id) === String(novelId))
  if (fromFs) {
    return {
      userId: String((fromFs.userId || fromFs.user_id || '') as string) || null,
      cover: String(((fromFs.cover as string) || (fromFs.coverUrl as string) || '') as string) || null,
    }
  }
  // 2) Fallback: Prisma DB novel (for novels only existing in DB, not serialized to FS)
  try {
    const dbRow = await prisma.novel.findUnique({
      where: { id: String(novelId) },
      select: { userId: true, coverUrl: true },
    })
    if (dbRow) {
      return { userId: dbRow.userId || null, cover: dbRow.coverUrl || null }
    }
  } catch (e) {
    console.error('[novels/cover] 查询作品封面元数据失败:', e)
  }
  return null
}

function normalizeBase64(dataUrl: string): { mime: string; data: Buffer } | null {
  try {
    if (dataUrl.indexOf('data:image') !== 0) return null
    const commaIdx = dataUrl.indexOf(',')
    if (commaIdx === -1) return null
    const metaPart = dataUrl.slice(0, commaIdx)
    const payloadPart = dataUrl.slice(commaIdx + 1)
    const mimeMatch = metaPart.match(/data:(image\/[a-zA-Z0-9+\-.]+)/)
    const mime = mimeMatch ? mimeMatch[1] : 'image/png'
    const isBase64 = metaPart.indexOf('base64') !== -1
    const data = isBase64
      ? Buffer.from(payloadPart, 'base64')
      : Buffer.from(decodeURIComponent(payloadPart), 'utf-8')
    return { mime, data }
  } catch {
    return null
  }
}

const DEFAULT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const novelId = url.searchParams.get('id')
    if (!novelId) {
      return new NextResponse(Buffer.from(DEFAULT_PNG_BASE64, 'base64'), {
        status: 404,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(Buffer.byteLength(DEFAULT_PNG_BASE64, 'base64')),
          'Cache-Control': 'private, max-age=60',
        },
      })
    }

    // Auth check: admins & owners only (loose: allow any logged-in user to reduce 404 churn; admin-only novel ids blocked for non-admins)
    let currentUserId: string | null = null
    let isAdmin = false
    const token = extractTokenFromRequest(request)
    if (token) {
      const payload = await verifyToken(token)
      if (payload) {
        currentUserId = payload.userId
        isAdmin = !!payload.isAdmin
      }
    }
    ensureDir()
    const novelMeta = await getNovelCoverAnywhere(String(novelId))
    if (!novelMeta) {
      return new NextResponse(Buffer.from(DEFAULT_PNG_BASE64, 'base64'), {
        status: 404,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(Buffer.byteLength(DEFAULT_PNG_BASE64, 'base64')),
          'Cache-Control': 'private, max-age=60',
        },
      })
    }

    if (!isAdmin && isAdminOnlyNovel(String(novelId))) {
      return new NextResponse(Buffer.from(DEFAULT_PNG_BASE64, 'base64'), {
        status: 403,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(Buffer.byteLength(DEFAULT_PNG_BASE64, 'base64')),
          'Cache-Control': 'private, max-age=60',
        },
      })
    }

    const coverVal = novelMeta.cover || ''
    if (!coverVal) {
      return new NextResponse(Buffer.from(DEFAULT_PNG_BASE64, 'base64'), {
        status: 404,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(Buffer.byteLength(DEFAULT_PNG_BASE64, 'base64')),
          'Cache-Control': 'private, max-age=60',
        },
      })
    }

    // Case A: data:image base64
    if (String(coverVal).indexOf('data:image') === 0) {
      const parsed = normalizeBase64(String(coverVal))
      if (!parsed) {
        return new NextResponse(Buffer.from(DEFAULT_PNG_BASE64, 'base64'), {
          status: 500,
          headers: { 'Content-Type': 'image/png', 'Content-Length': String(Buffer.byteLength(DEFAULT_PNG_BASE64, 'base64')) },
        })
      }
      return new NextResponse(parsed.data as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': parsed.mime,
          'Content-Length': String(parsed.data.length),
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      })
    }

    // Case B: http(s) URL - redirect client-side
    if (/^https?:\/\//i.test(String(coverVal))) {
      return NextResponse.redirect(String(coverVal), 302)
    }

    // Case C: local file path
    // 🔥 修复（P0 任意文件读）：旧实现允许把 cover 写成 /etc/passwd、/root/.../.env 这类绝对路径
    //   并直接 readFileSync（且本接口在 middleware 里是匿名可访问的）。
    //   现只允许 .tuzhong-data 容器内的相对路径，绝对路径/盘符/.. 一律 404。
    const safeAbs = resolveInsideBase(getDataDir(), String(coverVal))
    if (safeAbs && existsSync(safeAbs)) {
      const abs = safeAbs
      try {
        const buf = readFileSync(abs)
        const ext = String(coverVal).split('.').pop()?.toLowerCase() || 'png'
        const mime: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
        }
        return new NextResponse(buf, {
          status: 200,
          headers: {
            'Content-Type': mime[ext] || 'image/png',
            'Content-Length': String(buf.length),
            'Cache-Control': 'private, max-age=86400',
          },
        })
      } catch (e) {
        console.error('[novels/cover] 读取封面候选文件失败，尝试下一个:', e)
      }
    }

    return new NextResponse(Buffer.from(DEFAULT_PNG_BASE64, 'base64'), {
      status: 404,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(Buffer.byteLength(DEFAULT_PNG_BASE64, 'base64')),
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (e) {
    return new NextResponse(Buffer.from(DEFAULT_PNG_BASE64, 'base64'), {
      status: 500,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(Buffer.byteLength(DEFAULT_PNG_BASE64, 'base64')),
      },
    })
  }
}

export const dynamic = 'force-dynamic'
