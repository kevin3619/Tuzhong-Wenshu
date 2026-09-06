// 精确抓取线上角色页各角色卡片显示文本，验证性格字段已替换
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

  const inChars = await page.evaluate(() => (document.body.textContent || '').includes('主要人物设定')).catch(() => false)
  if (!inChars) {
    const nav = page.locator('button:has-text("主要人物设定")').first()
    if (await nav.count()) { await nav.click(); await page.waitForTimeout(2500) }
  }
  await page.waitForTimeout(1500)

  // 展开所有角色卡片（点击"展开"/角色名所在卡片）
  const expandBtns = page.locator('button:has-text("展开"), button:has-text("查看详情"), button:has-text("收起")')
  const ebCount = await expandBtns.count()
  for (let i = 0; i < Math.min(ebCount, 15); i++) {
    await expandBtns.nth(i).click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(300)
  }

  const dump = await page.evaluate(() => {
    const out = {}
    const names = ['朱由榔', '朱由崧', '朱聿键', '朱聿鐭', '郑成功', '李定国', '多铎', '多尔衮', '赵虎']
    const bodyText = document.body.textContent || ''
    for (const n of names) {
      const idx = bodyText.indexOf(n)
      if (idx >= 0) {
        out[n] = bodyText.slice(idx, idx + 260).replace(/\s+/g, ' ')
      } else {
        out[n] = '(页面未找到)'
      }
    }
    // 模板串整体检测
    const marks = ['性格鲜明', '为人处世有其独特原则', '多面性的性格', '有独立思想', '神秘人物', '独特原则']
    out._tplRemain = []
    for (const m of marks) {
      let idx = bodyText.indexOf(m)
      while (idx >= 0) {
        out._tplRemain.push(bodyText.slice(Math.max(0, idx - 20), idx + m.length + 20).replace(/\s+/g, ' '))
        idx = bodyText.indexOf(m, idx + m.length)
      }
    }
    return out
  }).catch(e => 'ERR:' + e.message)

  console.log(JSON.stringify(dump, null, 1))
  await page.screenshot({ path: path.join(__dirname, 'probe_ui_chars2.png'), fullPage: false }).catch(() => {})
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
