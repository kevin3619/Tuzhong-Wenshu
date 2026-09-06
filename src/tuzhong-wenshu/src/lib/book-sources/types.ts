/**
 * 小说数据源统一类型定义
 * 所有数据源API都必须返回此格式
 */

export interface BookCharacter {
  name: string
  role: string
  note?: string
  position?: string
  description?: string
}

export interface BookVolume {
  name: string
  chapterCount?: number
  summary?: string
  /** 别名：卷名（兼容字段） */
  title?: string
  /** 别名：卷描述（兼容字段） */
  description?: string
}

export interface SixStageOutline {
  stage1MortalRise?: string
  stage2ContinentalPeak?: string
  stage3GodEntry?: string
  stage4SupremePlane?: string
  stage5GodClash?: string
  stage6Transcendence?: string
}

export interface BookSourceData {
  /** 书名 */
  title: string
  /** 作者 */
  author: string
  /** 一级分类（玄幻/仙侠/都市等） */
  genre: string
  /** 二级分类（异世大陆/修真文明等） */
  subGenre?: string
  /** 连载状态 */
  status: '连载中' | '已完结' | string
  /** 总章节数（数字） */
  totalChapters?: number
  /** 总字数（字符串，如"208.8万字"） */
  totalWords?: string
  /** 总字数（数字，万字） */
  wordCountWan?: number
  /** 简介 */
  synopsis?: string
  /** 封面URL */
  cover?: string
  /** 标签数组 */
  tags: string[]
  /** 角色列表 */
  characters: BookCharacter[]
  /** 主角信息 */
  protagonist?: { name: string; description: string; aliases?: string[] }
  /** 女主信息 */
  femaleLead?: { name: string; description: string; aliases?: string[] }
  /** 分卷信息 */
  volumes?: BookVolume[]
  /** 数据源名称 */
  source: string
  /** 数据源URL */
  sourceUrl?: string
  /** 数据源置信度（0-100，越高越可信） */
  confidence: number
  /** 平台（起点/纵横/番茄/七猫等） */
  platform?: string
  /** 最后更新时间 */
  lastUpdate?: string
  /** 上榜信息 */
  rankingInfo?: string
  /** 写作风格描述 */
  writingStyle?: string
  /** 核心卖点 */
  sellingPoints?: string[]
  /** 世界观描述 */
  worldBuilding?: string
  /** 力量体系描述 */
  powerSystem?: string
  /** 六阶段主线大纲 */
  sixStageOutline?: SixStageOutline
  /** 角色功能定位原型 */
  characterArchetypes?: Record<string, unknown>
  /** 关键剧情节点 */
  keyPlotNodes?: unknown[]
  /** 势力结构 */
  factions?: Record<string, unknown>
  /** 多层级世界观框架 */
  worldFramework?: Record<string, unknown>
  /** 金手指模型 */
  goldenFinger?: Record<string, unknown>
  /** 数据准确性说明 */
  accuracyNote?: string
  /** 原始数据（用于调试） */
  _raw?: unknown
  /** 别名：总字数数字（兼容字段，部分数据源返回此字段名） */
  wordCount?: number | string
  /** 别名：总章节数（兼容字段，部分数据源返回此字段名） */
  chapterCount?: number
  /** 别名：简介（兼容字段，部分数据源返回此字段名） */
  description?: string
  /** 别名：角色列表（兼容字段，部分数据源返回此字段名） */
  chars?: BookCharacter[]
  /** 别名：主角姓名（兼容字段，从protagonist.name派生） */
  protagonistName?: string
}

export interface BookSourceProvider {
  /** 数据源唯一标识 */
  id: string
  /** 数据源名称 */
  name: string
  /** 数据源置信度基准（0-100） */
  baseConfidence: number
  /** 是否启用 */
  enabled: boolean

  /**
   * 搜索书籍
   * @param bookName 书名
   * @param options 搜索选项
   */
  searchBook(bookName: string, options?: SearchOptions): Promise<BookSourceData | null>

  /**
   * 测试数据源是否可用
   */
  testConnection?(): Promise<boolean>
}

export interface SearchOptions {
  /** 作者名（精确匹配用） */
  author?: string
  /** 平台过滤 */
  platform?: string
  /** 超时时间（毫秒） */
  timeout?: number
  /** 是否只获取基础信息（更快） */
  basicInfoOnly?: boolean
}

export interface BookSourceManagerConfig {
  /** 数据源优先级（按id排序，靠前的优先使用） */
  priority: string[]
  /** 是否启用自动切换 */
  autoFallback: boolean
  /** 单个数据源超时时间（毫秒） */
  timeout: number
  /** 是否启用数据融合（多源交叉验证） */
  enableFusion: boolean
}

export interface FusionResult {
  data: BookSourceData
  /** 各字段的数据来源 */
  fieldSources: Record<string, string>
  /** 参与融合的数据源列表 */
  sources: string[]
}
