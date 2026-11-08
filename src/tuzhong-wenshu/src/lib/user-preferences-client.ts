'use client'

import { PRESET_STYLES } from '@/lib/ai-service'

// 写作偏好：localStorage（本机快速读取）+ 账号级服务端存储（跨浏览器/设备生效）
export const USER_PREFS_API = '/tuzhong-wenshu/api/user/preferences'

// 🔥 2026-10-26：朱雀 Key「用户自填」模式——本浏览器留存明文 Key 的独立存储位。
//   （服务端账号偏好里另存一份；检测请求由前端从这里取 Key 随 body 传给后端，不存服务端环境变量）
export const ZHUQUE_API_KEY_LS = 'tuzhong-zhuque-api-key'

export function getLocalZhuqueApiKey(): string {
  if (typeof window === 'undefined') return ''
  try {
    return String(localStorage.getItem(ZHUQUE_API_KEY_LS) || '').trim()
  } catch {
    return ''
  }
}

export function setLocalZhuqueApiKey(key: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ZHUQUE_API_KEY_LS, String(key || '').trim())
  } catch (e) {
    console.warn('[user-preferences] 朱雀Key写入本机缓存失败:', e)
  }
}

export function clearLocalZhuqueApiKey(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(ZHUQUE_API_KEY_LS)
  } catch (e) {
    console.warn('[user-preferences] 朱雀Key清除失败:', e)
  }
}

export function prefsAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return token ? { Authorization: 'Bearer ' + token } : {}
}

export function getLocalPrefsUpdatedAt(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem('tuzhong-preferences')
    if (!raw) return 0
    const p = JSON.parse(raw)
    return Number(p && p._updatedAt) || 0
  } catch {
    return 0
  }
}

export function resolveStyleId(value: string): string {
  const key = String(value || '').trim()
  if (!key) return ''
  const found = PRESET_STYLES.find(function (s) { return s.id === key || s.name === key })
  return found ? found.id : key
}

export function resolveStyleName(value: string): string {
  const key = String(value || '').trim()
  if (!key) return ''
  const found = PRESET_STYLES.find(function (s) { return s.id === key || s.name === key })
  return found ? found.name : key
}

function resolveStyle(value: string): { id: string; name: string } | null {
  const key = String(value || '').trim()
  if (!key) return null
  const found = PRESET_STYLES.find(function (s) { return s.id === key || s.name === key })
  if (!found) return null
  return { id: found.id, name: found.name }
}

// 把偏好写入本机 localStorage（写作页 / 生成向导都从这里读取）
export function applyPreferencesToLocalStorage(data: Record<string, unknown> | null | undefined, updatedAt: number): void {
  if (typeof window === 'undefined' || !data || typeof data !== 'object') return
  try {
    // 保留本机独有的阅读偏好（字号/主题等），只覆盖账号级字段
    let existing: Record<string, unknown> = {}
    try { existing = JSON.parse(localStorage.getItem('tuzhong-preferences') || '{}') || {} } catch { existing = {} }
    const prefs: Record<string, unknown> = Object.assign({}, existing)
    Object.keys(data).forEach(function (k) {
      if (k === 'zhuqueApiKey') return // 敏感字段只留服务端，不进 localStorage
      prefs[k] = (data as Record<string, unknown>)[k]
    })
    const ts = Number(updatedAt) || Number(prefs._updatedAt) || Date.now()
    prefs._updatedAt = ts
    localStorage.setItem('tuzhong-preferences', JSON.stringify(prefs))

    if (Array.isArray(prefs.platformConfigs) && prefs.platformConfigs.length > 0) {
      localStorage.setItem('tuzhong-platform-configs', JSON.stringify(prefs.platformConfigs))
    }

    localStorage.setItem('tuzhong-bestseller-prefs', JSON.stringify({
      shuangDensityMode: prefs.shuangDensityMode,
      faceSlapStyle: prefs.faceSlapStyle,
      rhythmIntensity: prefs.rhythmIntensity,
      targetPlatform: prefs.targetPlatform,
      mcPersonality: prefs.mcPersonality,
    }))

    const style = resolveStyle(String(prefs.writingStyle || ''))
    if (style) {
      localStorage.setItem('tuzhong-active-style', style.id)
      const full = PRESET_STYLES.find(function (s) { return s.id === style.id })
      if (full) localStorage.setItem('tuzhong-active-style-data', JSON.stringify(full))
    }

    let lenValue = 1000
    if (prefs.continuationLength === 'short') lenValue = 500
    else if (prefs.continuationLength === 'long') lenValue = 2000
    else if (prefs.continuationLength === 'custom') lenValue = parseInt(String(prefs.customLength), 10) || 500
    localStorage.setItem('tuzhong-continue-length', String(lenValue))
  } catch (e) {
    console.warn('[user-preferences] 写入本机缓存失败:', e)
  }
}

export async function fetchServerPreferences(): Promise<{ data: Record<string, unknown> | null; updatedAt: number; hasZhuqueApiKey: boolean } | null> {
  if (typeof window === 'undefined') return null
  try {
    const res = await fetch(USER_PREFS_API, { headers: prefsAuthHeaders(), cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    const data = json && json.data && typeof json.data === 'object' ? json.data : null
    return { data: data as Record<string, unknown> | null, updatedAt: Number(json && json.updatedAt) || 0, hasZhuqueApiKey: !!(json && json.hasZhuqueApiKey) }
  } catch {
    return null
  }
}

export async function pushServerPreferences(data: Record<string, unknown>): Promise<number> {
  if (typeof window === 'undefined') return 0
  try {
    const res = await fetch(USER_PREFS_API, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, prefsAuthHeaders()),
      body: JSON.stringify({ data }),
      cache: 'no-store',
    })
    if (!res.ok) return 0
    const json = await res.json().catch(function () { return null })
    return Number(json && json.updatedAt) || 0
  } catch {
    return 0
  }
}
