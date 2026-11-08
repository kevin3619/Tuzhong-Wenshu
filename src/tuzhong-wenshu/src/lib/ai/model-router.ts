/**
 * 统一模型路由（Model Router）
 * ============================================================
 * 解决两个核心问题：
 *
 * ① 【用户级】所有用户默认使用管理员（kevin）配置的系统默认模型；
 *    注册用户若自己配置了平台+大模型，则【全部内容生成】都切到他的平台与大模型。
 *    判定依据：models.json 中 userId === 用户 且 isAdminDefault !== true 的模型
 *    （用户在设置页「设为默认」即写入 status='default'）。
 *
 * ② 【角色级 + 质量/速度】不再"随机轮转主模型"（会导致同一卷文风忽变），
 *    改为【按角色固定主模型 + 熔断时才换人】：
 *      prose    正文/场景写作 → 首选正文模型（Qwen2.5-7B 等）
 *      structure 分镜/节拍/大纲 → 大纲权谋模型（GLM-4-9B / GLM-Z1-9B）
 *      judge    审核/评分/摘要 → 推理规划模型
 *    主模型命中 429/500 时，由 llm.ts 的兜底池按角色顺序换人（保证速度与可用性）。
 *    角色判定依据管理员给模型的命名（"首选正文/大纲权谋/推理规划/极速轻量…"）。
 *
 * 越权防护：兜底链只包含【管理员共享模型 + 请求用户自己的模型】，
 *    他人私有模型一律不下发（此前 setExtraFallbackPool 会把全量 models.json 注入兜底池）。
 */

import fs from 'fs'
import path from 'path'

export type RouteKind = 'prose' | 'structure' | 'judge' | 'polish' | 'fast'

export interface StoredModel {
  id: string
  provider: string
  name: string
  status: string
  apiKey?: string
  baseUrl?: string
  model?: string
  userId?: string
  isAdminDefault?: boolean
  isPaid?: boolean
  updatedAt?: string
  createdAt?: string
}

export interface RouteConfig {
  provider: string
  model: string
  apiKey: string
  baseUrl: string
  name?: string
  id?: string
  userOwn?: boolean
}

export interface RouteResult {
  /** 主模型（固定） */
  primary: RouteConfig | null
  /** 按角色排好序的兜底链（不含 primary） */
  chain: RouteConfig[]
  /** 主模型来源：explicit=用户显式指定 / user-own=用户自有 / admin=管理员系统默认 */
  source: 'explicit' | 'user-own' | 'admin' | 'none'
  kind: RouteKind
  reason: string
}

const dataDir = path.join(process.cwd(), '.tuzhong-data')
const modelsFile = path.join(dataDir, 'models.json')
const overrideFile = path.join(dataDir, 'route-override.json')

let cache: { at: number; models: StoredModel[] } | null = null

function readOverride(): Partial<Record<RouteKind, string>> {
  try {
    if (!fs.existsSync(overrideFile)) return {}
    const raw = JSON.parse(fs.readFileSync(overrideFile, 'utf8'))
    return (raw && typeof raw === 'object') ? raw : {}
  } catch (_e) {
    return {}
  }
}

export function loadModels(): StoredModel[] {
  const now = Date.now()
  if (cache && now - cache.at < 15000) return cache.models
  let out: StoredModel[] = []
  try {
    if (fs.existsSync(modelsFile)) {
      const parsed = JSON.parse(fs.readFileSync(modelsFile, 'utf8'))
      const arr = Array.isArray(parsed) ? parsed : (parsed && parsed.models) || []
      out = arr.filter((m: any) => m && typeof m === 'object')
    }
  } catch (_e) {
    out = []
  }
  cache = { at: now, models: out }
  return out
}

function hasRealKey(m: StoredModel): boolean {
  const k = String(m.apiKey || '').replace(/[`'"]/g, '').trim()
  return !!k && k.indexOf('*') < 0
}

function normProvider(p: string): string {
  return String(p || '').trim().replace(/\s*\([^)]*\)\s*/g, '')
}

/** 可用性：免费（isPaid !== true）、有真 key、未被停用 */
export function isUsable(m: StoredModel): boolean {
  if (!m) return false
  if (m.isPaid === true) return false
  if (String(m.status || '') === 'inactive') return false
  if (!hasRealKey(m)) return false
  if (!String(m.model || '').trim()) return false
  return true
}

export function toConfig(m: StoredModel, userOwn?: boolean): RouteConfig {
  return {
    provider: normProvider(m.provider) || '硅基流动',
    model: String(m.model || '').trim(),
    apiKey: String(m.apiKey || '').replace(/[`'"]/g, '').trim(),
    baseUrl: String(m.baseUrl || '').replace(/[`'"]/g, '').trim(),
    name: m.name,
    id: m.id,
    userOwn: !!userOwn,
  }
}

/** 管理员共享模型（所有用户可用） */
export function adminSharedModels(): StoredModel[] {
  return loadModels().filter((m) => m && m.isAdminDefault === true && isUsable(m))
}

/** 用户自己的模型（私有；优先级高于系统默认） */
export function userOwnModels(userId?: string | null): StoredModel[] {
  if (!userId) return []
  return loadModels().filter(
    (m) => m && String(m.userId || '') === String(userId) && m.isAdminDefault !== true && isUsable(m)
  )
}

/** 用户自有模型中的"默认模型"：status==='default' 优先，否则取最近更新的一条 */
export function pickUserOwnModel(userId?: string | null): StoredModel | null {
  const list = userOwnModels(userId)
  if (!list.length) return null
  const def = list.find((m) => String(m.status || '') === 'default')
  if (def) return def
  return list.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]
}

// ============================================================
// 免费优先白名单 + 探活记录（T2 反修复 · G-20）
// ------------------------------------------------------------
// 目标：高质量免费模型优先，glm-4-flash 兜底；探活失败者排到队尾而不是静默降级到付费模型。
// 顺序依据：① 任务给定的高质量优先序（dots-3-note / nemotron-ultra-550b / 商汤 sensenova）；
//          ② 2026-10-25 实测探活结果（见 .tuzhong-data/models.json 的 lastProbe 字段与
//             docs/v1-platinum/flow-fix-report.md 第 5 节）。
// ============================================================

/** 兜底模型（稳定但套话多；只作最后兜底，不作主 prose 模型） */
export const FALLBACK_MODEL = 'glm-4-flash'

/** 各角色的免费模型优先序（模型名子串匹配 model 字段；命中即按序加权） */
export const FREE_FIRST: Record<RouteKind, string[]> = {
  prose: [
    'dots-studio/dots-3-note-preview:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'sensenova-6.8-flash-lite',
    'glm-4-flash',
  ],
  structure: [
    'glm-4-flash',
    'sensenova-6.8-flash-lite',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'dots-studio/dots-3-note-preview:free',
  ],
  judge: [
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'dots-studio/dots-3-note-preview:free',
    'glm-z1-flash',
    'glm-4-flash',
  ],
  polish: [
    'sensenova-6.8-flash-lite',
    'glm-4-flash',
    'dots-studio/dots-3-note-preview:free',
  ],
  fast: [
    'glm-4-flash',
    'glm-4.7-flash',
    'sensenova-6.8-flash-lite',
  ],
}

export interface ModelProbe {
  at: number
  ok: boolean
  status: string
  latencyMs?: number
  /** 短请求可用但长章节请求空返回/挂起（实测约束） */
  longFormOk?: boolean
  note?: string
}

/** 探活否决窗口：6 小时内探活失败 → 排到队尾（不删，探活恢复后自动复活） */
const PROBE_VETO_MS = 6 * 60 * 60 * 1000

/** 读取模型的探活记录（写入口只有 probeModels / 探活脚本） */
export function readProbe(m: StoredModel): ModelProbe | null {
  const p = (m as any).lastProbe
  if (!p || typeof p !== 'object') return null
  if (typeof p.at !== 'number' || typeof p.ok !== 'boolean') return null
  return p as ModelProbe
}

function freeFirstRank(m: StoredModel, kind: RouteKind): number {
  const list = FREE_FIRST[kind] || FREE_FIRST.prose
  const model = String(m.model || '')
  for (let i = 0; i < list.length; i++) {
    if (model === list[i] || model.indexOf(list[i]) >= 0) return i
  }
  return list.length + 2
}

/**
 * 探活惩罚：0 = 健康；数值越大越靠后。
 *   - 6 小时内探活失败 → +40
 *   - 探活成功但明确不能长文（longFormOk === false）而本轮是 prose/judge → +20
 *   - provider 冷却中 → +25
 */
function probePenalty(m: StoredModel, kind: RouteKind): number {
  let p = 0
  const pr = readProbe(m)
  if (pr && !pr.ok && Date.now() - pr.at < PROBE_VETO_MS) p += 40
  if (pr && pr.ok && pr.longFormOk === false && (kind === 'prose' || kind === 'judge')) p += 20
  if (providerCoolingDown(providerOf(m))) p += 25
  return p
}

function providerOf(m: StoredModel): string {
  return normProvider(String(m.provider || ''))
}

/** 持久化一次探活结果（原子写；失败不抛错） */
export function recordProbe(modelId: string, probe: ModelProbe): boolean {
  try {
    if (!fs.existsSync(modelsFile)) return false
    const parsed = JSON.parse(fs.readFileSync(modelsFile, 'utf8'))
    const arr: any[] = Array.isArray(parsed) ? parsed : (parsed && parsed.models) || []
    const t = arr.find((m) => m && String(m.id) === String(modelId))
    if (!t) return false
    t.lastProbe = probe
    const tmp = modelsFile + '.tmp_probe'
    fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2), 'utf8')
    fs.renameSync(tmp, modelsFile)
    cache = null
    return true
  } catch (_e) {
    return false
  }
}

/** 当前免费优先路由快照（供 UI/诊断/复测展示） */
export function freeFirstSnapshot(): Record<string, Array<{ model: string; ok: boolean | null; longFormOk: boolean | null; at: number | null }>> {
  const pool = adminSharedModels()
  const kinds: RouteKind[] = ['prose', 'structure', 'judge', 'polish', 'fast']
  const out: Record<string, any> = {}
  for (const k of kinds) {
    const list = FREE_FIRST[k] || []
    out[k] = list.map((want) => {
      const hit = pool.find((m) => String(m.model || '') === want || String(m.model || '').indexOf(want) >= 0)
      const pr = hit ? readProbe(hit) : null
      return {
        model: want,
        present: !!hit,
        ok: pr ? pr.ok : null,
        longFormOk: pr && pr.longFormOk !== undefined ? pr.longFormOk : null,
        at: pr ? pr.at : null,
        status: pr ? pr.status : (hit ? '未探活' : '不在池内'),
      }
    })
  }
  return out
}

// ============================================================
// 角色判定
// ============================================================

export function kindFromStep(step?: string): RouteKind {
  const s = String(step || '')
  if (/keyPlots|outline|worldbuilding|characters|powerSystem|factions|relationships|synopsis|idea|chapters|beats|blueprint/i.test(s)) return 'structure'
  if (/compliance|originality|contractScore|audit|review|score|detect/i.test(s)) return 'judge'
  if (/polish|imitate|continue|rewrite|repair/i.test(s)) return 'polish'
  if (/cover/i.test(s)) return 'fast'
  if (/content/i.test(s)) return 'prose'
  return 'prose'
}

export function kindFromLabel(label?: string): RouteKind {
  const l = String(label || '')
  if (/节拍|分镜|大纲|设定|结构|规划|蓝图/.test(l)) return 'structure'
  if (/审核|评估|评分|判定|查重|摘要|总结|合规|原创/.test(l)) return 'judge'
  if (/润色|续写|改写|修复|模仿/.test(l)) return 'polish'
  return 'prose'
}

/**
 * 角色亲和度打分（0 = 最贴合）。
 * 依据管理员给模型的命名（"首选正文 / 备用正文 / 超高速正文 / 大纲权谋 / 权谋战争 /
 * 推理规划 / 极速轻量 / 翻译润色"）——这是管理员自己标注的角色意图。
 */
function roleScore(m: StoredModel, kind: RouteKind): number {
  const name = String(m.name || '')
  const model = String(m.model || '')
  const has = (kw: string[]) => kw.some((k) => name.indexOf(k) >= 0)
  const mHas = (re: RegExp) => re.test(model)

  if (kind === 'prose') {
    if (has(['首选正文'])) return 0
    if (has(['超高速正文', '高速正文'])) return 1
    if (has(['备用正文'])) return 2
    if (has(['正文'])) return 3
    if (mHas(/qwen2\.5-7b/i)) return 0
    if (mHas(/qwen/i)) return 3
    if (mHas(/deepseek.*(flash|v4)/i)) return 2
    if (mHas(/doubao|sensenova/i)) return 3
    if (has(['极速轻量', '轻量'])) return 4
    return 5
  }
  if (kind === 'structure') {
    if (has(['大纲权谋'])) return 0
    if (has(['权谋战争'])) return 1
    if (has(['推理规划'])) return 1
    if (has(['大纲'])) return 1
    if (mHas(/glm-4-9b/i)) return 0
    if (mHas(/glm-z1/i)) return 1
    if (mHas(/reasoner|glm-5/i)) return 2
    if (mHas(/gemma-4-31b/i)) return 2
    return 4
  }
  if (kind === 'judge') {
    if (has(['推理规划'])) return 0
    if (has(['大纲权谋'])) return 1
    if (has(['综合全能'])) return 2
    if (mHas(/glm-4-9b|glm-z1/i)) return 1
    if (mHas(/sensenova/i)) return 2
    return 3
  }
  if (kind === 'polish') {
    if (has(['翻译润色', '润色'])) return 0
    if (mHas(/hunyuan/i)) return 0
    if (has(['首选正文'])) return 2
    if (mHas(/sensenova/i)) return 1
    return 3
  }
  // fast
  if (has(['极速轻量', '轻量', '极速'])) return 0
  if (has(['封面'])) return 1
  return 3
}

/**
 * 按角色给候选模型排序（T2 升级：免费优先白名单 → 角色亲和 → 探活惩罚 → 默认标记 → 名称）
 *   排序键优先级：探活惩罚（硬否决排后）→ 免费优先序 → roleScore → default 标记 → 名称
 */
export function sortByRole(list: StoredModel[], kind: RouteKind): StoredModel[] {
  return list.slice().sort((a, b) => {
    const pa = probePenalty(a, kind)
    const pb = probePenalty(b, kind)
    if (pa !== pb) return pa - pb
    const fa = freeFirstRank(a, kind)
    const fb = freeFirstRank(b, kind)
    if (fa !== fb) return fa - fb
    const d = roleScore(a, kind) - roleScore(b, kind)
    if (d !== 0) return d
    // 同档：优先有默认标记的、再按名称稳定排序
    const da = a.status === 'default' ? 0 : 1
    const db = b.status === 'default' ? 0 : 1
    if (da !== db) return da - db
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

/**
 * 按 override / 命名意图 选出某角色的主模型。
 * 🔥 2026-10-25 T2：override 也要接受探活否决——否则被 429/空返回的模型会被显式 pin 成主模型，
 *   每次生成都先撞一次确定性失败（实测：route-override.json 把 prose/structure pin 到
 *   dots-3-note-preview:free，而该模型当日 429）。override 命中但被否决时只写警告并退回角色排序。
 */
export function pickRolePrimary(kind: RouteKind, pool: StoredModel[]): StoredModel | null {
  if (!pool.length) return null
  const ov = readOverride()[kind]
  if (ov) {
    const candidates = [
      pool.find((m) => m.id === ov),
      pool.find((m) => String(m.model || '') === ov),
      pool.find((m) => String(m.name || '') === ov),
    ].filter(Boolean) as StoredModel[]
    for (const hit of candidates) {
      const pr = readProbe(hit)
      const vetoed = !!pr && !pr.ok && Date.now() - pr.at < PROBE_VETO_MS
      if (vetoed) {
        // eslint-disable-next-line no-console
        console.warn('[model-router] override 模型被探活否决，退回角色排序：' + String(hit.model) +
          '（' + pr!.status + '，' + Math.round((Date.now() - pr!.at) / 60000) + ' 分钟前探活）')
        continue
      }
      return hit
    }
  }
  const sorted = sortByRole(pool, kind)
  return sorted[0] || null
}

// ============================================================
// 熔断：provider 级冷却（与 llm.ts 的模型健康表互补）
// ============================================================

const providerCooldown: Record<string, number> = {}

export function noteProviderFailure(provider: string, hard?: boolean): void {
  const p = normProvider(provider)
  if (!p) return
  const until = Date.now() + (hard ? 10 * 60 * 1000 : 3 * 60 * 1000)
  providerCooldown[p] = Math.max(providerCooldown[p] || 0, until)
}

export function noteProviderSuccess(provider: string): void {
  const p = normProvider(provider)
  if (p && providerCooldown[p]) providerCooldown[p] = 0
}

export function providerCoolingDown(provider: string): boolean {
  const p = normProvider(provider)
  return (providerCooldown[p] || 0) > Date.now()
}

// ============================================================
// 对外主接口
// ============================================================

export interface ResolveOptions {
  /** 发起请求的用户（未登录为 null） */
  userId?: string | null
  /** 业务环节（content / outline / keyPlots …） */
  step?: string
  /** 调用标签（引擎内部用：节拍表 / 场景写作 …） */
  label?: string
  /** 前端显式指定的模型（手动模式） */
  explicit?: {
    provider?: string
    model?: string
    apiKey?: string
    baseUrl?: string
    modelId?: string
  } | null
  /** 兜底主模型（路由层已选好的，如 effectiveLlmConfig） */
  fallbackPrimary?: { provider?: string; model?: string; apiKey?: string; baseUrl?: string } | null
}

/**
 * 解析一次调用的主模型 + 兜底链。
 *
 * 优先级：
 *   1. explicit（用户手动指定，须是「本人模型」或「管理员共享模型」）
 *   2. 用户自有默认模型（注册用户配置了自己的平台+模型 → 全部内容都用它）
 *   3. 管理员系统默认模型（按角色固定）
 */
export function resolveRoute(opts: ResolveOptions): RouteResult {
  const kind = opts.label ? kindFromLabel(opts.label) : kindFromStep(opts.step)
  const adminPool = adminSharedModels()
  const ownPool = userOwnModels(opts.userId)
  const ownPrimary = pickUserOwnModel(opts.userId)

  // ① 显式指定
  if (opts.explicit && (opts.explicit.modelId || opts.explicit.model)) {
    const ex = opts.explicit
    let match: StoredModel | undefined
    if (ex.modelId) match = loadModels().find((m) => m.id === ex.modelId)
    if (!match && ex.model) {
      const mp = normProvider(ex.provider || '')
      match = loadModels().find(
        (m) =>
          String(m.model || '') === String(ex.model) &&
          (!mp || normProvider(m.provider || '') === mp)
      )
    }
    if (match && isUsable(match) && (match.isAdminDefault === true || String(match.userId || '') === String(opts.userId || ''))) {
      return {
        primary: toConfig(match, match.isAdminDefault !== true),
        chain: buildChain(adminPool, ownPool, kind, match),
        source: 'explicit',
        kind,
        reason: '用户显式指定模型 ' + String(match.model),
      }
    }
    // 前端直接带了真实 key（未落 models.json 的 BYO Key）→ 直接用
    const rawKey = String(ex.apiKey || '').replace(/[`'"]/g, '').trim()
    if (rawKey && rawKey.indexOf('*') < 0 && ex.model) {
      const cfg: RouteConfig = {
        provider: normProvider(ex.provider || '') || '硅基流动',
        model: String(ex.model).trim(),
        apiKey: rawKey,
        baseUrl: String(ex.baseUrl || '').replace(/[`'"]/g, '').trim(),
        name: '用户自带 Key',
        userOwn: true,
      }
      return { primary: cfg, chain: buildChain(adminPool, ownPool, kind), source: 'explicit', kind, reason: '用户自带 API Key' }
    }
  }

  // ② 用户自有模型 → 全部内容都用用户自己的平台+模型
  if (ownPrimary) {
    const cfg = toConfig(ownPrimary, true)
    const chain: RouteConfig[] = []
    for (const m of ownPool) {
      if (m.id === ownPrimary.id) continue
      chain.push(toConfig(m, true))
    }
    // 应急兜底：管理员共享模型（用户模型完全不可用时不至于停摆）
    for (const m of sortByRole(adminPool, kind)) chain.push(toConfig(m))
    return {
      primary: cfg,
      chain,
      source: 'user-own',
      kind,
      reason: '用户自有模型 ' + String(ownPrimary.model) + '（平台 ' + ownPrimary.provider + '）',
    }
  }

  // ③ 管理员系统默认：按角色固定主模型
  const rolePrimary = pickRolePrimary(kind, adminPool)
  const fp = opts.fallbackPrimary
  const primary =
    rolePrimary
      ? toConfig(rolePrimary)
      : fp && fp.model && String(fp.apiKey || '').indexOf('*') < 0
        ? { provider: normProvider(fp.provider || ''), model: String(fp.model), apiKey: String(fp.apiKey), baseUrl: String(fp.baseUrl || '') }
        : null
  return {
    primary,
    chain: buildChain(adminPool, ownPool, kind, rolePrimary),
    source: 'admin',
    kind,
    reason: '管理员系统默认 · ' + (rolePrimary ? String(rolePrimary.name || rolePrimary.model) : '默认'),
  }
}

/** 构造兜底链：同角色优先 → 其它角色 → 冷掉的 provider 排后 */
function buildChain(
  adminPool: StoredModel[],
  ownPool: StoredModel[],
  kind: RouteKind,
  exclude?: StoredModel | null
): RouteConfig[] {
  const chain: RouteConfig[] = []
  const seen = new Set<string>()
  if (exclude && exclude.id) seen.add(exclude.id)
  for (const m of sortByRole(adminPool, kind)) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    chain.push(toConfig(m))
  }
  for (const m of ownPool) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    chain.push(toConfig(m, true))
  }
  return chain
}

/** 供 UI/诊断展示 */
export function routingSnapshot(userId?: string | null) {
  const adminPool = adminSharedModels()
  const own = userOwnModels(userId)
  const kinds: RouteKind[] = ['prose', 'structure', 'judge', 'polish', 'fast']
  const out: any = {}
  for (const k of kinds) {
    const p = pickRolePrimary(k, adminPool)
    out[k] = p ? { model: p.model, name: p.name, provider: p.provider } : null
  }
  return {
    adminPoolSize: adminPool.length,
    userOwnSize: own.length,
    userOwnModel: own.length ? { model: own[0].model, name: own[0].name, provider: own[0].provider } : null,
    byKind: out,
    // 🔥 2026-10-25 T2：免费优先白名单 + 探活可用性（供复测/诊断直接读）
    freeFirst: freeFirstSnapshot(),
    fallbackModel: FALLBACK_MODEL,
  }
}
