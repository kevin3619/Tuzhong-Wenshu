import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/permissions'
import { existsSync, readFileSync, statSync } from 'fs'
import { join, normalize, sep } from 'path'

const LOCAL_DATA_DIR = join(process.cwd(), '.tuzhong-data')
const COVERS_DIR = join(LOCAL_DATA_DIR, 'covers')
const PUBLIC_DIR = join(process.cwd(), 'public')

function isInside(root: string, target: string): boolean {
  const r = normalize(root) + sep
  const t = normalize(target)
  return t.startsWith(r) || t === normalize(root)
}

function safeResolve(root: string, relative: string): string | null {
  if (!relative) return null
  const cleaned = relative.replace(/^\//, '').replace(/\\/g, '/')
  if (cleaned.indexOf('..') >= 0) return null
  try {
    const resolved = join(root, ...cleaned.split('/').filter(Boolean))
    if (!isInside(root, resolved)) return null
    return resolved
  } catch {
    return null
  }
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, message: '无权限' }, { status: 403 })
  try {
    const url = new URL(request.url)
    const path = (url.searchParams.get('path') || '').trim()
    if (!path) return NextResponse.json({ success: false, message: '缺少path参数' }, { status: 400 })

    const searchRoots = [COVERS_DIR, LOCAL_DATA_DIR, PUBLIC_DIR]
    for (let i = 0; i < searchRoots.length; i++) {
      const root = searchRoots[i]
      const candidates: string[] = []
      const direct = safeResolve(root, path)
      if (direct) candidates.push(direct)
      // path 可能本身就是带 covers/ 前缀的（或 /covers/），去掉重复前缀后再在 root 下找
      const stripPrefix = path.replace(/^\/?covers\//i, '')
      if (stripPrefix !== path) {
        const d2 = safeResolve(root, stripPrefix)
        if (d2) candidates.push(d2)
      }
      for (let j = 0; j < candidates.length; j++) {
        const fp = candidates[j]
        if (!fp) continue
        if (existsSync(fp)) {
          let st
          try { st = statSync(fp) } catch { st = null }
          if (!st || !st.isFile()) continue
          const ext = (fp.match(/\.[^.]+$/) || ['.bin'])[0].toLowerCase()
          const mime = MIME[ext] || 'application/octet-stream'
          const buf = readFileSync(fp)
          return new NextResponse(buf, {
            status: 200,
            headers: {
              'Content-Type': mime,
              'Cache-Control': 'private, max-age=86400',
            },
          })
        }
      }
    }
    return NextResponse.json({ success: false, message: '封面文件未找到' }, { status: 404 })
  } catch (e) {
    console.error('[fs-cover GET] 错误:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, message: isProd ? '服务器内部错误' : '读取失败：' + (e instanceof Error ? e.message : '未知错误') }, { status: 500 })
  }
}
