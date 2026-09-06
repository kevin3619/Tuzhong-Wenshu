// 精确诊断分卷章节：复用 verify_all_fixed.js 已验证的进入方式（草稿箱→卡片内"继续生成"）
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
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
  // 卡片内"继续生成"
  const draftCard = page.locator('text=永历中兴').first()
  let entered = false
  if (await draftCard.count()) {
    const card = draftCard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item")][1]')
    const gen = card.locator('button:has-text("继续生成")').first()
    if (await gen.count()) { await gen.click(); entered = true }
  }
  if (!entered) {
    // 兜底：直接点第一个继续生成
    const g = page.locator('button:has-text("继续生成")').first()
    if (await g.count()) { await g.click(); entered = true }
  }
  await page.waitForTimeout(5000)
  console.log('URL=', page.url())
  const wiz = await page.evaluate(() => {
    const b = document.body.textContent || ''
    return { hasStepInput: b.includes('输入主题'), hasChap: b.includes('分卷章节划分'), hasFanqie: b.includes('灵感创作') }
  })
  console.log('WIZ=', JSON.stringify(wiz))
  if (!wiz.hasChap) { console.log('NOT_IN_WIZARD'); await ctx.close(); process.exit(0) }

  // 找所有包含"分卷章节划分"的元素
  const els = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*'))
      .filter(e => (e.textContent || '').trim().includes('分卷章节划分'))
      .map(e => ({ tag: e.tagName, disabled: !!e.disabled, cls: String(e.className).slice(0, 90), role: e.getAttribute('role'), parentCls: e.parentElement ? String(e.parentElement.className).slice(0, 60) : '' }))
      .slice(0, 12)
  })
  console.log('CHAP_ELS=', JSON.stringify(els, null, 1))

  // 用 Playwright 点击"分卷章节划分"按钮
  const chapBtn = page.locator('button:has-text("分卷章节划分")').first()
  console.log('chapBtn count=', await chapBtn.count())
  if (await chapBtn.count()) {
    const st = await chapBtn.evaluate(el => ({ disabled: el.disabled, aria: el.getAttribute('aria-disabled') }))
    console.log('chapBtn state=', JSON.stringify(st))
    await chapBtn.click({ timeout: 8000 }).catch(e => console.log('CLICK_ERR', e.message.split('\n')[0]))
    await page.waitForTimeout(4000)
  }
  const after = await page.evaluate(() => {
    const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
    const stepTitles = ['输入主题','灵感创作','世界观设定','金手指设定','主要人物设定','势力设定','人物关系图谱','简介卖点','整体故事大纲','关键剧情节点','分卷章节划分','逐章生成正文']
    const step = stepTitles.filter(t => txt.indexOf(t) !== -1).slice(-1)[0] || 'unknown'
    // 判断当前步骤主标题（找 h3/h2）
    const heads = Array.from(document.querySelectorAll('h2,h3')).map(h => (h.textContent || '').trim()).filter(t => t && t.length < 20).slice(0, 8)
    return {
      stepHint: step,
      heads,
      hasVolumeCount: /卷数/.test(txt),
      hasVolTitle: /卷标题/.test(txt),
      hasVolSummary: /卷摘要/.test(txt),
      hasChapter: /第.{1,3}章/.test(txt),
      hasGenBtn: /按此配置生成|生成章节/.test(txt),
      headText: txt.slice(0, 150),
    }
  })
  console.log('AFTER=', JSON.stringify(after, null, 1))
  await page.screenshot({ path: 'diag_chap3.png', fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
