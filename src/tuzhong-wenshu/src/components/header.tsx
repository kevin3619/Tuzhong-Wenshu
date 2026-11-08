'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bell, Home, ChevronRight, LogOut, Settings, MessageSquare, X, Send, Zap } from 'lucide-react'
import { subscribeActiveModel, getActiveModel } from '@/components/activeModelStore'

// 路由名称映射（修复 v4 M2：补充 style/reference/characters）
const routeNameMap: Record<string, string> = {
  '': '书架',
  write: '作品书架',
  'ai-generate': 'AI 小说自动创作向导',
  settings: '个人设置',
  guide: '使用指南',
  skills: 'SKILL',
  vip: 'VIP会员',
  admin: '管理后台',
  style: '风格工坊',
  reference: '对标作品分析',
  characters: '角色关系',
}

// 特殊路由映射（子路由）
const subRouteMap: Record<string, string> = {
  world: '世界观设定',
}

export default function Header() {
  const pathname = usePathname()
  // mounted 状态：避免 SSR/CSR 的 pathname 差异导致 hydration mismatch
  const _mounted = useState(false)
  const mounted = _mounted[0]
  const setMounted = _mounted[1]

  // 通知面板状态
  const _showNotifications = useState(false)
  const showNotifications = _showNotifications[0]
  const setShowNotifications = _showNotifications[1]
  // 用户菜单状态
  const _showUserMenu = useState(false)
  const showUserMenu = _showUserMenu[0]
  const setShowUserMenu = _showUserMenu[1]
  // 意见反馈弹窗状态
  const _showFeedback = useState(false)
  const showFeedback = _showFeedback[0]
  const setShowFeedback = _showFeedback[1]
  // 系统通知内容
  const _noticeContent = useState('')
  const noticeContent = _noticeContent[0]
  const setNoticeContent = _noticeContent[1]
  const _noticeLoading = useState(false)
  const noticeLoading = _noticeLoading[0]
  const setNoticeLoading = _noticeLoading[1]
  // 反馈表单
  const _fbCategory = useState('suggestion')
  const fbCategory = _fbCategory[0]
  const setFbCategory = _fbCategory[1]
  const _fbContent = useState('')
  const fbContent = _fbContent[0]
  const setFbContent = _fbContent[1]
  const _fbContact = useState('')
  const fbContact = _fbContact[0]
  const setFbContact = _fbContact[1]
  const _fbSubmitting = useState(false)
  const fbSubmitting = _fbSubmitting[0]
  const setFbSubmitting = _fbSubmitting[1]
  const _fbMessage = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fbMessage = _fbMessage[0]
  const setFbMessage = _fbMessage[1]

  const notifRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // 用户信息
  const _user = useState<{ nickname: string; username: string; email: string | null; isAdmin: boolean } | null>(null)
  const user = _user[0]
  const setUser = _user[1]

  // 🔥 当前 AI 大模型（AI 生成每步成功后由 wizard 写入，右上角展示）
  const _activeModel = useState<{ usedModel?: string; usedProvider?: string } | null>(getActiveModel())
  const activeModel = _activeModel[0]
  const setActiveModel = _activeModel[1]
  useEffect(function () {
    setActiveModel(getActiveModel())
    return subscribeActiveModel(function (m) { setActiveModel(m) })
  }, [])

  // 🔥 Bug修复：获取作品标题用于面包屑显示（必须在breadcrumbs计算之前声明）
  const _novelTitle = useState<string | null>(null)
  const novelTitle = _novelTitle[0]
  const setNovelTitle = _novelTitle[1]

  useEffect(function () {
    setMounted(true)
    const saved = localStorage.getItem('user')
    if (saved) {
      try {
        setUser(JSON.parse(saved))
      } catch (_e) { console.error('[header] 解析本地用户信息失败:', _e) }
    }
    // 加载系统通知
    setNoticeLoading(true)
    fetch('/tuzhong-wenshu/api/notice')
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data.code === 200 && data.data && data.data.content) {
          setNoticeContent(data.data.content)
        }
      })
      .catch(function (err) { console.error('[header] 加载公告内容失败:', err) })
      .finally(function () { setNoticeLoading(false) })
  }, [])

  // 提交意见反馈
  function handleSubmitFeedback() {
    if (!fbContent.trim()) {
      setFbMessage({ type: 'error', text: '请填写反馈内容' })
      return
    }
    if (fbContent.length > 2000) {
      setFbMessage({ type: 'error', text: '反馈内容不能超过2000字' })
      return
    }
    setFbSubmitting(true)
    setFbMessage(null)
    const token = localStorage.getItem('token') || ''
    fetch('/tuzhong-wenshu/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        category: fbCategory,
        content: fbContent.trim(),
        contact: fbContact.trim() || null,
      }),
    })
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data.code === 200) {
          setFbMessage({ type: 'success', text: '反馈已提交，感谢您的支持！' })
          setFbContent('')
          setFbContact('')
          setFbCategory('suggestion')
          setTimeout(function () {
            setShowFeedback(false)
            setFbMessage(null)
          }, 1800)
        } else {
          setFbMessage({ type: 'error', text: data.message || '提交失败' })
        }
      })
      .catch(function () {
        setFbMessage({ type: 'error', text: '网络错误，请重试' })
      })
      .finally(function () { setFbSubmitting(false) })
  }

  // 点击外部关闭下拉菜单
  useEffect(function () {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return function () { document.removeEventListener('mousedown', handleClickOutside) }
  }, [])

  // 生成面包屑
  const segments = mounted ? pathname.split('/').filter(Boolean) : []
  let breadcrumbs = segments.map(function (segment, index) {
    const href = '/' + segments.slice(0, index + 1).join('/')
    let name = subRouteMap[segment] || routeNameMap[segment] || decodeURIComponent(segment)
    // 🔥 Bug修复：作品详情页最后一个面包屑显示书名而非ID
    // 修复：UUID/数字ID 都要替换；但保留 routeNameMap 里的已知路由名（如 settings/world）
    if (index === segments.length - 1 && novelTitle && segment && !routeNameMap[segment] && !subRouteMap[segment]) {
      name = novelTitle
    }
    return { href: href, name: name }
  })

  // 特殊处理：设定中心页面（/settings/world）直接显示"设定中心"
  const isSettingsWorld = mounted && pathname === '/settings/world'
  if (isSettingsWorld) {
    breadcrumbs = [{ href: '/settings/world', name: '设定中心' }]
  }

  useEffect(function() {
    if (!mounted) return
    // 检测是否处于作品详情页 /write/:id
    const match = pathname.match(/^\/write\/([^\/]+)$/)
    if (match && match[1]) {
      const novelId = match[1]
      // 尝试从 localStorage 缓存获取
      const cached = localStorage.getItem('tuzhong-novel-title-' + novelId)
      if (cached) {
        setNovelTitle(cached)
        return
      }
      // 从API获取作品标题
      fetch('/tuzhong-wenshu/api/novels?id=' + novelId, { headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') } })
        .then(function(res) { return res.json() })
        .then(function(data) {
          if (data?.data?.title) {
            setNovelTitle(data.data.title)
            localStorage.setItem('tuzhong-novel-title-' + novelId, data.data.title)
          }
        })
        .catch(function(err) { console.error('[header] 拉取小说标题失败:', err) })
    } else {
      setNovelTitle(null)
    }
  }, [mounted, pathname])

  // 通知数据：从系统配置 system_notice 读取
  const hasNotice = noticeContent && noticeContent.trim().length > 0

  return (
    <header className="flex-shrink-0 z-[100] h-14 bg-white border-b border-stone-200 flex items-center justify-between px-6" suppressHydrationWarning>
      {/* 左侧：面包屑导航 */}
      <nav className="flex items-center text-sm text-stone-500">
        <Link
          href="/"
          className="flex items-center hover:text-stone-700 transition-colors"
        >
          <Home className="w-4 h-4" />
        </Link>
        {breadcrumbs.map(function (crumb, index) {
          return (
            <span key={crumb.href} className="flex items-center">
              <ChevronRight className="w-4 h-4 mx-1 text-stone-300" />
              {index === breadcrumbs.length - 1 ? (
                <span className="text-stone-900 font-medium">{crumb.name}</span>
              ) : (
                <Link
                  href={crumb.href}
                  className="hover:text-stone-700 transition-colors"
                >
                  {crumb.name}
                </Link>
              )}
            </span>
          )
        })}
      </nav>

      {/* 右侧：当前模型 + 通知 + 用户 */}
      <div className="flex items-center space-x-3">
        {/* 🔥 当前使用的大模型（AI 生成每步实际模型，右上角展示） */}
        {activeModel && activeModel.usedModel && (
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 max-w-[200px]"
            title={activeModel.usedProvider ? '当前模型提供商：' + activeModel.usedProvider : '当前使用的大模型'}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs font-medium truncate">{activeModel.usedModel}</span>
          </div>
        )}
        {/* 通知铃铛 */}
        <div ref={notifRef} className="relative">
          <button
            onClick={function () {
              setShowNotifications(!showNotifications)
              setShowUserMenu(false)
            }}
            className={'relative p-2 rounded-lg transition-colors ' +
              (showNotifications
                ? 'text-stone-700 bg-stone-50'
                : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100')
            }
          >
            <Bell className="w-5 h-5" />
            {hasNotice && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>

          {/* 通知下拉面板 */}
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden z-[100]">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-stone-900">通知消息</h4>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {noticeLoading ? (
                  <div className="px-4 py-8 text-center text-sm text-stone-400">加载中...</div>
                ) : hasNotice ? (
                  <div className="px-4 py-3">
                    <p className="text-sm text-stone-700 whitespace-pre-wrap break-words leading-relaxed">{noticeContent}</p>
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-stone-400">暂无通知</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 用户头像 + 下拉菜单 */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={function () {
              setShowUserMenu(!showUserMenu)
              setShowNotifications(false)
            }}
            className={'flex items-center space-x-2 pl-3 border-l border-stone-200 rounded-lg py-1.5 px-2 transition-colors ' +
              (showUserMenu
                ? 'bg-stone-100'
                : 'hover:bg-stone-50')
            }
          >
            <div className="w-8 h-8 bg-gradient-to-br from-stone-500 to-stone-400 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">
                {user?.nickname?.charAt(0) || user?.username?.charAt(0) || 'U'}
              </span>
            </div>
            <span className="text-sm font-medium text-stone-700 hidden sm:inline">
              {user?.nickname || user?.username || '用户'}
            </span>
            {user?.isAdmin && (
              <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-medium hidden sm:inline">管理员</span>
            )}
          </button>

          {/* 用户下拉菜单 */}
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden z-[100]">
              <div className="px-4 py-3 border-b border-stone-100">
                <p className="text-sm font-semibold text-stone-900">{user?.nickname || user?.username || '用户'}</p>
                <p className="text-xs text-stone-500">{user?.email || user?.username || ''}</p>
              </div>
              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={function () { setShowUserMenu(false) }}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  <Settings className="w-4 h-4 text-stone-400" />
                  <span>个人设置</span>
                </Link>
                <button
                  onClick={function () { setShowUserMenu(false); setShowFeedback(true) }}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors w-full text-left"
                >
                  <MessageSquare className="w-4 h-4 text-stone-400" />
                  <span>意见反馈</span>
                </button>
              </div>
              <div className="border-t border-stone-100 py-1">
                <button
                  onClick={function () {
                    // 修复 Bug#1：退出必须同时清 cookie（middleware 从 cookie 读登录态）
                    import('@/lib/auth-logout').then(function (m) { m.logoutAndGoHome() })
                  }}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>退出登录</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 意见反馈弹窗 */}
      {showFeedback && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={function () { setShowFeedback(false) }}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            onClick={function (e) { e.stopPropagation() }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h3 className="text-base font-semibold text-stone-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-stone-500" />
                意见反馈
              </h3>
              <button
                onClick={function () { setShowFeedback(false) }}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">反馈类型</label>
                <select
                  value={fbCategory}
                  onChange={function (e) { setFbCategory(e.target.value) }}
                  className="w-full h-10 px-3 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500"
                >
                  <option value="suggestion">功能建议</option>
                  <option value="bug">问题报告</option>
                  <option value="complaint">投诉</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">反馈内容</label>
                <textarea
                  value={fbContent}
                  onChange={function (e) { setFbContent(e.target.value) }}
                  placeholder="请详细描述您的建议或遇到的问题（最多2000字）"
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500 resize-none"
                />
                <p className="text-xs text-stone-400 mt-1 text-right">{fbContent.length}/2000</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">联系方式（选填）</label>
                <input
                  type="text"
                  value={fbContact}
                  onChange={function (e) { setFbContact(e.target.value) }}
                  placeholder="邮箱/手机号/QQ，方便我们联系您"
                  className="w-full h-10 px-3 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500"
                />
              </div>
              {fbMessage && (
                <div className={'p-3 rounded-lg text-sm ' + (fbMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
                  {fbMessage.text}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={function () { setShowFeedback(false) }}
                  className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmitFeedback}
                  disabled={fbSubmitting}
                  className="px-5 py-2 text-sm text-white bg-stone-800 hover:bg-stone-900 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {fbSubmitting ? '提交中...' : (
                    <>
                      <Send className="w-4 h-4" />
                      提交反馈
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
