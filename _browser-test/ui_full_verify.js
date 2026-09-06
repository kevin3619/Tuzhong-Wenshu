// 全流程 UI 验证：打开草稿《永历中兴》→ 势力设置 → 分卷章节 → 主角高级设置
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
  const report = async (tag, obj) => { log.push({ tag, ...obj }) }

  // ===== 1. 进入草稿箱并打开《永历中兴》 =====
  // 回到书架
  const backBtn = page.locator('button:has-text("返回书架")').first()
  if (await backBtn.count()) { await backBtn.click(); await page.waitForTimeout(2500) }
  // 草稿箱
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
  let opened = false
  for (let i = 0; i < 20 && !opened; i++) {
    const draftCard = page.locator('text=永历中兴').first()
    if (await draftCard.count()) {
      const card = draftCard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(() => {}) } else { await draftCard.click({ timeout: 8000 }).catch(() => {}) }
      opened = true
      break
    }
    await page.waitForTimeout(1500)
  }
  await page.waitForTimeout(5000)
  await report('open_draft', { opened, url: page.url() })
  const bodyTxt = await page.evaluate(() => (document.body.textContent || '').replace(/\s+/g, ' '))
  await report('after_open', { hasStepper: /输入主题|世界观设定|分卷章节/.test(bodyTxt), head: bodyTxt.slice(0, 120) })

  // ===== 2. 势力设置：点击势力设定导航 =====
  const facNav = page.locator('button').filter({ hasText: /^势力设定$/ }).first()
  if (await facNav.count()) { await facNav.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3000) }
  const facState = await page.evaluate(() => {
    const out = { selects: [], emptyFacFields: [], factions: [] }
    document.querySelectorAll('select').forEach(sel => {
      const label = (sel.closest('div')?.previousElementSibling?.textContent || '').trim().slice(0, 10)
      const val = sel.value
      const opts = Array.from(sel.options).map(o => o.value)
      if (opts.includes('传说势力') || opts.includes('SSS')) {
        out.selects.push({ label, val: String(val), matched: opts.includes(val) })
      }
    })
    // 每个势力卡片
    const cards = Array.from(document.querySelectorAll('div'))
      .filter(d => { const t = d.textContent || ''; return t.includes('势力名称') && t.includes('势力级别') })
      .slice(0, 6)
    cards.forEach(c => {
      const t = c.textContent.replace(/\s+/g, ' ')
      const nameM = /势力名称[：:\s]*([^\s]{2,16})/.exec(t)
      const rankM = /势力级别[：:\s]*([^\s]{2,8})/.exec(t)
      const symbolM = /旗帜\/标识[：:\s]*([^\s]{1,20})/.exec(t)
      out.factions.push({ name: nameM ? nameM[1] : '', rank: rankM ? rankM[1] : '(空)', symbol: symbolM ? symbolM[1] : '(空)' })
    })
    return out
  }).catch(e => 'ERR:' + e.message)
  await report('factions_ui', facState)
  await page.screenshot({ path: 'ui_factions.png' })

  // ===== 3. 分卷章节：点击分卷章节划分导航 =====
  const chapNav = page.locator('button').filter({ hasText: /^分卷章节划分$/ }).first()
  const cc = await chapNav.count()
  if (cc) {
    const st = await chapNav.evaluate(el => ({ disabled: el.disabled, cls: String(el.className).slice(0, 60) }))
    await report('chap_nav_btn', st)
    await chapNav.click({ timeout: 8000 }).catch(e => report('chap_click_err', { msg: e.message.split('\n')[0] }))
    await page.waitForTimeout(5000)
    const after = await page.evaluate(() => {
      const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
      return {
        head: txt.slice(0, 200),
        hasVolumeCount: /卷数设置|总卷数/.test(txt),
        volCount: (/卷数设置|总卷数/.test(txt)) ? (/(?:卷数设置|总卷数)[：:\s]*(\d+)/.exec(txt) || [null, '?'])[1] : null,
        hasVolTitle: /卷标题/.test(txt),
        hasVolSummary: /卷摘要/.test(txt),
        volTitles: (txt.match(/第[一二三四五六七八九十\d]+卷[：:\s]*[^。；，]{2,20}/g) || []).slice(0, 8),
        hasRegenerate: /重新生成/.test(txt),
        chapterSample: (txt.match(/第[一二三四五六七八九十\d]+节[^。；，]{0,30}/g) || []).slice(0, 3),
      }
    })
    await report('chapters_ui', after)
    await page.screenshot({ path: 'ui_chapters.png' })
  } else {
    const navs = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20)).filter(t => t).slice(0, 40))
    await report('no_chap_nav', { navs })
  }

  console.log(JSON.stringify(log, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
