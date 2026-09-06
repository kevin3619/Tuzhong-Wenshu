// 线上《永历中兴》角色完整字段：查看各角色 full arcNodes、identity、其他深度/进阶字段结构
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

  const res = await page.evaluate(async (nid) => {
    const t = localStorage.getItem('token') || ''
    const r = await fetch('/tuzhong-wenshu/api/settings?novelId=' + nid, {
      headers: { Authorization: 'Bearer ' + t },
    })
    const j = await r.json().catch(() => ({}))
    const d = j.data || {}
    const c = d.characters || {}
    const collect = (x) => {
      if (!x) return null
      return {
        name: x.name || '',
        role: x.role || '',
        identity: String(x.identity || '').slice(0, 40),
        personality: String(x.personality || '').slice(0, 40),
        attributes: x.attributes || null,
        advanced: x.advanced || null,
        deepSetting: x.deepSetting || null,
        arcNodes: Array.isArray(x.arcNodes) ? x.arcNodes.map(n => ({
          stage: (n.stage || '').slice(0, 12),
          event: (n.event || '').slice(0, 24),
          change: (n.change || '').slice(0, 24),
          powerLevel: (n.powerLevel || '').slice(0, 20),
        })) : (Array.isArray(x.arc) ? x.arc : []),
        topKeys: Object.keys(x),
      }
    }
    const out = []
    const push = (role, x) => { const o = collect(x); if (o) out.push({ role, ...o }) }
    push('protagonist', c.protagonist)
    push('femaleLead', c.femaleLead)
    push('antagonist', c.antagonist || c.antagonists && c.antagonists[0])
    for (const a of (c.antagonists || [])) push('antagonists', a)
    for (const s of (c.supporting || [])) push('supporting', s)
    return { count: out.length, list: out }
  }, NID)
  const fs = require('fs')
  fs.writeFileSync(path.join(__dirname, '_arcs_full_dump.json'), JSON.stringify(res, null, 1))
  console.log('DUMP_SAVED count=' + res.count)
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })