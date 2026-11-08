// ============================================================
// 第1层：安全管道 - AI 请求 → 清洗 → 解析 → 校验 → 兜底
// 所有 AI 调用必须经过此管道，禁止模块绕过
// ============================================================

import { callLLMWithFallback, extractJSONFromText, cleanAIResponse, type LLMConfig, type LLMMessage } from './llm'

// ============ 1. sendSafeAiRequest ============
// 封装 AI 请求，固定参数，内置重试，统一接口
export async function sendSafeAiRequest(
  config: LLMConfig,
  messages: LLMMessage[],
  options?: {
    temperature?: number
    maxTokens?: number
    timeout?: number
    onModelSwitch?: (modelName: string, reason: string) => void
  }
): Promise<{ content: string; usedModel: string }> {
  const temperature = options?.temperature ?? 0.2
  const maxTokens = options?.maxTokens ?? 8192

  console.log(`[SafePipeline] 发送AI请求，模型: ${config.model}, temperature: ${temperature}, maxTokens: ${maxTokens}`)

  // 强制设置 temperature 参数（通过系统消息注入）
  const enhancedMessages = messages.map((m, i) => {
    if (i === 0 && m.role === 'system') {
      return {
        ...m,
        content: m.content + `\n\n【输出参数】temperature=${temperature}, max_tokens=${maxTokens}`
      }
    }
    return m
  })

  return callLLMWithFallback(config, enhancedMessages, options?.onModelSwitch)
}

// ============ 2. cleanAndParseJson ============
// 清洗 AI 返回 → 多策略解析 JSON → 失败时返回兜底
export function cleanAndParseJson<T = unknown>(
  rawStr: string,
  defaultValue: T,
  stepName?: string
): T {
  if (!rawStr || typeof rawStr !== 'string') {
    console.warn(`[cleanAndParseJson] ${stepName || '未知步骤'}: 输入为空，使用兜底`)
    return defaultValue
  }

  // 步骤1: 全局清洗
  const cleaned = cleanAIResponse(rawStr)
  if (!cleaned) {
    console.warn(`[cleanAndParseJson] ${stepName || '未知步骤'}: 清洗后为空，使用兜底`)
    return defaultValue
  }

  // 步骤2: 多策略 JSON 解析
  const strategies: Array<() => { success: boolean; data: T }> = [
    // 策略1: 直接解析
    () => {
      try {
        return { success: true, data: JSON.parse(cleaned) }
      } catch { return { success: false, data: defaultValue } }
    },
    // 策略2: tryFixJSON 强力修复后解析
    () => {
      try {
        const fixed = tryFixJSON(cleaned)
        return { success: true, data: JSON.parse(fixed) }
      } catch { return { success: false, data: defaultValue } }
    },
    // 策略3: 从代码块中提取
    () => {
      const extracted = extractJSONFromText(cleaned)
      if (extracted !== cleaned) {
        try {
          return { success: true, data: JSON.parse(extracted) }
        } catch { return { success: false, data: defaultValue } }
      }
      return { success: false, data: defaultValue }
    },
    // 策略4: 移除所有 \n 后尝试
    () => {
      try {
        const noNewlines = cleaned.replace(/\n/g, ' ').replace(/\s+/g, ' ')
        return { success: true, data: JSON.parse(noNewlines) }
      } catch { return { success: false, data: defaultValue } }
    },
  ]

  for (let i = 0; i < strategies.length; i++) {
    const result = strategies[i]()
    if (result.success) {
      console.log(`[cleanAndParseJson] ${stepName || '未知步骤'}: 策略${i + 1}成功`)
      return result.data
    }
  }

  console.warn(`[cleanAndParseJson] ${stepName || '未知步骤'}: 所有${strategies.length}个策略均失败，使用兜底模板`)
  console.warn(`[cleanAndParseJson] 原始内容前200字符: ${rawStr.substring(0, 200)}`)
  return defaultValue
}

// ============ JSON 修复函数 ============
function tryFixJSON(text: string): string {
  let fixed = text

  // 1. 移除 BOM 和控制字符
  fixed = fixed.replace(/^\uFEFF/, '')
  fixed = fixed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  // 2. 移除 markdown 代码块标记
  fixed = fixed.replace(/```json\s*/gi, '')
  fixed = fixed.replace(/```\s*/g, '')

  // 3. 移除 think 标签
  fixed = fixed.replace(/<think[\s\S]*?<\/think>/gi, '')
  fixed = fixed.replace(/<think[\s\S]*/gi, '')
  fixed = fixed.replace(/<\/think>/gi, '')

  // 4. 提取 { 到 } 之间的内容
  const firstBrace = fixed.indexOf('{')
  const lastBrace = fixed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    fixed = fixed.substring(firstBrace, lastBrace + 1)
  }

  // 5. 修复中文冒号
  fixed = fixed.replace(/"\s*[:：]\s*"/g, '":"')

  // 6. 修复尾部逗号
  fixed = fixed.replace(/,\s*}/g, '}')
  fixed = fixed.replace(/,\s*]/g, ']')

  // 7. 修复多余闭合括号
  fixed = fixed.replace(/\}\s*\}/g, '}')
  fixed = fixed.replace(/\]\s*\}/g, ']}')
  fixed = fixed.replace(/\}\s*\]/g, '}]')

  // 8. 修复数组中缺失的逗号（仅在数组方括号 [...] 内部修复）
  fixed = fixed.replace(/\[([^\]]*)\]/g, function (_match, arrayContent) {
    return '[' + arrayContent.replace(/"\s+(?=")/g, '", "') + ']'
  })

  // 9. 修复数组中缺失的闭合方括号
  const openBrackets = (fixed.match(/\[/g) || []).length
  const closeBrackets = (fixed.match(/\]/g) || []).length
  if (openBrackets > closeBrackets) {
    const lastBrace = fixed.lastIndexOf('}')
    if (lastBrace !== -1) {
      fixed = fixed.slice(0, lastBrace) + ']' + fixed.slice(lastBrace)
    }
  }

  // 10. 修复未闭合的字符串（在对象末尾补引号）
  fixed = fixed.replace(/: "([^"]*?)\n\s*\}/g, ': "$1"\n}')
  fixed = fixed.replace(/: "([^"]*?)\}/g, ': "$1"}')

  // 11. 修复单引号
  fixed = fixed.replace(/([{,]\s*)'([^']*?)'(\s*:)/g, '$1"$2"$3')
  fixed = fixed.replace(/(:\s*)'([^']*?)'(\s*[,}\]])/g, '$1"$2"$3')

  // 12. 修复未加引号的 key
  fixed = fixed.replace(/([\{,]\s*)([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*:/g, '$1"$2":')

  // 13. 修复AI生成的损坏key（纯标点符号作为key，如 ","、":"、""等）
  // 匹配模式: ,"纯标点"": 例如 ,","":"value" → 删除整个损坏的键值对
  fixed = fixed.replace(/,\s*"[^a-zA-Z0-9_\u4e00-\u9fa5]{1,10}"\s*:\s*"[^"]*"/g, '')
  // 修复双重逗号
  fixed = fixed.replace(/,{2,}/g, ',')

  return fixed
}

// ============ 3. validateAndSanitizeData ============
// 数据校验与清洗：字段非空、格式过滤、设定校验、业务校验

export interface ValidationRule {
  /** 字段名 */
  field: string
  /** 字段类型 */
  type: 'string' | 'number' | 'array' | 'object' | 'boolean'
  /** 是否必填 */
  required?: boolean
  /** 默认值（用于空值填充） */
  defaultValue?: unknown
  /** 自定义校验函数 */
  validator?: (value: unknown) => string | null // 返回 null 表示通过，返回字符串表示错误信息
  /** 值替换规则（用于修正错误设定） */
  replacements?: Array<{ from: string | RegExp; to: string }>
}

export interface ValidationRules {
  [field: string]: ValidationRule
}

export function validateAndSanitizeData<T extends Record<string, unknown>>(
  data: T,
  rules: ValidationRules,
  stepName?: string
): T {
  const result = { ...data } as Record<string, unknown>
  const warnings: string[] = []

  for (const [field, rule] of Object.entries(rules)) {
    let value: unknown = result[field]

    // 1. 空值检查
    if (value === undefined || value === null || value === '') {
      if (rule.required || rule.defaultValue !== undefined) {
        if (rule.required) warnings.push(`${field}: 必填字段为空，使用默认值`)
        if (rule.defaultValue !== undefined) {
          value = rule.defaultValue
        } else {
          // 🔥 Bug修复：required 且无 defaultValue 时给类型安全默认（'' / [] / {} / 0），
          //   此前置 undefined → JSON 序列化整键丢失，下游按"字段未生成"而非"用兜底"处理
          if (rule.type === 'array') value = []
          else if (rule.type === 'object') value = {}
          else if (rule.type === 'number') value = 0
          else if (rule.type === 'boolean') value = false
          else value = ''
        }
      }
    }

    // 2. 类型检查与修正
    if (value !== undefined && value !== null) {
      switch (rule.type) {
        case 'string':
          if (typeof value !== 'string') {
            value = String(value)
          }
          // 过滤乱码和控制字符
          value = (value as string).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
          break
        case 'number':
          if (typeof value !== 'number') {
            const num = Number(value)
            value = isNaN(num) ? (rule.defaultValue ?? 0) : num
          }
          break
        case 'array':
          if (!Array.isArray(value)) {
            value = rule.defaultValue ?? []
          }
          break
        case 'boolean':
          if (typeof value !== 'boolean') {
            value = Boolean(value)
          }
          break
        case 'object':
          if (typeof value !== 'object' || Array.isArray(value) || value === null) {
            value = rule.defaultValue ?? {}
          }
          break
      }
    }

    // 3. 值替换（修正错误设定）
    if (rule.replacements && typeof value === 'string') {
      for (const rep of rule.replacements) {
        value = (value as string).replace(rep.from, rep.to)
      }
    }

    // 4. 自定义校验
    if (rule.validator && value !== undefined && value !== null) {
      const error = rule.validator(value)
      if (error) {
        warnings.push(`${field}: ${error}`)
      }
    }

    result[field] = value
  }

  if (warnings.length > 0) {
    console.warn(`[validateAndSanitizeData] ${stepName || '未知步骤'}: ${warnings.length}个警告`)
    warnings.forEach(w => console.warn(`  - ${w}`))
  }

  return result as T
}

// ============ 4. 硬性规则文本（所有提示词末尾强制添加） ============
export const HARD_RULES = `【硬性规则 - 必须严格遵守】
1. 只输出完整、可直接解析的标准JSON字符串，不允许多余文字。
2. 输出必须以 { 开头、} 结尾，所有键值对用双引号包裹。
3. 数组用 [] 包裹，元素间用逗号分隔。
4. 字符串内不要嵌套未转义的双引号。
5. 不允许任何解释、代码块标记、换行闲聊、中途截断。
6. 所有字段必须有值，严禁空字符串""、null、undefined。不确定时写"暂无"或合理的占位内容。
7. 键名必须与要求的JSON Schema完全一致，不多不少。
8. 字符串内容禁止乱码、禁止包含代码片段标记。
9. 内容必须贴合用户指定的类型和主题，严禁抄袭已有作品。
10. 违反以上任何一条视为无效输出。`

// ============ 5. 通用兜底模板生成器 ============
export function getGenericFallback(_step: string, _context?: { genre?: string; input?: string; imitate?: Record<string, unknown> }): Record<string, unknown> {
  // 【关键】不再返回任何模拟/模版数据。AI生成失败时返回空对象，由前端显示"请重试"
  return {}
}