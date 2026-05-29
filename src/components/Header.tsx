import { Link } from 'react-router-dom'
import { Menu, Settings, LogOut } from 'lucide-react'
import { useState } from 'react'

function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="border-b border-border bg-card h-16 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <button className="lg:hidden" onClick={() => setMenuOpen(!menuOpen)}>
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="text-2xl font-bold text-primary">途中文枢</h1>
        <p className="text-sm text-muted-foreground">AI小说写作助手</p>
      </div>

      <div className="flex items-center gap-4">
        <Link to="/settings" className="p-2 hover:bg-muted rounded-md">
          <Settings className="h-5 w-5" />
        </Link>
        <button className="p-2 hover:bg-muted rounded-md text-destructive">
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}

export default Header
