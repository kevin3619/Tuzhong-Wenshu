import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, createToken, invalidateUserTokens } from '@/lib/auth'
import { invalidateResetToken } from '@/lib/password-reset'

// POST /api/auth/reset-password/confirm
// 确认重置密码
export async function POST(request: NextRequest) {
  try {
    const { token, newPassword } = await request.json()

    if (!token) {
      return NextResponse.json({ code: 400, message: '缺少重置token' }, { status: 400 })
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ code: 400, message: '请输入新密码' }, { status: 400 })
    }

    // 密码复杂度校验
    if (newPassword.length < 6 || newPassword.length > 64) {
      return NextResponse.json({ code: 400, message: '密码长度必须在6-64位之间' }, { status: 400 })
    }

    if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(newPassword)) {
      return NextResponse.json({ code: 400, message: '密码必须包含字母和数字' }, { status: 400 })
    }

    // 从DB查找重置token
    const dbRecord = await prisma.systemConfig.findUnique({
      where: { configKey: `reset_token_${token}` },
    })

    if (!dbRecord?.configValue) {
      return NextResponse.json({ code: 400, message: '重置链接无效或已过期' }, { status: 400 })
    }

    const parsed = JSON.parse(dbRecord.configValue) as { userId: string; expiresAt: number }
    if (!parsed || !parsed.userId || !parsed.expiresAt) {
      return NextResponse.json({ code: 400, message: '重置链接无效' }, { status: 400 })
    }

    // 检查是否过期
    if (Date.now() > parsed.expiresAt) {
      // 清理过期token
      try {
        await prisma.systemConfig.delete({ where: { configKey: `reset_token_${token}` } })
      } catch (_e) { console.error('[reset-password] 清理过期重置token失败:', _e) }
      return NextResponse.json({ code: 400, message: '重置链接已过期' }, { status: 400 })
    }

    // 查找用户
    const user = await prisma.user.findUnique({ where: { id: parsed.userId } })
    if (!user) {
      return NextResponse.json({ code: 400, message: '用户不存在' }, { status: 400 })
    }

    // 加密新密码并更新
    const hashedPassword = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        updatedAt: new Date().toISOString(),
      },
    })

    // 删除已使用的重置token（内存 + DB 一起清）
    try { await invalidateResetToken(String(token)) } catch (_e) { console.error('[reset-password] 删除已用重置token失败:', _e) }
    // 🔥 修复：重置成功后撤销该用户此前所有已登录会话
    try { await invalidateUserTokens(user.id) } catch (e) { console.error('[reset-password] 撤销历史令牌失败:', e) }

    // 生成新token让用户直接登录
    const jwtToken = await createToken(user.id, user.isAdmin)

    return NextResponse.json({
      code: 200,
      message: '密码重置成功',
      data: {
        token: jwtToken,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          isAdmin: user.isAdmin,
        },
      },
    })
  } catch (error) {
    console.error('密码重置失败:', error)
    return NextResponse.json({ code: 500, message: '服务器错误' }, { status: 500 })
  }
}
