'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AIGeneratePage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-stone-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-stone-500">正在跳转...</p>
      </div>
    </div>
  )
}
