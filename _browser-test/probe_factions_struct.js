// 打印服务器与 localStorage 中 factions 的完整结构
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 60)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(10000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const result = await page.evaluate(async (nid) => {
    const out = { server: null, ls: null }
    try {
      const token = localStorage.getItem('token') || ''
      const r = await fetch('/tuzhong-wenshu/api/settings?novelId=' + nid, { headers: { 'Authorization': 'Bearer ' + token } })
      const j = await r.json()
      const d = j.data || {}
      const f = d.factions
      out.server = {
        isArray: Array.isArray(f),
        type: f === null ? 'null' : typeof f,
        keys: f && typeof f === 'object' ? Object.keys(f) : null,
        sample: JSON.stringify(f).slice(0, 600),
      }
    } catch (e) { out.server = 'ERR:' + e.message }
    try {
      const activeId = localStorage.getItem('tuzhong-active-novel-id') || ''
      const raw = localStorage.getItem('tuzhong-draft-data-' + activeId)
      if (raw) {
        const d = JSON.parse(raw)
        const f = d.factions
        out.ls = {
          isArray: Array.isArray(f),
          type: f === null ? 'null' : typeof f,
          keys: f && typeof f === 'object' ? Object.keys(f) : null,
          sample: JSON.stringify(f).slice(0, 600),
        }
      } else { out.ls = 'NO_LS_DRAFT' }
    } catch (e) { out.ls = 'ERR:' + e.message }
    return out
  }, NID)
  console.log(JSON.stringify(result, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
