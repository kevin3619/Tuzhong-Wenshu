// 复测脚本：进入草稿《永历中兴》向导，逐环节验证4个原始问题是否彻底修复
// 1) 思维导图显示各环节使用的大模型  2) 主角高级设置字段完整无截断
// 3) 势力设置基于主角+史实、字段无空值  4) 分卷章节：卷数设置/卷标题/卷摘要基于关键情节节点
// 输出每步详细JSON+截图
const { chromium } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const SHOT = path.join(__dirname, 'verify_shots')

function log(name, obj) {
  console.log('\n===== ' + name + ' =====')
  console.log(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1))
}

;(async () => {
  fs.mkdirSync(SHOT, { recursive: true })
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(12000)

  // --- 1. 进入向导 ---
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  // 登录检查
  const loginBtn = page.locator('button:has-text("登录")').first()
  if (await loginBtn.count()) {
    log('登录态', '未登录! 需要用户先登录')
    await ctx.close(); process.exit(2)
  }
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2000) }
  // 定位《永历中兴》继续生成
  const draftCard = page.locator('text=永历中兴').first()
  if (await draftCard.count()) {
    const card = draftCard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item")][1]')
    const gen = card.locator('button:has-text("继续生成")').first()
    if (await gen.count()) { await gen.click() } else { await draftCard.click() }
    await page.waitForTimeout(4000)
  }
  log('向导URL', page.url())
  await page.screenshot({ path: path.join(SHOT, '00_enter.png'), fullPage: false })

  // 等待步骤导航出现
  for (let i = 0; i < 30; i++) {
    const n = await page.locator('.step-nav-scroll').count().catch(() => 0)
    if (n > 0) break
    const n2 = await page.locator('button:has-text("灵感创作")').count().catch(() => 0)
    if (n2 > 0) break
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(2000)

  // --- 2. 抓取侧边栏步骤列表 ---
  const steps = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.step-nav-scroll button, .step-nav-scroll a, [class*="step"] button, [class*="step"] a'))
    return els.map(e => (e.textContent || '').trim()).filter(t => t && t.length < 20).slice(0, 30)
  }).catch(e => 'ERR:' + e.message)
  log('侧边步骤', steps)

  // --- 3. 逐环节点击验证 ---
  const targets = [
    { name: '思维导图', kw: ['思维导图', '灵感创作'], shot: '01_mindmap' },
    { name: '主角高级设置', kw: ['主要人物设定', '人物设定'], shot: '02_char' },
    { name: '势力设置', kw: ['势力'], shot: '03_faction' },
    { name: '分卷章节', kw: ['分卷章节', '章节划分'], shot: '04_chapters' },
  ]

  for (const t of targets) {
    // 优先点击侧边栏精确按钮
    let clicked = false
    for (const k of t.kw) {
      const b = page.locator('button').filter({ hasText: k }).first()
      if (await b.count()) {
        await b.click({ timeout: 8000 }).catch(() => {})
        clicked = true
        break
      }
    }
    if (!clicked) {
      // 尝试侧边导航文本
      const nav = page.locator(`.step-nav-scroll >> text=${t.kw[0]}`).first()
      if (await nav.count()) { await nav.click().catch(() => {}); clicked = true }
    }
    await page.waitForTimeout(3500)
    const urlNow = page.url()
    // 当前步骤正文文本（正文区，去掉导航与全局）
    const text = await page.evaluate(() => {
      const main = document.querySelector('main, [class*="wizard"], [class*="step-content"], [class*="content-area"]') || document.body
      const raw = (main.textContent || '').replace(/\s+/g, ' ').slice(0, 4000)
      return raw
    }).catch(e => 'ERR:' + e.message)
    log(`环节[${t.name}] URL`, urlNow)
    log(`环节[${t.name}] 正文前4000字`, text)
    await page.screenshot({ path: path.join(SHOT, t.shot + '.png'), fullPage: false }).catch(() => {})
  }

  await ctx.close()
  console.log('\nDONE')
})().catch(e => { console.error('FATAL', e); process.exit(1) })
