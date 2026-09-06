// 禁用缓存刷新后，强上主要人物设定，转储所有 select 的 option 数量与标签样本
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 1000 },
  })
  await ctx.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' })
  let page = null
  for (const p of ctx.pages()) { const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 50)).catch(()=>''); if (t.trim()) { page = p; break } }
  if (!page) page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(20000)
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
  await page.evaluate(() => { try { window.location.reload() } catch(e){} })
  await page.waitForTimeout(1500)

  // 进入草稿→继续生成→到人物环节
  async function intoWizard() {
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
    const dcard = page.locator('text=永历中兴').first()
    if (await dcard.count()) {
      const card = dcard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(()=>{}) }
      for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); if (await page.evaluate(() => (document.body.textContent||'').includes('主要人物设定')).catch(()=>false)) break }
    }
  }
  await intoWizard()

  // 点击主要人物设定节点
  const charBtns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('主要人物设定')).length
  })
  console.log('char_btn_count=', charBtns)
  const cb = page.locator('button').filter({ hasText: '主要人物设定' }).first()
  if (await cb.count()) { await cb.click({ timeout: 8000 }).catch(e=>console.log('click_err', e.message.split('\n')[0])) }
  await page.waitForTimeout(3500)

  // 判断当前所在步骤标题
  const h2 = await page.evaluate(() => {
    const hs = Array.from(document.querySelectorAll('h1,h2,h3')).map(h => (h.textContent||'').trim()).filter(Boolean)
    return hs.slice(0, 12)
  })
  console.log('HEADINGS=', JSON.stringify(h2))

  // 转储 select 及其 option
  const dump = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('select').forEach((sel, i) => {
      const opts = Array.from(sel.querySelectorAll('option')).map(o => (o.textContent||'').trim())
      out.push({ i, value: sel.value, optCount: opts.length, sample: opts.slice(0, 8) })
    })
    // 附近是否有"角色定位"标签文本
    const hasRoleLabel = document.body.textContent.includes('角色定位')
    return { selects: out, hasRoleLabel, totalSelects: document.querySelectorAll('select').length }
  })
  console.log('HAS_ROLE_LABEL=', dump.hasRoleLabel, ' totalSelects=', dump.totalSelects)
  dump.selects.forEach(s => { console.log('  select[' + s.i + '] value=' + s.value + ' optCount=' + s.optCount + ' sample=' + JSON.stringify(s.sample)) })
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })