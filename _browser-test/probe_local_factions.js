// 详细检查 localStorage 中 factions/chapters 数据
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
    try {
      const v = localStorage.getItem('tuzhong-draft-data-' + nid)
      if (!v) return { err: 'no draft data' }
      const dd = JSON.parse(v)
      // factions
      const fac = dd.factions || {}
      const facArr = Array.isArray(fac) ? fac : (Array.isArray(fac.factions) ? fac.factions : [])
      out.factionsCount = facArr.length
      out.factionsSample = facArr.slice(0, 3).map(f => ({
        name: f.name, leader: f.leader, territory: f.territory, strength: f.strength,
        powerRank: f.powerRank, symbol: f.symbol, culture: f.culture,
        internalFactions: Array.isArray(f.internalFactions) ? f.internalFactions.length : typeof f.internalFactions,
        coreResources: Array.isArray(f.coreResources) ? f.coreResources.length : typeof f.coreResources,
        flagshipFigures: Array.isArray(f.flagshipFigures) ? f.flagshipFigures.length : typeof f.flagshipFigures,
        allies: Array.isArray(f.allies) ? f.allies.length : typeof f.allies,
        enemies: Array.isArray(f.enemies) ? f.enemies.length : typeof f.enemies,
        philosophy: (f.philosophy || '').slice(0, 30),
        hiddenAgenda: (f.hiddenAgenda || '').slice(0, 20),
        trumpCard: (f.trumpCard || '').slice(0, 20),
        historyGrudges: (f.historyGrudges || '').slice(0, 20),
        relationToProtagonist: (f.relationToProtagonist || '').slice(0, 20),
        strengthTier: (f.strengthTier || '').slice(0, 20),
        coreConflict: (f.coreConflict || '').slice(0, 20),
        developmentTrajectory: (f.developmentTrajectory || '').slice(0, 30),
      }))
      // chapters
      const ch = dd.chapters || {}
      out.chaptersKeys = Object.keys(ch)
      out.volumes = Array.isArray(ch.volumes) ? ch.volumes.length : (ch.volumes ? 'obj' : 'none')
      out.chaptersArr = Array.isArray(ch.chapters) ? ch.chapters.length : (ch.chapters ? 'obj' : 'none')
      if (Array.isArray(ch.volumes) && ch.volumes.length) {
        out.volSample = ch.volumes.slice(0, 3).map(v => ({ title: v.title, summary: (v.summary || '').slice(0, 50), count: v.count }))
      }
      // 空值扫描 factions
      const scan = (o, depth) => {
        let n = 0
        const w = (x, d) => {
          if (!x || typeof x !== 'object' || d > 6) return
          for (const k of Object.keys(x)) {
            const vv = x[k]
            if (vv === null || vv === undefined || (typeof vv === 'string' && vv.trim() === '')) n++
            else if (Array.isArray(vv) && vv.length === 0) n++
            else if (typeof vv === 'object') w(vv, d + 1)
          }
        }
        w(o, 0)
        return n
      }
      out.factionsEmpty = scan(fac, 0)
      out.chaptersEmpty = scan(ch, 0)
      out.relationshipsEmpty = scan(dd.relationships || {}, 0)
    } catch (e) { out.err = e.message }
    return out
  }, NID)
  console.log(JSON.stringify(info, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
