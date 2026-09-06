/**
 * 小说数据源解析模块（V4 - 实时数据源驱动版）
 *
 * 数据源文件：项目根目录 data/搜索拆书数据源.md（821 本全网爆款网文）
 *
 * 设计目标：
 * 1. 每次查询时检查文件 mtime，文件更新则重新加载（支持数据源随时更新）
 * 2. 兼容两种字段格式："字段：xxx"（1-300本）和 "**字段**：xxx"（325+本）
 * 3. 提供搜索、筛选、按名查询、按类型查询等接口
 * 4. 完全替代之前的 LLM 拆解模式，保证结果稳定可复现
 */

import fs from 'fs'
import path from 'path'

export interface NovelRecord {
  id: number
  title: string
  author: string
  genre: string
  status: string
  chapterCount: number
  wordCount: string
  protagonist: { name: string; description: string }
  femaleLead: { name: string; description: string }
  synopsis: string
  worldBuilding: string
  powerSystem: string
  sellingPoints: string
  writingStyle: string
  primaryGenre: string
  tags: string[]
}

// 缓存：数据源内容 + 文件路径 + 文件修改时间
let _database: NovelRecord[] | null = null
let _loadError: string | null = null
let _loadedPath: string = ''
let _loadedMtime: number = 0

/**
 * 解析单个小说文本块为结构化记录
 * 兼容 "字段：xxx" 和 "**字段**：xxx" 两种格式
 */
function parseBlock(block: string, id: number): NovelRecord | null {
  const lines = block.split('\n')
  const title = lines[0].trim()
  if (!title) return null

  // 字段名集合（用于判断字段边界）
  const fieldNames = ['作者', '类型', '状态', '章节数', '字数', '主角设定', '女主设定', '作品简介', '世界观', '力量体系', '核心卖点', '写作风格']

  // 提取字段值：兼容 "**字段**：xxx" 和 "字段：xxx"
  // 内容可能跨多行，直到遇到下一个字段标签或块结束
  const getField = (fieldName: string): string => {
    // 匹配 "**字段**：xxx" 或 "字段：xxx"，含可选前导空白
    const regex = new RegExp('(?:^|\\n)\\s*\\*{0,2}' + fieldName + '\\*{0,2}[：:]\\s*(.*)$', 'm')
    const match = block.match(regex)
    if (!match) return ''
    // match[0] 是整行（含前导换行和字段名），match[1] 是字段值的第一行
    const firstLine = match[1] || ''
    // 从 match.index + match[0].length 开始，收集后续行直到遇到下一个字段标签
    const startIdx = (match.index || 0) + match[0].length
    const rest = block.substring(startIdx)
    // 下一个字段标签正则
    const nextFieldRegex = new RegExp('\\n\\s*\\*{0,2}(' + fieldNames.join('|') + ')\\*{0,2}[：:]', 'm')
    const nextMatch = rest.match(nextFieldRegex)
    let content: string
    if (nextMatch && nextMatch.index !== undefined && nextMatch.index >= 0) {
      content = rest.substring(0, nextMatch.index)
    } else {
      content = rest
    }
    // 合并第一行和后续内容
    const fullContent = firstLine + '\n' + content
    return fullContent.replace(/^\n+|\n+$/g, '').trim()
  }

  // 解析角色字段：第一行是名字，后续行是描述
  const parseCharField = (fieldName: string): { name: string; description: string } => {
    const raw = getField(fieldName)
    if (!raw) return { name: '', description: '' }
    const rawLines = raw.split('\n').map(l => l.trim()).filter(Boolean)
    const name = rawLines[0] || ''
    const description = rawLines.slice(1).join(' ')
    return { name, description }
  }

  const author = getField('作者')
  const genre = getField('类型')
  const status = getField('状态')
  const chapterCountStr = getField('章节数')
  const wordCount = getField('字数')
  const protagonist = parseCharField('主角设定')
  const femaleLead = parseCharField('女主设定')
  const synopsis = getField('作品简介')
  const worldBuilding = getField('世界观')
  const powerSystem = getField('力量体系')
  const sellingPoints = getField('核心卖点')
  const writingStyle = getField('写作风格')

  const chapterCount = parseInt(chapterCountStr, 10) || 0
  // 主类型：取类型字段的第一个词（按 、,，空格 切分）
  const primaryGenre = genre.split(/[、,，\s]+/)[0] || '未知'
  const tags = genre.split(/[、,，]/).map(t => t.trim()).filter(Boolean)

  return {
    id,
    title,
    author,
    genre,
    status,
    chapterCount,
    wordCount,
    protagonist,
    femaleLead,
    synopsis,
    worldBuilding,
    powerSystem,
    sellingPoints,
    writingStyle,
    primaryGenre,
    tags,
  }
}

/**
 * 解析整个数据源文件为小说记录数组
 */
