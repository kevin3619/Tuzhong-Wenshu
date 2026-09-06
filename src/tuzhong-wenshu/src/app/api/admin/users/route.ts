import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { verifyAdmin } from '@/lib/permissions'
import { loadFsNovels } from '@/lib/novel-storage'

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, code: 403, message: '无权限' }, { status: 403 })

  try {
    const usersRaw = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, username: true, nickname: true, email: true,
        avatarUrl: true, wechatOpenid: true,
        isAdmin: true, subscriptionTier: true, subscriptionStartedAt: true, subscriptionExpiresAt: true,
        status: true, createdAt: true,
        _count: { select: { novels: true } },
      },
    })

    // 修复：DB 与文件系统(novels.json)可能存同一部作品，必须按作品 id 去重后再统计，
    // 否则同一个人若 DB 和 FS 都有该作品会被重复计数。同时与 all-works 弹窗(已去重)保持一致。
    const dbAll = await prisma.novel.findMany({ select: { id: true, userId: true } })
    const dbIdSet = new Set<string>()
    const dbCountByUser = new Map<string, number>()
    for (let i = 0; i < dbAll.length; i++) {
      const n = dbAll[i]
      dbIdSet.add(String(n.id))
      const uid = String(n.userId || '')
      dbCountByUser.set(uid, (dbCountByUser.get(uid) || 0) + 1)
    }

    const fsBooks = loadFsNovels()
    const fsNovelCountByUser = new Map<string, number>()
    const fsNovelIdsSeen = new Set<string>()
    for (let i = 0; i < fsBooks.length; i++) {
      const b: Record<string, unknown> = fsBooks[i]
      const bid = String(b.id || '')
      // 已在 DB 中统计过的作品不再重复计入，解决双源重复计数
      if (!bid || dbIdSet.has(bid)) continue
      if (fsNovelIdsSeen.has(bid)) continue
      fsNovelIdsSeen.add(bid)
      const uid = String(b.userId || '')
      fsNovelCountByUser.set(uid, (fsNovelCountByUser.get(uid) || 0) + 1)
    }

    const users = usersRaw.map(function (u) {
      const uid = String(u.id)
      const dbNovels = Number(dbCountByUser.get(uid) || 0)
      const fsNovels = Number(fsNovelCountByUser.get(uid) || 0)
      return {
        id: u.id, username: u.username, nickname: u.nickname, email: u.email,
        isAdmin: !!u.isAdmin, subscriptionTier: u.subscriptionTier,
        subscriptionStartedAt: u.subscriptionStartedAt || null,
        subscriptionExpiresAt: u.subscriptionExpiresAt || null,
        status: Number(u.status),
        novelCount: dbNovels + fsNovels,
        createdAt: u.createdAt,
      }
    })
    return NextResponse.json({ success: true, code: 200, data: users })
  } catch (e) {
    // 修复 v4 C10：生产环境不泄露内部异常详情
    console.error('[admin/users GET] 获取用户列表失败:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, code: 500, message: isProd ? '获取用户列表失败' : '获取用户列表失败: ' + (e instanceof Error ? e.message : '未知错误') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, code: 403, message: '无权限' }, { status: 403 })

  try {
    const { username, nickname, password, email, isAdmin: setAdmin } = await request.json()

    // 参数校验：用户名/昵称/密码必填
    if (!username || typeof username !== 'string' || !username.trim()) {
      return NextResponse.json({ success: false, code: 400, message: '用户名为必填项' }, { status: 400 })
    }
    if (!nickname || typeof nickname !== 'string' || !nickname.trim()) {
      return NextResponse.json({ success: false, code: 400, message: '昵称为必填项' }, { status: 400 })
    }
    if (!password || typeof password !== 'string' || password.length < 6 || password.length > 16) {
      return NextResponse.json({ success: false, code: 400, message: '密码长度必须在 6-16 位之间' }, { status: 400 })
    }

    const cleanUsername = username.trim()
    const cleanNickname = nickname.trim()
    const cleanEmail = (email && typeof email === 'string' && email.trim()) ? email.trim() : null

    // 用户名唯一性校验
    const existing = await prisma.user.findUnique({ where: { username: cleanUsername } })
    if (existing) {
      return NextResponse.json({ success: false, code: 409, message: '用户名已存在' }, { status: 409 })
    }
    // 邮箱唯一性校验（若提供）
    if (cleanEmail) {
      const emailExists = await prisma.user.findUnique({ where: { email: cleanEmail } })
      if (emailExists) {
        return NextResponse.json({ success: false, code: 409, message: '邮箱已被使用' }, { status: 409 })
      }
    }

    // 密码使用 bcrypt 哈希存储（复用 @/lib/auth 的 hashPassword，BCRYPT_ROUNDS=12）
    const hashedPassword = await hashPassword(password)

    await prisma.user.create({
      data: {
        username: cleanUsername,
        password: hashedPassword,
        nickname: cleanNickname,
        email: cleanEmail,
        status: 1,
        subscriptionTier: 'free',
        isAdmin: !!setAdmin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })

    // 审计日志（服务端控制台，生产可接入日志系统）
    console.log(`[admin-audit] 管理员 ${admin.userId} 创建用户 ${cleanUsername}`)

    return NextResponse.json({ success: true, code: 200, message: '创建成功' })
  } catch (e) {
    // 修复 v4 C10：生产环境不泄露内部异常详情
    console.error('[admin/users POST] 创建失败:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, code: 500, message: isProd ? '创建失败' : '创建失败: ' + (e instanceof Error ? e.message : '未知错误') }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, code: 403, message: '无权限' }, { status: 403 })

  try {
    const { userId, status, subscriptionTier, subscriptionStartedAt, subscriptionExpiresAt, isAdmin: setAdmin } = await request.json()
    const updateData: {
      updatedAt: string
      status?: number
      subscriptionTier?: string
      subscriptionStartedAt?: string | null
      subscriptionExpiresAt?: string | null
      isAdmin?: boolean
    } = { updatedAt: new Date().toISOString() }
    const VALID_TIERS_PUT = ['free', 'monthly', 'quarterly', 'yearly', 'lifetime', 'pro']
    if (status !== undefined) updateData.status = status
    if (subscriptionTier !== undefined) {
      const t = String(subscriptionTier).trim()
      updateData.subscriptionTier = VALID_TIERS_PUT.includes(t) ? t : 'free'
    }
    if (subscriptionStartedAt !== undefined) updateData.subscriptionStartedAt = subscriptionStartedAt || null
    if (subscriptionExpiresAt !== undefined) updateData.subscriptionExpiresAt = subscriptionExpiresAt || null

    // 修复 v4 L6：管理员标志变更增加审计日志 + 最后一个管理员保护
    if (setAdmin !== undefined) {
      // 查询目标用户当前状态
      const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, username: true } })
      if (!targetUser) {
        return NextResponse.json({ success: false, code: 404, message: '用户不存在' }, { status: 404 })
      }
      // 如果是降级管理员（true → false），检查是否是最后一个管理员
      if (targetUser.isAdmin && !setAdmin) {
        const adminCount = await prisma.user.count({ where: { isAdmin: true } })
        if (adminCount <= 1) {
          return NextResponse.json({ success: false, code: 403, message: '无法降级最后一个管理员，请先指定其他管理员' }, { status: 403 })
        }
      }
      updateData.isAdmin = setAdmin
      // 审计日志（服务端控制台，生产可接入日志系统）
      console.log(`[admin-audit] 管理员 ${admin.userId} ${setAdmin ? '提升' : '降级'} 用户 ${userId}(${targetUser.username}) 管理员权限`)
    }

    await prisma.user.update({ where: { id: userId }, data: updateData })
    return NextResponse.json({ success: true, code: 200, message: '更新成功' })
  } catch (e) {
    // 修复 v4 C10：生产环境不泄露内部异常详情
    console.error('[admin/users PUT] 更新失败:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, code: 500, message: isProd ? '更新失败' : '更新失败: ' + (e instanceof Error ? e.message : '未知错误') }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, code: 403, message: '无权限' }, { status: 403 })

  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ success: false, code: 400, message: '缺少用户ID' }, { status: 400 })

    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, username: true } })
    if (!targetUser) return NextResponse.json({ success: false, code: 404, message: '用户不存在' }, { status: 404 })
    if (targetUser.isAdmin) return NextResponse.json({ success: false, code: 403, message: '管理员账号受保护，不可删除' }, { status: 403 })

    await prisma.user.delete({ where: { id: userId } })
    // 审计日志
    console.log(`[admin-audit] 管理员 ${admin.userId} 删除用户 ${userId}(${targetUser.username})`)
    return NextResponse.json({ success: true, code: 200, message: '用户已删除' })
  } catch (e) {
    // 修复 v4 C10：生产环境不泄露内部异常详情
    console.error('[admin/users DELETE] 删除失败:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, code: 500, message: isProd ? '删除失败' : '删除失败: ' + (e instanceof Error ? e.message : '未知错误') }, { status: 500 })
  }
}
