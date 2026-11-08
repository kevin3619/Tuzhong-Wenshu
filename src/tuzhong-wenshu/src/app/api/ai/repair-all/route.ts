/**
 * POST /api/ai/repair-all —— B2「全链路一键修复」服务端（SPEC §2）
 *
 * 契约：
 *   请求 { mode:'deterministic'|'llm', items:[{id,group,path,title,detail,key?}], context:any, llmConfig?, batchSize? }
 *   响应 { code:0, data:{ patches:[{id,path,op,value,method,key?,note?}], failed:[{id,reason}], llmCalls }, message:'ok' }
 *
 * 硬性要求：
 *   1. 分批 + 断点续跑：单次最多处理 batchSize（默认 20）条；客户端按批循环。
 *   2. 超时保护：单条 LLM 修复 20s，单批总预算 120s；超时进 failed[] 且不阻塞其余。
 *   3. 零 LLM 短路：mode='deterministic' 时绝不调用模型；mode='llm' 时 A 类可解条目也不调模型。
 *   4. 不得写盘：本接口只返回 patches，**不读写** .tuzhong-data/settings.json（本文件不 import fs）。
 *   5. failed[] 非空时 code 仍为 0（部分成功是正常态）。
 *
 * 鉴权 / 模型调用骨架照抄 api/ai/rewrite/route.ts（verifyToken + resolveLLMConfig + callLLMWithFallback）。
 *
 * ── RepairFailure.reason 取值登记（本路由层）─────────────────────────────────
 *   · no-llm-config                mode='llm' 需调模型但未提供有效 llmConfig
 *   · llm-invalid-title            LLM 返回值无法规整为「全库唯一的 4 汉字」
 *   · llm-invalid-volume-summary   LLM 返回的卷摘要清洗后不落 120-180
 *   · llm-invalid-output           LLM 返回值不满足该字段的最基本校验
 *   · llm-error:<msg>              LLM 调用异常（前缀）
 *   · timeout                      单条超时 / 单批预算耗尽（常量见 repairPlan.REPAIR_REASONS）
 *   · unsupported-non-string-field 数组/结构字段无法用 string 补丁承载
 *   （repairPlan 侧 reason 见 repairPlan.ts 头部登记表）
 */

import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { resolveLLMConfig } from '@/lib/resolve-llm-config'
import { callLLMWithFallback, type LLMConfig, type LLMMessage } from '@/lib/ai/llm'
import { sanitizeVolumeSummary, META_NARRATIVE_WORDS } from '@/lib/ai/pitfallRules'
import {
  applyDeterministicRepairs,
  isDeterministicRepair,
  getByPath,
  REPAIR_REASONS,
  type RepairPlanItem,
  type RepairPatch,
  type RepairFailure,
} from '@/lib/ai/repairPlan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 单条 LLM 修复超时（SPEC §2） */
const LLM_ITEM_TIMEOUT_MS = 20_000
/** 单批 LLM 总预算（SPEC §2） */
const LLM_BATCH_BUDGET_MS = 120_000
/** 默认批大小 */
const DEFAULT_BATCH_SIZE = 20
/** 批大小上限（防御超大 payload） */
const MAX_BATCH_SIZE = 50

/** 路由层 reason 常量（登记见文件头）。 */
const ROUTE_REASONS = {
  NO_LLM_CONFIG: 'no-llm-config',
  LLM_INVALID_TITLE: 'llm-invalid-title',
  LLM_INVALID_VOLUME_SUMMARY: 'llm-invalid-volume-summary',
  LLM_INVALID_OUTPUT: 'llm-invalid-output',
} as const

interface RequestItem {
  id?: string
  group?: string
  path?: string
  title?: string
  detail?: string
  key?: string
}

function asString(v: any): string {
  return v == null ? '' : String(v)
}

function toArray(v: any): any[] {
  return Array.isArray(v) ? v : []
}

/** 稳定唯一 key：`${id}#${path}`。 */
function itemKey(id: string, path: string): string {
  return asString(id) + '#' + asString(path)
}

/** 从 context 收集全部章标题（优先 slim 的 `titles`），用于服务端「全库唯一」二次校验。 */
function collectContextTitles(context: any): string[] {
  if (context && Array.isArray(context.titles) && context.titles.length > 0) {
    return context.titles.map((t: any) => asString(t).trim()).filter(Boolean)
  }
  const out: string[] = []
  const vols = toArray(getByPath(context, 'chapters.volumes'))
  vols.forEach((v: any) => {
    toArray(v && v.chapters).forEach((c: any) => {
      const t = asString(c && c.title).trim()
      if (t) out.push(t)
    })
  })
  return out
}

/** 从 context 收集卷名集合（优先 slim 的 `volumeNames`）。 */
function collectContextVolumeNames(context: any): Set<string> {
  const set = new Set<string>()
  if (context && Array.isArray(context.volumeNames) && context.volumeNames.length > 0) {
    context.volumeNames.forEach((n: any) => { const s = asString(n).trim(); if (s) set.add(s) })
    return set
  }
  const vols = toArray(getByPath(context, 'chapters.volumes'))
  vols.forEach((v: any) => { const n = asString(v && v.name).trim(); if (n) set.add(n) })
  return set
}

/** 把请求条目规范化为 RepairPlanItem（method 按 A/B 分级重算；key 缺失时补 `id#path`）。 */
function toPlanItem(raw: RequestItem): RepairPlanItem {
  const id = asString(raw.id)
  const group = asString(raw.group)
  const path = asString(raw.path)
  return {
    id,
    group,
    path,
    key: asString(raw.key) || itemKey(id, path),
    title: asString(raw.title),
    detail: asString(raw.detail),
    method: isDeterministicRepair(group, id) ? 'deterministic' : 'llm',
  }
}

/** 从 LLM 输出中抽取恰 4 个连续汉字（用于标题）。 */
function extractFourCJK(text: string): string | null {
  const m = asString(text).match(/[\u4e00-\u9fa5]{4}/g)
  if (!m || m.length === 0) return null
  for (const cand of m) {
    if (/^[\u4e00-\u9fa5]{4}$/.test(cand) && !containsAny(cand, META_NARRATIVE_WORDS)) return cand
  }
  return null
}

function containsAny(text: string, words: string[]): boolean {
  for (const w of words) if (w && text.indexOf(w) !== -1) return true
  return false
}

/** 构造单条 B 类修复的 LLM 提示；无法用字符串承载的字段返回 null（→ failed unsupported）。 */
function buildItemPrompt(item: RepairPlanItem, context: any): { system: string; user: string } | null {
  const group = item.group
  const id = item.id

  if (group === 'titles') {
    const summary = asString(getByPath(context, item.path.replace(/\.title$/, '.summary')))
    const hook = asString(getByPath(context, item.path.replace(/\.title$/, '.hook')))
    const cur = asString(getByPath(context, item.path))
    const titles = collectContextTitles(context)
    const sample = titles.slice(0, 200).join('、')
    return {
      system: '你是资深中文历史小说编辑。只输出结果本身，不要任何解释、引号或标点。',
      user: `请为下面这一章起一个【恰 4 个汉字】的标题。
构成规则（二选一）：①「地名(+方位)」，如「桂林城下」「肇庆以东」；②「事件词+安全后缀」，后缀仅限 之变/之争/新政/初定/改制，如「北伐之变」「削藩之争」。
严禁「主体+随机动词」式生造搭配（如「清军设省」）。
严禁与下列已有标题重复：${sample}
原标题（待替换）：${cur || '(空)'}
本章摘要：${summary || '(无)'}
本章钩子：${hook || '(无)'}
只输出 4 个汉字。`,
    }
  }

  if (group === 'volumeSummary') {
    const cur = asString(getByPath(context, item.path))
    const volName = asString(getByPath(context, item.path.replace(/\.summary$/, '.name')))
    return {
      system: '你是资深中文历史小说编辑。只输出卷摘要正文，不要标题、不要解释。',
      user: `请为「${volName || '本卷'}」重写一段卷摘要，要求【清洗后 120-180 个汉字】，以句号收尾，不得使用套话（如「拉开了序幕」「埋下伏笔」「精彩纷呈」），不得出现「章末/下一章/本章/下章/且看/即将揭晓」等元叙述词。
现有摘要（供参考，可大幅改写）：${cur || '(无)'}
只输出摘要正文。`,
    }
  }

  if (group === 'characters' && id === 'char-role') {
    const name = asString(getByPath(context, item.path.replace(/\.role$/, '.name')))
    return {
      system: '你是角色设定师。只输出字段值本身，不要解释。',
      user: `为角色「${name || '该角色'}」补一个简短的 role 定位（身份/职能，6-16 个字，如「南明内阁首辅」「大西军少年将领」）。只输出该定位文本。`,
    }
  }

  if (group === 'upstream') {
    const key = id.replace(/^upstream-/, '') || item.path
    return {
      system: '你是中文历史小说的策划编辑。只输出字段内容本身，不要标题、不要解释。',
      user: `请补写设计字段「${key}」的内容，正文不少于 100 个汉字，语言凝练、与明末清初历史设定自洽。只输出该字段内容。`,
    }
  }

  // platinum 等含数组/结构字段：字符串补丁无法承载 → 由调用方记 failed
  return null
}

/** 校验并规整单条 LLM 结果；返回 patch.value 或 null（不合法）。 */
function validateLlmValue(item: RepairPlanItem, context: any, raw: string): string | null {
  const group = item.group
  const id = item.id
  const text = asString(raw).trim()
  if (!text) return null

  if (group === 'titles') {
    const four = extractFourCJK(text)
    if (!four) return null
    const used = new Set(collectContextTitles(context))
    const volNames = collectContextVolumeNames(context)
    if (used.has(four) || volNames.has(four)) return null
    return four
  }

  if (group === 'volumeSummary') {
    const clean = sanitizeVolumeSummary(text)
    if (clean.length >= 120 && clean.length <= 180 && !containsAny(clean, META_NARRATIVE_WORDS)) return clean
    return null
  }

  if (group === 'characters' && id === 'char-role') {
    return text.length <= 40 ? text : text.slice(0, 40)
  }

  if (group === 'upstream') {
    return text.length >= 40 ? text : null
  }

  return null
}

function groupReason(group: string): string {
  if (group === 'titles') return ROUTE_REASONS.LLM_INVALID_TITLE
  if (group === 'volumeSummary') return ROUTE_REASONS.LLM_INVALID_VOLUME_SUMMARY
  return ROUTE_REASONS.LLM_INVALID_OUTPUT
}

