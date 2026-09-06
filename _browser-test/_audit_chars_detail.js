// 线上《永历中兴》characters 细节审计：定位空数组、玉竹职位、所有历史人物徽章/定位/job
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
    return { status: r.status, data: (j && (j.data || j)) || {} }
  }, { api: '/tuzhong-wenshu/api/settings', nid: NID })
  await ctx.close()
  const CH = res.data.characters || {}

  // 1) 定位空数组
  console.log('=== EMPTY ARRAYS ===')
  for (const k of ['femaleLeads','_harem','antagonists','supporting']) {
    if (Array.isArray(CH[k]) && CH[k].length === 0) console.log('  empty array:', k)
  }

  // 2) 玉竹详情
  console.log('=== 女主 玉竹 ===')
  const fl = CH.femaleLead
  console.log('  name=', fl && fl.name, '| title=', fl && fl.title, '| rolePosition=', fl && (fl.rolePosition||fl.role), '| job=', fl && fl.job, '| identity=', fl && fl.identity, '| camp=', fl && fl.camp)

  // 3) 所有角色徽章/定位/job + 是否有空
  console.log('=== 全部角色徽章/定位/job（是否空值）===')
  const all = []
  const add = (tag, x) => { if (x && x.name) all.push({ tag, name: String(x.name), title: String(x.title||''), pos: String(x.rolePosition||x.role||''), job: String(x.job||'') }) }
  add('主角', CH.protagonist); add('女主', CH.femaleLead);
  (CH.femaleLeads||[]).forEach(x=>add('女主',x))
  ;(CH.antagonists||[]).forEach(x=>add('反派',x))
  ;(CH.supporting||[]).forEach(x=>add('配角',x))
  const emptyRows = all.filter(c => !c.title.trim() || !c.pos.trim() || !c.job.trim())
  console.log('  角色总数=', all.length, '| 存在空徽章/定位/job 的角色=', emptyRows.length)
  emptyRows.forEach(c => console.log('  EMPTY:', c.tag, c.name, '| title="'+c.title+'" | pos="'+c.pos+'" | job="'+c.job+'"'))
})().catch(e => { console.error('FATAL', e); process.exit(1) })