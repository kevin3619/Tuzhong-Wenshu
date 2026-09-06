// 线上：核查跨角色 arcNodes 是否用同一套"模板文本"重复（event/change 全文比对）
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1280, height: 900 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(2000)
  const result = await page.evaluate(async ({ nid }) => {
    const token = localStorage.getItem('token') || ''
    const res = await fetch('/tuzhong-wenshu/api/settings?novelId=' + nid, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    const j = await res.json().catch(() => ({}))
    const chars = (j.data || {}).characters || {}
    const refs = []
    const each = (v) => { if (v && typeof v === 'object' && 'name' in v) refs.push(v) }
    for (const k of Object.keys(chars)) { const v = chars[k]; if (Array.isArray(v)) v.forEach(each); else each(v) }
    // 收集每个角色 5 阶段 event 全文
    const byStage = {} // stage -> { eventText -> [charName...] }
    const perChar = refs.map(r => ({ name: r.name, arcs: (r.arcNodes||[]).map(a=>({stage:a.stage||'', event:(a.event||'').trim(), change:(a.change||'').trim()})) }))
    let bad = 0
    const dupStage = []
    for (const rc of perChar) {
      for (const a of rc.arcs) {
        const key = (a.event + '|' + a.change).trim()
        if (!key) continue
        if (!byStage[a.stage]) byStage[a.stage] = {}
        if (!byStage[a.stage][key]) byStage[a.stage][key] = []
        byStage[a.stage][key].push(rc.name)
      }
    }
    for (const stage of Object.keys(byStage)) {
      for (const key of Object.keys(byStage[stage])) {
        const owners = byStage[stage][key]
        if (owners.length > 1) { bad++; dupStage.push({ stage, owners: owners.join(','), key: key.slice(0,36) }) }
      }
    }
    return { totalChars: refs.length, arcNStats: perChar.map(x=>x.arcs.length).reduce((a,n)=>({...a,[String(n)]:(a[String(n)]||0)+1}),{}), dupGroups: bad, samples: dupStage.slice(0,12) }
  }, { nid: NID })
  require('fs').writeFileSync(path.join(__dirname, '_arc_dup_out.json'), JSON.stringify(result, null, 1))
  console.log('WROTE _arc_dup_out.json dupGroups=', result.dupGroups)
  await ctx.close().catch(()=>{})
  process.exit(0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })