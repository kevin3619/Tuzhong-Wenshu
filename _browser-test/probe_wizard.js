// 复用持久登录态，进入草稿《永历中兴》向导，侦察路由与步骤结构
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'],
    viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  const logs = []
  page.on('console', m => logs.push(m.text().slice(0, 300)))
  page.on('pageerror', e => logs.push('PAGEERR: ' + e.message))

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  // 点草稿箱
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count().catch(() => 0)) { await dbtn.click().catch(() => {}); await page.waitForTimeout(2000) }
  console.log('URL after draft=', page.url())
  // 找并点击 永历中兴 的 继续生成
  const gen = page.locator('button:has-text("继续生成")').first()
  const gc = await gen.count().catch(() => 0)
  console.log('GEN_BTN_COUNT=', gc)
  if (gc > 0) {
    await gen.click().catch(e => console.log('GEN_CLICK_ERR', e.message))
    await page.waitForTimeout(4000)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1500)
  }
  console.log('===== URL AFTER 继续生成 =====')
  console.log(page.url())
  // 步骤条 stepper
  const steps = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, [role=tab], a, div'))
    const candidates = all.filter(e => {
      const t = (e.textContent || '').trim()
      return /大纲|设定|力量|角色|势力|分卷|章节|世界|人物|准备|生成/.test(t) && t.length < 12
    }).map(e => ({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 30), txt: t }))
    return candidates.slice(0, 40)
  }).catch(e => 'ERR' + e.message)
  console.log('===== STEP-LIKE ELEMENTS =====')
  console.log(JSON.stringify(steps, null, 1))
  const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim().slice(0, 20)).filter(Boolean).slice(0, 40))
  console.log('===== ALL BUTTONS =====')
  console.log(JSON.stringify(buttons, null, 1))
  const body = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(e => 'ERR')
  console.log('===== BODY TEXT =====')
  console.log(body)
  console.log('===== CONSOLE tail =====')
  console.log(logs.slice(-15).join('\n'))
  await page.screenshot({ path: 'wizard_step0.png', fullPage: false }).catch(() => {})
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })