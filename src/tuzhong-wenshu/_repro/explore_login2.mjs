import { chromium } from 'playwright'
import path from 'path'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const ctx = await chromium.launchPersistentContext(path.join(ROOT,'edge-profile'), { channel:'msedge', headless:false, viewport:{width:1360,height:900} })
const page = ctx.pages()[0]||await ctx.newPage()
await page.goto('http://localhost:3001/tuzhong-wenshu/login', { waitUntil:'domcontentloaded', timeout:60000 })
await page.waitForTimeout(2500)
await page.locator('text=账号密码登录').first().click({timeout:6000}).catch(e=>console.log('tab click',e.message))
await page.waitForTimeout(2000)
const dump = await page.evaluate(()=>Array.from(document.querySelectorAll('input,button,textarea')).map((el,i)=>({i,tag:el.tagName,type:el.getAttribute('type'),name:el.getAttribute('name'),ph:el.getAttribute('placeholder'),txt:(el.textContent||'').trim().slice(0,24)})).filter(x=>x.ph||x.txt||x.type==='submit'||x.type==='password'))
console.log('FIELDS:', JSON.stringify(dump,null,1))
await page.screenshot({path:path.join(ROOT,'login.png')}).catch(()=>{})
await ctx.close().catch(()=>{}); process.exit(0)