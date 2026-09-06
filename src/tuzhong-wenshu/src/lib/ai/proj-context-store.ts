/**
 * projGlobalContextStore — 途中文枢专属全局只读上下文池
 *
 * 软著自研命名。永久存储：
 * - 自定义模式：用户输入的主题、类型、时代背景、核心要求
 * - 仿写模式：拆书得到的原书结构、文风、叙事节奏、核心框架
 * - 前面所有环节生成的完整有效内容
 *
 * 每个AI请求强制携带此上下文池内容，禁止脱离上下文生成。
 */

export interface ProjGlobalContext {
  /** 创作类型：custom 或 imitate */
  mode: 'custom' | 'imitate'

  /** ===== 用户基础输入 ===== */
  /** 主题关键词 */
  keywords: string
  /** 小说类型 */
  genre: string
  /** 时代背景 */
  era: string
  /** 核心要求 */
  coreRequirements: string

  /** ===== 仿写模式专用 ===== */
  /** 原书结构描述 */
  imitateStructure?: string
  /** 原书文风 */
  imitateStyle?: string
  /** 原书叙事节奏 */
  imitatePace?: string
  /** 原书核心框架 */
  imitateFramework?: string
  /** 原书标题 */
  imitateTitle?: string

  /** ===== 各环节已生成内容 ===== */
  idea?: unknown
  synopsis?: unknown
  worldbuilding?: unknown
  powerSystem?: unknown
  characters?: unknown
  factions?: unknown
  relationships?: unknown
  outline?: unknown
  keyPlots?: unknown
  chapters?: unknown

  /** ===== 自定义扩展字段 ===== */
  extras?: Record<string, unknown>
}

/** 全局上下文池单例 */
let _globalContext: ProjGlobalContext | null = null

export function projInitContext(ctx: Partial<ProjGlobalContext>): void {
  _globalContext = {
    mode: ctx.mode || 'custom',
    keywords: ctx.keywords || '',
    genre: ctx.genre || '',
    era: ctx.era || '',
    coreRequirements: ctx.coreRequirements || '',
    ...ctx,
  }
}

export function projGetContext(): ProjGlobalContext | null {
  return _globalContext
}

/**
 * 更新某个环节的生成结果到上下文池
 */
export function projUpdateContext(step: string, data: unknown): void {
  if (!_globalContext) return
  ;(_globalContext as unknown as Record<string, unknown>)[step] = data
}

/**
 * 构建上下文摘要文本，用于注入Prompt
 * 返回适合嵌入提示词的精简上下文
 */
export function projBuildContextSummary(): string {
  if (!_globalContext) return ''

  const ctx = _globalContext
  const parts: string[] = []

  // 基础信息
  parts.push(`【创作主题】${ctx.keywords}`)
  parts.push(`【小说类型】${ctx.genre}`)
  parts.push(`【时代背景】${ctx.era}`)
  if (ctx.coreRequirements) parts.push(`【核心要求】${ctx.coreRequirements}`)

  // 仿写模式
  if (ctx.mode === 'imitate') {
    if (ctx.imitateTitle) parts.push(`【仿写原作】《${ctx.imitateTitle}》`)
    if (ctx.imitateStructure) parts.push(`【原作结构】${ctx.imitateStructure}`)
    if (ctx.imitateStyle) parts.push(`【原作文风】${ctx.imitateStyle}`)
    if (ctx.imitatePace) parts.push(`【叙事节奏】${ctx.imitatePace}`)
    if (ctx.imitateFramework) parts.push(`【核心框架】${ctx.imitateFramework}`)
  }

  // 已有设定摘要（精简版）
  if (ctx.worldbuilding) {
    const wb = ctx.worldbuilding as Record<string, unknown>
    parts.push(`【世界观】时代：${wb.era || '未定'}，地理：${(wb.geography || wb.setting || '').toString().slice(0, 60)}`)
  }
  if (ctx.powerSystem) {
    const ps = ctx.powerSystem as Record<string, unknown>
    parts.push(`【力量体系】${(ps.protagonistAbility || ps.name || '').toString().slice(0, 40)}`)
  }
  if (ctx.characters) {
    const chars = ctx.characters as Record<string, unknown>
    const names = [
      chars.protagonist as Record<string, unknown>,
      chars.femaleLead as Record<string, unknown>,
      chars.antagonist as Record<string, unknown>,
    ]
      .filter(Boolean)
      .map((c: unknown) => (c as Record<string, unknown>)?.name || '')
      .filter(Boolean)
    if (names.length > 0) parts.push(`【主要角色】${names.join('、')}`)
    if (chars.antagonists && Array.isArray(chars.antagonists)) {
      const antNames = (chars.antagonists as Array<Record<string, unknown>>)
        .map(a => a.name)
        .filter(Boolean)
        .join('、')
      if (antNames) parts.push(`【反派角色】${antNames}`)
    }
  }
  if (ctx.factions) {
    const facs = ctx.factions as Record<string, unknown>
    if (Array.isArray(facs.factions)) {
      const facNames = (facs.factions as Array<Record<string, unknown>>)
        .map(f => f.name)
        .filter(Boolean)
        .join('、')
      if (facNames) parts.push(`【主要势力】${facNames}`)
    }
  }

  return parts.join('\n')
}

/**
 * 重置上下文池
 */
export function projResetContext(): void {
  _globalContext = null
}