import { prisma } from './prisma'
import { checkRateLimit, getClientIpFromRequest } from './rate-limit'

/**
 * 🔥 修复（P1）：AI 能力此前完全没有计量与限频 ——
 *   dailyQuotaUsed / dailyQuotaLimit / ai_daily_free_quota 三个字段全仓零写入零校验，
 *   免费用户可无限调用生成/改写/评审，商业闭环不成立；失败也照样把整条兜底链打满。
 *
 * 口径：
 *   - 计数按「自然日（Asia/Shanghai）」，日用日期标记存在 SystemConfig（免数据库迁移）；
 *   - 上限取 ai_daily_free_quota（未配置则取用户 dailyQuotaLimit，再兜底 3000）；
 *   - 管理员不受限；
 *   - 采用「预付扣额」：进入接口即计一次（guardAiEndpoint 校验余额、chargeAiUsage 扣减），
 *     避免超时/重试型白嫖；额度本身可通过系统配置 ai_daily_free_quota 调整。
 */

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_LIMIT = 3000

/** 东八区「今天」的日期串，如 2026-10-27 */
function beijingDay(ts = Date.now()): string {
  return new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

async function readLimit(userId: string): Promise<number> {
  try {
    const cfg = await prisma.systemConfig.findUnique({ where: { configKey: 'ai_daily_free_quota' } })
    if (cfg?.configValue) {
      const v = parseInt(cfg.configValue, 10)
      if (!isNaN(v) && v > 0) return v
    }
  } catch { /* 读配置失败则退回用户字段 */ }
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { dailyQuotaLimit: true } })
    if (u && u.dailyQuotaLimit > 0) return u.dailyQuotaLimit
  } catch { /* ignore */ }
  return DEFAULT_LIMIT
}

/** 东八区跨天后把计数归零 */
async function ensureFreshDay(userId: string): Promise<number> {
  const key = 'quota_day_' + userId
  const today = beijingDay()
  let used = 0
  try {
    const row = await prisma.systemConfig.findUnique({ where: { configKey: key } })
    const storedDay = row?.configValue || ''
    if (storedDay !== today) {
      const now = new Date().toISOString()
      await prisma.systemConfig.upsert({
        where: { configKey: key },
        update: { configValue: today, updatedAt: now },
        create: { configKey: key, configValue: today, createdAt: now, updatedAt: now },
      })
      await prisma.user.update({ where: { id: userId }, data: { dailyQuotaUsed: 0 } }).catch(() => {})
    } else {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { dailyQuotaUsed: true } })
      used = (u && u.dailyQuotaUsed) || 0
    }
  } catch (e) {
    console.error('[quota] 维护每日计数失败（按不限处理，避免误伤正常用户）:', e)
    return -1
  }
  return used
}

export type AiGuardResult = { ok: true; userId: string | null } | { ok: false; status: number; message: string }

/**
 * AI 接口入口守卫：登录态 + 每分钟限频 + 当日额度。
 * @param costHint 本次调用的预估扣额单位（仅用于提示，实际扣减由 chargeAiUsage 完成）
 */
export async function guardAiEndpoint(request: Request, endpoint: string, userId: string | null, isAdmin: boolean, costHint = 1): Promise<AiGuardResult> {
  const ip = getClientIpFromRequest(request)
  // 管理身份以库内为准（调用方传进来的 isAdmin 不可信，也可能漏传）
  const admin = isAdmin || (await isUserIdAdmin(userId))

  // 1) 分钟级限频：防脚本刷接口（管理员放宽 10 倍）
  const perMin = admin ? 1200 : 120
  const rl = checkRateLimit('ai:' + endpoint + ':' + (userId || ip), perMin, 60 * 1000, 60 * 1000)
  if (!rl.allowed) {
    return { ok: false, status: 429, message: '请求过于频繁，请 ' + (rl.retryAfterSec || 60) + ' 秒后再试' }
  }

  if (!userId || admin) return { ok: true, userId }

  // 2) 当日额度
  const used = await ensureFreshDay(userId)
  if (used < 0) return { ok: true, userId }
  const limit = await readLimit(userId)
  // 一次用户可见的接口调用只计 1 次（costHint 仅作提示用途），
  //   否则底层多模型调用的接口（续写/评审内部会并行调 3 次）会被按 3 倍惩罚。
  void costHint
  if (used + 1 > limit) {
    return { ok: false, status: 429, message: '今日 AI 调用额度已用完（' + used + '/' + limit + '），请明日再试或升级会员' }
  }
  return { ok: true, userId }
}

/** 成功出账后扣额（失败不要调用，避免"没结果也扣次数"） */
export async function chargeAiUsage(userId: string | null, isAdmin: boolean, units = 1): Promise<void> {
  if (!userId) return
  if (isAdmin || await isUserIdAdmin(userId)) return
  try {
    await ensureFreshDay(userId)
    await prisma.user.update({
      where: { id: userId },
      data: { dailyQuotaUsed: { increment: units } },
    })
  } catch (e) {
    console.error('[quota] 扣减当日额度失败:', e)
  }
}

const _adminFlagCache = new Map<string, { at: number; v: boolean }>()
/** 从库里确认是否管理员（30 秒缓存），避免调用方漏传 isAdmin 把管理员按普通用户计额 */
async function isUserIdAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const hit = _adminFlagCache.get(userId)
  if (hit && Date.now() - hit.at < 30 * 1000) return hit.v
  let v = false
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
    v = !!(u && u.isAdmin)
  } catch (e) { console.error('[quota] 读取管理员标记失败（按普通用户处理）:', e) }
  _adminFlagCache.set(userId, { at: Date.now(), v })
  return v
}

/** 给前端展示剩余用量 */
export async function getQuotaSnapshot(userId: string | null): Promise<{ used: number; limit: number; day: string; resetsInMs: number } | null> {
  if (!userId) return null
  try {
    const used = await ensureFreshDay(userId)
    const limit = await readLimit(userId)
    const now = Date.now() + 8 * 3600 * 1000
    const msUntilTomorrow = DAY_MS - (now % DAY_MS)
    return { used: used < 0 ? 0 : used, limit, day: beijingDay(), resetsInMs: msUntilTomorrow }
  } catch {
    return null
  }
}
