'use client'

// 修复 v4 3.4-C9：全局 ErrorBoundary，防止组件抛错导致白屏
// Next.js App Router 约定：error.tsx 自动成为最近路由段的错误边界

import { useEffect } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 将错误记录到服务端日志（生产环境可通过 API 上报）
    console.error('[ErrorBoundary] 捕获到未处理错误:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-stone-200 p-8 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-stone-900 mb-2">页面出错了</h2>
        <p className="text-sm text-stone-500 mb-6">
          抱歉，页面遇到了意外错误。请尝试重新加载，或返回首页继续操作。
        </p>
        {error.digest && (
          <p className="text-xs text-stone-400 mb-4 font-mono">
            错误编号: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center space-x-3">
          <button
            onClick={reset}
            className="flex items-center space-x-2 px-4 py-2 bg-[#c8364d] text-white rounded-lg hover:bg-[#a82841] transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            <span>重试</span>
          </button>
          <Link
            href="/"
            className="flex items-center space-x-2 px-4 py-2 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors text-sm font-medium"
          >
            <Home className="w-4 h-4" />
            <span>返回首页</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
