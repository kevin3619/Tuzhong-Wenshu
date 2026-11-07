// 修复 v4 C2/M9：简易内存速率限制器
// 生产环境应迁移到 Redis（@upstash/ratelimit），当前为进程内单实例限流
// 适用场景：登录/注册防爆破、AI 生成接口限流

interface RateLimitEntry {
  count: number
  resetAt: number
  blockedUntil?: number
}

const _limitStore = new Map<string, RateLimitEntry>()

/**
 * 检查请求是否被限流
 * @param key 限流键（如 `login:${ip}` 或 `register:${ip}`）
 * @param maxAttempts 最大尝试次数
 * @param windowMs 时间窗口（毫秒）
 * @param blockMs 触发限流后的封禁时长（毫秒），默认等于 windowMs
 * @returns { allowed: boolean; retryAfterSec?: number; remaining: number }
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  blockMs: number = windowMs
): { allowed: boolean; retryAfterSec?: number; remaining: number } {
  const now = Date.now()
  const entry = _limitStore.get(key)

  // 检查是否处于封禁期
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((entry.blockedUntil - now) / 1000),
      remaining: 0,
    }
  }

  // 重置过期窗口
  if (!entry || entry.resetAt <= now) {
    _limitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  // 累加计数
  entry.count += 1
  if (entry.count > maxAttempts) {
    entry.blockedUntil = now + blockMs
    return { allowed: false, retryAfterSec: Math.ceil(blockMs / 1000), remaining: 0 }
  }

  return { allowed: true, remaining: maxAttempts - entry.count }
}

/**
 * 登录成功后重置对应 key 的限流计数（防 NAT 出口合法登录累计误封）
 */
export function resetRateLimit(key: string): void {
  _limitStore.delete(key)
}

/**
 * 从请求中提取客户端 IP（用于限流键）
 * 🔥 安全权衡：生产部署在 nginx 反代后（XFF 由 nginx 设置），信任 XFF；
 *   但属内网/本地地址的伪造值会被拒绝（直连 3001 时 nginx 不存在）。
 */
export function getClientIpFromRequest(request: Request): string {
  const headers = request.headers
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0].trim()
    if (first && !/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(first)) return first
  }
  const xri = headers.get('x-real-ip')
  if (xri) return xri.trim()
  return '127.0.0.1'
}

// 定期清理过期条目（避免内存泄漏）
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of _limitStore.entries()) {
    if (entry.resetAt <= now && (!entry.blockedUntil || entry.blockedUntil <= now)) {
      _limitStore.delete(key)
    }
  }
}, 60 * 1000).unref?.()
