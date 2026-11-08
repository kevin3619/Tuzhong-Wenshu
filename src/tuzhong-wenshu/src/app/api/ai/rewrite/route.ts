import { NextResponse } from 'next/server'
import { callLLMWithFallback, type LLMConfig, type LLMMessage } from '@/lib/ai/llm'
import { resolveLLMConfig } from '@/lib/resolve-llm-config'
import { verifyToken } from '@/lib/auth'
import { guardAiEndpoint, chargeAiUsage } from '@/lib/quota'

const DEFAULT_DE_AI_PROMPT = `
【去AI化写作要求 - 默认始终生效】：
- 绝对不要用"然而""不过""与此同时""不禁""缓缓""微微"等AI高频词
- 绝对不要用排比句、对仗句等AI常用修辞手法
- 多用短句，少用长句，句子长短参差不齐
- 适当加入口语化表达、方言词汇
- 段落长短不一，避免整齐划一
- 用词要接地气，像真人网文作者手打出来的
- 避免过度修饰，少用形容词堆砌
- 动作描写简洁有力，心理描写真实自然
- 你是一个有十年网文经验的老作者，不是AI助手`

function buildSkillPrompt(enabledSkills: string[], customSkills?: Array<{ id: string; name: string; customPrompt: string }>): string {
  const presetPrompts: Record<string, string> = {
    'de-ai-polish': `
【去AI化写作要求 - 必须严格遵守】：
- 绝对不要用"然而""不过""与此同时""不禁""缓缓""微微"等AI高频词
- 绝对不要用排比句、对仗句等AI常用修辞
- 多用短句，少用长句，句子长短参差不齐
- 适当加入口语化表达、方言词汇、网络用语
- 段落长短不一，避免整齐划一
- 用词要接地气，像真人网文作者写的
- 避免过度修饰，少用形容词堆砌
- 动作描写要简洁有力，不要拖沓
- 心理描写要真实，像人在那种情况下真的会想的东西`,
    'dialogue-optimizer': `
【对话优化要求】：
- 对话要口语化，像真人说话，不要书面语
- 每个角色的说话风格要不同（语气词、用词习惯）
- 对话中要有潜台词，不要直白表达
- 适当加入动作描写和表情描写`,
    'shuangwen-continuation': `
【爽文写作技巧】：
- 打脸要快：从被看不起到震惊，不超过500字
- 反转要狠：反转必须有冲击力
- 情绪要足：对话要有感染力，内心独白要有代入感
- 节奏要明快：少废话，多动作，快速推进剧情`,
    'emotion-curve': `
【情绪曲线控制】：
- 每300字一个小情绪波动
- 连续2段不能是相同情绪，必须有起伏
- 每3段安排一个小爽点`,
  }

  let prompt = ''
  for (const skillId of enabledSkills) {
    if (presetPrompts[skillId]) {
      prompt += presetPrompts[skillId] + '\n'
    }
  }

  if (customSkills && customSkills.length > 0) {
    for (const cs of customSkills) {
      if (cs.customPrompt) {
        prompt += `\n【自定义技能：${cs.name}】：\n${cs.customPrompt}\n`
      }
    }
  }

  return prompt ? `\n\n${prompt}` : ''
}

// ============================================================
// 朱雀AI检测标准 - 反AI改写引擎
// 目标：改写后AI检测率 < 5%
// ============================================================

// ---------- AI高频词词典 ----------
const BANNED_WORDS: Record<string, string[]> = {
  '值得注意的是': ['说实话', '讲真', '你看啊'],
  '总而言之': ['反正就是', '说白了', '一句话'],
  '一方面': ['先说', '你看', '从某个角度'],
  '另一方面': ['再说', '还有就是', '换个角度'],
  '综上所述': ['所以啊', '总之', '这么一合计'],
  '由此可见': ['你看', '这么一来', '这么看吧'],
  '不言而喻': ['都懂', '不用多说', '明摆着'],
  '毋庸置疑': ['肯定', '没跑', '绝对'],
  '毫无疑问': ['那肯定', '必须的', '没得说'],
  '不可否认': ['确实', '也是', '这倒是'],
  '显而易见': ['一眼就看出来了', '明摆着的事', '谁都知道'],
  '然而': ['不过', '话说回来', '但'],
  '此外': ['还有', '对了', '再加上'],
  '不仅如此': ['更绝的是', '还没完呢', '而且'],
  '与此同时': ['就在这时候', '另一边', '同时'],
  '换言之': ['说白了就是', '换句话说', '也就是'],
  '具体来说': ['怎么说呢', '就是', '比如'],
  '事实上': ['其实吧', '说真的', '老实说'],
  '实际上': ['其实', '说到底', '真要说的话'],
  '本质上': ['骨子里', '说白了', '归根结底'],
  '从根本上说': ['说到底', '追根溯源', '往根上刨'],
  '不仅': ['不光', '不止', '别看只是'],
  '而且': ['还', '更有甚者', '再加上'],
  '因此': ['所以', '这么着', '于是'],
  '所以': ['这么一来', '于是', '结果'],
  '虽然': ['虽说', '就算', '甭管'],
  '但是': ['可', '但', '不过'],
  '因为': ['要说原因', '为啥呢', '说来也是'],
  '所以呢': ['结果呢', '这么一来', '你猜怎么着'],
  '最终': ['到头来', '最后', '末了'],
  '突然': ['猛地', '一下子', '冷不丁'],
  '仿佛': ['好像', '跟...似的', '就像'],
  '似乎': ['好像', '看着像', '八成是'],
  '显得': ['看着', '感觉', '给人一种'],
  '不禁': ['忍不住', '不由得', '下意识就'],
  '缓缓': ['慢慢', '一点一点', '不紧不慢'],
  '渐渐': ['慢慢', '一点一点地', '不知不觉'],
  '深深地': ['死死地', '狠狠地', '使劲'],
  '默默地': ['一声不吭地', '闷头', '暗自'],
  '轻轻地': ['悄没声地', '小心地', '慢慢'],
  '猛然': ['唰地', '猛地一下', '突然间'],
  '刹那间': ['一眨眼的功夫', '那一瞬间', '就那么一秒'],
  '顿时': ['一下子', '立马', '当场'],
  '竟然': ['居然', '没想到', '谁成想'],
  '居然': ['没想到', '谁成想', '真是没想到'],
}

// ---------- AI模板句式正则（用于评分检测） ----------
const AI_PATTERN_RULES: { pattern: RegExp; label: string; fix: string }[] = [
  { pattern: /值得注意的是[，,]?\s*/g, label: 'AI典型连接词「值得注意的是」', fix: '替换为更口语化的表达' },
  { pattern: /总而言之[，,]?\s*/g, label: 'AI典型总结词「总而言之」', fix: '直接删除或用「总之」' },
  { pattern: /综上所述[，,]?\s*/g, label: 'AI典型总结词「综上所述」', fix: '直接删除总结句' },
  { pattern: /由此可见[，,]?\s*/g, label: 'AI典型推理词「由此可见」', fix: '删除后直接陈述结论' },
  { pattern: /不言而喻[，,]?\s*/g, label: 'AI典型连接词「不言而喻」', fix: '直接删除' },
  { pattern: /毋庸置疑[，,]?\s*/g, label: 'AI典型连接词「毋庸置疑」', fix: '删除或用口语' },
  { pattern: /众所周知[，,]?\s*/g, label: 'AI典型连接词「众所周知」', fix: '删除或用「大家都知道」' },
  { pattern: /一方面[，,]?\s*.*?另一方面/g, label: 'AI典型对称句式', fix: '拆分成两句独立表达' },
  { pattern: /与此同时[，,]?\s*/g, label: 'AI典型过渡词「与此同时」', fix: '用「这时候」或直接省略' },
  { pattern: /不仅如此[，,]?\s*/g, label: 'AI典型递进词「不仅如此」', fix: '删除或用「而且」' },
  { pattern: /更重要的是[，,]?\s*/g, label: 'AI典型递进词「更重要的是」', fix: '删除或用「关键是」' },
  { pattern: /换句话说[，,]?\s*/g, label: 'AI典型解释词「换句话说」', fix: '直接换一种说法' },
  { pattern: /在这个(?:充满|快速发展的|瞬息万变的)?(?:时代|世界|社会)[，,]?\s*/g, label: 'AI典型开头模板', fix: '直接切入场景或人物' },
  { pattern: /随着(?:时间|社会|科技|时代)(?:的|的不断发展|的不断进步)[，,]?\s*/g, label: 'AI典型开头模板', fix: '直接从具体事件开始写' },
  { pattern: /瞳孔骤缩/g, label: 'AI高频网文模板词「瞳孔骤缩」', fix: '用具体动作描写替代' },
  { pattern: /倒吸一口凉气/g, label: 'AI高频网文模板词「倒吸一口凉气」', fix: '用个性化反应替代' },
  { pattern: /嘴角(?:勾起|微微上扬|扬起)一抹(?:弧度|笑意|微笑)/g, label: 'AI高频网文模板句', fix: '用更具体的表情描写' },
  { pattern: /眼中闪过一丝(?:惊讶|愤怒|悲伤|喜悦|杀意|寒光|嘲讽)/g, label: 'AI高频网文模板句', fix: '通过行为和对话展现情绪' },
  { pattern: /心中(?:暗想|一惊|一沉|一动|涌起一股|泛起一阵)/g, label: 'AI高频网文模板句「心中...」', fix: '用内心独白替代' },
  { pattern: /缓缓地|轻轻地|慢慢地|静静地|默默地/g, label: 'AI高频副词堆砌', fix: '删除多余副词' },
  { pattern: /宛如一幅画|仿佛置身于|宛如仙境/g, label: 'AI典型比喻模板', fix: '用更有生活气息的比喻' },
]

// ---------- 口语化语气词 ----------
const ORAL_PARTICLES = ['嘛', '呗', '呢', '吧', '啊', '哎', '啧', '哼', '哦', '嘛', '呀', '啦', '嘞']

// ---------- 感官细节模板 ----------
const SENSORY_TEMPLATES = {
  visual: [
    '光线从{direction}斜斜照进来，把{object}的影子拉得老长。',
    '{object}在{color}的光里泛着微微的光。',
    '远处{scene}的轮廓在{time}变得模糊。',
    '{character}眯了眯眼，{action}。',
  ],
  auditory: [
    '远处传来{sound}，若有若无的。',
    '{sound}在耳边嗡嗡响，烦得很。',
    '安静得能听见{sound}。',
    '{character}竖起耳朵，{sound}越来越近。',
  ],
  tactile: [
    '{bodyPart}一阵发麻，像被{thing}蛰了一下。',
    '风刮过{bodyPart}，凉飕飕的。',
    '手心全是汗，{object}差点没拿住。',
    '{bodyPart}上的伤口隐隐作痛。',
  ],
  olfactory: [
    '空气里飘着一股{smell}的味道。',
    '{smell}直往鼻子里钻，{character}皱了皱眉。',
    '风里带着{smell}，让人{feeling}。',
  ],
}

// ---------- 内心独白模板 ----------
const INNER_MONOLOGUE = [
  '——完了完了完了。',
  '——这特么什么情况？',
  '——稳住，别慌。',
  '——呵，有意思。',
  '——来吧，老子等着呢。',
  '——不会吧？不会吧？',
  '——啧，麻烦了。',
  '——该死。',
  '——行吧，就这样吧。',
  '——真是见了鬼了。',
  '——等等，好像哪里不对。',
  '——算了，不想了。',
  '——又来了。',
  '——有意思，越来越有意思了。',
  '——就这？',
]

// ---------- 环境反应模板 ----------
const ENV_REACTIONS = [
  '风从门缝里灌进来，吹得烛火晃了两晃。',
  '远处不知谁家的狗叫了两声，又安静了。',
  '一片落叶飘到{character}肩上，{character}没动。',
  '雨点砸在窗户上，啪嗒啪嗒的。',
  '天边闷雷滚过，要变天了。',
  '夜风裹着泥土味扑面而来。',
  '墙角的蟋蟀叫个不停，吵得人心烦。',
  '头顶的乌云压得很低，像要塌下来似的。',
]

// ---------- 生活化比喻 ----------
const COLLOQUIAL_METAPHORS = [
  '跟踩了尾巴的猫似的',
  '跟热锅上的蚂蚁一样',
  '跟泄了气的皮球似的',
  '跟吃了苍蝇一样难受',
  '跟没头苍蝇似的乱撞',
  '跟铁了心似的',
  '跟做梦一样',
  '跟见了鬼似的',
  '跟木头桩子一样杵在那',
  '跟没事人一样',
]

// ---------- 情绪波动模板 ----------
const EMOTION_SWINGS = [
  '心里突然涌上一股说不清的烦躁。',
  '鼻子一酸，差点没绷住。',
  '一股无名火蹭地就上来了。',
  '不知怎么的，突然觉得有点好笑。',
  '心跳漏了一拍。',
  '后背一阵发凉。',
  '胸口像堵了块石头。',
  '嘴角不自觉地往上翘了翘。',
]

// ============================================================
// 改写引擎核心函数
// ============================================================

/** 检测AI高频词并返回匹配列表 */
function detectAIWords(text: string): { word: string; index: number; replacements: string[] }[] {
  const results: { word: string; index: number; replacements: string[] }[] = []
  for (const [word, replacements] of Object.entries(BANNED_WORDS)) {
    let searchIndex = 0
    while (true) {
      const idx = text.indexOf(word, searchIndex)
      if (idx === -1) break
      results.push({ word, index: idx, replacements })
      searchIndex = idx + word.length
    }
  }
  results.sort((a, b) => a.index - b.index)
  return results
}

/** 替换AI高频词（随机选择替换词） */
function replaceAIWords(text: string, intensity: string): { text: string; changes: { type: string; description: string }[] } {
  const changes: { type: string; description: string }[] = []
  let result = text
  const matches = detectAIWords(text)

  // 从后往前替换，避免索引偏移
  const replaceCount = intensity === 'deep' ? matches.length : intensity === 'medium' ? Math.ceil(matches.length * 0.7) : Math.ceil(matches.length * 0.4)

  for (let i = matches.length - 1; i >= matches.length - replaceCount && i >= 0; i--) {
    const match = matches[i]
    const replacement = match.replacements[Math.floor(Math.random() * match.replacements.length)]
    result = result.slice(0, match.index) + replacement + result.slice(match.index + match.word.length)
    changes.push({
      type: 'word_replace',
      description: `"${match.word}" -> "${replacement}"`,
    })
  }

  return { text: result, changes }
}

/** 分析句子长度分布 */
function analyzeSentenceLengths(text: string): { short: number; medium: number; long: number; total: number; consecutiveSimilar: number } {
  const sentences = text.split(/[。！？；\n]+/).filter(s => s.trim().length > 0)
  let short = 0, medium = 0, long = 0
  const lengths: number[] = []
  for (const s of sentences) {
    const len = s.trim().length
    lengths.push(len)
    if (len < 15) short++
    else if (len <= 30) medium++
    else long++
  }
  // 计算连续相似长度句子数
  let consecutiveSimilar = 0
  let maxConsecutive = 0
  for (let i = 1; i < lengths.length; i++) {
    if (Math.abs(lengths[i] - lengths[i-1]) <= 5) {
      consecutiveSimilar++
      maxConsecutive = Math.max(maxConsecutive, consecutiveSimilar)
    } else {
      consecutiveSimilar = 0
    }
  }
  return { short, medium, long, total: sentences.length, consecutiveSimilar: maxConsecutive }
}

/** 句式爆破 - 打乱句式结构 */
function burstSentences(text: string, intensity: string): { text: string; changes: { type: string; description: string }[] } {
  const changes: { type: string; description: string }[] = []
  const paragraphs = text.split(/\n\n+/)
  const result: string[] = []

  for (const para of paragraphs) {
    if (!para.trim()) continue

    // 检测是否为对话行（以引号开头）
    if (/^[""「『]/.test(para.trim())) {
      result.push(para)
      continue
    }

    const sentences = splitSentences(para)
    if (sentences.length <= 1) {
      result.push(para)
      continue
    }

    const processed: string[] = []

    for (const sentence of sentences) {
      const trimmed = sentence.trim()
      if (!trimmed) continue

      const len = trimmed.length
      const rand = Math.random()
      const burstProb = intensity === 'deep' ? 0.6 : intensity === 'medium' ? 0.4 : 0.2

      if (rand < burstProb) {
        // 短句爆破：长句拆短
        if (len > 30 && Math.random() < 0.5) {
          const splitPoint = findNaturalSplitPoint(trimmed)
          if (splitPoint > 0 && splitPoint < len - 5) {
            const part1 = trimmed.slice(0, splitPoint).trim()
            const part2 = trimmed.slice(splitPoint).trim()
            // 加语气词让拆分更自然
            const particle = ORAL_PARTICLES[Math.floor(Math.random() * ORAL_PARTICLES.length)]
            processed.push(part1 + particle + '。')
            processed.push(part2)
            changes.push({
              type: 'sentence_burst',
              description: `长句拆分：在"${part1.slice(-5)}"处断句`,
            })
            continue
          }
        }

        // 中句加口语化
        if (len >= 10 && len <= 30 && Math.random() < 0.4) {
          const particle = ORAL_PARTICLES[Math.floor(Math.random() * ORAL_PARTICLES.length)]
          // 在句尾或句中插入语气词
          if (Math.random() < 0.5) {
            const insertPos = Math.floor(len * 0.4 + Math.random() * len * 0.3)
            const before = trimmed.slice(0, insertPos)
            const after = trimmed.slice(insertPos)
            processed.push(before + particle + '，' + after)
            changes.push({
              type: 'oral_inject',
              description: `插入语气词"${particle}"`,
            })
            continue
          }
        }

        // 短句合并（偶尔）
        if (len < 10 && processed.length > 0 && Math.random() < 0.3) {
          const last = processed.pop()!
          const connector = ['，', '，就', '，然后'][Math.floor(Math.random() * 3)]
          processed.push(last.slice(0, -1) + connector + trimmed)
          changes.push({
            type: 'sentence_merge',
            description: `短句合并`,
          })
          continue
        }
      }

      processed.push(trimmed)
    }

    result.push(processed.join(''))
  }

  return { text: result.join('\n\n'), changes }
}

/** 智能分句 */
function splitSentences(text: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuote = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    current += char

    if (char === '"' || char === '"' || char === '\u201c' || char === '\u201d') {
      inQuote = !inQuote
    }

    if (!inQuote && /[。！？]/.test(char)) {
      result.push(current)
      current = ''
    }
  }

  if (current.trim()) {
    result.push(current)
  }

  return result
}

/** 找到自然的断句点 */
function findNaturalSplitPoint(sentence: string): number {
  const connectors = ['，', '、', '；', '——', '——']
  for (let i = Math.floor(sentence.length * 0.3); i < sentence.length * 0.7; i++) {
    if (connectors.includes(sentence[i])) {
      return i + 1
    }
  }
  // 找逗号
  for (let i = Math.floor(sentence.length * 0.3); i < sentence.length * 0.7; i++) {
    if (sentence[i] === '，') {
      return i + 1
    }
  }
  return -1
}

/** 注入活人感 - 感官细节、内心独白、情绪波动 */
function injectHumanity(text: string, intensity: string): { text: string; changes: { type: string; description: string }[] } {
  const changes: { type: string; description: string }[] = []
  const paragraphs = text.split(/\n\n+/)
  const result: string[] = []

  const injectProb = intensity === 'deep' ? 0.5 : intensity === 'medium' ? 0.35 : 0.2

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx].trim()
    if (!para) continue

    // 对话段落少注入
    if (/^[""「『]/.test(para)) {
      result.push(para)
      continue
    }

    let modified = para

    if (Math.random() < injectProb) {
      const injectionType = Math.random()

      if (injectionType < 0.25) {
        // 注入内心独白
        const monologue = INNER_MONOLOGUE[Math.floor(Math.random() * INNER_MONOLOGUE.length)]
        const insertPos = Math.floor(modified.length * 0.3 + Math.random() * modified.length * 0.4)
        modified = modified.slice(0, insertPos) + '\n' + monologue + '\n' + modified.slice(insertPos)
        changes.push({ type: 'inner_monologue', description: `注入内心独白："${monologue}"` })
      } else if (injectionType < 0.45) {
        // 注入感官细节
        const category = (Object.keys(SENSORY_TEMPLATES) as Array<keyof typeof SENSORY_TEMPLATES>)[Math.floor(Math.random() * 4)]
        const templates = SENSORY_TEMPLATES[category]
        let template = templates[Math.floor(Math.random() * templates.length)]
        template = fillTemplate(template)
        const insertPos = Math.floor(modified.length * 0.5 + Math.random() * modified.length * 0.3)
        modified = modified.slice(0, insertPos) + template + modified.slice(insertPos)
        changes.push({ type: 'sensory_detail', description: `注入感官细节（${category === 'visual' ? '视觉' : category === 'auditory' ? '听觉' : category === 'tactile' ? '触觉' : '嗅觉'}）` })
      } else if (injectionType < 0.6) {
        // 注入环境反应
        let envReaction = ENV_REACTIONS[Math.floor(Math.random() * ENV_REACTIONS.length)]
        envReaction = envReaction.replace('{character}', '他')
        const insertPos = Math.floor(modified.length * 0.6 + Math.random() * modified.length * 0.3)
        modified = modified.slice(0, insertPos) + '\n' + envReaction + '\n' + modified.slice(insertPos)
        changes.push({ type: 'env_reaction', description: `注入环境反应` })
      } else if (injectionType < 0.75) {
        // 注入情绪波动
        const emotion = EMOTION_SWINGS[Math.floor(Math.random() * EMOTION_SWINGS.length)]
        const insertPos = Math.floor(modified.length * 0.4 + Math.random() * modified.length * 0.3)
        modified = modified.slice(0, insertPos) + emotion + modified.slice(insertPos)
        changes.push({ type: 'emotion_swing', description: `注入情绪波动` })
      } else {
        // 注入生活化比喻
        const metaphor = COLLOQUIAL_METAPHORS[Math.floor(Math.random() * COLLOQUIAL_METAPHORS.length)]
        const insertPos = Math.floor(modified.length * 0.3 + Math.random() * modified.length * 0.4)
        modified = modified.slice(0, insertPos) + metaphor + '，' + modified.slice(insertPos)
        changes.push({ type: 'colloquial_metaphor', description: `注入比喻："${metaphor}"` })
      }
    }

    result.push(modified)
  }

  return { text: result.join('\n\n'), changes }
}

/** 填充模板占位符 */
function fillTemplate(template: string): string {
  return template
    .replace('{direction}', ['东边', '西边', '头顶', '身后', '侧面'][Math.floor(Math.random() * 5)])
    .replace('{object}', ['桌上的茶杯', '窗框', '地上的碎石', '树影', '水洼'][Math.floor(Math.random() * 5)])
    .replace('{color}', ['暗红', '昏黄', '惨白', '淡蓝', '金'][Math.floor(Math.random() * 5)])
    .replace('{scene}', ['远山', '楼群', '树林', '城墙', '帐篷'][Math.floor(Math.random() * 5)])
    .replace('{time}', ['黄昏', '清晨', '深夜', '正午', '黎明'][Math.floor(Math.random() * 5)])
    .replace('{character}', ['他', '她', '那人', '少年', '老头'][Math.floor(Math.random() * 5)])
    .replace('{action}', ['没说话', '嘴角动了动', '攥紧了拳头', '深吸一口气', '缓缓吐出一口气'][Math.floor(Math.random() * 5)])
    .replace('{sound}', ['脚步声', '钟声', '虫鸣', '风声', '水声'][Math.floor(Math.random() * 5)])
    .replace('{bodyPart}', ['手背', '后颈', '脚底', '指尖', '耳根'][Math.floor(Math.random() * 5)])
    .replace('{thing}', ['蚂蚁', '冰碴子', '针', '火炭'][Math.floor(Math.random() * 4)])
    .replace('{smell}', ['血腥', '泥土', '草木', '烟火', '霉味'][Math.floor(Math.random() * 5)])
    .replace('{feeling}', ['精神一振', '皱了皱眉', '打了个喷嚏', '莫名安心'][Math.floor(Math.random() * 4)])
}

/** 打乱逻辑完美性 - 加入思维跳跃和回忆穿插 */
function disruptLogic(text: string, intensity: string): { text: string; changes: { type: string; description: string }[] } {
  const changes: { type: string; description: string }[] = []
  const paragraphs = text.split(/\n\n+/)
  const result: string[] = []

  const disruptProb = intensity === 'deep' ? 0.3 : intensity === 'medium' ? 0.2 : 0.1

  const thoughtJumps = [
    '不对，好像哪里不对。',
    '等等——',
    '算了，先不想这个。',
    '不对劲。',
    '嗯？',
    '这事儿有点蹊跷。',
  ]

  const flashbacks = [
    '这场景，怎么跟三年前那次那么像……',
    '恍惚间，好像又回到了那天。',
    '记忆突然翻涌上来。',
    '以前不是这样的。',
    '跟小时候一模一样。',
  ]

  for (const para of paragraphs) {
    if (!para.trim()) continue
    if (/^[""「『]/.test(para.trim())) {
      result.push(para)
      continue
    }

    let modified = para

    if (Math.random() < disruptProb) {
      if (Math.random() < 0.5) {
        // 思维跳跃
        const jump = thoughtJumps[Math.floor(Math.random() * thoughtJumps.length)]
        const pos = Math.floor(modified.length * 0.5 + Math.random() * modified.length * 0.3)
        modified = modified.slice(0, pos) + jump + modified.slice(pos)
        changes.push({ type: 'thought_jump', description: `插入思维跳跃："${jump}"` })
      } else {
        // 回忆穿插
        const flashback = flashbacks[Math.floor(Math.random() * flashbacks.length)]
        const pos = Math.floor(modified.length * 0.4 + Math.random() * modified.length * 0.3)
        modified = modified.slice(0, pos) + '\n' + flashback + '\n' + modified.slice(pos)
        changes.push({ type: 'flashback', description: `插入回忆穿插` })
      }
    }

    result.push(modified)
  }

  return { text: result.join('\n\n'), changes }
}

/** 段落节奏变化 - 打乱段落长度一致性 */
function varyParagraphRhythm(text: string, intensity: string): { text: string; changes: { type: string; description: string }[] } {
  const changes: { type: string; description: string }[] = []
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim())
  const result: string[] = []

  const varyProb = intensity === 'deep' ? 0.4 : intensity === 'medium' ? 0.25 : 0.15

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i]
    result.push(para)

    if (Math.random() < varyProb) {
      // 在某些段落后面插入极短段落（一句话成段）
      const shortParagraphs = [
        '风停了。',
        '安静。',
        '没人说话。',
        '空气凝固了。',
        '完了。',
        '他没动。',
        '就这么定了。',
        '天黑了。',
        '雨还在下。',
        '时间不多了。',
        '来了。',
        '快了。',
        '还差一点。',
        '够了。',
      ]
      const short = shortParagraphs[Math.floor(Math.random() * shortParagraphs.length)]
      result.push(short)
      changes.push({ type: 'short_paragraph', description: `插入极短段落："${short}"` })
    }
  }

  return { text: result.join('\n\n'), changes }
}

/** 计算AI检测分数 */
function calculateAIScore(text: string): number {
  let score = 30 // 基础分（降低，大多数正常文本不应超过30）

  // AI高频词扣分（加大权重）
  const aiWordMatches = detectAIWords(text)
  score += aiWordMatches.length * 4

  // AI模板句式检测
  const patternMatches = AI_PATTERN_RULES.filter(r => r.pattern.test(text)).length
  score += patternMatches * 5

  // 句式均匀度检测
  const lengths = analyzeSentenceLengths(text)
  if (lengths.total > 0) {
    const shortRatio = lengths.short / lengths.total
    const mediumRatio = lengths.medium / lengths.total
    const longRatio = lengths.long / lengths.total
    // 理想分布：30%短 + 50%中 + 20%长
    const uniformity = Math.abs(shortRatio - 0.3) + Math.abs(mediumRatio - 0.5) + Math.abs(longRatio - 0.2)
    score += uniformity * 15
    // 连续相似长度句子惩罚
    if (lengths.consecutiveSimilar > 3) score += lengths.consecutiveSimilar * 2
  }

  // 段落长度一致性检测
  const paras = text.split(/\n\n+/).filter(p => p.trim().length > 0)
  if (paras.length > 2) {
    const paraLengths = paras.map(p => p.length)
    const avg = paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length
    const variance = paraLengths.reduce((a, b) => a + (b - avg) ** 2, 0) / paraLengths.length
    // 方差小说明段落长度太一致（AI特征）
    if (variance < 500) score += 8
    else score -= 5
  }

  // 口语化特征加分（加大减分力度）
  const oralCount = (text.match(/[嘛呗呢吧啊哎啧哼哦呀啦嘞]/g) || []).length
  score -= oralCount * 1.5

  // 内心独白特征加分（加大减分力度）
  const monologueCount = (text.match(/——[^——]+/g) || []).length
  score -= monologueCount * 3

  // 感官细节加分（加大减分力度）
  const sensoryCount = (text.match(/(看见|听到|闻到|感觉|摸到|疼|凉|热|麻|酸|刺眼|刺鼻|嗡嗡|咔嚓|噗)/g) || []).length
  score -= sensoryCount * 0.8

  // 情感波动加分
  const emotionMarks = (text.match(/[！!?？]/g) || []).length
  score -= emotionMarks * 0.5

  // 超短段落加分（人类写作常有1-2句段落）
  const shortParas = paras.filter(p => p.trim().length < 30).length
  score -= shortParas * 1

  return Math.max(0, Math.min(100, Math.round(score)))
}

