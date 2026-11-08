'use client'

import { useState, useEffect, useRef } from 'react'
import { Edit3, Crown, Key, Mail, LogOut, Check, Loader2, User, ChevronRight, BookOpen, Trash2 } from 'lucide-react'

interface UserInfo {
  id: string
  username: string
  nickname: string
  email: string | null
  isAdmin: boolean
  subscriptionTier: string
  subscriptionExpiresAt: string | null
}

interface UserProfileCardProps {
  onLogout: () => void
  hideLogout?: boolean
  onExportClick?: () => void
  onDeleteAccountClick?: () => void
}

export default function UserProfileCard({
  onLogout,
  hideLogout = false,
  onExportClick,
  onDeleteAccountClick,
}: UserProfileCardProps) {
  const [user, setUser] = useState<UserInfo | null>(null)

  // 个人信息编辑
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [editing, setEditing] = useState(false)

  // 修改密码
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  // 修改账号
  const [newUsername, setNewUsername] = useState('')
  const [usernamePassword, setUsernamePassword] = useState('')

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  // 修复：通过 ref 直接清空 DOM 的原生 value，防止浏览器密码管理器绕过 React 受控组件自动填充
  const oldPwdRef = useRef<HTMLInputElement>(null)
  const newPwdRef = useRef<HTMLInputElement>(null)
  const confirmPwdRef = useRef<HTMLInputElement>(null)
  const newUserRef = useRef<HTMLInputElement>(null)
  const userPwdRef = useRef<HTMLInputElement>(null)

  function forceClearAutofill() {
    setOldPassword('')
    setNewPassword('')
    setConfirmNewPassword('')
    setNewUsername('')
    setUsernamePassword('')
    // 强制清空原生 DOM value（浏览器自动填充会直接改 DOM，不走 React）
    if (oldPwdRef.current) oldPwdRef.current.value = ''
    if (newPwdRef.current) newPwdRef.current.value = ''
    if (confirmPwdRef.current) confirmPwdRef.current.value = ''
    if (newUserRef.current) newUserRef.current.value = ''
    if (userPwdRef.current) userPwdRef.current.value = ''
  }

  useEffect(() => {
    const loadUser = async () => {
      // 优先从 localStorage 读取
      const saved = localStorage.getItem('user')
      if (saved) {
        try {
          const u = JSON.parse(saved)
          setUser(u)
          setNickname(u.nickname || '')
          setEmail(u.email || '')
          return
        } catch (e) { console.error('[UserProfileCard] 解析本地用户信息失败:', e) }
      }
      // localStorage 缺失时调用后端 API 获取
      try {
        const token = localStorage.getItem('token')
        if (!token) return
        const res = await fetch('/tuzhong-wenshu/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.code === 200 && data.data) {
          const u = data.data
          setUser(u)
          setNickname(u.nickname || '')
          setEmail(u.email || '')
          localStorage.setItem('user', JSON.stringify(u))
        }
      } catch (e) { console.error('[UserProfileCard] 回写本地用户信息失败:', e) }
    }
    loadUser()
  }, [])

  // 修复：多次强制清空密码和账号字段，阻止浏览器密码管理器自动填充
  useEffect(() => {
    forceClearAutofill()
    // 延迟清空（Chrome 自动填充是在页面加载后异步触发的）
    const timers = [0, 150, 500, 1200, 2500, 5000].map(function (delay) {
      return setTimeout(forceClearAutofill, delay)
    })
    return function () {
      timers.forEach(function (t) { clearTimeout(t) })
    }
  }, [])

  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg)
    setMessageType(type)
    // 🔥 Bug修复：连续两次提示时，前一条的 3 秒计时器会把新消息提前清空
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
    messageTimerRef.current = setTimeout(() => setMessage(''), 3000)
  }

  // 保存个人信息
  const handleSaveInfo = async () => {
    setSaving(true)
    setMessage('')
    try {
      const token = localStorage.getItem('token')
      const body: Record<string, string> = {}
      if (nickname !== user?.nickname) body.nickname = nickname
      if (email !== (user?.email || '')) body.email = email || ''

      if (Object.keys(body).length === 0) {
        setEditing(false)
        setSaving(false)
        return
      }

      const res = await fetch('/tuzhong-wenshu/api/auth/update-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.code === 200) {
        setUser(data.data)
        localStorage.setItem('user', JSON.stringify(data.data))
        showMessage('个人信息修改成功', 'success')
        setEditing(false)
      } else {
        showMessage(data.message || '修改失败', 'error')
      }
    } catch {
      showMessage('网络错误', 'error')
    } finally {
      setSaving(false)
    }
  }

  // 修改密码
  const handleChangePassword = async () => {
    if (!oldPassword) { showMessage('请输入原密码', 'error'); return }
    if (newPassword.length < 6 || newPassword.length > 16) { showMessage('新密码长度必须为6-16位', 'error'); return }
    if (newPassword !== confirmNewPassword) { showMessage('两次输入的密码不一致', 'error'); return }

    setSaving(true)
    setMessage('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/tuzhong-wenshu/api/auth/update-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      const data = await res.json()
      if (data.code === 200) {
        showMessage('密码修改成功', 'success')
        setOldPassword(''); setNewPassword(''); setConfirmNewPassword('')
      } else {
        showMessage(data.message || '密码修改失败', 'error')
      }
    } catch {
      showMessage('网络错误', 'error')
    } finally { setSaving(false) }
  }

  // 修改账号
  const handleChangeUsername = async () => {
    if (!newUsername) { showMessage('请输入新账号', 'error'); return }
    if (!usernamePassword) { showMessage('请输入原密码', 'error'); return }
    if (newUsername.length < 2) { showMessage('账号长度不能少于2位', 'error'); return }

    setSaving(true)
    setMessage('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/tuzhong-wenshu/api/auth/update-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ oldPassword: usernamePassword, newUsername }),
      })
      const data = await res.json()
      if (data.code === 200) {
        setUser(data.data)
        localStorage.setItem('user', JSON.stringify(data.data))
        showMessage('账号修改成功，下次登录请使用新账号', 'success')
        setNewUsername(''); setUsernamePassword('')
      } else {
        showMessage(data.message || '账号修改失败', 'error')
      }
    } catch {
      showMessage('网络错误', 'error')
    } finally { setSaving(false) }
  }

  if (!user) return null

  const isVip = user.subscriptionTier === 'pro' && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > new Date()

  // 统一样式常量
  const cardClass = 'bg-white rounded-[8px] shadow-[0px_2px_10px_rgba(0,0,0,0.05)] p-5'
  const titleClass = 'text-base font-bold text-[#1D2129] mb-4'
  const labelClass = 'block text-sm text-[#4e5969] mb-2'
  const inputClass = 'w-full h-10 px-3 rounded-[6px] border border-[#DCDFE6] bg-white text-[#1f2329] placeholder-[#86909C] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20 transition-colors'
  const btnPrimaryClass = 'h-9 px-4 rounded-[6px] bg-[#165DFF] text-white text-sm hover:bg-[#0F3FA8] transition-colors disabled:opacity-50 flex items-center gap-1.5'

  return (
    <div className="space-y-6">
      {/* 修复：多个隐藏的 decoy input，更彻底地阻止浏览器自动填充密码和账号 */}
      <div className="hidden" aria-hidden="true">
        <input type="text" name="_hp_username_decoy_1" autoComplete="username" tabIndex={-1} />
        <input type="password" name="_hp_password_decoy_1" autoComplete="current-password" tabIndex={-1} />
        <input type="password" name="_hp_password_decoy_2" autoComplete="new-password" tabIndex={-1} />
        <input type="text" name="_hp_username_decoy_2" autoComplete="off" tabIndex={-1} />
        <input type="password" name="_hp_password_decoy_3" autoComplete="off" tabIndex={-1} />
      </div>

      {/* 消息提示（弹窗样式：top 居中固定悬浮，成功后清晰可见） */}
      {message && (
        <div
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[999] max-w-[90vw] sm:max-w-md"
          onClick={function () { setMessage('') }}
        >
          <div
            className={`rounded-[12px] p-5 shadow-2xl border flex items-center gap-3 ${
              messageType === 'success' ? 'bg-white border-green-200' : 'bg-white border-red-200'
            }`}
          >
            <span
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                messageType === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
              }`}
            >
              {messageType === 'success' ? <Check className="w-5 h-5" /> : <span className="w-4 h-[2px] bg-red-500 rounded mb-[-6px]" />}
            </span>
            <div className="min-w-0">
              <p className={`font-medium text-sm ${messageType === 'success' ? 'text-green-700' : 'text-red-600'}`}>
                {messageType === 'success' ? '操作成功' : '操作失败'}
              </p>
              <p className="text-sm text-gray-600 mt-0.5 break-words">{message}</p>
            </div>
            <button
              onClick={function (e) { e.stopPropagation(); setMessage('') }}
              className="ml-2 shrink-0 text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
            >×</button>
          </div>
        </div>
      )}

      {/* ===== 1. 个人信息卡片 ===== */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={titleClass}>个人信息</h3>
          {!editing && (
            <button
              onClick={() => { setEditing(true); setNickname(user.nickname || ''); setEmail(user.email || '') }}
              className={`${btnPrimaryClass}`}
            >
              <Edit3 className="w-4 h-4" />
              编辑资料
            </button>
          )}
        </div>

        {!editing ? (
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-[#165DFF] to-[#4080FF] rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0">
              {user.nickname?.charAt(0) || user.username?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-[#1f2329]">{user.nickname || user.username}</h2>
                {user.isAdmin && (
                  <span className="px-2 py-1 bg-[#e6f7ff] text-[#1890ff] text-xs rounded font-medium">
                    系统管理员
                  </span>
                )}
                {isVip && (
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium flex items-center gap-1">
                    <Crown className="w-3 h-3" />VIP会员
                  </span>
                )}
              </div>
              <div className="mt-2 space-y-1">
                <p className="text-sm text-[#4e5969]">登录账号：{user.username}</p>
                <p className="text-sm text-[#4e5969] flex items-center gap-1">
                  <Mail className="w-3 h-3" />{user.email || '未绑定邮箱'}
                </p>
                <p className="text-sm text-[#4e5969]">
                  会员状态：
                  {user.isAdmin ? (
                    <span className="text-[#1890ff] font-medium">永久会员（系统管理员）</span>
                  ) : isVip ? (
                    <span className="text-yellow-600">VIP会员 · 到期：{new Date(user.subscriptionExpiresAt!).toLocaleDateString('zh-CN')}</span>
                  ) : (
                    <span className="text-[#86909C]">免费用户</span>
                  )}
                </p>
              </div>
            </div>
            {!hideLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1 px-4 py-2 bg-red-50 text-red-600 rounded-[6px] hover:bg-red-100 transition-colors text-sm shrink-0 self-start"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-[18px] max-w-md">
            <div>
              <label className={labelClass}>昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="选填"
                className={inputClass}
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSaveInfo}
                disabled={saving}
                className={btnPrimaryClass}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                保存
              </button>
              <button
                onClick={() => { setEditing(false); setNickname(user.nickname || ''); setEmail(user.email || '') }}
                className="h-9 px-4 rounded-[6px] text-[#4e5969] hover:text-[#1f2329] hover:bg-[#F2F3F5] transition-colors text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== 2+3. 修改密码 + 修改登录账号 双卡片同行左右均分 ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ===== 2. 修改密码卡片 ===== */}
        <div className={cardClass}>
          <h3 className={titleClass}>
            <Key className="w-4 h-4 inline mr-1.5 text-[#165DFF]" />
            修改密码
          </h3>
          <div className="space-y-[18px]">
            <div>
              <label className={labelClass}>原密码</label>
              <input
                ref={oldPwdRef}
                type="text"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                onFocus={(e) => { try { const t = e.target as HTMLInputElement; t.type = 'password'; t.readOnly = false } catch(_e){ console.error('[user-profile] 切换密码可见失败:', _e) } }}
                onBlur={(e) => { try { (e.target as HTMLInputElement).readOnly = true } catch(_e){ console.error('[user-profile] 密码框置只读失败:', _e) } }}
                placeholder="原密码（微信注册初始密码：123456）"
                autoComplete="one-time-code"
                name="_sec_field_k9p2_a1"
                data-form-type="other"
                readOnly
                className={inputClass + ' -webkit-text-security-disc'}
              />
            </div>
            <div>
              <label className={labelClass}>新密码</label>
              <input
                ref={newPwdRef}
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onFocus={(e) => { try { const t = e.target as HTMLInputElement; t.type = 'password'; t.readOnly = false } catch(_e){ console.error('[user-profile] 切换密码可见失败:', _e) } }}
                onBlur={(e) => { try { (e.target as HTMLInputElement).readOnly = true } catch(_e){ console.error('[user-profile] 密码框置只读失败:', _e) } }}
                placeholder="6-16位新密码"
                autoComplete="one-time-code"
                name="_sec_field_m7n3_b2"
                data-form-type="other"
                readOnly
                className={inputClass + ' -webkit-text-security-disc'}
              />
            </div>
            <div>
              <label className={labelClass}>确认新密码</label>
              <input
                ref={confirmPwdRef}
                type="text"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                onFocus={(e) => { try { const t = e.target as HTMLInputElement; t.type = 'password'; t.readOnly = false } catch(_e){ console.error('[user-profile] 切换密码可见失败:', _e) } }}
                onBlur={(e) => { try { (e.target as HTMLInputElement).readOnly = true } catch(_e){ console.error('[user-profile] 密码框置只读失败:', _e) } }}
                placeholder="再次输入新密码"
                autoComplete="one-time-code"
                name="_sec_field_t5q4_c3"
                data-form-type="other"
                readOnly
                className={inputClass + ' -webkit-text-security-disc'}
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={saving}
              className={btnPrimaryClass}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              修改密码
            </button>
          </div>
        </div>

        {/* ===== 3. 修改登录账号卡片 ===== */}
        <div className={cardClass}>
          <h3 className={titleClass}>
            <User className="w-4 h-4 inline mr-1.5 text-[#165DFF]" />
            修改登录账号
          </h3>
          <div className="space-y-[18px]">
            <div className="bg-[#F7F8FA] rounded-[6px] p-4 text-sm text-[#4e5969]">
              当前登录账号：<span className="font-medium text-[#1f2329]">{user.username}</span>
            </div>
            <div>
              <label className={labelClass}>新账号</label>
              <input
                ref={newUserRef}
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onFocus={(e) => { try { (e.target as HTMLInputElement).readOnly = false } catch(_e){ console.error('[user-profile] 密码框解除只读失败:', _e) } }}
                onBlur={(e) => { try { (e.target as HTMLInputElement).readOnly = true } catch(_e){ console.error('[user-profile] 密码框置只读失败:', _e) } }}
                placeholder="请输入新登录账号"
                autoComplete="one-time-code"
                name="_usr_field_j8h5_d4"
                data-form-type="other"
                readOnly
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>原密码（验证身份）</label>
              <input
                ref={userPwdRef}
                type="text"
                value={usernamePassword}
                onChange={(e) => setUsernamePassword(e.target.value)}
                onFocus={(e) => { try { const t = e.target as HTMLInputElement; t.type = 'password'; t.readOnly = false } catch(_e){ console.error('[user-profile] 切换密码可见失败:', _e) } }}
                onBlur={(e) => { try { (e.target as HTMLInputElement).readOnly = true } catch(_e){ console.error('[user-profile] 密码框置只读失败:', _e) } }}
                placeholder="请输入原密码"
                autoComplete="one-time-code"
                name="_sec_field_l2m7_e5"
                data-form-type="other"
                readOnly
                className={inputClass + ' -webkit-text-security-disc'}
              />
            </div>
            <button
              onClick={handleChangeUsername}
              disabled={saving}
              className={btnPrimaryClass}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              修改账号
            </button>
          </div>
        </div>
      </div>

      {/* ===== 4. 数据管理卡片 ===== */}
      <div className={cardClass}>
        <h3 className={titleClass}>数据管理</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={onExportClick}
            className="flex items-center justify-between p-4 rounded-[6px] border border-[#E5E6EB] hover:border-[#165DFF] hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-[#4e5969]" />
              <div className="text-left">
                <p className="text-sm font-medium text-[#1f2329]">数据导出</p>
                <p className="text-xs text-[#86909C]">导出作品和设置数据</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#C9CDD4]" />
          </button>
          <button
            onClick={onDeleteAccountClick}
            className="flex items-center justify-between p-4 rounded-[6px] border border-red-200 hover:border-red-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-5 h-5 text-red-400" />
              <div className="text-left">
                <p className="text-sm font-medium text-red-600">注销账户</p>
                <p className="text-xs text-[#86909C]">永久删除账户和数据</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#C9CDD4]" />
          </button>
        </div>
      </div>
    </div>
  )
}