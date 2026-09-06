'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Shield, Users, CreditCard, BookOpen, TrendingUp, Clock, Settings, Crown, Ban, Loader2, RefreshCw, Upload, Image, Trash2, FileArchive, X, Edit, Eye, Key, AlertTriangle, Plus } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import { BrandLogoSmall } from '@/components/BrandLogo'

interface DashboardMetricsStore {
  totalUsers: number; vipCount: number; todayRegistrations: number; pendingPayments: number
  totalRevenue: number; revenueToday: number; revenueMonth: number; pendingAmount: number
  totalNovels: number
}
interface UserBatchItem { id: string; username: string; nickname: string; email: string | null; isAdmin: boolean; subscriptionTier: string; subscriptionStartedAt: string | null; subscriptionExpiresAt: string | null; status: number; novelCount: number; createdAt: string }
interface PayRecItem { id: string; orderNo: string; amount: number; planType: string; channel: string; status: number; createdAt: string; user: { id: string; username: string; nickname: string } }
interface AdminWorkBrief { id: string; title: string; description: string | null; coverUrl: string | null; genre: string | null; status: string; targetWordCount: number | null; currentWordCount: number; createdAt: string; updatedAt: string; _count: { chapters: number; characters: number; volumes: number } }
interface AdminUserDetail { id: string; username: string; nickname: string; email: string | null; avatarUrl: string | null; wechatOpenid: string | null; isAdmin: boolean; subscriptionTier: string; subscriptionStartedAt: string | null; subscriptionExpiresAt: string | null; status: number; createdAt: string; updatedAt: string }

function AdminPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const _activePanel = useState<'dashboard' | 'users' | 'payments' | 'config'>('dashboard')
  const activePanel = _activePanel[0]
  const switchPanel = _activePanel[1]
  const _activeConfigTab = useState<'basic' | 'brand' | 'payment'>('basic')
  const activeConfigTab = _activeConfigTab[0]
  const switchConfigPanel = _activeConfigTab[1]

  useEffect(function () {
    const urlTab = searchParams.get('tab')
    let initActive = activePanel
    if (urlTab === 'users' || urlTab === 'payments' || urlTab === 'config') {
      switchPanel(urlTab)
      initActive = urlTab
    }
    const urlConfigTab = searchParams.get('configTab')
    if (urlConfigTab === 'brand' || urlConfigTab === 'payment') {
      switchConfigPanel(urlConfigTab)
    }
    // 🔥 修复 React error #185（最大更新深度超限）：
    // 不再在 [activePanel] 依赖的 useEffect 中调用 pullSysConfig（会 setState → 重渲染 → 循环）
    // 改为仅在初始化时一次性加载 dashboard/sys-config，users/payments 再按 tab 延迟加载
    const authToken = getAuthToken()
    if (!authToken) {
      window.location.href = '/tuzhong-wenshu/login?redirect=' + encodeURIComponent(window.location.pathname.replace(/^\/tuzhong-wenshu/, '') || '/')
      return
    }
    pullDashboardMetrics()
    pullSysConfig()
    if (initActive === 'users') queueMicrotask(function () { pullUserBatch() })
    else if (initActive === 'payments') queueMicrotask(function () { pullPayRecords() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 仅在用户手动切换 activePanel 时拉取该面板的列表，避免 Logo 状态循环刷新
  const _prevPanelRef = useRef<string>(activePanel)
  useEffect(function () {
    if (_prevPanelRef.current === activePanel) return
    _prevPanelRef.current = activePanel
    if (activePanel === 'users') pullUserBatch()
    else if (activePanel === 'payments') pullPayRecords()
  }, [activePanel])

  const _dashboardMetrics = useState<DashboardMetricsStore | null>(null)
  const dashboardMetrics = _dashboardMetrics[0]
  const setDashboardMetrics = _dashboardMetrics[1]
  const _userBatchGroup = useState<UserBatchItem[]>([])
  const userBatchGroup = _userBatchGroup[0]
  const setUserBatchGroup = _userBatchGroup[1]
  const _payRecGroup = useState<PayRecItem[]>([])
  const payRecGroup = _payRecGroup[0]
  const setPayRecGroup = _payRecGroup[1]
  const _sysParamStore = useState<Record<string, string>>({})
  const sysParamStore = _sysParamStore[0]
  const setSysParamStore = _sysParamStore[1]
  const _brandLogoPreview = useState<string | null>(null)
  const brandLogoPreview = _brandLogoPreview[0]
  const setBrandLogoPreview = _brandLogoPreview[1]
  const _uploadProcessFlag = useState(false)
  const uploadProcessFlag = _uploadProcessFlag[0]
  const setUploadProcessFlag = _uploadProcessFlag[1]
  const _loadProcessFlag = useState(false)
  const loadProcessFlag = _loadProcessFlag[0]
  const setLoadProcessFlag = _loadProcessFlag[1]
  const _wechatPaySetup = useState<Record<string, string>>({})
  const wechatPaySetup = _wechatPaySetup[0]
  const setWechatPaySetup = _wechatPaySetup[1]
  const _wechatPaySaveFlag = useState(false)
  const wechatPaySaveFlag = _wechatPaySaveFlag[0]
  const setWechatPaySaveFlag = _wechatPaySaveFlag[1]
  const _certUploadFlag = useState(false)
  const certUploadFlag = _certUploadFlag[0]
  const setCertUploadFlag = _certUploadFlag[1]
  const logoFileInputRef = useRef<HTMLInputElement>(null)
  const certFileInputRef = useRef<HTMLInputElement>(null)
  const prevLogoUrlRef = useRef<string>('')

  // Toast 通知状态
  const _toast = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const toast = _toast[0]
  const setToast = _toast[1]
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const _worksModalState = useState<{ open: boolean; loading: boolean; userId: string; nickname: string; shelfCount: number; data: AdminWorkBrief[] }>({ open: false, loading: false, userId: '', nickname: '', shelfCount: 0, data: [] })
  const worksModalState = _worksModalState[0]
  const setWorksModalState = _worksModalState[1]
  const _allWorksModalState = useState<{ open: boolean; loading: boolean; filterUserId: string; data: Array<AdminWorkBrief & { userId: string; nickname: string }> }>({ open: false, loading: false, filterUserId: '', data: [] })
  const allWorksModalState = _allWorksModalState[0]
  const setAllWorksModalState = _allWorksModalState[1]
  const _editUserModalState = useState<{ open: boolean; loading: boolean; saving: boolean; userId: string; detail: AdminUserDetail | null; form: { nickname: string; email: string; status: number; subscriptionTier: string; subscriptionStartedAt: string; subscriptionExpiresAt: string; newPassword: string } }>({ open: false, loading: false, saving: false, userId: '', detail: null, form: { nickname: '', email: '', status: 1, subscriptionTier: 'free', subscriptionStartedAt: '', subscriptionExpiresAt: '', newPassword: '' } })
  const editUserModalState = _editUserModalState[0]
  const setEditUserModalState = _editUserModalState[1]
  // 创建用户弹窗状态：管理员后台手动创建新账号
  const _createUserModalState = useState<{ open: boolean; saving: boolean; form: { username: string; nickname: string; password: string; email: string; isAdmin: boolean } }>({ open: false, saving: false, form: { username: '', nickname: '', password: '', email: '', isAdmin: false } })
  const createUserModalState = _createUserModalState[0]
  const setCreateUserModalState = _createUserModalState[1]

  // 意见反馈管理状态
  const _feedbackPanelOpen = useState(false)
  const feedbackPanelOpen = _feedbackPanelOpen[0]
  const setFeedbackPanelOpen = _feedbackPanelOpen[1]
  const _feedbackList = useState<Array<{ id: string; category: string; content: string; contact: string | null; status: number; reply: string | null; createdAt: string; user?: { id: string; username: string; nickname: string | null; avatarUrl: string | null } }>>([])
  const feedbackList = _feedbackList[0]
  const setFeedbackList = _feedbackList[1]
  const _feedbackLoading = useState(false)
  const feedbackLoading = _feedbackLoading[0]
  const setFeedbackLoading = _feedbackLoading[1]

  function getAuthToken() {
    let t = localStorage.getItem('token') || localStorage.getItem('auth_token') || ''
    if (!t) {
      const cookieStr = document.cookie
      const m1 = cookieStr.match(new RegExp('(?:^|;\\s*)token=([^;]+)'))
      if (m1) t = decodeURIComponent(m1[1])
      if (!t) {
        const m2 = cookieStr.match(new RegExp('(?:^|;\\s*)auth_token=([^;]+)'))
        if (m2) t = decodeURIComponent(m2[1])
      }
    }
    return t
  }

  function loadFeedbackList() {
    setFeedbackLoading(true)
    fetch('/tuzhong-wenshu/api/admin/feedback', { headers: { Authorization: 'Bearer ' + getAuthToken() } })
      .then(function (r) { return r.json() })
      .then(function (b) {
        if (b && b.success && Array.isArray(b.data)) {
          setFeedbackList(b.data)
        } else {
          setFeedbackList([])
        }
      })
      .catch(function () { setFeedbackList([]) })
      .finally(function () { setFeedbackLoading(false) })
  }

  function execReplyFeedback(fbId: string, reply: string) {
    fetch('/tuzhong-wenshu/api/admin/feedback/' + fbId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getAuthToken() },
      body: JSON.stringify({ reply: reply, status: 1 }),
    })
      .then(function (r) { return r.json() })
      .then(function (b) {
        if (b && b.success) {
          setFeedbackList(function (prev) {
            return prev.map(function (x) { return x.id === fbId ? { ...x, reply: reply, status: 1 } : x })
          })
        } else {
          alert('回复失败：' + (b?.message || '未知错误'))
        }
      })
      .catch(function () { alert('网络错误，回复失败') })
  }

  useEffect(function () {
    loadFeedbackList()
  }, [])

  function normalizeCover(src: string | null | undefined): string | null {
    if (!src) return null
    const raw = String(src).trim()
    if (!raw) return null
    const links = raw.split('|||').map(function (s) { return s.trim() }).filter(Boolean)
    for (let li = 0; li < links.length; li++) {
      let s = links[li]
      if (!s) continue
      if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) return s
      // 🔥 修复：代理端点 URL（/tuzhong-wenshu/api/.../cover?...）直接透传，不要再套 fs-cover 前缀
      if (s.indexOf('/tuzhong-wenshu/') === 0) return s
      const dataUriRe = /^data:image\/([a-z0-9+-]+);base64,(.*)$/i
      const dataMatch = s.match(dataUriRe)
      if (dataMatch) {
        const mime = dataMatch[1].toLowerCase()
        const body0 = dataMatch[2].replace(/\s+/g, '')
        // 如果"base64体"根本不是合法base64（出现非base64字符），或长度<16，认为是前缀被错误地加到一个路径前面 → 回退用body当路径解析
        const badBase64 = body0.length < 16 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body0)
        if (!badBase64 && (body0.length % 4 === 0)) {
          // 合法base64：检查前几个字节的文件魔数是否与mime匹配（可选），不匹配也放行，浏览器会解码
          return 'data:image/' + mime + ';base64,' + body0
        }
        // body0是假base64（实际是文件名/素材key/路径），剥掉前缀继续处理
        s = body0
      }
      // 纯base64（无data:前缀），通过魔数补mime
      const b64Candidate = s.replace(/\s+/g, '')
      if (b64Candidate.length >= 32 && /^[A-Za-z0-9+/]*={0,2}$/.test(b64Candidate) && b64Candidate.length % 4 === 0) {
        const head = b64Candidate.substring(0, 16)
        // 魔数：/9j/ → jpeg, iVBOR → png, R0lGOD → gif, UklGR → webp
        if (head.indexOf('/9j/') === 0 || head.indexOf('9j/4') === 0) {
          if (head.indexOf('9j/4') === 0 && head.indexOf('/9j/') !== 0) {
            return 'data:image/jpeg;base64,/' + b64Candidate
          }
          return 'data:image/jpeg;base64,' + b64Candidate
        }
        if (head.indexOf('iVBORw0KGgo') === 0) return 'data:image/png;base64,' + b64Candidate
        if (head.indexOf('R0lGOD') === 0) return 'data:image/gif;base64,' + b64Candidate
        if (head.indexOf('UklGR') === 0) return 'data:image/webp;base64,' + b64Candidate
      }
      // 路径/文件名：走 fs-cover 接口
      if (s.indexOf('/') >= 0 || /\.(png|jpe?g|webp|gif|bmp)$/i.test(s)) {
        try { return '/tuzhong-wenshu/api/admin/fs-cover?path=' + encodeURIComponent(s) } catch { continue }
      }
    }
    return null
  }
  function parseWorkDate(s: string | number | null | undefined): Date | null {
    if (s === null || s === undefined || s === '') return null
    if (typeof s === 'number') {
      const d = new Date(s)
      if (!isNaN(d.getTime())) return d
      return null
    }
    const t = String(s).trim()
    if (!t) return null
    if (/^\d+$/.test(t)) {
      let num = Number(t)
      if (num > 1e12) num = num
      const dd = new Date(num)
      if (!isNaN(dd.getTime())) return dd
    }
    const d2 = new Date(t)
    if (!isNaN(d2.getTime())) return d2
    return null
  }
  function fmtWorkDate(s: string | number | null | undefined): string {
    const d = parseWorkDate(s)
    if (!d) return '—'
    return d.toLocaleDateString('zh-CN')
  }
  function openWorkDetail(w: AdminWorkBrief & { userId?: string; nickname?: string }) {
    let msg = '作品：' + (w.title || '未命名') + '\n'
    if (w.nickname) msg += '作者：' + w.nickname + '\n'
    msg += '状态：' + (w.status || 'draft') + '　字数：' + (w.currentWordCount || 0) + (w.targetWordCount ? (' / ' + w.targetWordCount) : '') + '\n'
    msg += '章节：' + (w._count?.chapters || 0) + '　人物：' + (w._count?.characters || 0) + '　卷：' + (w._count?.volumes || 0) + '\n'
    if (w.genre) msg += '类型：' + w.genre + '\n'
    msg += '创建：' + fmtWorkDate(w.createdAt) + '　更新：' + fmtWorkDate(w.updatedAt) + '\n\n'
    msg += (w.description || '（暂无简介）')
    alert(msg)
  }

  function openWorksModal(userId: string, nickname: string, shelfCount?: number) {
    const sc = typeof shelfCount === 'number' ? shelfCount : 0
    setWorksModalState({ open: true, loading: true, userId, nickname, shelfCount: sc, data: [] })
    fetch('/tuzhong-wenshu/api/admin/dashboard/all-works?userId=' + encodeURIComponent(userId), { headers: { Authorization: 'Bearer ' + getAuthToken() } })
      .then(function (r) { return r.json() })
      .then(function (b) {
        if (b && b.success) {
          const rawList = Array.isArray(b.data) ? b.data.slice() : []
          // 二次过滤保险：只保留严格匹配该 userId 的作品，避免后端漏过滤时作品串号
          const list = rawList.filter(function (x: any) { return !userId || String(x.userId || '') === userId })
          setWorksModalState({ open: true, loading: false, userId, nickname, shelfCount: typeof b.total === 'number' ? b.total : (typeof sc === 'number' ? Math.max(sc, list.length) : list.length), data: list })
        } else {
          setWorksModalState({ open: true, loading: false, userId, nickname, shelfCount: sc, data: [] })
          alert('作品列表加载失败：' + (b?.message || '未知错误'))
        }
      }).catch(function () {
        setWorksModalState({ open: true, loading: false, userId, nickname, shelfCount: sc, data: [] })
      })
  }

  function closeWorksModal() { setWorksModalState({ open: false, loading: false, userId: '', nickname: '', shelfCount: 0, data: [] }) }

  function openAllWorksModal(filterUserId?: string) {
    setAllWorksModalState({ open: true, loading: true, filterUserId: filterUserId || '', data: [] })
    const authToken = getAuthToken()
    // 如果有作者筛选，则后端直接按 userId 拉；否则拉全量然后在本地支持切作者下拉不重新请求
    const worksUrl = filterUserId
      ? ('/tuzhong-wenshu/api/admin/dashboard/all-works?userId=' + encodeURIComponent(filterUserId))
      : '/tuzhong-wenshu/api/admin/dashboard/all-works'
    Promise.all([
      fetch('/tuzhong-wenshu/api/admin/users', { headers: { Authorization: 'Bearer ' + authToken } }).then(function (r) { return r.json() }),
      fetch(worksUrl, { headers: { Authorization: 'Bearer ' + authToken } }).then(function (r) { return r.json() })
    ]).then(function (resps) {
      const usersResp = resps[0]
      const worksResp = resps[1]
      const uMap: Record<string,string> = {}
      if (usersResp && usersResp.success && Array.isArray(usersResp.data)) {
        for (let i = 0; i < usersResp.data.length; i++) {
          const u = usersResp.data[i]
          uMap[u.id] = u.nickname || u.username || ('用户' + u.id.substring(0, 6))
        }
      }
      let list: Array<AdminWorkBrief & { userId: string; nickname: string }> = []
      if (worksResp && worksResp.success && Array.isArray(worksResp.data)) {
        for (let j = 0; j < worksResp.data.length; j++) {
          const it = worksResp.data[j]
          list.push({ ...it, userId: it.userId || '', nickname: it.nickname || uMap[it.userId] || '未知作者' })
        }
      }
      if (filterUserId) list = list.filter(function (x) { return x.userId === filterUserId })
      setAllWorksModalState({ open: true, loading: false, filterUserId: filterUserId || '', data: list })
    }).catch(function () {
      setAllWorksModalState({ open: true, loading: false, filterUserId: filterUserId || '', data: [] })
    })
  }
  function closeAllWorksModal() { setAllWorksModalState({ open: false, loading: false, filterUserId: '', data: [] }) }

  function openEditUserModal(userId: string) {
    setEditUserModalState({ open: true, loading: true, saving: false, userId, detail: null, form: { nickname: '', email: '', status: 1, subscriptionTier: 'free', subscriptionStartedAt: '', subscriptionExpiresAt: '', newPassword: '' } })
    fetch('/tuzhong-wenshu/api/admin/users/' + userId, { headers: { Authorization: 'Bearer ' + getAuthToken() } })
      .then(function (r) { return r.json() })
      .then(function (b) {
        if (b && b.success && b.data) {
          const d = b.data as AdminUserDetail
          const isoToYmd = function (iso: string | null | undefined): string {
            if (!iso) return ''
            try {
              const dt = new Date(iso)
              if (isNaN(dt.getTime())) return ''
              const y = dt.getFullYear()
              const m = String(dt.getMonth() + 1).padStart(2, '0')
              const d2 = String(dt.getDate()).padStart(2, '0')
              return y + '-' + m + '-' + d2
            } catch { return '' }
          }
          setEditUserModalState({ open: true, loading: false, saving: false, userId, detail: d, form: { nickname: d.nickname || '', email: d.email || '', status: d.status, subscriptionTier: d.subscriptionTier || 'free', subscriptionStartedAt: isoToYmd(d.subscriptionStartedAt), subscriptionExpiresAt: isoToYmd(d.subscriptionExpiresAt), newPassword: '' } })
        } else {
          alert('用户详情加载失败')
          setEditUserModalState({ open: false, loading: false, saving: false, userId, detail: null, form: { nickname: '', email: '', status: 1, subscriptionTier: 'free', subscriptionStartedAt: '', subscriptionExpiresAt: '', newPassword: '' } })
        }
      }).catch(function () { alert('用户详情加载失败') })
  }

  function closeEditUserModal() { setEditUserModalState({ open: false, loading: false, saving: false, userId: '', detail: null, form: { nickname: '', email: '', status: 1, subscriptionTier: 'free', subscriptionStartedAt: '', subscriptionExpiresAt: '', newPassword: '' } }) }

  // 打开创建用户弹窗：重置表单
  function openCreateUserModal() {
    setCreateUserModalState({ open: true, saving: false, form: { username: '', nickname: '', password: '', email: '', isAdmin: false } })
  }
  function closeCreateUserModal() {
    setCreateUserModalState({ open: false, saving: false, form: { username: '', nickname: '', password: '', email: '', isAdmin: false } })
  }

  // 提交创建用户：校验 -> POST /api/admin/users -> 成功后刷新列表并关闭弹窗
  function handleSubmitCreateUser() {
    const f = createUserModalState.form
    if (!f.username || !f.username.trim()) { alert('请输入用户名'); return }
    if (!f.nickname || !f.nickname.trim()) { alert('请输入昵称'); return }
    if (!f.password || f.password.length < 6 || f.password.length > 16) { alert('密码长度必须在 6-16 位之间'); return }
    setCreateUserModalState(function (prev) { return { ...prev, saving: true } })
    const payload: Record<string, unknown> = {
      username: f.username.trim(),
      nickname: f.nickname.trim(),
      password: f.password,
    }
    if (f.email && f.email.trim()) payload.email = f.email.trim()
    if (f.isAdmin) payload.isAdmin = true
    fetch('/tuzhong-wenshu/api/admin/users', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json() })
      .then(function (b) {
        if (b && b.success) {
          alert('创建成功')
          setCreateUserModalState({ open: false, saving: false, form: { username: '', nickname: '', password: '', email: '', isAdmin: false } })
          pullUserBatch()
        } else {
          alert('创建失败：' + (b?.message || '未知错误'))
          setCreateUserModalState(function (prev) { return { ...prev, saving: false } })
        }
      }).catch(function () { alert('创建失败，请检查网络'); setCreateUserModalState(function (prev) { return { ...prev, saving: false } }) })
  }

  function execSaveEditUser() {
    if (!editUserModalState.detail) return
    setEditUserModalState(function (prev) { return { ...prev, saving: true } })
    const ymdToIsoEnd = function (ymd: string): string | null {
      if (!ymd) return null
      try {
        const parts = ymd.split('-')
        if (parts.length !== 3) return null
        const y = Number(parts[0]); const m = Number(parts[1]) - 1; const d2 = Number(parts[2])
        const dt = new Date(y, m, d2, 23, 59, 59, 999)
        if (isNaN(dt.getTime())) return null
        return dt.toISOString()
      } catch { return null }
    }
    const ymdToIsoStart = function (ymd: string): string | null {
      if (!ymd) return null
      try {
        const parts = ymd.split('-')
        if (parts.length !== 3) return null
        const y = Number(parts[0]); const m = Number(parts[1]) - 1; const d2 = Number(parts[2])
        const dt = new Date(y, m, d2, 0, 0, 0, 0)
        if (isNaN(dt.getTime())) return null
        return dt.toISOString()
      } catch { return null }
    }
    const isLifetime = editUserModalState.form.subscriptionTier === 'lifetime'
    const payload: Record<string, unknown> = {
      nickname: editUserModalState.form.nickname || null,
      email: editUserModalState.form.email || null,
      status: Number(editUserModalState.form.status || 0),
      subscriptionTier: editUserModalState.form.subscriptionTier || 'free',
      subscriptionStartedAt: ymdToIsoStart(editUserModalState.form.subscriptionStartedAt || ''),
      subscriptionExpiresAt: isLifetime ? null : ymdToIsoEnd(editUserModalState.form.subscriptionExpiresAt || ''),
    }
    if (editUserModalState.form.newPassword && editUserModalState.form.newPassword.length > 0) {
      payload.resetPassword = true
      payload.newPassword = editUserModalState.form.newPassword
    }
    fetch('/tuzhong-wenshu/api/admin/users/' + editUserModalState.userId, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json() })
      .then(function (b) {
        if (b && b.success) {
          alert('用户信息已保存' + (editUserModalState.form.newPassword ? '，密码已重置' : ''))
          setEditUserModalState({ open: false, loading: false, saving: false, userId: '', detail: null, form: { nickname: '', email: '', status: 1, subscriptionTier: 'free', subscriptionStartedAt: '', subscriptionExpiresAt: '', newPassword: '' } })
          pullUserBatch()
        } else {
          alert('保存失败：' + (b?.message || '未知错误'))
          setEditUserModalState(function (prev) { return { ...prev, saving: false } })
        }
      }).catch(function () { alert('保存失败'); setEditUserModalState(function (prev) { return { ...prev, saving: false } }) })
  }

  function pullSysConfig() {
    setLoadProcessFlag(true)
    const authToken = getAuthToken()
    // 🔥 修复：保存后不清空sysParamStore，避免支付设置页面输入框全部为空造成flex/grid高度闪烁排版错误
    // 改为直接请求后端，返回新数据后整体merge更新，保留用户未保存的编辑态
    const cacheBust = String(Date.now()) + '_' + String(Math.floor(Math.random() * 1000000))
    fetch('/tuzhong-wenshu/api/admin/sys-config?_=' + cacheBust, {
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + authToken, 'Cache-Control': 'no-store, no-cache', Pragma: 'no-cache' }
    })
      .then(async function (res) {
        const text = await res.text()
        let body: any = null
        try { body = JSON.parse(text) } catch { body = null }
        return body
      })
      .then(function (respBody) {
        setLoadProcessFlag(false)
        if (respBody && respBody.success) {
          const merged: Record<string, string> = {}
          const keys = Object.keys(respBody.data || {})
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i]
            const v = String(respBody.data[k] ?? '')
            merged[k] = v
          }
          if (merged.wechat_appid && !merged.wechat_appid.startsWith('wx')) merged.wechat_appid = ''
          if (merged.wechatAppid && !merged.wechatAppid.startsWith('wx')) merged.wechatAppid = ''
          if (merged.wechat_appsecret && merged.wechat_appsecret.length < 20) merged.wechat_appsecret = ''
          if (merged.wechatAppSecret && merged.wechatAppSecret.length < 20) merged.wechatAppSecret = ''
          if (merged.wechatAppsecret && merged.wechatAppsecret.length < 20) merged.wechatAppsecret = ''
          setSysParamStore(merged)
          let logo = merged.brand_logo || merged.brandLogo || ''
          if (logo) {
            const baseLogoUrl = logo.split('?')[0]
            const currentBaseUrl = (brandLogoPreview || '').split('?')[0]
            if (baseLogoUrl !== currentBaseUrl) {
              const sep = logo.includes('?') ? '&' : '?'
              logo = logo + sep + '_cb=' + Date.now()
              setBrandLogoPreview(logo)
            }
          } else if (brandLogoPreview !== null && brandLogoPreview !== '') {
            setBrandLogoPreview(null)
          }
        }
      })
      .catch(function () { setLoadProcessFlag(false) })

    fetch('/tuzhong-wenshu/api/admin/payments/wechat-setup?_=' + cacheBust, {
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + authToken, 'Cache-Control': 'no-store, no-cache', Pragma: 'no-cache' }
    })
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        if (respBody && respBody.success) {
          const wp: Record<string, string> = {}
          const wpKeys = Object.keys(respBody.data || {})
          for (let j = 0; j < wpKeys.length; j++) { const k = wpKeys[j]; wp[k] = String(respBody.data[k] || '') }
          setWechatPaySetup(wp)
        }
      }).catch(function () {})
  }

  function pullUserBatch() {
    setLoadProcessFlag(true)
    const authToken = getAuthToken()
    fetch('/tuzhong-wenshu/api/admin/users', { headers: { Authorization: 'Bearer ' + authToken } })
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        setLoadProcessFlag(false)
        if (respBody && respBody.success) setUserBatchGroup(respBody.data || [])
        else alert(respBody.message || '加载用户列表失败')
      })
      .catch(function () { setLoadProcessFlag(false); alert('网络错误，加载用户列表失败') })
  }

  function pullPayRecords() {
    setLoadProcessFlag(true)
    const authToken = getAuthToken()
    fetch('/tuzhong-wenshu/api/admin/payments', { headers: { Authorization: 'Bearer ' + authToken } })
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        setLoadProcessFlag(false)
        if (respBody && respBody.success) setPayRecGroup(respBody.data || [])
        else alert(respBody.message || '加载支付记录失败')
      })
      .catch(function () { setLoadProcessFlag(false); alert('网络错误，加载支付记录失败') })
  }

  function pullDashboardMetrics() {
    const authToken = getAuthToken()
    fetch('/tuzhong-wenshu/api/admin/dashboard', { headers: { Authorization: 'Bearer ' + authToken } })
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        if (respBody && respBody.success) setDashboardMetrics(respBody.data)
      })
      .catch(function () {})
  }

  function execRemoveLogo() {
    setBrandLogoPreview(null)
    setSysParamStore(function (prev) {
      const merged: Record<string, string> = {}
      const keys = Object.keys(prev)
      for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
      merged.brandLogo = ''
      merged.brand_logo = ''
      return merged
    })
  }

  function execLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (uploadProcessFlag) return
    if (file.size > 2 * 1024 * 1024) { showToast('Logo 图片不能超过2MB', 'error'); return }
    const mimeRe = new RegExp('image/(jpeg|png|webp|gif|svg)')
    if (!mimeRe.test(file.type)) { showToast('仅支持 JPG/PNG/WebP/GIF/SVG 格式', 'error'); return }
    setUploadProcessFlag(true)
    const formData = new FormData()
    formData.append('file', file)
    const authToken = getAuthToken()
    fetch('/tuzhong-wenshu/api/admin/upload-logo', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken },
      body: formData,
    })
      .then(async function (r) {
        const text = await r.text()
        let b: any = null
        try { b = JSON.parse(text) } catch { b = null }
        if (!r.ok) {
          setTimeout(function () {
            setUploadProcessFlag(false)
            showToast('Logo上传失败 (HTTP ' + r.status + ')：' + (b?.message || text.substring(0, 100) || '服务器错误'), 'error')
          }, 0)
          return
        }
        if (b && b.success && b.data && b.data.logoUrl) {
          const newUrl = b.data.logoUrl
          prevLogoUrlRef.current = newUrl
          setTimeout(function () {
            setSysParamStore(function (prev) {
              const merged: Record<string, string> = {}
              const keys = Object.keys(prev)
              for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
              merged.brandLogo = newUrl
              merged.brand_logo = newUrl
              return merged
            })
            setUploadProcessFlag(false)
            setBrandLogoPreview(newUrl)
            if (b.data.dbSaved === false) {
              console.warn('[Logo上传] 文件已保存但数据库写入失败，需要手动保存')
            }
            showToast('Logo上传成功', 'success')
          }, 0)
        } else {
          setTimeout(function () {
            setUploadProcessFlag(false)
            showToast('Logo上传失败：' + (b?.message || '未知错误'), 'error')
          }, 0)
        }
      })
      .catch(function (err) {
        setTimeout(function () {
          setUploadProcessFlag(false)
          console.error('[Logo上传] 网络错误:', err)
          showToast('Logo上传失败，请检查网络连接后重试', 'error')
        }, 0)
      })
  }

  function execSaveBrandSetup() {
    setLoadProcessFlag(true)
    const authToken = getAuthToken()
    const payload: Record<string, string> = {
      brandLogo: sysParamStore.brandLogo || sysParamStore.brand_logo || '',
      brand_logo: sysParamStore.brand_logo || sysParamStore.brandLogo || '',
      brandName: sysParamStore.brandName || sysParamStore.brand_name || '',
      brand_name: sysParamStore.brand_name || sysParamStore.brandName || '',
      brandSlogan: sysParamStore.brandSlogan || sysParamStore.brand_slogan || '',
      brand_slogan: sysParamStore.brand_slogan || sysParamStore.brandSlogan || '',
    }
    fetch('/tuzhong-wenshu/api/admin/sys-config', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json() })
      .then(function (b) {
        setTimeout(function () {
          setLoadProcessFlag(false)
          if (b && b.success) {
            showToast('品牌设置已保存，Logo已全局生效', 'success')
          } else {
            showToast('保存失败：' + (b?.message || '未知错误'), 'error')
          }
        }, 0)
      }).catch(function () {
        setTimeout(function () {
          setLoadProcessFlag(false)
          showToast('保存失败', 'error')
        }, 0)
      })
  }

  function execSaveSysConfig() {
    setLoadProcessFlag(true)
    const authToken = getAuthToken()
    fetch('/tuzhong-wenshu/api/admin/sys-config', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(sysParamStore)
    }).then(function () {
      setLoadProcessFlag(false)
      alert('系统设置已保存')
      pullSysConfig()
    }).catch(function () { setLoadProcessFlag(false); alert('保存失败') })
  }

  function execCertUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCertUploadFlag(true)
    const fd = new FormData()
    fd.append('file', file)
    const authToken = getAuthToken()
    fetch('/tuzhong-wenshu/api/admin/payments/wechat-cert', { method: 'POST', headers: { Authorization: 'Bearer ' + authToken }, body: fd })
      .then(function (r) { return r.json() })
      .then(function (b) {
        setCertUploadFlag(false)
        if (b && b.success) {
          setWechatPaySetup(function (prev) {
            const merged: Record<string, string> = {}
            const keys = Object.keys(prev)
            for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
            merged.wechat_pay_serial_no = b.data.wechat_pay_serial_no || ''
            merged.wechat_pay_cert = b.data.wechat_pay_cert || ''
            return merged
          })
          alert('证书已解析并上传成功')
        } else {
          alert('证书解析失败：' + (b?.message || '未知错误'))
        }
      })
      .catch(function () { setCertUploadFlag(false); alert('证书上传失败') })
  }

  function execSaveWechatPay() {
    setWechatPaySaveFlag(true)
    const authToken = getAuthToken()
    fetch('/tuzhong-wenshu/api/admin/payments/wechat-setup', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(wechatPaySetup)
    }).then(function (r) { return r.json() })
      .then(function (b) {
        setWechatPaySaveFlag(false)
        if (b && b.success) {
          alert('微信支付配置已保存')
          pullSysConfig()
        } else {
          alert('保存失败：' + (b?.message || '未知错误'))
        }
      }).catch(function () { setWechatPaySaveFlag(false); alert('保存失败') })
  }

  function execToggleUserBan(userId: string, currentStatus: number, isAdmin: boolean) {
    if (isAdmin) { alert('不能封禁管理员账号'); return }
    if (currentStatus === 0) { alert('该用户已封禁，点击确定将解除封禁'); }
    else if (!confirm(currentStatus === 1 ? '确定封禁该用户？' : '确定解除封禁该用户？')) return
    const authToken = getAuthToken()
    fetch('/tuzhong-wenshu/api/admin/users/' + userId, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: currentStatus === 1 ? 0 : 1 })
    }).then(function () { pullUserBatch() }).catch(function () { alert('操作失败') })
  }

  function execDeleteUser(userId: string, isAdmin: boolean, nickname: string) {
    if (isAdmin) { alert('不能删除管理员账号'); return }
    if (!confirm('确定删除用户「' + nickname + '」？\n该操作不可恢复，用户的所有数据将被永久删除。')) return
    const authToken = getAuthToken()
    fetch('/tuzhong-wenshu/api/admin/users/' + userId, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + authToken }
    }).then(function (r) { return r.json() })
      .then(function (b) {
        if (b.success || b.code === 200) {
          alert('用户已删除')
          pullUserBatch()
        } else {
          alert('删除失败：' + (b.message || '未知错误'))
        }
      })
      .catch(function () { alert('删除失败，请检查网络') })
  }

  function renderDashboardCards() {
    if (!dashboardMetrics) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1,2,3,4,5,6].map(function (_,i) { return (
            <div key={i} className="bg-white rounded-[12px] shadow-sm p-6 h-32 animate-pulse">
              <div className="h-4 w-20 bg-[#F2F3F5] rounded mb-4"></div>
              <div className="h-8 w-32 bg-[#F2F3F5] rounded"></div>
            </div>
          )})}
        </div>
      )
    }
    const cards = [
      { label: '总用户数', value: dashboardMetrics.totalUsers, icon: Users, color: 'bg-[#165DFF]', onClick: function () { switchPanel('users') } },
      { label: 'VIP会员数', value: dashboardMetrics.vipCount, icon: Crown, color: 'bg-[#FF7D00]', onClick: function () { switchPanel('users') } },
      { label: '今日新增注册', value: dashboardMetrics.todayRegistrations, icon: TrendingUp, color: 'bg-green-500', onClick: function () { switchPanel('users') } },
      { label: '待审核', value: dashboardMetrics.pendingPayments, icon: CreditCard, color: 'bg-orange-500', onClick: function () { switchPanel('payments') } },
      { label: '累计收入 (元)', value: dashboardMetrics.totalRevenue, icon: CreditCard, color: 'bg-[#F53F3F]', onClick: function () { switchPanel('payments') } },
      { label: '作品总数', value: dashboardMetrics.totalNovels, icon: BookOpen, color: 'bg-[#722ED1]', onClick: function () { openAllWorksModal() } }
    ]
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map(function (c, i) {
          return (
            <div
              key={i}
              onClick={c.onClick}
              className={'bg-white rounded-[12px] p-6 shadow-sm transition-all ' + (typeof c.onClick === 'function' ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : '')}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-sm text-[#86909C]">{c.label}</span>
                <div className={'w-10 h-10 rounded-xl flex items-center justify-center ' + c.color}>
                  <c.icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="text-3xl font-bold text-[#1D2129]">{c.value}</div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderUserRow(u: UserBatchItem, idx: number) {
    const tierMap: Record<string,string> = { free: '非会员', monthly: '月度VIP', quarterly: '季度VIP', yearly: '年度VIP', lifetime: '终身VIP' }
    const tierColor: Record<string,string> = { free: 'bg-[#F2F3F5] text-[#4E5969]', monthly: 'bg-[#165DFF] text-white', quarterly: 'bg-[#722ED1] text-white', yearly: 'bg-[#FF7D00] text-white', lifetime: 'bg-gradient-to-r from-[#FF7D00] to-[#F53F3F] text-white' }
    const isoToYmd = function (iso: string | null | undefined): string {
      if (!iso) return ''
      try {
        const dt = new Date(iso)
        if (isNaN(dt.getTime())) return ''
        const y = dt.getFullYear(); const m = String(dt.getMonth() + 1).padStart(2, '0'); const d = String(dt.getDate()).padStart(2, '0')
        return y + '-' + m + '-' + d
      } catch { return '' }
    }
    const started = isoToYmd(u.subscriptionStartedAt)
    const expires = isoToYmd(u.subscriptionExpiresAt)
    let dateRange = ''
    if (u.subscriptionTier === 'lifetime') dateRange = ' (永久有效)'
    else if (started && expires) dateRange = ' (' + started + ' ~ ' + expires + ')'
    else if (expires) dateRange = ' (至 ' + expires + ')'
    else if (started) dateRange = ' (自 ' + started + ')'
    return (
      <tr key={u.id} className="hover:bg-[#F7F8FA]">
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#165DFF]/10 flex items-center justify-center text-[#165DFF] font-semibold text-sm">
              {(u.nickname || u.username || 'U').substring(0,1).toUpperCase()}
            </div>
            <div>
              <div className="text-[#1D2129] font-medium">{u.nickname || u.username}</div>
              <div className="text-xs text-[#86909C] mt-0.5">{'@' + u.username}</div>
            </div>
            {u.isAdmin && <Shield className="w-4 h-4 text-[#165DFF]" aria-label="管理员" />}
          </div>
        </td>
        <td className="px-6 py-4 text-[#4E5969] text-sm">{fmtWorkDate(u.createdAt)}</td>
        <td className="px-6 py-4">
          <div className="flex flex-col gap-1.5">
            <span className={'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium w-fit ' + (tierColor[u.subscriptionTier] || tierColor.free)}>
              <Crown className="w-3 h-3" />
              {tierMap[u.subscriptionTier] || '非会员'}
            </span>
            {dateRange && <div className="text-[11px] text-[#86909C] leading-tight">{dateRange}</div>}
          </div>
        </td>
        <td className="px-6 py-4 text-[#4E5969]">
          <button type="button" onClick={function (e) { e.preventDefault(); openWorksModal(u.id, u.nickname || u.username, u.novelCount || 0) }} className="text-[#165DFF] hover:underline text-sm font-medium bg-transparent border-0 p-0 cursor-pointer">{'查看作品 (' + (u.novelCount || 0) + ')'}</button>
        </td>
        <td className="px-6 py-4">
          <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (u.status === 1 ? 'bg-green-50 text-green-600' : 'bg-[#FEECE8] text-red-600')}>
            {u.status === 1 ? '正常' : '已封禁'}
          </span>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-1.5">
            <button onClick={function () { openEditUserModal(u.id) }} className="p-2 rounded-lg hover:bg-[#F2F3F5]" title="编辑用户"><Edit className="w-4 h-4 text-[#4E5969]" /></button>
            <button onClick={function () { execToggleUserBan(u.id, u.status, u.isAdmin) }} className="p-2 rounded-lg hover:bg-red-50" title={u.status === 1 ? '封禁' : '解封'}>
              {u.status === 1 ? <Ban className="w-4 h-4 text-red-500" /> : <Clock className="w-4 h-4 text-green-600" />}
            </button>
            {!u.isAdmin && (
              <button onClick={function () { execDeleteUser(u.id, u.isAdmin, u.nickname || u.username) }} className="p-2 rounded-lg hover:bg-red-50" title="删除用户">
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  function renderPaymentRow(p: PayRecItem, idx: number) {
    const channelMap: Record<string,string> = { wechat: '微信支付', manual: '人工开通' }
    const planMap: Record<string,string> = { monthly: '月度会员', month: '月度会员', quarterly: '季度会员', quarter: '季度会员', yearly: '年度会员', year: '年度会员', lifetime: '终身会员', life: '终身会员', pro: '专业版', free: '免费版' }
    const statusMap: Record<number,{label:string;cls:string}> = { 0: { label: '待支付', cls: 'bg-orange-50 text-orange-600' }, 1: { label: '已支付', cls: 'bg-green-50 text-green-600' }, 2: { label: '已退款', cls: 'bg-red-50 text-red-600' }, 3: { label: '已取消', cls: 'bg-[#F2F3F5] text-[#86909C]' } }
    const planLabel = planMap[p.planType] || p.planType
    const statusObj = statusMap[p.status] || statusMap[0]
    return (
      <tr key={p.id} className="hover:bg-[#F7F8FA]">
        <td className="px-6 py-4 font-mono text-xs text-[#4E5969]">{p.orderNo}</td>
        <td className="px-6 py-4 text-[#1D2129]">{p.user?.nickname || p.user?.username}</td>
        <td className="px-6 py-4 font-medium text-[#1D2129]">{'¥' + p.amount}</td>
        <td className="px-6 py-4 text-[#4E5969]">{planLabel}</td>
        <td className="px-6 py-4 text-[#4E5969]">{new Date(p.createdAt).toLocaleDateString('zh-CN')}</td>
        <td className="px-6 py-4">
          <span className={'px-2 py-1 rounded-full text-xs font-medium ' + statusObj.cls}>{statusObj.label}</span>
        </td>
      </tr>
    )
  }

  function renderBasicConfigFields() {
    const fields = [
      { key: 'app_name', camelKey: 'appName', label: '应用名称' },
      { key: 'app_version', camelKey: 'appVersion', label: '版本号' },
      { key: 'copyright', camelKey: 'copyright', label: '版权信息' },
    ]
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {/* 左侧面板：基础设置 / 微信开放平台 / AI模型配置 */}
        <div className="lg:col-span-1 space-y-5 p-5 bg-white rounded-[8px] border border-[#E5E6EB] shadow-[0px_2px_10px_rgba(0,0,0,0.04)]">
          <div>
            <h3 className="text-base font-bold text-[#1D2129] mb-4 pb-3 border-b border-[#F2F3F5]">基础设置</h3>
            <div className="space-y-4">
        {fields.map(function (item) {
          return (
            <div key={item.key}>
              <label className="block text-sm font-medium text-[#4E5969] mb-2">{item.label}</label>
              <input
                value={sysParamStore[item.key] || sysParamStore[item.camelKey] || ''}
                onChange={function (e) {
                  setSysParamStore(function (prev) {
                    const merged: Record<string, string> = {}
                    const keys = Object.keys(prev)
                    for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                    merged[item.key] = e.target.value
                    merged[item.camelKey] = e.target.value
                    return merged
                  })
                }}
                className="w-full px-4 py-2.5 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all text-sm"
              />
            </div>
          )
        })}
            </div>
          </div>
          {/* 微信开放平台配置 */}
          <div className="pt-2 border-t border-[#F2F3F5]">
            <h4 className="text-sm font-bold text-[#1D2129] mb-3">微信开放平台配置</h4>
            <p className="text-xs text-[#86909C] mb-4">配置后启用真实微信扫码登录（部署到公网服务器后生效）；本地开发需通过内网穿透配置回调域名</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#4E5969] mb-2">AppID</label>
              <input
                name={'cfg_wechat_appid_' + Date.now()}
                autoComplete="off"
                value={sysParamStore.wechat_appid || sysParamStore.wechatAppid || ''}
                onChange={function (e) {
                  setSysParamStore(function (prev) {
                    const merged: Record<string, string> = {}
                    const keys = Object.keys(prev)
                    for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                    merged.wechat_appid = e.target.value
                    merged.wechatAppid = e.target.value
                    return merged
                  })
                }}
                placeholder="微信开放平台 AppID（如 wx1234567890abcdef）"
                className="w-full px-4 py-2.5 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4E5969] mb-2">AppSecret</label>
              <input
                name={'cfg_wechat_appsecret_' + Date.now()}
                autoComplete="new-password"
                type="password"
                value={sysParamStore.wechat_appsecret || sysParamStore.wechatAppSecret || sysParamStore.wechatAppsecret || ''}
                onChange={function (e) {
                  setSysParamStore(function (prev) {
                    const merged: Record<string, string> = {}
                    const keys = Object.keys(prev)
                    for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                    merged.wechat_appsecret = e.target.value
                    merged.wechatAppSecret = e.target.value
                    merged.wechatAppsecret = e.target.value
                    return merged
                  })
                }}
                placeholder="微信开放平台 AppSecret"
                className="w-full px-4 py-2.5 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all text-sm"
              />
            </div>
              <div>
                <label className="block text-sm font-medium text-[#4E5969] mb-2">回调域名（公网HTTPS）</label>
                <input
                  name={'cfg_wechat_callback_domain_' + Date.now()}
                  autoComplete="off"
                  value={sysParamStore.wechat_callback_domain || sysParamStore.wechatCallbackDomain || ''}
                  onChange={function (e) {
                    setSysParamStore(function (prev) {
                      const merged: Record<string, string> = {}
                      const keys = Object.keys(prev)
                      for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                      merged.wechat_callback_domain = e.target.value
                      merged.wechatCallbackDomain = e.target.value
                      return merged
                    })
                  }}
                  placeholder="如：https://tuzhong.example.com（微信扫码登录必备，必须HTTPS+443/80端口+备案域名）"
                  className="w-full px-4 py-2.5 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all text-sm"
                />
              </div>
            </div>
          </div>
          {/* 左栏底部保存按钮 */}
          <div className="pt-3 border-t border-[#F2F3F5]">
            <button onClick={execSaveSysConfig} className="w-full px-6 py-2.5 bg-[#165DFF] text-white rounded-[8px] hover:bg-[#0F3FA8] transition-colors text-sm font-medium">
              保存配置
            </button>
          </div>
        </div>
        {/* 右侧面板：系统通知 / 用户协议 / 隐私政策 / 用户意见反馈 */}
        <div className="lg:col-span-2 space-y-5 p-5 bg-white rounded-[8px] border border-[#E5E6EB] shadow-[0px_2px_10px_rgba(0,0,0,0.04)]">
          <div>
            <h3 className="text-base font-bold text-[#1D2129] mb-4 pb-3 border-b border-[#F2F3F5]">系统通知与协议内容</h3>
            <div className="space-y-5">
        {/* 系统通知维护 */}
        <div className="pt-1">
          <h4 className="text-sm font-bold text-[#1D2129] mb-2">系统通知</h4>
          <p className="text-xs text-[#86909C] mb-3">显示在前台右上角通知铃铛中，留空则不显示通知红点</p>
          <textarea
            value={sysParamStore.system_notice || sysParamStore.systemNotice || ''}
            onChange={function (e) {
              setSysParamStore(function (prev) {
                const merged: Record<string, string> = {}
                const keys = Object.keys(prev)
                for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                merged.system_notice = e.target.value
                merged.systemNotice = e.target.value
                return merged
              })
            }}
            placeholder="例如：系统将于本周六凌晨2:00-4:00进行维护升级，届时无法访问，请提前保存作品。"
            rows={3}
            className="w-full px-4 py-2.5 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all text-sm resize-none"
          />
        </div>
        {/* 用户协议维护 */}
        <div className="pt-2 border-t border-[#F2F3F5]">
          <h4 className="text-sm font-bold text-[#1D2129] mb-2">用户协议</h4>
          <p className="text-xs text-[#86909C] mb-3">显示在前台 <a href="/tuzhong-wenshu/terms" target="_blank" className="text-[#165DFF]">/terms</a> 页面，支持纯文本和多段落（空行分段）</p>
          <textarea
            value={sysParamStore.legal_terms || sysParamStore.legalTerms || sysParamStore.userAgreement || sysParamStore.user_agreement || ''}
            onChange={function (e) {
              setSysParamStore(function (prev) {
                const merged: Record<string, string> = {}
                const keys = Object.keys(prev)
                for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                merged.legal_terms = e.target.value
                merged.legalTerms = e.target.value
                merged.userAgreement = e.target.value
                merged.user_agreement = e.target.value
                return merged
              })
            }}
            placeholder="请输入用户协议内容..."
            rows={8}
            className="w-full px-4 py-2.5 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all text-sm resize-y font-mono leading-relaxed"
          />
        </div>
        {/* 隐私政策维护 */}
        <div className="pt-2 border-t border-[#F2F3F5]">
          <h4 className="text-sm font-bold text-[#1D2129] mb-2">隐私政策</h4>
          <p className="text-xs text-[#86909C] mb-3">显示在前台 <a href="/tuzhong-wenshu/privacy" target="_blank" className="text-[#165DFF]">/privacy</a> 页面，支持纯文本和多段落（空行分段）</p>
          <textarea
            value={sysParamStore.legal_privacy || sysParamStore.legalPrivacy || sysParamStore.privacyPolicy || sysParamStore.privacy_policy || ''}
            onChange={function (e) {
              setSysParamStore(function (prev) {
                const merged: Record<string, string> = {}
                const keys = Object.keys(prev)
                for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                merged.legal_privacy = e.target.value
                merged.legalPrivacy = e.target.value
                merged.privacyPolicy = e.target.value
                merged.privacy_policy = e.target.value
                return merged
              })
            }}
            placeholder="请输入隐私政策内容..."
            rows={8}
            className="w-full px-4 py-2.5 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all text-sm resize-y font-mono leading-relaxed"
          />
        </div>
        {/* 意见反馈查看 */}
        <div className="pt-2 border-t border-[#F2F3F5]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-[#1D2129]">用户意见反馈</h4>
            <button
              onClick={function () { setFeedbackPanelOpen(!feedbackPanelOpen) }}
              className="text-xs text-[#165DFF] hover:text-[#0F3FA8]"
            >
              {feedbackPanelOpen ? '收起' : '展开'} ({feedbackList.length})
            </button>
          </div>
          {!feedbackPanelOpen ? (
            <p className="text-xs text-[#86909C]">点击「展开」查看和回复用户提交的意见反馈</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {feedbackLoading ? (
                <p className="text-sm text-[#86909C] text-center py-4">加载中...</p>
              ) : feedbackList.length === 0 ? (
                <p className="text-sm text-[#86909C] text-center py-4">暂无反馈</p>
              ) : feedbackList.map(function (fb) {
                const categoryMap: Record<string, string> = { bug: '问题报告', suggestion: '功能建议', complaint: '投诉', other: '其他' }
                const statusMap: Record<number, { label: string; cls: string }> = {
                  0: { label: '待处理', cls: 'bg-orange-50 text-orange-600' },
                  1: { label: '已回复', cls: 'bg-green-50 text-green-600' },
                  2: { label: '已关闭', cls: 'bg-[#F2F3F5] text-[#86909C]' },
                }
                const catLabel = categoryMap[fb.category] || fb.category
                const statusObj = statusMap[fb.status] || statusMap[0]
                const replyInputId = 'fb-reply-' + fb.id
                return (
                  <div key={fb.id} className="p-3 border border-[#E5E6EB] rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 bg-[#F2F3F5] text-[#4E5969] rounded">{catLabel}</span>
                        <span className={'text-xs px-1.5 py-0.5 rounded ' + statusObj.cls}>{statusObj.label}</span>
                        <span className="text-xs text-[#86909C]">{fb.user?.nickname || fb.user?.username || '匿名'}</span>
                      </div>
                      <span className="text-xs text-[#C9CDD4]">{new Date(fb.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                    <p className="text-sm text-[#1D2129] whitespace-pre-wrap break-words mb-2">{fb.content}</p>
                    {fb.contact && <p className="text-xs text-[#86909C] mb-2">联系方式：{fb.contact}</p>}
                    {fb.reply && <p className="text-xs text-green-700 bg-green-50 p-2 rounded mt-1">回复：{fb.reply}</p>}
                    {fb.status === 0 && (
                      <div className="flex gap-2 mt-2">
                        <input
                          id={replyInputId}
                          type="text"
                          placeholder="输入回复内容，回车或点击回复按钮..."
                          className="flex-1 h-8 px-2 text-xs border border-[#C9CDD4] rounded focus:outline-none focus:border-[#165DFF]"
                          onKeyDown={function (e) {
                            if (e.key === 'Enter') {
                              const val = (e.target as HTMLInputElement).value.trim()
                              if (val) execReplyFeedback(fb.id, val)
                            }
                          }}
                        />
                        <button
                          onClick={function () {
                            const input = document.getElementById(replyInputId) as HTMLInputElement | null
                            if (input && input.value.trim()) execReplyFeedback(fb.id, input.value.trim())
                          }}
                          className="px-3 h-8 text-xs text-white bg-[#165DFF] rounded hover:bg-[#0F3FA8]"
                        >回复</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
            </div>
          </div>
          {/* 右侧底部保存按钮 */}
          <div className="pt-4 border-t border-[#F2F3F5]">
            <button
              onClick={execSaveSysConfig}
              disabled={loadProcessFlag}
              className="w-full px-6 py-2.5 bg-[#165DFF] text-white rounded-[8px] hover:bg-[#0F3FA8] disabled:bg-[#94BFFF] transition-colors text-sm font-medium"
            >
              {loadProcessFlag ? '保存中...' : '保存配置'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderPaymentPriceFields() {
    const priceFields = [
      { key: 'monthly_price', camelKey: 'monthlyPrice', label: '月度价格 (元)' },
      { key: 'quarterly_price', camelKey: 'quarterlyPrice', label: '季度价格 (元)' },
      { key: 'yearly_price', camelKey: 'yearlyPrice', label: '年度价格 (元)' },
      { key: 'lifetime_price', camelKey: 'lifetimePrice', label: '终身价格 (元)' },
      { key: 'order_expire_minutes', camelKey: 'orderExpireMinutes', label: '待支付订单有效期 (分钟，1-1440)' },
    ]
    return (
      <div className="space-y-[18px]">
        {priceFields.map(function (item) {
          return (
            <div key={item.key}>
              <label className="block text-sm text-[#4E5969] mb-2">{item.label}</label>
              <input
                value={sysParamStore[item.key] || sysParamStore[item.camelKey] || ''}
                onChange={function (e) {
                  setSysParamStore(function (prev) {
                    const merged: Record<string, string> = {}
                    const keys = Object.keys(prev)
                    for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                    merged[item.key] = e.target.value
                    merged[item.camelKey] = e.target.value
                    return merged
                  })
                }}
                type="number"
                className="w-full h-10 px-3 rounded-[6px] border border-[#DCDFE6] bg-white text-[#1f2329] placeholder-[#86909C] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20 transition-colors"
              />
            </div>
          )
        })}
        <button onClick={execSaveSysConfig} className="h-9 px-4 rounded-[6px] bg-[#165DFF] text-white text-sm hover:bg-[#0F3FA8] transition-colors">
          保存支付设置
        </button>
      </div>
    )
  }

  function renderWechatPayFields() {
    const wechatFields = [
      { key: 'wechat_pay_mchid', label: '商户号', placeholder: '如：1671911138' },
      { key: 'wechat_pay_appid', label: '支付AppID（服务号/小程序）', placeholder: '填写已认证的服务号或小程序AppID（网站应用AppID不支持支付）' },
      { key: 'wechat_pay_merchant_name', label: '商户简称', placeholder: '如：途中文枢' },
      { key: 'wechat_pay_company_name', label: '企业全称', placeholder: '企业全称' },
      { key: 'wechat_pay_apiv2_key', label: 'APIv2密钥', placeholder: '32位密钥' },
      { key: 'wechat_pay_apiv3_key', label: 'APIv3密钥', placeholder: '32位密钥' },
    ]
    return (
      <div className="space-y-3">
        {wechatFields.map(function (item) {
          return (
            <div key={item.key}>
              <label className="block text-sm text-[#4E5969] mb-1.5">{item.label}</label>
              <input
                value={wechatPaySetup[item.key] || ''}
                onChange={function (e) {
                  setWechatPaySetup(function (prev) {
                    const merged: Record<string, string> = {}
                    const keys = Object.keys(prev)
                    for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                    merged[item.key] = e.target.value
                    return merged
                  })
                }}
                placeholder={item.placeholder}
                className="w-full h-10 px-3 rounded-[6px] border border-[#DCDFE6] bg-white text-[#1f2329] placeholder-[#86909C] text-sm font-mono focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20 transition-colors"
              />
            </div>
          )
        })}
        <div>
          <label className="block text-sm text-[#4E5969] mb-1.5">商户证书（ZIP上传）</label>
          <div
            onClick={function () { certFileInputRef.current?.click() }}
            className="border-2 border-dashed border-[#DCDFE6] rounded-[6px] p-4 text-center cursor-pointer hover:border-[#165DFF] transition-colors"
          >
            {certUploadFlag ? (
              <div className="flex items-center justify-center gap-2 text-[#165DFF]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">正在解析证书...</span>
              </div>
            ) : wechatPaySetup.wechat_pay_serial_no ? (
              <div className="text-sm">
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <FileArchive className="w-5 h-5" />
                  <span>证书已解析</span>
                </div>
                <p className="text-xs text-[#86909C] mt-1">{'序列号：' + wechatPaySetup.wechat_pay_serial_no}</p>
                <p className="text-xs text-[#165DFF] mt-1">点击重新上传</p>
              </div>
            ) : (
              <div className="text-[#86909C] text-sm">
                <FileArchive className="w-6 h-6 mx-auto mb-1" />
                <span>点击上传证书 ZIP 包</span>
                <p className="text-xs mt-1">仅支持 .zip 格式，自动解析序列号和PEM证书</p>
              </div>
            )}
            <input ref={certFileInputRef} type="file" accept=".zip" onChange={execCertUpload} className="hidden" />
          </div>
        </div>
        {wechatPaySetup.wechat_pay_serial_no && (
          <div>
            <label className="block text-sm text-[#4E5969] mb-1.5">证书序列号（自动解析）</label>
            <input
              value={wechatPaySetup.wechat_pay_serial_no}
              readOnly
              className="w-full h-10 px-3 rounded-[6px] border border-[#DCDFE6] bg-[#F7F8FA] text-[#86909C] text-sm font-mono"
            />
          </div>
        )}
        <div>
          <label className="block text-sm text-[#4E5969] mb-1.5">商户证书PEM（wechat_pay_cert）</label>
          <textarea
            value={wechatPaySetup.wechat_pay_cert || ''}
            onChange={function (e) {
              setWechatPaySetup(function (prev) {
                const merged: Record<string, string> = {}
                const keys = Object.keys(prev)
                for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                merged.wechat_pay_cert = e.target.value
                return merged
              })
            }}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            rows={4}
            className="w-full px-3 py-2 rounded-[6px] border border-[#DCDFE6] bg-white text-[#1f2329] placeholder-[#86909C] text-xs font-mono focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20 transition-colors"
          />
          <p className="text-xs text-[#86909C] mt-1">ZIP上传后自动填充，也可手动粘贴PEM格式证书</p>
        </div>
        <div>
          <label className="block text-sm text-[#4E5969] mb-1.5">商户私钥PEM（wechat_pay_private_key）</label>
          <textarea
            value={wechatPaySetup.wechat_pay_private_key || ''}
            onChange={function (e) {
              setWechatPaySetup(function (prev) {
                const merged: Record<string, string> = {}
                const keys = Object.keys(prev)
                for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                merged.wechat_pay_private_key = e.target.value
                return merged
              })
            }}
            placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
            rows={4}
            className="w-full px-3 py-2 rounded-[6px] border border-[#DCDFE6] bg-white text-[#1f2329] placeholder-[#86909C] text-xs font-mono focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20 transition-colors"
          />
          <p className="text-xs text-[#86909C] mt-1">ZIP上传后自动填充，也可手动粘贴PEM格式私钥</p>
        </div>
      </div>
    )
  }

  // ===== 主渲染 =====

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-1 bg-white rounded-xl p-1 border border-[#E5E6EB] mb-8">
            {[
              { key: 'dashboard', label: '数据概览', icon: TrendingUp },
              { key: 'users', label: '用户管理', icon: Users },
              { key: 'payments', label: '收款管理', icon: CreditCard },
              { key: 'config', label: '系统设置', icon: Settings },
            ].map(function (t) {
              let tabBtnClass = 'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all text-[#4E5969] hover:text-[#1D2129] hover:bg-[#F2F3F5]'
              if (activePanel === t.key) {
                tabBtnClass = 'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all bg-[#165DFF] text-white shadow-sm'
              }
              return (
                <button
                  key={t.key}
                  onClick={function () { switchPanel(t.key as 'dashboard' | 'users' | 'payments' | 'config') }}
                  className={tabBtnClass}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              )
            })}
          </div>

          {activePanel === 'dashboard' && renderDashboardCards()}

          {activePanel === 'users' && (
            <div className="bg-white rounded-[8px] border border-[#E5E6EB] shadow-[0px_2px_10px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#F2F3F5]">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-[#1D2129]">{'用户列表 (' + userBatchGroup.length + ')'}</h3>
                  <button onClick={openCreateUserModal} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#165DFF] text-white text-sm font-medium hover:bg-[#0F3FA8] transition-colors">
                    <Plus className="w-4 h-4" />
                    创建用户
                  </button>
                </div>
                <button onClick={pullUserBatch} className="p-2 hover:bg-[#F2F3F5] rounded-lg"><RefreshCw className="w-4 h-4 text-[#4E5969]" /></button>
              </div>
              {loadProcessFlag ? (
                <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[#165DFF]" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#F7F8FA]">
                      <tr>
                        <th className="text-left px-6 py-3 font-medium text-[#4E5969]">用户</th>
                        <th className="text-left px-6 py-3 font-medium text-[#4E5969]">注册时间</th>
                        <th className="text-left px-6 py-3 font-medium text-[#4E5969]">会员</th>
                        <th className="text-left px-6 py-3 font-medium text-[#4E5969]">作品数</th>
                        <th className="text-left px-6 py-3 font-medium text-[#4E5969]">状态</th>
                        <th className="text-left px-6 py-3 font-medium text-[#4E5969]">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F2F3F5]">
                      {userBatchGroup.map(function (u, i) { return renderUserRow(u, i) })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activePanel === 'payments' && (
            <div>
              {dashboardMetrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: '累计收入 (元)', value: Number(dashboardMetrics.totalRevenue || 0).toFixed(2), icon: CreditCard, color: 'bg-[#F53F3F]' },
                    { label: '本月收入 (元)', value: Number(dashboardMetrics.revenueMonth || 0).toFixed(2), icon: TrendingUp, color: 'bg-[#FF7D00]' },
                    { label: '今日收入 (元)', value: Number(dashboardMetrics.revenueToday || 0).toFixed(2), icon: Clock, color: 'bg-green-500' },
                    { label: '待入账 (元)', value: Number(dashboardMetrics.pendingAmount || 0).toFixed(2), icon: CreditCard, color: 'bg-orange-500' }
                  ].map(function (it, idx) {
                    const Icon = it.icon
                    return (
                      <div key={idx} className="bg-white rounded-[12px] shadow-[0px_2px_10px_rgba(0,0,0,0.05)] p-5 border border-[#E5E6EB] hover:shadow-md transition-all">
                        <div className="flex items-start justify-between mb-4">
                          <div className={'w-11 h-11 rounded-xl flex items-center justify-center ' + it.color}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                        </div>
                        <div className="text-2xl font-bold text-[#1D2129] mb-1">{'¥' + it.value}</div>
                        <div className="text-sm text-[#86909C]">{it.label}</div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="bg-white rounded-[8px] border border-[#E5E6EB] shadow-[0px_2px_10px_rgba(0,0,0,0.05)] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#F2F3F5]">
                  <h3 className="font-semibold text-[#1D2129]">{'支付记录 (' + payRecGroup.length + ')'}</h3>
                  <button onClick={pullPayRecords} className="p-2 hover:bg-[#F2F3F5] rounded-lg"><RefreshCw className="w-4 h-4 text-[#4E5969]" /></button>
                </div>
                {loadProcessFlag ? (
                  <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[#165DFF]" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F7F8FA]">
                        <tr>
                          <th className="text-left px-6 py-3 font-medium text-[#4E5969]">订单号</th>
                          <th className="text-left px-6 py-3 font-medium text-[#4E5969]">用户</th>
                          <th className="text-left px-6 py-3 font-medium text-[#4E5969]">金额</th>
                          <th className="text-left px-6 py-3 font-medium text-[#4E5969]">套餐</th>
                          <th className="text-left px-6 py-3 font-medium text-[#4E5969]">提交时间</th>
                          <th className="text-left px-6 py-3 font-medium text-[#4E5969]">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F2F3F5]">
                        {payRecGroup.map(function (p, i) { return renderPaymentRow(p, i) })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activePanel === 'config' && (
            <div>
              <div className="flex gap-1 bg-white rounded-xl p-1 border border-[#E5E6EB] mb-6 w-fit">
                {[
                  { key: 'basic', label: '基本设置', icon: Settings },
                  { key: 'brand', label: '品牌设置', icon: Image },
                  { key: 'payment', label: '支付设置', icon: CreditCard },
                ].map(function (t) {
                  let confTabBtnClass = 'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all text-[#4E5969] hover:text-[#1D2129] hover:bg-[#F2F3F5]'
                  if (activeConfigTab === t.key) {
                    confTabBtnClass = 'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all bg-[#165DFF] text-white shadow-sm'
                  }
                  return (
                    <button
                      key={t.key}
                      onClick={function () { switchConfigPanel(t.key as 'basic' | 'brand' | 'payment') }}
                      className={confTabBtnClass}
                    >
                      <t.icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  )
                })}
              </div>

              {activeConfigTab === 'basic' && (
                <div className="space-y-0">
                  {renderBasicConfigFields()}
                </div>
              )}

              {activeConfigTab === 'brand' && (
                <div className="bg-white rounded-[8px] shadow-[0px_2px_10px_rgba(0,0,0,0.05)] p-5 max-w-lg">
                  <h3 className="text-base font-bold text-[#1D2129] mb-4 pb-4 border-b border-[#F2F3F5]">品牌设置</h3>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-[#4E5969] mb-2">品牌Logo</label>
                      <p className="text-xs text-[#86909C] mb-3">支持 JPG/PNG 格式，建议尺寸 200×60px，大小不超过2MB</p>
                      <div
                        className={(brandLogoPreview ? 'border-2 border-solid border-[#165DFF] bg-[#F5F8FF] ' : 'border-2 border-dashed border-[#C9CDD4] ') + 'rounded-xl p-6 text-center hover:border-[#165DFF] transition-colors cursor-pointer'}
                        onClick={function () { logoFileInputRef.current?.click() }}
                        onDragOver={function (e) { e.preventDefault() }}
                        onDrop={function (e) {
                          e.preventDefault()
                          const file = e.dataTransfer.files[0]
                          if (file && logoFileInputRef.current) {
                            const dt = new DataTransfer()
                            dt.items.add(file)
                            logoFileInputRef.current.files = dt.files
                            logoFileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
                          }
                        }}
                      >
                        <input ref={logoFileInputRef} type="file" accept="image/jpeg,image/png" onChange={execLogoUpload} className="hidden" />
                        {uploadProcessFlag ? (
                          <div className="flex flex-col items-center gap-3">
                            <Loader2 className="w-8 h-8 text-[#165DFF] animate-spin" />
                            <p className="text-sm text-[#4E5969]">上传中...</p>
                          </div>
                        ) : brandLogoPreview ? (
                          <div className="flex flex-col items-center gap-4">
                            <div className="flex items-center gap-4 justify-center flex-wrap">
                              <div className="bg-white rounded-lg p-3 border border-[#E5E6EB] flex items-center justify-center" style={{ width: 200, height: 70 }}>
                                <img src={brandLogoPreview} alt="浅色Logo预览" className="max-h-10 max-w-[170px] object-contain" />
                              </div>
                              <div className="bg-[#165DFF] rounded-lg p-3 flex items-center justify-center" style={{ width: 200, height: 70 }}>
                                <img src={brandLogoPreview} alt="深色Logo预览" className="max-h-10 max-w-[170px] object-contain brightness-0 invert" />
                              </div>
                              <button
                                onClick={function (e) { e.stopPropagation(); execRemoveLogo() }}
                                className="h-10 px-4 rounded-lg text-sm text-red-500 border border-red-200 hover:bg-red-50 transition-colors flex items-center gap-1"
                                title="移除当前Logo"
                              >
                                <Trash2 className="w-4 h-4" />
                                删除Logo
                              </button>
                            </div>
                            <p className="text-xs text-[#165DFF]">点击或拖拽图片到此处更换 Logo（浅色 / 深色背景预览效果）</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-3">
                            <Upload className="w-8 h-8 text-[#86909C]" />
                            <p className="text-sm text-[#4E5969]">点击或拖拽图片到此处上传</p>
                          </div>
                        )}
                      </div>
                      {!brandLogoPreview && null}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#4E5969] mb-2">品牌名称</label>
                      <input
                        value={sysParamStore.brandName || sysParamStore.brand_name || ''}
                        onChange={function (e) {
                          setSysParamStore(function (prev) {
                            const merged: Record<string, string> = {}
                            const keys = Object.keys(prev)
                            for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                            merged.brandName = e.target.value
                            merged.brand_name = e.target.value
                            return merged
                          })
                        }}
                        placeholder="途中文枢"
                        className="w-full px-4 py-2.5 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#4E5969] mb-2">品牌口号</label>
                      <input
                        value={sysParamStore.brandSlogan || sysParamStore.brand_slogan || ''}
                        onChange={function (e) {
                          setSysParamStore(function (prev) {
                            const merged: Record<string, string> = {}
                            const keys = Object.keys(prev)
                            for (let i = 0; i < keys.length; i++) { merged[keys[i]] = prev[keys[i]] }
                            merged.brandSlogan = e.target.value
                            merged.brand_slogan = e.target.value
                            return merged
                          })
                        }}
                        placeholder="AI 小说写作助手 · 妙笔生花"
                        className="w-full px-4 py-2.5 rounded-[8px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 transition-all text-sm"
                      />
                    </div>
                    <button onClick={execSaveBrandSetup} className="px-6 py-2.5 bg-[#165DFF] text-white rounded-[8px] hover:bg-[#0F3FA8] transition-colors text-sm font-medium">
                      保存品牌设置
                    </button>
                  </div>
                </div>
              )}

              {activeConfigTab === 'payment' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <div className="bg-white rounded-[8px] shadow-[0px_2px_10px_rgba(0,0,0,0.05)] p-5 min-h-[400px]">
                    <h3 className="text-base font-bold text-[#1D2129] mb-4">支付价格设置</h3>
                    {renderPaymentPriceFields()}
                  </div>
                  <div className="bg-white rounded-[8px] shadow-[0px_2px_10px_rgba(0,0,0,0.05)] p-5 min-h-[400px]">
                    <h3 className="text-base font-bold text-[#1D2129] mb-4">微信支付配置</h3>
                    <p className="text-xs text-[#86909C] mb-4">配置微信V3 Native动态扫码支付（自动回调、自动开通VIP）</p>
                    {renderWechatPayFields()}
                    <button
                      onClick={execSaveWechatPay}
                      disabled={wechatPaySaveFlag}
                      className="mt-4 h-9 px-4 rounded-[6px] bg-[#165DFF] text-white text-sm hover:bg-[#0F3FA8] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {wechatPaySaveFlag && <Loader2 className="w-4 h-4 animate-spin" />}
                      保存渠道配置
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {worksModalState.open && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center pt-20 pb-8 p-4" onClick={closeWorksModal}>
          <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" onClick={function (e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F2F3F5]">
              <div>
                <h3 className="text-lg font-semibold text-[#1D2129] inline-flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-[#165DFF]" />
                  {'作品列表 - ' + (worksModalState.nickname)}
                </h3>
                <p className="text-xs text-[#86909C] mt-0.5">
                  书架总数 {worksModalState.shelfCount} 本｜当前列出 {worksModalState.data.length} 本作品
                  <span className="mx-1.5 text-[#C9CDD4]">·</span>
                  展示标题 / 章节数 / 人物数 / 卷数 / 字数进度，覆盖所有作品状态
                </p>
              </div>
              <button onClick={closeWorksModal} className="p-2 rounded-lg hover:bg-[#F2F3F5]"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-auto">
              {worksModalState.loading ? (
                <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[#165DFF]" /></div>
              ) : worksModalState.data.length === 0 ? (
                <div className="p-10 text-center text-[#86909C] text-sm">
                  该用户暂无作品数据
                  <p className="text-xs mt-2">说明：用户使用「测试封面」账号如果只跑了封面制作而没点保存作品，则 novels 表就是空，作品数为0是正常现象。</p>
                </div>
              ) : (
                <div className="divide-y divide-[#F2F3F5]">
                  {worksModalState.data.map(function (w) {
                    const wordProgress = w.targetWordCount ? Math.min(100, Math.round((w.currentWordCount / w.targetWordCount) * 100)) : 0
                    const statusMap: Record<string,{label:string;cls:string}> = {
                      draft: { label: '草稿', cls: 'bg-[#F2F3F5] text-[#4E5969]' },
                      writing: { label: '写作中', cls: 'bg-[#165DFF] text-white' },
                      completed: { label: '已完结', cls: 'bg-green-500 text-white' },
                      archived: { label: '已归档', cls: 'bg-[#86909C] text-white' }
                    }
                    const s = statusMap[w.status] || statusMap.draft
                    const coverSrc = normalizeCover(w.coverUrl)
                    return (
                      <div key={w.id} onClick={function () { openWorkDetail(w) }} className="px-6 py-4 hover:bg-[#F7F8FA] cursor-pointer transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="w-20 h-28 flex-shrink-0 rounded-[8px] overflow-hidden bg-[#F2F3F5] border border-[#E5E6EB]">
                            {coverSrc ? (
                              <img src={coverSrc} alt={w.title} className="w-full h-full object-cover" onError={function (e) { (e.currentTarget as HTMLImageElement).style.display='none' }} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#86909C] text-xs">无封面</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <h4 className="text-[#1D2129] font-semibold truncate">{w.title || '（未命名作品）'}</h4>
                              <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + s.cls}>{s.label}</span>
                            </div>
                            {w.description && <p className="text-xs text-[#86909C] line-clamp-2 mb-2">{w.description}</p>}
                            <div className="flex flex-wrap gap-4 text-xs text-[#4E5969] mb-3">
                              <span><BookOpen className="w-3 h-3 inline mr-1" />{'章节：' + (w._count?.chapters || 0)}</span>
                              <span><Users className="w-3 h-3 inline mr-1" />{'人物：' + (w._count?.characters || 0)}</span>
                              <span>{'卷：' + (w._count?.volumes || 0)}</span>
                              <span className={'inline-flex items-center gap-1'}>
                                <span className="text-[#86909C]">{'字数：' + (w.currentWordCount || 0) + (w.targetWordCount ? (' / ' + w.targetWordCount) : '')}</span>
                                {w.targetWordCount ? <span className="text-[#165DFF]">{wordProgress + '%'}</span> : null}
                              </span>
                              {w.genre && <span>{'类型：' + w.genre}</span>}
                            </div>
                            {w.targetWordCount && (
                              <div className="h-1.5 w-full bg-[#F2F3F5] rounded-full overflow-hidden">
                                <div className="h-full bg-[#165DFF] rounded-full" style={{ width: wordProgress + '%' }}></div>
                              </div>
                            )}
                            <div className="mt-2 text-[11px] text-[#86909C]">
                              {'创建：' + fmtWorkDate(w.createdAt) + ' | 更新：' + fmtWorkDate(w.updatedAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-[#F2F3F5] text-right">
              <button onClick={closeWorksModal} className="px-4 py-2 rounded-lg bg-[#F2F3F5] text-[#4E5969] hover:bg-[#E5E6EB] text-sm font-medium">关闭</button>
            </div>
          </div>
        </div>
      )}

      {allWorksModalState.open && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center pt-20 pb-8 p-4" onClick={closeAllWorksModal}>
          <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" onClick={function (e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F2F3F5]">
              <div>
                <h3 className="text-lg font-semibold text-[#1D2129] inline-flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-[#722ED1]" />
                  全平台作品列表
                </h3>
                <p className="text-xs text-[#86909C] mt-0.5">
                  {function () {
                    const total = allWorksModalState.data.length
                    const filtered = allWorksModalState.data.filter(function (w) {
                      if (!allWorksModalState.filterUserId) return true
                      return w.userId === allWorksModalState.filterUserId
                    }).length
                    let txt = '共 ' + total + ' 部作品'
                    if (allWorksModalState.filterUserId) txt += '｜筛选后显示 ' + filtered + ' 部'
                    return txt
                  }()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={allWorksModalState.filterUserId}
                  onChange={function (e) {
                    const v = e.target.value
                    setAllWorksModalState(function (prev) { return { ...prev, filterUserId: v } })
                  }}
                  className="px-3 py-2 rounded-lg border border-[#E5E6EB] text-sm text-[#4E5969] focus:outline-none focus:border-[#165DFF] bg-white"
                >
                  <option value="">全部作者</option>
                  {/* 🔥 修复：下拉框只显示有作品的用户，而非所有注册用户 */}
                  {function () {
                    const seen = new Set<string>()
                    const uniqueAuthors: Array<{ id: string; nickname: string }> = []
                    for (let i = 0; i < allWorksModalState.data.length; i++) {
                      const w = allWorksModalState.data[i]
                      const uid = w.userId || ''
                      if (uid && !seen.has(uid)) {
                        seen.add(uid)
                        uniqueAuthors.push({ id: uid, nickname: w.nickname || '未知作者' })
                      }
                    }
                    return uniqueAuthors.map(function (u) {
                      return (<option key={u.id} value={u.id}>{u.nickname}</option>)
                    })
                  }()}
                </select>
                <button onClick={closeAllWorksModal} className="p-2 rounded-lg hover:bg-[#F2F3F5]"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {allWorksModalState.loading ? (
                <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[#722ED1]" /></div>
              ) : allWorksModalState.data.length === 0 ? (
                <div className="p-10 text-center text-[#86909C] text-sm">暂无作品数据</div>
              ) : (
                <div className="divide-y divide-[#F2F3F5]">
                  {allWorksModalState.data.filter(function (w) {
                    if (!allWorksModalState.filterUserId) return true
                    return w.userId === allWorksModalState.filterUserId
                  }).map(function (w) {
                    const wordProgress = w.targetWordCount ? Math.min(100, Math.round((w.currentWordCount / w.targetWordCount) * 100)) : 0
                    const statusMap: Record<string,{label:string;cls:string}> = {
                      draft: { label: '草稿', cls: 'bg-[#F2F3F5] text-[#4E5969]' },
                      writing: { label: '写作中', cls: 'bg-[#165DFF] text-white' },
                      completed: { label: '已完结', cls: 'bg-green-500 text-white' },
                      archived: { label: '已归档', cls: 'bg-[#86909C] text-white' }
                    }
                    const s = statusMap[w.status] || statusMap.draft
                    const coverSrc = normalizeCover(w.coverUrl)
                    return (
                      <div key={w.id} onClick={function () { openWorkDetail(w) }} className="px-6 py-4 hover:bg-[#F7F8FA] cursor-pointer transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="w-16 h-22 flex-shrink-0 rounded-[8px] overflow-hidden bg-[#F2F3F5] border border-[#E5E6EB]" style={{ height: '88px', width: '64px' }}>
                            {coverSrc ? (
                              <img src={coverSrc} alt={w.title} className="w-full h-full object-cover" onError={function (e) { (e.currentTarget as HTMLImageElement).style.display='none' }} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#86909C]" style={{ fontSize: '10px' }}>无封面</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-[#1D2129] font-semibold truncate">{w.title || '（未命名作品）'}</h4>
                              <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + s.cls}>{s.label}</span>
                            </div>
                            <div className="text-xs text-[#722ED1] mb-1.5 truncate">{'作者：' + (w.nickname || '未知作者') + (w.userId ? '（uid: ' + w.userId.substring(0, 8) + '）' : '')}</div>
                            {w.description && <p className="text-xs text-[#86909C] line-clamp-1 mb-2">{w.description}</p>}
                            <div className="flex flex-wrap gap-3 text-xs text-[#4E5969]">
                              <span><BookOpen className="w-3 h-3 inline mr-1" />{'章：' + (w._count?.chapters || 0)}</span>
                              <span><Users className="w-3 h-3 inline mr-1" />{'人：' + (w._count?.characters || 0)}</span>
                              <span>{'卷：' + (w._count?.volumes || 0)}</span>
                              <span className={'inline-flex items-center gap-1'}>
                                <span className="text-[#86909C]">{'字数：' + (w.currentWordCount || 0) + (w.targetWordCount ? (' / ' + w.targetWordCount) : '')}</span>
                                {w.targetWordCount ? <span className="text-[#165DFF]">{wordProgress + '%'}</span> : null}
                              </span>
                              {w.genre && <span>{'类型：' + w.genre}</span>}
                              <span className="text-[#86909C] ml-auto">{'更新：' + fmtWorkDate(w.updatedAt)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-[#F2F3F5] text-right">
              <button onClick={closeAllWorksModal} className="px-4 py-2 rounded-lg bg-[#F2F3F5] text-[#4E5969] hover:bg-[#E5E6EB] text-sm font-medium">关闭</button>
            </div>
          </div>
        </div>
      )}

      {createUserModalState.open && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center pt-20 pb-8 p-4" onClick={closeCreateUserModal}>
          <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={function (e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F2F3F5]">
              <div>
                <h3 className="text-lg font-semibold text-[#1D2129] inline-flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[#165DFF]" />
                  创建用户
                </h3>
                <p className="text-xs text-[#86909C] mt-0.5">管理员手动创建新用户账号，默认状态为正常、非会员</p>
              </div>
              <button onClick={closeCreateUserModal} className="p-2 rounded-lg hover:bg-[#F2F3F5]"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
              <div className="space-y-4">
                {/* 修复 v7：使用随机 name 和 autocomplete 值阻止浏览器自动填充 leiyang/密码 */}
                <div className="hidden" aria-hidden="true">
                  <input type="text" name="prevent_autofill_1" autoComplete="off" tabIndex={-1} />
                  <input type="password" name="prevent_autofill_2" autoComplete="new-password" tabIndex={-1} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4E5969] mb-1.5">用户名 <span className="text-red-500">*</span></label>
                  <input
                    name={'cu_username_' + Date.now()}
                    value={createUserModalState.form.username}
                    autoComplete="off"
                    onChange={function (e) { setCreateUserModalState(function (prev) { return { ...prev, form: { ...prev.form, username: e.target.value } } }) }}
                    placeholder="2-30 位的中文、字母、数字、下划线"
                    className="w-full px-3 h-10 rounded-[6px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4E5969] mb-1.5">昵称 <span className="text-red-500">*</span></label>
                  <input
                    name={'cu_nickname_' + Date.now()}
                    value={createUserModalState.form.nickname}
                    autoComplete="off"
                    onChange={function (e) { setCreateUserModalState(function (prev) { return { ...prev, form: { ...prev.form, nickname: e.target.value } } }) }}
                    placeholder="1-30 位昵称"
                    className="w-full px-3 h-10 rounded-[6px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4E5969] mb-1.5 inline-flex items-center gap-1.5">
                    <Key className="w-4 h-4" />
                    密码 <span className="text-red-500">*</span> <span className="text-[11px] font-normal text-[#86909C]">6-16 位</span>
                  </label>
                  <input
                    type="password"
                    name={'cu_password_' + Date.now()}
                    autoComplete="new-password"
                    value={createUserModalState.form.password}
                    onChange={function (e) { setCreateUserModalState(function (prev) { return { ...prev, form: { ...prev.form, password: e.target.value } } }) }}
                    placeholder="6-16 位登录密码"
                    className="w-full px-3 h-10 rounded-[6px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4E5969] mb-1.5">邮箱 <span className="text-[11px] font-normal text-[#86909C]">可选</span></label>
                  <input
                    type="email"
                    name={'cu_email_' + Date.now()}
                    value={createUserModalState.form.email}
                    autoComplete="off"
                    onChange={function (e) { setCreateUserModalState(function (prev) { return { ...prev, form: { ...prev.form, email: e.target.value } } }) }}
                    placeholder="选填，留空则不绑定邮箱"
                    className="w-full px-3 h-10 rounded-[6px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createUserModalState.form.isAdmin}
                    onChange={function (e) { setCreateUserModalState(function (prev) { return { ...prev, form: { ...prev.form, isAdmin: e.target.checked } } }) }}
                    className="w-4 h-4 rounded border-[#C9CDD4] text-[#165DFF] focus:ring-[#165DFF]"
                  />
                  <span className="text-sm text-[#1D2129] inline-flex items-center gap-1">
                    <Shield className="w-4 h-4 text-[#165DFF]" />
                    设为管理员 <span className="text-[11px] text-[#86909C]">（勾选后该用户拥有后台管理权限）</span>
                  </span>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-[#F2F3F5]">
              <button
                onClick={closeCreateUserModal}
                disabled={createUserModalState.saving}
                className="px-4 py-2 rounded-lg bg-[#F2F3F5] text-[#4E5969] hover:bg-[#E5E6EB] text-sm disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={handleSubmitCreateUser}
                disabled={createUserModalState.saving}
                className="px-4 py-2 rounded-lg text-sm bg-[#165DFF] text-white hover:bg-[#0F3FA8] disabled:bg-[#86909C] inline-flex items-center gap-1.5"
              >
                {createUserModalState.saving && <Loader2 className="w-4 h-4 animate-spin" />}
                创建用户
              </button>
            </div>
          </div>
        </div>
      )}

      {editUserModalState.open && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center pt-20 pb-8 p-4" onClick={closeEditUserModal}>
          <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={function (e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F2F3F5]">
              <div>
                <h3 className="text-lg font-semibold text-[#1D2129] inline-flex items-center gap-2">
                  <Edit className="w-5 h-5 text-[#165DFF]" />
                  编辑用户信息
                </h3>
                <p className="text-xs text-[#86909C] mt-0.5">{'用户名：' + (editUserModalState.detail?.username || editUserModalState.userId)}</p>
              </div>
              <button onClick={closeEditUserModal} className="p-2 rounded-lg hover:bg-[#F2F3F5]"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
              {editUserModalState.loading ? (
                <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[#165DFF]" /></div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium mb-0.5">关于登录密码</div>
                      <div>用户密码使用 bcrypt 单向哈希存储，管理员无法直接查看明文密码。如需修改，请在下方「重置密码」字段填写新密码（留空则不修改）。</div>
                    </div>
                  </div>
                  <div className="hidden" aria-hidden="true">
                    <input type="text" autoComplete="username" tabIndex={-1} />
                    <input type="password" autoComplete="current-password" tabIndex={-1} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4E5969] mb-1.5">昵称</label>
                    <input
                      value={editUserModalState.form.nickname}
                      autoComplete="off"
                      onChange={function (e) { setEditUserModalState(function (prev) { return { ...prev, form: { ...prev.form, nickname: e.target.value } } }) }}
                      className="w-full px-3 h-10 rounded-[6px] border border-[#C9CDD4] bg-white text-[#1D2129] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4E5969] mb-1.5">邮箱</label>
                    <input
                      value={editUserModalState.form.email}
                      autoComplete="off"
                      onChange={function (e) { setEditUserModalState(function (prev) { return { ...prev, form: { ...prev.form, email: e.target.value } } }) }}
                      className="w-full px-3 h-10 rounded-[6px] border border-[#C9CDD4] bg-white text-[#1D2129] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#4E5969] mb-1.5">账号状态</label>
                      <select
                        value={editUserModalState.form.status}
                        autoComplete="off"
                        onChange={function (e) { setEditUserModalState(function (prev) { return { ...prev, form: { ...prev.form, status: Number(e.target.value) } } }) }}
                        className="w-full px-3 h-10 rounded-[6px] border border-[#C9CDD4] bg-white text-[#1D2129] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20"
                      >
                        <option value={1}>正常</option>
                        <option value={0}>封禁</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#4E5969] mb-1.5">会员等级</label>
                      <select
                        value={editUserModalState.form.subscriptionTier}
                        autoComplete="off"
                        onChange={function (e) { setEditUserModalState(function (prev) { return { ...prev, form: { ...prev.form, subscriptionTier: e.target.value } } }) }}
                        className="w-full px-3 h-10 rounded-[6px] border border-[#C9CDD4] bg-white text-[#1D2129] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20"
                      >
                        <option value="free">非会员</option>
                        <option value="monthly">月度VIP</option>
                        <option value="quarterly">季度VIP</option>
                        <option value="yearly">年度VIP</option>
                        <option value="lifetime">终身VIP</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#4E5969] mb-1.5 inline-flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        会员启用日期
                      </label>
                      <input
                        type="date"
                        value={editUserModalState.form.subscriptionStartedAt}
                        autoComplete="off"
                        onChange={function (e) { setEditUserModalState(function (prev) { return { ...prev, form: { ...prev.form, subscriptionStartedAt: e.target.value } } }) }}
                        className="w-full px-3 h-10 rounded-[6px] border border-[#C9CDD4] bg-white text-[#1D2129] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20"
                      />
                    </div>
                    {editUserModalState.form.subscriptionTier !== 'lifetime' && (
                      <div>
                        <label className="block text-sm font-medium text-[#4E5969] mb-1.5 inline-flex items-center gap-1.5">
                          <Crown className="w-4 h-4" />
                          会员到期日期
                        </label>
                        <input
                          type="date"
                          value={editUserModalState.form.subscriptionExpiresAt}
                          autoComplete="off"
                          onChange={function (e) { setEditUserModalState(function (prev) { return { ...prev, form: { ...prev.form, subscriptionExpiresAt: e.target.value } } }) }}
                          className="w-full px-3 h-10 rounded-[6px] border border-[#C9CDD4] bg-white text-[#1D2129] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20"
                        />
                      </div>
                    )}
                    {editUserModalState.form.subscriptionTier === 'lifetime' && (
                      <div className="bg-[#E8F3FF] border border-[#BEDAFF] rounded-[6px] px-3 py-2 text-sm text-[#165DFF]">
                        <Crown className="w-4 h-4 inline mr-1" />
                        终身VIP会员（永久有效，无到期日期）
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4E5969] mb-1.5 inline-flex items-center gap-1.5">
                      <Key className="w-4 h-4" />
                      重置密码 <span className="text-[11px] font-normal text-[#86909C]">留空则不修改密码</span>
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={editUserModalState.form.newPassword}
                      onChange={function (e) { setEditUserModalState(function (prev) { return { ...prev, form: { ...prev.form, newPassword: e.target.value } } }) }}
                      placeholder="填写新密码以重置用户登录密码"
                      className="w-full px-3 h-10 rounded-[6px] border border-[#C9CDD4] bg-white text-[#1D2129] placeholder-[#86909C] text-sm focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20"
                    />
                  </div>
                  {editUserModalState.detail && (
                    <div className="pt-3 border-t border-[#F2F3F5] grid grid-cols-2 gap-2 text-xs text-[#86909C]">
                      <div>{'注册时间：' + new Date(editUserModalState.detail.createdAt).toLocaleDateString('zh-CN')}</div>
                      <div>{'最近更新：' + new Date(editUserModalState.detail.updatedAt).toLocaleDateString('zh-CN')}</div>
                      {editUserModalState.detail.subscriptionStartedAt && (
                        <div>{'启用日期：' + new Date(editUserModalState.detail.subscriptionStartedAt).toLocaleDateString('zh-CN')}</div>
                      )}
                      {editUserModalState.detail.subscriptionTier === 'lifetime' ? (
                        <div className="text-[#165DFF]">{'会员状态：终身VIP（永久有效）'}</div>
                      ) : editUserModalState.detail.subscriptionExpiresAt ? (
                        <div>{'会员到期：' + new Date(editUserModalState.detail.subscriptionExpiresAt).toLocaleDateString('zh-CN')}</div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-[#F2F3F5]">
              <button
                onClick={closeEditUserModal}
                disabled={editUserModalState.saving || editUserModalState.loading}
                className="px-4 py-2 rounded-lg bg-[#F2F3F5] text-[#4E5969] hover:bg-[#E5E6EB] text-sm disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={execSaveEditUser}
                disabled={editUserModalState.saving || editUserModalState.loading || !editUserModalState.detail}
                className="px-4 py-2 rounded-lg text-sm bg-[#165DFF] text-white hover:bg-[#0F3FA8] disabled:bg-[#86909C] inline-flex items-center gap-1.5"
              >
                {editUserModalState.saving && <Loader2 className="w-4 h-4 animate-spin" />}
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast 通知 - 页面居中显示，提高可见性 */}
      {toast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className={'px-6 py-4 rounded-xl shadow-2xl text-base font-medium text-white flex items-center gap-3 pointer-events-auto ' + 
            (toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600')
          }>
            {toast.type === 'success' && <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
            {toast.type === 'error' && <AlertTriangle className="w-7 h-7" />}
            {toast.type === 'info' && <AlertTriangle className="w-7 h-7" />}
            <span className="text-lg">{toast.message}</span>
          </div>
        </div>
      )}
      </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">加载中...</div>}>
      <AdminPageContent />
    </Suspense>
  )
}
