import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { NextRequest } from 'next/server'
import { verifyToken } from './auth'

// 修复：动态解析数据目录路径
function resolveDataDir(): string {
  const candidates = [
    join(process.cwd(), '.tuzhong-data'),
    join(process.cwd(), 'src', 'tuzhong-wenshu', '.tuzhong-data'),
    join(process.cwd(), '..', '.tuzhong-data'),
    '/www/wwwroot/tuzhong-wenshu/.tuzhong-data',
  ]
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch {
      // 继续尝试
    }
  }
  return join(process.cwd(), '.tuzhong-data')
}

const LOCAL_DATA_DIR = resolveDataDir()
const NOVEL_BOOK_FILE = join(LOCAL_DATA_DIR, 'novels.json')

// 管理员专属知名小说 ID 列表：9 本导入的知名网文作品，仅管理员账号可见
export const ADMIN_ONLY_NOVEL_IDS = new Set<string>([
  '1784900336466', // 凡人修仙传
  '1784900336477', // 斗破苍穹
  '1784900336478', // 遮天
  '1784900336878', // 吞噬星空
  '1784900336978', // 赘婿
  '1784900336479', // 大魏宫廷
  '1784900336480', // 回到明朝当王爷
  '1784900337280', // 巫颂
  '1784900337380', // 剑道独尊
])

// 从 request 中取出 token（支持 Authorization: Bearer xxx 和 cookies.token）
export function extractTokenFromRequest(request: NextRequest | Request): string | null {
  const anyReq = request as unknown as {
    headers?: { get?: (name: string) => string | null; authorization?: string; cookie?: string }
    cookies?: { get?: (name: string) => { value?: string } | undefined }
  }
  const authHeader: string | null =
    (typeof anyReq.headers?.get === 'function' ? anyReq.headers.get('authorization') : null) ||
    (anyReq.headers?.authorization as string) ||
    null
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1]
  }
  // NextRequest cookies
  if (typeof anyReq.cookies?.get === 'function') {
    const v = anyReq.cookies.get('token')?.value
    if (v) return v
  }
  // 原始 Request cookies（header 解析）
  const cookieHeader: string | null =
    (typeof anyReq.headers?.get === 'function' ? anyReq.headers.get('cookie') : null) ||
    (anyReq.headers?.cookie as string) ||
    null
  if (cookieHeader) {
    const m = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith('token='))
    if (m) return m.substring('token='.length)
  }
  return null
}

export type RequestActor = { userId: string | null; isAdmin: boolean }

export async function getRequestActor(request: NextRequest | Request): Promise<RequestActor> {
  const token = extractTokenFromRequest(request)
  if (!token) return { userId: null, isAdmin: false }
  const payload = await verifyToken(token)
  if (!payload) return { userId: null, isAdmin: false }
  return { userId: payload.userId, isAdmin: !!payload.isAdmin }
}

// 管理员鉴权：通过 getRequestActor 校验，是管理员返回 { userId, isAdmin }，否则返回 null
export async function verifyAdmin(request: NextRequest | Request): Promise<{ userId: string; isAdmin: boolean } | null> {
  const actor = await getRequestActor(request)
  if (!actor.isAdmin || !actor.userId) return null
  return { userId: actor.userId, isAdmin: actor.isAdmin }
}

export function isAdminOnlyNovel(novelId: string): boolean {
  return ADMIN_ONLY_NOVEL_IDS.has(String(novelId))
}

// 从 novels.json 读取作品所属 userId（用于章节/卷/设定接口二次授权）
// 若作品是管理员专属知名小说，也视为通过（因为前置 /api/novels?id= 已经过滤）
export function loadNovelMetaOrNull(novelId: string): { userId: string | null } | null {
  try {
    if (!existsSync(NOVEL_BOOK_FILE)) return null
    const all = JSON.parse(readFileSync(NOVEL_BOOK_FILE, 'utf-8'))
    if (!Array.isArray(all)) return null
    const found = all.find((b: Record<string, unknown>) => String(b.id) === String(novelId)) as Record<string, unknown> | undefined
    if (!found) return null
    return { userId: (found.userId as string) || null }
  } catch {
    return null
  }
}
