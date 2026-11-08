import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getRequestActor, isAdminOnlyNovel, loadNovelMetaOrNull } from '@/lib/permissions'
import { checkNovelAccessFor } from '@/lib/novel-access'
import { atomicWriteJson, runExclusive } from '@/lib/file-lock'

const dataDir = path.join(process.cwd(), '.tuzhong-data')

// 惰性初始化数据目录（避免模块加载时执行文件系统操作）
function ensureDataFolder() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

const charactersFile = path.join(dataDir, 'characters.json')

// 读取角色数据
function readCharacters() {
  if (!fs.existsSync(charactersFile)) {
    return {}
  }
  try {
    const data = fs.readFileSync(charactersFile, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

// 写入角色数据
function writeCharacters(data: unknown) {
  ensureDataFolder()
  atomicWriteJson(charactersFile, data)
}

// 检查当前访问者是否有权限读取/写入指定 novel 的角色数据

const checkNovelAccess = (request: Request, novelId: string) =>
  checkNovelAccessFor(request, novelId, '角色')

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')

  const allCharacters = readCharacters()

  if (novelId) {
    // 返回特定作品的角色（需校验访问权限）
    const access = await checkNovelAccess(request, novelId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
    }
    const characters = allCharacters[novelId] || []
    return NextResponse.json({ data: characters })
  }

  // 不带 novelId：仅返回当前用户有权访问的作品角色（按作品分组）
  const actor = await getRequestActor(request)
  if (!actor.userId) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  const filtered: Record<string, unknown> = {}
  for (const nid of Object.keys(allCharacters)) {
    if (actor.isAdmin) {
      filtered[nid] = allCharacters[nid]
      continue
    }
    if (isAdminOnlyNovel(String(nid))) continue
    const meta = loadNovelMetaOrNull(String(nid))
    if (meta && meta.userId && String(meta.userId) === String(actor.userId)) {
      filtered[nid] = allCharacters[nid]
    }
  }
  return NextResponse.json({ data: filtered })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { novelId, ...characterData } = body

  if (!novelId) {
    return NextResponse.json({ error: '缺少 novelId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  return await runExclusive(charactersFile, async () => {
    const allCharacters = readCharacters()
    const novelCharacters = allCharacters[novelId] || []

    const newCharacter = {
      id: crypto.randomUUID(),
      ...characterData,
      createdAt: new Date().toISOString(),
    }

    novelCharacters.push(newCharacter)
    allCharacters[novelId] = novelCharacters
    writeCharacters(allCharacters)

    return NextResponse.json({ data: newCharacter }, { status: 201 })
  })
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { novelId, characterId, ...updateData } = body

  if (!novelId || !characterId) {
    return NextResponse.json({ error: '缺少 novelId 或 characterId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  return await runExclusive(charactersFile, async () => {
    const allCharacters = readCharacters()
    const novelCharacters = allCharacters[novelId] || []

    const index = novelCharacters.findIndex((c: any) => c.id === characterId)
    if (index === -1) {
      return NextResponse.json({ error: '角色不存在' }, { status: 404 })
    }

    novelCharacters[index] = { ...novelCharacters[index], ...updateData }
    allCharacters[novelId] = novelCharacters
    writeCharacters(allCharacters)

    return NextResponse.json({ data: novelCharacters[index] })
  })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')
  const characterId = searchParams.get('characterId')

  if (!novelId || !characterId) {
    return NextResponse.json({ error: '缺少 novelId 或 characterId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  return await runExclusive(charactersFile, async () => {
    const allCharacters = readCharacters()
    const novelCharacters = allCharacters[novelId] || []

    const filtered = novelCharacters.filter((c: any) => c.id !== characterId)
    allCharacters[novelId] = filtered
    writeCharacters(allCharacters)

    return NextResponse.json({ success: true })
  })
}
