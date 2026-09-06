// 诊断2: 查看向导步骤栏 DOM 结构 (tag/class) 与 button 统计
const { chromium } = require('playwright-core')
const path = require('path')
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
  await page.waitForTimeout(1500)
  console.log('count button.wenshu-step-btn =',
    await page.locator('button.wenshu-step-btn').count().catch(e => 'ERR'))
  console.log('count .wenshu-step-btn =', await page.locator('.wenshu-step-btn').count().catch(e => 'ERR'))
  const info = await page.evaluate((steps) => {
    const res = []
    // 找包含全部步骤名的最近公共容器
    for (const s of steps) {
      let el = null
      const leaves = Array.from(document.querySelectorAll('*')).filter(e => e.childElementCount === 0 && (e.textContent || '').trim() === s)
      if (!leaves.length) { res.push({ step: s, found: false }); continue }
      el = leaves[0]
      // 向上收集 class 链直到容器明显
      const chain = []
      let t = el
      for (let i = 0; i < 5 && t; i++) { chain.push(t.tagName + '.' + String(t.className).split(' ').filter(Boolean).slice(0,4).join('.')); t = t.parentElement }
      const r = el.getBoundingClientRect()
      res.push({ step: s, found: true, y: Math.round(r.top), x: Math.round(r.left), chain })
    }
    return res
  }, STEPS)
  console.log(JSON.stringify(info, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })