/**
 * Firecrawl 数据源 - 基于 Firecrawl 的全网搜索与网页抓取
 * 
 * 功能：
 * 1. 全网搜索小说相关信息
 * 2. 抓取百科、小说站等页面内容
 * 3. 自动提取结构化数据（书名、作者、简介等）
 * 
 * 优势：
 * - 覆盖 96% 的网页，包括 JS 动态渲染的页面
 * - 自动返回干净的 Markdown 格式
 * - 支持 JSON 模式提取结构化数据
 * - 有免费额度（无 API Key 也可使用，有限速）
 */

import { BookSourceProvider, BookSourceData, SearchOptions } from './types'
import {
  createDefaultBook,
  stripHtml,
  extractAuthorFromText,
  extractGenreFromText,
  extractStatusFromText,
  extractTagsFromText,
  extractWordsFromText,
  extractChaptersFromText,
  isValidChineseName,
  isReasonableWords,
  isReasonableChapters,
} from './utils'

interface FirecrawlInstance {
  search(query: string, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  scrape(url: string, options?: Record<string, unknown>): Promise<Record<string, unknown>>
}

type FirecrawlConstructor = new (config: { apiKey?: string }) => FirecrawlInstance

let FirecrawlClass: FirecrawlConstructor | null = null

async function getFirecrawl() {
  if (!FirecrawlClass) {
    try {
      const mod = await import('firecrawl')
      FirecrawlClass = mod.Firecrawl as unknown as FirecrawlConstructor
    } catch (e) {
      console.warn('[FirecrawlSource] firecrawl 包未安装')
      return null
    }
  }
  return FirecrawlClass
}

const apiKey = process.env.FIRECRAWL_API_KEY || ''
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000

export class FirecrawlSource implements BookSourceProvider {
  id = 'firecrawl'
  name = 'Firecrawl全网搜索'
  baseConfidence = 45
  enabled = true

  private firecrawl: FirecrawlInstance | null = null

  private async getInstance() {
    if (this.firecrawl) return this.firecrawl
    const FC = await getFirecrawl()
    if (!FC) return null
    try {
      this.firecrawl = new FC({ apiKey: apiKey || undefined })
    } catch (e) {
      console.warn('[FirecrawlSource] 初始化失败:', e)
      return null
    }
    return this.firecrawl
  }

  async testConnection(): Promise<boolean> {
    const fc = await this.getInstance()
    if (!fc) return false
    try {
      const result = await fc.search('test', { limit: 1 })
      return !!result
    } catch (e) {
      return false
    }
  }

  async searchBook(bookName: string, options: SearchOptions = {}): Promise<BookSourceData | null> {
    console.log(`[FirecrawlSource] 搜索: ${bookName}`)

    const fc = await this.getInstance()
    if (!fc) {
      console.warn('[FirecrawlSource] Firecrawl 不可用')
      return null
    }

    try {
      const timeout = options.timeout || 30000
      const searchQuery = options.author
        ? `${bookName} ${options.author} 小说 简介 主角`
        : `${bookName} 小说 简介 主角 作者`

      console.log(`[FirecrawlSource] 搜索查询: ${searchQuery}`)

      const searchResult = await fc.search(searchQuery, {
        limit: 5,
        scrapeOptions: {
          formats: ['markdown'],
        },
      })

      const results = (searchResult?.web || searchResult?.data || []) as Array<Record<string, unknown>>
      if (!results || results.length === 0) {
        console.log('[FirecrawlSource] 未找到搜索结果')
        return null
      }

      console.log(`[FirecrawlSource] 找到 ${results.length} 个搜索结果`)

      let bestResult: Record<string, unknown> | null = null
      let bestScore = 0

      for (const item of results) {
        const score = this.calculateRelevance(bookName, item, options.author)
        if (score > bestScore) {
          bestScore = score
          bestResult = item
        }
      }

      if (!bestResult || bestScore < 30) {
        console.log('[FirecrawlSource] 没有足够相关的结果')
        return null
      }

      console.log(`[FirecrawlSource] 最佳结果: ${bestResult.title}, 相关度: ${bestScore}`)

      let markdown = (bestResult.markdown as string) || ''

      if (!markdown || markdown.length < 100) {
        try {
          console.log('[FirecrawlSource] 尝试直接抓取页面...')
          const scrapeResult = await fc.scrape(bestResult.url as string, {
            formats: ['markdown'],
          })
          markdown = (scrapeResult?.markdown as string) || ''
        } catch (e) {
          console.warn('[FirecrawlSource] 抓取失败:', e)
        }
      }

      const bookData = this.parseBookFromMarkdown(bookName, markdown, bestResult)
      bookData.sourceUrl = bestResult.url as string

      let qualityBonus = 0
      if (bookData.author && isValidChineseName(bookData.author)) qualityBonus += 5
      if (bookData.genre) qualityBonus += 3
      if (bookData.totalWords && bookData.wordCountWan && bookData.wordCountWan > 10) qualityBonus += 8
      if (bookData.totalChapters && bookData.totalChapters > 50) qualityBonus += 5
      if (bookData.synopsis && bookData.synopsis.length > 100) qualityBonus += 4

      bookData.confidence = Math.max(30, Math.min(100, Math.round(this.baseConfidence + bestScore * 0.15 + qualityBonus)))

      console.log(`[FirecrawlSource] 解析完成: ${bookData.title}, 作者: ${bookData.author}, 置信度: ${bookData.confidence}`)

      return bookData
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.warn('[FirecrawlSource] 搜索失败:', errMsg)
      return null
    }
  }

  private calculateRelevance(bookName: string, item: Record<string, unknown>, author?: string): number {
    let score = 0
    const title = (String(item.title || '')).toLowerCase()
    const desc = (String(item.description || '')).toLowerCase()
    const bookLower = bookName.toLowerCase()

    if (title.includes(bookLower)) score += 40
    if (desc.includes(bookLower)) score += 25

    if (title.includes('小说') || desc.includes('小说')) score += 10
    if (title.includes('百科') || desc.includes('百科')) score += 15
    if (title.includes('百度百科') || (item.url as string)?.includes('baike.baidu')) score += 10
    if ((item.url as string)?.includes('qidian')) score += 12
    if ((item.url as string)?.includes('fanqienovel') || (item.url as string)?.includes('tomato')) score += 8

    if (author) {
      const authorLower = author.toLowerCase()
      if (title.includes(authorLower)) score += 20
      if (desc.includes(authorLower)) score += 15
    }

    return Math.min(100, score)
  }

  private parseBookFromMarkdown(bookName: string, markdown: string, item: Record<string, unknown>): BookSourceData {
    const book = createDefaultBook(bookName, this.name)

    const text = stripHtml(markdown).replace(/\s+/g, ' ').trim()

    const authorMatch = extractAuthorFromText(text)
    if (authorMatch && isValidChineseName(authorMatch)) {
      book.author = authorMatch
    }

    const genreMatch = extractGenreFromText(text)
    if (genreMatch) {
      book.genre = genreMatch
    }

    const statusMatch = extractStatusFromText(text)
    if (statusMatch) {
      book.status = statusMatch
    }

    const words = extractWordsFromText(text)
    if (words && isReasonableWords(words.num)) {
      book.totalWords = words.str
      book.wordCountWan = words.num
    }

    const chapters = extractChaptersFromText(text)
    if (chapters && isReasonableChapters(chapters)) {
      book.totalChapters = chapters
    }

    const tags = extractTagsFromText(text)
    if (tags.length > 0) {
      book.tags = tags.slice(0, 10)
    }

    const synopsisMatch = text.match(/(?:内容简介|简介|内容介绍|作品简介|故事简介)[：:](.{50,800}?)(?=\n\n|第[\d一二三四五六七八九十百千]+章|主要人物|主角|参考文献|$)/s)
    if (synopsisMatch) {
      book.synopsis = synopsisMatch[1].trim().replace(/\s+/g, ' ').substring(0, 500)
    }

    if (!book.synopsis && item.description) {
      book.synopsis = item.description as string
    }

    if (book.synopsis && book.synopsis.length < 50) {
      const firstPara = text.split(/\n\n+/).find((p: string) => p.length > 80 && p.length < 500)
      if (firstPara) {
        book.synopsis = firstPara.trim().substring(0, 500)
      }
    }

    const chars: Array<{ name: string, role: string, note: string }> = []
    const charPatterns = [
      /主角[：:]([^，,。；;]+?)(?=[，,。；;]|$)/g,
      /主要人物[：:]([\s\S]{20,200}?)(?=\n\n|目录|内容简介|$)/,
    ]

    for (const pattern of charPatterns) {
      const match = text.match(pattern)
      if (match) {
        const charText = match[0] || match[1] || ''
        const names = charText.match(/[\u4e00-\u9fa5]{2,4}(?=[，,。、：:|])/g)
        if (names) {
          for (const name of names.slice(0, 5)) {
            if (isValidChineseName(name) && !chars.find(c => c.name === name)) {
              chars.push({ name, role: chars.length === 0 ? '主角' : '配角', note: '' })
            }
          }
        }
        break
      }
    }
    book.characters = chars

    if (item.title) {
      const titleFromPage = (item.title as string).replace(/[-_].*$/, '').trim()
      if (titleFromPage.length > 0 && titleFromPage.length < 50) {
        book.title = titleFromPage
      }
    }

    return book
  }
}

const firecrawlSource = new FirecrawlSource()
export default firecrawlSource
