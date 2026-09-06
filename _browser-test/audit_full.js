// 全流程审计 v9：遍历14步骤，抓取每步表单字段 label/value，检测模板占位与空值
const { chromium } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const OUT = path.join(__dirname, 'audit_full.txt')

// 模板/占位语特征
const TPL_MARKERS = ['性格鲜明','为人处世有其独特原则','多面性的性格','有着自己的坚持和信念','在故事中展现出','形象独特','关键角色','重要人物','神秘人物','由AI','自动添加','示例角色','占位','TODO','待补充','约定俗成','固定的性格模板','[[','{{']

;(async () => {
  const log = []
  const w = s => log.push(s)
  w('===== 永历中兴 全流程字段审计 =====')
  w('时间: ' + new Date().toLocaleString('zh-CN') + '\n')

  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.on('dialog', d => d.dismiss().catch(() => {}))
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  // 确认已登录
  const tok = await page.evaluate(() => !!localStorage.getItem('token')).catch(() => false)
  w('LOGGED_IN=' + tok + '\n')

  // 进入草稿箱
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2000) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(2500) }

  // 等待导航出现
  for (let i = 0; i < 40; i++) {
    const n = await page.locator('.step-nav-scroll button').count().catch(() => 0)
    if (n >= 14) break; await page.waitForTimeout(1000)
  }
  // 读取导航按钮文本并按顺序点击
  const navLabels = await page.evaluate(() => {
    const nav = document.querySelector('.step-nav-scroll')
    if (!nav) return []
    return Array.from(nav.querySelectorAll('button')).map(b => (b.textContent || '').trim())
  }).catch(() => [])
  w('NAV(' + navLabels.length + ')= ' + JSON.stringify(navLabels) + '\n')

  // 遍历步骤：逐个点击导航并抓字段
  const stepNames = navLabels.length ? navLabels : ['世界观设定','主要人物设定','势力设定','人物关系图谱','简介卖点','整体故事大纲','关键剧情节点','分卷章节划分','逐章生成正文']
  for (const name of stepNames) {
    // 按钮文本带模型后缀，用 includes 匹配前缀
    const clicked = await page.evaluate((nm) => {
      const nav = document.querySelector('.step-nav-scroll'); if (!nav) return false
      const b = Array.from(nav.querySelectorAll('button')).find(x => (x.textContent || '').trim().startsWith(nm))
      if (!b) return false
      if (b.disabled) return 'disabled'
      b.scrollIntoView({ behavior: 'instant', block: 'center' }); b.click(); return true
    }, name).catch(() => false)
    await page.waitForTimeout(1800)
    const info = await page.evaluate(() => {
      const body = document.body ? document.body.innerText : ''
      // 内容区：去掉导航部分，取最后的大块
      const out = { heading: '', fields: [], body: body.slice(0, 4000) }
      const h = document.querySelector('h1, h2, h3')
      if (h) out.heading = (h.textContent || '').trim()
      const push = (t, label, v) => out.fields.push({ t, label: label || '', value: String(v).slice(0, 200) })
      document.querySelectorAll('textarea').forEach(el => push('TEXTAREA', el.placeholder || '', el.value || ''))
      document.querySelectorAll('input:not([type=hidden])').forEach(el => push('INPUT', el.placeholder || '', el.value || ''))
      document.querySelectorAll('[contenteditable=true]').forEach(el => push('EDIT', '', el.textContent || ''))
      return out
    }).catch(e => ({ heading: '', fields: [], body: 'ERREVAL ' + e.message }))
    w('\n======================================================================')
    w('[' + (clicked ? '点击ok' : '点击失败') + '] ' + name + '  heading=' + info.heading)
    // 统计本步字段空值与模板命中
    let emptyCnt = 0, tplCnt = 0
    const tgplist = []
    for (const f of info.fields) {
      const v = f.value.trim()
      if (v === '') { emptyCnt++ }
      const hit = TPL_MARKERS.find(m => v.includes(m))
      if (hit) { tplCnt++; tgplist.push(name + '|' + f.label + '|hit:' + hit) }
    }
    w('FIELDS=' + info.fields.length + ' EMPTY=' + emptyCnt + ' TPL_HIT=' + tplCnt)
    info.fields.forEach(f => w('  ' + (f.t === 'TEXTAREA' ? 'TA' : f.t === 'EDIT' ? 'ED' : 'IN') + '[' + (f.label || '').slice(0, 30) + ']=' + (f.value.trim() === '' ? '<EMPTY>' : f.value.slice(0, 80))))
    if (tgplist.length) { w('--TPL--'); tgplist.slice(0, 20).forEach(t => w('  ' + t)) }
  }

  fs.writeFileSync(OUT, log.join('\n'))
  await ctx.close()
  console.log('DONE audit_full size=', fs.statSync(OUT).size)
})().catch(e => { console.error('FATAL', e); process.exit(1) })