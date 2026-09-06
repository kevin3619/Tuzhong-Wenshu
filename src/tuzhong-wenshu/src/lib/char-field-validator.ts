// 角色字段类型校验工具（自研核心代码，软著原创）
// 拦截AI回传布尔值/非法类型赋值，防止动态挂载属性报错

// 判断值是否为非法布尔占位
function isBoolPlaceholder(val: unknown): boolean {
  if (val === true || val === false) return true
  return false
}

// 判断值是否为合法对象容器
function isPlainObj(val: unknown): boolean {
  if (val === null || val === undefined) return false
  if (typeof val !== 'object') return false
  if (Array.isArray(val)) return false
  return true
}

// 安全获取字符串字段，遇布尔值返回空串
export function safeStrField(rawVal: unknown): string {
  if (rawVal === null || rawVal === undefined) return ''
  if (isBoolPlaceholder(rawVal)) return ''
  if (typeof rawVal === 'string') return rawVal.trim()
  if (typeof rawVal === 'number') return String(rawVal)
  return ''
}

// 安全获取对象字段，遇布尔值返回空对象
export function safeObjField(rawVal: unknown): Record<string, unknown> {
  if (isPlainObj(rawVal)) return rawVal as Record<string, unknown>
  return {}
}

// 安全获取数组字段，遇布尔值返回空数组
export function safeArrField(rawVal: unknown): unknown[] {
  if (Array.isArray(rawVal)) return rawVal
  return []
}

// 安全获取数值字段，遇布尔值返回0
export function safeNumField(rawVal: unknown): number {
  if (rawVal === null || rawVal === undefined) return 0
  if (isBoolPlaceholder(rawVal)) return 0
  if (typeof rawVal === 'number') return rawVal
  if (typeof rawVal === 'string') {
    const parsed = parseInt(rawVal, 10)
    if (isNaN(parsed)) return 0
    return parsed
  }
  return 0
}

// 角色属性面板安全初始化（性格、外貌、技能、专属天赋全部字段兜底）
export function safeCharAttrInit(rawAttrs: unknown): Record<string, number> {
  const defaultAttrs: Record<string, number> = {
    strength: 50,
    intelligence: 50,
    command: 50,
    politics: 50,
    charm: 50,
  }
  if (!isPlainObj(rawAttrs)) return defaultAttrs
  const input = rawAttrs as Record<string, unknown>
  const cleaned: Record<string, number> = {}
  const attrKeys = ['strength', 'intelligence', 'command', 'politics', 'charm']
  for (let i = 0; i < attrKeys.length; i++) {
    const key = attrKeys[i]
    cleaned[key] = safeNumField(input[key])
    if (cleaned[key] === 0) cleaned[key] = defaultAttrs[key]
  }
  return cleaned
}

// 角色对象全字段安全包装（拦截所有布尔值非法赋值）
export function wrapCharSafe(rawChar: unknown): Record<string, unknown> {
  if (!isPlainObj(rawChar)) {
    return {
      name: '',
      age: 0,
      gender: '',
      identity: '',
      appearance: '',
      personality: '',
      background: '',
      motivation: '',
      coreMotivation: '',
      skills: [],
      hiddenTraits: '',
      weaknesses: '',
      growthArc: '',
      classicLines: [],
      attributes: { strength: 50, intelligence: 50, command: 50, politics: 50, charm: 50 },
    }
  }
  const char = rawChar as Record<string, unknown>
  return {
    name: safeStrField(char.name),
    age: safeNumField(char.age),
    gender: safeStrField(char.gender),
    identity: safeStrField(char.identity),
    role: safeStrField(char.role),
    appearance: safeStrField(char.appearance),
    // 性格字段类型拦截：布尔值自动替换为空文本
    personality: safeStrField(char.personality),
    background: safeStrField(char.background),
    motivation: safeStrField(char.motivation),
    coreMotivation: safeStrField(char.coreMotivation),
    skills: safeArrField(char.skills),
    hiddenTraits: safeStrField(char.hiddenTraits),
    weaknesses: safeStrField(char.weaknesses),
    growthArc: safeStrField(char.growthArc),
    classicLines: safeArrField(char.classicLines),
    description: safeStrField(char.description),
    // 属性面板字段类型拦截：布尔值替换为默认数值面板
    attributes: safeCharAttrInit(char.attributes),
  }
}