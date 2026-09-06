import { chromium } from 'playwright'
import path from 'path'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const PROFILE = path.join(ROOT, 'edge-profile')
const APP = 'http://localhost:3001/tuzhong-wenshu'

const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'msedge', headless: false, viewport: { width: 1360, height: 900 } })
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(4000)
console.log('URL:', page.url())
console.log('TITLE:', await page.title())
// dump visible nav / buttons to infer logged-in state
const btns = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button, a, input')).slice(0, 60).map(el => ({
    tag: el.tagName, type: el.getAttribute('type') || '', ph: el.getAttribute('placeholder') || '',
    txt: (el.textContent || '').trim().slice(0, 40),
  })).filter(x => x.txt || x.ph)
})
console.log('BUTTONS:', JSON.stringify(btns, null, 1))
await page.screenshot({ path: path.join(ROOT, 'probe.png'), fullPage: true }).catch(()=>{})
console.log('SCREENSHOT saved')
// keep open briefly
await ctx.close()
process.exit(0)