// 精确诊断：进入向导（点"永历中兴"文本）→ 找"分卷章节划分"按钮状态 → 点击后检查是否切换
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

  // 点击《永历中兴》文本进入向导（verify_all_fixed.js 已验证此方式有效）
  const yl = page.locator('text=永历中兴').first()
  console.log('yl count=', await yl.count())
  if (await yl.count()) { await yl.click({ timeout: 8000 }).catch(e => console.log('yl click err', e.message.split('\n')[0])) }
  await page.waitForTimeout(5000)
  console.log('URL1=', page.url())

  // 向导是否出现
  const wizText = await page.evaluate(() => {
    const b = document.body.textContent || ''
    return {
      hasWizard: b.includes('返回书架') && b.includes('草稿箱'),
      hasStepInput: b.includes('输入主题'),
      hasStepChap: b.includes('分卷章节划分'),
      iframeCount: document.querySelectorAll('iframe').length,
    }
  })
  console.log('WIZ_CHECK=', JSON.stringify(wizText))

  // 找到所有包含"分卷章节"的元素及其状态
  const chapEls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*'))
      .filter(e => (e.textContent || '').trim().includes('分卷章节划分'))
      .map(e => ({ tag: e.tagName, disabled: e.disabled, cls: String(e.className).slice(0, 80), hasClick: typeof e.onclick === 'function', role: e.getAttribute('role'), ariaDisabled: e.getAttribute('aria-disabled') }))
      .slice(0, 10)
  })
  console.log('CHAP_ELEMENTS=', JSON.stringify(chapEls, null, 1))

  // 步骤导航区域结构：找包含"输入主题"和"分卷章节"的公共容器
  const navInfo = await page.evaluate(() => {
    const findAncestor = (el, pred, depth) => {
      let cur = el, d = 0
      while (cur && d < depth) { if (pred(cur)) return cur; cur = cur.parentElement; d++ }
      return null
    }
    const stepBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('分卷章节'))
    if (!stepBtn) return { found: false }
    const container = findAncestor(stepBtn, el => (el.querySelectorAll('button').length || 0) >= 10, 8)
    return {
      found: true,
      btnDisabled: stepBtn.disabled,
      btnCls: String(stepBtn.className).slice(0, 100),
      containerCls: container ? String(container.className).slice(0, 100) : null,
      containerBtnCount: container ? container.querySelectorAll('button').length : 0,
      stepButtons: container ? Array.from(container.querySelectorAll('button')).map(b => ({ text: (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20), disabled: b.disabled })) : [],
    }
  })
  console.log('NAV_INFO=', JSON.stringify(navInfo, null, 1))

  // 尝试点击分卷章节按钮（直接 DOM click 绕过可见性判断）
  const clickRes = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('分卷章节划分'))
    if (!btn) return { clicked: false, why: 'notfound' }
    btn.click()
    return { clicked: true, disabled: btn.disabled }
  })
  console.log('DOM_CLICK=', JSON.stringify(clickRes))
  await page.waitForTimeout(4000)
  const after = await page.evaluate(() => {
    const main = document.querySelector('main, [class*="wizard"], [class*="step-content"]') || document.body
    const txt = (main.textContent || '').replace(/\s+/g, ' ')
    return {
      head: txt.slice(0, 200),
      hasChapDiv: txt.includes('分卷章节划分'),
      hasVolumeCount: /卷数/.test(txt),
      hasVolTitle: /卷标题/.test(txt),
      hasChapters: /第.{1,3}章/.test(txt),
      hasPlaceholder: /生成|未生成|暂无|待生成|占位/.test(txt),
    }
  })
  console.log('AFTER_CLICK=', JSON.stringify(after, null, 1))
  await page.screenshot({ path: 'diag_chap2.png', fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
