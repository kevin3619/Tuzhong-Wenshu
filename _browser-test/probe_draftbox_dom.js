// 截图当前页面状态 + 草稿箱模态框内容
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    if (t.includes('返回书架') || t.includes('欢迎回来') || t.includes('输入主题')) { page = p; break }
  }
  if (!page) {
    page = ctx.pages()[0] || await ctx.newPage()
    page.setDefaultTimeout(10000)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
  }
  page.setDefaultTimeout(10000)

  // 打开草稿箱
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  console.log('draftBoxBtn=' + await dbtn.count())
  if (await dbtn.count()) {
    await dbtn.click()
    await page.waitForTimeout(2000)
  }
  await page.screenshot({ path: 'state_draftbox.png', fullPage: false })

  // dump 草稿箱 DOM
  const dom = await page.evaluate(() => {
    const modal = Array.from(document.querySelectorAll('div.fixed.inset-0')).map(m => ({
      visible: getComputedStyle(m).display !== 'none',
      text: (m.textContent || '').replace(/\s+/g, ' ').slice(0, 400),
      buttons: Array.from(m.querySelectorAll('button')).map(b => (b.textContent || '').trim().slice(0, 20)),
    }))
    const draftList = Array.from(document.querySelectorAll('li')).map(li => (li.textContent || '').replace(/\s+/g, ' ').slice(0, 120))
    return { modal, draftList }
  }).catch(e => 'ERR:' + e.message)
  console.log('DOM=' + JSON.stringify(dom, null, 1))

  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
