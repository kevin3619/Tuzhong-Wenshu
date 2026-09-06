// 通过线上 settings API 核查草稿 40249ecb 是否返回 characters（判断服务器是否有草稿数据）
// 需登录 token：从浏览器 localStorage 获取后调 API
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
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(10000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)

  const token = await page.evaluate(() => localStorage.getItem('token') || '').catch(() => '')
  // 用 fetch 在页面上下文中调同源 API
  const res = await page.evaluate(async (tk) => {
    const r = await fetch('/tuzhong-wenshu/api/settings?novelId=40249ecb-3bf6-434c-ad94-15dfeabc88ea', {
      headers: tk ? { Authorization: 'Bearer ' + tk } : {},
    })
    const j = await r.json().catch(() => ({}))
    const d = j.data || {}
    const c = d.characters
    const out = { status: r.status, success: j.success, hasData: !!d, topKeys: Object.keys(d).slice(0, 15) }
    if (c) {
      out.hasChars = true
      out.charKeys = Object.keys(c).slice(0, 10)
      const names = ['朱由崧', '郑成功', '李定国']
      out.names = {}
      const scan = (tag, x) => { if (x && x.name && names.includes(x.name)) out.names[x.name] = { tag, role: x.role || '', personality: String(x.personality || '').slice(0, 40) } }
      if (c.protagonist) scan('主角', c.protagonist)
      if (c.femaleLead) scan('女主', c.femaleLead)
      ;(c.antagonists || []).forEach((x) => scan('反派', x))
      ;(c.supporting || []).forEach((x) => scan('配角', x))
    } else {
      out.hasChars = false
    }
    return out
  }, token)
  console.log(JSON.stringify(res, null, 1))
  await ctx.close()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })