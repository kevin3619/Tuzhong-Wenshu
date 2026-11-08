/**
 * 🔥 逐章精写引擎（chapter-engine）· 对外入口
 *
 * 用法（在 /api/ai-generate 的 case 'content' 里）：
 *   const out = await runChapterEngine({...})
 *   if (out.content) return 统一清洗后的正文
 *   else 回退旧单次生成流程
 *
 * 引擎会把上一次生成的质检报告存到进程内（含并发场景的多份缓存），
 * 由路由层合并进响应 _meta.engineReport，便于前端/验收脚本查看：
 *   字数、爽点数、对话占比、AI 率、复读数、跨章重复数、每轮修复记录、实际使用模型。
 */

import { runChapterEngine } from './engine'
import type { ChapterEngineInput, EngineOutput, EngineReport } from './types'

export type { ChapterEngineInput, EngineOutput, EngineReport } from './types'
export { runChapterEngine } from './engine'

/** 进程内报告缓存（多章并发时按章号+时间取最近一份） */
const RECENT_REPORTS: Array<{ chapterNumber: number; at: number; report: EngineReport }> = []
const MAX_REPORTS = 24

function remember(report: EngineReport): void {
  try {
    RECENT_REPORTS.push({ chapterNumber: report.chapterNumber, at: Date.now(), report })
    while (RECENT_REPORTS.length > MAX_REPORTS) RECENT_REPORTS.shift()
  } catch (_e) { /* ignore */ }
}

/** 取最近一次引擎报告（可指定章号；找不到返回 null） */
export function getLastEngineReport(chapterNumber?: number): EngineReport | null {
  try {
    if (typeof chapterNumber === 'number') {
      for (let i = RECENT_REPORTS.length - 1; i >= 0; i--) {
        if (RECENT_REPORTS[i].chapterNumber === chapterNumber) return RECENT_REPORTS[i].report
      }
    }
    const last = RECENT_REPORTS[RECENT_REPORTS.length - 1]
    return last ? last.report : null
  } catch (_e) {
    return null
  }
}

/** 引擎开关：engineMode='legacy' 或 CONTENT_ENGINE=legacy / off 时关闭 */
export function isChapterEngineEnabled(engineMode?: unknown): boolean {
  const mode = String(engineMode || '').toLowerCase()
  if (mode === 'legacy' || mode === 'off' || mode === 'false') return false
  const env = String(process.env.CONTENT_ENGINE || '').toLowerCase()
  if (env === 'legacy' || env === 'off' || env === 'false' || env === '0') return false
  return true
}

/** 带报告缓存的引擎调用（路由层唯一入口） */
export async function runChapterEngineWithReport(input: ChapterEngineInput): Promise<EngineOutput> {
  const out = await runChapterEngine(input)
  remember(out.report)
  return out
}
