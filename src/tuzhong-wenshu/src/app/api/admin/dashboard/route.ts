import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'
import { loadFsNovels } from '@/lib/novel-storage'

const THIRTY_MINUTES_MS = 30 * 60 * 1000

function autoCancelExpiredPayments() {
  const now = new Date()
  const expiredThreshold = new Date(now.getTime() - THIRTY_MINUTES_MS).toISOString()
  return prisma.payment.updateMany({
    where: {
      status: 0,
      createdAt: { lt: expiredThreshold },
    },
    data: { status: 3 },
  })
}

function dayStart(d: Date): string {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}
function monthStart(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
  return x.toISOString()
}

async function sumPaid(whereClause: Prisma.PaymentWhereInput): Promise<number> {
  try {
    const agg = await prisma.payment.aggregate({ _sum: { amount: true }, where: whereClause })
    return Number(agg?._sum?.amount || 0)
  } catch {
    return 0
  }
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, message: '无权限' }, { status: 403 })
  try {
    await autoCancelExpiredPayments()

    const totalUsers = await prisma.user.count()
    const vipCount = await prisma.user.count({ where: { subscriptionTier: { not: 'free' } } })
    const dbNovels = await prisma.novel.count()

    const fsBooks = loadFsNovels()
    const seenFsIds = new Set<string>()
    let fsNovelCount = 0
    for (let i = 0; i < fsBooks.length; i++) {
      const bid = String(fsBooks[i].id || '')
      if (!bid) continue
      if (seenFsIds.has(bid)) continue
      seenFsIds.add(bid)
      fsNovelCount++
    }
    const totalNovels = dbNovels + fsNovelCount

    const now = new Date()
    const todayIso = dayStart(now)
    const monthIso = monthStart(now)

    const todayRegistrations = await prisma.user.count({ where: { createdAt: { gte: todayIso } } })
    const pendingPayments = await prisma.payment.count({ where: { status: 0 } })

    const totalRevenue = await sumPaid({ status: 1 })
    const revenueToday = await sumPaid({ status: 1, createdAt: { gte: todayIso } })
    const revenueMonth = await sumPaid({ status: 1, createdAt: { gte: monthIso } })

    let pendingAmount = 0
    try {
      const pendAgg = await prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 0 },
      })
      pendingAmount = Number(pendAgg?._sum?.amount || 0)
    } catch {
      pendingAmount = 0
    }

    return NextResponse.json({
      success: true,
      data: {
        totalUsers, vipCount, todayRegistrations, pendingPayments,
        totalRevenue, revenueToday, revenueMonth, pendingAmount,
        totalNovels,
      },
    })
  } catch (e) {
    console.error('[dashboard GET] 错误:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, message: isProd ? '服务器内部错误' : '获取统计失败: ' + (e instanceof Error ? e.message : '未知错误') }, { status: 500 })
  }
}
