import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 公开获取系统通知（无需登录）
export async function GET() {
  try {
    const record = await prisma.systemConfig.findFirst({
      where: { configKey: 'system_notice' },
    })
    const noticeText = record?.configValue || ''
    return NextResponse.json({
      code: 200,
      data: {
        content: noticeText,
        updatedAt: record?.updatedAt || '',
      },
    })
  } catch (error) {
    console.error('[notice GET] 错误:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ code: 500, message: '获取通知失败', data: { content: '' } }, { status: 500 })
  }
}
