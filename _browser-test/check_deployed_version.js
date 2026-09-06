// 确认线上部署代码版本：检查 JS chunk 是否含最新修复标记
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(20000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)

  // 收集所有 JS 资源
  const scripts = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('script[src]').forEach(s => out.push(s.src))
    return out
  })
  console.log('SCRIPTS:')
  scripts.forEach(s => console.log(' ', s))

  // 逐个抓取并检查关键标记
  const MARKERS = {
    'tuzhong-step-models': '思维导图模型恢复(2026-09-06修复)',
    'normalizeFactionsData': '势力归一化',
    'handleInitChaptersFrame': '章节框架初始化',
    'userModifiedVolumeConfig': '卷配置',
  }
  const results = {}
  for (const url of scripts) {
    try {
      const resp = await page.context().request.get(url)
      const txt = await resp.text()
      for (const [marker, label] of Object.entries(MARKERS)) {
        if (txt.includes(marker)) {
          if (!results[marker]) results[marker] = { found: true, label, inScripts: [] }
          results[marker].inScripts.push(url.split('/').pop().slice(0, 60))
        }
      }
    } catch (e) { /* ignore */ }
  }
  console.log('\nMARKERS CHECK:')
  for (const [marker, v] of Object.entries(results)) {
    console.log(' ', marker, '=>', v.label, 'FOUND in', v.inScripts.join(', '))
  }
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
