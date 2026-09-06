import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const THIRTY_MINUTES_MS = 30 * 60 * 1000

function autoCancelExpiredPayments(userId?: string) {
  const now = new Date()
  const expiredThreshold = new Date(now.getTime() - THIRTY_MINUTES_MS).toISOString()
  const where: Record<string, unknown> = {
    status: 0,
    createdAt: { lt: expiredThreshold },
  }
  if (userId) {
    where.userId = userId
  }
  return prisma.payment.updateMany({
    where,
    data: { status: 3 },
  })
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
    }
    const token = authHeader.split(' ')[1]
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ code: 401, message: '登录已过期' }, { status: 401 })

    await autoCancelExpiredPayments(payload.userId)

    const payments = await prisma.payment.findMany({
      where: { userId: payload.userId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ code: 200, data: payments })
  } catch (error) {
    return NextResponse.json({ code: 500, message: '获取支付记录失败' }, { status: 500 })
  }
}