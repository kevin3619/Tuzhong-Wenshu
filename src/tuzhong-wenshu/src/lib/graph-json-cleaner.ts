// 人物图谱JSON预处理清洗工具（自研核心代码，软著原创）
// 自动清洗AI返回的Markdown表格、#注释、多余竖线/换行符
// 剔除非结构化冗余符号，规整为标准图谱JSON格式

// 清洗Markdown表格符号
function stripMarkdownTable(raw: string): string {
  let cleaned = raw
  // 去除Markdown表格分隔行（| --- | --- |）
  cleaned = cleaned.replace(/\|[\s\-:|]+\|/g, '')
  // 去除多余竖线前缀/后缀
  cleaned = cleaned.replace(/^\s*\|\s*/gm, '')
  cleaned = cleaned.replace(/\s*\|\s*$/gm, '')
  return cleaned
}

// 清洗Markdown标题和注释
function stripMarkdownHeadings(raw: string): string {
  let cleaned = raw
  // 去除 # 开头的标题行
  cleaned = cleaned.replace(/^#{1,6}\s+.*$/gm, '')
  // 去除 <!-- 注释 -->
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '')
  // 去除行内注释 //
  cleaned = cleaned.replace(/\/\/.*$/gm, '')
  return cleaned
}

// 清洗多余换行/空白
function stripExtraWhitespace(raw: string): string {
  let cleaned = raw
  // 合并连续空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  // 去除行首尾空白
  cleaned = cleaned.split('\n').map(function (line) { return line.trim() }).join('\n')
  return cleaned
}

// 提取JSON块（从AI返回的文本中提取JSON）
function extractJsonBlock(raw: string): string {
  let content = raw
  // 尝试匹配 ```json ... ``` 代码块
  const jsonBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    content = jsonBlockMatch[1]
  }
  // 尝试匹配 { 到 } 的JSON
  const braceStart = content.indexOf('{')
  const braceEnd = content.lastIndexOf('}')
  if (braceStart >= 0 && braceEnd > braceStart) {
    content = content.slice(braceStart, braceEnd + 1)
  }
  return content
}

// 预清洗Markdown格式的角色/势力表格输入
// 支持用户粘贴的表格角色资料
// 软著改造：增加兜底逻辑，防止过度清洗导致内容丢失
export function precleanRoleTableInput(rawInput: string): string {
  if (!rawInput) return ''
  let cleaned = rawInput
  // 去除Markdown表格分隔行
  cleaned = stripMarkdownTable(cleaned)
  // 去除#注释标题
  cleaned = stripMarkdownHeadings(cleaned)
  // 去除多余空白
  cleaned = stripExtraWhitespace(cleaned)
  const result = cleaned.trim()
  // 兜底：如果清洗后内容过短（少于10个字符），但原始输入较长，返回原始输入
  if (result.length < 10 && rawInput.trim().length > 10) {
    return rawInput.trim()
  }
  return result
}

// 图谱JSON清洗主方法
// 自动清洗AI返回的杂乱文本，输出标准JSON
export function cleanGraphJson(rawResponse: string): {
  runCheckTag: boolean
  cleanedJson: unknown
  promptMsg: string
} {
  if (!rawResponse || typeof rawResponse !== 'string') {
    return {
      runCheckTag: false,
      cleanedJson: { relationships: [] },
      promptMsg: 'AI返回数据为空',
    }
  }

  let cleaned = rawResponse
  // 去除Markdown标题
  cleaned = stripMarkdownHeadings(cleaned)
  // 去除Markdown表格
  cleaned = stripMarkdownTable(cleaned)
  // 去除多余空白
  cleaned = stripExtraWhitespace(cleaned)

  // 提取JSON内容
  const jsonContent = extractJsonBlock(cleaned)

  // 第一次解析尝试
  try {
    const parsed = JSON.parse(jsonContent)
    if (parsed && typeof parsed === 'object') {
      return {
        runCheckTag: true,
        cleanedJson: parsed,
        promptMsg: '',
      }
    }
  } catch (_err1) {
    // 第一次解析失败，尝试二次修正
  }

  // 二次修正：修复常见JSON格式问题
  const fixedContent = jsonContent
    // 修复单引号
    .replace(/'/g, '"')
    // 修复未加引号的key
    .replace(/(\{|\,)\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*\:/g, '$1"$2":')
    // 修复尾部多余逗号
    .replace(/,\s*\}/g, '}')
    .replace(/,\s*\]/g, ']')
    // 修复省略号/特殊字符
    .replace(/…/g, '...')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')

  try {
    const parsed2 = JSON.parse(fixedContent)
    if (parsed2 && typeof parsed2 === 'object') {
      return {
        runCheckTag: true,
        cleanedJson: parsed2,
        promptMsg: '内容格式异常，已自动优化内容',
      }
    }
  } catch (_err2) {
    // 二次修正也失败
  }

  // 最终兜底：返回空图谱结构
  return {
    runCheckTag: false,
    cleanedJson: { relationships: [] },
    promptMsg: '内容格式异常，已自动优化内容',
  }
}

// 图谱关系字段兜底容错
// 确保每个关系节点、关联字段都有默认值
export function safeGraphRelItem(rawRel: unknown): {
  from: string
  to: string
  type: string
  initialRelation: string
  development: string
  keyEvents: string
  emotionChange: string
  finalRelation: string
  description: string
} {
  if (!rawRel || typeof rawRel !== 'object') {
    return {
      from: '',
      to: '',
      type: '泛交',
      initialRelation: '',
      development: '',
      keyEvents: '',
      emotionChange: '',
      finalRelation: '',
      description: '',
    }
  }
  const rel = rawRel as Record<string, unknown>
  return {
    from: typeof rel.from === 'string' ? rel.from : '',
    to: typeof rel.to === 'string' ? rel.to : '',
    type: typeof rel.type === 'string' ? rel.type : '泛交',
    initialRelation: typeof rel.initialRelation === 'string' ? rel.initialRelation : '',
    development: typeof rel.development === 'string' ? rel.development : (typeof rel.description === 'string' ? rel.description : ''),
    keyEvents: typeof rel.keyEvents === 'string' ? rel.keyEvents : '',
    emotionChange: typeof rel.emotionChange === 'string' ? rel.emotionChange : '',
    finalRelation: typeof rel.finalRelation === 'string' ? rel.finalRelation : '',
    description: typeof rel.description === 'string' ? rel.description : '',
  }
}

// 增量合并图谱关系（旧关系保留，新关系追加，去重）
export function mergeGraphRelations(
  oldRels: Record<string, unknown>[],
  newRels: Record<string, unknown>[]
): Record<string, unknown>[] {
  const merged = oldRels.slice()
  if (!newRels || !Array.isArray(newRels)) return merged

  for (let i = 0; i < newRels.length; i++) {
    const newRel = safeGraphRelItem(newRels[i])
    // 去重：检查是否已存在相同from+to+type的关系
    let duplicate = false
    for (let j = 0; j < merged.length; j++) {
      const existing = merged[j]
      if (existing.from === newRel.from && existing.to === newRel.to && existing.type === newRel.type) {
        duplicate = true
        break
      }
    }
    if (!duplicate && newRel.from && newRel.to) {
      merged.push(newRel)
    }
  }
  return merged
}