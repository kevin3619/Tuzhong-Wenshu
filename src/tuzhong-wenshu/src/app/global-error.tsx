'use client'

// 修复 v4 3.4-C9：全局根 ErrorBoundary，捕获 root layout 级别的致命错误
// Next.js App Router 约定：global-error.tsx 替换 <html>/<body>，必须自行渲染完整 HTML 结构

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError] 捕获到致命错误:', error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body className="h-full antialiased">
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf7f2', padding: '1rem' }}>
          <div style={{ maxWidth: '28rem', width: '100%', backgroundColor: '#ffffff', borderRadius: '1rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: '1px solid #e7e5e4', padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <div style={{ width: '4rem', height: '4rem', backgroundColor: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <span style={{ fontSize: '1.5rem', color: '#ef4444' }}>!</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1c1917', marginBottom: '0.5rem' }}>应用发生致命错误</h2>
            <p style={{ fontSize: '0.875rem', color: '#78716c', marginBottom: '1.5rem' }}>
              页面遇到了严重问题，请尝试重新加载。如果问题持续出现，请联系管理员。
            </p>
            {error.digest && (
              <p style={{ fontSize: '0.75rem', color: '#a8a29e', marginBottom: '1rem', fontFamily: 'monospace' }}>
                错误编号: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: '#c8364d', color: '#ffffff', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}
            >
              重新加载
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
