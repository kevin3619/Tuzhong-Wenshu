// 诊断：列出 characters 内所有空值字段的完整路径，供精准修复
const { chromium } = require('playwright-core')
const path = require('path')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const API = '/tuzhong-wenshu/api/settings'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1200, height: 800 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto('https://tuzhongwang.xyz/tuzhong-wenshu', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const res = await page.evaluate(async ({ api, nid }) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } }).catch(e => ({ err: e.message }))
    if (r.err) return { err: r.err }
    const j = await r.json().catch(() => ({ raw: r.status }))
    const d = (j && (j.data || j)) || {}
    const empty = []
    const walk = (o, p) => {
      if (!o || typeof o !== 'object') return
      if (Array.isArray(o)) { o.forEach((v, i) => walk(v, p + '[' + i + ']')); return }
      for (const k of Object.keys(o)) {
        const v = o[k]
        const pp = p + '.' + k
        if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (typeof v === 'string' && v.trim() === ',')) {
          if (k !== 'createdAt') empty.push(pp + ' = ' + JSON.stringify(v))
        } else if (typeof v === 'object') walk(v, pp)
      }
    }
    if (d.characters) walk(d.characters, 'characters')
    return { status: r.status, total: empty.length, empty: empty.slice(0, 200) }
  }, { api: API, nid: NID })
  console.log('STATUS=' + res.status + ' EMPTY_TOTAL=' + res.total)
  res.empty.forEach(e => console.log('  ' + e))
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
