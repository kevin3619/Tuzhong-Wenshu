/**
 * 客户端登出统一工具
 *
 * 根因修复（Bug #1）：middleware.ts 从 token cookie 读取登录态（v4 Q2 统一来源），
 * 而退出登录只清了 localStorage，cookie 残留导致：
 *  1) middleware 继续把用户当作已登录（页面请求放行）
 *  2) 用新账号登录后，前端 token state 与 cookie 不一致，页面反复被踢回登录页
 * 统一处理：清 localStorage + 清 cookie（token / auth_token 两个变体，含 Secure 与否两种写法）
 */
export function clearAuthClient(): void {
  if (typeof window === 'undefined') { return }
  try {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  } catch (_e) { /* 忽略 */ }
  const isSecure = window.location.protocol === 'https:'
  const suffix = '; path=/; max-age=0; SameSite=Lax' + (isSecure ? '; Secure' : '')
  // 同一 cookie 的两种属性写法都要清（Secure 与非 Secure 是不同的存储条目）
  document.cookie = 'token=' + suffix
  document.cookie = 'token=; path=/; max-age=0'
  document.cookie = 'token=; path=/; max-age=0; SameSite=Lax; Secure'
  document.cookie = 'auth_token=' + suffix
  document.cookie = 'auth_token=; path=/; max-age=0'
  document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax; Secure'
}

/** 退出登录并跳转登录页（带 redirect 回跳参数，登录成功后可回到原页面） */
export function logoutAndGoHome(): void {
  // 🔥 配套 /api/auth/logout：把旧 JWT 加入服务端黑名单，登出即失效（不再 7 天裸奔）
  try {
    const token = localStorage.getItem('token') || ''
    fetch('/tuzhong-wenshu/api/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      keepalive: true,
    }).catch(function () { /* 网络失败不阻塞登出 */ })
  } catch (_e) { /* 忽略 */ }
  clearAuthClient()
  window.location.href = '/tuzhong-wenshu/login'
}
