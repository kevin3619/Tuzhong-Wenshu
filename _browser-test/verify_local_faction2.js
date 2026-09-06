// 本地验证v2：注入 tuzhong-generated-data 全局键 → 向导直接恢复到 factions 步骤 → 检查势力下拉
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
  }), NID)
  console.log('ONLINE step=' + grab.ds + ' ddLen=' + (grab.dd || '').length)

  // 2. 本地注入全局键 → 向导直接恢复
  await page.goto(LOCAL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2500)
  await page.evaluate(({ g, nid }) => {
    if (g.dd) localStorage.setItem('tuzhong-generated-data', g.dd)
    localStorage.setItem('tuzhong-current-step', g.ds || 'factions')
    localStorage.setItem('tuzhong-active-novel-id', nid)
    if (g.th) localStorage.setItem('tuzhong-theme-input', g.th)
    if (g.vc) localStorage.setItem('tuzhong-volume-config', g.vc)
  }, { g: grab, nid: NID })

  // 3. 重新进入向导
  await page.goto(LOCAL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(6000)
  const state = await page.evaluate(() => {
    const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
    return {
      hasWizard: txt.includes('分卷章节划分'),
      hasFactionTitle: txt.includes('势力设定'),
      head: txt.slice(0, 160),
    }
  })
  console.log('STATE=' + JSON.stringify(state))

  // 4. 如果向导打开，点击势力设定，抓下拉
  const facBtn = page.locator('button').filter({ hasText: '势力设定' }).first()
  if (await facBtn.count()) { await facBtn.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3000) }
  const result = await page.evaluate(() => {
    const out = { powerRanks: [], strengthTiers: [], emptySelects: 0, selects: [] }
    document.querySelectorAll('select').forEach(sel => {
      const opts = Array.from(sel.options).map(o => o.value)
      const val = sel.value
      out.selects.push({ val: String(val).slice(0, 20), opts: opts.slice(0, 8) })
      if (String(val).includes('势力') || opts.some(o => String(o).includes('势力'))) {
        out.powerRanks.push(String(val).slice(0, 20))
      }
      if (opts.includes('SSS') || opts.includes('A')) {
        out.strengthTiers.push(String(val).slice(0, 20))
      }
      if (!sel.value) out.emptySelects++
    })
    return out
  }).catch(e => 'ERR:' + e.message)
  console.log('===== 本地势力下拉（修复后） =====')
  console.log(JSON.stringify(result, null, 1))
  await page.screenshot({ path: 'local_faction_fixed2.png', fullPage: false })
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
