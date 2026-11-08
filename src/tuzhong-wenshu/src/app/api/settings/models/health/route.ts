import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { verifyToken } from '@/lib/auth'

// 🔥 #212（2026-09-10）模型实时健康检测端点（管理员专用）
//   并发探活 models.json 全部唯一模型（provider+model 去重，同模型不同 key 只探第一个），
//   分类：ok 可用 / dead 已下架(404) / keybad Key失效(401/403) / limited 限流(429) / server 5xx / neterr 超时 / image 图像模型跳过。
//   60s 内存缓存，防止反复点击打爆上游。单模型 15s 超时。
// 🔥 #212b（2026-09-10）推荐替代模型：检测到 dead/limited 时，自动探活各平台「未配置的免费候选」并给出替代清单——
//   OpenRouter 动态拉公开免费模型榜（pricing=0）实时探活；其他平台走静态候选目录（死候选 404 自动淘汰，只推荐探活 ok 的）。

const dataDir = path.join(process.cwd(), '.tuzhong-data')
const modelsFile = path.join(dataDir, 'models.json')

const CACHE_MS = 60 * 1000
let _cache: { at: number, data: unknown } | null = null

// 🔥 #212b 静态候选目录：各平台「未配置的免费备选」。死候选（404）自动淘汰，只推荐探活 ok 的；平台 Key 失效时如实标注。
const _FALLBACK_CATALOG: Record<string, Array<{ model: string, name: string }>> = {
  '硅基流动': [
    { model: 'THUDM/glm-4-9b-chat', name: 'GLM-4-9B-Chat（免费备选）' },
    { model: 'Qwen/Qwen2.5-Coder-7B-Instruct', name: 'Qwen2.5-Coder-7B（免费备选）' },
    { model: 'internlm/internlm2_5-7b-chat', name: 'InternLM2.5-7B-Chat（免费备选）' },
  ],
  '智谱GLM': [
    { model: 'glm-4-flashx', name: 'GLM-4-FlashX（免费备选）' },
  ],
}

// OpenRouter 公开模型榜（无需鉴权）：取 pricing 全 0 的免费模型 id
async function fetchOpenRouterFreeModels(): Promise<Array<{ id: string, name: string, context: number }>> {
  const ctl = new AbortController()
  const timer = setTimeout(function () { ctl.abort() }, 12000)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: ctl.signal })
    const j = await res.json()
    const list = (j && j.data) || []
    const out: Array<{ id: string, name: string, context: number }> = []
    for (let i = 0; i < list.length; i++) {
      const m = list[i]
      const p = m.pricing || {}
      const free = String(p.prompt) === '0' && String(p.completion) === '0'
      if (free && m.id) out.push({ id: String(m.id), name: String(m.name || m.id), context: Number(m.context_length || 0) })
    }
    // 大上下文优先（免费榜里 128K+ 通常更实用），稳定排序
    out.sort(function (a, b) { return b.context - a.context })
    return out
  } finally {
    clearTimeout(timer)
  }
}

// 🔥 #212b 推荐替代：对出现 dead/limited 的平台，探活其未配置的免费候选
async function buildRecommendations(results: Array<{ provider: string, cls: string }>, models: Array<Record<string, unknown>>) {
  const configured = new Set<string>()
  const providerMeta: Record<string, { baseUrl: string, apiKey: string }> = {}
  for (let i = 0; i < models.length; i++) {
    const m = models[i]
    if (!m || !m.model) continue
    const prov = String(m.provider || '')
    configured.add(prov + '::' + String(m.model))
    if (!providerMeta[prov] && m.apiKey) providerMeta[prov] = { baseUrl: String(m.baseUrl || ''), apiKey: String(m.apiKey) }
  }
  // 出现 dead/limited 的平台才需要推荐
  const needProv = new Set<string>()
  for (let j = 0; j < results.length; j++) {
    if (results[j].cls === 'dead' || results[j].cls === 'limited' || results[j].cls === 'keybad') needProv.add(results[j].provider)
  }
  const recs: Array<{ provider: string, model: string, name: string, cls: string, latencyMs: number, reason: string }> = []

  async function probeAndPush(prov: string, cand: Array<{ model: string, name: string }>) {
    const meta = providerMeta[prov]
    if (!meta || !meta.apiKey) return
    const todo = cand.filter(function (c) { return !configured.has(prov + '::' + c.model) }).slice(0, 8)
    const probed = await Promise.all(todo.map(async function (c) {
      let cls = 'neterr', reason = '超时/网络不可达(15s)', latencyMs = 15000
      try {
        const r = await probeOne(meta.baseUrl, meta.apiKey, c.model)
        const cc = classify(r.code); cls = cc.cls; reason = cc.reason; latencyMs = r.latencyMs
      } catch (_e) { console.error('[models/health] 模型探活请求异常:', _e) }
      return { provider: prov, model: c.model, name: c.name, cls: cls, latencyMs: latencyMs, reason: reason }
    }))
    for (let k = 0; k < probed.length; k++) {
      const it = probed[k]
      if (it.cls === 'ok' || it.cls === 'limited') recs.push(it)
    }
    // 全部候选都 401 才提示换 Key（个别候选 401 只是该模型需账号验证，不影响平台其他模型）
    const allKeybad = probed.length > 0 && probed.every(function (p) { return p.cls === 'keybad' })
    if (allKeybad) {
      recs.push({ provider: prov, model: todo[0].model, name: todo[0].name, cls: 'keybad', latencyMs: probed[0].latencyMs, reason: '平台 API Key 失效——更换 Key 后这些候选即可启用' })
    }
  }

  const jobs: Promise<void>[] = []
  for (const prov of Array.from(needProv)) {
    // OpenRouter：动态拉公开免费榜（本地配置 key 可用，实测 404/429 而非 401）
    if (prov === 'OpenRouter' && providerMeta['OpenRouter'] && providerMeta['OpenRouter'].apiKey) {
      jobs.push((async function () {
        try {
          const free = await fetchOpenRouterFreeModels()
          const cand = free.slice(0, 12).map(function (f) { return { model: f.id, name: f.name + '（免费·' + (f.context >= 1000000 ? Math.round(f.context / 100000) / 10 + 'M' : Math.round(f.context / 1000) + 'K') + '）' } })
          await probeAndPush('OpenRouter', cand)
        } catch (_e) { console.error('[settings/models/health] OpenRouter 公开榜拉取失败，跳过动态推荐:', _e) }
      })())
    }
    const cat = _FALLBACK_CATALOG[prov]
    if (cat && cat.length) jobs.push(probeAndPush(prov, cat))
  }
  await Promise.all(jobs)
  return recs.slice(0, 8)
}

function readModels(): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(fs.readFileSync(modelsFile, 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch (_e) {
    return []
  }
}

function classify(status: number): { cls: string, reason: string } {
  if (status === 200) return { cls: 'ok', reason: '可用' }
  if (status === 404) return { cls: 'dead', reason: '已下架(404)' }
  if (status === 401 || status === 403) return { cls: 'keybad', reason: 'API Key 失效(' + status + ')' }
  if (status === 429) return { cls: 'limited', reason: '限流(429 间歇/日限)' }
  if (status >= 500) return { cls: 'server', reason: '上游服务错误(' + status + ')' }
  return { cls: 'other', reason: 'HTTP ' + status }
}

async function probeOne(baseUrl: string, apiKey: string, model: string): Promise<{ code: number, latencyMs: number }> {
  const t0 = Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(function () { ctl.abort() }, 15000)
  try {
    const url = String(baseUrl || '').replace(/\/+$/, '') + '/chat/completions'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 4, temperature: 0 }),
      signal: ctl.signal,
    })
    // 消费 body 防止连接泄漏（不解析，探活只看状态码）
    try { await res.text() } catch (_e2) { console.error('[models/health] 消费响应 body 失败:', _e2) }
    return { code: res.status, latencyMs: Date.now() - t0 }
  } finally {
    clearTimeout(timer)
  }
}

async function runHealthCheck() {
  const models = readModels()
  // provider+model 去重（Kolors 等图像模型跳过文本探活）
  const unique: Record<string, { provider: string, model: string, baseUrl: string, apiKey: string }> = {}
  for (let i = 0; i < models.length; i++) {
    const m = models[i] as Record<string, unknown>
    if (!m || !m.model) continue
    const key = String(m.provider || '') + '::' + String(m.model)
    if (unique[key]) continue
    unique[key] = {
      provider: String(m.provider || ''),
      model: String(m.model),
      baseUrl: String(m.baseUrl || ''),
      apiKey: String(m.apiKey || ''),
    }
  }
  const keys = Object.keys(unique)
  const results = await Promise.all(keys.map(async function (k) {
    const u = unique[k]
    let code = 0, latencyMs = 0, cls = 'neterr', reason = '超时/网络不可达(15s)'
    if (/Kolors|image|flux|sd3|stable-diffusion/i.test(u.model)) {
      cls = 'image'; reason = '图像模型（跳过文本探活）'
    } else {
      try {
        const r = await probeOne(u.baseUrl, u.apiKey, u.model)
        code = r.code; latencyMs = r.latencyMs
        const c = classify(r.code); cls = c.cls; reason = c.reason
      } catch (e) {
        latencyMs = 15000
        reason = '超时/网络不可达(15s)'
      }
    }
    return { key: k, provider: u.provider, model: u.model, ok: cls === 'ok' || cls === 'image', code: code, latencyMs: latencyMs, cls: cls, reason: reason }
  }))
  const summary = { total: results.length, ok: 0, dead: 0, keybad: 0, limited: 0, other: 0 }
  for (let j = 0; j < results.length; j++) {
    const c = results[j].cls
    if (c === 'ok' || c === 'image') summary.ok++
    else if (c === 'dead') summary.dead++
    else if (c === 'keybad') summary.keybad++
    else if (c === 'limited') summary.limited++
    else summary.other++
  }
  let recommendations: Array<{ provider: string, model: string, name: string, cls: string, latencyMs: number, reason: string }> = []
  try { recommendations = await buildRecommendations(results, models) } catch (_e) { console.error('[models/health] 生成模型推荐失败:', _e) }
  return { checkedAt: new Date().toISOString(), summary: summary, results: results, recommendations: recommendations }
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const user = token ? await verifyToken(token) : null
  if (!user || !user.isAdmin) {
    return NextResponse.json({ success: false, error: '需要管理员权限' }, { status: 403 })
  }
  if (_cache && Date.now() - _cache.at < CACHE_MS) {
    return NextResponse.json({ success: true, data: _cache.data, cached: true })
  }
  try {
    const data = await runHealthCheck()
    _cache = { at: Date.now(), data: data }
    return NextResponse.json({ success: true, data: data })
  } catch (e) {
    return NextResponse.json({ success: false, error: '健康检测失败: ' + (e instanceof Error ? e.message : String(e)) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return POST(request)
}
