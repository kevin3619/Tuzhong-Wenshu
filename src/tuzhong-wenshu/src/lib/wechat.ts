import { prisma } from '@/lib/prisma'
import { createToken } from '@/lib/auth'
import { randomBytes } from 'crypto'

interface WxLoginTokenStore {
  tokenKey: string
  scanStatus: 'pending' | 'scanned' | 'confirmed'
  createStamp: number
  userId?: string
  openid?: string
  jwtToken?: string
}

let _wxLoginTokenPool: Map<string, WxLoginTokenStore> | null = null

function getWxLoginTokenPool(): Map<string, WxLoginTokenStore> {
  if (!_wxLoginTokenPool) {
    const globalAny = globalThis as unknown as { __wxLoginTokenPool?: Map<string, WxLoginTokenStore> }
    if (!globalAny.__wxLoginTokenPool) {
      globalAny.__wxLoginTokenPool = new Map<string, WxLoginTokenStore>()
    }
    _wxLoginTokenPool = globalAny.__wxLoginTokenPool
  }
  return _wxLoginTokenPool!
}

const wxLoginTokenPool = getWxLoginTokenPool()

const WX_TOKEN_EXPIRE_MS = 5 * 60 * 1000
const WX_SESS_KEY_PREFIX = 'wxsess_'

// DB 持久化层（v4 C8 新增）：避免开发环境 HMR 热重载 / 多实例部署 / Serverless 下内存 Map 跨请求丢失
async function _loadWxSessionFromDB(tokenKey: string): Promise<WxLoginTokenStore | null> {
  try {
    const row = await prisma.systemConfig.findUnique({ where: { configKey: WX_SESS_KEY_PREFIX + tokenKey } })
    if (!row || !row.configValue) return null
    const parsed = JSON.parse(row.configValue) as WxLoginTokenStore
    if (parsed && typeof parsed.createStamp === 'number' && Date.now() - parsed.createStamp < WX_TOKEN_EXPIRE_MS) {
      return parsed
    }
    if (parsed) {
      try { await prisma.systemConfig.delete({ where: { configKey: WX_SESS_KEY_PREFIX + tokenKey } }) } catch (e) { console.error('[wechat] 删除过期微信会话失败:', e) }
    }
    return null
  } catch {
    return null
  }
}

async function _saveWxSessionToDB(entry: WxLoginTokenStore): Promise<void> {
  try {
    const key = WX_SESS_KEY_PREFIX + entry.tokenKey
    const nowIso = new Date().toISOString()
    await prisma.systemConfig.upsert({
      where: { configKey: key },
      update: { configValue: JSON.stringify(entry), updatedAt: nowIso },
      create: { configKey: key, configValue: JSON.stringify(entry), createdAt: nowIso, updatedAt: nowIso },
    })
  } catch (e) { console.error('[wechat] 保存微信会话到DB失败:', e) }
}

async function _removeWxSessionFromDB(tokenKey: string): Promise<void> {
  try {
    await prisma.systemConfig.delete({ where: { configKey: WX_SESS_KEY_PREFIX + tokenKey } })
  } catch (e) { console.error('[wechat] 从DB删除微信会话失败:', e) }
}

// 清理过期登录token
async function sweepExpiredWxTokens() {
  const nowStamp = Date.now()
  const keyList: string[] = []
  wxLoginTokenPool.forEach(function (_val, key) {
    keyList.push(key)
  })
  for (let i = 0; i < keyList.length; i++) {
    const entry = wxLoginTokenPool.get(keyList[i])
    if (entry && nowStamp - entry.createStamp > WX_TOKEN_EXPIRE_MS) {
      wxLoginTokenPool.delete(keyList[i])
      // fire-and-forget 清理 DB
      _removeWxSessionFromDB(keyList[i])
    }
  }
  // Bug#3（次要）：内存外的 DB wxsess_ 行此前无人清理（219条遗留），
  // 目测表只有几百行，直接按 ttl 全量清一次成本低
  try {
    // updatedAt 为 ISO 字符串存储（schema: String），字典序等价时间序，可直接字符串比较
    await prisma.systemConfig.deleteMany({
      where: { configKey: { startsWith: 'wxsess_' }, updatedAt: { lt: new Date(nowStamp - WX_TOKEN_EXPIRE_MS * 2).toISOString() } },
    })
  } catch (_e) { /* 忽略 */ }
}

// 创建新的微信登录Token（同时写入内存和 DB，避免跨进程丢失）
export async function createWxLoginToken(): Promise<string> {
  await sweepExpiredWxTokens()
  const tokenKey = 'wx_' + randomBytes(18).toString('hex')
  const entry: WxLoginTokenStore = {
    tokenKey: tokenKey,
    scanStatus: 'pending',
    createStamp: Date.now(),
  }
  wxLoginTokenPool.set(tokenKey, entry)
  await _saveWxSessionToDB(entry)
  return tokenKey
}

// 获取微信登录Token状态（内存优先，DB 兜底）
export async function fetchWxLoginToken(tokenKey: string): Promise<WxLoginTokenStore | null> {
  let entry: WxLoginTokenStore | null | undefined = wxLoginTokenPool.get(tokenKey)
  if (!entry) {
    // 内存 miss → 从 DB 还原（多实例 / HMR 场景下关键）
    entry = (await _loadWxSessionFromDB(tokenKey)) ?? undefined
    if (entry) wxLoginTokenPool.set(tokenKey, entry)
  }
  if (!entry) {
    return null
  }
  if (Date.now() - entry.createStamp > WX_TOKEN_EXPIRE_MS) {
    wxLoginTokenPool.delete(tokenKey)
    await _removeWxSessionFromDB(tokenKey)
    return null
  }
  return entry
}

// 标记已扫码（内存 + DB 同步）
export async function stampWxScanFlag(tokenKey: string): Promise<boolean> {
  const entry = await fetchWxLoginToken(tokenKey)
  if (entry && entry.scanStatus === 'pending') {
    entry.scanStatus = 'scanned'
    wxLoginTokenPool.set(tokenKey, entry)
    await _saveWxSessionToDB(entry)
    return true
  }
  return false
}

// 标记已确认登录（内存 + DB 同步，确保轮询端一定能取到）
export async function stampWxConfirmFlag(tokenKey: string, userId: string, jwtToken: string): Promise<boolean> {
  const entry = await fetchWxLoginToken(tokenKey)
  if (entry && (entry.scanStatus === 'pending' || entry.scanStatus === 'scanned')) {
    entry.scanStatus = 'confirmed'
    entry.userId = userId
    entry.jwtToken = jwtToken
    wxLoginTokenPool.set(tokenKey, entry)
    await _saveWxSessionToDB(entry)
    return true
  }
  return false
}

// 拉取微信开放平台配置（v4 C8：增加 callback_domain，解决内网IP/localhost 无法被微信服务器回调的问题）
export async function pullWxOpenPlatformCfg(): Promise<{ appid: string; appsecret: string; callbackDomain?: string } | null> {
  try {
    const cfgRecords = await prisma.systemConfig.findMany({
      where: { configKey: { in: ['wechat_appid', 'wechat_appsecret', 'wechat_callback_domain'] } },
    })
    const cfgMap: Record<string, string> = {}
    for (let i = 0; i < cfgRecords.length; i++) {
      cfgMap[cfgRecords[i].configKey] = cfgRecords[i].configValue || ''
    }
    if (cfgMap.wechat_appid && cfgMap.wechat_appsecret) {
      const rawCb = cfgMap.wechat_callback_domain || ''
      const callbackDomain = rawCb ? rawCb.replace(/\/+$/, '') : ''
      return { appid: cfgMap.wechat_appid, appsecret: cfgMap.wechat_appsecret, callbackDomain }
    }
    return null
  } catch (_err) {
    return null
  }
}

// 让微信 iframe 内的“快捷登录”面板在二维码区域中垂直居中（通过 href 注入自定义 CSS）
const WX_LOGIN_CUSTOM_CSS =
  `html, body { height: 100% !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }\n` +
  `body { display: flex !important; align-items: center !important; justify-content: center !important; box-sizing: border-box !important; }\n` +
  `#tpl_for_iframe, .web_qrcode_panel_area { height: 100% !important; min-width: 100% !important; align-self: stretch !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; }\n` +
  `.web_qrcode_panel_wrp, .old-template, .impowerBox, .loginPanel, .normalPanel, .panelContent, .waiting { display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; }\n` +
  `.js_quick_login { width: 100% !important; text-align: center !important; }\n` +
  `.js_quick_login:not([style*="display: none"]) { display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; width: 100% !important; height: 100% !important; }\n` +
  `.js_quick_login .qlogin_mod { display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; width: 100% !important; height: auto !important; margin: 0 auto !important; text-align: center !important; }\n` +
  `.qlogin_user_avatar, .js_quick_login_avatar { margin: 0 auto 12px !important; }\n` +
  `.qlogin_user_nickname, .js_quick_login_nickname { text-align: center !important; margin-bottom: 16px !important; }\n` +
  `.qlogin_btn, .js_quick_login_btn { margin: 0 auto !important; }\n` +
  `.web_qrcode_switch_wrp { text-align: center !important; margin-top: 12px !important; }\n` +
  `.wrp_code, .web_qrcode_img_wrp { display: flex !important; align-items: center !important; justify-content: center !important; }\n` +
  `.web_qrcode_img { display: block !important; margin: 0 auto !important; }\n` +
  `.status, .info, .web_qrcode_initial_context { text-align: center !important; width: 100% !important; }`
const WX_LOGIN_CSS_HREF = 'data:text/css;base64,' + Buffer.from(WX_LOGIN_CUSTOM_CSS, 'utf8').toString('base64')

// 构建微信扫码登录二维码URL
// v4 C8：优先使用 wechat_callback_domain（系统管理员配置的公网 HTTPS 域名）替换请求 origin，确保微信服务器能正确回调
export async function buildWxQrCodeUrl(tokenKey: string, originAddr: string): Promise<{
  qrCodeAddr: string
  isRealWxAuth: boolean
  message?: string
}> {
  const openCfg = await pullWxOpenPlatformCfg()

  if (openCfg && openCfg.appid && openCfg.appsecret) {
    const baseAddr = openCfg.callbackDomain || originAddr.replace(/\/+$/, '')
    const redirectUri = encodeURIComponent(baseAddr + '/tuzhong-wenshu/api/wechat/callback')
    const wxAuthUrl = 'https://open.weixin.qq.com/connect/qrconnect?appid=' + openCfg.appid +
      '&redirect_uri=' + redirectUri +
      '&response_type=code&scope=snsapi_login&state=' + tokenKey +
      '&href=' + encodeURIComponent(WX_LOGIN_CSS_HREF) +
      '#wechat_redirect'
    return { qrCodeAddr: wxAuthUrl, isRealWxAuth: true }
  }

  return {
    qrCodeAddr: '',
    isRealWxAuth: false,
    message: '微信开放平台配置不完整，请在管理后台-系统设置-基本设置中配置AppID和AppSecret',
  }
}

// 微信OAuth回调处理（自研核心逻辑 - 完整OAuth2.0 + openid绑定 + 账号创建）
export async function processWxOauthCallback(authCode: string, tokenKey: string): Promise<{
  runCheckTag: boolean
  promptMsg: string
  jwtToken?: string
  wxNickname?: string
  wxAvatar?: string
}> {
  const loginEntry = await fetchWxLoginToken(tokenKey)
  if (!loginEntry) {
    return { runCheckTag: false, promptMsg: '登录会话已过期，请刷新二维码重试' }
  }

  const openCfg = await pullWxOpenPlatformCfg()
  if (!openCfg) {
    return { runCheckTag: false, promptMsg: '微信登录未配置' }
  }

  try {
    // 第一步：用code换取access_token
    console.log('[微信OAuth] 第一步: 用code换取access_token, tokenKey=' + tokenKey)
    const tokenResp = await fetch(
      'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + openCfg.appid +
      '&secret=' + openCfg.appsecret +
      '&code=' + authCode +
      '&grant_type=authorization_code'
    )
    const tokenBody = await tokenResp.json()

    // 微信密钥过期拦截
    if (tokenBody.errcode) {
      console.error('[微信OAuth] 第一步失败: errcode=' + tokenBody.errcode + ', errmsg=' + tokenBody.errmsg)
      if (tokenBody.errcode === 40001 || tokenBody.errcode === 40029) {
        return { runCheckTag: false, promptMsg: '微信密钥已过期或无效，请联系管理员更新AppSecret' }
      }
      return { runCheckTag: false, promptMsg: '微信授权失败: ' + (tokenBody.errmsg || '未知错误') }
    }

    const wxOpenid = tokenBody.openid
    const wxAccessToken = tokenBody.access_token

    if (!wxOpenid || !wxAccessToken) {
      console.error('[微信OAuth] 第一步异常: 返回数据缺少openid或access_token')
      return { runCheckTag: false, promptMsg: '微信授权返回数据异常，请重试' }
    }

    console.log('[微信OAuth] 第一步成功: openid=' + wxOpenid)

    // 第二步：获取微信用户信息
    console.log('[微信OAuth] 第二步: 获取微信用户信息')
    const userInfoResp = await fetch(
      'https://api.weixin.qq.com/sns/userinfo?access_token=' + wxAccessToken +
      '&openid=' + wxOpenid
    )
    const userInfoBody = await userInfoResp.json()

    if (userInfoBody.errcode) {
      console.error('[微信OAuth] 第二步失败: errcode=' + userInfoBody.errcode + ', errmsg=' + userInfoBody.errmsg)
      return { runCheckTag: false, promptMsg: '获取微信用户信息失败: ' + (userInfoBody.errmsg || '未知错误') }
    }

    console.log('[微信OAuth] 第二步成功: nickname=' + (userInfoBody.nickname || '无'))

    // 第三步：查找或创建用户（账号重复绑定拦截）
    console.log('[微信OAuth] 第三步: 查找/创建用户')
    const existingUser = await prisma.user.findFirst({
      where: { wechatOpenid: wxOpenid },
    })

    let targetUserId: string
    let targetUserIsAdmin: boolean

    if (existingUser) {
      // 已有用户，更新微信信息
      console.log('[微信OAuth] 第三步: 已有用户, userId=' + existingUser.id)
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          nickname: existingUser.nickname || userInfoBody.nickname || '微信用户' + Date.now().toString(36).slice(-4),
          avatarUrl: userInfoBody.headimgurl || existingUser.avatarUrl,
          wechatUnionid: userInfoBody.unionid || existingUser.wechatUnionid,
        },
      })
      targetUserId = existingUser.id
      targetUserIsAdmin = existingUser.isAdmin
    } else {
      // 将微信登录绑定到已存在的 kevin 管理员账号（若该账号尚未绑定微信）；
      // 其余微信登录一律创建为普通 wx_ 用户，不会自动成为管理员。
      // 🔥 修复（P0 越权）：旧实现会把「第一个扫登录码的微信号」自动绑定到尚未绑定微信的
      //   管理员账号并直接下发 admin token —— 陌生人扫登录页二维码即可接管全站。
      //   管理员与微信的绑定必须在后台显式操作，登录流程只允许创建普通用户。
      const legacyAdminClaim = null as null | { id: string; avatarUrl: string | null; nickname: string | null }

      if (legacyAdminClaim) {
        await prisma.user.update({
          where: { id: legacyAdminClaim.id },
          data: {
            wechatOpenid: wxOpenid,
            wechatUnionid: userInfoBody.unionid || null,
            avatarUrl: userInfoBody.headimgurl || legacyAdminClaim.avatarUrl,
            nickname: userInfoBody.nickname || legacyAdminClaim.nickname || 'Kevin',
          },
        })
        console.log('[微信OAuth] 第三步: 微信已绑定到 kevin 管理员账号, userId=' + legacyAdminClaim.id)
        targetUserId = legacyAdminClaim.id
        targetUserIsAdmin = true
      } else {
        // 免费账号：避免同名冲突
        let wxUsername = 'wx_' + wxOpenid.slice(-8)
        const dupUser = await prisma.user.findFirst({ where: { username: wxUsername } })
        if (dupUser) {
          wxUsername = 'wx_' + wxOpenid.slice(-8) + '_' + Date.now().toString(36).slice(-4)
        }

        const newUser = await prisma.user.create({
          data: {
            username: wxUsername,
            nickname: userInfoBody.nickname || '微信用户' + Date.now().toString(36).slice(-4),
            password: '',
            wechatOpenid: wxOpenid,
            wechatUnionid: userInfoBody.unionid || null,
            avatarUrl: userInfoBody.headimgurl || null,
            isAdmin: false,
            subscriptionTier: 'free',
            subscriptionStartedAt: null,
            subscriptionExpiresAt: null,
          },
        })
        console.log('[微信OAuth] 第三步: 新建普通用户, userId=' + newUser.id + ', username=' + wxUsername)
        targetUserId = newUser.id
        targetUserIsAdmin = false
      }
    }

    // 第四步：生成JWT令牌
    console.log('[微信OAuth] 第四步: 生成JWT令牌, userId=' + targetUserId)
    const jwtToken = await createToken(targetUserId, targetUserIsAdmin)
    // 修复：必须 await，确保 confirmed 状态 + JWT 持久化到 DB 后再返回，
    // 否则前端轮询 /api/wechat/check 时取不到 confirmed 状态，导致登录卡死
    await stampWxConfirmFlag(tokenKey, targetUserId, jwtToken)
    console.log('[微信OAuth] 第四步完成: tokenKey=' + tokenKey + ' 状态已持久化为confirmed')

    return {
      runCheckTag: true,
      promptMsg: '登录成功',
      jwtToken: jwtToken,
      wxNickname: userInfoBody.nickname || (existingUser ? existingUser.nickname : ''),
      wxAvatar: userInfoBody.headimgurl || (existingUser ? existingUser.avatarUrl : ''),
    }
  } catch (_err) {
    console.error('[微信OAuth回调] 处理异常:', _err instanceof Error ? _err.message : String(_err))
    return { runCheckTag: false, promptMsg: '服务器内部错误' }
  }
}
