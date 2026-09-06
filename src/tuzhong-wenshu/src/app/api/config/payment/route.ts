import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - 公开接口：仅返回非敏感的支付渠道展示信息（商户名称等），不返回密钥
export async function GET() {
  try {
    const configs = await prisma.systemConfig.findMany({
      where: {
        configKey: {
          in: ['wechat_pay_merchant_name', 'wechat_pay_company_name'],
        },
      },
    })
    const configMap: Record<string, string> = {}
    configs.forEach(c => { configMap[c.configKey] = c.configValue || '' })
    return NextResponse.json({ code: 200, data: configMap })
  } catch {
    return NextResponse.json({ code: 500, message: '获取配置失败' }, { status: 500 })
  }
}
