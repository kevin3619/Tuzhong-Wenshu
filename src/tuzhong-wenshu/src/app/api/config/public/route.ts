import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 公开接口：获取系统公开配置（品牌、价格、AI默认模型配置等）
// 修复 v4 L5：补充 lifetime_price 字段
// 修复 v4 C8：新增 ai_* 系统级默认配置，前端 localStorage 无自定义配置时使用系统配置
export async function GET() {
  try {
    const configs = await prisma.systemConfig.findMany({
      where: {
        configKey: {
          in: [
            'brandLogo', 'brandName', 'brandSlogan',
            'monthly_price', 'quarterly_price', 'yearly_price', 'lifetime_price',
            'ai_provider', 'ai_api_key', 'ai_endpoint', 'ai_model'
          ]
        },
      },
    })
    const configMap: Record<string, string> = {}
    configs.forEach(c => { configMap[c.configKey] = c.configValue || '' })

    // v4 C8：前端 localStorage 无自定义 LLM 配置时的系统级默认值（直接给前端用）
    const sysDefaults: Record<string, unknown> = { ...configMap }
    sysDefaults.ai_default_config = {
      provider: configMap.ai_provider || '',
      apiKey: configMap.ai_api_key || '',
      baseUrl: configMap.ai_endpoint || '',
      model: configMap.ai_model || '',
    }
    // 清理原始字段（避免重复暴露），保留合并后的 sysDefaults
    delete sysDefaults.ai_provider
    delete sysDefaults.ai_api_key
    delete sysDefaults.ai_endpoint
    delete sysDefaults.ai_model

    return NextResponse.json({ code: 200, data: sysDefaults })
  } catch {
    return NextResponse.json({ code: 500, data: {}, message: '获取配置失败' })
  }
}