import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getRequestActor, isAdminOnlyNovel, loadNovelMetaOrNull } from '@/lib/permissions'
import { resolveDataDirC } from '@/lib/data-dir'
import { atomicWriteJson } from '@/lib/file-lock'

function loadNovelBooks(): Array<Record<string, unknown>> {
  const dataDir = resolveDataDirC()
  const file = join(dataDir, 'novels.json')
  if (!existsSync(file)) return []
  try {
    const raw = readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveNovelBooks(books: Array<Record<string, unknown>>) {
  const dataDir = resolveDataDirC()
  const file = join(dataDir, 'novels.json')
  atomicWriteJson(file, books)
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestActor(request)
    if (!actor.userId) {
      return NextResponse.json({ success: false, message: '请先登录' }, { status: 401 })
    }

    const form = await request.formData()
    const novelId = form.get('novelId') as string | null
    const file = form.get('file') as File | null

    if (!novelId) {
      return NextResponse.json({ success: false, message: '缺少 novelId 参数' }, { status: 400 })
    }
    if (!file || !file.size) {
      return NextResponse.json({ success: false, message: '请选择封面图片' }, { status: 400 })
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: '封面图片不能超过5MB' }, { status: 400 })
    }

    const mimeRe = /^image\/(jpeg|png|webp|gif|svg\+xml)$/
    if (!mimeRe.test(file.type)) {
      return NextResponse.json({ success: false, message: '仅支持 JPG/PNG/WebP/GIF/SVG 格式' }, { status: 400 })
    }

    // 权限校验：管理员或作品所有者
    if (!actor.isAdmin) {
      if (isAdminOnlyNovel(novelId)) {
        return NextResponse.json({ success: false, message: '无权修改此作品封面' }, { status: 403 })
      }
      const meta = loadNovelMetaOrNull(novelId)
      if (meta?.userId && String(meta.userId) !== String(actor.userId)) {
        return NextResponse.json({ success: false, message: '无权修改他人作品' }, { status: 403 })
      }
    }

    // 读取文件为 base64 data URI 存储（兼容现有封面显示逻辑）
    const arr = new Uint8Array(await file.arrayBuffer())
    const b64 = Buffer.from(arr).toString('base64')
    const dataUri = 'data:' + file.type + ';base64,' + b64

    // 更新 novels.json 中的 cover 字段
    const books = loadNovelBooks()
    const idx = books.findIndex(function (b) { return String(b.id) === String(novelId) })
    if (idx === -1) {
      return NextResponse.json({ success: false, message: '作品不存在' }, { status: 404 })
    }

    books[idx] = { ...books[idx], cover: dataUri, coverUpdatedAt: Date.now() }
    saveNovelBooks(books)

    return NextResponse.json({
      success: true,
      data: {
        novelId,
        cover: '/tuzhong-wenshu/api/novels/cover?id=' + encodeURIComponent(novelId) + '&v=' + Date.now(),
      },
    })
  } catch (e) {
    console.error('[upload-cover] 错误:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ success: false, message: '封面上传失败' }, { status: 500 })
  }
}
