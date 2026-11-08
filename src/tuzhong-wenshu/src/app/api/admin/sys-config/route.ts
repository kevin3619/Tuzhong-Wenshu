import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/permissions'

// 完整 snake_case ↔ camelCase 互查字典
const SNAKE_TO_CAMEL: Record<string, string> = {
  app_name: 'appName',
  app_version: 'appVersion',
  copyright: 'copyright',
  brand_name: 'brandName',
  brand_slogan: 'brandSlogan',
  brand_logo: 'brandLogo',
  brand_logo_dark: 'brandLogoDark',
  primary_color: 'primaryColor',
  favicon: 'favicon',
  monthly_price: 'monthlyPrice',
  quarterly_price: 'quarterlyPrice',
  yearly_price: 'yearlyPrice',
  lifetime_price: 'lifetimePrice',
  ai_daily_free_quota: 'aiDailyFreeQuota',
  system_notice: 'systemNotice',
  ai_provider: 'aiProvider',
  ai_api_key: 'aiApiKey',
  ai_endpoint: 'aiEndpoint',
  ai_model: 'aiModel',
  ai_temperature: 'aiTemperature',
  ai_max_output_length: 'aiMaxOutputLength',
  ai_enable_rate_limit: 'aiEnableRateLimit',
  wechat_appid: 'wechatAppid',
  wechat_appsecret: 'wechatAppSecret',
  wechat_callback_domain: 'wechatCallbackDomain',
  wechat_pay_mchid: 'wechatPayMchid',
  wechat_pay_appid: 'wechatPayAppid',
  wechat_pay_merchant_name: 'wechatPayMerchantName',
  wechat_pay_company_name: 'wechatPayCompanyName',
  wechat_pay_apiv2_key: 'wechatPayApiv2Key',
  wechat_pay_apiv3_key: 'wechatPayApiv3Key',
  wechat_pay_serial_no: 'wechatPaySerialNo',
  wechat_pay_cert_pem: 'wechatPayCertPem',
  wechat_pay_private_key: 'wechatPayPrivateKey',
  legal_terms: 'legalTerms',
  legal_privacy: 'legalPrivacy',
  mail_host: 'mailHost',
  mail_port: 'mailPort',
  mail_user: 'mailUser',
  mail_pass: 'mailPass',
  mail_secure: 'mailSecure',
  mail_from: 'mailFrom',
}
const CAMEL_TO_SNAKE: Record<string, string> = {}
Object.entries(SNAKE_TO_CAMEL).forEach(function ([snake, camel]) {
  CAMEL_TO_SNAKE[camel] = snake
})

// 旧 key → 新 snake key 的迁移（兼容历史命名）
const LEGACY_KEYS: Record<string, string> = {
  ...CAMEL_TO_SNAKE,
  wechat_pay_mch_id: 'wechat_pay_mchid',
  wechat_pay_sub_mchid: 'wechat_pay_mchid',
  wechat_pay_cert_serial: 'wechat_pay_serial_no',
  wx_open_appid: 'wechat_appid',
  wx_open_secret: 'wechat_appsecret',
  aiBaseURL: 'ai_endpoint',
  aiBaseUrl: 'ai_endpoint',
  userAgreement: 'legal_terms',
  user_agreement: 'legal_terms',
  privacyPolicy: 'legal_privacy',
  privacy_policy: 'legal_privacy',
  feedbackTemplate: 'legal_terms',
  feedback_template: 'legal_terms',
}

const DEFAULTS: Record<string, string> = {
  app_name: '途中文枢',
  app_version: '1.0.0',
  copyright: '© 2026 途中文枢. 保留所有权利.',
  brand_name: '途中文枢',
  brand_slogan: '途中文枢 - AI 智能小说写作助手',
  brand_logo: '',
  brand_logo_dark: '',
  primary_color: '#165DFF',
  favicon: '',
  monthly_price: '79.9',
  quarterly_price: '219',
  yearly_price: '799',
  lifetime_price: '2199',
  ai_daily_free_quota: '20',
  system_notice: '',
  ai_provider: 'deepseek',
  ai_api_key: '',
  ai_endpoint: '',
  ai_model: '',
  ai_temperature: '0.7',
  ai_max_output_length: '4000',
  ai_enable_rate_limit: '1',
  wechat_appid: process.env.WECHAT_APPID || '',
  wechat_appsecret: process.env.WECHAT_APPSECRET || '',
  wechat_pay_mchid: process.env.WECHAT_PAY_MCHID || '',
  wechat_pay_appid: process.env.WECHAT_PAY_APPID || process.env.WECHAT_APPID || '',
  wechat_pay_merchant_name: '途中文枢',
  wechat_pay_company_name: '',
  wechat_pay_apiv2_key: '',
  wechat_pay_apiv3_key: '',
  wechat_pay_serial_no: '',
  wechat_pay_cert_pem: '',
  wechat_pay_private_key: '',
  wechat_callback_domain: process.env.WECHAT_CALLBACK_DOMAIN || '',
  legal_terms: '',
  legal_privacy: '',
  mail_host: '',
  mail_port: '587',
  mail_user: '',
  mail_pass: '',
  mail_secure: '0',
  mail_from: '',
}

// 🔥 脏值黑名单：这些明显是开发期占位/测试用户名密码，绝不允许从 LEGACY_KEYS 或 默认值 写入到敏感配置
const DIRTY_VALUE_BLOCKLIST = new Set<string>([
  'kevin', 'Kevin', 'KEVIN',
  'leiyang', 'LeiYang', 'LEIYANG',
  'password', 'Password', 'PASSWORD',
  '123456', '12345678', '1234567890',
  'test', 'Test', 'TEST',
  'admin', 'Admin', 'ADMIN',
  'secret', 'Secret', 'SECRET',
  'your_appid', 'your_secret', 'YOUR_APPID', 'YOUR_SECRET',
  'xxx', 'XXX', '***', '****',
  '默认', '默认值', '占位',
  '',
])
// 敏感配置键：值必须符合业务规则，禁止脏值写入黑名单
const SENSITIVE_CONFIG_KEYS = new Set<string>([
  'wechat_appid', 'wechatAppid',
  'wechat_appsecret', 'wechatAppSecret',
  'wechat_pay_mchid', 'wechatPayMchid',
  'wechat_pay_appid', 'wechatPayAppid',
  'wechat_pay_apiv2_key', 'wechatPayApiv2Key',
  'wechat_pay_apiv3_key', 'wechatPayApiv3Key',
  'wechat_pay_serial_no', 'wechatPaySerialNo',
  'wechat_pay_cert_pem', 'wechatPayCertPem',
  'wechat_pay_private_key', 'wechatPayPrivateKey',
  'ai_api_key', 'aiApiKey',
  'wx_open_appid', 'wx_open_secret',
  'mail_pass', 'mailPass',
])

function isDirtyValue(key: string, val: string): boolean {
  if (typeof val !== 'string') return true
  const trimmed = val.trim()
  if (DIRTY_VALUE_BLOCKLIST.has(trimmed)) return true
  // 敏感配置如果像用户名（kevinxxx）或纯字母短词，也视为脏
  if (SENSITIVE_CONFIG_KEYS.has(key)) {
    if (/^(kevin|leiyang|test|admin|password)\w*$/i.test(trimmed)) return true
    // AppID 一般以 wx 开头或固定长度；AppSecret 是 32 位字符串；允许未设置的空
    if (key.toLowerCase().includes('appid') && trimmed && !/^(wx|tt|sens|gh_|[a-zA-Z0-9]{10,})$/i.test(trimmed)) {
      // 非标准格式的 AppID 视为脏，除非空
    }
  }
  return false
}

function normalizeMap(
  configMap: Record<string, string>,
  opts?: { applyDefaults?: boolean }
): { migrated: boolean } {
  const applyDefaults = opts?.applyDefaults !== false
  let migrated = false

  // 0. 🔥 预清理：如果敏感键里有脏值，直接置空，避免污染后续流程
  const taintedKeys = Object.keys(configMap)
  for (let i = 0; i < taintedKeys.length; i++) {
    const k = taintedKeys[i]
    if (SENSITIVE_CONFIG_KEYS.has(k) && isDirtyValue(k, configMap[k] || '')) {
      configMap[k] = ''
      migrated = true
    }
  }

  // 1. 旧 key → 新 snake key：仅当旧 key 有值 && 新 key 为空 且 旧值非脏时迁移
  Object.entries(LEGACY_KEYS).forEach(function ([oldKey, newKey]) {
    if (!oldKey || !newKey || oldKey === newKey) return
    const oldVal = configMap[oldKey]
    const newVal = configMap[newKey]
    const oldNonEmpty = typeof oldVal === 'string' && oldVal !== ''
    const newEmpty = typeof newVal !== 'string' || newVal === ''
    // 🔥 旧键是脏的就绝对不迁移
    if (isDirtyValue(newKey, oldVal || '')) {
      configMap[oldKey] = ''
      migrated = true
      return
    }
    if (oldNonEmpty && newEmpty) {
      configMap[newKey] = oldVal
      migrated = true
    }
  })

  // 2. 默认值填充：仅当该 snake key 完全缺失 或 空字符串/undefined 才补默认值（绝不覆盖用户真实 DB 值）
  if (applyDefaults) {
    Object.entries(DEFAULTS).forEach(function ([k, v]) {
      if (typeof v !== 'string') return
      // 🔥 默认值本身也过滤脏值（空默认值不写入，因为脏的会被设空）
      if (SENSITIVE_CONFIG_KEYS.has(k) && isDirtyValue(k, v)) return
      const cur = configMap[k]
      if (cur === undefined || cur === null || cur === '') {
        configMap[k] = v
        migrated = true
      }
    })
  }

  // 3. snake ↔ camel 双向同步：仅当一侧为空才用另一侧的非空值填补；两侧都非空以 snake 为准；脏值跳过
  Object.entries(SNAKE_TO_CAMEL).forEach(function ([snake, camel]) {
    const sVal = configMap[snake]
    const cVal = configMap[camel]
    const sEmpty = typeof sVal !== 'string' || sVal === ''
    const cEmpty = typeof cVal !== 'string' || cVal === ''
    const sDirty = SENSITIVE_CONFIG_KEYS.has(snake) && isDirtyValue(snake, sVal || '')
    const cDirty = SENSITIVE_CONFIG_KEYS.has(camel) && isDirtyValue(camel, cVal || '')
    if (sDirty) { configMap[snake] = ''; migrated = true }
    if (cDirty) { configMap[camel] = ''; migrated = true }
    if ((!sDirty) && sEmpty && !cEmpty) { configMap[snake] = cVal; migrated = true }
    else if ((!cDirty) && !sEmpty && cEmpty) { configMap[camel] = sVal; migrated = true }
    // 🔥 统一两套命名：canonical = snake。若两侧都有值且不一致（历史脏数据），
    //    强制 camel 取 snake，保证「改一个另一个也生效 / 读任一侧都一致」。
    else if ((!sDirty) && (!cDirty) && !sEmpty && !cEmpty && sVal !== cVal) {
      configMap[camel] = sVal
      migrated = true
    }
  })

  return { migrated }
}

function getAllCanonicalKeys(): string[] {
  const set = new Set<string>()
  Object.keys(SNAKE_TO_CAMEL).forEach(k => set.add(k))
  Object.keys(SNAKE_TO_CAMEL).forEach(k => {
    const c = SNAKE_TO_CAMEL[k]; if (c) set.add(c)
  })
  Object.keys(LEGACY_KEYS).forEach(k => set.add(k))
  Object.keys(DEFAULTS).forEach(k => set.add(k))
  return Array.from(set)
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, message: '无权限' }, { status: 403 })
  try {
    const configs = await prisma.systemConfig.findMany()
    const configMap: Record<string, string> = {}
    configs.forEach(c => { configMap[c.configKey] = c.configValue || '' })

    const { migrated } = normalizeMap(configMap, { applyDefaults: true })

    if (migrated) {
      try {
        const now = new Date().toISOString()
        const knownKeys = getAllCanonicalKeys()
        for (let i = 0; i < knownKeys.length; i++) {
          const k = knownKeys[i]
          const v = configMap[k]
          if (!v || v === '') continue
          const existing = configs.find(c => c.configKey === k)
          if (existing && existing.configValue === v) continue
          await prisma.systemConfig.upsert({
            where: { configKey: k },
            update: { configValue: String(v), updatedAt: now },
            create: { configKey: k, configValue: String(v), createdAt: now, updatedAt: now },
          })
        }
      } catch (e) { console.error('[sys-config] upsert 系统配置失败:', e) }
    }

    // 强制客户端 & 中间层永不缓存，避免 React 水合后显示陈旧 "leiyang" 等脏数据
    return NextResponse.json(
      { success: true, data: configMap },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' } }
    )
  } catch (e) {
    console.error('[sys-config GET] 错误:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, message: isProd ? '服务器内部错误' : '加载失败：' + (e instanceof Error ? e.message : '未知错误') }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ success: false, message: '无权限' }, { status: 403 })
  try {
    const updates = await request.json() as Record<string, unknown>
    const normalized: Record<string, string> = {}
    Object.entries(updates).forEach(function ([k, v]) {
      if (typeof v === 'undefined' || v === null) return
      normalized[k] = typeof v === 'string' ? v : JSON.stringify(v)
    })
    normalizeMap(normalized, { applyDefaults: false })

    // 读 DB 当前数据，防止用户提交空值覆盖 DB 里已有的正确值（尤其是 wechat_pay_* / wechat_appid / 季度价等敏感配置）
    const existConfigs = await prisma.systemConfig.findMany()
    const existMap: Record<string, string> = {}
    existConfigs.forEach(c => { existMap[c.configKey] = c.configValue || '' })

    const now = new Date().toISOString()
    const writeKeys = new Set<string>(Object.keys(normalized))
    const allKeys = getAllCanonicalKeys()
    allKeys.forEach(k => {
      if (normalized[k] !== undefined && normalized[k] !== null) writeKeys.add(k)
    })

    const rows: Array<{ key: string; val: string }> = []
    writeKeys.forEach(k => {
      let incoming = normalized[k]
      if (typeof incoming === 'undefined' || incoming === null) return
      // 🔥 强制：如果写入值是脏的（占位符 kevin 等），一律转为空字符串
      if (SENSITIVE_CONFIG_KEYS.has(k) && isDirtyValue(k, incoming || '')) {
        incoming = ''
      }
      const dbVal = existMap[k]
      // 防护 A：如果入参是空字符串（被清洗过或本来空），但 DB 里该 key 有非空非脏值 → 保留 DB 的正确值，不覆盖
      if (incoming === '' && typeof dbVal === 'string' && dbVal !== '' && !isDirtyValue(k, dbVal)) {
        rows.push({ key: k, val: dbVal })
        return
      }
      // 🔥 防护 B：如果 DB 里本来存的是脏值，即便入参也是空或脏，也要强制写空，把脏值清掉
      if (typeof dbVal === 'string' && dbVal !== '' && SENSITIVE_CONFIG_KEYS.has(k) && isDirtyValue(k, dbVal) && incoming === '') {
        rows.push({ key: k, val: '' })
        return
      }
      rows.push({ key: k, val: incoming })
    })

    for (let i = 0; i < rows.length; i++) {
      const { key, val } = rows[i]
      await prisma.systemConfig.upsert({
        where: { configKey: key },
        update: { configValue: val, updatedAt: now },
        create: { configKey: key, configValue: val, createdAt: now, updatedAt: now },
      })
    }

    // 清理遗留键，防止 normalizeMap 在 GET 时将脏数据迁移回 canonical key
    // 🔥 修复：只删除本次未写入的遗留键，保留已写入的 camelCase 键以防止数据丢失
    const legacyKeysToDelete = Object.keys(LEGACY_KEYS)
    const writeKeysSet = new Set(rows.map(function (r) { return r.key }))
    for (const lk of legacyKeysToDelete) {
      if (lk && !writeKeysSet.has(lk)) {
        await prisma.systemConfig.deleteMany({ where: { configKey: lk } }).catch(function (err) { console.error('[sys-config] 清理遗留配置键失败:', lk, err) })
      }
    }

    return NextResponse.json({ success: true, message: '已保存' })
  } catch (e) {
    console.error('[sys-config POST] 错误:', e instanceof Error ? e.message : String(e))
    const isProd = process.env.NODE_ENV === 'production'
    return NextResponse.json({ success: false, message: isProd ? '服务器内部错误' : '保存失败：' + (e instanceof Error ? e.message : '未知错误') }, { status: 500 })
  }
}
