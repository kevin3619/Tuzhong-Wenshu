// 线上数据审计：《永历中兴》角色 birthplace + arcNodes 去重核查
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1280, height: 900 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(3000)

  const result = await page.evaluate(async ({ nid }) => {
    const token = localStorage.getItem('token') || ''
    const res = await fetch('/tuzhong-wenshu/api/settings?novelId=' + nid, {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    })
    const j = await res.json().catch(() => ({}))
    const chars = (j.data || {}).characters || {}
    // 遍历所有角色引用
    const refs = []
    const each = (v) => { if (v && typeof v === 'object' && 'name' in v) refs.push(v) }
    for (const k of Object.keys(chars)) { const v = chars[k]; if (Array.isArray(v)) v.forEach(each); else each(v) }

    const placeholder = /生于前明|自幼长|当地风土|占位|TODO|TBD|待补|同[前上]|当地/
    const report = []
    const allArcKeys = new Map()
    for (const r of refs) {
      const name = r.name || '(无名字)'
      const bp = (r.birthplace || '').trim()
      const isPh = placeholder.test(bp) || !bp || bp.length < 4
      const arcs = Array.isArray(r.arcNodes) ? r.arcNodes : []
      const seen = new Set(); let dup = 0
      for (const a of arcs) {
        const key = `${(a.stage||'')}|${(a.event||'')}|${(a.change||'')}|${(a.powerLevel||'')}`.trim()
        if (key) { if (seen.has(key)) dup++; seen.add(key); allArcKeys.set(key, (allArcKeys.get(key)||0)+1) }
      }
      report.push({ name, bp: bp.slice(0,40), bpOk: !isPh, arcCount: arcs.length, arcDup: dup, arcStages: arcs.map(a=>a.stage||'?') })
    }
    // 跨角色重复弧光模板
    let crossDup = 0
    const cross = []
    for (const [k, c] of allArcKeys) { if (c > 1) { crossDup++; cross.push({ key: k.slice(0,40), count: c }) } }
    return { totalChars: refs.length, phPlaceholderCount: report.filter(r=>!r.bpOk), report: report.slice(0,60), crossDup, crossSample: cross.slice(0,10) }
  }, { nid: NID })

  console.log(JSON.stringify(result, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })