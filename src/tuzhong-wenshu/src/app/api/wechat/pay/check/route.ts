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

  let orderNo = ''
  try {
    const reqBody = await request.json()
    orderNo = String(reqBody.orderNo || '')
  } catch (_e) {
    return NextResponse.json({ code: 400, message: '请求体不是合法JSON' }, { status: 400 })
  }

  if (!orderNo) {
    return NextResponse.json({ code: 400, message: '缺少订单号' }, { status: 400 })
  }

  // 🔥 安全修复：校验订单归属（此前可查询/跟进任意人的订单）
  const _ownOrder = await prisma.payment.findFirst({ where: { orderNo, userId: tokenPayload.userId }, select: { id: true } })
  if (!_ownOrder) {
    return NextResponse.json({ code: 404, message: '订单不存在' }, { status: 404 })
  }

  const statusResult = await queryPayOrderStatus(orderNo)

  if (statusResult.isExpired || statusResult.operateStateMark === 2) {
    try {
      await prisma.payment.updateMany({
        where: { orderNo, status: 0 },
        // 🔥 Bug修复：schema 约定 0待支付/1成功/2失效，此前写成 3 导致前端显示「未知」
        data: { status: 2 },
      })
    } catch (_e) { console.error('[wechat/pay/check] 标记订单超时关闭失败:', _e) }
  }

  if (statusResult.operateStateMark === 1) {
    try {
      await prisma.payment.updateMany({
        where: { orderNo, status: 0 },
        data: { status: 1 },
      })
    } catch (_e) { console.error('[wechat/pay/check] 标记订单已支付失败:', _e) }
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