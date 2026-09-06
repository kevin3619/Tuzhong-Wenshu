// 检查线上浏览器 localStorage 中草稿《永历中兴》的快照状态（openDraft 读取的数据源）
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
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const result = await page.evaluate(() => {
    const out = { keys: [], draftKeys: [], dataKeys: null, step: null, chaptersInfo: null, activeId: null }
    try {
      for (let i = 0; i < localStorage.length; i++) out.keys.push(localStorage.key(i))
    } catch (e) { out.keys = ['ERR:' + e.message] }
    const activeId = localStorage.getItem('tuzhong-active-novel-id') || ''
    out.activeId = activeId
    const draftPrefix = 'tuzhong-draft-data-'
    out.draftKeys = out.keys.filter(k => k.startsWith(draftPrefix))
    const dataKey = draftPrefix + activeId
    const raw = localStorage.getItem(dataKey)
    if (raw) {
      try {
        const d = JSON.parse(raw)
        out.dataKeys = Object.keys(d)
        const ch = d.chapters
        out.chaptersInfo = {
          type: ch === null ? 'null' : typeof ch,
          isArray: Array.isArray(ch),
          volumes: ch && Array.isArray(ch.volumes) ? ch.volumes.length : (ch && ch.volumes ? String(ch.volumes).slice(0, 20) : 'ABSENT'),
          chapters: ch && Array.isArray(ch.chapters) ? ch.chapters.length : 'NA',
          keys: ch && typeof ch === 'object' ? Object.keys(ch).slice(0, 8) : null,
        }
        out.step = localStorage.getItem('tuzhong-draft-step-' + activeId) || localStorage.getItem('tuzhong-current-step') || 'NA'
      } catch (e) { out.dataKeys = ['JSON_ERR:' + e.message] }
    } else {
      out.dataKeys = 'NO_LOCAL_STORAGE_DRAFT'
    }
    // 全局键
    const gRaw = localStorage.getItem('tuzhong-generated-data')
    if (gRaw) {
      try {
        const g = JSON.parse(gRaw)
        out.globalDataKeys = Object.keys(g)
        out.globalChapters = g.chapters && Array.isArray(g.chapters.volumes) ? 'volumes=' + g.chapters.volumes.length : 'ABSENT'
      } catch (e) { out.globalDataKeys = ['ERR'] }
    }
    return out
  })
  console.log(JSON.stringify(result, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
