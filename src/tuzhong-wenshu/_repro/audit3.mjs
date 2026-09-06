import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 1000 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const LOG = path.join(ROOT, 'audit3.log')
const push = k => fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${k}\n`)

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)

// 1) 找到 永历中兴 草稿
const draftInfo = await page.evaluate(() => {
  const idx = JSON.parse(localStorage.getItem('tuzhong-drafts-index') || '[]')
  return idx
})
push('drafts-index=' + JSON.stringify(draftInfo).slice(0, 1000))
let targetId = null
for (const d of Array.isArray(draftInfo) ? draftInfo : []) {
  if (d && d.title && String(d.title).includes('永历')) targetId = d.title
}
if (!targetId) {
  // 从 localStorage keys 找含永历的草稿
  const got = await page.evaluate(() => {
    const out = {}
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('tuzhong-draft-index-') || k.startsWith('tuzhong-draft-theme-')) {
        try { out[k] = JSON.parse(localStorage.getItem(k)) || localStorage.getItem(k) } catch { out[k] = localStorage.getItem(k) }
      }
    }
    return out
  })
  push('draft-theme-keys=' + JSON.stringify(Object.keys(got)))
  for (const k of Object.keys(got)) {
    const v = JSON.stringify(got[k])
    if (v.includes('永历')) { targetId = (k.split('tuzhong-draft-theme-')[1] || ''); push('found theme key=' + k + ' => id=' + targetId) }
  }
}
push('targetId=' + String(targetId))
await ctx.close().catch(() => {}); process.exit(0)