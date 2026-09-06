import { chromium } from 'playwright'
import path from 'path'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const WRITE = 'http://localhost:3001/tuzhong-wenshu/write/d2010e15-03a4-4197-aca5-f572af6e9d94'
const ctx = await chromium.launchPersistentContext(path.join(ROOT,'edge-profile'), { channel:'msedge', headless:false, viewport:{width:1460,height:940} })
const page = ctx.pages()[0]||await ctx.newPage()
await page.goto('http://localhost:3001/tuzhong-wenshu/login', { waitUntil:'domcontentloaded', timeout:60000 })
await page.waitForTimeout(3000)
await page.locator('text=账号密码登录').first().click({ timeout: 6000 }).catch(()=>{})
await page.waitForTimeout(1500)
const ph = await page.getByPlaceholder('请输入用户名或手机号')
if (await ph.count() > 0) {
  await ph.fill('kevin')
  await page.getByPlaceholder('请输入密码').fill('leiyang0')
  await page.locator('button[type=submit]:has-text("登录"), button:has-text("登 录"), button:has-text("登录")').first().click({ timeout: 8000 }).catch(async ()=>{
    // fallback: press enter
    await page.getByPlaceholder('请输入密码').press('Enter')
  })
  await page.waitForTimeout(3500)
  console.log('after login URL:', page.url())
} else {
  console.log('already logged in? URL:', page.url())
}
// navigate to write page
await page.goto(WRITE, { waitUntil:'domcontentloaded', timeout:60000 })
await page.waitForTimeout(5000)
console.log('WRITE URL:', page.url())
const dump = await page.evaluate(()=>{
  const txt=n=>(n&&n.textContent||'').trim().replace(/\s+/g,' ')
  return [...new Set(Array.from(document.querySelectorAll('button,[role=tab],a')).map(n=>txt(n)).filter(t=>t&&t.length<26))]
})
console.log('STEPS:', JSON.stringify(dump, null, 1))
await page.screenshot({ path:path.join(ROOT,'write2.png'), fullPage:false }).catch(()=>{})
await page.waitForTimeout(800)
await ctx.close().catch(()=>{}); process.exit(0)