import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify, type JWTPayload } from 'jose'

// JWT 密钥：与 auth.ts 保持一致的逻辑（修复 v4 C1）
const RAW_JWT_SECRET = process.env.JWT_SECRET
if (!RAW_JWT_SECRET || RAW_JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[安全] JWT_SECRET 环境变量未配置或长度不足 32 字节，拒绝启动')
  }
  console.warn('[安全警告] JWT_SECRET 未配置，开发环境使用临时密钥。')
}
const EFFECTIVE_SECRET = RAW_JWT_SECRET && RAW_JWT_SECRET.length >= 32
  ? RAW_JWT_SECRET
  : 'dev-only-jwt-secret-tuzhong-wenshu-2026-do-not-use-in-production-32bytes'
const JWT_SECRET = new TextEncoder().encode(EFFECTIVE_SECRET)

// 不需要登录的公开路径（同时兼容 basePath=/tuzhong-wenshu 和无前缀两种情况）
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/reset-password',
  '/api/wechat/',
  '/api/auth/qr-scan',
  '/api/config/public',
  '/api/brand-logo',
  '/api/novels/cover',
  '/tuzhong-wenshu/api/auth/login',
  '/tuzhong-wenshu/api/auth/register',
  '/tuzhong-wenshu/api/auth/reset-password',
  '/tuzhong-wenshu/api/brand-logo',
  '/tuzhong-wenshu/api/novels/cover',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/qr-scan',
  // 法律/协议页面公开，未登录用户也可访问（登录页引用了《用户协议》《隐私政策》链接，必须可读）
  '/terms',
  '/privacy',
  '/_next',
  '/favicon.ico',
  '/favicon.svg',
]

// 管理员路径前缀
const ADMIN_PATHS = ['/api/admin/', '/admin', '/tuzhong-wenshu/api/admin/', '/tuzhong-wenshu/admin']

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // 修复 basePath 后带斜杠访问 404：/tuzhong-wenshu/ -> /tuzhong-wenshu
  const rawUrl = request.url
  if (rawUrl.endsWith('/tuzhong-wenshu/') || rawUrl.includes('/tuzhong-wenshu/?')) {
    return NextResponse.redirect(new URL('/tuzhong-wenshu', rawUrl))
  }

  // React Server Components 内部请求直接放行
  if (searchParams.has('_rsc')) {
    return NextResponse.next()
  }

  // 静态资源直接放行（兼容 basePath）
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico' || pathname === '/favicon.svg') {
    return NextResponse.next()
  }

  // 公开路径直接放行
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 提取 token：支持 cookie 与 Authorization header（v4 Q2：统一来源）
  const token =
    request.cookies.get('token')?.value ||
    request.cookies.get('auth_token')?.value ||
    request.headers.get('authorization')?.split(' ')[1] ||
    null

  // API 请求无 token 返回 401
  if (pathname.startsWith('/api/')) {
    if (!token) {
      return NextResponse.json({ code: 401, message: '未登录，请先登录' }, { status: 401 })
    }
    let payload: JWTPayload
    try {
      ({ payload } = await jwtVerify(token, JWT_SECRET))
    } catch {
      return NextResponse.json({ code: 401, message: '登录已过期，请重新登录' }, { status: 401 })
    }

    // v4 M3：对 /api/admin/* 路径增加 isAdmin 兜底校验
    if (ADMIN_PATHS.some(p => pathname.startsWith(p))) {
      if (!payload.isAdmin) {
        return NextResponse.json({ code: 403, message: '无管理员权限' }, { status: 403 })
      }
    }

    return NextResponse.next()
  }

  // 页面请求：无 token 重定向到登录页（携带 redirect 参数）
  if (!token) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    // 页面层 admin 校验：非管理员访问 /admin 重定向到首页
    if (ADMIN_PATHS.some(p => pathname.startsWith(p)) && !payload.isAdmin) {
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = '/'
      homeUrl.search = ''
      return NextResponse.redirect(homeUrl)
    }
    return NextResponse.next()
  } catch {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)'],
}
