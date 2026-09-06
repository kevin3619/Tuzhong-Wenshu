const { chromium } = require('playwright-core')
const path = require('path')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
;(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '_browser-profile'), { channel: 'msedge', headless: true, args: ['--no-sandbox'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto('https://tuzhongwang.xyz/tuzhong-wenshu', { waitUntil: 'domcontentloaded' }).catch(()=>{})
  await page.waitForTimeout(2500)
  const res = await page.evaluate(async () => { const t = localStorage.getItem('token') || ''; const r = await fetch('/tuzhong-wenshu/api/settings?novelId=40249ecb-3bf6-434c-ad94-15dfeabc88ea', { headers: { Authorization: 'Bearer ' + t } }); const j = await r.json(); return (j && (j.data || j)) || {} })
  await ctx.close()
  const CH = res.characters || {}
  console.log('CHkeys=', Object.keys(CH).join(','))
  const c = CH.femaleLead
  console.log('femaleLead name=', c && c.name)
  console.log('femaleLead keys=', c && Object.keys(c).join(','))
  console.log('mentor=', JSON.stringify(c && c.mentor))
  const s = CH.supporting || []
  const hit = s.filter(x => x && x.name && String(x.mentor || '').indexOf('师门') >= 0)
  console.log('supporting师门数=', hit.length, hit.slice(0,3).map(x => x.name + '|' + JSON.stringify(x.mentor)))
})().catch(e => { console.error('FATAL', e); process.exit(1) })