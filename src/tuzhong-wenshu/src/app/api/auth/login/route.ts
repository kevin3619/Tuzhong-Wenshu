import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, createToken } from '@/lib/auth'
import { checkRateLimit, getClientIpFromRequest } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // 修复 v4 C2：登录防爆破 - 同一 IP + 用户名组合，5分钟内最多 10 次尝试，触发后封禁 15 分钟
    const clientIp = getClientIpFromRequest(request)
    const { username, password } = await request.json()
    const rateLimitKey = `login:${clientIp}:${username || 'unknown'}`
    const rateLimit = checkRateLimit(rateLimitKey, 10, 5 * 60 * 1000, 15 * 60 * 1000)
    if (!rateLimit.allowed) {
      return NextResponse.json({
        code: 429,
        message: `登录尝试过于频繁，请 ${rateLimit.retryAfterSec} 秒后再试`,
      }, {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSec || 60) }
      })
    }

    if (!username || !password) {
      return NextResponse.json({ code: 400, message: '用户名和密码为必填项' }, { status: 400 })
    }

    // 用户名格式校验（防止注入）
    if (typeof username !== 'string' || username.length < 2 || username.length > 30) {
      return NextResponse.json({ code: 400, message: '用户名或密码错误' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return NextResponse.json({ code: 400, message: '用户名或密码错误' }, { status: 400 })
    }

    if (user.status === 0) {
      return NextResponse.json({ code: 403, message: '账号已被禁用，请联系管理员' }, { status: 403 })
    }

    const valid = await verifyPassword(password, user.password)
    if (!valid) {
      return NextResponse.json({ code: 400, message: '用户名或密码错误' }, { status: 400 })
    }

    const token = await createToken(user.id, user.isAdmin)

    return NextResponse.json({
      code: 200,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          avatarUrl: user.avatarUrl,
          isAdmin: user.isAdmin,
          subscriptionTier: user.subscriptionTier,
          subscriptionExpiresAt: user.subscriptionExpiresAt,
        },
      },
      message: '登录成功',
    })
  } catch (error) {
    console.error('登录失败:', error)
    return NextResponse.json({ code: 500, message: '登录失败，请重试' }, { status: 500 })
  }
}