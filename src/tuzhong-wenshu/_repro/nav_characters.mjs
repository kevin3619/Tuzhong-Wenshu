import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'

const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const log = (k, v = '') => fs.appendFileSync(path.join(ROOT, 'chars.log'), `[${new Date().toISOString()}] ${k} ${v}\n`)

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(e => log('draftbox-err', e.message))
await page.waitForTimeout(2000)
await page.getByText('继续生成', { exact: true }).first().click({ timeout: 8000 }).catch(e => log('cont-err', e.message))
await page.waitForTimeout(6000)
log('url', page.url())

// 点击 主要人物设定 步骤
const chip = page.getByText('主要人物设定', { exact: true }).first()
if (await chip.count()) {
  await chip.click({ timeout: 8000 }).catch(e => log('chip-err', e.message))
  await page.waitForTimeout(4000)
  log('clicked-chars-chip')
} else {
  log('no-chars-chip')
}

// 等待可能的生成/加载
await page.waitForTimeout(2000)
const body = await page.evaluate(() => (document.body.textContent || '').replace(/\s+/g, ' '))
log('BODYLEN=', String(body.length))

// 提取主要人物设定区块的所有文本（尽量详尽）
const section = await page.evaluate(() => {
  const t = el => (el && el.textContent || '').trim().replace(/\s+/g, ' ')
  const h = [...document.querySelectorAll('h1,h2,h3,h4,[class*=title]')].map(n => t(n))
  // 找到包含"主要人物"/角色关键字的卡片
  const cards = [...document.querySelectorAll('[class*=card],[class*=character],[class*=role],li')]
    .map(n => t(n)).filter(x => x && x.length > 2).slice(0, 220)
  return { headers: [...new Set(h)].slice(0, 40), cards: [...new Set(cards)].slice(0, 220) }
})
log('SECTION=' + JSON.stringify(section, null, 2))

await page.screenshot({ path: path.join(ROOT, 'chars_step.png'), fullPage: true }).catch(e => log('shot-err', e.message))
await new Promise(() => {})