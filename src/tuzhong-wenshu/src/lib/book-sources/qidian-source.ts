/**
 * 起点中文网数据源
 * 
 * 通过起点中文网搜索和详情页提取小说信息
 * 起点中文网是国内最大的男频小说平台，数据质量高，元数据准确
 * 
 * 特点：
 * - 男频小说数据最全，数据质量最高
 * - 元数据准确：书名、作者、分类、字数、章节数、连载状态
 * - 简介详细，人物信息丰富
 * - 反爬较严格，需要模拟真实浏览器行为
 */

import { BookSourceProvider, BookSourceData, SearchOptions, BookCharacter } from './types'
import {
  createDefaultBook,
  isValidChineseName,
  stripHtml,
} from './utils'
import playwrightManager from './playwright-manager'

const SEARCH_URL = 'https://www.qidian.com/soushu'
const BOOK_URL = 'https://www.qidian.com/book'

interface QidianSearchItem {
  bookId: string
  title: string
  author: string
  category: string
  intro: string
  status: string
  words: string
  url: string
}

interface QidianSearchMatch extends QidianSearchItem {
  confidence: number
}

interface QidianBookDetail {
  title?: string
  author?: string
  genre?: string
  category?: string
  status?: string
  totalWords?: string
  totalChapters?: number
  description?: string
  characters?: Array<{ name: string; role: string; note: string }>
  sourceUrl?: string
}

export class QidianSource implements BookSourceProvider {
  id = 'qidian'
  name = '起点中文网'
  baseConfidence = 75
  enabled = true
  
  private cookies: string = ''
  private lastCookieTime: number = 0
  private readonly COOKIE_TTL = 30 * 60 * 1000

  private userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  ]

  private mobileUserAgents = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  ]

  private getRandomUserAgent(mobile = false): string {
    const agents = mobile ? this.mobileUserAgents : this.userAgents
    return agents[Math.floor(Math.random() * agents.length)]
  }

  private randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  async searchBook(bookName: string, options: SearchOptions = {}): Promise<BookSourceData | null> {
    console.log(`[QidianSource] 搜索: ${bookName}`)

    try {
      const timeout = options.timeout || 15000

      const searchResult = await this.searchAndMatch(bookName, options.author || '', Math.floor(timeout * 0.4))
      
      if (!searchResult) {
        console.log('[QidianSource] 搜索无匹配结果')
        return null
      }

      console.log(`[QidianSource] 匹配到: ${searchResult.title} - ${searchResult.author || '未知作者'} (匹配度: ${searchResult.confidence}%)`)

      let result = this.createFromSearchResult(searchResult)

      try {
        const detailData = await this.fetchBookDetail(searchResult.bookId, Math.floor(timeout * 0.5))
        if (detailData) {
          result = this.enhanceWithDetail(result, detailData)
          console.log('[QidianSource] 详情页数据补充成功')
        }
      } catch (detailError) {
        console.warn('[QidianSource] 详情页抓取失败，使用搜索结果数据:', detailError instanceof Error ? detailError.message : String(detailError))
      }

      const baseConfidence = result.confidence || this.baseConfidence
      result.confidence = Math.min(100, Math.floor(baseConfidence * searchResult.confidence / 100))

      console.log(`[QidianSource] 解析完成: ${result.title}, 作者: ${result.author}, 分类: ${result.genre}, 字数: ${result.totalWords || '无'}, 章节: ${result.totalChapters || '无'}, 置信度: ${result.confidence}`)

      return result

    } catch (error) {
      console.error('[QidianSource] 搜索出错:', error instanceof Error ? error.message : String(error))
      return null
    }
  }

  private async ensureCookies(timeoutMs: number): Promise<void> {
    const now = Date.now()
    if (this.cookies && now - this.lastCookieTime < this.COOKIE_TTL) {
      return
    }
    
    try {
      // 随机延时，模拟真人行为
      await this.randomDelay(200, 800)
      
      const res = await fetch('https://www.qidian.com/', {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'max-age=0',
          'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'Priority': 'u=0, i',
        },
        signal: AbortSignal.timeout(Math.min(timeoutMs, 8000)),
        redirect: 'follow',
      })
      
      const setCookie = res.headers.get('set-cookie')
      if (setCookie) {
        const cookies = setCookie.split(',').map(c => c.split(';')[0].trim()).filter(c => c && c.includes('='))
        this.cookies = cookies.join('; ')
        this.lastCookieTime = now
        console.log(`[QidianSource] 获取cookie成功: ${cookies.length}个, ${this.cookies.substring(0, 80)}...`)
      }
    } catch (e) {
      console.warn('[QidianSource] 获取cookie失败:', e instanceof Error ? e.message : String(e))
    }
  }

  private async fetchWithTimeout(url: string, timeoutMs: number, headers?: Record<string, string>, mobile = false): Promise<Response> {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs)

    try {
      const defaultHeaders: Record<string, string> = {
        'User-Agent': this.getRandomUserAgent(mobile),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.qidian.com/',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        'Sec-Ch-Ua-Mobile': mobile ? '?1' : '?0',
        'Sec-Ch-Ua-Platform': mobile ? '"Android"' : '"Windows"',
        'Priority': 'u=0, i',
      }
      
      if (this.cookies) {
        defaultHeaders['Cookie'] = this.cookies
      }
      
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          ...defaultHeaders,
          ...headers,
        },
        redirect: 'follow',
      })
      clearTimeout(timeout)
      return res
    } catch (e) {
      clearTimeout(timeout)
      throw e
    }
  }

  private async searchAndMatch(bookName: string, author: string, timeoutMs: number): Promise<QidianSearchMatch | null> {
    const searchUrl = `${SEARCH_URL}/${encodeURIComponent(bookName)}.html`
    const mobileSearchUrl = `https://m.qidian.com/search?kw=${encodeURIComponent(bookName)}`
    
    try {
      await this.ensureCookies(Math.floor(timeoutMs * 0.15))
      
      // 随机延时
      await this.randomDelay(100, 500)
      
      let html = ''
      
      // 策略1: PC端静态fetch
      try {
        const res = await this.fetchWithTimeout(searchUrl, Math.floor(timeoutMs * 0.3))
        if (res.ok) {
          html = await res.text()
          console.log(`[QidianSource] PC端静态fetch搜索页面HTML长度: ${html.length}`)
          
          const books = this.parseSearchResults(html)
          console.log(`[QidianSource] PC端静态fetch解析到 ${books.length} 本搜索结果`)
          
          if (books.length > 0) {
            const match = this.findBestMatch(books, bookName, author)
            if (match) {
              console.log(`[QidianSource] PC端静态fetch匹配成功: ${match.title}`)
              return match
            }
          }
        }
      } catch (staticError) {
        console.warn('[QidianSource] PC端静态fetch失败:', staticError instanceof Error ? staticError.message : String(staticError))
      }
      
      // 策略2: 移动端静态fetch（反爬可能更松）
      if (!html || html.length < 1000) {
        try {
          console.log('[QidianSource] 尝试移动端搜索页面...')
          await this.randomDelay(200, 600)
          const mobileRes = await this.fetchWithTimeout(mobileSearchUrl, Math.floor(timeoutMs * 0.25), undefined, true)
          if (mobileRes.ok) {
            const mobileHtml = await mobileRes.text()
            console.log(`[QidianSource] 移动端静态fetch搜索页面HTML长度: ${mobileHtml.length}`)
            
            const mobileBooks = this.parseMobileSearchResults(mobileHtml)
            console.log(`[QidianSource] 移动端解析到 ${mobileBooks.length} 本搜索结果`)
            
            if (mobileBooks.length > 0) {
              const match = this.findBestMatch(mobileBooks, bookName, author)
              if (match) {
                console.log(`[QidianSource] 移动端匹配成功: ${match.title}`)
                return match
              }
            }
          }
        } catch (mobileError) {
          console.warn('[QidianSource] 移动端静态fetch失败:', mobileError instanceof Error ? mobileError.message : String(mobileError))
        }
      }
      
      // 策略3: Playwright渲染
      console.log('[QidianSource] 切换到Playwright模式搜索...')
      
      try {
        await this.randomDelay(300, 800)
        const playwrightHtml = await playwrightManager.fetchPageHtml(searchUrl, {
          timeout: Math.floor(timeoutMs * 0.4),
          waitForSelector: '.res-book-item, .book-info',
          referer: 'https://www.qidian.com/',
          scroll: true,
          waitAfterLoad: 1000,
        })
        
        console.log(`[QidianSource] Playwright搜索页面HTML长度: ${playwrightHtml.length}`)
        
        const books = this.parseSearchResults(playwrightHtml)
        console.log(`[QidianSource] Playwright解析到 ${books.length} 本搜索结果`)
        
        if (books.length > 0) {
          const match = this.findBestMatch(books, bookName, author)
          if (match) {
            console.log(`[QidianSource] Playwright匹配成功: ${match.title}`)
            return match
          }
        }
        
        console.log('[QidianSource] Playwright无匹配结果')
        return null
        
      } catch (pwError) {
        console.warn('[QidianSource] Playwright模式失败:', pwError instanceof Error ? pwError.message : String(pwError))
        return null
      }
      
    } catch (e) {
      console.warn('[QidianSource] 搜索失败:', e instanceof Error ? e.message : String(e))
      return null
    }
  }

  private parseSearchResults(html: string): QidianSearchItem[] {
    const books: QidianSearchItem[] = []
    
    try {
      const bookItems = html.match(/<li[^>]*class="res-book-item[^"]*"[^>]*>[\s\S]*?<\/li>/g) || []
      
      for (const itemHtml of bookItems) {
        try {
          const bidMatch = itemHtml.match(/data-bid="(\d+)"/)
          const titleMatch = itemHtml.match(/<h3[^>]*class="book-info-title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)
          const authorMatch = itemHtml.match(/<p[^>]*class="author"[^>]*>([\s\S]*?)<\/p>/)
          const introMatch = itemHtml.match(/<p[^>]*class="intro"[^>]*>([\s\S]*?)<\/p>/)
          
          if (bidMatch && bidMatch[1]) {
            const bookId = bidMatch[1]
            let title = ''
            let author = ''
            let category = ''
            let status = ''
            
            if (titleMatch && titleMatch[1]) {
              title = stripHtml(titleMatch[1]).trim()
            }
            
            if (authorMatch && authorMatch[1]) {
              const authorText = stripHtml(authorMatch[1]).trim()
              const parts = authorText.split('|').map(p => p.trim()).filter(p => p)
              if (parts.length >= 1) author = parts[0]
              if (parts.length >= 2) category = parts[1]
              if (parts.length >= 3) status = parts[2]
            }
            
            const intro = introMatch ? stripHtml(introMatch[1]).trim() : ''
            
            if (title && bookId) {
              const book = {
                bookId,
                title,
                author,
                category,
                intro,
                status,
                words: '',
                url: `${BOOK_URL}/${bookId}/`,
              }
              books.push(book)
            }
          }
        } catch {
          continue
        }
      }
      
    } catch (e) {
      console.warn('[QidianSource] 解析搜索结果失败:', e instanceof Error ? e.message : String(e))
    }
    
    return books
  }

  private parseMobileSearchResults(html: string): QidianSearchItem[] {
    const books: QidianSearchItem[] = []
    
    try {
      const bookItems = html.match(/<li[^>]*class="book-li[^"]*"[^>]*>[\s\S]*?<\/li>/g) 
        || html.match(/<div[^>]*class="book-item[^"]*"[^>]*>[\s\S]*?<\/div>/g)
        || []
      
      for (const itemHtml of bookItems) {
        try {
          const bidMatch = itemHtml.match(/data-bid=["'](\d+)["']/) 
            || itemHtml.match(/\/book\/(\d+)/)
          const titleMatch = itemHtml.match(/<h4[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)
            || itemHtml.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)
          const authorMatch = itemHtml.match(/<p[^>]*class="author[^"]*"[^>]*>([\s\S]*?)<\/p>/)
            || itemHtml.match(/<span[^>]*class="author[^"]*"[^>]*>([\s\S]*?)<\/span>/)
          const introMatch = itemHtml.match(/<p[^>]*class="intro[^"]*"[^>]*>([\s\S]*?)<\/p>/)
          const catMatch = itemHtml.match(/<span[^>]*class="cat[^"]*"[^>]*>([\s\S]*?)<\/span>/)
          
          if (bidMatch && bidMatch[1]) {
            const bookId = bidMatch[1]
            let title = ''
            let author = ''
            let category = ''
            const status = ''
            
            if (titleMatch && titleMatch[1]) {
              title = stripHtml(titleMatch[1]).trim()
            }
            
            if (authorMatch && authorMatch[1]) {
              author = stripHtml(authorMatch[1]).trim()
            }
            
            if (catMatch && catMatch[1]) {
              category = stripHtml(catMatch[1]).trim()
            }
            
            const intro = introMatch ? stripHtml(introMatch[1]).trim() : ''
            
            if (title && bookId) {
              const book = {
                bookId,
                title,
                author,
                category,
                intro,
                status,
                words: '',
                url: `${BOOK_URL}/${bookId}/`,
              }
              books.push(book)
            }
          }
        } catch {
          continue
        }
      }
      
    } catch (e) {
      console.warn('[QidianSource] 解析移动端搜索结果失败:', e instanceof Error ? e.message : String(e))
    }
    
    return books
  }

  private findBestMatch(books: QidianSearchItem[], bookName: string, author?: string): QidianSearchMatch | null {
    if (!books || books.length === 0) return null

    const target = bookName.toLowerCase().trim()
    const targetAuthor = author?.toLowerCase().trim() || ''

    const famousNovels: Record<string, string[]> = {
      '完美世界': ['辰东'],
      '斗破苍穹': ['天蚕土豆'],
      '武动乾坤': ['天蚕土豆'],
      '大主宰': ['天蚕土豆'],
      '盘龙': ['我吃西红柿'],
      '星辰变': ['我吃西红柿'],
      '吞噬星空': ['我吃西红柿'],
      '遮天': ['辰东'],
      '圣墟': ['辰东'],
      '凡人修仙传': ['忘语'],
      '仙逆': ['耳根'],
      '求魔': ['耳根'],
      '一念永恒': ['耳根'],
      '雪中悍刀行': ['烽火戏诸侯'],
      '剑来': ['烽火戏诸侯'],
      '诡秘之主': ['爱潜水的乌贼'],
      '牧神记': ['宅猪'],
      '人道至尊': ['宅猪'],
      '大王饶命': ['会说话的肘子'],
      '第一序列': ['会说话的肘子'],
      '赘婿': ['愤怒的香蕉'],
      '全职高手': ['蝴蝶蓝'],
      '神印王座': ['唐家三少'],
      '斗罗大陆': ['唐家三少'],
    }

    const expectedAuthors = famousNovels[bookName] || []

    const exactMatch = books.find(b => {
      const title = (b.title || '').toLowerCase().trim()
      if (title === target) {
        if (expectedAuthors.length > 0) {
          const bookAuthor = (b.author || '').toLowerCase().trim()
          return expectedAuthors.some(auth => auth.toLowerCase().includes(bookAuthor) || bookAuthor.includes(auth.toLowerCase()))
        }
        if (targetAuthor && b.author) {
          return b.author.toLowerCase().includes(targetAuthor) || targetAuthor.includes(b.author.toLowerCase())
        }
        return true
      }
      return false
    })

    if (exactMatch) return { ...exactMatch, confidence: 100 }

    let highConfidenceMatch = null
    let midConfidenceMatch = null
    
    for (const b of books) {
      const title = (b.title || '').toLowerCase().trim()
      if (!title) continue
      
      const contains = title.includes(target) || target.includes(title)
      if (!contains) continue
      
      const minLen = Math.min(title.length, target.length)
      const maxLen = Math.max(title.length, target.length)
      const similarity = minLen / maxLen
      
      let isValid = true
      if (expectedAuthors.length > 0) {
        const bookAuthor = (b.author || '').toLowerCase().trim()
        isValid = expectedAuthors.some(auth => auth.toLowerCase().includes(bookAuthor) || bookAuthor.includes(auth.toLowerCase()))
      } else if (targetAuthor && b.author) {
        const bookAuthor = b.author.toLowerCase().trim()
        isValid = bookAuthor.includes(targetAuthor) || targetAuthor.includes(bookAuthor)
      }
      
      if (!isValid) continue
      
      if (similarity >= 0.9) {
        if (!highConfidenceMatch) highConfidenceMatch = { ...b, confidence: 85 }
      } else if (similarity >= 0.7) {
        if (!midConfidenceMatch) midConfidenceMatch = { ...b, confidence: 60 }
      }
    }
    
    if (highConfidenceMatch) return highConfidenceMatch
    if (midConfidenceMatch) return midConfidenceMatch

    return null
  }

  private createFromSearchResult(book: QidianSearchItem): BookSourceData {
    const result = createDefaultBook(book.title || '', '起点中文网')

    result.title = book.title || ''
    result.author = book.author || ''
    result.platform = '起点中文网'
    result.sourceUrl = book.url || ''
    result.synopsis = book.intro || ''

    if (book.category) {
      result.genre = this.mapGenre(book.category)
      result.subGenre = book.category
      result.tags = [book.category]
    }

    if (book.status) {
      result.status = book.status.includes('完本') || book.status.includes('完结') ? '已完结' : '连载中'
    }

    if (book.words) {
      result.totalWords = book.words
    }

    if (result.synopsis) {
      const chars = this.extractCharactersFromIntro(result.synopsis)
      if (chars.length > 0) result.characters = chars
    }

    let confidence = this.baseConfidence
    if (result.author && isValidChineseName(result.author)) confidence += 5
    if (result.synopsis && result.synopsis.length > 50) confidence += 3
    if (result.totalWords) confidence += 3
    result.confidence = Math.min(100, confidence)

    return result
  }

  private async fetchBookDetail(bookId: string, timeoutMs: number): Promise<QidianBookDetail | null> {
    const detailUrl = `${BOOK_URL}/${bookId}/`
    
    try {
      let html = ''
      
      try {
        const res = await this.fetchWithTimeout(detailUrl, Math.floor(timeoutMs * 0.4))
        if (res.ok) {
          html = await res.text()
          const detail = this.parseDetailPage(html, bookId)
          if (detail && detail.title) {
            console.log('[QidianSource] 静态fetch详情页成功')
            return detail
          }
        }
      } catch (staticError) {
        console.warn('[QidianSource] 静态fetch详情页失败，尝试Playwright:', staticError instanceof Error ? staticError.message : String(staticError))
      }
      
      console.log('[QidianSource] 切换到Playwright模式获取详情页...')
      
      try {
        const playwrightHtml = await playwrightManager.fetchPageHtml(detailUrl, {
          timeout: Math.floor(timeoutMs * 0.5),
          waitForSelector: '.book-info',
          referer: 'https://www.qidian.com/soushu/',
          scroll: true,
        })
        
        const detail = this.parseDetailPage(playwrightHtml, bookId)
        if (detail && detail.title) {
          console.log('[QidianSource] Playwright详情页成功')
          return detail
        }
        
        return detail || null
        
      } catch (pwError) {
        console.warn('[QidianSource] Playwright详情页失败:', pwError instanceof Error ? pwError.message : String(pwError))
        return null
      }
      
    } catch (e) {
      console.warn('[QidianSource] 详情页请求失败:', e instanceof Error ? e.message : String(e))
      return null
    }
  }

  private parseDetailPage(html: string, bookId: string): QidianBookDetail | null {
    const result: QidianBookDetail = {}
    
    try {
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/)
      if (titleMatch) {
        result.title = stripHtml(titleMatch[1]).trim()
      }

      const authorMatch = html.match(/<span[^>]*class="writer"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/)
      if (authorMatch) {
        result.author = stripHtml(authorMatch[1]).trim()
      }

      const genreMatch = html.match(/<p[^>]*class="tag"[^>]*>([\s\S]*?)<\/p>/)
      if (genreMatch) {
        const genreText = stripHtml(genreMatch[1]).trim()
        if (genreText) {
          result.genre = genreText
        }
      }

      const categoryMatch = html.match(/<a[^>]*class="red-btn"[^>]*>([^<]+)<\/a>/)
      if (categoryMatch) {
        result.category = stripHtml(categoryMatch[1]).trim()
      }

      const statusMatch = html.match(/<span[^>]*class="state"[^>]*>([^<]+)<\/span>/)
      if (statusMatch) {
        const statusText = stripHtml(statusMatch[1]).trim()
        result.status = statusText.includes('完本') || statusText.includes('完结') ? '已完结' : '连载中'
      }

      const wordsPatterns = [
        /总字数[：:]\s*([\d.]+万?字)/,
        /字数[：:]\s*([\d.]+万?字)/,
        /<span[^>]*class="word-num"[^>]*>([^<]+)<\/span>/,
        /([\d.]+万?字)\s*(总字数)?/,
      ]
      
      for (const pattern of wordsPatterns) {
        const match = html.match(pattern)
        if (match) {
          result.totalWords = match[1].trim()
          break
        }
      }

      const chapterPatterns = [
        /总章节数[：:]\s*(\d+)/,
        /章节数[：:]\s*(\d+)/,
        /共\s*(\d+)\s*章/,
      ]
      
      for (const pattern of chapterPatterns) {
        const match = html.match(pattern)
        if (match) {
          result.totalChapters = parseInt(match[1], 10)
          break
        }
      }

      const introMatch = html.match(/<p[^>]*class="intro"[^>]*>([\s\S]*?)<\/p>/)
      if (introMatch) {
        let intro = stripHtml(introMatch[1]).trim()
        if (intro.length > 800) intro = intro.substring(0, 800) + '...'
        result.description = intro
      }

      const characterPatterns = [
        /主角[是叫为：:]\s*([\u4e00-\u9fa5·]{2,4})/g,
        /男主[是叫为：:]\s*([\u4e00-\u9fa5·]{2,4})/g,
        /女主角?[是叫为：:]\s*([\u4e00-\u9fa5·]{2,4})/g,
        /女主[是叫为：:]\s*([\u4e00-\u9fa5·]{2,4})/g,
      ]
      
      const characters: Array<{ name: string; role: string; note: string }> = []
      const foundNames = new Set<string>()
      
      const textForChar = html.replace(/<[^>]+>/g, '')
      
      for (const pattern of characterPatterns) {
        let match
        while ((match = pattern.exec(textForChar)) !== null) {
          const name = match[1].trim()
          const role = pattern.source.includes('女主') ? '女主' : '主角'
          if (name && name.length >= 2 && name.length <= 4 && !foundNames.has(name) && isValidChineseName(name)) {
            foundNames.add(name)
            characters.push({ name, role, note: '从详情页提取' })
          }
        }
      }
      
      if (characters.length > 0) {
        result.characters = characters
      }

      result.sourceUrl = `${BOOK_URL}/${bookId}/`
      
    } catch (e) {
      console.warn('[QidianSource] 详情页解析失败:', e instanceof Error ? e.message : String(e))
    }
    
    return Object.keys(result).length > 0 ? result : null
  }

  private enhanceWithDetail(baseData: BookSourceData, detail: QidianBookDetail): BookSourceData {
    const result = { ...baseData }
    
    if (detail.totalWords && (!result.totalWords || result.totalWords.length < detail.totalWords.length)) {
      result.totalWords = detail.totalWords
    }
    
    if (detail.totalChapters && !result.totalChapters) {
      result.totalChapters = detail.totalChapters
    }
    
    if (detail.status) {
      if (detail.status === '已完结' && result.status !== '已完结') {
        result.status = '已完结'
      }
    }
    
    if (detail.genre || detail.category) {
      const genreText = detail.genre || detail.category
      if (genreText) {
        const mappedGenre = this.mapGenre(genreText)
        if (!result.genre || result.genre === '男频' || result.genre === '女频' || mappedGenre !== genreText) {
          result.genre = mappedGenre
          result.subGenre = genreText
        }
      }
    }
    
    if (detail.description && detail.description.length > (result.synopsis?.length || 0)) {
      result.synopsis = detail.description
    }
    
    if (detail.characters && detail.characters.length > 0) {
      const existingNames = new Set(result.characters?.map(c => c.name) || [])
      const newChars = detail.characters.filter((c: BookCharacter) => !existingNames.has(c.name))
      if (newChars.length > 0) {
        result.characters = [...(result.characters || []), ...newChars]
      }
    }
    
    if (detail.author && !result.author) {
      result.author = detail.author
    }
    
    if (detail.title && !result.title) {
      result.title = detail.title
    }
    
    return result
  }

  private mapGenre(cat: string): string {
    const genreMap: Record<string, string> = {
      '玄幻': '玄幻',
      '奇幻': '奇幻',
      '武侠': '武侠',
      '仙侠': '仙侠',
      '都市': '都市',
      '现实': '都市',
      '历史': '历史',
      '军事': '军事',
      '游戏': '游戏',
      '体育': '竞技',
      '竞技': '竞技',
      '科幻': '科幻',
      '灵异': '灵异',
      '悬疑': '悬疑',
      '轻小说': '轻小说',
      '同人': '同人',
      '男频': '男频',
      '女频': '女频',
      '东方玄幻': '玄幻',
      '异界大陆': '玄幻',
      '异世争霸': '玄幻',
      '高武世界': '玄幻',
      '现代都市': '都市',
      '都市生活': '都市',
      '都市异能': '都市',
      '都市重生': '都市',
      '谍战特工': '都市',
      '热血都市': '都市',
      '历史传记': '历史',
      '架空历史': '历史',
      '两晋隋唐': '历史',
      '上古先秦': '历史',
      '秦汉三国': '历史',
      '五代十国': '历史',
      '两宋元明': '历史',
      '清史民国': '历史',
      '外国历史': '历史',
      '历史段子': '历史',
      '未来世界': '科幻',
      '古武机甲': '科幻',
      '星际文明': '科幻',
      '末世危机': '科幻',
      '进化变异': '科幻',
      '超级科技': '科幻',
      '时空穿梭': '科幻',
      '游戏竞技': '游戏',
      '电子竞技': '游戏',
      '虚拟网游': '游戏',
      '游戏异界': '游戏',
      '游戏系统': '游戏',
      '传统游戏': '游戏',
      '恐怖惊悚': '灵异',
      '侦探推理': '悬疑',
      '探险生存': '灵异',
      '都市传说': '灵异',
      '诡秘悬疑': '悬疑',
      '古今传奇': '悬疑',
      '奇妙世界': '奇幻',
      '剑与魔法': '奇幻',
      '史诗奇幻': '奇幻',
      '历史神话': '奇幻',
      '现代魔法': '奇幻',
      '另类幻想': '奇幻',
      '传统武侠': '武侠',
      '传统仙侠': '仙侠',
      '修真文明': '仙侠',
      '幻想修仙': '仙侠',
      '现代修真': '仙侠',
      '神话修真': '仙侠',
    }

    for (const [key, value] of Object.entries(genreMap)) {
      if (cat.includes(key)) return value
    }

    return cat
  }

  private extractCharactersFromIntro(intro: string): Array<{ name: string; role: string; note: string }> {
    const result: Array<{ name: string; role: string; note: string }> = []
    const foundNames = new Set<string>()

    const patterns = [
      { pattern: /主角[是叫为：:]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '主角' },
      { pattern: /男主[是叫为：:]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '主角' },
      { pattern: /女主角?[是叫为：:]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '女主' },
      { pattern: /女主[是叫为：:]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '女主' },
    ]

    for (const { pattern, role } of patterns) {
      let match
      while ((match = pattern.exec(intro)) !== null) {
        const name = match[1].trim()
        if (name && name.length >= 2 && name.length <= 4 && !foundNames.has(name) && isValidChineseName(name)) {
          foundNames.add(name)
          result.push({ name, role, note: '从简介中提取' })
        }
      }
    }

    return result
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout('https://www.qidian.com/', 5000)
      return res.ok
    } catch {
      return false
    }
  }
}

export default new QidianSource()
