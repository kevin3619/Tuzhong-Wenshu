import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'

const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const t = el => (el && el.textContent || '').trim().replace(/\s+/g, ' ')
const log = k => fs.appendFileSync(path.join(ROOT, 'resume.log'), `[${new Date().toISOString()}] ${k}\n`)

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
log('url0=' + page.url())

// 打开草稿箱
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(e => log('draftbox-err:' + e.message))
await page.waitForTimeout(2000)

// 点击 继续生成
const cont = page.getByText('继续生成', { exact: true }).first()
if (await cont.count()) {
  await cont.click({ timeout: 8000 }).catch(e => log('continue-err:' + e.message))
  await page.waitForTimeout(5000)
  log('url-after-continue=' + page.url())
} else {
  log('no-继续生成-button')
}

const dump = await page.evaluate(() => {
  const t = el => (el && el.textContent || '').trim().replace(/\s+/g, ' ')
  const body = t(document.body) || ''
  const chips = [...new Set([...document.querySelectorAll('button,[role=tab],[class*=step],[class*=chip],[class*=StepNav]')]
    .map(n => t(n)).filter(x => x && x.length <= 14))].slice(0, 80)
  // 收集可见的职责词/角色相关文本
  const roleText = (body.match(/.{0,6}(主要人物|角色|弧光|女主|标志性台词|口头禅|身份|金手指|势力|关系图谱).{0,10}/g) || []).slice(0, 40)
  return { url: location.pathname, hasCharacters: body.includes('主要人物'), chips, roleText }
})
log('DUMP=' + JSON.stringify(dump, null, 2))
await page.screenshot({ path: path.join(ROOT, 'resume_step.png'), fullPage: false }).catch(() => {})

await new Promise(() => {})