// 生产：解码 token exp + 直接用 token 调生产 /api/settings 确认 novelId 与数据
const { chromium } = require('playwright-core')
const path = require('path')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 950 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const res = await page.evaluate(async (b) => {
    const token = localStorage.getItem('token')
    const dec = (t) => { try { const p = t.split('.')[1]; const s = atob(p.replace(/-/g,'+').replace(/_/g,'/')); return JSON.parse(decodeURIComponent(escape(s))) } catch (e) { return { err: e.message } } }
    const payload = token ? dec(token) : null
    const out = { hasToken: !!token, payload }
    // 试两个候选 novelId
    for (const nid of ['40249ecb-3bf6-434c-ad94-15dfeabc88ea', 'd2010e15-03a4-4197-aca5-f572af6e9d94']) {
      const r = await fetch('/tuzhong-wenshu/api/settings?novelId=' + nid, { headers: { Authorization: 'Bearer ' + (token || '') } }).catch(e => ({ err: e.message }))
      if (r.err) { out[nid] = { err: r.err }; continue }
      const j = await r.json().catch(() => null)
      const d = (j && (j.data || j)) || {}
      const idea = d.idea || {}
      out[nid] = {
        status: r.status,
        title: idea.title || idea.name || idea.theme || '',
        topKeys: Object.keys(d).slice(0, 15),
        chapters: d.chapters ? (Array.isArray(d.chapters) ? 'arr' : typeof d.chapters) : 'ABSENT',
        volsLen: d.chapters && Array.isArray(d.chapters.volumes) ? d.chapters.volumes.length : (d.volumes && Array.isArray(d.volumes) ? d.volumes.length : -1),
        charsSize: d.characters ? Object.keys(d.characters).length : 0,
      }
    }
    return out
  }, null).catch(e => ({ eval_err: e.message }))
  console.log(JSON.stringify(res, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })