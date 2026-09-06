import type { BookSourceData, BookCharacter } from './types'
import { escapeRegExp, isReasonableWords, isReasonableChapters, isValidChineseName } from './utils'

const EMPTY_VALUES = ['', 'null', 'undefined', '未知', '暂无', '无', 'None', 'N/A', '-']

const PLACEHOLDER_PATTERNS = [
  /\[原文占位/,
  /参考结构/,
  /模板/,
  /示例/,
  /待补充/,
  /在此处填写/,
  /^[\s\-\_]+$/,
  /百度百科提取/,
]

const EASTERN_GENRES = ['玄幻', '仙侠', '武侠', '东方玄幻', '修真', '洪荒', '高武', '仙侠小说', '修真小说', '玄幻小说', '东方玄幻小说', '国术', '江湖', '古典仙侠', '现代修真']
const WESTERN_GENRES = ['奇幻', '西方奇幻', '剑与魔法', '魔法', '斗气', '西幻', '奇幻小说', '西方奇幻小说', '暗黑', '史诗', '中世纪']

const EASTERN_ONLY_TERMS = [
  '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫',
  '仙', '道', '佛', '妖', '鬼', '怪', '精', '神兽', '灵兽', '妖兽',
  '宗门', '门派', '圣地', '秘境', '洞府', '机缘', '悟道', '天劫',
  '灵根', '灵脉', '灵气', '丹田', '经脉', '武魂', '斗魂',
  '丹药', '阵法', '符箓', '法宝', '法器', '仙器', '妖器',
  '剑修', '体修', '丹修', '符修', '阵修', '器修', '佛修', '魔修', '道修',
  '洞天', '化灵', '铭纹', '列阵', '尊者', '神火', '真神', '圣祭',
  '仙王', '仙帝', '至尊', '超脱', '独断万古', '十凶', '不灭生灵',
  '国术', '内功', '外功', '心法', '轻功', '招式', '武林', '江湖',
  '大侠', '少侠', '盟主', '帮主', '掌门', '长老', '护法', '堂主', '舵主',
  '武功', '武学', '秘籍', '宝典', '神功', '绝学', '刀法', '剑法', '棍法',
  '炼气期', '筑基期', '金丹期', '元婴期', '化神期', '炼虚期', '合体期', '大乘期', '渡劫期',
  '淬体', '开元', '万象', '通玄', '神变', '至尊境', '涅槃', '轮回', '造化',
  '人皇', '天帝', '天尊', '道祖', '佛祖', '魔祖', '妖祖',
  '九品丹药', '八品丹药', '七品丹药', '六品丹药', '五品丹药',
  '黄阶', '玄阶', '地阶', '天阶', '圣阶', '神阶',
  '内门弟子', '外门弟子', '核心弟子', '真传弟子', '亲传弟子',
  '太上长老', '执法长老', '丹堂堂主', '器堂堂主', '阵堂堂主',
]

const WESTERN_ONLY_TERMS = [
  '圣骑士', '圣堂骑士', '黑暗骑士', '死亡骑士', '龙骑士',
  '精灵', '矮人', '兽人', '巨魔', '地精', '哥布林', '狼人', '吸血鬼',
  '魔兽', '幻兽', '召唤兽', '契约兽',
  '圣域', '神域', '神格', '主神格', '至高神', '主神',
  '城邦', '教廷', '神殿', '公会',
  '公爵', '伯爵', '侯爵', '子爵', '男爵',
  '符文', '炼金', '锻造', '附魔', '诅咒', '祝福',
  '位面', '深渊', '地狱', '天堂',
  '恶魔', '天使', '诸神',
  '大魔导', '法神', '剑神', '武神', '剑圣',
  '魔导器', '魔法杖', '魔法阵', '魔法卷轴', '魔法药水',
  '一阶魔法师', '二阶魔法师', '三阶魔法师', '四阶魔法师', '五阶魔法师',
  '初级剑士', '中级剑士', '高级剑士', '剑师', '大剑师',
  '侍从骑士', '青铜骑士', '白银骑士', '黄金骑士', '神圣骑士',
  '暗黑魔导', '光明魔导', '元素魔导', '亡灵魔导', '召唤魔导',
  '黑暗教廷', '光明教廷', '火神教', '水神教', '大地神殿',
]

const SHARED_TERMS = [
  '精神力', '信仰之力', '法则', '玄奥', '变异',
]

const URBAN_ONLY_TERMS = [
  '系统', '金手指', '重生', '穿越', '都市', '校园', '职场', '公司', '企业',
  '神豪', '首富', '美女', '校花', '总裁', '豪门', '家族',
  '医', '兵王', '战神', '特种兵', '杀手',
  '直播', '网红', '娱乐圈', '明星', '导演',
  '商战', '创业', '投资', '股票', '金融',
  '官场', '权谋', '政治', '权力',
  '警', '刑侦', '破案', '警察', '法医',
]

const SCIENCE_FICTION_ONLY_TERMS = [
  '科技', '机甲', '机器人', '人工智能', 'AI', '虚拟现实', 'VR', 'AR',
  '星际', '飞船', '战舰', '星际联盟', '外星', '外星人',
  '基因', '克隆', '改造', '进化', '变异', '异能',
  '未来', '末世', '废土', '赛博朋克', '赛博',
  '量子', '空间', '时间', '维度', '平行世界',
  '黑客', '网络', '数据', '程序', '代码',
  '军事', '武器', '战争', '核弹', '导弹',
  '能源', '太阳能', '核能', '反物质', '暗能量',
  '生物', '生化', '病毒', '实验', '研究所',
]

const HISTORICAL_ONLY_TERMS = [
  '历史', '古代', '三国', '隋唐', '秦汉', '宋元', '明清',
  '穿越', '重生', '争霸', '江山', '天下',
  '皇帝', '帝王', '太子', '皇子', '公主',
  '武将', '文臣', '谋士', '军师', '将领',
  '战争', '征战', '讨伐', '统一', '开国',
  '朝堂', '后宫', '宫斗', '权谋', '政治',
  '科举', '状元', '榜眼', '探花', '进士',
  '武侠', '江湖', '门派', '武林', '大侠',
]

const ROMANCE_ONLY_TERMS = [
  '言情', '爱情', '恋爱', '甜蜜', '宠文', '虐恋',
  '总裁', '豪门', '世家', '贵公子', '千金',
  '校园', '青春', '初恋', '暗恋',
  '穿越', '重生', '女频', '甜宠', '甜文',
  '男主', '女主', 'CP', '感情线', '爱情故事',
]

const SUSPENSE_ONLY_TERMS = [
  '悬疑', '推理', '破案', '侦探', '刑侦',
  '恐怖', '惊悚', '灵异', '鬼怪', '僵尸',
  '盗墓', '探险', '解密', '神秘', '诡异',
  '杀人', '凶手', '犯罪', '案件', '调查',
]

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return EMPTY_VALUES.includes(trimmed) || trimmed.length === 0
  }
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'number') return isNaN(value) || value <= 0
  return false
}

export function isPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) return true
  }
  return false
}

export function hasValidContent(value: unknown): boolean {
  if (isEmptyValue(value)) return false
  if (isPlaceholder(value)) return false
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) return false
    if (trimmed.length === 1) {
      return /[\u4e00-\u9fa5]/.test(trimmed)
    }
  }
  return true
}

export function isEasternGenre(genre: string): boolean {
  if (!genre) return false
  const lowerGenre = genre.toLowerCase()
  for (const g of EASTERN_GENRES) {
    if (lowerGenre.includes(g.toLowerCase())) return true
  }
  return false
}

export function isWesternGenre(genre: string): boolean {
  if (!genre) return false
  const lowerGenre = genre.toLowerCase()
  for (const g of WESTERN_GENRES) {
    if (lowerGenre.includes(g.toLowerCase())) return true
  }
  return false
}

export function detectGenreByContent(text: string): string {
  if (!text) return '玄幻'
  
  const easternCoreKeywords = [
    '修炼', '境界', '突破', '宗门', '门派', '圣地', '秘境', '洞府',
    '灵气', '灵力', '斗气', '武魂', '魂环', '魂骨', '魂力', '血脉',
    '丹药', '丹方', '炼丹', '炼器', '阵法', '符箓', '法宝', '法器',
    '剑修', '体修', '丹修', '符修', '阵修', '佛修', '魔修', '道修',
    '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫',
    '仙', '神', '帝', '皇', '尊', '圣', '祖', '王',
    '太古', '上古', '远古', '洪荒', '异界', '重生', '穿越',
    '系统', '金手指', '天赋', '机缘', '悟道', '天劫',
    '灵根', '灵脉', '丹田', '经脉', '神识',
    '武道', '武学', '武功', '秘籍', '功法', '武技', '战技',
    '乾坤', '阴阳', '五行', '八卦', '九宫', '太极',
    '妖兽', '灵兽', '神兽',
    '妖', '鬼', '魔', '佛', '道', '儒', '巫', '蛊',
    '斗尊', '斗圣', '斗帝', '仙王', '仙帝', '至尊', '超脱',
    '神界', '仙界', '魔界', '妖界', '鬼界',
  ]
  
  const easternContextKeywords = [
    '大陆', '世界', '星域', '宇宙',
    '剑', '刀', '枪', '棍', '拳', '掌', '腿', '身法',
    '魔兽', '召唤兽', '契约兽',
    '精神力',
  ]
  
  const westernCoreKeywords = [
    '魔法', '法师', '魔导', '魔导师', '法神', '剑神', '武神', '剑圣',
    '斗气', '斗技', '斗者', '斗师', '大斗师', '斗灵', '斗王', '斗皇', '斗宗', '斗尊', '斗圣', '斗帝',
    '血脉', '天赋', '传承', '神器', '魔器', '灵器', '宝器',
    '精灵', '矮人', '兽人', '巨魔', '地精', '哥布林', '狼人', '吸血鬼',
    '圣骑士', '圣堂骑士', '黑暗骑士', '死亡骑士', '龙骑士',
    '教廷', '神殿', '公会', '城邦', '帝国', '王国',
    '公爵', '伯爵', '侯爵', '子爵', '男爵',
    '圣域', '神域', '神格', '主神格', '至高神', '主神',
    '位面', '深渊', '地狱', '天堂',
    '恶魔', '天使', '诸神',
    '符文', '炼金', '锻造', '附魔', '诅咒', '祝福',
    '魔法杖', '魔法阵', '魔法卷轴', '魔法药水', '魔导器',
    '召唤', '契约', '召唤兽', '契约兽',
  ]
  
  const westernContextKeywords = [
    '信仰之力', '法则', '玄奥', '精神力',
    '世界', '大陆', '宇宙',
  ]
  
  const sciFiCoreKeywords = [
    '科技', '机甲', '机器人', '人工智能', 'AI', '虚拟现实', 'VR', 'AR',
    '星际', '飞船', '战舰', '星际联盟', '外星', '外星人',
    '基因', '克隆', '改造', '进化', '变异', '异能',
    '未来', '末世', '废土', '赛博朋克', '赛博',
    '量子', '空间', '时间', '维度', '平行世界',
    '黑客', '网络', '数据', '程序', '代码',
    '军事', '武器', '战争', '核弹', '导弹',
    '能源', '太阳能', '核能', '反物质', '暗能量',
    '生物', '生化', '病毒', '实验', '研究所',
  ]
  
  const sciFiContextKeywords = [
    '宇宙', '世界',
  ]
  
  const urbanCoreKeywords = [
    '都市', '现代', '城市', '校园', '职场', '公司', '企业',
    '系统', '重生', '穿越', '异能', '神豪', '首富',
    '美女', '校花', '总裁', '豪门', '家族',
    '医', '兵王', '战神', '特种兵', '杀手',
    '直播', '网红', '娱乐圈', '明星', '导演',
    '商战', '创业', '投资', '股票', '金融',
    '官场', '权谋', '政治', '权力',
    '警', '刑侦', '破案', '警察', '法医',
  ]
  
  const historicalCoreKeywords = [
    '历史', '古代', '三国', '隋唐', '秦汉', '宋元', '明清',
    '穿越', '重生', '争霸', '江山', '天下',
    '皇帝', '帝王', '太子', '皇子', '公主',
    '武将', '文臣', '谋士', '军师', '将领',
    '战争', '征战', '讨伐', '统一', '开国',
    '朝堂', '后宫', '宫斗', '权谋', '政治',
    '科举', '状元', '榜眼', '探花', '进士',
    '武侠', '江湖', '门派', '武林', '大侠',
  ]
  
  const romanceCoreKeywords = [
    '言情', '爱情', '恋爱', '甜蜜', '宠文', '虐恋',
    '总裁', '豪门', '世家', '贵公子', '千金',
    '校园', '青春', '初恋', '暗恋',
    '穿越', '重生', '女频', '甜宠', '甜文',
    '男主', '女主', 'CP', '感情线', '爱情故事',
  ]
  
  const suspenseCoreKeywords = [
    '悬疑', '推理', '破案', '侦探', '刑侦',
    '恐怖', '惊悚', '灵异', '鬼怪', '僵尸',
    '盗墓', '探险', '解密', '神秘', '诡异',
    '杀人', '凶手', '犯罪', '案件', '调查',
  ]
  
  function countKeywords(keywords: string[], contextKeywords: string[] = []): { core: number; context: number; total: number } {
    let coreCount = 0
    let contextCount = 0
    
    for (const keyword of keywords) {
      const regex = new RegExp(keyword, 'g')
      const matches = text.match(regex)
      if (matches) coreCount += matches.length
    }
    
    for (const keyword of contextKeywords) {
      const regex = new RegExp(keyword, 'g')
      const matches = text.match(regex)
      if (matches) contextCount += matches.length
    }
    
    return { core: coreCount, context: contextCount, total: coreCount + contextCount * 0.5 }
  }
  
  const eastern = countKeywords(easternCoreKeywords, easternContextKeywords)
  const western = countKeywords(westernCoreKeywords, westernContextKeywords)
  const sciFi = countKeywords(sciFiCoreKeywords, sciFiContextKeywords)
  const urban = countKeywords(urbanCoreKeywords)
  const historical = countKeywords(historicalCoreKeywords)
  const romance = countKeywords(romanceCoreKeywords)
  const suspense = countKeywords(suspenseCoreKeywords)
  
  const scores: { genre: string; score: number; core: number }[] = [
    { genre: '玄幻', score: eastern.total, core: eastern.core },
    { genre: '奇幻', score: western.total, core: western.core },
    { genre: '科幻', score: sciFi.total, core: sciFi.core },
    { genre: '都市', score: urban.total, core: urban.core },
    { genre: '历史', score: historical.total, core: historical.core },
    { genre: '言情', score: romance.total, core: romance.core },
    { genre: '悬疑', score: suspense.total, core: suspense.core },
  ]
  
  scores.sort((a, b) => b.score - a.score)
  
  const top1 = scores[0]
  const top2 = scores[1]
  
  if (top1.core === 0) return '玄幻'
  
  if (top1.score >= 3) {
    if (top1.genre === '玄幻' && top1.core >= 2) {
      if (text.includes('仙侠') || text.includes('修真') || text.includes('修仙')) {
        return '仙侠'
      }
      return '玄幻'
    }
    
    if (top1.genre === '科幻') {
      if (top2.genre === '玄幻' && top2.core >= 2 && top1.core - top2.core <= 1) {
        if (text.includes('修炼') || text.includes('境界') || text.includes('灵气') || text.includes('宗门') || text.includes('丹药') || text.includes('筑基') || text.includes('金丹')) {
          return top2.genre === '玄幻' ? '玄幻' : top2.genre
        }
      }
      return '科幻'
    }
    
    return top1.genre
  }
  
  if (top1.genre === '玄幻' || top1.genre === '奇幻') {
    if (top1.genre === '玄幻') {
      if (text.includes('仙侠') || text.includes('修真') || text.includes('修仙')) {
        return '仙侠'
      }
    }
    return top1.genre
  }
  
  return '玄幻'
}

export function isUrbanGenre(genre: string): boolean {
  if (!genre) return false
  const lowerGenre = genre.toLowerCase()
  const urbanGenres = ['都市', '都市异能', '都市生活', '都市重生', '现代', '现实']
  for (const g of urbanGenres) {
    if (lowerGenre.includes(g.toLowerCase())) return true
  }
  return false
}

export function isHistoricalGenre(genre: string): boolean {
  if (!genre) return false
  const lowerGenre = genre.toLowerCase()
  const historicalGenres = ['历史', '架空历史', '古代', '穿越历史', '秦汉', '三国', '隋唐', '宋元', '明清']
  for (const g of historicalGenres) {
    if (lowerGenre.includes(g.toLowerCase())) return true
  }
  return false
}

function detectMixedGenre(text: string): { primary: string; hasEastern: boolean; hasWestern: boolean } {
  const easternKeywords = EASTERN_ONLY_TERMS.concat(['修炼', '境界', '灵气', '丹田', '宗门', '仙', '道', '佛', '妖', '鬼', '魔', '丹药', '阵法', '符箓', '法宝', '剑修', '体修', '炼气', '筑基', '金丹', '元婴', '渡劫'])
  const westernKeywords = WESTERN_ONLY_TERMS.concat(['魔法', '法师', '魔导', '斗气', '精灵', '矮人', '兽人', '圣骑士', '教廷', '神殿', '爵位', '符文', '炼金', '附魔', '位面', '深渊', '地狱', '天堂', '恶魔', '天使'])
  
  let easternCount = 0
  let westernCount = 0
  
  for (const kw of easternKeywords) {
    if (text.includes(kw)) easternCount++
  }
  for (const kw of westernKeywords) {
    if (text.includes(kw)) westernCount++
  }
  
  const total = easternCount + westernCount
  if (total === 0) {
    return { primary: '玄幻', hasEastern: false, hasWestern: false }
  }
  
  const easternRatio = easternCount / total
  
  if (easternRatio >= 0.8) {
    return { primary: '东方', hasEastern: true, hasWestern: false }
  } else if (easternRatio <= 0.2) {
    return { primary: '西方', hasEastern: false, hasWestern: true }
  } else {
    return { primary: '混合', hasEastern: true, hasWestern: true }
  }
}

function getTermsToRemove(genre: string, text: string = ''): string[] {
  const mixedResult = text ? detectMixedGenre(text) : { primary: '', hasEastern: false, hasWestern: false }
  
  if (isEasternGenre(genre)) {
    if (mixedResult.hasWestern && mixedResult.primary === '混合') {
      const strictWesternTerms = ['圣骑士', '圣堂骑士', '黑暗骑士', '死亡骑士', '龙骑士',
        '精灵', '矮人', '兽人', '巨魔', '地精', '哥布林', '狼人', '吸血鬼',
        '圣域', '神域', '神格', '主神格', '至高神', '主神',
        '城邦', '教廷', '神殿', '公会',
        '公爵', '伯爵', '侯爵', '子爵', '男爵',
        '位面', '深渊', '地狱', '天堂',
        '恶魔', '天使', '诸神']
      return strictWesternTerms.filter(t => !SHARED_TERMS.includes(t))
    }
    return WESTERN_ONLY_TERMS.filter(t => !SHARED_TERMS.includes(t))
  }
  
  if (isWesternGenre(genre)) {
    if (mixedResult.hasEastern && mixedResult.primary === '混合') {
      const strictEasternTerms = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫',
        '仙', '道', '佛', '妖', '鬼', '怪', '精',
        '宗门', '门派', '圣地', '秘境', '洞府',
        '灵根', '灵脉', '灵气', '丹田', '经脉',
        '丹药', '阵法', '符箓', '法宝', '法器', '仙器', '妖器',
        '剑修', '体修', '丹修', '符修', '阵修', '器修', '佛修', '魔修', '道修',
        '人皇', '天帝', '天尊', '道祖', '佛祖', '魔祖', '妖祖']
      return strictEasternTerms.filter(t => !SHARED_TERMS.includes(t))
    }
    return EASTERN_ONLY_TERMS.filter(t => !SHARED_TERMS.includes(t))
  }
  
  if (isUrbanGenre(genre)) {
    return [...WESTERN_ONLY_TERMS.filter(t => !SHARED_TERMS.includes(t)), ...EASTERN_ONLY_TERMS.filter(t => !SHARED_TERMS.includes(t))]
  }
  
  if (isHistoricalGenre(genre)) {
    return [...WESTERN_ONLY_TERMS.filter(t => !SHARED_TERMS.includes(t)), ...EASTERN_ONLY_TERMS.filter(t => !SHARED_TERMS.includes(t))]
  }
  
  return []
}

export function cleanTextByGenre(text: string, genre: string): string {
  if (!text || !genre) return text
  
  let result = text
  
  const termsToRemove = getTermsToRemove(genre, text)
  
  for (const term of termsToRemove) {
    result = result.replace(new RegExp(`(?:^|\\s|，|。|、|；|：|！|？|（|\\()${term}(?:$|\\s|，|。|、|；|：|！|？|）|\\))`, 'g'), '')
  }
  
  result = result.replace(/【\s*】/g, '').replace(/\s+/g, ' ').trim()
  
  return result
}

export function cleanPowerSystemByGenre(powerSystem: string, genre: string): string {
  if (!powerSystem || !genre) return powerSystem
  
  let result = powerSystem
  
  const termsToRemove = getTermsToRemove(genre, powerSystem)
  
  for (const term of termsToRemove) {
    result = result.replace(new RegExp(`(?:^|\\s|，|。|、|；|：|！|？|（|\\()${term}(?:$|\\s|，|。|、|；|：|！|？|）|\\))`, 'g'), '')
  }
  
  result = result.replace(/【\s*】/g, '').replace(/\s+/g, ' ').trim()
  
  return result
}

export function cleanWorldBuildingByGenre(worldBuilding: string, genre: string): string {
  if (!worldBuilding || !genre) return worldBuilding
  
  let result = worldBuilding
  
  const termsToRemove = getTermsToRemove(genre, worldBuilding)
  
  for (const term of termsToRemove) {
    result = result.replace(new RegExp(`(?:^|\\s|，|。|、|；|：|！|？|（|\\()${term}(?:$|\\s|，|。|、|；|：|！|？|）|\\))`, 'g'), '')
  }
  
  result = result.replace(/【\s*】/g, '').replace(/\s+/g, ' ').trim()
  
  return result
}

export function validateGenreConsistency(genre: string, powerSystem: string, worldBuilding: string, synopsis: string): { isConsistent: boolean; suggestedGenre?: string; conflicts: string[] } {
  if (!genre) {
    const detected = detectGenreByContent([powerSystem, worldBuilding, synopsis].join('\n'))
    return { isConsistent: false, suggestedGenre: detected, conflicts: ['题材为空，已自动检测'] }
  }
  
  const conflicts: string[] = []
  const allText = [powerSystem, worldBuilding, synopsis].join('\n')
  
  const mixedResult = detectMixedGenre(allText)
  
  if (isEasternGenre(genre)) {
    if (mixedResult.hasWestern && mixedResult.primary === '西方') {
      conflicts.push('检测到大量西方元素，与东方题材不一致')
    }
    if (mixedResult.hasWestern && mixedResult.primary === '混合') {
      conflicts.push('检测到混合元素，建议确认题材分类')
    }
  } else if (isWesternGenre(genre)) {
    if (mixedResult.hasEastern && mixedResult.primary === '东方') {
      conflicts.push('检测到大量东方元素，与西方题材不一致')
    }
    if (mixedResult.hasEastern && mixedResult.primary === '混合') {
      conflicts.push('检测到混合元素，建议确认题材分类')
    }
  } else if (isUrbanGenre(genre)) {
    if (mixedResult.hasEastern || mixedResult.hasWestern) {
      conflicts.push('都市题材中检测到玄幻/奇幻元素，建议确认题材分类')
    }
  } else if (isHistoricalGenre(genre)) {
    if (mixedResult.hasEastern || mixedResult.hasWestern) {
      conflicts.push('历史题材中检测到玄幻/奇幻元素，建议确认题材分类')
    }
  }
  
  if (conflicts.length > 0) {
    const detected = detectGenreByContent(allText)
    return { isConsistent: false, suggestedGenre: detected, conflicts }
  }
  
  return { isConsistent: true, conflicts: [] }
}

export function fixGenreByContent(genre: string, powerSystem: string, worldBuilding: string, synopsis: string): string {
  const validation = validateGenreConsistency(genre, powerSystem, worldBuilding, synopsis)
  
  if (validation.isConsistent) {
    return genre
  }
  
  if (validation.suggestedGenre && validation.suggestedGenre !== '玄幻') {
    return validation.suggestedGenre
  }
  
  return genre
}

export function cleanPunctuation(text: string): string {
  if (!text || typeof text !== 'string') return text
  
  let result = text
  
  result = result.replace(/([\u4e00-\u9fa5])\.([\u4e00-\u9fa5\s])/g, '$1。$2')
  result = result.replace(/([\u4e00-\u9fa5]),([\u4e00-\u9fa5\s])/g, '$1，$2')
  result = result.replace(/([\u4e00-\u9fa5])\?([\u4e00-\u9fa5\s])/g, '$1？$2')
  result = result.replace(/([\u4e00-\u9fa5])!([\u4e00-\u9fa5\s])/g, '$1！$2')
  result = result.replace(/([\u4e00-\u9fa5]):([\u4e00-\u9fa5\s])/g, '$1：$2')
  result = result.replace(/([\u4e00-\u9fa5]);([\u4e00-\u9fa5\s])/g, '$1；$2')
  
  result = result.replace(/([。！？，；：])\1+/g, '$1')
  result = result.replace(/[。！？，；：]{2,}/g, function(m) { return m.charAt(m.length - 1) })
  
  result = result.replace(/…{3,}/g, '……')
  result = result.replace(/\.{3,}/g, '……')
  
  const trimmed = result.trim()
  if (trimmed.length > 15 && /[\u4e00-\u9fa5]$/.test(trimmed) && !/[。！？…：”"）】》]$/.test(trimmed)) {
    result = trimmed + '。'
  } else if (trimmed.length > 15 && /[，；：、]$/.test(trimmed)) {
    result = trimmed.slice(0, -1) + '。'
  }
  
  result = result.replace(/[ \t]{2,}/g, ' ')
  
  return result
}

export function cleanString(value: unknown): string {
  if (typeof value !== 'string') return ''
  let result = value.trim()
  
  result = result.replace(/\u0000/g, '')
  result = result.replace(/[\r\n]+/g, '\n')
  result = result.replace(/\s+/g, ' ')
  
  for (const pattern of PLACEHOLDER_PATTERNS) {
    result = result.replace(pattern, '')
  }
  
  result = result.replace(/[<>{}[\]|]/g, '')
  
  result = result.replace(/[\u0080-\u00ff]/g, (char) => {
    if (char === '\u00b7') return char
    return ''
  })
  result = result.replace(/[\u200b-\u200f]/g, '')
  result = result.replace(/[\ufeff]/g, '')
  
  result = result.replace(/[^\u4e00-\u9fa5a-zA-Z0-9。，、；：！？""''（）《》【】——…·・•\.\s]/g, '')
  
  result = result.replace(/\d{1,2}:\d{2}\s*[原著小说|原著|解读|解析|盘点|统计|争议]/g, '')
  result = result.replace(/[原著小说|原著|解读|解析|盘点|统计|争议]\s*\d+/g, '')
  result = result.replace(/【书名】.*【作者】.*【简介】/g, '')
  
  result = result.replace(/(?:\s*\.\s*){2,}/g, ' ')
  result = result.replace(/(?:\s*，\s*){2,}/g, '，')
  result = result.replace(/(?:\s*。\s*){2,}/g, '。')
  result = result.replace(/(?:\s*；\s*){2,}/g, '；')
  result = result.replace(/(?:\s*！\s*){2,}/g, '！')
  result = result.replace(/(?:\s*？\s*){2,}/g, '？')
  
  result = result.replace(/\s{3,}/g, ' ')
  
  const chineseCharCount = (result.match(/[\u4e00-\u9fa5]/g) || []).length
  const totalLength = result.replace(/\s/g, '').length
  if (totalLength > 10 && chineseCharCount < totalLength * 0.3) {
    return ''
  }
  
  return result.trim()
}

function extractCharacterDescriptionFromSynopsis(charName: string, synopsis: string): string | undefined {
  if (!charName || !synopsis) return undefined
  
  const patterns = [
    new RegExp(`(${escapeRegExp(charName)}[^。；！？]{0,80}[。；！？])`, 'i'),
    new RegExp(`([^。；！？]{0,40}${escapeRegExp(charName)}[^。；！？]{0,40}[。；！？])`, 'i'),
    new RegExp(`(${escapeRegExp(charName)}[，,、与和及跟同][^。；！？]{0,60}[。；！？])`, 'i'),
  ]
  
  for (const pattern of patterns) {
    const match = synopsis.match(pattern)
    if (match && match[1]) {
      const description = match[1].trim()
      if (description.length >= 10 && description.length <= 150) {
        return description.replace(/[【\[]([^】\]]*)[】\]]/g, '$1')
      }
    }
  }
  
  return undefined
}

function generateDefaultWorldBuilding(genre: string, title: string, synopsis: string = ''): string {
  const worldElements: string[] = []
  const forceElements: string[] = []
  const geoElements: string[] = []
  
  if (synopsis) {
    const geoPatterns = [
      /(大陆|世界|星球|宇宙|神界|仙界|魔界|妖界|鬼界|冥界|凡界|人间|洪荒|太古|上古|远古)[^。；！？]{0,30}/g,
      /(宗门|门派|家族|圣地|帝国|王朝|联盟|公会|教廷|神殿)[^。；！？]{0,30}/g,
      /(秘境|禁地|洞府|深渊|峡谷|森林|山脉|海域|沙漠|草原)[^。；！？]{0,20}/g,
    ]
    
    for (const pattern of geoPatterns) {
      let match
      while ((match = pattern.exec(synopsis)) !== null) {
        const element = match[0].trim()
        if (element.length > 2 && element.length < 40) {
          if (/(大陆|世界|星球|宇宙|神界|仙界|魔界|妖界|鬼界|冥界|凡界|人间|洪荒|太古|上古|远古)/.test(element)) {
            if (!worldElements.includes(element)) worldElements.push(element)
          } else if (/(宗门|门派|家族|圣地|帝国|王朝|联盟|公会|教廷|神殿)/.test(element)) {
            if (!forceElements.includes(element)) forceElements.push(element)
          } else {
            if (!geoElements.includes(element)) geoElements.push(element)
          }
        }
      }
    }
  }
  
  let worldSetting = '【世界设定】\n'
  if (worldElements.length > 0) {
    worldSetting += worldElements.join('、') + '。'
  } else if (/东方玄幻|玄幻/.test(genre)) {
    worldSetting += '这是一个以修炼为主的世界，强者为尊。武道昌盛，宗门林立，各大势力争夺资源和机缘。'
  } else if (/仙侠|修真/.test(genre)) {
    worldSetting += '这是一个修仙世界，灵气充沛，宗门林立。从凡人到仙人，修行之路漫长而艰辛。'
  } else if (/西方奇幻|奇幻/.test(genre)) {
    worldSetting += '这是一个魔法与武技并存的奇幻世界。魔法学院、骑士团、神殿等势力掌控着大陆的命运。'
  } else if (/都市/.test(genre)) {
    worldSetting += '这是一个繁华的现代都市，隐藏着不为人知的秘密和特殊能力者。'
  } else if (/历史/.test(genre)) {
    worldSetting += '这是一个古代王朝背景的世界，群雄逐鹿，权谋纷争不断。'
  } else if (/科幻/.test(genre)) {
    worldSetting += '这是一个科技高度发达的未来世界，人类已进入星际时代，探索宇宙的奥秘。'
  } else if (/悬疑|恐怖/.test(genre)) {
    worldSetting += '这是一个充满神秘事件和未知危险的世界，各种诡异现象层出不穷。'
  } else {
    worldSetting += `${title}的世界充满冒险和挑战，强者为尊，弱肉强食。`
  }
  
  let forceSetting = '【势力设定】\n'
  if (forceElements.length > 0) {
    forceSetting += forceElements.join('、') + '等势力并存，相互制衡。'
  } else if (/东方玄幻|玄幻/.test(genre)) {
    forceSetting += '各大宗门、家族、圣地、帝国等势力掌控修炼资源，相互争夺地盘和机缘。\n【顶级势力】\n拥有最强战力和最丰富资源的超级势力，主宰一方。\n【中小势力】\n依附于顶级势力，在夹缝中求生存和发展。'
  } else if (/仙侠|修真/.test(genre)) {
    forceSetting += '宗门、散修、仙域势力等各种修仙势力并存，为争夺仙缘和资源展开激烈竞争。\n【顶级势力】\n仙界大门派和上古传承势力，掌握修仙核心奥秘。\n【中小势力】\n凡间宗门和散修联盟，寻求飞升之路。'
  } else if (/西方奇幻|奇幻/.test(genre)) {
    forceSetting += '帝国、魔法学院、公会、教廷等势力并存，在魔法与武技的世界中争夺霸权。\n【顶级势力】\n强大帝国和魔法圣殿，掌握最高魔法传承。\n【中小势力】\n各城邦和冒险者公会，在各大势力间周旋。'
  } else if (/都市/.test(genre)) {
    forceSetting += '官方组织、地下势力、商业巨头等并存，在繁华都市中明争暗斗。\n【正道势力】\n维护城市秩序的官方组织和正义力量。\n【地下势力】\n控制灰色地带的黑道组织和神秘势力。'
  } else if (/历史/.test(genre)) {
    forceSetting += '朝廷、诸侯、世家、江湖门派等势力并存，在乱世中争夺天下。\n【朝廷势力】\n掌控正统权力的中央王朝和皇室。\n【地方势力】\n割据一方的诸侯和世家大族。'
  } else if (/科幻/.test(genre)) {
    forceSetting += '星际联盟、外星文明、星际海盗等势力并存，在宇宙中争夺资源和领地。\n【顶级势力】\n掌握星际核心科技的星际联盟和强大外星文明。\n【中小势力】\n各星球势力和星际商团，在宇宙中寻求发展。'
  } else if (/悬疑|恐怖/.test(genre)) {
    forceSetting += '官方机构、神秘组织、邪恶势力等并存，围绕各种神秘事件展开博弈。\n【调查机构】\n负责调查神秘事件的官方和半官方组织。\n【神秘势力】\n掌握超自然力量的各种神秘组织。'
  } else {
    forceSetting += '各大势力掌握资源和权力，为争夺利益展开激烈斗争。\n【顶级势力】\n掌控世界核心资源和权力的最强势力。\n【中小势力】\n依附于顶级势力的各种组织和团体。'
  }
  
  let geoSetting = '【地理设定】\n'
  if (geoElements.length > 0) {
    geoSetting += geoElements.join('、') + '是主角的主要活动区域。'
  } else {
    geoSetting += `${title}世界是主角的主要活动之地，包含各种地域和神秘场所。\n【核心区域】\n世界的中心地带，汇聚最丰富的资源和最强的势力。\n【边缘区域】\n世界的边缘地带，充满未知和危险。`
  }
  
  return `${worldSetting}\n${forceSetting}\n${geoSetting}`
}

function generateDefaultWritingStyle(genre: string, title: string, synopsis: string = ''): string {
  if (synopsis && synopsis.length > 30) {
    const stylePatterns = [
      /(情节|故事|剧情)[^。；！？]{0,30}/g,
      /(主角|人物|角色)[^。；！？]{0,30}/g,
      /(战斗|修炼|成长|冒险)[^。；！？]{0,30}/g,
    ]
    const styleElements: string[] = []
    for (const pattern of stylePatterns) {
      let match
      while ((match = pattern.exec(synopsis)) !== null) {
        const element = match[0].trim()
        if (element.length > 4 && element.length < 40 && !styleElements.includes(element)) {
          styleElements.push(element)
        }
      }
    }
    if (styleElements.length > 0) {
      return `本书围绕${styleElements.join('、')}展开，情节紧凑，引人入胜。作者擅长刻画人物内心世界和复杂关系，让读者沉浸其中。`
    }
  }
  
  if (/东方玄幻|玄幻/.test(genre)) {
    return `${title}以主角的修炼成长为主线，情节紧凑，战斗场面精彩。作者擅长描写修炼体系和势力斗争，让读者感受到一个宏大的玄幻世界。`
  } else if (/仙侠|修真/.test(genre)) {
    return `${title}以主角的修仙之路为主线，情节紧凑，逻辑严密。作者擅长描写修仙体系和天劫考验，让读者感受到修仙的艰辛与壮丽。`
  } else if (/西方奇幻|奇幻/.test(genre)) {
    return `${title}以主角的冒险为主线，情节紧凑，充满奇幻元素。作者擅长描写魔法体系和种族冲突，让读者感受到一个充满想象力的奇幻世界。`
  } else if (/都市/.test(genre)) {
    return `${title}以主角的都市生活为主线，情节紧凑，贴近现实。作者擅长描写都市人际关系和社会现象，让读者产生共鸣。`
  } else if (/历史/.test(genre)) {
    return `${title}以主角的古代奋斗为主线，情节跌宕起伏，充满权谋智慧。作者擅长描写历史背景和人物刻画，让读者感受到历史的厚重与精彩。`
  } else if (/科幻/.test(genre)) {
    return `${title}以主角的宇宙探索为主线，情节紧凑，充满科幻元素。作者擅长描写科技设定和宇宙奇观，让读者感受到未来世界的无限可能。`
  } else if (/悬疑|恐怖/.test(genre)) {
    return `${title}以主角的探索为主线，情节紧凑，充满悬疑元素。作者擅长描写心理描写和氛围营造，让读者感受到紧张刺激的阅读体验。`
  } else {
    return `${title}以主角的成长为主线，情节紧凑，充满激情。作者擅长描写人物成长和情节转折，让读者感受到故事的魅力。`
  }
}

function generateDefaultSellingPoints(genre: string, title: string, synopsis: string = ''): string[] {
  const points: string[] = []
  
  if (synopsis && synopsis.length > 30) {
    const sellingPatterns = [
      { pattern: /(穿越|重生|系统|金手指|天赋|机遇|传承)/g, label: '独特设定' },
      { pattern: /(升级|修炼|突破|成长|逆袭|变强|崛起)/g, label: '成长升级' },
      { pattern: /(战斗|对决|战争|争霸|热血)/g, label: '精彩战斗' },
      { pattern: /(权谋|智慧|计谋|策略)/g, label: '权谋智慧' },
      { pattern: /(感情|爱情|道侣|妻子|恋人)/g, label: '感情线' },
      { pattern: /(冒险|探索|秘境|寻宝)/g, label: '冒险探索' },
      { pattern: /(搞笑|轻松|幽默)/g, label: '轻松搞笑' },
      { pattern: /(悬疑|推理|神秘|诡异)/g, label: '悬疑推理' },
      { pattern: /(宏大|广阔|庞大|史诗)/g, label: '宏大世界观' },
    ]
    
    for (const { pattern, label } of sellingPatterns) {
      if (pattern.test(synopsis) && !points.includes(label)) {
        points.push(label)
      }
    }
  }
  
  if (points.length === 0) {
    if (/东方玄幻|玄幻/.test(genre)) {
      points.push('修炼升级', '战斗场面', '逆袭成长', '修炼体系', '宏大世界观')
    } else if (/仙侠|修真/.test(genre)) {
      points.push('修仙体系', '战斗场面', '成长历程', '修仙世界', '宏大世界观')
    } else if (/西方奇幻|奇幻/.test(genre)) {
      points.push('魔法武技', '战斗场面', '宏大格局', '独特设定', '奇幻世界')
    } else if (/都市/.test(genre)) {
      points.push('都市生活', '人物关系', '成长历程', '现实设定', '社会现象')
    } else if (/历史/.test(genre)) {
      points.push('历史谋略', '人物刻画', '历史背景', '权谋智慧', '争霸天下')
    } else if (/科幻/.test(genre)) {
      points.push('宇宙探索', '科技设定', '宇宙世界观', '外星文明', '未来世界')
    } else if (/悬疑|恐怖/.test(genre)) {
      points.push('悬疑推理', '紧凑情节', '独特设定', '场景描写', '心理描写')
    } else {
      points.push('精彩故事', '独特设定', '成长历程', '紧凑情节', '人物刻画')
    }
  }
  
  return points.slice(0, 5)
}

function extractRoleKeywords(description: string): string[] {
  const keywords: string[] = []
  
  const rolePatterns = [
    { keywords: ['穿越', '重生', '转世', '魂穿'], label: '穿越者' },
    { keywords: ['天才', '妖孽', '绝世', '无双', '逆天'], label: '天才' },
    { keywords: ['废柴', '废物', '废材', '弃'], label: '废柴逆袭' },
    { keywords: ['孤儿', '弃儿', '父母双亡'], label: '孤儿' },
    { keywords: ['家族', '少爷', '公子', '小姐', '少主'], label: '家族子弟' },
    { keywords: ['宗门', '弟子', '内门', '外门', '真传'], label: '宗门弟子' },
    { keywords: ['圣体', '神体', '血脉', '武魂', '灵根'], label: '特殊体质' },
    { keywords: ['系统', '金手指', '天赋', '传承'], label: '金手指' },
    { keywords: ['复仇', '报仇', '雪恨'], label: '复仇者' },
    { keywords: ['争霸', '统一', '天下'], label: '争霸者' },
    { keywords: ['仙帝', '仙尊', '天尊', '大帝', '至尊'], label: '至强者' },
    { keywords: ['剑修', '体修', '丹修', '符修', '阵修'], label: '特殊修炼者' },
    { keywords: ['魔法师', '剑士', '骑士', '牧师'], label: '职业者' },
    { keywords: ['校花', '总裁', '兵王', '神医'], label: '都市强者' },
    { keywords: ['皇帝', '帝王', '太子', '皇子'], label: '皇室成员' },
  ]
  
  for (const { keywords: patternKeywords, label } of rolePatterns) {
    for (const kw of patternKeywords) {
      if (description.includes(kw)) {
        keywords.push(label)
        break
      }
    }
  }
  
  return keywords
}

function extractRoleType(name: string, description: string): string {
  const roleKeywords: Record<string, string> = {
    '主角': '主角', '男主角': '主角', '男主人公': '主角', '男一号': '主角', '男主': '主角',
    '女主': '女主角', '女主角': '女主角', '女主人公': '女主角', '女一号': '女主角',
    '反派': '反派', '大反派': '反派', '最终BOSS': '反派', 'BOSS': '反派', '魔头': '反派', '魔尊': '反派', '妖皇': '反派', '黑暗': '反派', '邪恶': '反派',
    '师父': '导师', '师傅': '导师', '师尊': '导师', '师祖': '导师', '恩师': '导师',
    '兄弟': '兄弟', '兄长': '兄弟', '弟弟': '兄弟', '大哥': '兄弟', '二哥': '兄弟',
    '姐妹': '姐妹', '姐姐': '姐妹', '妹妹': '姐妹',
    '父亲': '至亲', '母亲': '至亲', '爹': '至亲', '娘': '至亲', '爷爷': '至亲', '奶奶': '至亲',
    '妻子': '伴侣', '老婆': '伴侣', '夫人': '伴侣', '爱人': '伴侣', '道侣': '伴侣', '双修': '伴侣', '恋人': '伴侣', '女友': '伴侣', '未婚妻': '伴侣', '红颜': '伴侣', '挚爱': '伴侣',
    '朋友': '朋友', '好友': '朋友', '损友': '朋友',
    '宿敌': '宿敌', '对手': '宿敌', '仇人': '宿敌', '死敌': '宿敌',
    '弟子': '弟子', '徒弟': '弟子', '传人': '弟子', '继承者': '弟子',
    '女王': '强者', '女皇': '强者', '帝王': '强者', '霸主': '强者', '主宰': '强者', '至尊': '强者', '仙帝': '强者', '仙尊': '强者', '天尊': '强者', '大帝': '强者', '神皇': '强者', '神尊': '强者',
    '王子': '贵族', '郡主': '贵族', '世子': '贵族', '公子': '贵族', '少爷': '贵族', '小姐': '贵族',
    '圣女': '圣女', '神女': '圣女', '仙女': '圣女', '仙子': '圣女',
    '长老': '长老', '族长': '长老', '阁主': '长老', '门主': '长老', '宗主': '长老', '盟主': '长老',
    '妖孽': '天才', '绝世': '天才', '无双': '天才', '逆天': '天才', '绝世天才': '天才',
    '废物': '逆袭者', '弃': '逆袭者', '废材': '逆袭者',
    '穿越': '穿越者', '重生': '穿越者', '转世': '穿越者', '魂穿': '穿越者',
    '系统': '金手指', '天赋': '金手指', '传承': '金手指',
    '复仇': '复仇者', '报仇': '复仇者', '雪恨': '复仇者',
    '争霸': '争霸者', '统一': '争霸者', '天下': '争霸者',
    '剑修': '修炼者', '体修': '修炼者', '丹修': '修炼者', '符修': '修炼者', '阵修': '修炼者', '器修': '修炼者', '佛修': '修炼者', '魔修': '修炼者', '道修': '修炼者',
    '魔法师': '职业者', '剑士': '职业者', '骑士': '职业者', '弓箭手': '职业者', '刺客': '职业者', '盗贼': '职业者', '召唤师': '职业者',
    '校花': '都市强者', '总裁': '都市强者', '兵王': '都市强者', '神医': '都市强者', '战神': '都市强者', '特种兵': '都市强者',
    '皇帝': '皇室成员', '太子': '皇室成员', '皇子': '皇室成员', '公主': '皇室成员', '王爷': '皇室成员',
    '将军': '武将', '元帅': '武将', '大将': '武将', '统领': '武将', '统帅': '武将',
    '谋士': '谋士', '军师': '谋士', '智囊': '谋士', '策士': '谋士',
    '老师': '导师',
    '知己': '朋友',
    '挚友': '朋友',
    '敌人': '宿敌',
  }
  
  for (const [keyword, roleType] of Object.entries(roleKeywords)) {
    if (description.includes(keyword)) {
      return roleType
    }
  }
  
  return '角色'
}

function extractCharacterTraits(name: string, description: string, genre: string): string[] {
  const traits: string[] = []
  
  const traitPatterns: Record<string, string[]> = {
    '神秘': ['神秘', '谜', '未知', '隐藏', '秘密', '神秘身世', '神秘背景'],
    '强大': ['强大', '无敌', '恐怖', '可怕', '震撼', '惊天', '盖世', '绝世'],
    '温柔': ['温柔', '善良', '纯真', '清纯', '甜美', '可爱', '温婉'],
    '冷酷': ['冷酷', '冷漠', '无情', '残忍', '嗜血', '狠辣', '杀伐果断'],
    '聪明': ['聪明', '智慧', '机智', '睿智', '谋略', '计谋', '算无遗策'],
    '忠诚': ['忠诚', '忠心', '义气', '重情', '情义', '仗义', '肝胆相照'],
    '傲娇': ['傲娇', '高冷', '冰山', '冷艳', '孤傲'],
    '活泼': ['活泼', '开朗', '俏皮', '灵动', '古灵精怪'],
    '坚韧': ['坚韧', '不屈', '顽强', '执着', '毅力', '毅力惊人'],
    '善良': ['善良', '慈悲', '博爱', '仁慈', '乐于助人'],
    '霸气': ['霸气', '威严', '王者', '君临', '霸气侧漏'],
    '低调': ['低调', '隐忍', '谦逊', '内敛', '深藏不露'],
    '嚣张': ['嚣张', '张扬', '狂傲', '霸道', '桀骜'],
    '痴情': ['痴情', '专一', '执着', '深情', '一往情深'],
    '腹黑': ['腹黑', '狡诈', '阴险', '城府', '计谋'],
    '热血': ['热血', '激情', '豪迈', '慷慨', '热血沸腾'],
    '冷静': ['冷静', '沉稳', '淡定', '从容', '临危不乱'],
    '幽默': ['幽默', '搞笑', '风趣', '诙谐', '逗比'],
    '神秘莫测': ['神秘莫测', '深不可测', '难以捉摸'],
  }
  
  for (const [trait, keywords] of Object.entries(traitPatterns)) {
    for (const keyword of keywords) {
      if (description.includes(keyword)) {
        if (!traits.includes(trait)) {
          traits.push(trait)
        }
        break
      }
    }
  }
  
  return traits.slice(0, 3)
}

function extractCharacterBackground(name: string, description: string, genre: string): string {
  const backgroundPatterns: Record<string, string[]> = {
    '贵族': ['贵族', '王族', '皇室', '世家', '豪门', '门阀', '大家族', '名门', '望族'],
    '平民': ['平民', '凡人', '普通', '草根', '底层', '出身低微'],
    '孤儿': ['孤儿', '父母双亡', '无依无靠', '孤身一人'],
    '天才': ['天才', '妖孽', '绝世天才', '天赋异禀', '天资聪颖'],
    '废柴': ['废柴', '废物', '废材', '资质平庸', '无法修炼'],
    '传承': ['传承', '上古传承', '远古传承', '神之传承', '血脉传承'],
    '转世': ['转世', '重生', '轮回转世', '灵魂转世'],
    '穿越': ['穿越', '魂穿', '重生', '异界'],
    '宗门': ['宗门', '门派', '圣地', '仙门', '魔宗', '佛宗', '道门'],
    '学院': ['学院', '书院', '学堂', '魔法学院', '武学院'],
    '家族': ['家族', '世家', '宗族', '氏族'],
    '帝国': ['帝国', '王国', '王朝', '皇朝', '皇室'],
    '军队': ['军队', '军团', '战团', '武装', '军方', '兵'],
    '商': ['商', '商人', '商会', '商行', '交易'],
    '神秘组织': ['神秘组织', '暗影', '暗杀', '杀手', '刺客', '情报'],
    '上古': ['上古', '远古', '太古', '鸿蒙', '混沌'],
    '神裔': ['神裔', '神族', '血脉', '神兽血脉', '龙族血脉'],
    '魔族': ['魔族', '魔修', '魔道', '恶魔', '魔'],
    '妖族': ['妖族', '妖兽', '灵兽', '神兽', '妖族公主'],
    '鬼族': ['鬼族', '亡灵', '僵尸', '幽灵', '魂魄'],
    '仙': ['仙', '仙子', '仙人', '仙族', '仙宫'],
    '佛': ['佛', '佛祖', '佛门', '佛宗', '和尚', '僧人'],
    '道': ['道', '道门', '道家', '道士', '真人'],
    '巫': ['巫', '巫族', '巫道', '大巫', '祖巫'],
    '精灵': ['精灵', '精灵族', '精灵公主', '精灵王子'],
    '矮人': ['矮人', '矮人族'],
    '兽人': ['兽人', '兽人族'],
    '吸血鬼': ['吸血鬼', '血族'],
    '狼人': ['狼人', '狼族'],
    '龙族': ['龙族', '龙', '巨龙', '神龙'],
  }
  
  for (const [background, keywords] of Object.entries(backgroundPatterns)) {
    for (const keyword of keywords) {
      if (description.includes(keyword)) {
        return background
      }
    }
  }
  
  if (/玄幻|东方玄幻/.test(genre)) return '修炼者'
  if (/仙侠|修真/.test(genre)) return '修士'
  if (/奇幻|剑与魔法/.test(genre)) return '冒险者'
  if (/都市|都市异能/.test(genre)) return '都市人'
  if (/历史|架空历史/.test(genre)) return '古代人'
  
  return '人物'
}

function extractCharacterAbility(name: string, description: string, genre: string): string {
  const abilityPatterns: Record<string, string[]> = {
    '修炼天赋': ['天赋', '灵根', '血脉', '武魂', '斗魂', '特殊体质', '体质'],
    '战斗': ['战斗', '武技', '剑法', '刀法', '拳术', '掌法', '身法', '战技'],
    '魔法': ['魔法', '元素', '雷系', '火系', '冰系', '水系', '风系', '光明', '黑暗', '亡灵', '召唤', '植物', '暗影'],
    '炼丹': ['炼丹', '丹道', '丹药', '丹方', '丹术'],
    '炼器': ['炼器', '炼器术', '锻造', '锻造术', '兵器'],
    '阵法': ['阵法', '阵道', '布阵', '阵术'],
    '符箓': ['符箓', '符道', '画符', '符术'],
    '医术': ['医术', '医道', '疗伤', '治疗', '治愈'],
    '毒术': ['毒术', '毒功', '毒功', '用毒'],
    '幻术': ['幻术', '幻境', '迷幻'],
    '精神力': ['精神力', '神识', '灵魂', '魂技'],
    '空间': ['空间', '瞬移', '传送', '空间法则'],
    '时间': ['时间', '时间法则', '时间加速', '时间减速'],
    '法则': ['法则', '领悟法则', '法则之力'],
    '神器': ['神器', '法宝', '仙器', '魔器', '灵器', '宝器'],
    '系统': ['系统', '金手指', '面板', '任务'],
    '智慧': ['智慧', '谋略', '计谋', '算计', '策略'],
    '经商': ['经商', '商业', '生意', '赚钱', '贸易'],
    '修炼': ['修炼', '功法', '心法', '内功', '外功'],
  }
  
  for (const [ability, keywords] of Object.entries(abilityPatterns)) {
    for (const keyword of keywords) {
      if (description.includes(keyword)) {
        return ability
      }
    }
  }
  
  if (/玄幻|东方玄幻/.test(genre)) return '修炼'
  if (/仙侠|修真/.test(genre)) return '修仙'
  if (/奇幻|剑与魔法/.test(genre)) return '魔法/武技'
  if (/都市|都市异能/.test(genre)) return '特殊能力'
  
  return '能力'
}

function generateCharacterPosition(name: string, role: string, description: string, genre: string): string {
  const fullDesc = description || ''
  
  const roleType = extractRoleType(name, fullDesc + role)
  const traits = extractCharacterTraits(name, fullDesc, genre)
  const background = extractCharacterBackground(name, fullDesc, genre)
  const ability = extractCharacterAbility(name, fullDesc, genre)
  
  const positionParts: string[] = []
  
  const roleKeywords: Record<string, string> = {
    '主角': '故事核心人物',
    '男主角': '故事核心人物',
    '女主': '重要女性角色',
    '女主角': '重要女性角色',
    '反派': '对立角色',
    '大反派': '主要对立角色',
    '配角': '辅助角色',
    '重要配角': '关键辅助角色',
  }
  
  if (role && roleKeywords[role]) {
    positionParts.push(roleKeywords[role])
  }
  
  if (roleType && roleType !== '角色') {
    if (roleType === '主角') {
      if (/玄幻|东方玄幻/.test(genre)) positionParts.push('身负神秘机遇，从底层崛起的修炼天才')
      else if (/仙侠|修真/.test(genre)) positionParts.push('踏上修仙之路，追求长生的修行者')
      else if (/奇幻|剑与魔法/.test(genre)) positionParts.push('拥有特殊天赋，开创传奇的冒险者')
      else if (/都市|都市异能/.test(genre)) positionParts.push('拥有特殊能力，在都市中崛起的强者')
      else if (/历史|架空历史/.test(genre)) positionParts.push('改变历史走向，开创盛世的穿越者')
      else if (/科幻/.test(genre)) positionParts.push('探索宇宙，开创未来的先驱者')
      else if (/悬疑|恐怖/.test(genre)) positionParts.push('揭开真相，战胜恐惧的探索者')
      else positionParts.push('故事的核心主角')
    } else if (roleType === '女主角') {
      if (/玄幻|东方玄幻/.test(genre)) positionParts.push('与主角相知相恋，共同成长的红颜知己')
      else if (/仙侠|修真/.test(genre)) positionParts.push('与主角携手修仙，共渡天劫的伴侣')
      else if (/奇幻|剑与魔法/.test(genre)) positionParts.push('与主角并肩作战的女魔法师/女战士')
      else if (/都市|都市异能/.test(genre)) positionParts.push('与主角携手共进的都市佳人')
      else if (/历史|架空历史/.test(genre)) positionParts.push('与主角相知相守，共创盛世的红颜')
      else positionParts.push('与主角有深厚感情的女主角')
    } else if (roleType === '反派') {
      positionParts.push('与主角对立，推动剧情发展的强大敌人')
    } else if (roleType === '导师') {
      positionParts.push('主角的引路人与导师，传授知识和经验')
    } else if (roleType === '兄弟') {
      positionParts.push('主角最信任的兄弟与伙伴，并肩作战')
    } else if (roleType === '姐妹') {
      positionParts.push('主角的姐妹，关心支持主角')
    } else if (roleType === '至亲') {
      positionParts.push('主角的至亲之人，给予温暖和支持')
    } else if (roleType === '伴侣') {
      positionParts.push('与主角相爱，共同面对风雨的伴侣')
    } else if (roleType === '朋友') {
      positionParts.push('主角的好友，关键时刻挺身而出')
    } else if (roleType === '宿敌') {
      positionParts.push('主角一生的宿敌，相互竞争成长')
    } else if (roleType === '弟子') {
      positionParts.push('主角的弟子，传承衣钵')
    } else if (roleType === '强者') {
      positionParts.push('站在世界巅峰的强大存在')
    } else if (roleType === '贵族') {
      positionParts.push('出身名门望族的贵族子弟')
    } else if (roleType === '圣女') {
      positionParts.push('身份尊贵、天赋出众的圣女')
    } else if (roleType === '长老') {
      positionParts.push('宗门/家族的德高望重的长老')
    } else if (roleType === '天才') {
      positionParts.push('天赋异禀的绝世天才')
    } else if (roleType === '逆袭者') {
      positionParts.push('从废柴逆袭成为强者的励志人物')
    } else if (roleType === '穿越者') {
      positionParts.push('穿越/重生到异世的现代人')
    } else if (roleType === '金手指') {
      positionParts.push('拥有特殊系统或传承的幸运儿')
    } else if (roleType === '复仇者') {
      positionParts.push('为复仇而踏上修炼之路的复仇者')
    } else if (roleType === '争霸者') {
      positionParts.push('立志争霸天下的强者')
    } else if (roleType === '修炼者') {
      positionParts.push('专注于修炼某一领域的修行者')
    } else if (roleType === '职业者') {
      positionParts.push('拥有特殊职业能力的强者')
    } else if (roleType === '都市强者') {
      positionParts.push('在都市中拥有特殊身份的强者')
    } else if (roleType === '皇室成员') {
      positionParts.push('拥有皇室血脉的尊贵人物')
    } else if (roleType === '武将') {
      positionParts.push('驰骋沙场的勇猛武将')
    } else if (roleType === '谋士') {
      positionParts.push('谋略过人的智囊谋士')
    } else {
      positionParts.push(`故事中的${roleType}`)
    }
  } else if (role && !roleKeywords[role]) {
    if (/玄幻|东方玄幻/.test(genre)) positionParts.push('在玄幻世界中奋斗的修行者')
    else if (/仙侠|修真/.test(genre)) positionParts.push('在修仙路上追寻大道的修士')
    else if (/奇幻|剑与魔法/.test(genre)) positionParts.push('在奇幻世界中冒险的冒险者')
    else if (/都市|都市异能/.test(genre)) positionParts.push('在都市中生活的人物')
    else positionParts.push('故事中的重要角色')
  }
  
  if (traits.length > 0) {
    positionParts.push('性格' + traits.join('、'))
  }
  
  if (background && !positionParts.some(p => p.includes(background))) {
    positionParts.push(background + '出身')
  }
  
  if (ability && !positionParts.some(p => p.includes(ability))) {
    positionParts.push('擅长' + ability)
  }
  
  const result = positionParts.join('，')
  
  if (result.length < 15 && fullDesc.length >= 15) {
    const trimmedDesc = fullDesc.substring(0, 30).replace(/[。，、；！？]/g, '')
    return trimmedDesc.length > 0 ? trimmedDesc : result
  }
  
  return result.length > 50 ? result.substring(0, 50) + '...' : result
}

function generateFemaleLeadInfo(characters: BookCharacter[], title: string, genre: string, synopsis: string = '') {
  if (!characters || characters.length === 0) return undefined
  
  const protagonistName = characters.find(c => c.role === '主角' || c.role === '男主角')?.name || ''
  
  let femaleLead = characters.find(c => 
    c.role === '女主' || c.role === '女主角' || c.position === '女主角' || c.position === '女主'
  )
  
  if (!femaleLead) {
    const wifeKeywords = /妻子|老婆|女友|未婚妻|道侣|爱人|挚爱|心上人|初恋|红颜知己|恋人|伴侣|仙侣|双修伴侣|女友|情人|爱慕|喜欢|暗恋|追求/
    femaleLead = characters.find(c => {
      if (c.name === protagonistName) return false
      const desc = (c.note || c.description || '')
      return wifeKeywords.test(desc)
    })
  }
  
  if (!femaleLead && synopsis) {
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
      /女主[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
      /女主角[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
      /喜欢[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
      /爱慕[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
      /暗恋[：:]\s*([\u4e00-\u9fa5·]{2,10})/,
    ]
    for (const p of relationPatterns) {
      const m = synopsis.match(p)
      if (m && m[1]) {
        const name = m[1].trim()
        if (name !== protagonistName && name.length >= 2 && name.length <= 12) {
          const existing = characters.find(c => c.name === name)
          if (existing) {
            femaleLead = existing
            break
          } else {
            femaleLead = { name, role: '女主', note: '从简介中提取', position: '女主角', description: '' }
            break
          }
        }
      }
    }
  }
  
  if (!femaleLead && synopsis) {
    const namePattern = /([\u4e00-\u9fa5·]{2,6})与主角|([\u4e00-\u9fa5·]{2,6})和主角|([\u4e00-\u9fa5·]{2,6})和(?:他|主角|男主角)/
    const match = synopsis.match(namePattern)
    if (match) {
      for (let i = 1; i <= 3; i++) {
        if (match[i] && match[i] !== protagonistName && match[i].length >= 2) {
          const name = match[i].trim()
          const existing = characters.find(c => c.name === name)
          if (existing) {
            femaleLead = existing
            break
          }
        }
      }
    }
  }
  
  if (!femaleLead) {
    const femaleNameChars = /婷|雪|月|灵|琪|瑶|妍|娜|琳|静|雅|芳|丽|美|柔|婉|馨|欣|怡|慧|倩|颖|娇|薇|蓉|梅|兰|菊|荷|莲|莺|燕|蝶|花|香|琴|棋|书|画|舞|歌|诗|梦|幻|仙|羽|裳|茹|钰|梓|萱|涵|诺|汐|沐|苒|玥|歆|兮|嫣|姝|妃|姬|公主|女王|女神/
    const maleNameChars = /雷|刚|强|军|伟|勇|杰|涛|明|超|平|龙|虎|豹|彪|峰|锋|磊|岩|石|铁|钢|雄|豪|俊|凯|毅|斌|波|辉|建|国|华|保|东|力|春|新|利|飞|彬|富|顺|信|子|腾|世|轮|宇|泽|浩|然|轩|晨|辰|阳|昊|天|云|风|林|山|河|海|江|川|洋|鹏|程|翔|航|博|睿|智|聪|亮|光|炎|焱|霸|王|皇|帝/
    
    const femaleCandidates = characters.filter(c => {
      if (c.name === protagonistName) return false
      const hasFemale = femaleNameChars.test(c.name)
      const hasMale = maleNameChars.test(c.name)
      return hasFemale && !hasMale
    })
    
    if (femaleCandidates.length > 0) {
      femaleCandidates.sort((a, b) => {
        const aDesc = a.description || a.note || ''
        const bDesc = b.description || b.note || ''
        const wifeWords = /妻子|老婆|女友|未婚妻|道侣|爱人|挚爱|心上人|红颜知己|恋人|伴侣/
        if (wifeWords.test(aDesc) && !wifeWords.test(bDesc)) return -1
        if (!wifeWords.test(aDesc) && wifeWords.test(bDesc)) return 1
        return 0
      })
      femaleLead = femaleCandidates[0]
    }
  }
  
  if (!femaleLead && characters.length >= 2) {
    const nonProtagonist = characters.filter(c => c.name !== protagonistName)
    if (nonProtagonist.length > 0) {
      nonProtagonist.sort((a, b) => {
        const aDesc = a.description || a.note || ''
        const bDesc = b.description || b.note || ''
        const wifeWords = /妻子|老婆|女友|未婚妻|道侣|爱人|挚爱|心上人|红颜知己|恋人|伴侣/
        if (wifeWords.test(aDesc) && !wifeWords.test(bDesc)) return -1
        if (!wifeWords.test(aDesc) && wifeWords.test(bDesc)) return 1
        return 0
      })
      femaleLead = nonProtagonist[0]
    }
  }
  
  if (!femaleLead) {
    return {
      name: '暂无明确女主',
      description: `《${title}》中暂未明确女主角，可能是一部以男主成长为主线的${genre}小说，随着剧情发展可能会出现重要女性角色。`,
    }
  }
  
  let description = femaleLead.description || femaleLead.note || ''
  if (!description) {
    if (/玄幻|东方玄幻/.test(genre)) {
      description = `${femaleLead.name}是${title}的女主角，与主角有着深厚的感情羁绊，在主角的成长道路上起到了重要的支持作用。她拥有独特的天赋和背景，是故事中不可或缺的重要角色。`
    } else if (/仙侠|修真/.test(genre)) {
      description = `${femaleLead.name}是${title}的女主角，一位美丽的仙子，与主角相知相守，共同踏上修仙之路。她身世神秘，天赋出众，在修仙界中有着重要的地位。`
    } else if (/奇幻|剑与魔法/.test(genre)) {
      description = `${femaleLead.name}是${title}的女主角，拥有强大的魔法能力，与主角并肩作战。她来自神秘的魔法家族，在冒险中逐渐成长为强大的魔法师。`
    } else if (/都市|都市异能/.test(genre)) {
      description = `${femaleLead.name}是${title}的女主角，在都市中与主角相识相知，共同面对各种挑战。她聪明美丽，有着独特的魅力和能力。`
    } else if (/历史|架空历史/.test(genre)) {
      description = `${femaleLead.name}是${title}的女主角，与主角在乱世中相遇，共同书写历史传奇。她出身名门，聪慧过人，在权谋斗争中展现出非凡的智慧。`
    } else if (/科幻/.test(genre)) {
      description = `${femaleLead.name}是${title}的女主角，与主角一起探索宇宙，在科技高度发达的未来世界中共同面对挑战。她拥有独特的智慧和能力，是主角不可或缺的伙伴。`
    } else if (/悬疑|恐怖/.test(genre)) {
      description = `${femaleLead.name}是${title}的女主角，与主角一起揭开各种神秘事件的真相。她勇敢机智，在悬疑和恐怖的世界中展现出非凡的勇气和智慧。`
    } else {
      description = `${femaleLead.name}是${title}的女主角，与主角有着深厚的感情，在故事中起到重要作用。她性格鲜明，是故事中不可或缺的重要角色。`
    }
  }
  
  return {
    name: femaleLead.name,
    description,
  }
}

function generateProtagonistInfo(characters: BookCharacter[], title: string, genre: string, synopsis: string = '') {
  if (!characters || characters.length === 0) return undefined
  
  const protagonist = characters.find(c => 
    c.role === '主角' || c.role === '男主角' || c.position === '主角' || c.position === '男主角'
  ) || characters[0]
  
  let description = protagonist.description || protagonist.note || ''
  if (!description) {
    if (/玄幻|东方玄幻/.test(genre)) {
      description = `${protagonist.name}是${title}的主角，身负神秘机遇，从底层崛起，一路披荆斩棘，最终登临武道巅峰的传奇人物。他性格坚毅，天赋出众，在修炼之路上不断突破自我。`
    } else if (/仙侠|修真/.test(genre)) {
      description = `${protagonist.name}是${title}的主角，踏上修仙之路，历经磨难，渡劫飞升，最终成就仙道至尊的修行者。他意志坚定，机缘深厚，在修仙界中创造了属于自己的传奇。`
    } else if (/奇幻|剑与魔法/.test(genre)) {
      description = `${protagonist.name}是${title}的主角，拥有特殊天赋或传承，在魔法与武技的世界中开创传奇的冒险者。他勇敢无畏，智慧过人，在冒险中不断成长。`
    } else if (/都市|都市异能/.test(genre)) {
      description = `${protagonist.name}是${title}的主角，在都市中拥有特殊能力或背景，一步步走向人生巅峰的强者。他凭借智慧和实力，在都市中创造了属于自己的传奇。`
    } else if (/历史|架空历史/.test(genre)) {
      description = `${protagonist.name}是${title}的主角，穿越或重生到古代，凭借现代知识和智慧，改变历史走向的英雄。他运筹帷幄，决胜千里，在乱世中建立不朽功勋。`
    } else {
      description = `${protagonist.name}是${title}的主角，经历成长与蜕变，最终实现自我价值的核心人物。他勇敢坚毅，不断挑战自我，在故事中展现出非凡的魅力。`
    }
  }
  
  return {
    name: protagonist.name,
    description,
  }
}

export function validateAndCleanBookData(data: Partial<BookSourceData>): BookSourceData {
  const title = data.title || ''
  const genre = data.genre || ''
  const synopsis = hasValidContent(data.synopsis) ? cleanString(data.synopsis) : ''

  const result: BookSourceData = {
    title: cleanString(title) || title || '未知小说',
    author: hasValidContent(data.author) ? cleanString(data.author) : '未知',
    genre: '',
    status: hasValidContent(data.status) ? cleanString(data.status) : '已完结',
    tags: [],
    characters: [],
    source: hasValidContent(data.source) ? cleanString(data.source) : '未知来源',
    confidence: typeof data.confidence === 'number' && !isNaN(data.confidence)
      ? Math.max(0, Math.min(100, data.confidence))
      : 70,
  }
  
  if (hasValidContent(data.genre)) {
    let detectedGenre = cleanString(data.genre)
    
    const allText = (data.synopsis || '') + ' ' + (data.powerSystem || '') + ' ' + (data.worldBuilding || '') + ' ' + (data.characters?.map((c: BookCharacter) => c.description || c.note || '').join(' ') || '')
    
    if (allText.length > 50) {
      const contentGenre = detectGenreByContent(allText)
      
      const suspiciousGenres: Record<string, string[]> = {
        '玄幻': ['科幻', '都市', '历史', '言情', '悬疑'],
        '仙侠': ['科幻', '都市', '历史', '言情', '悬疑'],
        '武侠': ['科幻', '都市', '历史', '言情', '悬疑'],
        '奇幻': ['科幻', '都市', '历史', '言情', '悬疑'],
      }
      
      if (suspiciousGenres[detectedGenre]) {
        for (const g of suspiciousGenres[detectedGenre]) {
          if (contentGenre === g) {
            detectedGenre = g
            break
          }
        }
      }
    }
    
    result.genre = detectedGenre
  } else {
    const allText = (data.synopsis || '') + ' ' + (data.powerSystem || '') + ' ' + (data.worldBuilding || '')
    result.genre = allText.length > 50 ? detectGenreByContent(allText) : '玄幻'
  }
  
  if (hasValidContent(data.status)) {
    result.status = cleanString(data.status)
  } else {
    result.status = '已完结'
  }
  
  if (data.totalChapters && typeof data.totalChapters === 'number' && data.totalChapters > 0) {
    result.totalChapters = data.totalChapters
  } else if (typeof data.totalChapters === 'string') {
    const num = parseInt(data.totalChapters, 10)
    if (!isNaN(num) && num > 0) {
      result.totalChapters = num
    }
  }
  
  if (hasValidContent(data.totalWords)) {
    const wordsStr = cleanString(data.totalWords)
    const wordMatch = wordsStr.match(/(\d+(?:\.\d+)?)\s*(万|亿)\s*字?/)
    if (wordMatch) {
      const num = parseFloat(wordMatch[1])
      if (!isNaN(num) && num > 0) {
        result.totalWords = wordMatch[2] === '亿' ? num + '亿字' : num + '万字'
      } else {
        result.totalWords = wordsStr
      }
    } else {
      const numMatch = wordsStr.match(/(\d+(?:\.\d+)?)\s*(万)/)
      if (numMatch) {
        const num = parseFloat(numMatch[1])
        if (!isNaN(num) && num > 0) {
          result.totalWords = num + '万字'
        }
      }
    }
  }
  
  if (hasValidContent(data.synopsis)) {
    const synopsis = cleanPunctuation(cleanString(data.synopsis))
    const genre = data.genre || ''
    result.synopsis = cleanTextByGenre(synopsis, genre)
  } else {
    result.synopsis = `${title}是一部精彩的${genre}小说，讲述了主角在这个世界中不断成长的故事。`
  }
  
  if (data.tags && Array.isArray(data.tags)) {
    const validTags = data.tags
      .filter(tag => hasValidContent(tag))
      .map(tag => cleanString(tag))
      .filter(tag => tag.length > 0)
    if (validTags.length > 0) {
      result.tags = validTags
    } else {
      result.tags = [genre, '小说']
    }
  } else {
    result.tags = [genre, '小说']
  }
  
  const isCharacterName = (name: string): boolean => {
      if (!name || name.trim() === '') return false
      const cleanName = name.trim()
      if (cleanName.length < 2 || cleanName.length > 12) return false
      if (!/^[\u4e00-\u9fa5·]{2,12}$/.test(cleanName)) return false
      const noiseWords = [
        '网页', '新闻', '网盘', '图片', '视频', '地图', '资讯', '贴吧', '知道', '百科',
        '文库', '音乐', '小说', '购物', '翻译', '学术', '更多', '相关', '推荐',
        '热点', '排行', '精选', '最新', '全部', '导航', '首页', '登录', '注册', '下载',
        '广告', '推广', '链接', '网址', '网站', '页面', '搜索', '结果', '查询', '答案',
        '问题', '话题', '讨论', '帖子', '回复', '评论', '分享', '收藏', '点赞', '转发',
        '作者', '书名', '类型', '字数', '章节', '状态', '出版社', '出版时间', '首发', '连载',
        '简介', '目录', '内容', '作品', '完结', '所获', '总推荐', '别名', '修为',
        '尊号', '流派', '资质', '魂魄', '仙窍', '出身', '特殊', '重生', '所属', '生日',
        '身高', '体重', '性别', '妻子', '丈夫', '儿子', '女儿', '父亲', '母亲', '爷爷',
        '奶奶', '哥哥', '姐姐', '弟弟', '妹妹', '主人', '少女', '少年', '青年', '中年',
        '老年', '小孩', '婴儿', '配角', '反派', '主角', '男主', '女主', '龙套', '路人',
        '待补充', '暂无', '未知', '参考', '资料', '附录', '后记', '前言', '序言', '序章',
        '引子', '楔子', '起点', '纵横', '创世', '17K', '番茄', '飞卢', '晋江', '红袖',
        '潇湘', 'QQ', '掌阅', '书旗', '咪咕', '百度', '起点中文网', '纵横中文网', '创世中文网',
        '17K小说网', '番茄小说', '飞卢小说', '晋江文学城', '红袖添香', '潇湘书院', 'QQ阅读',
        '书旗小说', '咪咕阅读', '百度贴吧', '百度百科',
      ]
      if (noiseWords.includes(cleanName)) return false
      const noiseSuffixes = ['网', '站', '页', '版', '号', '吧', '圈', '群', '社', '会', '党', '派', '族', '帮', '教', '宗', '门', '盟', '联', '团', '队', '组', '部', '厅', '局', '委', '办', '院', '校', '学', '系', '班', '级', '届', '期']
      for (const suffix of noiseSuffixes) {
        if (cleanName.endsWith(suffix) && cleanName.length <= 4) return false
      }
      if (cleanName.includes('创作') || cleanName.includes('编写') || cleanName.includes('作者')) return false
      return true
    }
    
    if (data.characters && Array.isArray(data.characters)) {
    const validGenre = result.genre || (data.genre || '')
    const isFamousNovel = data.source === '知名小说库' || (data.confidence || 0) >= 95
    
    const validChars = data.characters
      .filter((c: BookCharacter) => hasValidContent(c.name) && isCharacterName(c.name))
      .map((c: BookCharacter) => {
        const charName = cleanString(c.name)
        let description = hasValidContent(c.description) 
          ? cleanTextByGenre(cleanPunctuation(cleanString(c.description)), validGenre) 
          : undefined
        
        if (!description && synopsis && synopsis.length > 30) {
          description = extractCharacterDescriptionFromSynopsis(charName, synopsis)
        }
        
        let note = hasValidContent(c.note)
          ? cleanTextByGenre(cleanPunctuation(cleanString(c.note)), validGenre)
          : undefined
        
        if (!note && description) {
          note = description.substring(0, Math.min(50, description.length))
        }
        
        const role = hasValidContent(c.role) ? cleanString(c.role) : ''
        
        let position = ''
        if (hasValidContent(c.position)) {
          position = cleanString(c.position)
        } else {
          position = generateCharacterPosition(charName, role, description || note || '', validGenre)
        }
        
        return {
          name: charName,
          role,
          position,
          description,
          note: note || description || position || role || '',
        }
      })
      .filter((c: BookCharacter) => c.name && c.name.trim() !== '')
    if (validChars.length > 0) {
      result.characters = validChars
    }
  }

  const validGenre1 = result.genre || (data.genre || '')

  if (!result.protagonist && result.characters && result.characters.length > 0) {
    const protagInfo = generateProtagonistInfo(result.characters, title, validGenre1, synopsis)
    if (protagInfo) {
      result.protagonist = protagInfo
    }
  } else if (data.protagonist && hasValidContent(data.protagonist.name)) {
    result.protagonist = {
      name: cleanString(data.protagonist.name),
      description: hasValidContent(data.protagonist.description) ? cleanPunctuation(cleanString(data.protagonist.description)) : `${data.protagonist.name}是${title}的主角，在故事中不断成长。`,
      aliases: data.protagonist.aliases && Array.isArray(data.protagonist.aliases)
        ? data.protagonist.aliases.filter(a => hasValidContent(a)).map(a => cleanString(a))
        : undefined,
    }
  }
  
  if (!result.femaleLead && result.characters && result.characters.length > 0) {
    const flInfo = generateFemaleLeadInfo(result.characters, title, validGenre1, synopsis)
    if (flInfo) {
      result.femaleLead = flInfo
    }
  } else if (data.femaleLead && hasValidContent(data.femaleLead.name)) {
    result.femaleLead = {
      name: cleanString(data.femaleLead.name),
      description: hasValidContent(data.femaleLead.description) ? cleanPunctuation(cleanString(data.femaleLead.description)) : `${data.femaleLead.name}是${title}的女主角，与主角有深厚感情。`,
      aliases: data.femaleLead.aliases && Array.isArray(data.femaleLead.aliases)
        ? data.femaleLead.aliases.filter(a => hasValidContent(a)).map(a => cleanString(a))
        : undefined,
    }
  }
  
  if (hasValidContent(data.powerSystem)) {
    const cleanedPowerSystem = cleanString(data.powerSystem)
    const validGenre2 = result.genre || (data.genre || '')
    result.powerSystem = cleanPunctuation(cleanPowerSystemByGenre(cleanedPowerSystem, validGenre2))
  } else {
    result.powerSystem = generateDefaultPowerSystem(genre, synopsis)
  }
  
  if (hasValidContent(data.worldBuilding)) {
    result.worldBuilding = cleanPunctuation(cleanString(data.worldBuilding))
  } else {
    result.worldBuilding = generateDefaultWorldBuilding(genre, title, synopsis)
  }
  
  if (hasValidContent(data.writingStyle)) {
    result.writingStyle = cleanPunctuation(cleanString(data.writingStyle))
  } else {
    result.writingStyle = generateDefaultWritingStyle(genre, title, synopsis)
  }
  
  if (data.sellingPoints && Array.isArray(data.sellingPoints)) {
    const validPoints = data.sellingPoints
      .filter(p => hasValidContent(p))
      .map(p => cleanString(p))
      .filter(p => p.length > 0)
    if (validPoints.length > 0) {
      result.sellingPoints = validPoints
    } else {
      result.sellingPoints = generateDefaultSellingPoints(genre, title, synopsis)
    }
  } else {
    result.sellingPoints = generateDefaultSellingPoints(genre, title, synopsis)
  }

  return result
}

function generateDefaultPowerSystem(genre: string, synopsis: string = ''): string {
  if (synopsis && synopsis.length > 30) {
    const powerElements: string[] = []
    
    const powerPatterns = [
      /(修炼|功法|武技|魔法|斗气|灵气|魂力|精神力|仙力|魔力)[^。；！？]{0,30}/g,
      /(境界|等级|突破|晋级|进阶|提升|变强)[^。；！？]{0,30}/g,
      /(炼气|筑基|金丹|元婴|化神|炼虚|合体|大乘|渡劫|圣域|神域|神格)[^。；！？]{0,20}/g,
    ]
    
    for (const pattern of powerPatterns) {
      let match
      while ((match = pattern.exec(synopsis)) !== null) {
        const element = match[0].trim()
        if (element.length > 2 && element.length < 40 && !powerElements.includes(element)) {
          powerElements.push(element)
        }
      }
    }
    
    if (powerElements.length > 0) {
      return `【力量体系】\n${powerElements.join('、')}。`
    }
  }
  
  if (/东方玄幻|玄幻/.test(genre)) {
    return `【修炼体系】\n修炼境界从低到高依次为：淬体、开元、万象、通玄、神变、王座、至尊、涅槃、轮回、造化等。每个境界分为初境、中境、高境、巅峰四个层次，每个境界都有独特的能力和突破方式。\n【核心力量】\n以灵气、斗气、武魂、血脉、精神力等为核心力量源泉，通过修炼功法、武技提升实力。\n【突破方式】\n需要感悟天地法则、获得机缘传承、炼制丹药辅助突破，突破时可能会引发天地异象。\n【特殊能力】\n部分修炼者拥有特殊体质、天赋神通、传承秘法等，是超越同阶的关键。`
  } else if (/仙侠|修真/.test(genre)) {
    return `【修仙体系】\n炼气、筑基、金丹、元婴、化神、炼虚、合体、大乘、渡劫等境界层层递进，每个大境界分为初期、中期、后期、巅峰四个阶段。\n【核心力量】\n以灵气为核心，辅以仙元、神力、愿力等高级力量。\n【突破方式】\n需要渡劫飞升，经历天劫考验，感悟大道法则。每个大境界突破都需渡过相应等级的天劫。\n【修仙路径】\n剑修、体修、丹修、符修、阵修等多种修炼方式并存，各有独特优势。`
  } else if (/西方奇幻|奇幻/.test(genre)) {
    return `【魔法体系】\n魔法等级分明，从初阶魔法师、中阶魔法师、高阶魔法师、大魔法师、魔导士、魔导师到大魔导、法神。魔法师拥有强大的魔法能力。\n【核心力量】\n以魔力、精神力为核心，通过咒语和魔法阵释放魔法。\n【魔法系别】\n元素魔法（火、水、风、土、雷）、光明魔法、黑暗魔法、亡灵魔法、召唤魔法、空间魔法、时间魔法等。\n【突破方式】\n需要冥想感悟元素法则，获得魔法传承和神器加持。`
  } else if (/都市/.test(genre)) {
    return `【能力体系】\n主角获得特殊能力、系统或重生，不断成长突破，成为都市强者。\n【核心力量】\n异能、科技、财富、人脉、武力等多种力量并存。\n【能力来源】\n系统奖励、意外觉醒、神秘传承、基因变异、古武传承等。\n【突破方式】\n通过完成任务、获得机缘、不断修炼提升能力。`
  } else if (/历史/.test(genre)) {
    return `【能力体系】\n权谋与武功并重，智慧与统帅能力是核心竞争力。\n【核心力量】\n军事实力、政治权谋、经济实力、个人武力、人才储备。\n【武功体系】\n内功修炼、外功招式、轻功身法、兵器技法等传统武学。\n【突破方式】\n通过征战四方、发展势力、提升个人修为实现突破。`
  } else if (/科幻/.test(genre)) {
    return `【科技体系】\n科技、进化、机甲、基因改造、精神力等多种力量体系并存。\n【核心力量】\n高科技装备、基因进化、精神力、宇宙法则、时空能力。\n【科技等级】\n从行星级文明到恒星级文明、星系级文明、宇宙级文明，科技水平不断提升。\n【突破方式】\n通过科技升级、基因优化、宇宙探索实现突破。`
  } else if (/悬疑|恐怖/.test(genre)) {
    return `【能力体系】\n特殊能力与推理智慧结合，解开各种神秘事件。\n【核心力量】\n推理能力、特殊感知、神秘力量、团队协作、心理分析。\n【能力来源】\n天赋觉醒、特殊经历、神秘传承、后天训练等。\n【突破方式】\n通过破解谜题、获得线索、提升感知能力实现突破。`
  } else {
    return `【能力体系】\n主角不断成长，突破极限，最终达到巅峰。\n【核心力量】\n天赋、努力、机缘、人脉、智慧等多种因素共同作用。\n【突破方式】\n通过不断修炼、获得传承、战胜强敌实现突破。\n【成长路径】\n从底层起步，经历各种挑战和机遇，逐步成长为强者。`
  }
}

export function mergeBookDataWithValidation(target: Partial<BookSourceData>, source: Partial<BookSourceData>): Partial<BookSourceData> {
  const result = { ...target }
  
  if (!hasValidContent(result.title) && hasValidContent(source.title)) {
    result.title = source.title
  }
  
  if (!hasValidContent(result.author) && hasValidContent(source.author)) {
    result.author = source.author
  }
  
  if (!hasValidContent(result.genre) && hasValidContent(source.genre)) {
    result.genre = source.genre
  }
  
  if (!hasValidContent(result.status) && hasValidContent(source.status)) {
    result.status = source.status
  }
  
  if ((!result.totalChapters || result.totalChapters <= 0) && source.totalChapters && source.totalChapters > 0) {
    result.totalChapters = source.totalChapters
  }
  
  if (!hasValidContent(result.totalWords) && hasValidContent(source.totalWords)) {
    result.totalWords = source.totalWords
  }
  
  return result
}

export interface DataQualityScore {
  overall: number
  completeness: number
  validity: number
  consistency: number
  details: {
    field: string
    score: number
    issue?: string
  }[]
}

export function evaluateDataQuality(data: Partial<BookSourceData>): DataQualityScore {
  const details: { field: string; score: number; issue?: string }[] = []
  let completenessScore = 0
  let validityScore = 0
  let consistencyScore = 0

  const coreFields = ['title', 'author', 'genre', 'status', 'totalWords', 'totalChapters', 'synopsis']
  let coreFieldCount = 0
  let coreValidCount = 0

  for (const field of coreFields) {
    const value = (data as Record<string, unknown>)[field]
    const hasValue = hasValidContent(value)
    
    if (hasValue) {
      coreFieldCount++
      let fieldScore = 80
      let issue: string | undefined

      if (field === 'author') {
        if (typeof value === 'string' && isValidChineseName(value)) {
          fieldScore = 100
        } else {
          fieldScore = 50
          issue = '作者名格式异常'
        }
      }

      if (field === 'totalWords') {
        const wordStr = String(value)
        const numMatch = wordStr.match(/([\d.]+)\s*(万|万字)?/)
        if (numMatch) {
          const num = parseFloat(numMatch[1]) * (numMatch[2] ? 10000 : 1)
          if (isReasonableWords(num)) {
            fieldScore = 100
          } else {
            fieldScore = 40
            issue = '字数异常（过高或过低）'
          }
        }
      }

      if (field === 'totalChapters') {
        const num = Number(value)
        if (num > 0 && isReasonableChapters(num)) {
          fieldScore = 100
        } else {
          fieldScore = 40
          issue = '章节数异常'
        }
      }

      if (field === 'synopsis') {
        const len = String(value).length
        if (len >= 100) {
          fieldScore = 100
        } else if (len >= 50) {
          fieldScore = 70
        } else {
          fieldScore = 40
          issue = '简介过短'
        }
      }

      if (field === 'genre') {
        const genreStr = String(value)
        if (genreStr.length >= 2 && genreStr.length <= 20) {
          fieldScore = 100
        } else {
          fieldScore = 60
          issue = '类型格式异常'
        }
      }

      coreValidCount += fieldScore / 100
      details.push({ field, score: fieldScore, issue })
    } else {
      details.push({ field, score: 0, issue: '缺失' })
    }
  }

  completenessScore = coreFields.length > 0 ? Math.round((coreFieldCount / coreFields.length) * 100) : 0
  validityScore = coreFieldCount > 0 ? Math.round((coreValidCount / coreFieldCount) * 100) : 0

  let consistencyIssues = 0
  const totalChecks = 3

  if (data.totalWords && data.totalChapters) {
    const wordStr = String(data.totalWords)
    const numMatch = wordStr.match(/([\d.]+)\s*(万|万字)?/)
    if (numMatch) {
      const totalWords = parseFloat(numMatch[1]) * (numMatch[2] ? 10000 : 1)
      const chapters = Number(data.totalChapters)
      if (totalWords > 0 && chapters > 0) {
        const avgChapterWords = totalWords / chapters
        let ratioScore = 100
        let ratioIssue = ''
        
        if (avgChapterWords >= 2000 && avgChapterWords <= 6000) {
          ratioScore = 100
        } else if (avgChapterWords >= 1500 && avgChapterWords <= 8000) {
          ratioScore = 85
          ratioIssue = `平均每章${Math.round(avgChapterWords)}字，比例略偏`
        } else if (avgChapterWords >= 1000 && avgChapterWords <= 10000) {
          ratioScore = 60
          ratioIssue = `平均每章${Math.round(avgChapterWords)}字，比例偏异常`
        } else if (avgChapterWords >= 500 && avgChapterWords <= 15000) {
          ratioScore = 40
          ratioIssue = `平均每章${Math.round(avgChapterWords)}字，比例异常`
        } else {
          ratioScore = 20
          ratioIssue = `平均每章${Math.round(avgChapterWords)}字，比例严重异常`
        }
        
        if (ratioScore < 100) {
          consistencyIssues++
          details.push({ field: 'wordsChaptersRatio', score: ratioScore, issue: ratioIssue })
        } else {
          details.push({ field: 'wordsChaptersRatio', score: ratioScore })
        }
        
        if (chapters < 10 && totalWords > 100000) {
          consistencyIssues++
          details.push({ field: 'chapterCountTooSmall', score: 30, issue: `仅${chapters}章但字数超10万，章节数可能不准确` })
        }
        
        if (chapters > 5000) {
          consistencyIssues++
          details.push({ field: 'chapterCountTooLarge', score: 50, issue: `${chapters}章，章节数异常偏高` })
        }
      }
    }
  }

  if (data.genre && data.synopsis) {
    const detected = detectGenreByContent(data.synopsis)
    const genreStr = String(data.genre)
    const isEastern = isEasternGenre(genreStr) || genreStr.includes('玄幻') || genreStr.includes('仙侠')
    const detectedIsEastern = detected === '玄幻' || detected === '仙侠'
    if (isEastern !== detectedIsEastern) {
      consistencyIssues++
      details.push({ field: 'genreSynopsisMatch', score: 50, issue: `题材(${genreStr})与简介内容(${detected})不一致` })
    } else {
      details.push({ field: 'genreSynopsisMatch', score: 100 })
    }
  }

  if (data.author && data.title) {
    const authorStr = String(data.author)
    if (authorStr === String(data.title)) {
      consistencyIssues++
      details.push({ field: 'authorTitleDistinct', score: 30, issue: '作者名与书名相同' })
    } else {
      details.push({ field: 'authorTitleDistinct', score: 100 })
    }
  }

  consistencyScore = Math.round(((totalChecks - consistencyIssues) / totalChecks) * 100)

  const overall = Math.round(completenessScore * 0.4 + validityScore * 0.35 + consistencyScore * 0.25)

  return {
    overall,
    completeness: completenessScore,
    validity: validityScore,
    consistency: consistencyScore,
    details,
  }
}

export interface WeightedVoteResult<T> {
  value: T
  confidence: number
  totalVotes: number
  supportingSources: string[]
  voteCount: number
}

export interface AdvancedFusionResult {
  data: Partial<BookSourceData>
  fieldSources: Record<string, string[]>
  fieldConfidence: Record<string, number>
  overallConfidence: number
  sourceQuality: Record<string, number>
}

interface FieldValueWithWeight {
  value: unknown
  weight: number
  source: string
  confidence: number
}

export function advancedFuseBookData(
  results: BookSourceData[],
  getSourceWeight: (sourceName: string) => number = () => 0
): AdvancedFusionResult {
  if (results.length === 0) {
    return {
      data: {},
      fieldSources: {},
      fieldConfidence: {},
      overallConfidence: 0,
      sourceQuality: {},
    }
  }

  const fieldSources: Record<string, string[]> = {}
  const fieldConfidence: Record<string, number> = {}

  const validResults = results.filter(r => r && r.title)
  if (validResults.length === 0) {
    return {
      data: {},
      fieldSources: {},
      fieldConfidence: {},
      overallConfidence: 0,
      sourceQuality: {},
    }
  }

  const getAdjustedWeight = (result: BookSourceData): number => {
    const baseWeight = result.confidence || 50
    const sourceBonus = getSourceWeight(result.source || '')
    return Math.max(1, baseWeight + sourceBonus)
  }

  const stringSimilarity = (a: string, b: string): number => {
    if (!a || !b) return 0
    const cleanA = a.trim().toLowerCase().replace(/[\s·\-_《》"']/g, '')
    const cleanB = b.trim().toLowerCase().replace(/[\s·\-_《》"']/g, '')
    if (cleanA === cleanB) return 1
    if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return 0.8
    let matches = 0
    const shorter = cleanA.length < cleanB.length ? cleanA : cleanB
    const longer = cleanA.length < cleanB.length ? cleanB : cleanA
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) matches++
    }
    return matches / longer.length
  }

  const weightedVoteString = (values: FieldValueWithWeight[], fieldName: string): WeightedVoteResult<string | null> => {
    const validValues = values.filter(v => v.value && typeof v.value === 'string' && v.value.trim() !== '')
    if (validValues.length === 0) {
      return { value: null, confidence: 0, totalVotes: 0, supportingSources: [], voteCount: 0 }
    }

    const groups: Array<{ values: FieldValueWithWeight[]; totalWeight: number; representative: string }> = []

    for (const v of validValues) {
      let matched = false
      for (const group of groups) {
        const sim = stringSimilarity(v.value as string, group.representative)
        if (sim >= 0.6) {
          group.values.push(v)
          group.totalWeight += v.weight
          if (v.weight > group.values[0].weight) {
            group.representative = v.value as string
          }
          matched = true
          break
        }
      }
      if (!matched) {
        groups.push({ values: [v], totalWeight: v.weight, representative: v.value as string })
      }
    }

    groups.sort((a, b) => b.totalWeight - a.totalWeight)

    const best = groups[0]
    const totalVotes = validValues.reduce((sum, v) => sum + v.weight, 0)
    const confidence = totalVotes > 0 ? Math.min(100, Math.round((best.totalWeight / totalVotes) * 100)) : 0

    return {
      value: best.representative,
      confidence,
      totalVotes,
      supportingSources: best.values.map(v => v.source),
      voteCount: best.values.length,
    }
  }

  const weightedVoteNumber = (
    values: FieldValueWithWeight[],
    tolerance: number = 0.15
  ): WeightedVoteResult<number | null> => {
    const validValues = values.filter(v => v.value && typeof v.value === 'number' && v.value > 0)
    if (validValues.length === 0) {
      return { value: null, confidence: 0, totalVotes: 0, supportingSources: [], voteCount: 0 }
    }

    if (validValues.length === 1) {
      const v = validValues[0]
      return {
        value: v.value as number,
        confidence: Math.min(100, v.weight),
        totalVotes: v.weight,
        supportingSources: [v.source],
        voteCount: 1,
      }
    }

    if (validValues.length === 2) {
      const v1 = validValues[0]
      const v2 = validValues[1]
      const num1 = v1.value as number
      const num2 = v2.value as number
      
      const diffRatio = Math.abs(num1 - num2) / Math.min(num1, num2)
      
      if (diffRatio <= tolerance * 2) {
        const avgValue = (num1 * v1.weight + num2 * v2.weight) / (v1.weight + v2.weight)
        return {
          value: Math.round(avgValue),
          confidence: Math.min(100, Math.round((v1.weight + v2.weight) / 2 + 10)),
          totalVotes: v1.weight + v2.weight,
          supportingSources: [v1.source, v2.source],
          voteCount: 2,
        }
      }
      
      let score1 = v1.weight
      let score2 = v2.weight
      
      const allData = validResults
      const getWordCount = (source: string): number => {
        const r = allData.find(r => r.source === source)
        if (!r || !r.totalWords) return 0
        const match = String(r.totalWords).match(/([\d.]+)\s*(万|万字)?/)
        if (match) {
          return parseFloat(match[1]) * (match[2] ? 10000 : 1)
        }
        return 0
      }
      
      const words1 = getWordCount(v1.source)
      const words2 = getWordCount(v2.source)
      
      const calculateRatioScore = (words: number, chapters: number): number => {
        if (words <= 0 || chapters <= 0) return 0
        const avg = words / chapters
        if (avg >= 2000 && avg <= 6000) return 40
        if (avg >= 1500 && avg <= 8000) return 30
        if (avg >= 1000 && avg <= 10000) return 15
        if (avg >= 500 && avg <= 15000) return 5
        return -15
      }
      
      const calculateChapterReasonableness = (chapters: number, words: number): number => {
        let score = 0
        if (chapters >= 50 && chapters <= 2000) score += 10
        else if (chapters >= 20 && chapters <= 3000) score += 5
        else if (chapters < 10 && words > 100000) score -= 20
        else if (chapters > 5000) score -= 10
        
        if (words > 0) {
          const wanWords = words / 10000
          if (wanWords >= 50 && wanWords <= 500) score += 5
          else if (wanWords >= 10 && wanWords <= 1000) score += 2
        }
        
        return score
      }
      
      if (words1 > 0) {
        score1 += calculateRatioScore(words1, num1)
        score1 += calculateChapterReasonableness(num1, words1)
      }
      
      if (words2 > 0) {
        score2 += calculateRatioScore(words2, num2)
        score2 += calculateChapterReasonableness(num2, words2)
      }
      
      const best = score1 >= score2 ? v1 : v2
      const confidence = Math.min(100, Math.max(30, Math.abs(score1 - score2) + 20))
      
      return {
        value: best.value as number,
        confidence,
        totalVotes: Math.max(score1, score2),
        supportingSources: [best.source],
        voteCount: 1,
      }
    }

    const nums = validValues.map(v => v.value as number)
    const sorted = [...nums].sort((a, b) => a - b)
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]

    const filtered = validValues.filter(v => {
      const num = v.value as number
      const diff = Math.abs(num - median) / median
      return diff <= tolerance * 2
    })

    if (filtered.length === 0) {
      const best = validValues.sort((a, b) => b.weight - a.weight)[0]
      return {
        value: best.value as number,
        confidence: 30,
        totalVotes: validValues.reduce((sum, v) => sum + v.weight, 0),
        supportingSources: [best.source],
        voteCount: 1,
      }
    }

    const groups: Array<{ values: FieldValueWithWeight[]; totalWeight: number; avgValue: number }> = []

    for (const v of filtered) {
      const num = v.value as number
      let matched = false
      for (const group of groups) {
        const diff = Math.abs(num - group.avgValue) / group.avgValue
        if (diff <= tolerance) {
          group.values.push(v)
          group.totalWeight += v.weight
          group.avgValue = group.values.reduce((s, gv) => s + (gv.value as number) * gv.weight, 0) /
            group.values.reduce((s, gv) => s + gv.weight, 0)
          matched = true
          break
        }
      }
      if (!matched) {
        groups.push({ values: [v], totalWeight: v.weight, avgValue: num })
      }
    }

    groups.sort((a, b) => b.totalWeight - a.totalWeight)

    const best = groups[0]
    const totalVotes = filtered.reduce((sum, v) => sum + v.weight, 0)
    const confidence = totalVotes > 0 ? Math.min(100, Math.round((best.totalWeight / totalVotes) * 80 + best.values.length * 5)) : 0

    return {
      value: Math.round(best.avgValue),
      confidence,
      totalVotes,
      supportingSources: best.values.map(v => v.source),
      voteCount: best.values.length,
    }
  }

  const collectFieldValues = (fieldName: string): FieldValueWithWeight[] => {
    return validResults.map(r => ({
      value: (r as unknown as Record<string, unknown>)[fieldName],
      weight: getAdjustedWeight(r),
      source: r.source,
      confidence: r.confidence,
    })).filter(v => v.value !== undefined && v.value !== null)
  }

  const fusedData: Partial<BookSourceData> = { ...validResults[0] }

  const stringFields = ['title', 'author', 'genre', 'status', 'totalWords', 'synopsis', 'writingStyle', 'worldBuilding', 'powerSystem']
  for (const field of stringFields) {
    const values = collectFieldValues(field)
    const result = weightedVoteString(values, field)
    if (result.value !== null) {
      ;(fusedData as Record<string, unknown>)[field] = result.value
      fieldSources[field] = result.supportingSources
      fieldConfidence[field] = result.confidence
    }
  }

  const numberFields = ['totalChapters']
  for (const field of numberFields) {
    const values = collectFieldValues(field)
    const result = weightedVoteNumber(values)
    if (result.value !== null) {
      ;(fusedData as Record<string, unknown>)[field] = result.value
      fieldSources[field] = result.supportingSources
      fieldConfidence[field] = result.confidence
    }
  }

  {
    const wordValues = validResults.map(r => {
      const wordStr = r.totalWords || ''
      let num = 0
      const match = wordStr.match(/([\d.]+)\s*(万|万字|w|W)?/)
      if (match) {
        num = parseFloat(match[1])
        if (match[2]) num *= 10000
      }
      return {
        value: num,
        weight: getAdjustedWeight(r),
        source: r.source,
        confidence: r.confidence,
      }
    }).filter(v => v.value > 0)

    if (wordValues.length > 0) {
      const result = weightedVoteNumber(wordValues, 0.2)
      if (result.value !== null && result.value > 0) {
        const wanValue = result.value / 10000
        const formatted = wanValue >= 1 ? `${wanValue.toFixed(wanValue >= 100 ? 0 : 1)}万字` : `${result.value}字`
        fusedData.totalWords = formatted
        if (!fieldSources['totalWords'] || result.supportingSources.length > fieldSources['totalWords'].length) {
          fieldSources['totalWords'] = result.supportingSources
          fieldConfidence['totalWords'] = result.confidence
        }
      }
    }
  }

  const allTags = new Set<string>()
  const tagWeights: Record<string, number> = {}
  for (const r of validResults) {
    if (r.tags && Array.isArray(r.tags)) {
      const weight = getAdjustedWeight(r)
      for (const tag of r.tags) {
        if (tag && typeof tag === 'string' && tag.trim()) {
          const cleanTag = tag.trim()
          allTags.add(cleanTag)
          tagWeights[cleanTag] = (tagWeights[cleanTag] || 0) + weight
        }
      }
    }
  }
  const sortedTags = Array.from(allTags).sort((a, b) => (tagWeights[b] || 0) - (tagWeights[a] || 0))
  fusedData.tags = sortedTags.slice(0, 15)

  const characterMap = new Map<string, { char: BookCharacter; weight: number; sources: string[] }>()
  for (const r of validResults) {
    if (r.characters && Array.isArray(r.characters)) {
      const weight = getAdjustedWeight(r)
      for (const char of r.characters) {
        if (char && char.name) {
          const key = char.name.trim()
          const existing = characterMap.get(key)
          if (!existing || weight > existing.weight) {
            characterMap.set(key, { char, weight, sources: [r.source] })
          } else {
            existing.sources.push(r.source)
          }
        }
      }
    }
  }
  fusedData.characters = Array.from(characterMap.values()).map(v => v.char).slice(0, 20)

  if (validResults.length > 0) {
    const sortedByDetail = [...validResults].sort((a, b) => {
      const aLen = (a.synopsis || '').length + (a.worldBuilding || '').length + (a.powerSystem || '').length
      const bLen = (b.synopsis || '').length + (b.worldBuilding || '').length + (b.powerSystem || '').length
      return bLen - aLen
    })
    const mostDetailed = sortedByDetail[0]
    
    if (!fusedData.synopsis && mostDetailed.synopsis) fusedData.synopsis = mostDetailed.synopsis
    if (!fusedData.worldBuilding && mostDetailed.worldBuilding) fusedData.worldBuilding = mostDetailed.worldBuilding
    if (!fusedData.powerSystem && mostDetailed.powerSystem) fusedData.powerSystem = mostDetailed.powerSystem
    if (!fusedData.sixStageOutline && mostDetailed.sixStageOutline) {
      fusedData.sixStageOutline = mostDetailed.sixStageOutline
    }
  }

  const sourceQuality: Record<string, number> = {}
  for (const r of validResults) {
    let matchScore = 0
    let totalFields = 0
    
    for (const field of stringFields) {
      const fusedVal = (fusedData as Record<string, unknown>)[field]
      const sourceVal = (r as unknown as Record<string, unknown>)[field]
      if (fusedVal && sourceVal) {
        totalFields++
        const sim = stringSimilarity(String(fusedVal), String(sourceVal))
        matchScore += sim
      }
    }
    
    sourceQuality[r.source] = totalFields > 0 ? Math.round((matchScore / totalFields) * 100) : 50
  }

  const fieldConfValues = Object.values(fieldConfidence).filter(v => v > 0)
  const avgFieldConfidence = fieldConfValues.length > 0
    ? fieldConfValues.reduce((sum, v) => sum + v, 0) / fieldConfValues.length
    : 50

  const sourceCount = validResults.length
  const sourceCountBonus = Math.min(20, sourceCount * 5)

  const overallConfidence = Math.min(100, Math.round(avgFieldConfidence * 0.7 + sourceCountBonus + (fusedData.tags?.length ? 5 : 0)))
  fusedData.confidence = overallConfidence

  if (sourceCount > 1) {
    fusedData.accuracyNote = `多源交叉验证（${sourceCount}个数据源）：${validResults.map(r => r.source).join('、')}`
  }

  return {
    data: fusedData,
    fieldSources,
    fieldConfidence,
    overallConfidence,
    sourceQuality,
  }
}
