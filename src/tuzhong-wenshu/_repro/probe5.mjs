import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), { channel: 'msedge', headless: true })
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2000)
const out = await page.evaluate(() => {
  const theme = JSON.parse(localStorage.getItem('tuzhong-draft-theme-d2010e15-03a4-4197-aca5-f572af6e9d94') || '{}')
  const d = theme.detailedDesignInput || ''
  // 提取女主/女性角色线索
  const flines = d.split('\n').filter(l => /女|妃|夫人|小姐|母亲|姐姐|妹妹|妻/.test(l)).slice(0, 20)
  return { fl: flines, fullLen: d.length, keys: Object.keys(theme) }
})
fs.writeFileSync(path.join(ROOT, 'fl_probe.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await ctx.close().catch(() => {}); process.exit(0)