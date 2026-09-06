// 探测生产：《永历中兴》novelId + 登录态 + 当前settings数据规模
const { chromium } = require('playwright-core')
const path = require('path')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 950 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(e => console.log('GOTO_ERR', e.message))
  await page.waitForTimeout(3500)
  // 探测登录态：调用一个需要登录的API
  const me = await page.evaluate(async () => {
    const r = await fetch('/tuzhong-wenshu/api/auth/me').catch(() => null)
    if (!r) return { auth: 'noapi' }
    const j = await r.json().catch(() => ({ raw: r.status }))
    return { status: r.status, body: j }
  }).catch(e => ({ auth: 'eval_err:' + e.message }))
  console.log('AUTH_ME=', JSON.stringify(me))
  // 从 localStorage 探测用户与 token
  const ls = await page.evaluate(() => {
    const out = {}
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/token|user|auth|login/i.test(k)) out[k] = String(localStorage.getItem(k)).slice(0, 80) }
    return out
  }).catch(e => ({ err: e.message }))
  console.log('LS_AUTH_KEYS=', JSON.stringify(ls))
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })