import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Settings, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

function Sidebar() {
  const location = useLocation()

  const links = [
    { href: '/', label: '首页', icon: Home },
    { href: '/projects', label: '我的项目', icon: BookOpen },
    { href: '/settings', label: '设置', icon: Settings },
  ]

  return (
    <aside className="hidden lg:flex w-64 border-r border-border bg-card flex-col p-4">
      <nav className="space-y-2 flex-1">
        {links.map(link => {
          const Icon = link.icon
          const isActive = location.pathname === link.href
          return (
            <Link
              key={link.href}
              to={link.href}
              className={cn(
                'flex items-center gap-3 px-4 py-2 rounded-md transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{link.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export default Sidebar
