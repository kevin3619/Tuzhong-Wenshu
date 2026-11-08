import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getRequestActor } from '@/lib/permissions'

// 公开接口：获取系统公开配置（品牌、价格等）
// 🔥 安全修复（Bug：公开接口泄露管理员 ai_api_key）：
//   - 匿名访客：只返回品牌/价格等公开信息，绝不含任何 AI Key/Endpoint
//   - 已登录用户：额外返回系统级默认 LLM 配置（系统本意就是"用户无自定义配置时的兜底"，
//     Key 仅出现在服务端响应中且仅对登录用户，不再全网明文）
export async function GET(request: NextRequest) {
  try {
    const wantAiCfg = request.headers.get('x-want-ai-config') === '1'
    // 🔥 统一两套命名：canonical = snake。前端要的 brandLogo/brandName/brandSlogan 是 camel 形式，
    //   但 DB 里 snake 才是权威值；这里把请求键归一到 snake 再读，避免返回陈旧的 camel 值。
    const CAMEL_TO_SNAKE: Record<string, string> = {
      brandLogo: 'brand_logo',
      brandName: 'brand_name',
      brandSlogan: 'brand_slogan',
    }
    const baseKeys = [
      'brand_logo', 'brand_name', 'brand_slogan',
      'monthly_price', 'quarterly_price', 'yearly_price', 'lifetime_price',
    ]
    const actor = await getRequestActor(request)
    // 🔥 修复（P1 泄漏）：注册是自助的，任何登录用户带一个 x-want-ai-config:1 就能拿到平台 Key
    //   并永久留存到浏览器/本地存储，等于绕过一切计量与计费。
    //   Key 只在服务端解析使用，客户端最多知道「有没有可用默认模型」。
    const includeAi = false

    const aiSnakeKeys = ['ai_provider', 'ai_api_key', 'ai_endpoint', 'ai_model']
    const configs = await prisma.systemConfig.findMany({
      where: {
        configKey: {
          in: includeAi ? baseKeys.concat(aiSnakeKeys) : baseKeys,
        },
      },
    })
    const configMap: Record<string, string> = {}
    configs.forEach(c => { configMap[c.configKey] = c.configValue || '' })

    // 把 canonical(snake) 值按前端期望的键名回填（camel 形式保持对外兼容）
    const publicOut: Record<string, string> = {}
    Object.keys(CAMEL_TO_SNAKE).forEach(function (camel) {
      publicOut[camel] = configMap[CAMEL_TO_SNAKE[camel]] || ''
    })
    baseKeys.filter(function (k) { return !CAMEL_TO_SNAKE[k] }).forEach(function (k) {
      publicOut[k] = configMap[k] || ''
    })

    const sysDefaults: Record<string, unknown> = { ...publicOut }
    if (includeAi) {
      sysDefaults.ai_default_config = {
        provider: configMap.ai_provider || '',
        apiKey: configMap.ai_api_key || '',
        baseUrl: configMap.ai_endpoint || '',
        model: configMap.ai_model || '',
      }
    } else {
      // 未登录/未请求时也不暴露归属字段，只给"存在系统默认"的布尔提示供前端降级
      sysDefaults.ai_default_available = false
    }

    return NextResponse.json({ code: 200, data: sysDefaults })
  } catch {
    return NextResponse.json({ code: 500, data: {}, message: '获取配置失败' })
  }
}
