'use client'

/**
 * 🔥 修复（P1）：全站此前没有任何 401 处理——token 过期后
 *   写作页显示「作品不存在，该作品可能已被删除」（误导用户）、后台各 tab 一片空白且无提示。
 *
 * 做法：在 (main) 布局里挂一次，安装一个 fetch 包装器：
 *   任何同源 /api/ 请求返回 401 → 清掉本地登录态 → 跳登录页并说明原因（只跳一次，避免死循环）。
 */
import { useEffect } from 'react'

const FLAG = '__tuzhongSessionGuardInstalled__'
const REDIRECTING = '__tuzhongSessionRedirecting__'

export default function SessionGuard() {
  useEffect(function () {
    const w = window as unknown as Record<string, unknown>
    if (w[FLAG]) return
    w[FLAG] = true

    const original = window.fetch.bind(window)
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const res = await original(input as RequestInfo, init)
      try {
        if (res.status === 401) {
          const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input))
          if (url.indexOf('/api/') !== -1 && !w[REDIRECTING]) {
            w[REDIRECTING] = true
            try {
              localStorage.removeItem('token')
              localStorage.removeItem('user')
            } catch { /* ignore */ }
            const base = window.location.pathname.indexOf('/tuzhong-wenshu') === 0 ? '/tuzhong-wenshu' : ''
            const back = encodeURIComponent(window.location.pathname.replace(/^\/tuzhong-wenshu/, '') + window.location.search)
            window.setTimeout(function () {
              window.location.href = base + '/login?redirect=' + back + '&expired=1'
            }, 600)
          }
        }
      } catch { /* 拦截器自身异常不能影响业务请求 */ }
      return res
    } as typeof window.fetch
  }, [])

  return null
}
