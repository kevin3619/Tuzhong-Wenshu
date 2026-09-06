// 定位 characters 内：师门背景的角色、空数组字段、extra反派
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(()=>{})
  await page.waitForTimeout(2500)
  const res = await page.evaluate(async ({ api, nid }) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    return { data: (j && (j.data || j)) || {} }
  }, { api: '/tuzhong-wenshu/api/settings', nid: NID })
  await ctx.close()
  const CH = res.data.characters || {}
  const all = []
  const add = o => { if (o && typeof o === 'object' && o.name) all.push(o) }
  add(CH.protagonist); add(CH.femaleLead); add(CH.antagonist)
  ;(CH.femaleLeads||[]).forEach(add); (CH.antagonists||[]).forEach(add); (CH.supporting||[]).forEach(add)

  console.log('=== 师门模板背景的角色 ===')
  all.forEach(c => {
    const b = String(c.background||'')
    if (b.indexOf('师门')>=0) console.log(c.name, '| background=', b.slice(0,70))
  })
  console.log('=== 空数组字段 ===')
  const recArr = (o, path) => { if(!o) return; if(Array.isArray(o)){ if(o.length===0) console.log('EMPTY_ARR', path); o.forEach((it,i)=>recArr(it, path+'['+i+']')); return } if(typeof o==='object') Object.keys(o).forEach(k=>recArr(o[k], path?path+'.'+k:k)) }
  recArr(CH, 'characters')
  console.log('=== extra反派 ===')
  ;(CH.antagonists||[]).slice(1).forEach(c => console.log('extra反:', c.name, 'role=', c.role, 'camp=', (c.camp||'').slice(0,12)))
})().catch(e => { console.error('FATAL', e); process.exit(1) })