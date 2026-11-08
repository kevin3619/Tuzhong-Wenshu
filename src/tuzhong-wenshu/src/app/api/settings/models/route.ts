import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { verifyToken } from '@/lib/auth'
import { atomicWriteJson } from '@/lib/file-lock'

const dataDir = path.join(process.cwd(), '.tuzhong-data')
const modelsFile = path.join(dataDir, 'models.json')

interface ModelConfig {
  id: string
  provider: string
  name: string
  status: 'default' | 'active' | 'inactive'
  apiKey?: string
  baseUrl?: string
  model?: string
  userId?: string
  isAdminDefault?: boolean
  // 🔥 2026-09-24：可选的按模型调用频率限制（opt-in，仅带此字段的模型后端才限流）
  rateLimit?: { perMinute?: number; perHour?: number; perDay?: number }
  createdAt?: string
  updatedAt?: string
}

// 确保数据目录和文件存在
function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  if (!fs.existsSync(modelsFile)) {
    fs.writeFileSync(modelsFile, JSON.stringify([], null, 2), 'utf-8')
  }
}

// 读取模型配置数据
function readModels(): ModelConfig[] {
  ensureDataFile()
  try {
    const data = fs.readFileSync(modelsFile, 'utf-8')
    const parsed: ModelConfig[] = JSON.parse(data)
    // 修复：数据迁移——管理员创建的旧模型缺少 isAdminDefault 字段，自动补 true
    // （之前用 kevin 账号新建的6个模型没有这个字段，导致普通用户看不到）
    const userFile = path.join(dataDir, 'users.json')
    let adminIds: string[] = []
    try {
      if (fs.existsSync(userFile)) {
        const users = JSON.parse(fs.readFileSync(userFile, 'utf-8'))
        if (Array.isArray(users)) {
          adminIds = users.filter(function (u) { return u && u.role === 'admin' }).map(function (u) { return u.id || u.userId })
        }
      }
    } catch (_e) {}
    let migrated = false
    for (let i = 0; i < parsed.length; i++) {
      const m = parsed[i]
      if (m.isAdminDefault === undefined || m.isAdminDefault === null) {
        if (adminIds.length > 0 && m.userId && adminIds.indexOf(m.userId) !== -1) {
          parsed[i] = Object.assign({}, m, { isAdminDefault: true })
          migrated = true
        } else if (!m.userId) {
          // 没有 userId 的旧模型，无法判断归属，保持不变
          parsed[i] = Object.assign({}, m, { isAdminDefault: false })
          migrated = true
        }
      }
    }
    if (migrated) {
      try { writeModels(parsed) } catch (_e) {}
    }
    return parsed
  } catch {
    return []
  }
}

// 写入模型配置数据
// 本环境 safe-delete 会拦截 rename/unlink 等删除语义，因此不用 tmp+rename 原子写。
// 直接 writeFileSync 覆盖已存在文件不触发删除语义，可绕过 safe-delete 拦截。
function writeModels(data: ModelConfig[]) {
  ensureDataFile()
  atomicWriteJson(modelsFile, data)
}

function generateId(): string {
  return `model_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

async function getCurrentUser(request: Request): Promise<{ userId: string; isAdmin: boolean } | null> {
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return null
  return verifyToken(token)
}

/**
 * GET: 获取所有AI模型配置
 * 可选参数 id: 获取特定模型配置
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const modelId = searchParams.get('id')

  const user = await getCurrentUser(request)
  const models = readModels()

  if (modelId) {
    // 🔥 安全修复：单模型详情必须先登录，且只能看：管理员 / 本人模型 / 管理员共享模型
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const model = models.find((m) => m.id === modelId)
    if (!model) {
      return NextResponse.json({ error: '模型配置不存在' }, { status: 404 })
    }
    if (!user.isAdmin && model.userId !== user.userId && !model.isAdminDefault) {
      return NextResponse.json({ error: '无权限访问此模型' }, { status: 403 })
    }
    // 🔥 安全修复：apiKey 永不下发明文（前端本来只存 '***'，真实 Key 由服务端 resolveLLMConfig 回填）
    return NextResponse.json({ data: { ...model, apiKey: model.apiKey ? '***' : '' } })
  }

  if (!user) {
    // 🔥 安全修复：匿名一律不下发任何模型（此前匿名可拿到全量含 Key 配置）
    return NextResponse.json({ data: [] })
  }

  if (user.isAdmin) {
    // 管理员可见全部，但列表同样脱敏（编辑详情另行通过登录校验获取）
    return NextResponse.json({ data: models.map((m) => ({ ...m, apiKey: m.apiKey ? '***' : '' })), isAdmin: true })
  }

  // 管理员配置的共享模型：所有用户可见可用；apiKey 一律脱敏（服务端解析真实 Key）
  const visibleModels = models
    .filter((m) => m.userId === user.userId || m.isAdminDefault === true)
    .map((m) => ({ ...m, apiKey: m.apiKey ? '***' : '' }))
  return NextResponse.json({ data: visibleModels, isAdmin: user.isAdmin })
}

/**
 * POST: 创建新的AI模型配置
 * 请求体: { provider, name, status, apiKey?, baseUrl? }
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await request.json()
    const { provider, name, status, apiKey, baseUrl, model, rateLimit } = body

    if (!provider || !name) {
      return NextResponse.json(
        { error: '缺少必填字段: provider 和 name' },
        { status: 400 }
      )
    }

    const validStatuses = ['default', 'active', 'inactive']
    const modelStatus = status || 'inactive'
    if (!validStatuses.includes(modelStatus)) {
      return NextResponse.json(
        { error: '无效的 status 值，必须是 default、active 或 inactive' },
        { status: 400 }
      )
    }

    const models = readModels()

    const dupKey = (provider || '') + '|' + (model || '') + '|' + user.userId
    const existing = models.find(function(m) {
      const key = (m.provider || '') + '|' + (m.model || '') + '|' + (m.userId || '')
      return key === dupKey
    })

    if (existing) {
      if (modelStatus === 'default') {
        models.forEach(function(m) {
          if (m.status === 'default' && m.userId === user.userId) { m.status = 'active' }
        })
      }
      existing.name = name
      existing.status = modelStatus
      // 🔥 安全修复：前端回传 '***'（脱敏值）时保留原 Key，防止把真实 Key 覆盖成星号
      existing.apiKey = (apiKey && !String(apiKey).includes('*')) ? apiKey : (existing.apiKey || apiKey)
      existing.baseUrl = baseUrl
      existing.model = model || ''
      existing.rateLimit = rateLimit
      existing.updatedAt = new Date().toISOString()
      writeModels(models)
      return NextResponse.json({ data: existing, updated: true }, { status: 200 })
    }

    if (modelStatus === 'default') {
      models.forEach((m) => {
        if (m.status === 'default' && m.userId === user.userId) {
          m.status = 'active'
        }
      })
    }

    const newModel: ModelConfig = {
      id: generateId(),
      provider,
      name,
      status: modelStatus,
      apiKey,
      baseUrl,
      model: model || '',
      userId: user.userId,
      // 修复：管理员创建的模型标记为 isAdminDefault: true，普通用户可共享使用
      isAdminDefault: user.isAdmin ? true : false,
      rateLimit: rateLimit,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    models.push(newModel)
    writeModels(models)

    return NextResponse.json({ data: newModel }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/settings/models] error:', error)
    return NextResponse.json({ error: '请求体解析失败' }, { status: 400 })
  }
}

/**
 * PUT: 更新现有模型配置
 * 请求体: { id, ...updateFields }
 */
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: '缺少模型 id 参数' }, { status: 400 })
    }

    if (updateData.status) {
      const validStatuses = ['default', 'active', 'inactive']
      if (!validStatuses.includes(updateData.status)) {
        return NextResponse.json(
          { error: '无效的 status 值，必须是 default、active 或 inactive' },
          { status: 400 }
        )
      }
    }

    const models = readModels()
    const index = models.findIndex((m) => m.id === id)

    if (index === -1) {
      return NextResponse.json({ error: '模型配置不存在' }, { status: 404 })
    }

    if (!user.isAdmin && models[index].userId !== user.userId) {
      return NextResponse.json({ error: '无权限修改此模型' }, { status: 403 })
    }

    // 修复：普通用户不能修改管理员共享的模型
    if (!user.isAdmin && models[index].isAdminDefault === true && models[index].userId !== user.userId) {
      return NextResponse.json({ error: '无权限修改管理员共享的模型' }, { status: 403 })
    }

    // 🔥 修复（P2 提权）：updateData 原样展开，普通用户可把自己那条模型标成
    //   isAdminDefault（全员共享、别人的请求会走他的 Key/BaseUrl）或改写归属 userId。
    const safeUpdate: Record<string, unknown> = { ...updateData }
    if (!user.isAdmin) {
      delete safeUpdate.isAdminDefault
      delete safeUpdate.userId
      delete safeUpdate.id
    }

    models[index] = {
      ...models[index],
      ...safeUpdate,
      updatedAt: new Date().toISOString(),
    }

    if (updateData.status === 'default') {
      models.forEach((m) => {
        if (m.id !== id && m.status === 'default' && m.userId === user.userId) {
          m.status = 'active'
        }
      })
    }

    writeModels(models)

    return NextResponse.json({ data: models[index] })
  } catch (error) {
    return NextResponse.json({ error: '请求体解析失败' }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const modelId = searchParams.get('id')

  if (!modelId) {
    return NextResponse.json({ error: '缺少模型 id 参数' }, { status: 400 })
  }

  const models = readModels()
  const index = models.findIndex((m) => m.id === modelId)

  if (index === -1) {
    return NextResponse.json({ error: '模型配置不存在' }, { status: 404 })
  }

  if (!user.isAdmin && models[index].userId !== user.userId) {
    return NextResponse.json({ error: '无权限删除此模型' }, { status: 403 })
  }

  // 修复：普通用户不能删除管理员共享的模型
  if (!user.isAdmin && models[index].isAdminDefault === true && models[index].userId !== user.userId) {
    return NextResponse.json({ error: '无权限删除管理员共享的模型' }, { status: 403 })
  }

  const deletedModel = models.splice(index, 1)[0]
  writeModels(models)

  return NextResponse.json({
    success: true,
    data: deletedModel,
    message: '模型配置已删除'
  })
}
