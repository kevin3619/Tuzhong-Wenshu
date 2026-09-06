import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { buildWechatPayOrder } from '@/lib/wechat-pay'
import { prisma } from '@/lib/prisma'

async function loadPriceConfig(): Promise<Record<string, number>> {
  // 🔥 修复：新增 lifetime 终身会员价格配置
  const defaultPrices: Record<string, number> = { month: 79.9, quarter: 219, year: 799, lifetime: 2199 }
  try {
    const priceKeys = ['monthly_price', 'quarterly_price', 'yearly_price', 'lifetime_price']
    const priceRecords = await prisma.systemConfig.findMany({
      where: { configKey: { in: priceKeys } }
    })
    const priceMap: Record<string, string> = {}
    for (let i = 0; i < priceRecords.length; i++) {
      priceMap[priceRecords[i].configKey] = priceRecords[i].configValue || ''
    }
    if (priceMap.monthly_price) {
      const val = parseFloat(priceMap.monthly_price)
      if (!isNaN(val) && val > 0) defaultPrices.month = val
    }
    if (priceMap.quarterly_price) {
      const val = parseFloat(priceMap.quarterly_price)
      if (!isNaN(val) && val > 0) defaultPrices.quarter = val
    }
    if (priceMap.yearly_price) {
      const val = parseFloat(priceMap.yearly_price)
      if (!isNaN(val) && val > 0) defaultPrices.year = val
    }
    if (priceMap.lifetime_price) {
      const val = parseFloat(priceMap.lifetime_price)
      if (!isNaN(val) && val > 0) defaultPrices.lifetime = val
    }
  } catch (_e) {}
  return defaultPrices
}

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
  const planType = reqBody.planType

  if (!planType) {
    return NextResponse.json({ code: 400, message: '请选择有效套餐' }, { status: 400 })
  }

  const validPlans = ['month', 'quarter', 'year', 'lifetime']
  let isPlanValid = false
  for (let i = 0; i < validPlans.length; i++) {
    if (planType === validPlans[i]) {
      isPlanValid = true
      break
    }
  }

  if (!isPlanValid) {
    return NextResponse.json({ code: 400, message: '请选择有效套餐' }, { status: 400 })
  }

  const priceConfig = await loadPriceConfig()
  const payPrice = priceConfig[planType]

  // 修复 v4 M2：notify_url 使用服务端环境变量配置的固定域名，不从客户端 Origin 头派生
  let baseUrl = process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || ''
  if (!baseUrl) {
    // 开发环境回退：使用请求 origin（仅开发环境安全）
    baseUrl = request.nextUrl.origin || 'http://localhost:3000'
    console.warn('[微信支付] 生产环境请配置 PUBLIC_BASE_URL 环境变量，当前回退到请求 origin')
  }
  const notifyEndPoint = baseUrl.replace(/\/+$/, '') + '/tuzhong-wenshu/api/wechat/pay/callback'

  const execResult = await buildWechatPayOrder(tokenPayload.userId, planType, payPrice, notifyEndPoint)

  if (execResult.runCheckTag) {
    return NextResponse.json({
      code: 200,
      data: {
        codeUrl: execResult.codeUrl,
        orderNo: execResult.orderNo,
        paymentId: execResult.payId,
        expireAt: execResult.expireAt || null,
        expireMinutes: execResult.expireMinutes || 30,
      },
      message: '支付二维码已生成，有效期' + (execResult.expireMinutes || 30) + '分钟'
    })
  }

  return NextResponse.json({ code: 500, message: execResult.message }, { status: 500 })
}