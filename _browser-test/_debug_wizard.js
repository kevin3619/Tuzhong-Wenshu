const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 900 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 60)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  const url = `${BASE}/write/${NID}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(6000)
  console.log('URL now: ' + page.url())
  const info = await page.evaluate(() => {
    const token = localStorage.getItem('token')
    return {
      hasToken: !!token,
      title: document.title,
      bodyHead: (document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 400),
      hasWizard: !!document.querySelector('.wenshu-step-nav'),
      bodyTextLen: (document.body.textContent || '').length,
    }
  })
  console.log(JSON.stringify(info, null, 1))
  await page.screenshot({ path: path.join(__dirname, '_wizard_state.png') })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })