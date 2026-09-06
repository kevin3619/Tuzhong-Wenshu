// 线上《永历中兴》：定向修正3个历史人物徽章（title），不动其他字段
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const API = BASE + '/api/settings'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

const TITLE_FIX = { '张献忠': '大西皇帝', '瞿式耜': '东阁大学士', '阎应元': '典史' }

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(()=>{})
  await page.waitForTimeout(2500)

  const result = await page.evaluate(async ({ api, nid, api2, fixes }) => {
    const token = localStorage.getItem('token') || ''
    const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    const r = await fetch(api2 + '?novelId=' + nid, { headers: H })
    const j = await r.json()
    const data = (j && (j.data || j)) || {}
    const CH = data.characters || {}
    const all = []
    const add = (o) => { if (o && typeof o === 'object' && o.name) all.push(o) }
    add(CH.protagonist); add(CH.femaleLead)
    ;(CH.femaleLeads||[]).forEach(add); (CH.antagonist && !Array.isArray(CH.antagonist) ? [CH.antagonist] : CH.antagonist || []).forEach(add)
    ;(CH.antagonists||[]).forEach(add); (CH.supporting||[]).forEach(add)
    let n = 0
    all.forEach(c => {
      const nm = String(c.name).trim()
      if (fixes[nm]) {
        const before = String(c.title||'')
        c.title = fixes[nm]
        n++; console.log('  fix', nm, before, '->', fixes[nm])
      }
    })
    // POST 回写：批量更新 characters
    const pr = await fetch(api, { method: 'POST', headers: H, body: JSON.stringify({ novelId: nid, type: 'batch', characters: CH }) })
    const pj = await pr.json().catch(()=>({}))
    return { status: pr.status, fixed: n, resp: pj }
  }, { api: API, api2: BASE + '/api/settings', nid: NID, fixes: TITLE_FIX })
  await ctx.close()
  console.log('POST status=', result.status, '| fixed=', result.fixed, '| resp=', JSON.stringify(result.resp).slice(0,300))
})().catch(e => { console.error('FATAL', e); process.exit(1) })