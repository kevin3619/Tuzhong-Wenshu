// 诊断4: 进入→点输入主题后, 包含步骤名的元素 tag/class, 以及是否存在另一套导航结构
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2000) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(2000) }
  for (let i = 0; i < 30; i++) {
    const n = await page.locator('button:has-text("灵感创作")').count().catch(() => 0)
    if (n > 0) break; await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(1500)
  console.log('BOOT button总数=', await page.locator('button').count())
  console.log('BOOT .step-nav-scroll button数=', await page.locator('.step-nav-scroll button').count().catch(e=>'E'))
  const b1 = page.locator('button').filter({ hasText: '输入主题' })
  await b1.first().click({ timeout: 8000 }).catch(e => console.log('click1 err', e.message.split('\n')[0]))
  await page.waitForTimeout(4000)
  console.log('---AFTER 输入主题---')
  console.log('URL=', page.url())
  console.log('button总数=', await page.locator('button').count())
  console.log('.step-nav-scroll存在=', await page.locator('.step-nav-scroll').count())
  console.log('.step-nav-scroll button数=', await page.locator('.step-nav-scroll button').count().catch(e=>'E'))
  const probe = await page.evaluate(() => {
    const names = ['世界观设定','灵感创作','主要人物设定','分卷章节划分']
    const res = {}
    for (const n of names) {
      const hits = Array.from(document.querySelectorAll('*')).filter(e => (e.textContent || '').trim() === n)
      res[n] = hits.map(h => h.tagName + '.' + String(h.className).split(' ')[0]).slice(0, 5)
    }
    return res
  })
  console.log('精确文本元素:', JSON.stringify(probe, null, 1))
  const hasIframe = await page.evaluate(() => document.querySelectorAll('iframe').length)
  console.log('iframe数=', hasIframe)
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })