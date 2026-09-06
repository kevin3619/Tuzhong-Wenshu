import { chromium } from 'playwright'
import path from 'path'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const ctx = await chromium.launchPersistentContext(path.join(ROOT,'edge-profile'), { channel:'msedge', headless:false, viewport:{width:1460,height:940} })
const page = ctx.pages()[0]||await ctx.newPage()
page.on('console', m=>{ if(m.type()==='error') console.log('[console.error]', m.text().slice(0,200)) })
await page.goto('http://localhost:3001/tuzhong-wenshu/login', { waitUntil:'domcontentloaded', timeout:60000 })
await page.waitForTimeout(3500)
// account tab
const ac = page.locator('text=账号密码登录')
if (await ac.count()) { await ac.first().click({timeout:5000}).catch(e=>console.log('tab:',e.message)); await page.waitForTimeout(1500) }
const u = page.getByPlaceholder('请输入用户名或手机号')
console.log('user field count:', await u.count())
if (await u.count()) {
  await u.fill('kevin')
  await page.getByPlaceholder('请输入密码').fill('leiyang0')
  await page.screenshot({path:path.join(ROOT,'login_filled.png')}).catch(()=>{})
  // click the submit button (text 登录)
  const loginBtn = page.locator('button', { hasText:/^登录$/ })
  console.log('login btn count:', await loginBtn.count())
  await loginBtn.first().click({timeout:6000}).catch(async e=>{ console.log('click err', e.message); await page.keyboard.press('Enter') })
  await page.waitForTimeout(4000)
  console.log('URL after login:', page.url())
  // capture error toast
  const err = await page.evaluate(()=>{ const el = document.querySelector('[class*=error],[class*=toast],[class*=message],[class*=alert],[role=alert]'); return el?el.textContent:'' })
  console.log('ERRTOAST:', err)
  await page.screenshot({path:path.join(ROOT,'login_result.png')}).catch(()=>{})
} else {
  console.log('no user field; URL:', page.url())
}
await page.waitForTimeout(600)
await ctx.close().catch(()=>{}); process.exit(0)