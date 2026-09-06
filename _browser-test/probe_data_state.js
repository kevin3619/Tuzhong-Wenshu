// 抓取向导恢复时的真实数据：/api/settings 响应结构 + localStorage 数据键
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  const settingsRes = []
  page.on('response', async (r) => {
    if (/\/api\/settings|novelId|novels/.test(r.url()) && r.request().method() === 'GET') {
      try {
        const u = new URL(r.url())
        const nid = u.searchParams.get('novelId') || u.searchParams.get('id') || ''
        const j = await r.json().catch(() => null)
        const d = (j && (j.data || j)) || {}
        const topKeys = typeof d === 'object' && d ? Object.keys(d) : []
        // 提取各环节计数
        const count = (obj) => Array.isArray(obj) ? obj.length : (obj && typeof obj === 'object' ? Object.keys(obj).length : 0)
        settingsRes.push({
          path: u.pathname.replace(/^.*\/api/, '/api'), nid: nid.slice(0, 12),
          topKeys,
          has_chapters: d.chapters ? true : false, chaptersLen: count(d.chapters),
          has_volumes: d.volumes ? true : false, volumesLen: count(d.volumes),
          has_keyPlots: d.keyPlots ? true : false, keyPlotsLen: count(d.keyPlots),
          has_factions: d.factions ? true : false, factionsLen: count(d.factions),
          has_relationships: d.relationships ? true : false, relLen: count(d.relationships),
          has_characters: d.characters ? true : false, charLen: count(d.characters),
        })
      } catch (e) {}
    }
  })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(1500) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(3000) }
  for (let i = 0; i < 20; i++) {
    const has = await page.evaluate(() => /分卷章节划分|主要人物设定|世界观设定/.test(document.body.innerText)).catch(() => false)
    if (has) break
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(1500)
  console.log('===== /api/settings RESPONSES =====')
  console.log(JSON.stringify(settingsRes, null, 1))
  const store = await page.evaluate(() => {
    const out = { localStorageKeys: [], generated: null }
    for (let i = 0; i < localStorage.length; i++) { out.localStorageKeys.push(localStorage.key(i)) }
    const raw = localStorage.getItem('tuzhong-generated-data')
    if (raw) {
      try {
        const d = JSON.parse(raw)
        const count = (o) => Array.isArray(o) ? o.length : (o && typeof o === 'object' ? Object.keys(o).length : 0)
        out.generated = { keys: Object.keys(d), chaptersLen: count(d.chapters), volumesLen: count(d.volumes), factionsLen: count(d.factions), relLen: count(d.relationships), keyPlotsLen: count(d.keyPlots), charLen: count(d.characters) }
      } catch (e) { out.generated = 'PARSE_ERR' }
    }
    out.step = localStorage.getItem('tuzhong-current-step')
    return out
  }).catch(e => 'ERR:' + e.message)
  console.log('===== LOCALSTORAGE =====')
  console.log(JSON.stringify(store, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })