import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getRequestActor } from '@/lib/permissions'
import { resolveDataDirB } from '@/lib/data-dir'

// 账号级写作偏好持久化：.tuzhong-data/user-preferences.json
// 解决“偏好只存在 localStorage，换浏览器/清缓存后丢失、生成链路读不到”的问题。
type PrefEntry = { data: Record<string, unknown>; updatedAt: number }
type PrefStore = Record<string, PrefEntry>

function prefsFile(): string {
  return path.join(resolveDataDirB(), 'user-preferences.json')
}

function readStore(): PrefStore {
  try {
    const file = prefsFile()
    if (!fs.existsSync(file)) return {}
    const raw = fs.readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (e) {
    console.error('[user-preferences] 读取失败:', e instanceof Error ? e.message : String(e))
    return {}
  }
}

function writeStore(store: PrefStore): boolean {
  try {
    const file = prefsFile()
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8')
    fs.renameSync(tmp, file)
    return true
  } catch (e) {
    console.error('[user-preferences] 写入失败:', e instanceof Error ? e.message : String(e))
    return false
  }
}

export async function GET(request: Request) {
  const actor = await getRequestActor(request)
  if (!actor.userId) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  const entry = readStore()[actor.userId]
  // 🔥 2026-10-20：敏感字段（朱雀官方 API Key）只回传掩码提示，不把明文下发到浏览器
  let out: Record<string, unknown> | null = entry?.data ? { ...entry.data } : null
  let hasZhuqueApiKey = false
  if (out && typeof out.zhuqueApiKey === 'string' && out.zhuqueApiKey.trim()) {
    const k = out.zhuqueApiKey.trim()
    out.zhuqueApiKey = '****' + k.slice(-4)
    hasZhuqueApiKey = true
  }
  return NextResponse.json(
    { data: out, updatedAt: entry?.updatedAt || 0, hasZhuqueApiKey },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function PUT(request: Request) {
  const actor = await getRequestActor(request)
  if (!actor.userId) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }
  let body: unknown = null
  try { body = await request.json() } catch { body = null }
  const data = (body && typeof body === 'object') ? (body as Record<string, unknown>).data : null
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return NextResponse.json({ error: '偏好数据格式不正确' }, { status: 400 })
  }
  let serialized = ''
  try { serialized = JSON.stringify(data) } catch { serialized = '' }
  if (!serialized || serialized.length > 300000) {
    return NextResponse.json({ error: '偏好数据过大' }, { status: 413 })
  }
  const store = readStore()
  const updatedAt = Date.now()
  // 🔥 合并写入：部分客户端（如写作页改风格）只带部分字段，直接覆盖会把“平台AI检测标准”等
  //   已保存的偏好抹掉，导致重新打开又回到默认 30%。这里按 key 合并，缺失字段保留原值。
  const existing = store[actor.userId]?.data
  const merged: Record<string, unknown> = Object.assign({}, existing || {})
  Object.keys(data as Record<string, unknown>).forEach(function (k) {
    const v = (data as Record<string, unknown>)[k]
    if (v === undefined || v === null) return
    merged[k] = v
  })
  store[actor.userId] = { data: merged, updatedAt }
  if (!writeStore(store)) {
    return NextResponse.json({ error: '偏好保存失败，请稍后重试' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, updatedAt }, { headers: { 'Cache-Control': 'no-store' } })
}
