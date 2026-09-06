import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getRequestActor } from '@/lib/permissions'

// 风格数据结构类型定义
interface Style {
  id: string
  name: string
  description: string
  createdAt: string
  usageCount: number
  parameters?: object
  userId?: string // 修复 v4 M7：增加用户归属，支持数据隔离
}

// 数据存储路径: .tuzhong-data/styles.json
const dataDir = path.join(process.cwd(), '.tuzhong-data')

// 惰性初始化数据目录（修复 v4 Q5：避免模块加载时执行文件系统操作）
function ensureDataFolder() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

const stylesFile = path.join(dataDir, 'styles.json')

// 读取风格数据
function readStyles(): Style[] {
  if (!fs.existsSync(stylesFile)) {
    return []
  }
  try {
    const data = fs.readFileSync(stylesFile, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

// 写入风格数据
function writeStyles(data: Style[]) {
  ensureDataFolder()
  fs.writeFileSync(stylesFile, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * GET: 返回用户保存的风格列表（修复 v4 M7：增加认证 + 按用户隔离）
 */
export async function GET(request: Request) {
  try {
    const actor = await getRequestActor(request)
    if (!actor.userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }
    const styles = readStyles()
    // 管理员可查看全部；普通用户仅查看自己的（兼容无 userId 字段的旧数据视为公共）
    const visible = actor.isAdmin
      ? styles
      : styles.filter(s => !s.userId || s.userId === actor.userId)
    return NextResponse.json({ data: visible })
  } catch (error) {
    console.error('[styles GET] 读取失败:', error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: '读取风格列表失败' },
      { status: 500 }
    )
  }
}

/**
 * POST: 保存新风格（修复 v4 M7：增加认证 + 用户归属）
 * 请求体: { name: string, description: string, parameters?: object }
 */
export async function POST(request: Request) {
  try {
    const actor = await getRequestActor(request)
    if (!actor.userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, parameters } = body

    // 验证必填字段
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: '风格名称不能为空' },
        { status: 400 }
      )
    }

    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { error: '风格描述不能为空' },
        { status: 400 }
      )
    }

    const styles = readStyles()

    // 检查是否已存在同名风格（仅当前用户范围内）
    const existingStyle = styles.find(
      (s) => s.name.toLowerCase() === name.toLowerCase() && (!s.userId || s.userId === actor.userId)
    )
    if (existingStyle) {
      return NextResponse.json(
        { error: '已存在同名风格' },
        { status: 409 }
      )
    }

    // 创建新风格
    const newStyle: Style = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      createdAt: new Date().toISOString(),
      usageCount: 0,
      userId: actor.userId,
      ...(parameters && { parameters }),
    }

    styles.push(newStyle)
    writeStyles(styles)

    return NextResponse.json({ data: newStyle }, { status: 201 })
  } catch (error) {
    console.error('[styles POST] 保存失败:', error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: '保存风格失败' },
      { status: 500 }
    )
  }
}

/**
 * PUT: 更新风格（修复 v4 M7：增加认证 + 归属校验）
 * 请求体: { id: string, name?: string, description?: string, parameters?: object }
 */
export async function PUT(request: Request) {
  try {
    const actor = await getRequestActor(request)
    if (!actor.userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json(
        { error: '缺少风格ID' },
        { status: 400 }
      )
    }

    const styles = readStyles()
    const index = styles.findIndex((s) => s.id === id)

    if (index === -1) {
      return NextResponse.json(
        { error: '风格不存在' },
        { status: 404 }
      )
    }

    // 归属校验：仅所有者或管理员可修改
    if (!actor.isAdmin && styles[index].userId && styles[index].userId !== actor.userId) {
      return NextResponse.json({ error: '无权修改此风格' }, { status: 403 })
    }

    // 更新风格数据
    styles[index] = {
      ...styles[index],
      ...updateData,
      // 不允许修改 id 和 createdAt
      id: styles[index].id,
      createdAt: styles[index].createdAt,
    }

    writeStyles(styles)

    return NextResponse.json({ data: styles[index] })
  } catch (error) {
    console.error('[styles PUT] 更新失败:', error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: '更新风格失败' },
      { status: 500 }
    )
  }
}

/**
 * DELETE: 删除风格（修复 v4 M7：增加认证 + 归属校验）
 * 查询参数: ?id=xxx
 */
export async function DELETE(request: Request) {
  try {
    const actor = await getRequestActor(request)
    if (!actor.userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: '缺少风格ID' },
        { status: 400 }
      )
    }

    const styles = readStyles()
    const targetIndex = styles.findIndex((s) => s.id === id)

    if (targetIndex === -1) {
      return NextResponse.json(
        { error: '风格不存在' },
        { status: 404 }
      )
    }

    // 归属校验：仅所有者或管理员可删除
    if (!actor.isAdmin && styles[targetIndex].userId && styles[targetIndex].userId !== actor.userId) {
      return NextResponse.json({ error: '无权删除此风格' }, { status: 403 })
    }

    const filtered = styles.filter((s) => s.id !== id)
    writeStyles(filtered)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[styles DELETE] 删除失败:', error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: '删除风格失败' },
      { status: 500 }
    )
  }
}
