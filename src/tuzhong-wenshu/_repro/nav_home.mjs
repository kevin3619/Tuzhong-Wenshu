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

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(3000)
console.log('URL1:', page.url())

// 若被踢到登录页则登录
if (/\/login/.test(page.url())) {
  console.log('>> 需要登录')
  const ac = page.locator('text=账号密码登录')
  if (await ac.count()) { await ac.first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1200) }
  const u = page.getByPlaceholder('请输入用户名或手机号')
  if (await u.count()) {
    await u.fill('kevin')
    await page.getByPlaceholder('请输入密码').fill('leiyang0')
    await page.locator('button', { hasText: /^登录$/ }).first().click({ timeout: 6000 }).catch(() => page.keyboard.press('Enter'))
    await page.waitForTimeout(4500)
    console.log('URL2:', page.url())
  }
}
await page.waitForTimeout(1500)

const txt = n => (n && n.textContent || '').trim().replace(/\s+/g, ' ')
const dump = await page.evaluate(() => {
  const t = el => (el && el.textContent || '').trim().replace(/\s+/g, ' ')
  const body = t(document.body) || ''
  // 步骤条 chips
  const chips = [...document.querySelectorAll('button,[role=tab],[class*=step],[class*=chip]')]
    .map(n => t(n)).filter(x => x && x.length <= 12)
  // 含"永历"的片段
  const yongli = body.includes('永历')
  // 当前可视标题/按钮
  return { hasYongli: yongli, chips: [...new Set(chips)].slice(0, 60), bodyLen: body.length }
})
console.log('DUMP:', JSON.stringify(dump, null, 2))

await page.screenshot({ path: path.join(ROOT, 'home_wizard.png'), fullPage: true })
fs.writeFileSync(path.join(ROOT, 'home.url'), page.url())

// 保持打开供后续继续操作
await new Promise(() => {})