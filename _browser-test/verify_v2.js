// 综合验证v2：进入向导 → 精确抓取各环节 input/textarea/select 值 → 验证分卷按钮点击与切换
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
  // 打开向导：卡片内"继续生成"
  const draftCard = page.locator('text=永历中兴').first()
  if (await draftCard.count()) {
    const card = draftCard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
    const gen = card.locator('button:has-text("继续生成")').first()
    if (await gen.count()) { await gen.click() } else { await draftCard.click() }
  }
  await page.waitForTimeout(4000)
  // 轮询等待向导出现
  for (let i = 0; i < 20; i++) {
    const h = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
    if (h) break
    await page.waitForTimeout(1000)
  }
  const wiz = await page.evaluate(() => {
    const b = document.body.textContent || ''
    return { hasChap: b.includes('分卷章节划分'), hasInput: b.includes('输入主题') }
  })
  console.log('WIZ=', JSON.stringify(wiz))
  if (!wiz.hasChap) { console.log('NOT_IN_WIZARD'); await ctx.close(); process.exit(0) }

  // ---- 1) 抓取势力设置的真实字段值（input/textarea/select value）----
  const clickNav = async (kw) => {
    const btn = page.locator('button').filter({ hasText: kw }).first()
    const c = await btn.count()
    if (!c) return false
    await btn.click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(3500)
    return true
  }
  const grabStep = async () => {
    return await page.evaluate(() => {
      const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
      const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => (h.textContent || '').trim()).filter(t => t && t.length < 24)
      // 精确抓所有表单控件值
      const controls = []
      document.querySelectorAll('input:not([type=hidden]), textarea, select').forEach(el => {
        const label = (el.getAttribute('placeholder') || el.closest('label')?.textContent || '').trim().slice(0, 30)
        let val = ''
        if (el.tagName === 'SELECT') { val = el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '' }
        else val = el.value || ''
        controls.push({ tag: el.tagName, label, val: String(val).slice(0, 80) })
      })
      // 空值统计
      const emptyControls = controls.filter(c => !c.val.trim() && c.label).length
      return { heads: heads.slice(0, 6), controls: controls.slice(0, 60), emptyControls, totalControls: controls.length }
    })
  }

  // 切到势力设置
  const ok1 = await clickNav('势力设定')
  console.log('STEP势力 clicked=', ok1)
  const fac = await grabStep()
  console.log('势力 heads=', JSON.stringify(fac.heads))
  console.log('势力 empty=', fac.emptyControls + '/' + fac.totalControls)
  console.log('势力 controls sample=', JSON.stringify(fac.controls.filter(c => c.val && c.val.length > 2).slice(0, 30), null, 1))

  // ---- 2) 分卷章节按钮 ----
  const chapBtn = page.locator('button:has-text("分卷章节划分")').first()
  console.log('chapBtn count=', await chapBtn.count())
  if (await chapBtn.count()) {
    const st = await chapBtn.evaluate(el => ({ disabled: el.disabled, aria: el.getAttribute('aria-disabled'), cls: String(el.className).slice(0, 80) }))
    console.log('chapBtn state=', JSON.stringify(st))
    await chapBtn.click({ timeout: 8000 }).catch(e => console.log('CLICK_ERR', e.message.split('\n')[0]))
    await page.waitForTimeout(4500)
    const after = await page.evaluate(() => {
      const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
      return {
        head: txt.slice(0, 180),
        hasVolCount: /卷数|卷设置/.test(txt),
        hasVolTitle: /卷标题/.test(txt),
        hasVolSummary: /卷摘要/.test(txt),
        hasChapter: /第.{1,3}章/.test(txt),
        hasGenBtn: /按此配置生成|生成章节/.test(txt),
        stillFaction: /势力设定AI为你设计了完整的势力格局/.test(txt),
      }
    })
    console.log('AFTER_CHAP_CLICK=', JSON.stringify(after, null, 1))
  } else {
    // 列出所有导航按钮文本
    const navs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button'))
        .map(b => (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24))
        .filter(t => t && t.length > 1 && t.length < 24).slice(0, 50)
    })
    console.log('NO chapBtn. NAV_BTNS=', JSON.stringify(navs, null, 1))
  }
  await page.screenshot({ path: 'diag_chap5.png', fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
