import { NextResponse } from 'next/server'

// GET /api/ollama/models - 获取 Ollama 已安装的模型列表
// 🔥 2026-08-10：baseUrl 读取 OLLAMA_BASE_URL（支持逗号分隔多家，如 公司,本地），
//    不再硬编码 localhost，使设置页能显示远程公司服务器模型
export async function GET() {
  try {
    const baseUrls = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const allModels: Array<{ name?: string; size?: number; modified?: string; baseUrl: string }> = []
    let lastError = ''

    for (const baseUrl of baseUrls) {
      try {
        const response = await fetch(baseUrl.replace(/\/$/, '') + '/api/tags', {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) {
          lastError = 'Ollama未运行或无法连接(' + baseUrl + ')'
          continue
        }
        const data = await response.json()
        for (const m of data.models || []) {
          allModels.push({ name: m.name, size: m.size, modified: m.modified_at, baseUrl })
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : '无法连接Ollama(' + baseUrl + ')'
      }
    }

    if (allModels.length === 0) {
      return NextResponse.json({
        success: false,
        error: lastError || 'Ollama未运行或无法连接',
      }, { status: 503 })
    }

    return NextResponse.json({ success: true, models: allModels })
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : '无法连接Ollama',
    }, { status: 503 })
  }
}
