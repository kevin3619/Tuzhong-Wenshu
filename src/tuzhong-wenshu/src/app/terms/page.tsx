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

export default async function TermsPage() {
  const { title, content } = await getLegalContent(
    'legal_terms',
    '用户协议',
    `途中文枢用户协议

最后更新日期：2026年7月30日

欢迎您使用途中文枢（以下简称"本平台"）。请您在使用本平台服务前，仔细阅读并充分理解以下协议内容。

一、服务内容
本平台为AI智能小说写作辅助工具，提供包括但不限于小说构思、大纲生成、角色设定、章节撰写、封面制作等功能。

二、用户注册与账号
1. 用户须使用真实信息注册账号，并对账号安全负责。
2. 用户不得将账号转让、出借给他人使用。
3. 管理员有权对违规账号进行封禁或删除处理。

三、用户行为规范
1. 用户不得利用本平台从事违法、违规或侵犯他人权益的活动。
2. 用户生成的内容须遵守国家法律法规，不得包含违法、淫秽、暴力等内容。
3. 用户须尊重他人知识产权，不得抄袭、剽窃他人作品。

四、知识产权
1. 用户使用本平台生成的内容，版权归用户所有。
2. 本平台对AI生成技术享有所有权。
3. 用户不得逆向工程、破解本平台技术。

五、免责声明
1. AI生成内容可能存在不准确或不完善之处，用户须自行判断。
2. 因不可抗力导致的服务中断，本平台不承担责任。

六、协议修改
本平台有权随时修改本协议，修改后的协议自发布之日起生效。`
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
