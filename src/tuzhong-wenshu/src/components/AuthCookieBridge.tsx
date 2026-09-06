'use client'

/**
 * AuthCookieBridge — 前端认证桥梁（P0 修复 2026-08-23）
 *
 * 根因：后端 middleware.ts 对 /api/* 强制要求 token（cookie 或 Authorization header）。
 * 而前端只在 localStorage 存 token：① wizard 的 fetch 未带 Authorization 头；② 登录接口只返回
 * token 到 JSON body、不写 cookie。因此浏览器端的所有 client fetch（book-search / ai-generate /
 * auto-book-analysis 等）都命中 middleware 401「未登录」，导致前端全流程（仿写拆书/一键生成）无法运行。
 *
 * 修复：把 localStorage 中的 token 同步写为 token cookie（SameSite=Lax、同源请求自动携带），
 * 使 middleware 从 cookie 读到 token，所有 client 请求即被放行。登出时清空 cookie 防止凭据残留。
 */
import { useEffect } from 'react'

export default function AuthCookieBridge() {
  useEffect(() => {
    const sync = () => {
      try {
        const token = localStorage.getItem('token') || ''
        const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
        if (token) {
          document.cookie = 'token=' + token + '; path=/; max-age=604800; SameSite=Lax' + (isSecure ? '; Secure' : '')
        } else {
          document.cookie = 'token=; path=/; max-age=0; SameSite=Lax' + (isSecure ? '; Secure' : '')
        }
      } catch (_e) { /* ignore */ }
    }
    sync()
    // 顶部同步：处理同 tab 登录/登出（localStorage 变更）
    const t = window.setInterval(sync, 1500)
    const onStorage = (e: StorageEvent) => { if (e.key === 'token') sync() }
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return null
}
