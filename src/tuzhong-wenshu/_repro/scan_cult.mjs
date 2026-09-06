import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: false, viewport: { width: 1400, height: 900 },
})
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
const out = await page.evaluate(() => {
  const CULT = /修仙|修真|仙侠|炼气|筑基|金丹|元婴|化神|飞升|灵根|丹田|洪荒|剑修|符道/
  const hits = []
  Object.keys(localStorage).forEach(k => {
    if (!k.startsWith('tuzhong-draft-data-')) return
    try {
      const d = JSON.parse(localStorage.getItem(k) || '{}')
      const walk = (o, pfx) => {
        if (o == null) return
        if (typeof o === 'string') {
          if (CULT.test(o)) hits.push({ key: k, path: pfx, snippet: o.substring(0, 80) })
          return
        }
        if (Array.isArray(o)) { o.forEach((v,i)=>walk(v, pfx+'['+i+']')); return }
        if (typeof o === 'object') { Object.keys(o).forEach(f=>walk(o[f], pfx?pfx+'.'+f:f)); }
      }
      walk(d, '')
    } catch(e) {}
  })
  return hits
})
fs.writeFileSync(path.join(ROOT, 'cult_scan.log'),
  'total cult hits in storage: ' + out.length + '\n' +
  out.map(h => `[${h.key}] ${h.path} :: ${h.snippet}`).join('\n'))
console.log('cult hits=' + out.length)
await ctx.close().catch(()=>{}); process.exit(0)