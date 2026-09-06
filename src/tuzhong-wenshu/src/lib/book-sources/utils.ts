/**
 * 数据源通用工具函数
 */

import { BookSourceData, BookCharacter } from './types'

/**
 * 中文数字转阿拉伯数字
 * 支持：零一二三四五六七八九十百千万亿
 * 例如：两千零一十四 -> 2014，三百六十五 -> 365
 */
export function chineseNumberToInt(str: string): number | null {
  if (!str) return null
  
  const chineseDigits: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '两': 2, '壹': 1, '贰': 2, '叁': 3, '肆': 4,
    '伍': 5, '陆': 6, '柒': 7, '捌': 8, '玖': 9,
  }
  
  const units: Record<string, number> = {
    '十': 10, '拾': 10,
    '百': 100, '佰': 100,
    '千': 1000, '仟': 1000,
    '万': 10000,
    '亿': 100000000,
  }
  
  // 先检查是否是纯阿拉伯数字
  const numMatch = str.match(/[\d,.]+/)
  if (numMatch && numMatch[0].length === str.trim().length) {
    const num = parseFloat(numMatch[0].replace(/[,.]/g, ''))
    if (!isNaN(num)) return Math.floor(num)
  }
  
  let result = 0
  let temp = 0
  let lastUnit = 0
  let hasDigit = false
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    
    if (chineseDigits[char] !== undefined) {
      temp = chineseDigits[char]
      hasDigit = true
    } else if (units[char] !== undefined) {
      const unit = units[char]
      
      if (unit === 10000 || unit === 100000000) {
        // 万或亿：需要把之前的temp和result都处理
        result = (result + temp) * unit
        temp = 0
      } else {
        // 十、百、千
        if (temp === 0 && unit === 10) {
          // 特殊情况："十"开头，如"十五" = 15
          temp = 1
        }
        result += temp * unit
        temp = 0
      }
      lastUnit = unit
    }
  }
  
  result += temp
  
  if (!hasDigit && result === 0) return null
  
  return result > 0 ? result : null
}

/**
 * 从HTML中提取纯文本
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 提取数字（从字符串中提取第一个有效数字）
 */
export function extractNumber(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)/)
  if (!match) return null
  const num = Number(match[1])
  return isNaN(num) ? null : num
}

/**
 * 解析字数字符串为万字单位的数字
 * 如 "208.8万字" -> 208.8, "2088000字" -> 208.8, "3959.1千字" -> 395.9
 */
export function parseWordCount(text: string): number {
  if (!text) return 0
  const num = extractNumber(text)
  if (num === null || num === undefined || isNaN(num)) return 0
  
  if (/亿/.test(text)) {
    // 亿字单位 -> 万字
    return Math.round(num * 10000 * 10) / 10
  } else if (/万/.test(text)) {
    // 已经是万字单位
    return num
  } else if (/千/.test(text)) {
    // 千字单位 -> 万字
    return Math.round(num / 10 * 10) / 10
  } else {
    // 纯字数，转换为万字
    return Math.round(num / 10000 * 10) / 10
  }
}

/**
 * 格式化字数为显示字符串
 */
export function formatWordCount(wanNum: number): string {
  if (!wanNum || wanNum <= 0) return ''
  if (wanNum >= 10000) {
    return (wanNum / 10000).toFixed(1) + '亿字'
  }
  return wanNum + '万字'
}

/**
 * 判断章节数是否合理
 */
export function isReasonableChapters(n: number): boolean {
  return !isNaN(n) && n >= 5 && n <= 15000
}

/**
 * 判断字数是否合理（万字单位）
 */
export function isReasonableWords(wanNum: number): boolean {
  return !isNaN(wanNum) && wanNum >= 1 && wanNum <= 2000
}

/**
 * 判断是否为有效的中文人名
 */
