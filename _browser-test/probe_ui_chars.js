// 打开草稿后抓取「主要人物设定」页面上反派/配角卡片的性格文本，验证 UI 是否仍显示模板占位串
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

  // 若不在「主要人物设定」步骤，尝试点击步骤导航
  const inChars = await page.evaluate(() => (document.body.textContent || '').includes('主要人物设定')).catch(() => false)
  if (!inChars) {
    const nav = page.locator('button:has-text("主要人物设定")').first()
    if (await nav.count()) { await nav.click(); await page.waitForTimeout(2500) }
  }
  await page.waitForTimeout(1500)

  const dump = await page.evaluate(() => {
    const marks = ['性格鲜明', '性格开朗', '性格稳重', '性格复杂', '有独立思想', '为人处世有其独特原则', '独特原则', '独特的原则', '多面性的性格', '在故事中展现', '重要角色', '关键角色', '神秘人物', '形象独特', '不可或缺的重要角色', '不可或缺']
    const bodyText = document.body.textContent || ''
    const hits = []
    for (const m of marks) {
      let idx = bodyText.indexOf(m)
      let n = 0
      while (idx >= 0 && n < 30) {
        const seg = bodyText.slice(Math.max(0, idx - 25), idx + m.length + 25)
        hits.push({ mark: m, ctx: seg.replace(/\s+/g, ' ') })
        idx = bodyText.indexOf(m, idx + m.length)
        n++
      }
    }
    // 统计反派/配角卡片数量
    const cardCount = document.querySelectorAll('[class*="character"], [class*="card"]').length
    return { hits: hits.slice(0, 40), cardCount, hasCharsPage: (document.body.textContent || '').includes('主要人物设定') }
  }).catch(e => 'ERR:' + e.message)

  console.log(JSON.stringify(dump, null, 1))
  await page.screenshot({ path: path.join(__dirname, 'probe_ui_chars.png'), fullPage: false }).catch(() => {})
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
