import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// 微信商户配置字段集合
const SETUP_KEY_LIST = [
  'wechat_pay_mchid',
  'wechat_pay_apiv3_key',
  'wechat_pay_serial_no',
  'wechat_pay_cert',
  'wechat_pay_private_key'
] as const

// 内存缓存微信支付平台证书（避免每次都解析）
type PlatformCertEntry = { cert: string; expireAt: number; serialNo: string }
const _platformCertMap = new Map<string, PlatformCertEntry>()

// 套餐天数映射（lifetime 特殊处理，不在 MAP 中）
const PLAN_DAY_MAP: Record<string, number> = {
  month: 30,
  quarter: 90,
  year: 365,
  // lifetime 单独处理，不在此映射中
}

// 默认订单有效期（分钟），可由系统配置 order_expire_minutes 覆盖
const DEFAULT_ORDER_EXPIRE_MINUTES = 30

// 读取数据库中配置的订单有效期（分钟），未配置则返回默认值
export async function getOrderExpireMinutes(): Promise<number> {
  try {
    const row = await prisma.systemConfig.findUnique({ where: { configKey: 'order_expire_minutes' } })
    if (row && row.configValue) {
      const val = parseInt(row.configValue, 10)
      if (!isNaN(val) && val >= 1 && val <= 1440) return val
    }
  } catch (e) { console.error('[wechat-pay] 读取订单清理间隔配置失败，使用默认值:', e) }
  return DEFAULT_ORDER_EXPIRE_MINUTES
}

export interface WechatNativeResult {
  runCheckTag: boolean
  codeUrl?: string
  orderNo?: string
  payId?: string
  message?: string
  expireAt?: string
  expireMinutes?: number
}

export interface NotifyResult {
  runCheckTag: boolean
  message: string
}

export interface OrderStatusResult {
  operateStateMark: number
  isExpired: boolean
}

// v4 C5 修复：统一计算过期时间，避免 handlePayCallback 与 queryPayOrderStatus 不一致
function computeExpiryDate(planType: string, now: Date): Date {
  if (planType === 'lifetime') {
    // 终身会员：100 年后（实际永久），避免 null 导致前端判断异常
    return new Date(now.getTime() + 36500 * 24 * 60 * 60 * 1000)
  }
  const days = PLAN_DAY_MAP[planType] || 30
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

// v4 C5 修复：统一计算会员等级
function computeTier(planType: string): string {
  return planType === 'lifetime' ? 'lifetime' : 'pro'
}

// v4 C5 修复：统一计算套餐标签
function computePlanLabel(planType: string): string {
  switch (planType) {
    case 'month': return '月度'
    case 'quarter': return '季度'
    case 'year': return '年度'
    case 'lifetime': return '终身'
    default: return '月度'
  }
}

// 从数据库加载微信商户配置
export async function loadWechatMerchantSetup() {
  const setupRecord: Record<string, string> = {}

  const batchResult = await prisma.systemConfig.findMany({
    where: {
      configKey: {
        in: [...SETUP_KEY_LIST]
      }
    }
  })

  for (let idx = 0; idx < batchResult.length; idx++) {
    const rowItem = batchResult[idx]
    setupRecord[rowItem.configKey] = rowItem.configValue || ''
  }

  // v4 修复：兼容 wechat_pay_cert_pem 旧字段名（系统设置页面可能写入了错误字段名）
  if (!setupRecord.wechat_pay_cert) {
    const legacyCert = await prisma.systemConfig.findFirst({ where: { configKey: 'wechat_pay_cert_pem' } })
    if (legacyCert?.configValue) {
      setupRecord.wechat_pay_cert = legacyCert.configValue
      // 自动迁移：写入正确字段名
      const now = new Date().toISOString()
      await prisma.systemConfig.upsert({
        where: { configKey: 'wechat_pay_cert' },
        update: { configValue: legacyCert.configValue, updatedAt: now },
        create: { configKey: 'wechat_pay_cert', configValue: legacyCert.configValue, createdAt: now, updatedAt: now },
      }).catch(() => {})
    }
  }

  // 🔥 2026-08-30 修复支付"配置不完整"：商户证书序列号缺失时，从已配置的商户证书PEM自动解析补全
  //   （微信商户证书序列号 == apiclient_cert.pem 的 X509 serialNumber），避免用户手动填错/漏填。
  if (!setupRecord.wechat_pay_serial_no && setupRecord.wechat_pay_cert) {
    try {
      const { X509Certificate } = require('crypto')
      const certObj = new X509Certificate(setupRecord.wechat_pay_cert)
      const derivedSerial = (certObj.serialNumber || '').toUpperCase()
      if (derivedSerial) {
        setupRecord.wechat_pay_serial_no = derivedSerial
        const nowS = new Date().toISOString()
        await prisma.systemConfig.upsert({
          where: { configKey: 'wechat_pay_serial_no' },
          update: { configValue: derivedSerial, updatedAt: nowS },
          create: { configKey: 'wechat_pay_serial_no', configValue: derivedSerial, createdAt: nowS, updatedAt: nowS },
        }).catch(() => {})
        console.log('[wechat-pay] 已从商户证书自动解析并补全序列号: ' + derivedSerial)
      }
    } catch (_ce) {
      console.warn('[wechat-pay] 从证书解析序列号失败:', _ce instanceof Error ? _ce.message : String(_ce))
    }
  }

  const hasAllKeys =
    setupRecord.wechat_pay_mchid &&
    setupRecord.wechat_pay_apiv3_key &&
    setupRecord.wechat_pay_serial_no &&
    setupRecord.wechat_pay_cert &&
    setupRecord.wechat_pay_private_key

  if (!hasAllKeys) {
    // 修复 v7：返回具体缺失字段，便于前端提示用户补全
    const missingFields: string[] = []
    if (!setupRecord.wechat_pay_mchid) missingFields.push('商户号')
    if (!setupRecord.wechat_pay_apiv3_key) missingFields.push('APIv3密钥')
    if (!setupRecord.wechat_pay_serial_no) missingFields.push('商户证书序列号')
    if (!setupRecord.wechat_pay_cert) missingFields.push('商户证书PEM')
    if (!setupRecord.wechat_pay_private_key) missingFields.push('商户私钥PEM')
    console.warn('[wechat-pay] 配置不完整，缺失字段:', missingFields.join('、'))
    return null
  }

  return {
    mchid: setupRecord.wechat_pay_mchid,
    apiv3Key: setupRecord.wechat_pay_apiv3_key,
    serialNo: setupRecord.wechat_pay_serial_no,
    certPem: setupRecord.wechat_pay_cert,
    privateKeyPem: setupRecord.wechat_pay_private_key
  }
}

// 从PEM证书中提取公钥
function extractPublicKey(certPem: string): string {
  try {
    const cert = new crypto.X509Certificate(certPem)
    return cert.publicKey.export({ type: 'spki', format: 'pem' }) as string
  } catch {
    return certPem
  }
}

// 生成微信V3支付签名
function createV3PaySign(httpMethod: string, urlPath: string, timeStampSec: number, randNonce: string, requestBody: string, privatePem: string): string {
  const signSource = httpMethod + '\n' + urlPath + '\n' + timeStampSec + '\n' + randNonce + '\n' + requestBody + '\n'
  const signTool = crypto.createSign('RSA-SHA256')
  signTool.update(signSource)
  return signTool.sign(privatePem, 'base64')
}

// 组装鉴权头
function buildAuthHeader(mchid: string, serialNo: string, timeStampSec: number, randNonce: string, signVal: string): string {
  return 'WECHATPAY2-SHA256-RSA2048 mchid="' + mchid + '",nonce_str="' + randNonce + '",timestamp="' + timeStampSec + '",serial_no="' + serialNo + '",signature="' + signVal + '"'
}

// AES-256-GCM 解密（微信支付V3回调解密）
function aesGcmDecrypt(key: string, nonce: string, ciphertext: string, associatedData: string): string {
  const keyBuffer = Buffer.from(key, 'utf8')
  const nonceBuffer = Buffer.from(nonce, 'utf8')
  const cipherBuffer = Buffer.from(ciphertext, 'base64')
  const aadBuffer = Buffer.from(associatedData, 'utf8')

  const authTag = cipherBuffer.slice(cipherBuffer.length - 16)
  const encryptedData = cipherBuffer.slice(0, cipherBuffer.length - 16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, nonceBuffer)
  decipher.setAAD(aadBuffer)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedData, undefined, 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// v4 修复：从请求头获取真实客户端 IP（替代硬编码 127.0.0.1）
function getClientIp(headers: Headers | null | undefined): string {
  if (!headers) return '127.0.0.1'
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0].trim()
    if (first) return first
  }
  const xri = headers.get('x-real-ip')
  if (xri) return xri.trim()
  return '127.0.0.1'
}

// 调用微信V3 Native接口创建支付订单
export async function buildWechatPayOrder(bkUserId: string, planType: string, payPrice: number, notifyEndPoint: string, requestHeaders?: Headers | null): Promise<WechatNativeResult> {
  const merchantSetup = await loadWechatMerchantSetup()

  if (merchantSetup === null) {
    return {
      runCheckTag: false,
      message: '微信支付配置不完整，请前往系统设置完善商户信息'
    }
  }

  // 读取微信支付AppID
  // v4 C9 修复：微信开放平台「网站应用」AppID 已不支持绑定商户号用于支付
  // 必须使用服务号/小程序/移动应用 AppID，因此不再回退到 wechat_appid
  const appIdCfgList = await prisma.systemConfig.findMany({
    where: { configKey: { in: ['wechat_pay_appid', 'wechat_pay_mchid'] } }
  })
  const cfgMap: Record<string, string> = {}
  for (const row of appIdCfgList) cfgMap[row.configKey] = row.configValue || ''
  const payAppId = cfgMap.wechat_pay_appid || ''

  const mchidForLog = merchantSetup.mchid || cfgMap.wechat_pay_mchid || ''
  console.log('[微信支付下单] 当前参数: payAppId=' + payAppId + ', mchid=' + mchidForLog + ', planType=' + planType + ', price=' + payPrice + ', notify=' + notifyEndPoint)

  if (!payAppId) {
    return {
      runCheckTag: false,
      message: '支付AppID未配置。微信开放平台「网站应用」AppID不支持支付，请在系统设置-支付设置中填写已认证的服务号或小程序AppID。'
    }
  }
  if (!mchidForLog) {
    return {
      runCheckTag: false,
      message: '商户号未配置，请在系统设置-支付设置中配置微信商户号'
    }
  }

  const outTradeNo = 'TZWX' + Date.now() + crypto.randomBytes(4).toString('hex').toUpperCase()
  const timeStampSec = Math.floor(Date.now() / 1000)
  const randNonce = crypto.randomBytes(16).toString('hex')

  // v4 修复：使用 computePlanLabel 统一标签，支持 lifetime
  const planLabel = computePlanLabel(planType)
  const clientIp = getClientIp(requestHeaders)

  // 🔥 修复（P1）：订单有效期必须在下单前算好并作为 time_expire 传给微信，
  //   否则会出现「本地已判过期并置失效、微信侧仍可付款成功 → 回调不再发卡」的死单。
  const expireMinutesForOrder = await getOrderExpireMinutes()
  const expireTimeForOrder = new Date(Date.now() + expireMinutesForOrder * 60 * 1000).toISOString()

  const reqPayload = JSON.stringify({
    appid: payAppId,
    mchid: merchantSetup.mchid,
    description: '途中文枢VIP-' + planLabel + '会员',
    out_trade_no: outTradeNo,
    notify_url: notifyEndPoint,
    time_expire: expireTimeForOrder,
    amount: {
      total: Math.round(payPrice * 100),
      currency: 'CNY'
    },
    scene_info: {
      payer_client_ip: clientIp
    }
  })

  const apiPath = '/v3/pay/transactions/native'
  const v3Sign = createV3PaySign('POST', apiPath, timeStampSec, randNonce, reqPayload, merchantSetup.privateKeyPem)
  const authHeader = buildAuthHeader(merchantSetup.mchid, merchantSetup.serialNo, timeStampSec, randNonce, v3Sign)

  let wxResponse: Record<string, unknown>
  try {
    const netConn = await fetch('https://api.mch.weixin.qq.com/v3/pay/transactions/native', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authHeader,
        'User-Agent': 'TuzhongWenshu/1.0'
      },
      body: reqPayload
    })

    wxResponse = await netConn.json()
  } catch (netFault) {
    console.error('微信支付接口请求失败:', netFault instanceof Error ? netFault.message : String(netFault))
    return {
      runCheckTag: false,
      message: '微信支付网络请求失败，请检查商户配置'
    }
  }

  if (!wxResponse.code_url) {
    console.error('[微信支付下单] 返回异常:', JSON.stringify(wxResponse || {}), ' | 当前入参: appid=' + payAppId + ', mchid=' + merchantSetup.mchid)
    let errMsg = (wxResponse.message as string) || '下单失败'
    if (wxResponse.code === 'PARAM_ERROR') errMsg = '参数错误，请检查AppID和商户号配置（当前AppID=' + payAppId + '，商户号=' + merchantSetup.mchid + '）'
    if (wxResponse.code === 'APPID_MCHID_NOT_MATCH') {
      errMsg = 'AppID与商户号不匹配（当前AppID=' + payAppId + '，商户号=' + merchantSetup.mchid + '）。\n\n【根本原因】微信开放平台「网站应用」AppID 已不支持绑定商户号用于支付。\n\n【解决方案】\n1. 注册一个微信服务号（主体：莆田市途中网网络科技有限公司），完成认证；\n2. 登录微信商户平台 → 产品中心 → AppID账号管理 → 关联该服务号AppID；\n3. 登录公众平台确认授权绑定；\n4. 回到本系统管理后台 → 支付设置 → 「支付AppID（服务号/小程序）」填写服务号AppID。\n\n注意：服务号AppID仅用于支付，不影响扫码登录（扫码登录仍用网站应用AppID）。'
    }
    if (wxResponse.code === 'SIGN_ERROR') errMsg = '签名验证失败（APIv3密钥/商户证书序列号/私钥PEM不匹配），请在支付设置重新上传API证书ZIP并核对APIv3密钥'
    if (wxResponse.code === 'NO_AUTH') errMsg = '商户无Native支付权限，请在微信商户平台开通「Native动态扫码支付」产品'
    if (wxResponse.code === 'ORDER_CLOSED') errMsg = '商户单号已关闭，请刷新页面重新下单'
    if (wxResponse.code === 'RATE_LIMITED') errMsg = '微信支付接口限流，请稍后重试'
    return {
      runCheckTag: false,
      message: errMsg
    }
  }

  // 读取配置的订单有效期（分钟），默认30分钟
  const expireMinutes = await getOrderExpireMinutes()
  const expireTime = new Date(Date.now() + expireMinutes * 60 * 1000).toISOString()

  // 创建新订单前，顺便清理过期未支付订单（自动取消机制）
  try {
    const sweptCount = await sweepExpiredOrders()
    if (sweptCount > 0) {
      console.log('[微信支付下单] 自动清理过期订单 ' + sweptCount + ' 笔')
    }
  } catch (e) { console.error('[wechat-pay] 下单前自动清理过期订单失败:', e) }

  const newPayOrder = await prisma.payment.create({
    data: {
      userId: bkUserId,
      orderNo: outTradeNo,
      amount: payPrice,
      planType: planType,
      channel: 'wechat',
      status: 0,
      qrCodeUrl: wxResponse.code_url as string,
      expireAt: expireTime,
      createdAt: new Date().toISOString()
    }
  })

  return {
    runCheckTag: true,
    codeUrl: wxResponse.code_url as string,
    orderNo: outTradeNo,
    payId: newPayOrder.id,
    expireAt: expireTime,
    expireMinutes: expireMinutes,
  }
}

/** 取「微信支付平台证书」公钥用于验签：缓存 → 后台上传 → GET /v3/certificates 下载（APIv3 解密） */
async function resolveWechatPlatformPublicKey(
  merchantSetup: { mchid: string; apiv3Key: string; serialNo: string; certPem: string; privateKeyPem: string },
  notifySerial: string
): Promise<string | null> {
  const wanted = String(notifySerial || '').trim().toUpperCase()
  for (const e of _platformCertMap.values()) {
    if (e.expireAt > Date.now() && (!wanted || !e.serialNo || e.serialNo.toUpperCase() === wanted)) return e.cert
  }
  try {
    const manual = await prisma.systemConfig.findFirst({ where: { configKey: { in: ['wechat_pay_platform_cert', 'wechat_pay_public_key'] } } })
    if (manual && manual.configValue) {
      const v = manual.configValue
      return v.indexOf('BEGIN CERTIFICATE') !== -1 ? extractPublicKey(v) : v
    }
  } catch (e) { console.error('[wechat-pay] 读取手工上传的平台证书失败:', e) }
  try {
    const ts = Math.floor(Date.now() / 1000)
    const nonce = crypto.randomBytes(16).toString('hex')
    const sign = createV3PaySign('GET', '/v3/certificates', ts, nonce, '', merchantSetup.privateKeyPem)
    const resp = await fetch('https://api.mch.weixin.qq.com/v3/certificates', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': buildAuthHeader(merchantSetup.mchid, merchantSetup.serialNo, ts, nonce, sign),
        'User-Agent': 'TuzhongWenshu/1.0',
      },
    })
    if (!resp.ok) { console.error('[wechat-pay] 下载平台证书失败 HTTP ' + resp.status); return null }
    const payload = await resp.json()
    const list = Array.isArray((payload as { data?: unknown[] })?.data) ? (payload as { data: unknown[] }).data : []
    for (const item of list as Array<Record<string, any>>) {
      const enc = item && item.encrypt_certificate
      if (!enc || !enc.nonce_str || !enc.ciphertext) continue
      try {
        const certPem = aesGcmDecrypt(merchantSetup.apiv3Key, enc.nonce_str, enc.ciphertext, enc.associated_data || '')
        const serialNo = String(item.serial_no || '')
        const expMs = Date.parse(String(item.expires_at || '')) || (Date.now() + 12 * 3600 * 1000)
        _platformCertMap.set(serialNo || ('k' + _platformCertMap.size), { cert: certPem, serialNo, expireAt: expMs - 60 * 1000 })
      } catch (de) { console.error('[wechat-pay] 平台证书解密失败（核对 APIv3 密钥）:', de instanceof Error ? de.message : String(de)) }
    }
    for (const e of _platformCertMap.values()) if (!wanted || e.serialNo.toUpperCase() === wanted) return e.cert
    const anyOne = _platformCertMap.values().next().value
    return anyOne ? anyOne.cert : null
  } catch (e) {
    console.error('[wechat-pay] 获取微信支付平台证书异常:', e instanceof Error ? e.message : String(e))
    return null
  }
}

// 验签微信支付回调通知（V3 RSA-SHA256验签）
// v4 C3 修复：增加时间戳窗口校验，防止重放攻击
export async function checkCallbackSign(timeStampHeader: string, nonceHeader: string, signHeader: string, serialHeader: string, bodyText: string): Promise<boolean> {
  const merchantSetup = await loadWechatMerchantSetup()
  if (merchantSetup === null) {
    return false
  }

  // v4 C3 修复：时间戳窗口校验（±5 分钟），防止重放攻击
  const ts = parseInt(timeStampHeader, 10)
  if (!isNaN(ts)) {
    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - ts) > 300) {
      console.error('[微信支付回调验签] 时间戳超出窗口:', ts, '当前:', nowSec)
      return false
    }
  }

  try {
    const message = timeStampHeader + '\n' + nonceHeader + '\n' + bodyText + '\n'
    // 🔥 修复（P1 验签必然失败）：回调由「微信支付平台证书」私钥签名，旧实现拿商户自己的
    //   apiclient_cert 公钥去验，且 wechatpay-serial 头从未使用 → 真实回调 100% 验签不过。
    const publicKey = await resolveWechatPlatformPublicKey(merchantSetup, serialHeader)
    if (!publicKey) {
      console.error('[微信支付回调验签] 拿不到微信支付平台证书（serial=' + String(serialHeader || '-') + '），拒绝放行')
      return false
    }

    const verifier = crypto.createVerify('RSA-SHA256')
    verifier.update(message)
    const result = verifier.verify(publicKey, signHeader, 'base64')
    return result
  } catch (e) {
    console.error('[微信支付回调验签] 异常:', e instanceof Error ? e.message : String(e))
    return false
  }
}

// 解密微信支付回调的resource字段
function decryptNotifyResource(apiv3Key: string, resource: Record<string, unknown>): unknown {
  try {
    const nonce = resource.nonce as string
    const ciphertext = resource.ciphertext as string
    const associatedData = (resource.associated_data as string) || ''

    const decrypted = aesGcmDecrypt(apiv3Key, nonce, ciphertext, associatedData)
    return JSON.parse(decrypted)
  } catch (e) {
    console.error('[微信支付回调解密] 异常:', e instanceof Error ? e.message : String(e))
    return null
  }
}

// v4 C4 修复：原子化处理支付成功（事务 + 乐观锁，防止并发双重开通）
async function processPaymentSuccess(payOrderId: string, payOrderUserId: string, planType: string): Promise<boolean> {
  const nowTime = new Date()
  const expireDate = computeExpiryDate(planType, nowTime)
  const tier = computeTier(planType)

  try {
    await prisma.$transaction(async (tx) => {
      // 乐观锁：仅当 status=0 时才更新（防止并发重复处理）
      // 🔥 修复：待支付(0) 与被本地过期扫描置为失效(2)/取消(3) 的订单，只要微信真的扣款
      //   成功就必须开通会员（旧实现只认 status=0 → 收了钱不开通）。已开通(1) 仍幂等跳过。
      const updated = await tx.payment.updateMany({
        where: { id: payOrderId, status: { in: [0, 2, 3] } },
        data: {
          status: 1,
          auditTime: nowTime.toISOString()
        }
      })

      if (updated.count === 0) {
        // 已被其他并发请求处理，跳过
        throw new Error('ALREADY_PROCESSED')
      }

      await tx.user.update({
        where: { id: payOrderUserId },
        data: {
          subscriptionTier: tier,
          // 🔥 修复：subscriptionStartedAt 此前从不写入，会员起始时间无从核对
          subscriptionStartedAt: nowTime.toISOString(),
          subscriptionExpiresAt: expireDate.toISOString(),
          updatedAt: nowTime.toISOString()
        }
      })
    })
    return true
  } catch (e) {
    if (e instanceof Error && e.message === 'ALREADY_PROCESSED') {
      return false // 已处理，非错误
    }
    throw e
  }
}

// 处理微信支付回调：自动更新订单状态并开通VIP
// v4 C1 修复：调用方必须先通过 checkCallbackSign 验签（callback/route.ts 已实现）
export async function handlePayCallback(bodyText: string): Promise<NotifyResult> {
  let parsedBody: Record<string, unknown>
  try {
    parsedBody = JSON.parse(bodyText) as Record<string, unknown>
  } catch {
    return {
      runCheckTag: false,
      message: '回调数据解析失败'
    }
  }

  const merchantSetup = await loadWechatMerchantSetup()
  if (!merchantSetup) {
    return {
      runCheckTag: false,
      message: '商户配置不完整'
    }
  }

  let outTradeNo = ''
  let tradeState = ''
  let paidAmount: number | null = null // v4 2.4 修复：金额校验

  const resourceField = parsedBody.resource as Record<string, unknown> | undefined
  if (resourceField && resourceField.ciphertext) {
    const decrypted = decryptNotifyResource(merchantSetup.apiv3Key, resourceField) as Record<string, unknown> | null
    if (!decrypted) {
      return {
        runCheckTag: false,
        message: '回调解密失败'
      }
    }
    outTradeNo = decrypted.out_trade_no as string
    tradeState = decrypted.trade_state as string
    // v4 2.4 修复：提取支付金额用于校验
    const amountField = decrypted.amount as { total: number } | undefined
    if (amountField && typeof amountField.total === 'number') {
      paidAmount = amountField.total
    }
    console.log('[微信支付回调] 解密成功:', { outTradeNo, tradeState, transactionId: decrypted.transaction_id })
  } else {
    outTradeNo = parsedBody.out_trade_no as string
    tradeState = parsedBody.trade_state as string
  }

  if (!outTradeNo) {
    return {
      runCheckTag: false,
      message: '回调数据缺少订单号'
    }
  }

  const payOrder = await prisma.payment.findFirst({
    where: {
      orderNo: outTradeNo,
      channel: 'wechat'
    }
  })

  if (!payOrder) {
    return {
      runCheckTag: false,
      message: '订单不存在'
    }
  }

  // 订单已处理，无需重复操作
  if (payOrder.status !== 0) {
    return {
      runCheckTag: true,
      message: '订单已处理'
    }
  }

  // v4 2.4 修复：金额校验（解密后比对订单金额）
  if (paidAmount !== null) {
    const expectedAmount = Math.round(payOrder.amount * 100)
    if (paidAmount !== expectedAmount) {
      console.error('[微信支付回调] 金额不匹配:', { paidAmount, expectedAmount, orderNo: outTradeNo })
      return {
        runCheckTag: false,
        message: '支付金额与订单金额不匹配'
      }
    }
  }

  // 支付成功，自动开通会员
  if (tradeState === 'SUCCESS') {
    const success = await processPaymentSuccess(payOrder.id, payOrder.userId, payOrder.planType)
    if (success) {
      return {
        runCheckTag: true,
        message: '支付校验通过，VIP已自动开通' + (payOrder.planType === 'lifetime' ? '（终身会员）' : '')
      }
    }
    return {
      runCheckTag: true,
      message: '订单已处理'
    }
  }

  // 支付关闭或失败，标记订单失效（乐观锁：仅当 status=0 时更新）
  await prisma.payment.updateMany({
    where: { id: payOrder.id, status: 0 },
    data: { status: 2 }
  })

  return {
    runCheckTag: true,
    message: '订单已关闭'
  }
}

// 主动向微信支付查询订单状态
async function queryWxOrderFromApi(outTradeNo: string): Promise<{ tradeState: string, tradeStateDesc: string } | null> {
  const merchantSetup = await loadWechatMerchantSetup()
  if (!merchantSetup) return null

  try {
    const apiPath = '/v3/pay/transactions/out-trade-no/' + outTradeNo + '?mchid=' + merchantSetup.mchid
    const timeStampSec = Math.floor(Date.now() / 1000)
    const randNonce = crypto.randomBytes(16).toString('hex')

    const v3Sign = createV3PaySign('GET', apiPath, timeStampSec, randNonce, '', merchantSetup.privateKeyPem)
    const authHeader = buildAuthHeader(merchantSetup.mchid, merchantSetup.serialNo, timeStampSec, randNonce, v3Sign)

    const resp = await fetch('https://api.mch.weixin.qq.com' + apiPath, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader,
        'User-Agent': 'TuzhongWenshu/1.0'
      }
    })

    const data = await resp.json()
    if (data.trade_state) {
      return {
        tradeState: data.trade_state,
        tradeStateDesc: data.trade_state_desc || ''
      }
    }
    console.error('[微信支付查询] 返回异常:', data.code || 'unknown')
    return null
  } catch (e) {
    console.error('[微信支付查询] 网络异常:', e instanceof Error ? e.message : String(e))
    return null
  }
}

// 轮询查询微信支付订单状态（优先查本地，未支付则主动查询微信）
export async function queryPayOrderStatus(outTradeNo: string): Promise<OrderStatusResult> {
  // 轮询时顺便清理过期订单（自动取消机制 - 每次轮询触发一次批量清理）
  try {
    await sweepExpiredOrders()
  } catch (e) { console.error('[wechat-pay] 轮询时自动清理过期订单失败:', e) }

  const payOrder = await prisma.payment.findFirst({
    where: {
      orderNo: outTradeNo,
      channel: 'wechat'
    }
  })

  if (!payOrder) {
    return {
      operateStateMark: -1,
      isExpired: true
    }
  }

  // 未支付订单检查是否超时，并主动查询微信
  if (payOrder.status === 0) {
    if (payOrder.expireAt) {
      const nowTime = new Date()
      const expireDate = new Date(payOrder.expireAt)
      if (nowTime > expireDate) {
        await prisma.payment.updateMany({
          where: { id: payOrder.id, status: 0 },
          data: { status: 2 }
        })
        return {
          operateStateMark: 2,
          isExpired: true
        }
      }
    }

    const wxStatus = await queryWxOrderFromApi(outTradeNo)
    if (wxStatus && wxStatus.tradeState === 'SUCCESS') {
      // v4 C5 修复：使用统一的 processPaymentSuccess 函数，确保终身会员计算一致
      await processPaymentSuccess(payOrder.id, payOrder.userId, payOrder.planType)

      console.log('[微信支付轮询] 主动查询确认支付成功:', outTradeNo)
      return {
        operateStateMark: 1,
        isExpired: false
      }
    }

    if (wxStatus && (wxStatus.tradeState === 'CLOSED' || wxStatus.tradeState === 'REVOKED')) {
      await prisma.payment.updateMany({
        where: { id: payOrder.id, status: 0 },
        data: { status: 2 }
      })
      return {
        operateStateMark: 2,
        isExpired: true
      }
    }
  }

  return {
    operateStateMark: payOrder.status,
    isExpired: false
  }
}

// 定时清理过期未支付的微信订单
export async function sweepExpiredOrders(): Promise<number> {
  const nowTime = new Date().toISOString()
  const sweepResult = await prisma.payment.updateMany({
    where: {
      channel: 'wechat',
      status: 0,
      expireAt: {
        not: null,
        lt: nowTime
      }
    },
    data: { status: 2 }
  })

  return sweepResult.count
}
