// 最终验证：进入「主要人物设定」步骤，抓取反派(朱由崧/朱聿键/多铎/多尔衮)与配角(郑成功/李定国)卡片的性格文本
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
  page.setDefaultTimeout(12000)
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

  // 通过步骤导航点击「主要人物设定」
  let navBtns = page.locator('.wenshu-step-nav button, button:has-text("主要人物设定")')
  let clicked = false
  const nbCount = await navBtns.count()
  for (let i = 0; i < nbCount; i++) {
    const txt = await navBtns.nth(i).textContent().catch(() => '')
    if (txt && txt.includes('主要人物设定')) {
      await navBtns.nth(i).click({ timeout: 5000 }).catch(() => {})
      clicked = true
      break
    }
  }
  await page.waitForTimeout(2500)
  console.log('clickedCharsNav=', clicked)

  // 展开角色卡片（点击含角色名的卡片容器）
  const names = ['朱由崧', '朱聿键', '朱聿鐭', '多铎', '多尔衮', '郑成功', '李定国']
  // 尝试点击每个角色的卡片头以展开
  for (const n of names) {
    const link = page.locator(`text=${n}`).first()
    if (await link.count()) {
      // 点击该文本，触发卡片展开/收起
      await link.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(400)
    }
  }

  const dump = await page.evaluate(() => {
    const bodyText = document.body.textContent || ''
    const out = { step: '', hasCharsPage: bodyText.includes('主要人物设定'), hasRolesKeyword: bodyText.includes('反派') }
    // 尝试定位当前环节标题
    const titleSel = document.querySelector('h1,h2,h3')
    if (titleSel) out.step = titleSel.textContent.trim().slice(0, 30)
    // 抓取角色名周围上下文（性格字段通常在卡片内）
    const names = ['朱由崧', '朱聿键', '朱聿鐭', '多铎', '多尔衮', '郑成功', '李定国', '孙可望', '马士英']
    out.chars = {}
    for (const n of names) {
      const allIdx = []
      let idx = bodyText.indexOf(n)
      while (idx >= 0) { allIdx.push(idx); idx = bodyText.indexOf(n, idx + n.length) }
      // 找包含该名字的最近表单/卡片区，取该名字之后 200 字
      if (allIdx.length > 0) {
        const i = allIdx[allIdx.length - 1]
        out.chars[n] = bodyText.slice(i, i + 220).replace(/\s+/g, ' ')
      }
    }
    // 模板串检测
    const marks = ['性格鲜明', '为人处世有其独特原则', '多面性的性格', '有独立思想', '神秘人物', '独特原则', '性格开朗', '性格稳重', '性格复杂']
    out._tplRemain = []
    for (const m of marks) {
      let idx = bodyText.indexOf(m)
      while (idx >= 0 && out._tplRemain.length < 30) {
        out._tplRemain.push(bodyText.slice(Math.max(0, idx - 18), idx + m.length + 18).replace(/\s+/g, ' '))
        idx = bodyText.indexOf(m, idx + m.length)
      }
    }
    return out
  }).catch(e => 'ERR:' + e.message)

  console.log(JSON.stringify(dump, null, 1))
  await page.screenshot({ path: path.join(__dirname, 'probe_chars_final.png'), fullPage: false }).catch(() => {})
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })