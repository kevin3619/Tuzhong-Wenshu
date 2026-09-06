import { NextRequest, NextResponse } from 'next/server'
import { fetchWxLoginToken } from '@/lib/wechat'

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
      return NextResponse.json({
        code: 200,
        data: {
          status: 'confirmed',
          token: loginEntry.jwtToken,
          userId: loginEntry.userId,
        },
        message: '登录成功',
      })
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
