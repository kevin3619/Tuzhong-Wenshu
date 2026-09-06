import type { LLMConfig } from './llm'

/**
 * 读取 models.json 里管理员默认模型（与 ai-generate 同一策略：
 * default 优先；若 default 无有效 key，则回退到列表中第一个含有效 key 的模型，
 * 避免落到 .env 的付费兜底模型）。
 *
 * 供 /api/characters/normalize 与 /api/factions/normalize 等"一键校正"接口共用，
 * 不再各自复制一份实现。
 */
export function loadDefaultLlmConfig(): LLMConfig | null {
  try {
    const fs = require('fs')
    const pathMod = require('path')
    const p = pathMod.join(process.cwd(), '.tuzhong-data', 'models.json')
    if (!fs.existsSync(p)) return null
    const list = JSON.parse(fs.readFileSync(p, 'utf-8'))
    const hasKey = function (m: any) { return m && m.apiKey && !String(m.apiKey).includes('*') }
    const arr = Array.isArray(list) ? list : []
    const picked = arr.find(function (m: any) { return m && m.status === 'default' && hasKey(m) }) || arr.find(hasKey)
    if (!picked || !picked.model) return null
    return {
      provider: picked.provider || '硅基流动',
      apiKey: String(picked.apiKey).replace(/[`'"]/g, '').trim(),
      baseUrl: String(picked.baseUrl || 'https://api.siliconflow.cn/v1').replace(/[`'"]/g, '').trim(),
      model: String(picked.model),
    }
  } catch (_e) { return null }
}
