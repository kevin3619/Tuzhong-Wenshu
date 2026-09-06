// 精确复测：草稿箱 → 点「打开」 → dump 各步骤按钮状态 + 当前页面 + stepModels
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    if (t.includes('返回书架') || t.includes('分卷章节划分') || t.includes('输入主题')) { page = p; break }
  }
  if (!page) {
    page = ctx.pages()[0] || await ctx.newPage()
    page.setDefaultTimeout(10000)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
  }
  page.setDefaultTimeout(10000)

  // 确保在书架页（有草稿箱按钮）
  let hasDraftBtn = await page.locator('button:has-text("草稿箱")').count()
  if (!hasDraftBtn) {
    const backBtn = page.locator('button:has-text("返回书架")').first()
    if (await backBtn.count()) { await backBtn.click(); await page.waitForTimeout(2500) }
    hasDraftBtn = await page.locator('button:has-text("草稿箱")').count()
  }
  console.log('hasDraftBtn=' + hasDraftBtn)

  if (hasDraftBtn) {
    await page.locator('button:has-text("草稿箱")').first().click()
    await page.waitForTimeout(2500)
    // 在草稿箱内找《永历中兴》
    const card = page.locator('text=永历中兴').first()
    const cardCount = await card.count()
    console.log('yongliCard=' + cardCount)
    if (cardCount) {
      // 点击该草稿行的「打开」按钮
      const openBtn = page.locator('li:has-text("永历中兴") button:has-text("打开")').first()
      const obc = await openBtn.count()
      console.log('openBtn=' + obc)
      if (obc) {
        await openBtn.click({ timeout: 8000 }).catch(e => console.log('OPEN_CLICK_ERR', e.message.split('\n')[0]))
      } else {
        // 回退：点击草稿名所在行的打开
        const anyOpen = page.locator('li:has-text("永历中兴") button:has-text("打开")').first()
        if (await anyOpen.count()) { await anyOpen.click({ timeout: 8000 }).catch(() => {}) } else { await card.click().catch(() => {}) }
      }
      await page.waitForTimeout(6000)
    }
  }

  // dump 步骤按钮状态
  const navState = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[data-step-key]'))
    const out = btns.map(b => ({
      key: b.getAttribute('data-step-key'),
      disabled: b.disabled,
      label: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 26),
      cls: String(b.className).includes('wenshu-step-done') ? 'done' : String(b.className).includes('wenshu-step-current') ? 'current' : 'pending',
    }))
    return out
  }).catch(e => 'ERR:' + e.message)
  console.log('NAV_STATE=' + JSON.stringify(navState, null, 1))

  // 当前 step 与 generatedData.chapters 状态
  const state = await page.evaluate((nid) => {
    const out = {
      currentStep: localStorage.getItem('tuzhong-current-step'),
      stepModels: null,
      genDataTop: null,
      chaptersVal: null,
      pageHead: (document.querySelector('h1,h2,h3')?.textContent || '').trim().slice(0, 30),
    }
    const aid = localStorage.getItem('tuzhong-active-novel-id') || 'global'
    try {
      const sm = localStorage.getItem('tuzhong-step-models-' + aid)
      if (sm) out.stepModels = JSON.parse(sm)
    } catch (e) {}
    try {
      const raw = localStorage.getItem('tuzhong-draft-data-' + nid)
      if (raw) {
        const d = JSON.parse(raw)
        out.genDataTop = Object.keys(d)
        out.chaptersVal = d.chapters ? (Array.isArray(d.chapters.volumes) ? 'volumes:' + d.chapters.volumes.length : 'obj:' + Object.keys(d.chapters).length) : String(d.chapters)
      }
    } catch (e) {}
    return out
  }, NID)
  console.log('STATE=' + JSON.stringify(state, null, 1))
  await page.screenshot({ path: 'final_open_draft.png', fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
