// 干脆利落：进入向导后读取 localStorage 中《永历中兴》完整角色数据，重点看朱由崧/朱聿键等模板角色的 role/personality/detailedDesignInput
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
    const out = { keys: [], target: null }
    out.keys = Object.keys(localStorage)
    // 找《永历中兴》草稿 ID（从 active 定位）
    const activeId = localStorage.getItem('tuzhong-active-novel-id') || ''
    const dataKey = activeId ? 'tuzhong-draft-data-' + activeId : null
    let chars = null
    if (dataKey) {
      try { const d = JSON.parse(localStorage.getItem(dataKey)); chars = d && d.characters; out.dataKey = dataKey } catch (e) { out.dkErr = e.message }
    }
    // 兜底：从 tuzhong-generated-data
    if (!chars) {
      try { const g = JSON.parse(localStorage.getItem('tuzhong-generated-data')); chars = g && g.characters; out.src = 'generated' } catch (e) {}
    }
    if (!chars) { out.noChars = true; return out }
    const names = ['朱由崧', '朱聿键', '朱聿鐭', '郑成功', '李定国']
    out.chars = {}
    const scan = (tag, x) => {
      if (!x || !x.name) return
      if (names.includes(x.name)) {
        out.chars[x.name] = {
          tag, role: x.role || x.position || '', rolePosition: x.rolePosition || '',
          personality: String(x.personality || '').slice(0, 120),
        }
      }
    }
    if (chars.protagonist) scan('主角', chars.protagonist)
    if (chars.femaleLead) scan('女主', chars.femaleLead)
    ;(Array.isArray(chars.antagonists) ? chars.antagonists : []).forEach((x) => scan('反派', x))
    ;(Array.isArray(chars.supporting) ? chars.supporting : []).forEach((x) => scan('配角', x))
    // designInput
    try { const t = JSON.parse(localStorage.getItem('tuzhong-theme-input')); out.detailedDesignInput = (t && t.detailedDesignInput || '').slice(0, 80) } catch (e) {}
    out.activeId = activeId
    return out
  }).catch((e) => 'ERR:' + e.message)
  console.log(JSON.stringify(dump, null, 1))
  await ctx.close()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })