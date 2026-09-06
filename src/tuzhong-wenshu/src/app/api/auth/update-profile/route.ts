import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hashPassword, verifyPassword } from '@/lib/auth'

export async function PUT(request: NextRequest) {
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

    const { nickname, email, oldPassword, newPassword, newUsername } = await request.json()
    const updateData: {
      updatedAt: string
      nickname?: string
      email?: string | null
      password?: string
      username?: string
    } = { updatedAt: new Date().toISOString() }

    // 先获取当前用户
    const currentUser = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!currentUser) {
      return NextResponse.json({ code: 404, message: '用户不存在' }, { status: 404 })
    }

    // 只有字段确实发生变化时才写入，避免触发不必要的唯一索引检查
    const normalizedEmail = email === '' ? null : email
    if (nickname && nickname !== currentUser.nickname) updateData.nickname = nickname
    if (normalizedEmail !== undefined && normalizedEmail !== currentUser.email) {
      updateData.email = normalizedEmail
    }

    // 修改密码（需要验证旧密码）
    if (newPassword) {
      if (!oldPassword) {
        return NextResponse.json({ code: 400, message: '请提供旧密码' }, { status: 400 })
      }
      const valid = await verifyPassword(oldPassword, currentUser.password)
      if (!valid) {
        return NextResponse.json({ code: 400, message: '旧密码错误' }, { status: 400 })
      }
      if (newPassword.length < 6) {
        return NextResponse.json({ code: 400, message: '新密码长度不能少于6位' }, { status: 400 })
      }
      updateData.password = await hashPassword(newPassword)
    }

    // 修改登录账号（需要验证旧密码）
    if (newUsername) {
      if (!oldPassword) {
        return NextResponse.json({ code: 400, message: '修改账号需要验证旧密码' }, { status: 400 })
      }
      const valid = await verifyPassword(oldPassword, currentUser.password)
      if (!valid) {
        return NextResponse.json({ code: 400, message: '旧密码错误' }, { status: 400 })
      }
      if (newUsername.length < 2) {
        return NextResponse.json({ code: 400, message: '账号长度不能少于2位' }, { status: 400 })
      }
      const existing = await prisma.user.findUnique({ where: { username: newUsername } })
      if (existing && existing.id !== payload.userId) {
        return NextResponse.json({ code: 400, message: '该账号已被占用' }, { status: 400 })
      }
      updateData.username = newUsername
    }

    const user = await prisma.user.update({
      where: { id: payload.userId },
      data: updateData,
    })

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
      },
      message: '更新成功',
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('更新用户信息失败:', errMsg)
    return NextResponse.json({ code: 500, message: '更新失败：' + errMsg }, { status: 500 })
  }
}