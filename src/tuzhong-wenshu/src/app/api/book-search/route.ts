/**
 * 拆书搜索API - 数据源驱动版（V4）
 *
 * 重构目标：解决 AI 智能拆解每次输出结果不同、数据不正确的问题
 * 架构变更：删除 LLM 拆解，改为数据源文件驱动（821 本全网爆款网文）
 *
 * 数据源优先级（从高到低）：
 * 1. 用户已确认数据（confirmed-storage，100% 准确）
 * 2. 数据源文件（novels-database，821 本全网爆款网文，100% 准确）
 *
 * 删除的逻辑：
 * - LLM_DIRECT_ANALYSIS_PROMPT 提示词模板
 * - analyzeBookWithLLM 函数
 * - fixLLMJsonString JSON 修复函数
 * - callLLM / callLLMWithFallback / SILICONFLOW_MODELS 等 LLM 调用
 * - 知名小说库（famous-novels）层数据查询（V4 删除）
 *
 * 新增功能：
 * - GET 接口支持浏览/筛选数据源（mode=browse&genre=xxx&page=1&pageSize=20）
 * - GET 接口支持关键词搜索（mode=search&keyword=xxx）
 * - GET 接口返回数据源统计信息（mode=stats）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getConfirmedBook } from '@/lib/book-sources/confirmed-storage'
import {
  getAllNovels,
  searchNovels,
  getNovelByExactName,
  getNovelsByGenre,
  getGenreList,
  getDatabaseStats,
  type NovelRecord,
} from '@/lib/book-sources/novels-database'
import bookSourceManager from '@/lib/book-sources/manager'
import type { BookSourceData } from '@/lib/book-sources/types'
import { checkRateLimit, getClientIpFromRequest } from '@/lib/rate-limit'

interface BookData {
  title: string
  author: string
  genre: string
  status: string
  chapterCount: string
  wordCount: string
  synopsis: string
  cover?: string
  tags: string[]
  characters: Array<{ name: string; role: string; note: string; position?: string; description?: string }>
  volumes?: string[]
  source: string
  sourceUrl?: string
  structure: string
  sellingPoints: string[]
  worldBuilding: string
  powerSystem: string
  writingStyle: string
  targetAudience?: string
  keywords: string[]
  accuracyNote?: string
  confidence?: number
  platform?: string
  sixStageOutline?: unknown
  characterArchetypes?: unknown
  keyPlotNodes?: unknown[]
  factions?: unknown
  worldFramework?: unknown
  goldenFinger?: unknown
  totalChapters?: number
  totalWords?: string
  protagonistInfo?: { name: string; description: string; aliases: string[]; background?: string; personality?: string }
  femaleLeadInfo?: { name: string; description: string; aliases: string[] }
  originalDetails?: unknown
}

/**
 * 将用户已确认数据转换为 API 返回格式
 */
interface ConfirmedBookData {
  title?: string
  author?: string
  genre?: string
  status?: string
  totalChapters?: number
  totalWords?: string
  synopsis?: string
  tags?: string[]
  sellingPoints?: string[]
  worldBuilding?: string
  powerSystem?: string
  writingStyle?: string
  protagonistName?: string
  protagonistDescription?: string
  femaleLeadName?: string
  femaleLeadDescription?: string
}

function convertConfirmedToApiFormat(confirmed: ConfirmedBookData): BookData {
  const chapters = confirmed.totalChapters || 0
  const words = confirmed.totalWords || ''

  const protagonistInfo = confirmed.protagonistName ? {
    name: confirmed.protagonistName,
    description: confirmed.protagonistDescription || '',
    aliases: [],
  } : undefined

  const femaleLeadInfo = confirmed.femaleLeadName ? {
    name: confirmed.femaleLeadName,
    description: confirmed.femaleLeadDescription || '',
    aliases: [],
  } : undefined

  return {
    title: confirmed.title || '',
    author: confirmed.author || '',
    genre: confirmed.genre || '',
    status: confirmed.status || '',
    chapterCount: chapters > 0 ? String(chapters) + '章' : '',
    wordCount: words,
    totalChapters: chapters,
    totalWords: words,
    synopsis: confirmed.synopsis || '',
    tags: confirmed.tags || [],
    characters: [],
    source: '用户已确认',
    structure: '',
    sellingPoints: confirmed.sellingPoints || [],
    worldBuilding: confirmed.worldBuilding || '',
    powerSystem: confirmed.powerSystem || '',
    writingStyle: confirmed.writingStyle || '',
    keywords: (confirmed.tags || []).slice(0, 5),
    accuracyNote: '数据来自用户已确认，100% 准确',
    confidence: 100,
    protagonistInfo,
    femaleLeadInfo,
  }
}

/**
 * 将数据源记录转换为 API 返回格式
 * 数据源字段：title/author/genre/status/chapterCount/wordCount/protagonist/femaleLead/
 *            synopsis/worldBuilding/powerSystem/sellingPoints/writingStyle/primaryGenre/tags
 */
function convertNovelsDatabaseToApiFormat(record: NovelRecord): BookData {
  const chapters = record.chapterCount || 0
  const words = record.wordCount || ''
  // 核心卖点：原始字段是逗号分隔字符串，转换为数组
  const sellingPointsArr = (record.sellingPoints || '')
    .split(/[、,，]/)
    .map(s => s.trim())
    .filter(Boolean)
  // 标签：优先用解析的 tags，兜底用 primaryGenre
  const tagsArr = record.tags && record.tags.length > 0 ? record.tags : [record.primaryGenre]

  const protagonistInfo = record.protagonist && record.protagonist.name ? {
    name: record.protagonist.name,
    description: record.protagonist.description || '',
    aliases: [],
    background: record.protagonist.description || '',
    personality: '',
  } : undefined

  const femaleLeadInfo = record.femaleLead && record.femaleLead.name ? {
    name: record.femaleLead.name,
    description: record.femaleLead.description || '',
    aliases: [],
  } : undefined

  // 角色列表：主角 + 女主（数据源没有完整角色列表，只提供这两个核心角色）
  const characters: Array<{ name: string; role: string; note: string; position?: string; description?: string }> = []
  if (record.protagonist && record.protagonist.name) {
    characters.push({
      name: record.protagonist.name,
      role: '主角',
      note: record.protagonist.description || '',
      position: '主角',
      description: record.protagonist.description || '',
    })
  }
  if (record.femaleLead && record.femaleLead.name) {
    characters.push({
      name: record.femaleLead.name,
      role: '女主',
      note: record.femaleLead.description || '',
      position: '女主',
      description: record.femaleLead.description || '',
    })
  }

  return {
    title: record.title,
    author: record.author || '',
    genre: record.primaryGenre || record.genre || '',
    status: record.status || '',
    chapterCount: chapters > 0 ? String(chapters) + '章' : '',
    wordCount: words,
    totalChapters: chapters,
    totalWords: words,
    synopsis: record.synopsis || '',
    tags: tagsArr,
    characters,
    source: '数据源文件',
    sourceUrl: '',
    structure: '',
    sellingPoints: sellingPointsArr,
    worldBuilding: record.worldBuilding || '',
    powerSystem: record.powerSystem || '',
    writingStyle: record.writingStyle || '',
    keywords: tagsArr.slice(0, 5),
    accuracyNote: '数据来自数据源文件（全网爆款网文合集），100% 准确',
    confidence: 100,
    protagonistInfo,
    femaleLeadInfo,
    originalDetails: {
      protagonist: record.protagonist ? {
        name: record.protagonist.name,
        aliases: [],
        background: record.protagonist.description || '',
      } : undefined,
      femaleLead: record.femaleLead ? {
        name: record.femaleLead.name,
        aliases: [],
        background: record.femaleLead.description || '',
      } : undefined,
      worldview: record.worldBuilding ? { worldBuilding: record.worldBuilding } : undefined,
      cultivationSystem: record.powerSystem,
      powerSystem: record.powerSystem,
      importantCharacters: characters,
      writingStyle: record.writingStyle,
    },
  }
}

/**
 * 生成兜底基础数据（数据源中未找到时使用）
 */
function buildFallbackData(bookName: string, debugInfo?: string): BookData {
  return {
    title: bookName,
    author: '',
    genre: '',
    status: '',
    chapterCount: '',
    wordCount: '',
    synopsis: `《${bookName}》未在数据源中找到。数据源共收录 ${getDatabaseStats().total} 本全网爆款网文，请尝试搜索数据源中的作品，或选择"浏览数据源"按钮从列表中选择。`,
    tags: [],
    characters: [],
    source: '未找到',
    structure: '',
    sellingPoints: [],
    worldBuilding: '',
    powerSystem: '',
    writingStyle: '',
    keywords: [],
    accuracyNote: debugInfo || '该书不在数据源中，请从数据源浏览列表中选择作品',
    confidence: 0,
  }
}

/**
 * 将 BookSourceData（多源融合抓取结果）转换为 API 返回格式
 * 🔥 P2.1.1-P2.1.4 修复：数据源未命中时调用 bookSourceManager 动态抓取百度百科等数据
 * 确保作者、类型、字数、章节数等关键字段有值，避免拆书结果字段为空
 */
function convertBookSourceDataToApiFormat(src: BookSourceData, bookName: string): BookData {
  const totalChapters = src.totalChapters || 0
  const totalWords = src.totalWords || ''

  const characters: Array<{ name: string; role: string; note: string; position?: string; description?: string }> = []
  if (src.characters && src.characters.length > 0) {
    for (const c of src.characters) {
      characters.push({
        name: c.name,
        role: c.role,
        note: c.note || c.description || '',
        position: c.position || c.role,
        description: c.description || c.note || '',
      })
    }
  }
  if (src.protagonist && src.protagonist.name && !characters.some(c => c.name === src.protagonist!.name)) {
    characters.push({
      name: src.protagonist.name,
      role: '主角',
      note: src.protagonist.description || '',
      position: '主角',
      description: src.protagonist.description || '',
    })
  }
  if (src.femaleLead && src.femaleLead.name && !characters.some(c => c.name === src.femaleLead!.name)) {
    characters.push({
      name: src.femaleLead.name,
      role: '女主',
      note: src.femaleLead.description || '',
      position: '女主',
      description: src.femaleLead.description || '',
    })
  }

  const tagsArr = src.tags && src.tags.length > 0 ? src.tags : (src.genre ? [src.genre] : [])
  const sellingPointsArr = src.sellingPoints || []

  return {
    title: src.title || bookName,
    author: src.author || '',
    genre: src.genre || src.subGenre || '',
    status: src.status || '',
    chapterCount: totalChapters > 0 ? String(totalChapters) + '章' : (src.totalChapters ? String(src.totalChapters) + '章' : ''),
    wordCount: totalWords,
    totalChapters: totalChapters || src.totalChapters,
    totalWords: totalWords,
    synopsis: src.synopsis || '',
    tags: tagsArr,
    characters,
    source: src.source || '动态抓取',
    sourceUrl: src.sourceUrl,
    structure: '',
    sellingPoints: sellingPointsArr,
    worldBuilding: src.worldBuilding || '',
    powerSystem: src.powerSystem || '',
    writingStyle: src.writingStyle || '',
    keywords: tagsArr.slice(0, 5),
    accuracyNote: src.accuracyNote || '数据来自网络抓取（百度百科/360/搜狗等多源融合）',
    confidence: src.confidence || 70,
    platform: src.platform,
    protagonistInfo: src.protagonist ? {
      name: src.protagonist.name,
      description: src.protagonist.description || '',
      aliases: src.protagonist.aliases || [],
    } : undefined,
    femaleLeadInfo: src.femaleLead ? {
      name: src.femaleLead.name,
      description: src.femaleLead.description || '',
      aliases: src.femaleLead.aliases || [],
    } : undefined,
    originalDetails: {
      protagonist: src.protagonist ? {
        name: src.protagonist.name,
        aliases: src.protagonist.aliases || [],
        background: src.protagonist.description || '',
      } : undefined,
      femaleLead: src.femaleLead ? {
        name: src.femaleLead.name,
        aliases: src.femaleLead.aliases || [],
        background: src.femaleLead.description || '',
      } : undefined,
      worldview: src.worldBuilding ? { worldBuilding: src.worldBuilding } : undefined,
      cultivationSystem: src.powerSystem,
      powerSystem: src.powerSystem,
      importantCharacters: characters,
      writingStyle: src.writingStyle,
    },
  }
}

/**
 * 统一构造响应数据
 */
function buildResponse(data: BookData, sourceName: string, confidence: number, allSources?: Array<{ source: string; confidence: number; author: string; totalWords: string; totalChapters: number; genre: string; status: string; synopsis: string }>) {
  return {
    success: true,
    data,
    source: sourceName,
    confidence,
    allSources: allSources || [{
      source: sourceName,
      confidence,
      author: data.author || '',
      totalWords: data.totalWords || data.wordCount || '',
      totalChapters: data.totalChapters || 0,
      genre: data.genre || '',
      status: data.status || '',
      synopsis: (data.synopsis || '').substring(0, 200),
    }],
  }
}

// ======== 主 API ========

/**
 * POST 接口：按书名搜索拆书
 * 请求体：{ bookName: string, author?: string }
 * 响应：{ success: boolean, data: BookData, source: string, confidence: number }
 */
export async function POST(req: NextRequest) {
  try {
    // 修复 v6 M9：拆书搜索接口速率限制（每IP每分钟 10 次）
    const clientIp = getClientIpFromRequest(req)
    const rateLimitKey = 'book-search:' + clientIp
    const rateLimitResult = checkRateLimit(rateLimitKey, 10, 60 * 1000, 60 * 1000)
    if (!rateLimitResult.allowed) {
      return NextResponse.json({
        success: false,
        error: '请求过于频繁，请稍后再试',
      }, {
        status: 429,
        headers: rateLimitResult.retryAfterSec ? { 'Retry-After': String(rateLimitResult.retryAfterSec) } : {}
      })
    }

    const text = await req.text()
    console.log('[book-search POST] 请求体原始内容:', text)

    let body: { bookName?: string; author?: string } = {}
    try {
      body = JSON.parse(text)
    } catch (e) {
      console.error('[book-search POST] JSON 解析失败:', e)
      return NextResponse.json({
        success: false,
        error: '请求格式错误',
      }, { status: 400 })
    }

    const { bookName } = body

    if (!bookName || !bookName.trim()) {
      return NextResponse.json({
        success: false,
        error: '请输入小说名称',
      }, { status: 400 })
    }

    // 修复 v4 M4：输入长度与字符集校验，防止 SSRF 和资源滥用
    const rawName = String(bookName).trim()
    if (rawName.length > 50) {
      return NextResponse.json({
        success: false,
        error: '小说名称过长（限50字符）',
      }, { status: 400 })
    }
    // 禁止包含 URL/协议/特殊控制字符，防止 SSRF
    if (/^(https?:\/\/|ftp:\/\/|file:\/\/|\/\/)/i.test(rawName) || /[\x00-\x1f\x7f]/.test(rawName)) {
      return NextResponse.json({
        success: false,
        error: '小说名称包含非法字符',
      }, { status: 400 })
    }

    const searchName = rawName
    console.log(`[book-search POST] 搜索小说: ${searchName.slice(0, 30)}`)

    // ===== 第一层：用户已确认数据（100% 准确） =====
    try {
      const confirmedBook = getConfirmedBook(searchName)
      if (confirmedBook) {
        console.log(`[book-search POST] ✅ 命中用户已确认数据: ${confirmedBook.title}`)
        const apiResult = convertConfirmedToApiFormat(confirmedBook)
        const responseData = buildResponse(apiResult, '用户已确认', 100)
        return new NextResponse(JSON.stringify(responseData), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        })
      }
    } catch (e) {
      console.log('[book-search POST] 已确认数据检查失败:', e instanceof Error ? e.message : String(e))
    }

    // ===== 第二层：数据源文件（821 本全网爆款网文，100% 准确） =====
    const dbMatch = getNovelByExactName(searchName)
    if (dbMatch) {
      console.log(`[book-search POST] ✅ 命中数据源文件: ${dbMatch.title} (ID: ${dbMatch.id})`)
      const apiResult = convertNovelsDatabaseToApiFormat(dbMatch)
      const responseData = buildResponse(apiResult, '数据源文件', 100)
      return new NextResponse(JSON.stringify(responseData), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    }

    // ===== 兜底：未找到 → 🔥 P2.1.1-P2.1.4 修复：调用 bookSourceManager 动态抓取 =====
    console.log(`[book-search POST] ⚠️ 数据源中未找到: ${searchName}，启动动态抓取（百度百科/360/搜狗等多源融合）...`)
    try {
      // 设置 13 秒超时（满足项目硬约束"搜索和提取必须15秒内完成"）
      const dynamicResult = await bookSourceManager.searchBook(searchName, { timeout: 13000 })
      if (dynamicResult && dynamicResult.title && (dynamicResult.author || dynamicResult.synopsis || dynamicResult.genre)) {
        console.log(`[book-search POST] ✅ 动态抓取成功: ${dynamicResult.title} (作者: ${dynamicResult.author || '未知'}, 来源: ${dynamicResult.source})`)
        const apiResult = convertBookSourceDataToApiFormat(dynamicResult, searchName)
        const responseData = buildResponse(apiResult, dynamicResult.source || '动态抓取', dynamicResult.confidence || 70)
        return new NextResponse(JSON.stringify(responseData), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        })
      } else {
        console.log(`[book-search POST] ❌ 动态抓取未返回有效数据`)
      }
    } catch (dynamicErr) {
      console.warn(`[book-search POST] 动态抓取失败:`, dynamicErr instanceof Error ? dynamicErr.message : String(dynamicErr))
    }

    // ===== 最终兜底：动态抓取也失败，返回基础占位数据 =====
    console.log(`[book-search POST] ❌ 所有数据源均未找到: ${searchName}`)
    const fallback = buildFallbackData(searchName, `《${searchName}》不在数据源中（共${getDatabaseStats().total}本），且动态抓取未返回有效数据。请点击"浏览数据源"按钮从列表中选择作品`)
    const responseData = buildResponse(fallback, '未找到', 0)
    return new NextResponse(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })

  } catch (error) {
    console.error('[book-search POST] 错误:', error)
    return new NextResponse(JSON.stringify({
      success: false,
      error: '搜索失败，请稍后重试',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }
}

/**
 * GET 接口：数据源浏览/搜索/统计
 *
 * 查询参数：
 * - mode=browse     浏览数据源（分页+类型筛选），返回书籍列表
 *   - genre: 类型筛选（可选，如"仙侠"/"都市"）
 *   - page: 页码（默认1）
 *   - pageSize: 每页数量（默认20，最大100）
 * - mode=search     关键词搜索数据源，返回匹配的书籍列表
 *   - keyword: 搜索关键词（书名/作者/类型）
 * - mode=stats      返回数据源统计信息（总数、类型列表）
 * - mode=detail     返回单本书详情
 *   - name: 书名
 * - 无 mode 或 mode=sources  返回数据源信息列表
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const mode = searchParams.get('mode') || 'sources'

    // ===== 模式1：数据源统计信息 =====
    if (mode === 'stats') {
      const stats = getDatabaseStats()
      return NextResponse.json({
        success: true,
        mode: 'stats',
        total: stats.total,
        genres: stats.genres,
        error: stats.error,
      })
    }

    // ===== 模式2：浏览数据源（分页+类型筛选） =====
    if (mode === 'browse') {
      const genre = searchParams.get('genre') || '全部'
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10) || 20))

      const allMatched = genre === '全部' ? getAllNovels() : getNovelsByGenre(genre)
      const total = allMatched.length
      const startIdx = (page - 1) * pageSize
      const pageItems = allMatched.slice(startIdx, startIdx + pageSize)

      return NextResponse.json({
        success: true,
        mode: 'browse',
        genre,
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        genres: getGenreList(),
        items: pageItems.map(n => ({
          id: n.id,
          title: n.title,
          author: n.author,
          primaryGenre: n.primaryGenre,
          genre: n.genre,
          status: n.status,
          chapterCount: n.chapterCount,
          wordCount: n.wordCount,
          tags: n.tags,
        })),
      })
    }

    // ===== 模式3：关键词搜索数据源 =====
    if (mode === 'search') {
      const keyword = searchParams.get('keyword') || ''
      if (!keyword.trim()) {
        return NextResponse.json({
          success: false,
          error: '请提供 keyword 参数',
        }, { status: 400 })
      }
      const matched = searchNovels(keyword)
      return NextResponse.json({
        success: true,
        mode: 'search',
        keyword,
        total: matched.length,
        items: matched.map(n => ({
          id: n.id,
          title: n.title,
          author: n.author,
          primaryGenre: n.primaryGenre,
          genre: n.genre,
          status: n.status,
          chapterCount: n.chapterCount,
          wordCount: n.wordCount,
          tags: n.tags,
        })),
      })
    }

    // ===== 模式4：单本书详情 =====
    if (mode === 'detail') {
      const name = searchParams.get('name') || searchParams.get('bookName')
      if (!name || !name.trim()) {
        return NextResponse.json({
          success: false,
          error: '请提供 name 参数',
        }, { status: 400 })
      }
      const record = getNovelByExactName(name)
      if (!record) {
        return NextResponse.json({
          success: false,
          error: `未在数据源中找到《${name}》`,
        }, { status: 404 })
      }
      const apiResult = convertNovelsDatabaseToApiFormat(record)
      const responseData = buildResponse(apiResult, '数据源文件', 100)
      return new NextResponse(JSON.stringify(responseData), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    }

    // ===== 默认：返回数据源信息列表 =====
    const stats = getDatabaseStats()
    return NextResponse.json({
      success: true,
      mode: 'sources',
      sources: [
        { id: 'confirmed', name: '用户已确认数据', baseConfidence: 100, enabled: true },
        { id: 'famous', name: '知名小说库', baseConfidence: 100, enabled: true },
        { id: 'database', name: '数据源文件', baseConfidence: 100, enabled: true, total: stats.total },
      ],
      stats: {
        total: stats.total,
        genres: stats.genres,
        error: stats.error,
      },
    })

  } catch (error) {
    console.error('[book-search GET] 错误:', error)
    return new NextResponse(JSON.stringify({
      success: false,
      error: '查询失败，请稍后重试',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }
}
