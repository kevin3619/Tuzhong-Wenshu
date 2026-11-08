import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createToken, verifyToken, hashPassword } from '@/lib/auth'
import { randomBytes } from 'crypto'
import { getMailConfig, sendPasswordResetEmail } from '@/lib/email'

// 密码重置token存储（使用内存map + DB持久化）
interface ResetTokenStore {
  userId: string
  token: string
  expiresAt: number
}

let _resetTokenMap: Map<string, ResetTokenStore> | null = null

function getResetTokenMap(): Map<string, ResetTokenStore> {
  if (!_resetTokenMap) {
    const globalAny = globalThis as unknown as { __resetTokenMap?: Map<string, ResetTokenStore> }
    if (!globalAny.__resetTokenMap) {
      globalAny.__resetTokenMap = new Map<string, ResetTokenStore>()
    }
    _resetTokenMap = globalAny.__resetTokenMap
  }
  return _resetTokenMap!
}

const resetTokenMap = getResetTokenMap()
const RESET_TOKEN_EXPIRE_MS = 30 * 60 * 1000 // 30分钟

// POST /api/auth/reset-password/request
// 请求重置密码 - 根据邮箱生成重置链接
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ code: 400, message: '请输入邮箱' }, { status: 400 })
    }

    // 邮箱格式校验
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ code: 400, message: '邮箱格式不正确' }, { status: 400 })
    }

    // 查找用户
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      // 安全考虑：即使邮箱不存在，也返回成功，防止枚举攻击
      return NextResponse.json({
        code: 200,
        message: '如果该邮箱已注册，重置链接将发送到邮箱',
        data: { demoMode: false },
      })
    }

    // 生成重置token
    const resetToken = randomBytes(32).toString('hex')
    const expiresAt = Date.now() + RESET_TOKEN_EXPIRE_MS

    // 保存到内存
    resetTokenMap.set(resetToken, {
      userId: user.id,
      token: resetToken,
      expiresAt,
    })

    // 持久化到DB（防止服务重启丢失）
    try {
      await prisma.systemConfig.upsert({
        where: { configKey: `reset_token_${resetToken}` },
        update: {
          configValue: JSON.stringify({ userId: user.id, expiresAt }),
          updatedAt: new Date().toISOString(),
        },
        create: {
          configKey: `reset_token_${resetToken}`,
          configValue: JSON.stringify({ userId: user.id, expiresAt }),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      })
    } catch (_e) { console.error('[reset-password] 创建重置token失败:', _e) }

    // 构建重置链接
    const origin = request.nextUrl.origin || 'http://localhost:3000'
    // 🔥 修复：此前链接指向 /reset-password，但该页面不存在（只有 /forgot-password），
    //   用户点邮件链接必然 404；现指向真实存在的页面。
    const resetLink = `${origin}/tuzhong-wenshu/forgot-password?token=${resetToken}`

    // 检查是否配置了邮件服务
    const mailConfig = await getMailConfig()
    const isDemoMode = !mailConfig

    if (!isDemoMode) {
      const sent = await sendPasswordResetEmail(user.email, resetLink)
      if (sent.ok) {
        console.log('[密码重置] 重置邮件已发送至', user.email)
      } else {
        // 发送失败（SMTP 不可用/凭据错误）不阻断流程：链接回退进服务器日志，管理员可检索
        console.error('[密码重置] 邮件发送失败，回退到日志。错误:', sent.error)
        console.log('[密码重置] 重置链接:', resetLink)
      }
    } else {
      console.log('[密码重置] 演示模式（未配置 SMTP），重置链接:', resetLink)
    }

    return NextResponse.json({
      code: 200,
      // 🔥 安全修复：响应体绝不下发 resetLink（此前演示模式把重置链接返回给任何知道邮箱的访客，
      //   等于开放任意账号接管）。链接只进服务器日志；管理员在服务器 shell 找 reset_token_ 前缀的 key。
      message: isDemoMode
        ? '演示模式：重置链接已生成（请查看服务器日志）'
        : '如果该邮箱已注册，重置链接将发送到邮箱',
      data: {
        demoMode: isDemoMode,
      },
    })
  } catch (error) {
    console.error('密码重置请求失败:', error)
    return NextResponse.json({ code: 500, message: '服务器错误' }, { status: 500 })
  }
}

// GET /api/auth/reset-password/validate-token
// 验证重置token是否有效
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ code: 400, message: '缺少token参数' }, { status: 400 })
    }

    // 先从内存查找
    let tokenStore = resetTokenMap.get(token)

    // 如果内存没有，从DB查找
    if (!tokenStore) {
      try {
        const dbRecord = await prisma.systemConfig.findUnique({
          where: { configKey: `reset_token_${token}` },
        })
        if (dbRecord?.configValue) {
          const parsed = JSON.parse(dbRecord.configValue) as { userId: string; expiresAt: number }
          if (parsed && typeof parsed.expiresAt === 'number' && parsed.expiresAt > Date.now()) {
            tokenStore = {
              userId: parsed.userId,
              token,
              expiresAt: parsed.expiresAt,
            }
            // 放回内存
            resetTokenMap.set(token, tokenStore)
          }
        }
      } catch (_e) { console.error('[reset-password] 解析重置token存储失败:', _e) }
    }

    if (!tokenStore) {
      return NextResponse.json({ code: 400, message: '重置链接无效或已过期' }, { status: 400 })
    }

    if (Date.now() > tokenStore.expiresAt) {
      // 清理过期token
      resetTokenMap.delete(token)
      try {
        await prisma.systemConfig.delete({ where: { configKey: `reset_token_${token}` } })
      } catch (_e) { console.error('[reset-password] 清理过期重置token失败:', _e) }
      return NextResponse.json({ code: 400, message: '重置链接已过期' }, { status: 400 })
    }

    return NextResponse.json({
      code: 200,
      message: '重置链接有效',
      data: { userId: tokenStore.userId },
    })
  } catch (error) {
    console.error('token验证失败:', error)
    return NextResponse.json({ code: 500, message: '服务器错误' }, { status: 500 })
  }
}

// DELETE /api/auth/reset-password/request
// 撤销重置token（用于用户点击链接后立即失效，防止重复使用）
export async function DELETE(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ code: 400, message: '缺少token参数' }, { status: 400 })
    }

    resetTokenMap.delete(token)
    try {
      await prisma.systemConfig.delete({ where: { configKey: `reset_token_${token}` } })
    } catch (_e) { console.error('[reset-password] 撤销删除重置token失败:', _e) }

    return NextResponse.json({ code: 200, message: '重置已撤销' })
  } catch {
    return NextResponse.json({ code: 500, message: '服务器错误' }, { status: 500 })
  }
}
