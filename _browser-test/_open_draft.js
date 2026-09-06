// 线上：书架 → 草稿箱 → 打开《永历中兴》草稿 → 逐环节核对
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 2200 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(3000)
  await page.evaluate(({nid}) => { localStorage.setItem('tuzhong-active-novel-id', nid) }, { nid: NID })

  // 找并点击 草稿箱
  const clickedDraft = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role="tab"], a, span, div'))
    const clickable = els.find(e => (e.textContent||'').trim() === '草稿箱' && (e.offsetParent !== null))
    if (clickable) { clickable.click(); return true }
    return false
  })
  await page.waitForTimeout(2000)
  console.log('clickedDraftTab=', clickedDraft)

  const draftInfo = await page.evaluate(() => (document.body.innerText||'').slice(0, 600))
  console.log('AFTER_DRAFT_TAB=', draftInfo.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,40).join(' | '))

  // 打开《永历中兴》草稿卡片
  const opened = await page.evaluate(() => {
    const txt = document.body.innerText || ''
    const idx = txt.indexOf('永历中兴')
    const els = Array.from(document.querySelectorAll('button, [role="button"], a, [class*="card" i], div'))
    const c = els.find(e => (e.textContent||'').indexOf('永历中兴')>=0 && e.offsetParent!==null)
    if (c) { c.click(); return true }
    return false
  })
  await page.waitForTimeout(3500)
  opened ? console.log('openedDraftCard=true') : console.log('openedDraftCard=false')
  await page.screenshot({ path: path.join(__dirname, 'shot_after_open.png'), fullPage: false })
  const after = await page.evaluate(() => ({ url: location.pathname+location.search, body:(document.body.innerText||'').slice(0,700) }))
  console.log('AFTER_OPEN_URL=', after.url)
  console.log('AFTER_OPEN_BODY=', after.body.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,40).join(' | '))
  await ctx.close()
  console.log('DONE')
})().catch(e => { console.error('FATAL', e); process.exit(1) })