// 从公网对角度抓取当前进入向导后加载的 chunk，检索"大反派/终极Boss"，区分是服务器/nginx缓存还是浏览器缓存
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 1000 },
  })
  let page = null
  for (const p of ctx.pages()) { const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 50)).catch(()=>''); if (t.trim()) { page = p; break } }
  if (!page) page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(20000)

  // 用一个全新无缓存的 context 加载，绕过浏览器磁盘缓存
  const freshCtx = await chromium.launchPersistentContext(path.join(__dirname, '..', '_profile_tmp_' + Date.now()), {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 1000 },
  })
  const fp = freshCtx.pages()[0] || await freshCtx.newPage()
  fp.setDefaultTimeout(20000)
  await fp.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 })
  await fp.waitForTimeout(3000)
  // 需要登录才能进向导。尝试用现有 profile 的 localStorage 无登录态也行，直接抓页面加载的 chunk
  const chunks = await fp.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('/_next/static/chunks/') && !n.includes('turbopack'))
    .concat(Array.from(document.querySelectorAll('script[src]')).map(s=>s.src).filter(n=>n.includes('/_next/static/chunks/'))))
  const uniq = [...new Set(chunks)]
  console.log('UNIQUE_CHUNKS=', uniq.length)
  let hits = []
  const req = freshCtx.request
  for (const c of uniq) {
    try { const r = await req.get(c); const t = await r.text(); if (t.includes('大反派')) hits.push(c.split('/').pop()) } catch(e){}
  }
  console.log('PUBLIC_CHUNKS_WITH_BOSS=', JSON.stringify(hits))
  // 也检查主 HTML 是否含新标记提示
  const html = await fp.evaluate(() => document.documentElement.outerHTML.length)
  console.log('HTML_LEN=', html)
  await freshCtx.close()
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })