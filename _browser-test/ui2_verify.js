// 综合 UI 验证（向导内）：分卷章节 → 势力设定 → 主角高级设置
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(10000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  const log = []
  const report = (tag, obj) => log.push({ tag, ...obj })

  // 确保在向导内
  let inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
  if (!inWizard) {
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
    const dcard = page.locator('text=永历中兴').first()
    if (await dcard.count()) {
      const card = dcard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(() => {}) }
      for (let i = 0; i < 25; i++) {
        await page.waitForTimeout(1000)
        inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
        if (inWizard) break
      }
    }
  }
  report('in_wizard', { inWizard })

  // ===== 1. 分卷章节划分页面内容 =====
  await page.waitForTimeout(2000)
  const chapState = await page.evaluate(() => {
    const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
    const out = {
      head: txt.slice(0, 260),
      hasVolConfig: /卷数设置|总卷数/.test(txt),
      volCount: (/卷数设置|总卷数/.test(txt)) ? (/(?:卷数设置|总卷数)[：:\s]*(\d+)/.exec(txt) || [null, '?'])[1] : null,
      hasVolTitle: /卷标题/.test(txt),
      hasVolSummary: /卷摘要/.test(txt),
      volTitles: (txt.match(/第[一二三四五六七八九十\d]+卷[：:\s]*[^。；，]{2,20}/g) || []).slice(0, 8),
      chapterTitles: (txt.match(/第[一二三四五六七八九十\d]+节[^。；，]{0,26}/g) || []).slice(0, 4),
      hasRegenerate: /重新生成/.test(txt),
      hasStartWriting: /开始写正文|开始写作/.test(txt),
      emptyHint: /数据为空|部分卷数据不完整|请先生成/.test(txt),
    }
    return out
  })
  report('chapters_page', chapState)
  await page.screenshot({ path: 'ui2_chapters.png' })

  // ===== 2. 势力设定 =====
  const facNav = page.locator('button').filter({ hasText: /^势力设定$/ }).first()
  const facNavCount = await facNav.count()
  report('fac_nav_count', { count: facNavCount })
  if (facNavCount) {
    await facNav.click({ timeout: 8000 }).catch(e => report('fac_nav_err', { msg: e.message.split('\n')[0] }))
    await page.waitForTimeout(3500)
    const facState = await page.evaluate(() => {
      const out = { rankSelects: [], tierSelects: [], cards: [], bodyHead: '' }
      const body = (document.body.textContent || '').replace(/\s+/g, ' ')
      out.bodyHead = body.slice(0, 120)
      document.querySelectorAll('select').forEach(sel => {
        const val = sel.value
        const opts = Array.from(sel.options).map(o => o.value)
        if (opts.includes('传说势力')) out.rankSelects.push({ val: String(val), matched: opts.includes(val) })
        if (opts.includes('SSS')) out.tierSelects.push({ val: String(val), matched: opts.includes(val) })
      })
      // 捕获势力卡片关键字段
      const cards = Array.from(document.querySelectorAll('div'))
        .filter(d => { const t = d.textContent || ''; return t.includes('势力名称') && t.includes('势力级别') })
        .slice(0, 6)
      cards.forEach(c => {
        const t = c.textContent.replace(/\s+/g, ' ')
        const nameM = /势力名称[：:\s]*([^\s]{2,16})/.exec(t)
        const rankM = /势力级别[：:\s]*([^\s]{2,8})/.exec(t)
        const symbolM = /旗帜\/标识[：:\s]*([^\s]{1,20})/.exec(t)
        const tierM = /实力梯度[：:\s]*([^\s]{1,10})/.exec(t)
        out.cards.push({
          name: nameM ? nameM[1] : '?',
          rank: rankM ? rankM[1] : '(空)',
          tier: tierM ? tierM[1] : '(空)',
          symbol: symbolM ? symbolM[1] : '(空)',
        })
      })
      return out
    }).catch(e => 'ERR:' + e.message)
    report('factions_page', facState)
    await page.screenshot({ path: 'ui2_factions.png' })
  }

  // ===== 3. 主要人物设定（主角高级设置） =====
  const charNav = page.locator('button').filter({ hasText: /^主要人物设定$/ }).first()
  const charNavCount = await charNav.count()
  report('char_nav_count', { count: charNavCount })
  if (charNavCount) {
    await charNav.click({ timeout: 8000 }).catch(e => report('char_nav_err', { msg: e.message.split('\n')[0] }))
    await page.waitForTimeout(3500)
    // 找高级设置按钮
    const advBtn = page.locator('button:has-text("高级设置")').first()
    const advCount = await advBtn.count()
    report('adv_btn', { count: advCount })
    if (advCount) {
      await advBtn.click({ timeout: 8000 }).catch(e => report('adv_click_err', { msg: e.message.split('\n')[0] }))
      await page.waitForTimeout(2500)
    }
    const charState = await page.evaluate(() => {
      const out = { inputs: [], emptyInputs: 0, placeholderInputs: [], head: '' }
      const body = (document.body.textContent || '').replace(/\s+/g, ' ')
      out.head = body.slice(0, 100)
      document.querySelectorAll('input,textarea,select').forEach((el, i) => {
        const val = (el.value || '').trim()
        const ph = el.getAttribute('placeholder') || ''
        if (i < 40) {
          const lbl = (el.closest('div')?.querySelector('span')?.textContent || ph || 'f' + i).trim().slice(0, 14)
          if (val) out.inputs.push({ lbl, val: val.slice(0, 36) })
          else if (ph) out.placeholderInputs.push({ lbl, ph: ph.slice(0, 30) })
          else out.emptyInputs++
        }
      })
      return out
    }).catch(e => 'ERR:' + e.message)
    report('characters_page', charState)
    await page.screenshot({ path: 'ui2_characters.png' })
  }

  console.log(JSON.stringify(log, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
