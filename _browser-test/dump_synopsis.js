// 输出 synopsis 完整 JSON，便于据此补齐 6 个空字段
const { chromium } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1200, height: 800 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto('https://tuzhongwang.xyz/tuzhong-wenshu', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const res = await page.evaluate(async ({ api, nid }) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    return { status: r.status, synopsis: (j && (j.data || j))?.synopsis || {} }
  }, { api: '/tuzhong-wenshu/api/settings', nid: NID })
  console.log('STATUS=' + res.status)
  console.log('KEYS=' + JSON.stringify(Object.keys(res.synopsis)))
  fs.writeFileSync(path.join(__dirname, 'synopsis_dump.json'), JSON.stringify(res.synopsis, null, 2))
  const apiRes = res.synopsis
  // 打印每个字段前 200 字符
  for (const k of Object.keys(apiRes)) {
    const v = apiRes[k]
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    console.log('--- ' + k + ' (' + s.length + '): ' + s.slice(0, 200))
  }
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })