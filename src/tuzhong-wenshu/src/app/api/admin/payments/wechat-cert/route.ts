import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'

function readUint16BE(buf: Buffer, off: number) { return buf.readUInt16BE(off) }
function readUint32BE(buf: Buffer, off: number) { return buf.readUInt32BE(off) }

/**
 * 轻量提取 PKCS#12 证书里的 Serial Number（证书序列号），避免依赖 node-forge。
 * 找不到就返回空字符串。
 */
function tryExtractSerial(p12Buf: Buffer): string {
  try {
    const asciiText = p12Buf.toString('ascii')
    const snMatch = asciiText.match(/[0-9A-F]{16,}/)
    if (snMatch) return snMatch[0]
  } catch (e) { console.error('[wechat-cert] 提取证书序列号失败:', e) }
  return ''
}

async function extractSerialFromFile(filename: string, buf: Buffer): Promise<{ serial: string; certContent: string }> {
  const lower = filename.toLowerCase()
  let serial = ''
  let certContent = buf.toString('base64')
  if (lower.endsWith('.p12') || lower.endsWith('.pfx')) {
    serial = tryExtractSerial(buf)
  } else if (lower.endsWith('.pem') || lower.endsWith('.crt') || lower.endsWith('.cer')) {
    const text = buf.toString('utf8')
    certContent = text
    const snMatch = text.match(/Serial Number[:\s]*[\n\r:\s]*([0-9A-Fa-f:]{16,})/)
    if (snMatch && snMatch[1]) {
      serial = snMatch[1].replace(/[:\s]/g, '').toUpperCase()
    } else {
      const sn2 = text.match(/([0-9A-Fa-f]{20,})/)
      if (sn2) serial = sn2[1].toUpperCase()
    }
  }
  return { serial, certContent }
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, message: '无权限' }, { status: 403 })
  try {
    const form = await request.formData()
    const file = form.get('file') as File | null
    if (!file || !file.size) return NextResponse.json({ success: false, message: '请上传证书文件' }, { status: 400 })
    const fileName = file.name
    const arr = new Uint8Array(await file.arrayBuffer())
    const buf = Buffer.from(arr)
    const { serial, certContent } = await extractSerialFromFile(fileName, buf)
    const now = new Date().toISOString()
    await prisma.systemConfig.upsert({
      where: { configKey: 'wechat_pay_cert' },
      update: { configValue: certContent, updatedAt: now },
      create: { configKey: 'wechat_pay_cert', configValue: certContent, createdAt: now, updatedAt: now },
    })
    if (serial) {
      await prisma.systemConfig.upsert({
        where: { configKey: 'wechat_pay_serial_no' },
        update: { configValue: serial, updatedAt: now },
        create: { configKey: 'wechat_pay_serial_no', configValue: serial, createdAt: now, updatedAt: now },
      })
    }
    return NextResponse.json({ success: true, data: { wechat_pay_serial_no: serial, wechat_pay_cert: certContent } })
  } catch (e) {
    return NextResponse.json({ success: false, message: '证书解析失败' }, { status: 500 })
  }
}
