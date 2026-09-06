// 对比 tuzhong-generated-data 与 draft-data 两个 key 中永历角色的差异
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
  // 直接读 localStorage，不进入向导（数据已存在）
  const dump = await page.evaluate(() => {
    const out = {}
    const id = localStorage.getItem('tuzhong-active-novel-id') || ''
    const fmt = (x) => ({ name: x.name, role: x.role, personality: String(x.personality || '').slice(0, 60) })
    const collect = (key, label) => {
      try {
        const g = JSON.parse(localStorage.getItem(key))
        const c = g && g.characters
        if (!c) { out[label] = 'NO_CHARS'; return }
        const res = {}
        const scan = (tag, x) => { if (x && x.name && ['朱由崧','朱聿键','朱聿鐭','郑成功','李定国'].includes(x.name)) res[x.name + '/'+ tag] = fmt(x) }
        if (c.protagonist) scan('主角', c.protagonist)
        if (c.femaleLead) scan('女主', c.femaleLead)
        ;(c.antagonists || []).forEach((x) => scan('反派', x))
        ;(c.supporting || []).forEach((x) => scan('配角', x))
        out[label] = res
      } catch (e) { out[label] = 'ERR ' + e.message }
    }
    collect('tuzhong-generated-data', 'GENERATED')
    collect('tuzhong-draft-data-' + id, 'DRAFT')
    return out
  }).catch((e) => 'ERR:' + e.message)
  console.log(JSON.stringify(dump, null, 1))
  await ctx.close()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })