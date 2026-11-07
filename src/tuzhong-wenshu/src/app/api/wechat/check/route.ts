import { NextRequest, NextResponse } from 'next/server'
import { fetchWxLoginToken } from '@/lib/wechat'

function isHttpsRequest(request: NextRequest): boolean {
  const proto = request.headers.get('x-forwarded-proto') || (request.nextUrl && request.nextUrl.protocol) || 'http:'
  return proto.indexOf('https') === 0
}

// 轮询检查微信扫码状态
export async function POST(request: NextRequest) {
  try {
    const reqBody = await request.json()
    const tokenKey = reqBody.state

    if (!tokenKey) {
      return NextResponse.json({ code: 400, message: '缺少state参数' }, { status: 400 })
    }

    const loginEntry = await fetchWxLoginToken(tokenKey)

    if (!loginEntry) {
      return NextResponse.json({
        code: 200,
        data: { status: 'expired' },
        message: '二维码已过期',
      })
    }

    if (loginEntry.scanStatus === 'confirmed' && loginEntry.jwtToken) {
      const res = NextResponse.json({
        code: 200,
        data: {
          status: 'confirmed',
          token: loginEntry.jwtToken,
          userId: loginEntry.userId,
        },
        message: '登录成功',
      })
      // 关键修复：由服务端下发 HttpOnly cookie。
      // 前端 document.cookie 无法覆盖已存在的 HttpOnly 同名 cookie，旧 token 会一直生效并导致 401 闪退。
      res.cookies.set('token', loginEntry.jwtToken, {
        httpOnly: true,
        secure: isHttpsRequest(request),
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 3600,
      })
      return res
    }

    let statusMsg = '等待扫码'
    if (loginEntry.scanStatus === 'scanned') {
      statusMsg = '已扫码，请在微信中确认'
    }

    return NextResponse.json({
      code: 200,
      data: { status: loginEntry.scanStatus },
      message: statusMsg,
    })
  } catch (_err) {
    return NextResponse.json({ code: 500, message: '检查失败' }, { status: 500 })
  }
}
