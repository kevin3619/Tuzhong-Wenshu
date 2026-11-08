import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'

export type MailConfig = {
  host: string
  port: number
  user: string
  pass: string
  secure: boolean
  from: string
}

/**
 * 读取系统配置里的 SMTP 设置（mail_host/port/user/pass/secure/from）。
 * 未配置 mail_host 时返回 null —— 调用方应回退到「演示模式」（链接进服务器日志）。
 */
export async function getMailConfig(): Promise<MailConfig | null> {
  try {
    const configs = await prisma.systemConfig.findMany({
      where: {
        configKey: {
          in: ['mail_host', 'mail_port', 'mail_user', 'mail_pass', 'mail_secure', 'mail_from', 'brand_name'],
        },
      },
    })
    const m: Record<string, string> = {}
    configs.forEach(c => { m[c.configKey] = c.configValue || '' })
    if (!m.mail_host) return null
    const port = parseInt(m.mail_port || '587', 10)
    return {
      host: m.mail_host,
      port,
      user: m.mail_user || '',
      pass: m.mail_pass || '',
      // 465 通常为隐式 TLS；其余端口按需 STARTTLS（nodemailer 自动处理）
      secure: m.mail_secure === '1' || m.mail_secure === 'true' || port === 465,
      from: m.mail_from || m.mail_user || m.mail_host,
    }
  } catch {
    return null
  }
}

export type SendResult = { ok: boolean; error?: string }

/** 发送一封邮件；任何异常都吞掉并返回 {ok:false}，绝不让调用方崩溃。 */
export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<SendResult> {
  const cfg = await getMailConfig()
  if (!cfg) return { ok: false, error: 'mail_not_configured' }
  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    })
    await transport.sendMail({
      from: cfg.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text || opts.html.replace(/<[^>]+>/g, ''),
      html: opts.html,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 发送密码重置邮件（链接只在邮件体内，响应体绝不回吐）。 */
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  brandName = '途中文枢'
): Promise<SendResult> {
  return sendEmail({
    to,
    subject: `[${brandName}] 密码重置请求`,
    html:
      `<p>我们收到了您的密码重置请求。</p>` +
      `<p>请点击下面的链接重置密码（30 分钟内有效）：</p>` +
      `<p><a href="${resetLink}">${resetLink}</a></p>` +
      `<p>如果您没有请求重置密码，请忽略此邮件，您的账户安全不受影响。</p>`,
    text: `密码重置链接（30分钟内有效）：${resetLink}`,
  })
}
