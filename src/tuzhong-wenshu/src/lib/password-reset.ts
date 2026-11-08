import { prisma } from './prisma'
import { randomBytes } from 'crypto'

/**
 * 密码重置令牌（内存 + SystemConfig 双写，重启不丢）
 * 🔥 2026-10-27：把原先内联在 reset-password/request/route.ts 里的逻辑抽出来，
 *   供 request / validate-token / confirm 三处共用，避免两份实现漂移。
 */
export interface ResetTokenStore {
  userId: string
  token: string
  expiresAt: number
}

const RESET_TOKEN_EXPIRE_MS = 30 * 60 * 1000 // 30 分钟
const KEY_PREFIX = 'reset_token_'

function getMap(): Map<string, ResetTokenStore> {
  const g = globalThis as unknown as { __resetTokenMap?: Map<string, ResetTokenStore> }
  if (!g.__resetTokenMap) g.__resetTokenMap = new Map<string, ResetTokenStore>()
  return g.__resetTokenMap
}

export async function issueResetToken(userId: string): Promise<ResetTokenStore> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + RESET_TOKEN_EXPIRE_MS
  const store = { userId, token, expiresAt }
  getMap().set(token, store)
  const now = new Date().toISOString()
  await prisma.systemConfig.upsert({
    where: { configKey: KEY_PREFIX + token },
    update: { configValue: JSON.stringify({ userId, expiresAt }), updatedAt: now },
    create: { configKey: KEY_PREFIX + token, configValue: JSON.stringify({ userId, expiresAt }), createdAt: now, updatedAt: now },
  })
  return store
}

/** 读取并校验令牌；过期时顺手清理。无效返回 null。 */
export async function readResetToken(token: string): Promise<ResetTokenStore | null> {
  if (!token) return null
  let store = getMap().get(token) || null
  if (!store) {
    try {
      const row = await prisma.systemConfig.findUnique({ where: { configKey: KEY_PREFIX + token } })
      if (row?.configValue) {
        const parsed = JSON.parse(row.configValue) as { userId?: unknown; expiresAt?: unknown }
        if (parsed && typeof parsed.expiresAt === 'number' && typeof parsed.userId === 'string' && parsed.expiresAt > Date.now()) {
          store = { userId: parsed.userId, token, expiresAt: parsed.expiresAt }
          getMap().set(token, store)
        }
      }
    } catch (e) {
      console.error('[password-reset] 解析重置令牌失败:', e)
    }
  }
  if (!store) return null
  if (Date.now() > store.expiresAt) {
    await invalidateResetToken(token)
    return null
  }
  return store
}

export async function invalidateResetToken(token: string): Promise<void> {
  getMap().delete(token)
  try {
    await prisma.systemConfig.delete({ where: { configKey: KEY_PREFIX + token } })
  } catch {
    /* 已不存在则忽略 */
  }
}
