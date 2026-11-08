/**
 * 章节级拆解骨架（Chapter Blueprint）
 * ============================================================
 * 在「书目级拆书」之上再抽象一层【结构 / 节奏】骨架：
 *   - 黄金三章各自承担什么
 *   - 单章循环结构
 *   - 节奏模板（小高潮 / 大高潮 / 信息差）
 *   - 伏笔埋设与回收周期
 *   - 爽点类型清单
 *   - 仿写禁止复制的原书专名 / 事件清单
 *
 * 只输出结构，不输出原书人名、地名、门派名、事件专名，也不复制原书句子。
 * 所有失败（无模型配置 / 调用异常 / JSON 解析失败 / 字段全空）一律返回 null，绝不抛异常。
 */

import { callLLMWithFallback } from '@/lib/ai/llm'
import type { LLMConfig } from '@/lib/ai/llm'
import { lenientParseJSON } from '@/lib/ai/json-lenient'

export interface ChapterBlueprint {
  goldenThree: string[]        // 黄金三章分别承担什么（3 条）
  chapterLoop: string[]        // 单章循环结构步骤，如 目标→阻碍→转折→爽点→钩子
  rhythm: string[]             // 节奏模板，如 每5章小高潮 / 每20章大高潮 / 每3章一个信息差
  foreshadowCycle: string[]    // 伏笔埋设与回收周期
  shuangPointTypes: string[]   // 爽点类型清单
  avoidList: string[]          // 仿写禁止复制的原书专名/事件（明确列出不要抄人名地名门派名）
}

const CHAPTER_BLUEPRINT_PROMPT = `你是一位网文结构分析师。请只抽象目标作品的【结构与节奏】，产出一份可复用的"章节级仿写骨架"。

【🔥 铁律·必须遵守】
1. 只抽象结构与节奏，不得输出原书人名、地名、门派名、事件专名；不得复制原书句子。
2. 所有条目用抽象的功能描述表达（如"开篇即让主角陷入必死困境""第三章末揭晓金手指代价"），不写具体专名。
3. avoidList 中必须明确列出"不要抄原书人名/地名/门派名/事件专名"这一约束，并可列举你需要提醒的抽象类别（如"原书主角姓名""原书宗门名称""原书标志性事件"），但同样不得写出任何真实专名。
4. 只输出严格 JSON，禁止 markdown、禁止解释文字。

【输出 JSON 结构】
{
  "goldenThree": ["第一章承担：...", "第二章承担：...", "第三章承担：..."],
  "chapterLoop": ["目标", "阻碍", "转折", "爽点", "钩子"],
  "rhythm": ["每5章一个小高潮：...", "每20章一个大高潮：...", "每3章一个信息差：..."],
  "foreshadowCycle": ["短伏笔：埋设后3-5章内回收", "长伏笔：跨卷埋设，卷末回收"],
  "shuangPointTypes": ["打脸", "越级碾压", "身份揭晓", "宝物/机缘获取", "复仇解气"],
  "avoidList": ["禁止复刻原书主角姓名", "禁止复刻原书地名与门派名", "禁止复刻原书标志性事件"]
}

所有字段必须是字符串数组，每条 4-40 字，数量 3-8 条（goldenThree 必须恰好 3 条）。`

function toStrArray(v: any, limit: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const item of v) {
    let s = ''
    if (typeof item === 'string') s = item
    else if (item && typeof item === 'object') s = String(item.text || item.name || item.desc || item.value || '')
    if (!s) continue
    s = s.trim()
    if (s) out.push(s)
    if (out.length >= limit) break
  }
  return out
}

function extractJsonText(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fence ? fence[1] : raw
  const s = body.indexOf('{')
  const e = body.lastIndexOf('}')
  if (s === -1 || e === -1 || e <= s) return body
  return body.slice(s, e + 1)
}

export async function deconstructChapterBlueprint(opts: {
  bookName: string
  bookMeta?: any           // book-search 返回的书目元数据
  sampleText?: string      // 可选正文样本
  llmConfig?: any
}): Promise<ChapterBlueprint | null> {
  try {
    if (!opts || !opts.bookName || !String(opts.bookName).trim()) return null
    const cfg = opts.llmConfig as LLMConfig | undefined
    if (!cfg || !cfg.apiKey || !cfg.model) return null

    let metaBrief = ''
    if (opts.bookMeta && typeof opts.bookMeta === 'object') {
      try {
        const meta = opts.bookMeta
        const lines: string[] = []
        if (meta.genre) lines.push('题材：' + meta.genre)
        if (meta.chapterCount) lines.push('章节数：' + meta.chapterCount)
        if (meta.wordCount) lines.push('总字数：' + meta.wordCount)
        if (meta.status) lines.push('状态：' + meta.status)
        if (Array.isArray(meta.tags) && meta.tags.length > 0) lines.push('标签：' + meta.tags.slice(0, 12).join('、'))
        if (Array.isArray(meta.keywords) && meta.keywords.length > 0) lines.push('关键词：' + meta.keywords.slice(0, 12).join('、'))
        if (meta.synopsis) lines.push('简介：' + String(meta.synopsis).slice(0, 300))
        metaBrief = lines.join('\n')
      } catch (_me) { metaBrief = '' }
    }

    const userPrompt = [
      '目标作品：《' + String(opts.bookName).trim() + '》',
      metaBrief ? '【书目信息】\n' + metaBrief : '',
      opts.sampleText ? '【正文样本（仅用于归纳结构，禁止照抄句子与专名）】\n' + String(opts.sampleText).slice(0, 4000) : '',
      '请按要求输出章节级仿写骨架 JSON。',
    ].filter(Boolean).join('\n\n')

    const res = await callLLMWithFallback(
      cfg,
      [
        { role: 'system', content: '你是网文结构分析师，只输出严格 JSON，不要任何额外文字。' },
        { role: 'user', content: CHAPTER_BLUEPRINT_PROMPT + '\n\n' + userPrompt },
      ],
      undefined,
      { temperature: 0.35, maxTokens: 2500 }
    )

    const raw = (res && res.content) ? String(res.content) : ''
    if (!raw.trim()) return null

    let parsed: any = null
    try {
      parsed = JSON.parse(extractJsonText(raw))
    } catch (_e) {
      try { parsed = lenientParseJSON(raw) } catch (_le) { parsed = null }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

    const blueprint: ChapterBlueprint = {
      goldenThree: toStrArray(parsed.goldenThree, 3),
      chapterLoop: toStrArray(parsed.chapterLoop, 12),
      rhythm: toStrArray(parsed.rhythm, 12),
      foreshadowCycle: toStrArray(parsed.foreshadowCycle, 12),
      shuangPointTypes: toStrArray(parsed.shuangPointTypes, 12),
      avoidList: toStrArray(parsed.avoidList, 12),
    }

    // 全部字段为空视为无效结果
    const total = blueprint.goldenThree.length + blueprint.chapterLoop.length + blueprint.rhythm.length +
      blueprint.foreshadowCycle.length + blueprint.shuangPointTypes.length + blueprint.avoidList.length
    if (total === 0) return null

    return blueprint
  } catch (e) {
    console.warn('[story-deconstruct] 章节骨架拆解失败（已忽略）:', e)
    return null
  }
}
