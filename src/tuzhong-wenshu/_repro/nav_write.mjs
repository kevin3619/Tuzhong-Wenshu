import { chromium } from 'playwright'
import path from 'path'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const WRITE = 'http://localhost:3001/tuzhong-wenshu/write/d2010e15-03a4-4197-aca5-f572af6e9d94'
const ctx = await chromium.launchPersistentContext(path.join(ROOT,'edge-profile'), { channel:'msedge', headless:false, viewport:{width:1460,height:940} })
const page = ctx.pages()[0]||await ctx.newPage()
await page.goto(WRITE, { waitUntil:'domcontentloaded', timeout:60000 })
await page.waitForTimeout(6000)
console.log('URL:', page.url())
const dump = await page.evaluate(()=>{
  const txt=n=>(n&&n.textContent||'').trim().replace(/\s+/g,' ')
  const steps=[...new Set(Array.from(document.querySelectorAll('button,[role=tab],a,[class*=step]')).map(n=>txt(n)).filter(t=>t&&t.length<30))]
  return { steps: steps.slice(0,100) }
})
console.log('STEPS:', JSON.stringify(dump.steps, null, 1))
await page.screenshot({ path:path.join(ROOT,'write_page.png'), fullPage:false }).catch(()=>{})
await page.waitForTimeout(600)
await ctx.close().catch(()=>{}); process.exit(0)