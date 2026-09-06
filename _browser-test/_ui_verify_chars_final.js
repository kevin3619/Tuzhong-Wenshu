// 线上UI验证（健壮导航）：进入向导 → 切到"主要人物设定" → 校验徽章/定位/无空态
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(10000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  let inWizard = await page.evaluate(() => (document.body.textContent || '').includes('主要人物设定')).catch(() => false)
  if (!inWizard) {
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
    const dcard = page.locator('text=永历中兴').first()
    if (await dcard.count()) {
      const card = dcard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(() => {}) }
      for (let i = 0; i < 25; i++) {
        await page.waitForTimeout(1000)
        inWizard = await page.evaluate(() => (document.body.textContent || '').includes('主要人物设定')).catch(() => false)
        if (inWizard) break
      }
    }
  }
  console.log('in_wizard=', inWizard)

  // 切到主要人物设定
  const charBtn = page.locator('button').filter({ hasText: '主要人物设定' }).first()
  console.log('char_btn_count=', await charBtn.count())
  if (await charBtn.count()) {
    await charBtn.click({ timeout: 8000 }).catch(e => console.log('click_err=', e.message.split('\n')[0]))
    await page.waitForTimeout(4500)
    const ui = await page.evaluate(() => {
      const txt = document.body.innerText || ''
      const hasEmptyPrompt = txt.indexOf('点击上方按钮重新生成') >= 0 || txt.indexOf('数据为空') >= 0
      const badges = ['永历帝','贴身丫鬟','晋王','东阁大学士','大西皇帝','平西王','延平王','典史','摄政王','豫亲王','定南王','广西巡抚','秦王','南川王','兵部尚书']
      const found = []
      badges.forEach(b => { if (txt.indexOf(b) >= 0) found.push(b) })
      // 找到主要角色的头部信息
      const head = txt.split('\n').map(s=>s.trim()).filter(Boolean).filter(s => /朱由榔|玉竹|丁魁楚|多铎|李定国/.test(s)).slice(0, 30)
      return { hasEmptyPrompt, foundBadges: found, headSample: head }
    })
    console.log('hasEmptyPrompt=', ui.hasEmptyPrompt)
    console.log('页面可见徽章=', JSON.stringify(ui.foundBadges))
    console.log('角色头部=', JSON.stringify(ui.headSample))
    await page.screenshot({ path: path.join(__dirname, 'ui_verify_chars_final.png'), fullPage: false })
  } else {
    console.log('WIZARD_NOT_ENTERED')
  }
  await ctx.close()
  console.log('DONE')
})().catch(e => { console.error('FATAL', e); process.exit(1) })