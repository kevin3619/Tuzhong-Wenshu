// 检查持久化 profile 中 永历中兴 的 localStorage 草稿数据状态
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
    const out = {}
    const g = (k) => {
      try {
        const v = localStorage.getItem(k)
        if (!v) return null
        let parsed = null
        try { parsed = JSON.parse(v) } catch { parsed = { rawLen: v.length } }
        return parsed
      } catch { return null }
    }
    out.activeNovel = localStorage.getItem('tuzhong-active-novel-id')
    out.draftData = g('tuzhong-draft-data-' + nid)
    out.draftStep = localStorage.getItem('tuzhong-draft-step-' + nid)
    out.draftChapters = g('tuzhong-draft-chapters-' + nid)
    out.draftIdx = g('tuzhong-drafts-index')
    return out
  }, NID)
  const dd = info.draftData
  const dc = info.draftChapters
  console.log('activeNovel=' + info.activeNovel)
  console.log('draftStep=' + info.draftStep)
  console.log('draftData type=' + (dd === null ? 'NULL' : Array.isArray(dd) ? 'ARRAY len=' + dd.length : typeof dd) + (dd && typeof dd === 'object' && !Array.isArray(dd) ? ' keys=' + Object.keys(dd).join(',') : ''))
  if (dd && typeof dd === 'object' && !Array.isArray(dd)) {
    for (const k of Object.keys(dd)) {
      const v = dd[k]
      if (k === 'characters' && v && typeof v === 'object') {
        const prot = v.protagonist || {}
        console.log('  characters.protagonist.job=' + JSON.stringify(prot.job) + ' goal=' + JSON.stringify(prot.goal) + ' camp=' + JSON.stringify(prot.camp))
        const cntEmpty = (o) => { let n = 0; const w = (x) => { if (!x || typeof x !== 'object') return; for (const kk of Object.keys(x)) { const vv = x[kk]; if (vv === null || vv === undefined || (typeof vv === 'string' && vv.trim() === '')) n++; else if (typeof vv === 'object') w(vv) } }; w(o); return n }
        console.log('  characters empty count=' + cntEmpty(v))
      } else if (k === 'chapters' && v && typeof v === 'object') {
        console.log('  chapters.volumes=' + (Array.isArray(v.volumes) ? v.volumes.length : 'none') + ' chapters=' + (Array.isArray(v.chapters) ? v.chapters.length : 'none'))
      } else {
        console.log('  ' + k + ' = ' + (typeof v === 'string' ? v.slice(0, 80) : Array.isArray(v) ? 'arr(' + v.length + ')' : typeof v))
      }
    }
  }
  console.log('draftChapters=' + (dc === null ? 'NULL' : (Array.isArray(dc) ? 'ARR(' + dc.length + ')' : typeof dc)))
  console.log('draftIdx count=' + (info.draftIdx && Array.isArray(info.draftIdx) ? info.draftIdx.length : 'none'))
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