/** 带 20s 超时的单条 LLM 调用（超时/失败 → reason）。 */
async function repairWithLLM(
  item: RepairPlanItem,
  context: any,
  cfg: LLMConfig,
  onCall: () => void,
  retryLimit = 2
): Promise<{ patch: RepairPatch } | { reason: string }> {
  const prompt = buildItemPrompt(item, context)
  if (!prompt) return { reason: REPAIR_REASONS.UNSUPPORTED_NON_STRING }

  let lastReason: string = ROUTE_REASONS.LLM_INVALID_OUTPUT
  for (let attempt = 0; attempt < retryLimit; attempt++) {
    const messages: LLMMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ]
    let raced: string
    try {
      raced = await Promise.race<string>([
        callLLMWithFallback(cfg, messages, undefined, { timeoutMs: LLM_ITEM_TIMEOUT_MS, temperature: 0.5, maxTokens: 1200 })
          .then((r) => r.content),
        new Promise<string>((_resolve, reject) => {
          setTimeout(() => reject(new Error('REPAIR_TIMEOUT')), LLM_ITEM_TIMEOUT_MS)
        }),
      ])
    } catch (e: any) {
      const msg = e && e.message ? String(e.message) : String(e)
      lastReason = /REPAIR_TIMEOUT|TimeoutError|AbortError|TIMEOUT/.test(msg) ? REPAIR_REASONS.TIMEOUT : ('llm-error:' + msg.slice(0, 80))
      continue
    }
    onCall()
    const ok = validateLlmValue(item, context, raced)
    if (ok != null) {
      return { patch: { id: item.id, key: item.key, path: item.path, op: 'set', value: ok, method: 'llm', note: 'llm-repair' } }
    }
    lastReason = groupReason(item.group)
  }
  return { reason: lastReason }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const mode = asString(body && body.mode) === 'llm' ? 'llm' : 'deterministic'
    const rawItems: RequestItem[] = toArray(body && body.items)
    const context = (body && body.context) || {}
    const llmConfig = body && body.llmConfig
    const reqBatch = Number(body && body.batchSize)
    const batchSize = isFinite(reqBatch) && reqBatch > 0
      ? Math.min(Math.floor(reqBatch), MAX_BATCH_SIZE)
      : DEFAULT_BATCH_SIZE

    // ── 鉴权（与 rewrite 路由一致：可选，用于解析管理员共享模型 Key）──
    let userId: string | undefined
    try {
      const authHeader = request.headers.get('Authorization') || ''
      const token = authHeader.replace('Bearer ', '')
      if (token) {
        const decoded = await verifyToken(token)
        if (decoded) userId = decoded.userId
      }
    } catch (_e) { /* 匿名可用 */ }

    if (!Array.isArray(body && body.items)) {
      return NextResponse.json({ error: '缺少必要参数：items（数组）' }, { status: 400 })
    }

    // ── 分批：单次最多 batchSize 条 ──
    const batch = rawItems.slice(0, batchSize)
    const planItems = batch.map(toPlanItem)

    const patches: RepairPatch[] = []
    const failed: RepairFailure[] = []
    let llmCalls = 0

    // ── 第一阶段：确定性修复（两种 mode 都先跑；A 类零 LLM）──
    // 注意：context 允许缺失或为「瘦上下文（__slim）」——applyDeterministicRepairs 只依赖
    // 目标路径的值 + titles/volumeNames，不依赖全量整包；缺失时相关项落 failed 而非报错。
    const det = applyDeterministicRepairs(context, planItems)
    det.patches.forEach((p) => patches.push(p))

    // ── mode='deterministic' 短路：绝不调用任何模型 ──
    // 【兜底分支】客户端为纯函数零依赖模块，A 类确定性修复**优先在客户端本地执行（零网络）**；
    // 本分支仅作契约兼容 / 无客户端执行能力时的服务端兜底，保留且有单测覆盖。
    if (mode === 'deterministic') {
      det.failed.forEach((f) => failed.push(f))
      return NextResponse.json({
        code: 0,
        data: { patches, failed, llmCalls: 0 },
        message: 'ok',
      })
    }

    // ── mode='llm'：仅对「确定性无解」的条目调用模型 ──
    const detFailedIds = new Set(det.failed.map((f) => f.id))
    const detPatchedKeys = new Set(det.patches.map((p) => asString(p.key) || itemKey(p.id, p.path)))

    const needsLlm: RepairPlanItem[] = []
    planItems.forEach((it) => {
      if (detPatchedKeys.has(it.key)) return                 // A 类已解 → 不调模型
      if (detFailedIds.has(it.id)) { needsLlm.push(it); return }
      // 既无 patch 也无 fail（视作无需改动）——A 类跳过；B 类仍需 LLM
      if (!isDeterministicRepair(it.group, it.id)) needsLlm.push(it)
    })

    if (needsLlm.length > 0) {
      const resolvedCfg = llmConfig ? resolveLLMConfig(llmConfig as any, userId, 'polish') : null
      const hasCfg = !!(resolvedCfg && resolvedCfg.apiKey)
      const batchStart = Date.now()

      for (const item of needsLlm) {
        if (!hasCfg) { failed.push({ id: item.id, reason: ROUTE_REASONS.NO_LLM_CONFIG }); continue }
        if (Date.now() - batchStart > LLM_BATCH_BUDGET_MS) {
          failed.push({ id: item.id, reason: REPAIR_REASONS.TIMEOUT })
          continue
        }
        const res = await repairWithLLM(item, context, resolvedCfg as LLMConfig, () => { llmCalls++ })
        if ('patch' in res) patches.push(res.patch)
        else failed.push({ id: item.id, reason: res.reason })
      }
    }

    return NextResponse.json({
      code: 0,
      data: { patches, failed, llmCalls },
      message: 'ok',
    })
  } catch (error) {
    console.error('[AI RepairAll] 修复服务异常:', error)
    return NextResponse.json({ error: '修复服务异常，请稍后重试' }, { status: 500 })
  }
}
