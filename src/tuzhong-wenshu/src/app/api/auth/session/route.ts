import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

// 用 Bearer token 换取服务端 HttpOnly cookie。
// 背景：微信快捷登录等链路 token 由前端持有，若只靠 document.cookie 写入，
// 无法覆盖/删除已存在的 HttpOnly 同名 cookie（浏览器规范），会导致旧 token 继续生效 → 401 → 闪退。
function isHttpsRequest(request: NextRequest): boolean {
  const proto = request.headers.get('x-forwarded-proto') || (request.nextUrl && request.nextUrl.protocol) || 'http:'
  return proto.indexOf('https') === 0
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
    }
    const token = authHeader.slice(7).trim()
    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ code: 401, message: '登录已过期' }, { status: 401 })
    }

    const res = NextResponse.json({ code: 200, message: '会话已建立' })
    res.cookies.set('token', token, {
      httpOnly: true,
      secure: isHttpsRequest(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600,
    })
    return res
  } catch (error) {
    console.error('[auth/session] 建立服务端会话失败:', error)
    return NextResponse.json({ code: 500, message: '建立会话失败' }, { status: 500 })
  }
}
