// 二次验证：localStorage 修复后，重新打开草稿看 UI 是否显示具体性格
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(10000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  let inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
  if (!inWizard) {
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
    const dcard = page.locator('text=永历中兴').first()
    if (await dcard.count()) {
      const card = dcard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(() => {}) }
      for (let i = 0; i < 25; i++) {
        await page.waitForTimeout(1000)
        inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
        if (inWizard) break
      }
    }
  }
  await page.waitForTimeout(2000)
  // 导航到主要人物设定
  let navBtns = page.locator('.wenshu-step-nav button, button:has-text("主要人物设定")')
  const nbCount = await navBtns.count()
  for (let i = 0; i < nbCount; i++) {
    const txt = await navBtns.nth(i).textContent().catch(() => '')
    if (txt && txt.includes('主要人物设定')) { await navBtns.nth(i).click({ timeout: 5000 }).catch(() => {}); break }
  }
  await page.waitForTimeout(2500)
  const dump = await page.evaluate(() => {
    const bodyText = document.body.textContent || ''
    const marks = ['性格鲜明', '为人处世有其独特原则', '多面性的性格']
    const remain = []
    for (const m of marks) {
      let idx = bodyText.indexOf(m)
      while (idx >= 0 && remain.length < 15) {
        remain.push(bodyText.slice(Math.max(0, idx - 15), idx + m.length + 15).replace(/\s+/g, ' '))
        idx = bodyText.indexOf(m, idx + m.length)
      }
    }
    return { remain }
  }).catch((e) => 'ERR:' + e.message)
  console.log(JSON.stringify(dump, null, 1))
  await page.screenshot({ path: path.join(__dirname, 'verify_tpl_fixed.png'), fullPage: false }).catch(() => {})
  await ctx.close()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })