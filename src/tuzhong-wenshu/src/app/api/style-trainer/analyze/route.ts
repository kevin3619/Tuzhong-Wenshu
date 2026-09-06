// 风格训练器：分析用户上传的文本，提取9维风格参数和风格DNA报告
// 使用 outline 任务类型路由（Qwen3.6-35B-A3B），适合文本分析、参数提取类任务
import { NextRequest, NextResponse } from 'next/server'
import { callLLMByTaskType, LLMMessage, cleanAIResponse, extractJSONFromText, type LLMConfig } from '@/lib/ai/llm'
import { getRequestActor } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

// 9维风格参数类型
interface StyleParameters {
  formality: number            // 正式度
  emotionIntensity: number     // 情感强度
  descriptionDensity: number   // 描写密度
  dialogueRatio: number        // 对话比例
  rhetoricFrequency: number    // 修辞频率
  pacing: number               // 节奏快慢
  languageDensity: number      // 语言密度
  eraFeel: number              // 时代感
  excitementDensity: number    // 爽点密度
}

interface StyleDNAReport {
  narrativeRhythm: string      // 叙事节奏
  wordHabit: string            // 用词习惯
  sentenceStructure: string    // 句式结构
  emotionExpression: string    // 情感表达
  rhetoricFeature: string      // 修辞特征
  strengths: string            // 写作优势
  weaknesses: string           // 待改进
  overallStyle: string         // 整体风格
}

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    // 鉴权
    const actor = await getRequestActor(request)
    if (!actor.userId) {
      return NextResponse.json({ code: 401, message: '请先登录' }, { status: 401 })
    }

    const body = await request.json()
    const { text, sampleLength } = body as { text: string; sampleLength?: number }

    // 参数校验
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ code: 400, message: '文本内容不能为空' }, { status: 400 })
    }

    // 至少2000字才能进行分析（降低门槛让短文也能试用，建议5000字）
    if (text.length < 500) {
      return NextResponse.json({
        code: 400,
        message: '文本过短，至少需要500字进行分析（建议5000字以上效果更佳）'
      }, { status: 400 })
    }

    // 限制最大长度（避免token超限）
    const MAX_CHARS = 8000
    let sampleText = text
    if (text.length > MAX_CHARS) {
      // 取中间段作为样本（开头可能有设定，结尾可能不完整）
      const start = Math.floor((text.length - MAX_CHARS) / 2)
      sampleText = text.substring(start, start + MAX_CHARS)
    }

    // 构建系统提示词
    const systemPrompt = `你是一位资深的文学编辑和写作风格分析专家，擅长分析中文小说的写作风格。

你需要分析用户提供的小说文本样本，提取9个维度的风格参数，并生成风格DNA报告。

## 9维风格参数说明（每个参数0-100整数）：
1. formality 正式度：0=口语化，100=书面语
2. emotionIntensity 情感强度：0=平淡，100=浓烈
3. descriptionDensity 描写密度：0=简洁，100=细腻
4. dialogueRatio 对话比例：0=少对话，100=多对话
5. rhetoricFrequency 修辞频率：0=朴素，100=华丽
6. pacing 节奏快慢：0=缓慢铺垫，100=快速推进
7. languageDensity 语言密度：0=通俗，100=文雅
8. eraFeel 时代感：0=现代，100=古典
9. excitementDensity 爽点密度：0=平淡，100=密集

## 风格DNA报告字段：
- narrativeRhythm: 叙事节奏分析（30-80字）
- wordHabit: 用词习惯分析（30-80字）
- sentenceStructure: 句式结构分析（30-80字）
- emotionExpression: 情感表达方式分析（30-80字）
- rhetoricFeature: 修辞特征分析（30-80字）
- strengths: 写作优势（30-80字）
- weaknesses: 待改进之处（30-80字）
- overallStyle: 整体风格总结（50-120字）

## 输出要求：
1. 必须输出严格的JSON格式，不要包含任何解释性文字
2. 所有分析必须基于实际文本内容，不得套用模板
3. 参数值必须是0-100的整数
4. 报告字段内容要具体、有针对性，引用文本中的实际特征

## 输出JSON格式：
{
  "parameters": {
    "formality": 数字,
    "emotionIntensity": 数字,
    "descriptionDensity": 数字,
    "dialogueRatio": 数字,
    "rhetoricFrequency": 数字,
    "pacing": 数字,
    "languageDensity": 数字,
    "eraFeel": 数字,
    "excitementDensity": 数字
  },
  "dnaReport": {
    "narrativeRhythm": "字符串",
    "wordHabit": "字符串",
    "sentenceStructure": "字符串",
    "emotionExpression": "字符串",
    "rhetoricFeature": "字符串",
    "strengths": "字符串",
    "weaknesses": "字符串",
    "overallStyle": "字符串"
  },
  "suggestedName": "建议的风格名称（4-10字）",
  "suggestedCategory": "建议的分类（古风/现代/科幻/悬疑/玄幻/言情/历史/爽文 之一）"
}`

    const userPrompt = `请分析以下小说文本样本的写作风格，提取9维参数并生成风格DNA报告。

【文本样本】（共${sampleText.length}字）：
${sampleText}

请严格按照JSON格式输出分析结果。`

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    console.log('[风格训练器] 开始分析，文本长度=' + sampleText.length + '，用户=' + actor.userId)

    // 从数据库系统配置获取 API Key（管理后台-系统设置-基本设置中配置）
    let userLlmConfig: LLMConfig | null = null
    try {
      const configRecords = await prisma.systemConfig.findMany({
        where: { configKey: { in: ['ai_api_key', 'ai_provider', 'ai_endpoint', 'ai_model'] } },
      })
      const cfgMap: Record<string, string> = {}
      for (const rec of configRecords) {
        cfgMap[rec.configKey] = rec.configValue || ''
      }
      if (cfgMap.ai_api_key && cfgMap.ai_api_key.length > 10) {
        userLlmConfig = {
          provider: cfgMap.ai_provider || 'deepseek',
          apiKey: cfgMap.ai_api_key,
          baseUrl: cfgMap.ai_endpoint || undefined,
          model: cfgMap.ai_model || '',
        }
        console.log('[风格训练器] 从系统配置获取API Key成功，provider=' + userLlmConfig.provider)
      }
    } catch (cfgErr) {
      console.warn('[风格训练器] 获取系统配置失败，将使用环境变量:', cfgErr instanceof Error ? cfgErr.message : String(cfgErr))
    }

    // 调用AI模型（使用outline任务类型，Qwen3.6-35B-A3B适合文本分析）
    const result = await callLLMByTaskType('outline', messages, userLlmConfig, undefined, {
      skipJsonValidation: false,
      timeoutMs: 90000,
    })

    // 解析AI返回的JSON
    let parsed: { parameters?: Record<string, unknown>; dnaReport?: Record<string, unknown>; suggestedName?: unknown; suggestedCategory?: unknown } | null = null
    try {
      const jsonStr = extractJSONFromText(result.cleanedContent)
      parsed = JSON.parse(jsonStr)
    } catch (parseErr) {
      console.error('[风格训练器] JSON解析失败，尝试二次清洗')
      try {
        const retryJsonStr = cleanAIResponse(result.cleanedContent)
        const retryStr = extractJSONFromText(retryJsonStr)
        parsed = JSON.parse(retryStr)
      } catch (parseErr2) {
        console.error('[风格训练器] 二次解析仍失败:', parseErr2)
        return NextResponse.json({
          code: 500,
          message: 'AI返回内容解析失败，请重试',
          rawContent: result.cleanedContent.substring(0, 500),
        }, { status: 500 })
      }
    }

    // 校验并规范化参数
    const clampInt = (val: unknown, defaultVal: number): number => {
      const n = parseInt(String(val), 10)
      if (isNaN(n)) return defaultVal
      return Math.max(0, Math.min(100, n))
    }

    const parameters: StyleParameters = {
      formality: clampInt(parsed?.parameters?.formality, 50),
      emotionIntensity: clampInt(parsed?.parameters?.emotionIntensity, 50),
      descriptionDensity: clampInt(parsed?.parameters?.descriptionDensity, 50),
      dialogueRatio: clampInt(parsed?.parameters?.dialogueRatio, 50),
      rhetoricFrequency: clampInt(parsed?.parameters?.rhetoricFrequency, 50),
      pacing: clampInt(parsed?.parameters?.pacing, 50),
      languageDensity: clampInt(parsed?.parameters?.languageDensity, 50),
      eraFeel: clampInt(parsed?.parameters?.eraFeel, 50),
      excitementDensity: clampInt(parsed?.parameters?.excitementDensity, 50),
    }

    const safeStr = (val: unknown, defaultVal: string = ''): string => {
      if (typeof val === 'string' && val.trim()) return val.trim()
      return defaultVal
    }

    const dnaReport: StyleDNAReport = {
      narrativeRhythm: safeStr(parsed?.dnaReport?.narrativeRhythm, '叙事节奏分析暂无'),
      wordHabit: safeStr(parsed?.dnaReport?.wordHabit, '用词习惯分析暂无'),
      sentenceStructure: safeStr(parsed?.dnaReport?.sentenceStructure, '句式结构分析暂无'),
      emotionExpression: safeStr(parsed?.dnaReport?.emotionExpression, '情感表达分析暂无'),
      rhetoricFeature: safeStr(parsed?.dnaReport?.rhetoricFeature, '修辞特征分析暂无'),
      strengths: safeStr(parsed?.dnaReport?.strengths, '写作优势分析暂无'),
      weaknesses: safeStr(parsed?.dnaReport?.weaknesses, '待改进分析暂无'),
      overallStyle: safeStr(parsed?.dnaReport?.overallStyle, '整体风格分析暂无'),
    }

    const suggestedName = safeStr(parsed?.suggestedName, '我的自定义风格')
    const validCategories = ['古风', '现代', '科幻', '悬疑', '玄幻', '言情', '历史', '爽文']
    const suggestedCatRaw = typeof parsed?.suggestedCategory === 'string' ? parsed.suggestedCategory : ''
    const suggestedCategory = validCategories.includes(suggestedCatRaw)
      ? suggestedCatRaw
      : '现代'

    console.log('[风格训练器] 分析完成，建议名称=' + suggestedName + '，分类=' + suggestedCategory)

    return NextResponse.json({
      code: 200,
      message: '分析成功',
      data: {
        parameters,
        dnaReport,
        suggestedName,
        suggestedCategory,
        usedModel: result.usedModel,
        sampleLength: sampleText.length,
        originalLength: text.length,
      },
    })
  } catch (error) {
    console.error('[风格训练器] 分析失败:', error instanceof Error ? error.message : String(error))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({
      code: 500,
      message: isProd ? '分析失败，请稍后重试' : '分析失败: ' + (error instanceof Error ? error.message : '未知错误'),
    }, { status: 500 })
  }
}
