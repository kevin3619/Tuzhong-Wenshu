// 线上：诊断 .wenshu-step-nav 及其祖先宽度，找出导致 flex-wrap 不换行的原因
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
    // 收集 nav 到 document 的祖先链（最多 12 层）
    const chain = []
    let el = nav
    for (let i = 0; i < 12 && el; i++) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      chain.push({
        i,
        cls: (el.className || (typeof el.getAttribute === 'function' ? el.getAttribute('class') : '') || '').toString().split(' ').slice(0,3).join(' '),
        tag: el.tagName,
        w: Math.round(r.width),
        overflowX: cs.overflowX,
        display: cs.display,
      })
      el = el.parentElement
    }
    // 收集所有环节按钮的真实 y 坐标，判断行数
    const btns = Array.from(nav.querySelectorAll('button')).map(b => {
      const r = b.getBoundingClientRect()
      return { y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), txt: (b.textContent||'').replace(/\n/g,' ').slice(0,10) }
    })
    // basis-full 断点元素
    const bd = Array.from(nav.querySelectorAll('div')).find(d => (d.className||'').includes('basis-full'))
    let bdRect = null
    if (bd) { const r = bd.getBoundingClientRect(); bdRect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
    return { found: true, viewportW: document.documentElement.clientWidth, chain, btns, bdRect }
  })
  console.log(JSON.stringify(s, null, 1))
  await ctx.close().catch(()=>{})
})().catch(e => { console.error('FATAL', e); process.exit(1) })