// 抓取当前向导步骤的完整字段：inputs, textareas, selects 的值；截图
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  // 直接回到 wizard 路由（若 URL 未保存）。先尝试已有会话内恢复：点击继续生成
  // 更稳妥：直接打开 write 引导入口——需要知道NID。用 草稿箱→继续生成 恢复
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(1800) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(2500) }
  console.log('URL=', page.url())
  await page.waitForTimeout(1500)

  // 抓当前步骤正文区所有字段
  const fields = await page.evaluate(() => {
    const out = []
    const grab = (sel, lbl) => {
      document.querySelectorAll(sel).forEach(el => {
        const value = el.value !== undefined ? el.value : (el.textContent || '').trim()
        const label = lbl || (el.placeholder || '')
        out.push({ type: el.tagName, label, value: String(value).slice(0, 120) })
      })
    }
    grab('input:not([type=hidden])')
    grab('textarea')
    grab('select')
    // 可编辑 contenteditable
    document.querySelectorAll('[contenteditable=true]').forEach(el => out.push({ type: 'EDITABLE', label: '', value: (el.textContent || '').trim().slice(0, 120) }))
    return out
  }).catch(e => 'ERR:' + e.message)
  console.log('===== STEP FIELDS =====')
  console.log(JSON.stringify(fields, null, 1))

  // 卷/章节相关文本
  const volText = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*'))
      .filter(e => e.children.length === 0 && /卷第|卷数|章|卷标题|卷摘要|第.{1,4}卷/.test(e.textContent || '') && (e.textContent || '').trim().length < 60)
      .map(e => (e.textContent || '').trim()).slice(0, 40)
  }).catch(() => 'ERR')
  console.log('===== VOL/CHAP TEXT SNIPPETS =====')
  console.log(JSON.stringify(volText, null, 1))
  await page.screenshot({ path: 'wizard_chapdiv.png', fullPage: true }).catch(() => {})
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })