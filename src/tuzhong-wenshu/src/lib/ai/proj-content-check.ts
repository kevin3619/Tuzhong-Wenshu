/**
 * projContentCheckFilter — 途中文枢专属AI内容完整性拦截器
 *
 * 软著自研命名，禁止通用命名。拦截所有AI生成接口的返回数据，
 * 从源头彻底解决空内容问题。
 *
 * 规则：
 * 1. AI返回 → 先经过中间件校验 → 校验通过才入库+返回前端
 * 2. 校验不通过自动重试1次 → 重试仍为空则弹窗提示，绝不保存/渲染空内容
 */

// ============ 空值判定规则（全局生效） ============

// 占位符/无意义值字典
const PLACEHOLDER_VALUES = ['暂无', '无', '未定', '待定', '待设定', '待补充', '待完善', 'N/A', 'n/a', 'null', 'unknown', '未详', '...', '。。。', '略', '（待补充）', '(待补充)', '参考', '参考仿']

/** 判定字符串是否为占位符（含中文的至少2字视为有效内容） */
function isPlaceholder(val: string): boolean {
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (trimmed.length === 0) return true
  for (let i = 0; i < PLACEHOLDER_VALUES.length; i++) {
    if (trimmed === PLACEHOLDER_VALUES[i] || trimmed.indexOf(PLACEHOLDER_VALUES[i]) === 0) return true
  }
  const chineseChars = trimmed.match(/[\u4e00-\u9fff]/g)
  if (!chineseChars || chineseChars.length === 0) {
    if (trimmed.length <= 3) return true
    if (/^[a-zA-Z0-9\s_]+$/.test(trimmed) && trimmed.length < 20) return true
  }
  return false
}

/** 判定是否为空值的核心函数 */
export function projIsEmptyContent(value: unknown): boolean {
  // null / undefined
  if (value === null || value === undefined) return true

  // 空字符串 或 占位符
  if (typeof value === 'string') {
    return isPlaceholder(value)
  }

  // 空数组
  if (Array.isArray(value)) {
    if (value.length === 0) return true
    return value.every(item => projIsEmptyContent(item))
  }

  // 空对象
  if (typeof value === 'object') {
    if (Object.keys(value as Record<string, unknown>).length === 0) return true
    return false
  }

  return false
}

/** 判定对象是否所有关键字段都为空（结构存在但内容全空） */
export function projIsStructurallyEmpty(data: Record<string, unknown>): boolean {
  if (!data || typeof data !== 'object') return true
  const keys = Object.keys(data)
  if (keys.length === 0) return true

  // 检查是否所有值都为空
  return keys.every(key => {
    const val = data[key]
    if (Array.isArray(val)) return val.length === 0
    if (typeof val === 'string') return projIsEmptyContent(val)
    if (val === null || val === undefined) return true
    if (typeof val === 'object') return projIsStructurallyEmpty(val as Record<string, unknown>)
    return false
  })
}

// ============ 自动清洗乱码 ============

/** 自动清洗AI返回的乱码、特殊符号、无效换行 */
export function projSanitizeText(text: string): string {
  if (typeof text !== 'string') return ''
  return text
    // 移除Unicode零宽字符
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // 移除连续3个以上的换行
    .replace(/\n{3,}/g, '\n\n')
    // 移除连续3个以上的空格
    .replace(/ {3,}/g, '  ')
    // 移除行首行尾无效空白
    .split('\n').map(line => line.trim()).join('\n')
    .trim()
}

/** 对象递归清洗 */
export function projSanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    if (typeof val === 'string') {
      result[key] = projSanitizeText(val)
    } else if (Array.isArray(val)) {
      result[key] = val.map(item => {
        if (typeof item === 'string') return projSanitizeText(item)
        if (typeof item === 'object' && item !== null) return projSanitizeObject(item as Record<string, unknown>)
        return item
      })
    } else if (typeof val === 'object' && val !== null) {
      result[key] = projSanitizeObject(val as Record<string, unknown>)
    } else {
      result[key] = val
    }
  }
  return result as T
}

// ============ 拦截器类型 ============

export interface ProjCheckResult {
  passed: boolean
  data: unknown
  errorMessage?: string
  sanitized: boolean
}

/**
 * projContentCheckFilter — 核心拦截器
 *
 * 在API返回数据前调用，校验内容完整性。
 * 如果内容为空，返回 { passed: false }，调用方应触发重试或返回错误。
 */
export function projContentCheckFilter(
  data: unknown,
  stepName: string,
): ProjCheckResult {
  // 1. 空值判定
  if (projIsEmptyContent(data)) {
    return {
      passed: false,
      data: null,
      errorMessage: `[${stepName}] AI返回数据为空（null/空字符串/空数组），已拦截`,
      sanitized: false,
    }
  }

  // 2. 结构存在但内容全空判定
  if (typeof data === 'object' && !Array.isArray(data)) {
    if (projIsStructurallyEmpty(data as Record<string, unknown>)) {
      return {
        passed: false,
        data: null,
        errorMessage: `[${stepName}] AI返回了有效结构但所有字段内容为空，已拦截`,
        sanitized: false,
      }
    }
  }

  // 3. 清洗乱码
  let sanitized = false
  let cleanData = data
  if (typeof data === 'object' && data !== null) {
    const beforeClean = JSON.stringify(data)
    cleanData = projSanitizeObject(data as Record<string, unknown>)
    if (JSON.stringify(cleanData) !== beforeClean) {
      sanitized = true
    }
  } else if (typeof data === 'string') {
    const cleaned = projSanitizeText(data)
    if (cleaned !== data) {
      cleanData = cleaned
      sanitized = true
    }
  }

  if (sanitized) {
    console.log(`[projContentCheck] ${stepName} 已自动清洗乱码/特殊符号`)
  }

  return {
    passed: true,
    data: cleanData,
    sanitized,
  }
}