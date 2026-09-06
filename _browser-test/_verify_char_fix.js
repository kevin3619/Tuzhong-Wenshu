// 验证线上角色修正结果：统计 placeholders 与 arc 去重/字段
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const arcFix = require(path.join(__dirname, '_fix_arcs.json'))

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1200, height: 800 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 60)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) page = ctx.pages()[0]
  page.setDefaultTimeout(10000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  const r = await page.evaluate(async (nid) => {
    const token = localStorage.getItem('token') || ''
    const get = await fetch('/tuzhong-wenshu/api/settings?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } })
    const j = await get.json().catch(() => ({}))
    const chars = (j.data || {}).characters || {}
    const refs = []
    const each = (v) => { if (v && typeof v === 'object' && 'name' in v) refs.push(v) }
    for (const k of Object.keys(chars)) { const v = chars[k]; if (Array.isArray(v)) v.forEach(each); else each(v) }
    const ph = refs.filter(x => /生于前明都城|自幼长于斯地|当地风土人情/.test(x.birthplace || ''))
    const noArc = refs.filter(x => !Array.isArray(x.arcNodes) || x.arcNodes.length !== 5)
    return { total: refs.length, placeholders: ph.map(x => x.name), noArcNames: noArc.map(x => x.name) }
  }, NID)
  const expected = Object.keys(arcFix)
  const missing = expected.filter(n => r.noArcNames.includes(n))
  console.log('total=' + r.total)
  console.log('placeholders=' + JSON.stringify(r.placeholders))
  console.log('noArc(5) names=' + JSON.stringify(r.noArcNames))
  console.log('still-missing-from-arcFix after apply: ' + JSON.stringify(missing))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })