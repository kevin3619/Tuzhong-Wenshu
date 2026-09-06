import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { queryPayOrderStatus } from '@/lib/wechat-pay'
import { prisma } from '@/lib/prisma'

// 前端轮询微信支付订单状态
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  const tokenPayload = await verifyToken(token)
  if (!tokenPayload) {
    return NextResponse.json({ code: 401, message: '登录已过期' }, { status: 401 })
  }

  const reqBody = await request.json()
  const orderNo = reqBody.orderNo

  if (!orderNo) {
    return NextResponse.json({ code: 400, message: '缺少订单号' }, { status: 400 })
  }

  const statusResult = await queryPayOrderStatus(orderNo)

  if (statusResult.isExpired || statusResult.operateStateMark === 2) {
    try {
      await prisma.payment.updateMany({
        where: { orderNo, status: 0 },
        data: { status: 3 },
      })
    } catch (_e) { /* ignore */ }
  }

  if (statusResult.operateStateMark === 1) {
    try {
      await prisma.payment.updateMany({
        where: { orderNo, status: 0 },
        data: { status: 1 },
      })
    } catch (_e) { /* ignore */ }
  }

  let msgText = '待支付'
  if (statusResult.operateStateMark === 1) {
    msgText = '支付成功'
  } else if (statusResult.operateStateMark === 2) {
    msgText = '已失效'
  }

  return NextResponse.json({
    code: 200,
    data: {
      status: statusResult.operateStateMark,
      expired: statusResult.isExpired
    },
    message: msgText
  })
}