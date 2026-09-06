import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'probe_draft.log')
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile'), { channel: 'msedge', headless: false, viewport: { width: 1400, height: 900 } })
const page = ctx.pages()[0] || await ctx.newPage()
const push = (s) => fs.appendFileSync(LOG, s + '\n')
fs.writeFileSync(LOG, '')
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(3000)
await page.evaluate(() => { try { document.cookie = 'auth_user=kevin; path=/' } catch (e) {} })
await page.waitForTimeout(1500)
push('URL=' + page.url())
push('LS=' + JSON.stringify(await page.evaluate(()=>{
  const keys=Object.keys(localStorage)
  const draftKeys=keys.filter(k=>/tuzhong-draft|generated-data|active-novel/i.test(k))
  return draftKeys.map(k=>{ const v=localStorage.getItem(k)||''; return [k, v.slice(0,120)] })
}), null, 1))
await page.waitForTimeout(2500)
// 若草稿自动恢复，检查当前步骤
push('BODY=' + (await page.evaluate(()=>(document.body.innerText||'').slice(0,500).replace(/\n+/g,' | '))))
await page.screenshot({ path: path.join(ROOT, 'probe_draft.png'), fullPage:false }).catch(()=>{})
await ctx.close().catch(()=>{}); process.exit(0)