// 线上《永历中兴》characters 完整结构探查：确认是否存在徽章/定位字段
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
    const show = (tag, x) => {
      if (!x) return null
      const o = { tag, name: x.name || '' }
      // 列出所有 key 及值类型
      o.keys = Object.keys(x)
      // 检查常见徽章/定位候选字段
      for (const k of ['badge','emblem','emblemText','mark','tag','roleLabel','position','rolePosition','positioning','positionLabel','label','characterTag','roleBadge','徽章','定位']) {
        if (k in x) o['FIELD_'+k] = String(x[k]).slice(0, 40)
      }
      o.role = String(x.role || '')
      o.identity = String(x.identity || '').slice(0, 30)
      o.job = String(x.job || '').slice(0, 30)
      return o
    }
    const out = { topKeys: Object.keys(c) }
    out.protagonist = show('主角', c.protagonist)
    out.femaleLead = show('女主', c.femaleLead)
    out.antagonists = (c.antagonists||[]).slice(0, 3).map(x => show('反派', x))
    out.supporting = (c.supporting||[]).slice(0, 3).map(x => show('配角', x))
    return out
  })
  console.log(JSON.stringify(res, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })