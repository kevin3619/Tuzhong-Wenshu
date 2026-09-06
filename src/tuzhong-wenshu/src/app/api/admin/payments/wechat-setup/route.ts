import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'

const WP_KEYS = [
  'wechat_pay_mchid',
  'wechat_pay_appid',
  'wechat_pay_merchant_name',
  'wechat_pay_company_name',
  'wechat_pay_apiv2_key',
  'wechat_pay_apiv3_key',
  'wechat_pay_serial_no',
  'wechat_pay_cert',
  'wechat_pay_private_key',
]

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, message: '无权限' }, { status: 403 })
  try {
    const LEGACY_WP_KEYS: Record<string, string> = {
      wechat_pay_mch_id: 'wechat_pay_mchid',
      wechat_pay_app_id: 'wechat_pay_appid',
    }
    const allKeys = [...WP_KEYS, ...Object.keys(LEGACY_WP_KEYS)]
    const configs = await prisma.systemConfig.findMany({ where: { configKey: { in: allKeys } } })
    const map: Record<string, string> = {}
    WP_KEYS.forEach(k => { map[k] = '' })
    const rawMap: Record<string, string> = {}
    configs.forEach(c => { rawMap[c.configKey] = c.configValue || '' })
    // 兼容旧字段：如果旧字段有值且新字段为空，则迁移到新字段并回写
    let migrated = false
    for (const oldK of Object.keys(LEGACY_WP_KEYS)) {
      const newK = LEGACY_WP_KEYS[oldK]
      if (rawMap[oldK] && !rawMap[newK]) {
        rawMap[newK] = rawMap[oldK]
        migrated = true
      }
    }
    if (migrated) {
      const now = new Date().toISOString()
      for (const k of WP_KEYS) {
        if (rawMap[k]) {
          await prisma.systemConfig.upsert({
            where: { configKey: k },
            update: { configValue: rawMap[k], updatedAt: now },
            create: { configKey: k, configValue: rawMap[k], createdAt: now, updatedAt: now },
          })
        }
      }
    }
    for (const k of WP_KEYS) {
      if (rawMap[k]) map[k] = rawMap[k]
    }
    return NextResponse.json({ success: true, data: map }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache' } })
  } catch {
    return NextResponse.json({ success: false, message: '加载失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, message: '无权限' }, { status: 403 })
  try {
    const payload: Record<string, unknown> = await request.json()
    const now = new Date().toISOString()
    for (const k of WP_KEYS) {
      if (k in payload) {
        const v = typeof payload[k] === 'string' ? payload[k] : ''
        await prisma.systemConfig.upsert({
          where: { configKey: k },
          update: { configValue: v, updatedAt: now },
          create: { configKey: k, configValue: v, createdAt: now, updatedAt: now },
        })
      }
    }
    return NextResponse.json({ success: true, message: '已保存' })
  } catch {
    return NextResponse.json({ success: false, message: '保存失败' }, { status: 500 })
  }
}
