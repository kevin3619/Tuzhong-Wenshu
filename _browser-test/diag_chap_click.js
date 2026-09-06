// 诊断：点击"分卷章节划分"为何无响应 + 各步骤按钮可用状态 + chapters 数据是否传入
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(10000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2000) }
  const draftCard = page.locator('text=永历中兴').first()
  if (await draftCard.count()) {
    const gen = page.locator('button:has-text("继续生成")').first()
    if (await gen.count()) { await gen.click() } else { await draftCard.click() }
    await page.waitForTimeout(4000)
  }
  await page.waitForTimeout(2000)
  console.log('URL=', page.url())

  // 列出所有可见按钮及其 disabled 状态
  const btns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button'))
      .map((b, i) => ({ i, text: (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30), disabled: b.disabled, cls: String(b.className).slice(0, 50) }))
      .filter(b => b.text)
      .slice(0, 60)
  })
  console.log('===== BUTTONS =====')
  console.log(JSON.stringify(btns, null, 1))

  // 查找"分卷章节划分"按钮，检查其状态并点击
  const chapBtn = page.locator('button:has-text("分卷章节划分")').first()
  console.log('chapBtn count=', await chapBtn.count())
  if (await chapBtn.count()) {
    const info = await chapBtn.evaluate(el => ({ disabled: el.disabled, cls: el.className, parent: el.parentElement?.className }))
    console.log('chapBtn info=', JSON.stringify(info))
    await chapBtn.click({ timeout: 8000 }).catch(e => console.log('click err', e.message.split('\n')[0]))
    await page.waitForTimeout(4000)
    console.log('AFTER CLICK URL=', page.url())
    // 正文头部
    const head = await page.evaluate(() => {
      const main = document.querySelector('main, [class*="wizard"], [class*="step-content"]') || document.body
      return (main.textContent || '').replace(/\s+/g, ' ').slice(0, 500)
    })
    console.log('BODY_HEAD=', head)
    const hasChap = await page.evaluate(() => {
      const txt = document.body.textContent || ''
      return {
        hasChapDiv: txt.includes('分卷章节划分'),
        hasVolumeConfig: txt.includes('卷数') || txt.includes('卷设置'),
        hasChapters: /第.{1,3}章/.test(txt),
        hasVolTitle: /卷标题|第.{1,4}卷[：: ]/.test(txt),
      }
    })
    console.log('CHECK=', JSON.stringify(hasChap))
    await page.screenshot({ path: 'diag_chap_after_click.png', fullPage: false })
  }
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
