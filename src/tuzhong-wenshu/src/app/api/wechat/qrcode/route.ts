import { NextRequest, NextResponse } from 'next/server'
import { createWxLoginToken, buildWxQrCodeUrl } from '@/lib/wechat'

// 生成微信登录二维码
export async function GET(request: NextRequest) {
  try {
    const tokenKey = await createWxLoginToken()
    // 优先使用客户端传入的origin（支持手机扫码跨设备访问），回退到请求头
    const clientOrigin = request.nextUrl.searchParams.get('origin')
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const fallbackOrigin = host ? 'http://' + host : (request.nextUrl.origin || 'http://localhost:3000')
    const originAddr = clientOrigin || request.headers.get('origin') || fallbackOrigin
    const qrResult = await buildWxQrCodeUrl(tokenKey, originAddr)

    // 未配置微信开放平台时返回明确错误，便于前端提示
    if (!qrResult.isRealWxAuth && !qrResult.qrCodeAddr) {
      return NextResponse.json({
        code: 400,
        data: {
          state: tokenKey,
          qrcodeUrl: '',
          isRealWechat: false,
        },
        message: qrResult.message || '微信开放平台配置不完整',
      })
    }

    return NextResponse.json({
      code: 200,
      data: {
        state: tokenKey,
        qrcodeUrl: qrResult.qrCodeAddr,
        isRealWechat: qrResult.isRealWxAuth,
      },
      message: '二维码已生成，有效期5分钟',
    })
  } catch (_err) {
    return NextResponse.json({ code: 500, message: '生成二维码失败' }, { status: 500 })
  }
}