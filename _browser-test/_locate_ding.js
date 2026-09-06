// 线上：定位《永历中兴》角色结构中 丁魁楚 的所有出现位置
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1280, height: 900 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(2000)
  const result = await page.evaluate(async ({ nid }) => {
    const token = localStorage.getItem('token') || ''
    const res = await fetch('/tuzhong-wenshu/api/settings?novelId=' + nid, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    const j = await res.json().catch(() => ({}))
    const chars = (j.data || {}).characters || {}
    const buckets = Object.keys(chars)
    const found = {}
    const walk = (obj, pathStr) => {
      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj)) {
          obj.forEach((it, i) => walk(it, pathStr + '[' + i + ']'))
        } else {
          if (obj.name === '丁魁楚') { (found[pathStr.split('[')[0]] = found[pathStr.split('[')[0]] || []).push(pathStr); }
          for (const k of Object.keys(obj)) walk(obj[k], pathStr + '.' + k)
        }
      }
    }
    walk(chars, '')
    return { buckets, found }
  }, { nid: NID })
  require('fs').writeFileSync(path.join(__dirname, '_locate_ding_out.json'), JSON.stringify(result, null, 1))
  console.log('WROTE _locate_ding_out.json')
  await ctx.close().catch(()=>{})
  process.exit(0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })