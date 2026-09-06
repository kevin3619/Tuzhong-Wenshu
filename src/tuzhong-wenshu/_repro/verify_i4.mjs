import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'verify_i4.log')
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile'), { channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 } })
const page = ctx.pages()[0] || await ctx.newPage()
const push = (s) => fs.appendFileSync(LOG, s + '\n')
fs.writeFileSync(LOG, '')
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.evaluate(() => { try { document.cookie = 'auth_user=kevin; path=/' } catch (e) {} })
await page.waitForTimeout(1200)
// 种子：把当前步骤强制设为 chapters，并确保 active-novel 指向永历中兴草稿
await page.evaluate(()=>{
  const aid='d2010e15-03a4-4197-aca5-f572af6e9d94'
  localStorage.setItem('tuzhong-active-novel-id', aid)
  localStorage.setItem('tuzhong-current-step', 'chapters')
  localStorage.setItem('tuzhong-step-'+aid, 'chapters')
  localStorage.setItem('tuzhong-draft-step-'+aid, 'chapters')
  try{ localStorage.removeItem('tuzhong-draft-volume-'+aid) }catch(e){}
  try{ localStorage.removeItem('tuzhong-volume-config') }catch(e){}
  // 记录修复前 landmarks
})
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(3000)
// 打开草稿箱 → 继续生成，挂载向导（会按 chapters 步骤恢复并触发动态卷框架）
await page.locator('text=草稿箱').first().click({ timeout: 6000, force: true }).catch(e=>push('draft-err:'+e.message))
await page.waitForTimeout(1800)
const _cont=page.getByText('继续生成',{exact:true}).first()
if(await _cont.count()){ await _cont.click({ timeout:8000, force:true }).catch(e=>push('cont-err:'+e.message)) }
await page.waitForTimeout(9000)
push('BODY1=' + (await page.evaluate(()=>(document.body.innerText||'').slice(0,400).replace(/\n+/g,' | '))))
push('LS_VOL=' + JSON.stringify(await page.evaluate(()=>{
  const aid='d2010e15-03a4-4197-aca5-f572af6e9d94'
  const out={}
  const get=(k)=>{ try{ const v=localStorage.getItem(k); return v?v.slice(0,600):null }catch(e){return 'err'} }
  out.currentStep=localStorage.getItem('tuzhong-current-step')
  out.draftStep=localStorage.getItem('tuzhong-draft-step-'+aid)
  out.volKey=get('tuzhong-draft-volume-'+aid)
  out.volCfg=get('tuzhong-volume-config')
  // 章节数据里保存的卷框架
  try{ const gd=JSON.parse(localStorage.getItem('tuzhong-generated-data')||'{}'); if(gd.chapters){ out.genChapters={ volCount:(gd.chapters.volumes||[]).length, firstVol: (gd.chapters.volumes&&gd.chapters.volumes[0])?JSON.stringify(gd.chapters.volumes[0]).slice(0,400):null } } }catch(e){ out.parseErr=String(e) }
  return out
}), null, 1))
// 点击中间导图导航「分卷章节划分」（此时应在 chapters 步骤），读取卷标题/卷摘要
await page.waitForTimeout(2000)
push('NAV_BTN=' + await page.locator('.wenshu-step-nav button').filter({hasText:'分卷章节划分'}).count())
const getVols = await page.evaluate(()=>{
  const val=el=>(el&&el.value!==undefined?el.value:(el&&el.textContent||'')).trim()
  const volTitles=[], volSum=[], chapTitles=[]
  document.querySelectorAll('input,textarea').forEach(i=>{
    const prev=i.previousElementSibling
    const l=prev?(prev.textContent||'').trim().replace(/[：:]/g,''):''
    if(/卷标题|卷名|第.?卷.*名/.test(l)&&val(i)) volTitles.push(val(i).slice(0,60))
    else if(/卷摘要|卷简介|卷.简介/.test(l)&&val(i)) volSum.push(val(i).slice(0,90))
    if(/第.{1,4}章/.test(val(i))) chapTitles.push(val(i).slice(0,50))
  })
  const body=document.body.innerText||''
  return { volTitles, volSum: volSum.slice(0,12), chapTitles:[...new Set(chapTitles)].slice(0,15),
    hasGen: body.indexOf('按此配置生成章节')>=0, hasRegen: body.indexOf('重新生成')>=0,
    inChapters: body.indexOf('分卷章节划分')>=0 }
})
push('VOLS=' + JSON.stringify(getVols, null, 1))
await page.screenshot({ path: path.join(ROOT, 'v_i4_chap.png'), fullPage:true }).catch(()=>{})
await ctx.close().catch(()=>{}); process.exit(0)