import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'

const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160)) })

const t = el => (el && el.textContent || '').trim().replace(/\s+/g, ' ')
const log = (k, v) => fs.appendFileSync(path.join(ROOT, 'draft.log'), `[${new Date().toISOString()}] ${k}: ${v}\n`)

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(3000)
log('url0', page.url())

// 打开草稿箱
const drafts = page.locator('text=草稿箱').first()
if (await drafts.count()) {
  await drafts.click({ timeout: 6000 }).catch(e => log('click-草稿箱-err', e.message))
  await page.waitForTimeout(2500)
  log('url-after-drafts', page.url())
  await page.screenshot({ path: path.join(ROOT, 'drafts_box.png'), fullPage: false }).catch(() => {})
} else {
  log('no-草稿箱-button', '')
}

// 找永历中兴 及 所有卡片/按钮
const dump = await page.evaluate(() => {
  const t = el => (el && el.textContent || '').trim().replace(/\s+/g, ' ')
  const btns = [...document.querySelectorAll('button,a,[role=button],div[class*=card]')]
    .map(n => t(n)).filter(x => x && x.length <= 40)
  return { hasYongli: (t(document.body) || '').includes('永历'), elems: [...new Set(btns)].slice(0, 80) }
})
log('dump', JSON.stringify(dump, null, 2))
await page.screenshot({ path: path.join(ROOT, 'draft_open.png'), fullPage: false }).catch(() => {})

await new Promise(() => {})