function parseNovelsDatabase(content: string): NovelRecord[] {
  const novels: NovelRecord[] = []
  // 按 "## N、书名：xxx" 切分（保留书名部分）
  // 使用正向预查，split 不会消费分隔符
  const headerRegex = /^## (\d+)、书名：/m
  const blocks: { id: number; content: string }[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(headerRegex.source, 'gm')
  let lastIndex = 0
  let lastId = 0
  while ((match = regex.exec(content)) !== null) {
    if (lastId > 0) {
      // 上一个块的内容
      const blockContent = content.substring(lastIndex, match.index)
      blocks.push({ id: lastId, content: blockContent })
    }
    lastId = parseInt(match[1], 10)
    lastIndex = match.index + match[0].length
  }
  // 最后一个块
  if (lastId > 0) {
    const blockContent = content.substring(lastIndex)
    blocks.push({ id: lastId, content: blockContent })
  }

  for (const block of blocks) {
    // block.content 第一行是书名（"## N、书名：" 已被切掉）
    // 但实际上我们的 split 方式保留了书名作为块内容的第一行
    // 重新拼接：书名是 "## N、书名：xxx" 中的 xxx，需要从原 content 中提取
    // 简化：block.content 的第一行就是书名（因为切掉了 "## N、书名：" 前缀）
    const novel = parseBlock(block.content, block.id)
    if (novel && novel.title) {
      novels.push(novel)
    }
  }
  return novels
}

/**
 * 定位数据源文件路径
 */
function resolveDatabasePath(): string | null {
  // 候选路径（按优先级尝试）：
  // 1. process.cwd()/../../data/搜索拆书数据源.md（process.cwd 是 src/tuzhong-wenshu）
  // 2. process.cwd()/../data/搜索拆书数据源.md
  // 3. process.cwd()/data/搜索拆书数据源.md
  // 4. __dirname 向上回溯到项目根 data 目录
  const candidates = [
    path.resolve(process.cwd(), '..', '..', 'data', '搜索拆书数据源.md'),
    path.resolve(process.cwd(), '..', 'data', '搜索拆书数据源.md'),
    path.resolve(process.cwd(), 'data', '搜索拆书数据源.md'),
    path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'data', '搜索拆书数据源.md'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch (e) {
      // 继续尝试下一个路径
    }
  }
  return null
}

/**
 * 加载数据源文件到内存（基于文件 mtime 的缓存策略）
 * - 每次调用时检查文件修改时间
 * - 文件未变更：使用缓存，避免重复解析
 * - 文件已变更：重新读取并解析，确保数据源更新立即生效
 */
function loadDatabase(): NovelRecord[] {
  const filePath = resolveDatabasePath()

  // 文件不存在
  if (!filePath) {
    _loadError = '无法定位数据源文件，尝试路径均不存在'
    console.error('[novels-database] ' + _loadError)
    _database = []
    return _database
  }

  // 获取文件修改时间
  let currentMtime: number
  try {
    const stat = fs.statSync(filePath)
    currentMtime = stat.mtimeMs
  } catch (e) {
    _loadError = `读取文件状态失败: ${e instanceof Error ? e.message : String(e)}`
    console.error('[novels-database] ' + _loadError)
    _database = []
    return _database
  }

  // 缓存命中：文件路径相同 + 修改时间未变 → 直接返回缓存
  if (_database && _loadedPath === filePath && _loadedMtime === currentMtime) {
    return _database
  }

  // 缓存未命中：重新读取并解析文件
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch (e) {
    _loadError = `读取数据源文件失败: ${e instanceof Error ? e.message : String(e)}`
    console.error('[novels-database] ' + _loadError)
    _database = []
    return _database
  }

  try {
    _database = parseNovelsDatabase(content)
    _loadedPath = filePath
    _loadedMtime = currentMtime
    _loadError = null
    console.log(`[novels-database] ✅ 加载成功: ${_database.length} 本小说，文件: ${filePath}，mtime: ${new Date(currentMtime).toISOString()}`)
    return _database
  } catch (e) {
    _loadError = `解析数据源文件失败: ${e instanceof Error ? e.message : String(e)}`
    console.error('[novels-database] ' + _loadError)
    _database = []
    return _database
  }
}

/**
 * 获取所有小说记录
 */
export function getAllNovels(): NovelRecord[] {
  return loadDatabase()
}

/**
 * 按关键词搜索小说（书名、作者、类型、标签模糊匹配）
 */
export function searchNovels(keyword: string): NovelRecord[] {
  const db = loadDatabase()
  if (!keyword.trim()) return db
  const kw = keyword.trim().toLowerCase()
  return db.filter(n =>
    n.title.toLowerCase().includes(kw) ||
    n.author.toLowerCase().includes(kw) ||
    n.genre.toLowerCase().includes(kw) ||
    n.tags.some(t => t.toLowerCase().includes(kw))
  )
}

/**
 * 按书名精确匹配（去除书名号、空格）
 */
export function getNovelByExactName(name: string): NovelRecord | null {
  const db = loadDatabase()
  if (!name.trim()) return null
  const clean = name.trim().replace(/[\s《》""'']/g, '')
  // 优先精确匹配
  let found = db.find(n =>
    n.title.replace(/[\s《》""'']/g, '') === clean
  )
  if (found) return found
  // 其次包含匹配（书名包含搜索词，或搜索词包含书名）
  found = db.find(n => {
    const nTitle = n.title.replace(/[\s《》""'']/g, '')
    return nTitle.includes(clean) || clean.includes(nTitle)
  })
  return found || null
}

/**
 * 按主类型筛选小说
 */
export function getNovelsByGenre(genre: string): NovelRecord[] {
  const db = loadDatabase()
  if (!genre.trim() || genre === '全部') return db
  const g = genre.trim().toLowerCase()
  return db.filter(n =>
    n.primaryGenre.toLowerCase().includes(g) ||
    n.tags.some(t => t.toLowerCase().includes(g))
  )
}

/**
 * 获取所有主类型列表（用于前端筛选标签）
 */
export function getGenreList(): string[] {
  const db = loadDatabase()
  const set = new Set<string>()
  db.forEach(n => {
    if (n.primaryGenre) set.add(n.primaryGenre)
  })
  return Array.from(set).sort()
}

/**
 * 获取加载错误信息（如有）
 */
export function getLoadError(): string | null {
  return _loadError
}

/**
 * 获取数据源统计信息
 */
export function getDatabaseStats(): { total: number; genres: string[]; error: string | null } {
  const db = loadDatabase()
  return {
    total: db.length,
    genres: getGenreList(),
    error: _loadError,
  }
}
