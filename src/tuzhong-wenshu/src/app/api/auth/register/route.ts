import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, createToken } from '@/lib/auth'
import { checkRateLimit, getClientIpFromRequest } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // 修复 v4 C2：注册防爆破 - 同一 IP 1小时内最多 5 次注册
    const clientIp = getClientIpFromRequest(request)
    const rateLimitKey = `register:${clientIp}`
    const rateLimit = checkRateLimit(rateLimitKey, 5, 60 * 60 * 1000, 60 * 60 * 1000)
    if (!rateLimit.allowed) {
      return NextResponse.json({
        code: 429,
        message: `注册请求过于频繁，请 ${rateLimit.retryAfterSec} 秒后再试`,
      }, {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSec || 60) }
      })
    }

    const { username, password, nickname } = await request.json()

    if (!username || !password || !nickname) {
      return NextResponse.json({ code: 400, message: '用户名、密码和昵称为必填项' }, { status: 400 })
    }

    // 用户名格式校验：2-30 字符，仅允许字母数字下划线中文
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,30}$/.test(username)) {
      return NextResponse.json({ code: 400, message: '用户名仅允许 2-30 位的中文、字母、数字、下划线' }, { status: 400 })
    }

    // 密码复杂度校验：至少 6 位，必须包含字母和数字
    if (typeof password !== 'string' || password.length < 6 || password.length > 64) {
      return NextResponse.json({ code: 400, message: '密码长度必须在 6-64 位之间' }, { status: 400 })
    }
    if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
      return NextResponse.json({ code: 400, message: '密码必须包含字母和数字' }, { status: 400 })
    }

    if (typeof nickname !== 'string' || nickname.length < 1 || nickname.length > 30) {
      return NextResponse.json({ code: 400, message: '昵称长度必须在 1-30 位之间' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { username } })
    if (existing) {
      return NextResponse.json({ code: 400, message: '用户名已存在' }, { status: 400 })
    }

    const hashedPassword = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        nickname,
        status: 1,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })

    const token = await createToken(user.id, user.isAdmin)

    return NextResponse.json({
      code: 200,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          isAdmin: user.isAdmin,
          subscriptionTier: user.subscriptionTier,
        },
      },
      message: '注册成功',
    })
  } catch (error) {
    // 修复 v4：捕获 Prisma 唯一约束冲突（P2002），避免并发注册竞态
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002') {
      return NextResponse.json({ code: 400, message: '用户名已存在，请直接登录或更换用户名' }, { status: 400 })
    }
    console.error('注册失败:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ code: 500, message: '注册失败，请重试' }, { status: 500 })
  }
}