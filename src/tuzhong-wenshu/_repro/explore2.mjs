import { chromium } from 'playwright'
import path from 'path'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const PROFILE = path.join(ROOT, 'edge-profile')
const APP = 'http://localhost:3001/tuzhong-wenshu'

const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'msedge', headless: false, viewport: { width: 1360, height: 900 } })
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(3500)

// click 草稿箱
const draftsBtn = page.locator('button:has-text("草稿箱"), text=草稿箱').first()
await draftsBtn.click({ timeout: 8000 }).catch(e => console.log('drafts click err', e.message))
await page.waitForTimeout(3000)

// dump clickable draft-like entries
const cards = await page.evaluate(() => {
  const out = []
  for (const n of Array.from(document.querySelectorAll('button, a, [class*=card], [class*=item], [role=button]'))) {
    const t = (n.textContent || '').trim().replace(/\s+/g, ' ')
    if (t && t.length < 80) out.push({ tag: n.tagName, t })
  }
  // filter likely book titles
  return out.filter(x => /永历|中兴|草稿|继续|创作|编辑|未完成/i.test(x.t)).slice(0, 40)
})
console.log('DRAFTS:', JSON.stringify(cards, null, 1))
await page.screenshot({ path: path.join(ROOT, 'bookshelf.png'), fullPage: false }).catch(()=>{})
await ctx.close().catch(()=>{})
process.exit(0)