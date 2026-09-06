import fs from 'fs'
import path from 'path'
import { getModelForStep } from './step-model-config'

const dataDir = path.join(process.cwd(), '.tuzhong-data')
const modelsFile = path.join(dataDir, 'models.json')

// 避免直接 import 有浏览器代码的 llm.ts，这里独立定义类型
export interface LLMConfig {
  provider: string
  apiKey: string
  baseUrl?: string
  model: string
  temperature?: number
  topP?: number
  maxTokens?: number
  presencePenalty?: number
  frequencyPenalty?: number
  [k: string]: unknown
}

export interface StoredModelConfig {
  id: string
  provider: string
  name: string
  status: 'default' | 'active' | 'inactive'
  apiKey?: string
  baseUrl?: string
  model?: string
  userId?: string
  isAdminDefault?: boolean
  createdAt?: string
  updatedAt?: string
}

function readStoredModels(): StoredModelConfig[] {
  try {
    if (!fs.existsSync(modelsFile)) return []
    const raw = fs.readFileSync(modelsFile, 'utf-8')
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch (_e) {
    return []
  }
}

/**
 * 修复管理员共享模型的真实 apiKey 解析
 * 场景：普通用户选择管理员共享模型为默认 → 前端 localStorage 存的 apiKey 是 '***'（脱敏）
 *       但AI生成需要真实Key，所以服务器端收到请求后，用 modelId 或 provider+model 去 models.json 查真实 Key
 */
export function resolveLLMConfig(
  inputCfg: LLMConfig & { modelId?: string },
  userId?: string,
  step?: string
): LLMConfig {
  if (!inputCfg) return inputCfg as LLMConfig

  // 用副本操作，避免污染调用方传入的对象
  const cfg: LLMConfig & { modelId?: string } = { ...inputCfg }

  // 未显式指定模型时，按环节自动选配。
  // 注意：用户在前端手动选的模型始终优先，这里只做兜底。
  const hasModel = typeof cfg.model === 'string' && cfg.model.trim().length > 0
  if (!hasModel && step) {
    const m = getModelForStep(step)
    cfg.model = m.model
    cfg.provider = cfg.provider || m.provider
    cfg.baseUrl = cfg.baseUrl || m.baseUrl
  }

  const apiKeyOk = typeof cfg.apiKey === 'string' && cfg.apiKey.length > 0 && !cfg.apiKey.includes('*')
  if (apiKeyOk) return cfg

  const stored = readStoredModels()
  if (stored.length === 0) return cfg

  let match: StoredModelConfig | undefined

  // 优先用 modelId 精确匹配
  if (cfg.modelId) {
    match = stored.find(function (m) { return m.id === cfg.modelId })
  }

  // 再用 provider + model 匹配
  if (!match) {
    const inputProvider = String(cfg.provider || '').trim().replace(/\s*\([^)]*\)\s*/g, '')
    const inputModel = String(cfg.model || '').trim()
    match = stored.find(function (m) {
      if (!m.apiKey) return false
      const mProvider = String(m.provider || '').trim().replace(/\s*\([^)]*\)\s*/g, '')
      const mModel = String(m.model || '').trim()
      return mProvider === inputProvider && mModel === inputModel
    })
  }

  if (match && match.apiKey) {
    const canUse = match.isAdminDefault === true || (userId && match.userId === userId) || !userId
    if (canUse) {
      return {
        ...(cfg as LLMConfig),
        provider: cfg.provider || match.provider,
        apiKey: match.apiKey,
        baseUrl: (cfg.baseUrl && !cfg.baseUrl.includes('*')) ? cfg.baseUrl.replace(/[`'"]/g, '').trim() : (match.baseUrl || '').replace(/[`'"]/g, '').trim(),
        model: cfg.model || match.model || '',
      } as LLMConfig
    }
  }

  return cfg as LLMConfig
}
