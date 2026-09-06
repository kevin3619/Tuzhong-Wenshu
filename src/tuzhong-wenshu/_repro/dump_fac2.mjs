import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'dump_fac2.log')
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
await go('势力设定', 3000)
// dump full faction objects from page-side state (React props are hard; try global hiseq). Instead extract all field key/value pairs from each faction card DOM.
const snap = await page.evaluate(()=>{
  const cards = [...document.querySelectorAll('[class*=rounded-xl].bg-white')].filter(n=> n.innerText && n.innerText.indexOf('理念与定位')>=0)
  return cards.slice(0,12).map(c=>{
    const pairs = {}
    const rows = [...c.querySelectorAll('div')].filter(d=>{ const sp=d.querySelector('span:first-child'); return sp && sp.textContent && sp.textContent.trim().endsWith('：') })
    rows.forEach(r=>{
      const label = r.querySelector('span:first-child').textContent.replace(/[：:]/g,'').trim()
      let val=''
      const inp=r.querySelector('input,textarea,select'); if(inp) val = (inp.value!==undefined? inp.value : inp.textContent||'').trim()
      else val = r.textContent.replace(label,'').trim()
      if(val) pairs[label]=val.slice(0,60)
    })
    return pairs
  })
})
push('FAC_FULL=' + JSON.stringify(snap, null, 1))
await ctx.close().catch(()=>{}); process.exit(0)

async function go(label, wait){ const ch=page.getByText(label,{exact:true}).first(); if(await ch.count()){ await ch.click({timeout:8000}).catch(e=>push('clickerr:'+e.message)); await page.waitForTimeout(wait) } }