// 本地验证：从线上profile拷贝草稿数据 → 注入 localhost:3001 → 打开向导 → 检查势力下拉值
const { chromium } = require('playwright-core')
const path = require('path')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const ONLINE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const LOCAL = 'http://localhost:3001/tuzhong-wenshu'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)

  // 1. 从线上 origin 抓取草稿数据
  await page.goto(ONLINE, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const draftData = await page.evaluate((nid) => {
    return localStorage.getItem('tuzhong-draft-data-' + nid)
  }, NID)
  const draftStep = await page.evaluate((nid) => {
    return localStorage.getItem('tuzhong-draft-step-' + nid)
  }, NID)
  const themeData = await page.evaluate((nid) => {
    return localStorage.getItem('tuzhong-draft-theme-' + nid)
  }, NID)
  const volConfig = await page.evaluate((nid) => {
    return localStorage.getItem('tuzhong-draft-volume-' + nid)
  }, NID)
  const draftIdx = await page.evaluate(() => {
    return localStorage.getItem('tuzhong-drafts-index')
  })
  console.log('draftData len=' + (draftData ? draftData.length : 0) + ' step=' + draftStep + ' idx=' + (draftIdx ? draftIdx.length : 0))

  // 2. 打开本地，注入草稿数据
  await page.goto(LOCAL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)
  const seeded = await page.evaluate(({ dd, ds, th, vc, di, nid }) => {
    if (dd) localStorage.setItem('tuzhong-draft-data-' + nid, dd)
    if (ds) localStorage.setItem('tuzhong-draft-step-' + nid, ds)
    if (th) localStorage.setItem('tuzhong-draft-theme-' + nid, th)
    if (vc) localStorage.setItem('tuzhong-draft-volume-' + nid, vc)
    if (di) localStorage.setItem('tuzhong-drafts-index', di)
    localStorage.setItem('tuzhong-active-novel-id', nid)
    return { ok: true }
  }, { dd: draftData, ds: draftStep, th: themeData, vc: volConfig, di: draftIdx, nid: NID })

  // 3. 打开草稿箱 → 打开《永历中兴》
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
  const draftCard = page.locator('text=永历中兴').first()
  if (await draftCard.count()) {
    const card = draftCard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
    const gen = card.locator('button:has-text("继续生成")').first()
    if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(() => {}) } else { await draftCard.click({ timeout: 8000 }).catch(() => {}) }
  }
  for (let i = 0; i < 25; i++) {
    const h = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
    if (h) break
    await page.waitForTimeout(1000)
  }

  // 4. 点击势力设定，抓取下拉值
  const facBtn = page.locator('button').filter({ hasText: '势力设定' }).first()
  if (await facBtn.count()) { await facBtn.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3000) }
  const result = await page.evaluate(() => {
    const out = { powerRanks: [], strengthTiers: [], emptySelects: 0 }
    document.querySelectorAll('select').forEach(sel => {
      const opts = Array.from(sel.options).map(o => o.value)
      const val = sel.value
      if (String(val).includes('势力') || opts.some(o => String(o).includes('势力'))) {
        out.powerRanks.push(String(val).slice(0, 20))
      }
      if (opts.includes('SSS') || opts.includes('A')) {
        out.strengthTiers.push(String(val).slice(0, 20))
      }
      if (!sel.value) out.emptySelects++
    })
    return out
  }).catch(e => 'ERR:' + e.message)
  console.log('===== 本地势力下拉（修复后） =====')
  console.log(JSON.stringify(result, null, 1))
  await page.screenshot({ path: 'local_faction_fixed.png', fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
