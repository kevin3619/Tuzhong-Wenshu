// 将在线《永历中兴》角色数据的 birthplace + arcNodes 按正史/设计修正
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const birthFix = require(path.join(__dirname, '_fix_birthplace.json'))
const arcFix = require(path.join(__dirname, '_fix_arcs.json'))

function collectRefs(chars) {
  // 兼容数组与单对象：返回 { ref, } 引用数组，供直接改字段
  const refs = []
  const each = (v) => { if (v && typeof v === 'object') { if ('name' in v) refs.push(v) } }
  if (!chars || typeof chars !== 'object') return refs
  for (const k of Object.keys(chars)) {
    const v = chars[k]
    if (Array.isArray(v)) v.forEach(each)
    else each(v)
  }
  return refs
}

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

  const result = await page.evaluate(async ({ nid, birthFix, arcFix }) => {
    const token = localStorage.getItem('token') || ''
    const getRes = await fetch('/tuzhong-wenshu/api/settings?novelId=' + nid, {
      headers: { Authorization: 'Bearer ' + token },
    })
    const getJson = await getRes.json().catch(() => ({}))
    const chars = (getJson.data || {}).characters || {}
    let patched = 0, skipped = 0, arcPatched = 0
    const refs = []
    const each = (v) => { if (v && typeof v === 'object' && 'name' in v) refs.push(v) }
    for (const k of Object.keys(chars)) {
      const v = chars[k]
      if (Array.isArray(v)) v.forEach(each); else each(v)
    }
    for (const r of refs) {
      const name = r.name || ''
      const b = birthFix[name]
      const a = arcFix[name]
      if (b) { r.birthplace = b; patched++ } else skipped++
      if (a) { r.arcNodes = a; arcPatched++ }
    }
    const saveRes = await fetch('/tuzhong-wenshu/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ novelId: nid, type: 'characters', ...chars }),
    })
    const saveJson = await saveRes.json().catch(() => ({}))
    return { patched, skipped, arcPatched, saveSuccess: saveJson.success, refs: refs.map(r => ({ name: r.name, bp: (r.birthplace || '').slice(0, 20) })) }
  }, { nid: NID, birthFix, arcFix })

  console.log(JSON.stringify({ ...result, refs: result.refs }, null, 1).slice(0, 3000))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })