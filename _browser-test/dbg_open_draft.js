// 调试：进入向导流程，检查"继续生成"点击后页面变化
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(10000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  const steps = []
  const snap = async (tag) => {
    const s = await page.evaluate(() => {
      const txt = (document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 150)
      return { url: location.pathname + location.search, txt }
    }).catch(e => ({ err: e.message }))
    steps.push({ tag, ...s })
  }

  await snap('initial')
  // 是否在向导内
  let inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
  if (!inWizard) {
    // 找"继续生成"按钮并点击
    const contBtn = page.locator('button:has-text("继续生成")').first()
    const cb = await contBtn.count()
    steps.push({ tag: 'cont_btn_count', count: cb })
    if (cb) {
      // 打印按钮位置/可见性
      const info = await contBtn.evaluate(el => {
        const r = el.getBoundingClientRect()
        return { text: (el.textContent || '').trim().slice(0, 20), visible: r.width > 0 && r.height > 0, x: r.x, y: r.y, tag: el.tagName, cls: String(el.className).slice(0, 60) }
      }).catch(e => ({ err: e.message }))
      steps.push({ tag: 'cont_btn_info', info })
      await contBtn.scrollIntoViewIfNeeded().catch(() => {})
      await contBtn.click({ timeout: 8000 }).catch(e => steps.push({ tag: 'click_err', msg: e.message.split('\n')[0] }))
      // 等待向导
      for (let i = 0; i < 25; i++) {
        await page.waitForTimeout(1000)
        inWizard = await page.evaluate(() => {
          const t = document.body.textContent || ''
          return t.includes('分卷章节划分') || t.includes('世界纪元') || t.includes('输入主题')
        }).catch(() => false)
        if (inWizard) break
      }
      steps.push({ tag: 'after_cont_click', inWizard })
      await snap('after_click')
      await page.screenshot({ path: 'dbg_after_cont.png' })
    } else {
      // 可能需要在草稿箱里
      const dbtn = page.locator('button:has-text("草稿箱")').first()
      if (await dbtn.count()) {
        await dbtn.click(); await page.waitForTimeout(2500)
        await snap('draftbox_open')
        const dcard = page.locator('text=永历中兴').first()
        steps.push({ tag: 'draft_card', count: await dcard.count() })
        if (await dcard.count()) {
          const card = dcard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
          const gen2 = card.locator('button:has-text("继续生成")').first()
          steps.push({ tag: 'draft_gen_btn', count: await gen2.count() })
          if (await gen2.count()) {
            await gen2.click({ timeout: 8000 }).catch(e => steps.push({ tag: 'gen2_err', msg: e.message.split('\n')[0] }))
            for (let i = 0; i < 25; i++) {
              await page.waitForTimeout(1000)
              inWizard = await page.evaluate(() => {
                const t = document.body.textContent || ''
                return t.includes('分卷章节划分') || t.includes('世界纪元') || t.includes('输入主题')
              }).catch(() => false)
              if (inWizard) break
            }
            steps.push({ tag: 'after_draft_gen', inWizard })
            await snap('after_draft_gen')
            await page.screenshot({ path: 'dbg_after_draft_gen.png' })
          }
        }
      }
    }
  } else {
    steps.push({ tag: 'already_in_wizard' })
  }

  console.log(JSON.stringify(steps, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
