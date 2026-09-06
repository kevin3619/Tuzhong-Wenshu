import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'live2.log')
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), { channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 } })
const page = ctx.pages()[0] || await ctx.newPage()
const push = (s) => fs.appendFileSync(LOG, s + '\n')
fs.writeFileSync(LOG, '')
const t = e => (e&&e.textContent||'').replace(/\s+/g,' ').trim()
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.evaluate(() => { try { document.cookie = 'auth_user=kevin; path=/' } catch (e) {} })
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(e => push('draftbox-err:' + e.message))
await page.waitForTimeout(2000)
const cont = page.getByText('继续生成', { exact: true }).first()
if (await cont.count()) { await cont.click({ timeout: 8000 }).catch(e => push('cont-err:' + e.message)); await page.waitForTimeout(4000) }
push('URL=' + page.url())

const go = async (label, extraWait=4000) => {
  const chip = page.getByText(label, { exact: true }).first()
  if (await chip.count()) { try { await chip.click({ timeout: 8000 }) } catch(e){ push(label+'click-err:'+e.message); return false } ; await page.waitForTimeout(extraWait); return true }
  return false
}

// ---- Issue 3: factions values ----
await go('势力设定', 3000)
push('FAC=' + JSON.stringify(await page.evaluate(()=>{
  const cards = [...document.querySelectorAll('[class*=rounded-xl].bg-white')].filter(n=> n.innerText && n.innerText.indexOf('理念与定位')>=0)
  const snap = []
  cards.slice(0,12).forEach(c=>{
    const get = (labels) => {
      const el = [...c.querySelectorAll('input,textarea')].find(inp=>{ const prev=inp.previousElementSibling; return prev && labels.some(l=>prev.textContent.indexOf(l)>=0) })
      return el?el.value:null
    }
    snap.push({
      name: (()=>{ const ni=[...c.querySelectorAll('input')].find(i=>i.previousElementSibling&&i.previousElementSibling.className.indexOf('w-20')>=0); return null })(),
      nameVal: [...c.querySelectorAll('input')].map(i=>i.value).filter(x=>x&&x.length<12).slice(0,4),
      leader: get(['首领：']),
      strength: get(['实力：']),
      territory: get(['领地：']),
      desc: get(['描述：']),
      philosophy: get(['势力理念/宗旨：']),
      symbol: get(['旗帜/标识：']),
      culture: get(['势力文化/风气：']),
      hiddenAgenda: get(['隐藏目的：']),
      relation: get(['与主角关系演变：']),
      trumpCard: get(['势力底牌/杀手锏：']),
      coreConflict: get(['核心利益冲突（驱动剧情）：']),
      developmentTrajectory: get(['势力发展轨迹（兴衰曲线）：']),
    })
  })
  return { cardCount: cards.length, cards: snap }
}), null, 1))

await page.screenshot({ path: path.join(ROOT, 'issue3_fac_values.png'), fullPage:true }).catch(()=>{})

// ---- Issue 2: characters advanced ----
await go('主要人物设定', 5000)
const charCards = await page.evaluate(()=>{
  const cards = [...document.querySelectorAll('[class*=border].bg-white,[class*=rounded].bg-white,[class*=card]')].filter(n=>{ const t2=n.innerText||''; return t2.indexOf('基本设定')>=0 || t2.indexOf('进阶设定')>=0 || (t2.indexOf('别名')>=0 && t2.indexOf('身份')>=0 && t2.length<1200) })
  return cards.length
}).catch(()=>'err')
push('CHAR_CARDS=' + charCards)
// click 进阶设定 tab on first card
await page.locator('button:has-text("进阶设定")').first().click({ timeout: 6000 }).catch(e=>push('advTab-err:'+e.message))
await page.waitForTimeout(1200)
push('ADV=' + JSON.stringify(await page.evaluate(()=>{
  const vals = {}
  const labels = ['别名/称号','出生地/籍贯','能力等级/段位','核心动机','隐藏设定/反差点','弱点/软肋','角色经历/重大事件','人际网络']
  labels.forEach(l=>{
    const lb = [...document.querySelectorAll('label')].find(el=>el.textContent.trim()===l || el.textContent.indexOf(l)>=0)
    if(!lb) { vals[l]='NO-LABEL'; return }
    let inp = lb.nextElementSibling
    vals[l] = inp? (inp.value!==undefined? inp.value.slice(0,80) : inp.textContent.trim().slice(0,80)) : 'NO-INPUT'
  })
  // names visible
  const names = [...document.querySelectorAll('h3,h4,[class*=font-bold]')].map(n=>n.textContent.trim()).filter(x=>x&&x.length<15)
  return { vals, names:[...new Set(names)].slice(0,30) }
}), null, 1))
await page.screenshot({ path: path.join(ROOT, 'issue2_adv_fix.png'), fullPage:true }).catch(()=>{})

await ctx.close().catch(()=>{}); process.exit(0)