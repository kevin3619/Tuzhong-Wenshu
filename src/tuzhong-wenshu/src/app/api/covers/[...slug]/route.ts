import { NextRequest } from 'next/server'
import { getRequestActor } from '@/lib/permissions'

// GET /api/covers/{file}
// 🔥 P2 #4 安全修复：该端点为遗留路径，无任何 novelId→文件归属映射，
//   任何登录用户均可按文件名读取 COVERS_DIR 下任意封面（越权读取面）。
//   正规封面端点为 /api/novels/cover?id=（已强制归属校验），故此端点废弃返回 404，
//   彻底消除越权读取面，且前端零引用（已 grep 确认无客户端/服务端调用）。
export async function GET(request: NextRequest) {
  const actor = await getRequestActor(request)
  if (!actor.isAdmin && !actor.userId) {
    return new Response('Unauthorized', { status: 401 })
  }
  return new Response('Not Found', { status: 404 })
}
