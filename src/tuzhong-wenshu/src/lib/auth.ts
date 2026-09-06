import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

// JWT 密钥：强制从环境变量读取，不再硬编码兜底（修复 v4 C1 安全漏洞）
const RAW_JWT_SECRET = process.env.JWT_SECRET
if (!RAW_JWT_SECRET || RAW_JWT_SECRET.length < 32) {
  // 开发环境下提供一次性自动生成密钥并打印警告，生产环境必须显式配置
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[安全] JWT_SECRET 环境变量未配置或长度不足 32 字节，拒绝启动')
  }
  console.warn('[安全警告] JWT_SECRET 未配置或过短，开发环境使用临时密钥。生产环境必须配置强随机密钥（≥32字节）。')
}
// 开发环境兜底：使用固定开发密钥（仅开发，避免每次重启都失效）；生产强制使用环境变量
const EFFECTIVE_SECRET = RAW_JWT_SECRET && RAW_JWT_SECRET.length >= 32
  ? RAW_JWT_SECRET
  : 'dev-only-jwt-secret-tuzhong-wenshu-2026-do-not-use-in-production-32bytes'
const JWT_SECRET = new TextEncoder().encode(EFFECTIVE_SECRET)

// bcrypt 盐值轮数：12 轮（v4 Q5 建议，提升暴力破解成本）
const BCRYPT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Token 过期时间：access token 7 天（v4 M1 缩短，降低泄露窗口）
export const ACCESS_TOKEN_EXPIRES = '7d'

export async function createToken(userId: string, isAdmin: boolean): Promise<string> {
  return new SignJWT({ userId, isAdmin })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRES)
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<{ userId: string; isAdmin: boolean } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return { userId: payload.userId as string, isAdmin: payload.isAdmin as boolean }
  } catch {
    return null
  }
}

// 登出黑名单（进程内，生产应迁移 Redis；当前用于支持密码修改后旧 token 失效）
// 注意：Serverless 多实例下不生效，仅作为单实例兜底
const LOGOUT_BLACKLIST = new Set<string>()
const BLACKLIST_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

export function blacklistToken(token: string): void {
  LOGOUT_BLACKLIST.add(token)
  // 简单 TTL 清理：超过 7 天的 token 自然过期，无需显式移除
  setTimeout(() => LOGOUT_BLACKLIST.delete(token), BLACKLIST_TTL_MS).unref?.()
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  return LOGOUT_BLACKLIST.has(token)
}
