// 复测v2：登录会话 → 草稿《永历中兴》 → 检查 势力字段(powerRank/strengthTier) 与 分卷章节导航
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  // 遍历已有标签页
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    if (t.includes('分卷章节划分') || t.includes('输入主题') || t.includes('返回书架')) { page = p; break }
  }
  if (!page) {
    page = ctx.pages()[0] || await ctx.newPage()
    page.setDefaultTimeout(10000)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
  }
  page.setDefaultTimeout(10000)

  // 确保在向导内
  let inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
  if (!inWizard) {
    // 回到书架，打开草稿箱
    const backBtn = page.locator('button:has-text("返回书架")').first()
    if (await backBtn.count()) { await backBtn.click(); await page.waitForTimeout(2500) }
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
    const draftCard = page.locator('text=永历中兴').first()
    if (await draftCard.count()) {
      const card = draftCard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(() => {}) } else { await draftCard.click({ timeout: 8000 }).catch(() => {}) }
    }
    for (let i = 0; i < 25; i++) {
      inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
      if (inWizard) break
      await page.waitForTimeout(1000)
    }
  }
  console.log('IN_WIZARD=' + inWizard + ' URL=' + page.url())

  // ============ 1. 势力设定环节 ============
  const facBtn = page.locator('button').filter({ hasText: '势力设定' }).first()
  if (await facBtn.count()) { await facBtn.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3000) }
  const facState = await page.evaluate(() => {
    const out = { powerRanks: [], strengthTiers: [], emptySelects: 0 }
    document.querySelectorAll('select').forEach(sel => {
      const opts = Array.from(sel.options).map(o => o.value)
      const val = sel.value
      if (String(val).includes('势力') || opts.some(o => String(o).includes('势力'))) {
        out.powerRanks.push({ val: String(val).slice(0, 20), opts: opts.slice(0, 8) })
      }
      if (opts.includes('SSS') || opts.includes('A')) {
        out.strengthTiers.push({ val: String(val).slice(0, 20) })
      }
      if (!sel.value) out.emptySelects++
    })
    const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
    out.hasFactionTitle = txt.includes('势力设定')
    out.forceCount = (txt.match(/实力：/g) || []).length
    return out
  }).catch(e => 'ERR:' + e.message)
  console.log('===== 势力环节 =====')
  console.log(JSON.stringify(facState, null, 1))
  await page.screenshot({ path: 'retest_factions.png', fullPage: false })

  // ============ 2. 分卷章节环节 ============
  const chapBtn = page.locator('button').filter({ hasText: '分卷章节划分' }).first()
  const cc = await chapBtn.count()
  console.log('chapBtn count=' + cc)
  if (cc) {
    const st = await chapBtn.evaluate(el => ({ disabled: el.disabled, cls: String(el.className).slice(0, 80) }))
    console.log('chapBtn state=' + JSON.stringify(st))
    if (!st.disabled) {
      await chapBtn.click({ timeout: 8000 }).catch(e => console.log('CLICK_ERR', e.message.split('\n')[0]))
      await page.waitForTimeout(4000)
      const after = await page.evaluate(() => {
        const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
        return {
          head: txt.slice(0, 180),
          hasVolumeCount: /卷数设置|总卷数/.test(txt),
          hasVolTitle: /卷标题/.test(txt),
          hasVolSummary: /卷摘要/.test(txt),
          hasGenFromConfig: /按此配置生成|生成章节/.test(txt),
          hasWarn: /部分卷数据不完整/.test(txt),
        }
      })
      console.log('AFTER_CHAP_CLICK=' + JSON.stringify(after, null, 1))
      await page.screenshot({ path: 'retest_chapters.png', fullPage: false })
    }
  } else {
    console.log('NO chapBtn, nav buttons:')
    const navs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button'))
        .map(b => (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24))
        .filter(t => t && !/草稿箱|新建|全自动|收起|继续生成|删除|🗑/.test(t))
        .slice(0, 40)
    })
    console.log(JSON.stringify(navs, null, 1))
  }

  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
