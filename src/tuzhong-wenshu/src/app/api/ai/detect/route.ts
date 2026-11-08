import { NextResponse } from 'next/server'
import { resolveLLMConfig } from '@/lib/resolve-llm-config'
import { verifyToken } from '@/lib/auth'
import { runAiDetection } from '@/lib/ai/detection'
import { guardAiEndpoint, chargeAiUsage } from '@/lib/quota'

// ============================================================
// 朱雀AI检测引擎 - 基于番茄小说2026年5月最新标准
//
// 🔥 2026-09-06：检测实现已抽取到 @/lib/ai/detection 共享模块（runAiDetection），
//   本路由只保留 HTTP 层职责（参数校验 + 模型配置解析），检测逻辑与
//   /api/ai/final-check 完全共用同一份代码，避免两处漂移。
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

    // 🔥 修复（P1 计量缺失）：AI 接口此前不限频、不计额，注册即可无限调用；
    //   dailyQuotaUsed/dailyQuotaLimit/ai_daily_free_quota 全仓零写入零校验。
    { const _g = await guardAiEndpoint(request, 'detect', userId || null, false, 1)
      if (!_g.ok) return NextResponse.json({ error: _g.message, code: _g.status }, { status: _g.status })
      await chargeAiUsage(_g.userId, false, 1) }

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

    const resolvedCfg = llmConfig ? resolveLLMConfig(llmConfig as any, userId, 'compliance') : null

    const result = await runAiDetection(text, resolvedCfg)

    // 🔥 2026-10-20：口径透明——站内引擎是「自研估测」，不是朱雀官方检测结果。
    //   官方判定须走 matrix.tencent.com/ai-detect 或 EdgeOne Makers API（labels_ratio 里 2=疑似AI）。
    const payload: any = {
      data: {
        ...result,
        source: 'platform-estimate',
        isOfficialZhuque: false,
        disclaimer: '站内自研算法估测值，非朱雀官方检测结果；官方判定请使用朱雀网页版或 EdgeOne Makers API。',
      },
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('[AI Detect] 检测过程中发生错误:', error)
    return NextResponse.json(
      { error: '检测过程中发生错误，请重试' },
      { status: 500 }
    )
  }
}
