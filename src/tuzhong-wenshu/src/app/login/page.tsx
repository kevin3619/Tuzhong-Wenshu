'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, QrCode, Key, RefreshCw, AlertCircle } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'

function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const _loginMode = useState<'qr' | 'password'>('qr')
  const loginMode = _loginMode[0]
  const setLoginMode = _loginMode[1]

  const _pageMode = useState<'login' | 'register'>('login')
  const pageMode = _pageMode[0]
  const setPageMode = _pageMode[1]

  // 微信扫码登录状态
  const _wxLoginTokenKey = useState('')
  const wxLoginTokenKey = _wxLoginTokenKey[0]
  const setWxLoginTokenKey = _wxLoginTokenKey[1]

  const _wxQrCodeUrl = useState('')
  const wxQrCodeUrl = _wxQrCodeUrl[0]
  const setWxQrCodeUrl = _wxQrCodeUrl[1]

  const _wxScanStatus = useState<'pending' | 'scanned' | 'confirmed' | 'expired'>('pending')
  const wxScanStatus = _wxScanStatus[0]
  const setWxScanStatus = _wxScanStatus[1]

  const _wxQrLoadFlag = useState(false)
  const wxQrLoadFlag = _wxQrLoadFlag[0]
  const setWxQrLoadFlag = _wxQrLoadFlag[1]

  const _isRealWechat = useState(false)
  const isRealWechat = _isRealWechat[0]
  const setIsRealWechat = _isRealWechat[1]

  // Bug#2 修复：仅当服务器明确反馈"未配置"才显示配置横幅（与网络失败区分）
  const _wxConfigMissing = useState(false)
  const wxConfigMissing = _wxConfigMissing[0]
  const setWxConfigMissing = _wxConfigMissing[1]

  const _wxCountdown = useState(300)
  const wxCountdown = _wxCountdown[0]
  const setWxCountdown = _wxCountdown[1]

  const wxPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wxCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wxLoginTokenKeyRef = useRef<string>('')

  // 账号密码登录
  const _usernameInput = useState('')
  const usernameInput = _usernameInput[0]
  const setUsernameInput = _usernameInput[1]

  const _passwordInput = useState('')
  const passwordInput = _passwordInput[0]
  const setPasswordInput = _passwordInput[1]

  const _confirmPassInput = useState('')
  const confirmPassInput = _confirmPassInput[0]
  const setConfirmPassInput = _confirmPassInput[1]

  const _nicknameInput = useState('')
  const nicknameInput = _nicknameInput[0]
  const setNicknameInput = _nicknameInput[1]

  const _showPassFlag = useState(false)
  const showPassFlag = _showPassFlag[0]
  const setShowPassFlag = _showPassFlag[1]

  const _rememberFlag = useState(false)
  const rememberFlag = _rememberFlag[0]
  const setRememberFlag = _rememberFlag[1]

  const _submitLoadFlag = useState(false)
  const submitLoadFlag = _submitLoadFlag[0]
  const setSubmitLoadFlag = _submitLoadFlag[1]

  const _errorMsg = useState('')
  const errorMsg = _errorMsg[0]
  const setErrorMsg = _errorMsg[1]

  // 全局Logo
  const _logoUrl = useState<string | null>(null)
  const logoUrl = _logoUrl[0]
  const setLogoUrl = _logoUrl[1]

  const _clientOrigin = useState('')
  const clientOrigin = _clientOrigin[0]
  const setClientOrigin = _clientOrigin[1]

  // 初始化
  useEffect(function () {
    setClientOrigin(window.location.origin)

    // 处理微信回调返回的token
    const wxToken = searchParams.get('wechat_token')
    const errMsg = searchParams.get('error')
    if (wxToken) {
      processWxCallbackLogin(wxToken)
      return
    }
    if (errMsg) {
      setErrorMsg(decodeURIComponent(errMsg))
    }

    // 修复 v4 C3：移除明文密码存储，仅记住用户名（不泄露密码）
    const savedUser = localStorage.getItem('remembered_username')
    if (savedUser) {
      setUsernameInput(savedUser)
      setRememberFlag(true)
    }
    // 兼容旧版本数据清理：若发现遗留的明文密码则清除
    localStorage.removeItem('remembered_password')

    // 加载系统Logo
    fetch('/tuzhong-wenshu/api/config/public')
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        if (respBody.code === 200 && respBody.data.brandLogo) {
          setLogoUrl(respBody.data.brandLogo)
        }
      })
      .catch(function (err) { console.error('[login] 加载品牌Logo失败:', err) })

    // 初始生成微信二维码
    if (loginMode === 'qr') {
      buildWxLoginQrCode()
    }

    return function () {
      if (wxPollIntervalRef.current) {
        clearInterval(wxPollIntervalRef.current)
      }
      if (wxCountdownRef.current) {
        clearInterval(wxCountdownRef.current)
      }
    }
  }, [])

  function safeRedirect(target: string | null, fallback: string = '/') {
    if (!target) { router.push(fallback); return }
    try {
      const u = new URL(target, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
      if (u.origin === (typeof window !== 'undefined' ? window.location.origin : u.origin)) {
        const pathWithoutBase = u.pathname.replace(/^\/tuzhong-wenshu/, '') || '/'
        router.push(pathWithoutBase + u.search + u.hash)
      } else {
        router.push(fallback)
      }
    } catch {
      router.push(fallback)
    }
  }

  function getRedirectTarget(): string {
    const r = searchParams.get('redirect')
    if (r && (r.startsWith('/') || r.startsWith(window.location.origin))) return r
    return '/'
  }

  // 用 token 换取服务端 HttpOnly cookie。
  // 浏览器规范：document.cookie 无法覆盖/删除已存在的 HttpOnly 同名 cookie，
  // 若只靠前端写 cookie，旧的失效 token 会一直生效 → 401 → 被 SessionGuard 弹回登录页（闪退）。
  async function ensureServerSessionCookie(token: string) {
    try {
      await fetch('/tuzhong-wenshu/api/auth/session', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      })
    } catch (err) {
      console.error('[login] 写入服务端会话失败:', err)
    }
  }

  // 处理微信回调登录
  async function processWxCallbackLogin(token: string) {
    localStorage.setItem('token', token)
    // 修复 v4 C4：Cookie 增加 SameSite/Secure 属性
    const _isProdEnv1 = typeof window !== 'undefined' && window.location.protocol === 'https:'
    document.cookie = 'token=' + token + '; path=/; max-age=604800; SameSite=Lax' + (_isProdEnv1 ? '; Secure' : '')
    await ensureServerSessionCookie(token)
    fetch('/tuzhong-wenshu/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (res) { return res.json() })
      .then(function (userBody) {
        if (userBody.code === 200) {
          localStorage.setItem('user', JSON.stringify(userBody.data))
        }
      })
      .catch(function (err) { console.error('[login] 拉取用户信息失败:', err) })
    safeRedirect(getRedirectTarget())
  }

  // 完成登录
  async function finishLoginFlow(token: string) {
    localStorage.setItem('token', token)
    // 修复 v4 C4：Cookie 增加 SameSite/Secure 属性
    const _isProdEnv2 = typeof window !== 'undefined' && window.location.protocol === 'https:'
    document.cookie = 'token=' + token + '; path=/; max-age=604800; SameSite=Lax' + (_isProdEnv2 ? '; Secure' : '')
    await ensureServerSessionCookie(token)
    fetch('/tuzhong-wenshu/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (res) { return res.json() })
      .then(function (userBody) {
        if (userBody.code === 200) {
          localStorage.setItem('user', JSON.stringify(userBody.data))
        }
      })
      .catch(function (err) { console.error('[login] 拉取用户信息失败:', err) })
    safeRedirect(getRedirectTarget())
  }

  // 生成微信二维码
  function buildWxLoginQrCode() {
    setWxQrLoadFlag(true)
    setErrorMsg('')
    setWxConfigMissing(false)
    setWxQrCodeUrl('')
    setWxScanStatus('pending')
    setWxCountdown(300)
    // 清旧定时器
    if (wxCountdownRef.current) { clearInterval(wxCountdownRef.current); wxCountdownRef.current = null }
    // 直接读取 window.location.origin 避免状态异步延迟
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : clientOrigin
    fetch('/tuzhong-wenshu/api/wechat/qrcode?origin=' + encodeURIComponent(currentOrigin))
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        if (respBody.code === 200 && respBody.data.qrcodeUrl) {
          setWxLoginTokenKey(respBody.data.state)
          wxLoginTokenKeyRef.current = respBody.data.state
          setWxQrCodeUrl(respBody.data.qrcodeUrl)
          setIsRealWechat(true)
          setWxConfigMissing(false)
          setWxScanStatus('pending')
          beginWxScanPolling()
        } else {
          // 仅当服务器明确判断"未配置"时才显示配置横幅；
          // 其余失败（网络抖动/500）按"加载失败"处理，避免误报配置不完整
          const serverMsg = String(respBody.message || '')
          const missingCfg = serverMsg.indexOf('配置不完整') >= 0 || serverMsg.indexOf('请配置') >= 0
          setWxConfigMissing(missingCfg)
          setErrorMsg(missingCfg ? (serverMsg || '微信开放平台配置不完整，请联系管理员在后台配置AppID和AppSecret') : '二维码加载失败，请点击重试')
          setWxQrCodeUrl('')
          setIsRealWechat(false)
        }
      })
      .catch(function () {
        setWxConfigMissing(false)
        setErrorMsg('生成二维码失败，请刷新重试')
        setWxQrCodeUrl('')
      })
      .finally(function () {
        setWxQrLoadFlag(false)
      })
  }

  // 轮询微信扫码状态
  function beginWxScanPolling() {
    if (wxPollIntervalRef.current) {
      clearInterval(wxPollIntervalRef.current)
    }
    if (wxCountdownRef.current) {
      clearInterval(wxCountdownRef.current)
    }
    // 倒计时每秒更新
    wxCountdownRef.current = setInterval(function () {
      setWxCountdown(function (prev) {
        if (prev <= 1) {
          if (wxCountdownRef.current) { clearInterval(wxCountdownRef.current); wxCountdownRef.current = null }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    wxPollIntervalRef.current = setInterval(function () {
      const tokenKey = wxLoginTokenKeyRef.current
      if (!tokenKey) return
      fetch('/tuzhong-wenshu/api/wechat/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: tokenKey }),
      })
        .then(function (res) {
          if (!res.ok) return null
          return res.json()
        })
        .then(function (respBody) {
          if (!respBody) return
          if (respBody.code === 200) {
            setWxScanStatus(respBody.data.status)
            if (respBody.data.status === 'confirmed' && respBody.data.token) {
              if (wxPollIntervalRef.current) {
                clearInterval(wxPollIntervalRef.current)
              }
              if (wxCountdownRef.current) {
                clearInterval(wxCountdownRef.current)
              }
              finishLoginFlow(respBody.data.token)
            }
          }
        })
        .catch(function (err) { console.error('[login] 微信扫码登录轮询失败:', err) })
    }, 2000)

    // 5分钟后过期
    setTimeout(function () {
      setWxScanStatus(function (prev) {
        if (prev === 'pending' || prev === 'scanned') {
          if (wxPollIntervalRef.current) {
            clearInterval(wxPollIntervalRef.current)
          }
          if (wxCountdownRef.current) {
            clearInterval(wxCountdownRef.current); wxCountdownRef.current = null
          }
          setWxCountdown(0)
          return 'expired'
        }
        return prev
      })
    }, 5 * 60 * 1000)
  }

  // 提交登录/注册
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setSubmitLoadFlag(true)

    if (pageMode === 'login') {
      fetch('/tuzhong-wenshu/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput }),
      })
        .then(function (res) { return res.json() })
        .then(function (respBody) {
          if (respBody.code === 200) {
            // 修复 v4 C3：仅记住用户名，不存储明文密码
            if (rememberFlag) {
              localStorage.setItem('remembered_username', usernameInput)
            } else {
              localStorage.removeItem('remembered_username')
            }
            localStorage.setItem('token', respBody.data.token)
            localStorage.setItem('user', JSON.stringify(respBody.data.user))
            // 修复 v4 C4：Cookie 增加 SameSite/Secure 属性（生产环境 https）
            const _isProdEnv = typeof window !== 'undefined' && window.location.protocol === 'https:'
            document.cookie = 'token=' + respBody.data.token + '; path=/; max-age=604800; SameSite=Lax' + (_isProdEnv ? '; Secure' : '')
            safeRedirect(getRedirectTarget())
          } else {
            setErrorMsg(respBody.message || '登录失败')
          }
        })
        .catch(function () {
          setErrorMsg('网络错误，请重试')
        })
        .finally(function () {
          setSubmitLoadFlag(false)
        })
    } else {
      // 注册
      if (passwordInput.length < 6 || passwordInput.length > 16) {
        setErrorMsg('密码长度必须为6-16位')
        setSubmitLoadFlag(false)
        return
      }
      if (passwordInput !== confirmPassInput) {
        setErrorMsg('两次输入的密码不一致')
        setSubmitLoadFlag(false)
        return
      }
      if (!nicknameInput.trim()) {
        setErrorMsg('请输入昵称')
        setSubmitLoadFlag(false)
        return
      }
      fetch('/tuzhong-wenshu/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput, nickname: nicknameInput }),
      })
        .then(function (res) { return res.json() })
        .then(function (respBody) {
          if (respBody.code === 200) {
            localStorage.setItem('token', respBody.data.token)
            localStorage.setItem('user', JSON.stringify(respBody.data.user))
            // 修复 v4 C4：Cookie 增加 SameSite/Secure 属性
            const _isProdEnv3 = typeof window !== 'undefined' && window.location.protocol === 'https:'
            document.cookie = 'token=' + respBody.data.token + '; path=/; max-age=604800; SameSite=Lax' + (_isProdEnv3 ? '; Secure' : '')
            safeRedirect(getRedirectTarget())
          } else {
            setErrorMsg(respBody.message || '注册失败')
          }
        })
        .catch(function () {
          setErrorMsg('网络错误，请重试')
        })
        .finally(function () {
          setSubmitLoadFlag(false)
        })
    }
  }

  // 获取密码输入框类型
  function getPassFieldType() {
    if (showPassFlag) return 'text'
    return 'password'
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#F5F7FA] via-[#E8EFFF] to-[#D7E3FF]">
      {/* 左侧品牌展示区 */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#165DFF] to-[#0F3FA8] flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-20 left-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-40 right-10 w-80 h-80 bg-white/5 rounded-full blur-3xl" />

        <div className="z-10 text-center px-8">
          <div className="mb-10 inline-block">
            {logoUrl && <img src={logoUrl} alt="Logo" className="w-[180px] h-[180px] mx-auto object-contain" />}
            {!logoUrl && <BrandLogo size={200} />}
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-bold text-white mb-4">
            途中文枢
          </h1>
          <p className="text-white/80 text-[clamp(1rem,2vw,1.25rem)] mb-8">
            AI 小说写作助手
          </p>
          <div className="max-w-md mx-auto">
            <p className="text-white/60 text-lg leading-relaxed">
              智能辅助创作，助力每一部爆款小说<br />
              支持万字长文自动生成，多风格定制
            </p>
          </div>
        </div>
      </div>

      {/* 右侧登录表单区 */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* 移动端Logo */}
          <div className="lg:hidden text-center mb-8">
            {logoUrl && <img src={logoUrl} alt="Logo" className="h-12 w-auto mx-auto mb-4" />}
            <h1 className="text-2xl font-bold text-[#1D2129]">途中文枢</h1>
            <p className="text-[#4E5969] text-sm">AI 小说写作助手</p>
          </div>

          {/* 登录方式切换 */}
          {pageMode === 'login' && (
            <div className="flex justify-end mb-6">
              <button
                onClick={function () {
                  if (loginMode === 'qr') { setLoginMode('password') }
                  else { setLoginMode('qr') }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-sm border border-[#E5E6EB] hover:border-[#165DFF] transition-all text-[#4E5969] hover:text-[#165DFF]"
              >
                {loginMode === 'qr' && (
                  <>
                    <Key className="w-4 h-4" />
                    <span className="text-sm">账号密码登录</span>
                  </>
                )}
                {loginMode === 'password' && (
                  <>
                    <QrCode className="w-4 h-4" />
                    <span className="text-sm">二维码登录</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* 登录卡片 */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-[#F2F3F5] min-h-[520px] flex flex-col items-center justify-center">
            {pageMode === 'login' && loginMode === 'qr' && (
              <div className="text-center">
                {/* 🔥 修复：移除"微信扫码登录"标题，二维码居中显示于红色框中 */}
                <div className="flex justify-center mb-3">
                  <div className="p-5 bg-white rounded-xl border-2 border-[#E5E6EB] relative shadow-sm">
                    {wxQrLoadFlag && (
                      <div className="w-[280px] h-[280px] flex items-center justify-center">
                        <RefreshCw className="w-10 h-10 text-[#86909C] animate-spin" />
                      </div>
                    )}
                    {!wxQrLoadFlag && wxQrCodeUrl === '' && wxScanStatus !== 'expired' && (
                      <div className="w-[280px] h-[280px] flex flex-col items-center justify-center bg-[#F7F8FA] rounded-lg">
                        <AlertCircle className="w-10 h-10 text-[#86909C] mb-2" />
                        <p className="text-[#86909C] text-sm">加载失败</p>
                        <button onClick={buildWxLoginQrCode} className="mt-2 text-sm text-[#576B95] hover:text-[#07C160]">点击重试</button>
                      </div>
                    )}
                    {!wxQrLoadFlag && wxScanStatus === 'expired' && (
                      <div className="w-[280px] h-[280px] flex flex-col items-center justify-center bg-[#F7F8FA] rounded-lg">
                        <p className="text-[#86909C] text-base mb-3">二维码已过期</p>
                        <button onClick={buildWxLoginQrCode} className="flex items-center gap-1 px-4 py-2 bg-[#07C160] text-white text-sm rounded-lg hover:bg-[#06AD56]">
                          <RefreshCw className="w-4 h-4" />刷新
                        </button>
                      </div>
                    )}
                    {!wxQrLoadFlag && wxQrCodeUrl && wxScanStatus !== 'expired' && (
                      <div className="relative w-[280px] h-[280px] overflow-hidden rounded-lg bg-white flex items-center justify-center">
                        {/* 🔥 修复：iframe 完全填满容器，居中显示微信扫码内容 */}
                        <iframe
                          key={wxQrCodeUrl}
                          src={wxQrCodeUrl}
                          width="280"
                          height="280"
                          frameBorder="0"
                          scrolling="no"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
                          style={{ border: 'none', display: 'block', margin: '0 auto' }}
                        />
                        {/* 扫码成功遮罩 */}
                        {wxScanStatus === 'confirmed' && (
                          <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center rounded-lg">
                            <div className="w-14 h-14 rounded-full bg-[#07C160] text-white flex items-center justify-center text-3xl mb-3">✓</div>
                            <p className="text-base text-[#4E5969] font-medium">登录成功，正在跳转…</p>
                          </div>
                        )}
                      </div>
                    )}
                    {/* 右上角倒计时 */}
                    {!wxQrLoadFlag && wxQrCodeUrl && wxScanStatus !== 'expired' && wxCountdown > 0 && (
                      <div className="absolute -top-2 -right-2 bg-[#07C160] text-white text-xs px-3 py-1 rounded-full shadow-sm">
                        有效期 {Math.floor(wxCountdown / 60)}:{(wxCountdown % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                  </div>
                </div>
                {/* 状态提示 */}
                <p className="text-sm text-[#4E5969] mb-1 font-medium">
                  {wxScanStatus === 'pending' && '请使用微信扫码登录'}
                  {wxScanStatus === 'scanned' && '已扫码，请在微信中确认登录'}
                  {wxScanStatus === 'confirmed' && '登录成功，正在跳转…'}
                  {wxScanStatus === 'expired' && '二维码已失效，请点击刷新'}
                </p>
                <p className="text-xs text-[#86909C] mb-4">
                  扫码后自动获取微信信息，直接完成登录
                </p>
                {/* Bug#2 修复：只有服务器明确"未配置"才显示该横幅 */}
                {wxConfigMissing && !wxQrCodeUrl && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700">
                      微信开放平台配置不完整，请联系管理员在后台-系统设置-基本设置中配置AppID和AppSecret
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-[#C9CDD4]">
                  登录即表示同意<a href="/tuzhong-wenshu/terms" className="text-[#576B95] hover:text-[#07C160] mx-0.5">《用户协议》</a>和<a href="/tuzhong-wenshu/privacy" className="text-[#576B95] hover:text-[#07C160] ml-0.5">《隐私政策》</a>
                </p>
              </div>
            )}

            {pageMode === 'login' && loginMode === 'password' && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <h2 className="text-xl font-semibold text-[#1D2129] mb-6">账号密码登录</h2>

                <div>
                  <label className="block text-sm font-medium text-[#4E5969] mb-2">
                    账号
                  </label>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={function (e) { setUsernameInput(e.target.value) }}
                    placeholder="请输入用户名或手机号"
                    className="w-full px-4 py-3 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#4E5969] mb-2">
                    密码
                  </label>
                  <div className="relative">
                    <input
                      type={getPassFieldType()}
                      value={passwordInput}
                      onChange={function (e) { setPasswordInput(e.target.value) }}
                      placeholder="请输入密码"
                      className="w-full px-4 py-3 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={function () { setShowPassFlag(!showPassFlag) }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86909C] hover:text-[#4E5969] transition-colors"
                    >
                      {showPassFlag && <EyeOff className="w-5 h-5" />}
                      {!showPassFlag && <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberFlag}
                      onChange={function (e) { setRememberFlag(e.target.checked) }}
                      className="w-4 h-4 rounded border-[#C9CDD4] text-[#165DFF] focus:ring-[#165DFF]/20"
                    />
                    <span className="text-sm text-[#4E5969]">记住密码</span>
                  </label>
                  <button
                    type="button"
                    className="text-sm text-[#165DFF] hover:text-[#0F3FA8] transition-colors"
                    onClick={function () { router.push('/tuzhong-wenshu/forgot-password') }}
                  >
                    忘记密码？
                  </button>
                </div>

                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 rounded-[8px] p-3 text-red-600 text-sm">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitLoadFlag}
                  className="w-full py-3 bg-gradient-to-r from-[#165DFF] to-[#4080FF] text-white rounded-[8px] font-medium hover:from-[#0F3FA8] hover:to-[#165DFF] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitLoadFlag && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                  {submitLoadFlag && '登录中...'}
                  {!submitLoadFlag && '登录'}
                </button>

                <p className="text-center text-sm text-[#86909C]">
                  还没有账号？
                  <button
                    type="button"
                    onClick={function () { setPageMode('register'); setErrorMsg('') }}
                    className="text-[#165DFF] hover:text-[#0F3FA8] ml-1 font-medium"
                  >
                    立即注册
                  </button>
                </p>
              </form>
            )}

            {pageMode === 'register' && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <h2 className="text-xl font-semibold text-[#1D2129] mb-6">用户注册</h2>

                <div>
                  <label className="block text-sm font-medium text-[#4E5969] mb-2">
                    账号
                  </label>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={function (e) { setUsernameInput(e.target.value) }}
                    placeholder="请输入用户名"
                    className="w-full px-4 py-3 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#4E5969] mb-2">
                    昵称
                  </label>
                  <input
                    type="text"
                    value={nicknameInput}
                    onChange={function (e) { setNicknameInput(e.target.value) }}
                    placeholder="请输入显示昵称"
                    className="w-full px-4 py-3 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#4E5969] mb-2">
                    密码
                  </label>
                  <div className="relative">
                    <input
                      type={getPassFieldType()}
                      value={passwordInput}
                      onChange={function (e) { setPasswordInput(e.target.value) }}
                      placeholder="6-16位密码"
                      className="w-full px-4 py-3 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={function () { setShowPassFlag(!showPassFlag) }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86909C] hover:text-[#4E5969] transition-colors"
                    >
                      {showPassFlag && <EyeOff className="w-5 h-5" />}
                      {!showPassFlag && <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#4E5969] mb-2">
                    确认密码
                  </label>
                  <input
                    type={getPassFieldType()}
                    value={confirmPassInput}
                    onChange={function (e) { setConfirmPassInput(e.target.value) }}
                    placeholder="再次输入密码"
                    className="w-full px-4 py-3 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all"
                    required
                  />
                </div>

                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 rounded-[8px] p-3 text-red-600 text-sm">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitLoadFlag}
                  className="w-full py-3 bg-gradient-to-r from-[#165DFF] to-[#4080FF] text-white rounded-[8px] font-medium hover:from-[#0F3FA8] hover:to-[#165DFF] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitLoadFlag && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                  {submitLoadFlag && '注册中...'}
                  {!submitLoadFlag && '注册并登录'}
                </button>

                <p className="text-center text-sm text-[#86909C]">
                  已有账号？
                  <button
                    type="button"
                    onClick={function () { setPageMode('login'); setErrorMsg('') }}
                    className="text-[#165DFF] hover:text-[#0F3FA8] ml-1 font-medium"
                  >
                    返回登录
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 用 Suspense 包裹（useSearchParams 要求）
export default function LoginPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F5F7FA] to-[#E8EFFF]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[#165DFF] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-[#4E5969]">加载中...</p>
        </div>
      </div>
    }>
      <LoginPage />
    </Suspense>
  )
}