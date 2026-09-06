import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'

const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const save = (name, text) => fs.writeFileSync(path.join(ROOT, name), 'utf8' in { x: 1 } ? text : String(text), 'utf8')

async function goStep(label) {
  const chip = page.getByText(label, { exact: true }).first()
  if (await chip.count()) {
    await chip.click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(3000)
  }
  const text = await page.evaluate(() => (document.body.innerText || ''))
  return text
}

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(() => {})
await page.waitForTimeout(2000)
await page.getByText('继续生成', { exact: true }).first().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(6000)

// 世界观设定
const wb = await goStep('世界观设定')
fs.writeFileSync(path.join(ROOT, 'worldbuilding.txt'), wb, 'utf8')

// 势力设定
const fc = await goStep('势力设定')
fs.writeFileSync(path.join(ROOT, 'factions_step.txt'), fc, 'utf8')

// 整体故事大纲
const ol = await goStep('整体故事大纲')
fs.writeFileSync(path.join(ROOT, 'outline.txt'), ol, 'utf8')

// 各文本关键段统计
const t = el => (el && el.textContent || '').trim().replace(/\s+/g, ' ')
console.log('=== 势力设定 关键片段 ===')
const keys = ['势力', '南明', '永历', '孙可望', 'mapping', '阵营', '敌方', '友方', '朝廷']
for (const k of keys) { const n = (fc.match(new RegExp(k, 'g')) || []).length; console.log(`"${k}": ${n}次`) }
console.log('worldbuilding 含"力量体系":', /力量体系/.test(wb), '含"明朝朝堂权力体系":', /明朝朝堂权力体系/.test(wb))
console.log('outline 含"背景设定":', /背景设定/.test(ol), '含"力量体系":', /力量体系/.test(ol), '含"明朝朝堂权力体系":', /明朝朝堂权力体系/.test(ol))
await new Promise(() => {})