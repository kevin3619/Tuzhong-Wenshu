'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, ArrowLeft, CheckCircle, KeyRound, AlertCircle, Eye, EyeOff } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'

function ForgotPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('token') ? 'reset' : 'request'

  // 请求重置密码状态
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [requestSent, setRequestSent] = useState(false)
  const [requestData, setRequestData] = useState<{ demoMode: boolean; resetLink?: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // 重置密码状态
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetComplete, setResetComplete] = useState(false)
  const [tokenValidating, setTokenValidating] = useState(false)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState('')

  // 初始化：如果有token参数，验证token有效性
  useEffect(() => {
    if (mode === 'reset') {
      const tokenParam = searchParams.get('token') || ''
      setToken(tokenParam)
      if (tokenParam) {
        validateToken(tokenParam)
      } else {
        setTokenError('重置链接无效')
      }
    }
  }, [mode, searchParams])

  // 验证重置token
  const validateToken = async (tokenStr: string) => {
    setTokenValidating(true)
    setTokenError('')
    try {
      const res = await fetch(`/tuzhong-wenshu/api/auth/reset-password/validate-token?token=${tokenStr}`)
      const data = await res.json()
      if (data.code === 200) {
        setTokenValid(true)
      } else {
        setTokenError(data.message || '重置链接无效或已过期')
      }
    } catch {
      setTokenError('网络错误，请重试')
    } finally {
      setTokenValidating(false)
    }
  }

  // 提交重置密码请求（输入邮箱）
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setErrorMsg('请输入邮箱')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg('邮箱格式不正确')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await fetch('/tuzhong-wenshu/api/auth/reset-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.code === 200) {
        setRequestSent(true)
        setRequestData(data.data)
      } else {
        setErrorMsg(data.message || '请求失败')
      }
    } catch {
      setErrorMsg('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  // 提交新密码
  const handleSubmitReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      setTokenError('密码长度必须至少6位')
      return
    }
    if (newPassword !== confirmPassword) {
      setTokenError('两次输入的密码不一致')
      return
    }

    setResetting(true)
    setTokenError('')
    try {
      const res = await fetch('/tuzhong-wenshu/api/auth/reset-password/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      })
      const data = await res.json()
      if (data.code === 200) {
        setResetComplete(true)
        // 保存token并跳转到首页
        if (data.data?.token) {
          localStorage.setItem('token', data.data.token)
          localStorage.setItem('user', JSON.stringify(data.data.user))
        }
      } else {
        setTokenError(data.message || '重置失败')
      }
    } catch {
      setTokenError('网络错误，请重试')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#165DFF] to-[#4080FF]">
      {/* 顶部导航 */}
      <div className="p-4 lg:p-6">
        <button
          onClick={() => router.push('/tuzhong-wenshu/login')}
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>返回登录</span>
        </button>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#165DFF] to-[#4080FF] mb-4">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[#1D2129]">
              {mode === 'reset' ? '重置密码' : '找回密码'}
            </h1>
            <p className="text-[#86909C] text-sm mt-2">
              {mode === 'reset' ? '请设置新的登录密码' : '通过邮箱接收重置链接'}
            </p>
          </div>

          {/* 模式1：请求重置密码（输入邮箱） */}
          {mode === 'request' && !requestSent && (
            <form onSubmit={handleSubmitRequest} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#4E5969] mb-2">
                  注册邮箱
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="请输入注册时使用的邮箱"
                    className="w-full px-4 py-3 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all pr-12"
                    required
                  />
                  <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#86909C]" />
                </div>
                <p className="text-xs text-[#86909C] mt-2">
                  系统将发送密码重置链接到您的邮箱，链接有效期30分钟
                </p>
              </div>

              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-[8px] p-3 text-red-600 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-gradient-to-r from-[#165DFF] to-[#4080FF] text-white rounded-[8px] font-medium hover:from-[#0F3FA8] hover:to-[#165DFF] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                {submitting && '发送中...'}
                {!submitting && '发送重置链接'}
              </button>
            </form>
          )}

          {/* 模式1：请求已发送 */}
          {mode === 'request' && requestSent && requestData && (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-[#1D2129]">
                {requestData.demoMode ? '重置链接已生成' : '重置链接已发送'}
              </h2>
              <p className="text-[#4E5969]">
                {requestData.demoMode
                  ? '演示模式下，重置链接直接显示在下方。正式环境将发送到您的邮箱。'
                  : '如果该邮箱已注册途中文枢账号，重置链接将发送到您的邮箱。'}
              </p>
              
              {requestData.demoMode && requestData.resetLink && (
                <div className="bg-[#F7F8FA] rounded-[8px] p-4 text-left">
                  <p className="text-xs text-[#86909C] mb-2">重置链接（有效期30分钟）：</p>
                  <a
                    href={requestData.resetLink}
                    className="text-[#165DFF] text-sm break-all hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {requestData.resetLink}
                  </a>
                </div>
              )}
              
              <p className="text-xs text-[#86909C]">
                提示：如果没有收到邮件，请检查垃圾邮件文件夹，或联系管理员。
              </p>
              
              <button
                onClick={() => router.push('/tuzhong-wenshu/login')}
                className="w-full py-3 bg-[#165DFF] text-white rounded-[8px] font-medium hover:bg-[#0F3FA8] transition-colors"
              >
                返回登录
              </button>
            </div>
          )}

          {/* 模式2：验证token并重置密码 */}
          {mode === 'reset' && tokenValidating && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#E6F4FF] mb-4">
                <div className="w-6 h-6 border-2 border-[#165DFF] border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-[#4E5969]">正在验证重置链接...</p>
            </div>
          )}

          {mode === 'reset' && !tokenValidating && !tokenValid && tokenError && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-lg font-semibold text-[#1D2129] mb-2">重置链接无效</h2>
              <p className="text-[#86909C] mb-6">{tokenError}</p>
              <button
                onClick={() => router.push('/tuzhong-wenshu/forgot-password')}
                className="w-full py-3 bg-[#165DFF] text-white rounded-[8px] font-medium hover:bg-[#0F3FA8] transition-colors"
              >
                重新申请重置
              </button>
            </div>
          )}

          {mode === 'reset' && !tokenValidating && tokenValid && !resetComplete && (
            <form onSubmit={handleSubmitReset} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#4E5969] mb-2">
                  新密码
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="请输入新密码（6-16位，需包含字母和数字）"
                    className="w-full px-4 py-3 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#86909C] hover:text-[#4E5969] transition-colors"
                  >
                    {showPassword && <EyeOff className="w-5 h-5" />}
                    {!showPassword && <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#4E5969] mb-2">
                  确认新密码
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入新密码"
                  className="w-full px-4 py-3 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all"
                  required
                />
              </div>

              {tokenError && (
                <div className="bg-red-50 border border-red-200 rounded-[8px] p-3 text-red-600 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {tokenError}
                </div>
              )}

              <button
                type="submit"
                disabled={resetting}
                className="w-full py-3 bg-gradient-to-r from-[#165DFF] to-[#4080FF] text-white rounded-[8px] font-medium hover:from-[#0F3FA8] hover:to-[#165DFF] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {resetting && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                {resetting && '重置中...'}
                {!resetting && '确认重置密码'}
              </button>
            </form>
          )}

          {mode === 'reset' && !resetting && resetComplete && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-[#1D2129] mb-2">密码重置成功</h2>
              <p className="text-[#4E5969] mb-6">您的密码已成功重置，请使用新密码登录</p>
              <button
                onClick={() => router.push('/tuzhong-wenshu')}
                className="w-full py-3 bg-[#165DFF] text-white rounded-[8px] font-medium hover:bg-[#0F3FA8] transition-colors"
              >
                进入系统
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 底部品牌Logo */}
      <div className="text-center pb-6">
        <BrandLogo size={120} />
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#165DFF] to-[#4080FF] text-white">加载中...</div>}>
      <ForgotPasswordContent />
    </Suspense>
  )
}
