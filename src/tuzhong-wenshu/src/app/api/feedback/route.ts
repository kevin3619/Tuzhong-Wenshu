import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// 用户提交意见反馈
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ code: 401, message: '请先登录' }, { status: 401 })
    }
    const token = authHeader.split(' ')[1]
    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ code: 401, message: '登录已过期' }, { status: 401 })
    }

    const body = await request.json()
    const { category, content, contact } = body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ code: 400, message: '反馈内容不能为空' }, { status: 400 })
    }
    if (content.length > 2000) {
      return NextResponse.json({ code: 400, message: '反馈内容不能超过2000字' }, { status: 400 })
    }

    const validCategories = ['bug', 'suggestion', 'complaint', 'other']
    const finalCategory = validCategories.includes(category) ? category : 'other'

    const now = new Date().toISOString()
    const feedback = await prisma.feedback.create({
      data: {
        userId: payload.userId,
        category: finalCategory,
        content: content.trim(),
        contact: contact ? String(contact).trim().slice(0, 100) : null,
        status: 0,
        createdAt: now,
        updatedAt: now,
      },
    })

    return NextResponse.json({ code: 200, message: '反馈已提交，感谢您的支持', data: { id: feedback.id } })
  } catch (error) {
    console.error('[feedback POST] 错误:', error instanceof Error ? error.message : String(error))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ code: 500, message: isProd ? '提交失败' : '提交失败: ' + (error instanceof Error ? error.message : '未知错误') }, { status: 500 })
  }
}

// 用户获取自己的反馈列表
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ code: 401, message: '请先登录' }, { status: 401 })
    }
    const token = authHeader.split(' ')[1]
    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ code: 401, message: '登录已过期' }, { status: 401 })
    }

    const list = await prisma.feedback.findMany({
      where: { userId: payload.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ code: 200, data: list })
  } catch (error) {
    console.error('[feedback GET] 错误:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ code: 500, message: '查询失败' }, { status: 500 })
  }
}