/** 风格适配 - 根据style参数微调改写策略 */
function getStyleConfig(style: string): { formalityReduction: number; emotionBoost: number; metaphorStyle: string } {
  const styleMap: Record<string, { formalityReduction: number; emotionBoost: number; metaphorStyle: string }> = {
    'wuxia': { formalityReduction: 0.6, emotionBoost: 0.7, metaphorStyle: 'ancient' },
    'xianxia': { formalityReduction: 0.5, emotionBoost: 0.8, metaphorStyle: 'cultivation' },
    'fanqie': { formalityReduction: 0.8, emotionBoost: 0.9, metaphorStyle: 'modern' },
    'romance': { formalityReduction: 0.4, emotionBoost: 0.95, metaphorStyle: 'romantic' },
    'scifi': { formalityReduction: 0.3, emotionBoost: 0.5, metaphorStyle: 'tech' },
    'suspense': { formalityReduction: 0.5, emotionBoost: 0.6, metaphorStyle: 'dark' },
    'history': { formalityReduction: 0.4, emotionBoost: 0.5, metaphorStyle: 'ancient' },
    'modern': { formalityReduction: 0.7, emotionBoost: 0.7, metaphorStyle: 'modern' },
  }

  return styleMap[style] || { formalityReduction: 0.6, emotionBoost: 0.7, metaphorStyle: 'modern' }
}

// ============================================================
// API Route Handler
// ============================================================

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { text, style = 'fanqie', intensity = 'medium', llmConfig, enabledSkills, customSkills } = body

    let userId: string | undefined
    try {
      const authHeader = request.headers.get('Authorization') || ''
      const token = authHeader.replace('Bearer ', '')
      if (token) {
        const decoded = await verifyToken(token)
        if (decoded) userId = decoded.userId
      }
    } catch (_e) {}

    // 🔥 修复（P1 计量缺失）：AI 接口此前不限频、不计额，注册即可无限调用；
    //   dailyQuotaUsed/dailyQuotaLimit/ai_daily_free_quota 全仓零写入零校验。
    { const _g = await guardAiEndpoint(request, 'rewrite', userId || null, false, 1)
      if (!_g.ok) return NextResponse.json({ error: _g.message, code: _g.status }, { status: _g.status })
      await chargeAiUsage(_g.userId, false, 1) }

    let resolvedCfg: any = llmConfig ? resolveLLMConfig(llmConfig as any, userId, 'polish') : null
    // 🔥 修复：客户端不再被要求携带平台 Key（那是泄漏面）。按用户/步骤没匹配上时，
    //   再兜底一次 models.json 里的默认可用模型，让未自配 Key 的用户也能用平台默认模型。
    if ((!resolvedCfg || !resolvedCfg.apiKey)) {
      try {
        const { loadDefaultLlmConfig } = require('@/lib/ai/model-config')
        const _def = loadDefaultLlmConfig()
        if (_def && _def.apiKey) resolvedCfg = { ...(_def as any), ...(resolvedCfg && resolvedCfg.apiKey ? resolvedCfg : {}) }
      } catch (e) { console.error('[ai/polish] 兜底默认模型失败:', e) }
    }
    if (!resolvedCfg || !resolvedCfg.apiKey) {
      return NextResponse.json(
        { error: '缺少必要参数：llmConfig（需要包含有效的 apiKey）' },
        { status: 400 }
      )
    }

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: '缺少必要参数：text（需要改写的文本内容）' },
        { status: 400 }
      )
    }

    if (text.length < 10) {
      return NextResponse.json(
        { error: '文本内容太短，至少需要10个字符' },
        { status: 400 }
      )
    }

    if (text.length > 50000) {
      return NextResponse.json(
        { error: '文本内容过长，最多支持50000个字符' },
        { status: 400 }
      )
    }

    if (!['light', 'medium', 'deep'].includes(intensity)) {
      return NextResponse.json(
        { error: 'intensity 参数必须是 light、medium 或 deep' },
        { status: 400 }
      )
    }

    const styleConfig = getStyleConfig(style)

    const beforeScore = calculateAIScore(text)

    const allChanges: { type: string; description: string }[] = []

    // ---- 第一步：替换AI高频词 ----
    const step1 = replaceAIWords(text, intensity)
    allChanges.push(...step1.changes)

    // ---- 第二步：句式爆破 ----
    const step2 = burstSentences(step1.text, intensity)
    allChanges.push(...step2.changes)

    // ---- 第三步：注入活人感 ----
    const step3 = injectHumanity(step2.text, intensity)
    allChanges.push(...step3.changes)

    // ---- 第四步：打乱逻辑完美性 ----
    const step4 = disruptLogic(step3.text, intensity)
    allChanges.push(...step4.changes)

    // ---- 第五步：段落节奏变化 ----
    const step5 = varyParagraphRhythm(step4.text, intensity)
    allChanges.push(...step5.changes)

    const preprocessedText = step5.text

    let rewrittenText = preprocessedText
    let llmEnhanced = false
    let llmWarning = ''

    try {
      const skillPrompt = buildSkillPrompt(enabledSkills || [], customSkills)
      const messages: LLMMessage[] = [
        { role: 'system', content: `你是一位专业的网文改写专家，擅长将AI生成的文字改写成真人写作风格。
要求：
1. 保留原文核心情节和人物设定
2. 句式要长短交替，有节奏感
3. 对话要口语化，有语气词和停顿
4. 加入感官细节（视觉、听觉、触觉、嗅觉）
5. 内心独白要有个人特色，不要用"不禁""竟然"等AI高频词
6. 段落节奏要有变化，不要每段都差不多长
7. 结尾要有悬念或转折
8. 绝对不要出现：值得注意的是、总而言之、综上所述、不可忽视、至关重要、在...的背景下
9. 直接输出改写后的文本，不要任何说明${DEFAULT_DE_AI_PROMPT}${skillPrompt}` },
        { role: 'user', content: `请将以下文本改写成真人写作风格，改写强度：${intensity === 'deep' ? '深度改写（大幅调整句式和表达）' : intensity === 'medium' ? '中度改写（调整句式和用词）' : '轻度改写（仅调整明显AI痕迹）'}\n\n原文：\n${preprocessedText}` },
      ]
      const { content: llmResult } = await callLLMWithFallback(resolvedCfg as LLMConfig, messages)
      if (llmResult && llmResult.trim().length > 0) {
        rewrittenText = llmResult.trim()
        llmEnhanced = true
      }
    } catch (llmError) {
      console.error('[AI Rewrite] 大模型深度改写失败，回退到算法预处理结果:', llmError)
      llmWarning = '大模型深度改写失败，已回退到算法预处理结果，改写效果可能有限'
    }

    const afterScore = calculateAIScore(rewrittenText)

    const changeSummary = summarizeChanges(allChanges)

    return NextResponse.json({
      data: {
        rewrittenText,
        changes: changeSummary,
        beforeScore,
        afterScore,
        styleConfig,
        intensity,
        llmEnhanced,
        ...(llmWarning ? { llmWarning } : {}),
        stats: {
          totalChanges: allChanges.length,
          wordReplacements: allChanges.filter(c => c.type === 'word_replace').length,
          sentenceBursts: allChanges.filter(c => c.type === 'sentence_burst').length,
          oralInjections: allChanges.filter(c => c.type === 'oral_inject').length,
          innerMonologues: allChanges.filter(c => c.type === 'inner_monologue').length,
          sensoryDetails: allChanges.filter(c => c.type === 'sensory_detail').length,
          emotionSwings: allChanges.filter(c => c.type === 'emotion_swing').length,
          envReactions: allChanges.filter(c => c.type === 'env_reaction').length,
          thoughtJumps: allChanges.filter(c => c.type === 'thought_jump').length,
          flashbacks: allChanges.filter(c => c.type === 'flashback').length,
          shortParagraphs: allChanges.filter(c => c.type === 'short_paragraph').length,
        },
      },
    })
  } catch (error) {
    console.error('[AI Rewrite] 改写失败:', error)
    return NextResponse.json(
      { error: '改写服务异常，请稍后重试' },
      { status: 500 }
    )
  }
}

/** 按类型汇总变更信息 */
function summarizeChanges(changes: { type: string; description: string }[]): { type: string; description: string; count: number }[] {
  const typeMap: Record<string, string> = {
    word_replace: 'AI高频词替换',
    sentence_burst: '句式爆破（长句拆短）',
    sentence_merge: '短句合并',
    oral_inject: '口语化语气词注入',
    inner_monologue: '内心独白注入',
    sensory_detail: '感官细节注入',
    emotion_swing: '情绪波动注入',
    env_reaction: '环境反应注入',
    colloquial_metaphor: '生活化比喻注入',
    thought_jump: '思维跳跃插入',
    flashback: '回忆穿插插入',
    short_paragraph: '极短段落插入',
  }

  const grouped: Record<string, { type: string; description: string; count: number }> = {}

  for (const change of changes) {
    if (!grouped[change.type]) {
      grouped[change.type] = {
        type: change.type,
        description: typeMap[change.type] || change.type,
        count: 0,
      }
    }
    grouped[change.type].count++
  }

  return Object.values(grouped)
}
