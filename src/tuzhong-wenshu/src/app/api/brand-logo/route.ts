import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { resolveDataDirC } from '@/lib/data-dir'

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

export async function GET() {
  try {
    const dataDir = resolveDataDirC()
    const exts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']
    let logoFile: string | null = null
    let ext = 'png'

    for (let i = 0; i < exts.length; i++) {
      const candidate = join(dataDir, 'brand-logo.' + exts[i])
      try {
        if (existsSync(candidate)) {
          logoFile = candidate
          ext = exts[i]
          break
        }
      } catch (e) { console.error('[brand-logo] 探测Logo候选文件失败:', e) }
    }

    if (!logoFile) {
      return new NextResponse('', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }

    const buf = readFileSync(logoFile)
    const mime = MIME_MAP[ext] || 'image/png'
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return new NextResponse('', { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export const dynamic = 'force-dynamic'
