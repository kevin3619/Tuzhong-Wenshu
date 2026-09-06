'use client'

import { useState, useEffect } from 'react'
import Sidebar from '@/components/sidebar'
import Header from '@/components/header'
import MobileNav from '@/components/mobile-nav'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    queueMicrotask(function () { setMounted(true) })
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const effectiveIsMobile = mounted ? isMobile : false

  if (effectiveIsMobile) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col" suppressHydrationWarning>
        <Header />
        <main className="flex-1 px-4 py-6 pb-20 overflow-x-hidden">
          {children}
        </main>
        <MobileNav />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]" suppressHydrationWarning>
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <Header />
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-6 pb-12">
          {children}
        </main>
      </div>
    </div>
  )
}
