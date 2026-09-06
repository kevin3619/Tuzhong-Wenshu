'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Sparkles, Globe } from 'lucide-react'

interface MobileNavItem {
  label: string
  href: string
  icon: React.ElementType
}

const mobileNavItems: MobileNavItem[] = [
  { label: '书架', href: '/', icon: BookOpen },
  { label: 'AI生成', href: '/ai-generate', icon: Sparkles },
  { label: '设定', href: '/settings/world', icon: Globe },
]

export default function MobileNav() {
  const pathname = usePathname()
  // mounted 状态：避免 SSR/CSR 的 pathname 差异导致 hydration mismatch
  // 使用 useSyncExternalStore 避免 useEffect 中同步 setState 触发 React Compiler 警告
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const isActive = (href: string) => {
    if (!mounted) return false
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-stone-200 flex items-center justify-around md:hidden z-50" suppressHydrationWarning>
      {mobileNavItems.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              active ? 'text-stone-700' : 'text-stone-400'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs mt-1">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
