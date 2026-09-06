import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const push = k => fs.appendFileSync(path.join(ROOT, 'verify_smoke.log'), `[${new Date().toISOString()}] ${k}\n`)

await page.goto(APP + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(3000)
const ac = page.locator('text=账号密码登录')
if (await ac.count()) { await ac.first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1200) }
const u = page.getByPlaceholder('请输入用户名或手机号')
if (await u.count()) {
  await u.fill('kevin'); await page.getByPlaceholder('请输入密码').fill('leiyang0')
  const b = page.locator('button', { hasText: /^登录$/ })
  await b.first().click({ timeout: 6000 }).catch(async e => { await page.keyboard.press('Enter') })
  await page.waitForTimeout(5000)
}
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(2500)
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(2000)
const cont = page.getByText('继续生成', { exact: true }).first()
if (await cont.count()) { await cont.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(6000) }

// 逐步骤导航并检查 body 是否还残留污染
async function checkStep(label, forbiddenArr) {
  const chip = page.getByText(label, { exact: true }).first()
  if (await chip.count()) { await chip.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3500) }
  await page.waitForTimeout(1500)
  const body = await page.evaluate(() => document.body.innerText || '')
  const hasErr = /TypeError|ReferenceError|is not defined|cannot read propert/i.test(body)
  const res = {}
  forbiddenArr.forEach(f => { res[f] = body.includes(f) })
  push(`[${label}] err=${hasErr} ` + JSON.stringify(res))
  // 收集纯 textarea 值再检出污染
  const taHits = await page.evaluate((forb) => {
    const hits = []
    document.querySelectorAll('textarea').forEach((t, i) => {
      const v = t.value || ''
      forb.forEach(f => { if (v.includes(f)) hits.push({ idx: i, f, head: v.slice(0, 30).replace(/\n/g, '⏎') }) })
    })
    return hits
  }, forbiddenArr)
  if (taHits.length) push(`  textarea污染: ${JSON.stringify(taHits)}`)
  else push(`  textarea污染: 无`)
}

const forbidden = ['明朝朝堂权力体系', '金手指：大明中兴签到系统', '体系名称']
await checkStep('世界观设定', forbidden)
await checkStep('势力设定', ['明朝朝堂权力体系'])
await checkStep('整体故事大纲', forbidden)

// 捕获控制台错误
const pm = (m) => push('PAGEERROR: ' + m)
await page.screenshot({ path: path.join(ROOT, 'verify_smoke.png') }).catch(() => {})
console.log('SMOKE DONE')
await ctx.close().catch(() => {}); process.exit(0)