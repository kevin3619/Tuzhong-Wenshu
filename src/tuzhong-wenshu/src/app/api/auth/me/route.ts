import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
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