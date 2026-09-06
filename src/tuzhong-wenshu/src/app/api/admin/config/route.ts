import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ code: 403, message: '无权限' }, { status: 403 })
  const configs = await prisma.systemConfig.findMany()
  const configMap: Record<string, string> = {}
  configs.forEach(c => { configMap[c.configKey] = c.configValue || '' })
  return NextResponse.json({ code: 200, data: configMap })
}

export async function PUT(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ code: 403, message: '无权限' }, { status: 403 })
  try {
    const updates = await request.json()
    for (const [key, value] of Object.entries(updates)) {
      await prisma.systemConfig.upsert({
        where: { configKey: key },
        update: { configValue: value as string, updatedAt: new Date().toISOString() },
        create: { configKey: key, configValue: value as string, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      })
    }
    return NextResponse.json({ code: 200, message: '配置已更新' })
  } catch {
    return NextResponse.json({ code: 500, message: '更新失败' }, { status: 500 })
  }
}