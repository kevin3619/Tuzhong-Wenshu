import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'

const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(() => {})
await page.waitForTimeout(2000)
await page.getByText('继续生成', { exact: true }).first().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(6000)
await page.getByText('主要人物设定', { exact: true }).first().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(3000)

// 全文本
const text = await page.evaluate(() => (document.body.innerText || ''))
fs.writeFileSync(path.join(ROOT, 'chars_full.txt'), text, 'utf8')
await page.screenshot({ path: path.join(ROOT, 'chars_full.png'), fullPage: true }).catch(() => {})

// 统计角色线索
const lines = text.split('\n').map(s => s.trim()).filter(Boolean)
const nameHits = lines.filter(l => /(主角$|女主$|反派$|配角$|导师$|盟友$|帝王$|帝$|皇后$|王$|皇$|公主$)/.test(l))
console.log('TOTAL_LINES', lines.length)
console.log('NAME_HITS', JSON.stringify(nameHits.slice(0, 60), null, 2))
console.log('HAS_FEMALE', /女主/.test(text), '| HAS_ARC', /弧光/.test(text), '| HAS_CATCH', /标志性台词|口头禅/.test(text))
await new Promise(() => {})