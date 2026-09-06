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
  // 提取所有"| 名字 |...|"形式的角色定义行（可能是人物卡的表格行）
  const charRows = d.split('\n').filter(l => /^\s*\|/.test(l)).slice(0, 120)
  return { charRows, roleKeywords: charRows.filter(r => /主角|女主|配角|反派|女主|女性/.test(r)) }
})
fs.writeFileSync(path.join(ROOT, 'fl_probe3.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out.charRows, null, 2))
await ctx.close().catch(() => {}); process.exit(0)