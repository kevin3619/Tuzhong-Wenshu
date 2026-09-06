// 线上核验：清空localStorage避免残留 → 草稿箱进入《永历中兴》 → 导图两行 + 角色字段
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1400 } })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(3000)

  // 清除残留
  await page.evaluate(() => {
    ['tuzhong-active-novel-id','tuzhong-current-step','tuzhong-generated-data','tuzhong-volume-config','tuzhong-generated-chapters','tuzhong-current-chapter-idx','tuzhong-theme-input'].forEach(k=>localStorage.removeItem(k))
  })
  const before = await page.evaluate(() => localStorage.getItem('tuzhong-active-novel-id'))
  console.log('activeId_after_clear=', before)

  // 草稿箱 → 继续生成
  await page.getByText('草稿箱', { exact: true }).first().click({ timeout: 8000 }).catch(()=>console.log('no drafts btn'))
  await page.waitForTimeout(1200)
  const contBtn = page.getByText('继续生成', { exact: true }).first()
  if (await contBtn.count()) { await contBtn.click({ timeout: 8000 }); console.log('continue.clicked'); } else { console.log('continue NOT found') }
  await page.waitForTimeout(9000)

  const s = await page.evaluate(() => {
    const nav = document.querySelector('.wenshu-step-nav')
    let rows = []
    if (nav) {
      const btns = Array.from(nav.querySelectorAll('button, [role="button"]')).filter(b=>{const t=(b.textContent||'').trim();return t&&t.length<12})
      for (const b of btns) {
        const r = b.getBoundingClientRect()
        let row = rows.find(x=>Math.abs(x.top-r.top)<10)
        if(!row){row={top:r.top,items:[]};rows.push(row)}
        row.items.push((b.textContent||'').trim())
      }
      rows.sort((a,b)=>a.top-b.top)
    }
    const tabs = Array.from(document.querySelectorAll('button')).map(b=>(b.textContent||'').trim()).filter(t=>/基础设定|进阶设定|属性面板|深度设定/.test(t))
    return {
      stepNavFound: !!nav,
      rowCount: rows.length,
      rows: rows.map(x=>x.items),
      stepTabs: [...new Set(tabs)],
      activeId: localStorage.getItem('tuzhong-active-novel-id'),
      curStep: localStorage.getItem('tuzhong-current-step'),
      bodyHead: (document.querySelector('main')?.innerText||document.body.innerText||'').replace(/\n+/g,'\n').slice(0,200),
    }
  })
  console.log('RESULT=', JSON.stringify(s, null, 1))
  await page.screenshot({ path: path.join(__dirname, '_verify_wizard.png'), fullPage: false })
  await ctx.close().catch(()=>{})
})().catch(e => { console.error('FATAL', e); process.exit(1) })