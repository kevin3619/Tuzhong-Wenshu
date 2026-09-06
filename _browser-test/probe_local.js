// 本地 dev(3001) 验证：《永历中兴》主要人物设定字段渲染——确认 job/goal/personality/powerLevel 等无空值
const { chromium } = require('playwright-core')
const path = require('path')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const BASE = 'http://localhost:3001/tuzhong-wenshu'
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 950 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(8000)
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE_ERR:', m.text().slice(0, 160)) })
  // 本地登录态可能没有 JWT，先探测
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => console.log('GOTO_ERR', e.message))
  await page.waitForTimeout(3000)
  const url = page.url()
  const bodyText = (await page.evaluate(() => document.body ? document.body.innerText.slice(0, 500) : '')).replace(/\n+/g, ' | ')
  console.log('URL=', url)
  console.log('BODY=', bodyText)
  // 若被导向登录页，读取提示
  const hasLogin = await page.evaluate(() => /登录|用户名|密码/.test(document.body.innerText))
  console.log('HAS_LOGIN_FORM=', hasLogin)
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })