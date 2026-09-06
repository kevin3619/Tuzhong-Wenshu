// 线上：点击继续生成后，检查 localStorage 是否被写入 + /api/settings 响应
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1200 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)

  let settingsResp = null
  page.on('response', async r => {
    if (r.url().includes('/api/settings')) {
      settingsResp = { status: r.status(), body: (await r.text().catch(()=>'')).slice(0,300) }
    }
  })

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(3000)

  await page.getByText('草稿箱', { exact: true }).first().click({ timeout: 8000 }).catch(()=>{})
  await page.waitForTimeout(1500)
  await page.getByText('继续生成', { exact: true }).first().click({ timeout: 8000 }).catch(()=>{})
  await page.waitForTimeout(6000)

  const state = await page.evaluate(() => ({
    activeId: localStorage.getItem('tuzhong-active-novel-id'),
    currentStep: localStorage.getItem('tuzhong-current-step'),
    genLen: (localStorage.getItem('tuzhong-generated-data')||'').length,
  }))
  console.log('LS=', JSON.stringify(state))
  console.log('SETTINGS_RESP=', JSON.stringify(settingsResp))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })