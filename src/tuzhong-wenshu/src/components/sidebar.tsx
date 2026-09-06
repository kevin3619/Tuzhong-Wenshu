'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  Globe,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  HelpCircle,
  Crown,
  Shield,
  Palette,
} from 'lucide-react'
import { BrandLogoSmall } from '@/components/BrandLogo'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  guideId?: string
}

const baseNavItems: NavItem[] = [
  { label: '作品书架', href: '/', icon: BookOpen, guideId: 'bookshelf' },
  { label: '设定中心', href: '/settings/world', icon: Globe },
  { label: '风格工坊', href: '/style', icon: Palette },
  { label: 'SKILL', href: '/skills', icon: Sparkles, guideId: 'skill' },
  { label: '使用指南', href: '/guide', icon: HelpCircle },
  { label: 'VIP会员', href: '/vip', icon: Crown },
  { label: '个人设置', href: '/settings', icon: Settings, guideId: 'settings' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  // 使用 useSyncExternalStore 避免 useEffect 中同步 setState 触发 React Compiler 警告
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const [isAdmin, setIsAdmin] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        const admin = user.isAdmin === true
        // 使用 microtask 避免 useEffect 中同步 setState 触发 React Compiler 警告
        queueMicrotask(() => setIsAdmin(admin))
      } catch {}
    }
    // 加载品牌Logo
    fetch('/tuzhong-wenshu/api/config/public')
      .then(res => res.json())
      .then(data => {
        if (data.code === 200 && data.data.brandLogo) {
          setLogoUrl(data.data.brandLogo)
        }
      })
      .catch(() => {})
  }, [])

  const isActive = (href: string) => {
    if (!mounted) return false
    if (href === '/') return pathname === '/'
    // 设定中心和个人设置互斥处理
    if (href === '/settings/world') return pathname.startsWith('/settings/world')
    if (href === '/settings') return pathname === '/settings' || (pathname.startsWith('/settings') && !pathname.startsWith('/settings/world'))
    // /style 和 /settings/world 都以 /settings 开头，需精确匹配 /style
    if (href === '/style') return pathname === '/style' || pathname.startsWith('/style/')
    return pathname.startsWith(href)
  }

  // 构建导航项（管理员可见时追加管理后台，放在个人设置旁边）
  const navItems: NavItem[] = isAdmin
    ? [...baseNavItems, { label: '管理后台', href: '/admin', icon: Shield }]
    : baseNavItems

  return (
    <aside
      id="sidebar"
      className={`h-full bg-[#1a1a1a] text-white flex flex-col transition-[width] duration-300 flex-shrink-0 overflow-hidden ${
        collapsed ? 'w-14' : 'w-52'
      }`}
      suppressHydrationWarning
    >
      {/* Logo 区域 */}
      <Link
        href="/"
        className={`flex items-center h-14 px-4 border-b border-white/10 hover:bg-white/5 transition-colors flex-shrink-0 ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-7 w-auto shrink-0" />
        ) : (
          <BrandLogoSmall size={28} />
        )}
        {!collapsed && (
          <span className="ml-3 text-lg font-bold whitespace-nowrap">
            途中文枢
          </span>
        )}
      </Link>

      {/* 导航菜单 */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1 min-h-0">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              data-guide={item.guideId}
              className={`flex items-center h-10 px-3 rounded-lg transition-colors ${
                active
                  ? 'bg-[#c8364d] text-white'
                  : 'text-stone-300 hover:bg-white/10 hover:text-white'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && (
                <span className="ml-3 text-lg whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* 折叠/展开按钮 */}
      <div className="border-t-2 border-white/30 px-2 py-3 flex-shrink-0 bg-[#1a1a1a]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`flex items-center w-full h-11 px-3 rounded-lg text-white bg-[#c8364d] hover:bg-[#a82841] transition-colors font-semibold shadow-lg ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5 shrink-0" />
              <span className="ml-3 text-sm whitespace-nowrap">收起菜单</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
