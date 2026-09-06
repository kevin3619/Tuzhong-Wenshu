// 线上调用「一键校正徽章与定位」API，精确复刻前端校正流程：
// GET settings（取 characters）→ POST /api/characters/normalize → 用返回的规范化 characters 批量写回 settings
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1200, height: 800 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 60)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(10000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)

  const res = await page.evaluate(async () => {
    const token = localStorage.getItem('token') || ''
    const API = '/tuzhong-wenshu/api'
    // 1. GET 当前 settings
    const getR = await fetch(API + '/settings?novelId=' + '40249ecb-3bf6-434c-ad94-15dfeabc88ea', {
      headers: { Authorization: 'Bearer ' + token },
    })
    const getJ = await getR.json().catch(() => ({}))
    const d = (getJ.data || getJ) || {}
    const characters = d.characters || {}
    const startCount = (() => {
      const f = (o) => (Array.isArray(o) ? o.length : o ? 1 : 0)
      return f(characters.protagonist) + f(characters.femaleLead) + f(characters.antagonist) + f(characters.antagonists) + f(characters.supporting) + f(characters.femaleLeads)
    })()
    // 2. 调用 normalize
    const nR = await fetch(API + '/characters/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ characters: characters, genre: '架空历史', keywords: '系统流明朝南明永历', fillTitles: true }),
    })
    const nJ = await nR.json().catch(() => ({}))
    const nd = nJ.data || {}
    const normChars = nd.characters || characters
    const normCount = (() => {
      const f = (o) => (Array.isArray(o) ? o.length : o ? 1 : 0)
      return f(normChars.protagonist) + f(normChars.femaleLead) + f(normChars.antagonist) + f(normChars.antagonists) + f(normChars.supporting) + f(normChars.femaleLeads)
    })()
    // 3. 写回 settings
    const postR = await fetch(API + '/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ novelId: '40249ecb-3bf6-434c-ad94-15dfeabc88ea', type: 'batch', characters: normChars }),
    })
    const postJ = await postR.json().catch(() => ({}))
    return {
      getStatus: getR.status,
      normStatus: nR.status,
      normSuccess: nJ.success,
      changed: nd.changed,
      removedDupes: nd.removedDupes,
      titlesFilled: nd.titlesFilled,
      total: nd.total,
      historicalApplied: nd.historicalApplied,
      onlineApplied: nd.onlineApplied,
      titleDebug: nd.titleDebug,
      startCount,
      normCount,
      postStatus: postR.status,
      postSuccess: postJ.success,
    }
  })
  console.log(JSON.stringify(res, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })