import { NextResponse } from 'next/server'
import { callLLMWithFallback, type LLMConfig, type LLMMessage } from '@/lib/ai/llm'
import { resolveLLMConfig } from '@/lib/resolve-llm-config'
import { verifyToken } from '@/lib/auth'

interface CharacterInfo {
  id?: string
  name?: string
  role?: string
  desc?: string
  description?: string
  background?: string
  color?: string
  traits?: string[]
  age?: string
  gender?: string
}

interface GenerateRequest {
  type: string
  character: CharacterInfo
  llmConfig?: {
    provider: string
    apiKey: string
    baseUrl?: string
    model?: string
  }
}

function buildBackstoryPrompt(character: CharacterInfo): { system: string; user: string } {
  const name = character.name || '未命名角色'
  const role = character.role || '角色'
  const desc = character.desc || character.description || ''
  const existingBg = character.background || ''
  const traits = character.traits?.join('、') || ''
  const age = character.age || ''
  const gender = character.gender || ''

  const system = `你是一位专业的小说角色设定师，擅长为小说角色创作深度背景故事。你的写作风格生动、细腻，能够通过背景故事展现角色的性格成因和命运走向。

要求：
1. 背景故事需要300-500字
2. 要体现角色的性格成因
3. 要埋下未来发展的伏笔
4. 语言要有文学性，避免平铺直叙
5. 要与角色的定位(${role})相匹配
6. 只输出背景故事文本，不要输出任何额外说明`

  let user = `请为以下角色生成背景故事：\n\n角色名：${name}\n角色定位：${role}`
  if (gender) user += `\n性别：${gender}`
  if (age) user += `\n年龄：${age}`
  if (desc) user += `\n角色描述：${desc}`
  if (traits) user += `\n性格特征：${traits}`
  if (existingBg) user += `\n已有背景（可在此基础上扩展或重写）：${existingBg}`

  return { system, user }
}

export async function POST(request: Request) {
  try {
    const body: GenerateRequest = await request.json()
    const { type, character, llmConfig } = body

    if (!character || !character.name) {
      return NextResponse.json(
        { error: '缺少角色信息' },
        { status: 400 }
      )
    }

    // 修复：从 Authorization 头获取当前 userId（用于管理员共享模型的权限判定）
    let userId: string | undefined
    try {
      const authHeader = request.headers.get('Authorization') || ''
      const token = authHeader.replace('Bearer ', '')
      if (token) {
        const decoded = await verifyToken(token)
        if (decoded) userId = decoded.userId
      }
    } catch (_e) {}

    if (type === 'backstory') {
      // 修复：如果是管理员共享模型（apiKey 是 ***），从 models.json 读取真实 apiKey
      const resolvedCfg = llmConfig ? resolveLLMConfig(llmConfig as any, userId, 'characters') : null
      if (!resolvedCfg || !resolvedCfg.apiKey) {
        return NextResponse.json(
          { error: '请先配置AI模型（需要API Key）才能生成角色背景故事' },
          { status: 400 }
        )
      }

      const { system, user } = buildBackstoryPrompt(character)

      const messages: LLMMessage[] = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]

      const config: LLMConfig = {
        provider: resolvedCfg.provider || '硅基流动',
        apiKey: resolvedCfg.apiKey,
        baseUrl: resolvedCfg.baseUrl || 'https://api.siliconflow.cn/v1',
        model: resolvedCfg.model || 'Qwen/Qwen2.5-7B-Instruct',
      }

      try {
        const result = await callLLMWithFallback(config, messages)
        return NextResponse.json({
          content: result.content,
          usedModel: result.usedModel,
        })
      } catch (aiError) {
        console.error('[AI Generate] AI调用失败:', aiError)
        return NextResponse.json(
          { error: 'AI服务暂时不可用，请检查模型配置后重试' },
          { status: 503 }
        )
      }
    }

    return NextResponse.json(
      { error: `不支持的生成类型: ${type}` },
      { status: 400 }
    )
  } catch (error) {
    console.error('[AI Generate] 处理请求失败:', error)
    return NextResponse.json(
      { error: '生成失败，请稍后重试' },
      { status: 500 }
    )
  }
}
