// 探针：诊断 JOB_MAP 匹配与当前 job 值
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

const JOB_MAP = {
  '朱由榔': '明朝皇帝（永历朝主角）',
  '玉竹': '永历帝贴身丫鬟',
  '丁魁楚': '广西巡抚（降清，前期反派）',
}

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const res = await page.evaluate(async ({ api, nid }) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    return { status: r.status, data: (j && (j.data || j)) || {} }
  }, { api: '/tuzhong-wenshu/api/settings', nid: NID })
  await ctx.close()
  const CH = res.data.characters || {}
  const list = []
  const add = o => { if (o && typeof o === 'object' && o.name) list.push(o) }
  add(CH.protagonist); add(CH.femaleLead); add(CH.antagonist)
  ;(CH.femaleLeads||[]).forEach(add); (CH.antagonists||[]).forEach(add); (CH.supporting||[]).forEach(add)
  const has = v => !(v===undefined||v===null||(typeof v==='string'&&String(v).trim()===''))
  list.forEach(c => {
    const nm = String(c.name).trim()
    const mapped = JOB_MAP[nm]
    console.log((mapped?'MAP ':'---- ') + nm + ' | role=' + (c.role||c.rolePosition) + ' | tag=' + (c.tag||'') + ' | job=' + JSON.stringify(c.job) + ' | mapped=' + JSON.stringify(mapped))
  })
  console.log('total=', list.length)
})().catch(e => { console.error('FATAL', e); process.exit(1) })