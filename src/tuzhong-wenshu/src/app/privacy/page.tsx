import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function getLegalContent(key: string, defaultTitle: string, defaultContent: string) {
  try {
    const record = await prisma.systemConfig.findFirst({ where: { configKey: key } })
    return {
      title: defaultTitle,
      content: record?.configValue || defaultContent,
    }
  } catch {
    return { title: defaultTitle, content: defaultContent }
  }
}

export default async function PrivacyPage() {
  const { title, content } = await getLegalContent(
    'legal_privacy',
    '隐私政策',
    `途中文枢隐私政策

最后更新日期：2026年7月30日

本平台途中文枢（以下简称"我们"）非常重视用户隐私保护。请您仔细阅读以下隐私政策。

一、信息收集
1. 注册信息：用户名、昵称、邮箱、密码（加密存储）。
2. 使用数据：创作内容、操作日志、设备信息。
3. 支付信息：订单记录（不存储完整支付凭证）。

二、信息使用
1. 提供AI小说写作服务。
2. 改进服务质量和用户体验。
3. 保障账号安全，防止违规行为。

三、信息存储与保护
1. 密码使用 bcrypt 加密存储，不可逆向解密。
2. 敏感凭证（API密钥、支付证书）从环境变量读取，不硬编码。
3. 数据传输使用 HTTPS 加密。

四、信息共享
1. 未经用户同意，不向第三方共享用户数据。
2. 支付处理需向微信支付平台传递必要订单信息。

五、用户权利
1. 用户有权查看、修改自己的个人信息。
2. 用户有权删除账号（联系管理员处理）。

六、Cookie 使用
本平台使用 Cookie 维持登录状态，不用于追踪用户行为。

七、未成年人保护
本平台不面向18岁以下未成年人提供服务。

八、政策修改
我们有权随时修改本隐私政策，修改后将在本页面公布。`
  )

  return (
    <div className="min-h-screen bg-[#faf7f2] py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-8 md:p-12">
        <h1 className="text-3xl font-bold text-[#1a1a1a] mb-2">{title}</h1>
        <p className="text-sm text-[#86909C] mb-8 pb-6 border-b border-[#F2F3F5]">最后更新日期：2026年7月30日</p>
        <div className="prose prose-stone max-w-none">
          {content.split('\n').map((line, i) => (
            <p key={i} className="text-[#1D2129] leading-relaxed mb-3 whitespace-pre-wrap">{line || '\u00A0'}</p>
          ))}
        </div>
        <div className="mt-8 pt-6 border-t border-[#F2F3F5] text-center">
          <a href="/tuzhong-wenshu/login" className="text-[#165DFF] hover:text-[#0F3FA8] text-sm">返回登录</a>
        </div>
      </div>
    </div>
  )
}
