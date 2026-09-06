import { NextResponse } from 'next/server'
import { callLLMWithFallback, type LLMConfig, type LLMMessage } from '@/lib/ai/llm'
import { resolveLLMConfig } from '@/lib/resolve-llm-config'
import { verifyToken } from '@/lib/auth'

// ============================================================
// 朱雀AI检测引擎 - 基于番茄小说2026年5月最新标准
// 检测维度：句式多样性、逻辑自然度、用词口语化、段落节奏感、
//           情感真实度、细节密度、AI高频词、模板化程度
// ============================================================

// --- AI典型高频词/短语库（仅保留真人网文极少使用的"硬 AI 模板"；
//     仿佛/然而/缓缓地/不禁/随着 等真人常用词已移出，避免对真人原著系统性误报）---
const AI_TEMPLATES = [
  // 书面/议论连接词（小说正文极少出现）
  '值得注意的是', '总而言之', '综上所述', '由此可见', '不言而喻',
  '毋庸置疑', '众所周知', '不仅如此', '更重要的是',
  '换句话说', '换言之', '简而言之', '归根结底', '显而易见', '不可否认',
  // 议论式开头/总结模板
  '在这个时代', '在现代社会', '在这个世界上', '在这个快速发展的',
  '总的来说', '从上述分析可以看出', '通过以上分析', '综上所述我们可以看出',
  // AI典型情感/心理模板句
  '内心深处', '心中涌起', '一股暖流', '眼眶微红', '嘴角微微上扬', '心中暗想', '不禁感叹',
  // AI典型比喻模板
  '宛如一幅画', '仿佛置身于', '宛如仙境',
  // AI典型网文动作模板
  '瞳孔骤缩', '倒吸一口凉气', '嘴角勾起一抹', '眼中闪过一丝',
]

// --- AI典型句式模式（正则） ---
const AI_PATTERN_RULES: { pattern: RegExp; label: string; fix: string }[] = [
  {
    pattern: /值得注意的是[，,]?\s*/g,
    label: 'AI典型连接词「值得注意的是」',
    fix: '替换为更口语化的表达，如「说真的」「说实话」或直接删除',
  },
  {
    pattern: /总而言之[，,]?\s*/g,
    label: 'AI典型总结词「总而言之」',
    fix: '直接删除或用「总之」「说白了」替换',
  },
  {
    pattern: /综上所述[，,]?\s*/g,
    label: 'AI典型总结词「综上所述」',
    fix: '直接删除总结句，让读者自己感受',
  },
  {
    pattern: /由此可见[，,]?\s*/g,
    label: 'AI典型推理词「由此可见」',
    fix: '删除后直接陈述结论，或用「所以」「可见」',
  },
  {
    pattern: /不言而喻[，,]?\s*/g,
    label: 'AI典型连接词「不言而喻」',
    fix: '直接删除，让事实自己说话',
  },
  {
    pattern: /毋庸置疑[，,]?\s*/g,
    label: 'AI典型连接词「毋庸置疑」',
    fix: '删除或用「那是肯定的」「没得说」等口语',
  },
  {
    pattern: /众所周知[，,]?\s*/g,
    label: 'AI典型连接词「众所周知」',
    fix: '删除或用「大家都知道」「谁都知道」',
  },
  {
    pattern: /一方面[，,]?\s*.*?另一方面/g,
    label: 'AI典型对称句式「一方面…另一方面…」',
    fix: '拆分成两句独立的表达，避免对称结构',
  },
  {
    pattern: /与此同时[，,]?\s*/g,
    label: 'AI典型过渡词「与此同时」',
    fix: '用「这时候」「就在这时」或直接省略',
  },
  {
    pattern: /不仅如此[，,]?\s*/g,
    label: 'AI典型递进词「不仅如此」',
    fix: '删除或用「而且」「更绝的是」',
  },
  {
    pattern: /更重要的是[，,]?\s*/g,
    label: 'AI典型递进词「更重要的是」',
    fix: '删除或用「更要命的是」「关键是」',
  },
  {
    pattern: /换句话说[，,]?\s*/g,
    label: 'AI典型解释词「换句话说」',
    fix: '直接换一种说法，不需要提示词',
  },
  {
    pattern: /在这个(?:充满|快速发展的|瞬息万变的)?(?:时代|世界|社会)[，,]?\s*/g,
    label: 'AI典型开头模板「在这个...时代/世界」',
    fix: '直接切入场景或人物，不要用宏大开篇',
  },
  {
    pattern: /随着(?:时间|社会|科技|时代)(?:的|的不断发展|的不断进步)[，,]?\s*/g,
    label: 'AI典型开头模板「随着...的发展」',
    fix: '直接从具体事件或人物开始写',
  },
  {
    pattern: /瞳孔骤缩/g,
    label: 'AI高频网文模板词「瞳孔骤缩」',
    fix: '用具体动作描写替代，如「他猛地一愣」「他眼睛瞪大」',
  },
  {
    pattern: /倒吸一口凉气/g,
    label: 'AI高频网文模板词「倒吸一口凉气」',
    fix: '用个性化反应替代，如「他后背一凉」「他头皮发麻」',
  },
  {
    pattern: /嘴角(?:勾起|微微上扬|扬起)一抹(?:弧度|笑意|微笑)/g,
    label: 'AI高频网文模板句「嘴角勾起一抹...」',
    fix: '用更具体的表情描写，或直接写对话体现情绪',
  },
  {
    pattern: /眼中闪过一丝(?:惊讶|愤怒|悲伤|喜悦|杀意|寒光|嘲讽)/g,
    label: 'AI高频网文模板句「眼中闪过一丝...」',
    fix: '通过行为和对话展现情绪，减少直接描写',
  },
  {
    pattern: /心中(?:暗想|一惊|一沉|一动|涌起一股|泛起一阵)/g,
    label: 'AI高频网文模板句「心中...」',
    fix: '用内心独白或具体感受替代',
  },
  {
    pattern: /缓缓地|轻轻地|慢慢地|静静地|默默地/g,
    label: 'AI高频副词堆砌（缓缓地/轻轻地/慢慢地等）',
    fix: '删除多余副词，或换用更有力的动词',
  },
  {
    pattern: /宛如一幅画|仿佛置身于|宛如仙境/g,
    label: 'AI典型比喻模板',
    fix: '用更具体、更有生活气息的比喻替代',
  },
]

// --- 情感关键词库 ---
const EMOTION_KEYWORDS = [
  '怒', '恨', '悲', '喜', '惊', '恐', '怕', '爱', '恨', '愁', '苦', '乐',
  '愤怒', '悲伤', '高兴', '恐惧', '惊讶', '厌恶', '期待', '焦虑', '绝望',
  '狂喜', '暴怒', '心碎', '崩溃', '颤抖', '发抖', '流泪', '大哭', '大笑',
  '尖叫', '咆哮', '怒吼', '呜咽', '抽泣', '哽咽', '狂笑', '冷笑',
  '操', '妈的', '靠', '该死', '混蛋', '去你妈', '日', '卧槽', '我靠',
  '他妈', '妈了个巴子', '狗日的', '王八蛋',
  '草', '特么', '尼玛', '擦', '艹',
]

// --- 感官细节关键词 ---
const SENSORY_KEYWORDS = [
  // 视觉
  '红', '黄', '蓝', '绿', '白', '黑', '紫', '金', '银', '灰',
  '光', '影', '暗', '亮', '闪', '耀', '刺眼', '昏暗', '明亮',
  '粗糙', '光滑', '细腻', '斑驳', '模糊', '清晰',
  // 听觉
  '响', '声', '鸣', '吼', '叫', '喊', '唱', '响', '吵', '静',
  '嗡嗡', '哗啦', '轰隆', '叮咚', '沙沙', '嘎吱', '啪',
  // 触觉
  '冷', '热', '烫', '冰', '软', '硬', '痛', '痒', '麻', '酸',
  '湿润', '干燥', '黏腻', '冰凉', '滚烫', '刺痛', '灼热',
  // 嗅觉
  '香', '臭', '腥', '甜', '酸', '苦', '辣', '呛', '清新', '刺鼻',
  // 味觉
  '咸', '淡', '鲜', '涩', '腻',
]

// ============================================================
// 核心检测函数
// ============================================================

/** 分句：按句号、问号、感叹号、省略号分句 */
function splitSentences(text: string): string[] {
  return text
    .split(/[。！？…\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

/** 分段 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
}

/** 计算标准差 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/** 计算变异系数 (CV = std / mean) */
function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  return standardDeviation(values) / mean
}

/** 限制分数在0-100之间 */
function clamp(val: number, min = 0, max = 100): number {
  return Math.round(Math.min(max, Math.max(min, val)))
}

// ============================================================
// 1. 句式多样性检测 (Burstiness)
// ============================================================
function analyzeSentenceDiversity(text: string): { score: number; description: string; issues: Issue[] } {
  const sentences = splitSentences(text)
  const issues: Issue[] = []

  if (sentences.length < 3) {
    return {
      score: 70,
      description: '文本过短，无法准确评估句式多样性',
      issues: [],
    }
  }

  const lengths = sentences.map(s => s.length)
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const std = standardDeviation(lengths)
  const cv = coefficientOfVariation(lengths)

  // 人类写作CV通常在0.5-1.2之间，AI往往在0.2-0.5
  // CV越高，句式越多样，越像人写的
  let score: number
  if (cv >= 0.7) {
    score = 92 - Math.max(0, (cv - 0.7) * 10) // 太高也不正常
  } else if (cv >= 0.5) {
    score = 85
  } else if (cv >= 0.35) {
    score = 70
  } else if (cv >= 0.2) {
    score = 55
  } else {
    score = 40
  }

  // 检测连续相似长度句子
  let consecutiveSimilar = 0
  let maxConsecutiveSimilar = 0
  for (let i = 1; i < lengths.length; i++) {
    if (Math.abs(lengths[i] - lengths[i - 1]) <= 5) {
      consecutiveSimilar++
      maxConsecutiveSimilar = Math.max(maxConsecutiveSimilar, consecutiveSimilar)
    } else {
      consecutiveSimilar = 0
    }
  }
  if (maxConsecutiveSimilar >= 4) {
    score = Math.max(30, score - 15)
    issues.push({
      type: '句式多样性',
      severity: 'high',
      location: '全文多处',
      description: `连续${maxConsecutiveSimilar}个句子长度过于接近，句式缺乏变化`,
      suggestedFix: '尝试将部分长句拆短、短句合并，制造长短句交替的节奏感',
    })
  }

  // 检测句首重复
  const starters = sentences.map(s => s.substring(0, Math.min(4, s.length)))
  const starterCounts: Record<string, number> = {}
  starters.forEach(s => {
    starterCounts[s] = (starterCounts[s] || 0) + 1
  })
  const repeatedStarters = Object.entries(starterCounts).filter(([, c]) => c >= 3)
  if (repeatedStarters.length > 0) {
    score = Math.max(30, score - 10)
    const topStarter = repeatedStarters.sort((a, b) => b[1] - a[1])[0]
    issues.push({
      type: '句式多样性',
      severity: 'medium',
      location: '全文多处',
      description: `句首重复模式：「${topStarter[0]}」出现了${topStarter[1]}次`,
      suggestedFix: '变换句式开头，避免连续使用相同的句首词',
    })
  }

  const description = `平均句长${mean.toFixed(1)}字，句长标准差${std.toFixed(1)}，变异系数${cv.toFixed(2)}。${cv < 0.35 ? '句式过于整齐划一，缺乏长短句交替。' : cv > 0.7 ? '句式变化丰富，节奏感好。' : '句式有一定变化，可以更丰富。'}`

  return { score: clamp(score), description, issues }
}

// ============================================================
// 2. 逻辑自然度检测
// ============================================================
function analyzeLogicNaturalness(text: string): { score: number; description: string; issues: Issue[] } {
  const issues: Issue[] = []
  let score = 85

  // 检测逻辑连接词密度
  const logicConnectors = [
    '因此', '所以', '因为', '由于', '于是', '然后', '接着', '随后',
    '首先', '其次', '最后', '第一', '第二', '第三',
    '然而', '但是', '不过', '可是', '虽然', '尽管',
    '如果', '假如', '倘若', '要是',
    '只要', '只有', '无论', '不管',
    '不但', '而且', '不仅', '甚至',
    '或者', '还是', '以及',
  ]

  let connectorCount = 0
  logicConnectors.forEach(conn => {
    const regex = new RegExp(conn, 'g')
    const matches = text.match(regex)
    if (matches) connectorCount += matches.length
  })

  const charCount = text.length
  const connectorDensity = connectorCount / Math.max(1, charCount) * 1000 // 每千字连接词数

  // 网文正常连接词密度约15-30/千字，AI往往超过40
  if (connectorDensity > 50) {
    score = Math.max(30, score - 25)
    issues.push({
      type: '逻辑自然度',
      severity: 'high',
      location: '全文',
      description: `逻辑连接词密度过高（${connectorDensity.toFixed(1)}个/千字），行文过于工整`,
      suggestedFix: '减少逻辑连接词的使用，让叙事更自然流畅，有些因果关系可以隐含表达',
    })
  } else if (connectorDensity > 35) {
    score = Math.max(40, score - 15)
    issues.push({
      type: '逻辑自然度',
      severity: 'medium',
      location: '全文',
      description: `逻辑连接词偏多（${connectorDensity.toFixed(1)}个/千字）`,
      suggestedFix: '适当减少「因此」「所以」「然后」等连接词，让叙事更口语化',
    })
  }

  // 检测"首先…其次…最后"等列举式结构
  const enumerationPattern = /首先[\s\S]*?其次[\s\S]*?(?:最后|再次|接着)/
  if (enumerationPattern.test(text)) {
    score = Math.max(30, score - 15)
    issues.push({
      type: '逻辑自然度',
      severity: 'high',
      location: '全文',
      description: '发现列举式结构「首先…其次…最后…」，过于工整',
      suggestedFix: '将列举式结构改为自然叙述，不要用序数词组织内容',
    })
  }

  // 检测因果链过长（连续出现多个因果连接词）
  const causalChainPattern = /(?:因为|由于)[\s\S]{2,30}(?:所以|因此|于是)[\s\S]{2,30}(?:所以|因此|于是)/
  if (causalChainPattern.test(text)) {
    score = Math.max(30, score - 10)
    issues.push({
      type: '逻辑自然度',
      severity: 'medium',
      location: '全文',
      description: '因果链条过长，逻辑过于平顺',
      suggestedFix: '打断因果链条，插入情感反应或场景描写',
    })
  }

  const description = `逻辑连接词密度${connectorDensity.toFixed(1)}个/千字。${connectorDensity > 35 ? '连接词使用偏多，行文逻辑过于工整。' : '逻辑过渡自然，没有过度使用连接词。'}`

  return { score: clamp(score), description, issues }
}

// ============================================================
// 3. 用词口语化检测
// ============================================================
function analyzeColloquialism(text: string): { score: number; description: string; issues: Issue[] } {
  const issues: Issue[] = []
  let score = 80

  // 口语化标志词（出现越多越口语化）
  const colloquialWords = [
    '啊', '吧', '呢', '嘛', '呗', '哟', '哎', '嗯', '噢', '嘿',
    '啥', '咋', '咋办', '咋样', '干啥', '弄啥',
    '挺好', '不错', '还行', '凑合', '得劲', '带劲',
    '得了', '拉倒', '算了', '行了', '好了',
    '别扯', '瞎说', '胡说', '扯淡', '放屁', '扯犊子',
    '牛逼', '厉害', '牛', '猛', '绝了', '太绝了',
    '卧槽', '我去', '我天', '天呐', '妈呀', '哎哟',
    '真的', '假的', '不是吧', '不会吧', '怎么可能',
    '得了吧', '拉倒吧', '别逗了', '少来',
    '你说呢', '你想想', '你看看', '你说说',
    '就这', '就这？', '就离谱', '太离谱了',
    '笑死', '笑麻了', '笑不活了', '绷不住',
    '绝了', '离谱', '离大谱', '上头', '破防',
    '真香', '打脸', '翻车', '翻水水',
    '咱', '咱们', '俺', '俺们', '爷', '老子',
    '哥', '姐', '兄弟', '哥们', '姐们',
    '这', '那', '这儿', '那儿', '这会儿', '那会儿',
    '咋回事', '什么情况', '搞什么', '闹哪样',
    '赶紧', '麻溜', '快点', '抓紧',
    '没事', '没关系', '不要紧', '没啥',
    '行吧', '好吧', '成吧', '中',
  ]

  // 书面化/翻译腔/AI议论腔的词（真人网文极少用；仿佛/然而/缓缓地/凝视/霎时间 等
  // 真人文学向常用词已移出，避免对古典/历史/仙侠类真人原著系统性误伤）
  const formalWords = [
    '此外', '另外', '同时', '因而', '故而', '是以',
    '不仅', '而且', '固然', '诚然',
    '颇为', '甚为', '极为', '尤为',
    '情不自禁',
    '徜徉', '徘徊', '踌躇', '踯躅', '彷徨',
    '宛如一幅', '仿佛置身', '犹如梦境',
    '心中暗想', '心中暗道', '心中暗自',
    '不由自主', '身不由己',
  ]

  let colloquialCount = 0
  colloquialWords.forEach(w => {
    const regex = new RegExp(w, 'g')
    const matches = text.match(regex)
    if (matches) colloquialCount += matches.length
  })

  let formalCount = 0
  formalWords.forEach(w => {
    const regex = new RegExp(w, 'g')
    const matches = text.match(regex)
    if (matches) formalCount += matches.length
  })

  const totalWords = Math.max(1, colloquialCount + formalCount)
  const colloquialRatio = colloquialCount / totalWords

  // 网文口语化比例应该在0.6以上
  if (colloquialRatio >= 0.65) {
    score = 90
  } else if (colloquialRatio >= 0.5) {
    score = 78
  } else if (colloquialRatio >= 0.35) {
    score = 65
  } else if (colloquialRatio >= 0.2) {
    score = 50
  } else {
    score = 35
  }

  if (colloquialRatio < 0.4) {
    issues.push({
      type: '用词口语化',
      severity: 'high',
      location: '全文',
      description: `用词过于书面化，口语化比例仅${(colloquialRatio * 100).toFixed(0)}%`,
      suggestedFix: '增加口语化表达，网文读者喜欢接地气的语言，减少文绉绉的词汇',
    })
  }

  // 检测四字成语过度使用
  const idiomPattern = /[^\n]{0,2}[一-龥]{4}[^\n]{0,2}/g
  const idiomMatches = text.match(idiomPattern) || []
  // 简单估算：四字连续出现频率
  const fourCharPattern = /[一-龥]{4}/g
  const fourCharMatches = text.match(fourCharPattern) || []
  const fourCharDensity = fourCharMatches.length / Math.max(1, charCount(text)) * 100

  if (fourCharDensity > 15) {
    score = Math.max(25, score - 15)
    issues.push({
      type: '用词口语化',
      severity: 'medium',
      location: '全文',
      description: '四字词语密度过高，行文有堆砌感',
      suggestedFix: '减少四字成语的使用，用更直白的白话表达',
    })
  }

  const description = `口语化比例${(colloquialRatio * 100).toFixed(0)}%（口语词${colloquialCount}个，书面词${formalCount}个）。${colloquialRatio < 0.4 ? '用词偏书面化，建议增加口语表达。' : '用词较为口语化，符合网文风格。'}`

  return { score: clamp(score), description, issues }
}

/** 辅助：计算中文字符数 */
function charCount(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length
}

// ============================================================
// 4. 段落节奏感检测
// ============================================================
function analyzeParagraphRhythm(text: string): { score: number; description: string; issues: Issue[] } {
  const issues: Issue[] = []
  const paragraphs = splitParagraphs(text)

  if (paragraphs.length < 2) {
    return {
      score: 70,
      description: '段落过少，无法评估段落节奏',
      issues: [],
    }
  }

  const paraLengths = paragraphs.map(p => p.length)
  const mean = paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length
  const std = standardDeviation(paraLengths)
  const cv = coefficientOfVariation(paraLengths)

  let score = 80

  // 人类写作段落CV通常在0.4-1.0，AI往往在0.15-0.4
  if (cv >= 0.6) {
    score = 90
  } else if (cv >= 0.4) {
    score = 82
  } else if (cv >= 0.25) {
    score = 65
  } else {
    score = 45
  }

  // 检测段落长度过于均匀
  if (cv < 0.25) {
    issues.push({
      type: '段落节奏感',
      severity: 'high',
      location: '全文',
      description: `段落长度过于均匀（平均${mean.toFixed(0)}字，变异系数仅${cv.toFixed(2)}）`,
      suggestedFix: '打破均匀的段落结构，重要情节用长段渲染，转折处用短段甚至单句成段',
    })
  }

  // 检测是否所有段落都差不多长（AI特征）
  const lengthGroups: Record<string, number> = {}
  paraLengths.forEach(l => {
    const group = l < 30 ? '短' : l < 80 ? '中' : l < 150 ? '长' : '超长'
    lengthGroups[group] = (lengthGroups[group] || 0) + 1
  })
  const groupCount = Object.keys(lengthGroups).length
  if (groupCount === 1) {
    score = Math.max(30, score - 20)
    issues.push({
      type: '段落节奏感',
      severity: 'high',
      location: '全文',
      description: '所有段落长度都属于同一级别，缺乏节奏变化',
      suggestedFix: '混合使用短段（1-2句）和长段（5-8句），制造阅读节奏',
    })
  }

  // 检测单句成段（好的节奏标志）
  const singleSentenceParas = paragraphs.filter(p => {
    const s = splitSentences(p)
    return s.length === 1
  }).length
  const singleSentenceRatio = singleSentenceParas / paragraphs.length
  if (singleSentenceRatio > 0 && singleSentenceRatio < 0.1) {
    score = Math.min(95, score + 5) // 适当加分
  } else if (singleSentenceRatio === 0 && paragraphs.length > 5) {
    score = Math.max(30, score - 8)
    issues.push({
      type: '段落节奏感',
      severity: 'low',
      location: '全文',
      description: '没有单句成段，节奏可能过于平稳',
      suggestedFix: '在关键转折处尝试单句成段，制造停顿和冲击感',
    })
  }

  const description = `共${paragraphs.length}个段落，平均${mean.toFixed(0)}字/段，变异系数${cv.toFixed(2)}。${cv < 0.25 ? '段落长度过于均匀，缺乏节奏变化。' : '段落长短交替，节奏感较好。'}`

  return { score: clamp(score), description, issues }
}

// ============================================================
// 5. 情感真实度检测
// ============================================================
function analyzeEmotionAuthenticity(text: string): { score: number; description: string; issues: Issue[] } {
  const issues: Issue[] = []
  let score = 80

  // 情感词密度
  let emotionCount = 0
  EMOTION_KEYWORDS.forEach(kw => {
    const regex = new RegExp(kw, 'g')
    const matches = text.match(regex)
    if (matches) emotionCount += matches.length
  })

  const totalChars = Math.max(1, charCount(text))
  const emotionDensity = emotionCount / totalChars * 100

  // 网文情感词密度约2-6%，AI往往低于2%或过于集中在某些词
  if (emotionDensity < 1) {
    score = Math.max(30, score - 25)
    issues.push({
      type: '情感真实度',
      severity: 'high',
      location: '全文',
      description: '情感词密度极低，行文过于冷静平淡',
      suggestedFix: '增加人物的情感反应，愤怒时可以骂人，开心时可以大笑，不要总是冷静叙述',
    })
  } else if (emotionDensity < 2) {
    score = Math.max(40, score - 15)
    issues.push({
      type: '情感真实度',
      severity: 'medium',
      location: '全文',
      description: '情感表达偏少，人物情绪不够鲜明',
      suggestedFix: '通过对话和内心独白增加情感浓度',
    })
  } else if (emotionDensity > 8) {
    score = Math.max(40, score - 10)
    issues.push({
      type: '情感真实度',
      severity: 'medium',
      location: '全文',
      description: '情感词密度过高，可能过于直白',
      suggestedFix: '减少直接的情感标签，用行为和细节暗示情感',
    })
  }

  // 检测情感波动（情感词在文本中的分布是否均匀）
  const paragraphs = splitParagraphs(text)
  const paraEmotions = paragraphs.map(p => {
    let count = 0
    EMOTION_KEYWORDS.forEach(kw => {
      const regex = new RegExp(kw, 'g')
      const matches = p.match(regex)
      if (matches) count += matches.length
    })
    return count
  })
  const emotionCV = coefficientOfVariation(paraEmotions.map(e => Math.max(e, 0.1)))

  // 情感分布应该有波动（CV>0.5），AI往往分布很均匀（CV<0.3）
  if (emotionCV < 0.3 && paragraphs.length > 3) {
    score = Math.max(30, score - 10)
    issues.push({
      type: '情感真实度',
      severity: 'medium',
      location: '全文',
      description: '情感分布过于均匀，缺乏真实的情感起伏',
      suggestedFix: '在关键情节集中爆发情感，平淡处减少情感描写，制造情绪波动',
    })
  }

  // 检测感叹号使用（人类情感强烈时感叹号多）
  const exclamationCount = (text.match(/！/g) || []).length
  const questionCount = (text.match(/？/g) || []).length
  const totalSentences = splitSentences(text).length
  const emotionPunctuationRatio = (exclamationCount + questionCount) / Math.max(1, totalSentences)

  if (emotionPunctuationRatio < 0.05 && totalSentences > 10) {
    score = Math.max(30, score - 8)
    issues.push({
      type: '情感真实度',
      severity: 'low',
      location: '全文',
      description: '感叹号和问号使用极少，语气过于平淡',
      suggestedFix: '在对话和内心独白中适当使用感叹号和问号，增强语气',
    })
  }

  const description = `情感词密度${emotionDensity.toFixed(1)}%，情感分布变异系数${emotionCV.toFixed(2)}。${emotionDensity < 2 ? '情感表达不足，行文偏平淡。' : emotionDensity > 8 ? '情感词偏多，可能过于直白。' : '情感表达较为自然。'}`

  return { score: clamp(score), description, issues }
}

// ============================================================
// 6. 细节密度检测
// ============================================================
function analyzeDetailDensity(text: string): { score: number; description: string; issues: Issue[] } {
  const issues: Issue[] = []
  let score = 78

  // 感官细节词密度
  let sensoryCount = 0
  SENSORY_KEYWORDS.forEach(kw => {
    const regex = new RegExp(kw, 'g')
    const matches = text.match(regex)
    if (matches) sensoryCount += matches.length
  })

  const totalChars = Math.max(1, charCount(text))
  const sensoryDensity = sensoryCount / totalChars * 100

  // 网文感官细节密度约3-8%
  if (sensoryDensity < 2) {
    score = Math.max(25, score - 30)
    issues.push({
      type: '细节密度',
      severity: 'high',
      location: '全文',
      description: '感官细节严重不足，行文空洞缺乏画面感',
      suggestedFix: '增加视觉（颜色、光影）、听觉（声音）、触觉（温度、质感）等感官描写',
    })
  } else if (sensoryDensity < 3.5) {
    score = Math.max(40, score - 18)
    issues.push({
      type: '细节密度',
      severity: 'medium',
      location: '全文',
      description: '感官细节偏少，场景描写可能不够具体',
      suggestedFix: '在关键场景增加至少2-3个感官细节，让读者"看到""听到""感受到"',
    })
  } else if (sensoryDensity > 10) {
    score = Math.max(50, score - 5)
  }

  // 检测对话比例（网文对话比例高更自然）
  const dialoguePattern = /[""「」『』][^""「」『』\n]{1,200}[""「」『』]/g
  const dialogueMatches = text.match(dialoguePattern) || []
  const dialogueChars = dialogueMatches.reduce((sum, d) => sum + d.length, 0)
  const dialogueRatio = dialogueChars / Math.max(1, text.length)

  if (dialogueRatio < 0.15 && text.length > 500) {
    score = Math.max(25, score - 15)
    issues.push({
      type: '细节密度',
      severity: 'medium',
      location: '全文',
      description: `对话比例仅${(dialogueRatio * 100).toFixed(0)}%，叙事偏重描写`,
      suggestedFix: '增加人物对话，通过对话推进剧情和展现人物性格',
    })
  } else if (dialogueRatio >= 0.25 && dialogueRatio <= 0.5) {
    score = Math.min(95, score + 8) // 对话比例好，加分
  }

  // 检测具体数字/量词使用（有具体数字更真实）
  const numberPattern = /\d+[个只条件把张块斤米公里岁年月天小时分钟秒%％]/g
  const numberMatches = text.match(numberPattern) || []
  if (numberMatches.length === 0 && text.length > 300) {
    score = Math.max(30, score - 8)
    issues.push({
      type: '细节密度',
      severity: 'low',
      location: '全文',
      description: '缺少具体数字和量词，描写可能过于抽象',
      suggestedFix: '用具体数字替代模糊表达，如「三步远」比「很近」更有画面感',
    })
  }

  const description = `感官细节密度${sensoryDensity.toFixed(1)}%，对话比例${(dialogueRatio * 100).toFixed(0)}%。${sensoryDensity < 3 ? '细节描写不足，建议增加感官细节。' : '细节较为丰富，画面感较好。'}`

  return { score: clamp(score), description, issues }
}

// ============================================================
// 7. AI高频词检测
// ============================================================
function analyzeAIFrequencyWords(text: string): { score: number; description: string; issues: Issue[] } {
  const issues: Issue[] = []
  let totalHits = 0
  const foundWords: { word: string; count: number; locations: string[] }[] = []

  AI_TEMPLATES.forEach(word => {
    const regex = new RegExp(word, 'g')
    const matches = text.match(regex)
    if (matches && matches.length > 0) {
      totalHits += matches.length
      // 找到出现位置
      const locations: string[] = []
      const paragraphs = splitParagraphs(text)
      paragraphs.forEach((p, idx) => {
        if (p.includes(word)) {
          locations.push(`第${idx + 1}段`)
        }
      })
      foundWords.push({ word, count: matches.length, locations: [...new Set(locations)] })
    }
  })

  // AI高频词越少越好，分数越高
  // isInverse = true，所以score高=好（词少）
  let score: number
  if (totalHits === 0) {
    score = 98
  } else if (totalHits <= 2) {
    score = 85
  } else if (totalHits <= 5) {
    score = 70
  } else if (totalHits <= 10) {
    score = 55
  } else if (totalHits <= 20) {
    score = 40
  } else {
    score = 25
  }

  // 生成具体问题
  foundWords.sort((a, b) => b.count - a.count)
  foundWords.slice(0, 8).forEach(fw => {
    // 查找对应的修复建议
    const rule = AI_PATTERN_RULES.find(r => r.label.includes(fw.word))
    const suggestedFix = rule ? rule.fix : '替换为更自然的表达方式'
    const severity = fw.count >= 3 ? 'high' : fw.count >= 2 ? 'medium' : 'low'
    issues.push({
      type: 'AI高频词',
      severity,
      location: fw.locations.slice(0, 3).join('、'),
      description: `发现AI典型词「${fw.word}」${fw.count > 1 ? `出现${fw.count}次` : ''}`,
      suggestedFix,
    })
  })

  const description = `检测到${totalHits}个AI典型词汇/句式。${totalHits === 0 ? '未发现AI高频词，表现优秀。' : totalHits <= 3 ? 'AI高频词较少，整体可控。' : 'AI高频词较多，需要重点修改。'}`

  return { score: clamp(score), description, issues }
}

// ============================================================
// 8. 模板化程度检测
// ============================================================
function analyzeTemplateLevel(text: string): { score: number; description: string; issues: Issue[] } {
  const issues: Issue[] = []
  let score = 85
  let templateHits = 0

  // 检测AI句式模式
  AI_PATTERN_RULES.forEach(rule => {
    const matches = text.match(rule.pattern)
    if (matches) {
      templateHits += matches.length
      // 只报告前几个
      if (issues.length < 10) {
        const paragraphs = splitParagraphs(text)
        const locations: string[] = []
        paragraphs.forEach((p, idx) => {
          if (rule.pattern.test(p)) {
            locations.push(`第${idx + 1}段`)
            rule.pattern.lastIndex = 0 // reset regex
          }
          rule.pattern.lastIndex = 0
        })
        issues.push({
          type: '模板化程度',
          severity: matches.length >= 3 ? 'high' : matches.length >= 2 ? 'medium' : 'low',
          location: [...new Set(locations)].slice(0, 3).join('、'),
          description: rule.label + (matches.length > 1 ? `（出现${matches.length}次）` : ''),
          suggestedFix: rule.fix,
        })
      }
    }
  })

  // isInverse = true，score高=好（模板少）
  if (templateHits === 0) {
    score = 98
  } else if (templateHits <= 2) {
    score = 88
  } else if (templateHits <= 5) {
    score = 72
  } else if (templateHits <= 10) {
    score = 55
  } else if (templateHits <= 20) {
    score = 38
  } else {
    score = 20
  }

  // 额外检测：开头和结尾是否模板化
  const paragraphs = splitParagraphs(text)
  if (paragraphs.length > 0) {
    const firstPara = paragraphs[0]
    const openingPatterns = [
      /在这个(?:充满|快速发展的|瞬息万变的)/,
      /随着(?:时间|社会|科技|时代)/,
      /(?:清晨|黄昏|夜晚|黎明|午后)，/,
      /(?:春|夏|秋|冬)(?:天|日|季)/,
    ]
    const hasTemplateOpening = openingPatterns.some(p => p.test(firstPara))
    if (hasTemplateOpening) {
      score = Math.max(15, score - 10)
      issues.push({
        type: '模板化程度',
        severity: 'medium',
        location: '第1段',
        description: '开篇使用了常见的模板化句式',
        suggestedFix: '开篇直接切入冲突或人物，不要用时间/天气/环境描写起手',
      })
    }

    // 检测结尾模板化
    const lastPara = paragraphs[paragraphs.length - 1]
    const endingPatterns = [
      /总而言之|综上所述|总的来说|总之/,
      /故事才刚刚开始|一切才刚刚开始/,
      /他(她)?知道，.*才刚刚开始/,
    ]
    const hasTemplateEnding = endingPatterns.some(p => p.test(lastPara))
    if (hasTemplateEnding) {
      score = Math.max(15, score - 10)
      issues.push({
        type: '模板化程度',
        severity: 'medium',
        location: `第${paragraphs.length}段`,
        description: '结尾使用了常见的模板化总结句',
        suggestedFix: '结尾用悬念、反转或人物的一句话收束，不要用总结式结尾',
      })
    }
  }

  // 检测重复句式模式（连续段落以相同方式开头）
  if (paragraphs.length >= 4) {
    const starters = paragraphs.map(p => {
      const s = p.substring(0, Math.min(6, p.length))
      return s
    })
    let repeatCount = 0
    for (let i = 1; i < starters.length; i++) {
      if (starters[i] === starters[i - 1]) {
        repeatCount++
      }
    }
    if (repeatCount >= 2) {
      score = Math.max(15, score - 12)
      issues.push({
        type: '模板化程度',
        severity: 'high',
        location: '全文多处',
        description: '多个段落以相同方式开头，模板化痕迹明显',
        suggestedFix: '变换每个段落的开头方式，避免重复',
      })
    }
  }

  const description = `检测到${templateHits}处模板化表达。${templateHits === 0 ? '未发现模板化痕迹，表现优秀。' : templateHits <= 3 ? '有少量模板化表达，整体可控。' : '模板化程度较高，需要重点修改。'}`

  return { score: clamp(score), description, issues }
}

// ============================================================
// 综合评分计算
// ============================================================
interface Issue {
  type: string
  severity: 'high' | 'medium' | 'low'
  location: string
  description: string
  suggestedFix: string
}

interface DimensionResult {
  score: number
  description: string
  issues: Issue[]
}

function calculateOverallScore(dimensions: { name: string; score: number; isInverse: boolean }[]): number {
  // 加权平均
  const weights: Record<string, number> = {
    '句式多样性': 0.12,
    '逻辑自然度': 0.10,
    '用词口语化': 0.12,
    '段落节奏感': 0.10,
    '情感真实度': 0.13,
    '细节密度': 0.13,
    'AI高频词': 0.15,
    '模板化程度': 0.15,
  }

  let totalWeight = 0
  let weightedSum = 0
  dimensions.forEach(d => {
    const w = weights[d.name] || 0.1
    weightedSum += d.score * w
    totalWeight += w
  })

  return clamp(Math.round(weightedSum / Math.max(0.01, totalWeight)))
}

function determineLevel(overallScore: number, aiRate: number): string {
  if (overallScore >= 80 && aiRate < 15) return 'safe'
  if (overallScore >= 60 && aiRate < 25) return 'warning'
  return 'danger'
}

// ============================================================
// API路由处理
// ============================================================
export async function POST(request: Request) {
  try {
    const { text, llmConfig } = await request.json()

    let userId: string | undefined
    try {
      const authHeader = request.headers.get('Authorization') || ''
      const token = authHeader.replace('Bearer ', '')
      if (token) {
        const decoded = await verifyToken(token)
        if (decoded) userId = decoded.userId
      }
    } catch (_e) {}

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: '请提供需要检测的文本内容' },
        { status: 400 }
      )
    }

    if (text.trim().length < 50) {
      return NextResponse.json(
        { error: '文本过短（至少需要50字），无法进行有效检测' },
        { status: 400 }
      )
    }

    const sentenceDiversity = analyzeSentenceDiversity(text)
    const logicNaturalness = analyzeLogicNaturalness(text)
    const colloquialism = analyzeColloquialism(text)
    const paragraphRhythm = analyzeParagraphRhythm(text)
    const emotionAuthenticity = analyzeEmotionAuthenticity(text)
    const detailDensity = analyzeDetailDensity(text)
    const aiFrequencyWords = analyzeAIFrequencyWords(text)
    const templateLevel = analyzeTemplateLevel(text)

    const scores = [
      { name: '句式多样性', score: sentenceDiversity.score, isInverse: false, description: sentenceDiversity.description },
      { name: '逻辑自然度', score: logicNaturalness.score, isInverse: false, description: logicNaturalness.description },
      { name: '用词口语化', score: colloquialism.score, isInverse: false, description: colloquialism.description },
      { name: '段落节奏感', score: paragraphRhythm.score, isInverse: false, description: paragraphRhythm.description },
      { name: '情感真实度', score: emotionAuthenticity.score, isInverse: false, description: emotionAuthenticity.description },
      { name: '细节密度', score: detailDensity.score, isInverse: false, description: detailDensity.description },
      { name: 'AI高频词', score: aiFrequencyWords.score, isInverse: true, description: aiFrequencyWords.description },
      { name: '模板化程度', score: templateLevel.score, isInverse: true, description: templateLevel.description },
    ]

    const algorithmOverallScore = calculateOverallScore(scores)
    const algorithmAiRate = 100 - algorithmOverallScore

    let overallScore = algorithmOverallScore
    let aiRate = algorithmAiRate
    let llmEnhanced = false
    let llmReasons: string[] = []
    let llmSuggestions: string[] = []

    const resolvedCfg = llmConfig ? resolveLLMConfig(llmConfig as any, userId, 'compliance') : null
    if (resolvedCfg && resolvedCfg.apiKey) {
      try {
        const messages: LLMMessage[] = [
          { role: 'system', content: '你是一位AI文本检测专家。请分析以下文本是否像AI生成的，从1-10评分（10=最像AI），并给出具体理由。用JSON格式回复：{"aiScore":数字,"reasons":["理由1","理由2"],"suggestions":["建议1","建议2"]}' },
          { role: 'user', content: text },
        ]
        const { content: llmResult } = await callLLMWithFallback(resolvedCfg as LLMConfig, messages)

        const jsonMatch = llmResult.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          const llmAiScore = typeof parsed.aiScore === 'number' ? parsed.aiScore : 5
          const llmAiRate = (llmAiScore / 10) * 100

          overallScore = Math.round(algorithmOverallScore * 0.6 + (100 - llmAiRate) * 0.4)
          aiRate = 100 - overallScore
          llmEnhanced = true

          if (Array.isArray(parsed.reasons)) {
            llmReasons = parsed.reasons.filter((r: unknown) => typeof r === 'string')
          }
          if (Array.isArray(parsed.suggestions)) {
            llmSuggestions = parsed.suggestions.filter((s: unknown) => typeof s === 'string')
          }
        }
      } catch (llmError) {
        console.error('[AI Detect] 大模型深度检测失败，仅使用算法结果:', llmError)
      }
    }

    const level = determineLevel(overallScore, aiRate)

    const allIssues: Issue[] = [
      ...sentenceDiversity.issues,
      ...logicNaturalness.issues,
      ...colloquialism.issues,
      ...paragraphRhythm.issues,
      ...emotionAuthenticity.issues,
      ...detailDensity.issues,
      ...aiFrequencyWords.issues,
      ...templateLevel.issues,
    ].sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 }
      return severityOrder[a.severity] - severityOrder[b.severity]
    })

    const limitedIssues = allIssues.slice(0, 20)

    const result: Record<string, unknown> = {
      overallScore,
      aiRate,
      level,
      scores,
      issues: limitedIssues,
      llmEnhanced,
    }

    if (llmEnhanced) {
      result.llmReasons = llmReasons
      result.llmSuggestions = llmSuggestions
    }

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('AI检测引擎错误:', error)
    return NextResponse.json(
      { error: '检测过程中发生错误，请重试' },
      { status: 500 }
    )
  }
}
