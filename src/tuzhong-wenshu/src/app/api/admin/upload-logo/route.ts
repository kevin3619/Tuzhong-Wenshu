import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'
import { resolveDataDirC } from '@/lib/data-dir'

// 🔥 修复品牌Logo上传：使用 multipart/form-data 上传文件到磁盘，避免 base64 JSON 超 Nginx body 限制

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, message: '无权限' }, { status: 403 })
  try {
    const form = await request.formData()
    const file = form.get('file') as File | null
    if (!file || !file.size) {
      return NextResponse.json({ success: false, message: '请选择Logo图片' }, { status: 400 })
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: 'Logo图片不能超过2MB' }, { status: 400 })
    }
    const mimeRe = /^image\/(jpeg|png|webp|gif|svg\+xml)$/
    if (!mimeRe.test(file.type)) {
      return NextResponse.json({ success: false, message: '仅支持 JPG/PNG/WebP/GIF/SVG 格式' }, { status: 400 })
    }

    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
    }
    const ext = extMap[file.type] || 'png'
    const dataDir = resolveDataDirC()
    const fileName = 'brand-logo.' + ext
    const filePath = join(dataDir, fileName)

    const arr = new Uint8Array(await file.arrayBuffer())
    writeFileSync(filePath, arr)

    const logoUrl = '/tuzhong-wenshu/api/brand-logo?t=' + Date.now()
    const now = new Date().toISOString()
    let dbOk = true
    try {
      await prisma.systemConfig.upsert({
        where: { configKey: 'brand_logo' },
        update: { configValue: logoUrl, updatedAt: now },
        create: { configKey: 'brand_logo', configValue: logoUrl, createdAt: now, updatedAt: now },
      })
      await prisma.systemConfig.upsert({
        where: { configKey: 'brandLogo' },
        update: { configValue: logoUrl, updatedAt: now },
        create: { configKey: 'brandLogo', configValue: logoUrl, createdAt: now, updatedAt: now },
      })
    } catch (dbErr) {
      dbOk = false
      console.error('[upload-logo] DB写入失败（文件已保存）:', dbErr instanceof Error ? dbErr.message : String(dbErr))
    }

    return NextResponse.json({
      success: true,
      data: { logoUrl, fileSaved: true, dbSaved: dbOk },
      message: dbOk ? '上传成功' : '文件已保存但数据库写入异常，请稍后重试保存设置',
    })
  } catch (e) {
    console.error('[upload-logo] 错误:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ success: false, message: 'Logo上传失败' }, { status: 500 })
  }
}
