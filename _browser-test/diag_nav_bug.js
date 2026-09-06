// 诊断导航按钮的真实状态：disabled? 守卫? 当前步骤?
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.on('dialog', d => d.dismiss().catch(() => {}))
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2000) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(2500) }
  for (let i = 0; i < 40; i++) {
    const n = await page.locator('.step-nav-scroll button').count().catch(() => 0)
    if (n >= 14) break; await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(1500)

  const nav = await page.evaluate(() => {
    const nav = document.querySelector('.step-nav-scroll'); if (!nav) return []
    return Array.from(nav.querySelectorAll('button')).map((b, i) => ({
      i, text: (b.textContent || '').trim(),
      disabled: b.disabled,
      ariaDisabled: b.getAttribute('aria-disabled'),
      cls: b.className.slice(0, 80),
      pointer: getComputedStyle(b).pointerEvents,
    }))
  }).catch(e => 'ERR:' + e.message)
  console.log('===== NAV STATE =====')
  console.log(JSON.stringify(nav, null, 1))

  // 当前步骤/localStorage
  const store = await page.evaluate(() => ({
    step: localStorage.getItem('tuzhong-current-step'),
    generatedKeys: (() => { try { const d = JSON.parse(localStorage.getItem('tuzhong-generated-data')||'{}'); return Object.keys(d) } catch(e){ return ['ERR'] } })(),
  })).catch(e=>'ERR:'+e.message)
  console.log('===== LOCALSTORAGE =====')
  console.log(JSON.stringify(store, null, 1))

  // 试点击"世界观设定"导航按钮，观察 DOM 变化
  const before = await page.evaluate(() => { const h = document.querySelector('div,main'); const el = Array.from(document.querySelectorAll('h1,h2,h3')).map(x=>(x.textContent||'').trim()).slice(0,5); return el })
  const clickRes = await page.evaluate(() => {
    const nav = document.querySelector('.step-nav-scroll'); if (!nav) return 'NONAV'
    const b = Array.from(nav.querySelectorAll('button')).find(x => (x.textContent||'').trim()==='世界观设定')
    if (!b) return 'NOBTN'
    // 强制触发 click 事件（绕过可能的事件层）
    b.dispatchEvent(new MouseEvent('click', { bubbles:true, composed:true }))
    return 'DISPATCHED'
  }).catch(e=>'ERR:'+e.message)
  await page.waitForTimeout(2000)
  const after = await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2,h3')).map(x=>(x.textContent||'').trim()).slice(0,5))
  console.log('CLICK_RES=' + clickRes)
  console.log('HEADINGS_BEFORE=', JSON.stringify(before))
  console.log('HEADINGS_AFTER =', JSON.stringify(after))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })