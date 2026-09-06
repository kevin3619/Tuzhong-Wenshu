// 进入《永历中兴》向导并转储 DOM（定位步骤栏/重生成按钮的真实选择器）
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
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 60)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(12000)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  let inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
  if (!inWizard) {
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
    const dcard = page.locator('text=永历中兴').first()
    if (await dcard.count()) {
      const card = dcard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 9000 }).catch(() => {}) } else { await dcard.click({ timeout: 9000 }).catch(() => {}) }
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(1000)
        inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
        if (inWizard) break
      }
    }
  }
  console.log('IN_WIZARD=' + inWizard + ' URL=' + page.url())

  // 转储整个可见文本 + 所有可点击元素
  const dump = await page.evaluate(() => {
    const body = document.body.textContent || ''
    const clicks = []
    document.querySelectorAll('button, [role="button"], [role="tab"], a').forEach((el) => {
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ')
      const cls = (el.className && String(el.className)) || ''
      if (t && t.length < 30) clicks.push({ t, cls: cls.slice(0, 40) })
    })
    return { head: body.replace(/\s+/g, ' ').slice(0, 300), clicks: clicks.slice(0, 120) }
  }).catch(e => 'ERR:' + e.message)

  console.log(JSON.stringify(dump, null, 1))
  await page.screenshot({ path: path.join(__dirname, 'wizard_dump.png') }).catch(() => {})
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })