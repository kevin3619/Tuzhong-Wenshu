import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { extractTokenFromRequest } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    // 与 middleware 保持一致：同时支持 Authorization 头与 HttpOnly cookie。
    // 旧实现只认 Authorization，仅带 cookie 的请求会被判 401，触发 SessionGuard 清态跳登录（闪退）。
    const token = extractTokenFromRequest(request)
    if (!token) {
      return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ code: 401, message: '登录已过期' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { aiModelConfigs: true },
    })
    if (!user || user.status === 0) {
      return NextResponse.json({ code: 401, message: '账号不存在或已被禁用' }, { status: 401 })
    }

    return NextResponse.json({
      code: 200,
      data: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
        subscriptionTier: user.subscriptionTier,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        dailyQuotaUsed: user.dailyQuotaUsed,
        dailyQuotaLimit: user.dailyQuotaLimit,
        hasApiKey: user.aiModelConfigs?.length > 0,
      },
    })
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return NextResponse.json({ code: 500, message: '获取用户信息失败' }, { status: 500 })
  }
}