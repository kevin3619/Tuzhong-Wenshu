// 进入人物步骤后，枚举所有已加载 script，检索新旧角色定位标记
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NEW_M = '大反派/终极Boss'
const OLD_M = '忠臣武将'
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 1000 },
  })
  let page = null
  for (const p of ctx.pages()) { const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 50)).catch(()=>''); if (t.trim()) { page = p; break } }
  if (!page) page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(20000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(2500)
  async function intoWizard() {
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2000) }
    const dcard = page.locator('text=永历中兴').first()
    if (await dcard.count()) {
      const card = dcard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(()=>{}) }
      for (let i = 0; i < 25; i++) { await page.waitForTimeout(900); if (await page.evaluate(() => (document.body.textContent||'').includes('主要人物设定')).catch(()=>false)) break }
    }
  }
  await intoWizard()
  // 到人物步骤
  const cb = page.locator('button').filter({ hasText: '主要人物设定' }).first()
  if (await cb.count()) { await cb.click({ timeout: 8000 }).catch(()=>{}) }
  await page.waitForTimeout(3000)

  const srcs = await page.evaluate(() => Array.from(document.querySelectorAll('script[src]')).map(s => s.src))
  console.log('LOADED_SCRIPTS=', srcs.length)
  const perf = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('/_next/static/')))
  console.log('PERF_STATIC=', perf.length)

  let newHits = [], oldHits = []
  for (const u of [...new Set([...srcs, ...perf])]) {
    if (!u.includes('/_next/static/chunks/')) continue
    let t = ''
    try { const r = await page.context().request.get(u); t = await r.text() } catch(e){ continue }
    if (t.includes(NEW_M)) newHits.push(u.split('/').pop())
    if (t.includes(OLD_M)) oldHits.push(u.split('/').pop())
  }
  console.log('NEW_HITS=', JSON.stringify(newHits))
  console.log('OLD_HITS=', JSON.stringify(oldHits))
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })