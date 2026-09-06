// 全量审计：所有顶层分区（含 factions/worldbuilding/powerSystem/keyPlots/outline/synopsis/idea/cover）的空值
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
    const sections = {}
    const walk = (o, p, out) => {
      if (!o || typeof o !== 'object') return
      if (Array.isArray(o)) { o.forEach((v, i) => walk(v, p + '[' + i + ']', out)); return }
      for (const k of Object.keys(o)) {
        const v = o[k]
        const pp = p + '.' + k
        if (v === null || v === undefined || (typeof v === 'string' && (v.trim() === '' || v.trim() === ','))) {
          if (k !== 'createdAt') out.push(pp + ' = ' + JSON.stringify(v))
        } else if (typeof v === 'object') walk(v, pp, out)
      }
    }
    for (const key of ['characters', 'factions', 'relationships', 'powerSystem', 'worldbuilding', 'keyPlots', 'outline', 'synopsis', 'idea', 'cover', 'worldSettings', 'timelineEvents', 'foreshadowings']) {
      const arr = []
      if (d[key]) walk(d[key], key, arr)
      if (arr.length) sections[key] = { total: arr.length, sample: arr.slice(0, 25) }
    }
    return { status: r.status, sections }
  }, { api: API, nid: NID })
  console.log('STATUS=' + res.status)
  for (const k of Object.keys(res.sections || {})) {
    console.log('### ' + k + ' EMPTY=' + res.sections[k].total)
    res.sections[k].sample.forEach(e => console.log('    ' + e))
  }
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
