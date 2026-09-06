// 打印向导触发的所有 /api 请求完整URL（实际路径+query）
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  const urls = []
  page.on('response', (r) => {
    if (/\/api\//.test(r.url())) urls.push(r.status() + ' ' + r.request().method() + ' ' + r.url())
  })
  page.on('request', (r) => {
    if (/\/api\/(settings|novels)/.test(r.url())) console.log('REQ ' + r.method() + ' ' + r.url())
  })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2000) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(3000) }
  await page.waitForTimeout(5000)
  console.log('===== ALL /api RESPONSES =====')
  urls.forEach(u => console.log(u))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })