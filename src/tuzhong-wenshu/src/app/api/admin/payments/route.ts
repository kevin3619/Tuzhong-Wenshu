import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'

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

// GET - 获取所有支付记录（管理员查看，微信支付订单自动由回调处理，无需人工审核）
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, code: 403, message: '无权限' }, { status: 403 })

  try {
    await autoCancelExpiredPayments()

    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, nickname: true } },
      },
    })
    return NextResponse.json({ success: true, code: 200, data: payments })
  } catch {
    return NextResponse.json({ success: false, code: 500, message: '获取支付记录失败' }, { status: 500 })
  }
}
