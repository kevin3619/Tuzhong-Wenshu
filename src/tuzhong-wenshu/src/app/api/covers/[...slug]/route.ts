import { NextRequest } from 'next/server'
import { createReadStream, existsSync, statSync } from 'fs'
import { join, normalize, extname, basename } from 'path'
import { getRequestActor, isAdminOnlyNovel, loadNovelMetaOrNull } from '@/lib/permissions'

const DATA_DIR = join(process.cwd(), '.tuzhong-data')
const COVERS_DIR = join(DATA_DIR, 'covers')

const MIME: Record<string, string> = {
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.png':'image/png',
  '.webp':'image/webp',
  '.gif':'image/gif',
  '.bmp':'image/bmp',
}

// GET /api/covers/{file}
// 修复 v4 M1：认证检查移至文件系统操作之前，防止未登录请求触发 I/O 和文件存在性探测
export async function GET(request: NextRequest, ctx: { params: Promise<{ slug?: string[] }> }) {
  // 1. 先校验登录态
  const actor = await getRequestActor(request)
  if (!actor.isAdmin && !actor.userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const params = await ctx.params
  const slug = params?.slug || []
  // slug = [filename]
  const unsafe = slug.map(s => String(s)).join('/')
  const fileName = basename(normalize('/' + unsafe).replace(/^\\+/, '/'))
  if (!fileName || fileName.startsWith('.')) {
    return new Response('Bad Request', { status: 400 })
  }
  const full = join(COVERS_DIR, fileName)
  // 目录穿越防护
  if (!full.startsWith(COVERS_DIR)) {
    return new Response('Forbidden', { status: 403 })
  }
  if (!existsSync(full)) {
    return new Response('Not Found', { status: 404 })
  }
  const st = statSync(full)
  if (!st.isFile()) return new Response('Not Found', { status: 404 })

  const ext = extname(fileName).toLowerCase()
  // 修复 v4 L4：未知扩展名直接返回 404，不强制下载
  const type = MIME[ext]
  if (!type) {
    return new Response('Unsupported Media Type', { status: 415 })
  }
  // 允许浏览器缓存
  const stream = createReadStream(full)
  return new Response(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(st.size),
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  })
}
