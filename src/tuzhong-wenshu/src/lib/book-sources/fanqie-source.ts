/**
 * 番茄小说API数据源
 * 
 * 官方API（无需注册，免费使用）：
 * - 搜索接口：https://novel.snssdk.com/api/novel/channel/homepage/search/search/v1/
 * - 备用接口：https://api-lf.fanqiesdk.com/api/novel/channel/homepage/search/search/v1/
 * 
 * 特点：
 * - 字节跳动官方API，稳定可靠
 * - 无需注册，直接调用
 * - 覆盖番茄小说全平台书籍
 * - 返回数据包含：书名、作者、简介、分类、评分、封面等
 */

import { BookSourceProvider, BookSourceData, SearchOptions, BookCharacter } from './types'
import {
  createDefaultBook,
  isValidChineseName,
  stripHtml,
} from './utils'

const API_ENDPOINTS = [
  'https://novel.snssdk.com/api/novel/channel/homepage/search/search/v1/',
  'https://api-lf.fanqiesdk.com/api/novel/channel/homepage/search/search/v1/',
]

const AID = '1967'

interface FanqieSearchItem {
  title?: string
  author?: string
  book_id?: string
  thumb_url?: string
  audio_thumb_uri?: string
  category?: string
  creation_status?: number
  abstract?: string
  score?: string | number
  [key: string]: unknown
}

interface FanqieBookDetail {
  totalWords?: string
  totalChapters?: number
  status?: string
  genre?: string
  description?: string
  author?: string
  title?: string
  characters?: Array<{ name: string; role: string; note: string }>
}

export class FanqieSource implements BookSourceProvider {
  id = 'fanqie'
  name = '番茄小说'
  baseConfidence = 82
  enabled = true

  private currentEndpointIndex = 0

  async searchBook(bookName: string, options: SearchOptions = {}): Promise<BookSourceData | null> {
    console.log(`[FanqieSource] 搜索: ${bookName}`)

    try {
      const timeout = options.timeout || 12000

      let searchData: Record<string, unknown> | null = null
      let usedEndpoint = ''

      for (let i = 0; i < API_ENDPOINTS.length; i++) {
        const endpoint = API_ENDPOINTS[(this.currentEndpointIndex + i) % API_ENDPOINTS.length]
        const searchUrl = `${endpoint}?device_platform=android&parent_enterfrom=novel_channel_search.tab.&offset=0&aid=${AID}&q=${encodeURIComponent(bookName)}`

        try {
          const res = await this.fetchWithTimeout(searchUrl, Math.floor(timeout * 0.4))
          if (res.ok) {
            const data = await res.json()
            if (data.code === 0 && data.data?.ret_data?.length > 0) {
              searchData = data
              usedEndpoint = endpoint
              this.currentEndpointIndex = (this.currentEndpointIndex + i) % API_ENDPOINTS.length
              break
            }
          }
        } catch (e) {
          console.warn(`[FanqieSource] 端点 ${endpoint} 失败:`, e instanceof Error ? e.message : String(e))
        }
      }

      if (!searchData) {
        console.log('[FanqieSource] 所有端点都失败或无结果')
        return null
      }

      const books = ((searchData as { data: { ret_data?: FanqieSearchItem[] } }).data?.ret_data) || []
      const matchResult = this.findBestMatch(books, bookName, options.author)

      if (!matchResult) {
        console.log('[FanqieSource] 无匹配结果')
        return null
      }

      const bestMatch = matchResult.book
      const matchConfidence = matchResult.confidence
      
      console.log(`[FanqieSource] 匹配到: ${bestMatch.title} - ${bestMatch.author || '未知作者'} (匹配度: ${matchConfidence}%)`)

      let result = this.parseBookData(bestMatch, usedEndpoint)
      
      const detailTimeout = Math.floor(timeout * 0.5)
      if (bestMatch.book_id) {
        try {
          const detailData = await this.fetchBookDetail(bestMatch.book_id, detailTimeout)
          if (detailData) {
            result = this.enhanceWithDetail(result, detailData)
            console.log('[FanqieSource] 详情页数据补充成功')
          }
        } catch (detailError) {
          console.warn('[FanqieSource] 详情页抓取失败，使用搜索结果数据:', detailError instanceof Error ? detailError.message : String(detailError))
        }
      }
      
      const baseConfidence = result.confidence || this.baseConfidence
      result.confidence = Math.min(100, Math.floor(baseConfidence * matchConfidence / 100))
      
      console.log(`[FanqieSource] 解析完成: ${result.title}, 作者: ${result.author}, 分类: ${result.genre}, 字数: ${result.totalWords || '无'}, 章节: ${result.totalChapters || '无'}, 置信度: ${result.confidence}`)

      return result

    } catch (error) {
      console.error('[FanqieSource] 搜索出错:', error instanceof Error ? error.message : String(error))
      return null
    }
  }

  private async fetchWithTimeout(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<Response> {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs)

    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          ...headers,
        },
      })
      clearTimeout(timeout)
      return res
    } catch (e) {
      clearTimeout(timeout)
      throw e
    }
  }

  private async fetchBookDetail(bookId: string, timeoutMs: number): Promise<FanqieBookDetail | null> {
    const detailUrl = `https://fanqienovel.com/page/${bookId}`
    
    try {
      const res = await this.fetchWithTimeout(detailUrl, timeoutMs, {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://fanqienovel.com/',
      })
      
      if (!res.ok) return null
      
      const html = await res.text()
      return this.parseDetailPage(html)
    } catch (e) {
      console.warn('[FanqieSource] 详情页请求失败:', e instanceof Error ? e.message : String(e))
      return null
    }
  }

  private parseDetailPage(html: string): FanqieBookDetail | null {
    const result: FanqieBookDetail = {}
    
    try {
      const totalWordsMatch = html.match(/总字数[：:]\s*([\d.]+万?字)/)
      if (totalWordsMatch) {
        result.totalWords = totalWordsMatch[1].trim()
      }
      
      const chapterCountMatch = html.match(/(总章节数|章节数)[：:]\s*(\d+)/)
      if (chapterCountMatch) {
        result.totalChapters = parseInt(chapterCountMatch[2], 10)
      }
      
      const statusMatch = html.match(/(连载状态|状态)[：:]\s*(已完结|连载中)/)
      if (statusMatch) {
        result.status = statusMatch[2]
      }
      
      const genreMatch = html.match(/(作品类型|类型|分类)[：:]\s*([^<\n]+)/)
      if (genreMatch) {
        result.genre = genreMatch[2].trim()
      }
      
      const descMatch = html.match(/(简介|内容简介|作品简介)[：:]\s*([^<]*?)(?:<|$)/s)
      if (descMatch) {
        result.description = stripHtml(descMatch[2]).trim()
      }
      
      const authorMatch = html.match(/作[者\s]*[：:]\s*([^<\n]+)/)
      if (authorMatch) {
        result.author = authorMatch[1].trim()
      }
      
      const titleMatch = html.match(/<title>([^<]+)<\/title>/)
      if (titleMatch) {
        const titleText = titleMatch[1].trim()
        result.title = titleText.replace(/[\_\-]番茄小说.*$/, '').trim()
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
      
    } catch (e) {
      console.warn('[FanqieSource] 详情页解析失败:', e instanceof Error ? e.message : String(e))
    }
    
    return Object.keys(result).length > 0 ? result : null
  }

  private enhanceWithDetail(baseData: BookSourceData, detail: FanqieBookDetail): BookSourceData {
    const result = { ...baseData }

    if (detail.totalWords && !result.totalWords) {
      result.totalWords = detail.totalWords
    }

    if (detail.totalChapters && !result.totalChapters) {
      result.totalChapters = detail.totalChapters
    }

    if (detail.status && result.status === '连载中') {
      if (detail.status === '已完结') {
        result.status = '已完结'
      }
    }

    if (detail.genre) {
      const mappedGenre = this.mapGenre(detail.genre)
      if (mappedGenre !== detail.genre || !result.genre || result.genre === '男频' || result.genre === '女频') {
        result.genre = mappedGenre
        result.subGenre = detail.genre
      }
    }

    if (detail.description && detail.description.length > (result.synopsis?.length || 0)) {
      let intro = detail.description
      if (intro.length > 800) intro = intro.substring(0, 800) + '...'
      result.synopsis = intro
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

  private findBestMatch(books: FanqieSearchItem[], bookName: string, author?: string): { book: FanqieSearchItem; confidence: number } | null {
    if (!books || books.length === 0) return null

    const target = bookName.toLowerCase().trim()

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
      '深空彼岸': ['辰东'],
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
      '龙族': ['江南'],
      '神印王座': ['唐家三少'],
      '斗罗大陆': ['唐家三少'],
      '绝世唐门': ['唐家三少'],
      '龙王传说': ['唐家三少'],
      '终极斗罗': ['唐家三少'],
    }

    const expectedAuthors = famousNovels[bookName] || []

    const isDerivative = (title: string): boolean => {
      const derivativePatterns = ['同人', '衍生', '从', '之', '：', ':', '·', 'II', '2', '续', '传', '记', '新', '番外', '篇']
      const lowerTitle = title.toLowerCase()
      if (lowerTitle === target) return false
      for (const pattern of derivativePatterns) {
        if (lowerTitle.includes(pattern) && (lowerTitle.startsWith(target) || lowerTitle.endsWith(target) || lowerTitle.replace(pattern, '').includes(target))) {
          return true
        }
      }
      if (lowerTitle !== target && (lowerTitle.includes(target) || target.includes(lowerTitle))) {
        const lenDiff = Math.abs(lowerTitle.length - target.length)
        if (lenDiff >= 2 && lenDiff <= 5) {
          return true
        }
      }
      return false
    }

    const exactMatch = books.find(b => {
      const title = (b.title || '').toLowerCase().trim()
      if (title === target) {
        if (expectedAuthors.length > 0) {
          const bookAuthor = (b.author || '').toLowerCase().trim()
          return expectedAuthors.some(auth => auth.toLowerCase().includes(bookAuthor) || bookAuthor.includes(auth.toLowerCase()))
        }
        if (author && b.author) {
          return b.author.includes(author) || author.includes(b.author)
        }
        return true
      }
      return false
    })

    if (exactMatch) return { book: exactMatch, confidence: 100 }

    if (expectedAuthors.length > 0) {
      console.log(`[FanqieSource] ${bookName} 是知名小说，但番茄小说无完全匹配，跳过（避免返回衍生作品）`)
      return null
    }

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
      
      if (isDerivative(title)) {
        continue
      }
      
      let isValid = true
      if (author && b.author) {
        const bookAuthor = (b.author || '').toLowerCase().trim()
        const targetAuthor = author.toLowerCase().trim()
        isValid = bookAuthor.includes(targetAuthor) || targetAuthor.includes(bookAuthor)
      }
      
      if (!isValid) continue
      
      if (similarity >= 0.9) {
        if (!highConfidenceMatch) highConfidenceMatch = { book: b, confidence: 80 }
      } else if (similarity >= 0.8) {
        if (!midConfidenceMatch) midConfidenceMatch = { book: b, confidence: 60 }
      }
    }
    
    if (highConfidenceMatch) return highConfidenceMatch
    if (midConfidenceMatch) return midConfidenceMatch

    return null
  }

  private parseBookData(raw: FanqieSearchItem, _endpoint: string): BookSourceData {
    const result = createDefaultBook(raw.title || '', '番茄小说')

    result.title = raw.title || ''
    result.author = raw.author || ''
    result.cover = raw.thumb_url || raw.audio_thumb_uri || undefined
    result.platform = '番茄小说'

    if (raw.category) {
      result.genre = this.mapGenre(raw.category)
      result.subGenre = raw.category
      result.tags = [raw.category]
    }

    if (raw.creation_status !== undefined) {
      result.status = raw.creation_status === 1 ? '已完结' : '连载中'
    }

    if (raw.abstract) {
      let intro = stripHtml(raw.abstract)
      if (intro.length > 600) intro = intro.substring(0, 600) + '...'
      result.synopsis = intro
    }

    if (raw.score) {
      result.tags = [...result.tags, `评分: ${raw.score}`]
    }

    if (result.synopsis) {
      const chars = this.extractCharactersFromIntro(result.synopsis)
      if (chars.length > 0) result.characters = chars
    }

    result.sourceUrl = `https://fanqienovel.com/page/${raw.book_id}`

    let confidence = this.baseConfidence
    if (result.author && isValidChineseName(result.author)) confidence += 5
    if (result.synopsis && result.synopsis.length > 50) confidence += 3
    if (result.cover) confidence += 2
    result.confidence = Math.min(100, confidence)

    result._raw = raw

    return result
  }

  private mapGenre(cat: string): string {
    const genreMap: Record<string, string> = {
      '玄幻': '玄幻',
      '奇幻': '奇幻',
      '武侠': '武侠',
      '仙侠': '仙侠',
      '都市': '都市',
      '职场': '都市',
      '现实': '都市',
      '历史': '历史',
      '军事': '军事',
      '游戏': '游戏',
      '竞技': '竞技',
      '科幻': '科幻',
      '灵异': '灵异',
      '悬疑': '悬疑',
      '言情': '言情',
      '青春': '言情',
      '女生': '言情',
      '轻小说': '轻小说',
      '漫画': '漫画',
      '同人': '同人',
      '男频': '男频',
      '女频': '女频',
      '现代言情': '言情',
      '古代言情': '言情',
      '幻想言情': '言情',
      '都市言情': '言情',
      '穿越架空': '言情',
      '总裁豪门': '言情',
      '宫斗宅斗': '言情',
      '仙侠奇缘': '仙侠',
      '玄幻言情': '玄幻',
      '现代都市': '都市',
      '都市生活': '都市',
      '都市异能': '都市',
      '都市修真': '仙侠',
      '东方玄幻': '玄幻',
      '异界大陆': '玄幻',
      '异世争霸': '玄幻',
      '王朝争霸': '历史',
      '架空历史': '历史',
      '历史传记': '历史',
      '科幻末世': '科幻',
      '未来世界': '科幻',
      '古武机甲': '科幻',
      '星际文明': '科幻',
      '游戏竞技': '游戏',
      '电子竞技': '游戏',
      '虚拟网游': '游戏',
      '游戏异界': '游戏',
      '灵异悬疑': '悬疑',
      '侦探推理': '悬疑',
      '恐怖惊悚': '灵异',
      '探险生存': '灵异',
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
      const testUrl = `${API_ENDPOINTS[0]}?device_platform=android&parent_enterfrom=novel_channel_search.tab.&offset=0&aid=${AID}&q=test`
      const res = await this.fetchWithTimeout(testUrl, 5000)
      if (!res.ok) return false
      const data = await res.json()
      return data.code === 0
    } catch {
      return false
    }
  }
}

export default new FanqieSource()
