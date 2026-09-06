import { NextResponse } from 'next/server'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

function resolveDataDir(): string {
  const cwd = process.cwd()
  const candidates = [
    join(cwd, '.tuzhong-data'),
    join(cwd, 'data'),
    join(cwd, 'src', 'tuzhong-wenshu', '.tuzhong-data'),
    join(cwd, 'src', 'tuzhong-wenshu', 'data'),
    join(cwd, '..', '.tuzhong-data'),
    '/www/wwwroot/tuzhong-wenshu/.tuzhong-data',
  ]
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch {
      // continue
    }
  }
  const defaultPath = join(cwd, '.tuzhong-data')
  try { if (!existsSync(defaultPath)) mkdirSync(defaultPath, { recursive: true }) } catch { /* ignore */ }
  return defaultPath
}

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
    const dataDir = resolveDataDir()
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
      } catch { /* ignore */ }
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
