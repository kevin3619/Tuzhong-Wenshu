// 线上：点击继续生成 → 间隔采样，捕获 向导是否渲染 + step-nav 结构
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1200 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(3000)

  await page.getByText('草稿箱', { exact: true }).first().click({ timeout: 8000 }).catch(()=>{})
  await page.waitForTimeout(1500)
  await page.getByText('继续生成', { exact: true }).first().click({ timeout: 8000 }).catch(()=>{})

  for (const t of [2000, 6000]) {
    await page.waitForTimeout(t)
    const s = await page.evaluate(() => {
      const nav = document.querySelector('.wenshu-step-nav')
      const stepLike = Array.from(document.querySelectorAll('[class*="step"]')).map(e => e.className.split(' ').filter(c=>/step/i.test(c)).join('.')).slice(0,8)
      const mainText = (document.querySelector('main')?.innerText || document.body.innerText || '').replace(/\n+/g,'\n').slice(0,300)
      return {
        stepNavFound: !!nav,
        stepNavBtns: nav ? Array.from(nav.querySelectorAll('button, [role="button"]')).map(b=>(b.textContent||'').trim()).filter(Boolean).length : 0,
        stepClassSample: stepLike,
        mainText,
        activeId: localStorage.getItem('tuzhong-active-novel-id'),
      }
    })
    console.log(`--- sample @${t}ms ---`)
    console.log(JSON.stringify(s, null, 1))
  }
  await page.screenshot({ path: path.join(__dirname, '_wizard_state.png'), fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })