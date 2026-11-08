import type { NextRequest } from 'next/server'
import { getRequestActor, isAdminOnlyNovel, loadNovelMetaOrNull } from './permissions'

/**
 * 统一的作品访问鉴权（此前 chapters/characters/characters-relationships/settings/volumes
 * 5 个 route 各有一份拷贝，2026-09 审计后收敛）。
 * @param resource 用于 403 文案的资源名（如「章节」「角色」「分卷」），保持与原实现一致的错误信息
 */
export async function checkNovelAccessFor(
  request: NextRequest | Request,
  novelId: string,
  resource: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const actor = await getRequestActor(request)
  if (actor.isAdmin) return { ok: true }
  if (isAdminOnlyNovel(String(novelId))) return { ok: false, status: 403, error: `无权访问此作品${resource}` }
  const meta = loadNovelMetaOrNull(String(novelId))
  if (!meta) return { ok: false, status: 404, error: '作品不存在' }
  if (!actor.userId) return { ok: false, status: 401, error: '请先登录' }
  // 🔥 修复（P2 越权）：旧写法 meta.userId && ... 等于「归属为空的任何人都能读写」。
  //   无主作品现在只允许管理员处置，避免跨账号串读串写。
  if (!meta.userId) return { ok: false, status: 403, error: `该${resource}数据缺少归属信息，仅管理员可访问` }
  if (String(meta.userId) !== String(actor.userId)) return { ok: false, status: 403, error: `无权访问此作品${resource}` }
  return { ok: true }
}
