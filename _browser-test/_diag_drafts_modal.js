// 线上诊断：正确打开草稿箱modal → 找《永历中兴》继续生成 → 进入向导
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 2000 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(3000)

  // 1) 点击「草稿箱」按钮（打开 modal）
  const ok = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const b = btns.find(x => (x.textContent||'').includes('草稿箱') && (x.offsetParent !== null))
    if (b) { b.click(); return (b.textContent||'').trim() }
    return 'NOT_FOUND'
  })
  console.log('clickedDraftsModal=', ok)
  await page.waitForTimeout(1500)

  // 2) 打印 modal 内内容（找永历中兴 + 继续生成）
  const modal = await page.evaluate(() => {
    const m = document.querySelector('.fixed.inset-0.z-\\[60\\]') || Array.from(document.querySelectorAll('div')).find(d => (d.textContent||'').includes('草稿箱') && (d.textContent||'').includes('继续生成') && d.getBoundingClientRect().width > 200)
    if (!m) return { found: false }
    const btns = Array.from(m.querySelectorAll('button')).map(b => (b.textContent||'').trim())
    return { found: true, body: (m.innerText||'').slice(0,600), btns }
  })
  console.log('MODAL=', JSON.stringify(modal, null, 1))

  // 3) 点击《永历中兴》的「继续生成」
  if (modal.found) {
    const clk = await page.evaluate(() => {
      const m = Array.from(document.querySelectorAll('div')).find(d => (d.textContent||'').includes('草稿箱') && (d.textContent||'').includes('继续生成') && d.getBoundingClientRect().width > 200)
      if (!m) return 'NO_MODAL'
      const item = Array.from(m.querySelectorAll('div')).find(d => (d.textContent||'').includes('永历中兴') && d.getBoundingClientRect().width > 200)
      if (!item) return 'NO_YONGLI'
      const btn = Array.from(item.querySelectorAll('button')).find(b => (b.textContent||'').includes('继续生成'))
      if (!btn) return 'NO_BTN'
      btn.click(); return 'CLICKED'
    })
    console.log('clickContinue=', clk)
    await page.waitForTimeout(5000)
  }

  console.log('URL_NOW=', await page.evaluate(() => location.pathname+location.search))
  // 4) 检查向导是否出现
  const wiz = await page.evaluate(() => {
    const nav = document.querySelector('.wenshu-step-nav')
    return { stepNavFound: !!nav, hasInputTheme: (document.body.innerText||'').includes('输入主题') }
  })
  console.log('WIZARD=', JSON.stringify(wiz))
  await page.screenshot({ path: path.join(__dirname, '_wizard_state.png'), fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })