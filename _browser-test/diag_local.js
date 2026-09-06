// 本地诊断：确认草稿箱是否打开、继续生成按钮、向导是否渲染
const { chromium } = require('playwright-core')
const path = require('path')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const ONLINE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const LOCAL = 'http://localhost:3001/tuzhong-wenshu'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)

  // 1. 从线上抓草稿数据
  await page.goto(ONLINE, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const grab = await page.evaluate((nid) => ({
    dd: localStorage.getItem('tuzhong-draft-data-' + nid),
    ds: localStorage.getItem('tuzhong-draft-step-' + nid),
    th: localStorage.getItem('tuzhong-draft-theme-' + nid),
    vc: localStorage.getItem('tuzhong-draft-volume-' + nid),
    di: localStorage.getItem('tuzhong-drafts-index'),
  }), NID)
  console.log('ONLINE step=' + grab.ds + ' ddLen=' + (grab.dd || '').length)
  console.log('ONLINE idx=' + (grab.di || '').slice(0, 300))

  // 2. 本地注入
  await page.goto(LOCAL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)
  await page.evaluate(({ g, nid }) => {
    if (g.dd) localStorage.setItem('tuzhong-draft-data-' + nid, g.dd)
    if (g.ds) localStorage.setItem('tuzhong-draft-step-' + nid, g.ds)
    if (g.th) localStorage.setItem('tuzhong-draft-theme-' + nid, g.th)
    if (g.vc) localStorage.setItem('tuzhong-draft-volume-' + nid, g.vc)
    if (g.di) localStorage.setItem('tuzhong-drafts-index', g.di)
    localStorage.setItem('tuzhong-active-novel-id', nid)
  }, { g: grab, nid: NID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  // 3. 验证 localStorage 是否保留
  const afterReload = await page.evaluate(() => ({
    idx: localStorage.getItem('tuzhong-drafts-index'),
    active: localStorage.getItem('tuzhong-active-novel-id'),
  }))
  console.log('AFTER_RELOAD idx=' + (afterReload.idx || '').slice(0, 120) + ' active=' + afterReload.active)

  // 3. 看草稿箱按钮与页面状态
  const state1 = await page.evaluate(() => {
    const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
    const btns = Array.from(document.querySelectorAll('button')).map(b => (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20)).filter(Boolean).slice(0, 30)
    return { hasDraftBox: /草稿箱/.test(txt), hasYongli: txt.includes('永历中兴'), head: txt.slice(0, 120), btns }
  })
  console.log('STATE1=' + JSON.stringify(state1, null, 1))

  const dbtn = page.locator('button:has-text("草稿箱")').first()
  console.log('dbtn count=' + await dbtn.count())
  if (await dbtn.count()) {
    await dbtn.click(); await page.waitForTimeout(2500)
  }
  const state2 = await page.evaluate(() => {
    const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
    return { hasYongli: txt.includes('永历中兴'), hasContinue: /继续生成/.test(txt), head: txt.slice(0, 150) }
  })
  console.log('STATE2=' + JSON.stringify(state2, null, 1))

  const draftCard = page.locator('text=永历中兴').first()
  console.log('draftCard count=' + await draftCard.count())
  if (await draftCard.count()) {
    const card = draftCard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
    const gen = card.locator('button:has-text("继续生成")').first()
    console.log('genBtn count=' + await gen.count())
    if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(e => console.log('GEN_ERR', e.message.split('\n')[0])) }
    else { await draftCard.click({ timeout: 8000 }).catch(() => {}) }
  }
  await page.waitForTimeout(5000)
  const state3 = await page.evaluate(() => {
    const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
    return {
      hasWizard: txt.includes('分卷章节划分'),
      hasFaction: txt.includes('势力设定'),
      hasStep: txt.includes('主要人物设定'),
      head: txt.slice(0, 200),
    }
  })
  console.log('STATE3=' + JSON.stringify(state3, null, 1))
  await page.screenshot({ path: 'local_diag.png', fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
