const { chromium } = require('playwright-core')
const path = require('path')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto('https://tuzhongwang.xyz/tuzhong-wenshu/', { waitUntil: 'domcontentloaded' }).catch(()=>{})
  await page.waitForTimeout(2200)
  const got = await page.evaluate(() => {
    const gdRaw = localStorage.getItem('tuzhong-generated-data')
    if (!gdRaw) return { noData: true }
    const gd = JSON.parse(gdRaw)
    const idea = gd.idea || {}
    return {
      userKeywords: idea.userKeywords,
      userInput: (idea.userInput||'').slice(0,200),
      keywordArr: Array.isArray(idea.keywords) ? idea.keywords : idea.keywords,
    }
  })
  console.log(JSON.stringify(got, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e) })