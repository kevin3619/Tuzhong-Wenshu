// 打印真实 /api/settings 响应原文（text）与各个环节完整结构，供离线审计
const { chromium } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const OUT = path.join(__dirname, 'yongli_settings.json')
const TPL_MARKERS = ['性格鲜明','为人处世有其独特原则','多面性的性格','有着自己的坚持和信念','在故事中展现出','形象独特','关键角色生成','神秘人物','由AI','自动添加','待补充']
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  // 先导航进入向导，保证在正确页面上下文
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2000) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(3000) }
  await page.waitForTimeout(3000)

  // 页面内 fetch，保留 cookies/headers
  const res = await page.evaluate(async (nid) => {
    const r = await fetch(`/tuzhong-wenshu/api/settings?novelId=${nid}`, { headers: { 'Accept': 'application/json' } })
    const text = await r.text()
    let parsed = null
    try { parsed = JSON.parse(text) } catch (e) { parsed = { rawPrefix: text.slice(0, 300) } }
    return { status: r.status, parsed }
  }, NID)
  console.log('STATUS=' + res.status)
  const d = res.parsed && (res.parsed.data || res.parsed)
  if (res.status === 200 && d && typeof d === 'object' && !d.rawPrefix) {
    fs.writeFileSync(OUT, JSON.stringify(d, null, 2))
    console.log('SAVED size=', fs.statSync(OUT).size)
    // 概要
    const count = (v) => Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 'null')
    console.log('TOP=' + JSON.stringify(Object.keys(d)))
    console.log('SIZES=' + JSON.stringify({ characters: count(d.characters), factions: count(d.factions), relationships: count(d.relationships), worldbuilding: count(d.worldbuilding), powerSystem: count(d.powerSystem), keyPlots: count(d.keyPlots), chapters: count(d.chapters), synopsis: count(d.synopsis), outline: count(d.outline) }))
  } else {
    console.log('NOT_OK detail=', JSON.stringify(res.parsed).slice(0, 800))
  }
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })