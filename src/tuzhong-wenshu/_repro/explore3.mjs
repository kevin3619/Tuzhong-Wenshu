import { chromium } from 'playwright'
import path from 'path'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const PROFILE = path.join(ROOT, 'edge-profile')
const URL = 'http://localhost:3001/tuzhong-wenshu/write/d2010e15-03a4-4197-aca5-f572af6e9d94'

const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'msedge', headless: false, viewport: { width: 1440, height: 920 } })
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(5000)
console.log('URL:', page.url())
const dump = await page.evaluate(() => {
  const txt = n => (n && n.textContent || '').trim().replace(/\s+/g,' ')
  const steps = [...new Set(Array.from(document.querySelectorAll('button,[role=tab],a')).map(n=>txt(n)).filter(t=>t&&t.length<24))]
  return { head: (document.title||'').slice(0,40), steps: steps.slice(0,80) }
})
console.log('HEAD:', dump.head)
console.log('STEPS:', JSON.stringify(dump.steps, null, 1))
await page.screenshot({ path: path.join(ROOT, 'write.png'), fullPage:false }).catch(()=>{})
await page.waitForTimeout(1000)
await ctx.close().catch(()=>{})
process.exit(0)