import { NextRequest, NextResponse } from 'next/server'
import { checkCallbackSign, handlePayCallback } from '@/lib/wechat-pay'

// 微信支付异步回调入口
export async function POST(request: NextRequest) {
  const bodyText = await request.text()

  const timeStampHeader = request.headers.get('wechatpay-timestamp') || ''
  const nonceHeader = request.headers.get('wechatpay-nonce') || ''
  const signHeader = request.headers.get('wechatpay-signature') || ''
  const serialHeader = request.headers.get('wechatpay-serial') || ''

  const verifyPass = await checkCallbackSign(timeStampHeader, nonceHeader, signHeader, serialHeader, bodyText)

  if (!verifyPass) {
    console.error('微信支付回调验签失败')
    return NextResponse.json({ code: 'FAIL', message: '签名验证失败' }, { status: 401 })
  }

  const processResult = await handlePayCallback(bodyText)

  if (processResult.runCheckTag) {
    return NextResponse.json({ code: 'SUCCESS', message: 'OK' })
  }

  return NextResponse.json({ code: 'FAIL', message: processResult.message }, { status: 500 })
}