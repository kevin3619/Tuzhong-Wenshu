// AI大模型调用服务
// 支持：OpenAI、DeepSeek、Claude、通义千问、文心一言、Google Gemini、Mistral、Groq
//       Together AI、OpenRouter、Perplexity、Cohere、智谱GLM、讯飞星火、Kimi
//       百川智能、零一万物、MiniMax、阶跃星辰、腾讯混元、字节豆包
//       Ollama、LM Studio、vLLM（本地部署）
import crypto from 'crypto'
// 🔥 2026-10-25 T6：模型响应正文抽取（商汤 reasoning 回退 + think 剥离）
import { extractModelText, describeModelText } from './oh-story/model-response'

// 🔥 防崩溃安全网：单条 AI 请求（如 undici socket 错误、本地 Ollama 推理异常、限流重置连接）
// 不得拖垮整个 dev server。捕获未处理异常/拒绝，仅记录日志、绝不退出进程。
let _crashGuardRegistered = false
if (typeof process !== 'undefined' && !_crashGuardRegistered) {
  _crashGuardRegistered = true
  process.on('uncaughtException', (err) => {
    console.error('[安全网] 捕获未处理异常（已抑制，server 继续运行）:', err instanceof Error ? err.message : String(err))
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[安全网] 捕获未处理 Promise 拒绝（已抑制，server 继续运行）:', reason instanceof Error ? reason.message : String(reason))
  })
}

export interface LLMConfig {
  provider: string  // 提供商名称，如 'OpenAI', 'Claude (Anthropic)', 'DeepSeek' 等
  apiKey: string
  baseUrl?: string  // 自定义API地址
  model: string     // 模型名称
  isImageModel?: boolean  // 🔥 绘图/图像模型标记（动态兜底池需过滤掉）
  // 🔥 2026-10-17：付费模型标记（models.json 注入），动态兜底池会过滤 isPaid===true 的项
  isPaid?: boolean
  // 🔥 2026-09-23：opt-in 按模型频率限制（仅 OpenVeer 等免费中转配置）。
  //   与全局 _providerRateLimitEnabled 解耦——用户要求"所有模型不要限流"，故仅当本字段存在时才生效，
  //   用于尊重免费中转硬配额（10/分、100/时、1200/天），避免 429 浪费调用。
  rateLimit?: { perMinute?: number; perHour?: number; perDay?: number }
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// 🔥 仿写保护：当前请求级别的"严禁抄袭原著名"约束（由 route.ts 在每个 /api/ai-generate 请求开始时设置）。
// callLLMWithFallback 在每次调用的【同步起点】将其注入到 system 消息，从而对【所有环节】（idea/worldbuilding/characters/...）
// 生效，而不再仅限于 content 步。
// ⚠️ 并发修复（P2 #7）：原先使用模块级变量 _imitateGuard / _extraFallbackPool，多个并发 /api/ai-generate 请求
//   在同一 worker 内会互相串扰（请求 B 的 setImitateGuard 覆盖请求 A 的，A 的后续异步 callLLMWithFallback 读到 B 的值）。
//   改用「请求级上下文」隔离：上下文由服务端专用模块（llm-request-ctx.ts，内部用 AsyncLocalStorage）注入，
//   该模块仅被 server route 引入，不会进入客户端 bundle；llm.ts 本身只通过 _setLLMContextProvider 读取，
//   无 Node 内置模块依赖，故仍可被 style/page.tsx 等客户端组件安全引用。无 provider 时回落到模块兜底变量。
export interface LLMRequestContext {
  imitateGuard: string
  extraFallbackPool: LLMConfig[]
}

// 非请求上下文包裹调用（如其它 route 直接调 callLLMWithFallback）的兜底，保持向后兼容
let _imitateGuardFallback = ''
let _extraFallbackPoolFallback: LLMConfig[] = []

// 上下文提供方：由服务端模块 llm-request-ctx.ts 注入（基于 AsyncLocalStorage）。
// 客户端无此注入，currentLLMContext 自动回落到模块兜底变量。
let _ctxProvider: (() => LLMRequestContext | null) | null = null
export function _setLLMContextProvider(p: (() => LLMRequestContext | null) | null): void {
  _ctxProvider = p
}

export function setImitateGuard(guard: string) {
  if (_ctxProvider) {
    const s = _ctxProvider()
    if (s) { s.imitateGuard = guard || ''; return }
  }
  _imitateGuardFallback = guard || ''
}
export function setExtraFallbackPool(list: LLMConfig[]) {
  if (_ctxProvider) {
    const s = _ctxProvider()
    if (s) { s.extraFallbackPool = Array.isArray(list) ? list : []; return }
  }
  _extraFallbackPoolFallback = Array.isArray(list) ? list : []
}
// 供 callLLMWithFallback 读取当前请求上下文（provider 优先，回落模块兜底）
function currentLLMContext(): LLMRequestContext {
  if (_ctxProvider) {
    const s = _ctxProvider()
    if (s) return s
  }
  return { imitateGuard: _imitateGuardFallback, extraFallbackPool: _extraFallbackPoolFallback }
}

// ============================================================
// 🔥 2026-10-21 兜底链 Key 校正
// ------------------------------------------------------------
// 背景：.env.local 里的 SILICONFLOW_API_KEY 是【占位符】（your...），
//   而 llm.ts 的静态兜底池（SILICONFLOW_MODELS/ZHIPU_MODELS）用的正是 env 变量，
//   一旦命中就返回 401「Token is invalid」，白白耗掉一次尝试与一次重试。
//   真实 Key 只存在于 .tuzhong-data/models.json（管理员/用户配置的模型条目）。
// 方案：兜底链里每个模型都按 provider+model 去 models.json 取真 Key；
//   取不到才退回 env Key；env Key 明显是占位符（your_/sk-xxx_your）则跳过该模型。
// ============================================================
let _modelsJsonCache: { at: number; list: any[] } | null = null
function _readModelsJson(): any[] {
  const now = Date.now()
  if (_modelsJsonCache && now - _modelsJsonCache.at < 20000) return _modelsJsonCache.list
  let list: any[] = []
  try {
    const fs2 = require('fs')
    const path2 = require('path')
    const p = path2.join(process.cwd(), '.tuzhong-data', 'models.json')
    if (fs2.existsSync(p)) {
      const parsed = JSON.parse(fs2.readFileSync(p, 'utf8'))
      list = Array.isArray(parsed) ? parsed : (parsed && parsed.models) || []
    }
  } catch (_e) { list = [] }
  _modelsJsonCache = { at: now, list }
  return list
}

/** 占位符 Key 判定：env 里填了但明显不是真 Key */
function _isPlaceholderKey(k: string): boolean {
  const s = String(k || '').trim()
  if (!s) return true
  if (s.indexOf('*') >= 0) return true
  if (/^your/i.test(s)) return true
  if (/your_api_key|yourkey|your-key|placeholder|填入|请填/i.test(s)) return true
  return false
}

/** 按 provider+model 从 models.json 取真实 Key */
function _realKeyFor(provider: string, model: string): string {
  try {
    const np = normalizeProviderName(String(provider || ''))
    const nm = String(model || '').trim()
    const hit = _readModelsJson().find(function (x: any) {
      if (!x || x.isPaid === true) return false
      const k = String(x.apiKey || '').replace(/[`'"]/g, '').trim()
      if (!k || k.indexOf('*') >= 0) return false
      if (String(x.model || '').trim() !== nm) return false
      return normalizeProviderName(String(x.provider || '')) === np
    })
    if (hit) return String(hit.apiKey).replace(/[`'"]/g, '').trim()
  } catch (_e) { /* 忽略 */ }
  return ''
}

/** 兜底链条目的有效 Key：models.json 真 Key 优先；env 占位符视为无效 */
function _effectiveFallbackKey(provider: string, model: string, envKey?: string): string | undefined {
  const real = _realKeyFor(provider, model)
  if (real) return real
  const e = String(envKey || '').replace(/[`'"]/g, '').trim()
  if (_isPlaceholderKey(e)) return undefined
  return e || undefined
}

// 🔥🔥🔥 2026-09-02 模型健康表：限流/鉴权/超时/空内容等失败计入冷却，
//   解决"已配置平台大模型限流"问题——失败≥2 次的模型进入 5-15 分钟冷却，
//   期间 callLLMWithFallback 把它排到兜底链末尾、route.ts 选模型时跳过它，
//   避免每次请求都从限流模型开始重试（原来单次 429 退避最多拖 60s）。
const _llmModelHealth: Record<string, { fail: number; cooldownUntil: number }> = {}

/** 模型当前是否健康（未处于冷却期） */
export function isLLMModelHealthy(model: string): boolean {
  if (!model) return true
  const h = _llmModelHealth[model]
  return !(h && h.cooldownUntil > Date.now())
}

/** 模型调用成功：清空失败计数与冷却 */
export function _markLLMModelOk(model: string) {
  if (!model) return
  const h = _llmModelHealth[model]
  if (h) { h.fail = 0; h.cooldownUntil = 0 }
}

/** 模型调用失败：hard=true 表示硬限流(429，15分钟冷却)；其余(401/超时/空内容/拒答) 5 分钟冷却 */
export function _markLLMModelFail(model: string, hard: boolean) {
  if (!model) return
  const h = _llmModelHealth[model] || (_llmModelHealth[model] = { fail: 0, cooldownUntil: 0 })
  h.fail++
  if (h.fail >= 2) {
    h.cooldownUntil = Date.now() + (hard ? 15 * 60 * 1000 : 5 * 60 * 1000)
    console.warn('[多模型切换] 模型 ' + model + ' 进入冷却 ' + (hard ? 15 : 5) + ' 分钟（累计失败 ' + h.fail + ' 次）')
  }
}

// 修复 astron-code-latest 等模型常见 JSON 错误
function repairCommonJSONErrorsInLLM(text: string): string {
  return text
    .replace(/\]\s*,\s*\[/g, ', ')
    .replace(/\]\s*\](\s*[,}\]])/g, ']$1')
    .replace(/"(\w+)"\s*:\s*([\u4e00-\u9fa5][^,\}\]"'\n]*(?:\([^)]*\))?[^,\}\]"'\n]*)(\s*[,}\]])/g,
      function(_m, key, val, trail) {
        const t = val.trim()
        if (/^(true|false|null)$/.test(t)) return '"' + key + '": ' + t + trail
        if (/^-?\d+(\.\d+)?$/.test(t)) return '"' + key + '": ' + t + trail
        return '"' + key + '": "' + t.replace(/"/g, '\\"') + '"' + trail
      })
}

// 从localStorage获取AI配置
export function getLLMConfig(): LLMConfig | null {
  if (typeof window === 'undefined') return null
  const saved = localStorage.getItem('tuzhong-llm-config')
  if (saved) {
    try { return JSON.parse(saved) } catch {}
  }
  return null
}

// 保存AI配置到localStorage
export function saveLLMConfig(config: LLMConfig): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('tuzhong-llm-config', JSON.stringify(config))
}

// 从AI返回的文本中提取JSON（处理```json包裹、前后说明文字等）
export function extractJSONFromText(text: string): string {
  // 1. 尝试直接匹配```json...```代码块
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    return jsonBlockMatch[1].trim()
  }
  // 2. 尝试匹配```...```代码块（无语言标记）
  const codeBlockMatch = text.match(/```\s*([\s\S]*?)```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim()
  }
  // 3. 尝试找到第一个完整JSON对象（首{→匹配}），避免混入后续重复输出
  const firstBrace = text.indexOf('{')
  if (firstBrace !== -1) {
    let depth = 0
    let inString = false
    let escape = false
    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i]
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      if (ch === '}') { depth--; if (depth === 0) { return text.substring(firstBrace, i + 1).trim() } }
    }
    // 4. 回退：第一个{到最后一个}之间的内容
    const lastBrace = text.lastIndexOf('}')
    if (lastBrace !== -1 && lastBrace > firstBrace) {
      return text.substring(firstBrace, lastBrace + 1).trim()
    }
  }
  // 5. 尝试找到第一个[到最后一个]之间的内容
  const firstBracket = text.indexOf('[')
  const lastBracket = text.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return text.substring(firstBracket, lastBracket + 1).trim()
  }
  // 6. 返回原始文本
  return text.trim()
}

// 🔥 清洗 JSON 字符串中模型吐出的原始控制字符（\r \n \t 等未转义的换行/制表符）。
// 这些会导致 JSON.parse 抛 "Bad control character in string literal"，引发不必要的重试链。
// 合法的转义序列（如 \n 的源码形式 \+字母）不受影响——那是两个 ASCII 字符而非原始控制字节。
export function sanitizeJSONControlChars(s: string): string {
  if (!s) return s
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\t/g, ' ')
}

// 全局AI响应清洗函数（根治无法解析JSON：移除代码块标记、解释文字、修复常见语法错误）
export function cleanAIResponse(text: string): string {
  if (!text || typeof text !== 'string') return ''
  
  // 步骤1-5: 链式替换清理
  let cleaned = text
    .replace(/^\uFEFF/, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/<think[\s\S]*?<\/think>/gi, '')
    .replace(/<think[\s\S]*/gi, '')
    .replace(/<\/think>/gi, '')
    .replace(/<ret>/gi, '\n')
    .replace(/<end>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
  
  // 步骤6: 提取JSON内容
  // 如果内容以 [ 开头（JSON数组），提取数组而不是第一个对象
  const trimmed = cleaned.trim()
  if (trimmed.startsWith('[')) {
    // JSON数组：提取第一个完整的 [ 到 ] 的内容
    const firstBracket = cleaned.indexOf('[')
    if (firstBracket !== -1) {
      let depth = 0
      let inString = false
      let esc = false
      for (let i = firstBracket; i < cleaned.length; i++) {
        const ch = cleaned[i]
        if (esc) { esc = false; continue }
        if (ch === '\\') { esc = true; continue }
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === '[') depth++
        if (ch === ']') { depth--; if (depth === 0) { cleaned = cleaned.substring(firstBracket, i + 1); break } }
      }
      // 如果数组不完整（模型截断），回退到最后一个 }
      if (depth !== 0) {
        const lastCloseBracket = cleaned.lastIndexOf('}')
        if (lastCloseBracket !== -1 && lastCloseBracket > firstBracket) {
          cleaned = cleaned.substring(firstBracket, lastCloseBracket + 1) + ']'
        }
      }
    }
  } else {
    // JSON对象：提取第一个完整的 {...} 对象
    const firstBrace = cleaned.indexOf('{')
    if (firstBrace !== -1) {
      let objDepth = 0
      let inString2 = false
      let esc2 = false
      for (let i2 = firstBrace; i2 < cleaned.length; i2++) {
        const ch2 = cleaned[i2]
        if (esc2) { esc2 = false; continue }
        if (ch2 === '\\') { esc2 = true; continue }
        if (ch2 === '"') { inString2 = !inString2; continue }
        if (inString2) continue
        if (ch2 === '{') objDepth++
        if (ch2 === '}') { objDepth--; if (objDepth === 0) { cleaned = cleaned.substring(firstBrace, i2 + 1); break } }
      }
      // 回退：如果括号不匹配，使用第一个{到最后一个}
      if (objDepth !== 0) {
        const lastBrace = cleaned.lastIndexOf('}')
        if (lastBrace !== -1 && lastBrace > firstBrace) {
          cleaned = cleaned.substring(firstBrace, lastBrace + 1)
        }
      }
    }
  }
  
  // 步骤7-14: 继续链式清洗
  cleaned = repairCommonJSONErrorsInLLM(cleaned)
  cleaned = cleaned
    .replace(/^(好的|明白了|根据|以下是|这是|下面是|以下是生成|以下为|生成结果|JSON数据|输出内容|返回结果)[\s\S]*?(?=\{|\[)/i, '')
    .replace(/(\]|\})\s*(好的|以上|如果|需要|请|这样|希望|可以|这个|结束|完成|生成|输出|返回).*$/im, '$1')
    // 修复双逗号/多逗号：["a",, "b"] → ["a", "b"] 或 ["a",,, "b"] → ["a", "b"]
    .replace(/,{2,}/g, ',')
    // 修复数组中缺失的逗号（AI常见错误：["a" "b" "c"] → ["a", "b", "c"]）
    .replace(/\[([^\]]*)\]/g, function(_match, arrayContent) {
      return '[' + arrayContent.replace(/"\s+(?=")/g, '", "') + ']'
    })
  // 步骤8: 移除JSON之后的多余内容
  const lastCloseBrace = cleaned.lastIndexOf('}')
  const lastCloseBracket = cleaned.lastIndexOf(']')
  const lastPos = Math.max(lastCloseBrace, lastCloseBracket)
  if (lastPos !== -1) {
    cleaned = cleaned.substring(0, lastPos + 1)
  }
  cleaned = cleaned
    // 步骤9-14: 修复JSON语法
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/([{,]\s*)'([^']*?)'(\s*:)/g, '$1"$2"$3')
    .replace(/(:\s*)'([^']*?)'(\s*[,}\]])/g, '$1"$2"$3')
    .replace(/([\{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  
  // 步骤15: 修复缺失的闭合括号/方括号（Qwen2.5-7B常见错误）
  // 计算 { 和 } 的数量差，补齐缺失的 }
  const openBraces = (cleaned.match(/\{/g) || []).length
  let closeBraces = (cleaned.match(/\}/g) || []).length
  while (closeBraces < openBraces) {
    cleaned += '}'
    closeBraces++
  }
  // 计算 [ 和 ] 的数量差，补齐缺失的 ]
  const openBrackets = (cleaned.match(/\[/g) || []).length
  let closeBrackets = (cleaned.match(/\]/g) || []).length
  while (closeBrackets < openBrackets) {
    cleaned += ']'
    closeBrackets++
  }
  
  // 步骤16: 修复AI生成的损坏key（纯标点符号作为key）
  cleaned = cleaned.replace(/,\s*"[^a-zA-Z0-9_\u4e00-\u9fa5]{1,10}"\s*:\s*"[^"]*"/g, '')
  cleaned = cleaned.replace(/,{2,}/g, ',')
  
  return cleaned
}

// 从配置反查路由模型ID（用于限流计数标记）
function _resolveModelIdFromConfig(config: LLMConfig): string {
  const m = (config.model || '').trim()
  const p = normalizeProviderName(config.provider)
  for (const _id in ROUTE_MODEL_REGISTRY) {
    const ent = ROUTE_MODEL_REGISTRY[_id]
    if (ent.model === m && normalizeProviderName(ent.provider) === p) return _id
  }
  if (p === '硅基流动') return 'sf-generic'
  if (p === '讯飞星火') return 'xf-generic'
  return 'generic'
}

// 调用大模型（服务端使用）
// 修复 v4 C8/C9：callLLM 接受完整参数模板（topP/presencePenalty/frequencyPenalty），Claude/文心/Ollama 也使用 opts 参数
// ============================================================
// 🔥 全局按提供商限流闸门（途中文枢 SaaS · 免费大模型关键防御）
// ------------------------------------------------------------
// 免费档（硅基流动/智谱等）RPM 极低，连续高频调用必 429，进而触发
// fallback 链重试螺旋、把整步/整流程拖垮。此处建立【进程级 · 按 provider
// 滑动窗口】闸门：同一 provider 在 60s 窗口内出站调用数不超过上限；
// 命中 429 时按服务端 retryAfter 进入冷却，后续同 provider 请求自动顺延。
// 这是覆盖 base / fallback / 跨平台 / 重试 / 跨步 每一次实际打 API 的唯一漏斗
// （callLLM 是所有模型 HTTP 请求的统一出口）。
//
// ⚠️ 进程级限制：对单实例 Node 部署精确生效；若未来多实例水平扩展，
//    需改为 Redis 等共享存储的分发式限流。
// ============================================================
// 🔥 2026-08-30：内部 provider 限流/冷却总开关。默认 true = 按 provider 控制出站频率，
//   避免免费档（智谱/硅基流动）账户级"您的账户已达到速率限制"。
//   如需完全关闭（不推荐），设置环境变量 AI_RATE_GATE=0。
let _providerRateLimitEnabled = process.env.AI_RATE_GATE !== '0'
const _PROVIDER_RATE_LIMIT = {
  calls: {} as Record<string, number[]>,        // providerKey -> 最近调用时间戳(ms)
  cooldownUntil: {} as Record<string, number>,  // providerKey -> 冷却截止(ms)
}
const _PROVIDER_MAX_RPM: Record<string, number> = {
  '硅基流动': 6,
  'siliconflow': 6,
  '智谱': 5,
  '智谱glm': 5,
  'zhipu': 5,
  // 🔥 2026-08-30：付费 DeepSeek 是并行正文(content)主模型，一批 5 路并发，
  //   默认 4/min 会掐掉第 5 路 → 提额到 30/min，保证批次并行不被自家闸门限流。
  'deepseek': 30,
  '深度求索': 30,
  // OpenRouter 免费档：中等额度，供动态兜底池与并行使用
  'openrouter': 15,
}
const _RATE_LIMIT_WINDOW_MS = 60_000
const _RATE_LIMIT_DEFAULT_RPM = 4
const _RATE_LIMIT_MAX_WAIT_MS = 90_000 // 单次获取最长等待，防极端死等

function _rateLimitProviderKey(provider?: string): string {
  const k = normalizeProviderName(provider || '')
  // 🔥 修正大小写不匹配：normalizeProviderName 返回混合大小写(DeepSeek/OpenRouter/智谱GLM)，
  //   而 _PROVIDER_MAX_RPM 用小写键，统一转小写才能让各 provider 的 RPM 上限真正生效。
  return (k || 'default').toLowerCase()
}

function _rateLimitMaxRpm(provider?: string): number {
  const k = _rateLimitProviderKey(provider)
  if (_PROVIDER_MAX_RPM[k] != null) return _PROVIDER_MAX_RPM[k]
  return _RATE_LIMIT_DEFAULT_RPM
}

// 本地/Ollama 无限流（本机推理，不计 RPM）
function _rateLimitShouldSkip(provider?: string): boolean {
  const k = _rateLimitProviderKey(provider)
  return k === 'ollama' || k === '本地' || k === 'local'
}

// 在每次出站请求前调用：保证同 provider 不超 RPM，且尊重 429 冷却
async function _acquireProviderRateLimit(provider?: string): Promise<void> {
  // 🔥 2026-10-24：默认开启（AI_RATE_GATE=0 可关闭）。免费档（智谱/硅基流动）账户级
  //   "您的账户已达到速率限制"就是这个闸门要解决的目标：同 provider 出站先排队，
  //   命中 429 后该 provider 进入冷却并自动切下一个模型兜底。
  if (!_providerRateLimitEnabled) return
  if (_rateLimitShouldSkip(provider)) return
  const key = _rateLimitProviderKey(provider)
  const maxRpm = _rateLimitMaxRpm(provider)
  if (!_PROVIDER_RATE_LIMIT.calls[key]) _PROVIDER_RATE_LIMIT.calls[key] = []
  const calls = _PROVIDER_RATE_LIMIT.calls[key]
  const now = Date.now()
  // 清理 60s 窗外时间戳（同步无 await，保证“预留名额”原子）
  while (calls.length && now - calls[0] > _RATE_LIMIT_WINDOW_MS) calls.shift()
  // 预留本次调用的名额（同步，单线程下无 TOCTOU）
  calls.push(now)
  // 🔥 SaaS 关键修正：免费档限流时【快速失败 + 切 provider 兜底】，而非傻等把整步拖垮
  const _RPM_WAIT_CAP_MS = 15_000 // RPM 超限最多等 15s 让额度恢复，超过则放弃本 provider
  const deadline = Date.now() + _RATE_LIMIT_MAX_WAIT_MS
  while (Date.now() < deadline) {
    const t = Date.now()
    while (calls.length && t - calls[0] > _RATE_LIMIT_WINDOW_MS) calls.shift()
    const cool = _PROVIDER_RATE_LIMIT.cooldownUntil[key] || 0
    if (t < cool) {
      // 冷却中：本 provider 被硬限流，立即放弃并收回名额，让 callLLMWithFallback 秒切另一 provider（不再阻塞等待）
      calls.pop()
      throw new Error('RATE_LIMIT: provider ' + key + ' 冷却中，切下一模型')
    }
    if (calls.length <= maxRpm) return
    const earliest = calls[0]
    const wait = earliest + _RATE_LIMIT_WINDOW_MS - t
    if (wait > 0) {
      if (wait > _RPM_WAIT_CAP_MS) {
        // RPM 超限且恢复过久：放弃本 provider，切另一 provider 兜底，避免重试螺旋（用户要求：用他兜底）
        calls.pop()
        throw new Error('RATE_LIMIT: provider ' + key + ' RPM 超限，切下一模型')
      }
      await new Promise(function (r) { setTimeout(r, Math.min(wait, 1000)) })
    }
  }
  // 兜底放行（避免永久阻塞），仅可能超限 1 笔，由 429 冷却兜底
}

// 命中 429 时登记冷却，后续同 provider 请求自动顺延
function _registerRateLimitCooldown(provider?: string, retryAfterSec?: number): void {
  if (!_providerRateLimitEnabled) return
  if (_rateLimitShouldSkip(provider)) return
  const key = _rateLimitProviderKey(provider)
  // 🔥 2026-10-24：最短冷却从 8s 提到 20s。免费档的限额窗口通常按分钟计，
  //   8s 后立刻重试几乎必然再撞 429，会把 fallback 链拖成"每次都要撞一次"。
  const coolSec = Math.max(Number(retryAfterSec) || 0, 20)
  const coolMs = Math.min(coolSec * 1000, 120_000)
  const until = Date.now() + coolMs
  if (!_PROVIDER_RATE_LIMIT.cooldownUntil[key] || _PROVIDER_RATE_LIMIT.cooldownUntil[key] < until) {
    _PROVIDER_RATE_LIMIT.cooldownUntil[key] = until
  }
  console.warn('[限流闸门] provider=' + key + ' 命中 429，冷却至 ' + new Date(until).toISOString() + ' (retryAfter=' + retryAfterSec + 's)')
}

// 🔥 2026-10-24：按 provider 的在途并发上限。仅靠 RPM 挡不住"账户级速率限制"——
//   5 个并发请求在 1 分钟内只算 5 次，但免费档的并发配额往往只有 1-2。
//   这里对每次真实出站做"槽位占用"，超出上限的请求排队等待，回来后释放。
const _PROVIDER_MAX_CONCURRENCY: Record<string, number> = {
  '硅基流动': 2,
  'siliconflow': 2,
  // 🔥 2026-10-24 实测：智谱免费档并发配额极窄，两次请求几乎同时到达即返回
  //   {"code":1302,"message":"您的账户已达到速率限制，请您控制请求频率"}，
  //   因此并发锁死为 1，并配合下面的最小间隔做串行化。
  '智谱glm': 1,
  'zhipu': 1,
  // 🔥 付费 DeepSeek 是正文并行主模型（一批 5 路并发），并发槽位放宽到 12，避免排队误切模型
  'deepseek': 12,
  '深度求索': 12,
  'openrouter': 4,
}
// 同一 provider 两次出站之间的最小间隔（毫秒）：避免免费档"请求过于频繁"的瞬时打点
const _PROVIDER_MIN_GAP_MS: Record<string, number> = {
  '智谱glm': 4000,
  '硅基流动': 1500,
  'openrouter': 1000,
}
const _PROVIDER_LAST_START: Record<string, number> = {}
const _RATE_LIMIT_DEFAULT_CONCURRENCY = 3
const _PROVIDER_INFLIGHT: Record<string, number> = {}
const _PROVIDER_WAITERS: Record<string, Array<() => void>> = {}

function _maxConcurrency(provider?: string): number {
  const k = _rateLimitProviderKey(provider)
  return _PROVIDER_MAX_CONCURRENCY[k] != null ? _PROVIDER_MAX_CONCURRENCY[k] : _RATE_LIMIT_DEFAULT_CONCURRENCY
}

/** 占用一个并发槽位，返回释放函数（必须在 finally 中调用，避免槽位泄漏） */
async function _acquireProviderConcurrency(provider?: string): Promise<() => void> {
  const noop = function () {}
  if (!_providerRateLimitEnabled) return noop
  if (_rateLimitShouldSkip(provider)) return noop
  const key = _rateLimitProviderKey(provider)
  const max = _maxConcurrency(provider)
  const releaseSlot = function () {
    _PROVIDER_INFLIGHT[key] = Math.max(0, (_PROVIDER_INFLIGHT[key] || 1) - 1)
    const q = _PROVIDER_WAITERS[key]
    if (q && q.length) { const next = q.shift(); if (next) next() }
  }
  if ((_PROVIDER_INFLIGHT[key] || 0) < max) {
    _PROVIDER_INFLIGHT[key] = (_PROVIDER_INFLIGHT[key] || 0) + 1
  } else {
    // 槽位已满：排队，等前一个请求释放（上限 120s，超时直接抛 RATE_LIMIT 让兜底链切模型）
    await new Promise<void>((resolve, reject) => {
      let done = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const grant = function () {
        if (done) return
        done = true
        if (timer) clearTimeout(timer)
        _PROVIDER_INFLIGHT[key] = (_PROVIDER_INFLIGHT[key] || 0) + 1
        resolve()
      }
      if (!_PROVIDER_WAITERS[key]) _PROVIDER_WAITERS[key] = []
      _PROVIDER_WAITERS[key].push(grant)
      timer = setTimeout(function () {
        if (done) return
        done = true
        const q = _PROVIDER_WAITERS[key] || []
        const i = q.indexOf(grant)
        if (i >= 0) q.splice(i, 1)
        reject(new Error('RATE_LIMIT: provider ' + key + ' 并发达上限，切下一模型'))
      }, 120_000)
    })
  }
  // 槽位到手后再执行最小间隔，保证免费档不会出现"两次请求几乎同时打点"
  const gap = _PROVIDER_MIN_GAP_MS[key] || 0
  if (gap > 0) {
    const wait = (_PROVIDER_LAST_START[key] || 0) + gap - Date.now()
    if (wait > 0) await new Promise(function (r) { setTimeout(r, Math.min(wait, gap)) })
  }
  _PROVIDER_LAST_START[key] = Date.now()
  return releaseSlot
}

// 🔥 2026-09-23：按模型（opt-in）速率限制。仅当 LLMConfig 携带 rateLimit 字段时生效，
// 与全局 _providerRateLimitEnabled 完全解耦——不影响其它模型，仅尊重 OpenVeer 等免费中转硬配额
//（10/分、100/时、1200/天），超出则等待或放弃该模型让兜底链切下一模型。
const _MODEL_RATE_LIMIT: Record<string, { minute: number[]; hour: number[]; day: number[] }> = {}
const _MODEL_RL_WINDOW = { minute: 60_000, hour: 3_600_000, day: 86_400_000 }
const _MODEL_RL_WAIT_CAP_MS = 60_000 // 单模型频限最多等 60s，过久则放弃该模型

function _modelRateLimitKey(cfg?: LLMConfig): string {
  if (!cfg) return ''
  return (normalizeProviderName(cfg.provider || '') + '|' + (cfg.model || '')).toLowerCase()
}

async function _acquireModelRateLimit(cfg?: LLMConfig): Promise<void> {
  if (!cfg || !cfg.rateLimit) return
  const rl = cfg.rateLimit
  const key = _modelRateLimitKey(cfg)
  if (!key) return
  if (!_MODEL_RATE_LIMIT[key]) _MODEL_RATE_LIMIT[key] = { minute: [], hour: [], day: [] }
  const b = _MODEL_RATE_LIMIT[key]
  const _clean = function (arr: number[], win: number) {
    const t = Date.now()
    while (arr.length && t - arr[0] > win) arr.shift()
  }
  _clean(b.minute, _MODEL_RL_WINDOW.minute); _clean(b.hour, _MODEL_RL_WINDOW.hour); _clean(b.day, _MODEL_RL_WINDOW.day)
  // 预留本次名额（同步，单线程无 TOCTOU）
  const now = Date.now()
  b.minute.push(now); b.hour.push(now); b.day.push(now)
  const deadline = Date.now() + _MODEL_RL_WAIT_CAP_MS
  while (Date.now() < deadline) {
    const t = Date.now()
    _clean(b.minute, _MODEL_RL_WINDOW.minute); _clean(b.hour, _MODEL_RL_WINDOW.hour); _clean(b.day, _MODEL_RL_WINDOW.day)
    const overMin = rl.perMinute != null && b.minute.length > rl.perMinute
    const overHour = rl.perHour != null && b.hour.length > rl.perHour
    const overDay = rl.perDay != null && b.day.length > rl.perDay
    if (!overMin && !overHour && !overDay) return
    const waits: number[] = []
    if (overMin && b.minute.length) waits.push(b.minute[0] + _MODEL_RL_WINDOW.minute - t)
    if (overHour && b.hour.length) waits.push(b.hour[0] + _MODEL_RL_WINDOW.hour - t)
    if (overDay && b.day.length) waits.push(b.day[0] + _MODEL_RL_WINDOW.day - t)
    const wait = Math.max(0, Math.min.apply(null, waits))
    if (wait > 0) {
      if (wait > _MODEL_RL_WAIT_CAP_MS) {
        b.minute.pop(); b.hour.pop(); b.day.pop()
        throw new Error('RATE_LIMIT: model ' + key + ' 频限超额，切下一模型')
      }
      await new Promise(function (r) { setTimeout(r, Math.min(wait, 1000)) })
    }
  }
  // 兜底放行（避免永久阻塞），仅可能超限 1 笔，由 429 冷却兜底
}

// 🔥 2026-11-05 多 Key 轮询：apiKey 支持逗号/分号/换行分隔的多个 Key（同一 provider 多账号），
//   进程内 round-robin 轮换——配额按 Key 计费时，N 个 Key ≈ N 倍配额。
var _multiKeyRR: Record<string, number> = {}
function _pickMultiKeyRoundRobin(rawKey: string, provider: string, model: string): string {
  const parts = String(rawKey || '').split(/[,;\n]+/).map(function (s) { return s.trim() }).filter(function (s) { return s.length > 8 })
  if (parts.length <= 1) return rawKey
  const k = provider + '::' + model
  const idx = (_multiKeyRR[k] = ((_multiKeyRR[k] || 0) + 1)) % parts.length
  return parts[idx]
}
export async function callLLM(config: LLMConfig, messages: LLMMessage[], opts?: { maxTokens?: number; timeoutMs?: number; temperature?: number; topP?: number; presencePenalty?: number; frequencyPenalty?: number; step?: string }): Promise<string> {
  const { baseUrl, model } = config
  const apiKey = _pickMultiKeyRoundRobin(config.apiKey, normalizeProviderName(config.provider), model)
  const provider = normalizeProviderName(config.provider)

  // 🔥 全局按提供商限流闸门：免费档 SaaS 必须，所有出站请求统一在此排队（覆盖 base/fallback/跨平台/重试/跨步）
  await _acquireProviderRateLimit(provider)
  // 🔥 2026-09-23：opt-in 按模型频率限制（仅 OpenVeer 等配置了 rateLimit 的模型）
  await _acquireModelRateLimit(config)

  const maxTokens = opts?.maxTokens ?? 4096
  const __isJsonLlm = (() => {
    for (let __i = 0; __i < messages.length; __i++) {
      const __c = typeof messages[__i].content === 'string' ? messages[__i].content : ''
      if (__c.indexOf('JSON格式') !== -1 || __c.indexOf('仅返回JSON') !== -1 || __c.indexOf('只输出JSON') !== -1 || __c.indexOf('纯净标准JSON') !== -1 || __c.indexOf('输出JSON only') !== -1 || __c.indexOf('角色生成铁律') !== -1 || __c.indexOf('角色人数配置') !== -1) return true
    }
    return false
  })()
  // 🔥 2026-08-11：免费档模型在高并发下易 429/超时，fallback 链不宜单模型过长时间挂起。
  //   JSON-LLM 步单模型超时从 180s 降至 120s：成功则快，失败则快速切下一模型，避免
  //   整条 fallback 链（同平台→跨平台→Ollama）累计超时拖垮请求。
  const timeoutMs = opts?.timeoutMs ?? (__isJsonLlm ? 120000 : 90000)
  const temperature = opts?.temperature ?? 0.55
  const topP = opts?.topP ?? 0.75
  const presencePenalty = opts?.presencePenalty ?? 1.0
  const frequencyPenalty = opts?.frequencyPenalty ?? 1.0

  // 🔥 限流保护：调用前检查连续报错情况，自动休眠
  const modelId = _resolveModelIdFromConfig(config)
  try { await maybeSleepForRateLimit(modelId) } catch (_e) {}

  // 确定API地址 - 清理可能的反引号、引号等特殊字符
  let apiUrl = (baseUrl || '').replace(/[`'"]/g, '').trim()

  // 特殊处理：Claude 使用不同的API格式
  if (provider === 'claude' || provider === 'Claude (Anthropic)') {
    apiUrl = apiUrl || 'https://api.anthropic.com/v1/messages'
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-3-5-sonnet-20241022',
        messages,
        max_tokens: maxTokens,
        temperature: temperature,
        top_p: topP,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(`Claude API错误: ${data.error?.message || response.status}`)
    return data.content?.[0]?.text || ''
  }

  // 特殊处理：文心一言
  if (provider === 'wenxin' || provider === '文心一言 (百度)') {
    apiUrl = (apiUrl || 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions') + `?access_token=${apiKey}`
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, temperature, top_p: topP, frequency_penalty: frequencyPenalty, presence_penalty: presencePenalty }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(`文心一言API错误: ${data.error_msg || response.status}`)
    return data.result || ''
  }

  // 其他所有模型使用 OpenAI 兼容格式

  // 特殊处理：Ollama 本地部署使用 /api/chat 格式
  const isOllama = provider === 'Ollama (本地)' || provider === 'Ollama' || apiUrl.includes('localhost:11434') || apiUrl.includes('ollama')
  if (isOllama) {
    console.log('[Ollama] 检测到Ollama配置:', { provider, apiUrl, model })
    apiUrl = apiUrl || 'http://localhost:11434'
    if (!apiUrl.startsWith('http')) {
      apiUrl = 'http://' + apiUrl
    }
    apiUrl = apiUrl.replace(/\/v1\/?$/, '')
    console.log('[Ollama] 最终API地址:', apiUrl + '/api/chat')
    const response = await fetch(apiUrl + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages,
        stream: false,
        options: {
          temperature: temperature,
          top_p: topP,
          num_predict: maxTokens,
          // 🔥 #226P：Ollama 本地回落模型同样施加抗重复惩罚（主模型 glm-4-flash 已在 OpenAI body 透传，此处补齐回落护栏）
          frequency_penalty: (typeof frequencyPenalty === 'number' ? frequencyPenalty : 0.6),
          presence_penalty: (typeof presencePenalty === 'number' ? presencePenalty : 0.4),
          // 🔥 2026-08-10：deepseek-r1 在正文步关闭 thinking，避免推理链吃掉正文 token 预算
          ...((/deepseek-r1|r1:/i.test(model) && opts?.step === 'content') ? { think: false } : {}),
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama API错误 (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    // 🔥 2026-10-25 T6：本地推理模型同样可能把正文落在 reasoning
    return String(data?.message?.content || data?.message?.reasoning || '')
  }

  if (!apiUrl) throw new Error('未配置API地址')

  // 根据提供商选择不同的认证方式
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const bodyObj: any = {
    model: model || 'default',
    messages,
    temperature: temperature,
    max_tokens: maxTokens,
    top_p: topP,
    frequency_penalty: frequencyPenalty,
    presence_penalty: presencePenalty,
  }
  // 🔥🔥🔥 P0 修复（2026-08-23）：DeepSeek-V4-Flash 等带推理的模型在复杂提示下会先把"思考/分析链"
  //   输出成 content（占满 max_tokens），导致 JSON 从未输出/被截断 → "Failed to parse JSON"。
  //   实测 `thinking:{type:'disabled'}` 可直接关闭推理：① JSON 一步到位 ② 省去 reasoning token 成本
  //   ③ 高量正文不再为思考付费。仅对 DeepSeek 系模型启用（其他 provider 不受影响）。
  if (/deepseek/i.test(model || '')) {
    bodyObj.thinking = { type: 'disabled' }
    console.log('[callLLM] DeepSeek 已禁用 thinking(推理)：' + model)
  }
  // 🔥 #194（2026-09-08）：sensenova-6.8 同为推理模型（思考在 message.reasoning 字段）。
  //   带思考时对"字数守恒"类提示会数数螺旋（reasoning 2万+字符、单次 ~100s），关后 ~7s 出全量。
  if (/sensenova/i.test(model || '')) {
    bodyObj.thinking = { type: 'disabled' }
    console.log('[callLLM] sensenova 已禁用 thinking(推理)：' + model)
  }
  // 🔥 2026-10-22：Qwen3 系过 thinking 时 reasoning tokens 挤占 max_tokens，
  //   实测节拍表 JSON 在第1场 hook 处被截断（可见输出 ~400 字 vs maxTokens 3200）。
  //   引擎内容型调用（step==='content'）禁用 thinking：JSON 一步到位、正文不再为思考付费。
  if (/qwen3/i.test(model || '') && opts?.step === 'content') {
    bodyObj.enable_thinking = false
    console.log('[callLLM] Qwen3 已禁用 thinking(推理)：' + model)
  }
  // 🔥 2026-10-29 P0：智谱 glm 系在 content 步会先把「1. 分析需求 / 解决矛盾 / 起草策略 /
  //   感官与情绪检查」这类构思稿写进正文：① 吃掉 max_tokens → 正文只剩 ~900 字
  //   ② 污染正文首段（实测 ch1 输出 2131 字，前 11 段全是构思，正文从第 12 段才开始）。
  //   在最后一条消息尾部追加硬禁止条文（不改任何创作要求，只禁构思/标记输出）。
  if (opts?.step === 'content' && /glm/i.test(model || '')) {
    const GLM_PROSE_GUARD = '\n\n【输出铁律·最高优先级】只输出小说正文本身，从第一句叙事开始。严禁输出任何分析、构思、提纲、节拍、起草策略、“分析需求”“解决矛盾”“感官与情绪检查”、字数统计或自我检查；严禁用 * 、# 、数字编号分条罗列；严禁在末尾单独标注节拍名（如“峰回路转”“高潮”）；严禁写任何括注批注（如“（开篇3行内切入冲突）”“（首段冲突：…）”“（主角博弈25%）”）。直接写正文。'
    const _msgs = Array.isArray(messages) ? messages.slice() : []
    if (_msgs.length) {
      const _li = _msgs.length - 1
      _msgs[_li] = { ..._msgs[_li], content: String(_msgs[_li].content || '') + GLM_PROSE_GUARD }
      bodyObj.messages = _msgs
    }
    console.log('[callLLM] glm 正文步已追加禁构思护栏：' + model)
  }
  const requestBody = JSON.stringify(bodyObj)

  if (provider === '讯飞星火') {
    // xfyun MAAS v2 API requires HMAC-SHA256 signing
    // API Key format: appid:apikey:secret
    const keyParts = apiKey.split(':')
    const appid = keyParts[0] || ''
    const apikey = keyParts[1] || ''
    const secret = keyParts[2] || apikey // Use secret if available, else apikey
    
    const urlObj = new URL(apiUrl)
    const hostname = urlObj.hostname
    const pathname = urlObj.pathname + '/chat/completions'
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const bodyHash = crypto.createHash('sha256').update(requestBody).digest('base64')
    const stringToSign = `POST\n${pathname}\n${timestamp}\n${bodyHash}\nhost:${hostname}`
    
    const signature = crypto.createHmac('sha256', secret)
      .update(stringToSign)
      .digest('base64')
    
    headers['Authorization'] = `HMAC-SHA256 Credential=${appid}/${apikey}, SignedHeaders=host;content-type, Signature=${signature}`
    headers['Host'] = hostname
    headers['X-Timestamp'] = timestamp
  } else if (provider === '硅基流动') {
    headers['Authorization'] = 'Bearer ' + apiKey
  } else {
    headers['Authorization'] = 'Bearer ' + apiKey
  }
  
  console.log('[callLLM] 调用: ' + model + ' | ' + provider + ' | timeout=' + timeoutMs + 'ms | temp=' + temperature + ' | topP=' + topP + ' | maxTokens=' + maxTokens + ' | presencePenalty=' + presencePenalty + ' | frequencyPenalty=' + frequencyPenalty)

  // 🔥 统一硅基模型接口参数（修复 v4 C8：使用 opts 传入的参数模板值）
  // 🔥 2026-10-24：占一个 provider 并发槽位，避免免费档并发配额被打穿（"账户已达到速率限制"）
  const _releaseSlot = await _acquireProviderConcurrency(provider)
  let response: Response
  try {
    response = await fetch(apiUrl + '/chat/completions', {
      method: 'POST',
      headers,
      body: requestBody,
      // 🔥 2026-10-28：关闭 undici 默认 300s bodyTimeout/headersTimeout，避免慢速但存活的模型
      //   流式响应在 300s 被网关式掐断成 fetch failed（看似超时实为 undici 硬限）。真正的请求
      //   截止由 signal:AbortSignal.timeout(timeoutMs) 控制（content 步 200–300s，引擎总预算 28min）。
      bodyTimeout: 0,
      headersTimeout: 0,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (fetchErr: unknown) {
    _releaseSlot()
    // 区分超时错误和网络错误
    const errName = fetchErr instanceof Error ? fetchErr.name : String(fetchErr)
    const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    if (errName === 'TimeoutError' || errName === 'AbortError') {
      console.error('[callLLM] 请求超时 (' + timeoutMs + 'ms): ' + model)
      throw new Error('TIMEOUT: 模型 ' + model + ' 响应超时（' + (timeoutMs / 1000) + '秒）')
    }
    console.error('[callLLM] 网络错误: ' + (errMsg || fetchErr))
    throw new Error('NETWORK_ERROR: ' + (errMsg || '网络请求失败'))
  }
  _releaseSlot()

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[callLLM] HTTP ' + response.status + ': ' + model + ' | ' + errorText.substring(0, 300))
    // 区分认证错误、模型不存在、配额不足等
    if (response.status === 401 || response.status === 403) {
      throw new Error('AUTH_ERROR: API Key无效或权限不足 (' + response.status + ')')
    }
    if (response.status === 404) {
      throw new Error('MODEL_NOT_FOUND: 模型 ' + model + ' 不存在或已下线')
    }
    // 🔥 2026-10-24：免费档的限流不一定用 429 返回——智谱 code 1305 有时挂在 400/500 body 里，
    //   硅基流动也用非标准状态码。这里统一按错误文案识别，命中即登记 provider 冷却并切模型兜底，
    //   避免把"您的账户已达到速率限制，请您控制请求频率"原样抛给用户。
    const _hitRateLimit = response.status === 429 ||
      /1305|速率限制|rate[\s_-]?limit|too many requests|请求过于频繁|访问量过大|控制请求频率/i.test(errorText)
    if (_hitRateLimit) {
      // 尊重服务端 retryAfter（硅基流动/SiliconFlow 在 429 body 里带 retryAfter，单位秒），用于退避
      let _retryAfter = 0
      try {
        const _et = JSON.parse(errorText)
        if (_et && _et.retryAfter) _retryAfter = Number(_et.retryAfter) || 0
        else if (_et && _et.error && _et.error.message && /retry after (\d+)/i.test(_et.error.message)) {
          _retryAfter = Number(RegExp.$1) || 0
        }
      } catch {}
      // 🔥 全局限流：登记冷却，后续同 provider 请求自动顺延（根治重试螺旋）
      _registerRateLimitCooldown(provider, _retryAfter)
      const _err: any = new Error('RATE_LIMIT: 请求频率过高，请稍后重试')
      _err.retryAfter = _retryAfter
      throw _err
    }
    throw new Error('API_ERROR(' + response.status + '): ' + errorText.substring(0, 200))
  }

  // 先读取完整响应内容
  const rawText = await response.text()
  console.log('[callLLM] 原始响应 (前500字符): ' + rawText.substring(0, 500))

  let data
  try {
    data = JSON.parse(rawText)
  } catch (jsonError) {
    console.error('[callLLM] JSON解析失败: ' + jsonError)
    console.error('[callLLM] 原始响应: ' + rawText.substring(0, 500))
    throw new Error('API返回的不是有效JSON: ' + rawText.substring(0, 200))
  }
  
  // 🔥 2026-10-24：部分免费档限流走 HTTP 200 + {"error":{...code:1305...}}，
  //   此前会落到"API返回内容为空"原样抛给用户。这里先识别，统一转成 RATE_LIMIT 并登记冷却。
  if (data && data.error) {
    const _errText = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
    if (/1305|速率限制|rate[\s_-]?limit|too many requests|请求过于频繁|访问量过大|控制请求频率/i.test(_errText)) {
      _registerRateLimitCooldown(provider, data.error.retryAfter)
      throw new Error('RATE_LIMIT: 请求频率过高，请稍后重试')
    }
  }

  // 🔥 2026-10-25 T6：统一正文抽取（oh-story/model-response）——优先 message.content；为空回退
  //   message.reasoning（商汤 SenseNova 实测正文落该字段：content=0 / reasoning=411）与
  //   message.reasoning_content（DeepSeek/astron 等）；并剥离  thinking 段与推理前言。
  const _mx = extractModelText(data)
  const content = _mx.text
  if (_mx.text && (_mx.source !== 'content' || _mx.stripped)) {
    console.log('[callLLM] 正文抽取(' + describeModelText(_mx) + ')')
  }
  if (!content) {
    // 🔥 2026-08-29 重推理模型（sensenova-6.8-flash-lite 等）会在隐藏思维链上吃掉绝大部分 max_tokens 预算，
    //   导致 content 被截断成空、finish_reason='length'。此时【一次性】把 max_tokens 提到足够大重试同一模型即可，
    //   不做多轮叠加，以免单步总耗时超过 nginx 600s 代理超时被网关掐成 504。
    const _finish0 = data.choices?.[0]?.finish_reason
    if (_finish0 === 'length') {
      const _mtBig = Math.max(8000, Math.min((maxTokens && maxTokens > 0 ? maxTokens : 2000) * 4, 12000))
      try {
        const _body2 = JSON.stringify({
          model: model || 'default', messages, temperature,
          max_tokens: _mtBig, top_p: topP,
          frequency_penalty: frequencyPenalty, presence_penalty: presencePenalty,
        })
        const _r2 = await fetch(apiUrl + '/chat/completions', {
          method: 'POST', headers, body: _body2, bodyTimeout: 0, headersTimeout: 0, signal: AbortSignal.timeout(timeoutMs),
        })
        if (_r2.ok) {
          const _j2 = JSON.parse(await _r2.text())
          const _mx2 = extractModelText(_j2)
          const _final = _mx2.text
          if (_final.trim().length > 0) {
            console.log('[callLLM] 空内容(finish=length)→一次性放大max_tokens至' + _mtBig + '重试成功 (finish=' + (_j2.choices?.[0]?.finish_reason) + ', completion_tokens=' + (_j2.usage?.completion_tokens || '?') + ')')
            return _final
          }
        }
      } catch (_e2) { /* 单次重试失败则走原有换模型兜底 */ }
    }
    console.error('[callLLM] API返回内容为空: ' + JSON.stringify(data))
    throw new Error('API返回内容为空')
  }
  
  // 🔥 2026-10-16 非空半句截断兜底：finish_reason==='length' 且 content 非空时，
  //   一次性放大 max_tokens 重试同一模型。此前该兜底仅在 content 为空时触发，
  //   导致「写到一半被截断」的半句稿（如"…你也不过是一"）直接落库、无人补救。
  const _finishTrunc = data.choices?.[0]?.finish_reason
  if (_finishTrunc === 'length' && typeof content === 'string' && content.trim().length > 0) {
    try {
      const _mtBigT = Math.max(8000, Math.min(((maxTokens && maxTokens > 0) ? maxTokens : 2000) * 4, 16000))
      const _bodyT = JSON.stringify({
        model: model || 'default', messages, temperature,
        max_tokens: _mtBigT, top_p: topP,
        frequency_penalty: frequencyPenalty, presence_penalty: presencePenalty,
      })
      const _rT = await fetch(apiUrl + '/chat/completions', {
        method: 'POST', headers, body: _bodyT, bodyTimeout: 0, headersTimeout: 0, signal: AbortSignal.timeout(timeoutMs),
      })
      if (_rT.ok) {
        const _jT = JSON.parse(await _rT.text())
        const _cT = extractModelText(_jT).text
        if (_cT && String(_cT).trim().length > String(content).trim().length) {
          console.log('[callLLM] 半句截断(finish=length)→放大max_tokens至' + _mtBigT + '重试成功 (completion_tokens=' + (_jT.usage?.completion_tokens || '?') + ')')
          return String(_cT)
        }
      }
    } catch (_eT) { /* 放大重试失败则返回原截断稿，交由上层续写/重写兜底 */ }
  }
  
  return content
}

// 从请求中获取LLM配置（API路由使用）
export function getLLMConfigFromRequest(request: Request): LLMConfig | null {
  // 优先从header获取
  const configHeader = request.headers.get('x-llm-config')
  if (configHeader) {
    try { return JSON.parse(configHeader) } catch {}
  }

  // 其次从body获取（需要在调用方传入）
  return null
}

// 硅基流动免费模型配置（2026年8月）全部9B及以下，永久免费不限量
// 验证通过的7款免费模型，覆盖小说创作全场景（全部无Token消耗）
const _SF_API_KEY = process.env.SILICONFLOW_API_KEY || ''
const _SF_BASE_URL = 'https://api.siliconflow.cn/v1'
// 🔥 2026-08-22 实测收敛：仅保留【确认可用且快】的免费模型，杜绝超时/空值。
//   实测结果（同管理员Key直连诊断）：
//     ✅ Qwen/Qwen2.5-7B-Instruct / THUDM/GLM-4-9B-0414 / THUDM/GLM-Z1-9B-0414 均秒回
//     ❌ Qwen/Qwen3-8B(超时) / tencent/Hunyuan-MT-7B(超时) / Qwen/Qwen3.5-4B(返回空串→空值)
//     ❌ THUDM/glm-4-9b-chat(403 Model disabled)
//   全环节路由已统一到 3 款可用模型；Qwen3-8B/3.5-4B/Hunyuan 从池中彻底移除，避免兜底链浪费超时。
export const SILICONFLOW_MODELS: LLMConfig[] = [
  // 正文/灵感主力（7B，实测可用）永久免费
  { provider: '硅基流动', apiKey: _SF_API_KEY, baseUrl: _SF_BASE_URL, model: 'Qwen/Qwen2.5-7B-Instruct' },
  // GLM系列（长文本/复杂剧情，实测可用）永久免费
  { provider: '硅基流动', apiKey: _SF_API_KEY, baseUrl: _SF_BASE_URL, model: 'THUDM/GLM-4-9B-0414' },
  { provider: '硅基流动', apiKey: _SF_API_KEY, baseUrl: _SF_BASE_URL, model: 'THUDM/GLM-Z1-9B-0414' },
  // 封面绘图
  { provider: '硅基流动', apiKey: _SF_API_KEY, baseUrl: _SF_BASE_URL, model: 'Kwai-Kolors/Kolors' },
]

// 智谱 BigModel 免费模型配置（2026年8月新增 3 款）
// 与硅基流动 7 款共同组成 10 模型池，按环节最优选择 + 兜底。
const _ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || ''
const _ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
export const ZHIPU_MODELS: LLMConfig[] = [
  { provider: '智谱GLM', apiKey: _ZHIPU_API_KEY, baseUrl: _ZHIPU_BASE_URL, model: 'glm-4.7-flash' },
  { provider: '智谱GLM', apiKey: _ZHIPU_API_KEY, baseUrl: _ZHIPU_BASE_URL, model: 'glm-z1-flash' },
  { provider: '智谱GLM', apiKey: _ZHIPU_API_KEY, baseUrl: _ZHIPU_BASE_URL, model: 'glm-4-flash' },
]

// 讯飞星辰模型配置（已停用，账号套餐失效；用户明确要求删除，不再调用）
// 保留空数组以兼容旧代码，但兜底链中不会添加任何讯飞模型。
export const XFYUN_MODELS: LLMConfig[] = []

// 模型名称映射：UI名称 → API实际模型名（Spark-X2-Flash = astron-code-latest）
const MODEL_NAME_MAP: Record<string, string> = {
  'spark-x2-flash': 'astron-code-latest',
  'Spark-X2-Flash': 'astron-code-latest',
  'astron-code-latest': 'astron-code-latest',
}

// 模型对应的正确baseUrl映射
const MODEL_BASE_URL_MAP: Record<string, string> = {
  'astron-code-latest': 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2',
  'Spark-X2-Flash': 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2',
  'spark-lite': 'https://spark-api-open.xf-yun.com/v1',
  'spark-pro': 'https://spark-api-open.xf-yun.com/v1',
  'spark-max': 'https://spark-api-open.xf-yun.com/v1',
}

// 提供商名称规范化：支持中英文、大小写不敏感匹配、带括号后缀
function normalizeProviderName(name: string): string {
  // 先去掉括号及括号内内容（如 "硅基流动 (SiliconFlow)" → "硅基流动"）
  const cleaned = name.replace(/\s*\([^)]*\)\s*/g, '').trim()
  const lower = cleaned.toLowerCase()
  const providerMap: Record<string, string> = {
    'xunfei': '讯飞星火',
    '讯飞星火': '讯飞星火',
    'xfyun': '讯飞星火',
    '讯飞星辰': '讯飞星火',
    'siliconflow': '硅基流动',
    '硅基流动': '硅基流动',
    'silicon': '硅基流动',
    // 智谱 BigModel 规范化：统一识别为“智谱GLM”
    '智谱': '智谱GLM',
    '智谱ai': '智谱GLM',
    'zhipu': '智谱GLM',
    'bigmodel': '智谱GLM',
    '智谱glm': '智谱GLM',
    // 通用OpenAI兼容供应商：如果baseUrl是硅基流动的地址，按硅基流动处理
    'openai': '硅基流动',  // 大多数情况下实际调用的都是硅基流动API
    'custom': '硅基流动',
  }
  return providerMap[lower] || cleaned
}

// 多模型配置列表
// 基于2026-06-08实际API验证 —— 当前4款轻量模型搭配，多级回退保障可用性：
// - Qwen/Qwen3-0.6B: 第一优先级，轻量快速
// - Qwen/Qwen2-1.5B: 第二优先级，中文写作
// - Llama3.2-1B-Instruct: 第三优先级
// - Phi-3.5-mini-instruct: 第四优先级
// - Spark-X2-Flash: 极速推理（讯飞星辰）→ 角色生成
//
// 注意：这些配置只包含模型信息，API Key会在调用时从用户配置中获取
export const MULTI_MODEL_CONFIG: LLMConfig[] = [
  ...SILICONFLOW_MODELS,
  ...ZHIPU_MODELS,
  // 讯飞已停用，用户明确要求删除，不加入兜底池
  ...XFYUN_MODELS,
]

// 按模块分配的模型推荐（全部使用硅基流动/智谱免费模型）
// ⚠️ 2026-08-23：移除全部付费模型引用（原 Qwen/Qwen3.6-35B-A3B 为付费档，不在白名单），
//   统一收敛到已在白名单内的永久免费模型，避免任何误调用付费模型的可能。
export const MODEL_RECOMMENDATIONS = {
  writing: {
    storyContent: 'Qwen/Qwen2.5-7B-Instruct',
    synopsis: 'glm-4-flash',
    ideaGeneration: 'THUDM/GLM-4-9B-0414',
    characters: 'glm-4-flash',
  },
  structure: {
    worldbuilding: 'glm-4-flash',
    factions: 'glm-4-flash',
    checklist: 'Qwen/Qwen2.5-7B-Instruct',
    powerSystem: 'THUDM/GLM-4-9B-0414',
    relationships: 'glm-4-flash',
  },
  logic: {
    imitate: 'THUDM/GLM-4-9B-0414',
    outline: 'THUDM/GLM-4-9B-0414',
    keyPlots: 'THUDM/GLM-4-9B-0414',
    chapters: 'THUDM/GLM-4-9B-0414',
  },
  fallback: 'THUDM/GLM-4-9B-0414',
}

// ============================================================
// 🔥🔥🔥 途中文枢全模型注册表（2026年8月）硅基流动免费模型全覆盖
// 7款永久免费模型（9B及以下），覆盖正文/大纲/权谋/角色/封面全场景
// ============================================================

export type TaskType = 'content' | 'outline' | 'schemer_war' | 'cover'

export interface ModelParamSet {
  temperature: number
  topP: number
  maxTokens: number
  presencePenalty: number
  frequencyPenalty: number
}

export interface ModelEntry {
  id: string
  displayName: string
  provider: string
  model: string
  baseUrl: string
  isImageModel?: boolean
  params?: Partial<ModelParamSet>
}

// ------ 全量注册表（全部硅基流动9B以下永久免费模型） ------
export const ROUTE_MODEL_REGISTRY: Record<string, ModelEntry> = {
  // ======== 正文创作主力（7B/9B） ========
  'sf-qwen25-7b': {
    id: 'sf-qwen25-7b',
    displayName: 'Qwen2.5-7B-Instruct（正文主力）',
    provider: '硅基流动',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    baseUrl: 'https://api.siliconflow.cn/v1',
  },
  'sf-qwen3-8b': {
    id: 'sf-qwen3-8b',
    displayName: 'Qwen3-8B（综合备用）',
    provider: '硅基流动',
    model: 'Qwen/Qwen3-8B',
    baseUrl: 'https://api.siliconflow.cn/v1',
  },
  // ======== GLM系列（长文本/复杂剧情/权谋） ========
  'sf-glm4-9b': {
    id: 'sf-glm4-9b',
    displayName: 'GLM-4-9B-0414（大纲权谋主力）',
    provider: '硅基流动',
    model: 'THUDM/GLM-4-9B-0414',
    baseUrl: 'https://api.siliconflow.cn/v1',
  },
  'sf-glmz1-9b': {
    id: 'sf-glmz1-9b',
    displayName: 'GLM-Z1-9B-0414（角色推理）',
    provider: '硅基流动',
    model: 'THUDM/GLM-Z1-9B-0414',
    baseUrl: 'https://api.siliconflow.cn/v1',
  },
  // ======== 轻量备用 ========
  'sf-qwen35-4b': {
    id: 'sf-qwen35-4b',
    displayName: 'Qwen3.5-4B（极速轻量）',
    provider: '硅基流动',
    model: 'Qwen/Qwen3.5-4B',
    baseUrl: 'https://api.siliconflow.cn/v1',
  },
  'sf-hunyuan-7b': {
    id: 'sf-hunyuan-7b',
    displayName: 'Hunyuan-MT-7B（翻译/润色）',
    provider: '硅基流动',
    model: 'tencent/Hunyuan-MT-7B',
    baseUrl: 'https://api.siliconflow.cn/v1',
  },
  // ======== 封面绘图 ========
  'sf-kolors': {
    id: 'sf-kolors',
    displayName: 'Kwai-Kolors/Kolors（封面绘图）',
    provider: '硅基流动',
    model: 'Kwai-Kolors/Kolors',
    baseUrl: 'https://api.siliconflow.cn/v1',
    isImageModel: true,
  },
}

// ------ 4任务 ↔ 模型参数模板 ------
// 🔥 outline maxTokens从4000提升到16000：角色生成(characters)需要输出20+角色的大JSON
export const TASK_PARAM_TEMPLATES: Record<TaskType, ModelParamSet> = {
  content: {
    temperature: 0.63, topP: 0.74, maxTokens: 3000,
    presencePenalty: 1.02, frequencyPenalty: 1.03,
  },
  outline: {
    temperature: 0.40, topP: 0.60, maxTokens: 16000,
    presencePenalty: 1.00, frequencyPenalty: 1.00,
  },
  schemer_war: {
    temperature: 0.55, topP: 0.70, maxTokens: 3000,
    presencePenalty: 1.05, frequencyPenalty: 1.04,
  },
  cover: {
    temperature: 0.63, topP: 0.74, maxTokens: 1000,
    presencePenalty: 1.02, frequencyPenalty: 1.03,
  },
}

// ------ 4任务 ↔ 首选/降级映射表（核心路由） ------
// 讯飞星火已停用，全部使用硅基流动9B以下永久免费模型
export const TASK_ROUTE_MAP: Record<TaskType, { primaryModelId: string; fallbackModelId: string; systemPromptHint?: string }> = {
  content: {
    primaryModelId: 'sf-glm4-9b',
    fallbackModelId: 'sf-glmz1-9b',
    systemPromptHint: '正文写作：场景叙事、人物对白、环境描写，节奏紧凑爽点密集',
  },
  outline: {
    primaryModelId: 'sf-glm4-9b',
    fallbackModelId: 'sf-glmz1-9b',
    systemPromptHint: '大纲策划：世界观搭建、分卷规划、势力推演、时间线梳理，逻辑严谨结构完整',
  },
  schemer_war: {
    primaryModelId: 'sf-glm4-9b',
    fallbackModelId: 'sf-glmz1-9b',
    systemPromptHint: '权谋战争：朝堂博弈、军政谈判、大型战役，智力交锋节奏紧张',
  },
  cover: {
    primaryModelId: 'sf-kolors',
    fallbackModelId: 'sf-kolors',
    systemPromptHint: '封面绘图：直接调用 Kwai-Kolors 图像生成模型，完全免费无限制',
  },
}

// ------ 旧步骤名 → 新TaskType映射（兼容getStepLlmConfig） ------
// 🔥 角色生成(characters)改用outline任务，绑定Qwen3.6-35B大模型，而非content的Spark-X2小模型
// 角色生成需要生成20+完整JSON，必须使用参数更大、理解能力更强的35B大模型
export const STEP_TO_TASK_TYPE: Record<string, TaskType> = {
  idea: 'outline',
  synopsis: 'outline',
  outline: 'outline',
  worldbuilding: 'outline',
  powerSystem: 'outline',
  factions: 'outline',
  characters: 'outline',
  relationships: 'outline',
  keyPlots: 'outline',
  chapters: 'content',
  cover: 'cover',
  imitate: 'outline',
  default: 'content',
}

// ------ 硅基流动白名单（防止误调用付费版模型产生账单） ------
// 2026年8月更新：仅保留7款永久免费模型（9B及以下），收费模型全部移除
export const SILICONFLOW_MODEL_WHITELIST: Set<string> = new Set([
  // 正文创作主力（7B/9B）永久免费
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen3-8B',
  // GLM系列（长文本/复杂剧情/权谋）永久免费
  'THUDM/GLM-4-9B-0414',
  'THUDM/GLM-Z1-9B-0414',
  // 轻量备用永久免费
  'Qwen/Qwen3.5-4B',
  'tencent/Hunyuan-MT-7B',
  // 封面绘图完全免费
  'Kwai-Kolors/Kolors',
  // 旧版白名单保留（兼容历史调用记录，均为免费模型）
  'Qwen/Qwen3-0.6B',
  'Qwen/Qwen2-1.5B',
  'Llama3.2-1B-Instruct',
  'Phi-3.5-mini-instruct',
  'Llama3.2-3B-Instruct',
  'Phi-3-mini-4k-instruct',
  'Qwen/Qwen3-1.8B',
  'THUDM/glm-4-9b-chat',
])

// ------ 省钱模式读取（localStorage + URL参数双重读取，服务端兜底false） ------
export function isCostSavingMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const urlParam = new URLSearchParams(window.location.search).get('cheapMode')
    if (urlParam === '1' || urlParam === 'true') return true
    const saved = localStorage.getItem('tuzhong-cost-saving-mode')
    return saved === 'true'
  } catch (_e) {
    return false
  }
}

// ------ 连续报错计数器 & 限流保护（进程内共享） ------
const _consecutiveErrorMap: Record<string, { count: number; lastErrorAt: number }> = {}
const SF_GLOBAL_ERROR_KEY = '__siliconflow_global__'

export function markModelError(modelId: string): void {
  const now = Date.now()
  if (!_consecutiveErrorMap[modelId]) {
    _consecutiveErrorMap[modelId] = { count: 0, lastErrorAt: now }
  }
  _consecutiveErrorMap[modelId].count += 1
  _consecutiveErrorMap[modelId].lastErrorAt = now
  if (modelId.startsWith('sf-')) {
    if (!_consecutiveErrorMap[SF_GLOBAL_ERROR_KEY]) {
      _consecutiveErrorMap[SF_GLOBAL_ERROR_KEY] = { count: 0, lastErrorAt: now }
    }
    _consecutiveErrorMap[SF_GLOBAL_ERROR_KEY].count += 1
    _consecutiveErrorMap[SF_GLOBAL_ERROR_KEY].lastErrorAt = now
  }
}

export function markModelSuccess(modelId: string): void {
  if (_consecutiveErrorMap[modelId]) {
    _consecutiveErrorMap[modelId].count = 0
  }
  if (modelId.startsWith('sf-') && _consecutiveErrorMap[SF_GLOBAL_ERROR_KEY]) {
    _consecutiveErrorMap[SF_GLOBAL_ERROR_KEY].count = 0
  }
}

export async function maybeSleepForRateLimit(modelId: string): Promise<void> {
  const info = _consecutiveErrorMap[modelId]
  const globalInfo = modelId.startsWith('sf-') ? _consecutiveErrorMap[SF_GLOBAL_ERROR_KEY] : null
  const errCount = Math.max(info?.count || 0, globalInfo?.count || 0)
  if (errCount >= 3) {
    const sleepMs = Math.min(3000, 500 * errCount)
    console.log('[限流保护] 模型 ' + modelId + ' 连续报错' + errCount + '次，休眠 ' + sleepMs + 'ms')
    await new Promise(function(res) { setTimeout(res, sleepMs) })
  }
}

// ------ 核心：根据TaskType构建路由配置（首选/降级/省钱模式/白名单） ------
export function buildTaskRoute(
  taskType: TaskType,
  userConfig?: LLMConfig | null,
  overrideCostSaving?: boolean
): { primary: LLMConfig; fallback: LLMConfig; params: ModelParamSet; taskType: TaskType } {
  const route = TASK_ROUTE_MAP[taskType] || TASK_ROUTE_MAP.content
  const params = TASK_PARAM_TEMPLATES[taskType] || TASK_PARAM_TEMPLATES.content
  const cheapMode = typeof overrideCostSaving === 'boolean' ? overrideCostSaving : isCostSavingMode()

  let primaryEntry: ModelEntry
  let fallbackEntry: ModelEntry

  if (cheapMode) {
    primaryEntry = ROUTE_MODEL_REGISTRY[route.fallbackModelId]
    fallbackEntry = ROUTE_MODEL_REGISTRY[route.fallbackModelId]
    console.log('[路由调度] 省钱模式开启，任务=' + taskType + '，强制使用硅基免费模型: ' + primaryEntry.model)
  } else {
    primaryEntry = ROUTE_MODEL_REGISTRY[route.primaryModelId]
    fallbackEntry = ROUTE_MODEL_REGISTRY[route.fallbackModelId]
    console.log('[路由调度] 任务=' + taskType + '，首选=' + primaryEntry.model + '，降级备用=' + fallbackEntry.model)
  }

  const userApiKey = userConfig?.apiKey || ''
  let userSfKey = ''
  let userXfyunKey = ''
  try {
    if (typeof window !== 'undefined') {
      userSfKey = localStorage.getItem('tuzhong-siliconflow-api-key') || ''
    }
  } catch (_e) {}
  if (userConfig && normalizeProviderName(userConfig.provider) === '硅基流动') {
    userSfKey = userSfKey || userConfig.apiKey
  }
  if (userConfig && normalizeProviderName(userConfig.provider) === '讯飞星火') {
    userXfyunKey = userConfig.apiKey
  }

  const fallbackSfKey = SILICONFLOW_MODELS[0]?.apiKey || ''
  const fallbackXfyunKey = XFYUN_MODELS[0]?.apiKey || ''

  function makeLLMConfig(entry: ModelEntry): LLMConfig {
    const isSf = entry.provider === '硅基流动'
    const isXf = entry.provider === '讯飞星火'
    if (isSf && entry.isImageModel !== true) {
      if (!SILICONFLOW_MODEL_WHITELIST.has(entry.model)) {
        console.warn('[白名单警告] 模型 ' + entry.model + ' 不在硅基流动白名单中，已拦截！请检查是否误配付费模型。')
        throw new Error('SF_WHITELIST_BLOCK: 模型 ' + entry.model + ' 不在硅基白名单，为避免扣费已拦截')
      }
    }
    return {
      provider: entry.provider,
      baseUrl: entry.baseUrl,
      model: entry.model,
      apiKey: isSf
        ? (userSfKey || userApiKey || fallbackSfKey)
        : (isXf ? (userXfyunKey || userApiKey || fallbackXfyunKey) : (userApiKey || fallbackSfKey)),
    }
  }

  return {
    primary: makeLLMConfig(primaryEntry),
    fallback: makeLLMConfig(fallbackEntry),
    params: params,
    taskType: taskType,
  }
}

// ============================================================
// 🔥 新路由调度入口：根据 TaskType 自动首选→降级切换（2模型切换）
// 完整满足：上下文继承、参数自动绑定、省钱模式、白名单、限流保护
// ============================================================
export async function callLLMByTaskType(
  taskType: TaskType,
  messages: LLMMessage[],
  userConfig?: LLMConfig | null,
  onModelSwitch?: (fromModel: string, toModel: string, reason: string) => void,
  opts?: { skipJsonValidation?: boolean; overrideCostSaving?: boolean; timeoutMs?: number }
): Promise<{ content: string; usedModel: string; usedModelId: string; cleanedContent: string }> {
  const route = buildTaskRoute(taskType, userConfig, opts?.overrideCostSaving)
  const params = route.params

  const attemptConfigList: Array<{ cfg: LLMConfig; modelId: string }> = []
  const primaryModelId = _resolveModelIdFromConfig(route.primary)
  const fallbackModelId = _resolveModelIdFromConfig(route.fallback)

  attemptConfigList.push({ cfg: route.primary, modelId: primaryModelId })
  if (route.primary.model !== route.fallback.model || route.primary.provider !== route.fallback.provider) {
    attemptConfigList.push({ cfg: route.fallback, modelId: fallbackModelId })
  }

  let lastError: string = ''
  let usedContent = ''
  let usedModel = ''
  let usedModelIdFinal = ''

  for (let i = 0; i < attemptConfigList.length; i++) {
    const attempt = attemptConfigList[i]
    let modelSuccess = false
    const retryLimit = 2

    for (let retry = 0; retry < retryLimit && !modelSuccess; retry++) {
      try {
        console.log('[路由调度] 尝试 ' + (i + 1) + '/' + attemptConfigList.length + ' 模型=' + attempt.cfg.model + ' 第' + (retry + 1) + '次 | 任务=' + taskType)
        // 修复 v4 C8：完整传递 TaskType 参数模板（topP/presencePenalty/frequencyPenalty 此前被忽略）
        const rawContent = await callLLM(attempt.cfg, messages, {
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          topP: params.topP,
          presencePenalty: params.presencePenalty,
          frequencyPenalty: params.frequencyPenalty,
          timeoutMs: opts?.timeoutMs || (taskType === 'outline' ? 120000 : 90000),
        })

        // 🔥 内容清洗（上下文不丢失，messages是完整的；这里仅净化响应）
        let cleaned: string
        if (opts?.skipJsonValidation) {
          cleaned = rawContent
            .replace(/<think[\s\S]*?<\/think>/gi, '')
            .replace(/<think[\s\S]*/gi, '')
            .replace(/<\/think>/gi, '')
            .replace(/<ret>/gi, '\n')
            .replace(/<end>/gi, '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .trim()
        } else {
          cleaned = cleanAIResponse(rawContent)
          if (cleaned.indexOf('```') !== -1) cleaned = extractJSONFromText(cleaned)
        }

        // 🔥 拒答检测（仅非正文任务）
        if (!opts?.skipJsonValidation) {
          const sample = cleaned.substring(0, 120)
          let refused = false
          const refusalPatterns = [
            /^(我无法|我不能|抱歉|很抱歉|对不起).*(回答|生成|提供|处理|帮助|输出).*/,
            /(违反|不符合|遵守).*(法律|法规|道德|规范|政策)/,
          ]
          for (let rp = 0; rp < refusalPatterns.length; rp++) {
            if (refusalPatterns[rp].test(sample)) { refused = true; break }
          }
          if (refused) {
            console.warn('[路由调度] 模型拒答，准备重试')
            lastError = '拒绝生成：' + sample.substring(0, 50)
            if (retry < retryLimit - 1) continue
            break
          }
        }

        markModelSuccess(attempt.modelId)
        usedContent = cleaned
        usedModel = attempt.cfg.model
        usedModelIdFinal = attempt.modelId
        modelSuccess = true
        break
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? (err.message || '未知错误') : String(err)
        lastError = errMsg
        console.error('[路由调度] 模型 ' + attempt.cfg.model + ' 失败: ' + errMsg)
        markModelError(attempt.modelId)

        if (errMsg.startsWith('AUTH_ERROR') || errMsg.startsWith('MODEL_NOT_FOUND') || errMsg.startsWith('SF_WHITELIST_BLOCK')) {
          break  // 不可重试，直接切下一个模型
        }
        // 🔥 限流：同 provider 短期仍受限，直接切下一模型（跨平台兜底会用到另一 provider 的额度），避免对限流 provider 死重试
        if (errMsg.startsWith('RATE_LIMIT')) {
          console.warn('[路由调度] 模型 ' + attempt.cfg.model + ' 限流，直接切换下一模型')
          break
        }
        // TIMEOUT 错误不重试，直接切下一个模型避免累计时长超过前端超时
        if (errMsg.startsWith('TIMEOUT') || /TimeoutError|AbortError/.test(String(errMsg))) {
          console.warn('[路由调度] 模型 ' + attempt.cfg.model + ' 超时，直接切换下一模型，不重试')
          break
        }
        const wait = 1200
        if (retry < retryLimit - 1) {
          await new Promise(function(r) { setTimeout(r, wait) })
        }
      }
    }

    if (modelSuccess) {
      return { content: usedContent, usedModel: usedModel, usedModelId: usedModelIdFinal, cleanedContent: usedContent }
    }

    // 切换模型回调
    if (onModelSwitch && i < attemptConfigList.length - 1) {
      const next = attemptConfigList[i + 1]
      try { onModelSwitch(attempt.cfg.model, next.cfg.model, lastError) } catch (_e) {}
    }
  }

  throw new Error('任务=' + taskType + '，所有模型均失败:\n' + (lastError || '未知错误'))
}

// 多模型自动切换调用（带JSON校验重试+单模型3次重试 + 新路由体系兼容）
export async function callLLMWithFallback(
  baseConfig: LLMConfig,
  messages: LLMMessage[],
  onModelSwitch?: (modelName: string, reason: string) => void,
  opts?: { maxTokens?: number; timeoutMs?: number; temperature?: number; skipJsonValidation?: boolean; step?: string; frequencyPenalty?: number; presencePenalty?: number }
): Promise<{ content: string; usedModel: string }> {
  // 🔥 仿写保护：将当前请求的"严禁抄袭原著名"约束注入到 system 消息（从请求级 AsyncLocalStorage 读取，隔离并发串扰）
  const _ctx = currentLLMContext()
  const _imitateGuardText = _ctx.imitateGuard
  if (_imitateGuardText && _imitateGuardText.length > 0) {
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0].content = (messages[0].content || '') + '\n\n' + _imitateGuardText
    } else {
      messages.unshift({ role: 'system', content: _imitateGuardText })
    }
  }

  // 构建模型列表：优先使用用户配置的模型，然后是同平台的备用模型
  let modelsToTry: { model: string; provider: string; baseUrl: string; apiKey?: string; rateLimit?: LLMConfig['rateLimit'] }[] = []
  
  // 规范化模型名称和提供商
  const normalizedModel = MODEL_NAME_MAP[baseConfig.model || ''] || baseConfig.model
  const normalizedProvider = normalizeProviderName(baseConfig.provider)
  
  console.log('[多模型切换] 基础配置: provider=' + baseConfig.provider + '→' + normalizedProvider + ', model=' + baseConfig.model + '→' + normalizedModel + ', baseUrl=' + baseConfig.baseUrl + ', hasApiKey=' + !!baseConfig.apiKey)
  
  // 1. 首先尝试用户配置的模型（使用规范化名称和正确的baseUrl）
  if (normalizedModel) {
    const effectiveBaseUrl = MODEL_BASE_URL_MAP[normalizedModel] || baseConfig.baseUrl || ''
    modelsToTry.push({ model: normalizedModel, provider: normalizedProvider, baseUrl: effectiveBaseUrl })
    console.log('[多模型切换] 添加用户配置模型: ' + normalizedModel + ' (baseUrl: ' + effectiveBaseUrl + ')')
  }
  
  // 2. 根据提供商选择备用模型（只选择同平台的模型，规范化后匹配）
  // 🔥 修复：剔除对文本/JSON任务无用的兜底模型，避免每次调用浪费数分钟
  //   - Kwai-Kolors/Kolors 是封面绘图模型（HTTP 400 Model does not exist，且非文本模型）
  //   - Qwen/Qwen3.5-4B 在免费档稳定 300s 超时，纯属浪费（封面绘图走独立路径，不受影响）
  // 🔥 修复：剔除对文本/JSON任务无用的兜底模型，避免每次调用浪费数分钟甚至产出垃圾
  //   - Kwai-Kolors/Kolors 是封面绘图模型（HTTP 400 Model does not exist，非文本模型）
  //   - Qwen/Qwen3.5-4B 在免费档稳定 300s 超时，纯属浪费
  //   - Qwen/Qwen2.5-7B-Instruct 免费档产出残缺/乱码 JSON（缺冒号/缺引号），污染结构化输出
  //   - Qwen/Qwen3-8B 免费档常 180s 超时，拖垮整步
  //   - tencent/Hunyuan-MT-7B 是翻译模型，不适合小说创作/结构化 JSON
  // 🔥 2026-08-21：按用户要求仅保留免费模型，以下付费/配额模型必须从文本兜底链剔除：
  //   - deepseek-ai/DeepSeek-V3（硅基流动付费档，消耗余额）
  //   - Qwen/Qwen2.5-72B-Instruct-128K（付费档）
  //   - Qwen/Qwen3-32B（付费档）
  //   - tencent/Hunyuan-A13B-Instruct（付费档）
  // 🔥 2026-08-22：智谱 glm-4.7-flash / glm-z1-flash / glm-4-flash 已实测 API Key 有效且响应快速，
  //   （本机 5.6-10.6s 返回、题材准确），不再剔除，作为关键的跨平台兜底，
  //   避免硅基流动 RPM 限流时所有文本环节全都失败。
  const _SKIP_TEXT_FALLBACK = new Set([
    'Kwai-Kolors/Kolors',
    'Qwen/Qwen3.5-4B',
    'Qwen/Qwen3-8B',
    'tencent/Hunyuan-MT-7B',
    'deepseek-ai/DeepSeek-V3',
    'Qwen/Qwen2.5-72B-Instruct-128K',
    'Qwen/Qwen3-32B',
    'tencent/Hunyuan-A13B-Instruct'
  ])
  const sameProviderModels = MULTI_MODEL_CONFIG.filter(function(m) {
    return normalizeProviderName(m.provider) === normalizedProvider && m.model !== normalizedModel && !_SKIP_TEXT_FALLBACK.has(m.model)
  })
  
  console.log('[多模型切换] 同平台备用模型数量: ' + sameProviderModels.length)
  
  for (const fallback of sameProviderModels) {
    if (!modelsToTry.some(function(m) { return m.model === fallback.model })) {
      // 🔥 2026-10-21：Key 以 models.json 真 Key 为准；env 占位符 Key 直接跳过（避免 401 空转）
      const _fk = _effectiveFallbackKey(fallback.provider, fallback.model, fallback.apiKey)
      if (!_fk) {
        console.log('[多模型切换] 跳过同平台备用（无有效 Key）: ' + fallback.model)
        continue
      }
      modelsToTry.push({ model: fallback.model!, provider: fallback.provider, baseUrl: fallback.baseUrl!, apiKey: _fk })
      console.log('[多模型切换] 添加同平台备用模型: ' + fallback.model)
    }
  }

  // 🔥 2026-10-21：动态兜底池【前置到 env 静态池之前】
  //   动态池来自 models.json（管理员/用户配置的真实 Key + 角色排序），
  //   env 静态池的硅基 Key 是占位符 → 401「Token is invalid」白耗一次尝试。
  //   动态池前置后：优先用真 Key 的模型（速度快、可用率高），env 池退为末位兜底。
  try {
    for (const _m of _ctx.extraFallbackPool) {
      if (!_m || !_m.model) continue
      const _ak = String(_m.apiKey || '')
      if (!_ak || _ak.includes('*')) continue
      if (_m.isImageModel || /Kolors|Hunyuan-MT/i.test(_m.model)) continue
      // ⚠️ 2026-10-17 过滤付费模型：管理员不得调用付费模型
      if (_m.isPaid === true) continue
      // 🔥 用户要求：永不调用 Ollama 本地——即便 models.json 里残留 Ollama 项也过滤掉
      const _mp = String(_m.provider || '').toLowerCase()
      const _mbu = String(_m.baseUrl || '').toLowerCase()
      if (_mp === 'ollama' || _mp === '本地' || _mp.includes('ollama') || /localhost:11434|127\.0\.0\.1:11434/.test(_mbu)) continue
      if (modelsToTry.some(function (x) { return x.model === _m.model && x.provider === _m.provider })) continue
      modelsToTry.push({
        model: _m.model,
        provider: _m.provider,
        baseUrl: String(_m.baseUrl || '').replace(/[`'"]/g, '').trim(),
        apiKey: _ak.replace(/[`'"]/g, '').trim(),
        // 🔥 2026-09-23：透传 opt-in 频率限制（OpenVeer 等免费中转硬配额）
        rateLimit: (_m as any).rateLimit,
      })
      console.log('[多模型切换] 追加动态兜底池模型: ' + _m.model + '（' + _m.provider + '）')
    }
  } catch (e) { console.warn('[多模型切换] 动态兜底池注入失败(忽略):', e) }

  // 🔥 2026-08-11：10 模型池跨平台兜底。当同平台模型全部失败（高并发/限流/宕机）时，
  //   按顺序尝试其他提供商的模型。每个模型自带 apiKey/baseUrl，实现硅基流动 ↔ 智谱互为兜底。
  const crossProviderModels = MULTI_MODEL_CONFIG.filter(function(m) {
    return normalizeProviderName(m.provider) !== normalizedProvider && m.model !== normalizedModel && !_SKIP_TEXT_FALLBACK.has(m.model)
  })
  console.log('[多模型切换] 跨平台备用模型数量: ' + crossProviderModels.length)
  for (const fallback of crossProviderModels) {
    if (!modelsToTry.some(function(m) { return m.model === fallback.model })) {
      // 🔥 2026-10-21：Key 以 models.json 真 Key 为准；env 占位符 Key 直接跳过
      const _fk = _effectiveFallbackKey(fallback.provider, fallback.model, fallback.apiKey)
      if (!_fk) {
        console.log('[多模型切换] 跳过跨平台备用（无有效 Key）: ' + fallback.model + '（' + fallback.provider + '）')
        continue
      }
      modelsToTry.push({ model: fallback.model!, provider: fallback.provider, baseUrl: fallback.baseUrl!, apiKey: _fk })
      console.log('[多模型切换] 添加跨平台备用模型: ' + fallback.model + '（' + fallback.provider + '）')
    }
  }
  
  // JSON任务跨平台兜底：添加讯飞星火作为终极兜底（当前已停用，逻辑保留但无实际模型）
  const isJSONTask = messages.some(function(m) {
    return m.content && (
      m.content.indexOf('硬性规则') !== -1 ||
      m.content.indexOf('纯净标准JSON') !== -1 ||
      m.content.indexOf('仅返回标准JSON') !== -1 ||
      m.content.indexOf('只输出JSON') !== -1 ||
      m.content.indexOf('JSON格式') !== -1 ||
      m.content.indexOf('输出JSON') !== -1 ||
      m.content.indexOf('输出纯JSON') !== -1 ||
      m.content.indexOf('返回JSON') !== -1 ||
      m.content.indexOf('JSON only') !== -1 ||
      m.content.indexOf('JSON对象') !== -1 ||
      // 🔥 修复：大纲/章节规划等步骤的提示含“输出纯JSON”“JSON格式铁律”等，必须触发跨平台JSON兜底
      /\bjson\b/i.test(m.content)
    )
  })
  // 🔥🔥🔥 P0 修复（2026-08-23）：DeepSeek-V4-Flash-Vision-Exp 等带推理的模型，在复杂提示下会先输出
  //   大段"思考/分析"文本（占满 max_tokens），导致 JSON 从未输出 → 后端"Failed to parse JSON"。
  //   给所有 JSON 任务追加强指令：直接输出纯JSON、从{开始、禁止任何思考/推理/分析/前言/Markdown围栏。
  if (isJSONTask && messages.length > 0 && messages[0] && messages[0].role === 'system' && typeof messages[0].content === 'string' && messages[0].content.indexOf('输出规则·最高优先级') === -1) {
    messages[0].content += '\n\n【输出规则·最高优先级·必须严格遵守】直接输出一个纯JSON对象，从 { 开始、到 } 结束。绝对不要在前面输出任何思考过程、推理、分析、解释、前言、说明；禁止 Markdown 代码块围栏（```json）；禁止任何多余文字。只输出一个合法的 JSON 对象。'
    console.log('[JSON任务] 已注入"禁止思考·纯JSON"强指令')
  }
  if (isJSONTask && normalizedProvider === '硅基流动') {
    const xfyunFallback = XFYUN_MODELS.find(function(m) { return m.model === 'astron-code-latest' })
    if (xfyunFallback) {
      const hasFallback = modelsToTry.some(function(m) { return m.model === 'astron-code-latest' })
      if (!hasFallback) {
        modelsToTry.push({
          model: xfyunFallback.model!,
          provider: xfyunFallback.provider,
          baseUrl: xfyunFallback.baseUrl!,
          apiKey: xfyunFallback.apiKey!
        })
        console.log('[多模型切换] JSON任务添加跨平台终极兜底: ' + xfyunFallback.model + '（' + xfyunFallback.provider + '）')
      }
    }
  }

  // 🔥🔥 本地/远程 Ollama 自动 fallback（完全免费）：硅基流动主链路之后接力 Ollama 推理
  // 调用顺序：硅基流动主模型 → 硅基流动同平台备用 → Ollama（多模型按序 fallback）
  // 支持远程 Ollama（公司服务器）：OLLAMA_BASE_URL=http://175.27.244.202:11434（可逗号分隔多个，如 公司,本地）
  // 模型列表由 OLLAMA_MODELS 提供；若留空则自动向各 baseUrl 的 /api/tags 探测可用模型。
  // 🔥🔥 2026-08-22 铁律：LLM_FALLBACK_OLLAMA=false（生产环境已设置）时【彻底禁用】Ollama 兜底，
  //   避免任何环节在硅基模型慢时落到本地 Ollama → 拉起 llama-server → 两枚 7B/14B 进程吃掉 6.6GB
  //   → 服务器内存耗尽(available≈120MB) → 大规模超时/卡死。本地推理对 7.5G 内存服务器是灾难，
  //   一律只走云端免费模型；若未来想启用本地推理，需显式设置 LLM_FALLBACK_OLLAMA=true。
  // 🔥 2026-08-30 用户要求：彻底、永久禁用 Ollama 本地兜底，任何环节都不再调用本地模型。
  const _OLLAMA_FALLBACK_ENABLED = false
  const _ollamaBaseUrlsRaw = _OLLAMA_FALLBACK_ENABLED
    ? (process.env.OLLAMA_BASE_URL || 'http://localhost:11434')
        .split(',').map(function(s) { return s.trim() }).filter(Boolean)
    : []
  const _ollamaModelsRaw = (process.env.OLLAMA_MODELS || process.env.OLLAMA_MODEL || '')
    .split(',').map(function(s) { return s.trim() }).filter(Boolean)
  const _isContentStep = opts?.step === 'content'

  // 收集每个 baseUrl 对应的模型名列表（显式指定 或 自动探测）
  const _ollamaPlan: { baseUrl: string; models: string[] }[] = []
  for (let _bi = 0; _bi < _ollamaBaseUrlsRaw.length; _bi++) {
    const _bu = _ollamaBaseUrlsRaw[_bi]
    let _models = _ollamaModelsRaw
    if (_models.length === 0) {
      // 自动探测：拉取该 baseUrl 的 /api/tags（短超时，失败则跳过该 baseUrl）
      try {
        const _ctrl = new AbortController()
        const _t = setTimeout(function() { _ctrl.abort() }, 4000)
        const _tags = await fetch(_bu.replace(/\/$/, '') + '/api/tags', { signal: _ctrl.signal })
        clearTimeout(_t)
        if (_tags.ok) {
          const _j = await _tags.json() as any
          const _names = (_j.models || []).map(function(m: any) { return (m && (m.name || (m.model && m.model.name))) || '' }).filter(Boolean)
          _models = _names
          console.log('[多模型切换] 自动探测 Ollama(' + _bu + ') 获得 ' + _names.length + ' 个模型：' + _names.slice(0, 8).join(' / '))
        }
      } catch (e: any) {
        console.log('[多模型切换] 自动探测 Ollama(' + _bu + ') 失败，跳过：' + (e && e.message ? e.message : e))
      }
    }
    if (_models.length) _ollamaPlan.push({ baseUrl: _bu, models: _models })
  }

  // 🔥 2026-08-10：正文首选 Ollama 开关（OLLAMA_PRIMARY_CONTENT=true 且正文步时生效）
  // 开启后把公司 Ollama 模型前置到 modelsToTry 最前，硅基流动等作为兜底；默认 false（仅作兜底）。
  const _ollamaPrimary = (process.env.OLLAMA_PRIMARY_CONTENT === 'true') && _isContentStep
  const _ollamaEntries: { model: string; provider: string; baseUrl: string; apiKey: string }[] = []

  for (let _pi = 0; _pi < _ollamaPlan.length; _pi++) {
    const _bu = _ollamaPlan[_pi].baseUrl
    const _isLocal = /localhost|127\.0\.0\.1/.test(_bu)
    let _models = _ollamaPlan[_pi].models
    // 🔥 修复：本地 Ollama 在正文(content)步只用最小的 7B 模型，避免 14.8B 在 CPU 上 OOM 拖垮 dev server；
    //        远程(公司服务器)Ollama 由服务器自身算力承载，不受本机内存限制，正文步可用全部模型（优先小模型以保证速度）。
    if (_isContentStep) {
      const _small = _models.filter(function(m) { return /7b$/i.test(m) || m.toLowerCase().indexOf('7b') !== -1 })
      if (_isLocal) {
        _models = _small.length ? _small : [_models[0]]
        console.log('[多模型切换] 正文步·本地Ollama(' + _bu + ')：限制为小模型(防OOM)：' + _models.join(' / '))
      } else {
        _models = _small.length ? _small : _models
        console.log('[多模型切换] 正文步·远程Ollama(' + _bu + ')：可用模型：' + _models.join(' / '))
      }
    }
    for (let _oi = 0; _oi < _models.length; _oi++) {
      const _om = _models[_oi]
      if (!modelsToTry.some(function(m) { return m.model === _om && m.baseUrl === _bu })) {
        _ollamaEntries.push({ model: _om, provider: 'Ollama', baseUrl: _bu, apiKey: '' })
      }
    }
    console.log('[多模型切换] 已收集 Ollama 模型（' + _bu + '，' + _models.length + ' 个：' + _models.join(' / ') + '）')
  }

  if (_ollamaPrimary) {
    // 前置到最前：公司 Ollama 正文首选，硅基流动降级兜底
    modelsToTry.unshift(..._ollamaEntries)
    console.log('[多模型切换] OLLAMA_PRIMARY_CONTENT=true，正文步公司Ollama前置为首选：' + _ollamaEntries.map(function(e) { return e.model }).join(' / '))
  } else {
    for (const _e of _ollamaEntries) modelsToTry.push(_e)
  }

  // 🔥 2026-10-21：动态兜底池已前置到 env 静态池之前（见上方），此处不再重复注入。

  const errors: string[] = []
  // 🔥 修复：收集每个模型返回的“原始内容”（即使 JSON 校验失败），用于最终兜底
  // 免费档 9B 模型常产出“内容正确但 JSON 语法有小错”的输出，丢弃太浪费；
  // 交给调用方 parseJSON 的容错递归解析器（lenientParseJSON）抢救，远胜于返回空对象。
  const _rawContents: { content: string; model: string; provider?: string }[] = []

  // 🔥🔥🔥 2026-09-02 健康排序：冷却中的模型排到兜底链末尾。
  //   此前 429 限流模型每次都从头重试（单次退避最多 60s），多个环节连续踩坑会整体拖垮；
  //   现在失败≥2 次的模型进入冷却，本次请求直接从健康模型开始，限流模型仅作最后兜底。
  if (modelsToTry.length > 1) {
    const _inCd = modelsToTry.filter(function (m) { return !isLLMModelHealthy(m.model) })
    if (_inCd.length > 0 && _inCd.length < modelsToTry.length) {
      const _healthy = modelsToTry.filter(function (m) { return isLLMModelHealthy(m.model) })
      modelsToTry = _healthy.concat(_inCd)
      console.log('[多模型切换] 冷却中模型后置: ' + _inCd.map(function (m) { return m.model }).join(', '))
    }
  }
  
  for (let i = 0; i < modelsToTry.length; i++) {
    const modelConfig = modelsToTry[i]
    const config: LLMConfig = {
      provider: modelConfig.provider,
      apiKey: modelConfig.apiKey || baseConfig.apiKey || '',
      baseUrl: modelConfig.baseUrl,
      model: modelConfig.model,
    }
    
    // 🔥 智能重试：TIMEOUT/NETWORK错误重试1次，AUTH/MODEL_NOT_FOUND不重试直接切换模型
    let modelSuccess = false
    let lastError: string = ''
    for (let retry = 0; retry < 2; retry++) {
      try {
        console.log('[多模型切换] 尝试 ' + (i + 1) + '/' + modelsToTry.length + ': ' + modelConfig.model + ' (第' + (retry + 1) + '次)')
        // 🔥 Ollama 本地推理较慢，但必须设上限避免无限挂起拖垮请求；正文步(7B)更快，给 180s，其余 240s
        const _callOpts = (modelConfig.provider === 'Ollama')
          ? Object.assign({}, opts || {}, { timeoutMs: (opts?.step === 'content' ? 300000 : 240000) })
          : opts
        const content = await callLLM(config, messages, _callOpts)
        
        // 统一清洗AI响应
        // 🔥 如果跳过JSON校验（如正文生成），使用轻量清洁，不调用cleanAIResponse（它会截断散文）
        let cleanedContent: string
        if (opts?.skipJsonValidation) {
          // 轻量清洁：只移除think标签、end标签、控制字符，不做JSON提取/截断
          cleanedContent = content
            .replace(/<think[\s\S]*?<\/think>/gi, '')
            .replace(/<think[\s\S]*/gi, '')
            .replace(/<\/think>/gi, '')
            .replace(/<ret>/gi, '\n')
            .replace(/<end>/gi, '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .trim()
        } else {
          cleanedContent = cleanAIResponse(content)
        }
        // 如果清洗后仍有代码块标记，再用extractJSONFromText提取
        // 🔥 正文生成(skipJsonValidation)不提取JSON，否则会破坏散文内容
        let finalContent = cleanedContent
        if (!opts?.skipJsonValidation && finalContent.indexOf('```') !== -1) {
          finalContent = extractJSONFromText(finalContent)
        }
        
        // 🔥 检测模型拒答（安全过滤/内容审核导致的拒绝响应）
        const refusalPatterns = [
          /^(我无法|我不能|抱歉|很抱歉|对不起).*(回答|生成|提供|处理|帮助|输出).*/,
          /(无法|不能).*(回答|生成|输出|处理)此.*(问题|内容|请求)/,
          /(违反|不符合|遵守).*(法律|法规|道德|规范|政策)/,
          /(负面价值观|社会公德|社会公共利益)/,
        ]
        let isRefusal = false
        if (!opts?.skipJsonValidation) { // 跳过内容生成的拒答检测（内容生成返回散文是正常的）
          const contentSample = (finalContent || '').substring(0, 80)
          for (let _rf = 0; _rf < refusalPatterns.length; _rf++) {
            if (refusalPatterns[_rf].test(contentSample)) {
              isRefusal = true
              console.warn('[多模型切换] 模型 ' + modelConfig.model + ' 返回拒答: ' + contentSample + '...')
              break
            }
          }
        }
        
        if (isRefusal) {
          // 拒答→重试一次（不发送修正请求，直接重新调用）
          if (retry < 1) {
            retry++
            console.warn('[多模型切换] 模型拒答，重试 ' + (retry + 1) + '/2')
            continue // 重新尝试（外层循环会重新选择模型）
          }
          // 所有重试都拒答
          lastError = '模型拒绝生成（安全过滤）'
          _markLLMModelFail(modelConfig.model, false)
          break
        }
        
        // 校验：如果是JSON生成任务，验证返回内容是否包含有效JSON
        // isJSONTask 已在外层定义，此处复用
        
        if (isJSONTask && !opts?.skipJsonValidation) {
          const extractedRaw = extractJSONFromText(finalContent)
          // 🔥 清洗原始控制字符，避免 Bad control character 直接抛错引爆重试链
          const extracted = sanitizeJSONControlChars(extractedRaw)
          let jsonParsed = false
          try {
            const parsedJson = JSON.parse(extracted)
            // 🔥 内容完整性校验：检测空JSON对象（{}），触发重试
            if (typeof parsedJson === 'object' && !Array.isArray(parsedJson) && Object.keys(parsedJson).length === 0) {
              throw new Error('EmptyJSON')
            }
            jsonParsed = true
            console.log('[多模型切换] 模型 ' + modelConfig.model + ' JSON校验通过')
          } catch (jsonErr) {
            // 第一次失败：尝试基础修复
            const fixedExtracted = sanitizeJSONControlChars(extracted)
              .replace(/,\s*}/g, '}')
              .replace(/,\s*]/g, ']')
              .replace(/:\s*NaN\b/g, ': null')
              .replace(/:\s*undefined\b/g, ': null')
              // 🔥 修复Qwen2.5-7B无效反斜杠转义（\章、\华夏等 → 移除反斜杠）
              .replace(/\\(?![\\"/bfnrtu]|u[0-9a-fA-F]{4})/g, '')
              // 🔥 修复模型JSON工件：双引号叠用（""word"" → "word"； "" → ","）
              .replace(/""/g, '","')
              // 修复",""," → "," （移除冗余空逗号元素）
              .replace(/"\s*,\s*"\s*,\s*"/g, '","')
              // 修复数组末尾逗号问题
              .replace(/,\s*\]/g, ']')
            try {
              const parsedJson2 = JSON.parse(fixedExtracted)
              if (typeof parsedJson2 === 'object' && !Array.isArray(parsedJson2) && Object.keys(parsedJson2).length === 0) {
                throw new Error('EmptyJSON')
              }
              jsonParsed = true
              console.log('[多模型切换] 模型 ' + modelConfig.model + ' JSON校验通过（基础修复后）')
            } catch (fixErr) {
              const errLabel = (jsonErr instanceof Error && jsonErr.message === 'EmptyJSON') ? '返回空JSON对象' : '返回非JSON内容'
              console.warn('[多模型切换] 模型 ' + modelConfig.model + ' ' + errLabel + '（已尝试修复），将返回原始内容由上层parseJSON处理')
              // 🔥 关键修复：不再将此视为模型失败，而是返回原始内容让调用方的parseJSON处理
              // parseJSON有5种方法提取JSON（直接解析→强力修复→代码块→花括号→小JSON对象）
              jsonParsed = false
            }
          }
          
          if (!jsonParsed) {
            // 🔥 修复：免费档 9B 模型几乎必然产出“内容正确但 JSON 语法有小错”的输出，
            // 再发一次修正请求绝大多数仍失败，且白白多耗一次 RPM 与延迟（易触发 429）。
            // 直接收集原始内容，交给调用方 parseJSON 的 lenientParseJSON 容错解析即可。
            if (finalContent && finalContent.length > 0) {
              _rawContents.push({ content: finalContent, model: modelConfig.model, provider: modelConfig.provider })
            }
            console.warn('[多模型切换] ' + modelConfig.model + ' JSON校验未通过，收集原始内容交上层容错解析')
            // 🔥 2026-08-21：免费模型对复杂 JSON 常产出"内容正确但语法有小错"的输出。
            //   若已拿到非空内容，立即用它兜底返回（交上层 parseJSON 容错解析），
            //   不再逐个尝试后续慢模型（智谱无key/Ollama 90s+），避免整步被拖垮。
            if (_rawContents.length > 0) {
              const _best = _rawContents[_rawContents.length - 1]
              ;(baseConfig as any).__usedModel = _best.model
              ;(baseConfig as any).__usedProvider = (_best as any).provider
              return { content: _best.content, usedModel: _best.model }
            }
            break
          }
        }
        
        // 🔥 空内容防护：模型返回空/纯空白（本地模型冷加载失败、或 deepseek-r1 思考链吃光 token 预算）
        // 不能当作成功返回，否则会写出空章节/空设定；应继续切下一个模型
        if (!finalContent || finalContent.trim().length === 0) {
          lastError = '模型返回空内容'
          _markLLMModelFail(modelConfig.model, false)
          console.warn('[多模型切换] 模型 ' + modelConfig.model + ' 返回空内容，切换下一个模型')
          break
        }

        modelSuccess = true
        console.log('[多模型切换] 模型 ' + modelConfig.model + ' 成功')
        _markLLMModelOk(modelConfig.model)
        // 🔥 将实际成功调用的模型 stamped 到 baseConfig（调用方 effectiveLlmConfig 同一引用），供 _meta 与前端展示
        ;(baseConfig as any).__usedModel = modelConfig.model
        ;(baseConfig as any).__usedProvider = modelConfig.provider
        return { content: finalContent, usedModel: modelConfig.model }
      } catch (err) {
        const errorMsg = err instanceof Error ? (err.message || 'API请求失败（无详细错误信息）') : '未知错误'
        lastError = errorMsg
        // 🔥 捕获 429 退避时长（retryAfter，单位秒），上限 10s（原 60s——晚高峰持续限流时
        //   单模型单次请求最多拖 60s，多个环节连续踩坑会整体超时；限流模型由健康表冷却，
        //   退避重试 1 次仍失败即切换，冷却期内不再优先）
        const _ra = (err && (err as any).retryAfter) ? Number((err as any).retryAfter) : 0
        const _isRateLimit = errorMsg.startsWith('RATE_LIMIT')
        console.error('[多模型切换] ' + modelConfig.model + ' 第' + (retry + 1) + '次失败: ' + errorMsg)

        // 🔥 2026-09-02 健康表打标：硬限流(429) 15 分钟冷却，其余软失败 5 分钟冷却
        if (_isRateLimit) {
          _markLLMModelFail(modelConfig.model, true)
        } else {
          _markLLMModelFail(modelConfig.model, false)
        }

        // 🔥 AUTH/MODEL_NOT_FOUND/JSON_PARSE/TIMEOUT 错误不重试，直接切换模型
        if (errorMsg.startsWith('AUTH_ERROR') || errorMsg.startsWith('MODEL_NOT_FOUND') || errorMsg.startsWith('JSON_PARSE_FAILURE') || errorMsg.startsWith('TIMEOUT') || String(errorMsg).indexOf('TimeoutError') !== -1 || String(errorMsg).indexOf('AbortError') !== -1) {
          console.warn('[多模型切换] 不可重试错误(含超时)，跳过该模型: ' + errorMsg)
          break
        }

        // 🔥 NETWORK/RATE_LIMIT 错误：等待后重试（429 按 retryAfter 退避，上限 10s）
        if (retry < 1) {
          const waitMs = (_isRateLimit && _ra > 0) ? Math.min(_ra * 1000, 10000) : 1500
          console.log('[多模型切换] 限流退避 ' + waitMs + 'ms 后重试...')
          await new Promise(function(resolve) { setTimeout(resolve, waitMs) })
          continue
        }
        
        break
      }
    }
    
    // 该模型所有重试都失败，记录错误
    if (!modelSuccess) {
      errors.push(modelConfig.model + ': ' + lastError)
    }
    
    // 通知前端模型切换
    if (onModelSwitch && i < modelsToTry.length - 1) {
      onModelSwitch(modelsToTry[i + 1].model, errors[errors.length - 1] || '')
    }
  }
  
  // 🔥 修复：若所有模型都未能通过 JSON 校验（免费档 9B 模型常见），
  // 不再直接抛错丢弃——返回“内容最长、最可能完整”的那条原始输出，
  // 交给调用方 parseJSON 的容错递归解析器（lenientParseJSON）抢救。
  // 这避免了“模型明明写出了正确剧情却因一个语法小错导致整步返回空对象”。
  if (_rawContents.length > 0) {
    let _best = _rawContents[0]
    for (let _k = 1; _k < _rawContents.length; _k++) {
      if (_rawContents[_k].content.length > _best.content.length) _best = _rawContents[_k]
    }
    console.warn('[多模型切换] 所有模型 JSON 校验均未通过，兜底返回最长原始内容（模型 ' + _best.model + '，长度 ' + _best.content.length + '）交由上层容错解析')
    ;(baseConfig as any).__usedModel = _best.model
    ;(baseConfig as any).__usedProvider = (_best as any).provider
    return { content: _best.content, usedModel: _best.model }
  }

  throw new Error('所有模型都失败了:\n' + errors.join('\n'))
}