const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(2500)
  const got = await page.evaluate(async () => {
    const out = {}
    const token = localStorage.getItem('token') || ''
    const id = localStorage.getItem('tuzhong-active-novel-id') || ''
    out.tokenLen = token ? token.length : 0
    out.activeId = id
    try {
      const r = await fetch(`${location.origin}/tuzhong-wenshu/api/novels?id=${encodeURIComponent('40249ecb-3bf6-434c-ad94-15dfeabc88ea')}`, { headers: { Authorization: 'Bearer ' + token } })
      out.status = r.status
      const j = await r.json()
      out.data = j
    } catch (e) { out.err = e.message }
    return out
  })
  console.log(JSON.stringify(got, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })