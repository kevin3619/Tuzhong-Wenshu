// 精确诊断v4：遍历所有标签页找向导，检查分卷按钮状态与点击行为
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  // 遍历已有标签页
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    console.log('TAB url=', p.url(), 'head=', t.slice(0, 50))
    if (t.includes('分卷章节划分') || t.includes('输入主题') || t.includes('返回书架')) { page = p; break }
  }
  if (!page) {
    page = ctx.pages()[0] || await ctx.newPage()
    page.setDefaultTimeout(10000)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
    const draftCard = page.locator('text=永历中兴').first()
    if (await draftCard.count()) { await draftCard.click({ timeout: 8000 }).catch(() => {}) }
    await page.waitForTimeout(5000)
    // 点击后可能开新tab
    if (ctx.pages().length > 1) {
      for (const p of ctx.pages()) {
        const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
        if (t.includes('分卷章节划分') || t.includes('输入主题')) { page = p; break }
      }
    }
  }
  page.setDefaultTimeout(10000)
  console.log('FINAL_URL=', page.url())
  const wiz = await page.evaluate(() => {
    const b = document.body.textContent || ''
    return { hasChap: b.includes('分卷章节划分'), hasInput: b.includes('输入主题'), head: b.replace(/\s+/g, ' ').slice(0, 120) }
  })
  console.log('WIZ=', JSON.stringify(wiz))
  if (!wiz.hasChap) { console.log('NOT_IN_WIZARD'); await ctx.close(); process.exit(0) }

  const chapBtn = page.locator('button:has-text("分卷章节划分")').first()
  console.log('chapBtn count=', await chapBtn.count())
  if (await chapBtn.count()) {
    const st = await chapBtn.evaluate(el => ({ disabled: el.disabled, aria: el.getAttribute('aria-disabled'), cls: String(el.className).slice(0, 80) }))
    console.log('chapBtn state=', JSON.stringify(st))
    await chapBtn.click({ timeout: 8000 }).catch(e => console.log('CLICK_ERR', e.message.split('\n')[0]))
    await page.waitForTimeout(4000)
  } else {
    console.log('NO chapBtn found, listing step nav buttons...')
    const navs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button'))
        .map(b => (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24))
        .filter(t => t && !/草稿箱|新建|全自动|收起|继续生成|删除|🗑/.test(t))
        .slice(0, 40)
    })
    console.log('NAV_BTNS=', JSON.stringify(navs, null, 1))
  }
  const after = await page.evaluate(() => {
    const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
    return {
      head: txt.slice(0, 200),
      hasVolumeCount: /卷数/.test(txt),
      hasVolTitle: /卷标题/.test(txt),
      hasVolSummary: /卷摘要/.test(txt),
      hasChapter: /第.{1,3}章/.test(txt),
      hasGenBtn: /按此配置生成|生成章节/.test(txt),
    }
  })
  console.log('AFTER=', JSON.stringify(after, null, 1))
  await page.screenshot({ path: 'diag_chap4.png', fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
