// 全字段扫描 师门/模板 残留
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

  const scan = (o, path) => { if(o===null||o===undefined) return; if(Array.isArray(o)){ o.forEach((it,i)=>scan(it, path+'['+i+']')); return } if(typeof o==='object'){ for(const k in o) scan(o[k], path?path+'.'+k:k); return } if(typeof o==='string' && /师门|出身师门|恩师/.test(o)) console.log('HIT', path, '=', o.slice(0,60)) }
  console.log('=== 师门/恩师 命中 ===')
  all.forEach(c => { scan(c, c.name) })
  // also scan非字符字段
  scan(CH, 'characters(whole)')
})().catch(e => { console.error('FATAL', e); process.exit(1) })