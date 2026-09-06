// 线上《永历中兴》打开 ai-generate 草稿，截图 characters 环节
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 2000 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(BASE + '/ai-generate', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(2500)
  await page.evaluate(({nid}) => { localStorage.setItem('tuzhong-active-novel-id', nid) }, { nid: NID })
  await page.goto(BASE + '/ai-generate', { waitUntil: 'networkidle', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(4000)

  // 捕获当前页可见文本概要
  const info = await page.evaluate(() => {
    const body = document.body.innerText || ''
    const has = s => body.indexOf(s) >= 0
    return {
      title: (document.title||''),
      hasEmpty: body.indexOf('数据为空')>=0 || body.indexOf('请点击上方按钮重新生成')>=0,
      emptyMarks: (body.match(/数据为空/g)||[]).length,
      len: body.length,
      steps: Array.from(document.querySelectorAll('button, [role], a'))
        .map(e=>String(e.textContent||'').trim()).filter(t=>t && t.length<=12)
        .slice(0,80),
      snippet: body.slice(0, 900),
    }
  })
  console.log('INFO=', JSON.stringify(info, null, 1))
  await page.screenshot({ path: path.join(__dirname, 'shot_characters.png'), fullPage: false })
  await ctx.close()
  console.log('SHOT_SAVED')
})().catch(e => { console.error('FATAL', e); process.exit(1) })