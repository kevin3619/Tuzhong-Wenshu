import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'

// 管理员获取所有反馈列表
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, message: '无权限' }, { status: 403 })

  try {
    const status = request.nextUrl.searchParams.get('status')
    const where: { status?: number } = {}
    if (status !== null && status !== '' && status !== 'all') {
      // 🔥 Bug修复：parseInt NaN 直接进 Prisma 查询会异常
      const _n = parseInt(status, 10)
      if (!Number.isNaN(_n)) where.status = _n
    }

    const list = await prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: {
          select: { id: true, username: true, nickname: true, avatarUrl: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: list })
  } catch (error) {
    console.error('[admin/feedback GET] 错误:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ success: false, message: '查询失败' }, { status: 500 })
  }
}
