// 验证：开草稿《永历中兴》后，输入主题环节 keywords/genre 已回填；且已完成环节跳转到保存的步骤（无需重新选择）
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1600, height: 1400 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 60)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(12000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  const log = {}
  // 进入向导
  const aiBtn = page.locator('button:has-text("AI全自动生成")').first()
  if (await aiBtn.count()) { await aiBtn.click(); await page.waitForTimeout(3500); log.enteredWizard = true }

  // 打开草稿箱
  const boxBtn = page.locator('button:has-text("草稿箱")').first()
  if (await boxBtn.count()) { await boxBtn.click(); await page.waitForTimeout(2500); log.openedBox = true }

  // 点《永历中兴》的"打开"
  const openBtn = page.locator('li:has-text("永历中兴") button:has-text("打开")').first()
  log.openBtnCount = await openBtn.count()
  if (await openBtn.count()) { await openBtn.click({ timeout: 8000 }).catch(()=>{}); await page.waitForTimeout(5000) }

  // 记录打开后跳到的环节（验证恢复到已保存步骤）
  log.currentStepAfterOpen = await page.evaluate(() => {
    const cur = document.querySelector('.wenshu-step-current')
    return cur ? (cur.textContent||'').replace(/\s+/g,' ').trim() : (document.querySelector('[data-step-key] span, button[data-step-key]') ? 'stepbar present' : 'NONE')
  })

  // 点"输入主题"环节
  const inputBtn = page.locator('button[data-step-key="input"]').first()
  log.inputBtnCount = await inputBtn.count()
  if (await inputBtn.count()) {
    await inputBtn.scrollIntoViewIfNeeded().catch(()=>{})
    await inputBtn.click({ timeout: 8000, force: true }).catch(e => log.clickErr = e.message.split('\n')[0])
    await page.waitForTimeout(2500)
  }

  // 读取输入环节字段
  const inputVals = await page.evaluate(() => {
    const out = { textareas: [], inputs: [], chips: [], bodyHas: {}, optionTexts: {} }
    document.querySelectorAll('textarea').forEach((t, i) => {
      const name = t.getAttribute('placeholder') || t.getAttribute('aria-label') || ('ta'+i)
      out.textareas.push({ name, len: (t.value||'').length, preview: (t.value||'').slice(0,50) })
    })
    document.querySelectorAll('input').forEach((t, i) => {
      const n = t.getAttribute('placeholder') || t.name || ('in'+i)
      if (t.type !== 'hidden' && t.type !== 'password') out.inputs.push({ name: n, type: t.type, val: (t.value||'').slice(0,50) })
    })
    out.chips = Array.from(document.querySelectorAll('button,span')).filter(e => (e.className||'').match(/select|active|chip|pill/i) && (e.textContent||'').length < 16).map(e => (e.textContent||'').trim()).filter(Boolean).slice(0,40)
    for (const kw of ['确定','生成','输入你的创作主题','创作类型','关键词','选择']) {
      out.bodyHas[kw] = (document.body.textContent||'').includes(kw)
    }
    // 当前输入主题区域按钮/类型文案
    const sel = document.querySelector('select')
    if (sel) out.optionTexts.selected = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : sel.value
    return out
  })
  log.inputVals = inputVals

  console.log(JSON.stringify(log, null, 1))
  await page.screenshot({ path: '_verify_inputstep.png' }).catch(()=>{})
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })