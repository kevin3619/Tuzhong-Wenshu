/**
 * 从任意值中提取可读的文本内容
 * 避免使用 JSON.stringify 导致界面显示乱码
 */
export function extractText(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)

  if (Array.isArray(val)) {
    return val.map((item: unknown) => extractText(item)).filter(Boolean).join('；')
  }

  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    // 优先提取常见的中文文本字段（按优先级排列）
    const textFields = [
      // 通用文本字段
      'description', 'content', 'text', 'summary', 'detail', 'info', 'note',
      'value', 'label', 'intro',
      // 名称字段
      'name', 'title',
      // 角色相关
      'identity', 'personality', 'appearance', 'background', 'motivation',
      'coreMotivation', 'motive', 'reason', 'goal', 'drive', 'dream', 'ambition', 'desire',
      'growthArc', 'hiddenTraits', 'weaknesses', 'evolution', 'development',
      'role', 'relationshipWithProtagonist', 'conflict',
      // 世界观相关
      'era', 'geography', 'history', 'socialStructure', 'technology',
      'powerSystem', 'worldBuilding', 'setting',
      // 灵感/简介相关
      'hook', 'coreSellingPoint', 'targetAudience', 'shortIntro', 'fullIntro',
      'synopsis', 'sellingPoint', 'differentiation', 'readerAppeal',
      // 大纲/剧情相关
      'storyOrigin', 'ending', 'coreObjective', 'openingNode', 'climaxNode',
      'coreConflict', 'stage', 'phase',
      // 事件/节点相关
      'event', 'timeline', 'features', 'region', 'highlight', 'impact',
      'chapter', 'position', 'chapterRange', 'endHook',
      // 能力/势力相关
      'ability', 'type', 'territory', 'leader', 'strength', 'structure',
      'style', 'writingStyle', 'level', 'levels',
      // 能力体系相关
      'coreFunctions', 'abilities', 'limitations', 'sideEffects', 'upgradeSystem',
      'activationCondition', 'triggerCondition',
      // 章节相关
      'shuangPoint', 'shuangPoints', 'hook_end',
      // 写作风格
      'tone', 'pace', 'voice',
    ]
    for (const field of textFields) {
      const fieldValue = obj[field]
      if (typeof fieldValue === 'string' && fieldValue.trim()) {
        return fieldValue
      }
    }
    // 如果找不到文本字段，尝试提取所有字符串值
    const entries = Object.entries(obj)
      .filter(([, v]) => typeof v === 'string' && v.trim())
      .map(([k, v]) => `${k}: ${v}`)
    if (entries.length > 0) {
      return entries.join('；')
    }
    // 最后兜底：返回空字符串，不显示原始 JSON
    return ''
  }

  return String(val)
}

/**
 * 清理显示文本中的占位符和空值标记
 * 用于所有步骤组件的显示值处理，确保用户看到的是真实内容而非占位符
 */
export function cleanDisplayText(val: unknown): string {
  // 先提取文本
  const text = extractText(val)
  if (!text) return ''

  return text
    // ⚠️ 关键：必须先移除包含XXXX的括号/范围表达式，再替换剩余的XXXX
    .replace(/（公元\s*XXXX[^）]*）/gi, '')
    .replace(/（[^）]*XXXX[^）]*）/g, '')
    .replace(/公元\s*XXXX\s*年[—\-—]\s*公元\s*XXXX\s*年/g, '')
    .replace(/公元\s*XXXX\s*年/g, '')
    .replace(/XXXX+/gi, '未详')
    .replace(/某某/g, '')
    .replace(/待定|未知|暂未确定/g, '')
    .replace(/\s*（\s*）/g, '')
    .replace(/\s*\(\s*\)\s*/g, '')
    .trim()
}

/**
 * 安全地将任意值转为字符串显示，处理对象/数组/空值
 */
export function safeDisplay(val: unknown, fallback: string = ''): string {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'string') return val.trim() || fallback
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  const text = cleanDisplayText(val)
  return text || fallback
}