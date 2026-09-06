// 驱动在线向导重新生成《永历中兴》人物/势力并持久化到服务端
// 流程：进入草稿向导 → 角色步「🔄 重新生成」→ 轮询直到 characters 落库 → 势力步「🔄 重新生成」→ 轮询直到 factions 落库
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const API = '/tuzhong-wenshu/api/settings'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

const debug = (m) => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + m)

async function settingsInPage(page) {
  return page.evaluate(async (api) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + '40249ecb-3bf6-434c-ad94-15dfeabc88ea', { headers: { Authorization: 'Bearer ' + token } })
    if (!r.ok) return { err: 'HTTP ' + r.status }
    const j = await r.json().catch(() => ({}))
    return (j && (j.data || j)) || {}
  }, API)
}

async function charState(d) {
  const CH = (d && d.characters) || {}
  const proto = CH.protagonist || {}
  const sup = CH.supporting || []
  return {
    protoName: String(proto.name || '').slice(0, 20),
    supLen: sup.length,
    antLen: (CH.antagonists || []).length,
    flLen: (CH.femaleLeads || []).length,
    f0terr: (() => { const f = ((d && d.factions && d.factions.factions) || [])[0]; return f ? String(f.territory || '').slice(0, 14) : '(nofac)' })(),
  }
}

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 60)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(12000)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  // 进入向导（草稿箱 → 永历中兴 → 继续生成）
  let inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
  if (!inWizard) {
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
    const dcard = page.locator('text=永历中兴').first()
    if (await dcard.count()) {
      const card = dcard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
      const gen = card.locator('button:has-text("继续生成")').first()
      if (await gen.count()) { await gen.click({ timeout: 9000 }).catch(() => {}) } else { await dcard.click({ timeout: 9000 }).catch(() => {}) }
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(1000)
        inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
        if (inWizard) break
      }
    }
  }
  debug('IN_WIZARD=' + inWizard + ' URL=' + page.url())

  // ============ Step 1: 角色 ============
  // 切换到「主要人物设定」步骤
  const charNav = page.locator('button').filter({ hasText: /主要人物设定/ }).first()
  if (await charNav.count()) { await charNav.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(2500) }
  // 找「🔄 重新生成」按钮
  const regenBtn = page.locator('button:has-text("重新生成")').first()
  const regenCount = await regenBtn.count()
  debug('角色重置按钮布局: ' + (page.url()) + ' regenBtn.count=' + regenCount)
  let baselines = await settingsInPage(page).then(d => charState(d)).catch(() => null)
  debug('角色基线(落库前)=' + JSON.stringify(baselines))
  if (regenCount) {
    await regenBtn.scrollIntoViewIfNeeded().catch(() => {})
    await regenBtn.click({ timeout: 9000 }).catch(e => debug('点击角色重新生成 err=' + e.message.split('\n')[0]))
    debug('已点击角色「重新生成」，开始轮询落库…')
  } else {
    debug('未找到角色「重新生成」按钮，直接尝试调用 handleGenerateCharacters（若页面暴露）')
  }

  // 轮询角色落库：最多 ~16 分钟
  let charDone = false
  const charStart = Date.now()
  while (Date.now() - charStart < 16 * 60 * 1000) {
    await page.waitForTimeout(15000)
    const d = await settingsInPage(page).catch(() => null)
    const st = d ? await charState(d) : null
    const busy = await page.evaluate(() => (document.body.textContent || '').includes('生成中')).catch(() => false)
    if (st && st.protoName) {
      debug('角色落库中: ' + JSON.stringify(st) + ' 生成中=' + busy)
      // 主角名非空且至少有人物 → 视为已生成（主角+若干支持/反派）
      if ((st.supLen > 0 || st.antLen > 0 || st.flLen > 0)) { charDone = true; break }
    } else {
      debug('角色仍空/生成中… ' + JSON.stringify(st) + ' busy=' + busy)
    }
  }
  debug('角色完成=' + charDone)
  if (!charDone) {
    const d = await settingsInPage(page).catch(() => null)
    debug('角色未在时限内落库，当前=' + JSON.stringify(d ? await charState(d) : null))
  }

  // ============ Step 2: 势力 ============
  const facNav = page.locator('button').filter({ hasText: /势力设定/ }).first()
  if (await facNav.count()) { await facNav.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(2500) }
  const facRegen = page.locator('button:has-text("重新生成")').first()
  const facCount = await facRegen.count()
  debug('势力重置按钮.count=' + facCount + ' URL=' + page.url())
  if (facCount) {
    await facRegen.scrollIntoViewIfNeeded().catch(() => {})
    await facRegen.click({ timeout: 9000 }).catch(e => debug('点击势力重新生成 err=' + e.message.split('\n')[0]))
    debug('已点击势力「重新生成」，开始轮询落库…')
  }

  let facDone = false
  const facStart = Date.now()
  while (Date.now() - facStart < 8 * 60 * 1000) {
    await page.waitForTimeout(12000)
    const d = await settingsInPage(page).catch(() => null)
    const st = d ? await charState(d) : null
    if (st && st.f0terr && st.f0terr !== '(nofac)') { debug('势力落库: ' + JSON.stringify(st)); facDone = true; break }
    else debug('势力仍空… ' + JSON.stringify(st))
  }
  debug('势力完成=' + facDone)

  const final = await settingsInPage(page).catch(() => null)
  debug('FINAL chars=' + JSON.stringify(final ? await charState(final) : null))

  await page.screenshot({ path: path.join(__dirname, 'drive_regen_final.png') }).catch(() => {})
  await ctx.close()
  console.log('DONE charDone=' + charDone + ' facDone=' + facDone)
})().catch(e => { console.error('FATAL', e); process.exit(1) })