// 线上：截图向导环节图两行渲染效果
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1400 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(3500)
  await page.getByText('AI全自动生成', { exact: true }).first().click({ timeout: 8000 }).catch(()=>{})
  await page.waitForTimeout(4000)
  const nav = await page.evaluate(() => {
    const el = document.querySelector('.wenshu-step-nav')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  if (nav) {
    await page.screenshot({ clip: { x: Math.max(0, nav.x - 10), y: Math.max(0, nav.y - 10), width: nav.w + 20, height: nav.h + 30 }, path: path.join(__dirname, '_stepnav_two_rows.png') })
  }
  console.log('NAV', JSON.stringify(nav))
  await ctx.close().catch(()=>{})
})().catch(e => { console.error('FATAL', e); process.exit(1) })