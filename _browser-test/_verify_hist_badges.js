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
    return (j && (j.data || j)) || {}
  }, { api: '/tuzhong-wenshu/api/settings', nid: NID })
  await ctx.close()
  const CH = res.characters || {}
  const all = []
  const add = (x) => { if (x && x.name) all.push(x) }
  add(CH.protagonist); add(CH.femaleLead)
  ;(CH.femaleLeads||[]).forEach(add); (CH.antagonists||[]).forEach(add); (CH.supporting||[]).forEach(add)
  const byName = {}
  all.forEach(c => { if (!byName[String(c.name).trim()]) byName[String(c.name).trim()] = c })
  console.log('=== 关键历史人物徽章核验 ===')
  const checks = [
    ['朱由榔','永历帝'],['多铎','豫亲王'],['多尔衮','摄政王'],['李定国','晋王'],['孙可望','秦王'],
    ['刘文秀','南川王'],['张献忠','大西皇帝'],['瞿式耜','东阁大学士'],['李自成','大顺皇帝'],
    ['吴三桂','平西王'],['史可法','兵部尚书'],['孔有德','定南王'],['郑成功','延平王'],['阎应元','典史'],
    ['马士英','东阁大学士'],['丁魁楚',''],['玉竹','贴身丫鬟']
  ]
  let bad = 0
  checks.forEach(function(pair){
    var nm=pair[0], expect=pair[1]
    var c=byName[nm]
    if(!c){ console.log('  [缺失] '+nm); bad++; return }
    var t=String(c.title||'').trim()
    var ok = !expect || t.indexOf(expect)>=0
    var extra = (!ok) ? ('  期望含:'+expect) : ''
    console.log('  '+(ok?'OK':'!!')+' '+nm+' | 徽章="'+t+'" | 定位="'+String(c.rolePosition||c.role||'')+'" | job="'+String(c.job||'')+'"'+extra)
    if(!ok) bad++
  })
  console.log('异常数='+bad)
})().catch(e=>{ console.error('FATAL', e); process.exit(1) })