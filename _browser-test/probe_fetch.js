// 纯页面内 fetch /api/settings（不进向导），打印 status 与结构
const { chromium } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const OUT = path.join(__dirname, 'yongli_settings.json')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  // 监听同源 fetch，确认
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  const res = await page.evaluate(async (nid) => {
    try {
      const r = await fetch('/tuzhong-wenshu/api/settings?novelId=' + nid, { credentials: 'same-origin' })
      const text = await r.text()
      let j = null; try { j = JSON.parse(text) } catch (e) {}
      return { status: r.status, url: r.url, bodyPreview: j ? Object.keys(j) : text.slice(0, 200) }
    } catch (e) { return { err: e.message } }
  }, NID)
  console.log(JSON.stringify(res, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })