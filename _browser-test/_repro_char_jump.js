// 复现：金手指设定 → 主要人物设定 跳转报错；捕获 console / pageerror / 页面报错文本
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 1000 },
  })
  let page = null
  for (const p of ctx.pages()) { const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 50)).catch(()=>''); if (t.trim()) { page = p; break } }
  if (!page) page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(12000)
  const consoleErr = []
  const pageErr = []
  const reqFail = []
  page.on('console', m => { if (m.type() === 'error') consoleErr.push(String(m.text()).slice(0, 500)) })
  page.on('pageerror', e => pageErr.push(String(e.message).slice(0, 700)))
  page.on('requestfailed', r => reqFail.push((r.url().replace(BASE,'')) + ' :: ' + (r.failure() && r.failure().errorText)))
  page.on('response', r => { if (r.status() >= 500) reqFail.push('HTTP'+r.status()+' ' + r.url().replace(BASE,'')) })

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  let inWizard = await page.evaluate(() => (document.body.textContent||'').includes('主要人物设定')).catch(()=>false)
  if (!inWizard) {
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
    const dcard = page.locator('text=永历中兴').first()
    if (await dcard.count()) {
      const card = dcard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(()=>{}) }
      for (let i = 0; i < 25; i++) { await page.waitForTimeout(1000); inWizard = await page.evaluate(() => (document.body.textContent||'').includes('主要人物设定')).catch(()=>false); if (inWizard) break }
    }
  }
  console.log('in_wizard=', inWizard)

  // 切到 金手指设定（powerSystem）
  const powBtn = page.locator('button').filter({ hasText: '金手指设定' }).first()
  console.log('pow_btn_count=', await powBtn.count())
  if (await powBtn.count()) { await powBtn.click({ timeout: 8000 }).catch(e=>console.log('pow_click_err', e.message.split('\n')[0])); await page.waitForTimeout(3000) }

  consoleErr.length = 0; pageErr.length = 0; reqFail.length = 0
  const cur = await page.evaluate(() => location.href + ' | ' + (document.body.innerText||'').slice(0,80))
  console.log('ON_POWERSTEP body=', cur.replace(/\n/g,' '))

  // 点 顶部导图「主要人物设定」节点
  const charBtns = page.locator('button').filter({ hasText: '主要人物设定' })
  console.log('char_btn_total=', await charBtns.count())
  const topBtn = charBtns.first()
  await topBtn.click({ timeout: 8000 }).catch(e=>console.log('top_click_err', e.message.split('\n')[0]))
  await page.waitForTimeout(3500)
  console.log('AFTER_TOP_NAV consoleErr=', consoleErr.length, 'pageErr=', pageErr.length, 'reqFail=', reqFail.length)

  // 回金手指，再点 底部导航（含 saveSettings）
  const powBtn2 = page.locator('button').filter({ hasText: '金手指设定' }).first()
  await powBtn2.click({ timeout: 8000 }).catch(()=>{})
  await page.waitForTimeout(2500)
  consoleErr.length = 0; pageErr.length = 0; reqFail.length = 0
  const allChar = page.locator('button').filter({ hasText: '主要人物设定' })
  const n2 = await allChar.count()
  console.log('char_btn_total_after_back=', n2)
  if (n2 >= 1) { await allChar.nth(n2 - 1).click({ timeout: 8000 }).catch(e=>console.log('bottom_click_err', e.message.split('\n')[0])); await page.waitForTimeout(3500) }
  console.log('AFTER_BOTTOM_NAV url=', (await page.evaluate(()=>location.pathname)))
  console.log('  consoleErr=', JSON.stringify(consoleErr), 'pageErr=', JSON.stringify(pageErr), 'reqFail=', JSON.stringify(reqFail))
  await page.screenshot({ path: path.join(__dirname, 'repro_char_jump.png'), fullPage: false })
  await ctx.close()
  console.log('DONE')
})().catch(e => { console.error('FATAL', e); process.exit(1) })