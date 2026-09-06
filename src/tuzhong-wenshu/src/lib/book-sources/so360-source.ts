/**
 * 360搜索数据源
 * 
 * 通过360搜索结果页提取小说信息
 * 优先搜索360百科（site:baike.so.com），信息最准确
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

export class So360SearchSource implements BookSourceProvider {
  id = 'so360'
  name = '360搜索'
  baseConfidence = 55
  enabled = true
  // 🔥 360百科数据质量不稳定，最高置信度限制为70，避免覆盖百度百科

  async searchBook(bookName: string, options: SearchOptions = {}): Promise<BookSourceData | null> {
    console.log(`[So360SearchSource] 搜索: ${bookName}`)

    try {
      const timeout = options.timeout || 20000
      
      const queries = [
        `${bookName} 小说 site:baike.so.com`,
        `${bookName} 小说 作者 字数 章节`,
        `${bookName} 起点中文网 字数`,
        `${bookName} 小说 多少万字 总字数`,
        `${bookName} 小说 目录 共多少章`,
      ]
      
      let allText = ''
      let baikeText = ''
      let baikeUrl = ''
      let sourceUrl = ''
      let successCount = 0
      
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i]
        try {
          const html = await this.fetch360Search(query, timeout / queries.length)
          const text = this.cleanSearchResult(html)
          allText += '\n' + text
          successCount++
          
          if (i === 0) {
            const extractedUrl = this.extractBaikeUrl(html, bookName)
            if (extractedUrl) {
              baikeUrl = extractedUrl
              console.log(`[So360SearchSource] 找到360百科页面: ${baikeUrl}`)
            }
          }
          
          if (!sourceUrl) {
            sourceUrl = `https://www.so.com/s?q=${encodeURIComponent(query)}`
          }
        } catch (e) {
          console.warn(`[So360SearchSource] 搜索"${query}"失败:`, e instanceof Error ? e.message : String(e))
        }
      }
      
      if (baikeUrl) {
        try {
          const baikeHtml = await this.fetch360Baike(baikeUrl, timeout / 3)
          const extractedBaikeText = this.cleanBaikePage(baikeHtml)
          if (extractedBaikeText.length > 500) {
            baikeText = extractedBaikeText
            sourceUrl = baikeUrl
            console.log(`[So360SearchSource] 成功访问360百科页面，文本长度: ${baikeText.length}`)
          }
        } catch (e) {
          console.warn(`[So360SearchSource] 访问360百科页面失败:`, e instanceof Error ? e.message : String(e))
        }
      }
      
      if (successCount === 0 || !allText.trim()) {
        console.warn('[So360SearchSource] 所有搜索都失败了')
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
      
      console.log(`[So360SearchSource] 解析完成: ${result.title}, 作者: ${result.author}, 字数: ${result.totalWords}, 章节: ${result.totalChapters}, 置信度: ${result.confidence}, 来源: ${baikeText ? '360百科' : '360搜索'}`)
      
      return result

    } catch (error) {
      console.error('[So360SearchSource] 搜索出错:', error instanceof Error ? error.message : String(error))
      return null
    }
  }

  /**
   * 请求360搜索
   */
  private async fetch360Search(keyword: string, timeoutMs: number): Promise<string> {
    const url = `https://www.so.com/s?q=${encodeURIComponent(keyword)}`
    
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
          'Referer': 'https://www.so.com/',
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
   * 从搜索结果HTML中提取360百科页面URL
   */
  private extractBaikeUrl(html: string, bookName: string): string {
    const patterns = [
      /href="(https?:\/\/baike\.so\.com\/doc\/[0-9]+-[0-9]+\.html)"/i,
      /href="(https?:\/\/baike\.so\.com\/doc\/[^"]+\.html)"/i,
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
   * 请求360百科页面
   */
  private async fetch360Baike(url: string, timeoutMs: number): Promise<string> {
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
          'Referer': 'https://www.so.com/',
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
   * 清理360百科页面内容，提取主要文本
   */
  private cleanBaikePage(html: string): string {
    let text = html
    
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    
    const mainContentMatch = text.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
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
   * 清理简介中的噪音（导航、搜索结果等）
   */
  private cleanSynopsis(text: string): string {
    let clean = text
    
    // 去掉从常见噪音关键词开始的后面内容（找最早出现的噪音）
    const noisePatterns = [
      /\s+ai(?=\.|so|\s|$)/,  // ai开头的
      /\s+so\.com/,
      /\s+baidu\.com/,
      /\s+baike\.so/,
      /\s+baike\.baidu/,
      /\s+https?:\/\//,
      /\s+反馈/,
      /\s+其他人还搜/,
      /\s+相关搜索/,
      /\s+为您推荐/,
      /\s+360\s+/,
      /\s+百度\s+/,
    ]
    
    let cutIndex = clean.length
    for (const p of noisePatterns) {
      const m = clean.match(p)
      if (m && m.index !== undefined && m.index > 10 && m.index < cutIndex) {
        cutIndex = m.index
      }
    }
    if (cutIndex < clean.length) {
      clean = clean.substring(0, cutIndex)
    }
    
    // 去掉URL和域名
    clean = clean.replace(/https?:\/\/[^\s]+/g, ' ')
    clean = clean.replace(/[a-zA-Z0-9-]+\.(com|cn|net|org|vip|io)[^\s]*/g, ' ')
    
    // 去掉多余的空格和符号
    clean = clean.replace(/\s+/g, ' ').trim()
    clean = clean.replace(/[.。…·,\s]+$/g, '')  // 去掉结尾的标点和空格
    
    return clean
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
    const result = createDefaultBook(bookName, fromBaikePage ? '360百科' : (fromBaike ? '360百科' : '360搜索'))
    result.sourceUrl = sourceUrl
    
    const author = this.extractAuthor(primaryText, allText, bookName)
    if (author) {
      result.author = author
    }
    
    const wordResult = this.extractWordCount(primaryText, allText)
    if (wordResult) {
      result.totalWords = wordResult.str
      result.wordCountWan = wordResult.num
    }
    
    const chapters = this.extractChapters(primaryText, allText)
    if (chapters) {
      result.totalChapters = chapters
    }
    
    const genre = extractGenreFromText(primaryText) || extractGenreFromText(allText)
    if (genre) {
      result.genre = genre
    }
    
    const status = this.extractStatus(primaryText) || this.extractStatus(allText)
    if (status) {
      result.status = status
    }
    
    const tags = extractTagsFromText(primaryText)
    if (tags.length > 0) {
      result.tags = tags
    }
    
    const synopsis = this.extractSynopsis(primaryText, bookName, result.author)
    if (synopsis) {
      result.synopsis = synopsis
    }
    
    const chars = this.extractCharacters(primaryText, bookName)
    if (chars.length > 0) {
      result.characters = chars
    }
    
    // 🔥 小说相关性检查：如果内容明显是游戏/漫画/动画，降低置信度
    const nonNovelKeywords = ['手游', '游戏', 'ARPG', 'RPG', '网游', '页游', '端游', '漫画', '动漫', '动画', '电视剧', '电影']
    const combinedText = (primaryText + allText).toLowerCase()
    let isNonNovel = false
    for (const kw of nonNovelKeywords) {
      // 检查简介中是否包含这些关键词（简介最能反映内容类型）
      if (result.synopsis && result.synopsis.includes(kw)) {
        isNonNovel = true
        break
      }
    }
    
    let confidence = this.baseConfidence
    if (fromBaikePage && !isNonNovel) confidence += 25  // 直接访问百科页面加25分
    else if (fromBaike && !isNonNovel) confidence += 15  // 百科搜索结果加15分
    if (isNonNovel) confidence -= 20  // 非小说内容大幅降权
    confidence += successCount * 2
    if (result.author) confidence += 12
    if (result.totalChapters && !isNonNovel) confidence += 10  // 非小说的章节数不可信
    if (result.totalWords && !isNonNovel) confidence += 10  // 非小说的字数不可信
    if (result.synopsis && result.synopsis.length > 80) confidence += 8
    if (result.characters.length > 0 && !isNonNovel) confidence += 5
    if (result.genre) confidence += 3
    if (result.status) confidence += 3
    
    const maxConfidence = fromBaikePage ? 80 : 70
    result.confidence = Math.max(0, Math.min(maxConfidence, confidence))
    
    if (isNonNovel) {
      result.source = '360搜索'  // 非小说的百科内容降级为普通搜索结果
      result.accuracyNote = '数据提取自360搜索结果，经多结果交叉验证，仅供参考'
    } else {
      result.accuracyNote = fromBaike 
        ? '数据提取自360百科，信息较准确，仅供参考'
        : '数据提取自360搜索结果，经多结果交叉验证，仅供参考'
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
    
    // 收集所有候选名字（用于后续的前缀扩展检查）
    const allCandidateNames: string[] = []
    for (const c of candidates) {
      if (!allCandidateNames.includes(c.value)) {
        allCandidateNames.push(c.value)
      }
    }
    
    // 强模式优先策略
    const strongCandidates = candidates.filter(c => c.weight >= 3)
    const midCandidates = candidates.filter(c => c.weight >= 2)
    
    let finalCandidates = candidates
    if (strongCandidates.length > 0) {
      finalCandidates = strongCandidates
    } else if (midCandidates.length > 0) {
      finalCandidates = midCandidates
    }
    
    // 投票
    const voteMap: Record<string, number> = {}
    for (const c of finalCandidates) {
      voteMap[c.value] = (voteMap[c.value] || 0) + c.weight
    }
    
    // 找出得票最高的
    let bestName = ''
    let bestVote = 0
    for (const [name, vote] of Object.entries(voteMap)) {
      if (vote > bestVote) {
        bestVote = vote
        bestName = name
      }
    }
    
    // 🔥 关键修复：如果最高票是4字名字，检查所有候选中是否有5字名字以它为前缀
    //    例如："我吃西红" + "柿" = "我吃西红柿"（避免5字名字被强模式截断）
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
    if (name.includes(bookName)) return false
    
    for (const b of blacklist) {
      if (name.includes(b)) return false
    }
    
    const invalidPrefixes = ['第', '最', '有', '全', '本', '是', '就', '都', '还', '也', '又', '把', '被', '给', '让', '使', '从', '向', '跟', '同', '和', '与', '及', '对', '为', '以', '到', '在', '网', '游', '穿', '重', '仙', '魔', '神', '圣', '龙', '剑', '斗', '战']
    for (const p of invalidPrefixes) {
      if (name.startsWith(p)) return false
    }
    
    const invalidSuffixes = ['的', '了', '是', '在', '和', '与', '及', '给', '让', '使', '从', '向', '跟', '同', '对', '为', '以', '到', '介', '绍', '述', '情', '节', '录', '制', '者', '所', '著', '写', '编', '创', '作', '说', '文', '章', '书', '本', '篇', '部', '集', '卷', '回', '章', '节', '页', '网', '络', '站', '吧', '坛', '群', '类', '型', '态', '代']
    for (const s of invalidSuffixes) {
      if (name.endsWith(s)) return false
    }
    
    const twoCharBlacklist = ['网络', '小说', '作者', '简介', '内容', '目录', '正文', '最新', '全文', '免费', '阅读', '下载', '百度', '百科', '起点', '中文', '笔趣', '无弹', '动漫', '漫画', '动画', '电视', '电影', '游戏', '网游', '玄幻', '仙侠', '都市', '言情', '历史', '军事', '科幻', '灵异', '悬疑', '青春', '职场', '现实', '竞技', '轻小', '同人', '男频', '女频', '主角', '女主', '男主', '系统', '穿越', '重生', '修仙', '修真', '当代', '现代', '古代', '未来', '番茄', '畅听']
    if (name.length === 2 && twoCharBlacklist.includes(name)) return false
    
    if (name.endsWith('创') && name.length > 2) {
      const withoutLast = name.slice(0, -1)
      if (isValidChineseName(withoutLast)) {
        return false
      }
    }
    return true
  }

  private extractWordCount(primaryText: string, allText: string): { str: string; num: number } | null {
    const fromPrimary = this.voteWordCount(primaryText)
    if (fromPrimary) return fromPrimary
    
    const fromAll = this.voteWordCount(allText)
    return fromAll
  }

  private voteWordCount(text: string, bookName?: string, author?: string): { str: string; num: number } | null {
    // 🔥 关键优化：只处理底部噪音区域之前的文本
    // （顶部的"相关搜索"是搜索建议，不是底部噪音，所以只检查后半部分）
    const noiseKeywords = ['相关搜索', '为您推荐', '相关小说', '相关人物', '热门资讯', '猜你喜欢', '相关推荐']
    let cleanText = text
    const halfIdx = Math.floor(text.length * 0.5)
    for (const kw of noiseKeywords) {
      const idx = text.indexOf(kw, halfIdx)
      if (idx > 0) {
        cleanText = text.substring(0, idx)
        break
      }
    }
    
    // 检查文本是否与游戏相关
    const gameKeywords = ['手游', '游戏', 'ARPG', 'RPG', '网游', '页游', '端游']
    const isGameRelated = gameKeywords.some(kw => cleanText.includes(kw))
    
    const candidates: { num: number; weight: number }[] = []
    
    // 🔥 上下文无关的关键词：如果这些词出现在字数附近，说明这个字数可能不属于本书
    const unrelatedContextKeywords = ['商战', '职场', '都市', '校园', '言情', '历史', '军事', '科幻', '悬疑', '灵异', '同人']
    
    const strongPatterns = [
      /(?:字数|总字数|全文共|全书共|共计|总共|累计|约|大概|总计)[^0-9]{0,10}(\d+(?:\.\d+)?)\s*万[字余多]/gi,
      /(?:字数|总字数|体量)\s*[:：]\s*(\d+(?:\.\d+)?)\s*万[字余多]/gi,
      /全书共(\d+(?:\.\d+)?)\s*万字/gi,
      /总计约(\d+(?:\.\d+)?)\s*万字/gi,
    ]
    
    for (const p of strongPatterns) {
      let m
      while ((m = p.exec(cleanText)) !== null) {
        const num = Number(m[1])
        if (isReasonableWords(num)) {
          // 检查上下文是否包含不相关的关键词
          const contextStart = Math.max(0, m.index - 50)
          const contextEnd = Math.min(cleanText.length, m.index + m[0].length + 50)
          const context = cleanText.substring(contextStart, contextEnd)
          const hasUnrelated = unrelatedContextKeywords.some(kw => context.includes(kw))
          if (hasUnrelated) continue  // 上下文不相关，跳过
          
          let weight = 5
          // 游戏相关文本中的强模式权重降低
          if (isGameRelated) weight -= 2
          // 落在常见小说字数范围（100-500万字）的，权重加成
          if (num >= 100 && num <= 500) weight += 2
          candidates.push({ num, weight })
        }
      }
    }
    
    const midPatterns = [
      /(\d+(?:\.\d+)?)\s*万字[^。]{0,20}?(?:\d+\s*章|已完结|完本|连载|全书|小说)/gi,
      /(?:已完结|完本|连载|全书|小说)[^。]{0,20}?(\d+(?:\.\d+)?)\s*万字/gi,
      /(\d+(?:\.\d+)?)\s*万字[^。]{0,30}?由[\u4e00-\u9fa5·]{2,4}[所著|著]/gi,
    ]
    
    for (const p of midPatterns) {
      let m
      while ((m = p.exec(cleanText)) !== null) {
        const num = Number(m[1])
        if (isReasonableWords(num)) {
          // 检查上下文是否包含不相关的关键词
          const contextStart = Math.max(0, m.index - 50)
          const contextEnd = Math.min(cleanText.length, m.index + m[0].length + 50)
          const context = cleanText.substring(contextStart, contextEnd)
          const hasUnrelated = unrelatedContextKeywords.some(kw => context.includes(kw))
          if (hasUnrelated) continue  // 上下文不相关，跳过
          
          let weight = 2
          // 落在常见小说字数范围的，权重加成
          if (num >= 100 && num <= 500) weight += 1
          candidates.push({ num, weight })
        }
      }
    }
    
    const weakPattern = /(\d+(?:\.\d+)?)\s*万[字余多]/g
    let m
    while ((m = weakPattern.exec(cleanText)) !== null) {
      const num = Number(m[1])
      // 弱模式只考虑更合理的范围（20-800万字）
      if (num > 20 && num < 800) {
        // 检查上下文是否包含不相关的关键词
        const contextStart = Math.max(0, m.index - 30)
        const contextEnd = Math.min(cleanText.length, m.index + m[0].length + 30)
        const context = cleanText.substring(contextStart, contextEnd)
        const hasUnrelated = unrelatedContextKeywords.some(kw => context.includes(kw))
        if (hasUnrelated) continue  // 上下文不相关，跳过
        
        let weight = 1
        // 落在常见小说字数范围的，权重加成
        if (num >= 100 && num <= 500) weight += 1
        candidates.push({ num, weight })
      }
    }
    
    if (candidates.length === 0) return null
    
    const bucketMap: Record<number, { totalWeight: number; nums: number[] }> = {}
    for (const c of candidates) {
      const bucket = Math.round(c.num / 20) * 20
      if (!bucketMap[bucket]) {
        bucketMap[bucket] = { totalWeight: 0, nums: [] }
      }
      bucketMap[bucket].totalWeight += c.weight
      bucketMap[bucket].nums.push(c.num)
    }
    
    let bestBucket = 0
    let bestWeight = 0
    for (const [bucket, data] of Object.entries(bucketMap)) {
      if (data.totalWeight > bestWeight) {
        bestWeight = data.totalWeight
        bestBucket = Number(bucket)
      }
    }
    
    if (bestBucket === 0) return null
    
    const bestNums = bucketMap[bestBucket].nums
    const avgNum = Math.round(bestNums.reduce((a, b) => a + b, 0) / bestNums.length * 10) / 10
    
    return {
      str: avgNum + '万字',
      num: avgNum,
    }
  }

  private extractChapters(primaryText: string, allText: string): number | null {
    // 同时在primaryText和allText中找，取置信度最高的
    const candidates: { num: number; weight: number }[] = []
    
    // 从primaryText中提取（权重更高，因为更可信）
    const fromPrimary = this.voteChaptersWithDetail(primaryText)
    for (const c of fromPrimary) {
      candidates.push({ num: c.num, weight: c.weight * 1.5 })
    }
    
    // 从allText中提取
    const fromAll = this.voteChaptersWithDetail(allText)
    for (const c of fromAll) {
      candidates.push(c)
    }
    
    if (candidates.length === 0) return null
    
    // 分桶投票
    const bucketMap: Record<number, { totalWeight: number; nums: number[] }> = {}
    for (const c of candidates) {
      const bucket = Math.round(c.num / 50) * 50
      if (!bucketMap[bucket]) {
        bucketMap[bucket] = { totalWeight: 0, nums: [] }
      }
      bucketMap[bucket].totalWeight += c.weight
      bucketMap[bucket].nums.push(c.num)
    }
    
    let bestBucket = 0
    let bestWeight = 0
    for (const [bucket, data] of Object.entries(bucketMap)) {
      if (data.totalWeight > bestWeight) {
        bestWeight = data.totalWeight
        bestBucket = Number(bucket)
      }
    }
    
    if (bestBucket === 0) return null
    
    const bestNums = bucketMap[bestBucket].nums
    const avgNum = Math.round(bestNums.reduce((a, b) => a + b, 0) / bestNums.length)
    
    return avgNum
  }
  
  private voteChaptersWithDetail(text: string): Array<{ num: number; weight: number }> {
    // 只处理底部噪音区域之前的文本（从2/3位置开始找，保留更多内容）
    const noiseKeywords = ['相关搜索', '为您推荐', '相关小说', '相关人物', '热门资讯', '猜你喜欢', '相关推荐']
    let cleanText = text
    const twoThirdsIdx = Math.floor(text.length * 0.66)
    for (const kw of noiseKeywords) {
      const idx = text.indexOf(kw, twoThirdsIdx)
      if (idx > 0) {
        cleanText = text.substring(0, idx)
        break
      }
    }
    
    const candidates: { num: number; weight: number }[] = []
    
    // 🔥 最强模式：明确的总章节数表述（权重最高）
    const strongestPatterns = [
      /(?:全书|全文|整部小说|整本书|总共|一共|总计|共计|累计)\s*(?:有|共)?\s*(\d{2,6})\s*(?:章|集|话|节|回|篇)/gi,
      /(?:章节数|总章节|章数|总章数)\s*[:：是为]\s*(\d{2,6})/gi,
      /共有\s*(\d{2,6})\s*(?:章|集|话|节|回|篇)/gi,
      /共\s*(\d{2,6})\s*(?:章|集|话|节|回|篇)[。，,；]/gi,
    ]
    
    for (const p of strongestPatterns) {
      let m
      while ((m = p.exec(cleanText)) !== null) {
        const num = Number(m[1])
        if (isReasonableChapters(num)) {
          candidates.push({ num, weight: 15 })
        }
      }
    }
    
    const strongPatterns = [
      /(?:共|全文|全书|总计|共计|总共|一共|累计|章节数|总章节|章数|体量)[^0-9]{0,10}(\d{2,6})\s*(?:章|集|话|节|回|篇)/gi,
      /(?:章节数|总章节|章数)\s*[:：]\s*(\d{2,6})/gi,
      /全书共(\d{2,6})\s*章/gi,
    ]
    
    for (const p of strongPatterns) {
      let m
      while ((m = p.exec(cleanText)) !== null) {
        const num = Number(m[1])
        if (isReasonableChapters(num)) {
          candidates.push({ num, weight: 5 })
        }
      }
    }
    
    const midPatterns = [
      /(\d{2,6})\s*(?:章|集|话|节|回)\s*[^0-9]{0,15}\d+(?:\.\d+)?\s*万字/gi,
      /(\d{2,6})\s*(?:章|集|话|节|回)\s*(?:已完结|完本|全本|完结|全书)/gi,
      /(?:已完结|完本|全本|完结|全书)[^。]{0,20}?(\d{2,6})\s*(?:章|集|话|节|回)/gi,
    ]
    
    for (const p of midPatterns) {
      let m
      while ((m = p.exec(cleanText)) !== null) {
        const num = Number(m[1])
        if (isReasonableChapters(num)) {
          candidates.push({ num, weight: 2 })
        }
      }
    }
    
    // 弱模式：第X章（可能是章节列表中的某一章，权重很低）
    const weakPattern = /第(\d{2,6})\s*(?:章|集|话|节|回)/g
    let m
    while ((m = weakPattern.exec(cleanText)) !== null) {
      const num = Number(m[1])
      if (isReasonableChapters(num) && num > 100 && num < 5000) {
        candidates.push({ num, weight: 0.3 })
      }
    }
    
    return candidates
  }

  private extractStatus(text: string): string | null {
    let finishedCount = 0
    let ongoingCount = 0
    
    const finishedPatterns = [/已完结/g, /完本/g, /完结/g, /全本/g, /全书完/g, /全文完/g, /出版/g]
    const ongoingPatterns = [/连载中/g, /正在连载/g, /更新中/g, /持续连载/g]
    
    for (const p of finishedPatterns) {
      const m = text.match(p)
      if (m) finishedCount += m.length
    }
    
    for (const p of ongoingPatterns) {
      const m = text.match(p)
      if (m) ongoingCount += m.length
    }
    
    if (finishedCount > ongoingCount && finishedCount > 0) return '已完结'
    if (ongoingCount > finishedCount && ongoingCount > 0) return '连载中'
    return null
  }

  private extractSynopsis(text: string, bookName: string, author?: string): string | null {
    // 🔥 优先匹配明确的简介开头（最高优先级）
    const explicitPatterns = [
      /小说百科\s*《[^》]*》\s*是[^。；\n!?！？]*小说[,，]\s*([^。；\n!?！？]{20,}(?:[。；\n!?！？]|$))/g,
      /核心剧情[:：]\s*([^。；\n!?！？]{10,}(?:[。；\n!?！？]|$))/g,
      /内容简介[:：]\s*([^。；\n!?！？]{10,}(?:[。；\n!?！？]|$))/g,
      /小说简介[:：]\s*([^。；\n!?！？]{10,}(?:[。；\n!?！？]|$))/g,
      /故事简介[:：]\s*([^。；\n!?！？]{10,}(?:[。；\n!?！？]|$))/g,
      /作品简介[:：]\s*([^。；\n!?！？]{10,}(?:[。；\n!?！？]|$))/g,
      /简介[:：]\s*([^。；\n!?！？]{10,}(?:[。；\n!?！？]|$))/g,
      /主要讲述了?\s*([^。；\n!?！？]{10,}(?:[。；\n!?！？]|$))/g,
    ]
    
    for (const p of explicitPatterns) {
      let m
      while ((m = p.exec(text)) !== null) {
        let synopsis = m[1].trim()
        // 清理噪音
        synopsis = this.cleanSynopsis(synopsis)
        if (synopsis.length >= 15 && synopsis.length <= 500) {
          // 检查是否是游戏相关的
          if (/手游|游戏|ARPG|RPG|网游|页游|端游/.test(synopsis)) continue
          // 检查是否是图书出版信息（不是小说剧情简介）
          if (/出版社|出版.*图书|编著图书|著图书/.test(synopsis)) continue
          return synopsis
        }
      }
    }
    
    // 常规的句子打分方式
    const sentences = text.split(/[。；\n!?！？]/)
    const scored: { text: string; score: number }[] = []
    
    // 网站导航/广告类关键词（这些句子直接排除）
    const navKeywords = [
      '反馈', '开始阅读', '全文免费', '在线阅读', '下载', '笔趣阁', '无弹窗',
      '最新章节', '更新', '百度', '360', '搜索', '网站', '问答', '视频',
      '首页', '登录', '注册', '关于', '联系', '版权', '隐私', '导航', '菜单',
      '更多', '下一页', '上一页', '推荐', '热门', '返回', '滚动', '点击', '跳转',
      '网站地图', 'copyright', '©', 'so.com', 'baidu.com', 'qq.com',
      '立即阅读', '加入书架', '投票推荐', '打赏', '书评区',
      '相关搜索', '为您推荐', '相关小说', '相关人物', '热门资讯',
      '用户反馈', '隐私管理', '我要举报', '意见反馈',
    ]
    
    // 简介常见开头模式
    const synopsisStartPatterns = [
      /^[【\[].*?[】\]]\s*[\u4e00-\u9fa5]/, // 【标签】开头（番茄小说风格）
      /^(?:讲述|描写|主要讲|故事讲述|小说讲述|内容简介|简介)[：:]?/,
      /^(?:主角|男主|女主)[：是叫为姓]/,
    ]
    
    for (const s of sentences) {
      let trimmed = s.trim()
      
      // 🔥 清理搜索结果标题前缀（如"莽荒纪 _360百科"、"莽荒纪 百度百科"等）
      trimmed = trimmed.replace(/^[^《]{0,20}_(?:360百科|百度百科|搜狗百科|百科)\s*/, '')
      trimmed = trimmed.replace(/^[^《]{0,20}(?:360百科|百度百科|搜狗百科)\s+/, '')
      
      if (trimmed.length < 30 || trimmed.length > 500) continue
      
      // 过滤掉包含导航关键词的句子
      let hasNavKeyword = false
      for (const kw of navKeywords) {
        if (trimmed.includes(kw)) {
          hasNavKeyword = true
          break
        }
      }
      if (hasNavKeyword) continue
      
      let score = 0
      
      // 包含书名：高分
      if (trimmed.includes(bookName)) {
        score += 5
      }
      
      // 包含作者名：加分
      if (author && trimmed.includes(author)) score += 2
      
      // 长度加分
      score += trimmed.length > 100 ? 3 : (trimmed.length > 80 ? 2 : 1)
      
      // 简介相关关键词：加分
      if (/主角|讲述|描写|故事|讲述了|描写了|主要讲|内容简介|小说以|简介|是一部|是一本|是一作|创作的|著有|作品/.test(trimmed)) score += 3
      
      // 题材关键词：加分
      if (/穿越|重生|修仙|玄幻|都市|系统|洪荒|仙侠|武侠|科幻|历史|军事|言情|悬疑/.test(trimmed)) score += 1
      
      // 🔥 游戏/漫画/影视相关：大幅减分（这些不是小说简介）
      if (/手游|游戏|ARPG|RPG|网游|页游|端游|漫画|动漫|动画|电视剧|电影|改编手游|游戏评测|游戏特色|游戏玩法|副本系统|人物介绍\s*游戏/.test(trimmed)) score -= 10
      
      // 🔥 明确的小说简介关键词：大幅加分
      if (/核心剧情|内容简介|小说简介|故事简介|作品简介|简介\s*[:：]|主要讲述|小说讲述|小说以|小说是|是一部.*小说|是一本.*小说|.*创作的.*小说|.*著的.*小说/.test(trimmed)) score += 5
      
      // 🔥 以书名开头+包含作者+包含"小说"等关键词：非常可能是简介
      const startsWithBookName = trimmed.indexOf(bookName) >= 0 && trimmed.indexOf(bookName) < 10
      if (startsWithBookName && author && trimmed.includes(author) && trimmed.includes('小说')) score += 5
      
      // 典型简介开头模式：加分（但要排除纯标签堆砌）
      const isSynopsisStart = synopsisStartPatterns.some(p => p.test(trimmed))
      if (isSynopsisStart && trimmed.length > 50) {
        score += 2
      }
      
      // 章节相关：减分
      if (/第.*章|最新章节|更新|笔趣阁|无弹窗|免费阅读/.test(trimmed)) score -= 5
      
      // 纯标签堆砌（【】里有太多顿号分隔的词）：减分
      const tagMatch = trimmed.match(/^[【\[](.*?)[】\]]/)
      if (tagMatch) {
        const tagContent = tagMatch[1]
        const tagCount = tagContent.split(/[、,，]/).length
        if (tagCount >= 5 && trimmed.length < tagContent.length + 20) {
          score -= 3 // 纯标签，减分
        }
      }
      
      // 必须至少有一定分数才考虑
      if (score > 0) {
        scored.push({ text: trimmed, score })
      }
    }
    
    if (scored.length === 0) return null
    
    scored.sort((a, b) => b.score - a.score)
    
    // 返回得分最高的1-3个句子（组合成更完整的简介）
    const topSentences = scored.slice(0, 3)
    
    // 去重（去掉重复的句子）
    const uniqueSentences: string[] = []
    const seen = new Set<string>()
    for (const s of topSentences) {
      const key = s.text.substring(0, 30)
      if (!seen.has(key)) {
        seen.add(key)
        uniqueSentences.push(s.text)
      }
    }
    
    const result = uniqueSentences.join('。') + '。'
    
    // 清理简介中的噪音
    return this.cleanSynopsis(result)
  }

  private extractCharacters(text: string, bookName: string) {
    const chars: Array<{ name: string; role: string; note: string }> = []
    const foundNames = new Set<string>()
    
    const patterns = [
      { pattern: /主角[：是叫为姓]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '主角', weight: 3 },
      { pattern: /男主[：是叫为姓]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '主角', weight: 2 },
      { pattern: /女主角?[：是叫为姓]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '女主', weight: 2 },
      { pattern: /核心人物[：]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '主角', weight: 2 },
    ]
    
    const voteMap: Record<string, { role: string; weight: number }> = {}
    
    for (const { pattern, role, weight } of patterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1].trim()
        if (name && name.length >= 2 && name.length <= 4 && !foundNames.has(name) && name !== bookName) {
          if (!voteMap[name]) {
            voteMap[name] = { role, weight: 0 }
          }
          voteMap[name].weight += weight
          if (role === '女主') voteMap[name].role = '女主'
        }
      }
    }
    
    const sorted = Object.entries(voteMap)
      .filter(([, data]) => data.weight >= 2)
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 5)
    
    for (const [name, data] of sorted) {
      foundNames.add(name)
      chars.push({ name, role: data.role, note: '360百科提取' })
    }
    
    return chars
  }

  async testConnection(): Promise<boolean> {
    try {
      const html = await this.fetch360Search('test', 5000)
      return html.length > 0
    } catch (e) {
      return false
    }
  }
}

export default new So360SearchSource()
