// 探查线上 localStorage 草稿数据 key 与 chapters 结构
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    if (t.includes('分卷章节划分') || t.includes('输入主题') || t.includes('返回书架')) { page = p; break }
  }
  if (!page) {
    page = ctx.pages()[0] || await ctx.newPage()
    page.setDefaultTimeout(10000)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
  }
  page.setDefaultTimeout(10000)

  const info = await page.evaluate((nid) => {
    const out = { draftKeys: [], stepModelKeys: [], activeNovelId: localStorage.getItem('tuzhong-active-novel-id'), chaptersKeys: [], draftData: null, draftChapters: null }
    // 列出所有草稿相关 key
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.includes('tuzhong')) out.draftKeys.push(k)
    }
    // 主草稿数据
    const rawData = localStorage.getItem('tuzhong-draft-data-' + nid)
    if (rawData) {
      try {
        const d = JSON.parse(rawData)
        out.draftData = {
          size: rawData.length,
          topKeys: Object.keys(d),
          hasChapters: d.chapters !== undefined,
          chaptersType: typeof d.chapters,
          synopsis: !!d.synopsis,
          keyPlots: !!d.keyPlots,
          outline: !!d.outline,
        }
        if (d.chapters && typeof d.chapters === 'object') {
          out.draftData.chaptersKeys = Object.keys(d.chapters)
          out.draftData.volumes = Array.isArray(d.chapters.volumes) ? d.chapters.volumes.length : String(d.chapters.volumes)
          out.draftData.chapters = Array.isArray(d.chapters.chapters) ? d.chapters.chapters.length : String(d.chapters.chapters)
          if (Array.isArray(d.chapters.volumes) && d.chapters.volumes.length) {
            out.draftData.vol0 = {
              name: String(d.chapters.volumes[0].name || '').slice(0, 30),
              summary: String(d.chapters.volumes[0].summary || '').slice(0, 30),
            }
          }
        }
        // keyPlots 结构
        if (d.keyPlots && typeof d.keyPlots === 'object') {
          out.draftData.keyPlotsKeys = Object.keys(d.keyPlots)
          out.draftData.keyPlotsCount = Array.isArray(d.keyPlots.keyPlots) ? d.keyPlots.keyPlots.length : String(d.keyPlots.keyPlots)
          out.draftData.keyPlotsVolumes = Array.isArray(d.keyPlots.volumes) ? d.keyPlots.volumes.length : String(d.keyPlots.volumes)
        }
      } catch (e) { out.draftData = 'PARSE_ERR: ' + e.message }
    } else {
      out.draftData = 'NO_KEY'
    }
    // 章节草稿
    const rawCh = localStorage.getItem('tuzhong-draft-chapters-' + nid)
    if (rawCh) {
      try {
        const c = JSON.parse(rawCh)
        out.draftChapters = { size: rawCh.length, keys: Object.keys(c) }
        if (Array.isArray(c)) out.draftChapters.len = c.length
        else if (c.volumes) out.draftChapters.volumes = c.volumes.length
      } catch (e) { out.draftChapters = 'PARSE_ERR' }
    } else {
      out.draftChapters = 'NO_KEY'
    }
    return out
  }, NID)
  console.log(JSON.stringify(info, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
