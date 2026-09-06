import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getRequestActor, isAdminOnlyNovel, loadNovelMetaOrNull } from '@/lib/permissions'

const dataDir = path.join(process.cwd(), '.tuzhong-data')

function ensureDataFolder() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

const relationshipsFile = path.join(dataDir, 'relationships.json')

interface Relationship {
  id: string
  from: string
  to: string
  type: string
  description: string
  development?: string
  createdAt: string
  updatedAt?: string
}

function readRelationships(): Record<string, Relationship[]> {
  if (!fs.existsSync(relationshipsFile)) {
    return {}
  }
  try {
    const data = fs.readFileSync(relationshipsFile, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

function writeRelationships(data: Record<string, Relationship[]>) {
  ensureDataFolder()
  fs.writeFileSync(relationshipsFile, JSON.stringify(data, null, 2), 'utf-8')
}

// 检查当前访问者是否有权限读取/写入指定 novel 的人物关系数据
async function checkNovelAccess(request: Request, novelId: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const actor = await getRequestActor(request)
  if (actor.isAdmin) return { ok: true }
  if (isAdminOnlyNovel(String(novelId))) return { ok: false, status: 403, error: '无权访问此作品人物关系' }
  const meta = loadNovelMetaOrNull(String(novelId))
  if (!meta) return { ok: false, status: 404, error: '作品不存在' }
  if (!actor.userId) return { ok: false, status: 401, error: '请先登录' }
  if (meta.userId && String(meta.userId) !== String(actor.userId)) return { ok: false, status: 403, error: '无权访问此作品人物关系' }
  return { ok: true }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')

  const allRelationships = readRelationships()

  if (novelId) {
    // 返回特定作品的人物关系（需校验访问权限）
    const access = await checkNovelAccess(request, novelId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
    }
    let relationships = allRelationships[novelId] || []
    // 如果 relationships.json 为空，自动从 settings.json 的 AI 生成数据中派生同步（仅授权用户触发）
    if (relationships.length === 0) {
      try {
        const settingsFile = path.join(dataDir, 'settings.json')
        if (fs.existsSync(settingsFile)) {
          const allSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
          const novelSettings = allSettings[novelId]
          if (novelSettings && novelSettings.relationships && Array.isArray(novelSettings.relationships.relationships)) {
            relationships = novelSettings.relationships.relationships.map((r: any) => ({
              id: r.id || crypto.randomUUID(),
              from: r.from, to: r.to, type: r.type,
              description: r.description || r.initialRelation || '',
              development: r.development || r.impactOnPlot || '',
              keyEvents: r.keyEvents || '',
              emotionChange: r.emotionChange || '',
              createdAt: new Date().toISOString(),
            }))
            allRelationships[novelId] = relationships
            writeRelationships(allRelationships)
          }
        }
      } catch (e) {
        console.error('[relationships GET] fallback同步失败', e)
      }
    }
    return NextResponse.json({ data: relationships })
  }

  // 不带 novelId：仅返回当前用户有权访问的作品人物关系
  const actor = await getRequestActor(request)
  if (!actor.userId) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  const filtered: Record<string, Relationship[]> = {}
  for (const nid of Object.keys(allRelationships)) {
    if (actor.isAdmin) {
      filtered[nid] = allRelationships[nid]
      continue
    }
    if (isAdminOnlyNovel(String(nid))) continue
    const meta = loadNovelMetaOrNull(String(nid))
    if (meta && meta.userId && String(meta.userId) === String(actor.userId)) {
      filtered[nid] = allRelationships[nid]
    }
  }
  return NextResponse.json({ data: filtered })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { novelId, ...relData } = body

  if (!novelId) {
    return NextResponse.json({ error: '缺少 novelId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  const allRelationships = readRelationships()
  const novelRels = allRelationships[novelId] || []

  const newRel: Relationship = {
    id: crypto.randomUUID(),
    from: relData.from || '',
    to: relData.to || '',
    type: relData.type || '盟友',
    description: relData.description || '',
    development: relData.development || '',
    createdAt: new Date().toISOString(),
  }

  novelRels.push(newRel)
  allRelationships[novelId] = novelRels
  writeRelationships(allRelationships)

  return NextResponse.json({ data: newRel }, { status: 201 })
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { novelId, relationshipId, ...updateData } = body

  if (!novelId || !relationshipId) {
    return NextResponse.json({ error: '缺少 novelId 或 relationshipId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  const allRelationships = readRelationships()
  const novelRels = allRelationships[novelId] || []

  const index = novelRels.findIndex((r) => r.id === relationshipId)
  if (index === -1) {
    return NextResponse.json({ error: '关系不存在' }, { status: 404 })
  }

  novelRels[index] = { ...novelRels[index], ...updateData, updatedAt: new Date().toISOString() }
  allRelationships[novelId] = novelRels
  writeRelationships(allRelationships)

  return NextResponse.json({ data: novelRels[index] })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')
  const relationshipId = searchParams.get('relationshipId')

  if (!novelId || !relationshipId) {
    return NextResponse.json({ error: '缺少 novelId 或 relationshipId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  const allRelationships = readRelationships()
  const novelRels = allRelationships[novelId] || []

  const filtered = novelRels.filter((r) => r.id !== relationshipId)
  allRelationships[novelId] = filtered
  writeRelationships(allRelationships)

  return NextResponse.json({ success: true })
}
