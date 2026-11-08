import { NextRequest, NextResponse } from 'next/server'
import { blacklistToken, verifyToken, invalidateUserTokens } from '@/lib/auth'

// 🔥 P2 #6 安全加固：服务端清除 HttpOnly token cookie（客户端 JS 无法清除 HttpOnly cookie，须由服务端完成）
function _clearTokenCookie(res: NextResponse, request: NextRequest) {
  const _proto = request.headers.get('x-forwarded-proto') || (request.nextUrl && request.nextUrl.protocol) || 'http:'
  const _isHttps = _proto.indexOf('https') === 0
  res.cookies.set('token', '', {
    httpOnly: true,
    secure: _isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

// POST /api/auth/logout
// 将当前 JWT 加入进程内黑名单，登出后旧 token 立即失效（30 天内提供 AuthCookieBridge 客户端兜底）
export async function POST(request: NextRequest) {
  try {
    let token = ''
    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim()
    }
    if (!token) {
      const cookieHeader = request.headers.get('cookie') || ''
      const m = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/)
      if (m) token = decodeURIComponent(m[1])
    }
    if (token) {
      blacklistToken(token)
      // 🔥 修复：登出应让该用户所有设备/所有已签发 token 失效（旧实现只拉黑当前这一个）
      try {
        const payload = await verifyToken(token)
        if (payload && payload.userId) await invalidateUserTokens(payload.userId)
      } catch (e) { console.error('[logout] 撤销用户令牌失败:', e) }
    }
    const res = NextResponse.json({ code: 200, message: '已退出登录' })
    _clearTokenCookie(res, request)
    return res
  } catch (_e) {
    const res = NextResponse.json({ code: 200, message: '已退出登录' })
    _clearTokenCookie(res, request)
    return res
  }
}
