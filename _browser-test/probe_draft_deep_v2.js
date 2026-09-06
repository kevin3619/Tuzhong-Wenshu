// 深度 dump localStorage 的 draft-data 结构
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

  // 进入向导
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

  const dump = await page.evaluate(() => {
    const out = { draftDataKeys: [], struct: {}, generatedData: null }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k.includes('draft-data')) out.draftDataKeys.push(k)
    }
    for (const k of out.draftDataKeys) {
      try {
        const j = JSON.parse(localStorage.getItem(k))
        out.struct[k] = { topKeys: Object.keys(j) }
        if (j.data) out.struct[k].dataKeys = Object.keys(j.data)
        // characters
        const chars = (j.data && (j.data.characters || j.data.character)) || j.characters || j.character
        if (chars) {
          out.struct[k].charType = Array.isArray(chars) ? 'array' : (chars.characters ? 'obj.characters' : 'obj')
          const arr = Array.isArray(chars) ? chars : (chars.characters || [])
          if (Array.isArray(arr)) {
            out.struct[k].charCount = arr.length
            out.struct[k].charSamples = arr.slice(0, 8).map(c => ({ n: c.name || c.charName || '?', p: String(c.personality || '').slice(0, 40), j: String(c.job || '').slice(0, 20), g: String(c.goal || '').slice(0, 20) }))
          }
        }
        // chapters
        const ch = (j.data && j.data.chapters) || j.chapters
        if (ch) {
          out.struct[k].chapters = {
            topKeys: Object.keys(ch),
            volCount: ch.volumes ? ch.volumes.length : null,
            volSample: ch.volumes && ch.volumes[0] ? { title: ch.volumes[0].title || ch.volumes[0].name || '', summary: String(ch.volumes[0].summary || '').slice(0, 30) } : null,
          }
        }
        // factions
        const fac = (j.data && j.data.factions) || j.factions
        if (fac) {
          const arr = fac.factions || (Array.isArray(fac) ? fac : [])
          out.struct[k].facCount = Array.isArray(arr) ? arr.length : null
        }
      } catch (e) { out.struct[k] = 'ERR:' + e.message }
    }
    // generated-data
    try {
      const g = JSON.parse(localStorage.getItem('tuzhong-generated-data'))
      out.generatedData = g ? Object.keys(g) : null
    } catch (e) {}
    return out
  }).catch(e => 'ERR:' + e.message)

  console.log(JSON.stringify(dump, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
