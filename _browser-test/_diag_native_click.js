// 线上：用 Playwright 原生点击进入《永历中兴》向导，核验导图两行 + 角色Tab字段
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

  // 原生点击 草稿箱
  const draftsBtn = page.getByText('草稿箱', { exact: true }).first()
  await draftsBtn.click({ timeout: 8000 }).catch(()=>console.log(' no drafts btn'))
  await page.waitForTimeout(1500)

  // 原生点击 永历中兴 的 继续生成
  const resume = page.getByText('继续生成', { exact: true }).first()
  const clickedNav = await resume.count().catch(()=>0)
  if (clickedNav > 0) { await resume.click({ timeout: 8000 }); console.log('resume.clicked count=', clickedNav) }
  else console.log('resume btn not found')
  await page.waitForTimeout(9000)

  console.log('URL=', await page.evaluate(() => location.pathname))
  const wiz = await page.evaluate(() => {
    const nav = document.querySelector('.wenshu-step-nav')
    return { stepNavFound: !!nav, bodyHead: (document.body.innerText||'').replace(/\n+/g,'\n').slice(0,400) }
  })
  console.log('WIZARD=', JSON.stringify(wiz, null, 1))
  await page.screenshot({ path: path.join(__dirname, '_wizard_state.png'), fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })