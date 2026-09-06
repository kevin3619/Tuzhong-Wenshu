// dump characters 字段的完整结构
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

  const dump = await page.evaluate(() => {
    const out = { charactersTopKeys: [], charactersDetail: {}, generatedTopKeys: [] }
    try {
      const j = JSON.parse(localStorage.getItem('tuzhong-draft-data-40249ecb-3bf6-434c-ad94-15dfeabc88ea'))
      const c = j.characters
      out.charactersTopKeys = Object.keys(c)
      // 每个顶层字段的 type 和前若干字符
      for (const k of Object.keys(c)) {
        const v = c[k]
        const t = Array.isArray(v) ? 'array[' + v.length + ']' : typeof v
        out.charactersDetail[k] = { type: t, preview: String(v).slice(0, 100) }
      }
    } catch (e) { out.err = e.message }
    // generated-data 的 characters
    try {
      const g = JSON.parse(localStorage.getItem('tuzhong-generated-data'))
      out.generatedTopKeys = Object.keys(g)
      if (g.characters) out.generatedCharacters = typeof g.characters === 'object' ? Object.keys(g.characters) : typeof g.characters
    } catch (e) {}
    return out
  }).catch(e => 'ERR:' + e.message)

  console.log(JSON.stringify(dump, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
