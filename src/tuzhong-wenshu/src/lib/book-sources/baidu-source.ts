/**
 * 增强版百度搜索数据源 - PC版百度百科反爬抓取
 * 
 * 四层反爬架构：
 * 1. 静态fetch模式：轻量快速抓取基础摘要
 * 2. Playwright无头渲染模式：应对JS/人机验证自动触发
 * 3. 本地缓存：7天缓存同名小说词条
 * 4. 精准解析：百度百科信息框+正文结构化提取
 * 
 * 仅抓取小说基础创作骨架元数据，合规使用
 */

import { BookSourceProvider, BookSourceData, SearchOptions, BookCharacter } from './types'
import {
  createDefaultBook,
  stripHtml,
  extractAuthorFromText,
  extractGenreFromText,
  extractTagsFromText,
  isValidChineseName,
  isReasonableWords,
  isReasonableChapters,
  escapeRegExp,
  chineseNumberToInt,
} from './utils'
import { FAMOUS_NOVELS } from './famous-novels'
import playwrightManager from './playwright-manager'
import localCache from './local-cache'
import https from 'https'

interface ExtractionCandidate<T> {
  value: T
  weight: number
  context?: string
}

const CACHE_NAMESPACE = 'baidu_baike_v15'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7天

export class BaiduSearchSource implements BookSourceProvider {
  id = 'baidu'
  name = '百度搜索'
  baseConfidence = 78
  enabled = true

  async searchBook(bookName: string, options: SearchOptions = {}): Promise<BookSourceData | null> {
    console.log(`[BaiduSearchSource] 搜索: ${bookName}`)

    try {
      const timeout = options.timeout || 15000 // 优化：默认超时从30s降到15s
      
      const cached = localCache.get<BookSourceData>(CACHE_NAMESPACE, bookName)
      if (cached) {
        return cached
      }
      
      let baikeText = ''
      let baikeHtml = ''  // 保存百度百科原始HTML，用于信息框精准提取
      let baikeInfoBox: Record<string, string> = {}  // 信息框结构化数据（直接从DOM提取，最准确）
      let sourceUrl = ''
      let fromBaike = false
      
      const startTime = Date.now()
      
      // 🔥 优先直接访问百度百科PC版词条页面（数据最准确）
      // 使用 ?from=lemma_search 参数绕过百度百科反爬拦截，直接获取完整词条页面
      const baikeUrl = `https://baike.baidu.com/item/${encodeURIComponent(bookName)}?from=lemma_search`
      // 移动版百度百科（反爬可能没那么严格）
      const mobileBaikeUrl = `https://m.baike.baidu.com/item/${encodeURIComponent(bookName)}?from=lemma_search`
      
      try {
        // 先尝试静态fetch PC版（快速）
        
        let staticSuccess = false
        let isBlocked = true
        
        try {
          const staticBaikeHtml = await this.fetchBaiduBaikeStatic(baikeUrl, Math.min(1500, timeout / 6), 'pc')
          isBlocked = this.isBlockedPage(staticBaikeHtml)
          
          if (!isBlocked) {
            const cleanedBaike = stripHtml(staticBaikeHtml)
            if (cleanedBaike.length > 1000 && cleanedBaike.includes(bookName)) {
              const isNovelPage = this.isNovelBaikePage(cleanedBaike, bookName)
              
              if (isNovelPage) {
                baikeText = cleanedBaike
                baikeHtml = staticBaikeHtml
                sourceUrl = baikeUrl
                fromBaike = true
                staticSuccess = true
                baikeInfoBox = this.extractInfoBoxFromHtml(staticBaikeHtml)
              } else {
                isBlocked = true // 继续尝试移动版
              }
            }
          }
        } catch (staticError) {
          isBlocked = true
        }
        
        // PC版失败，尝试移动版
        if (!staticSuccess && isBlocked) {
          try {
            const mobileBaikeHtml = await this.fetchBaiduBaikeStatic(mobileBaikeUrl, Math.min(1500, timeout / 6), 'mobile')
            const isMobileBlocked = this.isBlockedPage(mobileBaikeHtml)
            
            if (!isMobileBlocked) {
              const cleanedMobile = stripHtml(mobileBaikeHtml)
              if (cleanedMobile.length > 1000 && cleanedMobile.includes(bookName)) {
                const isNovelPage = this.isNovelBaikePage(cleanedMobile, bookName)
                
                if (isNovelPage) {
                  baikeText = cleanedMobile
                  baikeHtml = mobileBaikeHtml
                  sourceUrl = mobileBaikeUrl
                  fromBaike = true
                  staticSuccess = true
                  baikeInfoBox = this.extractInfoBoxFromHtml(mobileBaikeHtml)
                } else {
                  isBlocked = true
                }
              }
            }
          } catch (mobileError) {
            isBlocked = true
          }
        }
        
        // 静态失败，或静态成功但数据不完整时，切换Playwright模式（仅当还有足够时间时）
        const elapsed = Date.now() - startTime
        
        // 🔥 修复：确保Playwright至少有6秒可用时间，避免400ms超时就失败
        const remainingTimeout = Math.max(6000, timeout - elapsed - 500)
        
        // 检查静态数据是否完整
        let staticDataComplete = false
        if (staticSuccess && baikeInfoBox) {
          const hasAuthor = !!baikeInfoBox['作者'] || !!baikeInfoBox['作  者'] || !!baikeInfoBox['作者:']
          const hasWords = !!baikeInfoBox['总字数'] || !!baikeInfoBox['字数'] || !!baikeInfoBox['字 数']
          const hasChapters = !!baikeInfoBox['总章节数'] || !!baikeInfoBox['章节数'] || !!baikeInfoBox['_maxChapter']
          const hasGenre = !!baikeInfoBox['作品类型'] || !!baikeInfoBox['类型'] || !!baikeInfoBox['题材']
          const hasStatus = !!baikeInfoBox['连载状态'] || !!baikeInfoBox['状态']
          const hasChars = !!baikeInfoBox['_characters']
          
          // 有5个以上关键字段才算"完整"
          const completeCount = [hasAuthor, hasWords, hasGenre, hasStatus].filter(Boolean).length
          staticDataComplete = completeCount >= 4 && hasChars
          
        }
        
        const needPlaywright = !staticSuccess || !staticDataComplete
        
        if (needPlaywright && elapsed < timeout * 0.6) {
          
          try {
            const playwrightResult = await this.fetchBaiduBaikePlaywright(baikeUrl, remainingTimeout)
            const playwrightHtml = playwrightResult.html
            
            const cleanedPlaywright = stripHtml(playwrightHtml)
            
            if (cleanedPlaywright.length > 1000 && cleanedPlaywright.includes(bookName)) {
              baikeText = cleanedPlaywright
              baikeHtml = playwrightHtml
              sourceUrl = baikeUrl
              fromBaike = true
              // 优先使用Playwright直接从DOM提取的infoBox（最准确）
              if (playwrightResult.infoBox && Object.keys(playwrightResult.infoBox).length > 0) {
                baikeInfoBox = playwrightResult.infoBox
              } else {
                // 兜底：从HTML中静态提取
                baikeInfoBox = this.extractInfoBoxFromHtml(playwrightHtml)
              }
            }
          } catch (pwError) {
            console.error('[baidu-source] Playwright 拉取百科正文失败:', pwError)
          }
        }
      } catch (e) {
        console.error('[baidu-source] 百科抓取主流程（静态+Playwright）异常:', e)
      }
      
      // 🔥 判断百度百科数据完整度
      // 优化：降低章节数阈值，只要有章节数据就认为合理（避免短小说误判）
      const maxChapter = baikeInfoBox['_maxChapter'] ? parseInt(baikeInfoBox['_maxChapter']) : 0
      const chapterFromInfoBox = baikeInfoBox['总章节数'] || baikeInfoBox['章节数'] || ''
      const hasChapterData = maxChapter > 0 || !!chapterFromInfoBox
      
      // 判断核心字段是否完整
      const hasAuthor = !!baikeInfoBox['作者'] || !!baikeInfoBox['作  者'] || !!baikeInfoBox['作者:']
      const hasWords = !!baikeInfoBox['总字数'] || !!baikeInfoBox['字数'] || !!baikeInfoBox['字 数']
      const hasGenre = !!baikeInfoBox['作品类型'] || !!baikeInfoBox['类型'] || !!baikeInfoBox['题材']
      const hasStatus = !!baikeInfoBox['连载状态'] || !!baikeInfoBox['状态']
      const hasSummary = !!baikeInfoBox['_summary']
      
      // 检查章节数是否可疑：字数>100万字但章节数<100章
      const wordsValue = baikeInfoBox['总字数'] || baikeInfoBox['字数'] || ''
      const wordsMatch = String(wordsValue).match(/(\d+(?:\.\d+)?)\s*(万)/)
      const wordsWan = wordsMatch ? parseFloat(wordsMatch[1]) : 0
      const chapterNumMatch = String(chapterFromInfoBox).match(/(\d+)/)
      const chapterNum = chapterNumMatch ? parseInt(chapterNumMatch[1]) : 0
      const isChapterSuspicious = wordsWan >= 100 && chapterNum > 0 && chapterNum < 100
      
      const coreFieldsCount = [hasAuthor, hasWords, hasGenre, hasStatus].filter(Boolean).length
      const isCoreComplete = coreFieldsCount >= 3
      const isHighQuality = coreFieldsCount >= 4 && hasChapterData && hasSummary && !isChapterSuspicious && chapterNum >= 100
      
      
      // 🔥 优化搜索策略：只有关键信息缺失时才追加搜索
      let baseQueries: string[] = []
      
      // 如果百度百科数据已经高质量完整，完全跳过搜索
      if (!isHighQuality) {
        baseQueries = fromBaike
          ? [
              `${bookName} 小说 作者 字数 章节`,
              `${bookName} 小说 主要角色 人物介绍`,
            ]
          : [
              `${bookName} 小说 百度百科`,
              `${bookName} 小说 作者 字数 章节`,
              `${bookName} 小说 主角 简介`,
              `${bookName} 小说 主要角色 人物介绍`,
              `${bookName} 小说 女主角 妻子`,
            ]
        
        // 只有核心信息缺失时才追加专门查询（限制追加数量，避免超时）
        if ((!hasChapterData || isChapterSuspicious) && baikeInfoBox['连载状态'] !== '连载中') {
          baseQueries.unshift(`${bookName} 小说 一共多少章`)
          baseQueries.unshift(`${bookName} 小说 总章节数`)
        }
      }
      
      let allText = baikeText
      let successCount = fromBaike ? 1 : 0
      let baikeSearchText = ''
      
      const remainingTime = timeout - (Date.now() - startTime)
      const perQueryTimeout = Math.max(1000, Math.floor(remainingTime / Math.max(baseQueries.length, 1)) - 200)
      
      // 🔥 如果百度百科数据高质量完整，跳过所有额外搜索
      if (isHighQuality) {
      } else if (fromBaike && isCoreComplete && hasChapterData && !isChapterSuspicious && chapterNum >= 100) {
      } else {
      for (let i = 0; i < baseQueries.length; i++) {
        const query = baseQueries[i]
        try {
          const html = await this.fetchBaiduSearch(query, perQueryTimeout)
          let text = stripHtml(html)
          
          // 🔥 百度PC搜索结果特殊清理：去掉JSON残留噪音
          text = this.cleanBaiduResult(text)
          
          allText += '\n' + text
          successCount++
          
          // 保存第一个query（百度百科）的结果，优先使用
          if (i === 0 && text.length > 500) {
            baikeSearchText = text
          }
          
          if (!sourceUrl) {
            sourceUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
          }
          
          // 优化：如果已经有百度百科数据且基本信息齐全，可以提前退出搜索
          if (fromBaike && baikeInfoBox && isCoreComplete && hasChapterData) {
            break
          }
        } catch (e) {
          console.error('[baidu-source] 解析搜索结果候选异常，跳过该候选继续:', e)
        }
      }
      }
      
      if (successCount === 0 || !allText.trim()) {
        const fallbackResult = createDefaultBook(bookName, '百度搜索')
        fallbackResult.confidence = 30
        return fallbackResult
      }

      // 优先使用百度百科详情页（数据最准确），其次是搜索结果页
      const primaryText = baikeText || baikeSearchText || allText
      const isFromBaikeDetail = !!baikeText  // 只有详情页才算百度百科
      const result = this.extractFromText(primaryText, bookName, sourceUrl, successCount, isFromBaikeDetail, baikeHtml, baikeInfoBox)
      
      console.log(`[BaiduSearchSource] 解析完成: ${result.title}, 作者: ${result.author}, 字数: ${result.totalWords}, 章节: ${result.totalChapters}, 置信度: ${result.confidence}, 来源: ${isFromBaikeDetail ? '百度百科详情页' : baikeSearchText ? '百度搜索（百科结果）' : '百度搜索'}, 耗时: ${Date.now() - startTime}ms`)
      
      // 🔥 如果不是来自百度百科详情页，降低置信度（搜索结果页数据可靠性较低）
      if (!isFromBaikeDetail) {
        const originalConfidence = result.confidence
        result.confidence = Math.min(result.confidence, 55)
      }
      
      // 🔥 数据合理性校验：字数和章节数比例是否合理
      if (result.totalChapters && result.wordCountWan) {
        const avgChapterWords = (result.wordCountWan * 10000) / result.totalChapters
        // 网络小说平均每章通常在1000-10000字之间
        if (avgChapterWords < 500 || avgChapterWords > 20000) {
          result.confidence = Math.max(20, result.confidence - 25)
        }
      }
      
      // 🔥 作者名校验：如果作者名看起来不可信，降低置信度
      if (result.author && result.author !== '未知') {
        if (!isValidChineseName(result.author)) {
          result.confidence = Math.max(20, result.confidence - 30)
        }
      }
      
      // 🔥 如果解析结果无效（被反爬拦截），尝试知名小说兜底数据
      const resultHasAuthor = result.author && result.author.trim() !== '' && result.author !== '未知'
      const resultHasWords = result.totalWords && String(result.totalWords).trim() !== ''
      const resultHasChapters = result.totalChapters && Number(result.totalChapters) > 0
      const resultHasGenre = result.genre && result.genre.trim() !== '' && result.genre !== '玄幻'
      const resultHasStatus = result.status && result.status.trim() !== '' && result.status !== '已完结'
      
      if (!resultHasAuthor && !resultHasWords && !resultHasChapters && !resultHasGenre && !resultHasStatus) {
        
        const fallback = FAMOUS_NOVELS[bookName]
        if (fallback) {
          const fallbackResult = createDefaultBook(bookName, '百度搜索')
          Object.assign(fallbackResult, fallback)
          fallbackResult.confidence = 85
          return fallbackResult
        }
      }
      
      // 🔥 置信度过低则丢弃，避免错误数据影响融合结果
      if (result.confidence < 20) {
        return null
      }
      
      if (result.confidence >= 70) {
        localCache.set(CACHE_NAMESPACE, bookName, result, CACHE_TTL)
      }
      
      return result

    } catch (error) {
      console.error('[BaiduSearchSource] 搜索出错:', error instanceof Error ? error.message : String(error))
      return null
    }
  }

  /**
   * 校验百度百科页面标题是否精确匹配搜索书名
   * 避免同名不同书（如《盘龙》有我吃西红柿版和玄色版）
   */
  private isBaikeTitleMatch(bookName: string, infoBox?: Record<string, string>): boolean {
    if (!infoBox) return true // 没有标题信息时不拒绝（让后续逻辑处理）
    const pageTitle = (infoBox['_pageTitle'] || '').trim()
    const lemmaTitle = (infoBox['_lemmaTitle'] || '').trim()
    const combined = pageTitle + ' ' + lemmaTitle
    // 没有标题信息时不拒绝（静态提取可能没有页面标题）
    if (!combined.trim()) return true
    if (!combined.includes(bookName)) return false

    // 提取标题中括号/书名号内的说明文字，例如"盘龙（玄色小说）"
    const suffixMatch = combined.match(new RegExp(escapeRegExp(bookName) + '（([^）]{1,20})）'))
    if (suffixMatch && suffixMatch[1]) {
      const suffix = suffixMatch[1]
      // 如果后缀是"xxx小说"、"xxx著"，且xxx看起来像真实人名，说明是同名不同书
      const authorInSuffix = suffix.replace(/小说|网络|玄幻|仙侠|都市|言情|著|作/g, '').trim()
      if (authorInSuffix.length >= 2 && isValidChineseName(authorInSuffix)) {
        // 该词条明确指向另一作者的同名作品，不匹配
        return false
      }
    }

    return true
  }

  /**
   * 检查页面是否被反爬拦截
   */
  private isBlockedPage(html: string): boolean {
    if (!html || html.length < 1000) return true
    
    const blockPatterns = [
      '安全验证',
      '人机验证',
      'verify',
      '请完成以下验证',
      '访问验证',
      '百度安全验证',
      '百度百科-验证',
      '系统检测',
      '异常访问',
      '403 Forbidden',
      'Access Denied',
      '您的访问过于频繁',
      '请输入验证码',
      '验证码',
      'wappass.baidu.com',
      'passport.baidu.com',
      '出现验证码表示您所在的网络可能存在异常',
    ]
    
    for (const pattern of blockPatterns) {
      if (html.includes(pattern)) {
        return true
      }
    }
    
    return false
  }

  /**
   * 检查百度百科页面是否是小说版
   * 通过页面内容中的关键词判断，排除电视剧、电影、游戏、漫画、作者词条等
   */
  private isNovelBaikePage(text: string, bookName?: string): boolean {
    // 🔥 优先检查：页面是否包含书名（最基本的校验）
    if (bookName) {
      const cleanBookName = bookName.replace(/\s+/g, '').replace(/[《》"']/g, '')
      const cleanText = text.replace(/\s+/g, '')
      if (!cleanText.includes(cleanBookName)) {
        return false
      }
    }
    
    // 🔥 优先检查：是否是作者词条（页面主要介绍作者，不是小说）
    // 作者词条特征：标题或开头有"当代作家"、"网络作家"、"作者简介"等，且没有小说简介
    const authorPagePatterns = [
      /^.{0,100}(当代作家|网络作家|著名作家|作家简介|个人简介|人物经历|早年经历)/,
      /^(本名|笔名|国籍|民族|出生地|出生日期|职业).{0,10}(作家|作者)/,
    ]
    const introText = text.substring(0, 800)
    for (const pat of authorPagePatterns) {
      if (pat.test(introText)) {
        // 进一步确认：是否有小说信息框字段（总字数、总章节数等）
        const hasNovelInfoBox = /(总字数|总章节数|连载状态|作品类型).{0,20}[\d\u4e00-\u9fa5]/.test(text)
        if (!hasNovelInfoBox) {
          return false
        }
      }
    }

    // 🔥 检查词条标题：如果标题是作者名而不是小说名，说明跳转到了作者词条
    if (bookName) {
      const titleMatch = text.match(/<title>([^<]+)<\/title>/)
      if (titleMatch && titleMatch[1]) {
        const title = titleMatch[1]
        // 如果标题里没有书名，或者标题明显是人物/作者词条
        if (!title.includes(bookName) && /(作家|作者|个人|简介|生平|经历)/.test(title)) {
          return false
        }
      }
    }

    // 非小说关键词（如果出现很多，说明不是小说版）
    const nonNovelKeywords = [
      '电视剧', '电视连续剧', '网剧', '网络剧', '电影', '影片', '影院', '票房',
      '导演', '编剧', '主演', '演员', '饰演', '角色介绍', '演员表',
      '手游', '游戏', 'ARPG', 'RPG', '网游', '页游', '端游', '桌游',
      '漫画', '动漫', '动画', '卡通', '绘本',
      '综艺节目', '真人秀', '脱口秀',
    ]
    
    // 小说关键词（如果出现很多，说明是小说版）
    const novelKeywords = [
      '小说', '网络小说', '原创小说', '连载小说', '玄幻小说', '仙侠小说',
      '起点中文网', '起点', '纵横中文网', '晋江', '红袖添香',
      '作者', '著', '字数', '章节', '连载', '完结',
      '主角', '小说主角', '故事讲述', '内容简介',
    ]
    
    // 统计非小说关键词出现次数
    let nonNovelCount = 0
    for (const kw of nonNovelKeywords) {
      const regex = new RegExp(kw, 'g')
      const matches = text.match(regex)
      if (matches) nonNovelCount += matches.length
    }
    
    // 统计小说关键词出现次数
    let novelCount = 0
    for (const kw of novelKeywords) {
      const regex = new RegExp(kw, 'g')
      const matches = text.match(regex)
      if (matches) novelCount += matches.length
    }
    
    
    // 判断规则：
    // 1. 如果非小说关键词 > 小说关键词 * 2，认为不是小说版
    // 2. 如果小说关键词 > 非小说关键词，认为是小说版
    // 3. 否则根据内容进一步判断
    
    if (nonNovelCount > novelCount * 2 && nonNovelCount >= 5) {
      return false
    }
    
    if (novelCount > nonNovelCount && novelCount >= 3) {
      return true
    }
    
    // 进一步检查：是否有明确的小说信息框字段（最可靠的判断依据）
    // 如果页面包含"总字数"、"总章节数"、"连载状态"等字段，99%是小说词条
    const hasNovelInfo = /(总字数|总章节数|小说作者|连载状态|作品类型|连载平台|首发时间|是否出版).{0,20}[\d\u4e00-\u9fa5]/.test(text)
    if (hasNovelInfo && novelCount >= 1) {
      return true
    }
    
    // 🔥 放宽判断：如果小说关键词>=非小说关键词，且小说关键词>=2，认为是小说版
    if (novelCount >= nonNovelCount && novelCount >= 2) {
      return true
    }
    
    // 进一步检查：是否有明确的非小说信息
    const hasNonNovelInfo = /(导演|主演|集数|上映时间|播出时间).{0,20}[\d\u4e00-\u9fa5]/.test(text)
    if (hasNonNovelInfo && nonNovelCount >= 3) {
      return false
    }
    
    // 默认：如果页面长度足够且包含小说相关关键词，保守认为是小说版
    if (text.length > 2000 && novelCount >= 1) {
      return true
    }
    
    return false
  }

  /**
   * 静态fetch方式访问百度百科（使用https模块绕过fetch反爬）
   * 策略：先访问 ?from=lemma_search 获取词条ID，再用https访问带ID的详情页
   */
  private async fetchBaiduBaikeStatic(url: string, timeoutMs: number, device: 'pc' | 'mobile' = 'pc'): Promise<string> {
    // 随机选择User-Agent
    const pcUserAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ]
    const mobileUserAgents = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    ]
    const userAgents = device === 'mobile' ? mobileUserAgents : pcUserAgents
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)]

    // 简洁headers：https模块比fetch更不容易被反爬识别
    const headers: Record<string, string> = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Connection': 'keep-alive',
      'Referer': 'https://www.baidu.com/',
    }

    // 随机延时（模拟真人，压缩以控制总耗时）
    await this.randomDelay(50, 150)

    const doGet = (targetUrl: string): Promise<{ status: number; location?: string; body: string }> => {
      return new Promise((resolve, reject) => {
        const parsed = new URL(targetUrl)
        const req = https.get({
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          headers,
          timeout: timeoutMs,
        }, (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => { chunks.push(chunk) })
          res.on('end', () => {
            const buffer = Buffer.concat(chunks)
            let body = buffer.toString('utf8')
            if (!body || /^\s*$/.test(body)) {
              try { body = buffer.toString('gbk' as BufferEncoding) } catch { body = '' }
            }
            if (!body || /^\s*$/.test(body)) {
              body = buffer.toString('binary')
            }
            resolve({ status: res.statusCode || 0, location: res.headers.location, body })
          })
        })
        req.on('error', reject)
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('timeout'))
        })
      })
    }

    // 第一步：访问原始URL（带?from=lemma_search），获取302重定向的词条ID
    let first = await doGet(url)
    let finalUrl = url
    // 跟随重定向（最多2层）
    let redirectCount = 0
    while ((first.status === 301 || first.status === 302) && first.location && redirectCount < 2) {
      const loc = first.location
      finalUrl = loc.startsWith('http') ? loc : 'https://baike.baidu.com' + loc
      // 确保URL带?from=lemma_search参数
      if (!finalUrl.includes('from=lemma_search')) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'from=lemma_search'
      }
      first = await doGet(finalUrl)
      redirectCount++
    }

    if (first.status !== 200) {
      throw new Error(`HTTP ${first.status}`)
    }

    return first.body
  }

  /**
   * Playwright方式访问百度百科（应对反爬）
   * 策略：先尝试直接访问，如果不是小说版则切换义项，失败再从百度搜索跳转
   * 返回：{ html, infoBox } - infoBox是直接从DOM提取的信息框结构化数据（最准确）
   */
  private async fetchBaiduBaikePlaywright(url: string, timeoutMs: number): Promise<{ html: string; infoBox?: Record<string, string> }> {
    
    // 初始化Playwright
    await playwrightManager.initialize()
    
    // 随机延时（压缩以控制总耗时）
    await this.randomDelay(200, 500)
    
    const bookName = decodeURIComponent(url.split('/item/')[1] || '')
    
    // 策略1：快速尝试直接访问（作为备用方案）
    let strategy1Result: { html: string; infoBox?: Record<string, string> } | null = null
    // 🔥 修复：确保每个策略最少有5秒超时
    const strategy1Timeout = Math.max(5000, timeoutMs * 0.25)
    const strategy1NovelTimeout = Math.max(3000, timeoutMs * 0.12)

    try {
      const result = await this._playwrightDirectVisit(url, bookName, strategy1Timeout)
      if (result) {
        const text = stripHtml(result.html)
        const isNovel = this.isNovelBaikePage(text, bookName)
        const infoBoxKeys = result.infoBox ? Object.keys(result.infoBox) : []
        const hasEnoughInfoBox = infoBoxKeys.filter(k => {
          const val = result.infoBox![k]
          return val && val.length > 0 && val.length < 200 && !k.includes(' ') && !k.startsWith('_')
        }).length >= 3
        
        const hasSummary = !!result.infoBox?.['_summary']
        const hasCharacters = !!result.infoBox?.['_characters']
        const hasMaxChapter = !!result.infoBox?.['_maxChapter']
        
        const isGoodQuality = isNovel && (hasEnoughInfoBox || hasSummary || hasCharacters || hasMaxChapter)
        
        if (isGoodQuality) {
          strategy1Result = result
        } else {
          
          // 尝试访问 "书名（小说）" 的URL
          const novelUrl1 = `https://baike.baidu.com/item/${encodeURIComponent(bookName + '（小说）')}`
          const novelUrl2 = `https://baike.baidu.com/item/${encodeURIComponent(bookName + '小说')}`
          
          for (const novelUrl of [novelUrl1, novelUrl2]) {
            try {
              const novelResult = await this._playwrightDirectVisit(novelUrl, bookName, strategy1NovelTimeout)
              if (novelResult) {
                const novelText = stripHtml(novelResult.html)
                const novelIsNovel = this.isNovelBaikePage(novelText, bookName)
                const novelInfoBoxKeys = novelResult.infoBox ? Object.keys(novelResult.infoBox) : []
                const novelHasEnoughInfoBox = novelInfoBoxKeys.filter(k => {
                  const val = novelResult.infoBox![k]
                  return val && val.length > 0 && val.length < 200 && !k.includes(' ') && !k.startsWith('_')
                }).length >= 3
                const novelHasSummary = !!novelResult.infoBox?.['_summary']
                const novelHasCharacters = !!novelResult.infoBox?.['_characters']
                const novelHasMaxChapter = !!novelResult.infoBox?.['_maxChapter']
                
                const novelIsGoodQuality = novelIsNovel && (novelHasEnoughInfoBox || novelHasSummary || novelHasCharacters || novelHasMaxChapter)
                
                if (novelIsGoodQuality) {
                  strategy1Result = novelResult
                  break
                }
              }
            } catch (e) {
              console.error('[baidu-source] 策略1候选解析异常，继续下一候选:', e)
            }
          }
        }
      }
    } catch (e) {
      console.error('[baidu-source] 策略1搜索流程异常:', e)
    }
    
    // 策略2：从百度搜索跳转进入（完整真人行为，自动切换小说版义项，数据更完整）
    // 🔥 如果策略1已经成功获取到高质量数据，跳过策略2以节省时间（策略2通常3-4分钟）
    if (strategy1Result) {
      return strategy1Result
    }

    const keyword = `${bookName} 小说 百度百科`
    const targetPattern = /baike\.baidu\.com\/item\//
    
    
    try {
      const result = await playwrightManager.fetchFromBaiduSearch(keyword, targetPattern, {
        timeout: timeoutMs * 0.85,
        scroll: true,
      })
      
      if (result && result.html) {
        const text = stripHtml(result.html)
        if (text.length > 2000 && !this.isBlockedPage(result.html)) {
          return { html: result.html, infoBox: result.infoBox }
        }
      }
    } catch (e) {
      console.error('[baidu-source] 抓取百科页面失败:', e)
    }
    
    // 策略2失败，使用策略1的结果
    if (strategy1Result) {
      return strategy1Result
    }
    
    throw new Error('Playwright两种策略均失败')
  }
  
  /**
   * Playwright直接访问百度百科，并尝试切换到小说版义项
   */
  private async _playwrightDirectVisit(url: string, bookName: string, timeoutMs: number): Promise<{ html: string; infoBox?: Record<string, string> } | null> {
    const result = await playwrightManager.fetchBaiduBaikeNovel(url, {
      timeout: timeoutMs,
      scroll: true,
      referer: 'https://www.baidu.com/',
      bookName,
    })
    
    if (!result) return null
    
    const text = stripHtml(result.html)
    if (text.length > 2000 && text.includes(bookName)) {
      return result
    }
    
    return null
  }
  
  /**
   * 从HTML中提取信息框（静态解析，备用方案）
   * 使用正则匹配HTML结构中的dt/dd或tr/th
   */
  private extractInfoBoxFromHtml(html: string): Record<string, string> {
    const result: Record<string, string> = {}
    
    // 方式1：匹配 <dl> 下的 <dt> 和 <dd>
    const dlPattern = /<dl[^>]*>([\s\S]*?)<\/dl>/gi
    let dlMatch
    while ((dlMatch = dlPattern.exec(html)) !== null) {
      const dlContent = dlMatch[1]
      const dts: string[] = []
      const dds: string[] = []
      
      // 提取所有dt
      const dtPattern = /<dt[^>]*>([\s\S]*?)<\/dt>/gi
      let dtMatch
      while ((dtMatch = dtPattern.exec(dlContent)) !== null) {
        dts.push(stripHtml(dtMatch[1]).trim())
      }
      
      // 提取所有dd
      const ddPattern = /<dd[^>]*>([\s\S]*?)<\/dd>/gi
      let ddMatch
      while ((ddMatch = ddPattern.exec(dlContent)) !== null) {
        dds.push(stripHtml(ddMatch[1]).trim())
      }
      
      // 如果有作者、类型或字数等关键词，说明这是信息框
      const allText = dts.join('') + dds.join('')
      const hasInfoBoxKeywords = allText.includes('作者') || allText.includes('类型') || allText.includes('题材') || allText.includes('字数') || allText.includes('章节') || allText.includes('状态')
      if (hasInfoBoxKeywords) {
        for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
          const key = dts[i].replace(/\s+/g, '')
          const value = dds[i]
          if (key && value && value.length < 200) {
            result[key] = value
          }
        }
        if (Object.keys(result).length > 0) break
      }
    }
    
    // 方式2：匹配 <table> 下的 <tr><th> 和 <td>
    if (Object.keys(result).length === 0) {
      const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi
      let tableMatch
      while ((tableMatch = tablePattern.exec(html)) !== null) {
        const tableContent = tableMatch[1]
        const rows: Array<{ key: string; value: string }> = []
        
        const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
        let trMatch
        while ((trMatch = trPattern.exec(tableContent)) !== null) {
          const trContent = trMatch[1]
          const thMatch = trContent.match(/<th[^>]*>([\s\S]*?)<\/th>/i)
          const tdMatch = trContent.match(/<td[^>]*>([\s\S]*?)<\/td>/i)
          if (thMatch && tdMatch) {
            const key = stripHtml(thMatch[1]).trim().replace(/\s+/g, '')
            const value = stripHtml(tdMatch[1]).trim()
            if (key && value && value.length < 200) {
              rows.push({ key, value })
            }
          }
        }
        
        const allText = rows.map(r => r.key + r.value).join('')
        const hasInfoBoxKeywords = allText.includes('作者') || allText.includes('类型') || allText.includes('题材') || allText.includes('字数') || allText.includes('章节') || allText.includes('状态')
        if (hasInfoBoxKeywords) {
          for (const row of rows) {
            if (!result[row.key]) {
              result[row.key] = row.value
            }
          }
          if (Object.keys(result).length > 0) break
        }
      }
    }
    
    return result
  }
  
  private randomDelay(min: number, max: number): Promise<void> {
    const delay = min + Math.random() * (max - min)
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * 百度PC搜索结果特殊清理：去掉JSON残留、URL参数、广告、新闻等噪音
   */
  private cleanBaiduResult(text: string): string {
    let clean = text
    
    // 去掉明显的URL参数（sec=xxx&t=xxx 等）
    clean = clean.replace(/sec=\d+&t=[a-f0-9]+/gi, ' ')
    clean = clean.replace(/(?:&|\?)[a-z_]+=\S+/gi, ' ')
    
    // 去掉JSON键值对残留
    clean = clean.replace(/"[a-zA-Z_]+"\s*:\s*"/g, ' ')
    clean = clean.replace(/"[a-zA-Z_]+"\s*:\s*\{/g, ' ')
    clean = clean.replace(/"[a-zA-Z_]+"\s*:\s*\[/g, ' ')
    
    // 去掉多余的符号
    clean = clean.replace(/[{}[\]"\\]+/g, ' ')
    
    // 去掉过短的无意义片段（由JSON破碎产生的）
    clean = clean.replace(/\s+[^a-zA-Z0-9\u4e00-\u9fa5]{1,3}\s+/g, ' ')
    
    // 去掉百度搜索广告特征
    clean = clean.replace(/百度为您找到以下结果/g, ' ')
    clean = clean.replace(/时间不限\s+所有网页和文件\s+站点内检索/g, ' ')
    clean = clean.replace(/网页搜索|图片|视频|资讯|贴吧|知道|文库|地图/g, ' ')
    
    // 去掉常见广告关键词（新闻、体育、娱乐等无关内容）
    const adKeywords = [
      '世界杯', '足球', '男篮', '乒乓球', '田径', '台风', '股票', '彩礼',
      '电影票房', '导演', '主演', '上映', '电视剧', '网剧',
      '综艺', '真人秀', '明星', '歌手', '演员', '综艺节目',
      '社会', '新闻', '热点', '热议', '热评', '热搜',
      '房价', '房产', '汽车', '手机', '数码',
      '美食', '旅游', '购物', '促销', '优惠', '打折',
      '天气', '交通', '快递', '物流', '外卖', '订餐',
      '手游', '网游', '端游', '电竞', '直播',
      '音乐', '歌曲', '专辑', '演唱会', 'KTV',
      '教育', '培训', '考试', '招生', '留学',
      '医疗', '健康', '养生', '减肥', '健身',
      '理财', '投资', '基金', '保险', '银行',
      '招聘', '求职', '工作', '薪资', '职场',
      '婚礼', '婚庆', '婚纱', '摄影',
      '装修', '家居', '家具', '家电',
      '宠物', '萌宠', '猫狗',
    ]
    for (const keyword of adKeywords) {
      clean = clean.replace(new RegExp(keyword, 'g'), ' ')
    }
    
    // 去掉HTML class/id属性值残留（保留小说相关的词汇）
    clean = clean.replace(/(?:aladdin|sublink|opntion|gap|upgrade|flow|voice|opntion|style|default|show|sample|new|page|image|link|top|bottom|left|right|single|multi|links|list|row|col|cell|nav|menu|bar|panel|wrapper|holder|desc|meta|tag|label|input|form|query|suggest|history|cookie|login|logout|sign|register|avatar|email|phone|password|token|session|cache|storage|local|device|browser|os|version|agent)\w*/gi, ' ')
    
    // 去掉CSS类名模式（连续多个字母组合，无中文，且不是有用的英文单词）
    const usefulEnglishWords = new Set([
      'chapter', 'novel', 'story', 'book', 'author', 'word', 'words',
      'volume', 'part', 'section', 'main', 'character', 'protagonist',
      'hero', 'heroine', 'villain', 'world', 'power', 'magic', 'cultivation',
      'system', 'ability', 'skill', 'technique', 'martial', 'art', 'arts',
      'realm', 'level', 'rank', 'stage', 'arc', 'plot', 'summary',
      'synopsis', 'genre', 'type', 'status', 'complete', 'ongoing',
      'update', 'published', 'release', 'site', 'platform', 'webnovel',
      'fiction', 'fantasy', 'xianxia', 'xuanhuan', 'wuxia', 'romance',
      'urban', 'historical', 'sci-fi', 'scifi', 'mystery', 'thriller',
      'adventure', 'comedy', 'drama', 'action', 'game', 'virtual', 'reality',
      'online', 'game', 'player', 'guild', 'boss', 'dungeon', 'quest',
      'reincarnation', 'rebirth', 'transmigration', 'isekai', 'cheat', 'skill',
      'spirit', 'soul', 'body', 'blood', 'lineage', 'inheritance', 'talent',
      'opportunity', 'treasure', 'artifact', 'weapon', 'armor', 'potion',
      'elixir', 'formation', 'talisman', 'rune', 'alchemy', 'blacksmithing',
      'summoning', 'contract', 'beast', 'monster', 'dragon', 'phoenix',
      'sword', 'blade', 'spear', 'bow', 'magic', 'element', 'fire', 'ice',
      'thunder', 'wind', 'water', 'earth', 'light', 'dark', 'shadow',
      'king', 'emperor', 'god', 'saint', 'lord', 'master', 'grandmaster',
      'sect', 'clan', 'family', 'empire', 'kingdom', 'alliance', 'temple',
      'palace', 'academy', 'school', 'tower', 'cave', 'mountain', 'forest',
      'desert', 'ocean', 'river', 'lake', 'valley', 'plateau', 'peak',
      'continent', 'planet', 'star', 'galaxy', 'universe', 'dimension',
      'heaven', 'hell', 'abyss', 'realm', 'plane', 'world', 'land',
      'time', 'space', 'chaos', 'void', 'origin', 'destiny', 'fate',
      'will', 'law', 'principle', 'truth', 'dao', 'zen', 'buddha',
      'demon', 'ghost', 'spirit', 'monster', 'beast', 'creature', 'entity',
      'war', 'battle', 'fight', 'combat', 'duel', 'conflict', 'warfare',
      'victory', 'defeat', 'triumph', 'conquest', 'domination', 'supremacy',
      'ascension', 'transcendence', 'immortality', 'eternity', 'infinity',
    ])
    clean = clean.replace(/[a-z][a-z0-9_]{3,20}/gi, (match) => {
      return usefulEnglishWords.has(match.toLowerCase()) ? match : ' '
    })
    
    // 去掉数字序列（如 1 2 3 4 5 6 等列表编号）
    clean = clean.replace(/(?:\s+\d+\s+){3,}/g, ' ')
    
    // 去掉重复的标点符号和空白
    clean = clean.replace(/[\s,.，。、；：！？]{3,}/g, ' ')
    
    // 合并空白
    clean = clean.replace(/\s+/g, ' ').trim()
    
    return clean
  }

  /**
   * 请求百度PC版搜索（数据更完整，包含百度百科卡片）
   */
  private async fetchBaiduSearch(keyword: string, timeoutMs: number): Promise<string> {
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`
    
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
          'Referer': 'https://www.baidu.com/',
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
   * 🔥 解析信息框数据（从DOM直接提取的结构化数据，准确率最高）
   */
  private parseInfoBoxData(infoBox: Record<string, string>, bookName: string): Partial<{
    author: string
    totalWords: { str: string; num: number }
    totalChapters: number
    genre: string
    status: string
    synopsis: string
    characters: Array<{ name: string; role: string; note: string; position: string; description?: string }>
    worldBuilding: string
    powerSystem: string
    sellingPoints: string[]
    sixStageOutline: Record<string, unknown>
    characterArchetypes: Record<string, unknown>
  }> {
    const result: Partial<{
      author: string
      totalWords: { str: string; num: number }
      totalChapters: number
      genre: string
      status: string
      synopsis: string
      characters: Array<{ name: string; role: string; note: string; position: string; description?: string }>
      worldBuilding: string
      powerSystem: string
      sellingPoints: string[]
      sixStageOutline: Record<string, unknown>
      characterArchetypes: Record<string, unknown>
    }> = {}
    
    
    // 标准化字段名（去掉空格、全角半角统一）
    const normalizedInfo: Record<string, string> = {}
    for (const [key, value] of Object.entries(infoBox)) {
      const normalizedKey = key.replace(/\s+/g, '').replace(/：/g, ':').trim()
      normalizedInfo[normalizedKey] = value.trim()
    }
    
    // 先检查信息框中是否有明确的总章节数字段（最准确）
    const explicitChapterKeys = ['总章节数', '章节数', '总章节', '章数', '总章数', '篇数', '总篇数', '全部章节', '章节总数', '总回数']
    let hasExplicitChapterCount = false
    for (const key of explicitChapterKeys) {
      if (normalizedInfo[key]) {
        const value = normalizedInfo[key]
        const chMatch = value.match(/([\d,.]+)\s*(?:章|集|话|节|回|篇)/)
        if (chMatch) {
          const num = parseInt(chMatch[1].replace(/[,.]/g, ''))
          if (!isNaN(num) && num > 0 && num < 100000) {
            result.totalChapters = num
            hasExplicitChapterCount = true
            break
          }
        }
        // 纯数字（字段名已经明确是章节数相关）
        const numMatch = value.match(/[\d,.]+/)
        if (numMatch) {
          const num = parseInt(numMatch[0].replace(/[,.]/g, ''))
          if (!isNaN(num) && num > 0 && num < 100000) {
            result.totalChapters = num
            hasExplicitChapterCount = true
            break
          }
        }
      }
    }
    
    // 只有当信息框中没有明确的总章节数字段时，才使用Playwright从目录提取的最大章节号
    if (!hasExplicitChapterCount && normalizedInfo['_maxChapter']) {
      const maxChapter = parseInt(normalizedInfo['_maxChapter'])
      if (maxChapter > 0 && maxChapter < 10000) {
        result.totalChapters = maxChapter
      }
    }
    
    // 优先使用Playwright直接提取的百度百科摘要（最准确的简介）
    if (normalizedInfo['_summary']) {
      let summary = normalizedInfo['_summary']
      // 清理：去掉引用标记
      summary = summary.replace(/\[\d+\]/g, '').trim()
      // 清理：去掉最后几行可能的无关内容（视频时长、秒懂百科、故事简介标签等）
      const lines = summary.split('\n').map(l => l.trim()).filter(Boolean)
      const cleanLines = lines.filter(line => {
        // 过滤掉视频时长格式（如 01:20）
        if (/^\d{2}:\d{2}$/.test(line)) return false
        // 过滤掉秒懂百科、故事简介等标签
        if (/秒懂百科|视频时长|播放量|点赞|收藏|故事简介|作品简介|内容简介$/.test(line)) return false
        // 过滤掉太短的行（可能是标签）
        if (line.length < 5) return false
        // 过滤掉纯数字或符号
        if (/^[\d\s\-\.,:：、]+$/.test(line)) return false
        return true
      })
      if (cleanLines.length > 0) {
        summary = cleanLines.join('\n').trim()
      }
      if (summary.length > 50) {
        result.synopsis = summary
      }
    }
    
    // 匹配作者字段（优先提取，用于过滤误识别的作者角色）
    const authorKeys = ['作者', '作', '著者', '原著', '原作者', '本书作者', '小说作者', '作者:', '作 者', '作    者', '作者名', '原著作者', '作品作者']
    for (const key of authorKeys) {
      if (normalizedInfo[key] && !result.author) {
        let authorName = normalizedInfo[key]
        authorName = authorName.replace(/\[\d+\]/g, '').trim()
        authorName = authorName.replace(/创作的.*$/, '').trim()
        authorName = authorName.replace(/著.*$/, '').trim()
        authorName = authorName.split(/[，,、\/\s；;]/)[0].trim()
        if (isValidChineseName(authorName)) {
          result.author = authorName
          break
        }
      }
    }
    
    // 优先使用Playwright直接提取的登场角色
    if (normalizedInfo['_characters']) {
      try {
        const chars = JSON.parse(normalizedInfo['_characters'])
        if (Array.isArray(chars) && chars.length > 0) {
          result.characters = chars.map((c: Record<string, unknown>) => {
            let desc = (c.desc as string) || (c.description as string) || ''
            // 🔥 过滤模板化文本
            if (/百度百科提取|待补充|模板/.test(desc)) {
              desc = ''
            }
            return {
              name: (c.name as string) || '',
              role: (c.role as string) || '',
              position: (c.position as string) || '配角',
              note: desc || '',
              description: desc || ''
            }
          }).filter((c: BookCharacter) => {
            // 🔥 过滤作者名和常见非角色
            if (result.author && (c.name === result.author || result.author.includes(c.name))) return false
            if (/^(秒懂|百度百科|百科|参考|资料|词条|标签|相关|推荐|TA说|词条图册)$/i.test(c.name)) return false
            // 🔥 过滤没有名称的角色
            if (!c.name || c.name.trim() === '') return false
            // 🔥 过滤地名（以"界"、"大陆"、"神域"、"神界"、"域"结尾的通常是地点）
            if (/界$|大陆$|神域$|神界$|域$|国$|山脉$|海域$|森林$|山谷$|深渊$|世界$/.test(c.name)) return false
            return true
          })
        }
      } catch (e) {
        console.error('[baidu-source] 地名/世界名过滤处理异常:', e)
      }
    }

    // 🔥 匹配"主要角色"字段，提取主角名（百度百科信息框中通常有"主要角色: XXX"）
    const protagonistKeys = ['主要角色', '主角', '男主角', '主人公']
    for (const key of protagonistKeys) {
      if (normalizedInfo[key]) {
        let protoRaw = normalizedInfo[key]
        // 清理：去掉引用标记
        protoRaw = protoRaw.replace(/\[\d+\]/g, '').trim()
        // 去掉后续字段内容（如"是否出版"等）
        protoRaw = protoRaw.split(/是否出版|总推荐|最新章节|最新更新/)[0].trim()
        // 按分隔符分割，取第一个（可能有多个角色）
        let protoName = protoRaw.split(/[，,、\/\s；;]/)[0].trim()
        // 去掉括号内容
        protoName = protoName.replace(/[（(].*$/, '').trim()
        if (protoName && protoName.length >= 2 && protoName.length <= 10) {
          if (!(result as unknown as Record<string, unknown>).protagonistName) {
            ;(result as unknown as Record<string, unknown>).protagonistName = protoName
          }
          // 同时将其添加到角色列表的最前面（标记为主角）
          if (!result.characters) result.characters = []
          const existingIdx = result.characters.findIndex(c => c.name === protoName)
          if (existingIdx === -1) {
            result.characters.unshift({ name: protoName, role: '主角', note: '从信息框主要角色字段提取', position: '主角' })
          } else {
            result.characters[existingIdx].position = '主角'
            result.characters[existingIdx].role = '主角'
          }
          break
        }
      }
    }
    
    // 🔥 匹配"女主角"字段
    const femaleLeadKeys = ['女主角', '女主', '女主人公']
    for (const key of femaleLeadKeys) {
      if (normalizedInfo[key]) {
        let flRaw = normalizedInfo[key]
        flRaw = flRaw.replace(/\[\d+\]/g, '').trim()
        flRaw = flRaw.split(/是否出版|总推荐|最新章节|最新更新/)[0].trim()
        let flName = flRaw.split(/[，,、\/\s；;]/)[0].trim()
        flName = flName.replace(/[（(].*$/, '').trim()
        if (flName && flName.length >= 2 && flName.length <= 10) {
          if (!(result as unknown as Record<string, unknown>).femaleLeadName) {
            ;(result as unknown as Record<string, unknown>).femaleLeadName = flName
          }
          if (!result.characters) result.characters = []
          const existingIdx = result.characters.findIndex(c => c.name === flName)
          if (existingIdx === -1) {
            result.characters.push({ name: flName, role: '女主', note: '从信息框女主角字段提取', position: '女主角' })
          } else {
            result.characters[existingIdx].position = '女主角'
            result.characters[existingIdx].role = '女主'
            result.characters[existingIdx].note = result.characters[existingIdx].note || '从信息框女主角字段提取'
          }
          break
        }
      }
    }
    
    // 匹配类型/题材字段
    const genreKeys = ['作品类型', '类型', '题材', '小说类型', '分类', '风格', '作品风格', '文学体裁', '题材类型', '所属类别']
    const mainGenres = ['玄幻', '仙侠', '武侠', '都市', '科幻', '历史', '军事', '言情', '悬疑', '灵异', '游戏', '竞技', '奇幻', '轻小说', '现实', '二次元', '同人', '衍生', '武侠', '修真', '洪荒', '高武', '末世', '异能', '快穿', '无限流', '经商', '官场', '谍战', '盗墓', '探险', '恐怖', '惊悚', '推理', '破案', '架空']
    for (const key of genreKeys) {
      if (normalizedInfo[key] && !result.genre) {
        let genreRaw = normalizedInfo[key]
        genreRaw = genreRaw.replace(/\[\d+\]/g, '').trim()
        genreRaw = genreRaw.split(/语\s*言|连载平台|连载状态|总字数|总章节数|首发时间|出版社|是否出版|最新章节/)[0].trim()
        const genreCandidates = genreRaw.split(/[，,、\/\s]+/).map(g => g.trim()).filter(g => g.length > 0)
        
        let matchedGenre = ''
        
        // 优先检查：如果原始值包含·分隔符（如"科幻·未来世界"），直接使用完整值
        if (/[·\-—]/.test(genreRaw) && genreRaw.length < 30) {
          const hasMainGenre = mainGenres.some(mg => genreRaw.includes(mg))
          if (hasMainGenre) {
            matchedGenre = genreRaw
          }
        }
        
        if (!matchedGenre) {
          let bestScore = 0
          for (const g of genreCandidates) {
            let score = 0
            for (const mainG of mainGenres) {
              if (g.includes(mainG)) {
                score += 10
                break
              }
            }
            score += g.length * 0.5
            if (score > bestScore) {
              bestScore = score
              matchedGenre = g
            }
          }
        }
        
        if (!matchedGenre && genreRaw.length > 0 && genreRaw.length < 20) {
          matchedGenre = genreRaw
        }
        if (matchedGenre) {
          result.genre = matchedGenre
          break
        }
      }
    }
    
    // 匹配状态字段
    const statusKeys = ['连载状态', '状态', '作品状态', '连载', '连载中']
    for (const key of statusKeys) {
      if (normalizedInfo[key] && !result.status) {
        let value = normalizedInfo[key]
        // 清理：去掉引用标记
        value = value.replace(/\[\d+\]/g, '').trim()
        // 去掉后续字段内容
        value = value.split(/总字数|总章节数|首发时间|出版社|连载平台|作品类型/)[0].trim()
        if (/完结|完本|全本|已完成/.test(value)) {
          result.status = '已完结'
        } else if (/连载|更新|进行中/.test(value)) {
          result.status = '连载中'
        }
        if (result.status) {
          break
        }
      }
    }
    
    // 匹配总章节数
    const chapterKeys = ['总章节数', '章节数', '总章节', '章数', '总章数', '篇数', '总篇数', '共', '全书', '全文', '最新章节', '全部章节', '章节总数', '总回数', '回目数']
    for (const key of chapterKeys) {
      if (normalizedInfo[key] && !result.totalChapters) {
        const value = normalizedInfo[key]
        const chMatch = value.match(/([\d,.]+)\s*(?:章|集|话|节|回|篇)/)
        if (chMatch) {
          const num = parseInt(chMatch[1].replace(/[,.]/g, ''))
          if (!isNaN(num) && num > 0 && isReasonableChapters(num)) {
            let _estimatedWords = 0
            const _wordValue = normalizedInfo['总字数'] || normalizedInfo['字数'] || ''
            const _wordMatch = _wordValue.match(/([\d,.]+)\s*(千|万|亿)/)
            if (_wordMatch) {
              const _wordNum = parseFloat(_wordMatch[1].replace(/,/g, ''))
              if (_wordMatch[2] === '千') _estimatedWords = _wordNum / 10
              else if (_wordMatch[2] === '万') _estimatedWords = _wordNum
              else if (_wordMatch[2] === '亿') _estimatedWords = _wordNum * 10000
            }
            if (_estimatedWords >= 100 && num < 50) {
              continue
            }
            result.totalChapters = num
            break
          }
        }
        const chMatchCn = value.match(/([零一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟]+)\s*(?:章|集|话|节|回|篇)/)
        if (chMatchCn) {
          const num = chineseNumberToInt(chMatchCn[1])
          if (num && num > 0 && isReasonableChapters(num)) {
            result.totalChapters = num
            break
          }
        }
        if (key.includes('章') || key.includes('章节') || key.includes('回') || key === '最新章节') {
          const numMatch = value.match(/[\d,.]+/)
          if (numMatch) {
            const num = parseInt(numMatch[0].replace(/[,.]/g, ''))
            if (!isNaN(num) && num > 0 && isReasonableChapters(num)) {
              result.totalChapters = num
              break
            }
          }
        }
      }
    }
    
    // 匹配总字数
    const wordKeys = ['总字数', '字数', '字 数', '全书字数', '全文字数', '共计', '总共', '累计', '作品字数', '书籍字数', '文字数', '字数统计']
    for (const key of wordKeys) {
      if (normalizedInfo[key] && !result.totalWords) {
        const value = normalizedInfo[key]
        const wordMatch = value.match(/([\d,.]+)\s*(千|万|亿)\s*字?/)
        if (wordMatch) {
          const numStr = wordMatch[1].replace(/,/g, '')
          let num = parseFloat(numStr)
          if (wordMatch[2] === '千') num = num / 10
          if (wordMatch[2] === '亿') num = num * 10000
          if (!isNaN(num) && num > 0 && isReasonableWords(num)) {
            const displayStr = wordMatch[2] === '亿' ? (num / 10000) + '亿字' : num + '万字'
            result.totalWords = { str: displayStr, num: Math.round(num * 10) / 10 }
            break
          }
        }
        if (key.includes('字') || key.includes('字数')) {
          const numMatch = value.match(/[\d,.]+/)
          if (numMatch) {
            let num = parseFloat(numMatch[0].replace(/[,.]/g, ''))
            if (num > 10000) {
              num = Math.round(num / 10000 * 10) / 10
            }
            if (!isNaN(num) && num > 0 && isReasonableWords(num)) {
              result.totalWords = { str: num + '万字', num }
              break
            }
          }
        }
      }
    }
    
    // 提取世界观
    if (normalizedInfo['_worldBuilding']) {
      let wb = normalizedInfo['_worldBuilding']
      wb = wb.replace(/\[\d+\]/g, '').trim()
      if (wb.length > 30) {
        result.worldBuilding = wb
      }
    }
    
    // 提取力量体系
    if (normalizedInfo['_powerSystem']) {
      let ps = normalizedInfo['_powerSystem']
      ps = ps.replace(/\[\d+\]/g, '').trim()
      if (ps.length > 20) {
        result.powerSystem = ps
      }
    }
    
    // 提取核心卖点
    if (normalizedInfo['_sellingPoints']) {
      try {
        const sp = JSON.parse(normalizedInfo['_sellingPoints'])
        if (Array.isArray(sp) && sp.length > 0) {
          result.sellingPoints = sp
        }
      } catch (e) {
        console.error('[baidu-source] 解析卖点(sellingPoints)JSON失败:', e)
      }
    }
    
    // 提取完整正文内容（用于LLM深度分析）
    if (normalizedInfo['_fullContent']) {
      const fc = normalizedInfo['_fullContent'].trim()
      if (fc.length > 500) {
        (result as unknown as Record<string, unknown>).fullContent = fc
      }
    }
    
    // 🔥 生成角色功能定位原型（基于提取到的角色列表，详细描述角色在剧情中的具体作用）
    if (result.characters && result.characters.length > 0) {
      const archetypes: Record<string, unknown> = {
        protagonist: null,
        femaleLead: null,
        mentor: null,
        bestFriend: null,
        villain: null,
        rival: null,
        familyMember: null,
        ally: null,
      }
      
      const chars = result.characters
      const genre = result.genre || ''
      const synopsis = result.synopsis || ''
      
      // 找主角
      const protagonist = chars.find(c => 
        c.position === '男主角' || c.position === '主角' || c.role === '主角'
      )
      if (protagonist) {
        let protagDesc = protagonist.note || protagonist.description || ''
        if (!protagDesc) {
          protagDesc = `${protagonist.name}，${genre ? genre + '题材' : '本作品'}的核心主角。`
        }
        archetypes.protagonist = {
          name: protagonist.name,
          role: protagonist.position || protagonist.role || '主角',
          description: protagDesc,
        }
      }
      
      // 找女主（多策略：信息框/角色表直接标记、描述含恋人/妻子、正文中"妻子：xxx"反向提取）
      let femaleLead = chars.find(c => 
        c.position === '女主角' || c.role === '女主' ||
        /女主角|女主/.test((c.position || '') + ' ' + (c.role || ''))
      )
      
      // 策略1.5：从信息框中提取的_femaleLead（Playwright从页面人物关系提取）
      if (!femaleLead && normalizedInfo['_femaleLead']) {
        const name = normalizedInfo['_femaleLead'].trim()
        const existing = chars.find(c => c.name === name)
        if (existing) {
          femaleLead = existing
        } else {
          femaleLead = { name, role: '女主', note: '从百度百科人物关系提取', position: '女主角' }
          chars.push(femaleLead)
        }
      }
      
      // 策略2：从完整正文中反向提取"妻子/恋人/女友：xxx"（百度百科常见结构化格式）
      if (!femaleLead) {
        const fullContent = (normalizedInfo['_fullContent'] || normalizedInfo['_summary'] || '') as string
        if (fullContent) {
          const relationPatterns = [
            /妻子[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /恋人[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /女友[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /道侣[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /爱人[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /未婚妻[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /伴侣[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /红颜知己[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /心上人[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /挚爱[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /初恋[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /(?:男主|主角|主人公)(?:的)?妻子[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /(?:男主|主角|主人公)(?:的)?女友[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /(?:男主|主角|主人公)(?:的)?恋人[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /(?:男主|主角|主人公)(?:的)?道侣[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /(?:男主|主角|主人公)(?:的)?伴侣[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /(?:男主|主角|主人公)(?:的)?爱人[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /(?:男主|主角|主人公)(?:的)?未婚妻[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
            /([\u4e00-\u9fa5·]{2,10})[\s与和及跟同]([\u4e00-\u9fa5·]{2,10})[\s结为成为]夫妻/,
            /([\u4e00-\u9fa5·]{2,10})[\s娶嫁]([\u4e00-\u9fa5·]{2,10})[\s为]妻/,
          ]
          for (const p of relationPatterns) {
            const m = fullContent.match(p)
            if (m && m[1]) {
              const protagonistName = (archetypes.protagonist as { name?: string } | null)?.name || ''
              let name = m[1].trim()
              if (m[2] && protagonistName && name === protagonistName) {
                name = m[2].trim()
              }
              const existing = chars.find(c => c.name === name)
              if (existing) {
                femaleLead = existing
                break
              } else if (name.length >= 2 && name.length <= 12) {
                femaleLead = { name, role: '女主', note: '从百度百科人物关系提取', position: '女主角' }
                chars.push(femaleLead)
                break
              }
            }
          }
        }
      }
      
      // 策略3：角色描述中被描述为"妻子/恋人/女友"等（直接匹配，不需要主角前缀）
      if (!femaleLead) {
        const wifeDescPattern = /(?:妻子|老婆|女友|未婚妻|道侣|爱人|恋人|伴侣|红颜知己|心上人|挚爱|初恋|未婚妻)/
        femaleLead = chars.find(c => 
          wifeDescPattern.test((c.note || '') + ' ' + (c.description || ''))
        )
      }
      
      // 策略4：从正文中提取"xxx与xxx结为夫妻"、"xxx娶xxx为妻"等模式
      if (!femaleLead) {
        const fullContent = (normalizedInfo['_fullContent'] || normalizedInfo['_summary'] || '') as string
        if (fullContent) {
          const marriagePatterns = [
            /([\u4e00-\u9fa5·]{2,8})[\s与和及跟同]([\u4e00-\u9fa5·]{2,8})[\s结为成为]夫妻/,
            /([\u4e00-\u9fa5·]{2,8})[\s娶嫁]([\u4e00-\u9fa5·]{2,8})[\s为]妻/,
            /([\u4e00-\u9fa5·]{2,8})[\s娶嫁]([\u4e00-\u9fa5·]{2,8})[\s为]妻/,
            /([\u4e00-\u9fa5·]{2,8})[\s与和及跟同]([\u4e00-\u9fa5·]{2,8})[\s相恋相爱]/,
          ]
          const protagonistName = (archetypes.protagonist as { name?: string } | null)?.name || (result as unknown as Record<string, unknown>).protagonistName as string || ''
          for (const p of marriagePatterns) {
            const m = fullContent.match(p)
            if (m && m[1] && m[2]) {
              let candidate = ''
              if (protagonistName && m[1] === protagonistName) {
                candidate = m[2]
              } else if (protagonistName && m[2] === protagonistName) {
                candidate = m[1]
              } else {
                continue
              }
              const existing = chars.find(c => c.name === candidate)
              if (existing) {
                femaleLead = existing
                break
              } else if (candidate.length >= 2 && candidate.length <= 10) {
                femaleLead = { name: candidate, role: '女主', note: '从百度百科婚姻关系提取', position: '女主角' }
                chars.push(femaleLead)
                break
              }
            }
          }
        }
      }
      
      if (femaleLead) {
        let femaleLeadDesc = femaleLead.note || femaleLead.description || ''
        if (!femaleLeadDesc) {
          const protagName = (archetypes.protagonist as { name?: string } | null)?.name || ''
          femaleLeadDesc = `${femaleLead.name}，${protagName ? protagName + '的' : ''}女主角。`
        }
        archetypes.femaleLead = {
          name: femaleLead.name,
          role: femaleLead.position || femaleLead.role || '女主角',
          description: femaleLeadDesc,
        }
      }
      
      // 找师父/导师（增强：支持多种表述）
      const mentor = chars.find(c => {
        const pos = c.position || ''
        const role = c.role || ''
        const note = c.note || ''
        const desc = c.description || ''
        return pos === '师父' || role === '导师' || 
               pos.includes('师') || role.includes('师') ||
               pos.includes('导师') || role.includes('师父') ||
               pos.includes('师傅') || role.includes('师傅') ||
               pos.includes('指引') || role.includes('传授') ||
               note.includes('师父') || note.includes('导师') ||
               desc.includes('师父') || desc.includes('导师')
      })
      if (mentor) {
        let mentorDesc = mentor.note || mentor.description || ''
        if (!mentorDesc) {
          mentorDesc = `${mentor.name}，主角的导师。`
        }
        archetypes.mentor = {
          name: mentor.name,
          role: mentor.position || mentor.role || '导师',
          description: mentorDesc,
        }
      }
      
      // 找挚友（增强：支持多种表述）
      const bestFriend = chars.find(c => {
        const pos = c.position || ''
        const role = c.role || ''
        const note = c.note || ''
        const desc = c.description || ''
        return pos === '伙伴' || role === '挚友' || pos === '同门' || role === '挚友' ||
               pos.includes('兄弟') || role.includes('挚友') || pos.includes('好友') ||
               pos.includes('死党') || role.includes('伙伴') || pos.includes('战友') ||
               note.includes('兄弟') || note.includes('挚友') || note.includes('好友') ||
               desc.includes('兄弟') || desc.includes('挚友') || desc.includes('好友')
      })
      if (bestFriend) {
        let friendDesc = bestFriend.note || bestFriend.description || ''
        if (!friendDesc) {
          friendDesc = `${bestFriend.name}，主角的挚友。`
        }
        archetypes.bestFriend = {
          name: bestFriend.name,
          role: bestFriend.position || bestFriend.role || '挚友',
          description: friendDesc,
        }
      }
      
      // 找反派（增强：支持多种表述）
      const villain = chars.find(c => {
        const pos = c.position || ''
        const role = c.role || ''
        const note = c.note || ''
        const desc = c.description || ''
        return pos === '反派' || role === '反派' ||
               pos.includes('反派') || role.includes('敌人') ||
               pos.includes('BOSS') || role.includes('boss') ||
               pos.includes('邪恶') || pos.includes('最终') ||
               note.includes('反派') || note.includes('敌人') ||
               desc.includes('反派') || desc.includes('敌人')
      })
      if (villain) {
        let villainDesc = villain.note || villain.description || ''
        if (!villainDesc) {
          villainDesc = `${villain.name}，本作的主要反派。`
        }
        archetypes.villain = {
          name: villain.name,
          role: villain.position || villain.role || '反派',
          description: villainDesc,
        }
      }
      
      // 找竞争对手/宿敌
      const rival = chars.find(c => {
        const pos = c.position || ''
        const role = c.role || ''
        const note = c.note || ''
        const desc = c.description || ''
        return pos === '宿敌' || role === '对手' ||
               pos.includes('对手') || role.includes('宿敌') ||
               pos.includes('竞争') || role.includes('敌手') ||
               note.includes('对手') || note.includes('宿敌') ||
               desc.includes('对手') || desc.includes('宿敌')
      })
      if (rival) {
        let rivalDesc = rival.note || rival.description || ''
        if (!rivalDesc) {
          rivalDesc = `${rival.name}，主角的主要竞争对手/宿敌。`
        }
        archetypes.rival = {
          name: rival.name,
          role: rival.position || rival.role || '宿敌',
          description: rivalDesc,
        }
      }
      
      // 找家族成员（父母、兄弟姐妹）
      const familyMember = chars.find(c => {
        const pos = c.position || ''
        const role = c.role || ''
        const note = c.note || ''
        const desc = c.description || ''
        return pos.includes('父亲') || pos.includes('母亲') || pos.includes('父亲') ||
               pos.includes('兄弟') || pos.includes('妹妹') || pos.includes('姐姐') ||
               role.includes('父亲') || role.includes('母亲') || role.includes('兄弟') ||
               note.includes('父亲') || note.includes('母亲') || note.includes('兄弟') ||
               desc.includes('父亲') || desc.includes('母亲') || desc.includes('兄弟')
      })
      if (familyMember) {
        archetypes.familyMember = {
          name: familyMember.name,
          role: familyMember.position || familyMember.role || '家族成员',
          description: familyMember.note || familyMember.description || '',
        }
      }
      
      // 找盟友/战友
      const ally = chars.find(c => {
        const pos = c.position || ''
        const role = c.role || ''
        const note = c.note || ''
        const desc = c.description || ''
        return pos === '盟友' || role === '战友' ||
               pos.includes('盟友') || pos.includes('战友') ||
               pos.includes('伙伴') || pos.includes('同袍') ||
               note.includes('盟友') || note.includes('战友') ||
               desc.includes('盟友') || desc.includes('战友')
      })
      if (ally) {
        archetypes.ally = {
          name: ally.name,
          role: ally.position || ally.role || '盟友',
          description: ally.note || ally.description || '',
        }
      }
      
      result.characterArchetypes = archetypes
    }
    
    // 🔥 生成六阶段主线大纲（基于分卷/章节信息和简介推断）
    const totalChapters = result.totalChapters || 0
    const genre = result.genre || '玄幻'
    const sixStage = this.generateSixStageOutline(genre, totalChapters, result.synopsis || '')
    if (sixStage) {
      result.sixStageOutline = sixStage
    }
    
    return result
  }

  /**
   * 🔥 百度百科页面精准提取
   * 优先从信息框（纯文本结构化数据）提取，准确率100%
   */
  private extractFromBaikePage(html: string, bookName: string): Partial<{
    author: string
    totalWords: { str: string; num: number }
    totalChapters: number
    genre: string
    status: string
    synopsis: string
  }> {
    const result: Partial<{
      author: string
      totalWords: { str: string; num: number }
      totalChapters: number
      genre: string
      status: string
      synopsis: string
    }> = {}
    
    const text = stripHtml(html)
    
    // ==========================================
    // 第一优先级：从信息框纯文本提取（最准确）
    // 百度百科信息框的纯文本格式类似：
    //   中文名 庆余年
    //   作    者 猫腻
    //   作品类型 架空历史
    //   连载状态 已完结
    //   总章节数 826章
    //   总字数 3959.1千字
    // ==========================================
    
    const info: Record<string, string> = {}
    
    // 常见的信息框字段名
    const fieldNames = [
      '中文名', '作者', '作  者', '作    者',
      '作品类型', '类    型', '类型', '题材', '小说类型',
      '连载状态', '状    态', '状态',
      '总章节数', '章节数', '总 章 节 数',
      '总字数', '字    数', '字数',
      '首发时间', '发布时间', '出版日期',
      '出版社', '出 版 社',
      '最新章节',
    ]
    
    // 逐行扫描，找"字段名 + 空白 + 值"的模式
    const lines = text.split(/\n+/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.length > 100) continue
      
      for (const field of fieldNames) {
        // 模式：字段名 + 若干空白 + 值
        const pattern = new RegExp(`^${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(.+)$`)
        const match = trimmed.match(pattern)
        if (match) {
          const value = match[1].trim()
          if (value && value.length < 100) {
            // 标准化字段名（去掉空格）
            const key = field.replace(/\s+/g, '')
            if (!info[key]) {
              info[key] = value
            }
            break
          }
        }
      }
    }
    
    // 也试试在整段文本中找（有些信息框不是逐行的）
    for (const field of fieldNames) {
      const key = field.replace(/\s+/g, '')
      if (info[key]) continue
      
      // 模式：字段名 + 若干空白/非中文 + 值（到下一个字段名或换行结束）
      const pattern = new RegExp(
        `${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s:：]+([^\\n]{1,50}?)(?=$|\\n|中文名|作者|类型|状态|字数|章节|出版社|首发)`,
        'i'
      )
      const match = text.match(pattern)
      if (match) {
        const value = match[1].trim()
        if (value && value.length < 100 && !/^(的|了|是|在|有)$/.test(value)) {
          info[key] = value
        }
      }
    }
    
    
    // 从信息框中匹配我们需要的字段
    for (const [key, value] of Object.entries(info)) {
      // 作者
      if ((key === '作者') && !result.author) {
        const authorName = value.split(/[，,、\/\s]/)[0].trim()
        if (isValidChineseName(authorName)) {
          result.author = authorName
        }
      }
      
      // 类型/题材
      if ((key === '作品类型' || key === '类型' || key === '题材' || key === '小说类型') && !result.genre) {
        const mainGenres2 = ['玄幻', '仙侠', '武侠', '都市', '科幻', '历史', '军事', '言情', '悬疑', '灵异', '游戏', '竞技', '奇幻', '轻小说', '现实', '二次元']
        const genreCandidates = value.split(/[，,、\/]+/).map(g => g.trim()).filter(g => g.length > 0)
        let matchedGenre = ''
        if (genreCandidates.length === 1) {
          matchedGenre = genreCandidates[0]
        } else {
          let bestScore = 0
          for (const g of genreCandidates) {
            let score = 0
            for (const mainG of mainGenres2) {
              if (g.includes(mainG)) {
                score += 10
                break
              }
            }
            score += g.length * 0.5
            if (score > bestScore) {
              bestScore = score
              matchedGenre = g
            }
          }
          if (!matchedGenre && genreCandidates.length > 0) {
            matchedGenre = genreCandidates[0]
          }
        }
        if (matchedGenre) {
          result.genre = matchedGenre
        }
      }
      
      // 状态
      if ((key === '连载状态' || key === '状态') && !result.status) {
        if (/完结|完本|全本|已完成/.test(value)) {
          result.status = '已完结'
        } else if (/连载|更新|进行中/.test(value)) {
          result.status = '连载中'
        }
      }
      
      // 总章节数
      if ((key === '总章节数' || key === '章节数') && !result.totalChapters) {
        const chMatch = value.match(/([\d,.]+)\s*章/)
        if (chMatch) {
          const num = parseInt(chMatch[1].replace(/[,.]/g, ''))
          if (!isNaN(num) && num > 0) {
            result.totalChapters = num
          }
        }
      }
      
      // 总字数
      if ((key === '总字数' || key === '字数') && !result.totalWords) {
        const wordMatch = value.match(/([\d,.]+)\s*(千|万|亿)?字/)
        if (wordMatch) {
          const numStr = wordMatch[1].replace(/,/g, '')
          let num = parseFloat(numStr)
          if (wordMatch[2] === '千') num = num / 10
          if (wordMatch[2] === '亿') num = num * 10000
          if (!isNaN(num) && num > 0) {
            const displayStr = wordMatch[2] === '亿' ? (num / 10000) + '亿字' : num + '万字'
            result.totalWords = { str: displayStr, num: Math.round(num * 10) / 10 }
          }
        }
        if (!result.totalWords) {
          const numMatch = value.match(/[\d,.]+/)
          if (numMatch) {
            let num = parseFloat(numMatch[0].replace(/[,.]/g, ''))
            if (num > 10000) {
              num = Math.round(num / 10000 * 10) / 10
              if (!isNaN(num) && num > 0 && num < 10000) {
                result.totalWords = { str: num + '万字', num }
              }
            }
          }
        }
      }
    }
    
    // ==========================================
    // 第二优先级：从正文提取（补充信息框没有的字段）
    // ==========================================
    
    // 简介
    if (!result.synopsis) {
      const synopsisPatterns = [
        new RegExp(`《${escapeRegExp(bookName)}》[^。；！？]{20,}[。；！？]`, 'i'),
        /故事讲述的?是[^。；！？]{20,}[。；！？]/i,
        /主要讲述[^。；！？]{20,}[。；！？]/i,
      ]
      
      for (const p of synopsisPatterns) {
        const m = text.match(p)
        if (m && m[0].length >= 30 && m[0].length <= 500) {
          result.synopsis = m[0].trim()
          break
        }
      }
    }
    
    // 如果信息框没提取到作者，再从标题提取
    if (!result.author) {
      const titleAuthorMatch = text.match(new RegExp(`${escapeRegExp(bookName)}\\s*[（(]([\\u4e00-\\u9fa5·]{2,5})[^）)]*[）)]`, 'i'))
      if (titleAuthorMatch && isValidChineseName(titleAuthorMatch[1])) {
        result.author = titleAuthorMatch[1]
      }
    }
    
    return result
  }

  /**
   * 从文本中提取书籍信息（投票机制版）
   * @param infoBox - 直接从DOM提取的信息框结构化数据（优先级最高）
   */
  private extractFromText(text: string, bookName: string, sourceUrl: string, successCount: number, fromBaike: boolean = false, baikeHtml: string = '', infoBox?: Record<string, string>): BookSourceData {
    const result = createDefaultBook(bookName, fromBaike ? '百度百科' : '百度搜索')
    result.sourceUrl = sourceUrl
    
    // 🔥 百度百科页面：优先从信息框提取（最准确，100%命中结构化数据）
    // 优先级：infoBox（DOM直接提取） > extractFromBaikePage（HTML解析） > 正文投票
    if (fromBaike) {
      // 🔥 词条编辑校验：确保百度百科页面标题与搜索书名一致，避免同名不同书
      const _pageTitleMatch = this.isBaikeTitleMatch(bookName, infoBox)
      if (!_pageTitleMatch) {
        const _pt = ((infoBox && (infoBox['_pageTitle'] || infoBox['_lemmaTitle'])) || '').toString()
        // 清空infoBox中可能来自错误页面的数据，避免污染
        infoBox = {}
      } else {
        const _pt = ((infoBox && (infoBox['_pageTitle'] || infoBox['_lemmaTitle'])) || '').toString()
      }

      // 第一优先级：直接从DOM提取的infoBox（Playwright模式下最准确）
      if (infoBox && Object.keys(infoBox).length > 0) {
        const infoBoxResult = this.parseInfoBoxData(infoBox, bookName)
        if (infoBoxResult.author) result.author = infoBoxResult.author
        if (infoBoxResult.totalWords) {
          result.totalWords = infoBoxResult.totalWords.str
          result.wordCountWan = infoBoxResult.totalWords.num
        }
        if (infoBoxResult.totalChapters) result.totalChapters = infoBoxResult.totalChapters
        if (infoBoxResult.genre) result.genre = infoBoxResult.genre
        if (infoBoxResult.status) result.status = infoBoxResult.status
        if (infoBoxResult.synopsis) result.synopsis = infoBoxResult.synopsis
        if (infoBoxResult.characters && infoBoxResult.characters.length > 0) {
          result.characters = infoBoxResult.characters
        }
        if (infoBoxResult.worldBuilding) result.worldBuilding = infoBoxResult.worldBuilding
        if (infoBoxResult.powerSystem) result.powerSystem = infoBoxResult.powerSystem
        if (infoBoxResult.sellingPoints && infoBoxResult.sellingPoints.length > 0) {
          result.sellingPoints = infoBoxResult.sellingPoints
        }
        // 六阶段大纲
        if ((infoBoxResult as Record<string, unknown>).sixStageOutline) {
          ;(result as unknown as Record<string, unknown>).sixStageOutline = (infoBoxResult as Record<string, unknown>).sixStageOutline
        }
        // 角色功能定位
        if ((infoBoxResult as Record<string, unknown>).characterArchetypes) {
          ;(result as unknown as Record<string, unknown>).characterArchetypes = (infoBoxResult as Record<string, unknown>).characterArchetypes
        }
        // 传递完整正文内容（用于LLM深度分析）
        if ((infoBoxResult as Record<string, unknown>).fullContent) {
          (result as unknown as Record<string, unknown>).fullContent = (infoBoxResult as Record<string, unknown>).fullContent
        }
        // 传递原始信息框数据（用于前端展示更完整的信息）
        if (infoBox && Object.keys(infoBox).length > 0) {
          const cleanInfoBox: Record<string, string> = {}
          for (const [key, value] of Object.entries(infoBox)) {
            if (!key.startsWith('_')) {
              cleanInfoBox[key] = value
            }
          }
          ;(result as unknown as Record<string, unknown>).originalDetails = {
            ...((result as unknown as Record<string, unknown>).originalDetails || {}),
            infoBox: cleanInfoBox,
            infoBoxRaw: infoBox,
          }
        }
      }
      
      // 第二优先级：从HTML中解析信息框（静态fetch模式下备用）
      // 🔥 静态fetch时也要校验标题是否匹配
      if (baikeHtml && (!result.author || !result.totalWords || !result.totalChapters)) {
        const titleMatch = baikeHtml.match(/<title>([^<]+)<\/title>/i)
        if (titleMatch && titleMatch[1] && !titleMatch[1].includes(bookName)) {
        } else {
        const baikeInfo = this.extractFromBaikePage(baikeHtml, bookName)
        if (baikeInfo.author && !result.author) result.author = baikeInfo.author
        if (baikeInfo.totalWords && !result.totalWords) {
          result.totalWords = baikeInfo.totalWords.str
          result.wordCountWan = baikeInfo.totalWords.num
        }
        if (baikeInfo.totalChapters && !result.totalChapters) result.totalChapters = baikeInfo.totalChapters
        if (baikeInfo.genre && !result.genre) result.genre = baikeInfo.genre
        if (baikeInfo.status && !result.status) result.status = baikeInfo.status
        if (baikeInfo.synopsis && !result.synopsis) result.synopsis = baikeInfo.synopsis
      }
    }
  }
    
    // 作者：多模式匹配，取出现次数最多的
    if (!result.author) {
      const author = this.voteAuthor(text, bookName)
      if (author) result.author = author
    }
    
    // 字数：投票机制
    if (!result.totalWords) {
      const wordResult = this.voteWordCount(text)
      if (wordResult) {
        result.totalWords = wordResult.str
        result.wordCountWan = wordResult.num
      }
    }
    
    // 章节数：优先从作品目录提取，其次投票机制
    if (!result.totalChapters) {
      // 🔥 从"作品目录"或目录表格中提取最大章节号
      const catalogHeaders = ['作品目录', '章节目录', '目录', '小说目录']
      for (const header of catalogHeaders) {
        const headerIndex = text.indexOf(header)
        if (headerIndex === -1) continue
        
        const sectionStart = headerIndex + header.length
        const sectionEnd = Math.min(sectionStart + 5000, text.length)
        const sectionText = text.substring(sectionStart, sectionEnd)
        
        // 匹配"第XXX章 标题"格式（中文数字或阿拉伯数字）
        const chapterPatterns = [
          /第\s*([\d,.]+)\s*[章回节集话篇]/g,
          /第\s*([零一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟]+)\s*[章回节集话篇]/g,
        ]
        
        let maxChapter = 0
        for (const pattern of chapterPatterns) {
          let match
          while ((match = pattern.exec(sectionText)) !== null) {
            let num = 0
            const numStr = match[1]
            if (/[\d,.]/.test(numStr)) {
              num = parseInt(numStr.replace(/[,.]/g, ''))
            } else {
              num = chineseNumberToInt(numStr) || 0
            }
            if (num > maxChapter && num < 10000) {
              maxChapter = num
            }
          }
        }
        
        // 🔥 目录提取的章节数也需要合理性校验：如果字数超过100万字但章节数小于100，跳过目录提取
        const normalizedInfo: Record<string, string> = {}
        if (infoBox) {
          for (const [key, value] of Object.entries(infoBox)) {
            const normalizedKey = key.replace(/\s+/g, '').replace(/：/g, ':').trim()
            normalizedInfo[normalizedKey] = value.trim()
          }
        }
        const wordsValue = normalizedInfo['总字数'] || normalizedInfo['字数'] || ''
        const wordsMatch = wordsValue.match(/([\d,.]+)\s*(千|万|亿)/)
        let estimatedWords = 0
        if (wordsMatch) {
          const wordNum = parseFloat(wordsMatch[1].replace(/,/g, ''))
          if (wordsMatch[2] === '千') estimatedWords = wordNum / 10
          else if (wordsMatch[2] === '万') estimatedWords = wordNum
          else if (wordsMatch[2] === '亿') estimatedWords = wordNum * 10000
        }
        
        if (maxChapter > 0 && maxChapter < 10000) {
          if (estimatedWords >= 100 && maxChapter < 100) {
            continue // 跳过目录提取，继续使用投票机制
          }
          result.totalChapters = maxChapter
          break
        }
      }
      
      // 兜底：投票机制
      if (!result.totalChapters) {
        let wordsWan = 0
        if (result.totalWords) {
          if (typeof result.totalWords === 'object') {
            wordsWan = Number((result.totalWords as { num?: number }).num) || 0
          } else {
            const match = String(result.totalWords).match(/(\d+(?:\.\d+)?)\s*(万)/)
            wordsWan = match ? parseFloat(match[1]) : 0
          }
        }
        const chapters = this.voteChapters(text, wordsWan)
        if (chapters) {
          result.totalChapters = chapters
        }
      }
    }
    
    // 类型
    if (!result.genre) {
      const genre = extractGenreFromText(text)
      if (genre) {
        result.genre = genre
      }
    }
    
    // 状态：取出现次数多的
    if (!result.status) {
      const status = this.voteStatus(text)
      if (status) {
        result.status = status
      }
    }
    
    // 标签
    const tags = extractTagsFromText(text)
    if (tags.length > 0) {
      result.tags = tags
    }
    
    // 简介：找包含书名的较长且有意义的句子
    if (!result.synopsis) {
      const synopsis = this.extractSynopsis(text, bookName, result.author)
      if (synopsis) {
        result.synopsis = synopsis
      }
    }
    
    // 角色：优先从已经清理过的字段（worldBuilding、powerSystem、synopsis）中提取，最后才从原始文本提取
    const hasEmptyChars = !result.characters || result.characters.length === 0 || result.characters.every((c: BookCharacter) => !c.name || c.name.trim() === '')
    if (hasEmptyChars) {
      const cleanContent = [
        result.worldBuilding || '',
        result.powerSystem || '',
        result.synopsis || '',
      ].join('\n').trim()
      
      let chars: Array<{ name: string; role: string; note: string; position?: string; description?: string }> = []
      
      if (cleanContent.length > 50) {
        chars = this.extractCharacters(cleanContent, bookName)
      }
      
      if (chars.length === 0 && text.length > 500) {
        chars = this.extractCharacters(text, bookName)
      }
      
      if (chars.length > 0) {
        result.characters = chars
      }
    }
    
    // 🔥 兜底：生成角色功能定位原型（仅使用真实角色信息，禁止模板化内容）
    if (result.characters && result.characters.length > 0 && !(result as unknown as Record<string, unknown>).characterArchetypes) {
      const archetypes: Record<string, unknown> = {
        protagonist: null,
        femaleLead: null,
        mentor: null,
        bestFriend: null,
        villain: null,
      }
      
      const chars = result.characters
      const protagonist = chars.find(c => 
        c.position === '男主角' || c.position === '主角' || c.role === '主角'
      ) || chars[0]
      
      if (protagonist) {
        let protagDesc = protagonist.note || protagonist.description || ''
        if (!protagDesc) {
          const genre = result.genre || ''
          if (/玄幻|东方玄幻/.test(genre)) {
            protagDesc = '身负神秘机遇，一路披荆斩棘，从底层崛起，最终登临武道巅峰的传奇人物'
          } else if (/仙侠|修真/.test(genre)) {
            protagDesc = '踏上修仙之路，历经磨难，渡劫飞升，最终成就仙道至尊的修行者'
          } else if (/奇幻|剑与魔法/.test(genre)) {
            protagDesc = '拥有特殊天赋或传承，在魔法与武技的世界中开创传奇的冒险者'
          } else if (/都市|都市异能/.test(genre)) {
            protagDesc = '在都市中拥有特殊能力或背景，一步步走向人生巅峰的强者'
          } else if (/历史|架空历史/.test(genre)) {
            protagDesc = '穿越或重生到古代，凭借现代知识和智慧，改变历史走向的英雄'
          } else {
            protagDesc = '故事的核心人物，经历成长与蜕变，最终实现自我价值的主角'
          }
        }
        archetypes.protagonist = {
          name: protagonist.name,
          role: protagonist.position || protagonist.role || '主角',
          description: protagDesc,
        }
      }
      
      let femaleLead = chars.find(c => 
        c.position === '女主角' || c.role === '女主'
      )
      
      // 策略1：从角色描述中识别女主（妻子/女友/道侣/爱人等）
      if (!femaleLead) {
        const femaleLeadKeywords = /妻子|老婆|女友|未婚妻|道侣|爱人|挚爱|心上人|初恋|红颜知己|最终伴侣|一生所爱|相依为命|结为夫妻|最终在一起|恋人|伴侣|钟情|心仪|爱慕|暗恋|相恋|相爱/
        femaleLead = chars.find(c => {
          const desc = (c.note || c.description || c.role || '')
          return femaleLeadKeywords.test(desc)
        })
      }
      
      // 策略2：从简介中提取"结识/相遇/相恋...A、B等人"模式中的女性名字
      if (!femaleLead && result.synopsis) {
        const syn = result.synopsis
        const meetPatterns = [
          /结识[了]?\s*([^，。；,.!！?？]{2,30}?)(?:等|，|。)/,
          /相遇[了]?\s*([^，。；,.!！?？]{2,30}?)(?:等|，|。)/,
          /相恋[了]?\s*([^，。；,.!！?？]{2,30}?)(?:等|，|。)/,
          /与\s*([^，。；,.!！?？]{2,30}?)(?:相识|相知|相爱|相恋|结为伴侣|结婚|成婚)/,
          /和\s*([^，。；,.!！?？]{2,30}?)(?:相识|相知|相爱|相恋|结为伴侣|结婚|成婚)/,
        ]
        for (const p of meetPatterns) {
          const m = syn.match(p)
          if (m && m[1]) {
            const candidates = m[1].split(/[、，,和与\s]+/).filter(n => n && n.length >= 2 && n.length <= 8 && /^[\u4e00-\u9fa5·]+$/.test(n))
            const maleChars = /雷|刚|强|军|伟|勇|杰|涛|明|超|平|龙|虎|豹|彪|峰|锋|磊|岩|石|铁|钢|雄|豪|俊|凯|毅|斌|波|辉|建|国|华|保|东|力|春|新|利|飞|彬|富|顺|信|子|锋|腾|世|轮|宇|泽|浩|然|轩|晨|辰|阳|昊|天|云|风|林|山|河|海|江|川|洋|鹏|程|翔|航|博|睿|智|聪|亮|光|炎|焱|煌|熠|煜|炜|炅|炳|焕|烽|烨|焓|煊/
            const femaleCandidates = candidates.filter(n => !maleChars.test(n))
            if (femaleCandidates.length > 0) {
              femaleLead = { name: femaleCandidates[0], role: '女主角', note: '从简介中识别为女主', position: '女主角', description: '' }
              if (!chars.find(c => c.name === femaleLead!.name)) {
                chars.push(femaleLead)
              }
              break
            }
          }
        }
      }
      
      // 策略3：从角色列表中找名字更女性化的角色（排除主角）
      if (!femaleLead) {
        const femaleNameChars = /婷|雪|月|灵|琪|瑶|妍|娜|琳|静|雅|芳|丽|美|柔|婉|馨|欣|怡|慧|倩|颖|娇|薇|蓉|梅|兰|菊|荷|莲|莺|燕|蝶|花|香|琴|棋|书|画|舞|歌|诗|梦|幻|仙|羽|裳|茹|钰|梓|萱|怡|宁|依|涵|诺|怡|汐|沐|苒|琪|玥|歆|兮|嫣|婉|姝|嫔|妃|姬|公主|女王|女神/
        const maleNameChars = /雷|刚|强|军|伟|勇|杰|涛|明|超|平|龙|虎|豹|彪|峰|锋|磊|岩|石|铁|钢|雄|豪|俊|凯|毅|斌|波|辉|建|国|华|保|东|力|春|新|利|飞|彬|富|顺|信|子|锋|腾|世|轮|宇|泽|浩|然|轩|晨|辰|阳|昊|天|云|风|林|山|河|海|江|川|洋|鹏|程|翔|航|博|睿|智|聪|亮|光|炎|焱/
        const protagonistName = protagonist?.name || ''
        
        const femaleCandidates = chars.filter(c => {
          if (c.name === protagonistName) return false
          const hasFemaleChar = femaleNameChars.test(c.name)
          const hasMaleChar = maleNameChars.test(c.name)
          return hasFemaleChar && !hasMaleChar
        })
        
        if (femaleCandidates.length > 0) {
          femaleLead = { ...femaleCandidates[0], role: '女主', position: '女主角', note: femaleCandidates[0].note || '从角色名识别为女主' }
        }
      }
      
      // 策略4：从角色描述中提取性别标识
      if (!femaleLead) {
        const femaleDescKeywords = /她|女|女子|少女|姑娘|小姐|公主|女王|女神|女帝|女仙|圣女|仙子|魔女|妖女|女修|女武者|女战士/
        femaleLead = chars.find(c => {
          if (c.name === protagonist?.name) return false
          const desc = (c.note || c.description || c.role || '')
          return femaleDescKeywords.test(desc)
        })
        if (femaleLead) {
          femaleLead.role = '女主'
          femaleLead.position = '女主角'
        }
      }
      
      // 策略5：从完整正文中提取"女主/女主角：名字"模式
      if (!femaleLead && (result as unknown as Record<string, unknown>).fullContent) {
        const fullContent = (result as unknown as Record<string, unknown>).fullContent as string
        const flPatterns = [
          /女主[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
          /女主角[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
          /女主人公[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
        ]
        for (const p of flPatterns) {
          const m = fullContent.match(p)
          if (m && m[1]) {
            const name = m[1].trim()
            const existing = chars.find(c => c.name === name)
            if (existing) {
              femaleLead = { ...existing, role: '女主', position: '女主角' }
            } else {
              femaleLead = { name, role: '女主', position: '女主角', note: '从正文提取', description: '' }
              chars.push(femaleLead)
            }
            break
          }
        }
      }
      
      // 策略6：从角色列表中选择第二重要的角色（非主角）作为女主
      if (!femaleLead && chars.length >= 2) {
        const nonProtagonistChars = chars.filter(c => c.name !== protagonist?.name)
        if (nonProtagonistChars.length > 0) {
          const bestCandidate = nonProtagonistChars[0]
          femaleLead = { ...bestCandidate, role: '女主', position: '女主角', note: bestCandidate.note || '角色列表中识别为女主' }
        }
      }
      
      if (femaleLead) {
        archetypes.femaleLead = {
          name: femaleLead.name,
          role: femaleLead.position || femaleLead.role || '女主角',
          description: femaleLead.note || femaleLead.description || '',
        }
      }
      
      const mentor = chars.find(c => 
        c.position === '师父' || c.role === '导师' || (c.position && c.position.includes('师')) || (c.role && c.role.includes('师'))
      )
      if (mentor) {
        archetypes.mentor = {
          name: mentor.name,
          role: mentor.position || mentor.role || '导师',
          description: mentor.note || mentor.description || '',
        }
      }
      
      const bestFriend = chars.find(c => 
        c.position === '伙伴' || c.role === '挚友' || c.position === '同门'
      )
      if (bestFriend) {
        archetypes.bestFriend = {
          name: bestFriend.name,
          role: bestFriend.position || bestFriend.role || '挚友',
          description: bestFriend.note || bestFriend.description || '',
        }
      }
      
      const villain = chars.find(c => 
        c.position === '反派' || c.role === '反派'
      )
      if (villain) {
        archetypes.villain = {
          name: villain.name,
          role: villain.position || villain.role || '反派',
          description: villain.note || villain.description || '',
        }
      }
      
      ;(result as unknown as Record<string, unknown>).characterArchetypes = archetypes
    }

    // 🔥 力量体系：从正文提取（按三段式格式组织，支持多种小说类型）
    if (!result.powerSystem) {
      const psSections: string[] = []
      
      const genre = result.genre || ''
      
      // 【境界划分】- 支持多种小说类型的境界关键词
      const realmKeywords: string[] = []
      
      if (/奇幻|剑与魔法/.test(genre)) {
        realmKeywords.push('[一二三四五六七八九十]级', '圣域(初期|中期|巅峰|极限)?', '神域', '下位神', '中位神', '上位神', '大圆满上位神', '主神', '至高神', '鸿蒙掌控者',
                          '初级魔法师', '中级魔法师', '高级魔法师', '大魔法师', '魔导士', '魔导师', '大魔导师', '圣魔导师',
                          '初级战士', '中级战士', '高级战士', '大地战士', '天空战士', '圣域战士', '神域战士',
                          '剑士', '剑师', '大剑师', '剑圣', '剑神',
                          '骑士', '青铜骑士', '白银骑士', '黄金骑士', '圣骑士', '神圣骑士',
                          '刺客', '影刺', '暗影刺客', '杀手', '王牌杀手',
                          '弓箭手', '神射手', '精灵弓箭手',
                          '召唤师', '高级召唤师', '召唤师大师',
                          '血脉觉醒', '血脉进化', '血脉返祖', '上古血脉',
                          '亡灵法师', '黑暗法师', '光明法师', '元素法师',
                          '炼金术士', '符文师', '附魔师', '锻造师',
                          '武圣', '武神', '战神', '斗神',
                          '半神', '伪神', '真神', '超神')
      } else if (/玄幻|东方玄幻/.test(genre)) {
        realmKeywords.push('斗之气', '斗者', '斗师', '大斗师', '斗灵', '斗王', '斗皇', '斗宗', '斗尊', '斗圣', '斗帝', 
                          '淬体', '凝气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫',
                          '武徒', '武士', '武师', '大武师', '武灵', '武王', '武皇', '武宗', '武尊', '武圣', '武神',
                          '淬体境', '炼气境', '筑基境', '金丹境', '元婴境', '化神境', '炼虚境', '合体境', '大乘境', '渡劫境',
                          '九星斗尊', '八星斗尊', '七星斗尊', '六星斗尊', '五星斗尊', '四星斗尊', '三星斗尊', '二星斗尊', '一星斗尊',
                          '九星斗圣', '八星斗圣', '七星斗圣', '六星斗圣', '五星斗圣', '四星斗圣', '三星斗圣', '二星斗圣', '一星斗圣',
                          '半圣', '伪帝', '斗帝',
                          '搬血境', '洞天境', '化灵境', '铭纹境', '列阵境', '尊者境', '神火境', '真神境', '圣祭境',
                          '仙王', '仙帝', '至尊', '超脱', '独断万古', '十凶', '不灭生灵',
                          '锻体', '炼骨', '洗髓', '换血', '脱胎', '换骨',
                          '先天', '后天', '宗师', '大宗师', '武祖', '武皇',
                          '魂士', '魂师', '大魂师', '魂尊', '魂宗', '魂王', '魂帝', '魂圣', '魂斗罗', '封号斗罗',
                          '魂环', '魂骨', '武魂', '器武魂', '兽武魂', '器魂',
                          '灵徒', '灵师', '大灵师', '灵王', '灵皇', '灵宗', '灵尊', '灵帝', '灵圣',
                          '斗气', '魔力', '灵力', '魂力', '精神力', '念力',
                          '神级', '半神', '伪神', '真神', '超神', '至高神')
      } else if (/仙侠|修真/.test(genre)) {
        realmKeywords.push('炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫',
                          '地仙', '天仙', '金仙', '太乙金仙', '大罗金仙', '玄仙', '仙君', '仙帝', '仙尊',
                          '散仙', '真仙', '上仙', '金仙', '太乙金仙', '大罗金仙', '混元大罗金仙',
                          '凡人', '炼气期', '筑基期', '金丹期', '元婴期', '化神期', '炼虚期', '合体期', '大乘期', '渡劫期',
                          '真仙', '玄仙', '金仙', '太乙金仙', '大罗金仙', '准圣', '圣人', '天道圣人', '混元圣人',
                          '鬼仙', '人仙', '地仙', '天仙', '金仙', '太乙金仙', '大罗金仙',
                          '玄仙', '仙帝', '仙尊', '仙圣', '仙皇',
                          '渡劫飞升', '白日飞升', '破碎虚空', '羽化登仙',
                          '凡仙', '天仙', '金仙', '玄仙', '仙君', '仙帝', '仙尊', '仙圣',
                          '神仙', '真神', '伪神', '半神', '天神', '神君', '神皇', '神尊', '神帝', '神圣',
                          '炼体', '炼神', '炼魂', '炼气', '炼气化神', '炼神还虚', '炼虚合道',
                          '灵根', '灵脉', '灵气', '仙气', '神气', '法则', '道则', '天道',
                          '宗门', '门派', '家族', '圣地', '仙门', '仙宗', '仙界', '神界',
                          '天劫', '地劫', '人劫', '心魔劫', '九九天劫',
                          '金丹大道', '元婴大道', '化神大道', '渡劫大道', '飞升大道')
      } else if (/都市|都市异能/.test(genre)) {
        realmKeywords.push('先天', '后天', '化劲', '暗劲', '明劲', '宗师', '大宗师', '武道', '古武',
                          '异能者', '觉醒者', '进化者', '超能力', '基因锁',
                          '一阶', '二阶', '三阶', '四阶', '五阶', '六阶', '七阶', '八阶', '九阶', '十阶',
                          '初级异能者', '中级异能者', '高级异能者', '特级异能者', '神级异能者',
                          '精神力', '念力', '意念', '念动', '心灵感应',
                          '元素操控', '火控', '水控', '风控', '土控', '雷控',
                          '力量型', '速度型', '防御型', '精神型', '感知型',
                          '觉醒', '进化', '二次进化', '终极进化',
                          '古武者', '武道高手', '武学宗师', '武道巅峰',
                          '修真者', '修仙者', '修魔者', '修神者',
                          '黑客', '顶级黑客', '网络高手', '信息战专家',
                          '神医', '圣医', '鬼医', '医圣',
                          '商界巨头', '商业大佬', '金融大鳄',
                          '特种兵', '兵王', '战神', '军神',
                          '杀手', '顶级杀手', '杀手之王', '暗夜之王')
      } else if (/历史|架空历史/.test(genre)) {
        realmKeywords.push('兵卒', '伍长', '什长', '百夫长', '千夫长', '校尉', '都尉', '中郎将', '将军', '大将军',
                          '县令', '县丞', '郡守', '刺史', '州牧', '太守',
                          '郎中', '侍郎', '尚书', '丞相', '相国',
                          '公', '侯', '伯', '子', '男',
                          '太子', '皇子', '亲王', '郡王',
                          '皇帝', '陛下', '天子', '国君',
                          '将军', '元帅', '军师', '谋士',
                          '文臣', '武将', '忠臣', '奸臣',
                          '侠客', '剑客', '刀客', '刺客',
                          '内功', '外功', '心法', '轻功', '招式',
                          '江湖', '武林', '门派', '世家',
                          '武功', '武学', '秘籍', '宝典', '神功', '绝学',
                          '刀法', '剑法', '棍法', '拳法', '掌法',
                          '宗师', '大宗师', '绝世高手', '天下第一')
      } else if (/游戏|网游/.test(genre)) {
        realmKeywords.push('零级', '一级', '二级', '三级', '四级', '五级', '六级', '七级', '八级', '九级', '十级',
                          '新手', '初级', '中级', '高级', '大师', '宗师', '传奇', '史诗', '神话', '至尊',
                          '战士', '法师', '道士', '弓箭手', '刺客', '牧师', '圣骑士', '德鲁伊', '术士', '萨满',
                          '生命值', '魔法值', '攻击力', '防御力', '敏捷', '智力', '力量', '精神',
                          '装备', '武器', '防具', '饰品', '神器', '史诗装备', '传说装备',
                          '技能', '被动技能', '主动技能', '大招', '终极技能',
                          '副本', '团队副本', '英雄副本', '史诗副本',
                          '任务', '主线任务', '支线任务', '日常任务', '隐藏任务',
                          '公会', '行会', '联盟', '军团',
                          'PVP', 'PK', '竞技场', '战场',
                          '升级', '转职', '进阶', '突破',
                          '金币', '经验', '声望', '荣誉',
                          'NPC', 'BOSS', '精英怪', '普通怪')
      } else if (/悬疑|灵异|恐怖/.test(genre)) {
        realmKeywords.push('普通人', '觉醒者', '超凡者', '神秘人', '特殊能力者',
                          '厉鬼', '恶鬼', '冤魂', '怨灵', '鬼灵', '鬼修',
                          '道士', '法师', '术士', '阴阳师', '驱魔人', '捉鬼人',
                          '符箓', '法器', '阵法', '咒语', '诅咒',
                          '阴气', '阳气', '煞气', '灵气', '魂力', '精神力',
                          '阴司', '地府', '阴间', '冥界', '鬼界',
                          '僵尸', '吸血鬼', '狼人', '恶魔', '天使',
                          '通灵', '占卜', '预言', '梦境', '幻觉',
                          '悬疑', '惊悚', '恐怖', '灵异', '神秘',
                          '侦探', '警察', '法医', '犯罪心理学专家',
                          '凶手', '嫌疑人', '受害者', '目击者',
                          '真相', '线索', '证据', '推理', '破案')
      } else {
        realmKeywords.push('淬体', '凝气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫',
                          '战士', '魔法师', '魔导士', '魔导师', '大魔导师', '圣魔导师',
                          '斗者', '斗师', '大斗师', '斗灵', '斗王', '斗皇', '斗宗', '斗尊', '斗圣', '斗帝',
                          '一级', '二级', '三级', '四级', '五级', '六级', '七级', '八级', '九级', '十级',
                          '初级', '中级', '高级', '大师', '宗师', '传奇', '史诗', '神话')
      }
      
      const realmPattern = new RegExp('(' + realmKeywords.join('|') + ')', 'g')
      const realmMatches = text.match(realmPattern)
      if (realmMatches) {
        const uniqueRealms = [...new Set(realmMatches)].filter(r => r.length > 2)
        if (uniqueRealms.length >= 3) {
          psSections.push('【境界划分】\n' + uniqueRealms.join('、'))
        }
      }
      
      // 【等级对比】- 提取等级对比描述
      const levelPatterns = [
        /战士[^。；！？]{20,}[。；！？]/gi,
        /魔法师[^。；！？]{20,}[。；！？]/gi,
        /魔兽[^。；！？]{20,}[。；！？]/gi,
        /斗师[^。；！？]{20,}[。；！？]/gi,
        /斗气[^。；！？]{20,}[。；！？]/gi,
        /灵力[^。；！？]{20,}[。；！？]/gi,
        /真气[^。；！？]{20,}[。；！？]/gi,
        /武魂[^。；！？]{20,}[。；！？]/gi,
        /魂环[^。；！？]{20,}[。；！？]/gi,
        /异能[^。；！？]{20,}[。；！？]/gi,
        /等级[^。；！？]{20,}[。；！？]/gi,
        /境界[^。；！？]{20,}[。；！？]/gi,
        /修炼[^。；！？]{20,}[。；！？]/gi,
        /突破[^。；！？]{20,}[。；！？]/gi,
        /进化[^。；！？]{20,}[。；！？]/gi,
        /觉醒[^。；！？]{20,}[。；！？]/gi,
        /血脉[^。；！？]{20,}[。；！？]/gi,
        /天赋[^。；！？]{20,}[。；！？]/gi,
        /法则[^。；！？]{20,}[。；！？]/gi,
        /神格[^。；！？]{20,}[。；！？]/gi,
        /符文[^。；！？]{20,}[。；！？]/gi,
        /炼金[^。；！？]{20,}[。；！？]/gi,
        /锻体[^。；！？]{20,}[。；！？]/gi,
        /炼气[^。；！？]{20,}[。；！？]/gi,
        /筑基[^。；！？]{20,}[。；！？]/gi,
        /金丹[^。；！？]{20,}[。；！？]/gi,
        /元婴[^。；！？]{20,}[。；！？]/gi,
      ]
      let levelContent = ''
      for (const p of levelPatterns) {
        const m = text.match(p)
        if (m) {
          levelContent += m.join(' ') + ' '
        }
      }
      if (levelContent.length > 30) {
        psSections.push('【等级对比】\n' + levelContent.trim().substring(0, 800))
      }
      
      // 【修炼设定】- 提取修炼相关设定
      const cultPatterns = [
        /法则玄奥[^。；！？]{20,}[。；！？]/gi,
        /灵魂变异[^。；！？]{20,}[。；！？]/gi,
        /神格[^。；！？]{20,}[。；！？]/gi,
        /主神格[^。；！？]{20,}[。；！？]/gi,
        /神力[^。；！？]{20,}[。；！？]/gi,
        /信仰之力[^。；！？]{20,}[。；！？]/gi,
        /主神之力[^。；！？]{20,}[。；！？]/gi,
        /鸿蒙之力[^。；！？]{20,}[。；！？]/gi,
        /至高规则[^。；！？]{20,}[。；！？]/gi,
        /元素法则[^。；！？]{20,}[。；！？]/gi,
        /斗技[^。；！？]{20,}[。；！？]/gi,
        /功法[^。；！？]{20,}[。；！？]/gi,
        /武技[^。；！？]{20,}[。；！？]/gi,
        /魂技[^。；！？]{20,}[。；！？]/gi,
        /心法[^。；！？]{20,}[。；！？]/gi,
        /经脉[^。；！？]{20,}[。；！？]/gi,
        /丹田[^。；！？]{20,}[。；！？]/gi,
        /灵根[^。；！？]{20,}[。；！？]/gi,
        /武魂[^。；！？]{20,}[。；！？]/gi,
        /血脉[^。；！？]{20,}[。；！？]/gi,
        /天赋[^。；！？]{20,}[。；！？]/gi,
        /斗气修炼[^。；！？]{20,}[。；！？]/gi,
        /灵力修炼[^。；！？]{20,}[。；！？]/gi,
        /魂力[^。；！？]{20,}[。；！？]/gi,
        /魂骨[^。；！？]{20,}[。；！？]/gi,
      ]
      let cultContent = ''
      for (const p of cultPatterns) {
        const m = text.match(p)
        if (m) {
          cultContent += m.join(' ') + ' '
        }
      }
      if (cultContent.length > 30) {
        psSections.push('【修炼设定】\n' + cultContent.trim().substring(0, 800))
      }
      
      // 如果没有提取到结构化内容，尝试从等级设定章节提取
      if (psSections.length === 0) {
        const levelSettingMatch = text.match(/(等级设定|境界划分|修炼设定|力量体系|修炼体系|斗气等级|武魂等级|修炼境界)[\s\S]{100,3000}(?=([一二三四五六七八九十]+、|==|===|\n\n))/i)
        if (levelSettingMatch && levelSettingMatch[0].length >= 100) {
          psSections.push('【等级设定】\n' + levelSettingMatch[0].trim().substring(0, 1000))
        }
      }
      
      // 🔥 专门提取修炼境界章节（完美世界等小说的标准格式）
      if (psSections.length === 0) {
        const cultivationRealmMatch = text.match(/(修炼境界)[\s\S]{100,3000}(?=(登场角色|人物介绍|角色介绍|主要角色|作品鉴赏|创作背景|\n\n\n))/i)
        if (cultivationRealmMatch && cultivationRealmMatch[0].length >= 100) {
          psSections.push('【修炼境界】\n' + cultivationRealmMatch[0].trim().substring(0, 1500))
        }
      }
      
      // 🔥 专门提取人道领域和仙道领域（完美世界特有格式）
      if (psSections.length === 0) {
        const humanRealmMatch = text.match(/(人道领域)[\s\S]{100,2000}(?=(仙道领域|\n\n\n))/i)
        const immortalRealmMatch = text.match(/(仙道领域)[\s\S]{100,2000}(?=(登场角色|人物介绍|角色介绍|\n\n\n))/i)
        if (humanRealmMatch && humanRealmMatch[0].length >= 100) {
          psSections.push('【人道领域】\n' + humanRealmMatch[0].trim().substring(0, 1000))
        }
        if (immortalRealmMatch && immortalRealmMatch[0].length >= 100) {
          psSections.push('【仙道领域】\n' + immortalRealmMatch[0].trim().substring(0, 1000))
        }
      }
      
      if (psSections.length > 0) {
        result.powerSystem = psSections.join('\n\n')
      }
    }
    
    // 🔥 世界观：从正文提取（四分类完整格式：时代背景、地理设定、世界规则、社会结构）
    if (!result.worldBuilding) {
      const wbSections: string[] = []
      
      // 【时代背景】
      const eraPatterns = [
        /时代背景[^。；！？]{30,}[。；！？]/i,
        /故事背景[^。；！？]{30,}[。；！？]/i,
        /背景设定[^。；！？]{30,}[。；！？]/i,
        /历史背景[^。；！？]{30,}[。；！？]/i,
        /时代设定[^。；！？]{30,}[。；！？]/i,
        /世界背景[^。；！？]{30,}[。；！？]/i,
        /(?:穿越到|重生到|来到)(?:异世|异界|古代|未来|平行世界)[^。；！？]{30,}[。；！？]/i,
        /(?:远古|上古|太古|洪荒|末世|未来|星际|修仙)[^。；！？]{30,}[。；！？]/i,
      ]
      for (const p of eraPatterns) {
        const m = text.match(p)
        if (m && m[0].length >= 30) {
          wbSections.push('【时代背景】\n' + m[0].trim().substring(0, 500))
          break
        }
      }
      
      // 【地理设定】
      const geoPatterns = [
        /地理设定[^。；！？]{30,}[。；！？]/i,
        /大陆设定[^。；！？]{30,}[。；！？]/i,
        /地域设定[^。；！？]{30,}[。；！？]/i,
        /地图设定[^。；！？]{30,}[。；！？]/i,
        /(?:大陆|世界|星球|地域|领域|位面)[^。；！？]{30,}[。；！？]/i,
        /(?:分为|划分为|坐落于|位于)[^。；！？]{30,}[。；！？]/i,
      ]
      for (const p of geoPatterns) {
        const m = text.match(p)
        if (m && m[0].length >= 30) {
          wbSections.push('【地理设定】\n' + m[0].trim().substring(0, 500))
          break
        }
      }
      
      // 【世界规则】
      const rulePatterns = [
        /世界规则[^。；！？]{30,}[。；！？]/i,
        /规则设定[^。；！？]{30,}[。；！？]/i,
        /世界法则[^。；！？]{30,}[。；！？]/i,
        /法则设定[^。；！？]{30,}[。；！？]/i,
        /(?:修炼|魔法|斗气|灵力|异能)[^。；！？]{30,}[。；！？]/i,
        /(?:等级|境界|力量)[^。；！？]{30,}[。；！？]/i,
      ]
      for (const p of rulePatterns) {
        const m = text.match(p)
        if (m && m[0].length >= 30) {
          wbSections.push('【世界规则】\n' + m[0].trim().substring(0, 500))
          break
        }
      }
      
      // 【社会结构】
      const socialPatterns = [
        /社会结构[^。；！？]{30,}[。；！？]/i,
        /势力设定[^。；！？]{30,}[。；！？]/i,
        /势力分布[^。；！？]{30,}[。；！？]/i,
        /(?:宗门|家族|帝国|联盟|公会|势力|贵族|平民)[^。；！？]{30,}[。；！？]/i,
        /(?:统治|阶级|阶层|等级制度|金字塔)[^。；！？]{30,}[。；！？]/i,
      ]
      for (const p of socialPatterns) {
        const m = text.match(p)
        if (m && m[0].length >= 30) {
          wbSections.push('【社会结构】\n' + m[0].trim().substring(0, 500))
          break
        }
      }
      
      // 兜底：从简介中提取世界观信息
      if (wbSections.length === 0 && result.synopsis) {
        const syn = result.synopsis
        if (syn.length >= 50) {
          wbSections.push('【世界背景】\n' + syn.substring(0, 500))
        }
      }
      
      if (wbSections.length > 0) {
        result.worldBuilding = wbSections.join('\n\n')
      }
    }
    
    // 🔥 写作风格：从正文提取（六维度格式：整体基调、语言特色、节奏特点、人物塑造、叙事方式、情感表达）
    if (!result.writingStyle) {
      const wsSections: string[] = []
      
      // 【整体基调】
      const tonePatterns = [
        /整体风格[^。；！？]{30,}[。；！？]/i,
        /写作风格[^。；！？]{30,}[。；！？]/i,
        /文风[^。；！？]{30,}[。；！？]/i,
        /风格特点[^。；！？]{30,}[。；！？]/i,
        /(?:热血|轻松|幽默|严肃|深沉|温馨|虐心|爽文|权谋|悬疑|恐怖)[^。；！？]{30,}[。；！？]/i,
        /(?:逆袭|成长|复仇|争霸|种田|重生|穿越)[^。；！？]{30,}[。；！？]/i,
      ]
      for (const p of tonePatterns) {
        const m = text.match(p)
        if (m && m[0].length >= 30) {
          wsSections.push('一、整体基调：' + m[0].trim().substring(0, 300))
          break
        }
      }
      
      // 【语言特色】
      const langPatterns = [
        /语言风格[^。；！？]{30,}[。；！？]/i,
        /语言特色[^。；！？]{30,}[。；！？]/i,
        /文字风格[^。；！？]{30,}[。；！？]/i,
        /文笔[^。；！？]{30,}[。；！？]/i,
        /描写[^。；！？]{30,}[。；！？]/i,
        /(?:细腻|简洁|华丽|朴实|生动|形象|传神)[^。；！？]{30,}[。；！？]/i,
        /(?:场景|画面|视觉)[^。；！？]{30,}[。；！？]/i,
      ]
      for (const p of langPatterns) {
        const m = text.match(p)
        if (m && m[0].length >= 30) {
          wsSections.push('二、语言特色：' + m[0].trim().substring(0, 300))
          break
        }
      }
      
      // 【节奏特点】
      const rhythmPatterns = [
        /节奏[^。；！？]{30,}[。；！？]/i,
        /情节节奏[^。；！？]{30,}[。；！？]/i,
        /叙事节奏[^。；！？]{30,}[。；！？]/i,
        /(?:紧凑|拖沓|明快|舒缓|跌宕|起伏)[^。；！？]{30,}[。；！？]/i,
        /(?:高潮|低谷|转折|伏笔)[^。；！？]{30,}[。；！？]/i,
      ]
      for (const p of rhythmPatterns) {
        const m = text.match(p)
        if (m && m[0].length >= 30) {
          wsSections.push('三、节奏特点：' + m[0].trim().substring(0, 300))
          break
        }
      }
      
      // 【人物塑造】
      const charPatterns = [
        /人物塑造[^。；！？]{30,}[。；！？]/i,
        /人物刻画[^。；！？]{30,}[。；！？]/i,
        /角色塑造[^。；！？]{30,}[。；！？]/i,
        /人物形象[^。；！？]{30,}[。；！？]/i,
        /(?:生动|立体|饱满|鲜明|扁平)[^。；！？]{30,}[。；！？]/i,
        /(?:性格|内心|心理)[^。；！？]{30,}[。；！？]/i,
      ]
      for (const p of charPatterns) {
        const m = text.match(p)
        if (m && m[0].length >= 30) {
          wsSections.push('四、人物塑造：' + m[0].trim().substring(0, 300))
          break
        }
      }
      
      // 【叙事方式】
      const narrPatterns = [
        /叙事方式[^。；！？]{30,}[。；！？]/i,
        /叙事手法[^。；！？]{30,}[。；！？]/i,
        /叙事结构[^。；！？]{30,}[。；！？]/i,
        /叙事视角[^。；！？]{30,}[。；！？]/i,
        /(?:第一人称|第三人称|限知|全知|上帝视角)[^。；！？]{30,}[。；！？]/i,
        /(?:倒叙|插叙|顺叙|蒙太奇|双线)[^。；！？]{30,}[。；！？]/i,
      ]
      for (const p of narrPatterns) {
        const m = text.match(p)
        if (m && m[0].length >= 30) {
          wsSections.push('五、叙事方式：' + m[0].trim().substring(0, 300))
          break
        }
      }
      
      // 【情感表达】
      const emotionPatterns = [
        /情感表达[^。；！？]{30,}[。；！？]/i,
        /情感描写[^。；！？]{30,}[。；！？]/i,
        /感情线[^。；！？]{30,}[。；！？]/i,
        /(?:感人|催泪|温馨|热血|悲壮|凄美)[^。；！？]{30,}[。；！？]/i,
        /(?:友情|爱情|亲情|兄弟情|战友情)[^。；！？]{30,}[。；！？]/i,
      ]
      for (const p of emotionPatterns) {
        const m = text.match(p)
        if (m && m[0].length >= 30) {
          wsSections.push('六、情感表达：' + m[0].trim().substring(0, 300))
          break
        }
      }
      
      if (wsSections.length >= 3) {
        result.writingStyle = wsSections.join(' ')
      }
    }
    
    // 🔥 兜底：生成六阶段主线大纲
    if (!(result as unknown as Record<string, unknown>).sixStageOutline && result.genre) {
      const sixStage = this.generateSixStageOutline(result.genre, result.totalChapters || 0, result.synopsis || '')
      if (sixStage) {
        ;(result as unknown as Record<string, unknown>).sixStageOutline = sixStage
      }
    }
    
    // 🔥 修复：将 totalWords 对象转换为字符串（接口定义要求字符串）
    if (result.totalWords && typeof result.totalWords === 'object') {
      const twObj = result.totalWords as { num?: number; str?: string }
      result.wordCountWan = Number(twObj.num) || 0
      result.totalWords = String(twObj.str || '')
    }
    
    // 置信度计算
    let confidence = this.baseConfidence
    confidence += successCount * 3 // 搜索成功的关键词越多越可信
    if (fromBaike) confidence += 15 // 百度百科数据更权威
    if (result.author && isValidChineseName(result.author)) confidence += 12
    if (result.totalChapters) confidence += 10
    if (result.totalWords) confidence += 10
    if (result.synopsis && result.synopsis.length > 80) confidence += 8
    if (result.characters.length > 0) confidence += 5
    if (result.genre) confidence += 3
    if (result.status) confidence += 3
    result.confidence = Math.min(100, confidence)
    
    // 准确性说明
    result.accuracyNote = fromBaike 
      ? '数据提取自百度百科词条，权威准确' 
      : '数据提取自百度搜索结果，经多结果交叉验证，仅供参考'
    
    return result
  }

  /**
   * 作者投票
   */
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
      // 角色类型标签（避免误识别为作者）
      '主角', '配角', '男主', '女主', '男主角', '女主角', '反派',
    ]
    
    // 🔥 使用更丰富的模式（和360搜索一致）
    const patterns = [
      { pattern: /作者[：:\s]+(?:当代|著名|知名|网络|青年|新锐|人气|畅销|实力派)?(?:作家|作者)?[：:\s]*([\u4e00-\u9fa5·]{2,5})/g, weight: 3 },
      { pattern: new RegExp(`《?${escapedName}》?[^。]{0,60}?作者[：:\\s]+([\\u4e00-\\u9fa5·]{2,5})`, 'g'), weight: 3 },
      { pattern: /由([\u4e00-\u9fa5·]{2,5})(?:所著|著|写|创作)/g, weight: 3 },
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
    
    // 通用提取作为补充（弱模式）
    const author = extractAuthorFromText(text)
    if (author && this.isValidAuthor(author, bookName, blacklist)) {
      candidates.push({ value: author, weight: 1 })
    }
    
    if (candidates.length === 0) return null
    
    // 收集所有候选名字（用于后续的前缀扩展检查）
    const allCandidateNames: string[] = []
    for (const c of candidates) {
      if (!allCandidateNames.includes(c.value)) {
        allCandidateNames.push(c.value)
      }
    }
    
    // 强模式优先：如果有强模式结果，只在强模式中投票
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
    
    const invalidPrefixes = ['第', '最', '有', '全', '本', '是', '就', '都', '还', '也', '又', '把', '被', '给', '让', '使', '从', '向', '跟', '同', '和', '与', '及', '对', '为', '以', '到', '在', '网', '游', '穿', '重', '仙', '魔', '神', '圣', '龙', '剑', '斗', '战', '一', '部', '这', '那', '此', '该', '其']
    for (const p of invalidPrefixes) {
      if (name.startsWith(p)) return false
    }
    
    const invalidSuffixes = ['的', '了', '是', '在', '和', '与', '及', '给', '让', '使', '从', '向', '跟', '同', '对', '为', '以', '到', '介', '绍', '述', '情', '节', '录', '制', '者', '所', '著', '写', '编', '创', '作', '说', '文', '章', '书', '本', '篇', '部', '集', '卷', '回', '章', '节', '页', '网', '络', '站', '吧', '坛', '群', '类', '型', '态', '代', '家']
    for (const s of invalidSuffixes) {
      if (name.endsWith(s)) return false
    }
    
    return true
  }

  /**
   * 字数投票
   */
  private voteWordCount(text: string): { str: string; num: number } | null {
    const noiseKeywords = [
      '相关搜索', '为您推荐', '相关小说', '相关人物', '热门资讯', '猜你喜欢', 
      '相关推荐', '大家还在搜', '搜索推荐', '相关问题', '更多回答', '其他类似', 
      '相似小说', '同类作品', '参考资料', '词条图册', '相关百科', '百科热词',
      'TA说', '搜索发现', '为你推荐', '相关贴吧', '相关知道', '相关文库'
    ]
    let cleanText = text
    
    const halfIdx = Math.floor(text.length * 0.4)
    for (const kw of noiseKeywords) {
      const idx = text.indexOf(kw, halfIdx)
      if (idx > 0) {
        cleanText = text.substring(0, idx)
        break
      }
    }
    
    cleanText = cleanText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s，。、；：！？""''（）【】《》·.\-]/g, ' ')
    cleanText = cleanText.replace(/\s+/g, ' ').trim()
    
    const candidates: { num: number; weight: number; source: string; context: string }[] = []
    
    const strongPatterns = [
      { pattern: /(?:字数|总字数|全文共|全书共|共计|总共|累计|约|大概|约计|约有|已有|达到|超过|突破)[^0-9]{0,10}(\d+(?:\.\d+)?)\s*万[字余多]/gi, weight: 5 },
      { pattern: /(?:字数|总字数)\s*[:：]\s*(\d+(?:\.\d+)?)\s*万[字余多]/gi, weight: 7 },
      { pattern: /(?:字数|总字数)\s*[:：]\s*(\d+(?:\.\d+)?)\s*[千kK][字余多]/gi, weight: 5, isQian: true },
      { pattern: /(?:全书|全文|整部|整本书|作品)\s*(?:字数|总字数)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*万字/gi, weight: 5 },
      { pattern: /【总字数】\s*[:：]?\s*(\d+(?:\.\d+)?)\s*万[字余多]?/gi, weight: 8 },
      { pattern: /(?:小说|本书|该书|这部小说)\s*(?:总)?字数\s*[:：]?\s*(\d+(?:\.\d+)?)\s*万[字余多]?/gi, weight: 6 },
    ]
    
    for (const { pattern, weight, isQian } of strongPatterns) {
      let m
      while ((m = pattern.exec(cleanText)) !== null) {
        let num = Number(m[1])
        if (isQian) num = num / 10
        if (isReasonableWords(num)) {
          const context = cleanText.substring(Math.max(0, m.index - 20), Math.min(cleanText.length, m.index + 30))
          candidates.push({ num, weight, source: 'strong', context })
        }
      }
    }
    
    const midPatterns = [
      { pattern: /(\d+(?:\.\d+)?)\s*万字[^。]{0,20}?(?:\d+\s*章|已完结|完本|连载|更新中|持续更新)/gi, weight: 4 },
      { pattern: /(?:已完结|完本|连载|更新中|持续更新)[^。]{0,20}?(\d+(?:\.\d+)?)\s*万字/gi, weight: 4 },
      { pattern: /(?:作者|小说|作品)[^。]{0,30}?(\d+(?:\.\d+)?)\s*万字/gi, weight: 3 },
      { pattern: /(\d+(?:\.\d+)?)\s*万字[^。]{0,30}?(?:小说|作品|本书|该书)/gi, weight: 3 },
      { pattern: /(?:起点|晋江|番茄|纵横|飞卢|塔读)[^。]{0,30}?(\d+(?:\.\d+)?)\s*万字/gi, weight: 5 },
      { pattern: /(?:上架|上架以来|连载)[^。]{0,20}?(\d+(?:\.\d+)?)\s*万字/gi, weight: 3 },
    ]
    
    for (const { pattern, weight } of midPatterns) {
      let m
      while ((m = pattern.exec(cleanText)) !== null) {
        const num = Number(m[1])
        if (isReasonableWords(num)) {
          const context = cleanText.substring(Math.max(0, m.index - 20), Math.min(cleanText.length, m.index + 30))
          candidates.push({ num, weight, source: 'mid', context })
        }
      }
    }
    
    const weakPattern = /(\d+(?:\.\d+)?)\s*万[字余多]/g
    let m
    while ((m = weakPattern.exec(cleanText)) !== null) {
      const num = Number(m[1])
      if (isReasonableWords(num)) {
        const context = cleanText.substring(Math.max(0, m.index - 40), Math.min(cleanText.length, m.index + 50))
        let bonusWeight = 1
        if (/小说|作品|全书|全文|字数|总字数|章节|连载|完结|完本|更新/.test(context)) {
          bonusWeight = 2.5
        }
        if (/起点|晋江|番茄|纵横|飞卢|塔读|平台|网站/.test(context)) {
          bonusWeight = 3
        }
        if (/作者|主角|简介|内容|故事/.test(context)) {
          bonusWeight = Math.max(bonusWeight, 1.5)
        }
        candidates.push({ num, weight: bonusWeight, source: 'weak', context })
      }
    }
    
    const qianPattern = /(\d+(?:\.\d+)?)\s*[千kK][字余多]/g
    let mq
    while ((mq = qianPattern.exec(cleanText)) !== null) {
      const num = Number(mq[1]) / 10
      if (isReasonableWords(num)) {
        const context = cleanText.substring(Math.max(0, mq.index - 30), Math.min(cleanText.length, mq.index + 50))
        if (/小说|作品|全书|全文|字数|总字数|章节|连载|完结|完本|更新/.test(context)) {
          candidates.push({ num, weight: 2, source: 'qian', context })
        }
      }
    }
    
    const yiPattern = /(\d+(?:\.\d+)?)\s*亿[字余多]/g
    let my
    while ((my = yiPattern.exec(cleanText)) !== null) {
      const num = Number(my[1]) * 10000
      if (num > 0 && num < 100000) {
        const context = cleanText.substring(Math.max(0, my.index - 30), Math.min(cleanText.length, my.index + 50))
        if (/小说|作品|全书|全文|字数|总字数|章节|连载|完结|完本|更新/.test(context)) {
          candidates.push({ num, weight: 4, source: 'yi', context })
        }
      }
    }
    
    if (candidates.length === 0) return null
    
    const filteredCandidates = candidates.filter(c => {
      if (c.num < 1 || c.num > 50000) return false
      const ctx = c.context || ''
      if (/票房|评分|阅读|点击|收藏|推荐|打赏|粉丝|月票|订阅/.test(ctx)) {
        return false
      }
      return true
    })
    
    if (filteredCandidates.length === 0) return null
    
    const bucketMap: Record<number, { totalWeight: number; nums: number[]; sources: string[]; contexts: string[] }> = {}
    for (const c of filteredCandidates) {
      const bucket = Math.round(c.num / 2) * 2
      if (!bucketMap[bucket]) {
        bucketMap[bucket] = { totalWeight: 0, nums: [], sources: [], contexts: [] }
      }
      bucketMap[bucket].totalWeight += c.weight
      bucketMap[bucket].nums.push(c.num)
      if (!bucketMap[bucket].sources.includes(c.source)) {
        bucketMap[bucket].sources.push(c.source)
      }
      if (c.context && !bucketMap[bucket].contexts.includes(c.context)) {
        bucketMap[bucket].contexts.push(c.context)
      }
    }
    
    let bestBucket = 0
    let bestWeight = 0
    let bestData: { nums: number[]; sources: string[]; totalWeight: number; contexts: string[] } | null = null
    for (const [bucket, data] of Object.entries(bucketMap)) {
      const diversityBonus = data.sources.length * 1.0
      const countBonus = Math.min(data.nums.length, 10) * 0.3
      const adjustedWeight = data.totalWeight + diversityBonus + countBonus
      if (adjustedWeight > bestWeight) {
        bestWeight = adjustedWeight
        bestBucket = Number(bucket)
        bestData = data
      }
    }
    
    if (bestBucket === 0 || !bestData) return null
    
    const bestNums = bestData.nums
    const sortedNums = [...bestNums].sort((a, b) => a - b)
    const midIndex = Math.floor(sortedNums.length / 2)
    const medianNum = sortedNums.length % 2 === 0 
      ? (sortedNums[midIndex - 1] + sortedNums[midIndex]) / 2 
      : sortedNums[midIndex]
    
    const avgNum = Math.round(medianNum * 10) / 10
    
    
    return {
      str: avgNum + '万字',
      num: avgNum,
    }
  }

  /**
   * 章节数投票
   */
  private voteChapters(text: string, totalWordsWan: number = 0): number | null {
    const noiseKeywords = [
      '相关搜索', '为您推荐', '相关小说', '相关人物', '热门资讯', '猜你喜欢', 
      '相关推荐', '大家还在搜', '搜索推荐', '相关问题', '更多回答', '其他类似', 
      '相似小说', '同类作品', '参考资料', '词条图册', '相关百科', '百科热词',
      'TA说', '搜索发现', '为你推荐', '相关贴吧', '相关知道', '相关文库'
    ]
    let cleanText = text
    const halfIdx = Math.floor(text.length * 0.4)
    for (const kw of noiseKeywords) {
      const idx = text.indexOf(kw, halfIdx)
      if (idx > 0) {
        cleanText = text.substring(0, idx)
        break
      }
    }
    
    cleanText = cleanText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s，。、；：！？""''（）【】《》·.\-第]/g, ' ')
    cleanText = cleanText.replace(/\s+/g, ' ').trim()
    
    let minChapters = 20
    let maxChapters = 15000
    if (totalWordsWan > 0) {
      const totalWords = totalWordsWan * 10000
      minChapters = Math.round(totalWords / 10000)
      maxChapters = Math.round(totalWords / 1000)
      if (minChapters < 20) minChapters = 20
      if (maxChapters > 20000) maxChapters = 20000
    }
    
    const candidates: { num: number; weight: number; source: string; context: string }[] = []
    
    const strongPatterns = [
      { pattern: /(?:共|全文|全书|总计|共计|总共|一共|累计|章节数|总章节|章数|总章节数|全文字数)[^0-9]{0,10}(\d{2,6})\s*(?:章|集|话|节|回|篇)/gi, weight: 5 },
      { pattern: /(?:章节数|总章节|章数|总章节数)\s*[:：]\s*(\d{2,6})/gi, weight: 8 },
      { pattern: /【总章节数】\s*[:：]?\s*(\d{2,6})/gi, weight: 9 },
      { pattern: /(?:最新章节|最后一章|最终章|最新更新)[^0-9]{0,15}第?\s*(\d{2,6})\s*(?:章|集|话|节|回)/gi, weight: 5 },
      { pattern: /(?:已更新|更新到|更至|连载至|更新至)[^0-9]{0,10}第?\s*(\d{2,6})\s*(?:章|集|话|节|回)/gi, weight: 5 },
      { pattern: /(?:小说|本书|该书|这部小说)\s*(?:总)?章节数\s*[:：]?\s*(\d{2,6})/gi, weight: 7 },
      { pattern: /(?:起点|晋江|番茄|纵横|飞卢|塔读)[^。]{0,30}?(\d{2,6})\s*(?:章|集|话|节|回)/gi, weight: 6 },
    ]
    
    for (const { pattern, weight } of strongPatterns) {
      let m
      while ((m = pattern.exec(cleanText)) !== null) {
        const num = Number(m[1])
        if (isReasonableChapters(num) && num >= minChapters && num <= maxChapters) {
          const context = cleanText.substring(Math.max(0, m.index - 20), Math.min(cleanText.length, m.index + 30))
          candidates.push({ num, weight, source: 'strong', context })
        }
      }
    }
    
    const midPatterns = [
      { pattern: /(\d{2,6})\s*(?:章|集|话|节|回)\s*[^0-9]{0,15}\d+(?:\.\d+)?\s*万字/gi, weight: 4 },
      { pattern: /(\d{2,6})\s*(?:章|集|话|节|回)\s*(?:已完结|完本|全本|完结|全书完|全文完)/gi, weight: 4 },
      { pattern: /(?:已完结|完本|全本|完结|全书完|全文完)[^。]{0,20}?(\d{2,6})\s*(?:章|集|话|节|回)/gi, weight: 4 },
      { pattern: /(?:小说|作品|本书|该书)[^。]{0,30}?(\d{2,6})\s*(?:章|集|话|节|回)/gi, weight: 3 },
      { pattern: /(?:上架|上架以来|连载)[^。]{0,20}?(\d{2,6})\s*(?:章|集|话|节|回)/gi, weight: 3 },
      { pattern: /目录[^。]{0,20}?(\d{2,6})\s*(?:章|集|话|节|回)/gi, weight: 5 },
    ]
    
    for (const { pattern, weight } of midPatterns) {
      let m
      while ((m = pattern.exec(cleanText)) !== null) {
        const num = Number(m[1])
        if (isReasonableChapters(num) && num >= minChapters && num <= maxChapters) {
          const context = cleanText.substring(Math.max(0, m.index - 20), Math.min(cleanText.length, m.index + 30))
          candidates.push({ num, weight, source: 'mid', context })
        }
      }
    }
    
    const weakPattern = /(\d{2,6})\s*(?:章|集|话|节|回)/g
    let m
    while ((m = weakPattern.exec(cleanText)) !== null) {
      const num = Number(m[1])
      if (isReasonableChapters(num) && num >= minChapters && num <= maxChapters) {
        const context = cleanText.substring(Math.max(0, m.index - 40), Math.min(cleanText.length, m.index + 40))
        let bonusWeight = 1
        
        if (/小说|作品|全书|全文|字数|总字数|章节|连载|完结|完本|更新|最新|最后|目录/.test(context)) {
          bonusWeight = 2.5
        }
        if (/第|共|总计|共计|总共|一共|累计|章节数|总章节|章数/.test(context)) {
          bonusWeight = 3.5
        }
        if (/起点|晋江|番茄|纵横|飞卢|塔读|平台|网站/.test(context)) {
          bonusWeight = Math.max(bonusWeight, 3)
        }
        if (/作者|主角|简介|内容|故事|正文/.test(context)) {
          bonusWeight = Math.max(bonusWeight, 1.5)
        }
        
        const yearPattern = /(?:19|20)\d{2}年/
        if (yearPattern.test(context)) {
          bonusWeight = Math.min(bonusWeight, 0.5)
        }
        
        candidates.push({ num, weight: bonusWeight, source: 'weak', context })
      }
    }
    
    const cnPattern = /第([零一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟]+)\s*(?:章|集|话|节|回)/g
    let m2
    while ((m2 = cnPattern.exec(cleanText)) !== null) {
      const num = chineseNumberToInt(m2[1])
      if (num && isReasonableChapters(num) && num >= minChapters && num <= maxChapters) {
        const context = cleanText.substring(Math.max(0, m2.index - 40), Math.min(cleanText.length, m2.index + 40))
        let weight = 3.5
        if (/最新|最后|最终|目录|更新到|连载至|已更新/.test(context)) {
          weight = 5
        }
        if (/小说|作品|全书|全文|字数|总字数|章节|连载|完结|完本/.test(context)) {
          weight = Math.max(weight, 4)
        }
        candidates.push({ num, weight, source: 'chinese', context })
      }
    }
    
    if (candidates.length === 0) return null
    
    const filteredCandidates = candidates.filter(c => {
      if (c.num < minChapters || c.num > maxChapters) return false
      const ctx = c.context || ''
      if (/票房|评分|阅读|点击|收藏|推荐|打赏|粉丝|月票|订阅/.test(ctx)) {
        return false
      }
      if (/第.*卷|卷.*章|第.*部|第.*季/.test(ctx)) {
        return c.weight >= 3
      }
      return true
    })
    
    if (filteredCandidates.length === 0) return null
    
    const bucketMap: Record<number, { totalWeight: number; nums: number[]; sources: string[]; contexts: string[] }> = {}
    for (const c of filteredCandidates) {
      const bucket = Math.round(c.num / 10) * 10
      if (!bucketMap[bucket]) {
        bucketMap[bucket] = { totalWeight: 0, nums: [], sources: [], contexts: [] }
      }
      bucketMap[bucket].totalWeight += c.weight
      bucketMap[bucket].nums.push(c.num)
      if (!bucketMap[bucket].sources.includes(c.source)) {
        bucketMap[bucket].sources.push(c.source)
      }
      if (c.context && !bucketMap[bucket].contexts.includes(c.context)) {
        bucketMap[bucket].contexts.push(c.context)
      }
    }
    
    let bestBucket = 0
    let bestWeight = 0
    let bestData: { nums: number[]; sources: string[]; totalWeight: number; contexts: string[] } | null = null
    for (const [bucket, data] of Object.entries(bucketMap)) {
      const diversityBonus = data.sources.length * 1.0
      const countBonus = Math.min(data.nums.length, 15) * 0.25
      const adjustedWeight = data.totalWeight + diversityBonus + countBonus
      if (adjustedWeight > bestWeight) {
        bestWeight = adjustedWeight
        bestBucket = Number(bucket)
        bestData = data
      }
    }
    
    if (bestBucket === 0 || !bestData) return null
    
    const bestNums = bestData.nums
    const sortedNums = [...bestNums].sort((a, b) => a - b)
    const midIndex = Math.floor(sortedNums.length / 2)
    const medianNum = sortedNums.length % 2 === 0 
      ? (sortedNums[midIndex - 1] + sortedNums[midIndex]) / 2 
      : sortedNums[midIndex]
    
    const finalNum = Math.round(medianNum)
    
    
    return finalNum
  }

  /**
   * 状态投票
   */
  private voteStatus(text: string): string | null {
    let finishedCount = 0
    let ongoingCount = 0
    
    const finishedPatterns = [/已完结/g, /完本/g, /完结/g, /全本/g, /全书完/g, /全文完/g]
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

  /**
   * 提取简介
   */
  private extractSynopsis(text: string, bookName: string, author?: string): string | null {
    const cleanText = text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
    const sentences = cleanText.split(/[。；\n!?！？]/)
    const scored: { text: string; score: number }[] = []
    
    // 网站导航/广告类关键词（这些句子直接排除）
    const navKeywords = [
      '反馈', '开始阅读', '全文免费', '在线阅读', '下载', '笔趣阁', '无弹窗',
      '最新章节', '更新', '百度', '360', '搜索', '网站', '百科', '问答', '视频',
      '首页', '登录', '注册', '关于', '联系', '版权', '隐私', '导航', '菜单',
      '更多', '下一页', '上一页', '推荐', '热门', '返回', '滚动', '点击', '跳转',
      '网站地图', 'copyright', '©', 'so.com', 'baidu.com', 'qq.com',
      '立即阅读', '加入书架', '投票推荐', '打赏', '书评区',
      '相关搜索', '为您推荐', '相关小说', '相关人物', '热门资讯',
      '用户反馈', '隐私管理', '我要举报', '意见反馈', '大家还在搜',
    ]
    
    // 简介常见开头模式
    const synopsisStartPatterns = [
      /^[【\[].*?[】\]]\s*[\u4e00-\u9fa5]/, // 【标签】开头（番茄小说风格）
      /^(?:讲述|描写|主要讲|故事讲述|小说讲述|内容简介|简介)[：:]?/,
      /^(?:主角|男主|女主)[：是叫为姓]/,
    ]
    
    for (const s of sentences) {
      const trimmed = s.trim()
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
      if (/主角|讲述|描写|故事|讲述了|描写了|主要讲|内容简介|小说以|简介|是一部|是一本|是一作/.test(trimmed)) score += 3
      
      // 题材关键词：加分
      if (/穿越|重生|修仙|玄幻|都市|系统|洪荒|仙侠|武侠|科幻|历史|军事|言情|悬疑|游戏/.test(trimmed)) score += 1
      
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
    
    return uniqueSentences.join('。') + '。'
  }

  /**
   * 提取角色（增强版：更多模式，更准确）
   */
  private extractCharacters(text: string, bookName: string) {
    const cleanText = text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
    const chars: Array<{ name: string; role: string; note: string; position?: string; description?: string }> = []
    const foundNames = new Set<string>()
    
    const isSearchNoise = (name: string): boolean => {
      const noiseWords = [
        '网页', '新闻', '网盘', '图片', '视频', '地图', '资讯', '贴吧', '知道', '百科',
        '文库', '音乐', '小说', '购物', '地图', '翻译', '学术', '更多', '相关', '推荐',
        '热点', '排行', '精选', '最新', '全部', '导航', '首页', '登录', '注册', '下载',
        '广告', '推广', '链接', '网址', '网站', '页面', '搜索', '结果', '查询', '答案',
        '问题', '话题', '讨论', '帖子', '回复', '评论', '分享', '收藏', '点赞', '转发',
        '作者', '书名', '类型', '字数', '章节', '状态', '出版社', '出版时间', '首发', '连载',
        '简介', '目录', '内容', '作品', '完结', '最新', '所获', '总推荐', '别名', '修为',
        '尊号', '流派', '资质', '魂魄', '仙窍', '出身', '特殊', '重生', '所属', '生日',
        '身高', '体重', '性别', '妻子', '丈夫', '儿子', '女儿', '父亲', '母亲', '爷爷',
        '奶奶', '哥哥', '姐姐', '弟弟', '妹妹', '主人', '少女', '少年', '青年', '中年',
        '老年', '小孩', '婴儿', '配角', '反派', '主角', '男主', '女主', '龙套', '路人',
        '待补充', '暂无', '未知', '参考', '资料', '附录', '后记', '前言', '序言', '序章',
        '引子', '楔子', '起点', '纵横', '创世', '17K', '番茄', '飞卢', '晋江', '红袖',
        '潇湘', 'QQ', '掌阅', '书旗', '咪咕', '百度', '起点中文网', '纵横中文网', '创世中文网',
        '17K小说网', '番茄小说', '飞卢小说', '晋江文学城', '红袖添香', '潇湘书院', 'QQ阅读',
        '掌阅', '书旗小说', '咪咕阅读', '百度贴吧', '百度百科',
        '创作', '年创作', '月创作', '日创作', '创作于', '开始创作', '完成创作',
        '首发于', '发表于', '发布于', '连载于', '更新于', '出版于',
        '地理设定', '修炼设定', '世界设定', '人物设定', '角色设定',
        '背景设定', '故事设定', '世界观', '力量体系', '等级设定',
        '创作时间', '创作年代', '连载时间', '完结时间', '更新时间',
        '字数统计', '章节统计', '点击统计', '收藏统计', '推荐统计',
        '作者简介', '作者资料', '作者信息', '作者主页', '作者博客',
        '小说简介', '小说目录', '小说正文', '小说封面', '小说类型',
        '小说状态', '小说字数', '小说章节', '小说标签', '小说推荐',
        '内容简介', '作品简介', '作品目录', '作品类型', '作品状态',
        '全文阅读', '免费阅读', '在线阅读', 'VIP阅读', '付费阅读',
        '章节列表', '章节更新', '最新章节', '第一章节', '最后章节',
        '卷一', '卷二', '卷三', '卷四', '卷五', '第一篇', '第二篇', '第三篇',
        '第一章', '第二章', '第三章', '第四章', '第五章', '第一回', '第二回',
        '第一部', '第二部', '第三部', '第四部', '第五部', '第一册', '第二册',
        '第一季', '第二季', '第三季', '第四季', '第五季', '第一版', '第二版',
        '第一期', '第二期', '第三期', '第四期', '第五期', '第一届', '第二届',
        '第一级', '第二级', '第三级', '第四级', '第五级', '第一班', '第二班',
        '第一系', '第二系', '第三系', '第四系', '第五系', '第一校', '第二校',
        '第一院', '第二院', '第三院', '第四院', '第五院', '第一局', '第二局',
        '第一厅', '第二厅', '第三厅', '第四厅', '第五厅', '第一部', '第二部',
        '第一委', '第二委', '第三委', '第四委', '第五委', '第一办', '第二办',
        '第一社', '第二社', '第三社', '第四社', '第五社', '第一会', '第二会',
        '第一党', '第二党', '第三党', '第四党', '第五党', '第一派', '第二派',
        '第一族', '第二族', '第三族', '第四族', '第五族', '第一帮', '第二帮',
        '第一教', '第二教', '第三教', '第四教', '第五教', '第一宗', '第二宗',
        '第一门', '第二门', '第三门', '第四门', '第五门', '第一盟', '第二盟',
        '第一联', '第二联', '第三联', '第四联', '第五联', '第一团', '第二团',
        '第一队', '第二队', '第三队', '第四队', '第五队', '第一组', '第二组',
        '第一网', '第二网', '第三网', '第四网', '第五网', '第一站', '第二站',
        '第一页', '第二页', '第三页', '第四页', '第五页', '第一圈', '第二圈',
        '第一群', '第二群', '第三群', '第四群', '第五群',
      ]
      if (noiseWords.includes(name)) return true
      const noiseSuffixes = [
        '网', '站', '页', '版', '号', '吧', '圈', '群', '社', '会', '党', '派', '族',
        '帮', '教', '宗', '门', '盟', '联', '团', '队', '组', '部', '厅', '局',
        '委', '办', '院', '校', '学', '系', '班', '级', '届', '期', '卷', '册', '集',
        '篇', '章', '节', '回', '话', '幕', '场', '季', '本', '型',
        '式', '种', '类', '别', '级', '阶', '段', '代', '世', '纪',
      ]
      for (const suffix of noiseSuffixes) {
        if (name.endsWith(suffix) && name.length <= 4) return true
      }
      return false
    }
    
    // 更多角色提取模式：从各种表述中提取角色名
    const patterns = [
      { pattern: /主角[是叫为姓\s]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '主角', position: '男主角', weight: 5 },
      { pattern: /主角\s+([\u4e00-\u9fa5·]{2,4})/g, role: '主角', position: '男主角', weight: 5 },
      { pattern: /主角：\s*([\u4e00-\u9fa5·]{2,4})/g, role: '主角', position: '男主角', weight: 5 },
      { pattern: /主角:\s*([\u4e00-\u9fa5·]{2,4})/g, role: '主角', position: '男主角', weight: 5 },
      { pattern: /男主[是叫为姓\s]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '主角', position: '男主角', weight: 4 },
      { pattern: /男主角[是叫为姓\s]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '主角', position: '男主角', weight: 5 },
      { pattern: /女主角?[是叫为姓\s]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '女主', position: '女主角', weight: 5 },
      { pattern: /女主[是叫为姓\s]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '女主', position: '女主角', weight: 4 },
      { pattern: /([\u4e00-\u9fa5·]{2,4})\s*饰演主角/g, role: '主角', position: '男主角', weight: 2 },
      { pattern: /([\u4e00-\u9fa5·]{2,4})\s*扮演主角/g, role: '主角', position: '男主角', weight: 2 },
      { pattern: /(?:师父|师傅)[是叫为\s]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '导师', position: '师父', weight: 3 },
      { pattern: /([\u4e00-\u9fa5·]{2,4})(?:是|作为)(?:主角的)?(?:师父|师傅)/g, role: '导师', position: '师父', weight: 3 },
      { pattern: /(?:大反派|最终BOSS|最终boss|最大反派)[是叫为\s]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '反派', position: '反派', weight: 3 },
      { pattern: /(?:主角的)?(?:好兄弟|挚友|好友|死党)[是叫为\s]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '挚友', position: '伙伴', weight: 2 },
      { pattern: /(?:妻子|恋人|女友|道侣|爱人|未婚妻|伴侣|红颜知己)[是叫为\s]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '女主', position: '女主角', weight: 4 },
      { pattern: /(?:儿子|女儿|父亲|母亲|哥哥|弟弟|姐姐|妹妹)[是叫为\s]\s*([\u4e00-\u9fa5·]{2,4})/g, role: '配角', position: '家人', weight: 2 },
      { pattern: /^([\u4e00-\u9fa5·]{2,4})[：:]\s*(.+)$/gm, role: '配角', position: '配角', weight: 4 },
      { pattern: /【([\u4e00-\u9fa5·]{2,4})】\s*(.+)$/gm, role: '配角', position: '配角', weight: 4 },
      { pattern: /《([\u4e00-\u9fa5·]{2,4})》\s*(.+)$/gm, role: '配角', position: '配角', weight: 4 },
      { pattern: /\(([\u4e00-\u9fa5·]{2,4})\)\s*(.+)$/gm, role: '配角', position: '配角', weight: 4 },
      { pattern: /（([\u4e00-\u9fa5·]{2,4})）\s*(.+)$/gm, role: '配角', position: '配角', weight: 4 },
      { pattern: /【主角】\s*([\u4e00-\u9fa5·]{2,4})/g, role: '主角', position: '男主角', weight: 5 },
      { pattern: /【女主】\s*([\u4e00-\u9fa5·]{2,4})/g, role: '女主', position: '女主角', weight: 5 },
      { pattern: /\*([\u4e00-\u9fa5·]{2,4})\*/g, role: '配角', position: '配角', weight: 3 },
    ]
    
    const voteMap: Record<string, { role: string; position: string; weight: number; desc: string; description: string }> = {}
    
    for (const { pattern, role, position, weight } of patterns) {
      let match
      while ((match = pattern.exec(cleanText)) !== null) {
        const name = match[1].trim()
        if (name && name.length >= 2 && name.length <= 10 && isValidChineseName(name) && name !== bookName && !isSearchNoise(name)) {
          if (!voteMap[name]) {
            voteMap[name] = { role, position, weight: 0, desc: '', description: '' }
          }
          voteMap[name].weight += weight
          // 女主优先级最高
          if (role === '女主') {
            voteMap[name].role = '女主'
            voteMap[name].position = '女主角'
          }
          // 主角优先级最高
          if (role === '主角' && voteMap[name].role !== '女主') {
            voteMap[name].role = '主角'
            voteMap[name].position = '男主角'
          }
        }
      }
    }
    
    // 从简介中提取角色名和描述（当没有明确的角色列表时）
    const synopsisPatterns = [
      new RegExp(`(${escapeRegExp(bookName)}[^。；！？]{20,}[。；！？])`, 'i'),
      /故事讲述的?是[^。；！？]{20,}[。；！？]/i,
      /主要讲述[^。；！？]{20,}[。；！？]/i,
      /内容简介[^。；！？]{20,}[。；！？]/i,
    ]
    let synopsisText = ''
    for (const p of synopsisPatterns) {
      const m = cleanText.match(p)
      if (m && m[0].length >= 30 && m[0].length <= 800) {
        synopsisText = m[0].trim()
        break
      }
    }
    
    if (synopsisText) {
      const namePatterns = [
        /([\u4e00-\u9fa5·]{2,10})[，,、与和及跟同]/g,
        /([\u4e00-\u9fa5·]{2,10})[\s是为成为]/g,
        /([\u4e00-\u9fa5·]{2,10})[的之][^。；！？]{0,20}/g,
      ]
      for (const pattern of namePatterns) {
        let match
        while ((match = pattern.exec(synopsisText)) !== null) {
          const name = match[1].trim()
          if (name && name.length >= 2 && name.length <= 10 && isValidChineseName(name) && name !== bookName && !name.includes('小说') && !name.includes('主角') && !name.includes('女主') && !isSearchNoise(name)) {
            if (!voteMap[name]) {
              voteMap[name] = { role: '配角', position: '配角', weight: 2, desc: '', description: '' }
            }
            voteMap[name].weight += 1
          }
        }
      }
    }
    
    // 第二阶段：从"角色介绍/人物介绍/登场角色"段落提取更多角色（百度百科常见格式）
    // 找包含"人物介绍"、"角色介绍"、"登场角色"等标题后的段落
    const charSectionHeaders = ['登场角色', '人物介绍', '角色介绍', '主要角色', '主要人物', '人物形象', '角色设定', '人物设定']
    
    // 在全文中找这些标题，然后提取后面的角色列表
    for (const header of charSectionHeaders) {
      // 找标题位置
      const headerIndex = cleanText.indexOf(header)
      if (headerIndex === -1) continue
      
      // 取标题后的 3000 个字符（增加提取范围）
      const sectionStart = headerIndex + header.length
      const sectionEnd = Math.min(sectionStart + 3000, cleanText.length)
      const sectionText = cleanText.substring(sectionStart, sectionEnd)
      
      // 百度百科角色介绍的常见格式：
      // 夏颉：男主角，前世是中国顶级特工...
      // 旒歆：女主角，日宗九大巫殿之一的黎巫。
      
      // 逐行扫描，找"名字：描述"的模式
      const lines = sectionText.split(/\n+/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.length < 5) continue
        
        // 模式1："姓名：描述"（最常见）
        const nameDescMatch = trimmed.match(/^([\u4e00-\u9fa5·]{2,12})[：:]\s*(.+)$/)
        if (nameDescMatch) {
          const name = nameDescMatch[1].trim()
          const desc = nameDescMatch[2].trim()
          
          if (name && name.length >= 2 && name.length <= 12 && isValidChineseName(name) && name !== bookName && desc.length > 3) {
            let role = '配角'
            let position = '配角'
            let weight = 3
            
            // 从描述中判断角色定位（支持组合定位）
            const positions: string[] = []
            if (/男主角|主角/.test(desc)) {
              role = '主角'
              positions.push('男主角')
              weight = 10
            } else if (/女主角|女主/.test(desc)) {
              role = '女主'
              positions.push('女主角')
              weight = 10
            }
            if (/戒灵|器灵|灵魂/.test(desc)) {
              positions.push('盘龙之戒魂灵')
              weight += 3
            }
            if (/师父|师傅|导师|指引|传授|教导/.test(desc)) {
              positions.push('导师')
              weight += 2
            }
            if (/父亲|母亲|哥哥|弟弟|姐姐|妹妹|家人|亲人/.test(desc)) {
              positions.push('家人')
              weight += 2
            }
            if (/朋友|兄弟|好友|挚友|伙伴|兄弟情深/.test(desc)) {
              positions.push('伙伴')
              weight += 2
            }
            if (/反派|敌人|对手|BOSS|boss|邪恶/.test(desc)) {
              positions.push('反派')
              weight += 2
            }
            if (/师长|校长|院长|教官|老师/.test(desc)) {
              positions.push('老师')
              weight += 2
            }
            if (/妻子|丈夫|伴侣|爱人/.test(desc)) {
              positions.push('伴侣')
              weight += 3
            }
            if (/噬神鼠/.test(desc)) {
              positions.push('噬神鼠、林雷平等契约魔兽')
              weight += 3
            } else if (/魔兽|魔宠|契约/.test(desc)) {
              positions.push('魔兽')
              weight += 2
            }
            if (/鸿蒙/.test(desc)) {
              positions.push('一级鸿蒙掌控者')
              weight += 3
            } else if (/掌控者|至高神|造物主/.test(desc)) {
              positions.push('鸿蒙掌控者')
              weight += 3
            }
            
            // 🔥 提取更详细的角色定位描述（从描述中提取身份相关短语）
            // 匹配格式如："仙古纪元的祖祭灵，仙王巨头"、"月婵的次身，青月真仙的涅槃身"
            const detailedPosition = ''
            const posPatterns = [
              /([\u4e00-\u9fa5]{2,8}[的之]?[\u4e00-\u9fa5]{2,12}[\u4e00-\u9fa5]{0,8})[，,、]/g,
              /([\u4e00-\u9fa5]{2,8}[的之]?[\u4e00-\u9fa5]{2,12})$/g,
              /(祖祭灵|仙王巨头|真仙|涅槃身|次身|分身|化身|宿体|后裔|传承者|守护者|引路人|创始人|始祖|老祖)/g,
            ]
            for (let _pi = 0; _pi < posPatterns.length; _pi++) {
              const _posMatch = desc.match(posPatterns[_pi])
              if (_posMatch) {
                for (let _mi = 0; _mi < _posMatch.length; _mi++) {
                  const _match = _posMatch[_mi].replace(/[，,、]$/, '').trim()
                  if (_match.length >= 4 && _match.length <= 20 && !positions.includes(_match)) {
                    positions.push(_match)
                    break
                  }
                }
              }
            }
            
            position = positions.length > 0 ? positions.join('、') : '配角'
            
            this.mergeCharVote(voteMap, name, role, position, weight, desc)
          }
          continue
        }        
        // 模式2：表格格式（角色\t介绍）
        const tableMatch = trimmed.match(/^([\u4e00-\u9fa5·]{2,12})\t+(.+)$/)
        if (tableMatch) {
          const name = tableMatch[1].trim()
          const desc = tableMatch[2].trim()
          
          if (name && name.length >= 2 && name.length <= 12 && isValidChineseName(name) && name !== bookName && desc.length > 3) {
            let role = '配角'
            let position = '配角'
            let weight = 3
            
            const positions: string[] = []
            if (/男主角|主角/.test(desc)) {
              role = '主角'
              positions.push('男主角')
              weight = 10
            } else if (/女主角|女主/.test(desc)) {
              role = '女主'
              positions.push('女主角')
              weight = 10
            }
            if (/师父|师傅|导师|指引|传授|教导/.test(desc)) {
              positions.push('导师')
              weight += 2
            }
            if (/父亲|母亲|哥哥|弟弟|姐姐|妹妹|家人|亲人/.test(desc)) {
              positions.push('家人')
              weight += 2
            }
            if (/朋友|兄弟|好友|挚友|伙伴/.test(desc)) {
              positions.push('伙伴')
              weight += 2
            }
            if (/反派|敌人|对手|BOSS|boss|邪恶/.test(desc)) {
              positions.push('反派')
              weight += 2
            }
            if (/妻子|丈夫|伴侣|爱人/.test(desc)) {
              positions.push('伴侣')
              weight += 3
            }
            position = positions.length > 0 ? positions.join('、') : '配角'
            
            this.mergeCharVote(voteMap, name, role, position, weight, desc)
          }
        }
      }
      
      // 如果已经提取到至少5个角色，就不用再找其他标题了
      const charCount = Object.keys(voteMap).filter(k => voteMap[k].weight >= 2).length
      if (charCount >= 5) break
    }
    
    // 第三阶段：补充角色定位信息（从全文中查找角色相关描述）
    for (const [name, data] of Object.entries(voteMap)) {
      if (!data.position || data.position === '配角') {
        const positionInfo = this.extractPositionFromText(name, cleanText)
        if (positionInfo && positionInfo.length > 0) {
          if (data.position && data.position !== '配角') {
            data.position = positionInfo + '、' + data.position
          } else {
            data.position = positionInfo
          }
        }
      }
    }
    
    const sorted = Object.entries(voteMap)
      .filter(([, data]) => data.weight >= 2)
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 8)
    
    for (const [name, data] of sorted) {
      foundNames.add(name)
      chars.push({ 
        name, 
        role: data.role, 
        position: data.position || this.inferPosition(data.role, name),
        note: data.desc || '百度搜索提取' 
      })
    }
    
    // 确保主角和女主有正确的定位
    const protagonist = chars.find(c => c.role === '主角')
    if (protagonist && (!protagonist.position || protagonist.position === '配角')) {
      protagonist.position = '男主角'
    }
    
    const femaleLead = chars.find(c => c.role === '女主')
    if (femaleLead && (!femaleLead.position || femaleLead.position === '配角')) {
      femaleLead.position = '女主角'
    }
    
    return chars
  }

  /**
   * 角色投票条目合并（extractCharacters 模式1/模式2 共用）
   */
  private mergeCharVote(
    voteMap: Record<string, { role: string; position: string; weight: number; desc: string; description: string }>,
    name: string, role: string, position: string, weight: number, desc: string
  ): void {
    if (!voteMap[name]) {
      voteMap[name] = { role, position, weight, desc: desc.substring(0, 300), description: desc.substring(0, 300) }
    } else {
      voteMap[name].weight += weight
      if (role === '主角' || role === '女主') {
        voteMap[name].role = role
        voteMap[name].position = position
      }
      if (!voteMap[name].desc || voteMap[name].desc.length < desc.length) {
        voteMap[name].desc = desc.substring(0, 300)
      }
    }
  }

  /**
   * 从全文中提取角色定位信息
   */
  private extractPositionFromText(name: string, text: string): string {
    const patterns = [
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(戒灵|器灵|灵魂|残魂|神识)`, 'gi'), label: '器灵' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(师父|师傅|导师|指引|传授|教导|启蒙|领路人)`, 'gi'), label: '导师' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(父亲|母亲|父亲|母亲|哥哥|弟弟|姐姐|妹妹|祖父|祖母|外祖父|外祖母|养父|养母)`, 'gi'), label: '家人' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(兄弟|兄弟情|生死兄弟|挚友|至交|结拜)`, 'gi'), label: '生死兄弟' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(妻子|丈夫|伴侣|恋人|红颜|挚爱)`, 'gi'), label: '伴侣' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(反派|敌人|对手|宿敌|BOSS|boss|邪恶|黑暗|魔头)`, 'gi'), label: '反派' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(魔兽|魔宠|契约兽|召唤兽|灵兽|妖兽)`, 'gi'), label: '魔兽' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(师尊|师父|老师|教授|院长|校长|门主|宗主|掌门)`, 'gi'), label: '师长' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(圣女|公主|郡主|女王|女帝)`, 'gi'), label: '公主' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(城主|领主|帝王|皇帝|君主|盟主)`, 'gi'), label: '统治者' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(神医|毒医|药师|炼药师|炼丹师)`, 'gi'), label: '药师' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(盗贼|刺客|杀手|佣兵|侠客)`, 'gi'), label: '侠客' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(天才|妖孽|神童|怪才)`, 'gi'), label: '天才' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(废柴|废物|落魄|被贬|流放)`, 'gi'), label: '废柴' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(转世|重生|穿越|轮回)`, 'gi'), label: '转世者' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(神器|法宝|传承|血脉|体质|武魂)`, 'gi'), label: '特殊体质' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(盟主|会长|团长|帮主|老大)`, 'gi'), label: '首领' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(卧底|间谍|特工|杀手)`, 'gi'), label: '特工' },
      { pattern: new RegExp(`${name}[，,][^。！？]{0,50}(傀儡|人偶|分身|化身)`, 'gi'), label: '分身' },
    ]
    
    const positions: string[] = []
    for (const { pattern, label } of patterns) {
      const match = text.match(pattern)
      if (match) {
        positions.push(label)
      }
    }
    
    return positions.join('、')
  }
  
  /**
   * 根据角色类型推断定位（兜底）
   */
  private inferPosition(role: string, name: string): string {
    if (role === '主角') return '男主角'
    if (role === '女主') return '女主角'
    if (role === '师父' || role === '导师') return '导师'
    if (role === '反派') return '反派'
    if (role === '朋友' || role === '兄弟') return '伙伴'
    if (role === '家人') return '家人'
    return '配角'
  }

  /**
   * 生成六阶段主线大纲（基于类型和章节数推断通用网文结构）
   */
  private generateSixStageOutline(genre: string, totalChapters: number, synopsis: string): Record<string, unknown> | null {
    const stageKeys = ['stage1MortalRise', 'stage2ContinentalPeak', 'stage3GodEntry', 'stage4SupremePlane', 'stage5GodClash', 'stage6Transcendence']
    const stageLabels = ['起步与成长', '崭露头角', '跨越升级', '高层历练', '终极对决', '结局升华']
    const result: Record<string, unknown> = {}
    
    let extractedStages: string[] = []
    
    // 策略1：从简介中提取（如果简介足够详细）
    if (synopsis && synopsis.length >= 80) {
      extractedStages = this.extractStagesFromSynopsis(synopsis, genre)
    }
    
    // 策略2：如果提取不足3个阶段，使用类型模板生成
    const validCount = extractedStages.filter(s => s).length
    if (validCount < 3) {
      extractedStages = this.generateStagesByGenre(genre, totalChapters, synopsis)
    }
    
    // 策略3：兜底，使用通用网文结构
    if (extractedStages.filter(s => s).length < 3) {
      extractedStages = this.generateGenericStages(totalChapters, synopsis)
    }
    
    for (let i = 0; i < 6; i++) {
      if (extractedStages[i]) {
        result[stageKeys[i]] = stageLabels[i] + '：' + extractedStages[i]
      }
    }
    
    result._meta = {
      source: validCount >= 3 ? 'synopsis_extraction' : 'genre_template',
      validStages: extractedStages.filter(s => s).length,
    }
    
    return result
  }
  
  /**
   * 从简介中提取六阶段大纲
   */
  private extractStagesFromSynopsis(synopsis: string, genre: string): string[] {
    const sentences = synopsis.split(/[。！？!?；;]/).filter(s => s.trim().length >= 5)
    if (sentences.length < 3) return []
    
    const stages: string[] = ['', '', '', '', '', '']
    const usedSentences = new Set<number>()
    const allKeywords = this.getStageKeywordsByGenre(genre)
    const stageLabels = ['起步与成长', '崭露头角', '跨越升级', '高层历练', '终极对决', '结局升华']
    
    for (let stageIdx = 0; stageIdx < 6; stageIdx++) {
      let bestSentence = ''
      let bestScore = 0
      let bestIdx = -1
      
      for (let i = 0; i < sentences.length; i++) {
        if (usedSentences.has(i)) continue
        
        const s = sentences[i].trim()
        let score = 0
        
        for (const kw of allKeywords[stageIdx]) {
          if (s.includes(kw)) score += 2
        }
        
        const positionScore = 1 - Math.abs(i / (sentences.length - 1) - stageIdx / 5)
        score += positionScore * 3
        
        if (s.length > 15 && s.length < 100) score += 1
        
        if (score > bestScore) {
          bestScore = score
          bestSentence = s
          bestIdx = i
        }
      }
      
      if (bestSentence && bestScore > 1.5) {
        stages[stageIdx] = bestSentence
        usedSentences.add(bestIdx)
      }
    }
    
    return stages
  }
  
  /**
   * 根据小说类型生成六阶段大纲模板
   */
  private generateStagesByGenre(genre: string, totalChapters: number, synopsis: string): string[] {
    const stages: string[] = ['', '', '', '', '', '']
    const chapterParts = totalChapters > 0 ? [
      Math.round(totalChapters * 0.15),
      Math.round(totalChapters * 0.2),
      Math.round(totalChapters * 0.2),
      Math.round(totalChapters * 0.2),
      Math.round(totalChapters * 0.15),
      Math.round(totalChapters * 0.1),
    ] : [0, 0, 0, 0, 0, 0]
    
    if (/玄幻|东方玄幻/.test(genre)) {
      stages[0] = this.fillStageTemplate('获得金手指/觉醒天赋，踏上修炼之路', synopsis, ['废柴', '天才', '觉醒', '获得', '重生', '穿越'])
      stages[1] = this.fillStageTemplate('进入宗门/学院，崭露头角，初遇女主', synopsis, ['宗门', '学院', '崭露头角', '成名', '初遇'])
      stages[2] = this.fillStageTemplate('遭遇危机/家族变故，外出历练，实力突破', synopsis, ['危机', '变故', '历练', '突破', '复仇'])
      stages[3] = this.fillStageTemplate('闯荡大陆核心区域，组建势力，挑战各大宗门', synopsis, ['大陆', '核心', '势力', '挑战', '称霸'])
      stages[4] = this.fillStageTemplate('对抗最终反派，揭开惊天秘密，爆发巅峰大战', synopsis, ['反派', '秘密', '大战', '对决'])
      stages[5] = this.fillStageTemplate('突破至最高境界，成就传奇，圆满结局', synopsis, ['突破', '巅峰', '传奇', '圆满', '成帝'])
    } else if (/仙侠|修真/.test(genre)) {
      stages[0] = this.fillStageTemplate('踏入修仙界，开启修炼之路，初入宗门', synopsis, ['修仙', '宗门', '入门', '拜师', '炼气'])
      stages[1] = this.fillStageTemplate('宗门大比，崭露头角，结识红颜', synopsis, ['大比', '崭露头角', '结识', '红颜'])
      stages[2] = this.fillStageTemplate('秘境探险，遭遇追杀，实力突破至元婴/化神', synopsis, ['秘境', '追杀', '突破', '元婴', '化神'])
      stages[3] = this.fillStageTemplate('闯荡仙域，建立势力，对抗正邪势力', synopsis, ['仙域', '势力', '正邪', '对抗'])
      stages[4] = this.fillStageTemplate('渡劫飞升，揭开天道秘密，终极对决', synopsis, ['渡劫', '飞升', '天道', '对决'])
      stages[5] = this.fillStageTemplate('成就仙尊/仙帝，超脱轮回，永恒不朽', synopsis, ['仙尊', '仙帝', '超脱', '永恒'])
    } else if (/奇幻|剑与魔法/.test(genre)) {
      stages[0] = this.fillStageTemplate('获得神秘传承/魔法天赋，进入魔法学院', synopsis, ['魔法', '传承', '天赋', '学院'])
      stages[1] = this.fillStageTemplate('魔法学院历练，崭露头角，初遇女主', synopsis, ['学院', '历练', '崭露头角', '初遇'])
      stages[2] = this.fillStageTemplate('外出冒险，发现家族秘密，实力突破至圣域', synopsis, ['冒险', '秘密', '突破', '圣域'])
      stages[3] = this.fillStageTemplate('闯荡各大帝国，建立势力，对抗教廷/黑暗势力', synopsis, ['帝国', '势力', '教廷', '黑暗'])
      stages[4] = this.fillStageTemplate('进入神界/地狱，揭开宇宙秘密，最终对决', synopsis, ['神界', '地狱', '宇宙', '对决'])
      stages[5] = this.fillStageTemplate('突破至高境界，成就传说，超越神级', synopsis, ['突破', '至高', '传说', '超越'])
    } else if (/都市|都市异能/.test(genre)) {
      stages[0] = this.fillStageTemplate('获得系统/异能/重生，开启都市逆袭', synopsis, ['系统', '异能', '重生', '逆袭'])
      stages[1] = this.fillStageTemplate('崭露头角，建立事业，结识红颜', synopsis, ['事业', '红颜', '崭露头角'])
      stages[2] = this.fillStageTemplate('遭遇危机，实力提升，建立商业帝国', synopsis, ['危机', '提升', '商业帝国'])
      stages[3] = this.fillStageTemplate('称霸一方，对抗各方势力，展露顶尖实力', synopsis, ['称霸', '势力', '顶尖'])
      stages[4] = this.fillStageTemplate('对抗终极反派，揭开惊天秘密，巅峰对决', synopsis, ['反派', '秘密', '对决'])
      stages[5] = this.fillStageTemplate('成就人生巅峰，建立传奇，圆满结局', synopsis, ['巅峰', '传奇', '圆满'])
    } else if (/历史|架空历史/.test(genre)) {
      stages[0] = this.fillStageTemplate('穿越/重生至古代，开启争霸之路', synopsis, ['穿越', '重生', '古代', '争霸'])
      stages[1] = this.fillStageTemplate('崭露头角，初掌权力，结识红颜', synopsis, ['权力', '红颜', '崭露头角'])
      stages[2] = this.fillStageTemplate('征战四方，扩张势力，遭遇强敌', synopsis, ['征战', '扩张', '强敌'])
      stages[3] = this.fillStageTemplate('称霸一方，建立基业，对抗各大势力', synopsis, ['称霸', '基业', '势力'])
      stages[4] = this.fillStageTemplate('统一全国/天下，终极对决，开创盛世', synopsis, ['统一', '天下', '盛世'])
      stages[5] = this.fillStageTemplate('成就千古一帝，名垂青史，永恒传说', synopsis, ['千古一帝', '传说', '永恒'])
    } else if (/悬疑|推理/.test(genre)) {
      stages[0] = this.fillStageTemplate('遭遇离奇案件，开始调查，发现疑点', synopsis, ['案件', '调查', '疑点'])
      stages[1] = this.fillStageTemplate('深入调查，结识伙伴，发现线索', synopsis, ['调查', '伙伴', '线索'])
      stages[2] = this.fillStageTemplate('遭遇危险，深入虎穴，接近真相', synopsis, ['危险', '虎穴', '真相'])
      stages[3] = this.fillStageTemplate('揭开层层迷雾，发现更大阴谋', synopsis, ['迷雾', '阴谋'])
      stages[4] = this.fillStageTemplate('与凶手终极对决，揭开最终真相', synopsis, ['对决', '真相'])
      stages[5] = this.fillStageTemplate('案件告破，正义伸张，留下悬念', synopsis, ['告破', '正义', '悬念'])
    } else {
      return this.generateGenericStages(totalChapters, synopsis)
    }
    
    return stages
  }
  
  /**
   * 生成通用六阶段大纲（兜底方案）
   */
  private generateGenericStages(totalChapters: number, synopsis: string): string[] {
    const stages: string[] = ['', '', '', '', '', '']
    
    stages[0] = this.fillStageTemplate('获得机遇/觉醒天赋，踏上成长之路', synopsis, ['获得', '觉醒', '踏上', '开始'])
    stages[1] = this.fillStageTemplate('进入新环境，崭露头角，结识关键人物', synopsis, ['进入', '崭露头角', '结识'])
    stages[2] = this.fillStageTemplate('遭遇挑战/危机，实力突破，开启新篇章', synopsis, ['挑战', '危机', '突破', '新篇章'])
    stages[3] = this.fillStageTemplate('闯荡更大舞台，建立势力，挑战强者', synopsis, ['闯荡', '势力', '挑战', '强者'])
    stages[4] = this.fillStageTemplate('对抗最终反派，揭开秘密，终极对决', synopsis, ['反派', '秘密', '对决', '终极'])
    stages[5] = this.fillStageTemplate('突破至巅峰，成就传奇，圆满结局', synopsis, ['突破', '巅峰', '传奇', '圆满'])
    
    return stages
  }
  
  /**
   * 填充阶段模板，从简介中提取真实内容替换模板
   */
  private fillStageTemplate(template: string, synopsis: string, keywords: string[]): string {
    if (!synopsis || synopsis.length < 30) return template
    
    for (const kw of keywords) {
      const pattern = new RegExp(`(${kw}[^。！？；;]{10,50})`, 'i')
      const match = synopsis.match(pattern)
      if (match && match[1]) {
        const extracted = match[1].trim()
        if (extracted.length >= 10 && extracted.length <= 80) {
          return extracted
        }
      }
    }
    
    return template
  }
  
  private fillStageTemplateEnhanced(template: string, synopsis: string, keywords: string[], additionalText: string = ''): string {
    const result = this.fillStageTemplate(template, synopsis, keywords)
    if (result !== template) return result
    
    if (additionalText && additionalText.length >= 30) {
      for (const kw of keywords) {
        const pattern = new RegExp(`(${kw}[^。！？；;]{10,50})`, 'i')
        const match = additionalText.match(pattern)
        if (match && match[1]) {
          const extracted = match[1].trim()
          if (extracted.length >= 10 && extracted.length <= 80) {
            return extracted
          }
        }
      }
    }
    
    return template
  }
  
  /**
   * 根据小说类型获取六阶段关键词
   */
  private getStageKeywordsByGenre(genre: string): string[][] {
    let startKeywords = ['出身', '生于', '出生', '少年', '幼时', '早年', '原本', '本来', '一开始', '起初', '偶然', '意外', '获得', '得到', '踏上', '觉醒', '重生', '穿越', '回到', '降临', '转世', '魂穿', '附体', '重生在', '穿越到']
    let riseKeywords = ['成长', '修炼', '进步', '提升', '变强', '崭露头角', '出名', '成名', '崛起', '修炼有成', '初露锋芒', '锋芒毕露', '名声大振', '一鸣惊人', '一战成名', '名震', '扬名', '崛起于']
    let midKeywords = ['进入', '前往', '来到', '卷入', '参与', '经历', '遭遇', '面对', '挑战', '踏入', '进入', '加入', '投身', '闯荡', '游历', '探险', '探秘', '寻找', '追寻']
    let highKeywords = ['成为', '达到', '突破', '晋升', '一方', '顶尖', '顶级', '巅峰', '称霸', '称雄', '无敌', '至尊', '至强', '巅峰', '突破极限', '超越极限', '达到巅峰', '成为最强', '登顶']
    let climaxKeywords = ['决战', '大战', '对决', '最终', '终极', '最后', '终局', '终结', '最终之战', '终极对决', '最终决战', '巅峰对决', '生死之战', '最终BOSS', '终极BOSS']
    let endKeywords = ['结局', '最后', '最终', '终', '结束', '完美', '圆满', '归隐', '逍遥', '传说', '永恒', '不朽', '超脱', '飞升', '成仙', '成神', '成帝', '超越', '圆满结局', '功德圆满']
    
    if (/玄幻|东方玄幻/.test(genre)) {
      startKeywords = [...startKeywords, '斗气', '武魂', '魂环', '废柴', '天才', '觉醒', '修炼之路']
      riseKeywords = [...riseKeywords, '斗师', '斗王', '斗皇', '斗宗', '斗尊', '斗圣', '突破境界', '越级挑战']
      midKeywords = [...midKeywords, '远古遗迹', '秘境', '圣地', '宗门', '家族', '帝国', '学院', '修炼圣地']
      highKeywords = [...highKeywords, '斗帝', '斗圣巅峰', '半步斗帝', '巅峰强者', '大陆巅峰', '至强者']
      climaxKeywords = [...climaxKeywords, '魂殿', '古族', '远古种族', '最终BOSS', '斗帝之战']
      endKeywords = [...endKeywords, '成帝', '超脱斗气大陆', '飞升', '永生', '不朽']
    } else if (/仙侠|修真/.test(genre)) {
      startKeywords = [...startKeywords, '炼气', '筑基', '金丹', '元婴', '散修', '宗门', '拜师', '入门']
      riseKeywords = [...riseKeywords, '化神', '炼虚', '合体', '大乘', '渡劫', '飞升', '修炼有成']
      midKeywords = [...midKeywords, '仙门', '仙域', '仙界', '上古秘境', '洞天福地', '渡劫飞升']
      highKeywords = [...highKeywords, '金仙', '太乙金仙', '大罗金仙', '仙帝', '仙尊', '巅峰仙尊']
      climaxKeywords = [...climaxKeywords, '仙魔大战', '天道劫', '最终BOSS', '仙帝之战']
      endKeywords = [...endKeywords, '超脱轮回', '羽化登仙', '永生不灭', '大道永恒']
    } else if (/都市|都市异能/.test(genre)) {
      startKeywords = [...startKeywords, '重生', '穿越', '回到', '觉醒', '获得', '系统', '金手指', '重生都市']
      riseKeywords = [...riseKeywords, '崛起', '创业', '投资', '商业帝国', '身价暴涨', '名声大噪']
      midKeywords = [...midKeywords, '进入', '加入', '集团', '公司', '家族', '商场', '商战', '娱乐圈']
      highKeywords = [...highKeywords, '首富', '顶级', '大佬', '最强', '无敌', '巅峰', '称霸']
      climaxKeywords = [...climaxKeywords, '商业帝国', '最终对决', '巅峰之战', '终极较量']
      endKeywords = [...endKeywords, '圆满', '永恒', '传奇', '神话', '不朽']
    } else if (/奇幻|剑与魔法/.test(genre)) {
      startKeywords = [...startKeywords, '魔法', '斗气', '骑士', '魔法学院', '魔法天赋', '觉醒', '奇遇']
      riseKeywords = [...riseKeywords, '魔法师', '魔导士', '魔导师', '圣魔导师', '成名', '崛起']
      midKeywords = [...midKeywords, '魔法学院', '冒险', '探险', '地下城', '遗迹', '秘境']
      highKeywords = [...highKeywords, '圣域', '神域', '神级', '巅峰', '至强', '成神']
      climaxKeywords = [...climaxKeywords, '神战', '神魔大战', '最终BOSS', '巅峰对决']
      endKeywords = [...endKeywords, '成神', '超越神', '永恒', '传说', '不朽']
    } else if (/历史|架空历史/.test(genre)) {
      startKeywords = [...startKeywords, '穿越', '重生', '回到', '降临', '古代', '乱世', '王朝']
      riseKeywords = [...riseKeywords, '崛起', '争霸', '征战', '统一', '建国', '称帝', '称王']
      midKeywords = [...midKeywords, '征战', '讨伐', '攻城', '扩土', '结盟', '外交', '内政']
      highKeywords = [...highKeywords, '称霸', '统一', '称帝', '建国', '天下', '霸主', '帝王']
      climaxKeywords = [...climaxKeywords, '决战', '统一之战', '最终之战', '平定天下']
      endKeywords = [...endKeywords, '统一', '盛世', '千古一帝', '名垂青史', '永恒']
    } else if (/悬疑|推理/.test(genre)) {
      startKeywords = [...startKeywords, '案件', '谋杀', '谜团', '真相', '悬疑', '推理', '调查']
      riseKeywords = [...riseKeywords, '破案', '解谜', '追踪', '调查', '揭露', '发现']
      midKeywords = [...midKeywords, '追查', '追踪', '调查', '取证', '推理', '分析']
      highKeywords = [...highKeywords, '揭开', '真相', '揭露', '破解', '找到', '发现']
      climaxKeywords = [...climaxKeywords, '最终', '真相', '凶手', '大结局', '对决']
      endKeywords = [...endKeywords, '真相', '结局', '圆满', '正义', '传奇']
    }
    
    return [startKeywords, riseKeywords, midKeywords, highKeywords, climaxKeywords, endKeywords]
  }

  async testConnection(): Promise<boolean> {
    try {
      const html = await this.fetchBaiduSearch('test', 5000)
      return html.length > 0
    } catch (e) {
      return false
    }
  }
}

export default new BaiduSearchSource()
