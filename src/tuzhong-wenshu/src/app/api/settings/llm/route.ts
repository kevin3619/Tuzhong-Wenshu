import { NextRequest, NextResponse } from 'next/server'
import { callLLM, type LLMMessage } from '@/lib/ai/llm'
import { getRequestActor } from '@/lib/permissions'

// 修复 v4 C8：API Key 改为通过 POST 请求体传递，不再暴露在 URL 查询参数中
// GET /api/settings/llm - 已废弃，保留仅用于向后兼容（不读取敏感参数）
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: '此接口已升级为 POST 请求，请通过 POST 请求体传递参数以保护 API Key 安全'
  }, { status: 405 })
}

// 🔥 SSRF 防护：拒绝内网/本地地址，防探测
/** 归一化 1.2.3.4 / 0x7f.0.0.1 / 0177.0.0.1 / 2130706433 等变形写法 */
function ipPartsToOctets(host: string): number[] | null {
  const labels = host.split('.')
  if (labels.length === 1) {
    const n = /^\d+$/.test(labels[0]) ? parseInt(labels[0], 10)
      : /^0[xX][0-9a-fA-F]+$/.test(labels[0]) ? parseInt(labels[0], 16) : NaN
    if (!Number.isFinite(n) || n < 0 || n > 4294967295) return null
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  }
  if (labels.length !== 4) return null
  const out: number[] = []
  for (const l of labels) {
    let v = NaN
    if (/^\d+$/.test(l)) v = parseInt(l, 10)
    else if (/^0[xX][0-9a-fA-F]+$/.test(l)) v = parseInt(l, 16)
    else if (/^0[0-7]+$/.test(l)) v = parseInt(l.slice(1), 8)
    if (!Number.isFinite(v) || v < 0 || v > 255) return null
    out.push(v)
  }
  return out
}
function isPrivateOctets(a: number, b: number): boolean {
  if (a === 127 || a === 10 || a === 0) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}
/** 单个 IP 字面量是否内网/回环/链路本地（含 IPv6 与 ::ffff: 映射） */
export function isPrivateIpLiteral(host: string): boolean {
  const h = String(host || '').replace(/^\[|\]$/g, '').toLowerCase()
  if (!h) return false
  if (h === '::1') return true
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true
  const mapped = h.match(/^::ffff:(.+)$/)
  if (mapped) return isPrivateIpLiteral(mapped[1])
  const oct = ipPartsToOctets(h)
  if (oct) return isPrivateOctets(oct[0], oct[1])
  return false
}
/**
 * 🔥 修复（P1 SSRF）：字面量判断能被 http://2130706433、http://0177.0.0.1 以及
 *   「域名解析到内网 IP」（DNS rebinding）绕过，
 *   故在服务端真正发请求前把域名解析出来，逐个地址再判一次内网。
 */
export async function isForbiddenBaseUrlAsync(u: string): Promise<boolean> {
  if (isForbiddenBaseUrl(u)) return true
  try {
    const host = new URL(u).hostname
    if (isPrivateIpLiteral(host)) return true
    const { promises: dns } = await import('dns')
    const addrs = await dns.lookup(host, { all: true })
    return addrs.some((a) => isPrivateIpLiteral(a.address))
  } catch {
    return true
  }
}

function isForbiddenBaseUrl(u: string): boolean {
  if (!u) return false
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true
    const host = String(parsed.hostname || '').toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
    // IPv4 私有/回环/链路本地段
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (m) {
      const a = Number(m[1]); const b = Number(m[2])
      if (a === 127 || a === 10 || a === 0) return true
      if (a === 172 && b >= 16 && b <= 31) return true
      if (a === 192 && b === 168) return true
      if (a === 169 && b === 254) return true
      if (a === 100 && b >= 64 && b <= 127) return true
    }
    if (host === '::1' || host === '[::1]' || host.startsWith('fc') || host.startsWith('fd')) return true
    return false
  } catch (_e) { return true }
}

// POST /api/settings/llm - 测试AI模型连接 / 调用AI模型（通用接口）
// 请求体: { provider, apiKey, baseUrl, model, messages? }
//   - 不传 messages: 测试连接（发送默认消息）
//   - 传 messages: 调用AI模型
export async function POST(request: NextRequest) {
  try {
    // 🔥 安全修复：必须登录（此前匿名可白嫖该出网接口探测任意服务）
    const actor = await getRequestActor(request)
    if (!actor || !actor.userId) {
      return NextResponse.json({ success: false, error: '请先登录后再测试模型' }, { status: 401 })
    }
    const body = await request.json()
    const { provider, apiKey, baseUrl, model, messages } = body

    if (!apiKey) {
      return NextResponse.json({ success: false, error: '请提供API Key' }, { status: 400 })
    }
    if (await isForbiddenBaseUrlAsync(String(baseUrl || ''))) {
      return NextResponse.json({ success: false, error: '不允许访问内网/本地地址' }, { status: 400 })
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
