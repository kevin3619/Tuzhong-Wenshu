// 审计 v8：展开 主要人物设定 中主角(永历帝/朱由榔)卡片，读取各字段值与高级设置
const { chromium } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const OUT = path.join(__dirname, 'audit_zhujiao.txt')
const STEP_DIR = path.join(__dirname, 'wizard_shots')
if (!fs.existsSync(STEP_DIR)) fs.mkdirSync(STEP_DIR, { recursive: true })

;(async () => {
  const log = []
  const w = s => log.push(s)
  w('===== 主要人物设定 · 主角高级设置字段审计 =====')
  w('时间: ' + new Date().toLocaleString('zh-CN') + '\n')

  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.on('dialog', d => d.dismiss().catch(() => {}))
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2000) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(2000) }
  for (let i = 0; i < 30; i++) {
    const n = await page.locator('.step-nav-scroll button').count().catch(() => 0)
    if (n >= 14) break; await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(3000)

  // 点到 主要人物设定
  await page.evaluate(() => {
    const nav = document.querySelector('.step-nav-scroll'); if (!nav) return
    const b = Array.from(nav.querySelectorAll('button')).find(x => (x.textContent || '').includes('主要人物设定'))
    if (b) { b.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }); b.click() }
  })
  await page.waitForTimeout(4000)
  w('URL=' + page.url() + '\n')

  async function dumpInputs(label) {
    const fields = await page.evaluate(() => {
      const out = []
      const push = (t, label, v) => out.push({ t, label, value: String(v).slice(0, 400) })
      document.querySelectorAll('textarea').forEach(el => push('TEXTAREA', el.placeholder || el.parentElement?.getAttribute('data-label') || '', el.value || ''))
      document.querySelectorAll('input:not([type=hidden])').forEach(el => push('INPUT', el.placeholder || '', el.value || ''))
      return out
    }).catch(e => 'ERR:' + e.message)
    w('### ' + label)
    if (Array.isArray(fields) && fields.length) { w(JSON.stringify(fields, null, 1)) } else { w(String(fields)) }
    w('')
  }

  // 尝试展开 永历帝 卡片
  const expandResults = {}
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(e => e.childElementCount === 0 && (e.textContent || '').trim() === '永历帝')
    for (const e of els) {
      let t = e
      for (let i = 0; i < 8; i++) {
        if (t.click && (t.tagName === 'BUTTON' || getComputedStyle(t).cursor === 'pointer' || t.getAttribute('role'))) { t.click(); return true }
        if (t.parentElement) t = t.parentElement
      }
    }
    return false
  })
  await page.waitForTimeout(2500)
  w('=== 展开后文本（永历帝卡片）===')
  const cardText = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(e => e.childElementCount === 0 && (e.textContent || '').trim() === '永历帝')
    if (!els.length) return 'N/A'
    // 向上找卡片容器
    let t = els[0]
    for (let i = 0; i < 12 && t; i++) t = t.parentElement
    return (t && t.innerText) ? t.innerText.slice(0, 3000) : 'container-not-found'
  }).catch(e => 'ERR')
  w(cardText)
  w('')
  await dumpInputs('展开后全部标注字段')

  // 逐个点击主力 tab 看高级设置
  const tabs = ['基础设定', '进阶设定', '属性面板', '深度设定', '外貌特征', '性格特质', '人物弧光', '核心动机', '高级设置']
  for (const tab of tabs) {
    const clicked = await page.evaluate((tm) => {
      const els = Array.from(document.querySelectorAll('*')).filter(e => e.childElementCount === 0 && (e.textContent || '').trim() === tm)
      for (const e of els) {
        let t = e
        for (let i = 0; i < 8; i++) {
          if (t.click && (t.tagName === 'BUTTON' || getComputedStyle(t).cursor === 'pointer')) { t.click(); return true }
          if (t.parentElement) t = t.parentElement
        }
      }
      return false
    }, tab)
    await page.waitForTimeout(1600)
    await dumpInputs('Tab[' + tab + '] 点击=' + clicked)
  }

  await page.screenshot({ path: path.join(STEP_DIR, 'zhujiao_protagonist.png'), fullPage: true }).catch(() => {})
  fs.writeFileSync(OUT, log.join('\n'))
  await ctx.close()
  console.log('DONE v8 size=', fs.statSync(OUT).size)
})().catch(e => { console.error('FATAL', e); process.exit(1) })