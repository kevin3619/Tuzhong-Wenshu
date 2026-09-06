// 探查 localStorage 中 chapters/factions 详细结构
const { chromium } = require('playwright-core')
const path = require('path')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1200, height: 800 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto('https://tuzhongwang.xyz/tuzhong-wenshu', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const info = await page.evaluate((nid) => {
    const raw = localStorage.getItem('tuzhong-draft-data-' + nid)
    if (!raw) return { error: 'no draft data' }
    const d = JSON.parse(raw)
    const out = {}
    // chapters 结构
    const ch = d.chapters
    if (ch && typeof ch === 'object') {
      out.chaptersKeys = Object.keys(ch)
      out.chaptersVolumes = Array.isArray(ch.volumes) ? ch.volumes.length : (ch.volumes === undefined ? 'UNDEF' : typeof ch.volumes)
      out.chaptersChapters = Array.isArray(ch.chapters) ? ch.chapters.length : (ch.chapters === undefined ? 'UNDEF' : typeof ch.chapters)
      out.chaptersGenerated = Array.isArray(ch.generatedContent) ? ch.generatedContent.length : (ch.generatedContent === undefined ? 'UNDEF' : typeof ch.generatedContent)
      if (Array.isArray(ch.volumes) && ch.volumes.length) {
        out.vol0 = {
          name: String(ch.volumes[0].name || '').slice(0, 30),
          summary: String(ch.volumes[0].summary || '').slice(0, 30),
          chCount: Array.isArray(ch.volumes[0].chapters) ? ch.volumes[0].chapters.length : 'none',
        }
      }
    } else {
      out.chapters = typeof ch
    }
    // factions powerRank/strengthTier 实际值
    const fac = d.factions
    if (fac && typeof fac === 'object') {
      const list = Array.isArray(fac.factions) ? fac.factions : (Array.isArray(fac) ? fac : [])
      out.factionCount = list.length
      out.powerRankValues = list.map(f => String(f.powerRank || '').slice(0, 20))
      out.strengthTierValues = list.map(f => String(f.strengthTier || '').slice(0, 20))
    }
    return out
  }, NID)
  console.log(JSON.stringify(info, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
