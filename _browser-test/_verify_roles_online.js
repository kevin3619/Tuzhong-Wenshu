// 重新校验线上新角色定位选项：从当前线上页面枚举最新 chunk 逐个检索
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1400, height: 900 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(25000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3500)
  const scripts = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('script[src]').forEach(s => out.push(s.src))
    return out
  })
  console.log('SCRIPT_COUNT=', scripts.length)

  const MARKERS = ['大反派/终极Boss', '黑客', 'AI/机器人', '机甲驾驶员', '侦探', '经纪人', '公会会长', '异能者', '青梅竹马', '恋人']
  let foundAny = false
  for (const url of scripts) {
    if (!url.includes('/_next/static/chunks/')) continue
    let txt = ''
    try {
      const resp = await page.context().request.get(url)
      txt = await resp.text()
    } catch (e) { continue }
    for (const m of MARKERS) {
      if (txt.includes('主角亲信')) {
        // 命中角色模块？记录 chunk 含角色定位上下文数量
      }
      if (txt.includes(m)) {
        console.log('HIT markers=[' + m + '] in ' + url.split('/').pop())
        foundAny = true
      }
    }
  }
  if (!foundAny) console.log('NO_MARKERS_FOUND_ANYWHERE')
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })