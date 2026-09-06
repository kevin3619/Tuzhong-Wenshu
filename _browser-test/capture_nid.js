// 捕获向导实际调用的 /api/settings 及 novelId
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  const seen = new Map()
  page.on('response', async (r) => {
    if (/\/api\/settings/.test(r.url()) && r.request().method() === 'GET') {
      const u = new URL(r.url())
      const nid = u.searchParams.get('novelId') || ''
      if (!seen.has(nid)) {
        seen.set(nid, true)
        console.log('SETTINGS_GET novelId=' + nid)
        try {
          const j = await r.json()
          const d = (j.data || j)
          console.log('  http=' + r.status() + ' topKeys=' + Object.keys(d).slice(0,20).join(',') + ' (depth1)')
          console.log('  volumeLen=' + (Array.isArray(d.chapters) ? 'chapters[]' : (d.chapters ? Object.keys(d.chapters).length : d.chapters)))
        } catch(e) { console.log('  err ' + e.message) }
      }
    }
  })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2000) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(3000) }
  await page.waitForTimeout(4000)
  // 也读 localStorage novelId 相关键
  const ls = await page.evaluate(() => {
    const out = {}
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/novel|id/i.test(k)) out[k] = localStorage.getItem(k).slice(0, 80) }
    return out
  }).catch(()=>'ERR')
  console.log('LS_NOVEL_KEYS=', JSON.stringify(ls, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })