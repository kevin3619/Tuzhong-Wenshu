// 交互式登录：打开可见Edge窗口让用户本人输入密码，脚本检测登录后进入草稿箱定位《永历中兴》
const { chromium } = require('playwright-core')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const fs = require('fs')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--no-sandbox'], viewport: null })
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()
  const logs = []
  page.on('console', m => logs.push(m.text().slice(0, 300)))
  page.on('pageerror', e => logs.push('PAGEERR: ' + e.message))

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('GOTO_ERR', e.message))
  await page.waitForTimeout(2500)
  // 切到账号密码登录
  const toggles = page.locator('button:has-text("账号密码登录")')
  const tc = await toggles.count().catch(() => 0)
  if (tc > 0) { await toggles.first().click(); await page.waitForTimeout(800) }
  // 填用户名（用户本人在此窗口输密码并点登录）
  await page.fill('input[placeholder*="用户名"]', 'kevin').catch(e => console.log('FILLU', e.message))
  console.log('[交互] 请在打开的 Edge 窗口输入 kevin 账号的密码并点击 登录。等待登录……')

  // 轮询等待登录成功（localStorage 出现 token 或 URL 变化），最长 180 秒
  let loggedIn = false
  const t0 = Date.now()
  while (Date.now() - t0 < 180000) {
    const hasToken = await page.evaluate(() => {
      const t = localStorage.getItem('token') || localStorage.getItem('access_token') || document.cookie
      return !!(t && (t.indexOf('token') >= 0 || t.indexOf('eyJ') >= 0 || t.length > 10))
    }).catch(() => false)
    const url = page.url()
    if (hasToken || (!url.includes('/login'))) { loggedIn = true; break }
    await page.waitForTimeout(1500)
  }
  console.log('LOGGED_IN=', loggedIn, 'URL=', page.url())
  if (!loggedIn) {
    console.log('TIMEOUT no login. BODY=', (await page.evaluate(() => document.body.innerText.slice(0, 1500)).catch(() => 'ERR')))
    await page.screenshot({ path: 'shot_login.png', fullPage: true }).catch(() => {})
    await browser.close(); return
  }
  console.log('LOGIN_TOKEN=', (await page.evaluate(() => (localStorage.getItem('token') || 'cook').slice(0, 20)).catch(() => '?')))
  await page.waitForTimeout(1500)

  // 回到工作台
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('GOTO2', e.message))
  await page.waitForTimeout(3000)
  // 点击草稿箱
  let clicked = 0
  const draftBtn = page.locator('button:has-text("草稿箱")')
  const drc = await draftBtn.count().catch(() => 0)
  if (drc > 0) { await draftBtn.first().click(); clicked = 1; await page.waitForTimeout(2500) }
  console.log('DRAFT_CLICKED=', clicked, 'URL=', page.url())
  const body = await page.evaluate(() => document.body.innerText.slice(0, 5000)).catch(e => 'ERR' + e.message)
  console.log('===== DRAFT BODY =====')
  console.log(body)
  const yongli = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'))
    return els.filter(e => e.children.length === 0 && /永历/.test(e.textContent || ''))
      .map(e => ({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 40), txt: (e.textContent || '').trim().slice(0, 30) })).slice(0, 20)
  }).catch(() => 'ERR')
  console.log('===== 永历 mentions =====')
  console.log(JSON.stringify(yongli, null, 1))
  console.log('===== LINKS =====')
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(h => h && h !== '#').slice(0, 60)).catch(() => 'ERR')
  console.log(JSON.stringify(links, null, 1))
  console.log('===== CONSOLE tail =====')
  console.log(logs.slice(-12).join('\n'))
  await page.screenshot({ path: 'shot_draft.png', fullPage: true }).catch(() => {})
  await browser.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })