// 线上：全页截图观察向导环节图布局
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1500 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(3500)
  await page.getByText('AI全自动生成', { exact: true }).first().click({ timeout: 8000 }).catch(()=>{})
  await page.waitForTimeout(4000)

  // 列出所有 .wenshu-step-nav，各自 rect + 内部环节按钮行分布
  const info = await page.evaluate(() => {
    const navs = Array.from(document.querySelectorAll('.wenshu-step-nav'))
    return navs.map((nav, i) => {
      const r = nav.getBoundingClientRect()
      const inner = nav.querySelector(':scope > div')
      const cs = inner ? getComputedStyle(inner) : null
      const btns = Array.from(nav.querySelectorAll('button')).map(b => {
        const br = b.getBoundingClientRect()
        return { y: Math.round(br.y), x: Math.round(br.x), txt: (b.textContent||'').replace(/\n/g,' ').slice(0,8) }
      })
      const rows = []
      for (const b of btns) {
        let row = rows.find(x => Math.abs(x.y - b.y) < 10)
        if (!row) { row = { y: b.y, items: [] }; rows.push(row) }
        row.items.push({ x: b.x, t: b.txt })
      }
      return { i, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, innerClass: inner ? inner.className : null, flexWrap: cs ? cs.flexWrap : null, rows: rows.map(x => ({ y: x.y, n: x.items.length, items: x.items })) }
    })
  })
  console.log(JSON.stringify(info, null, 1))
  await page.screenshot({ path: path.join(__dirname, '_stepnav_full.png'), fullPage: true })
  await ctx.close().catch(()=>{})
})().catch(e => { console.error('FATAL', e); process.exit(1) })