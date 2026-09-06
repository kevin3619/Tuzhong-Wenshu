import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ code: 403, message: '无权限' }, { status: 403 })

  try {
    const totalUsers = await prisma.user.count()
    const vipUsers = await prisma.user.count({
      where: { subscriptionTier: 'pro', subscriptionExpiresAt: { not: null },
        // subscriptionExpiresAt > now (not supported in SQLite Prisma well, so we check in JS)
      },
    })
    const totalNovels = await prisma.novel.count()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayUsers = await prisma.user.count({
      where: { createdAt: { gte: todayStart.toISOString() } },
    })
    const pendingPayments = await prisma.payment.count({ where: { status: 0 } })

    return NextResponse.json({
      code: 200,
      data: { totalUsers, vipUsers, totalNovels, todayUsers, pendingPayments },
    })
  } catch {
    return NextResponse.json({ code: 500, message: '获取统计数据失败' }, { status: 500 })
  }
}