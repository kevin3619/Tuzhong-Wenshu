import { NextRequest, NextResponse } from 'next/server'
import { callLLM, type LLMMessage } from '@/lib/ai/llm'

// 修复 v4 C8：API Key 改为通过 POST 请求体传递，不再暴露在 URL 查询参数中
// GET /api/settings/llm - 已废弃，保留仅用于向后兼容（不读取敏感参数）
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: '此接口已升级为 POST 请求，请通过 POST 请求体传递参数以保护 API Key 安全'
  }, { status: 405 })
}

// POST /api/settings/llm - 测试AI模型连接 / 调用AI模型（通用接口）
// 请求体: { provider, apiKey, baseUrl, model, messages? }
//   - 不传 messages: 测试连接（发送默认消息）
//   - 传 messages: 调用AI模型
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, apiKey, baseUrl, model, messages } = body

    if (!apiKey) {
      return NextResponse.json({ success: false, error: '请提供API Key' }, { status: 400 })
    }

    // 无 messages 时为测试连接模式
    if (!messages) {
      try {
        const result = await callLLM(
          { provider, apiKey, baseUrl, model },
          [{ role: 'user' as const, content: '请回复"连接成功"' }]
        )
        return NextResponse.json({ success: true, message: '连接成功', response: result })
      } catch (err) {
        return NextResponse.json({
          success: false,
          error: err instanceof Error ? err.message : '连接失败'
        }, { status: 500 })
      }
    }

    // 有 messages 时为通用调用模式
    const result = await callLLM({ provider, apiKey, baseUrl, model }, messages as LLMMessage[])
    return NextResponse.json({ success: true, content: result })
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : '调用失败'
    }, { status: 500 })
  }
}
