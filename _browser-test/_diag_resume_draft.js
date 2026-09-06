// 诊断：打开草稿箱《永历中兴》，dump localStorage 草稿键 + 输入主题环节 DOM
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1600, height: 1400 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 60)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) page = ctx.pages()[0] || await ctx.newPage()
  page.setDefaultTimeout(12000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3500)

  // 1) 打开草稿箱
  let boxBtn = page.locator('button:has-text("草稿箱")').first()
  let openedBox = false
  if (await boxBtn.count()) { await boxBtn.click(); await page.waitForTimeout(2500); openedBox = true }

  // 2) 从中找到《永历中兴》卡片上的"打开/继续生成"按钮
  let clickedOpen = false
  const card = page.locator('text=永历中兴').first()
  if (await card.count()) {
    const cardEl = card.locator('xpath=ancestor::div[contains(.,"继续生成") or contains(.,"打开草稿") or contains(.,"恢复")][last()]').first()
    // 尝试多种按钮
    for (const label of ['继续生成', '打开草稿', '继续写作', '恢复草稿', '打开']) {
      const b = page.locator(`div:has-text("永历中兴") button:has-text("${label}")`).first()
      if (await b.count()) { await b.click({ timeout: 8000 }).catch(()=>{}); clickedOpen = true; break }
    }
    await page.waitForTimeout(4000)
  }

  // 3) dump 关键 localStorage（按 active id 隔离）+ 全局主题
  const state1 = await page.evaluate(() => {
    const out = {}
    try {
      const keys = Object.keys(localStorage)
      out.allKeys = keys.filter(k => k.includes('draft') || k.includes('theme') || k.includes('active') || k.includes('current-step') || k.includes('generated'))
      out.activeId = localStorage.getItem('tuzhong-active-novel-id')
      out.currentStepKey = localStorage.getItem('tuzhong-current-step')
      out.globalThemeRaw = localStorage.getItem('tuzhong-theme-input')
      if (out.globalThemeRaw) { try { out.globalTheme = JSON.parse(out.globalThemeRaw) } catch { out.globalTheme = null } }
      // 扫描所有 per-draft theme 快照
      out.themeSnapshots = []
      for (const k of keys) {
        if (k.indexOf('tuzhong-draft-theme-') === 0) {
          const id = k.replace('tuzhong-draft-theme-', '')
          let v = null; try { v = JSON.parse(localStorage.getItem(k)) } catch {}
          out.themeSnapshots.push({ id, step: localStorage.getItem('tuzhong-draft-step-' + id), theme: v })
        }
      }
      // generated-data 结构概览
      const gdRaw = localStorage.getItem('tuzhong-generated-data')
      if (gdRaw) {
        const gd = JSON.parse(gdRaw)
        out.gdShape = Object.keys(gd)
        out.gdIdeaKeys = gd.idea ? Object.keys(gd.idea) : null
        out.gdIdea = gd.idea ? { title: gd.idea.title, genre: gd.idea.genre, protagonistName: gd.idea.protagonistName, userDesign: (gd.idea.userDesign||'').slice(0,120), keywords: gd.idea.keywords } : null
      }
    } catch (e) { out.err = e.message }
    return out
  })

  // 4) 判断是否进入向导，若有步骤条点击"输入主题"环节
  const navInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => /输入主题|创作主题|下一步|上一步/.test(b.textContent||''))
    return btns.map(b => ({ txt: (b.textContent||'').replace(/\s+/g,' ').slice(0,20), cls: String(b.className).slice(0,50) })).slice(0,20)
  })

  console.log(JSON.stringify({ openedBox, clickedOpen, state1, navInfo }, null, 1))
  await page.screenshot({ path: '_diag_resume_draft.png' }).catch(()=>{})
  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })