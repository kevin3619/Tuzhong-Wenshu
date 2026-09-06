import { chromium } from 'playwright'
import path from 'path'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const ctx = await chromium.launchPersistentContext(path.join(ROOT,'edge-profile'), { channel:'msedge', headless:false, viewport:{width:1360,height:900} })
const page = ctx.pages()[0]||await ctx.newPage()
await page.goto('http://localhost:3001/tuzhong-wenshu/login', { waitUntil:'domcontentloaded', timeout:60000 })
await page.waitForTimeout(2500)
const dump = await page.evaluate(()=>Array.from(document.querySelectorAll('input,button,[role=tab]')).map(el=>({tag:el.tagName,type:el.getAttribute('type'),ph:el.getAttribute('placeholder'),txt:(el.textContent||'').trim().slice(0,20)})).filter(x=>x.ph||x.txt))
console.log(JSON.stringify(dump,null,1))
await ctx.close().catch(()=>{}); process.exit(0)