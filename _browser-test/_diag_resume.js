// 线上诊断：点继续生成后，捕获 console 错误 / alert / body 变化
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 2000 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  const errs = []
  page.on('console', m => { if (m.type()==='error') errs.push('[CONSOLE] '+m.text().slice(0,300)) })
  page.on('pageerror', e => errs.push('[PAGEERROR] '+String(e).slice(0,300)))
  page.on('dialog', async d => { errs.push('[DIALOG] '+d.message().slice(0,300)); try{await d.dismiss()}catch{} })

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(3000)
  console.log('token=', await page.evaluate(() => (localStorage.getItem('token')||'').slice(0,20)))

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const b = btns.find(x => (x.textContent||'').includes('草稿箱') && (x.offsetParent !== null))
    if (b) b.click()
  })
  await page.waitForTimeout(1500)
  const clk = await page.evaluate(() => {
    const m = Array.from(document.querySelectorAll('div')).find(d => (d.textContent||'').includes('永历中兴') && (d.textContent||'').includes('继续生成') && d.getBoundingClientRect().width > 200)
    if (!m) return 'NO_CARD'
    const btn = Array.from(m.querySelectorAll('button')).find(b => (b.textContent||'').includes('继续生成'))
    if (!btn) return 'NO_BTN'
    btn.click(); return 'CLICKED'
  })
  console.log('click=', clk)
  await page.waitForTimeout(8000)

  const wiz = await page.evaluate(() => {
    return {
      stepNavFound: !!document.querySelector('.wenshu-step-nav'),
      bodyHead: (document.body.innerText||'').slice(0,500).replace(/\n+/g,'\n'),
    }
  })
  console.log('WIZARD=', JSON.stringify(wiz, null, 1))
  console.log('ERRS=', JSON.stringify(errs, null, 1))
  await page.screenshot({ path: path.join(__dirname, '_wizard_state.png'), fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })