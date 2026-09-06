// 线上核验：点击"AI全自动生成"直接渲染向导 → 核验导图（环节图）两行
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1400 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(3500)

  // 直接点击"AI全自动生成"（顶层按钮，非modal内）
  const btn = page.getByText('AI全自动生成', { exact: true }).first()
  const n = await btn.count().catch(()=>0)
  console.log('aiBtn.count=', n)
  if (n) { await btn.click({ timeout: 8000 }).catch(e=>console.log('clickErr', e.message)) }
  await page.waitForTimeout(4000)

  const s = await page.evaluate(() => {
    const nav = document.querySelector('.wenshu-step-nav')
    let rows = []
    if (nav) {
      const btns = Array.from(nav.querySelectorAll('button, [role="button"]')).filter(b=>{const t=(b.textContent||'').trim();return t&&t.length<12})
      for (const b of btns) {
        const r = b.getBoundingClientRect()
        let row = rows.find(x=>Math.abs(x.top-r.top)<10)
        if(!row){row={top:r.top,items:[]};rows.push(row)}
        row.items.push((b.textContent||'').trim())
      }
      rows.sort((a,b)=>a.top-b.top)
    }
    return { stepNavFound: !!nav, rowCount: rows.length, rows: rows.map(x=>x.items) }
  })
  console.log('STEP_NAV=', JSON.stringify(s, null, 1))
  await page.screenshot({ path: path.join(__dirname, '_stepnav_rows.png'), fullPage: false })
  await ctx.close().catch(()=>{})
})().catch(e => { console.error('FATAL', e); process.exit(1) })