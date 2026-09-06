import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { verifyAdmin } from '@/lib/permissions'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const admin = await verifyAdmin(_request)
  if (!admin) return NextResponse.json({ success: false, code: 403, message: '无权限' }, { status: 403 })
  const { id } = await params
  if (!id) return NextResponse.json({ success: false, code: 400, message: '缺少用户ID' }, { status: 400 })

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, username: true, nickname: true, email: true, avatarUrl: true, wechatOpenid: true,
        isAdmin: true, subscriptionTier: true, subscriptionStartedAt: true, subscriptionExpiresAt: true,
        status: true, createdAt: true, updatedAt: true,
      },
    })
    if (!user) return NextResponse.json({ success: false, code: 404, message: '用户不存在' }, { status: 404 })
    return NextResponse.json({ success: true, code: 200, data: user })
  } catch {
    return NextResponse.json({ success: false, code: 500, message: '查询失败' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, code: 403, message: '无权限' }, { status: 403 })
  const { id } = await params
  if (!id) return NextResponse.json({ success: false, code: 400, message: '缺少用户ID' }, { status: 400 })

  try {
    const targetUser = await prisma.user.findUnique({ where: { id }, select: { isAdmin: true } })
    if (!targetUser) return NextResponse.json({ success: false, code: 404, message: '用户不存在' }, { status: 404 })

    const body = await request.json()
    const {
      nickname, email, status, subscriptionTier, subscriptionStartedAt, subscriptionExpiresAt,
      isAdmin: setAdmin, resetPassword, newPassword,
    } = body || {}

    const updateData: {
      updatedAt: string
      nickname?: string
      email?: string | null
      status?: number
      subscriptionTier?: string
      subscriptionStartedAt?: string | null
      subscriptionExpiresAt?: string | null
      isAdmin?: boolean
      password?: string
    } = { updatedAt: new Date().toISOString() }

    if (nickname !== undefined) {
      const trimmed = String(nickname).trim()
      if (!trimmed) return NextResponse.json({ success: false, code: 400, message: '昵称不能为空' }, { status: 400 })
      updateData.nickname = trimmed
    }
    if (email !== undefined) {
      const v = String(email).trim()
      if (v === '') updateData.email = null
      else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return NextResponse.json({ success: false, code: 400, message: '邮箱格式错误' }, { status: 400 })
        updateData.email = v
      }
    }
    if (status !== undefined) updateData.status = Number(status) === 0 ? 0 : 1
    const VALID_TIERS = ['free', 'monthly', 'quarterly', 'yearly', 'lifetime', 'pro']
    if (subscriptionTier !== undefined) {
      const t = String(subscriptionTier).trim()
      updateData.subscriptionTier = VALID_TIERS.includes(t) ? t : 'free'
    }
    if (subscriptionStartedAt !== undefined) {
      updateData.subscriptionStartedAt = subscriptionStartedAt ? String(subscriptionStartedAt) : null
    }
    if (subscriptionExpiresAt !== undefined) {
      updateData.subscriptionExpiresAt = subscriptionExpiresAt ? String(subscriptionExpiresAt) : null
    }
    if (setAdmin !== undefined && targetUser.isAdmin === false) {
      updateData.isAdmin = !!setAdmin
    }

    const shouldReset = resetPassword === true || (typeof newPassword === 'string' && newPassword.trim().length > 0)
    if (shouldReset) {
      const pwd = newPassword ? String(newPassword).trim() : ('tuzhong' + Math.random().toString(36).slice(2, 8))
      if (pwd.length < 6) return NextResponse.json({ success: false, code: 400, message: '新密码长度至少 6 位' }, { status: 400 })
      updateData.password = await hashPassword(pwd)
      await prisma.user.update({ where: { id }, data: updateData })
      return NextResponse.json({ success: true, code: 200, message: '用户信息已更新', data: { resetPassword: pwd } })
    }

    await prisma.user.update({ where: { id }, data: updateData })
    return NextResponse.json({ success: true, code: 200, message: '用户信息已更新' })
  } catch (e) {
    console.error('[admin users/[id] PATCH] 错误:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, code: 500, message: isProd ? '服务器内部错误' : '更新失败: ' + (e instanceof Error ? e.message : '未知错误') }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, code: 403, message: '无权限' }, { status: 403 })
  const { id } = await params
  if (!id) return NextResponse.json({ success: false, code: 400, message: '缺少用户ID' }, { status: 400 })

  try {
    const targetUser = await prisma.user.findUnique({ where: { id }, select: { isAdmin: true, username: true } })
    if (!targetUser) return NextResponse.json({ success: false, code: 404, message: '用户不存在' }, { status: 404 })
    if (targetUser.isAdmin) return NextResponse.json({ success: false, code: 403, message: '管理员账号受保护，不可删除' }, { status: 403 })
    if (id === admin.userId) return NextResponse.json({ success: false, code: 403, message: '不能删除自己' }, { status: 403 })

    await prisma.user.delete({ where: { id } })
    console.log(`[admin-audit] 管理员 ${admin.userId} 删除用户 ${id}(${targetUser.username})`)
    return NextResponse.json({ success: true, code: 200, message: '用户已删除' })
  } catch (e) {
    console.error('[admin users/[id] DELETE] 错误:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, code: 500, message: isProd ? '删除失败' : '删除失败: ' + (e instanceof Error ? e.message : '未知错误') }, { status: 500 })
  }
}
