import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// 注销账户：真实删除用户及所有关联数据（数据库已配置 onDelete: Cascade）
export async function DELETE(request: NextRequest) {
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
      select: { id: true, isAdmin: true, username: true },
    })
    if (!user) {
      return NextResponse.json({ code: 404, message: '账号不存在' }, { status: 404 })
    }

    // 管理员账号不允许自助注销（防止误删管理者）
    if (user.isAdmin) {
      return NextResponse.json({ code: 403, message: '管理员账号不能自助注销，请联系其他管理员处理' }, { status: 403 })
    }

    // 二次校验：请求体需带 confirm=true，避免误触发
    let body: { confirm?: unknown } = {}
    try { body = await request.json() } catch { body = {} }
    if (body?.confirm !== true) {
      return NextResponse.json({ code: 400, message: '缺少确认参数' }, { status: 400 })
    }

    // 真实删除用户（关联的 Novel/Chapter/Character/PaymentRecord/AiModelConfig 等会因 onDelete: Cascade 自动级联删除）
    await prisma.user.delete({ where: { id: user.id } })
    console.log(`[account-delete] 用户 ${user.id}(${user.username}) 已自助注销账户`)

    return NextResponse.json({ code: 200, message: '账户已注销，所有数据已删除' })
  } catch (error) {
    console.error('[account DELETE] 错误:', error instanceof Error ? error.message : String(error))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ code: 500, message: isProd ? '注销失败' : '注销失败: ' + (error instanceof Error ? error.message : '未知错误') }, { status: 500 })
  }
}
