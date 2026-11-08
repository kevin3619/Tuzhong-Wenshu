// VIP 统计口径统一工具（修复 P2：admin/stats 与 admin/dashboard 两套口径不一致 + VALID_TIERS 缺 annual）
// 统一判定「有效 VIP」：tier 在付费集合内，且（lifetime 永久有效 / 其余需在 subscriptionExpiresAt 之后）

export const PAID_VIP_TIERS = ['monthly', 'quarterly', 'yearly', 'lifetime', 'pro', 'annual']

export function normalizeVipTier(tier?: string | null): string {
  const t = (tier ? String(tier).toLowerCase() : '').trim()
  if (t === 'annual') return 'yearly' // 历史遗留 'annual' 归一为 'yearly'
  return t
}

export function isActiveVip(user?: { subscriptionTier?: string | null; subscriptionExpiresAt?: string | null | Date } | null): boolean {
  if (!user) return false
  const tier = normalizeVipTier(user.subscriptionTier)
  if (!PAID_VIP_TIERS.includes(tier)) return false
  if (tier === 'lifetime') return true
  const exp = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt as string | Date).getTime() : 0
  return !!exp && exp > Date.now()
}

export async function countActiveVipUsers(prisma: any): Promise<number> {
  try {
    const rows = await prisma.user.findMany({
      where: { subscriptionTier: { in: PAID_VIP_TIERS } },
      select: { subscriptionTier: true, subscriptionExpiresAt: true },
    })
    let n = 0
    for (let i = 0; i < rows.length; i++) {
      if (isActiveVip(rows[i])) n++
    }
    return n
  } catch {
    return 0
  }
}
