import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import { getRequestActor } from '@/lib/permissions'
import { atomicWriteJson } from '@/lib/file-lock'

const LOCAL_DATA_DIR = join(process.cwd(), '.tuzhong-data')
const NOVEL_BOOK_FILE = join(LOCAL_DATA_DIR, 'novels.json')
const USER_METADATA_FILE = join(LOCAL_DATA_DIR, 'user-metadata.json')

function ensureDataFolder() {
  if (!existsSync(LOCAL_DATA_DIR)) {
    mkdirSync(LOCAL_DATA_DIR, { recursive: true })
  }
}

function loadNovelBooks() {
  if (!existsSync(NOVEL_BOOK_FILE)) {
    return []
  }
  try {
    const fileRawText = readFileSync(NOVEL_BOOK_FILE, 'utf-8')
    const parsedBooks = JSON.parse(fileRawText)
    return Array.isArray(parsedBooks) ? parsedBooks : []
  } catch {
    return []
  }
}

interface UserMetadata {
  vipStatus?: string
  vipExpireDate?: string
  firstGeneratedNovelId?: string
  totalGeneratedCount?: number
  createdNovelIds?: string[]
}

// 修复 v4 C6：按 userId 加载用户元数据，避免全局共享 VIP 状态
// 元数据结构：{ [userId]: { vipStatus, vipExpireDate, firstGeneratedNovelId, totalGeneratedCount, createdNovelIds } }
function loadUserMetadataMap(): Record<string, UserMetadata> {
  if (!existsSync(USER_METADATA_FILE)) {
    return {}
  }
  try {
    const fileRawText = readFileSync(USER_METADATA_FILE, 'utf-8')
    const parsed = JSON.parse(fileRawText)
    // 兼容旧格式（单用户全局对象）：自动迁移到 { __legacy__: <旧数据> }
    if (parsed && typeof parsed === 'object' && !parsed.__legacy__ && (parsed.vipStatus !== undefined || parsed.totalGeneratedCount !== undefined)) {
      return { __legacy__: parsed }
    }
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveUserMetadataMap(map: Record<string, UserMetadata>) {
  ensureDataFolder()
  atomicWriteJson(USER_METADATA_FILE, map)
}

function getUserMetadata(map: Record<string, UserMetadata>, userId: string): UserMetadata {
  return map[userId] || {
    vipStatus: 'free',
    vipExpireDate: '',
    firstGeneratedNovelId: '',
    totalGeneratedCount: 0,
    createdNovelIds: [] as string[]
  }
}

// 修复 v4 C6：按 userId 从 Prisma 数据库查询 VIP 状态（权威数据源）
async function checkVipFromDb(userId: string): Promise<{ isVip: boolean; expireDate: string; tier: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionTier: true, subscriptionExpiresAt: true }
    })
    if (!user) return { isVip: false, expireDate: '', tier: 'free' }
    const tier = user.subscriptionTier || 'free'
    if (tier === 'free') return { isVip: false, expireDate: '', tier: 'free' }
    // 终身会员永不过期
    if (tier === 'lifetime') {
      return { isVip: true, expireDate: user.subscriptionExpiresAt || '', tier: 'lifetime' }
    }
    // 限时会员（pro/monthly/quarterly/annual）：校验过期时间
    if (user.subscriptionExpiresAt) {
      const expireDate = new Date(user.subscriptionExpiresAt)
      if (expireDate > new Date()) {
        return { isVip: true, expireDate: user.subscriptionExpiresAt, tier }
      }
      return { isVip: false, expireDate: '', tier: 'free' }
    }
    return { isVip: false, expireDate: '', tier: 'free' }
  } catch (e) {
    console.warn('[vip/check] Prisma VIP检查失败:', e instanceof Error ? e.message : String(e))
    return { isVip: false, expireDate: '', tier: 'free' }
  }
}

// 修复 v4 C6：增加 JWT 校验，按 userId 隔离数据
export async function GET(request: Request) {
  const actor = await getRequestActor(request)
  if (!actor.userId) {
    return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 })
  }

  // 管理员可查看全局作品总数；普通用户仅查看自己的
  const allBooks = loadNovelBooks()
  const userBooks = actor.isAdmin
    ? allBooks
    : allBooks.filter((b) => b.userId === actor.userId)

  const metadataMap = loadUserMetadataMap()
  const metadata = getUserMetadata(metadataMap, actor.userId)
  const dbVip = await checkVipFromDb(actor.userId)

  // 数据库 VIP 优先，本地 JSON 回退
  const isVip = dbVip.isVip || metadata.vipStatus === 'vip'
  const vipExpireDate = dbVip.isVip ? dbVip.expireDate : metadata.vipExpireDate

  const canGenerate = isVip ||
    (metadata.totalGeneratedCount === 0 ||
     (metadata.totalGeneratedCount === 1 && !metadata.firstGeneratedNovelId))

  return NextResponse.json({
    success: true,
    data: {
      totalNovels: userBooks.length,
      vipStatus: isVip ? 'vip' : 'free',
      vipTier: dbVip.tier,
      vipExpireDate: vipExpireDate,
      totalGeneratedCount: metadata.totalGeneratedCount,
      firstGeneratedNovelId: metadata.firstGeneratedNovelId,
      canGenerate: canGenerate,
      needsVip: !canGenerate
    }
  })
}

export async function POST(request: Request) {
  try {
    // 修复 v4 C6：增加 JWT 校验
    const actor = await getRequestActor(request)
    if (!actor.userId) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 })
    }

    const body = await request.json()
    const { action, novelId } = body

    const metadataMap = loadUserMetadataMap()
    const metadata = getUserMetadata(metadataMap, actor.userId)

    if (action === 'record-first-generation') {
      if (!metadata.firstGeneratedNovelId && novelId) {
        metadata.firstGeneratedNovelId = novelId
        metadata.totalGeneratedCount = 1
        if (!metadata.createdNovelIds) metadata.createdNovelIds = []
        metadata.createdNovelIds.push(novelId)
        metadataMap[actor.userId] = metadata
        saveUserMetadataMap(metadataMap)
      }
      return NextResponse.json({ success: true, data: metadata })
    }

    if (action === 'record-generation') {
      metadata.totalGeneratedCount = (metadata.totalGeneratedCount || 0) + 1
      if (!metadata.createdNovelIds) metadata.createdNovelIds = []
      if (novelId && !metadata.createdNovelIds.includes(novelId)) {
        metadata.createdNovelIds.push(novelId)
      }
      metadataMap[actor.userId] = metadata
      saveUserMetadataMap(metadataMap)
      return NextResponse.json({ success: true, data: metadata })
    }

    if (action === 'check-quota') {
      const dbVip = await checkVipFromDb(actor.userId)
      const isVip = dbVip.isVip || metadata.vipStatus === 'vip'
      const canGenerate = isVip ||
        (metadata.totalGeneratedCount === 0 ||
         (metadata.totalGeneratedCount === 1 && !metadata.firstGeneratedNovelId))
      return NextResponse.json({
        success: true,
        data: {
          canGenerate,
          needsVip: !canGenerate,
          totalGeneratedCount: metadata.totalGeneratedCount,
          vipStatus: isVip ? 'vip' : 'free',
          vipTier: dbVip.tier
        }
      })
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
