'use client'

import { useEffect } from 'react'
import {
  applyPreferencesToLocalStorage,
  fetchServerPreferences,
  getLocalPrefsUpdatedAt,
} from '@/lib/user-preferences-client'

// 进入主应用时把账号级写作偏好同步到本机 localStorage，
// 保证写作页 / AI生成向导在任意浏览器、任意设备登录后都能读到同一套偏好。
export default function UserPreferencesSync() {
  useEffect(function () {
    let cancelled = false
    fetchServerPreferences().then(function (res) {
      if (cancelled || !res || !res.data) return
      const localTs = getLocalPrefsUpdatedAt()
      if (res.updatedAt >= localTs) {
        applyPreferencesToLocalStorage(res.data, res.updatedAt)
      }
    })
    return function () { cancelled = true }
  }, [])

  return null
}
