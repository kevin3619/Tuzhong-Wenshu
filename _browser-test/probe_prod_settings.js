// 查询线上 settings API 确认 chapters 字段状态
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(20000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  const result = await page.evaluate(async (nid) => {
    const out = { ok: false, status: 0, err: '', chaptersInfo: null, topKeys: null }
    try {
      const token = localStorage.getItem('token') || ''
      const res = await fetch('/tuzhong-wenshu/api/settings?novelId=' + nid, {
        headers: token ? { 'Authorization': 'Bearer ' + token } : {},
      })
      out.status = res.status
      const j = await res.json()
      out.ok = res.ok
      const d = j.data || {}
      out.topKeys = Object.keys(d)
      const ch = d.chapters
      out.chaptersInfo = {
        type: ch === null ? 'null' : typeof ch,
        isArray: Array.isArray(ch),
        volumes: ch && Array.isArray(ch.volumes) ? ch.volumes.length : (ch && ch.volumes !== undefined ? String(ch.volumes).slice(0, 30) : String(ch)),
        chapters: ch && Array.isArray(ch.chapters) ? ch.chapters.length : 'NA',
        keys: ch && typeof ch === 'object' && ch !== null ? Object.keys(ch).slice(0, 10) : null,
      }
      // keyPlots 状态
      const kp = d.keyPlots
      out.kpInfo = {
        type: kp === null ? 'null' : typeof kp,
        kpCount: kp && Array.isArray(kp.keyPlots) ? kp.keyPlots.length : 'NA',
        volCount: kp && Array.isArray(kp.volumes) ? kp.volumes.length : 'NA',
      }
      out.lastStep = d.lastStep
    } catch (e) { out.err = e.message }
    return out
  }, NID)
  console.log(JSON.stringify(result, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
