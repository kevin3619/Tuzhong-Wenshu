import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'live_all.log')
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), { channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 } })
const page = ctx.pages()[0] || await ctx.newPage()
const push = (s) => fs.appendFileSync(LOG, s + '\n')
fs.writeFileSync(LOG, '')
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.evaluate(() => { try { document.cookie = 'auth_user=kevin; path=/' } catch (e) {} })
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(e => push('draftbox-err:' + e.message))
await page.waitForTimeout(2000)
const cont = page.getByText('继续生成', { exact: true }).first()
if (await cont.count()) { await cont.click({ timeout: 8000 }).catch(e => push('cont-err:' + e.message)); await page.waitForTimeout(4000) }
push('URL=' + page.url())

// ---- Issue 1: step nav model labels ----
const nav = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[data-step-key]')]
  return btns.map(b => ({ key: b.getAttribute('data-step-key'), label: (b.querySelector('span')||{}).textContent||'', models: [...b.querySelectorAll('span')].slice(1).map(s=>s.textContent+':'+(s.className||'')) }))
}).catch(e=>push('nav-err:'+e.message))
push('NAV=' + JSON.stringify(nav, null, 1))

// also capture any amber/green model spans not under data-step-key (desktop nav)
push('MODELSPANS=' + JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('span.text-amber-600,span.text-emerald-600')].map(s=>s.textContent)).catch(()=>null), null, 1))

// click 主要人物设定
const go = async (label, extraWait=3000) => {
  const chip = page.getByText(label, { exact: true }).first()
  if (await chip.count()) { await chip.click({ timeout: 8000 }).catch(e=>push(label+'err:'+e.message)); await page.waitForTimeout(extraWait); return true }
  return false
}
await go('主要人物设定', 4000)
// ---- Issue 2: first character card advanced tab ----
push('CHARS=' + JSON.stringify(await page.evaluate(()=>{
  const t = e => (e&&e.textContent||'').replace(/\s+/g,' ').trim()
  const cards = [...document.querySelectorAll('[data-character-key],[class*=card]')].map(n=>t(n)).filter(x=>x&&x.length>10).slice(0,80)
  return { proto: document.body.innerText.indexOf('进阶设定')>=0, cards:[...new Set(cards)].slice(0,80) }
}), null, 1))

await go('势力设定', 3500)
push('FACTIONS=' + JSON.stringify(await page.evaluate(()=>{
  const t = e => (e&&e.textContent||'').replace(/\s+/g,' ').trim()
  const hasEmpty = document.body.innerText.indexOf('势力数据为空')>=0
  const txt = document.body.innerText
  return { hasEmpty, snippet: txt.slice(Math.max(0,txt.indexOf('势力设定')), txt.indexOf('势力设定')+2500) }
}), null, 1))

await go('分卷章节划分', 4000)
push('CHAPTERS=' + JSON.stringify(await page.evaluate(()=>{
  const txt = (document.body.innerText||'').replace(/\s+/g,' ')
  const empty = txt.indexOf('暂无章节')>=0 || txt.indexOf('没有章节')>=0
  return { hasVolume:'卷' in document.body.innerText, snippet: txt.slice(0, 3000), empty }
}), null, 1))

await ctx.close().catch(()=>{}); process.exit(0)