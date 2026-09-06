// 线上《永历中兴》列出全部角色：name / title(徽章) / rolePosition(定位) / job / 是否历史人物可查
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1200, height: 800 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 60)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(10000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)

  const res = await page.evaluate(async () => {
    const t = localStorage.getItem('token') || ''
    const r = await fetch('/tuzhong-wenshu/api/settings?novelId=' + '40249ecb-3bf6-434c-ad94-15dfeabc88ea', {
      headers: { Authorization: 'Bearer ' + t },
    })
    const j = await r.json().catch(() => ({}))
    const c = (j.data || {}).characters || {}
    const rows = []
    const add = (tag, x) => { if (x && x.name) rows.push({ tag, name: String(x.name), title: String(x.title || ''), pos: String(x.rolePosition || x.role || ''), job: String(x.job || '') }) }
    add('主角', c.protagonist); add('女主', c.femaleLead); add('女主2', c.femaleLead2)
    ;(c.femaleLeads || []).forEach(x => add('女主', x))
    ;(c.antagonist && !Array.isArray(c.antagonist) ? [c.antagonist] : c.antagonist || []).forEach(x => add('反派', x))
    ;(c.antagonists || []).forEach(x => add('反派', x))
    ;(c.supporting || []).forEach(x => add('配角', x))
    return rows
  })
  console.log(JSON.stringify(res, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })