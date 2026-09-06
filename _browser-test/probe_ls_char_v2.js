// 打开草稿后检查 localStorage 中 characters 的 personality 字段 + 卷配置区域
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

  const log = []
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
  log.push({ tag: 'in_wizard', inWizard })

  // ===== 1. localStorage 角色数据检查 =====
  const ls = await page.evaluate(() => {
    const out = { keys: [], charKeys: [], characters: [], volumeKeys: [], volumeConfig: null }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      out.keys.push(k)
      if (/draft/i.test(k)) out.charKeys.push(k)
    }
    // 找包含 characters 的 key
    for (const k of out.charKeys) {
      try {
        const raw = localStorage.getItem(k)
        const j = JSON.parse(raw)
        if (j && (j.characters || j.data)) {
          const chars = (j.characters && j.characters.characters) || (j.data && j.data.characters) || []
          const arr = Array.isArray(chars) ? chars : (chars && chars.characters) || []
          if (Array.isArray(arr)) {
            arr.forEach(c => {
              out.characters.push({
                name: c.name || c.charName || '?',
                role: c.role || c.roleType || '',
                personality: String(c.personality || '').slice(0, 60),
              })
            })
          }
        }
      } catch (e) {}
    }
    // 卷配置
    for (const k of out.keys) {
      if (/volume|chapter/i.test(k)) {
        try {
          const j = JSON.parse(localStorage.getItem(k))
          out.volumeKeys.push(k + ' => ' + JSON.stringify(j).slice(0, 120))
        } catch (e) { out.volumeKeys.push(k + ' => RAW') }
      }
    }
    return out
  }).catch(e => 'ERR:' + e.message)
  log.push({ tag: 'localStorage', ls })

  // ===== 2. 当前页面当前步骤标题 =====
  const head = await page.evaluate(() => {
    const h = document.querySelector('h1,h2,h3') 
    const nav = Array.from(document.querySelectorAll('button,span,div')).filter(d => /主要人物设定|分卷章节划分|势力设定/.test(d.textContent || '') && (d.textContent || '').length < 20).map(d => d.textContent.trim()).slice(0, 10)
    return { h1: h ? h.textContent.slice(0, 40) : '', nav: [...new Set(nav)] }
  }).catch(e => 'ERR:' + e.message)
  log.push({ tag: 'current_page', head })

  console.log(JSON.stringify(log, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
