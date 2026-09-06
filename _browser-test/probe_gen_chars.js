// 打开草稿后读取 tuzhong-generated-data 的 characters 里各角色 personality（验证 normalize 是否生效）
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

  const dump = await page.evaluate(() => {
    const out = { generated: null, tplHits: [] }
    try {
      const g = JSON.parse(localStorage.getItem('tuzhong-generated-data'))
      const c = g.characters || {}
      const collect = (arr, tag) => {
        if (!Array.isArray(arr)) return
        arr.forEach((x) => {
          if (x && x.name) {
            const p = String(x.personality || '')
            out[tag + '_' + x.name] = { personality: p.slice(0, 60), role: x.role || '' }
          }
        })
      }
      if (c.protagonist) out.protagonist = { personality: String(c.protagonist.personality || '').slice(0, 60) }
      if (c.femaleLead) out.femaleLead = { personality: String(c.femaleLead.personality || '').slice(0, 60) }
      collect(c.antagonists, 'antagonist')
      collect(c.supporting, 'supporting')
      // 模板串检测
      const marks = ['性格鲜明', '为人处世有其独特原则', '多面性的性格', '有独立思想', '神秘人物']
      const all = [c.protagonist, c.femaleLead].concat(c.antagonists || [], c.supporting || [])
      all.forEach((x) => {
        if (!x) return
        const p = String(x.personality || '')
        for (const m of marks) {
          if (p.indexOf(m) >= 0) out.tplHits.push({ name: x.name, mark: m, personality: p.slice(0, 50) })
        }
      })
      out.totalChars = all.length
    } catch (e) { out.err = e.message }
    return out
  }).catch(e => 'ERR:' + e.message)

  console.log(JSON.stringify(dump, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
