// 线上《永历中兴》characters 存储级核查：验证 job/personality 等关键字段已修复
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

  const res = await page.evaluate(async (tk) => {
    const r = await fetch('/tuzhong-wenshu/api/settings?novelId=' + '40249ecb-3bf6-434c-ad94-15dfeabc88ea', {
      headers: tk ? { Authorization: 'Bearer ' + tk } : {},
    })
    const j = await r.json().catch(() => ({}))
    const d = j.data || {}
    const c = d.characters || {}
    const JOB_TPL = /重要角色|关键角色|本角色|此角色|未设置|待定/
    const scan = (tag, x) => {
      if (!x) return null
      return {
        tag, name: String(x.name || '').slice(0, 12),
        role: String(x.role || '').slice(0, 12),
        job: String(x.job || '').slice(0, 20),
        jobIsTpl: JOB_TPL.test(String(x.job || '')),
        personality: String(x.personality || '').slice(0, 26),
        hiddenTraits: String(x.hiddenTraits || '').slice(0, 20),
        background: String(x.background || '').slice(0, 20),
      }
    }
    const list = []
    if (c.protagonist) list.push(scan('主角', c.protagonist))
    if (c.femaleLead) list.push(scan('女主', c.femaleLead))
    ;(c.antagonists || []).slice(0, 3).forEach(x => list.push(scan('反派', x)))
    ;(c.supporting || []).slice(0, 4).forEach(x => list.push(scan('配角', x)))

    // 统计各字段非空率
    const all = [c.protagonist, c.femaleLead].concat(c.antagonists || [], c.supporting || [], c.femaleLeads || []).filter(Boolean)
    const stat = { total: all.length, jobTpl: 0, nameEmpty: 0, personalityEmpty: 0, backgroundEmpty: 0, haremIsNull: c._harem === null }
    all.forEach(x => {
      if (JOB_TPL.test(String(x.job || ''))) stat.jobTpl++
      if (!String(x.name || '').trim()) stat.nameEmpty++
      if (!String(x.personality || '').trim()) stat.personalityEmpty++
      if (!String(x.background || '').trim()) stat.backgroundEmpty++
    })
    return { status: r.status, list, stat }
  }, null)
  console.log(JSON.stringify(res, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })