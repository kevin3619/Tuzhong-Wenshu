/**
 * oh-story · 模型响应正文抽取（自包含，零依赖）
 * ============================================================
 * 反修复背景（T6 最高优先项）：
 *   - 商汤 SenseNova-6.8-Flash-Lite：HTTP 200，但 `message.content` 恒为空，
 *     正文全部落在 `message.reasoning`（实测 content=0 / reasoning=411）。
 *   - glm-z1-flash：`message.content` 以 ` thinking` 推理段开头，直接当正文会污染输出。
 *   两者导致「今日无可用高质量模型」的阻塞；本模块统一抽取口径后即可解锁。
 *
 * 口径：
 *   ① 优先 `choices[0].message.content`
 *   ② 为空则回退 `message.reasoning`（商汤）→ `message.reasoning_content`（DeepSeek/astron 等）
 *   ③ 剥离 ` thinking...</think>`、``` 代码围栏、以及推理前言（Thinking Process: / 思考过程 等）
 *   ④ 返回 { text, source, stripped, rawLen }，便于上游记账与复测断言
 * 纯函数、零依赖、任何分支不抛错。
 */

export type ModelTextSource = 'content' | 'reasoning' | 'reasoning_content' | 'none'

export interface ModelTextResult {
  /** 抽取并清洗后的正文 */
  text: string
  /** 正文来自哪个字段 */
  source: ModelTextSource
  /** 是否做过剥离（think 段/围栏/推理前言） */
  stripped: boolean
  /** 原始候选字段的长度（剥离前） */
  rawLen: number
  /** 被剥离掉的推理段长度（无剥离时为 0） */
  strippedLen: number
}

/** ` thinking...</think>`（含未闭合）与若干推理标签 */
const THINK_TAGS = ['think', 'thinking', 'reasoning', 'analysis', 'reflection', 'thought']

function stripThinkBlocks(s: string): { text: string; removed: number } {
  let text = String(s || '')
  const before = text.length
  for (const tag of THINK_TAGS) {
    const closed = new RegExp('<' + tag + '>[\\s\\S]*?<\\/' + tag + '>', 'gi')
    text = text.replace(closed, '')
    // 未闭合（模型被 max_tokens 截断在推理段里）：丢掉从开标签到结尾
    const open = new RegExp('<' + tag + '>([\\s\\S]*)$', 'i')
    text = text.replace(open, '')
  }
  return { text, removed: before - text.length }
}

function stripCodeFences(s: string): { text: string; removed: number } {
  let text = String(s || '')
  const before = text.length
  text = text.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
  text = text.replace(/```/g, '')
  return { text, removed: before - text.length }
}

/** 推理前言：模型把思考过程写进 content/reasoning 的开头 */
const REASONING_PREAMBLE = /^\s*(?:Thinking Process|Thinking|Reasoning|Thought Process|Here(?:'| i)s my thought process|思考过程|推理过程|分析过程|我的思考|让我想想|首先，?我需要)[:：\s][\s\S]*?(?:\n\s*\n)/i

function stripReasoningPreamble(s: string): { text: string; removed: number } {
  const text0 = String(s || '')
  const before = text0.length
  let text = text0.replace(REASONING_PREAMBLE, '')
  return { text, removed: before - text.length }
}

/**
 * 🔥 2026-10-29 P0：构思稿剥离（智谱 glm 系正文步实测泄漏）
 *   实测 ch1 输出 2131 字，开头 11 段全是模型的构思稿：
 *     `1. 分析需求：* 角色：…` / `解决矛盾：…` / `*决定：*…` / `起草策略` /
 *     `感官与情绪检查` / `字数：945 字` …
 *   真正的正文从第 12 段「烛芯爆出灯花…」才开始。
 *   策略：仅当**第一段**就带构思特征时启用，向后跳过所有构思段，停在首个「像正文」的段落。
 *   宁可少切（不切）也不误伤：找不到合格正文段就原样返回。
 */
const PLAN_HEAD = /^(?:\d+\s*[.、]\s*)?(?:分析需求|需求分析|任务分析|问题分析|起草策略|写作策略|写作计划|构思|提纲|本场节拍|解决矛盾|感官与情绪检查|字数守恒|自查|结构设计|输出要求)/
/** 字段行：`基调/风格：` `字数：` `人物：` 等；允许 `A/B：` 复合标签 */
const PLAN_FIELD = /^(?:\*+\s*)?(?:角色|任务|场景|时间|人物|情节|基调|风格|结构|对话|动作|对抗|冲突|结果|字数|感官|情绪|关键动作|反应|设定|背景|要求|目标|语气|节奏|画面)(?:\s*[/／]\s*[\u4e00-\u9fa5]{2,6})?\s*[：:]/
const BULLET = /^[*\-·•]\s*/
const NUMLINE = /^\d+\s*[.、]\s*/

function looksPlanning(p: string): boolean {
  const t = String(p || '').trim()
  if (!t) return false
  if (PLAN_HEAD.test(t)) return true
  if (PLAN_FIELD.test(t)) return true
  if (BULLET.test(t)) return true
  if (NUMLINE.test(t)) return true
  // 强正文信号：带对话引号、或长段落（>=60 汉字）→ 不判构思（避免误伤"他说：…"式正文）
  if (/[“"「]/.test(t) && !PLAN_HEAD.test(t)) return false
  if (countChineseOrZero(t) >= 60) return false
  // 模型在复述提示词内容（"提示说…""人物档案…"）且整段无对话/引文
  if (/提示(?:说|中点|中明确|里)|节拍(?:说|表)|人物档案|时序铁律/.test(t)) return true
  return false
}

function stripPlanningBlock(s: string): { text: string; removed: number } {
  const text0 = String(s || '')
  const paras = text0.split(/\n+/)
  const first = paras.findIndex((p) => p.trim())
  if (first < 0) return { text: text0, removed: 0 }
  if (!looksPlanning(paras[first])) return { text: text0, removed: 0 } // 首段就是正文 → 不动
  let i = first
  for (; i < paras.length; i++) {
    const p = paras[i].trim()
    if (!p) continue
    if (looksPlanning(p)) continue
    // 「像正文」判据：非标记开头 + 汉字数 >= 20
    if (countChineseOrZero(p) >= 20) break
  }
  if (i >= paras.length) {
    // 🔥 2026-10-30：整篇都是构思稿（实测 ch4 1619 字全是「1.分析需求→2.解构场景→3.起草→4.撰写正文」复述提示词）。
    //   原逻辑「不敢切、原样返回」会让构思稿冒充正文通过清洗并被闸门当正文评估。
    //   现改为直接清空 → 下游汉字数不足触发重生成，而不是把废稿写库。
    return { text: '', removed: text0.length }
  }
  const out = paras.slice(i).join('\n\n').trim()
  const removed = text0.length - out.length
  return { text: out, removed: removed > 0 ? removed : 0 }
}

/** 章末/章首孤立节拍名（如单独一行「峰回路转。」或「“峰回路转。”」）——不是正文，清掉 */
const BEAT_TAIL = /(?:^|\n)[ \t]*[“"「']?[ \t]*(?:峰回路转|高潮迭起|高潮|爽点|打脸|碾压|逆转|收获|突破|震场|悬念|钩子|转折|伏笔)[。！？!?]?[ \t]*[”"」']?[ \t]*$/g

function stripBeatLabels(s: string): { text: string; removed: number } {
  const text0 = String(s || '')
  const before = text0.length
  const out = text0.replace(BEAT_TAIL, '').trim()
  return { text: out, removed: before - out.length }
}

/**
 * 🔥 2026-10-29 P0-2：括注批注剥离
 *   引擎节拍表里的批注会被模型原样写进正文：
 *     （开篇3行内切入冲突） /（首段冲突：短刀架颈+探子追查）/（主角博弈25%）
 *   规则：① 整段只由括注构成且含节拍/冲突/百分比等标记 → 整段删；
 *         ② 行内括注含 % / 首段 / 开篇 / 节拍 / 爽点 / 冲突 → 就地删。
 *   正常中文小说几乎不用（）做叙述，误伤面很小。
 */
const META_PAREN_MARK = /冲突|爽点|节拍|开篇|首段|博弈|转折|钩子|伏笔|铺垫|悬念|情绪值|%|字内|字以上|节奏/
const INLINE_PAREN = /[（(][^（()）\n]{0,40}(?:%|首段|开篇|节拍|爽点|冲突|博弈|钩子|伏笔)[^（()）\n]{0,40}[)）]/g

function stripMetaAnnotations(s: string): { text: string; removed: number } {
  const text0 = String(s || '')
  const before = text0.length
  const kept = text0.split(/\n+/).filter((p) => {
    const t = p.trim()
    if (!t) return false
    const onlyParen = /^[（(][\s\S]*[)）]$/.test(t)
    if (!onlyParen) return true
    // ① 含节拍/字数等标记 → 必删
    if (META_PAREN_MARK.test(t)) return false
    // ② 整段纯括注且很短（<60 字）→ 一律视为批注
    //    （实测泄漏形态：「（以下正文严格遵循用户提供的所有硬指标…已通过逐句自查…）」）
    //    正常小说不会用①个括注独占①整段；带对话引号则保留，防误伤。
    if (countChineseOrZero(t) < 60 && !/[“"「]/.test(t)) return false
    return true
  })
  let out = kept.join('\n\n').replace(INLINE_PAREN, '')
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  return { text: out, removed: Math.max(0, before - out.length) }
}

function pickMessage(data: any): any {
  if (!data || typeof data !== 'object') return null
  const ch = Array.isArray(data.choices) ? data.choices[0] : null
  if (!ch || typeof ch !== 'object') return null
  // 兼容流式（delta）与服务端聚合（message）
  return (ch.message && typeof ch.message === 'object') ? ch.message : (ch.delta && typeof ch.delta === 'object' ? ch.delta : null)
}

/**
 * 从一次 chat completion 响应里抽出行之有效的正文。
 * @param data 已 JSON.parse 的响应体（或任意对象；非法输入返回 source='none'）
 * @param opts.fallbackFromReasoning 默认 true —— 商汤正文落在 reasoning 字段，必须回退读取
 */
export function extractModelText(data: any, opts: { fallbackFromReasoning?: boolean } = {}): ModelTextResult {
  const allowReasoning = opts.fallbackFromReasoning !== false
  try {
    const msg = pickMessage(data)
    if (!msg) return { text: '', source: 'none', stripped: false, rawLen: 0, strippedLen: 0 }

    const content = typeof msg.content === 'string' ? msg.content : ''
    let raw = content
    let source: ModelTextSource = content.trim() ? 'content' : 'none'

    if (!raw.trim() && allowReasoning) {
      const r1 = typeof msg.reasoning === 'string' ? msg.reasoning : ''
      const r2 = typeof msg.reasoning_content === 'string' ? msg.reasoning_content : ''
      if (r1.trim()) { raw = r1; source = 'reasoning' }
      else if (r2.trim()) { raw = r2; source = 'reasoning_content' }
    }
    if (!raw.trim()) return { text: '', source: 'none', stripped: false, rawLen: 0, strippedLen: 0 }

    const rawLen = raw.length
    let removed = 0
    let out = raw
    const a = stripThinkBlocks(out); out = a.text; removed += a.removed
    const b = stripReasoningPreamble(out); out = b.text; removed += b.removed
    const c = stripCodeFences(out); out = c.text; removed += c.removed
    // 🔥 2026-10-29：构思稿与节拍名（glm 正文步泄漏物）
    const d = stripPlanningBlock(out); out = d.text; removed += d.removed
    const e = stripBeatLabels(out); out = e.text; removed += e.removed
    const f = stripMetaAnnotations(out); out = f.text; removed += f.removed
    out = out.replace(/^\s+/, '').replace(/\s+$/, '')
    // 中文正文不该以 ASCII 引号开头（模型半角/全角混用残渣，如 `"朱由榔猛地睁眼…`）
    out = out.replace(/^["']+\s*/, '')

    return {
      text: out,
      source,
      stripped: removed > 0,
      rawLen,
      strippedLen: removed,
    }
  } catch (_e) {
    return { text: '', source: 'none', stripped: false, rawLen: 0, strippedLen: 0 }
  }
}

/** 便捷版：只要正文 */
export function extractModelTextOnly(data: any): string {
  return extractModelText(data).text
}

/** 参考指标：CJK 字符数（**不是**字数口径；字数口径见 quality-gate.countWordUnits） */
export function countChineseOrZero(s: string): number {
  const m = String(s || '').match(/[\u4e00-\u9fa5]/g)
  return m ? m.length : 0
}

/** 生成一个简短诊断串（日志用） */
export function describeModelText(r: ModelTextResult): string {
  return 'source=' + r.source + ' cjk=' + countChineseOrZero(r.text) +
    ' rawLen=' + r.rawLen + ' stripped=' + (r.stripped ? r.strippedLen : 0)
}