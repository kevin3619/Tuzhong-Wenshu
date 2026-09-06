// DOM诊断：向导步骤栏 + 人物/势力步骤重生成按钮的真实结构与文案
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
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 60)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(10000)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)

  const dump = await page.evaluate(() => {
    const out = { sidebarBtns: [], buttons: [], h1: '', hasCharPage: false, hasFacPage: false }
    out.h1 = (document.querySelector('h1,h2,h3,h4')?.textContent || '').trim().slice(0, 40)
    const body = document.body.textContent || ''
    out.hasCharPage = body.includes('主要人物设定')
    out.hasFacPage = body.includes('势力设定')
    // 侧边步骤
    document.querySelectorAll('button, [role="tab"], [class*="step"], [class*="nav-item"], a').forEach(el => {
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ')
      if (t && t.length < 20 && /主要人物设定|势力设定|分卷章节|关键剧情|输入主题|世界|力量|关系|大纲|简介|生成草稿/.test(t)) {
        out.sidebarBtns.push(t)
      }
    })
    // 所有按钮+文本
    document.querySelectorAll('button').forEach(b => {
      const t = (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)
      if (t) out.buttons.push(t)
    })
    return out
  }).catch(e => 'ERR:' + e.message)

  console.log(JSON.stringify(dump, null, 1))
  await page.screenshot({ path: path.join(__dirname, 'diag_wizard_dom.png') }).catch(() => {})
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })