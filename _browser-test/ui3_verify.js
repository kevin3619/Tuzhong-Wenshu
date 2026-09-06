// 精细验证：卷配置 DOM 结构 + 势力/人物导航（includes 匹配）
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

  // ===== 1. 卷配置区域 DOM 精细检查 =====
  const volDom = await page.evaluate(() => {
    const out = { volumeInputs: [], volumeTextareas: [], volumeBlocks: [] }
    // 找到含"卷数设置"的区域
    const hdr = Array.from(document.querySelectorAll('div,span,p,h3,h4')).find(d => (d.textContent || '').trim() === '卷数设置' || (d.textContent || '').includes('总卷数'))
    if (hdr) {
      const block = hdr.closest('div')
      // 卷数设置输入
      const numInput = block ? block.querySelector('input[type="number"],input[type="text"]') : null
      if (numInput) out.totalVolumes = numInput.value
      // 卷标题/摘要输入
      document.querySelectorAll('input').forEach((el, i) => {
        const ph = el.getAttribute('placeholder') || ''
        if (/第.*卷|卷标题/.test(ph)) out.volumeInputs.push({ i, val: (el.value || '').slice(0, 40), ph: ph.slice(0, 30) })
      })
      document.querySelectorAll('textarea').forEach((el, i) => {
        const ph = el.getAttribute('placeholder') || ''
        if (/卷摘要|第.*卷/.test(ph)) out.volumeTextareas.push({ i, val: (el.value || '').slice(0, 60), ph: ph.slice(0, 30) })
      })
    }
    // 通用查找：包含"（第"模式的输入
    document.querySelectorAll('input').forEach((el, i) => {
      const val = el.value || ''
      if (/第[一二三四五六七八九十\d]+卷/.test(val) || /卷摘要（/.test(val)) out.volumeBlocks.push({ i, val: val.slice(0, 50), ph: (el.getAttribute('placeholder') || '').slice(0, 30) })
    })
    return out
  })
  report('volume_dom', volDom)
  await page.screenshot({ path: 'ui3_volumes.png' })

  // ===== 2. 势力设定导航 =====
  const facBtn = page.locator('button').filter({ hasText: '势力设定' }).first()
  const facCount = await facBtn.count()
  report('fac_btn', { count: facCount })
  if (facCount) {
    const txt = await facBtn.textContent().catch(() => '')
    report('fac_btn_txt', { txt: (txt || '').trim().slice(0, 40) })
    await facBtn.click({ timeout: 8000 }).catch(e => report('fac_err', { msg: e.message.split('\n')[0] }))
    await page.waitForTimeout(4000)
    const facState = await page.evaluate(() => {
      const out = { rankSelects: [], tierSelects: [], cards: [], head: '' }
      out.head = (document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 80)
      document.querySelectorAll('select').forEach(sel => {
        const val = sel.value
        const opts = Array.from(sel.options).map(o => o.value)
        if (opts.includes('传说势力')) out.rankSelects.push({ val: String(val), matched: opts.includes(val) })
        if (opts.includes('SSS')) out.tierSelects.push({ val: String(val), matched: opts.includes(val) })
      })
      const cards = Array.from(document.querySelectorAll('div'))
        .filter(d => { const t = d.textContent || ''; return t.includes('势力名称') && t.includes('势力级别') })
        .slice(0, 6)
      cards.forEach(c => {
        const t = c.textContent.replace(/\s+/g, ' ')
        const nameM = /势力名称[：:\s]*([^\s]{2,16})/.exec(t)
        const rankM = /势力级别[：:\s]*([^\s]{2,8})/.exec(t)
        const symbolM = /旗帜\/标识[：:\s]*([^\s]{1,20})/.exec(t)
        const tierM = /实力梯度[：:\s]*([^\s]{1,10})/.exec(t)
        out.cards.push({ name: nameM ? nameM[1] : '?', rank: rankM ? rankM[1] : '(空)', tier: tierM ? tierM[1] : '(空)', symbol: symbolM ? symbolM[1] : '(空)' })
      })
      return out
    }).catch(e => 'ERR:' + e.message)
    report('factions_page', facState)
    await page.screenshot({ path: 'ui3_factions.png' })
  }

  // ===== 3. 主要人物设定 =====
  const charBtn = page.locator('button').filter({ hasText: '主要人物设定' }).first()
  const charCount = await charBtn.count()
  report('char_btn', { count: charCount })
  if (charCount) {
    await charBtn.click({ timeout: 8000 }).catch(e => report('char_err', { msg: e.message.split('\n')[0] }))
    await page.waitForTimeout(4000)
    // 找高级设置按钮
    const advBtn = page.locator('button:has-text("高级设置")').first()
    const advCount = await advBtn.count()
    report('adv_btn', { count: advCount })
    if (advCount) {
      await advBtn.click({ timeout: 8000 }).catch(e => report('adv_err', { msg: e.message.split('\n')[0] }))
      await page.waitForTimeout(3000)
    }
    const charState = await page.evaluate(() => {
      const out = { protagonists: [], emptyInputs: 0, filledInputs: [], head: '' }
      out.head = (document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 100)
      document.querySelectorAll('input,textarea,select').forEach((el, i) => {
        const val = (el.value || '').trim()
        if (!val) out.emptyInputs++
        else if (i < 50) {
          const lbl = (el.closest('div')?.querySelector('span')?.textContent || el.getAttribute('placeholder') || 'f' + i).trim().slice(0, 14)
          out.filledInputs.push({ lbl, val: val.slice(0, 34) })
        }
      })
      return out
    }).catch(e => 'ERR:' + e.message)
    report('characters_page', charState)
    await page.screenshot({ path: 'ui3_characters.png' })
  }

  console.log(JSON.stringify(log, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
