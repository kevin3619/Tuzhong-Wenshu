// 调试：进入向导 → 用 data-step-key 精确点击 chapters 按钮，检查 disabled 状态与切换结果
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
  // 轮询等待草稿箱按钮
  for (let i = 0; i < 15; i++) {
    const c = await page.locator('button:has-text("草稿箱")').count()
    if (c > 0) break
    await page.waitForTimeout(1000)
  }
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(3000) }
  // 轮询等待"继续生成"
  let genClicked = false
  for (let i = 0; i < 15; i++) {
    const draftCard = page.locator('text=永历中兴').first()
    if (await draftCard.count()) {
      const card = draftCard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(() => {}); genClicked = true; break }
    }
    await page.waitForTimeout(1500)
  }
  console.log('genClicked=' + genClicked)
  // 轮询等待向导出现（step-nav-scroll 或 分卷章节划分）
  for (let i = 0; i < 30; i++) {
    const n = await page.locator('button[data-step-key]').count().catch(() => 0)
    if (n > 0) break
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(2000)
  // 检查所有 data-step-key 按钮的状态
  const navState = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[data-step-key]'))
    return btns.map(b => ({
      key: b.getAttribute('data-step-key'),
      disabled: b.disabled,
      cls: String(b.className).slice(0, 40),
      label: (b.textContent || '').replace(/\s+/g, ' ').slice(0, 30),
    }))
  }).catch(e => 'ERR:' + e.message)
  console.log('NAV_STATE=' + JSON.stringify(navState, null, 1))
  // 当前正文标题
  const h = await page.evaluate(() => {
    const heads = Array.from(document.querySelectorAll('h1,h2,h3')).map(x => (x.textContent || '').trim()).filter(t => t && t.length < 30).slice(0, 5)
    return heads
  })
  console.log('HEADERS=' + JSON.stringify(h))
  // 点击 chapters 按钮（精确）
  const chapBtn = page.locator('button[data-step-key="chapters"]').first()
  console.log('chapBtn count=' + await chapBtn.count())
  if (await chapBtn.count()) {
    const st = await chapBtn.evaluate(el => ({ disabled: el.disabled, cls: String(el.className).slice(0, 60) }))
    console.log('chapBtn state=' + JSON.stringify(st))
    if (!st.disabled) {
      await chapBtn.click({ timeout: 8000 }).catch(e => console.log('CLICK_ERR', e.message.split('\n')[0]))
      await page.waitForTimeout(4500)
      const after = await page.evaluate(() => {
        const heads = Array.from(document.querySelectorAll('h1,h2,h3')).map(x => (x.textContent || '').trim()).filter(t => t && t.length < 30).slice(0, 5)
        const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
        return {
          heads,
          hasVolumeCount: /卷数|设置卷数|卷数设置/.test(txt),
          hasVolTitle: /卷标题/.test(txt),
          hasVolSummary: /卷摘要/.test(txt),
          hasGenFromConfig: /按此配置生成|生成章节/.test(txt),
          hasPlaceholder: /数据为空|硬编码|占位/.test(txt),
          snippet: txt.slice(0, 300),
        }
      })
      console.log('AFTER_CHAP_CLICK=' + JSON.stringify(after, null, 1))
    }
  }
  await page.screenshot({ path: 'chap_debug.png', fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
