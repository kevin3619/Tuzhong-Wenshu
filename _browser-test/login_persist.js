// 持久化登录：打开可见Edge（用户数据目录）让用户登录一次，token存profile，供后续无头复用
const { chromium } = require('playwright-core')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = require('path').join(__dirname, '..', '_browser-profile')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: false, args: ['--no-sandbox'],
    viewport: { width: 1400, height: 900 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('GOTO_ERR', e.message))
  await page.waitForTimeout(2500)
  // 若已在登录态则直接继续
  const isLogged = await page.evaluate(() => !!(localStorage.getItem('token') || localStorage.getItem('access_token'))).catch(() => false)
  if (!isLogged) {
    const toggles = page.locator('button:has-text("账号密码登录")')
    const tc = await toggles.count().catch(() => 0)
    if (tc > 0) { await toggles.first().click(); await page.waitForTimeout(800) }
    await page.fill('input[placeholder*="用户名"]', 'kevin').catch(() => {})
    console.log('[交互] 请在本窗口输入kevin密码并登录……')
    const t0 = Date.now()
    while (Date.now() - t0 < 180000) {
      const ok = await page.evaluate(() => {
        const t = localStorage.getItem('token') || localStorage.getItem('access_token') || ''
        return t.length > 20
      }).catch(() => false)
      if (ok) break
      await page.waitForTimeout(1500)
    }
  }
  const token = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('access_token') || '').catch(() => '')
  console.log('TOKEN_READY=', token.length > 20)
  console.log('URL=', page.url())
  await page.screenshot({ path: 'persist_logged_in.png', fullPage: false }).catch(() => {})
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })