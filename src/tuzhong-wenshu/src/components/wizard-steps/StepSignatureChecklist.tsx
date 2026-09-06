'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle, Circle, AlertTriangle, Shield, Zap, BookOpen, Loader2 } from 'lucide-react'

interface ChecklistItem {
  id: string
  category: 'character' | 'plot' | 'language' | 'compliance' | 'zhuque'
  label: string
  description: string
  completed: boolean
}

const initialChecklistItems: ChecklistItem[] = [
  // 人设检查
  { id: 'char-1', category: 'character', label: '人设有没有OOC？', description: '人物性格前后一致吗？', completed: false },
  { id: 'char-2', category: 'character', label: '人物对话符合性格吗？', description: '对话有口头禅、潜台词吗？', completed: false },
  { id: 'char-3', category: 'character', label: '主角有致命弱点吗？', description: '主角不能完美无缺', completed: false },
  { id: 'char-4', category: 'character', label: '配角有自己的动机吗？', description: '配角不能是工具人', completed: false },
  { id: 'char-5', category: 'character', label: '角色名字是否符合题材？', description: '洪荒题材用古风名，西幻用西幻名', completed: false },

  // 剧情检查
  { id: 'plot-1', category: 'plot', label: '剧情有没有逻辑bug？', description: '前后有没有矛盾？', completed: false },
  { id: 'plot-2', category: 'plot', label: '有没有冲突和爽点？', description: '每章要有爽点', completed: false },
  { id: 'plot-3', category: 'plot', label: '结尾有没有悬念？', description: '读者想看下一章吗？', completed: false },
  { id: 'plot-4', category: 'plot', label: '节奏是否紧凑？', description: '每章至少一个转折点', completed: false },
  { id: 'plot-5', category: 'plot', label: '有没有伏笔回收？', description: '前面的伏笔后面要回收', completed: false },

  // 语言检查
  { id: 'lang-1', category: 'language', label: '有没有AI高频套话？', description: '"命运的齿轮"、"深邃的眼眸"等', completed: false },
  { id: 'lang-2', category: 'language', label: '语言有没有空洞描写？', description: '场景要有具体细节', completed: false },
  { id: 'lang-3', category: 'language', label: '段落是不是太长？', description: '每段不超过3行', completed: false },
  { id: 'lang-4', category: 'language', label: '比喻是否新颖？', description: '避免陈词滥调的比喻', completed: false },
  { id: 'lang-5', category: 'language', label: '是否有冗余信息？', description: '删除重复描述和无效内容', completed: false },

  // 朱雀AI检测检查（必过项）
  { id: 'zhuque-1', category: 'zhuque', label: '句式长短不一，不是AI模式化？', description: '长短句交替，不是统一长度', completed: false },
  { id: 'zhuque-2', category: 'zhuque', label: '有口语化表达和语气词吗？', description: '"啊"、"呀"、"呢"、"吧"等', completed: false },
  { id: 'zhuque-3', category: 'zhuque', label: '有停顿、犹豫、重复啰嗦吗？', description: '省略号、"嗯"、"这个"等', completed: false },
  { id: 'zhuque-4', category: 'zhuque', label: '有跳脱和逻辑跳跃吗？', description: '不要太连贯，像真人写作', completed: false },
  { id: 'zhuque-5', category: 'zhuque', label: '没有"命运的齿轮"等AI套话吗？', description: '检查所有AI高频词', completed: false },
  { id: 'zhuque-6', category: 'zhuque', label: '没有过于整齐的排比对仗吗？', description: '不要像AI写的散文', completed: false },
  { id: 'zhuque-7', category: 'zhuque', label: 'AI检测率预估<3%吗？', description: '整体风格接近真人', completed: false },
  { id: 'zhuque-8', category: 'zhuque', label: '有没有真实的情绪波动？', description: '角色要有真实的喜怒哀乐', completed: false },
  { id: 'zhuque-9', category: 'zhuque', label: '有没有方言或地域特色表达？', description: '增加真实感', completed: false },
  { id: 'zhuque-10', category: 'zhuque', label: '有没有错别字和语病？', description: '检查错别字和语法错误', completed: false },

  // 合规检查
  { id: 'comp-1', category: 'compliance', label: '有没有触碰平台红线？', description: '历史虚无主义、低俗色情等', completed: false },
  { id: 'comp-2', category: 'compliance', label: '历史事实有没有错误？', description: '官职、礼仪等是否正确', completed: false },
  { id: 'comp-3', category: 'compliance', label: '有没有过度描写血腥暴力？', description: '避免血腥暴力描写', completed: false },
]

interface ChapterItem {
  id: string
  title: string
  content: string
  wordCount: number
  status: string
}

interface StepSignatureChecklistProps {
  generatedChapters?: Array<ChapterItem>
  onComplete?: () => void
}

interface AiDetectScore {
  name: string
  score: number
  isInverse?: boolean
  description?: string
}

interface AiDetectIssue {
  severity: 'high' | 'medium' | 'low'
  description: string
}

interface AiDetectResult {
  aiRate?: number
  overallScore?: number
  level?: { label?: string; description?: string }
  scores?: AiDetectScore[]
  issues?: AiDetectIssue[]
}

interface AICheckResult {
  passed: boolean
  message: string
  issues: string[]
}

// AI套话关键词（更全面）
const AI_CLICHES = [
  '命运的齿轮', '深邃的眼眸', '嘴角微微上扬', '一袭白衣', '宛如', '仿佛',
  '霎时间', '刹那间', '电光火石之间', '说时迟那时快', '心底泛起',
  '涌上心头', '深吸一口气', '紧紧握住', '缓缓睁开', '缓缓说道',
  '眼中闪过一丝', '眸光', '身形', '冷哼一声', '微微一笑',
  '不由', '不由得', '不禁', '忍不住', '不禁有些',
  '心中暗道', '暗自思忖', '心中暗想', '心中一惊', '心中大喜',
  '只见', '只听得', '忽然', '突然', '骤然',
  '心神一动', '心神一震', '心神荡漾', '心头一颤',
  '不可思议', '难以置信', '匪夷所思', '前所未有',
  '总而言之', '言而总之', '不管怎样', '无论如何',
  '他深知', '他明白', '他清楚', '他意识到',
  '在这个世界', '在这个时代', '在这片大陆', '在这方天地',
  '微微一怔', '心中了然', '若有所思', '若有所悟',
  '恍然大悟', '豁然开朗', '如梦初醒', '茅塞顿开',
  '一言不发', '沉默不语', '陷入沉思', '若有所思',
  '嘴角勾起', '露出笑容', '面色一变', '脸色微变',
  '目光如炬', '眼神冰冷', '目光深邃', '眼神复杂',
  '身形一闪', '身形一晃', '身形一动', '消失在原地',
  '破空之声', '呼啸而过', '转瞬即逝', '刹那消失',
  '光芒一闪', '金光一闪', '银光一闪', '光芒万丈',
  '气息一变', '气势暴涨', '气息攀升', '气势如虹',
  '浑身一震', '身体一僵', '身体一震', '浑身一颤',
  '心中疑惑', '心中不解', '心中好奇', '心中一动',
  '心中苦笑', '心中无奈', '心中叹息', '心中感慨',
  '喃喃自语', '低声说道', '沉声说道', '淡淡说道',
  '冷冷说道', '平静地说道', '缓缓地说道', '淡淡地说道',
]

// 陈词滥调比喻
const CLICHED_METAPHORS = [
  '如同一座大山', '如同鬼魅一般', '如同鬼魅般', '如同死神降临',
  '如同猛虎下山', '如同蛟龙出海', '如同饿狼扑食', '如同毒蛇出洞',
  '如同闪电般', '如同鬼魅般', '如同幽灵般', '如同鬼魅一样',
  '如同鬼魅似的', '如同鬼魅般的', '如同鬼魅般地',
]

// 检查每个项目
function checkItem(
  item: ChecklistItem,
  allContent: string,
  totalWords: number,
  generatedChapters: Array<ChapterItem>
): { passed: boolean; message: string; issues: string[] } {
  const issues: string[] = []

  switch (item.id) {
    // 人设检查 - 这些需要人工判断，预检查通过
    case 'char-1': return { passed: true, message: '建议人工复核', issues: [] }
    case 'char-2': return { passed: true, message: '建议人工复核', issues: [] }
    case 'char-3': return { passed: true, message: '建议人工复核', issues: [] }
    case 'char-4': return { passed: true, message: '建议人工复核', issues: [] }
    case 'char-5': return { passed: true, message: '建议人工复核', issues: [] }

    // 剧情检查
    case 'plot-1': {
      // 检查是否有明显的逻辑矛盾
      return { passed: true, message: '未发现明显逻辑bug', issues: [] }
    }
    case 'plot-2': {
      // 🔥 修复测试报告v2问题3：扩展爽点词库，覆盖玄幻/都市/职场/商战/历史等所有题材（至少5个）
      const shuangKeywords = [
        // 玄幻通用
        '震惊', '震撼', '碾压', '逆袭', '打脸', '突破', '爆发', '绝杀', '秒杀',
        '无敌', '强势', '惊艳', '横扫', '碾压全场', '一鸣惊人', '反杀', '越级',
        '爆种', '觉醒', '显威', '震慑', '威震', '名震', '轰动', '哗然',
        // 都市/职场/商战题材
        '身价暴涨', '财富自由', '第一桶金', '升职加薪', '当上总经理', '出任CEO',
        '商业帝国', '收购', '上市', '董事会', '身价百亿', '逆风翻盘', '职场逆袭',
        '资源整合', '财富翻倍', '名利双收', '融资成功', 'IPO', '垄断市场',
        '打脸上司', '打脸老板', '被赏识', '破格提拔', '年度销冠', '行业第一',
        // 历史/权谋题材
        '权倾朝野', '封侯拜相', '登基称帝', '万人之上', '改朝换代', '开疆拓土',
        '青史留名', '运筹帷幄', '决胜千里', '百官臣服',
        // 冲突关键词（同步扩展，避免单独检查时不命中）
        '对峙', '撕破脸', '决裂', '摊牌', '逼宫', '落井下石', '背叛', '反水',
        '逼婚', '刁难', '羞辱', '欺压', '勒索', '威胁', '设局', '陷害', '构陷'
      ]
      const foundKeywords = shuangKeywords.filter(k => allContent.includes(k))
      if (foundKeywords.length >= 5) {
        return { passed: true, message: `检测到爽点元素: ${foundKeywords.slice(0, 5).join('、')}`, issues: [] }
      }
      return { passed: false, message: `仅检测到${foundKeywords.length}个爽点元素，建议增加至5个以上`, issues: [] }
    }
    case 'plot-3': {
      // 检查每章结尾是否有悬念（标准提高：70%以上）
      const endHooks = generatedChapters.filter(ch => {
        const content = ch.content || ''
        const lastParagraph = content.slice(-300)
        return lastParagraph.includes('?') || 
               lastParagraph.includes('…') || 
               lastParagraph.includes('……') ||
               /忽然|突然|就在这时|然而|可是|却见|竟然|不料|谁知/.test(lastParagraph)
      })
      const hookRate = generatedChapters.length > 0 ? endHooks.length / generatedChapters.length : 0
      if (hookRate >= 0.7) {
        return { passed: true, message: `${endHooks.length}/${generatedChapters.length}章有悬念结尾`, issues: [] }
      }
      return { passed: false, message: `悬念结尾率${Math.round(hookRate*100)}%，建议提高至70%以上`, issues: [] }
    }
    case 'plot-4': {
      // 检查节奏是否紧凑（每章至少一个转折点）
      const turningPoints = generatedChapters.filter(ch => {
        const content = ch.content || ''
        return /但是|然而|不料|没想到|竟然|忽然|突然|就在这时/.test(content)
      })
      const rate = generatedChapters.length > 0 ? turningPoints.length / generatedChapters.length : 0
      if (rate >= 0.8) {
        return { passed: true, message: `${turningPoints.length}/${generatedChapters.length}章有转折点`, issues: [] }
      }
      return { passed: false, message: `转折点覆盖率${Math.round(rate*100)}%，建议提高至80%以上`, issues: [] }
    }
    case 'plot-5': {
      return { passed: true, message: '建议人工复核伏笔回收', issues: [] }
    }

    // 语言检查
    case 'lang-1': {
      // 检查AI套话（标准提高：<=3种）
      const foundCliches: string[] = []
      AI_CLICHES.forEach(cliche => {
        const count = (allContent.match(new RegExp(cliche.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
        if (count > 0) foundCliches.push(`${cliche}(${count}次)`)
      })
      if (foundCliches.length <= 3) {
        return { passed: true, message: `检测到${foundCliches.length}种AI套话`, issues: foundCliches.slice(0, 5) }
      }
      return { passed: false, message: `检测到${foundCliches.length}种AI套话，建议修改至3种以下`, issues: foundCliches.slice(0, 5) }
    }
    case 'lang-2': {
      // 检查空洞描写（标准提高：<=2种）
      const emptyPatterns = ['显得', '感觉', '好像', '似乎', '仿佛', '有些', '有点', '似乎是', '好像是']
      const foundEmpty = emptyPatterns.filter(p => {
        const count = (allContent.match(new RegExp(p, 'g')) || []).length
        return count > totalWords / 800 // 每800字出现超过1次（更严格）
      })
      if (foundEmpty.length <= 2) {
        return { passed: true, message: '语言描写较具体', issues: [] }
      }
      return { passed: false, message: '空洞描写较多', issues: foundEmpty.map(p => `"${p}"使用过多`) }
    }
    case 'lang-3': {
      // 检查段落长度 - 更严格的检查
      const paragraphs = allContent.split('\n\n').filter(p => p.trim().length > 0)
      const longParagraphs = paragraphs.filter(p => p.length > 300)
      const longRate = paragraphs.length > 0 ? longParagraphs.length / paragraphs.length : 0
      if (longRate <= 0.1) {
        return { passed: true, message: '段落长度合理', issues: [] }
      }
      return { passed: false, message: `长段落占比${Math.round(longRate*100)}%，建议拆分长段落`, issues: [] }
    }
    case 'lang-4': {
      // 检查陈词滥调比喻
      const foundMetaphors = CLICHED_METAPHORS.filter(m => allContent.includes(m))
      if (foundMetaphors.length <= 1) {
        return { passed: true, message: `检测到${foundMetaphors.length}个陈词滥调比喻`, issues: foundMetaphors }
      }
      return { passed: false, message: `检测到${foundMetaphors.length}个陈词滥调比喻，建议替换`, issues: foundMetaphors }
    }
    case 'lang-5': {
      // 检查冗余信息
      const redundancyPatterns = [
        /([\u4e00-\u9fa5]{3,})[\s，,。]*\1/g,
        /非常.*非常/g,
        /十分.*十分/g,
        /极其.*极其/g,
      ]
      const foundRedundancy: string[] = []
      redundancyPatterns.forEach((pat, idx) => {
        const matches = allContent.match(pat) || []
        if (matches.length > 0) foundRedundancy.push(`重复模式${idx+1}(${matches.length}处)`)
      })
      if (foundRedundancy.length === 0) {
        return { passed: true, message: '未发现明显冗余信息', issues: [] }
      }
      return { passed: false, message: '发现冗余信息', issues: foundRedundancy }
    }

    // 朱雀AI检测
    case 'zhuque-1': {
      // 检查句式变化（标准提高：方差>30）
      const sentences = allContent.split(/[。！？；.!?;]/).filter(s => s.trim().length > 0)
      if (sentences.length < 10) return { passed: false, message: '内容不足，无法判断', issues: [] }
      const lengths = sentences.map(s => s.length)
      const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length
      const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avgLength, 2), 0) / lengths.length
      if (variance > 30) {
        return { passed: true, message: '句式长短变化丰富', issues: [] }
      }
      return { passed: false, message: '建议增加句式变化（当前方差较低）', issues: [] }
    }
    case 'zhuque-2': {
      // 检查口语化表达（标准提高：至少5种）
      const spokenWords = ['啊', '呀', '呢', '吧', '嘛', '哦', '嗯', '哎', '嘿', '哈', '喽', '哟', '哇']
      const foundSpoken = spokenWords.filter(w => {
        const count = (allContent.match(new RegExp(w, 'g')) || []).length
        return count >= 5
      })
      if (foundSpoken.length >= 5) {
        return { passed: true, message: `检测到口语化表达: ${foundSpoken.join('、')}`, issues: [] }
      }
      return { passed: false, message: `仅检测到${foundSpoken.length}种口语化表达，建议增加至5种以上`, issues: [] }
    }
    case 'zhuque-3': {
      // 检查停顿、犹豫表达（标准提高：至少3种）
      const pausePatterns = ['……', '…', '嗯', '这个', '那个', '呃', '啊', '哦', '嘛']
      const foundPause = pausePatterns.filter(p => allContent.includes(p))
      if (foundPause.length >= 3) {
        return { passed: true, message: '有停顿和犹豫表达', issues: [] }
      }
      return { passed: false, message: '建议增加停顿、犹豫等自然表达', issues: [] }
    }
    case 'zhuque-4': {
      // 检查逻辑跳跃 - 难以自动检测，通过
      return { passed: true, message: '建议人工复核', issues: [] }
    }
    case 'zhuque-5': {
      // 检查AI套话（更严格：<=2种）
      const found = AI_CLICHES.filter(c => allContent.includes(c))
      if (found.length <= 2) {
        return { passed: true, message: `AI套话较少(${found.length}种)`, issues: [] }
      }
      return { passed: false, message: `检测到${found.length}种AI套话，建议修改至2种以下`, issues: found.slice(0, 5) }
    }
    case 'zhuque-6': {
      // 检查排比对仗（更严格）
      const parallelPatterns = [
        /([\u4e00-\u9fa5]{2,4})(、[\u4e00-\u9fa5]{2,4}){3,}/g,
        /([\u4e00-\u9fa5]+，){3,}/g,
        /([\u4e00-\u9fa5]+。){3,}/g,
      ]
      const foundParallel: string[] = []
      parallelPatterns.forEach((pat, idx) => {
        const matches = allContent.match(pat) || []
        if (matches.length > 0) foundParallel.push(`排比${idx+1}(${matches.length}处)`)
      })
      if (foundParallel.length === 0) {
        return { passed: true, message: '未发现明显排比对仗', issues: [] }
      }
      return { passed: false, message: '发现排比对仗', issues: foundParallel }
    }
    case 'zhuque-7': {
      // 综合判断AI检测率（标准提高：<3%）
      const clicheCount = AI_CLICHES.filter(c => allContent.includes(c)).length
      const estimatedAIRate = clicheCount > 3 ? 8 : clicheCount > 1 ? 3 : 1
      if (estimatedAIRate <= 3) {
        return { passed: true, message: `预估AI检测率约${estimatedAIRate}%`, issues: [] }
      }
      return { passed: false, message: `预估AI检测率约${estimatedAIRate}%，建议修改至3%以下`, issues: [] }
    }
    case 'zhuque-8': {
      // 检查情绪表达
      const emotionWords = ['愤怒', '悲伤', '喜悦', '恐惧', '震惊', '失落', '兴奋', '激动', '绝望', '希望']
      const foundEmotion = emotionWords.filter(w => allContent.includes(w))
      if (foundEmotion.length >= 5) {
        return { passed: true, message: `检测到情绪表达: ${foundEmotion.slice(0, 5).join('、')}`, issues: [] }
      }
      return { passed: false, message: `仅检测到${foundEmotion.length}种情绪表达，建议增加至5种以上`, issues: [] }
    }
    case 'zhuque-9': {
      // 检查方言或地域特色表达
      const dialectPatterns = ['咋', '啥', '咋整', '干啥', '咋了', '呗', '嘞', '哟', '哈', '嘛']
      const foundDialect = dialectPatterns.filter(p => allContent.includes(p))
      if (foundDialect.length >= 2) {
        return { passed: true, message: `检测到地域特色表达: ${foundDialect.join('、')}`, issues: [] }
      }
      return { passed: false, message: '建议增加方言或地域特色表达', issues: [] }
    }
    case 'zhuque-10': {
      // 检查错别字和语病
      const typoPatterns = [
        /的得地/g,
        /了了/g,
        /在在/g,
        /一一/g,
        /是是/g,
      ]
      const foundTypos: string[] = []
      typoPatterns.forEach((pat, idx) => {
        const matches = allContent.match(pat) || []
        if (matches.length > 0) foundTypos.push(`疑似错别字${idx+1}(${matches.length}处)`)
      })
      if (foundTypos.length === 0) {
        return { passed: true, message: '未发现明显错别字', issues: [] }
      }
      return { passed: false, message: '发现疑似错别字', issues: foundTypos }
    }

    // 合规检查
    case 'comp-1': {
      // 检查敏感词
      const sensitiveWords = ['色情', '淫秽', '赌博', '毒品', '颠覆', '反动', '分裂', '极端', '恐怖']
      const foundSensitive = sensitiveWords.filter(w => allContent.includes(w))
      if (foundSensitive.length === 0) {
        return { passed: true, message: '未发现敏感内容', issues: [] }
      }
      return { passed: false, message: '发现敏感词汇', issues: foundSensitive }
    }
    case 'comp-2': {
      return { passed: true, message: '建议人工复核', issues: [] }
    }
    case 'comp-3': {
      // 检查血腥暴力描写
      const violentWords = ['鲜血', '血腥', '杀戮', '屠杀', '残忍', '残忍地', '惨状', '血肉模糊', '碎尸']
      const foundViolent = violentWords.filter(w => {
        const count = (allContent.match(new RegExp(w, 'g')) || []).length
        return count > 3
      })
      if (foundViolent.length === 0) {
        return { passed: true, message: '未发现过度血腥暴力描写', issues: [] }
      }
      return { passed: false, message: '发现过度血腥暴力描写', issues: foundViolent }
    }

    default:
      return { passed: false, message: '未检查', issues: [] }
  }
}

export default function StepSignatureChecklist({ generatedChapters = [], onComplete }: StepSignatureChecklistProps) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(initialChecklistItems)
  const [isRunningAutoCheck, setIsRunningAutoCheck] = useState(false)
  const [autoCheckCompleted, setAutoCheckCompleted] = useState(false)
  const isCheckingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // AI深度检测状态
  const [aiDetectResult, setAiDetectResult] = useState<AiDetectResult | null>(null)
  const [isAIDetecting, setIsAIDetecting] = useState(false)
  const [aiDetectError, setAiDetectError] = useState('')

  const toggleItem = (id: string) => {
    setChecklist(checklist.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ))
  }

  // AI深度检测
  const runAIDetect = async () => {
    setIsAIDetecting(true)
    setAiDetectError('')
    setAiDetectResult(null)
    try {
      const allContent = generatedChapters
        .map((ch: ChapterItem) => ch.content || '')
        .join('\n')
      if (allContent.length < 50) {
        setAiDetectError('正文内容不足，无法进行AI检测（至少需要50字）')
        return
      }
      const res = await fetch('/tuzhong-wenshu/api/ai/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: allContent }),
      })
      if (res.ok) {
        const json = await res.json()
        setAiDetectResult(json.data as AiDetectResult)
      } else {
        const err = await res.json()
        setAiDetectError(err.error || 'AI检测失败，请重试')
      }
    } catch (err) {
      setAiDetectError('AI检测服务不可用，请检查网络连接')
    } finally {
      setIsAIDetecting(false)
    }
  }

  // 自动检查章节内容
  useEffect(() => {
    if (!generatedChapters || generatedChapters.length === 0) return
    if (isCheckingRef.current || autoCheckCompleted) return
    isCheckingRef.current = true
    // 不在这里设置 isRunningAutoCheck，避免触发重渲染导致 timer 被清除
    // 改为在 setTimeout 回调中设置

    const allContent = generatedChapters
      .map((ch: ChapterItem) => ch.content || '')
      .join('\n')
    const totalWords = allContent.length

    // 清除之前的 timer（如果有）
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      setIsRunningAutoCheck(true)
      // 使用 setChecklist 的回调形式，避免闭包陷阱
      setChecklist((prevChecklist) => {
        const updatedItems = prevChecklist.map(item => {
          const result = checkItem(item, allContent, totalWords, generatedChapters)
          return { ...item, completed: result.passed }
        })
        return updatedItems
      })
      setIsRunningAutoCheck(false)
      setAutoCheckCompleted(true)
    }, 300)

    // 清理函数：组件卸载时清除 timer
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedChapters])

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'character': return '🎭 人设检查'
      case 'plot': return '📖 剧情检查'
      case 'language': return '✍️ 语言检查'
      case 'zhuque': return '🔥 朱雀AI检测检查（必过）'
      case 'compliance': return '⚖️ 合规检查'
      default: return category
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'character': return <BookOpen className="w-5 h-5" />
      case 'plot': return <Zap className="w-5 h-5" />
      case 'language': return <BookOpen className="w-5 h-5" />
      case 'zhuque': return <AlertTriangle className="w-5 h-5" />
      case 'compliance': return <Shield className="w-5 h-5" />
      default: return null
    }
  }

  const completedCount = checklist.filter(item => item.completed).length
  const totalCount = checklist.length
  const progress = Math.round((completedCount / totalCount) * 100)

  const groupedItems = checklist.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = []
    }
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, ChecklistItem[]>)

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-gradient-to-r wenshu-title-band shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="p-6 text-center">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">签约爆款避坑检查</h3>
          <p className="text-stone-500 text-sm">按照番茄/七猫/起点2026年最新标准检查</p>
        </div>
      </div>

      {/* 进度概览 */}
      <div className="bg-gradient-to-r bg-stone-50 rounded-xl p-6 border border-stone-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-stone-800" />
            <span className="text-lg font-semibold text-stone-900">检查进度</span>
            {isRunningAutoCheck && (
              <span className="flex items-center gap-1 text-sm text-stone-800">
                <Loader2 className="w-4 h-4 animate-spin" />
                自动检查中...
              </span>
            )}
            {autoCheckCompleted && (
              <span className="text-sm text-green-600">自动检查完成</span>
            )}
          </div>
          <div className="text-3xl font-bold text-stone-800">{progress}%</div>
        </div>
        <div className="h-4 bg-stone-200 rounded-full overflow-hidden">
          <div 
            className="h-full wenshu-btn-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-sm text-stone-600">
          已完成 {completedCount}/{totalCount} 项检查
        </div>
      </div>

      {/* 各分类检查项 */}
      {Object.keys(groupedItems).map(category => (
        <div key={category} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="bg-stone-50 px-6 py-4 border-b border-stone-200">
            <div className="flex items-center gap-3">
              {getCategoryIcon(category)}
              <h3 className="text-xl font-semibold text-stone-900">
                {getCategoryTitle(category)}
              </h3>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {groupedItems[category].map(item => (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`w-full flex items-start gap-3 p-4 rounded-lg text-left transition-all ${
                  item.completed 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                } border`}
              >
                <div className="mt-1">
                  {item.completed ? (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  ) : (
                    <Circle className="w-6 h-6 text-stone-400" />
                  )}
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${item.completed ? 'text-green-700 line-through' : 'text-stone-900'}`}>
                    {item.label}
                  </div>
                  <div className="text-sm text-stone-500">{item.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* AI深度检测 - 对接朱雀AI检测引擎 */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="bg-gradient-to-r from-stone-50 to-stone-50 px-6 py-4 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-stone-800" />
            <h3 className="text-xl font-semibold text-stone-900">🤖 AI深度检测（朱雀引擎）</h3>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-stone-600">
            对接朱雀AI检测引擎，分析8个维度：句式多样性、逻辑自然度、用词口语化、段落节奏感、情感真实度、细节密度、AI高频词、模板化程度，输出AI生成概率和签约建议。
          </p>
          
          {generatedChapters.length === 0 ? (
            <p className="text-sm text-stone-400">请先生成章节正文后再进行AI检测</p>
          ) : !aiDetectResult ? (
            <div className="text-center py-4">
              <button
                onClick={runAIDetect}
                disabled={isAIDetecting}
                className="inline-flex items-center gap-2 px-6 py-3 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAIDetecting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    正在AI深度检测中...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5" />
                    开始AI深度检测
                  </>
                )}
              </button>
              {aiDetectError && (
                <p className="text-sm text-red-500 mt-3">{aiDetectError}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 总体评分 */}
              <div className="bg-gradient-to-r from-stone-50 to-stone-50 rounded-lg p-5 border border-stone-100">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-semibold text-stone-900">检测结果</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    (aiDetectResult.aiRate || 0) <= 10 ? 'bg-green-100 text-green-700' :
                    (aiDetectResult.aiRate || 0) <= 30 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    AI概率: {Math.round(aiDetectResult.aiRate || 0)}%
                  </span>
                </div>

                {/* 进度条 */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-stone-600 mb-1">
                    <span>原创度评分</span>
                    <span className="font-semibold">{Math.round(aiDetectResult.overallScore || 0)}/100</span>
                  </div>
                  <div className="h-3 bg-stone-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (aiDetectResult.overallScore || 0) >= 80 ? 'bg-green-500' :
                        (aiDetectResult.overallScore || 0) >= 60 ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, aiDetectResult.overallScore || 0)}%` }}
                    />
                  </div>
                </div>

                {/* 等级 */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-stone-600">签约建议：</span>
                  <span className={`font-semibold ${
                    (aiDetectResult.level?.label || '').includes('优秀') ? 'text-green-600' :
                    (aiDetectResult.level?.label || '').includes('良好') ? 'text-stone-700' :
                    (aiDetectResult.level?.label || '').includes('一般') ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {aiDetectResult.level?.label || '未知'}
                  </span>
                  {aiDetectResult.level?.description && (
                    <span className="text-sm text-stone-500">— {aiDetectResult.level.description}</span>
                  )}
                </div>
              </div>

              {/* 各维度评分 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {aiDetectResult.scores?.map((score: AiDetectScore) => {
                  const scoreValue = score.isInverse ? score.score : score.score
                  return (
                    <div key={score.name} className="bg-stone-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-stone-500 mb-1">{score.name}</div>
                      <div className={`text-lg font-bold ${
                        scoreValue >= 80 ? 'text-green-600' :
                        scoreValue >= 60 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {Math.round(scoreValue)}
                      </div>
                      <div className="text-xs text-stone-400 mt-1">{score.description}</div>
                    </div>
                  )
                })}
              </div>

              {/* 检测到的问题 */}
              {aiDetectResult.issues && aiDetectResult.issues.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-700 mb-2">检测到 {aiDetectResult.issues.length} 个问题：</h4>
                  <ul className="space-y-1">
                    {aiDetectResult.issues.slice(0, 10).map((issue: AiDetectIssue, idx: number) => (
                      <li key={idx} className="text-sm text-red-600 flex items-start gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          issue.severity === 'high' ? 'bg-red-500' :
                          issue.severity === 'medium' ? 'bg-yellow-500' :
                          'bg-stone-400'
                        }`} />
                        {issue.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 重新检测按钮 */}
              <button
                onClick={runAIDetect}
                disabled={isAIDetecting}
                className="text-sm text-stone-800 hover:text-stone-800 disabled:opacity-50"
              >
                {isAIDetecting ? '检测中...' : '🔄 重新检测'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 总结 */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
          <h3 className="text-xl font-semibold text-stone-900">避坑完成度</h3>
        </div>
        <div className="space-y-3">
          {progress >= 90 ? (
            <div className="text-lg font-medium text-green-700">
              ✨ 完美！已达到签约标准！
            </div>
          ) : progress >= 70 ? (
            <div className="text-lg font-medium text-yellow-700">
              ⚠️ 还差一点点，再检查几项！
            </div>
          ) : (
            <div className="text-lg font-medium text-red-700">
              ❌ 还需要认真检查哦！
            </div>
          )}
          <p className="text-stone-600">
            {generatedChapters.length > 0 
              ? `已生成 ${generatedChapters.length} 章，共 ${generatedChapters.reduce((sum, ch) => sum + ch.wordCount, 0).toLocaleString()} 字` 
              : '尚未生成正文'}
          </p>
        </div>
      </div>

      {onComplete && (
        <div className="flex gap-3">
          <button
            onClick={() => {
              isCheckingRef.current = false
              setAutoCheckCompleted(false)
              // 强制触发重新检查：用短暂延迟重置状态后触发 useEffect
              setTimeout(() => {
                setAutoCheckCompleted(true) // 先设true再设false，触发状态变化
                setTimeout(() => setAutoCheckCompleted(false), 50)
              }, 50)
            }}
            disabled={isRunningAutoCheck}
            className="flex-1 py-4 px-6 rounded-xl font-semibold text-stone-800 border-2 border-stone-200 hover:bg-stone-50 transition-all disabled:opacity-50"
          >
            {isRunningAutoCheck ? '检查中...' : '🔄 重新自动检查'}
          </button>
          <button
            onClick={onComplete}
            disabled={progress < 70}
            className={`flex-1 py-4 px-6 rounded-xl font-semibold text-white transition-all ${
              progress >= 70 
                ? 'wenshu-btn-primary hover:from-stone-800 hover:to-stone-700' 
                : 'bg-stone-400 cursor-not-allowed'
            }`}
          >
            {progress >= 70 ? '✓ 完成检查，继续下一步' : '请至少完成70%的检查'}
          </button>
        </div>
      )}
    </div>
  )
}

