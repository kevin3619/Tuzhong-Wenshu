// 端到端验证线上角色定位新预设：进入向导→主要人物设定→枚举下拉<option>
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const WANT = ['大反派/终极Boss', '黑客', 'AI/机器人', '机甲驾驶员', '侦探', '公会会长', '异能者', '青梅竹马', '恋人', '路人/龙套']
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 1000 },
  })
  let page = null
  for (const p of ctx.pages()) { const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 50)).catch(()=>''); if (t.trim()) { page = p; break } }
  if (!page) page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  const pageErr = []
  page.on('pageerror', e => pageErr.push(String(e.message).slice(0, 600)))

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  let inWizard = await page.evaluate(() => (document.body.textContent||'').includes('主要人物设定')).catch(()=>false)
  if (!inWizard) {
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
    const dcard = page.locator('text=永历中兴').first()
    if (await dcard.count()) {
      const card = dcard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(()=>{}) }
      for (let i = 0; i < 25; i++) { await page.waitForTimeout(1000); inWizard = await page.evaluate(() => (document.body.textContent||'').includes('主要人物设定')).catch(()=>false); if (inWizard) break }
    }
  }
  console.log('in_wizard=', inWizard)

  // 切到 主要人物设定
  const charBtn = page.locator('button').filter({ hasText: '主要人物设定' }).first()
  if (await charBtn.count()) { await charBtn.click({ timeout: 8000 }).catch(()=>{}); await page.waitForTimeout(3000) }

  // 枚举所有 <select> 角色定位选项（合并所有下拉）
  const opts = await page.evaluate(() => {
    const set = new Set()
    document.querySelectorAll('select').forEach(sel => {
      sel.querySelectorAll('option').forEach(o => {
        const t = (o.textContent||'').trim()
        if (t && t !== '未设定' && t !== '男' && t !== '女') set.add(o.value + '|' + t)
      })
    })
    return Array.from(set)
  })
  const labels = opts.map(o => o.split('|')[1])
  console.log('total_option_entries=', opts.length)
  for (const w of WANT) { console.log((labels.includes(w) ? 'FOUND ' : 'MISS ') + w) }
  console.log('pageErr=', pageErr.length, JSON.stringify(pageErr))
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })