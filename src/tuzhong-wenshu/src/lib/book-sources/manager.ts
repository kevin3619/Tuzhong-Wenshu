/**
 * 小说数据源管理器
 * 
 * 功能：
 * 1. 统一管理多个数据源
 * 2. 按优先级自动切换（高优先级API失败时自动尝试下一个）
 * 3. 多源数据融合（交叉验证，取最可信的值）
 * 4. 熔断机制（失败次数过多的数据源暂时禁用）
 * 
 * 核心数据源（3个）：
 * 1. 番茄小说 - 字节跳动官方API，数据量大，更新快
 * 2. 360百科 - 百科数据准确，作者/字数等信息权威
 * 3. 百度搜索 - 兜底方案，覆盖最全面
 */

import {
  BookSourceProvider,
  BookSourceData,
  BookSourceManagerConfig,
  FusionResult,
  SearchOptions,
  BookCharacter,
} from './types'
import { createDefaultBook, mergeBookData, isReasonableChapters, isReasonableWords, parseWordCount, isTrustworthyAuthorName } from './utils'
import { FAMOUS_NOVELS } from './famous-novels'
import { validateAndCleanBookData, mergeBookDataWithValidation, advancedFuseBookData, evaluateDataQuality } from './data-validator'

// 导入核心数据源
import fanqieSource from './fanqie-source'
import so360Source from './so360-source'
import baiduSource from './baidu-source'
import firecrawlSource from './firecrawl-source'
import sogouSource from './sogou-source'
import qidianSource from './qidian-source'

/**
 * 默认配置
 */
const DEFAULT_CONFIG: BookSourceManagerConfig = {
  priority: ['baidu', 'qidian', 'fanqie', 'sogou', 'so360', 'firecrawl'],
  autoFallback: true,
  timeout: 30000,
  enableFusion: true,
}

/**
 * 熔断记录
 */
interface CircuitBreakerRecord {
  failCount: number
  lastFailTime: number
  isOpen: boolean
}

/**
 * 数据源管理器
 */
class BookSourceManager {
  private sources: Map<string, BookSourceProvider> = new Map()
  private config: BookSourceManagerConfig
  private circuitBreakers: Map<string, CircuitBreakerRecord> = new Map()
  
  // 熔断阈值
  private readonly FAIL_THRESHOLD = 3  // 连续失败3次触发熔断
  private readonly OPEN_DURATION = 5 * 60 * 1000  // 熔断持续5分钟

  constructor(customConfig?: Partial<BookSourceManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...customConfig }
    
    this.registerSource(fanqieSource)
    this.registerSource(baiduSource)
    this.registerSource(so360Source)
    this.registerSource(firecrawlSource)
    this.registerSource(sogouSource)
    this.registerSource(qidianSource)
  }

  /**
   * 注册数据源
   */
  registerSource(source: BookSourceProvider): void {
    this.sources.set(source.id, source)
    this.circuitBreakers.set(source.id, {
      failCount: 0,
      lastFailTime: 0,
      isOpen: false,
    })
  }

  /**
   * 获取所有已注册的数据源
   */
  getAllSources(): BookSourceProvider[] {
    return Array.from(this.sources.values())
  }

  /**
   * 获取启用的数据源（按优先级排序）
   */
  getEnabledSources(): BookSourceProvider[] {
    const sources: BookSourceProvider[] = []
    
    for (const id of this.config.priority) {
      const source = this.sources.get(id)
      if (source && source.enabled && !this.isCircuitOpen(id)) {
        sources.push(source)
      }
    }
    
    return sources
  }

  /**
   * 搜索书籍（自动切换 + 数据融合）
   */
  async searchBook(bookName: string, options: SearchOptions = {}): Promise<BookSourceData | null> {
    console.log(`[BookSourceManager] 搜索书籍: ${bookName}`)
    
    const enabledSources = this.getEnabledSources()
    console.log(`[BookSourceManager] 可用数据源: ${enabledSources.map(s => s.name).join(', ')}`)
    
    if (enabledSources.length === 0) {
      console.warn('[BookSourceManager] 无可用数据源')
      return null
    }
    
    const allResults: BookSourceData[] = []
    const timeout = options.timeout || this.config.timeout
    const startTime = Date.now()
    
    const maxTimeout = Math.min(timeout, 45000)

    if (this.config.enableFusion && enabledSources.length > 1) {
      console.log('[BookSourceManager] 融合模式：并行请求多个数据源')
      
      const promises = enabledSources.map(async (source) => {
        try {
          const sourceTimeout = source.id === 'baidu' ? Math.floor(maxTimeout * 0.85) :
                                source.id === 'qidian' ? Math.floor(maxTimeout * 0.8) :
                                source.id === 'firecrawl' ? Math.floor(maxTimeout * 0.3) :
                                Math.floor(maxTimeout * 0.6)
          console.log(`[BookSourceManager] 请求: ${source.name} (超时: ${sourceTimeout}ms)`)
          const result = await source.searchBook(bookName, { ...options, timeout: sourceTimeout })
          
          if (result && result.title) {
            if (result.author && !isTrustworthyAuthorName(result.author)) {
              console.warn(`[BookSourceManager] ${source.name} 作者名不可信（${result.author}），保留其他字段`)
              result.author = ''
            }
            console.log(`[BookSourceManager] ${source.name} 搜索成功: ${result.title}`)
            this.recordSuccess(source.id)
            return result
          } else {
            console.log(`[BookSourceManager] ${source.name} 未找到结果`)
            this.recordFail(source.id)
            return null
          }
        } catch (error) {
          console.warn(`[BookSourceManager] ${source.name} 搜索失败:`, error instanceof Error ? error.message : String(error))
          this.recordFail(source.id)
          return null
        }
      })
      
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          console.warn(`[BookSourceManager] 总搜索超时（${maxTimeout}ms），停止等待`)
          resolve(null)
        }, maxTimeout)
      })
      
      const results = await Promise.race([
        Promise.allSettled(promises),
        timeoutPromise
      ])
      
      if (results === null) {
        console.warn('[BookSourceManager] 搜索超时')
      } else {
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            allResults.push(r.value)
          }
        }
      }
      
      console.log(`[BookSourceManager] 搜索完成，成功 ${allResults.length}/${enabledSources.length} 个数据源，耗时 ${Date.now() - startTime}ms`)
    } else {
      // 串行模式：逐个尝试
      for (const source of enabledSources) {
        // 检查是否超时
        const elapsed = Date.now() - startTime
        if (elapsed >= timeout) {
          console.warn(`[BookSourceManager] 搜索超时（${elapsed}ms），停止尝试更多数据源`)
          break
        }
        
        try {
          console.log(`[BookSourceManager] 尝试数据源: ${source.name}`)
          
          const remainingTime = timeout - elapsed
          const result = await source.searchBook(bookName, { ...options, timeout: remainingTime })
          
          if (result && result.title) {
            if (result.author && !isTrustworthyAuthorName(result.author)) {
              console.warn(`[BookSourceManager] ${source.name} 作者名不可信（${result.author}），保留其他字段`)
              result.author = ''
            }
            console.log(`[BookSourceManager] ${source.name} 搜索成功: ${result.title}`)
            allResults.push(result)
            this.recordSuccess(source.id)
            
            if (!this.config.enableFusion) {
              if (result.confidence >= 90 && result.totalWords) {
                console.log(`[BookSourceManager] 数据质量高（置信度${result.confidence}），立即返回: ${result.title}`)
                return validateAndCleanBookData(result)
              }
              
              return validateAndCleanBookData(result)
            }
          } else {
            console.log(`[BookSourceManager] ${source.name} 未找到结果`)
            this.recordFail(source.id)
          }
        } catch (error) {
          console.warn(`[BookSourceManager] ${source.name} 搜索失败:`, error instanceof Error ? error.message : String(error))
          this.recordFail(source.id)
        }
      }
    }

    const cleanBookName = bookName.trim().replace(/[\s·\-_《》"']/g, '')
    let famousNovelData: BookSourceData | null = null
    for (const [novelName, data] of Object.entries(FAMOUS_NOVELS)) {
      const cleanNovelName = novelName.replace(/[\s·\-_《》"']/g, '')
      if (cleanNovelName === cleanBookName || cleanNovelName.includes(cleanBookName) || cleanBookName.includes(cleanNovelName)) {
        console.log(`[BookSourceManager] 命中知名小说库: ${novelName}，作为高置信度数据源参与融合`)
        famousNovelData = createDefaultBook(novelName, '知名小说库')
        Object.assign(famousNovelData, data)
        famousNovelData.confidence = 90
        break
      }
    }

    if (allResults.length === 0) {
      if (famousNovelData) {
        console.log('[BookSourceManager] 所有实时数据源都未找到结果，使用知名小说库数据')
        return famousNovelData
      }
      
      console.warn('[BookSourceManager] 知名小说库也未命中，返回基础数据供LLM补全')
      const fallbackResult = createDefaultBook(bookName, '未知来源')
      fallbackResult.confidence = 20
      fallbackResult.title = bookName
      fallbackResult.synopsis = `《${bookName}》是一部网络小说。`
      return fallbackResult
    }

    if (famousNovelData) {
      allResults.unshift(famousNovelData)
    }

    const getSourceWeight = (sourceName: string): number => {
      if (sourceName === '百度百科') return 20
      if (sourceName === '知名小说库') return 15
      if (sourceName === '起点中文网') return 12
      if (sourceName === '百度搜索') return 10
      if (sourceName === '搜狗百科') return 9
      if (sourceName === '360百科') return 8
      if (sourceName === '番茄小说') return 7
      if (sourceName === '搜狗搜索') return 3
      if (sourceName === '360搜索') return 3
      if (sourceName === 'Firecrawl全网搜索') return -10
      return 0
    }

    const getAdjustedConfidence = (result: BookSourceData): number => {
      const weight = getSourceWeight(result.source || '')
      return result.confidence + weight
    }

    if (this.config.enableFusion && allResults.length > 1) {
      const sorted = [...allResults].sort((a, b) => getAdjustedConfidence(b) - getAdjustedConfidence(a))
      const best = sorted[0]
      
      // 🔥 优化：如果最高质量的数据源数据已经很完整，直接返回，不融合
      //    （融合可能引入其他来源的错误数据）
      //    但是如果章节数可疑（字数>100万但章节数<100），则需要融合
      const wordsValue = best.totalWords || ''
      const wordsMatch = String(wordsValue).match(/(\d+(?:\.\d+)?)\s*(万)/)
      const wordsWan = wordsMatch ? parseFloat(wordsMatch[1]) : 0
      const chapterNum = Number(best.totalChapters) || 0
      const isChapterSuspicious = wordsWan >= 100 && chapterNum > 0 && chapterNum < 100
      
      const bestAdjustedConfidence = getAdjustedConfidence(best)
      if (bestAdjustedConfidence >= 90 && best.author && best.totalWords && best.totalChapters && best.genre && !isChapterSuspicious) {
        console.log(`[BookSourceManager] 最高质量数据源（${best.source}，置信度${best.confidence}，加权后${bestAdjustedConfidence}）数据完整，跳过融合直接返回`)
        return validateAndCleanBookData(best)
      }
      
      if (isChapterSuspicious) {
        console.log(`[BookSourceManager] 章节数${chapterNum}可疑（字数${wordsWan}万），强制进行数据融合`)
      }
      
      const fusionResult = this.fuseData(allResults, getSourceWeight)
      console.log(`[BookSourceManager] 数据融合完成，使用了 ${fusionResult.sources.length} 个数据源，总耗时 ${Date.now() - startTime}ms`)
      return validateAndCleanBookData(fusionResult.data)
    }

    const best = allResults.sort((a, b) => getAdjustedConfidence(b) - getAdjustedConfidence(a))[0]
    console.log(`[BookSourceManager] 返回最佳结果: ${best.title}, 置信度: ${best.confidence}, 加权后: ${getAdjustedConfidence(best)}, 来源: ${best.source}`)
    
    return validateAndCleanBookData(best)
  }

  /**
   * 多源数据融合
   * 
   * 策略：
   * 1. 以置信度最高的数据源为基础（考虑数据源权重）
   * 2. 对关键字段（作者、字数、章节数）进行交叉验证
   *    - 如果多个源的数据一致，置信度提升
   *    - 如果不一致，取置信度最高的源的值
   * 3. 其他字段从多个源补充
   * 4. 过滤低质量数据，优先使用完整数据
   */
  private fuseData(results: BookSourceData[], getSourceWeight?: (source: string) => number): FusionResult {
    const defaultGetWeight = (sourceName: string): number => {
      if (sourceName === '百度百科') return 20
      if (sourceName === '知名小说库') return 15
      if (sourceName === '百度搜索') return 10
      if (sourceName === '360百科') return 8
      if (sourceName === '番茄小说') return 5
      if (sourceName === 'Firecrawl全网搜索') return -10
      return 0
    }
    const weightFn = getSourceWeight || defaultGetWeight

    const validResults = results.filter(r => {
      if (!r || !r.title) return false
      const keyFieldCount = ['author', 'totalWords', 'totalChapters', 'genre', 'status'].filter(
        field => (r as unknown as Record<string, unknown>)[field] && String((r as unknown as Record<string, unknown>)[field]).trim() !== ''
      ).length
      if (keyFieldCount < 2) return false
      if (r.confidence < 30) return false
      
      const quality = evaluateDataQuality(r)
      if (quality.overall < 40) {
        console.log(`[fuseData] 数据质量过低，过滤掉: ${r.source}, 质量分: ${quality.overall}`)
        return false
      }
      
      return true
    })

    if (validResults.length >= 2) {
      console.log(`[fuseData] 使用高级交叉验证融合（${validResults.length}个有效数据源）`)
      const advancedResult = advancedFuseBookData(validResults, weightFn)
      const merged = advancedResult.data as BookSourceData
      const fieldSources: Record<string, string> = {}
      
      for (const [field, sources] of Object.entries(advancedResult.fieldSources)) {
        fieldSources[field] = sources.join(', ')
      }
      
      console.log(`[fuseData] 高级融合完成，总置信度: ${advancedResult.overallConfidence}`)
      console.log(`[fuseData] 各数据源质量: ${JSON.stringify(advancedResult.sourceQuality)}`)
      
      const bookName = merged.title || ''
      if (bookName) {
        const cleanBookName = bookName.trim().replace(/[\s·\-_《》"']/g, '')
        let foundFamousData = null
        for (const [novelName, data] of Object.entries(FAMOUS_NOVELS)) {
          const cleanNovelName = novelName.replace(/[\s·\-_《》"']/g, '')
          if (cleanNovelName === cleanBookName || cleanNovelName.includes(cleanBookName) || cleanBookName.includes(cleanNovelName)) {
            foundFamousData = data
            break
          }
        }
        
        if (foundFamousData) {
          if (foundFamousData.protagonist && !merged.protagonist) {
            merged.protagonist = foundFamousData.protagonist as BookSourceData['protagonist']
          }
          if (foundFamousData.femaleLead && !merged.femaleLead) {
            merged.femaleLead = foundFamousData.femaleLead as BookSourceData['femaleLead']
          }
          if (foundFamousData.characters && (!merged.characters || merged.characters.length < 3)) {
            merged.characters = foundFamousData.characters as BookSourceData['characters']
          }
          if (foundFamousData.powerSystem && (!merged.powerSystem || merged.powerSystem.length < 50)) {
            merged.powerSystem = foundFamousData.powerSystem as BookSourceData['powerSystem']
          }
          if (foundFamousData.worldBuilding && (!merged.worldBuilding || merged.worldBuilding.length < 50)) {
            merged.worldBuilding = foundFamousData.worldBuilding as BookSourceData['worldBuilding']
          }
          if (foundFamousData.sixStageOutline && !merged.sixStageOutline) {
            merged.sixStageOutline = foundFamousData.sixStageOutline as BookSourceData['sixStageOutline']
          }
          if (foundFamousData.characterArchetypes && !merged.characterArchetypes) {
            merged.characterArchetypes = foundFamousData.characterArchetypes as BookSourceData['characterArchetypes']
          }
        }
      }
      
      return {
        data: merged,
        fieldSources,
        sources: validResults.map(r => r.source),
      }
    }

    const getAdjustedConfidence = (result: BookSourceData): number => {
      return result.confidence + weightFn(result.source || '')
    }

    let filteredResults = [...results]
    
    // 🔥 关键修复：检查是否所有数据源都返回空数据
    // 如果是，尝试知名小说兜底数据
    const hasValidData = filteredResults.some(r => {
      const hasAuthor = r.author && r.author.trim() !== '' && r.author !== '未知'
      const hasWords = r.totalWords && String(r.totalWords).trim() !== ''
      const hasChapters = r.totalChapters && Number(r.totalChapters) > 0
      const hasGenre = r.genre && r.genre.trim() !== '' && r.genre !== '玄幻'
      const hasStatus = r.status && r.status.trim() !== '' && r.status !== '已完结'
      return hasAuthor || hasWords || hasChapters || hasGenre || hasStatus
    })
    
    if (!hasValidData && filteredResults.length > 0) {
      const bookName = filteredResults[0].title || ''
      console.warn(`[fuseData] 所有数据源都返回空数据，尝试知名小说兜底: ${bookName}`)
      
      const cleanBookName = bookName.trim().replace(/[\s·\-_《》"']/g, '')
      let foundFallback = null
      for (const [novelName, data] of Object.entries(FAMOUS_NOVELS)) {
        const cleanNovelName = novelName.replace(/[\s·\-_《》"']/g, '')
        if (cleanNovelName === cleanBookName || cleanNovelName.includes(cleanBookName) || cleanBookName.includes(cleanNovelName)) {
          foundFallback = { name: novelName, data }
          break
        }
      }
      
      if (foundFallback) {
        console.log(`[fuseData] 使用知名小说兜底数据: ${foundFallback.name}`)
        const fallbackResult = createDefaultBook(foundFallback.name, '知名小说库')
        Object.assign(fallbackResult, foundFallback.data)
        fallbackResult.confidence = 85
        
        return {
          data: fallbackResult,
          fieldSources: { '*': '知名小说库' },
          sources: ['知名小说库'],
        }
      }
    }
    
    // 🔥 关键修复：过滤空数据和无效数据
    // 如果一个数据源的关键字段大部分为空，说明被反爬拦截，降低其置信度或过滤
    filteredResults = filteredResults.map(result => {
      const keyFieldCount = ['author', 'totalWords', 'totalChapters', 'genre', 'status'].filter(
        field => (result as unknown as Record<string, unknown>)[field] && String((result as unknown as Record<string, unknown>)[field]).trim() !== ''
      ).length
      
      // 如果关键字段少于2个，说明数据无效，降低置信度
      if (keyFieldCount < 2) {
        return { ...result, confidence: Math.max(10, result.confidence - 60) }
      }
      return result
    }).filter(result => result.confidence >= 30)
    
    // 如果过滤后没有结果，使用原始数据
    if (filteredResults.length === 0) {
      filteredResults = [...results]
    }
    
    const sorted = filteredResults.sort((a, b) => getAdjustedConfidence(b) - getAdjustedConfidence(a))
    const primary = sorted[0]
    const fieldSources: Record<string, string> = {}
    
    // 以置信度最高的为基础（考虑数据源权重）
    const merged: BookSourceData = { ...createDefaultBook(primary.title, primary.source), ...primary }
    fieldSources['*'] = primary.source

    // 关键字段交叉验证
    const keyFields = ['author', 'totalWords', 'totalChapters', 'genre', 'status', 'synopsis']
    
    const officialSources = ['番茄小说']
    const baikeSources = ['360百科', '百度百科', '百度搜索']
    
    for (const field of keyFields) {
      const values: Array<{ value: unknown; confidence: number; source: string }> = []

      for (const result of sorted) {
        const val = (result as unknown as Record<string, unknown>)[field]
        if (val !== undefined && val !== null && val !== '' && val !== 0) {
          let adjustedConfidence = result.confidence
          
          if (baikeSources.includes(result.source)) {
            if (field === 'author' || field === 'totalWords' || field === 'totalChapters') {
              adjustedConfidence += 15
            } else {
              adjustedConfidence += 5
            }
          }
          
          if (officialSources.includes(result.source)) {
            if (field === 'genre' || field === 'status') {
              adjustedConfidence += 10
            } else if (field === 'author' || field === 'totalWords' || field === 'totalChapters') {
              adjustedConfidence -= 5
            }
          }
          
          values.push({ value: val, confidence: adjustedConfidence, source: result.source })
        }
      }
      
      if (values.length === 0) continue
      
      // 特殊处理：字数和章节数需要数值比较
      if (field === 'totalWords') {
        const numValues = values.map(v => ({
          num: parseWordCount(String(v.value)) || 0,
          str: v.value,
          confidence: v.confidence,
          source: v.source,
        })).filter(v => v.num > 0)
        
        if (numValues.length > 0) {
          // 🔥 优化：优先选择多个数据源一致的值
          // 如果多个源的数据一致（误差在10%以内），优先使用
          const groupedByNum = numValues.reduce((acc, v) => {
            const key = Math.round(v.num / 10) * 10
            acc[key] = acc[key] || []
            acc[key].push(v)
            return acc
          }, {} as Record<number, typeof numValues>)
          
          let bestValue = numValues[0]
          for (const key of Object.keys(groupedByNum)) {
            const group = groupedByNum[Number(key)]
            if (group.length >= 2) {
              // 多个源数据一致，优先选择置信度最高的
              group.sort((a, b) => b.confidence - a.confidence)
              bestValue = group[0]
              console.log(`[fuseData] 字数多源一致: ${bestValue.str} (${group.length}个源)`)
              break
            }
          }
          
          if (!bestValue) {
            numValues.sort((a, b) => b.confidence - a.confidence)
            bestValue = numValues[0]
          }
          
          ;(merged as unknown as Record<string, unknown>)[field] = bestValue.str
          fieldSources[field] = bestValue.source
        }
        continue
      }

      if (field === 'totalChapters') {
        const numValues = values.map(v => ({
          num: Number(v.value) || 0,
          confidence: v.confidence,
          source: v.source,
        })).filter(v => v.num > 0 && isReasonableChapters(v.num))
        
        if (numValues.length > 0) {
          // 🔥 优化：优先选择多个数据源一致的值
          const groupedByNum = numValues.reduce((acc, v) => {
            const key = Math.round(v.num / 10) * 10
            acc[key] = acc[key] || []
            acc[key].push(v)
            return acc
          }, {} as Record<number, typeof numValues>)
          
          let bestValue = numValues[0]
          for (const key of Object.keys(groupedByNum)) {
            const group = groupedByNum[Number(key)]
            if (group.length >= 2) {
              group.sort((a, b) => b.confidence - a.confidence)
              bestValue = group[0]
              console.log(`[fuseData] 章节数多源一致: ${bestValue.num} (${group.length}个源)`)
              break
            }
          }
          
          if (!bestValue) {
            numValues.sort((a, b) => b.confidence - a.confidence)
            bestValue = numValues[0]
          }
          
          ;(merged as unknown as Record<string, unknown>)[field] = bestValue.num
          fieldSources[field] = bestValue.source
        }
        continue
      }
      
      // 字符串字段：取置信度最高的
      const sortedValues = values.sort((a, b) => b.confidence - a.confidence)
      let best = sortedValues[0]
      
      // 🔥 关键修复：作者字段跨源验证
      if (field === 'author') {
        // 如果只有一个源提供作者，检查该源的数据是否完整
        if (sortedValues.length === 1) {
          const sourceResult = sorted.find(r => r.source === sortedValues[0].source)
          if (sourceResult) {
            const hasWords = sourceResult.totalWords && String(sourceResult.totalWords).trim() !== ''
            const hasChapters = sourceResult.totalChapters && Number(sourceResult.totalChapters) > 0
            const hasGenre = sourceResult.genre && String(sourceResult.genre).trim() !== ''
            const hasStatus = sourceResult.status && String(sourceResult.status).trim() !== ''
            
            if (!hasWords && !hasChapters && !hasGenre && !hasStatus) {
              console.log(`[fuseData] 警告: 作者 "${sortedValues[0].value}" 来自源 "${sortedValues[0].source}"，但该源缺少其他关键字段，可能是错误匹配`)
            }
          }
        }
        
        // 检查作者名字是否合理（中文名字通常2-4个字）
        const authorName = String(best.value).trim()
        if (!isTrustworthyAuthorName(authorName)) {
          console.log(`[fuseData] 警告: 作者名 "${authorName}" 看起来不可信，尝试使用其他源`)
          const alternative = sortedValues.find(v => isTrustworthyAuthorName(String(v.value).trim()))
          if (alternative) {
            best = alternative
          }
        }
        
        // 🔥 增加作者一致性检查：如果多个源返回相同作者名，置信度提升
        const authorValues = sortedValues.filter(v => 
          String(v.value).trim() === String(best.value).trim()
        )
        if (authorValues.length >= 2) {
          console.log(`[fuseData] 作者多源一致: ${best.value} (${authorValues.length}个源)`)
        }
      }
      
      ;(merged as unknown as Record<string, unknown>)[field] = best.value
      fieldSources[field] = best.source
    }

    // 合并其他字段（标签、角色、分卷等）
    for (const result of sorted) {
      // 标签合并去重（增加过滤）
      if (result.tags && result.tags.length > 0) {
        const existing = merged.tags || []
        const genre = merged.genre || ''
        
        // 过滤标签：去掉与小说类型不符的标签
        const validTags = result.tags.filter(tag => {
          const t = String(tag).trim().toLowerCase()
          if (!t || t.length < 2) return false
          
          // 过滤常见的无关标签
          const badTags = ['系统', '历史', '游戏', '都市', '言情', '悬疑', '灵异', '科幻', '军事', '竞技', '二次元', '轻小说', '现实']
          for (const bad of badTags) {
            if (t.includes(bad.toLowerCase())) {
              // 如果小说类型包含该标签，则保留
              if (genre.toLowerCase().includes(bad.toLowerCase())) {
                return true
              }
              return false
            }
          }
          
          // 保留与玄幻/仙侠相关的标签
          const goodTags = ['玄幻', '仙侠', '东方玄幻', '西方奇幻', '武侠', '热血', '升级', '修炼', '战斗', '冒险', '重生', '穿越', '争霸', '成长', '强者', '异界', '魔法', '斗气', '武魂']
          for (const good of goodTags) {
            if (t.includes(good.toLowerCase())) {
              return true
            }
          }
          
          // 默认保留（除非是评分等无意义标签）
          if (/^评分/.test(t)) return false
          return true
        })
        
        merged.tags = [...new Set([...existing, ...validTags])].slice(0, 15)
      }
      
      // 角色合并去重
      if (result.characters && result.characters.length > 0) {
        const existing = merged.characters || []
        const existingNames = new Set(existing.map(c => c.name))
        for (const c of result.characters) {
          if (!existingNames.has(c.name)) {
            existing.push(c)
            existingNames.add(c.name)
          }
        }
        merged.characters = existing
      }
      
      // 分卷：取最详细的
      if (result.volumes && result.volumes.length > 0) {
        if (!merged.volumes || merged.volumes.length < result.volumes.length) {
          merged.volumes = result.volumes
        }
      }
      
      // 简介：取最长的
      if (result.synopsis && result.synopsis.length > (merged.synopsis?.length || 0)) {
        merged.synopsis = result.synopsis
      }
      
      // 六阶段大纲：取置信度最高的
      if (result.sixStageOutline && !merged.sixStageOutline) {
        merged.sixStageOutline = result.sixStageOutline
      }

      // 角色功能定位：取置信度最高的
      if (result.characterArchetypes && !merged.characterArchetypes) {
        merged.characterArchetypes = result.characterArchetypes
      }

      // 世界观：取最长的
      if (result.worldBuilding && result.worldBuilding.length > (merged.worldBuilding?.length || 0)) {
        merged.worldBuilding = result.worldBuilding
      }

      // 力量体系：取最长的
      if (result.powerSystem && result.powerSystem.length > (merged.powerSystem?.length || 0)) {
        merged.powerSystem = result.powerSystem
      }
      
      // 核心卖点：合并去重
      if (result.sellingPoints && result.sellingPoints.length > 0) {
        const existing = merged.sellingPoints || []
        merged.sellingPoints = [...new Set([...existing, ...result.sellingPoints])].slice(0, 10)
      }
    }

    // 计算融合后的置信度
    const sourceCount = results.length
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / sourceCount
    
    // 多源数据一致性加成
    let agreementBonus = 0
    
    // 作者一致性检查
    const authors = results.map(r => r.author).filter(a => a && a.length > 0 && a !== '未知')
    if (authors.length >= 2) {
      const uniqueAuthors = new Set(authors.map(a => a.trim()))
      if (uniqueAuthors.size === 1) {
        agreementBonus += 10
      }
    }
    
    // 字数一致性检查
    const wordCounts = results.map(r => parseWordCount(r.totalWords || '')).filter(w => w > 0)
    if (wordCounts.length >= 2) {
      const maxWord = Math.max(...wordCounts)
      const minWord = Math.min(...wordCounts)
      if (maxWord > 0 && (maxWord - minWord) / maxWord <= 0.15) {
        agreementBonus += 7
      }
    }
    
    // 章节数一致性检查
    const chapterCounts = results.map(r => Number(r.totalChapters) || 0).filter(c => c > 0)
    if (chapterCounts.length >= 2) {
      const maxChapter = Math.max(...chapterCounts)
      const minChapter = Math.min(...chapterCounts)
      if (maxChapter > 0 && (maxChapter - minChapter) / maxChapter <= 0.1) {
        agreementBonus += 5
      }
    }
    
    // 类型一致性检查
    const genres = results.map(r => r.genre).filter(g => g && g.length > 0 && g !== '未知')
    if (genres.length >= 2) {
      const uniqueGenres = new Set(genres.map(g => g.trim()))
      if (uniqueGenres.size === 1) {
        agreementBonus += 5
      }
    }
    
    // 状态一致性检查
    const statuses = results.map(r => r.status).filter(s => s && s.length > 0 && s !== '未知')
    if (statuses.length >= 2) {
      const uniqueStatuses = new Set(statuses.map(s => s.trim()))
      if (uniqueStatuses.size === 1) {
        agreementBonus += 3
      }
    }
    
    // 数据源数量加成
    if (sourceCount === 2) agreementBonus += 3
    if (sourceCount === 3) agreementBonus += 10
    
    merged.confidence = Math.min(100, Math.round(avgConfidence + agreementBonus))
    
    // 添加融合说明
    if (sourceCount > 1) {
      merged.accuracyNote = `数据融合自 ${sourceCount} 个数据源：${results.map(r => r.source).join('、')}`
    }

    const bookName = merged.title || ''
    if (bookName) {
      const cleanBookName = bookName.trim().replace(/[\s·\-_《》"']/g, '')
      let foundFamousData = null
      for (const [novelName, data] of Object.entries(FAMOUS_NOVELS)) {
        const cleanNovelName = novelName.replace(/[\s·\-_《》"']/g, '')
        if (cleanNovelName === cleanBookName || cleanNovelName.includes(cleanBookName) || cleanBookName.includes(cleanNovelName)) {
          foundFamousData = data
          break
        }
      }
      
      if (foundFamousData) {
        if (foundFamousData.protagonist && !merged.protagonist) {
          merged.protagonist = foundFamousData.protagonist as BookSourceData['protagonist']
        }
        if (foundFamousData.femaleLead && !merged.femaleLead) {
          merged.femaleLead = foundFamousData.femaleLead as BookSourceData['femaleLead']
        }
        if (foundFamousData.characters && (!merged.characters || merged.characters.length < 3)) {
          merged.characters = foundFamousData.characters as BookSourceData['characters']
        }
        if (foundFamousData.powerSystem && (!merged.powerSystem || merged.powerSystem.length < 50)) {
          merged.powerSystem = foundFamousData.powerSystem as BookSourceData['powerSystem']
        }
        if (foundFamousData.worldBuilding && (!merged.worldBuilding || merged.worldBuilding.length < 50)) {
          merged.worldBuilding = foundFamousData.worldBuilding as BookSourceData['worldBuilding']
        }
        if (foundFamousData.sixStageOutline && !merged.sixStageOutline) {
          merged.sixStageOutline = foundFamousData.sixStageOutline as BookSourceData['sixStageOutline']
        }
        if (foundFamousData.characterArchetypes && !merged.characterArchetypes) {
          merged.characterArchetypes = foundFamousData.characterArchetypes as BookSourceData['characterArchetypes']
        }
      }
    }

    return {
      data: merged,
      fieldSources,
      sources: results.map(r => r.source),
    }
  }

  /**
   * 检查熔断器是否打开
   */
  private isCircuitOpen(sourceId: string): boolean {
    const record = this.circuitBreakers.get(sourceId)
    if (!record || !record.isOpen) return false
    
    // 检查是否过了熔断时间
    if (Date.now() - record.lastFailTime > this.OPEN_DURATION) {
      record.isOpen = false
      record.failCount = 0
      console.log(`[BookSourceManager] 数据源 ${sourceId} 熔断已恢复`)
      return false
    }
    
    return true
  }

  /**
   * 记录成功
   */
  private recordSuccess(sourceId: string): void {
    const record = this.circuitBreakers.get(sourceId)
    if (record) {
      record.failCount = 0
      record.isOpen = false
    }
  }

  /**
   * 记录失败
   */
  private recordFail(sourceId: string): void {
    const record = this.circuitBreakers.get(sourceId)
    if (!record) return
    
    record.failCount++
    record.lastFailTime = Date.now()
    
    if (record.failCount >= this.FAIL_THRESHOLD && !record.isOpen) {
      record.isOpen = true
      console.warn(`[BookSourceManager] 数据源 ${sourceId} 连续失败 ${record.failCount} 次，触发熔断 ${this.OPEN_DURATION / 1000 / 60} 分钟`)
    }
  }

  /**
   * 手动重置熔断器
   */
  resetCircuitBreaker(sourceId: string): void {
    const record = this.circuitBreakers.get(sourceId)
    if (record) {
      record.failCount = 0
      record.isOpen = false
      console.log(`[BookSourceManager] 数据源 ${sourceId} 熔断器已重置`)
    }
  }

  /**
   * 重置所有熔断器
   */
  resetAllCircuitBreakers(): void {
    for (const id of this.circuitBreakers.keys()) {
      this.resetCircuitBreaker(id)
    }
  }

  /**
   * 测试所有数据源连接
   */
  async testAllConnections(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {}
    
    for (const [id, source] of this.sources) {
      if (!source.enabled) {
        results[id] = false
        continue
      }
      
      try {
        results[id] = source.testConnection ? await source.testConnection() : true
      } catch (e) {
        results[id] = false
      }
    }
    
    return results
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<BookSourceManagerConfig>): void {
    this.config = { ...this.config, ...config }
    console.log(`[BookSourceManager] 配置已更新:`, JSON.stringify(this.config))
  }

  /**
   * 获取当前配置
   */
  getConfig(): BookSourceManagerConfig {
    return { ...this.config }
  }
}

// 导出单例
const bookSourceManager = new BookSourceManager()
export default bookSourceManager
export { BookSourceManager }
