import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const push = k => fs.appendFileSync(path.join(ROOT, 'verify_final.log'), `[${new Date().toISOString()}] ${k}\n`)

async function login() {
  await page.goto(APP + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const ac = page.locator('text=账号密码登录')
  if (await ac.count()) { await ac.first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1200) }
  const u = page.getByPlaceholder('请输入用户名或手机号')
  if (await u.count()) {
    await u.fill('kevin')
    await page.getByPlaceholder('请输入密码').fill('leiyang0')
    const loginBtn = page.locator('button', { hasText: /^登录$/ })
    await loginBtn.first().click({ timeout: 6000 }).catch(async e => { await page.keyboard.press('Enter') })
    await page.waitForTimeout(5000)
  }
}
await login()
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(e => push('draftbox-err:' + e.message))
await page.waitForTimeout(2000)
const cont = page.getByText('继续生成', { exact: true }).first()
if (await cont.count()) { await cont.click({ timeout: 8000 }).catch(e => push('continue-err:' + e.message)); await page.waitForTimeout(6000) }

// ---- 势力设定 ----
const fc = page.getByText('势力设定', { exact: true }).first()
if (await fc.count()) { await fc.click({ timeout: 8000 }).catch(e => push('fc-err:' + e.message)); await page.waitForTimeout(4000) }
const facData = await page.evaluate(() => {
  const boldInputs = [...document.querySelectorAll('input')].filter(i => i.className.includes('font-bold') && (i.value || '').trim())
  const names = boldInputs.map(i => i.value.trim())
  const nums = [...document.querySelectorAll('input')]
  return { names, totalBold: boldInputs.length, textHasPrimary: /永历|南明|朱由榔/.test(document.body.innerText || '') }
})
push('势力个数(粗判)=' + facData.totalBold + ' | 名称=' + JSON.stringify(facData.names))
push('势力含故事上下文(永历/南明/朱由榔): ' + facData.textHasPrimary)

// ---- 整体故事大纲：背景设定 / 力量体系 ----
const oc = page.getByText('整体故事大纲', { exact: true }).first()
if (await oc.count()) { await oc.click({ timeout: 8000 }).catch(e => push('oc-err:' + e.message)); await page.waitForTimeout(6000) }
await page.keyboard.press('End'); await page.waitForTimeout(1000)
const outlineFields = await page.evaluate(() => {
  const forbiddenMing = '明朝朝堂权力体系'
  const out = {}
  const fields = {}
  const tas = [...document.querySelectorAll('textarea')]
  tas.forEach((ta, idx) => {
    let label = ''
    let sib = ta.previousElementSibling
    if (sib && sib.tagName === 'LABEL') label = (sib.textContent || '').trim()
    const v = ta.value || ''
    if ((label === '背景设定' || label === '力量体系') || v.includes(forbiddenMing) || v.includes('金手指')) {
      fields[label || ('ta' + idx)] = {
        len: v.length,
        hasMing: v.includes(forbiddenMing),
        hasGolden: v.includes('金手指'),
        hasSysName: v.includes('体系名称'),
        hasSysType: v.includes('体系类型'),
        val: v,
      }
    }
  })
  out.fields = fields
  out.taTotal = tas.length
  out.bodyMing = (document.body.innerText || '').includes(forbiddenMing)
  out.bodyGolden = (document.body.innerText || '').includes('金手指')
  return out
})
push('大纲 taTotal=' + outlineFields.taTotal + ' | bodyMing=' + outlineFields.bodyMing + ' | bodyGolden=' + outlineFields.bodyGolden)
Object.entries(outlineFields.fields).forEach(([k, f]) => {
  push(`[${k}] len=${f.len} ming=${f.hasMing} golden=${f.hasGolden} sysName=${f.hasSysName} sysType=${f.hasSysType}`)
  push(`[${k}] val=⏎${f.val}`)
})
push('===== DONE =====')
console.log(JSON.stringify({ facData: facData.names, outlineFields }, null, 2))
await ctx.close().catch(() => {}); process.exit(0)