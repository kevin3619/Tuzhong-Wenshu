// 进入向导 → 势力设定 → 精确抓取第一个势力卡片所有 input/textarea/select 的 value
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
  const draftCard = page.locator('text=永历中兴').first()
  if (await draftCard.count()) {
    const card = draftCard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
    const gen = card.locator('button:has-text("继续生成")').first()
    if (await gen.count()) { await gen.click() } else { await draftCard.click() }
  }
  await page.waitForTimeout(4000)
  for (let i = 0; i < 20; i++) {
    const h = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
    if (h) break
    await page.waitForTimeout(1000)
  }
  // 点击势力设定
  const facBtn = page.locator('button').filter({ hasText: '势力设定' }).first()
  const fc = await facBtn.count()
  console.log('facBtn count=' + fc)
  if (fc) { await facBtn.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3500) }

  // 抓取UI中第一个势力卡片的所有控件值
  const controls = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[class*="rounded-xl"]'))
    // 找包含"实力："label的卡片
    const labels = ['实力', '首领', '领地', '描述', '势力理念', '势力级别', '旗帜', '势力文化', '内部派系', '核心资源', '招牌人物', '友方势力', '敌方势力', '历史恩怨', '隐藏目的', '与主角关系', '实力梯度', '势力底牌', '核心利益冲突', '势力发展轨迹']
    const out = []
    // 直接在全部 textarea/input/select 中抓，带 placeholder 或上下文 label
    document.querySelectorAll('textarea, input:not([type=hidden]), select').forEach(el => {
      const label = (el.getAttribute('placeholder') || '').trim()
      const val = el.tagName === 'SELECT' ? (el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '') : (el.value || '')
      out.push({ tag: el.tagName, ph: label.slice(0, 20), val: String(val).slice(0, 60) })
    })
    // 抓 label 文本与其相邻控件值（用 span 文本 + 下一个兄弟）
    const labelVals = []
    labels.forEach(l => {
      const spans = Array.from(document.querySelectorAll('span')).filter(s => (s.textContent || '').trim() === l + '：' || (s.textContent || '').trim() === l + ':')
      spans.slice(0, 3).forEach(sp => {
        let nxt = sp.nextElementSibling
        if (nxt && (nxt.tagName === 'INPUT' || nxt.tagName === 'TEXTAREA' || nxt.tagName === 'SELECT')) {
          const v = nxt.tagName === 'SELECT' ? (nxt.selectedOptions[0] ? nxt.selectedOptions[0].textContent.trim() : '') : (nxt.value || '')
          labelVals.push({ label: l, val: String(v).slice(0, 60) })
        }
      })
    })
    return { controls: out.slice(0, 40), labelVals }
  }).catch(e => 'ERR:' + e.message)
  console.log('===== UI 控件值 =====')
  console.log(JSON.stringify(controls, null, 1))
  await page.screenshot({ path: 'faction_ui.png', fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
