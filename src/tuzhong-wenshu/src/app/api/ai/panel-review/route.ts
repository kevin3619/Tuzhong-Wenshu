import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { resolveLLMConfig } from '@/lib/resolve-llm-config'
import { runPanelReview } from '@/lib/ai/panel-review'
import { guardAiEndpoint, chargeAiUsage } from '@/lib/quota'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      content,
      chapterTitle,
      chapterSummary,
      genre,
      characters,
      previousChapterEnding,
      llmConfig,
    } = body || {}

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { success: false, error: '请提供需要评审的章节正文' },
        { status: 400 }
      )
    }

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
    { const _g = await guardAiEndpoint(request, 'panel-review', userId || null, false, 3)
      if (!_g.ok) return NextResponse.json({ error: _g.message, code: _g.status }, { status: _g.status })
      await chargeAiUsage(_g.userId, false, 3) }

    const resolvedCfg = resolveLLMConfig((llmConfig || {}) as any, userId, 'contractScore')
    if (!resolvedCfg || !resolvedCfg.apiKey) {
      return NextResponse.json(
        { success: false, error: '请先配置AI模型（需要API Key）' },
        { status: 400 }
      )
    }

    const data = await runPanelReview({
      content,
      chapterTitle,
      chapterSummary,
      genre,
      characters,
      previousChapterEnding,
      llmConfig: resolvedCfg,
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[AI Panel Review] 三方评审失败:', error)
    const errMsg = error instanceof Error ? error.message : '三方评审服务异常，请稍后重试'
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    )
  }
}
