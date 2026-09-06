// 线上诊断：草稿箱 → 永历中兴 → 打印按钮/正文，找向导入口
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1600 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(3000)
  await page.evaluate(({nid}) => { localStorage.setItem('tuzhong-active-novel-id', nid) }, { nid: NID })

  // 点击 草稿箱 tab
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role="tab"], a, span, div'))
    const c = els.find(e => (e.textContent||'').trim() === '草稿箱' && (e.offsetParent !== null))
    if (c) { c.click(); return true }
    return false
  })
  await page.waitForTimeout(2000)
  console.log('=== 草稿箱后 body 前1200 ===')
  console.log((await page.evaluate(() => document.body.innerText||'')).slice(0,1200).replace(/\n+/g,'\n'))

  // 点击 永历中兴 卡片
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role="button"], a, [class*="card" i], div'))
    const c = els.find(e => (e.textContent||'').indexOf('永历中兴')>=0 && e.offsetParent!==null)
    if (c) { c.click(); return true }
    return false
  })
  await page.waitForTimeout(4000)
  console.log('=== 点击卡片后 body 前1500 ===')
  console.log((await page.evaluate(() => document.body.innerText||'')).slice(0,1500).replace(/\n+/g,'\n'))
  console.log('=== 全部可点文本(短) ===')
  const btns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [role="button"], a, [role="tab"]'))
      .map(b => (b.textContent||'').trim()).filter(t => t && t.length < 30)
  })
  console.log([...new Set(btns)].join(' | '))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })