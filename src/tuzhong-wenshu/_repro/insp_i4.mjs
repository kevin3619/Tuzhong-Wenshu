import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'insp_i4.log')
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), { channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 } })
const page = ctx.pages()[0] || await ctx.newPage()
const push = (s) => fs.appendFileSync(LOG, s + '\n')
fs.writeFileSync(LOG, '')
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.evaluate(() => { try { document.cookie = 'auth_user=kevin; path=/' } catch (e) {} })
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(e => push('draft-err:' + e.message))
await page.waitForTimeout(2000)
const cont = page.getByText('继续生成', { exact: true }).first()
if (await cont.count()) { await cont.click({ timeout: 8000 }).catch(e=>push('cont-err:'+e.message)); await page.waitForTimeout(4000) }
const go = async (label, wait=3000)=>{ const ch=page.getByText(label,{exact:true}).first(); if(await ch.count()){ await ch.click({timeout:8000}).catch(e=>push('click-'+label+'-err:'+e.message)); await page.waitForTimeout(wait) } }
await go('分卷章节划分', 3000)
// localStorage chapters state
push('LS_CHAPS=' + await page.evaluate(()=>{ try{ return JSON.stringify(Object.keys(localStorage).filter(k=>/chapter|volume|draft|步骤|step/i.test(k)).map(k=>[k, (localStorage.getItem(k)||'').slice(0,200)])) }catch(e){return 'err:'+e.message} }))
// DOM: volume cards + config values
push('DOM=' + JSON.stringify(await page.evaluate(()=>{
  const out = { inputs: [], buttons: [], volTitles: [], volSummaries: [], chapTitles: [], chapSummaries: [] }
  const val = el => (el&&el.tagName==='TEXTAREA'? (el.value||''): (el&&el.value!==undefined? el.value : (el&&el.textContent||'')))
  document.querySelectorAll('input').forEach(i=>{ if(i.value && i.value.length<40) out.inputs.push(i.value.trim()) })
  document.querySelectorAll('button').forEach(b=>{ const t=(b.textContent||'').trim(); if(t&&t.length<14) out.buttons.push(t) })
  document.querySelectorAll('input,textarea').forEach(i=>{ const prev=i.previousElementSibling; if(prev){ const l=(prev.textContent||'').trim(); if(/卷摘要|卷名|卷标题/.test(l)) out.volSummaries.push(val(i).slice(0,60)) } })
  return { inputs:[...new Set(out.inputs)].slice(0,60), buttons:[...new Set(out.buttons)].slice(0,60), volTitles:out.volTitles, volSummaries:out.volSummaries }
}), null, 1))
await page.screenshot({ path: path.join(ROOT, 'i4_chap.png'), fullPage:true }).catch(()=>{})
await ctx.close().catch(()=>{}); process.exit(0)