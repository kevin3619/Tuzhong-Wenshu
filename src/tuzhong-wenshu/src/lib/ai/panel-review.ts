import { callLLMWithFallback, type LLMConfig, type LLMMessage } from '@/lib/ai/llm'
import { lenientParseJSON } from '@/lib/ai/json-lenient'

export interface PanelReviewInput {
  content: string
  chapterTitle?: string
  chapterSummary?: string
  genre?: string
  characters?: string
  previousChapterEnding?: string
  llmConfig?: LLMConfig
}

export interface PanelReviewResult {
  editorScore: number
  readerScore: number
  writerNotes: string[]
  mustFix: string[]
  verdict: 'PASS' | 'REVISE' | 'DEGRADED'
  editor: { structure: string; pacing: string; characterConsistency: string; platformRisk: string }
  reader: { hook: string; payoffs: string[]; poisonPoints: string[]; dropPointAt: string }
  degraded?: boolean
}

interface EditorReview {
  score: number
  structure: string
  pacing: string
  characterConsistency: string
  platformRisk: string
  mustFix: string[]
}

interface ReaderReview {
  score: number
  hook: string
  payoffs: string[]
  poisonPoints: string[]
  dropPointAt: string
}

const TEMPERATURE = 0.2

const WRITER_SYSTEM = `你是起点中文网白金签约作者，写网文十五年，最擅长把"能看"的章节改成"追着看"的章节。

你的唯一职责：对本章做【写法诊断 + 可执行的改写建议】。

【硬性边界】
- 绝对禁止重写全文、续写、改写原文或输出任何成品段落，只能给建议。
- 不要评分，不要判断能否签约，不要评估平台风险（那是审稿编辑的职责）。
- 不要预测读者会不会弃书（那是老书虫读者的职责）。
- 每条建议必须落到"哪里有问题 + 具体怎么改"，能让人直接照着动手，禁止空话套话。

【必须覆盖的四个维度，每项 1-3 条】
1. 白描：画面、动作、环境是否落到实处；是否堆形容词、靠解说代替呈现。
2. 潜台词：对话是否太直白、把话说满；有没有留下可回味的东西。
3. 信息差：读者与角色各知道多少，是否形成悬念或张力；有没有提前漏底。
4. 断章钩子：章末是否留下让人必须点下一章的理由；钩子是否具体、是否与本章冲突咬合。

【输出格式】
纯文本，一行一条建议，以「白描：」「潜台词：」「信息差：」「断章钩子：」开头。
不要编号，不要 Markdown，不要前后说明，不要输出任何评分或结论。`

const EDITOR_SYSTEM = `你是头部网文平台的金牌审稿编辑，负责签约评估与上架把关。

你的唯一职责：从编辑视角判断这一章能不能签、能不能留、有没有硬伤。

【硬性边界】
- 只做审稿判断，不提供具体改写方案，不替作者重写句子（那是白金写手的职责）。
- 不评价读者爽感、追读欲、弃书点（那是老书虫读者的职责）。
- 评分必须严格，按平台签约标准打分，0-10 分，允许小数。

【评分档位（先对照档位再给分，禁止一律压到 7.5-8.5）】
- 9.0-9.5：大神级。结构、节奏、人物、平台适配四项全部无短板，且至少有一处让人拍案的巧思。
- 8.8-8.9：签约级白金。四项均达标、无硬伤，可直接签约上架。
- 8.0-8.7：可签但需打磨。整体成立，但至少一项存在明显短板，或 mustFix 有 1-2 条非致命问题。
- 7.0-7.9：勉强及格。存在影响追读的实质问题（拖沓、逻辑断裂、人物失真等），需返修。
- 6.0-6.9：不合格。结构不成立，或人物崩坏，或触碰平台风险。
- 6.0 以下：废稿。
【档位判定规则】
- mustFix 中有任意一条，score 不得高于 8.7。
- mustFix 为空、且 four dimensions 均无明显短板时，score 不得低于 8.8。
- 只对照本章实际质量给分，禁止因为"网文普遍如此""对新人放宽"而压低或抬高分数。

【评审维度】
- structure：章节结构是否完整，起承转合、冲突推进是否成立。
- pacing：节奏是否拖沓或跳脱，信息密度与场景切换是否合理。
- characterConsistency：人物言行、动机、能力边界是否前后一致。
- platformRisk：签约与平台风险（题材红线、价值观、同质化、开篇吸引力、更新适配度）。
- mustFix：必须修改的硬伤清单，最多 5 条；每条一句话说清问题和位置。
  只收硬伤：逻辑断裂、前后矛盾、人物崩线、史实硬伤、平台红线、章节结构不完整。
  措辞、修辞、描写密度这类可优化的写法问题一律不写进 mustFix（交给白金写手）。
  没有上述硬伤时必须给空数组 []，严禁为了凑数而填满 5 条。

【输出格式】
只输出一个合法 JSON 对象，字段固定为：
{"score":number,"structure":string,"pacing":string,"characterConsistency":string,"platformRisk":string,"mustFix":string[]}
不要输出 Markdown 围栏、解释、前言或任何 JSON 之外的文字。`

const READER_SYSTEM = `你是看了十年网文的付费老书虫，口味刁、耐心差，随时准备弃书。

你的唯一职责：以一个真实追更读者的身份，判断这一章好不好看、想不想继续追。

【硬性边界】
- 只说读者感受，不给写作技巧、不给改稿方案（那是白金写手和编辑的职责）。
- 不做签约判断，不评估平台风险。
- 评分按真实追读体验打，0-10 分，允许小数；不好看就低分，不要客气。

【评分档位（按真实追读体验对号入座，禁止一律压到 7.5）】
- 9.0-9.5：会追、会付费、会推荐给朋友；至少有一处让人拍腿叫好或心头一紧。
- 8.5-8.9：愿意一直追下去，有明确的期待点，没有实质毒点。
- 7.5-8.4：能看完，但没有必须追的理由，看完就走。
- 6.5-7.4：中途想跳读或快进，存在明显毒点。
- 6.5 以下：看到一半就想点叉。
【档位判定规则】
- poisonPoints 中有任意一条实质毒点（出戏、降智、憋屈、套路、注水）时，score 不得高于 8.4。
- 没有实质毒点、且本章至少有 2 处真实情绪回报（爽点、悬念、心痛、解气等）时，score 不得低于 8.5。
- 不要因为"这是历史文/正剧"就自动降分，也不要因为"作者写得辛苦"就抬分。

【评审维度】
- hook：开篇/本章钩子是否抓人，读者为什么愿意看下去。
- payoffs：本章兑现的爽点、期待感或情绪回报，逐条列出。
- poisonPoints：毒点（出戏、降智、憋屈、套路、注水等），逐条列出。
- dropPointAt：最可能让读者点叉弃书的位置（引用情节或大致位置）；没有明显弃书点就写"无明显弃书点"。

【输出格式】
只输出一个合法 JSON 对象，字段固定为：
{"score":number,"hook":string,"payoffs":string[],"poisonPoints":string[],"dropPointAt":string}
不要输出 Markdown 围栏、解释、前言或任何 JSON 之外的文字。`

function buildContext(input: PanelReviewInput): string {
  const parts: string[] = []
  if (input.chapterTitle) parts.push(`【章节标题】${input.chapterTitle}`)
  if (input.genre) parts.push(`【作品题材】${input.genre}`)
  if (input.chapterSummary) parts.push(`【本章梗概】${input.chapterSummary}`)
  if (input.characters) parts.push(`【主要人物】${input.characters}`)
  if (input.previousChapterEnding) parts.push(`【上一章结尾】${input.previousChapterEnding}`)
  parts.push(`【本章正文】\n${input.content}`)
  return parts.join('\n\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 宽松解析：先直接 parse，再截取 {…} 解析，最后交给共享容错解析器 */
function parseLooseJSON(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .replace(/<think[\s\S]*?<\/think>/gi, '')
    .replace(/<think[\s\S]*/gi, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned)
    if (isRecord(parsed)) return parsed
  } catch (_e) {}

  const matched = cleaned.match(/\{[\s\S]*\}/)
  if (matched) {
    try {
      const parsed = JSON.parse(matched[0])
      if (isRecord(parsed)) return parsed
    } catch (_e) {}
  }

  try {
    const lenient = lenientParseJSON(cleaned)
    if (isRecord(lenient)) return lenient
  } catch (_e) {}

  return null
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('；')
  if (typeof value === 'object') return ''
  return String(value).trim()
}

function toStringArray(value: unknown, limit = 10): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const text = asText(item)
    if (text && !out.includes(text)) out.push(text)
    if (out.length >= limit) break
  }
  return out
}

function toScore(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return Math.max(0, Math.min(10, Math.round(value * 10) / 10))
  }
  if (typeof value !== 'string') return null
  const matched = value.match(/-?\d+(?:\.\d+)?/)
  if (!matched) return null
  const num = Number(matched[0])
  if (!Number.isFinite(num)) return null
  return Math.max(0, Math.min(10, Math.round(num * 10) / 10))
}

function parseWriterNotes(raw: string): string[] {
  if (!raw) return []
  const cleaned = raw
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/```/g, '')
    .replace(/<think[\s\S]*?<\/think>/gi, '')
    .replace(/<think[\s\S]*/gi, '')
    .trim()

  let lines = cleaned.split(/\r?\n/)
  if (lines.filter(function (line) { return line.trim().length > 0 }).length <= 1) {
    lines = cleaned.split(/(?=\d{1,2}[.、)）]\s*)/)
  }

  const notes: string[] = []
  for (const rawLine of lines) {
    const line = rawLine
      .trim()
      .replace(/^[-*•·—]+\s*/, '')
      .replace(/^\d{1,2}[.、)）]\s*/, '')
      .trim()
    if (!line) continue
    if (/^[【\[]?(白描|潜台词|信息差|断章钩子)[】\]]?[:：]?$/.test(line)) continue
    if (/^(以下|本章|建议如下|写法诊断|改写建议)[^。！？]{0,20}[:：]?$/.test(line)) continue
    notes.push(line)
    if (notes.length >= 20) break
  }
  return notes
}

function parseEditorReview(raw: string): EditorReview | null {
  const obj = parseLooseJSON(raw)
  if (!obj) return null
  const score = toScore(obj.score)
  if (score === null) return null
  return {
    score,
    structure: asText(obj.structure),
    pacing: asText(obj.pacing),
    characterConsistency: asText(obj.characterConsistency),
    platformRisk: asText(obj.platformRisk),
    mustFix: toStringArray(obj.mustFix, 8),
  }
}

function parseReaderReview(raw: string): ReaderReview | null {
  const obj = parseLooseJSON(raw)
  if (!obj) return null
  const score = toScore(obj.score)
  if (score === null) return null
  return {
    score,
    hook: asText(obj.hook),
    payoffs: toStringArray(obj.payoffs, 10),
    poisonPoints: toStringArray(obj.poisonPoints, 10),
    dropPointAt: asText(obj.dropPointAt),
  }
}

async function callRole(
  config: LLMConfig,
  system: string,
  user: string,
  maxTokens: number,
  jsonTask: boolean
): Promise<string> {
  const messages: LLMMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  const result = await callLLMWithFallback(config, messages, undefined, {
    temperature: TEMPERATURE,
    maxTokens,
    skipJsonValidation: !jsonTask,
    step: jsonTask ? 'contractScore' : 'polish',
  })
  return result.content || ''
}

function emptyResult(): PanelReviewResult {
  return {
    editorScore: 0,
    readerScore: 0,
    writerNotes: [],
    mustFix: [],
    verdict: 'DEGRADED',
    editor: { structure: '', pacing: '', characterConsistency: '', platformRisk: '' },
    reader: { hook: '', payoffs: [], poisonPoints: [], dropPointAt: '' },
    degraded: true,
  }
}

/**
 * 三方评审：白金作者写手 / 金牌审稿编辑 / 十年老书虫读者
 * 三个角色并行，任一角色失败只降级该角色，绝不抛异常。
 */
export async function runPanelReview(input: PanelReviewInput): Promise<PanelReviewResult> {
  const config = input.llmConfig
  if (!config || !config.apiKey) return emptyResult()

  const context = buildContext(input)

  const [writerResult, editorResult, readerResult] = await Promise.allSettled([
    callRole(config, WRITER_SYSTEM, `${context}\n\n请给出本章的写法诊断与可执行改写建议。`, 1500, false).then(parseWriterNotes),
    callRole(config, EDITOR_SYSTEM, `${context}\n\n请以金牌审稿编辑的视角评审本章，并输出规定的 JSON 对象。`, 2000, true).then(parseEditorReview),
    callRole(config, READER_SYSTEM, `${context}\n\n请以十年老书虫读者的视角评审本章，并输出规定的 JSON 对象。`, 2000, true).then(parseReaderReview),
  ])

  let degraded = false

  let writerNotes: string[] = []
  if (writerResult.status === 'fulfilled' && writerResult.value.length > 0) {
    writerNotes = writerResult.value
  } else {
    degraded = true
  }

  let editorReview: EditorReview | null = null
  if (editorResult.status === 'fulfilled' && editorResult.value) {
    editorReview = editorResult.value
  } else {
    degraded = true
  }

  let readerReview: ReaderReview | null = null
  if (readerResult.status === 'fulfilled' && readerResult.value) {
    readerReview = readerResult.value
  } else {
    degraded = true
  }

  const editor: EditorReview = editorReview || {
    score: 0,
    structure: '',
    pacing: '',
    characterConsistency: '',
    platformRisk: '',
    mustFix: [],
  }
  const reader: ReaderReview = readerReview || {
    score: 0,
    hook: '',
    payoffs: [],
    poisonPoints: [],
    dropPointAt: '',
  }

  const verdict: PanelReviewResult['verdict'] = degraded
    ? 'DEGRADED'
    : (editor.score >= 8.8 && reader.score >= 8.5 && editor.mustFix.length === 0 ? 'PASS' : 'REVISE')

  return {
    editorScore: editor.score,
    readerScore: reader.score,
    writerNotes,
    mustFix: editor.mustFix,
    verdict,
    editor: {
      structure: editor.structure,
      pacing: editor.pacing,
      characterConsistency: editor.characterConsistency,
      platformRisk: editor.platformRisk,
    },
    reader: {
      hook: reader.hook,
      payoffs: reader.payoffs,
      poisonPoints: reader.poisonPoints,
      dropPointAt: reader.dropPointAt,
    },
    ...(degraded ? { degraded: true } : {}),
  }
}
