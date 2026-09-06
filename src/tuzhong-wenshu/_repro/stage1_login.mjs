import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const PROFILE = path.join(ROOT, 'edge-profile')
const BASE = 'http://localhost:3001'
const APP = BASE + '/tuzhong-wenshu'

const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: 'msedge',
  headless: false,
  viewport: { width: 1360, height: 900 },
})

const page = browser.pages()[0] || (await browser.newPage())

page.on('console', (m) => {
  if (m.type() === 'error') fs.appendFileSync(path.join(ROOT, 'console.log'), '[console.error] ' + m.text() + '\n')
})
page.on('pageerror', (e) => fs.appendFileSync(path.join(ROOT, 'console.log'), '[pageerror] ' + e.message + '\n'))

console.log('NAV', APP)
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })

const deadline = Date.now() + 8 * 60 * 1000
let signedIn = false
while (Date.now() < deadline) {
  const url = page.url()
  await page.waitForTimeout(1200)
  // 已离开登录页、且已进入应用（basePath 下不再跳转 login）即视为登录完成
  if (!/\/login(\?|$)/.test(url) && url.startsWith(APP) && url !== APP) {
    signedIn = true
    break
  }
}
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(1500)

fs.writeFileSync(path.join(ROOT, 'stage1.url'), page.url())
await page.screenshot({ path: path.join(ROOT, 'stage1.png'), fullPage: true })
console.log('SIGNED_IN', signedIn ? 'true' : 'false')
console.log('FINAL_URL', page.url())

// 保持浏览器打开，供后续阶段复用同一登录态
await new Promise(() => {})