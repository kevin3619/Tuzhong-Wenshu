// 线上：精确 dump .wenshu-step-nav 内部结构 + 每个环节项坐标 + basis-full 断点元素
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
  await page.getByText('AI全自动生成', { exact: true }).first().click({ timeout: 8000 }).catch(()=>{})
  await page.waitForTimeout(4000)

  const s = await page.evaluate(() => {
    const nav = document.querySelector('.wenshu-step-nav')
    if (!nav) return { found: false }
    const inner = nav.querySelector(':scope > div')
    const items = Array.from(nav.querySelectorAll('.wenshu-step-nav > div > span > div, .wenshu-step-nav > div > div'))
      .filter(e => e.getBoundingClientRect().width > 40)
    const rows = []
    for (const it of nav.querySelectorAll('.wenshu-step-nav button')) {
      const r = it.getBoundingClientRect()
      let row = rows.find(x => Math.abs(x.top - r.top) < 8)
      if (!row) { row = { top: r.top, xs: [] }; rows.push(row) }
      row.xs.push({ x: Math.round(r.left), txt: (it.textContent||'').replace(/\n/g,' ').slice(0,14) })
    }
    rows.sort((a,b)=>a.top-b.top)
    const breakDiv = Array.from(nav.querySelectorAll('div')).find(d => (d.className||'').includes('basis-full'))
    return {
      found: true,
      navClass: nav.className,
      innerClass: inner ? inner.className : null,
      innerStyle: inner ? (inner.getAttribute('style')||'') : null,
      flexWrapApplied: inner ? getComputedStyle(inner).flexWrap : null,
      displayApplied: inner ? getComputedStyle(inner).display : null,
      breakDivExists: !!breakDiv,
      breakDivClass: breakDiv ? breakDiv.className : null,
      rows: rows.map(r=>({ top: Math.round(r.top), n: r.xs.length, items: r.xs })),
    }
  })
  console.log(JSON.stringify(s, null, 1))
  await ctx.close().catch(()=>{})
})().catch(e => { console.error('FATAL', e); process.exit(1) })