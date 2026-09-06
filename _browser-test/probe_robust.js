// 稳健进入草稿向导并完整dump：等待向导标记，输出正文文本与截图
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const fs = require('fs')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  const logs = []
  page.on('console', m => logs.push(m.text().slice(0, 200)))
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(1500) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(2500) }
  // 轮询等待向导出现
  let entered = false
  for (let i = 0; i < 20; i++) {
    const has = await page.evaluate(() => {
      const t = document.body.innerText
      return /分卷章节划分|主要人物设定|世界观设定|力量体系/.test(t)
    }).catch(() => false)
    if (has) { entered = true; break }
    await page.waitForTimeout(1000)
  }
  console.log('ENTERED_WIZARD=', entered, 'URL=', page.url())
  await page.waitForTimeout(1200)
  const body = await page.evaluate(() => document.body.innerText).catch(e => 'ERR')
  fs.writeFileSync('wizard_body.txt', body)
  console.log('===== BODY LENGTH =', body.length)
  console.log(body.slice(0, 6000))
  console.log('===== CONSOLE tail =====')
  console.log(logs.slice(-8).join('\n'))
  await page.screenshot({ path: 'wizard_full.png', fullPage: true }).catch(() => {})
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })