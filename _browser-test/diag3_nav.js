// 诊断3: 进入向导→点到输入主题后 .step-nav-scroll 是否仍存在, 按钮数与文本
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
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(1500) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(2000) }
  for (let i = 0; i < 30; i++) {
    const has = await page.evaluate(() => /分卷章节划分/.test(document.body.innerText)).catch(() => false)
    if (has) break; await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(1500)

  const snap = async (label) => {
    const info = await page.evaluate((label) => {
      const nav = document.querySelector('.step-nav-scroll')
      const s = { label }
      s.navExists = !!nav
      s.navClassName = nav ? nav.className : null
      s.btnCount = nav ? nav.querySelectorAll('button').length : -1
      s.btnTexts = nav ? Array.from(nav.querySelectorAll('button')).map(b => (b.textContent || '').trim().replace(/\s+/g,' ')).slice(0,20) : []
      return s
    }, label)
    console.log(JSON.stringify(sinfo2(info)))
  }
  const sinfo2 = (s) => s
  await snap('BOOT')
  // 点输入主题
  const b1 = page.locator('.step-nav-scroll button').filter({ hasText: '输入主题' })
  console.log('boot count 输入主题=', await b1.count().catch(e=>'E'+e.message))
  await b1.first().click({ timeout: 8000 }).catch(e => console.log('click err', e.message.split('\n')[0]))
  await page.waitForTimeout(3000)
  await snap('AFTER_输入主题')
  console.log('post nav btnCount via locator =', await page.locator('.step-nav-scroll button').count().catch(e=>'E'))
  console.log('post filter 灵感创作 =', await page.locator('.step-nav-scroll button').filter({hasText:'灵感创作'}).count().catch(e=>'E'))
  console.log('hasText 主要人物设定 =', await page.locator('.step-nav-scroll button').filter({hasText:'主要人物设定'}).count().catch(e=>'E'))
  console.log('URL=', page.url())
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })