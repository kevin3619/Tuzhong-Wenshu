// 诊断：进入向导后 dump 侧边栏步骤元素与点击目标，用于修正步骤切换
const { chromium } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const STEPS = ['输入主题','灵感创作','世界观设定','金手指设定','主要人物设定','势力设定','人物关系图谱','简介卖点','整体故事大纲','关键剧情节点','分卷章节划分','逐章生成正文','避坑检查','制作小说封面']

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(1500) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(2000) }
  for (let i = 0; i < 30; i++) {
    const has = await page.evaluate(() => /分卷章节划分/.test(document.body.innerText)).catch(() => false)
    if (has) break; await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(1200)
  console.log('URL=', page.url())
  const dump = await page.evaluate((steps) => {
    const out = []
    for (const s of steps) {
      const els = Array.from(document.querySelectorAll('*')).filter(e =>
        (e.childElementCount === 0) && (e.textContent || '').trim() === s)
      const info = els.map(e => {
        const r = e.getBoundingClientRect()
        // 找到可点击祖先
        let t = e, depth = 0, tag = e.tagName
        for (let i = 0; i < 8; i++) {
          const cs = getComputedStyle(t)
          if (t.tagName === 'BUTTON' || t.tagName === 'A' || cs.cursor === 'pointer' || t.getAttribute('role')) { tag = t.tagName + '#' + t.className; break }
          if (t.parentElement) t = t.parentElement
        }
        return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], clickable: tag }
      })
      out.push({ step: s, count: els.length, infos: info.slice(0, 3) })
    }
    return out
  }, STEPS)
  console.log(JSON.stringify(dump, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })