import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const PROFILE = path.join(ROOT, 'edge-profile')
const APP = 'http://localhost:3001/tuzhong-wenshu'

const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'msedge', headless: false, viewport: { width: 1360, height: 900 } })
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(3500)
console.log('URL:', page.url())

// try to find and open the 永历中兴 draft
const draftSel = 'text=永历中兴'
const draftLink = page.locator(draftSel).first()
const cnt = await draftLink.count().catch(()=>0)
console.log('draft link count on bookshelf:', cnt)
if (cnt > 0) {
  await draftLink.click({ timeout: 8000 }).catch(e => console.log('click err', e.message))
  await page.waitForTimeout(4000)
} else {
  // maybe already shown / need bookshelf navigation
  await page.keyboard.press('Escape')
}

console.log('URL after open:', page.url())

// dump wizard step labels & buttons
const info = await page.evaluate(() => {
  const txt = (n) => (n && n.textContent || '').trim()
  const steps = Array.from(document.querySelectorAll('button, [role=tab], [class*=step]'))
    .map(n => txt(n)).filter(t => t && t.length < 20)
  const bigBtns = Array.from(document.querySelectorAll('button'))
    .map(n => txt(n)).filter(t => t && /重新生成|生成|下一步|上一步|保存|开始|人物|关系|势力|世界观|金手指|大纲|正文/.test(t)).slice(0, 60)
  return { steps: [...new Set(steps)].slice(0, 80), bigBtns: [...new Set(bigBtns)].slice(0, 60) }
})
console.log('STEPS:', JSON.stringify(info.steps))
console.log('GENBTNS:', JSON.stringify(info.bigBtns))
await page.screenshot({ path: path.join(ROOT, 'wizard.png'), fullPage: false }).catch(()=>{})
console.log('shot')
await ctx.close().catch(()=>{})
process.exit(0)