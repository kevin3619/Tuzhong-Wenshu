/**
 * 🔥 2026-10-22：oh-story 签约级确定性门禁（signing-gates）
 *
 * 移植自 zenstory-ai/oh-story-claudecode：
 *   - skills/story-deslop/scripts/check-degeneration.js（复读/截断/占位/工程词泄漏）
 *   - skills/story-deslop/scripts/normalize-punctuation.js（标点规范化检查）
 *   - skills/story-deslop/references/banned-words.md（AI 套词分层词库）
 *   - skills/story-review/references/rubrics/fanqie.md（番茄五项）
 *   - skills/story-review/references/quality-rubric.md（S1-S4 Findings + verdict）
 *
 * 设计原则：
 *   1) 纯确定性、零 LLM 调用、零外部依赖；
 *   2) 任何分支 try/catch 兜底，绝不抛错影响主链路；
 *   3) 只做「可判定」的事，主观判断仍交给 chapter-engine 的 judge。
 *
 * ⚠️ 边界：本模块不能也不承诺「必然签约」。签约由平台编辑与市场数据判定，
 *    这里只把可确定的红线变成门禁，显著降低因低级问题被拒的概率。
 */

export type GateSeverity = 'S1' | 'S2' | 'S3' | 'S4'
export type GateVerdict = 'APPROVE' | 'CONCERNS' | 'REJECT'
export type GateCategory =
  | 'degeneration'
  | 'punctuation'
  | 'banned-phrase'
  | 'fanqie-rubric'
  | 'planning'

export interface GateFinding {
  id: string
  category: GateCategory
  severity: GateSeverity
  rule: string
  location: { para?: number; line?: number; quote?: string }
  evidence: string
  issue: string
  fix: string
}

export interface GateMetrics {
  chineseChars: number
  paragraphs: number
  avgParagraphChars: number
  avgSentenceChars: number
  dialogueRatio: number
}

export interface FanqieScore {
  opening: number
  retention: number
  genreFit: number
  pacing: number
  emotion: number
  total: number
  fails: string[]
}

export interface SigningGateResult {
  verdict: GateVerdict
  findings: GateFinding[]
  counts: Record<GateSeverity, number>
  blocking: GateFinding[]
  metrics: GateMetrics
  fanqie: FanqieScore
  summary: string
}

export interface GateOptions {
  genre?: string
  chapterTitle?: string
  /** 严格模式：banned-phrase 也参与 verdict 升级（默认关闭，避免误杀） */
  strict?: boolean
}

export interface PlanningGateResult {
  ok: boolean
  findings: GateFinding[]
  missing: string[]
}

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

const TERMINAL_CHARS = '。！？!?…”』」）)】…—~～'

function clip(s: string, n = 80): string {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

function countChinese(s: string): number {
  const m = s.match(/[\u4e00-\u9fa5]/g)
  return m ? m.length : 0
}

function splitParagraphs(text: string): string[] {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function splitSentences(text: string): string[] {
  return (text || '')
    .split(/[。！？!?…\n]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
}

/** 可见长度：去掉空白与引号，用于复读判定 */
function visibleLen(s: string): number {
  return (s || '').replace(/[\s“”"'‘’「」『』《》]/g, '').length
}

function stripQuotes(s: string): string {
  return (s || '').replace(/[\s“”"'‘’「」『』]/g, '')
}

/** 判断某位置是否在中文引号内（“…” 或 「…」） */
function isInsideQuotes(text: string, index: number): boolean {
  const before = text.slice(0, index)
  const openDouble = (before.match(/“/g) || []).length
  const closeDouble = (before.match(/”/g) || []).length
  if (openDouble > closeDouble) return true
  const openCorner = (before.match(/「/g) || []).length
  const closeCorner = (before.match(/」/g) || []).length
  return openCorner > closeCorner
}

function makeFinding(
  category: GateCategory,
  severity: GateSeverity,
  rule: string,
  issue: string,
  fix: string,
  evidence: string,
  location: { para?: number; line?: number; quote?: string } = {}
): GateFinding {
  return {
    id: `${category}:${rule}`,
    category,
    severity,
    rule,
    location,
    evidence: clip(evidence),
    issue,
    fix,
  }
}

/* ------------------------------------------------------------------ */
/* 1. 退化检测（check-degeneration.js 移植）                            */
/* ------------------------------------------------------------------ */

const REPEAT_MIN_LEN = 12
const REPEAT_MIN_COUNT = 3
const ADJACENT_MIN_LEN = 8

const PLACEHOLDER_RULES: Array<{ re: RegExp; label: string; rule: string; hard: boolean }> = [
  {
    re: /作为(一个)?(AI|人工智能|大?语言模型|智能助手|聊天助手)(?:语言模型|大?模型|助手|机器人)?(?=[，,。...]|我|无法|不能|没法|$)/,
    label: '元信息泄漏（AI 自指）',
    rule: 'ai-self-reference',
    hard: false,
  },
  { re: /\uFFFD/, label: '乱码', rule: 'garbled', hard: true },
  {
    re: /^(Sure|Certainly|Here'?s|As an AI|I (?:cannot|can't|am unable|apologize))/,
    label: '英文AI腔',
    rule: 'english-ai-tone',
    hard: true,
  },
  {
    re: /[（(](此处|以下|这里|下文|后续)?\s*(省略|略)(去|过)?[^）)]{0,10}[）)]/,
    label: '占位符',
    rule: 'placeholder',
    hard: true,
  },
  {
    re: /(未完待续|TODO|占位符|placeholder)/,
    label: '占位符',
    rule: 'placeholder',
    hard: true,
  },
  {
    re: /我(无法|不能)(继续(写|创作|生成|下去)|生成(内容|文本|正文)?|创作|续写|完成(这个|本)?(章|篇|创作|请求))/,
    label: '生成拒绝语',
    rule: 'generation-refusal',
    hard: false,
  },
]

const META_TIER1_RE = /细纲|情节点|卷纲|功能标签|目标情绪|字数目标|章首钩子|章尾钩子/
const META_TIER2_RE =
  /第[一二三四五六七八九十百千万两0-9]+章|本章|这一章|上一章|下一章|上章|下章|前一章|后一章|前文|后文|伏笔|读者|任务描述/

export function runDegenerationCheck(text: string): GateFinding[] {
  const findings: GateFinding[] = []
  try {
    const raw = (text || '').replace(/\r\n/g, '\n')
    if (!raw.trim()) return findings

    /* ① 紧邻整行重复 */
    const lines = raw.split('\n')
    for (let i = 1; i < lines.length; i++) {
      const a = stripQuotes(lines[i - 1] || '')
      const b = stripQuotes(lines[i] || '')
      if (a.length >= ADJACENT_MIN_LEN && a === b) {
        findings.push(
          makeFinding(
            'degeneration',
            'S2',
            'adjacent-duplicate-line',
            '相邻两行整行重复（模型复读）',
            '删除重复行，保留一次；若需强调改用不同措辞',
            lines[i],
            { line: i + 1 }
          )
        )
      }
    }

    /* ② 长句高频重复（引号内台词豁免） */
    const sentences = splitSentences(raw)
    const sentenceCount = new Map<string, { count: number; sample: string }>()
    for (const s of sentences) {
      if (/^[“「『]/.test(s) || /[”」』]$/.test(s)) continue
      if (visibleLen(s) < REPEAT_MIN_LEN) continue
      const key = stripQuotes(s).replace(/[，,、；;：:—…\s]/g, '')
      if (key.length < REPEAT_MIN_LEN) continue
      const cur = sentenceCount.get(key) || { count: 0, sample: s }
      cur.count += 1
      sentenceCount.set(key, cur)
    }
    for (const [, v] of sentenceCount) {
      if (v.count >= REPEAT_MIN_COUNT) {
        findings.push(
          makeFinding(
            'degeneration',
            'S2',
            'repetition',
            `同一长句重复 ${v.count} 次（≥${REPEAT_MIN_COUNT} 次判为复读）`,
            '改写其中至少两处，或删除冗余；保持每处表达不同',
            v.sample
          )
        )
      }
    }

    /* ③ 截断：末行未以终止符结尾 */
    const lastLine = [...lines].reverse().find((x) => x.trim().length > 0) || ''
    const tail = lastLine.trim()
    if (tail.length > 0 && !TERMINAL_CHARS.includes(tail.slice(-1))) {
      findings.push(
        makeFinding(
          'degeneration',
          'S2',
          'truncation',
          '正文末行未以句末标点收尾，疑似被截断',
          '补全结尾句或补齐句末标点，确保最后一句语义完整',
          tail
        )
      )
    }

    /* ④⑤⑥⑦ 占位符 / 乱码 / 英文 AI 腔 / AI 自指 / 生成拒绝语 */
    for (const rule of PLACEHOLDER_RULES) {
      const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(raw)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue }
        const inside = isInsideQuotes(raw, m.index)
        let severity: GateSeverity = rule.hard ? 'S2' : 'S3'
        if (inside) severity = rule.hard ? 'S3' : 'S4'
        findings.push(
          makeFinding(
            'degeneration',
            severity,
            rule.rule,
            `命中「${rule.label}」${inside ? '（引号内，降级）' : ''}`,
            '删除该片段，改写为剧情内的自然叙述',
            m[0]
          )
        )
      }
    }

    /* ⑧ 工程词泄漏 */
    for (const line of lines) {
      const t1 = line.match(META_TIER1_RE)
      if (t1) {
        const idx = t1.index || 0
        const inside = isInsideQuotes(line, idx)
        findings.push(
          makeFinding(
            'degeneration',
            inside ? 'S3' : 'S2',
            'meta-leak-tier1',
            `工程/大纲术语泄漏：「${t1[0]}」${inside ? '（引号内，降级）' : ''}`,
            '删除该术语，改用剧情内的自然表达',
            line
          )
        )
        continue
      }
      const t2 = line.match(META_TIER2_RE)
      if (t2) {
        const idx = t2.index || 0
        const inside = isInsideQuotes(line, idx)
        findings.push(
          makeFinding(
            'degeneration',
            inside ? 'S4' : 'S3',
            'meta-leak-tier2',
            `元叙事词：「${t2[0]}」${inside ? '（引号内，降级）' : ''}`,
            '删除「本章/前文/读者/伏笔」等元叙事表述，改写为剧情内视角',
            line
          )
        )
      }
    }
  } catch {
    /* never throw */
  }
  return findings
}

/* ------------------------------------------------------------------ */
/* 2. 标点检查（normalize-punctuation.js 精简移植）                     */
/* ------------------------------------------------------------------ */

export function runPunctuationCheck(text: string): GateFinding[] {
  const findings: GateFinding[] = []
  try {
    const raw = (text || '').replace(/\r\n/g, '\n')
    if (!raw.trim()) return findings

    /* ① 连续重复标点 */
    const bang = raw.match(/[！!]{2,}/g) || []
    const ques = raw.match(/[？?]{2,}/g) || []
    const mixed = raw.match(/[！!？?]{2,}/g) || []
    const maxRun = Math.max(
      0,
      ...bang.map((x) => x.length),
      ...ques.map((x) => x.length),
      ...mixed.map((x) => x.length)
    )
    if (maxRun >= 2) {
      findings.push(
        makeFinding(
          'punctuation',
          maxRun >= 4 ? 'S2' : 'S3',
          'repeated-punctuation',
          `连续感叹/问号 ${maxRun} 个（应最多 1 个）`,
          '保留一个标点，情绪强度用文字表达',
          (bang[0] || ques[0] || mixed[0] || '').slice(0, 8)
        )
      )
    }

    /* ② 中文语境半角标点 */
    const halfWidth = raw.match(/[\u4e00-\u9fa5][,\.](?=[\u4e00-\u9fa5])/g) || []
    if (halfWidth.length > 0) {
      findings.push(
        makeFinding(
          'punctuation',
          'S3',
          'half-width-punctuation',
          `中文语句中出现半角标点 ${halfWidth.length} 处`,
          '改为中文全角标点（，。）',
          halfWidth[0] || ''
        )
      )
    }

    /* ③ 省略号非标准 */
    const badEllipsis = raw.match(/\.{3,}|。{3,}/g) || []
    if (badEllipsis.length > 0) {
      findings.push(
        makeFinding(
          'punctuation',
          'S3',
          'ellipsis-format',
          `省略号写法不规范 ${badEllipsis.length} 处（应为「……」）`,
          '统一改为中文省略号「……」',
          badEllipsis[0] || ''
        )
      )
    }

    /* ④ 破折号非标准 */
    const badDash = raw.match(/--+/g) || []
    const singleDash = raw.match(/(^|[^—])—([^—]|$)/g) || []
    if (badDash.length > 0 || singleDash.length > 0) {
      findings.push(
        makeFinding(
          'punctuation',
          'S3',
          'dash-format',
          `破折号写法不规范 ${badDash.length + singleDash.length} 处（应为「——」）`,
          '统一改为中文双破折号「——」',
          badDash[0] || singleDash[0] || ''
        )
      )
    }

    /* ⑤ 独立分隔线 */
    if (/(^|\n)\s*-{3,}\s*(\n|$)/.test(raw)) {
      findings.push(
        makeFinding(
          'punctuation',
          'S3',
          'markdown-divider',
          '正文中出现 Markdown 分隔线 ---',
          '删除分隔线，场景转换用空行或文字过渡',
          '---'
        )
      )
    }

    /* ⑥ 行尾逗号 */
    const lines = raw.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const t = (lines[i] || '').trim()
      if (t.length > 20 && /[，,]$/.test(t)) {
        findings.push(
          makeFinding(
            'punctuation',
            'S3',
            'line-end-comma',
            '段落以逗号结尾（疑似生成中断或分句错误）',
            '补全句子并改为句号，或与下一行合并',
            t,
            { line: i + 1 }
          )
        )
        break
      }
    }

    /* ⑦ 引号配对 */
    const openD = (raw.match(/“/g) || []).length
    const closeD = (raw.match(/”/g) || []).length
    if (openD !== closeD) {
      findings.push(
        makeFinding(
          'punctuation',
          'S2',
          'unpaired-quote',
          `中文双引号未配对（“ ${openD} / ” ${closeD}）`,
          '补齐缺失的引号，确保对话边界完整',
          `“×${openD} ”×${closeD}`
        )
      )
    }
    const openC = (raw.match(/「/g) || []).length
    const closeC = (raw.match(/」/g) || []).length
    if (openC !== closeC) {
      findings.push(
        makeFinding(
          'punctuation',
          'S2',
          'unpaired-corner-quote',
          `中文直角引号未配对（「 ${openC} / 」 ${closeC}）`,
          '补齐缺失的引号',
          `「×${openC} 」×${closeC}`
        )
      )
    }
  } catch {
    /* never throw */
  }
  return findings
}

/* ------------------------------------------------------------------ */
/* 3. AI 套词检查（banned-words.md 分层移植）                           */
/* ------------------------------------------------------------------ */

interface BannedRule {
  rule: string
  label: string
  re: RegExp
  fix: string
}

const BANNED_RULES: BannedRule[] = [
  {
    rule: 'negation-flip',
    label: '否定翻转句式（不是…而是…）',
    re: /不是[^。！？\n]{1,24}?而是/g,
    fix: '改为直陈句：直接写「是什么」，删掉否定铺垫',
  },
  {
    rule: 'parallel-construction',
    label: '工整并列句式（既…又…）',
    re: /既[^。！？\n]{1,16}?又/g,
    fix: '拆成两个短句，或只保留信息量更大的一项',
  },
  {
    rule: 'universal-adverb',
    label: '万能状语（静静地/缓缓地/轻轻地/微微地）',
    re: /(静静地|缓缓地|轻轻地|微微地|默默地)/g,
    fix: '删除状语，改用具体动作或感官细节',
  },
  {
    rule: 'explanation-chain',
    label: '解释结论链（这说明/换句话说/也就是说）',
    re: /(这说明|换句话说|也就是说|这意味着|换言之)/g,
    fix: '删除解释句，让动作与结果自己说话',
  },
  {
    rule: 'meaning-inflation',
    label: '意义膨胀（这一刻/仿佛整个世界/足以载入史册）',
    re: /(这一刻|那一刻|仿佛整个世界|足以载入史册|前所未有)/g,
    fix: '删掉宏大形容，落到具体可见的变化',
  },
  {
    rule: 'abstract-closure',
    label: '抽象收束（而这一切/殊不知/命运的齿轮）',
    re: /(而这一切|殊不知|命运的齿轮|谁也没有想到)/g,
    fix: '删除总结式收束，直接切入下一个具体场景',
  },
  {
    rule: 'notify-template',
    label: '告知模板（他知道，/他意识到，）',
    re: /(他知道，|她知道，|他明白，|她明白，|他意识到，|她意识到，|他心里清楚，)/g,
    fix: '删除「他知道/他意识到」，直接写他因此做了什么',
  },
  {
    rule: 'generic-reaction',
    label: '通用反应（众人一惊/全场哗然/倒吸一口凉气）',
    re: /(众人一惊|全场哗然|倒吸一口凉气|鸦雀无声|满座皆惊)/g,
    fix: '换成一个具体人物的具体反应（手、眼、呼吸、动作）',
  },
  {
    rule: 'template-simile',
    label: '模板比喻（像一…一样/宛如…一般）',
    re: /(像一[^。！？\n]{1,12}?一样|宛如[^。！？\n]{1,12}?一般|如同[^。！？\n]{1,12}?一般)/g,
    fix: '删除模板比喻，改用与本题材世界观看得见的物象',
  },
  {
    rule: 'empty-qualifier',
    label: '空泛定性（强大的气息/凌厉的气势）',
    re: /(强大的气息|凌厉的气势|可怕的力量|深不可测|高深莫测)/g,
    fix: '用可测量的具体表现替代（几步之内、气压变化、旁人反应）',
  },
]

export function runBannedPhraseCheck(text: string): GateFinding[] {
  const findings: GateFinding[] = []
  try {
    const raw = (text || '').replace(/\r\n/g, '\n')
    if (!raw.trim()) return findings

    for (const rule of BANNED_RULES) {
      const re = new RegExp(rule.re.source, 'g')
      let m: RegExpExecArray | null
      let count = 0
      let sample = ''
      while ((m = re.exec(raw)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue }
        count++
        if (!sample) sample = m[0]
      }
      if (count === 0) continue
      const severity: GateSeverity = count >= 6 ? 'S2' : count >= 3 ? 'S3' : 'S4'
      findings.push(
        makeFinding(
          'banned-phrase',
          severity,
          rule.rule,
          `${rule.label}，命中 ${count} 处`,
          rule.fix,
          sample
        )
      )
    }
  } catch {
    /* never throw */
  }
  return findings
}

/* ------------------------------------------------------------------ */
/* 4. 番茄五项确定性 rubric                                            */
/* ------------------------------------------------------------------ */

const CONFLICT_WORDS =
  /(却|但|竟|忽然|猛地|怒|杀|死|退婚|背叛|危机|血|刀|箭|追|围|逼|抢|夺|逃|破|困|险|敌|斥|骂|打|斗|争)/
const SUSPENSE_WORDS = /(为何|为什么|究竟|难道|秘密|真相|不知道|是谁|怎么会|凭什么|到底)/
const HOOK_WORDS = /(却|竟|突然|就在|然而|与此同时|不料|没想到|偏偏|只剩|已经来不及)/
const THREAT_WORDS = /(明日|今夜|三天|必须|否则|等着|必杀|代价|倒计时|来不及|最后一次)/
const EMOTION_WORDS = /(怒|惊|惧|喜|悲|痛|颤|咬牙|冷笑|心头一紧|眼眶|发抖|喘|吼|笑|哭|沉默|攥紧|握紧)/

const GENRE_KEYWORDS: Array<{ test: RegExp; words: string[] }> = [
  {
    test: /历史|架空|两宋|元明|明清|大唐|盛唐|汉末|三国|权谋|朝堂|宫廷|宫斗|民国|战国|春秋|大明|大宋/,
    words: ['皇帝', '陛下', '朝', '军', '城', '粮', '战', '臣', '殿下', '天下', '百姓', '边关', '奏', '钦差', '藩'],
  },
  {
    test: /修仙|仙侠|玄幻|洪荒|修真|仙逆/,
    words: ['灵气', '灵石', '宗门', '弟子', '长老', '法宝', '丹', '修为', '境界', '法术', '元婴', '筑基'],
  },
  {
    test: /都市|现代|职场|现实/,
    words: ['公司', '总裁', '合同', '手机', '医院', '警', '律师', '直播', '项目', '老板', '客户'],
  },
  {
    test: /科幻|星际|末世|赛博|机甲|基因/,
    words: ['飞船', '星舰', '基因', '机甲', '芯片', '能量', '殖民地', '舱', '轨道', '反应堆'],
  },
  {
    test: /悬疑|推理|刑侦|灵异/,
    words: ['案', '尸体', '线索', '嫌疑', '凶手', '现场', '尸检', '证物', '警'],
  },
]

const CULTIVATION_CONFLICT = /(灵气|灵石|宗门|元婴|筑基|金丹|法宝|丹药|修真|修仙|渡劫|飞升)/
const MODERN_CONFLICT = /(手机|汽车|电脑|网络|公司|咖啡|西装|电梯|合同)/

function scoreOpening(text: string): { score: number; fail: boolean } {
  const paras = splitParagraphs(text).slice(0, 3).join('\n')
  if (!paras) return { score: 0, fail: true }
  let s = 4
  if (CONFLICT_WORDS.test(paras)) s += 2
  if (SUSPENSE_WORDS.test(paras)) s += 2
  if (/[“「]/.test(paras)) s += 2
  const score = Math.min(10, s)
  return { score, fail: score < 6 }
}

function scoreRetention(text: string): { score: number; fail: boolean } {
  const all = splitParagraphs(text)
  const tail = all.slice(Math.max(0, all.length - 2)).join('\n')
  if (!tail) return { score: 0, fail: true }
  let s = 4
  if (HOOK_WORDS.test(tail)) s += 2
  if (/[？?]/.test(tail)) s += 2
  if (THREAT_WORDS.test(tail)) s += 2
  const score = Math.min(10, s)
  return { score, fail: score < 6 }
}

function scoreGenreFit(text: string, genre: string): { score: number; fail: boolean } {
  const g = (genre || '').trim()
  if (!g) return { score: 7, fail: false }
  const pack = GENRE_KEYWORDS.find((x) => x.test.test(g))
  if (!pack) return { score: 7, fail: false }
  const hits = pack.words.filter((w) => text.includes(w)).length
  let score = Math.min(10, 5 + Math.min(4, hits))
  const isHistory = /历史|架空|两宋|元明|明清|大唐|汉末|三国|权谋|朝堂|民国|战国/.test(g)
  const isCultivation = /修仙|仙侠|玄幻|洪荒|修真/.test(g)
  if (isHistory && CULTIVATION_CONFLICT.test(text)) score = Math.max(0, score - 4)
  if (isCultivation && MODERN_CONFLICT.test(text)) score = Math.max(0, score - 3)
  return { score, fail: score < 6 }
}

function scorePacing(text: string, metrics: GateMetrics): { score: number; fail: boolean } {
  let s = 10
  if (metrics.avgParagraphChars > 120) s -= 3
  if (metrics.avgParagraphChars > 200) s -= 2
  if (metrics.avgSentenceChars > 28) s -= 2
  if (metrics.dialogueRatio < 0.06) s -= 2
  if (metrics.dialogueRatio < 0.02) s -= 2
  const score = Math.max(0, s)
  return { score, fail: score < 6 }
}

function scoreEmotion(text: string, chineseChars: number): { score: number; fail: boolean } {
  const expected = Math.max(1, Math.ceil(chineseChars / 1000))
  const hits = (text.match(new RegExp(EMOTION_WORDS.source, 'g')) || []).length
  if (hits === 0) return { score: 2, fail: true }
  const score = Math.min(10, 4 + Math.floor((hits / expected) * 3))
  return { score, fail: score < 6 }
}

export function scoreFanqieRubric(
  text: string,
  opts: GateOptions = {}
): { fanqie: FanqieScore; findings: GateFinding[] } {
  const findings: GateFinding[] = []
  const metrics = computeMetrics(text)
  const opening = scoreOpening(text)
  const retention = scoreRetention(text)
  const genreFit = scoreGenreFit(text, opts.genre || '')
  const pacing = scorePacing(text, metrics)
  const emotion = scoreEmotion(text, metrics.chineseChars)

  const total =
    opening.score * 0.3 +
    retention.score * 0.25 +
    genreFit.score * 0.15 +
    pacing.score * 0.15 +
    emotion.score * 0.15

  const fails: string[] = []
  const push = (name: string, r: { score: number; fail: boolean }) => {
    if (!r.fail) return
    fails.push(`${name} ${r.score}/10`)
    findings.push(
      makeFinding(
        'fanqie-rubric',
        'S3',
        `fanqie-${name}`,
        `番茄 rubric「${name}」未达标（${r.score}/10）`,
        name === '开头吸引力'
          ? '前 3 段补冲突/悬念/对话钩子之一'
          : name === '读者留存'
            ? '章末补未解问题、威胁或倒计时'
            : name === '题材匹配'
              ? '补题材核心意象词，删除串味词'
              : name === '阅读节奏'
                ? '拆短段落与长句，提高对话占比'
                : '每千字补一次明确情绪反馈',
        `${name}=${r.score}`
      )
    )
  }
  push('开头吸引力', opening)
  push('读者留存', retention)
  push('题材匹配', genreFit)
  push('阅读节奏', pacing)
  push('情绪节点', emotion)

  return {
    fanqie: {
      opening: opening.score,
      retention: retention.score,
      genreFit: genreFit.score,
      pacing: pacing.score,
      emotion: emotion.score,
      total: Math.round(total * 10) / 10,
      fails,
    },
    findings,
  }
}

/* ------------------------------------------------------------------ */
/* 5. 指标统计                                                         */
/* ------------------------------------------------------------------ */

export function computeMetrics(text: string): GateMetrics {
  const raw = text || ''
  const chineseChars = countChinese(raw)
  const paras = splitParagraphs(raw)
  const paragraphs = paras.length
  const paraChars = paras.map((p) => countChinese(p))
  const avgParagraphChars = paragraphs > 0
    ? Math.round(paraChars.reduce((a, b) => a + b, 0) / paragraphs)
    : 0

  const sentences = splitSentences(raw)
  const avgSentenceChars = sentences.length > 0
    ? Math.round(sentences.reduce((a, s) => a + countChinese(s), 0) / sentences.length)
    : 0

  let dialogueChars = 0
  const dRe = /[“「]([^”」]{0,400})[”」]/g
  let dm: RegExpExecArray | null
  while ((dm = dRe.exec(raw)) !== null) {
    dialogueChars += countChinese(dm[1])
  }
  const dialogueRatio = chineseChars > 0
    ? Math.round((dialogueChars / chineseChars) * 1000) / 1000
    : 0

  return { chineseChars, paragraphs, avgParagraphChars, avgSentenceChars, dialogueRatio }
}

/* ------------------------------------------------------------------ */
/* 6. 规划阶段门禁                                                     */
/* ------------------------------------------------------------------ */

const PLACEHOLDER_TEXT_RE = /(待定|TBD|placeholder|未命名|待补充|xxx|X{3,})/i

function asArray(v: any): any[] {
  return Array.isArray(v) ? v : []
}

function nonEmpty(v: any): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return true
}

function gateMissing(
  step: string,
  field: string,
  severity: GateSeverity,
  missing: string[],
  findings: GateFinding[]
): void {
  missing.push(`${step}.${field}`)
  findings.push(
    makeFinding(
      'planning',
      severity,
      `planning-${step}-${field}`,
      `规划步「${step}」缺少必需项 ${field}`,
      `补齐 ${field} 后再进入下一步，避免正文阶段无米下锅`,
      `${step}.${field}`
    )
  )
}

export function evaluatePlanningGate(
  step: string,
  data: any,
  genre?: string
): PlanningGateResult {
  const findings: GateFinding[] = []
  const missing: string[] = []
  try {
    if (!data || typeof data !== 'object') {
      findings.push(
        makeFinding(
          'planning',
          'S1',
          `planning-${step}-empty`,
          `规划步「${step}」返回为空或非对象`,
          '重新生成本步',
          String(data)
        )
      )
      return { ok: false, findings, missing: [step] }
    }

    const keyCount = Object.keys(data).length
    if (keyCount === 0) {
      findings.push(
        makeFinding(
          'planning',
          'S1',
          `planning-${step}-empty-object`,
          `规划步「${step}」返回空对象`,
          '重新生成本步',
          '{}'
        )
      )
      return { ok: false, findings, missing: [step] }
    }

    if (step === 'idea') {
      let requiredHits = 0
      for (const f of ['title', 'tagline', 'coreIdea', 'genre', 'protagonistName', 'targetAudience', 'coreConflict']) {
        if (nonEmpty(data[f])) requiredHits++
        else gateMissing(step, f, 'S2', missing, findings)
      }
      const sp = asArray(data.sellingPoints)
      if (sp.length < 3) gateMissing(step, 'sellingPoints(≥3)', 'S2', missing, findings)
      if (requiredHits === 0) {
        findings.push(
          makeFinding(
            'planning',
            'S1',
            'planning-idea-all-empty',
            'idea 步全部核心字段为空',
            '重新生成本步',
            JSON.stringify(data).slice(0, 80)
          )
        )
      }
    } else if (step === 'worldbuilding') {
      if (!nonEmpty(data.worldName) && !nonEmpty(data.name)) gateMissing(step, 'worldName/name', 'S2', missing, findings)
      if (asArray(data.rules).length < 4) gateMissing(step, 'rules(≥4)', 'S2', missing, findings)
      if (asArray(data.factions).length < 2 && asArray(data.powers).length < 2) {
        gateMissing(step, 'factions/powers(≥2)', 'S2', missing, findings)
      }
    } else if (step === 'powerSystem') {
      if (!nonEmpty(data.systemName) && asArray(data.levels).length < 3) {
        gateMissing(step, 'systemName 或 levels(≥3)', 'S2', missing, findings)
      }
    } else if (step === 'characters') {
      if (!data.protagonist || !nonEmpty(data.protagonist.name)) {
        gateMissing(step, 'protagonist.name', 'S2', missing, findings)
      }
      if (asArray(data.antagonists).length < 2) gateMissing(step, 'antagonists(≥2)', 'S2', missing, findings)
      if (asArray(data.supporting).length < 3) gateMissing(step, 'supporting(≥3)', 'S2', missing, findings)
    } else if (step === 'factions') {
      if (asArray(data.factions).length < 3) gateMissing(step, 'factions(≥3)', 'S2', missing, findings)
    } else if (step === 'relationships') {
      const rel = asArray(data.relationships).length > 0 ? asArray(data.relationships) : asArray(data.relations)
      if (rel.length < 5) gateMissing(step, 'relationships(≥5)', 'S2', missing, findings)
    } else if (step === 'outline') {
      const stages = asArray(data.stages)
      if (stages.length < 3) {
        gateMissing(step, 'stages(≥3)', 'S2', missing, findings)
      } else {
        const bad = stages.filter((s: any) => !s || (!nonEmpty(s.summary) && !nonEmpty(s.description)))
        if (bad.length > 0) gateMissing(step, 'stages[].summary', 'S2', missing, findings)
      }
      const mainPlot = asArray(data.mainPlot)
      if (mainPlot.length < 6 && asArray(data.conflicts).length === 0) {
        gateMissing(step, 'mainPlot(≥6)/conflicts', 'S2', missing, findings)
      }
    } else if (step === 'keyPlots') {
      const arr = asArray(data.keyPlots).length > 0 ? asArray(data.keyPlots) : asArray(data.plots)
      if (arr.length < 5) {
        gateMissing(step, 'keyPlots(≥5)', 'S2', missing, findings)
      } else {
        const bad = arr.filter(
          (p: any) => !p || (!nonEmpty(p.title) && !nonEmpty(p.name)) || (!nonEmpty(p.description) && !nonEmpty(p.content))
        )
        if (bad.length > 0) gateMissing(step, 'keyPlots[].title/description', 'S2', missing, findings)
      }
    } else if (step === 'chapters') {
      const chapters = asArray(data.chapters).length > 0
        ? asArray(data.chapters)
        : asArray(data.volumes).flatMap((v: any) => asArray(v && v.chapters))
      if (chapters.length === 0) {
        gateMissing(step, 'chapters', 'S2', missing, findings)
      } else {
        const noTitle = chapters.filter((c: any) => !c || (!nonEmpty(c.title) && !nonEmpty(c.name)))
        const noSummary = chapters.filter((c: any) => !c || (!nonEmpty(c.summary) && !nonEmpty(c.description) && !nonEmpty(c.corePlot)))
        if (noTitle.length > 0) gateMissing(step, 'chapters[].title', 'S2', missing, findings)
        if (noSummary.length > 0) gateMissing(step, 'chapters[].summary', 'S2', missing, findings)
        const noHook = chapters.filter((c: any) => !c || (!nonEmpty(c.hook) && !nonEmpty(c.ending) && !nonEmpty(c.hookLine)))
        if (noHook.length > 0) {
          findings.push(
            makeFinding(
              'planning',
              'S3',
              'planning-chapters-hook',
              `章节大纲有 ${noHook.length} 章缺少章末钩子`,
              '为每章补 hook/ending，保证章末有翻页动力',
              `${noHook.length} chapters`
            )
          )
        }
      }
    }

    /* 占位词扫描（整棵 data） */
    let serialized = ''
    try {
      serialized = JSON.stringify(data)
    } catch {
      serialized = ''
    }
    if (serialized) {
      const m = serialized.match(PLACEHOLDER_TEXT_RE)
      if (m) {
        findings.push(
          makeFinding(
            'planning',
            'S1',
            'planning-placeholder',
            `规划数据中残留占位词「${m[0]}」`,
            '替换为真实内容后再进入下一步',
            m[0]
          )
        )
      }
    }

    /* 题材一致性（轻量）：给了 genre 且数据里 topic/genre 明显冲突时提示 */
    if (genre && nonEmpty(data.genre) && typeof data.genre === 'string' && data.genre.trim() !== genre.trim()) {
      findings.push(
        makeFinding(
          'planning',
          'S3',
          'planning-genre-drift',
          `规划步「${step}」题材与锁定题材不一致（${data.genre} ≠ ${genre}）`,
          '锁定为输入题材，删除串味设定',
          data.genre
        )
      )
    }
  } catch {
    /* never throw */
  }
  const ok = !findings.some((f) => f.severity === 'S1')
  return { ok, findings, missing }
}

/* ------------------------------------------------------------------ */
/* 7. 聚合                                                             */
/* ------------------------------------------------------------------ */

export function summarizeFindings(
  findings: GateFinding[],
  strict = false
): { verdict: GateVerdict; counts: Record<GateSeverity, number>; blocking: GateFinding[] } {
  const counts: Record<GateSeverity, number> = { S1: 0, S2: 0, S3: 0, S4: 0 }
  for (const f of findings) counts[f.severity] += 1

  let verdict: GateVerdict = 'APPROVE'
  if (counts.S1 > 0) verdict = 'REJECT'
  else if (counts.S2 > 0 || counts.S3 >= 5) verdict = 'CONCERNS'
  else if (strict && counts.S4 >= 8) verdict = 'CONCERNS'

  const blocking = findings.filter((f) => f.severity === 'S1' || f.severity === 'S2')
  return { verdict, counts, blocking }
}

export function runSigningGate(text: string, opts: GateOptions = {}): SigningGateResult {
  const findings: GateFinding[] = []
  const metrics = computeMetrics(text || '')
  let fanqie: FanqieScore = {
    opening: 0,
    retention: 0,
    genreFit: 0,
    pacing: 0,
    emotion: 0,
    total: 0,
    fails: [],
  }

  try {
    findings.push(...runDegenerationCheck(text || ''))
    findings.push(...runPunctuationCheck(text || ''))
    findings.push(...runBannedPhraseCheck(text || ''))
    const rubric = scoreFanqieRubric(text || '', opts)
    fanqie = rubric.fanqie
    // 两项以上 rubric fail → 升级为 S2，其余保持 S3
    const failCount = rubric.findings.length
    for (const f of rubric.findings) {
      // 仅「短章（<1500 字）且两项以上不达标」升级为 S2；
      // 正常章节的「开头吸引力」属全书属性（黄金三章），不因单章中段缺钩子而误杀。
      if (failCount >= 2 && metrics.chineseChars < 1500) f.severity = 'S2'
      findings.push(f)
    }
  } catch {
    /* never throw */
  }

  const { verdict, counts, blocking } = summarizeFindings(findings, !!opts.strict)
  const summary = `[签约门禁] ${verdict}｜S1=${counts.S1} S2=${counts.S2} S3=${counts.S3} S4=${counts.S4}｜番茄 ${fanqie.total}/10｜${metrics.chineseChars}字`

  return { verdict, findings, counts, blocking, metrics, fanqie, summary }
}
