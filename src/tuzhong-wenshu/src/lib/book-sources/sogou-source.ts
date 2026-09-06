/**
 * 搜狗搜索数据源
 * 
 * 通过搜狗搜索结果页提取小说信息
 * 优先搜索搜狗百科（site:baike.sogou.com），信息最准确
 */

import { BookSourceProvider, BookSourceData, SearchOptions } from './types'
import {
  createDefaultBook,
  stripHtml,
  extractGenreFromText,
  extractTagsFromText,
  isValidChineseName,
  isReasonableWords,
  isReasonableChapters,
  escapeRegExp,
} from './utils'

interface ExtractionCandidate<T> {
  value: T
  weight: number
  context?: string
}

class SogouSearchSource implements BookSourceProvider {
  id = 'sogou'
  name = '搜狗搜索'
  baseConfidence = 50
  enabled = true

  async searchBook(bookName: string, options: SearchOptions = {}): Promise<BookSourceData | null> {
    console.log(`[SogouSearchSource] 搜索: ${bookName}`)

    try {
      const timeout = options.timeout || 20000
      
      const queries = [
        `${bookName} 小说 site:baike.sogou.com`,
        `${bookName} 小说 作者 字数 章节`,
        `${bookName} 起点中文网 字数`,
      ]
      
      let allText = ''
      let baikeText = ''
      let baikeUrl = ''
      let sourceUrl = ''
      let successCount = 0
      
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i]
        try {
          const html = await this.fetchSogouSearch(query, timeout / queries.length)
          const text = this.cleanSearchResult(html)
          allText += '\n' + text
          successCount++
          
          if (i === 0) {
            const extractedUrl = this.extractBaikeUrl(html, bookName)
            if (extractedUrl) {
              baikeUrl = extractedUrl
              console.log(`[SogouSearchSource] 找到搜狗百科页面: ${baikeUrl}`)
            }
          }
          
          if (!sourceUrl) {
            sourceUrl = `https://www.sogou.com/web?query=${encodeURIComponent(query)}`
          }
        } catch (e) {
          console.warn(`[SogouSearchSource] 搜索"${query}"失败:`, e instanceof Error ? e.message : String(e))
        }
      }
      
      if (baikeUrl) {
        try {
          const baikeHtml = await this.fetchSogouBaike(baikeUrl, timeout / 3)
          const extractedBaikeText = this.cleanBaikePage(baikeHtml)
          if (extractedBaikeText.length > 500) {
            baikeText = extractedBaikeText
            sourceUrl = baikeUrl
            console.log(`[SogouSearchSource] 成功访问搜狗百科页面，文本长度: ${baikeText.length}`)
          }
        } catch (e) {
          console.warn(`[SogouSearchSource] 访问搜狗百科页面失败:`, e instanceof Error ? e.message : String(e))
        }
      }
      
      if (successCount === 0 || !allText.trim()) {
        console.warn('[SogouSearchSource] 所有搜索都失败了')
        return null
      }

      const nonNovelKeywords = ['手游', '游戏', 'ARPG', 'RPG', '网游', '页游', '端游', '漫画', '动漫', '动画', '电视剧', '电影']
      let isBaikeNovel = false
      if (baikeText) {
        const preview = baikeText.substring(0, 500)
        isBaikeNovel = !nonNovelKeywords.some(kw => preview.includes(kw))
      }
      
      const primaryText = (baikeText && isBaikeNovel) ? baikeText : allText
      const result = this.extractFromText(primaryText, allText, bookName, sourceUrl, successCount, !!(baikeText && isBaikeNovel), !!baikeUrl)
      
      console.log(`[SogouSearchSource] 解析完成: ${result.title}, 作者: ${result.author}, 字数: ${result.totalWords}, 章节: ${result.totalChapters}, 置信度: ${result.confidence}, 来源: ${baikeText ? '搜狗百科' : '搜狗搜索'}`)
      
      return result

    } catch (error) {
      console.error('[SogouSearchSource] 搜索出错:', error instanceof Error ? error.message : String(error))
      return null
    }
  }

  /**
   * 请求搜狗搜索
   */
  private async fetchSogouSearch(keyword: string, timeoutMs: number): Promise<string> {
    const url = `https://www.sogou.com/web?query=${encodeURIComponent(keyword)}`
    
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs)
    
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Connection': 'keep-alive',
          'Referer': 'https://www.sogou.com/',
        },
      })
      
      clearTimeout(timeout)
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      
      return await res.text()
    } catch (e) {
      clearTimeout(timeout)
      throw e
    }
  }

  /**
   * 从搜索结果HTML中提取搜狗百科页面URL
   */
  private extractBaikeUrl(html: string, bookName: string): string {
    const patterns = [
      /href="(https?:\/\/baike\.sogou\.com\/v\d+\.htm)"/i,
      /href="(https?:\/\/baike\.sogou\.com\/[^"]+\.htm)"/i,
    ]
    
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        return match[1].replace(/&amp;/g, '&')
      }
    }
    
    return ''
  }

  /**
   * 请求搜狗百科页面
   */
  private async fetchSogouBaike(url: string, timeoutMs: number): Promise<string> {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs)
    
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Connection': 'keep-alive',
          'Referer': 'https://www.sogou.com/',
        },
      })
      
      clearTimeout(timeout)
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      
      return await res.text()
    } catch (e) {
      clearTimeout(timeout)
      throw e
    }
  }

  /**
   * 清理搜狗百科页面内容，提取主要文本
   */
  private cleanBaikePage(html: string): string {
    let text = html
    
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    
    const mainContentMatch = text.match(/<div[^>]*class="[^"]*lemma-summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    if (mainContentMatch) {
      text = mainContentMatch[1]
    }
    
    text = text.replace(/<[^>]+>/g, ' ')
    
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, ' ')
    
    text = text.replace(/\s+/g, ' ').trim()
    
    return text
  }

  /**
   * 清理搜索结果
   */
  private cleanSearchResult(html: string): string {
    let text = html
    
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    
    text = text.replace(/<[^>]+>/g, ' ')
    
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, ' ')
    
    text = text.replace(/\s+/g, ' ').trim()
    
    return text
  }

  /**
   * 从文本中提取书籍信息
   */
  private extractFromText(
    primaryText: string, 
    allText: string, 
    bookName: string, 
    sourceUrl: string, 
    successCount: number,
    fromBaike: boolean,
    fromBaikePage: boolean = false
  ): BookSourceData {
    const result = createDefaultBook(bookName, fromBaikePage ? '搜狗百科' : (fromBaike ? '搜狗百科' : '搜狗搜索'))
    result.sourceUrl = sourceUrl
    
    const author = this.extractAuthor(primaryText, allText, bookName)
    if (author) {
      result.author = author
    }
    
    const wordResult = this.extractWordCount(primaryText, allText)
    if (wordResult) {
      result.totalWords = wordResult.str
    }
    
    const chapterResult = this.extractChapterCount(primaryText, allText)
    if (chapterResult) {
      result.totalChapters = chapterResult.value
    }
    
    const genre = this.extractGenre(primaryText, allText)
    if (genre) {
      result.genre = genre
    }
    
    const status = this.extractStatus(primaryText, allText)
    if (status) {
      result.status = status
    }
    
    const synopsis = this.extractSynopsis(primaryText, bookName)
    if (synopsis) {
      result.synopsis = synopsis
    }
    
    const tags = extractTagsFromText(primaryText + '\n' + allText)
    if (tags.length > 0) {
      result.tags = tags
    }
    
    const nonNovelKeywords = ['手游', '游戏', 'ARPG', 'RPG', '网游', '页游', '端游', '漫画', '动漫', '动画', '电视剧', '电影']
    const combinedText = (primaryText + allText).toLowerCase()
    let isNonNovel = false
    for (const kw of nonNovelKeywords) {
      if (result.synopsis && result.synopsis.includes(kw)) {
        isNonNovel = true
        break
      }
    }
    
    let confidence = this.baseConfidence
    if (fromBaikePage && !isNonNovel) confidence += 25
    else if (fromBaike && !isNonNovel) confidence += 15
    if (isNonNovel) confidence -= 20
    confidence += successCount * 2
    if (result.author) confidence += 12
    if (result.totalChapters && !isNonNovel) confidence += 10
    if (result.totalWords && !isNonNovel) confidence += 10
    if (result.synopsis && result.synopsis.length > 80) confidence += 8
    if (result.characters.length > 0 && !isNonNovel) confidence += 5
    if (result.genre) confidence += 3
    if (result.status) confidence += 3
    
    const maxConfidence = fromBaikePage ? 78 : 68
    result.confidence = Math.max(0, Math.min(maxConfidence, confidence))
    
    if (isNonNovel) {
      result.source = '搜狗搜索'
      result.accuracyNote = '数据提取自搜狗搜索结果，经多结果交叉验证，仅供参考'
    } else {
      result.accuracyNote = fromBaikePage 
        ? '数据提取自搜狗百科，信息较准确，仅供参考'
        : '数据提取自搜狗搜索结果，经多结果交叉验证，仅供参考'
    }
    
    return result
  }

  private extractAuthor(primaryText: string, allText: string, bookName: string): string | null {
    const fromPrimary = this.voteAuthor(primaryText, bookName)
    if (fromPrimary) return fromPrimary
    
    const fromAll = this.voteAuthor(allText, bookName)
    return fromAll
  }

  private voteAuthor(text: string, bookName: string): string | null {
    const candidates: ExtractionCandidate<string>[] = []
    const escapedName = escapeRegExp(bookName)
    
    const blacklist = [
      '简介', '介绍', '是谁', '有哪些', '叫什么', '排行', '推荐',
      '多少', '续传', '续集', '外传', '前传', '后传', '新版', '旧版',
      '全文', '免费', '阅读', '下载', '小说', '作者', '字数', '章节',
      '最新', '百度', '百科', '起点', '中文网', '笔趣阁', '无弹窗',
      '年番', '动漫', '漫画', '动画', '电视剧', '电影',
      '什么', '哪些', '怎么', '为什么', '哪里', '哪个',
      '倾情', '打造', '创作', '编写', '作品', '的人',
      '内容', '目录', '正文', '书评', '书库', '书架',
      '介绍', '简介', '摘要', '概述', '详情', '信息',
      '番茄', '畅听', '终极', '笔记', '版权', '投诉',
      '删除', '下架', '侵权', '举报', '审核',
    ]
    
    const patterns = [
      { pattern: /作者[：:\s]+(?:当代|著名|知名|网络|青年|新锐|人气|畅销|实力派)?(?:作家|作者)?[：:\s]*([\u4e00-\u9fa5·]{2,5})/g, weight: 3 },
      { pattern: /作\s*者[：:\s]+(?:当代|著名|知名|网络|青年|新锐|人气|畅销|实力派)?(?:作家|作者)?[：:\s]*([\u4e00-\u9fa5·]{2,5})/g, weight: 3 },
      { pattern: /由([\u4e00-\u9fa5·]{2,5})[所著|著|写|创作]/g, weight: 3 },
      { pattern: new RegExp(`《?${escapedName}》?[^。]{0,30}?([\\u4e00-\\u9fa5·]{2,5})[著写]`, 'g'), weight: 2 },
      { pattern: /([\u4e00-\u9fa5·]{2,5})\s*[著写编]/g, weight: 1 },
    ]
    
    for (const { pattern, weight } of patterns) {
      let m
      while ((m = pattern.exec(text)) !== null) {
        const name = m[1].trim()
        if (this.isValidAuthor(name, bookName, blacklist)) {
          candidates.push({ value: name, weight, context: m[0] })
        }
      }
    }
    
    if (candidates.length === 0) return null
    
    const allCandidateNames: string[] = []
    for (const c of candidates) {
      if (!allCandidateNames.includes(c.value)) {
        allCandidateNames.push(c.value)
      }
    }
    
    const strongCandidates = candidates.filter(c => c.weight >= 3)
    const midCandidates = candidates.filter(c => c.weight >= 2)
    
    let finalCandidates = candidates
    if (strongCandidates.length > 0) {
      finalCandidates = strongCandidates
    } else if (midCandidates.length > 0) {
      finalCandidates = midCandidates
    }
    
    const voteMap: Record<string, number> = {}
    for (const c of finalCandidates) {
      voteMap[c.value] = (voteMap[c.value] || 0) + c.weight
    }
    
    let bestName = ''
    let bestVote = 0
    for (const [name, vote] of Object.entries(voteMap)) {
      if (vote > bestVote) {
        bestVote = vote
        bestName = name
      }
    }
    
    if (bestName.length === 4) {
      for (const name of allCandidateNames) {
        if (name.length === 5 && name.startsWith(bestName)) {
          bestName = name
          break
        }
      }
    }
    
    return bestName || null
  }

  private isValidAuthor(name: string, bookName: string, blacklist: string[]): boolean {
    if (!name) return false
    if (name.length < 2 || name.length > 5) return false
    if (!/^[\u4e00-\u9fa5·]+$/.test(name)) return false
    if (name === bookName) return false
    for (const word of blacklist) {
      if (name.includes(word)) return false
    }
    if (!isValidChineseName(name)) return false
    return true
  }

  private extractWordCount(primaryText: string, allText: string): { str: string; value: number } | null {
    const fromPrimary = this.voteWordCount(primaryText)
    if (fromPrimary) return fromPrimary
    
    const fromAll = this.voteWordCount(allText)
    return fromAll
  }

  private voteWordCount(text: string): { str: string; value: number } | null {
    const candidates: ExtractionCandidate<{ str: string; value: number }>[] = []
    
    const patterns = [
      { pattern: /([\d.]+)\s*万\s*字/g, weight: 5 },
      { pattern: /总字数[：:\s]*([\d.]+)\s*万?/g, weight: 5 },
      { pattern: /字数[：:\s]*([\d.]+)\s*万?/g, weight: 4 },
      { pattern: /([\d.]+)\s*万字/g, weight: 5 },
      { pattern: /累计\s*([\d.]+)\s*万/g, weight: 3 },
      { pattern: /([\d]+)\s*字/g, weight: 2 },
    ]
    
    for (const { pattern, weight } of patterns) {
      let m
      while ((m = pattern.exec(text)) !== null) {
        const numStr = m[1]
        const num = parseFloat(numStr)
        if (isNaN(num) || num <= 0) continue
        
        let value = num
        const str = numStr + (text.substring(m.index, m.index + m[0].length).includes('万') ? '万字' : '字')
        
        if (!isReasonableWords(value)) continue
        
        if (str.includes('万')) {
          value = num * 10000
        }
        
        candidates.push({ value: { str, value }, weight, context: m[0] })
      }
    }
    
    if (candidates.length === 0) return null
    
    const voteMap: Record<string, { weight: number; value: number; str: string }> = {}
    for (const c of candidates) {
      const key = Math.round(c.value.value / 10000).toString() + '万'
      if (!voteMap[key]) {
        voteMap[key] = { weight: 0, value: c.value.value, str: c.value.str }
      }
      voteMap[key].weight += c.weight
    }
    
    let best = { str: '', value: 0, weight: 0 }
    for (const v of Object.values(voteMap)) {
      if (v.weight > best.weight) {
        best = v
      }
    }
    
    return best.weight > 0 ? { str: best.str, value: best.value } : null
  }

  private extractChapterCount(primaryText: string, allText: string): { value: number; str: string } | null {
    const fromPrimary = this.voteChapterCount(primaryText)
    if (fromPrimary) return fromPrimary
    
    const fromAll = this.voteChapterCount(allText)
    return fromAll
  }

  private voteChapterCount(text: string): { value: number; str: string } | null {
    const candidates: ExtractionCandidate<{ value: number; str: string }>[] = []
    
    const patterns = [
      { pattern: /共\s*([\d,]+)\s*章/g, weight: 5 },
      { pattern: /总章节[：:\s]*([\d,]+)/g, weight: 5 },
      { pattern: /章节数[：:\s]*([\d,]+)/g, weight: 4 },
      { pattern: /([\d,]+)\s*章/g, weight: 2 },
      { pattern: /第\s*([\d,]+)\s*章[节]?/g, weight: 1 },
    ]
    
    for (const { pattern, weight } of patterns) {
      let m
      while ((m = pattern.exec(text)) !== null) {
        const numStr = m[1].replace(/,/g, '')
        const num = parseInt(numStr, 10)
        if (isNaN(num) || num <= 0) continue
        
        if (!isReasonableChapters(num)) continue
        
        candidates.push({ value: { value: num, str: num + '章' }, weight, context: m[0] })
      }
    }
    
    if (candidates.length === 0) return null
    
    const voteMap: Record<string, { weight: number; value: number; str: string }> = {}
    for (const c of candidates) {
      const key = c.value.value.toString()
      if (!voteMap[key]) {
        voteMap[key] = { weight: 0, value: c.value.value, str: c.value.str }
      }
      voteMap[key].weight += c.weight
    }
    
    let best = { value: 0, str: '', weight: 0 }
    for (const v of Object.values(voteMap)) {
      if (v.weight > best.weight) {
        best = v
      }
    }
    
    return best.weight > 0 ? { value: best.value, str: best.str } : null
  }

  private extractGenre(primaryText: string, allText: string): string | null {
    const fromPrimary = extractGenreFromText(primaryText)
    if (fromPrimary) return fromPrimary
    
    const fromAll = extractGenreFromText(allText)
    return fromAll
  }

  private extractStatus(primaryText: string, allText: string): string | null {
    const combined = primaryText + '\n' + allText
    
    if (/已完结|完结|完本|全本|已完成|完成/.test(combined)) {
      return '已完结'
    }
    if (/连载中|连载|更新中|正在更新|持续更新/.test(combined)) {
      return '连载中'
    }
    
    return null
  }

  private extractSynopsis(text: string, bookName: string): string {
    let synopsis = ''
    
    const patterns = [
      /内容简介[：:\s]+(.{50,800}?)(?=\s+(?:作者|主角|出版社|出版时间|ISBN|目录|第[一二三四五六七八九十]+[章部卷]|$))/,
      /简介[：:\s]+(.{50,800}?)(?=\s+(?:作者|主角|出版社|出版时间|ISBN|目录|第[一二三四五六七八九十]+[章部卷]|$))/,
      /作品简介[：:\s]+(.{50,800}?)(?=\s+(?:作者|主角|出版社|出版时间|ISBN|目录|第[一二三四五六七八九十]+[章部卷]|$))/,
      /小说简介[：:\s]+(.{50,800}?)(?=\s+(?:作者|主角|出版社|出版时间|ISBN|目录|第[一二三四五六七八九十]+[章部卷]|$))/,
    ]
    
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        synopsis = match[1].trim()
        break
      }
    }
    
    if (!synopsis) {
      const sentences = text.split(/[。！？!?；;]/)
      const meaningful = sentences.filter(s => 
        s.length > 20 && 
        !s.includes('搜索') && 
        !s.includes('下载') && 
        !s.includes('阅读') &&
        !s.includes('免费')
      )
      if (meaningful.length > 0) {
        synopsis = meaningful.slice(0, 3).join('。') + '。'
      }
    }
    
    synopsis = synopsis
      .replace(/\s+/g, ' ')
      .replace(/^[,，。.、；;：:]+/, '')
      .trim()
    
    if (synopsis.length > 500) {
      synopsis = synopsis.substring(0, 500) + '...'
    }
    
    return synopsis
  }
}

const sogouSource = new SogouSearchSource()
export default sogouSource
