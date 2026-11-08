import { NextResponse, NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { isAdminOnlyNovel, getRequestActor, loadNovelMetaOrNull } from '@/lib/permissions'
import { checkNovelAccessFor } from '@/lib/novel-access'
import { atomicWriteJson, runExclusive } from '@/lib/file-lock'

const dataDir = path.join(process.cwd(), '.tuzhong-data')

// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const volumesFile = path.join(dataDir, 'volumes.json')

// 读取分卷数据
function readVolumes() {
  if (!fs.existsSync(volumesFile)) {
    return {}
  }
  try {
    const data = fs.readFileSync(volumesFile, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

// 写入分卷数据
function writeVolumes(data: unknown) {
  atomicWriteJson(volumesFile, data)
}


const checkNovelAccess = (request: Request | NextRequest, novelId: string) =>
  checkNovelAccessFor(request, novelId, '分卷')

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')

  const allVolumes = readVolumes()

  if (novelId) {
    const access = await checkNovelAccess(request, novelId)
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
    }
    // 返回特定作品的分卷列表
    const data = allVolumes[novelId] || []
    return NextResponse.json({
      success: true,
      data: Array.isArray(data) ? data : data.volumes || [],
    })
  }

  // 返回所有作品的分卷数据（仅管理员或仅返回当前用户有权限的部分）
  const actor = await getRequestActor(request)
  if (actor.isAdmin) {
    return NextResponse.json({ success: true, data: allVolumes })
  }
  // 普通用户：只返回自己的，过滤管理员专属小说
  const filtered: Record<string, unknown> = {}
  for (const key of Object.keys(allVolumes)) {
    if (isAdminOnlyNovel(key)) continue
    const meta = loadNovelMetaOrNull(key)
    if (meta && actor.userId && meta.userId === actor.userId) filtered[key] = allVolumes[key]
  }
  return NextResponse.json({ success: true, data: filtered })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { novelId, name, summary, coreObjective, order, chapters } = body

  if (!novelId) {
    return NextResponse.json({ success: false, error: '缺少 novelId 参数' }, { status: 400 })
  }
  if (!name) {
    return NextResponse.json({ success: false, error: '缺少卷名 name 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  return await runExclusive(volumesFile, async () => {
    const allVolumes = readVolumes()
    if (!allVolumes[novelId]) {
      allVolumes[novelId] = []
    }

    const newVolume = {
      id: Date.now().toString(),
      novelId,
      name: name || '',
      summary: summary || '',
      coreObjective: coreObjective || '',
      order: order ?? allVolumes[novelId].length + 1,
      chapters: chapters || [],
      createdAt: new Date().toISOString(),
    }

    allVolumes[novelId].push(newVolume)
    writeVolumes(allVolumes)

    return NextResponse.json({ success: true, data: newVolume }, { status: 201 })
  })
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { novelId, volumeId, name, summary, coreObjective, order, chapters } = body

  if (!novelId || !volumeId) {
    return NextResponse.json({ success: false, error: '缺少 novelId 或 volumeId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  return await runExclusive(volumesFile, async () => {
    const allVolumes = readVolumes()
    if (!allVolumes[novelId]) {
      return NextResponse.json({ success: false, error: '作品不存在' }, { status: 404 })
    }

    const index = allVolumes[novelId].findIndex((v: any) => v.id === volumeId)
    if (index === -1) {
      return NextResponse.json({ success: false, error: '分卷不存在' }, { status: 404 })
    }

    const updated = { ...allVolumes[novelId][index] }
    if (name !== undefined) updated.name = name
    if (summary !== undefined) updated.summary = summary
    if (coreObjective !== undefined) updated.coreObjective = coreObjective
    if (order !== undefined) updated.order = order
    if (chapters !== undefined) updated.chapters = chapters
    updated.updatedAt = new Date().toISOString()

    allVolumes[novelId][index] = updated
    writeVolumes(allVolumes)

    return NextResponse.json({ success: true, data: updated })
  })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')
  const volumeId = searchParams.get('volumeId')
  if (!novelId || !volumeId) {
    return NextResponse.json({ success: false, error: '缺少 novelId 或 volumeId 参数' }, { status: 400 })
  }
  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  return await runExclusive(volumesFile, async () => {
    const allVolumes = readVolumes()
    if (!allVolumes[novelId]) {
      return NextResponse.json({ success: false, error: '作品不存在' }, { status: 404 })
    }
    const idx = allVolumes[novelId].findIndex((v: any) => v.id === volumeId)
    if (idx === -1) {
      return NextResponse.json({ success: false, error: '分卷不存在' }, { status: 404 })
    }
    allVolumes[novelId].splice(idx, 1)
    writeVolumes(allVolumes)
    return NextResponse.json({ success: true })
  })
}
