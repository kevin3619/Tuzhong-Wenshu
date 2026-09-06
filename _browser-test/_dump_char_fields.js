// 线上《永历中兴》全部角色：抓取 出生地/籍贯 + 弧光节点，定位失配与重复
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

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
    const d = j.data || {}
    const c = d.characters || {}
    const all = []
    const push = (role, x) => { if (x) all.push({ role: role, name: x.name || '', birthplace: (x.birthplace || '').slice(0, 60), arcCount: Array.isArray(x.arcNodes) ? x.arcNodes.length : 0, arcStages: (Array.isArray(x.arcNodes) ? x.arcNodes : []).map(n => (n.stage || n.event || '').slice(0, 25)).join(' | ') }) }
    const pushArr = (role, arr) => (arr || []).forEach(x => push(role, x))
    push('protagonist', c.protagonist)
    push('femaleLead', c.femaleLead)
    pushArr('femaleLeads', c.femaleLeads)
    push('antagonist', c.antagonist)
    pushArr('antagonists', c.antagonists)
    pushArr('supporting', c.supporting)
    return { count: all.length, list: all }
  })
  console.log(JSON.stringify(res, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })