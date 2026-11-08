/**
 * 🔥 精写引擎 · 主流程（engine）
 *
 * 一章正文 = 6-10 次大模型调用 + 3-5 道确定性闸门：
 *   ① 节拍表（1 次）：把大纲拆成 4-6 个"同一时空的具体事件"，给出字数配额
 *   ② 分场景写作（3-5 次）：每次只写 700-1100 汉字，带上"上一场结尾原文 + 已用句式/台词"，
 *      从机制上杜绝单次长文本生成的复读坍塌
 *   ③ 装配（0 次）：标点归一 + 重叠去复读 + 去 AI 味清理
 *   ④ 质检（0 次）：字数/爽点/套话/复读/跨章重复/AI 率（复用 detection.runAiDetection）
 *   ⑤ 定点修复（0-3 次）：把质检结论翻译成修复指令喂回模型，只修不重写；版本择优保留
 *   ⑥ 补字（0-2 次）：字数不足时续写，并禁止复用已有句子
 *
 * 任何一步失败都降级（degraded）而不是整章失败；全部失败才交由上层回退旧流程。
 */

import { callLLMWithFallback, extractJSONFromText, sanitizeJSONControlChars } from '../llm'
import * as fsEngine from 'fs'
import { noteProviderFailure, noteProviderSuccess } from '../model-router'
import { deAiCleanup } from '../deAiCleanup'
import { runChapterQualityGate, cleanChapterText, summarizeQGate } from '../oh-story/quality-gate'
// 🔥 2026-10-25 T2 修复存量运行时 bug：computeHistoryPhrases 定义在 prompts.ts 却未导出/未导入，
//   导致 prevPhrases 为空时抛 ReferenceError → 引擎异常回退旧流程（跨章公式句黑名单静默失效）
import { computeHistoryPhrases } from './prompts'
import { auditChapter, buildRepairInstruction } from './audit'
import { judgeChapterAgainstBenchmark } from './judge'
import {
  buildBeatSheetPrompt,
  buildScenePrompt,
  buildExtendPrompt,
  buildRepairPrompt,
  titleLineOf,
} from './prompts'
import { resolveLedgerKey, ledgerContext, recordChapter, buildLedgerChapter, loadLedger } from './ledger'
import {
  countChinese,
  countWordUnits,
  normalizePunctuation,
  overlapJoin,
  splitParagraphs,
  splitSentences,
  tailOf,
  clampText,
  hasEndingHook,
  hashString,
} from './text-utils'
import type { AuditResult, Beat, BeatSheet, ChapterEngineInput, EngineOutput, EngineReport, PlatformStandard } from './types'
import { runZhuqueProxy } from '../zhuque-proxy'
import { findOhStoryPatterns, ohIssuesByPara, ohSummary } from '../oh-story/ai-patterns'
import { deCliche, mergeRepeatedOpeners, phaseFix, reflowFragmentedLines } from '../de-cliche'

/** 总时间预算（含全部调用）：超时后只做保底收尾，绝不把请求拖死 */
// 🔥 2026-10-21：20min → 28min。实测收尾的「疑似段落定向重写」是达标的决定性阶段，
//   20min 预算下常被 429 重试吃掉，导致闭环来不及跑（降级稿疑似占比 30%+）。
const TOTAL_BUDGET_MS = 28 * 60 * 1000

/**
 * 🔥 2026-10-31 番茄官方《作品签约标准说明》+《加强低质内容治理公告》硬指标
 * ------------------------------------------------------------
 * 官方四类低质红线对应到本引擎的质检判据：
 *   ① 空洞水文   → 字数 2000-3000（去空白含标点字符数）
 *   ② 格式混乱   → 单段 ≤60 汉字（手机屏 3-4 行）
 *   ③ 代入感不足 → 对话占比 ≥25%
 *   ④ AI 粗制滥造 → 既有 AI 率闸门 + 套话 + 复读 + 污染检测
 *
 * ⚠️ 铁律：这三个常量必须与 platinum-gate.ts 的 PLATINUM_CHAPTER_STANDARD 同口径，
 *   否则会出现「引擎自认合格、出口门禁判不合格」的双口径矛盾（2026-10-31 前正是如此）。
 */
const OFFICIAL_MAX_WORDS = 3000
const OFFICIAL_MIN_DIALOGUE_RATIO = 25
const OFFICIAL_MAX_PARAGRAPH_CHARS = 60

/**
 * 🔥 2026-10-21 复读段落清除
 * ------------------------------------------------------------
 * 免费档模型（智谱/硅基 7B-9B）在「整章改写 / 续写补字」这类长输入任务上，
 * 极易陷入复读循环：同一段对话在章内重复 5~10 次。
 * 实测后果：72 段里只有 36 段唯一 → 自建朱雀口径「词汇分布」直接归零 →
 *           疑似AI 从 5% 飙到 26%~48%，且站内 8 维仍显示"合格"（站内算法查不出复读）。
 *
 * 判定规则（确定性，不依赖模型）：
 *   ① 段落归一化（去空白与标点）后完全重复 → 复读
 *   ② 与前文某段开头前 10 字相同（"朱由榔目光一凝，开口道" vs "…低声道"） → 复读
 * 只保留首次出现。
 */
export function dedupeRepeatedParagraphs(text: string): { text: string; removed: number } {
  const paras = String(text || '').split(/\n+/)
  const seenNorm = new Set<string>()
  const seenDialogue = new Set<string>()
  const kept: string[] = []
  const keptMeta: Array<{ head: string; len: number; grams: Set<string> | null }> = []
  let removed = 0
  const gramsOf = (s: string): Set<string> => {
    const g = new Set<string>()
    for (let i = 0; i + 6 <= s.length; i++) g.add(s.slice(i, i + 6))
    return g
  }
  const dialoguesOf = (s: string): string[] => {
    const out: string[] = []
    const re = /[“"]([^”"]{4,})[”"]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(s))) {
      const d = m[1].replace(/[^\u4e00-\u9fa5]/g, '')
      if (d.length >= 4) out.push(d)
    }
    return out
  }
  for (const raw of paras) {
    const p = String(raw || '').trim()
    if (!p) { kept.push(String(raw)); continue }
    if (p.length < 12) { kept.push(p); continue }
    const norm = p.replace(/[\s，。！？；：、“”"'‘’（）()《》…—\-·]/g, '')
    const head = norm.slice(0, 10)
    // 🔥 2026-10-21 判定收紧：只有【近乎同段】才算复读。
    //   原规则"开头10字相同即判复读"会误删正文里正当的同款起句（实测一章误删 104 段，
    //   正文从 2400 字塌到 1374 字，反而逼引擎去注水 → 更像 AI）。
    //   现在要求：归一化全文完全相同，或（首10字相同且长度差 ≤25%）。
    const exact = seenNorm.has(norm)
    // 🔥 2026-10-22 三种"改写式复读"补判（实测：同一段戏被换个说法重写一遍，头10字不同却能骗过旧规则）
    //   ① 6-gram 容器重合 ≥62%（≥40 字的长段）
    //   ② 整段台词重复：≥2 句台词已出现过，或有 1 句 ≥12 字的台词已出现过
    //   ③ 首10字+长度近似（旧规则保留）
    const grams = norm.length >= 50 ? gramsOf(norm) : null
    let dlgDup = 0
    let dlgMax = 0
    for (const d of dialoguesOf(p)) {
      if (seenDialogue.has(d)) { dlgDup++; if (d.length > dlgMax) dlgMax = d.length }
    }
    const near = keptMeta.some(m => {
      if (m.head === head && Math.abs(m.len - norm.length) <= Math.max(12, norm.length * 0.25)) return true
      if (grams && m.grams) {
        const small = Math.min(grams.size, m.grams.size)
        if (small >= 35) {
          let hit = 0
          for (const g of grams) if (m.grams.has(g)) hit++
          // 🔥 2026-10-22 阈值 0.62→0.80：实测 0.62 会把"同一场景里换了主语/动作的正常段落"判成复读，
          //   单章误删 41 段≈1300 字，逼出补字+整章重跑（ch5/ch6 反复失败的主因）。
          if (hit / small >= 0.80) return true
        }
      }
      return false
    })
    // 台词重复：3 句以上重复，或有 1 句 ≥16 字的台词原样重复，才判整段复读
    const dlgRep = dlgDup >= 3 || (dlgDup >= 1 && dlgMax >= 16)
    if (exact || near || dlgRep) { removed++; continue }
    seenNorm.add(norm)
    for (const d of dialoguesOf(p)) seenDialogue.add(d)
    keptMeta.push({ head, len: norm.length, grams })
    kept.push(p)
  }
  return { text: kept.join('\n'), removed }
}

/** 复读稿检测：重复段数达到阈值即判定为退化稿（不可采纳） */
export function countRepeatedParagraphs(text: string): number {
  return dedupeRepeatedParagraphs(text).removed
}

/**
 * 🔥 2026-10-22 追加段质检（补字 / 长度兜底 / 章末钩子共用）
 *   在"凑字数"的压力下，模型会写出这些废段：
 *   ① 诗化碎片：一句话拆成好几行、行尾没有标点（实测尾段整片崩成意象堆叠）
 *   ② 字数标注：（98）（87）这种自我计数漏进正文
 *   ③ 时代错位物：干辣椒 / 龙袍 / 雪茄 / 咖啡
 *   ④ 句子过碎：六七十字塞进六七行
 *   结论：宁可这一章短一点、没钩子，也绝不许把废段拼进正文。
 */
export function looksCorruptSegment(t: string): string {
  const s = String(t || '')
  if (!s.trim()) return '空段'
  if (/[（(]\s*\d{1,4}\s*[）)]/.test(s)) return '含字数标注'
  const banned = ['辣椒', '咖啡', '雪茄', '手电', '电话', '手机', '汽车', '香烟', '巧克力', '龙袍', '龙椅', '保险', '公司', '警察', '总统', '元首']
  for (const b of banned) if (s.includes(b)) return '时代错位(' + b + ')'
  const lines = s.split(/\n+/).map(x => x.trim()).filter(Boolean)
  if (lines.length >= 3) {
    const badEnd = lines.filter(l => !/[。！？!?…"”'’）)」』】]$/.test(l)).length
    if (badEnd / lines.length > 0.25) return '分行碎片(' + badEnd + '/' + lines.length + ')'
    const avgLine = countChinese(s) / lines.length
    if (lines.length >= 5 && avgLine < 12) return '分行过碎(均' + avgLine.toFixed(0) + '字)'
  }
  const sents = s.split(/(?<=[。！？!?…])/).map(x => x.trim()).filter(Boolean)
  if (sents.length >= 3) {
    const noEnd = sents.filter(x => !/[。！？!?…]$/.test(x)).length
    if (noEnd / sents.length > 0.15) return '无标点碎片(' + noEnd + '/' + sents.length + ')'
  }
  return ''
}


function nowMs(): number {
  return Date.now()
}

function summarizeAudit(round: number, a: AuditResult): EngineReport['rounds'][number] {
  return {
    round,
    chineseChars: a.metrics.chineseChars,
    shuangCount: a.metrics.shuangCount,
    dialogueRatio: a.metrics.dialogueRatio,
    aiRate: a.aiRate,
    repeatedPhrases: a.repeatedPhrases.length,
    crossChapterOverlaps: a.crossChapterOverlaps.length,
    fails: a.fails.slice(0, 6),
  }
}

/** 版本择优：优先「字数在 [0.9, 1.05] 目标窗口内」（双侧带），再看未通过项数，最后看与目标的字数差 */
function betterVersion(a: { text: string; audit: AuditResult }, b: { text: string; audit: AuditResult }, targetWords?: number): { text: string; audit: AuditResult } {
  const t = targetWords && targetWords > 0 ? targetWords : 0
  if (t > 0) {
    const inWin = (n: number) => n >= Math.round(t * 0.9) && n <= Math.round(t * 1.05)
    const aw = inWin(countWordUnits(a.text))
    const bw = inWin(countWordUnits(b.text))
    if (aw !== bw) return aw ? a : b
  }
  const af = a.audit.fails.length
  const bf = b.audit.fails.length
  if (af !== bf) return af < bf ? a : b
  if (t > 0) {
    const ad = Math.abs(countWordUnits(a.text) - t)
    const bd = Math.abs(countWordUnits(b.text) - t)
    if (ad !== bd) return ad < bd ? a : b
  }
  if (countWordUnits(a.text) !== countWordUnits(b.text)) return countWordUnits(a.text) > countWordUnits(b.text) ? a : b
  return a.audit.aiRate <= b.audit.aiRate ? a : b
}

/** 已写正文里抽样"句子开头"，用于防复读 */
function collectOpenings(text: string, limit = 24): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of splitSentences(text)) {
    const clean = s.replace(/^[“”\s]+/, '')
    if (clean.length < 8) continue
    const key = clean.slice(0, 6)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key + '…')
    if (out.length >= limit) break
  }
  return out.slice(-limit)
}

/** 已写正文里抽样台词，用于防复读 */
function collectDialogueLines(text: string, limit = 12): string[] {
  const lines = text.match(/“[^”]{4,28}”/g) || []
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const l = lines[i]
    if (seen.has(l)) continue
    seen.add(l)
    out.push(l)
  }
  return out.reverse()
}

function sampleSettingBrief(contextParts: string[], maxChars = 6000): string {
  const parts = (contextParts || []).filter(Boolean)
  if (!parts.length) return '（无额外设定，请严格依据本章核心剧情与人物名写作）'
  let acc = ''
  for (const p of parts) {
    const next = acc ? acc + '\n' + p : p
    if (next.length > maxChars) {
      acc += '\n（设定过长，其余已在系统中生效，写作时保持人物与世界观一致）'
      break
    }
    acc = next
  }
  return acc
}

/** 🔥 2026-10-22：闭合被 maxTokens 截断的 JSON（对小模型输出最后一点仁慈） */
function closeOpenBrackets(s: string): string {
  let inStr = false
  let esc = false
  const stack: string[] = []
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' || ch === ']') stack.pop()
  }
  let out = inStr ? s.replace(/"[^"]*$/, '') : s
  out = out.replace(/,\s*$/, '')
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']'
  return out
}

/** 容错 JSON 解析：尾逗号 / 中文引号 / 代码块残留（小模型输出 JSON 经常带这些毛病） */
function tryParseLooseJSON(s: string): any {
  const attempts: string[] = []
  attempts.push(s)
  attempts.push(s.replace(/,\s*([}\]])/g, '$1'))
  attempts.push(s.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1'))
  attempts.push(s.replace(/[“”]/g, '「').replace(/,\s*([}\]])/g, '$1'))
  for (const a of attempts) {
    try { const v = JSON.parse(a); if (v && typeof v === 'object') return v } catch (_e) { /* next */ }
  }
  return null
}

/** 解析节拍表 JSON（容错：解析失败/节拍过少时回退到合成四段节拍） */
function parseBeatSheet(raw: string, input: ChapterEngineInput): { sheet: BeatSheet; ok: boolean } {
  try {
    const jsonText = extractJSONFromText(raw)
    let parsed = tryParseLooseJSON(jsonText)
    // 🔥 2026-10-22：修复链 ① 控制字符 → ② 截断闭合（逐级回退到最近一个能闭合的对象边界）
    if (!parsed) parsed = tryParseLooseJSON(sanitizeJSONControlChars(jsonText))
    if (!parsed) {
      const cutBase = sanitizeJSONControlChars(jsonText)
      for (let i = cutBase.lastIndexOf('}'); i > 0; i = cutBase.lastIndexOf('}', i - 1)) {
        const cand = closeOpenBrackets(cutBase.slice(0, i + 1))
        const p2 = tryParseLooseJSON(cand)
        if (p2 && Array.isArray(p2.beats) && p2.beats.length >= 3) { parsed = p2; break }
      }
    }
    let beats: Beat[] = Array.isArray(parsed && parsed.beats) ? parsed.beats : []
    beats = beats.filter((b: any) => b && typeof b === 'object').map((b: any, i: number) => ({
      index: i + 1,
      title: String(b.title || ('第' + (i + 1) + '场')),
      time: String(b.time || ''),
      place: String(b.place || ''),
      cast: Array.isArray(b.cast) ? b.cast.map((x: any) => String(x)).filter(Boolean).slice(0, 8) : [],
      goal: String(b.goal || ''),
      conflict: String(b.conflict || ''),
      turn: String(b.turn || ''),
      shuang: String(b.shuang || ''),
      hook: String(b.hook || ''),
      words: typeof b.words === 'number' && b.words > 100 ? Math.round(b.words) : 0,
    }))
    if (beats.length < 2) return { sheet: syntheticBeats(input), ok: false }
    if (beats.length > 6) beats = beats.slice(0, 6)
    // 字数配额归一（按目标字数分配；模型给的配额只在合理区间内采信）
    const given = beats.reduce((a, b) => a + (b.words || 0), 0)
    if (given <= 0 || Math.abs(given - input.targetWords) > input.targetWords * 0.5) {
      const per = Math.round(input.targetWords / beats.length)
      beats = beats.map((b) => ({ ...b, words: per }))
    }
    return {
      sheet: {
        premise: String(parsed.premise || input.corePlot),
        endHook: String(parsed.endHook || ''),
        beats,
      },
      ok: true,
    }
  } catch (_e) {
    return { sheet: syntheticBeats(input), ok: false }
  }
}

/** 🔥 2026-10-19：人工剧情施工蓝图 → 节拍表（跳过节拍表 LLM，剧情 100% 可控） */
function blueprintToSheet(input: ChapterEngineInput): BeatSheet | null {
  const bp = input.blueprint
  if (!bp || !Array.isArray(bp.beats) || bp.beats.length < 2) return null
  let beats: Beat[] = bp.beats.slice(0, 6).map((b: any, i: number) => ({
    index: i + 1,
    title: String(b.title || ('第' + (i + 1) + '场')),
    time: String(b.time || ''),
    place: String(b.place || ''),
    cast: Array.isArray(b.cast) ? b.cast.map((x: any) => String(x)).filter(Boolean).slice(0, 8) : [],
    goal: String(b.goal || ''),
    conflict: String(b.conflict || ''),
    turn: String(b.turn || ''),
    shuang: String(b.shuang || ''),
    hook: String(b.hook || ''),
    words: typeof b.words === 'number' && b.words > 100 ? Math.round(b.words) : 0,
    mustWrite: Array.isArray(b.mustWrite) ? b.mustWrite.map((x: any) => String(x)).filter(Boolean).slice(0, 8) : [],
    dialogueCues: Array.isArray(b.dialogueCues) ? b.dialogueCues.map((x: any) => String(x)).filter(Boolean).slice(0, 6) : [],
    avoid: Array.isArray(b.avoid) ? b.avoid.map((x: any) => String(x)).filter(Boolean).slice(0, 6) : [],
  }))
  const given = beats.reduce((a, b) => a + (b.words || 0), 0)
  if (given <= 0 || Math.abs(given - input.targetWords) > input.targetWords * 0.5) {
    const per = Math.round(input.targetWords / beats.length)
    beats = beats.map((b) => ({ ...b, words: per }))
  }
  return { premise: String(bp.premise || input.corePlot), endHook: String(bp.endHook || ''), beats }
}

/** 节拍表解析失败时的合成节拍（无需模型）：保证「分场景写作」这一质量机制不失效 */
function syntheticBeats(input: ChapterEngineInput): BeatSheet {
  // 🔥 2026-10-22：4 场 → 5 场。实测 4 场时单场要 650 字、模型只给 500，
  //   只能靠"长度兜底"硬补，补出来的尾段容易跑偏（刺客/雪茄/无标点碎片）。
  //   改成 5 场 × 520 字，让总量自然落在 2500-2700，尽量不依赖补写。
  const beatCount = 5
  const per = Math.round(input.targetWords / beatCount)
  const arcs = [
    { title: '冲突切入', goal: '直接入戏：把本场的危机/挑衅摊到明面上', conflict: '对抗方施压，主角处境被动', turn: '压力升级，读者先替主角憋一口气', shuang: '', hook: '危机压顶，主角却先按兵不动' },
    { title: '试探博弈', goal: '主角冷静观察、算清利害，暗中布一步棋', conflict: '对手步步紧逼，主角需在不暴露底牌的前提下应对', turn: '主角露出一手，局势出现缝隙', shuang: '逆转', hook: '对手发现事情不对，但已经晚了' },
    { title: '翻盘落子', goal: '把暗棋翻到明处：证据/人手/时间差落地', conflict: '对手抢先动手，主角必须当场接住', turn: '谁也没想到主角早已布好，局面倒转', shuang: '逆转', hook: '对手脸色变了，开始找退路' },
    { title: '高潮打脸', goal: '主角出手，正面碾压对面', conflict: '对手孤注一掷、全力反扑', turn: '主角底牌落地，当场打脸与碾压', shuang: '打脸', hook: '全场震住，有人当场改口' },
    { title: '收益伏笔', goal: '清点这一场的收获，并把下一章的钩子埋下', conflict: '收益兑现过程中的暗流（谁在觊觎、谁在告密）', turn: '主角拿到实质好处（兵符/兵马/粮草/名册），同时发现更大的对手', shuang: '收获', hook: '章末留悬念：暗处的人终于动手了' },
  ]
  return {
    premise: input.corePlot,
    endHook: '',
    beats: arcs.map((a, i) => ({
      index: i + 1,
      title: a.title,
      time: '',
      place: '',
      cast: [],
      goal: a.goal + '；本章核心剧情：' + input.corePlot,
      conflict: a.conflict,
      turn: a.turn,
      shuang: a.shuang,
      hook: a.hook,
      words: per,
    })),
  }
}

// ============================================================
// 🔥 终段硬修复（2026-10-18）：白金闸门两项「程序可判定」的高频失败改由代码保证——
//   ① 段落超长（>120 汉字，手机端白金标准）→ 在句界/逗号界自动拆段
//   ② 软循环/填充语重复（如「心中暗自」×19）→ 第 3 次起轮换同义变体
//   纯文本变换，不调模型，不引入新风险；失败仅记入 repairs 不阻塞
// ============================================================
const FILLER_VARIANTS: Record<string, string[]> = {
  '眼中闪过一丝': ['眼底掠过一点', '眼神里透出', '眉梢微动'],
  '眼底深处': ['眼底', '眼神里'],
  '深吸一口气': ['吐出一口浊气', '把气压回胸口', '定了定神'],
  '浑身一震': ['肩头一僵', '背脊绷紧', '指尖扣紧了衣袖'],
  '心中一惊': ['心里咯噔一下', '心头一沉'],
  '如遭雷击': ['僵在原地', '一时没说出话'],
  '目光如炬': ['目光沉定', '眼神锐利'],
  '脸色一变': ['神色微动', '神情一紧'],
  '心中暗道': ['心底琢磨', '心里嘀咕', '暗自盘算'],
  '心中暗自': ['心中暗暗', '心底暗道', '暗自思忖', '心里盘算'],
  '心中一沉': ['心里一沉', '心底一凉', '心里咯噔一下'],
  '眼中闪过': ['眼底掠过', '眸光一转', '眼神里透出'],
  '微微一笑': ['嘴角一勾', '轻笑了一声'],
  '缓缓开口': ['沉声道', '慢条斯理地说', '开口道'],
  '下意识地': ['本能地', '情不自禁地'],
  '一丝': ['', '些许'],
  '轻轻': ['悄然', '慢慢'],
}

function splitLongParagraph(text: string): { text: string; splitCount: number } {
  // 🔥 2026-10-31 对齐番茄官方：单段上限 120 → 60（手机屏 3-4 行硬约束，属「格式混乱」）。
  //   纯机械切分，零 LLM 调用、零剧情改动——只按句界/逗号界断开，不增删任何字词。
  //   口径：字符数（含标点），与 longestParagraphInfo / 官方体检器一致（不用汉字数）。
  const MAX = OFFICIAL_MAX_PARAGRAPH_CHARS
  // 段落长度（字符数，含标点）
  const plen = (s: string) => (s || '').trim().length
  let splitCount = 0
  const parts: string[] = []
  for (const para of text.split(/\n+/)) {
    if (!para.trim()) continue
    const pt = para.trim()
    // 列表项/标题行不是正文段落，跳过（与官方体检器 max_para_len 同口径）
    if (pt.charAt(0) === '#' || pt.charAt(0) === '-' || pt.charAt(0) === '*') { parts.push(para); continue }
    if (plen(para) <= MAX) { parts.push(para); continue }
    // 按句界切段，重新打包成 ≤MAX 的段
    const segs = para.replace(/\n/g, '').split(/(?<=[。！？…”"])/)
    const buf: string[] = []
    let cur = ''
    const flush = () => { if (cur) { buf.push(cur); cur = '' } }
    for (const seg of segs) {
      if (!seg) continue
      if (plen(seg) > MAX) {
        // 单句也超长：按逗号再切
        flush()
        let sub = ''
        for (const piece of seg.split(/(?<=[，；、：])/)) {
          if (plen(sub) + plen(piece) > MAX && sub) { buf.push(sub); splitCount++; sub = piece }
          else sub += piece
        }
        if (sub) cur = sub
        continue
      }
      if (plen(cur) + plen(seg) > MAX) { flush(); splitCount++; cur = seg }
      else cur += seg
    }
    flush()
    parts.push(...buf)
  }
  return { text: parts.join('\n\n'), splitCount }
}

function diversifyFillers(text: string): { text: string; replaced: number } {
  let replaced = 0
  let out = text
  for (const [phrase, variants] of Object.entries(FILLER_VARIANTS)) {
    // 统计出现次数；重复 ≥2 次即干预（同一口癖/填充语在章内最多出现一次）
    const count = out.split(phrase).length - 1
    if (count < 2) continue
    let seen = 0
    let result = ''
    let rest = out
    while (true) {
      const idx = rest.indexOf(phrase)
      if (idx === -1) { result += rest; break }
      seen++
      if (seen <= 1) { result += rest.slice(0, idx + phrase.length); rest = rest.slice(idx + phrase.length); continue }
      result += rest.slice(0, idx) + variants[seen % variants.length]
      rest = rest.slice(idx + phrase.length)
      replaced++
    }
    out = result
  }
  return { text: out, replaced }
}

// 🔥 2026-10-19：重复引号句/叙述句去重——同一句话出现≥3次时保留前两次，删除第3次及以后（上限8处）
//   只处理「完整引号句」或「不含引号的完整句」，避免破坏引号配对与句意
function dedupeRepeatedSentences(text: string): { text: string; removed: number } {
  const norm = (s: string) => s.replace(/[^\u4e00-\u9fa5]/g, '')
  const dels: Array<[number, number]> = []
  // ① 完整引号句（可带前置“某某道：”归属；删除时整句连归属一起删，避免悬空冒号）
  const quoteRe = /([^\n。！？…]{0,24}[：:])?\s*“([^”\n]{8,120})”/g
  const qCounts = new Map<string, number>()
  let m: RegExpExecArray | null
  while ((m = quoteRe.exec(text))) {
    const k = norm(m[2])
    if (k.length >= 8) qCounts.set(k, (qCounts.get(k) || 0) + 1)
  }
  quoteRe.lastIndex = 0
  const qSeen = new Map<string, number>()
  while ((m = quoteRe.exec(text))) {
    const k = norm(m[2])
    if (k.length < 8 || (qCounts.get(k) || 0) < 3) continue
    const c = (qSeen.get(k) || 0) + 1
    qSeen.set(k, c)
    if (c <= 2 || dels.length >= 6) continue
    let end = m.index + m[0].length
    while (end < text.length && /[，。！？…\s]/.test(text[end])) end++
    dels.push([m.index, end])
  }
  // ② 纯叙述句（不含引号）：完全相同的句子≥3次 → 同样保留前两次
  const sentRe = /[^。！？…“”\n]{10,80}[。！？…]/g
  const sCounts = new Map<string, number>()
  while ((m = sentRe.exec(text))) {
    const k = norm(m[0])
    if (k.length >= 10) sCounts.set(k, (sCounts.get(k) || 0) + 1)
  }
  sentRe.lastIndex = 0
  const sSeen = new Map<string, number>()
  while ((m = sentRe.exec(text))) {
    const k = norm(m[0])
    if (k.length < 10 || (sCounts.get(k) || 0) < 3) continue
    const c = (sSeen.get(k) || 0) + 1
    sSeen.set(k, c)
    if (c <= 2 || dels.length >= 8) continue
    dels.push([m.index, m.index + m[0].length])
  }
  if (!dels.length) return { text, removed: 0 }
  dels.sort((a, b) => a[0] - b[0])
  let out = ''
  let pos = 0
  for (const [s, e] of dels) {
    if (s < pos) continue
    out += text.slice(pos, s)
    pos = e
  }
  out += text.slice(pos)
  out = out.replace(/\n{3,}/g, '\n\n').replace(/^[，、；：。]+/, '').replace(/[，、；]{2,}/g, '，').trim()
  return { text: out, removed: dels.length }
}

// 🔥 v3+：重复片段修剪——同一 12 字以上片段出现≥3次且每次所在整句几乎就是这句复读时，删除第3次起的整句
function trimRepeatedSpans(text: string): { text: string; removed: number } {
  const norm = (s: string) => s.replace(/\s/g, '')
  const clean = norm(text)
  if (clean.length < 36) return { text, removed: 0 }
  // ① 建索引映射（原文位置 ←→ 去空白位置）
  const map: number[] = []
  let normText = ''
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) { normText += text[i]; map.push(i) }
  }
  // ② 12 字滑窗统计（含标点，标点也是复读特征；但候选不得含引号，避免破坏引号配对）
  const seen = new Map<string, number>()
  for (let i = 0; i + 12 <= normText.length; i++) {
    const g = normText.slice(i, i + 12)
    if (/^[，。、；：！？…]+$/.test(g)) continue
    seen.set(g, (seen.get(g) || 0) + 1)
  }
  const cands = Array.from(seen.entries()).filter(([p, c]) => c >= 3 && !/[“”]/.test(p)).map(([p]) => p)
  if (!cands.length) return { text, removed: 0 }
  cands.sort((a, b) => b.length - a.length || a.localeCompare(b))
  const picked: string[] = []
  for (const p of cands) {
    if (picked.some((q) => q.indexOf(p) >= 0 || p.indexOf(q) >= 0)) continue
    picked.push(p)
    if (picked.length >= 4) break
  }
  // ③ 每个候选保留前两次出现，第 3 次起删除其「所在整句」（限缩不越 12+60 字，防止误删有效信息）
  const dels: Array<[number, number]> = []
  for (const p of picked) {
    let from = 0
    let n = 0
    while (n < 8) {
      const idx = normText.indexOf(p, from)
      if (idx < 0) break
      from = idx + 1
      n++
      if (n <= 2) continue
      let s0 = idx
      while (s0 > 0 && !/[。！？…\n]/.test(normText[s0 - 1])) s0--
      let e0 = idx + p.length
      while (e0 < normText.length && !/[。！？…\n]/.test(normText[e0])) e0++
      if (e0 < normText.length) e0++
      if (e0 - s0 > p.length + 60) continue
      const oS = map[s0]
      const oE = map[Math.min(e0, map.length) - 1] + 1
      if (oS === undefined || oE <= oS) continue
      const slice = text.slice(oS, oE)
      const q1 = (slice.match(/“/g) || []).length
      const q2 = (slice.match(/”/g) || []).length
      if (q1 !== q2) continue
      if (dels.some(([a, b]) => oS < b && oE > a)) continue
      dels.push([oS, oE])
      if (dels.length >= 6) break
    }
    if (dels.length >= 6) break
  }
  if (!dels.length) return { text, removed: 0 }
  dels.sort((a, b) => a[0] - b[0])
  let out = ''
  let pos = 0
  for (const [s, e] of dels) { out += text.slice(pos, s); pos = e }
  out += text.slice(pos)
  out = out.replace(/[，、；]{2,}/g, '，').replace(/，。/g, '。').replace(/。，/g, '。').replace(/\n[，。、；：]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text: out, removed: dels.length }
}

// 🔥 2026-10-19：口癖轮换——「脸色凝重，沉声道」这类标签句重复≥3次时，后两次起换说法
function diversifyTics(text: string): { text: string; replaced: number } {
  let replaced = 0
  let out = text
  const rules: Array<{ re: RegExp; alts: string[] }> = [
    { re: /脸色凝重，沉声道/g, alts: ['面沉如水，缓缓道', '神色一凛，开口道', '眉心微蹙，低声道'] },
    { re: /脸色凝重/g, alts: ['面沉如水', '神色一凛', '眉眼沉了沉'] },
    { re: /沉声道/g, alts: ['缓缓道', '开口道', '低声道'] },
  ]
  for (const r of rules) {
    let n = 0
    out = out.replace(r.re, (match) => {
      n++
      if (n <= 2) return match
      replaced++
      return r.alts[n % r.alts.length]
    })
  }
  return { text: out, replaced }
}

// 🔥 2026-10-18：生成指令元数据泄漏剔除——「（小钩子2）」「（对话占比25%）」「压抑→博弈→打脸」这类
//   写作指令被模型原样写进正文；纯文本扫描剔除，绝不误伤普通括号插叙（需命中写作元词才删）
const META_ANNOT_RE = /[（(][^（）()]{0,30}?(小?钩子|对话占比|金手指|悬念停顿|悬念\s*[钩点]|场景转换|视觉化|细节密度|爽点\s*(标准|节拍)|埋线|潜台词|动作戏|情绪曲线|信息密度|写作说明|节拍表|强刺激)[^（）()]{0,30}[）)]/g

function stripMetaAnnotations(text: string): { text: string; removed: number } {
  let removed = 0
  let out = text.replace(META_ANNOT_RE, () => { removed++; return '' })
  // 整行级剔除：箭头步骤句 / 要求复述句（正则本身限定只有含 → 的行会被命中）
  out = out.replace(/^[^\n]*→[^\n]*$/gm, () => { removed++; return '' })
  out = out.replace(/^[^\n]*(每\s*(300|三百)\s*字|对话占比\s*\d+%|段落\s*≤\s*\d+\s*行)[^\n]*$/gm, () => { removed++; return '' })
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  return { text: out, removed }
}

// 🔥 2026-10-19：复读环压扁——弱模型退化成「同一句对话/动作连播」时确定性去重（如 朱由榔目光如炬×N）
function collapseRepeatLoops(text: string): { text: string; collapsed: number } {
  const norm = (s: string) => s.replace(/[\s，。！？“”‘’"']/g, '')
  const lines = text.split('\n')
  const out: string[] = []
  let collapsed = 0
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i]
    const c = norm(cur)
    // 与前一行（或前两行）核心内容相同 → 丢弃本行
    if (c.length >= 8) {
      const prev1 = out.length >= 1 ? norm(out[out.length - 1]) : ''
      const prev2 = out.length >= 2 ? norm(out[out.length - 2]) : ''
      const nearDup = c.length >= 12 && prev1.length >= 12 && Math.abs(c.length - prev1.length) <= 6 && (prev1.includes(c) || c.includes(prev1))
      if (c === prev1 || c === prev2 || nearDup) {
        collapsed++
        continue
      }
    }
    out.push(cur)
  }
  return { text: out.join('\n'), collapsed }
}

// 🔥 2026-10-22 跨章复制擦除（全章，不只开头）：
//   模型会把上一章结尾的具体物件/句子搬到本章中后段（实测第5章复用第4章的
//   「斗笠边沿滴进领口」「火漆印鉴」「秋猎时您亲手盖下」），触发「与已写章节重复」闸门 → 反复重跑。
//   判定：一句话里 ≥40% 的 7 字片段出现在上一章结尾中 → 判为复制句，删除（信息在上一章已给，删掉不丢情节）。
function scrubPrevEndingCopies(content: string, prevEnding: string): { text: string; removed: number } {
  const src = String(prevEnding || '').replace(/[^\u4e00-\u9fa5]/g, '')
  if (src.length < 24) return { text: content, removed: 0 }
  const grams = new Set<string>()
  for (let i = 0; i + 7 <= src.length; i++) grams.add(src.slice(i, i + 7))
  let removed = 0
  const out: string[] = []
  for (const p of String(content || '').split('\n')) {
    const sents = p.split(/(?<=[。！？!?…])/).filter((s) => s.trim())
    if (!sents.length) { out.push(p); continue }
    const keep: string[] = []
    for (const s of sents) {
      const n = s.replace(/[^\u4e00-\u9fa5]/g, '')
      if (n.length < 9) { keep.push(s); continue }
      let hit = 0
      const total = Math.max(1, n.length - 6)
      for (let i = 0; i + 7 <= n.length; i++) if (grams.has(n.slice(i, i + 7))) hit++
      if (hit >= 1 && hit / total >= 0.4 && removed < 24) { removed++; continue }
      keep.push(s)
    }
    const merged = keep.join('')
    if (merged.trim()) out.push(merged)
  }
  return { text: out.join('\n'), removed }
}

// 🔥 2026-10-22 历史撞句擦除（与终稿闸门同口径）：
//   闸门用「9-gram 命中 ledger.historyHashes」判「与已写章节重复」（≥4 处即废），
//   但旧擦除只拿上一章结尾 500 字做 7-gram/40% 判定 → 中段复用（如第19章复用第18章
//   「声音不大却极有分量」「朱由榔指尖摩挲着腰」）完全漏网，章节反复重跑。
//   这里改成与闸门同源：拿 historyHashes 直接判句，命中密度高的整句剔除。
function scrubHistoryOverlaps(content: string, historyHashes: Set<string> | null | undefined): { text: string; removed: number; samples: string[]; remaining: number } {
  if (!historyHashes || historyHashes.size === 0) return { text: content, removed: 0, samples: [], remaining: 0 }
  const N = 9
  const countHits = (s: string): { hit: number; gram: string } => {
    const clean = s.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
    let hit = 0
    let gram = ''
    for (let i = 0; i + N <= clean.length; i++) {
      const g = clean.slice(i, i + N)
      if (historyHashes.has(hashString(g))) { hit++; if (!gram) gram = g }
    }
    return { hit, gram }
  }
  const distinctHits = (text: string): number => {
    const clean = text.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
    const set = new Set<string>()
    for (let i = 0; i + N <= clean.length; i++) {
      const g = clean.slice(i, i + N)
      if (historyHashes.has(hashString(g))) set.add(g)
    }
    return set.size
  }
  let cur = String(content || '')
  let removed = 0
  const samples: string[] = []
  // 两轮：第一轮删「命中≥2 的句子」+「单命中且 ≤30 字的公式化短句」；
  //        若剩余命中仍 ≥4（闸门阈值），第二轮放宽为「任何命中的句子都删」（限 4 句）。
  for (let round = 1; round <= 2; round++) {
    const before = distinctHits(cur)
    if (before < 4 && round === 1) break
    const strict = round === 1
    const paras = cur.split('\n')
    const protectFrom = Math.max(0, paras.length - 2)   // 尾部两段受保护（保住钩子）
    const out: string[] = []
    for (let pi = 0; pi < paras.length; pi++) {
      const p = paras[pi]
      if (pi >= protectFrom) { out.push(p); continue }
      const sents = p.split(/(?<=[。！？!?…])/).filter(s => s.trim())
      if (!sents.length) { out.push(p); continue }
      const keep: string[] = []
      for (const s of sents) {
        const cleanLen = s.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').length
        if (cleanLen < N) { keep.push(s); continue }
        const { hit, gram } = countHits(s)
        const drop = strict
          ? (hit >= 2 || (hit === 1 && cleanLen <= 30))
          : (hit >= 1)
        if (drop && removed < 12) {
          removed++
          if (samples.length < 5) samples.push(gram)
          continue
        }
        keep.push(s)
      }
      const merged = keep.join('')
      if (merged.trim()) out.push(merged)
    }
    cur = out.join('\n')
    if (distinctHits(cur) < 4) break
  }
  return { text: cur, removed, samples, remaining: distinctHits(cur) }
}

// 🔥 2026-10-19：跨章接缝去重——章首与上一章结尾重复的段落整段剔除（「第一章结尾重播当第二章开头」）
function stripSeamDuplication(content: string, prevEnding: string): { text: string; removed: number } {
  const prevTail = tailOf(String(prevEnding || ''), 800)
  if (!prevTail) return { text: content, removed: 0 }
  const norm = (s: string) => s.replace(/[\s，。！？、；：“”‘’"']/g, '')
  const prevN = norm(prevTail)
  const paras = splitParagraphs(content)
  let removed = 0
  let cut = 0
  for (let i = 0; i < paras.length && i < 4; i++) {
    const p = norm(paras[i])
    if (p.length >= 14 && prevN.includes(p.slice(0, 24))) { removed++; cut = i + 1; continue }
    break
  }
  return removed > 0 ? { text: paras.slice(cut).join('\n'), removed } : { text: content, removed: 0 }
}

// 🔥 2026-10-19：完全相同段落/句子在章内出现 ≥2 次 → 只保留第一次
//   （治「同一段描述连演两遍」「密道暗门/霉斑紫红」这类原样重复；仅删完全相同的文本，不改写）
function dedupeExactRepeats(text: string): { text: string; removed: number } {
  const norm = (s: string) => s.replace(/[\s，。！？、；：“”‘’"']/g, '')
  let removed = 0
  // ① 段落级：完全相同段落（≥18 汉字）第 2 次起删除
  const seenP = new Set<string>()
  const kept: string[] = []
  for (const p of text.split('\n')) {
    const k = norm(p)
    if (k.length >= 18) {
      if (seenP.has(k) && removed < 6) { removed++; continue }
      seenP.add(k)
    }
    kept.push(p)
  }
  // ② 句子级：完全相同句子（≥14 汉字）第 2 次起删除
  const seenS = new Set<string>()
  const out = kept.join('\n').replace(/[^。！？…\n]+[。！？…]/g, (m) => {
    const k = norm(m)
    if (k.length >= 14) {
      if (seenS.has(k) && removed < 12) { removed++; return '' }
      seenS.add(k)
    }
    return m
  })
  return { text: out, removed }
}

function applyHardFixes(text: string): { text: string; note: string } {
  const s0 = stripMetaAnnotations(text)
  // 🔥 2026-10-19：确定性去 AI 指纹（套话/高频副词/模板句，与平台特征库对齐）
  const s0a = deAiCleanup(s0.text)
  // 🔥 半角直引号成对转中文引号（"殿下！" → “殿下！”）；按出现顺序交替配对
  let openQuote = true
  let quoteFixed = 0
  const s0b = s0a.replace(/"/g, () => { quoteFixed++; const q = openQuote ? '“' : '”'; openQuote = !openQuote; return q })
  // 🔥 整行级复读去重（完全相同的行出现≥3次 → 只保留第一次，如「查，看看这些军报是否属实。」连播）
  let dupLines = 0
  const seen = new Map<string, number>()
  const normLine = (s: string) => s.replace(/[\s，。！？、；：“”‘’"']/g, '')
  const linesKept: string[] = []
  for (const ln of s0b.split('\n')) {
    const key = normLine(ln)
    if (key.length >= 10) {
      const c = (seen.get(key) || 0) + 1
      seen.set(key, c)
      if (c >= 2 && dupLines < 10) { dupLines++; continue }
    }
    linesKept.push(ln)
  }
  const s1c = collapseRepeatLoops(linesKept.join('\n'))
  // 🔥 2026-10-19：重复句去重（≥3 次保留前两次）+ 完全相同句/段去重（≥2 次保留第一次）+ 口癖轮换
  const s1d = dedupeRepeatedSentences(s1c.text)
  const s1e = trimRepeatedSpans(s1d.text)
  const s1f = dedupeExactRepeats(s1e.text)
  const s1 = splitLongParagraph(s1f.text)
  const s2 = diversifyFillers(s1.text)
  const s2b = diversifyTics(s2.text)
  const notes: string[] = []
  if (s0.removed > 0) notes.push('剔除元叙事泄漏×' + s0.removed)
  if (s0a !== s0.text) notes.push('去AI指纹替换')
  if (quoteFixed > 0) notes.push('直引号转中文引号×' + quoteFixed)
  if (dupLines > 0) notes.push('整行复读去重×' + dupLines)
  if (s1c.collapsed > 0) notes.push('复读环压扁×' + s1c.collapsed)
  if (s1d.removed > 0) notes.push('重复句去重×' + s1d.removed)
  if (s1e.removed > 0) notes.push('重复片段修剪×' + s1e.removed)
  if (s1f.removed > 0) notes.push('完全相同句段去重×' + s1f.removed)
  if (s1.splitCount > 0) notes.push('拆分超长段×' + s1.splitCount)
  if (s2.replaced > 0) notes.push('填充语轮换×' + s2.replaced)
  if (s2b.replaced > 0) notes.push('口癖轮换×' + s2b.replaced)
  return { text: s2b.text, note: notes.join('；') }
}

export async function runChapterEngine(input: ChapterEngineInput): Promise<EngineOutput> {
  const started = nowMs()
  const report: EngineReport = {
    engine: 'chapter-engine-v1',
    stage: 'ok',
    novelKey: '',
    chapterNumber: input.chapterNumber,
    wordUnits: 0,
    chineseChars: 0,
    totalChars: 0,
    targetWords: input.targetWords,
    llmCalls: 0,
    scenes: 0,
    beats: 0,
    rounds: [],
    repairs: [],
    degradeReasons: [],
    ledgerKey: '',
    elapsedMs: 0,
    usedModels: [],
  }
  const progress = (stage: string, detail?: string) => {
    try { input.onProgress && input.onProgress(stage, detail) } catch (_e) { /* ignore */ }
    console.log('[chapter-engine] ch' + input.chapterNumber + ' · ' + stage + (detail ? ' · ' + detail : ''))
  }
  const timeLeft = () => TOTAL_BUDGET_MS - (nowMs() - started)

  // 🔥 2026-10-18：平台合规标准接线（设置页保存 → 用户偏好 → 写页随请求上传）
  const platformStandards: PlatformStandard[] = (Array.isArray(input.platformStandards) ? input.platformStandards : [])
    .filter((s) => s && (s.name || s.aiStandard || (Array.isArray(s.criteria) && s.criteria.length)))
  // 从 '< 30%' 解析出数值阈值（取多个启用平台中最严的一个）
  const platformMaxAiRate = platformStandards.reduce((best, s) => {
    const m = String(s.aiStandard || '').match(/(\d+(?:\.\d+)?)\s*%/)
    const v = m ? Number(m[1]) : 0
    return v > 0 && (best === 0 || v < best) ? v : best
  }, 0)
  const platformBrief = platformStandards.length
    ? '【平台合规红线（作者已启用的签约平台标准，正文必须满足）】\n' + platformStandards.map((s) => {
        const parts: string[] = []
        if (s.aiStandard) parts.push('AI 率要求 ' + s.aiStandard)
        if (Array.isArray(s.criteria) && s.criteria.length) parts.push(s.criteria.slice(0, 4).join('；'))
        return '· ' + (s.name || '平台') + '：' + parts.join('；')
      }).join('\n')
    : ''
  // 作者平台 AI 率红线并入闸门（audit 已按 maxAiRate 输出同一问题；此处仅对未接线路径兜底，避免重复计数）
  // 🔥 2026-10-20：站内检测是「自研估测」，与朱雀官方的「疑似AI占比」不同量纲（实测同一稿：站内 0.8% ↔ 朱雀疑似AI 100%）。
  //   若直接拿用户设定的 1%/5% 去卡站内估测值，会把「朱雀判为人工」的高活人感稿子全部毙掉；
  //   因此站内闸门设地板 INTERNAL_ESTIMATE_FLOOR，用户设定的标准仍照常写进提示词、并在官方通道接入后作为官方目标。
  const INTERNAL_ESTIMATE_FLOOR = 12
  const platformInternalGate = platformMaxAiRate > 0 ? Math.max(platformMaxAiRate, INTERNAL_ESTIMATE_FLOOR) : 0
  const applyPlatformAudit = (a: AuditResult): AuditResult => {
    if (platformInternalGate > 0 && typeof a.aiRate === 'number' && a.aiRate > platformInternalGate && !a.fails.some((f) => /AI\s*率/.test(f))) {
      a.fails.push('站内自研估测AI率偏高（当前 ' + a.aiRate + '%，站内闸门 ≤' + platformInternalGate + '%；朱雀官方疑似AI占比须走官方通道判定）')
    }
    return a
  }

  // 🔥 2026-10-22：penalty 可透传（结构化 JSON 调用必须归零——高重复惩罚会把引号/花括号/人名
  //   全部压下去，模型中途"变道"或提前停笔，节拍表 500-1000 字被拦腰截断的元凶之一）
  const call = async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, opts: { temperature: number; maxTokens: number; timeoutMs: number; label: string; presencePenalty?: number; frequencyPenalty?: number }): Promise<string> => {
    // 平台合规红线注入系统提示（分镜/节拍这种结构化 JSON 调用除外）
    const sysMessages = platformBrief && opts.label.indexOf('分镜') < 0 && opts.label.indexOf('节拍') < 0
      ? messages.map((m) => (m.role === 'system' ? { ...m, content: m.content + '\n\n' + platformBrief } : m))
      : messages
    // 🔥 2026-10-21 统一模型路由：
    //   · 用户自有模型 → 全部内容都用用户自己的平台+模型（source='user-own'）
    //   · 管理员系统默认 → 按角色固定主模型（正文=prose / 节拍分镜=structure / 审核=judge），
    //     不再随机轮转（随机轮转会导致同一卷文风忽变、且拖慢速度）；
    //   · 主模型命中 429/500 时由 llm.ts 兜底池按角色顺序换人（熔断冷却）。
    const _routing = input.routing
    const _label = String(opts.label || '')
    const _kind: 'prose' | 'structure' | 'judge' | 'polish' =
      /节拍|分镜|大纲|设定|结构|规划/.test(_label) ? 'structure'
        : /审核|评估|评分|判定|查重|摘要|总结|合规|原创/.test(_label) ? 'judge'
          : 'prose'
    let _cfg: any = input.llmConfig
    let _slotName = '默认'
    if (_routing) {
      if (_routing.source === 'user-own' && _routing.primary) {
        _cfg = _routing.primary
        _slotName = '用户自有模型'
      } else {
        const _slot = _kind === 'structure' ? _routing.structure : _kind === 'judge' ? _routing.judge : _routing.prose
        if (_slot) { _cfg = _slot; _slotName = _kind }
        else if (_routing.primary) { _cfg = _routing.primary; _slotName = '主模型' }
      }
    }
    let resp: any
    try {
      resp = await callLLMWithFallback(_cfg, sysMessages as any, undefined, {
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        timeoutMs: opts.timeoutMs,
        skipJsonValidation: true,
        step: 'content',
        ...(typeof opts.presencePenalty === 'number' ? { presencePenalty: opts.presencePenalty } : {}),
        ...(typeof opts.frequencyPenalty === 'number' ? { frequencyPenalty: opts.frequencyPenalty } : {}),
      })
      noteProviderSuccess(_cfg?.provider || '')
    } catch (e) {
      noteProviderFailure(_cfg?.provider || '', /429|限流|速率/.test(String((e as any)?.message || '')))
      throw e
    }
    report.llmCalls++
    if (resp.usedModel && report.usedModels.indexOf(resp.usedModel) < 0) report.usedModels.push(resp.usedModel)
    console.log('[chapter-engine] ' + opts.label + ' 完成 · 模型=' + resp.usedModel + ' (槽位:' + _slotName + '/' + (_cfg?.provider || '') + '/' + (_cfg?.model || '') + ') 长度=' + String(resp.content || '').length)
    return String(resp.content || '')
  }

  // ============================================================
  // 0. 上下文准备（断章台账 + 设定）
  // ============================================================
  const novelKey = resolveLedgerKey({
    novelKey: input.novelKey,
    novelTitle: input.novelTitle,
    protagonistName: input.protagonistName,
    genre: input.genre,
  })
  report.novelKey = novelKey
  report.ledgerKey = novelKey

  const ledger = (() => {
    try { return ledgerContext(loadLedger(novelKey), input.chapterNumber) } catch (_e) {
      return { prevEnding: '', prevSummary: '', historyHashes: new Set<string>(), recentCast: [] as string[], openThreads: [] as string[] }
    }
  })()
  const prevEnding = String(input.prevEnding || ledger.prevEnding || '').trim()
  const prevSummary = String(input.prevChaptersSummary || ledger.prevSummary || '').trim()
  const historyHashes = ledger.historyHashes

  const castNames: string[] = []
  const pushCast = (n?: string) => {
    const s = String(n || '').trim()
    if (s && castNames.indexOf(s) < 0 && castNames.length < 24) castNames.push(s)
  }
  ;(input.castNames || []).forEach(pushCast)
  // 🔥 2026-10-19：提供了人物档案时，台账 recentCast 里的历史人物名不可信（历轮污染可能虚构角色），
  //   以路由层传来的权威人物卡为准，只允许档案内 + 主角的名字进 roster
  const castBrief = (Array.isArray(input.castBrief) ? input.castBrief : []).map(s => String(s || '').trim()).filter(Boolean).slice(0, 24)
  if (castBrief.length) {
    const allowed = new Set<string>()
    castBrief.forEach((l) => { const m = l.match(/^([^｜|\n]+)/); if (m) allowed.add(m[1].trim()) })
    ledger.recentCast.forEach((n) => { const s = String(n || '').trim(); if (s && allowed.has(s) && castNames.indexOf(s) < 0 && castNames.length < 24) castNames.push(s) })
  } else {
    ledger.recentCast.forEach(pushCast)
  }
  pushCast(input.protagonistName)

  const settingBrief = sampleSettingBrief(input.contextParts)
  const chapterBrief = [
    '【本章核心剧情】' + input.corePlot,
    input.shuangPoints ? '【本章爽点】' + input.shuangPoints : '',
    prevEnding ? '【上一章结尾（本章必须承接，不得另起炉灶）】' + tailOf(prevEnding, 600) : '',
    prevSummary ? '【前文章节摘要】\n' + tailOf(prevSummary, 1500) : '',
    castBrief.length ? '【人物档案·出场必须核对】\n' + castBrief.join('\n') : '',
    input.imitateConstraint || '',
  ].filter(Boolean).join('\n')

  // ============================================================
  // 1. 节拍表
  // ============================================================
  progress('① 生成分场节拍表', 'target=' + input.targetWords)
  let sheet: BeatSheet
  let beatsOk = false
  // 🔥 2026-10-19：有人工蓝图时直接采用（跳过一次 LLM 调用，且剧情 100% 可控）
  const bpSheet = blueprintToSheet(input)
  if (bpSheet) {
    sheet = bpSheet
    beatsOk = true
    bpSheet.beats.forEach((b) => b.cast.forEach((n) => { if (castNames.indexOf(n) < 0 && castNames.length < 24) castNames.push(n) }))
    progress('① 使用人工剧情蓝图', '场数=' + bpSheet.beats.length)
    console.log('[engine] 使用人工剧情蓝图 · 场数=' + bpSheet.beats.length)
    report.blueprintUsed = true
  } else try {
    const prompt = buildBeatSheetPrompt(input, {
      castNames,
      castBrief,
      prevEndingLine: prevEnding ? tailOf(prevEnding, 500) : '',
      prevSummaryLine: tailOf(prevSummary, 1200),
      settingBrief,
    })
    const raw = await call([
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    // 🔥 2026-10-22：结构化 JSON 调用必须把重复惩罚归零——
    //   默认 presencePenalty/frequencyPenalty=1.0 会把引号/花括号/人名一并压下去，
    //   Qwen3-8B 常在 JSON 中途"变道"或提前停笔（实测节拍表 500~1000 字被拦腰截断）。
    ], { temperature: 0.6, maxTokens: 4096, timeoutMs: 150000, label: '节拍表', presencePenalty: 0, frequencyPenalty: 0 })
    const parsed = parseBeatSheet(raw, input)
    sheet = parsed.sheet
    beatsOk = parsed.ok
    if (!beatsOk) {
      report.degradeReasons.push('节拍表解析失败，改用合成五段节拍；原始返回前 160 字：' + String(raw || '').replace(/\s+/g, ' ').slice(0, 160))
      try { fsEngine.appendFileSync('/tmp/beats_fail.txt', '===== ' + new Date().toISOString() + ' 解析失败 =====\n' + String(raw || '(空)') + '\n') } catch (_e2) {}
    }
  } catch (e: any) {
    report.degradeReasons.push('节拍表调用失败：' + (e && e.message ? e.message : String(e)))
    try { fsEngine.appendFileSync('/tmp/beats_fail.txt', '===== ' + new Date().toISOString() + ' 调用失败 =====\n' + String((e && e.raw) || '(无raw)') + '\n') } catch (_e3) {}
    sheet = syntheticBeats(input)
  }
  report.beats = sheet.beats.length

  // 🔥 2026-10-22 爽点类型分配（与终稿闸门同口径）：
  //   闸门要求「爽点 ≥3 且覆盖 ≥2 类」，模型常常只写「收获」类（到手/获得），
  //   → 判「爽点类型单一」→ 整章重跑（每次 15 分钟）。
  //   这里给每场分配一个明确的爽点类型，并在场景提示词里给出可落地的表达，
  //   保证本章至少覆盖 3 类。
  const _SHUANG_TYPES = ['打脸', '碾压', '逆转', '收获', '突破', '震场']
  const sceneShuangTypes: string[] = sheet.beats.map((b) => {
    const t = String((b as any).shuang || '').trim()
    return _SHUANG_TYPES.indexOf(t) >= 0 ? t : ''
  })
  const _ROT = ['逆转', '打脸', '碾压', '收获', '震场', '突破']
  let _ri = 0
  for (let i = 0; i < sceneShuangTypes.length; i++) {
    if (sceneShuangTypes[i]) continue
    while (_ri < _ROT.length && sceneShuangTypes.indexOf(_ROT[_ri]) >= 0) _ri++
    sceneShuangTypes[i] = _ROT[_ri % _ROT.length]
    _ri++
  }
  if (new Set(sceneShuangTypes).size < 3) {
    if (sceneShuangTypes.length > 1) sceneShuangTypes[1] = '打脸'
    if (sceneShuangTypes.length > 2) sceneShuangTypes[2] = '震场'
  }
  if (sceneShuangTypes.length) {
    report.repairs.push('爽点类型分配：' + sceneShuangTypes.join('、'))
  }

  // ============================================================
  // 2. 分场景写作
  // ============================================================
  let content = ''
  const doneSummaries: string[] = []
  for (let i = 0; i < sheet.beats.length; i++) {
    const beat = sheet.beats[i]
    if (timeLeft() < 150000 && i > 0) {
      report.degradeReasons.push('时间预算不足，剩余 ' + (sheet.beats.length - i) + ' 场并入最后一场写作')
      // 剩余场景合并为一个补写：直接续写到底
      let mergedOk = false
      try {
        const need = sheet.beats.slice(i).reduce((a, b) => a + (b.words || 0), 0)
        const tail = tailOf(content, 700)
        const p = buildExtendPrompt(input, tail, need, collectOpenings(content, 16))
        const raw = await call([
          { role: 'system', content: p.system },
          { role: 'user', content: p.user },
        ], { temperature: 0.8, maxTokens: 3500, timeoutMs: Math.min(200000, Math.max(60000, timeLeft() - 60000)), label: '合并补写' })
        content = overlapJoin(content, normalizePunctuation(raw))
        mergedOk = true
        for (let k = i; k < sheet.beats.length; k++) {
          // 已并入补写，逐场摘要以完成度较弱的标题行代替（保持 doneSummaries 连贯性）
          doneSummaries.push('（合并补写覆盖场）' + (sheet.beats[k].title || ''))
        }
      } catch (e: any) {
        report.degradeReasons.push('合并补写失败：' + (e && e.message ? e.message : String(e)))
        // 🔥 Bug修复：合并补写一旦抛错，此前剩余场既没写也不进摘要（静默缺后半章）——
        //   现在按剩余场数的剧情概要记入摘要，供下章上下文保持连贯
        for (let k = i; k < sheet.beats.length; k++) {
          const b = sheet.beats[k]
          doneSummaries.push('（未写出场）' + (b.title || '') + '：' + (b.goal || b.conflict || ''))
        }
      }
      // 时间预算已尽，退出主循环（try 内已覆盖记录，成败均不再逐场写作）
      break
    }
    progress('② 写作第 ' + (i + 1) + '/' + sheet.beats.length + ' 场：' + beat.title)
    // 🔥 2026-10-21 场次目标字数统一：提示词与产出上限必须同源。
    //   旧版提示词用 b.words（缺省 900），引擎按 400 判，模型于是写到 3200 字 → 必然自我复读。
    const beatTarget = Math.max(240, Math.round((beat.words || Math.round(input.targetWords / Math.max(2, sheet.beats.length)))))
    const sceneCtx = {
      titleLine: titleLineOf(input),
      settingBrief,
      chapterBrief,
      beat: { ...beat, words: Math.round(beatTarget * 1.35) },
      doneSummaries,
      prevTail: content ? tailOf(content, 700) : '',
      usedOpenings: collectOpenings(content, 24),
      usedLines: collectDialogueLines(content, 12),
      // 🔥 2026-10-22 跨章重复黑名单：前文已出现过的公式化句式
      historyPhrases: (Array.isArray((input as any).prevPhrases) && (input as any).prevPhrases.length)
        ? (input as any).prevPhrases.map((x: any) => String(x || '')).filter(Boolean)
        : computeHistoryPhrases(String((input as any).prevFullText || '')),
      openThreads: (ledger.openThreads || []).slice(0, 6),
      shuangType: (sceneShuangTypes[i] || String((beat as any).shuang || '')).trim(),
      sceneNo: i + 1,
      sceneTotal: sheet.beats.length,
      targetWords: input.targetWords,
      styleNote: input.style || '',
    }
    let sceneText = ''
    for (let attempt = 0; attempt < 2 && !sceneText; attempt++) {
      try {
        const p = buildScenePrompt(sceneCtx, input)
        const raw = await call([
          { role: 'system', content: p.system },
          { role: 'user', content: p.user + (attempt > 0 ? '\n\n（上一次本场没写够，请直接开写正文，务必写足 ' + beatTarget + ' 汉字以上）' : '') },
        ], {
          // 🔥 2026-10-22 降温：Qwen3-8B 在 0.9 高温下会写出长句堆叠/分行碎片（实测整章崩到 1683 字），
          //   0.72-0.77 明显更稳，画面感靠提示词而不是靠温度。
          temperature: Math.min(0.85, 0.72 + attempt * 0.05),
          // 🔥 2026-10-21 产出上限收紧：旧值 max(2400, 2.4×目标) 让 600 字的场次可以写到 3200 字，
          //   模型写超后必然复读（实测单章复读 250 段）。现在按目标字数给 1.7 倍配额，写满即停。
          maxTokens: Math.min(1800, Math.max(700, Math.round(beatTarget * 1.7))),
          timeoutMs: Math.min(300000, Math.max(90000, timeLeft() - 120000)),
          label: '第' + (i + 1) + '场' + (attempt ? '(重试)' : ''),
        })
        const cleaned = normalizePunctuation(raw)
        const zh = countChinese(cleaned)
        // 🔥 2026-10-21 逐场去套话：AI 套话/副词是「词汇分布」归零的主因，
        //   在每场落盘前先做确定性净化（不改语义），避免后面整章改写把复读带回来。
        const de = deCliche(cleaned)
        // 🔥 2026-10-22 分行碎片先"回流"再判定：整段被拆成多行（行尾无标点）时直接判废，
        //   会让整章塌到 1300 字 → 路由回退旧单次生成（回退稿才真正崩：陛下/朕/清军/复读段）。
        const _rf = reflowFragmentedLines(de.text)
        if (_rf.joined > 0) {
          de.text = _rf.text
          de.changes.push('分行回流×' + _rf.joined)
        }
        const zhDe = countChinese(de.text)
        // 🔥 2026-10-19：门槛从固定 200 改为与目标字数挂钩（写太短 = 后面全乱，宁可重试一次）
        // 🔥 2026-10-22：同时拦截"分行碎片/无标点长句"这类退化稿（实测一场崩 → 整章崩）
        const _sceneBad = looksCorruptSegment(de.text)
        if (_sceneBad) {
          report.degradeReasons.push('第' + (i + 1) + '场产出不合格（' + _sceneBad + '），重试')
        } else if (zhDe >= Math.max(200, Math.round(beatTarget * 0.55))) {
          // 🔥 2026-10-21 超量硬截：超过目标 1.35 倍时，在 1.15 倍附近的段落边界截断。
          //   尾部正是模型开始复读的地方，截掉比留着（等着后面去重）更省时、更干净。
          if (zhDe > Math.round(beatTarget * 1.35)) {
            const paras = de.text.split('\n')
            let acc = 0
            const keep: string[] = []
            const cap = Math.round(beatTarget * 1.15)
            for (const para of paras) {
              const n = countChinese(para)
              if (acc + n > cap && keep.length >= 2) break
              keep.push(para)
              acc += n
            }
            const trimmed = keep.join('\n')
            if (countChinese(trimmed) >= Math.round(beatTarget * 0.9)) {
              sceneText = trimmed
              report.repairs.push('第' + (i + 1) + '场超量截断：' + zhDe + '→' + countChinese(trimmed) + '汉字')
            } else {
              sceneText = de.text
            }
          } else {
            sceneText = de.text
          }
          if (de.changes.length) {
            report.repairs.push('第' + (i + 1) + '场去套话：' + de.changes.slice(0, 4).join('、') + (de.changes.length > 4 ? ' 等' + de.changes.length + '项' : ''))
          }
        } else {
          report.degradeReasons.push('第' + (i + 1) + '场产出过短(' + zhDe + '/' + beatTarget + '汉字)，重试')
        }
      } catch (e: any) {
        report.degradeReasons.push('第' + (i + 1) + '场调用失败：' + (e && e.message ? e.message : String(e)))
      }
    }
    // 🔥 2026-10-21 逐场疑似度自检 + 定向重写（局部修复）
    //   为什么要逐场做：整章 2600 字交给免费档模型改写，它会复读（实测一章复读 179 段）；
    //   而单场 600-900 字的定向改写任务短、目标明确，模型能稳定执行。
    //   判定与改写用同一套口径（自建朱雀口径），改完立即复检，形成局部闭环。
    try {
      if (sceneText && timeLeft() > 120000) {
        const _zqs = runZhuqueProxy(sceneText, { target: 5, threshold: 2.0 })
        if (_zqs.suspectedRatio > 15) {
          const _bad = (_zqs.segments || []).filter((s: any) => s && s.label === 2 && s.text).slice(0, 6)
          if (_bad.length) {
            const _askS = _bad.map((s: any, _i: number) =>
              '§' + (_i + 1) + '｜扣分理由：' + ((s.reasons || []).join('、') || '叙述模板化') + '\n原文：' + s.text
            ).join('\n\n')
            const _rawS = await call([
              { role: 'system', content: '你是中文历史网文的定稿作者，正在按逐段诊断改写正文。只输出改写后的段落，每段一行，行首用 §编号 标记，不要解释、不要标题。' },
              { role: 'user', content: [
                '【逐段改写任务】下列每段被判为"疑似AI写作"，请按扣分理由逐段改写。',
                '1. 严格保留该段的情节、动作、对白信息与事实细节；只改措辞、句式与意象。',
                '2. 每段必须落到【具体动作 + 具体物件 + 身体感】，禁止抽象概括与心理总结。',
                '3. 禁止套话：一丝、一抹、缓缓、轻轻、不禁、仿佛、如遭雷击、深吸一口气、意味深长、鸦雀无声等。',
                '4. 禁止连接词：因此、于是、而且、此外、事实上、总之、也就是说。',
                '5. 段首不得与别段重复；句子长短交错；无对白的段必须加入动作与器物细节。',
                '6. 输出格式：每段一行，以 §编号 开头，编号与顺序与输入一致，段数必须相同。',
                '',
                _askS,
              ].join('\n') },
            ], { temperature: 0.88, maxTokens: 2600, timeoutMs: Math.min(200000, Math.max(80000, timeLeft() - 100000)), label: '第' + (i + 1) + '场疑似重写' })
            const _linesS = normalizePunctuation(_rawS).split('\n').map((x: string) => x.trim()).filter(Boolean)
            const _mapS = new Map<number, string>()
            for (const _lnS of _linesS) {
              const _mS = _lnS.match(/^§\s*(\d+)\s*[｜|:：]?\s*([\s\S]+)$/)
              if (_mS && _mS[2] && _mS[2].length > 8) _mapS.set(Number(_mS[1]), _mS[2].trim())
            }
            // ⚠️ 不做「按行序兜底映射」：实测模型常只回 3-4 行短句，
            //   顺序映射会把好段落替换成短句（实测一段 1000 字被换成 73 字）→ 正文塌陷。
            //   只接受带 §编号 的可靠映射。
            if (_mapS.size) {
              const _parasS = sceneText.split('\n')
              let _appliedS = 0
              for (let _k = 0; _k < _bad.length; _k++) {
                const _newS = _mapS.get(_k + 1)
                if (!_newS) continue
                const _oldS = String(_bad[_k].text)
                if (_newS.length < _oldS.length * 0.6) continue   // 改写稿明显缩水 → 丢弃，防丢内容
                const _atS = _parasS.findIndex((p: string) => p.trim() === _oldS.trim())
                if (_atS >= 0) { _parasS[_atS] = _newS; _appliedS++ }
              }
              if (_appliedS > 0) {
                const _newScene = deCliche(_parasS.join('\n')).text
                // 总量护栏：改写后整场不得缩水超过 15%（防止模型短句替换长段）
                if (countChinese(_newScene) >= countChinese(sceneText) * 0.85) {
                  sceneText = _newScene
                  const _zqs2 = runZhuqueProxy(sceneText, { target: 5, threshold: 2.0 })
                  report.repairs.push('第' + (i + 1) + '场疑似重写：改写 ' + _appliedS + ' 段，疑似占比 ' + _zqs.suspectedRatio + '% → ' + _zqs2.suspectedRatio + '%')
                } else {
                  report.degradeReasons.push('第' + (i + 1) + '场疑似重写后字数缩水过多（' + countChinese(sceneText) + '→' + countChinese(_newScene) + '），已放弃该稿')
                }
              }
            }
          }
        }
      }
    } catch (e: any) {
      report.degradeReasons.push('第' + (i + 1) + '场疑似重写失败：' + (e && e.message ? e.message : String(e)))
    }
    // 🔥 2026-10-19：场次短于目标 80% 时即时补写（比整章修复便宜且不破坏剧情结构）
    if (sceneText && countChinese(sceneText) < Math.round(beatTarget * 0.8) && timeLeft() > 240000) {
      try {
        const needScene = beatTarget - countChinese(sceneText) + 80
        const pExt = buildExtendPrompt(input, tailOf(sceneText, 500), Math.min(700, needScene), collectOpenings(sceneText, 12))
        const rawExt = await call([
          { role: 'system', content: pExt.system },
          { role: 'user', content: pExt.user },
        ], { temperature: 0.82, maxTokens: 2200, timeoutMs: Math.min(240000, Math.max(90000, timeLeft() - 100000)), label: '第' + (i + 1) + '场补写' })
        const mergedScene = overlapJoin(sceneText, normalizePunctuation(rawExt))
        if (countChinese(mergedScene) > countChinese(sceneText)) {
          report.repairs.push('第' + (i + 1) + '场补写：' + countChinese(sceneText) + ' → ' + countChinese(mergedScene) + ' 汉字')
          sceneText = mergedScene
        }
      } catch (e: any) {
        report.degradeReasons.push('第' + (i + 1) + '场补写失败：' + (e && e.message ? e.message : String(e)))
      }
    }
    if (sceneText) {
      content = overlapJoin(content, sceneText)
      report.scenes++
      const first = splitParagraphs(sceneText)[0] || beat.title
      doneSummaries.push('第' + (i + 1) + '场「' + beat.title + '」：' + (beat.goal || '') + '（已写 ' + countChinese(sceneText) + ' 汉字，开头：' + first.slice(0, 40) + '…）')
    } else {
      doneSummaries.push('第' + (i + 1) + '场「' + beat.title + '」：本轮未产出，后续场次需自行承接其剧情（' + (beat.goal || '') + '）')
    }
  }

  // ============================================================
  // 3. 装配（标点 + 去 AI 味）
  // ============================================================
  content = normalizePunctuation(content)
  try { content = deAiCleanup(content) } catch (_e) { /* 清理失败不阻塞 */ }
  content = normalizePunctuation(content)
  // 🔥 跨章接缝去重 + 复读环压扁（先接缝后环，避免被误判重复）
  try {
    const seam = stripSeamDuplication(content, prevEnding)
    if (seam.removed > 0) {
      content = seam.text
      report.repairs.push('接缝去重：剔除与上一章结尾重复的开头段×' + seam.removed)
      progress('③b 接缝去重', '剔除重复开头段×' + seam.removed)
    }
  } catch (_e) { /* 去重失败不阻塞 */ }
  // 🔥 2026-10-22 全章擦除上一章结尾的复制句（中后段复用是闸门"与已写章节重复"的主因）
  try {
    const _cop = scrubPrevEndingCopies(content, prevEnding)
    if (_cop.removed > 0) {
      content = _cop.text
      report.repairs.push('跨章复制擦除×' + _cop.removed + '句')
    }
  } catch (_e) { /* 不阻塞 */ }
  // 🔥 2026-10-22 历史撞句擦除（与终稿闸门同口径：9-gram × ledger.historyHashes）
  try {
    const _his = scrubHistoryOverlaps(content, historyHashes)
    if (_his.removed > 0) {
      content = _his.text
      report.repairs.push('历史撞句擦除×' + _his.removed + '句（余' + _his.remaining + '处）' + (_his.samples.length ? '（' + _his.samples.slice(0, 2).join('/') + '）' : ''))
    }
  } catch (_e) { /* 不阻塞 */ }
  try {
    const loopFix = collapseRepeatLoops(content)
    if (loopFix.collapsed > 0) {
      content = loopFix.text
      report.repairs.push('复读环压扁×' + loopFix.collapsed)
      progress('③c 复读环压扁', '去重复行×' + loopFix.collapsed)
    }
  } catch (_e) { /* 压扁失败不阻塞 */ }
  // 🔥 2026-10-21 复读段落清除（装配阶段）：collapseRepeatLoops 只压「重复行」，
  //   挡不住「整段复读但字句微调」的退化（同一段对话在章内重复 5~10 次，
  //   开头 10 字相同、动词略不同）。这里在装配后立刻清一次，
  //   让后续质检与定点修复都拿到干净稿（否则修复模型会照着复读稿继续复读）。
  try {
    const dd = dedupeRepeatedParagraphs(content)
    if (dd.removed > 0) {
      content = dd.text
      report.repairs.push('复读段落清除×' + dd.removed)
      progress('③d 复读段落清除', '删除重复段×' + dd.removed)
    }
  } catch (_e) { /* 清除失败不阻塞 */ }
  // 🔥 2026-10-21 组装后去套话 + 段首去重（确定性）：
  //   AI 套话/副词 → 第③维词汇分布直接归零；段首滥用 → 第③维 -4/处 且段落级 +0.7/段。
  try {
    const dc = deCliche(content)
    if (dc.changes.length) {
      content = dc.text
      report.repairs.push('组装去套话：' + dc.changes.slice(0, 5).join('、') + (dc.changes.length > 5 ? ' 等' + dc.changes.length + '项' : ''))
    }
    const mo = mergeRepeatedOpeners(content)
    if (mo.merged > 0) {
      content = mo.text
      report.repairs.push('段首去重：并入重复段×' + mo.merged)
    }
  } catch (_e) { /* 净化失败不阻塞 */ }
  content = normalizePunctuation(content)

  if (!content || countChinese(content) < 300) {
    report.stage = 'fallback'
    report.elapsedMs = nowMs() - started
    report.wordUnits = countWordUnits(content)
    report.chineseChars = countChinese(content)
    report.totalChars = content.replace(/\s/g, '').length
    progress('引擎产出不足，交回旧流程', '汉字=' + report.chineseChars)
    return { content: '', report }
  }

  // ============================================================
  // 4-6. 质检 → 修复/补字 循环
  // ============================================================
  // 🔥 2026-10-25 T2（G-01）：上限＝目标×1.05（双侧带），超出即一次净删；不再按 1.15 放水
  const maxVersion = Math.round(input.targetWords * 1.05)
  // 🔥 v3+：装配稿超长先截到上限再质检（否则修复轮的合稿判定全按超长基线走，全部被弃用）
  if (countWordUnits(content) > maxVersion) {
    const beforeClamp = countWordUnits(content)
    content = clampText(content, maxVersion)
    report.repairs.push('装配稿超长截断：' + beforeClamp + ' → ' + countWordUnits(content) + ' 字（去空白含标点）')
  }
  let current: { text: string; audit: AuditResult } = {
    text: content,
    audit: applyPlatformAudit(await auditChapter(content, { targetWords: input.targetWords, historyHashes, knownNames: castNames, strict: true, protagonistName: input.protagonistName || '', maxAiRate: platformInternalGate > 0 ? platformInternalGate : undefined, maxWords: OFFICIAL_MAX_WORDS, minDialogueRatio: OFFICIAL_MIN_DIALOGUE_RATIO, maxParagraphChars: OFFICIAL_MAX_PARAGRAPH_CHARS })),
  }
  report.rounds.push(summarizeAudit(1, current.audit))
  progress('④ 首轮质检', '汉字=' + current.audit.metrics.chineseChars + ' 爽点=' + current.audit.metrics.shuangCount + ' AI率=' + current.audit.aiRate + '% 不通过项=' + current.audit.fails.length)

  // 🔥 2026-10-19：对标白金评审（责编打分）——问题以「评审·」并入不通过项，驱动定点修复轮
  let judgeScore = 0
  let judgeIssues: string[] = []
  if (timeLeft() > 150000) {
    const jr = await judgeChapterAgainstBenchmark(current.text, {
      chapterNumber: input.chapterNumber,
      chapterTitle: input.chapterTitle,
      corePlot: input.corePlot,
      castBrief,
      genre: String(input.genre || ''),
      endHook: String((input.blueprint && input.blueprint.endHook) || sheet.endHook || ''),
    }, call)
    judgeScore = jr.score
    judgeIssues = jr.issues
    progress('④b 对标评审', '评分=' + jr.score + ' 问题数=' + jr.issues.length)
    if (jr.score < 78 && jr.issues.length) {
      current = {
        text: current.text,
        audit: {
          ...current.audit,
          fails: [...current.audit.fails.filter((f) => f.indexOf('评审·') < 0), ...jr.issues.map((i) => '评审·' + i)],
        },
      }
      report.rounds[report.rounds.length - 1] = { ...report.rounds[report.rounds.length - 1], fails: current.audit.fails.slice(0, 6) }
    }
  }

  const MAX_ROUNDS = 4
  let deAiAttempts = 0
  for (let round = 2; round <= MAX_ROUNDS; round++) {
    const a = current.audit
    if (a.passed) break
    if (timeLeft() < 100000) {
      report.degradeReasons.push('时间预算不足，提前结束修复（剩余不通过项 ' + a.fails.length + '）')
      break
    }
    // 🔥 T9：口径统一（去空白含标点）；注意此处 a 是 AuditResult，字数取自当前版本文本
    const tooShort = countWordUnits(current.text) < Math.round(input.targetWords * 0.9)
    const missing = Math.max(0, input.targetWords - countWordUnits(current.text))
    // 成本闸门：只剩 AI 率问题（未超 60%）且不涉及作者平台红线时，停止整章级修复；
    // 🔥 2026-10-19：若作者设了平台标准（如 <1%）且当前超标，则必须继续做「去AI味专项」重写，不得提前放弃
    const nonAiFails = a.fails.filter((f) => !/AI\s*率/.test(f))
    const aiOverPlatform = platformMaxAiRate > 0 && a.aiRate > platformMaxAiRate
    if (nonAiFails.length === 0 && a.aiRate < 60 && !aiOverPlatform) {
      report.degradeReasons.push('仅 AI 率未达标（' + a.aiRate + '%），已尽力，停止追加修复以控制成本')
      break
    }
    try {
      // 🔥 2026-10-19：去AI味专项——作者平台标准超标且无其它问题时，做定向降 AI 味重写（最多 2 次）
      if (nonAiFails.length === 0 && aiOverPlatform) {
        if (deAiAttempts >= 2) {
          report.degradeReasons.push('去 AI 味重写 ' + deAiAttempts + ' 次后 AI 率仍为 ' + a.aiRate + '%（作者标准 <' + platformMaxAiRate + '%），停止（已尽力）')
          break
        }
        deAiAttempts++
        progress('⑤ 去AI味专项（第' + deAiAttempts + '轮）', a.aiRate + '% > ' + platformMaxAiRate + '%')
        const instruction = buildRepairInstruction(a, input.targetWords, 0, platformMaxAiRate)
        const p = buildRepairPrompt(input, current.text, instruction)
        const raw = await call([
          { role: 'system', content: p.system },
          { role: 'user', content: p.user },
        ], {
          temperature: 0.62,
          maxTokens: Math.max(4000, Math.round(countChinese(current.text) * 2.4)),
          timeoutMs: Math.min(240000, Math.max(120000, timeLeft() - 60000)),
          label: '去AI味',
        })
        const cleaned = normalizePunctuation(raw)
        const cleanedChars = countChinese(cleaned)
        const overshootLimit = Math.max(1200, Math.round(input.targetWords * 1.05))
        // 🔥 2026-10-21 复读退化稿拒收：免费档模型改写整章易陷入复读循环
        const _repClean = countRepeatedParagraphs(cleaned)
        if (_repClean >= 3) {
          report.repairs.push('去AI味稿含复读（重复段 ' + _repClean + ' 处），已弃用该稿')
          report.rounds.push(summarizeAudit(round, current.audit))
          continue
        }
        if (cleanedChars >= Math.round(countChinese(current.text) * 0.8) && cleanedChars <= overshootLimit) {
          const audit = applyPlatformAudit(await auditChapter(cleaned, { targetWords: input.targetWords, historyHashes, knownNames: castNames, strict: true, protagonistName: input.protagonistName || '', maxAiRate: platformInternalGate > 0 ? platformInternalGate : undefined, maxWords: OFFICIAL_MAX_WORDS, minDialogueRatio: OFFICIAL_MIN_DIALOGUE_RATIO, maxParagraphChars: OFFICIAL_MAX_PARAGRAPH_CHARS }))
          const newNonAi = audit.fails.filter((f) => !/AI\s*率/.test(f))
          if (audit.aiRate < a.aiRate && newNonAi.length === 0 && audit.metrics.chineseChars >= Math.round(input.targetWords * 0.9)) {
            current = { text: cleaned, audit }
            report.repairs.push('去AI味：' + a.aiRate + '% → ' + audit.aiRate + '%（汉字 ' + a.metrics.chineseChars + ' → ' + audit.metrics.chineseChars + '）')
          } else {
            report.repairs.push('去AI味稿未采纳（' + audit.aiRate + '% vs ' + a.aiRate + '%' + (newNonAi.length ? '，且新增问题 ' + newNonAi.length + ' 项' : '') + '）')
          }
        } else {
          report.repairs.push('去AI味稿字数不合（' + cleanedChars + '，需 ' + Math.round(countChinese(current.text) * 0.8) + '~' + overshootLimit + '），已弃用')
        }
        report.rounds.push(summarizeAudit(round, current.audit))
        continue
      }
      if (tooShort && (a.fails.length <= 1 || round >= 3)) {        // 只差字数：续写补足（比整章重写更安全）
        progress('⑤ 补字（第' + (round - 1) + '轮）', '缺 ' + missing + ' 汉字')
        const p = buildExtendPrompt(input, tailOf(current.text, 700), Math.min(1200, missing + 150), collectOpenings(current.text, 16))
        const raw = await call([
          { role: 'system', content: p.system },
          { role: 'user', content: p.user },
        ], { temperature: 0.82, maxTokens: 2600, timeoutMs: Math.min(180000, Math.max(90000, timeLeft() - 60000)), label: '补字' })
        // 🔥 2026-10-22 追加段质检：废段一律不拼（见 looksCorruptSegment 注释）
        //   但"分行碎片"先做回流再判（否则模型只是把句子拆行，整段好内容会被白扔）
        const _rfAdd = reflowFragmentedLines(normalizePunctuation(raw))
        const _rawAdd = _rfAdd.joined > 0 ? _rfAdd.text : normalizePunctuation(raw)
        if (_rfAdd.joined > 0) report.repairs.push('补字稿分行回流×' + _rfAdd.joined)
        const _addBad = looksCorruptSegment(_rawAdd)
        if (_addBad) {
          report.degradeReasons.push('补字稿不合格（' + _addBad + '），已弃用该稿')
          report.rounds.push(summarizeAudit(round, current.audit))
          continue
        }
        const merged = normalizePunctuation(overlapJoin(current.text, normalizePunctuation(_rawAdd)))
        // 🔥 2026-10-21 复读退化稿拒收（补字稿复读会整章崩）
        const _repMerged = countRepeatedParagraphs(merged)
        if (_repMerged >= 3) {
          report.repairs.push('补字稿含复读（重复段 ' + _repMerged + ' 处），已弃用该稿')
          report.rounds.push(summarizeAudit(round, current.audit))
          continue
        }
        // 🔥 补字稿过量拒收（>118% 目标）：超长拼凑稿一律弃用
        if (countWordUnits(merged) > Math.round(input.targetWords * 1.05)) {
          report.degradeReasons.push('补字稿超长(' + countChinese(merged) + ' > ' + Math.round(input.targetWords * 1.05) + ')，已弃用')
        } else {
        const audit = applyPlatformAudit(await auditChapter(merged, { targetWords: input.targetWords, historyHashes, knownNames: castNames, strict: true, protagonistName: input.protagonistName || '', maxAiRate: platformInternalGate > 0 ? platformInternalGate : undefined, maxWords: OFFICIAL_MAX_WORDS, minDialogueRatio: OFFICIAL_MIN_DIALOGUE_RATIO, maxParagraphChars: OFFICIAL_MAX_PARAGRAPH_CHARS }))
        const candidate = { text: merged, audit }
        current = betterVersion(current, candidate, input.targetWords)
        report.repairs.push('补字：' + a.metrics.chineseChars + ' → ' + audit.metrics.chineseChars + ' 汉字（不通过项 ' + a.fails.length + ' → ' + audit.fails.length + '）')
        report.rounds.push(summarizeAudit(round, current.audit))
        }
      } else {
        // 综合问题：定点修复（保剧情、只改问题）
        progress('⑤ 定点修复（第' + (round - 1) + '轮）', '不通过项=' + a.fails.length)
        const instruction = buildRepairInstruction(a, input.targetWords, missing, platformMaxAiRate > 0 ? platformMaxAiRate : undefined)
        const p = buildRepairPrompt(input, current.text, instruction)
        const raw = await call([
          { role: 'system', content: p.system },
          { role: 'user', content: p.user },
        ], {
          temperature: 0.7,
          maxTokens: Math.max(4000, Math.round(countChinese(current.text) * 2.4)),
          timeoutMs: Math.min(240000, Math.max(120000, timeLeft() - 60000)),
          label: '定点修复',
        })
        const repaired = normalizePunctuation(raw)
        // 🔥 2026-10-21 复读退化稿拒收（实测：整章修复稿复读 10+ 处，导致词汇分布归零）
        const _repFixed = countRepeatedParagraphs(repaired)
        if (_repFixed >= 3) {
          report.repairs.push('定点修复稿含复读（重复段 ' + _repFixed + ' 处），已弃用该稿')
          report.rounds.push(summarizeAudit(round, current.audit))
          continue
        }
        // 修复稿必须"更像整章"：字数不得缩水到 70% 以下（模型偷工），也不得暴增到目标 115% 以上
        // 🔥 Bug修复：此前接受过 6007 字的修复稿（target 3000），被收口 clamp 截断后爽点节点全部被切除，
        //   独立复验出现 2246 汉字无爽点平铺段（CH1 FAIL 的根因）
        const repairedChars = countChinese(repaired)
        const overshootLimit = Math.max(1200, Math.round(input.targetWords * 1.05))
        if (repairedChars >= Math.round(countChinese(current.text) * 0.7) && repairedChars <= overshootLimit) {
          const audit = applyPlatformAudit(await auditChapter(repaired, { targetWords: input.targetWords, historyHashes, knownNames: castNames, strict: true, protagonistName: input.protagonistName || '', maxAiRate: platformInternalGate > 0 ? platformInternalGate : undefined, maxWords: OFFICIAL_MAX_WORDS, minDialogueRatio: OFFICIAL_MIN_DIALOGUE_RATIO, maxParagraphChars: OFFICIAL_MAX_PARAGRAPH_CHARS }))
          const candidate = { text: repaired, audit }
          current = betterVersion(current, candidate, input.targetWords)
          report.repairs.push('定点修复：不通过项 ' + a.fails.length + ' → ' + current.audit.fails.length + '，汉字 ' + a.metrics.chineseChars + ' → ' + current.audit.metrics.chineseChars)
        } else if (repairedChars > overshootLimit) {
          report.repairs.push('定点修复稿超长(' + repairedChars + ' > 目标×1.05=' + overshootLimit + ')，已弃用该稿防尾部被截断')
        } else {
          report.repairs.push('定点修复稿字数缩水(' + repairedChars + ' < ' + countChinese(current.text) + '×70%)，已弃用该稿')
        }
        report.rounds.push(summarizeAudit(round, current.audit))
      }
    } catch (e: any) {
      report.degradeReasons.push('第' + (round - 1) + '轮修复失败：' + (e && e.message ? e.message : String(e)))
      break
    }
  }

  // 🔥 2026-10-19：长度兜底——修复轮结束仍明显短于目标（<92%）时，强制补写一次（保字数下限，不再空转修复）
  // 🔥 2026-10-21：阈值 0.92→0.98、补写量 +200→+500。实测模型"要 993 只给 598"，
  //   按缺口原样要会导致最终 2375 字（离 2500 要求差一口气），必须按缺口上浮要。
  // 🔥 2026-10-25 T2（G-01）：触发阈值 0.98 → 0.92——只有跌破下限才保底补写，不再为冲目标反复加戏
  if (countWordUnits(current.text) < Math.round(input.targetWords * 0.9) && timeLeft() > 150000) {
    try {
      const missingHard = Math.max(300, input.targetWords - countChinese(current.text))
      progress('⑤b 长度兜底补写', '缺 ' + missingHard + ' 汉字')
      const pHard = buildExtendPrompt(input, tailOf(current.text, 700), Math.min(1800, missingHard + 700), collectOpenings(current.text, 20))
      const rawHard = await call([
        { role: 'system', content: pHard.system },
        { role: 'user', content: pHard.user },
      ], { temperature: 0.8, maxTokens: 3600, timeoutMs: Math.min(180000, Math.max(90000, timeLeft() - 60000)), label: '长度兜底' })
      // 🔥 2026-10-22 追加段质检：长度兜底是尾段崩坏的重灾区，不合格一律弃用（宁可短）
      //   分行碎片先回流再判（模型只是把句子拆行时，内容仍然可用）
      const _rfHard = reflowFragmentedLines(normalizePunctuation(rawHard))
      if (_rfHard.joined > 0) report.repairs.push('长度兜底稿分行回流×' + _rfHard.joined)
      const _rawHard2 = _rfHard.joined > 0 ? _rfHard.text : normalizePunctuation(rawHard)
      const _hardBad = looksCorruptSegment(_rawHard2)
      const mergedHard = _hardBad ? current.text : normalizePunctuation(overlapJoin(current.text, _rawHard2))
      if (_hardBad) {
        report.degradeReasons.push('长度兜底稿不合格（' + _hardBad + '），已弃用该稿')
      } else if (countWordUnits(mergedHard) > Math.round(input.targetWords * 1.05)) {
        report.degradeReasons.push('长度兜底稿超长(' + countChinese(mergedHard) + ')，已弃用')
      } else {
        const auditHard = applyPlatformAudit(await auditChapter(mergedHard, { targetWords: input.targetWords, historyHashes, knownNames: castNames, strict: true, protagonistName: input.protagonistName || '', maxAiRate: platformInternalGate > 0 ? platformInternalGate : undefined, maxWords: OFFICIAL_MAX_WORDS, minDialogueRatio: OFFICIAL_MIN_DIALOGUE_RATIO, maxParagraphChars: OFFICIAL_MAX_PARAGRAPH_CHARS }))
        const beforeZh = current.audit.metrics.chineseChars
        current = betterVersion(current, { text: mergedHard, audit: auditHard }, input.targetWords)
        report.repairs.push('长度兜底：' + beforeZh + ' → ' + auditHard.metrics.chineseChars + ' 汉字（不通过项 ' + auditHard.fails.length + '）')
        report.rounds.push(summarizeAudit(99, current.audit))
      }
    } catch (e: any) {
      report.degradeReasons.push('长度兜底补写失败：' + (e && e.message ? e.message : String(e)))
    }
  }

  // 收口：超长截断 / 兜底去 AI 清理
  let finalText = current.text
  if (countWordUnits(finalText) > maxVersion) finalText = clampText(finalText, maxVersion)

  // 🔥 2026-10-19：章末钩子兜底——结尾 320 字内无悬念/转折时，补写带钩子的收尾段（蓝图 endHook 优先；带落钩校验重试）
  const _hookOk0 = hasEndingHook(tailOf(finalText, 320))
  report.repairs.push('章末钩子检查：' + (_hookOk0 ? '已落钩' : '缺钩') + '（剩余 ' + Math.round(timeLeft() / 1000) + 's）')
  if (!_hookOk0 && timeLeft() > 90000) {
    progress('⑤c 章末钩子兜底', '结尾无钩，补写收尾段')
    const hookHint = String((input.blueprint && input.blueprint.endHook) || sheet.endHook || '')
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        progress('⑤c 章末钩子兜底' + (attempt ? '(重试)' : ''), hookHint ? hookHint.slice(0, 40) : '通用悬念')
        const sysEnd = '你是番茄小说白金历史文作者，正在为第' + input.chapterNumber + '章《' + input.chapterTitle + '》收尾。语言通俗、画面感强、去 AI 腔，不堆比喻，不写心理总结。'
        const usrEnd = '【前文结尾】\n' + tailOf(finalText, 400) + '\n\n【任务】紧接前文，续写 80-160 字的章末收尾段。' +
          (hookHint ? '\n【本章钩子】' + hookHint + '（用具体动作/台词/物件呈现，不要抽象概述）。' : '') +
          '\n【铁律】\n' +
          '• 只写当前场景里已经出现过的人与物：不得出现前文没有的新人物、刺客、密探、宝藏、密道。\n' +
          '• 必须写成 3-5 个完整句子，句句带标点（。！？）；🔥禁止把一句话拆成好几行，禁止诗化碎片、意象堆叠、无标点短句。\n' +
          '• 每句都要有具体动作或对白，不要抽象抒情。\n' +
          '• 最后一句落在三种形式之一：①悬念疑问（问号结尾，如"这封信，是谁送来的？"）；②突发动作（以"就在这时/忽然/门外/身后"引出，写清谁做了什么）；③未解之谜（话说到一半，省略号结尾）。\n' +
          '• 不要总结、不要感慨、不要"他知道/这一夜只是开始"这类句子。\n' +
          '只输出这一段正文，不要任何解释、标题或括号说明。'
        const rawEnd = await call([
          { role: 'system', content: sysEnd },
          { role: 'user', content: usrEnd + (attempt ? '\n（上一次收尾没有落在悬念上，这次务必按三种钩子形式收尾）' : '') },
        ], { temperature: 0.85, maxTokens: 900, timeoutMs: Math.min(150000, Math.max(60000, timeLeft() - 45000)), label: '章末钩子' + (attempt ? '(重试)' : '') })
        const seg0 = normalizePunctuation(rawEnd).trim()
        const _rfHook = reflowFragmentedLines(seg0)
        const seg = _rfHook.joined > 0 ? _rfHook.text : seg0
        // 🔥 2026-10-22 尾段质检：补钩子是"诗化碎片/时代错位"的高发区（实测出现"干辣椒/褪色龙袍/银簪刺客"）。
        //   宁可这一章不补钩子，也不许把尾段写崩：不合格直接弃用并重试。
        const _hookBad = (() => {
          // 🔥 2026-10-22 判定改为"以闸门为准"：只要收尾确实落在钩子上、且不是碎片/时代错位，就采纳。
          //   原来要求 ≥3 句，把"一句话钩子"（"门外忽然传来一声闷响。"）全拒了，白丢钩子。
          if (countChinese(seg) < 40) return '过短(' + countChinese(seg) + ')'
          if (!hasEndingHook(tailOf(seg, 220))) return '没有落钩'
          return looksCorruptSegment(seg)
        })()
        if (_hookBad) {
          report.degradeReasons.push('章末钩子补写不合格（' + _hookBad + '），弃用该段')
        } else if (countChinese(seg) >= 40 && countChinese(seg) <= 320) {
          const appended = normalizePunctuation(finalText + '\n' + seg)
          const cap = Math.round(input.targetWords * 1.2)
          finalText = countChinese(appended) > cap ? clampText(appended, cap) : appended
          report.repairs.push('章末钩子补写：+' + countChinese(seg) + ' 汉字' + (hasEndingHook(tailOf(finalText, 320)) ? '（已落钩）' : '（未确认落钩）'))
          if (hasEndingHook(tailOf(finalText, 320))) break
        }
      } catch (e: any) {
        report.degradeReasons.push('章末钩子补写失败：' + (e && e.message ? e.message : String(e)))
        break
      }
      if (timeLeft() < 70000) break
    }
  }
  // 🔥 终段硬修复：拆超长段 + 填充语轮换（程序化保证白金标准，不依赖模型自觉）
  const _hardFix = applyHardFixes(finalText)
  finalText = _hardFix.text
  if (_hardFix.note) report.repairs.push('终段硬修复：' + _hardFix.note)
  finalText = normalizePunctuation(finalText)
  // 🔥 2026-10-21 复读护栏（终稿兜底）：免费档模型在长文改写/续写时易陷入复读循环
  //   （同一段对话在章内重复 5~10 次），这是「词汇分布」归零与疑似AI飙升的头号原因。
  //   程序化删除复读段；删除过多（>15%）说明稿件已崩坏 → 标记降级，交人工精修。
  const _ddFinal = dedupeRepeatedParagraphs(finalText)
  if (_ddFinal.removed > 0) {
    const _keepRatio = countChinese(_ddFinal.text) / Math.max(1, countChinese(finalText))
    // 一律采用去重稿：复读段是纯噪声，留着只会把「词汇分布」拖到 0、疑似AI 拉满
    finalText = _ddFinal.text
    report.repairs.push('复读清理：删除重复段落 ' + _ddFinal.removed + ' 处（保留率 ' + Math.round(_keepRatio * 100) + '%）')
    if (_keepRatio < 0.85) {
      report.degradeReasons.push('复读清理后字数不足（保留率 ' + Math.round(_keepRatio * 100) + '%），需补写')
    }
  }
  // 🔥 2026-10-21 终稿再净化一次：定点修复/去AI味/长度兜底都是模型新写的稿，
  //   会重新带回套话、连接词与元信息残留 —— 终稿必须再过一遍净化层。
  try {
    const _dcF = deCliche(finalText)
    if (_dcF.changes.length) {
      finalText = _dcF.text
      report.repairs.push('终稿净化：' + _dcF.changes.slice(0, 6).join('、') + (_dcF.changes.length > 6 ? ' 等' + _dcF.changes.length + '项' : ''))
    }
  } catch (_e) { /* 净化失败不阻塞 */ }
  // 🔥 2026-10-21 时序铁律净化（未称帝前不得自称朕/被称陛下/万岁）
  try {
    const _pf = phaseFix(finalText, input.chapterNumber)
    if (_pf.changes.length) {
      finalText = _pf.text
      report.repairs.push('时序净化：' + _pf.changes.join('、'))
    }
  } catch (_e) { /* 净化失败不阻塞 */ }

  // ============================================================
  // 🔥 2026-10-22 终稿复检：此前的 degradeReasons 是中途产生的（补写/擦除/钩子都在之后），
  //   按旧记录判闸门会误杀 → 用最终文本重跑一次，只保留仍然成立的问题。
  try {
    const _finalAudit = applyPlatformAudit(await auditChapter(finalText, {
      targetWords: input.targetWords,
      historyHashes,
      knownNames: castNames,
      strict: true,
      protagonistName: input.protagonistName,
      maxWords: OFFICIAL_MAX_WORDS,
      minDialogueRatio: OFFICIAL_MIN_DIALOGUE_RATIO,
      maxParagraphChars: OFFICIAL_MAX_PARAGRAPH_CHARS,
    }))
    report.degradeReasons = report.degradeReasons.filter((d) => !/字数不足|正文过短|断章钩子|与已写章节重复|爽点节拍不足|爽点类型单一|混入元叙事|脚手架/.test(String(d)))
    for (const f of (_finalAudit.fails || [])) {
      if (/AI\s*率/.test(String(f))) continue
      report.degradeReasons.push('终稿复检：' + f)
    }
    // 终稿再擦一遍跨章复制（后面几段补写可能又把上一章的句子带回来）
    const _copF = scrubPrevEndingCopies(finalText, prevEnding)
    if (_copF.removed > 0) {
      finalText = _copF.text
      report.repairs.push('终稿跨章复制擦除×' + _copF.removed + '句')
    }
  } catch (_e) { /* 不阻塞 */ }

  // 🔥🔥 2026-10-21 ⑤d 疑似段落定向重写（自建朱雀口径闭环）——放在最后
  // ------------------------------------------------------------
  // 跑我们自己的判定器 → 取出被判「疑似AI」的段落及其扣分理由 →
  // 让模型【只改写这些段落】→ 回填 → 复检（最多 3 轮），直到疑似占比 ≤5%。
  // 为什么放在最后：章末钩子补写、长度兜底都是后面才追加的，
  //   放在它们之前改写会被后加的内容再次污染（实测：改到 7.7% 又被钩子段拉回 17%）。
  // 判定器的段落级疑似度可解释（无对白/少器物/心理直述/清单罗列/段首重复…），
  //   把理由直接喂给模型 = 精准定向修复；只改少数段落，模型任务短、稳、不会复读。
  // ============================================================
  try {
    const _zqTarget = 5
    for (let _zqRound = 1; _zqRound <= 3; _zqRound++) {
      if (timeLeft() < 120000) break
      const _zq = runZhuqueProxy(finalText, { target: _zqTarget, threshold: 2.0 })
      const _susParas = (_zq.segments || []).filter((s: any) => s && s.label === 2 && s.text)
      report.zqSuspect = _zq.suspectedRatio
      report.zqDims = (_zq.dimensions || []).map((d: any) => d.name + ':' + d.score)
      if (!_susParas.length || _zq.suspectedRatio <= _zqTarget) {
        report.repairs.push('自建朱雀口径：疑似占比 ' + _zq.suspectedRatio + '%（≤' + _zqTarget + '%，达标）')
        break
      }
      progress('⑤d 疑似段落定向重写（第' + _zqRound + '轮）', '疑似占比 ' + _zq.suspectedRatio + '%，疑似段 ' + _susParas.length + ' 段')
      // 🔥 2026-10-22 目标改为「段落索引集合」：
      //   ① 朱雀疑似段 → 落到段落（用 12 字探针在疑似块里找）
      //   ② oh-story 模板句命中段（否定翻转/音量反差/否定排比/预告式收尾…）→ 直接入目标
      //   好处：改写有明确的问题标签可写进提示词（模型知道要改什么），
      //   且回填按段落索引做，不再依赖原文匹配（朱雀疑似段是跨段合并块，匹配必失败）。
      const _finalParas = finalText.split('\n')
      const _ohFindings = findOhStoryPatterns(finalText)
      const _ohByPara = ohIssuesByPara(_ohFindings)
      const _targetIdx = new Set<number>()
      for (let i = 0; i < _finalParas.length; i++) {
        const _probe = _finalParas[i].trim().slice(0, 12)
        if (_probe.length < 8) continue
        for (const s of _susParas) {
          if (String((s as any).text || '').includes(_probe)) { _targetIdx.add(i); break }
        }
      }
      for (const pi of _ohByPara.keys()) if (pi >= 0 && pi < _finalParas.length) _targetIdx.add(pi)
      const _targetList = Array.from(_targetIdx).sort((a, b) => a - b).slice(0, 12)
      if (!_targetList.length) {
        report.repairs.push('自建朱雀口径：疑似段均在尾段（已保护），跳过改写')
        break
      }
      const _ask = _targetList.map((pi, i) => {
        const _probe = _finalParas[pi].trim().slice(0, 12)
        let _reason = '叙述过于模板化'
        for (const s of _susParas) {
          if (String((s as any).text || '').includes(_probe)) { _reason = ((s as any).reasons || []).join('、') || _reason; break }
        }
        const _issues = _ohByPara.get(pi) || []
        return '§' + (i + 1) + '｜扣分理由：' + _reason + (_issues.length ? '；句式问题：' + _issues.join('；') : '') + '\n原文：' + _finalParas[pi]
      }).join('\n\n')
      const _sys = '你是中文历史网文的定稿作者，正在按逐段诊断改写正文。只输出改写后的段落，每段一行，行首用 §编号 标记，不要解释、不要标题。'
      const _usr = [
        '【逐段改写任务】下列每段被判为"疑似AI写作"，请按扣分理由逐段改写。',
        '',
        '【改写规则】',
        '1. 严格保留该段的情节、人物动作、对白信息与事实细节；只改写措辞、句式与意象。',
        '2. 每段必须落到【具体动作 + 具体物件 + 身体感】，禁止抽象概括与心理总结（如"心里一沉/他知道/这意味着"）。',
        '3. 禁止套话词：眼中闪过一丝、一抹、缓缓、轻轻、不禁、仿佛、如遭雷击、深吸一口气、意味深长、鸦雀无声、心中波澜起伏、内心翻江倒海等，一律不用。',
        '4. 禁止议论文连接词：因此、于是、而且、此外、事实上、总之、也就是说。',
        '5. 禁止口号式收尾：他深知…、他们相信…、将肩负…重任、关乎…命运、更关乎…未来、这一夜只是开始、才刚刚开始。',
        '6. 【oh-story 定稿铁律】出现下列句式一律改写（每条后面都有具体改法）：',
        '   · 「不是A，而是B / 是A，不是B」→ 删掉否定铺垫，直接写后项，或改成动作呈现。',
        '   · 「声音不大…却…」→ 删掉音量铺垫，直接写声音落进场子的具体效果。',
        '   · 「没有X，没有Y，」否定排比 → 保留最有信息量的一条，改成直陈。',
        '   · 章末「没人知道 / 这才刚刚开始 / 命运的齿轮 / 这一夜注定…」→ 不替读者预告或盖章，落到具体画面、器物、文书或未解之事。',
        '7. 段与段之间不得用相同句式起头（首句前几个字不得与别段重复）。',
        '8. 有对白就写对白（口语、允许插话与停顿）；无对白的段落必须加入动作与器物细节。',
        '9. 句子长短交错：允许三五字碎句；禁止连续三句长度相近。',
        '10. 输出格式：每段一行，以 §编号 开头，编号与输入一致，顺序一致，段数必须相同。',
        '',
        _ask,
      ].join('\n')
      try {
        const _raw = await call([
          { role: 'system', content: _sys },
          { role: 'user', content: _usr },
        ], { temperature: 0.88, maxTokens: Math.max(2400, Math.round(countChinese(finalText) * 1.6)), timeoutMs: Math.min(240000, Math.max(90000, timeLeft() - 60000)), label: '疑似段落重写', presencePenalty: 0, frequencyPenalty: 0 })
        const _lines = normalizePunctuation(_raw).split('\n').map((x: string) => x.trim()).filter(Boolean)
        const _map = new Map<number, string>()
        for (const _ln of _lines) {
          const _m = _ln.match(/^§\s*(\d+)\s*[｜|:：]?\s*([\s\S]+)$/)
          if (_m && _m[2] && _m[2].length > 8) _map.set(Number(_m[1]), _m[2].trim())
        }
        if (!_map.size && _lines.length === _targetList.length) {
          _lines.forEach((_ln, _i) => { if (_ln.length > 8) _map.set(_i + 1, _ln) })
        }
        if (!_map.size) {
          report.degradeReasons.push('疑似段落重写：模型未按 §编号 输出，已跳过本轮')
          break
        }
        // 🔥 2026-10-22 回填改为「按段落索引整段替换」：不再依赖原文匹配
        //   （朱雀疑似段是跨段合并块，indexOf/探针都定位不到 → 整轮跳过、疑似卡 6.4%）
        const _paras2 = finalText.split('\n')
        const _lastIdx = _paras2.length - 1
        let _applied = 0
        for (let _i = 0; _i < _targetList.length; _i++) {
          const _newText = _map.get(_i + 1)
          const _pi = _targetList[_i]
          if (!_newText || _pi === undefined || _pi < 0 || _pi >= _paras2.length) continue
          const _old = _paras2[_pi]
          if (!_old || !_old.trim()) continue
          if (_newText.length < _old.length * 0.45) continue
          // 末段保护：改写后必须仍留悬念，否则回退该段（保住章末钩子）
          if (_pi === _lastIdx && !hasEndingHook(tailOf(_newText, 220))) continue
          _paras2[_pi] = _newText
          _applied++
        }
        let _joined = _paras2.join('\n')
        if (_applied > 0) {
          finalText = deCliche(_joined).text
          const _zq2 = runZhuqueProxy(finalText, { target: _zqTarget, threshold: 2.0 })
          const _ohAfter = findOhStoryPatterns(finalText)
          const _ohBlock = _ohAfter.filter(f => f.severity === 'blocking').length
          report.repairs.push('疑似段落重写：改写 ' + _applied + ' 段，疑似占比 ' + _zq.suspectedRatio + '% → ' + _zq2.suspectedRatio + '%' +
            (_ohBlock ? '，oh-story 模板句剩余 ' + _ohBlock + ' 处' : '，oh-story 模板句清零'))
          report.zqSuspect = _zq2.suspectedRatio
          report.zqDims = (_zq2.dimensions || []).map((d: any) => d.name + ':' + d.score)
          if (_zq2.suspectedRatio <= _zqTarget && !_ohBlock) break
          // 改写没有改善 → 不再空转
          if (_zq2.suspectedRatio >= _zq.suspectedRatio && _ohBlock >= _ohFindings.filter(f => f.severity === 'blocking').length) break
        } else {
          report.degradeReasons.push('疑似段落重写：未能应用改写（' + _map.size + ' 段候选，样例改「' + String(_map.get(1) || '').slice(0, 20) + '」），本轮跳过')
          break
        }
      } catch (e: any) {
        report.degradeReasons.push('疑似段落重写失败：' + (e && e.message ? e.message : String(e)))
        break
      }
    }
  } catch (e: any) {
    report.degradeReasons.push('自建口径复检失败：' + (e && e.message ? e.message : String(e)))
  }
  // 🔥 2026-10-22 最终补钩保险（必须是最后一次改正文）：
  //   实测 ch6(2625字)/ch7(2431字)/ch8 正文全达标，只因"章末缺钩"被退回重跑，每次白烧 10 分钟。
  //   前面的补钩会被终段硬修复/复读清理/⑤d改写吃掉，所以放在终稿质检之前再补一次。
  if (!hasEndingHook(tailOf(finalText, 320)) && timeLeft() > 60000) {
    try {
      const hookHint2 = String((input.blueprint && input.blueprint.endHook) || sheet.endHook || '')
      const sysEnd2 = '你是番茄小说白金历史文作者，正在为第' + input.chapterNumber + '章《' + input.chapterTitle + '》收尾。语言通俗、画面感强、去 AI 腔。'
      const usrEnd2 = '【前文结尾】\n' + tailOf(finalText, 400) + '\n\n【任务】紧接前文，写 60-120 字的收尾段。' +
        (hookHint2 ? '\n【本章钩子】' + hookHint2 : '') +
        '\n【铁律】\n' +
        '• 只写前文已出现过的人与物，不得出现新人物、刺客、密探、宝藏、密道。\n' +
        '• 2-4 个完整句子，句句带标点，禁止分行碎片。\n' +
        '• 最后一句必须是悬念：问句（问号结尾）／未解之事（省略号结尾）／突发动作（以"就在这时、忽然、门外、身后"引出）。\n' +
        '• 不要总结、不要感慨。只输出这一段正文。'
      const rawEnd2 = await call([
        { role: 'system', content: sysEnd2 },
        { role: 'user', content: usrEnd2 },
      ], { temperature: 0.85, maxTokens: 500, timeoutMs: Math.min(120000, Math.max(45000, timeLeft() - 30000)), label: '收口补钩' })
      const seg2 = reflowFragmentedLines(normalizePunctuation(rawEnd2)).text
      if (countChinese(seg2) >= 30 && hasEndingHook(tailOf(seg2, 220)) && !looksCorruptSegment(seg2)) {
        finalText = normalizePunctuation(finalText + '\n' + seg2)
        report.repairs.push('收口补钩：+' + countChinese(seg2) + ' 汉字')
      } else {
        report.degradeReasons.push('收口补钩不合格，已跳过')
      }
    } catch (_e) { /* 不阻塞 */ }
  }
  // 🔥 2026-10-22 终稿前再擦一次历史撞句（⑤d改写/收口补钩可能把旧章句子带回来）
  try {
    const _hisF = scrubHistoryOverlaps(finalText, historyHashes)
    if (_hisF.removed > 0) {
      finalText = _hisF.text
      report.repairs.push('终稿历史撞句擦除×' + _hisF.removed + '句（余' + _hisF.remaining + '处）')
    }
  } catch (_e) { /* 不阻塞 */ }
  // 🔥 2026-10-19：终稿质检一律重算（确定性清理可能改过文本，避免复用旧结论）
  const finalAudit = applyPlatformAudit(await auditChapter(finalText, { targetWords: input.targetWords, historyHashes, knownNames: castNames, strict: true, protagonistName: input.protagonistName || '', maxAiRate: platformInternalGate > 0 ? platformInternalGate : undefined, maxWords: OFFICIAL_MAX_WORDS, minDialogueRatio: OFFICIAL_MIN_DIALOGUE_RATIO, maxParagraphChars: OFFICIAL_MAX_PARAGRAPH_CHARS }))

  report.chineseChars = finalAudit.metrics.chineseChars
  report.totalChars = finalAudit.metrics.totalChars
  report.elapsedMs = nowMs() - started
  report.stage = finalAudit.passed ? 'ok' : 'degraded'
  if (judgeScore > 0) {
    report.judgeScore = judgeScore
    report.judgeIssues = judgeIssues
  }
  if (!finalAudit.passed) {
    report.degradeReasons.push('未通过闸门：' + finalAudit.fails.slice(0, 4).join('；'))
  }

  // ============================================================
  // 7. 落账（断章台账）
  // ============================================================
  try {
    const entry = buildLedgerChapter({
      chapterNumber: input.chapterNumber,
      title: input.chapterTitle,
      text: finalText,
      locations: sheet.beats.map((b) => b.place).filter(Boolean),
      cast: Array.from(new Set([
        ...castNames.filter((n) => finalText.indexOf(n) >= 0),
        ...sheet.beats.flatMap((b) => b.cast || []),
      ])).slice(0, 20),
      shuangMarkers: finalAudit.metrics.shuangMarkers,
    })
    await recordChapter(novelKey, String(input.novelTitle || ''), entry)
    progress('⑦ 断章台账已记录', 'key=' + novelKey + ' 汉字=' + entry.chineseChars + ' ngram=' + entry.ngrams.length)
  } catch (e: any) {
    report.degradeReasons.push('台账记录失败：' + (e && e.message ? e.message : String(e)))
  }

  // 🔥 2026-10-25 T2 反修复：终稿统一确定性门禁（清洗 → 检测 → 五维 → 单一 verdict）
  //   不接受 S1（硬性废稿）时写入 degradeReasons 供上层处置；S2/S3 记为 repairs 供复测统计。
  try {
    const _qgClean = cleanChapterText(finalText)
    if (_qgClean.changes.length) {
      finalText = _qgClean.text
      report.repairs.push('终稿确定性清洗：' + _qgClean.changes.join(' + '))
      report.chineseChars = countChinese(finalText)
    }
    const _qg = runChapterQualityGate(finalText, {
      chapterNumber: input.chapterNumber,
      genre: String(input.genre || ''),
      userTargetWords: input.targetWords,
      chapterTitle: String(input.chapterTitle || ''),
      historyHashes,
      prevEnding: String(input.prevEnding || ''),
    })
    report.repairs.push('章级统一门禁：' + summarizeQGate(_qg))
    report.fiveDim = _qg.scores
    report.qgVerdict = _qg.verdict
    if (_qg.findings.some((f) => f.severity === 'S1')) {
      report.degradeReasons.push('章级统一门禁 S1：' + _qg.findings.filter((f) => f.severity === 'S1').map((f) => f.rule + '(' + f.message + ')').join('；'))
    }
    progress('⑧ 章级统一门禁', _qg.verdict + ' 五维总' + _qg.scores.total + ' 阻塞' + _qg.blocking.length)
  } catch (_e: any) {
    report.degradeReasons.push('章级统一门禁执行异常（不阻塞）：' + (_e && _e.message ? _e.message : String(_e)))
  }

  progress('✅ 完成', '阶段=' + report.stage + ' 汉字=' + report.chineseChars + ' 场景=' + report.scenes + ' 调用=' + report.llmCalls + ' 耗时=' + Math.round(report.elapsedMs / 1000) + 's')
  return { content: finalText, report }
}