export function isValidChineseName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 10) return false
  if (!/^[\u4e00-\u9fa5·]+$/.test(name)) return false
  
  const invalidWords = [
    '小说', '作品', '类型', '状态', '字数', '章节', '原创', '网络',
    '连载', '完结', '更新', '最新', '信息', '简介', '内容', '标签',
    '分类', '题材', '风格', '推荐', '正文', '书评', '阅读', '免费',
    '会员', '下载', '在线', '全文', '本书', '这本', '作者', '点击',
    '收藏', '推荐票', '月票', '百度', '文库', '百科', '知道', '贴吧',
    '论坛', '社区', '网站', '首页', '登录', '注册', '搜索', '关于',
    '联系', '隐私', '导航', '菜单', '更多', '下一页', '上一页', '热门',
    '返回', '滚动', '跳转', '商代', '甲骨文', '本义', '古代',
    '梗', '误', '特定', '秒懂', '本尊', '答', '问答', '知识', '科普',
    '百科全书', '百科知识', '百度百科', '百科词条',
    '编辑', '创建', '贡献', '完善', '修订', '更新时间', '编辑次数',
    '参考资料', '引用', '来源', '注释', '扩展阅读', '外部链接',
    '地理设定', '修炼设定', '首发于', '创作于', '创作时间', '创作年代',
    '开始时间', '结束时间', '更新时间', '连载时间',
    '作者简介', '作者资料', '作者信息', '作者主页', '作者博客',
    '小说简介', '小说目录', '小说正文', '小说封面', '小说类型',
    '小说状态', '小说字数', '小说章节', '小说标签', '小说推荐',
    '内容简介', '作品简介', '作品目录', '作品类型', '作品状态',
    '全文阅读', '免费阅读', '在线阅读', 'VIP阅读', '付费阅读',
    '章节列表', '章节更新', '最新章节', '第一章节', '最后章节',
  ]
  
  for (const word of invalidWords) {
    if (name.includes(word)) return false
  }
  
  return true
}

/**
 * 校验作者名是否可信
 * 规则：2-6个纯中文字，不含明显小说/营销词汇
 */
export function isTrustworthyAuthorName(author: string): boolean {
  if (!author || author.length < 2 || author.length > 8) return false
  if (!/^[\u4e00-\u9fa5·]+$/.test(author)) return false
  return isValidChineseName(author)
}

/**
 * 转义正则表达式特殊字符
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 创建默认的书籍数据对象
 */
export function createDefaultBook(title: string, source: string): BookSourceData {
  return {
    title,
    author: '',
    genre: '',
    status: '',
    tags: [],
    characters: [],
    source,
    confidence: 0,
  }
}

/**
 * 合并两个书籍数据（后者覆盖前者的非空字段）
 */
export function mergeBookData(primary: BookSourceData, secondary: BookSourceData): BookSourceData {
  const result: Record<string, unknown> = { ...primary }

  for (const key of Object.keys(secondary) as Array<keyof BookSourceData>) {
    const val = secondary[key]
    if (val === undefined || val === null) continue
    if (typeof val === 'string' && val === '') continue
    if (Array.isArray(val) && val.length === 0) continue

    // 数组类型：合并去重
    if (Array.isArray(val) && Array.isArray(result[key])) {
      result[key] = [...new Set([...(result[key] as unknown[]), ...val])]
    } else if (typeof val === 'object' && !Array.isArray(val) && typeof result[key] === 'object') {
      // 对象类型：浅合并
      result[key] = { ...result[key], ...val }
    } else {
      // 其他类型：只有primary没有或为空时才覆盖
      if (!result[key] || (typeof result[key] === 'string' && result[key] === '')) {
        result[key] = val
      }
    }
  }
  
  return result as unknown as BookSourceData
}

/**
 * 从文本中提取作者
 */
export function extractAuthorFromText(text: string): string | null {
  // 作者黑名单（常见的非作者词）
  const blacklist = new Set([
    '主角', '配角', '男主', '女主', '男主角', '女主角', '反派', '龙套',
    '人物', '角色', '简介', '介绍', '主角是', '女主角是', '男主角是',
    '小说', '作品', '本书', '该书', '这本', '内容', '故事', '剧情',
    '讲述', '描写', '讲述了', '描写了', '主要讲', '讲的是',
    '清风', '明月', '天下', '风云', '乾坤', '天地', '星辰', '日月',
    '莫问', '无情', '无双', '逍遥', '浪子', '剑客', '刀客',
    '彩鳞', '萧薰儿', '林动', '萧炎', '牧尘', '纪宁', '叶凡', '石昊',
    '辰南', '龙皓晨', '唐三', '霍雨浩', '周维清', '王林', '苏铭',
  ])
  
  // 强模式：作者：XXX / 原著：XXX 等（优先级最高）
  const strongPatterns = [
    /(?:作者|原著|著者|原作|原作者|本书作者|小说作者)\s*[:：]\s*([\u4e00-\u9fa5·]{2,8})(?![\u4e00-\u9fa5])/g,
    /[【\[（(]\s*(?:作者|原著|著者)\s*[】\])）]\s*[:：]?\s*([\u4e00-\u9fa5·]{2,8})/g,
    /《[^《》]{2,20}》\s*([\u4e00-\u9fa5·]{2,8})\s*(?:著|编著|原著|原创)/g,
    /([\u4e00-\u9fa5·]{2,8})\s*(?:著|编著)\s*[《〈]/g,
  ]
  
  const candidates: Map<string, number> = new Map()
  
  // 强模式匹配（权重高）
  for (const pattern of strongPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim()
      if (isValidChineseName(name) && !blacklist.has(name)) {
        candidates.set(name, (candidates.get(name) || 0) + 10)
      }
    }
  }
  
  // 次强模式："XXX的小说"、"XXX作品"等
  const midPatterns = [
    /([\u4e00-\u9fa5·]{2,8})\s*(?:的小说|的作品|新书|新作|代表作)/g,
    /作家\s*([\u4e00-\u9fa5·]{2,8})/g,
    /网络作家\s*([\u4e00-\u9fa5·]{2,8})/g,
    /白金作家\s*([\u4e00-\u9fa5·]{2,8})/g,
  ]
  
  for (const pattern of midPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim()
      if (isValidChineseName(name) && !blacklist.has(name)) {
        candidates.set(name, (candidates.get(name) || 0) + 5)
      }
    }
  }
  
  // 取得分最高的
  if (candidates.size > 0) {
    let bestName = ''
    let bestScore = 0
    for (const [name, score] of candidates) {
      if (score > bestScore) {
        bestScore = score
        bestName = name
      }
    }
    if (bestScore >= 5) {
      return bestName
    }
  }
  
  return null
}

/**
 * 从文本中提取字数
 */
export function extractWordsFromText(text: string): { str: string; num: number } | null {
  if (!text || !text.trim()) return null
  
  const cleanText = text.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim()
  
  const strongPatterns = [
    /(?:字数|总字数|全文|全书|累计|共计|一共|总共|约|大概|全文共|全书共|小说)[^0-9]{0,15}(\d{1,4}(?:\.\d{1,2})?)\s*万[字余多]/gi,
    /(?:字数|总字数|全文|全书|累计)\s*[:：]\s*(\d{1,4}(?:\.\d{1,2})?)\s*万[字余多]/gi,
  ]
  
  for (const pattern of strongPatterns) {
    let match
    while ((match = pattern.exec(cleanText)) !== null) {
      const num = Number(match[1])
      if (isReasonableWords(num)) {
        return { str: num + '万字', num }
      }
    }
  }
  
  const midPattern = /(\d{1,4}(?:\.\d{1,2})?)\s*万\s*[字余多]/gi
  let match2
  while ((match2 = midPattern.exec(cleanText)) !== null) {
    const num = Number(match2[1])
    if (isReasonableWords(num)) {
      return { str: num + '万字', num }
    }
  }
  
  const purePattern = /(\d{5,8})\s*(?:字|字符)/i
  const match3 = cleanText.match(purePattern)
  if (match3) {
    const num = Number(match3[1])
    const wanNum = Math.round(num / 10000 * 10) / 10
    if (isReasonableWords(wanNum)) {
      return { str: wanNum + '万字', num: wanNum }
    }
  }
  
  const yiPattern = /(\d{1,2}(?:\.\d{1,2})?)\s*亿\s*[字余多]/gi
  let match4
  while ((match4 = yiPattern.exec(cleanText)) !== null) {
    const num = Number(match4[1])
    const wanNum = num * 10000
    if (isReasonableWords(wanNum)) {
      return { str: num + '亿字', num: wanNum }
    }
  }
  
  return null
}

/**
 * 从文本中提取章节数
 */
export function extractChaptersFromText(text: string): number | null {
  const candidates: { num: number; weight: number }[] = []
  
  // 最高置信度：共/全文/总计 + 数字 + 章
  const highPatterns = [
    /(?:共|全文|全书|总计|共计|总共|一共|累计)\s*(\d{1,6})\s*(?:章|集|话|节|回|篇)/gi,
    /(?:共|全文|全书|总计|共计|总共|一共|累计)[^0-9]{0,10}(\d{1,6})\s*(?:章|集|话|节|回|篇)/gi,
  ]
  
  for (const pattern of highPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const num = Number(match[1])
      if (isReasonableChapters(num)) {
        candidates.push({ num, weight: 3 })
      }
    }
  }
  
  // 高置信度：章节数/章节 + 数字
  const midPatterns = [
    /(?:章节数|章节|总章节|总章数|章数|篇数|总篇)\s*[:：]?\s*(\d{1,6})/gi,
  ]
  
  for (const pattern of midPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const num = Number(match[1])
      if (isReasonableChapters(num) && !(num >= 1000 && num <= 2099)) {
        candidates.push({ num, weight: 2 })
      }
    }
  }
  
  // 中置信度：数字章 + 万字/完结
  const comboPatterns = [
    /(\d{1,6})\s*(?:章|集|话|节|回)\s*[^0-9]{0,5}\d+(?:\.\d+)?\s*万字/g,
    /(\d{1,6})\s*(?:章|集|话|节|回)\s*(?:已完结|完本|完结|全本)/gi,
  ]
  
  for (const pattern of comboPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const num = Number(match[1])
      if (isReasonableChapters(num)) {
        candidates.push({ num, weight: 2 })
      }
    }
  }
  
  if (candidates.length === 0) return null
  
  // 加权投票
  const voteMap: Record<number, number> = {}
  for (const c of candidates) {
    voteMap[c.num] = (voteMap[c.num] || 0) + c.weight
  }
  
  let bestNum = 0
  let bestVote = 0
  for (const [num, vote] of Object.entries(voteMap)) {
    const n = Number(num)
    if (vote > bestVote || (vote === bestVote && n > bestNum)) {
      bestNum = n
      bestVote = vote
    }
  }
  
  return bestNum > 0 ? bestNum : null
}

/**
 * 从文本中提取题材分类（优先匹配大类）
 */
export function extractGenreFromText(text: string): string | null {
  const mainGenres = ['玄幻', '仙侠', '武侠', '都市', '科幻', '历史', '军事', '言情', '悬疑', '灵异', '游戏', '竞技', '奇幻', '轻小说']
  
  // 优先匹配明确格式：类型/分类：XXX（支持完整类型描述，包括"·"分隔）
  const explicitPatterns = [
    /类\s*型[：:\s]+([\u4e00-\u9fa5·与]{2,16})/g,
    /分\s*类[：:\s]+([\u4e00-\u9fa5·与]{2,16})/g,
    /题\s*材[：:\s]+([\u4e00-\u9fa5·与]{2,16})/g,
    /风\s*格[：:\s]+([\u4e00-\u9fa5·与]{2,16})/g,
  ]
  
  for (const pattern of explicitPatterns) {
    let m
    while ((m = pattern.exec(text)) !== null) {
      const g = m[1].trim()
      if (g.length >= 2) {
        return g
      }
    }
  }
  
  // 统计所有类型关键词的出现次数，取最多的
  const genreCount: Record<string, number> = {}
  for (const g of mainGenres) {
    const regex = new RegExp(g, 'g')
    const matches = text.match(regex)
    if (matches) {
      genreCount[g] = matches.length
    }
  }
  
  // 特殊处理：盗墓/探险/推理类优先归为悬疑
  const detectiveWords = ['盗墓', '探险', '推理', '破案', '悬疑', '惊悚', '恐怖', '灵异', '解谜', '探秘']
  let detectiveCount = 0
  for (const w of detectiveWords) {
    const regex = new RegExp(w, 'g')
    const matches = text.match(regex)
    if (matches) detectiveCount += matches.length
  }
  
  if (detectiveCount >= 3 && (!genreCount['玄幻'] || genreCount['玄幻'] < 3)) {
    // 有很多盗墓/探险关键词，优先归为悬疑
    if (genreCount['悬疑']) return '悬疑'
    if (genreCount['灵异']) return '灵异'
    return '悬疑'
  }
  
  // 找出出现次数最多的类型
  let bestGenre = ''
  let maxCount = 0
  for (const [g, count] of Object.entries(genreCount)) {
    if (count > maxCount) {
      maxCount = count
      bestGenre = g
    }
  }
  
  return bestGenre || null
}

/**
 * 从文本中提取状态
 */
export function extractStatusFromText(text: string): string | null {
  if (/已完结|完本|完结|连载完成|全篇完结|全书完|全本完结|本篇完|全文完|已完本/.test(text)) {
    return '已完结'
  }
  if (/连载中|正在连载|更新中|持续连载|火热连载|不断更新|连载进行中/.test(text)) {
    return '连载中'
  }
  return null
}

/**
 * 从文本中提取标签
 */
export function extractTagsFromText(text: string): string[] {
  const allTags = [
    '热血', '爽文', '升级', '穿越', '重生', '系统', '种田', '无敌', '腹黑', '扮猪吃虎',
    '正能量', '搞笑', '轻松', '甜宠', '虐恋', '豪门', '总裁', '校园', '职场', '都市',
    '玄幻', '仙侠', '武侠', '科幻', '历史', '军事', '悬疑', '灵异', '游戏', '竞技',
    '修仙', '修真', '洪荒', '高武', '末世', '异能', '快穿', '无限流', '经商', '官场',
    '谍战', '盗墓', '探险', '恐怖', '惊悚', '推理', '破案', '架空', '穿越', '重生',
  ]
  
  const found: string[] = []
  for (const tag of allTags) {
    if (text.includes(tag) && !found.includes(tag)) {
      found.push(tag)
    }
  }
  
  return found.slice(0, 10)
}
