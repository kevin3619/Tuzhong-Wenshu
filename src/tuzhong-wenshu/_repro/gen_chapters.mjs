import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'gen_chapters.log')
const aid='d2010e15-03a4-4197-aca5-f572af6e9d94'
const push = (s) => fs.appendFileSync(LOG, new Date().toISOString() + ' ' + s + '\n')
fs.writeFileSync(LOG, '')
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile'), { channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 } })
const page = ctx.pages()[0] || await ctx.newPage()
push('start')
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e=>push('goto-err:'+e.message))
await page.waitForTimeout(2500)
await page.evaluate(() => { try { document.cookie = 'auth_user=kevin; path=/' } catch (e) {} })
await page.waitForTimeout(800)
// seed: active novel + chapters step
await page.evaluate((aid)=>{
  try{ const gd=JSON.parse(localStorage.getItem('tuzhong-generated-data')||'{}'); if(gd.chapters) gd.chapters.volumes=[]; localStorage.setItem('tuzhong-generated-data', JSON.stringify(gd)) }catch(e){}
  localStorage.setItem('tuzhong-active-novel-id', aid)
  localStorage.setItem('tuzhong-current-step', 'chapters')
  try{ localStorage.removeItem('tuzhong-draft-volume-'+aid) }catch(e){}
  try{ localStorage.removeItem('tuzhong-volume-config') }catch(e){}
  try{ localStorage.removeItem('tuzhong-generated-chapters') }catch(e){}
}, aid)
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e=>push('reload-err:'+e.message))
await page.waitForTimeout(2000)
// 打开草稿
await page.locator('text=草稿箱').first().click({ timeout: 6000, force: true }).catch(e=>push('draft-err:'+e.message))
await page.waitForTimeout(1800)
const _cont=page.getByText('继续生成',{exact:true}).first()
if(await _cont.count()){ await _cont.click({ timeout:8000, force:true }).catch(e=>push('cont-err:'+e.message)) }
await page.waitForTimeout(7000)
// 导图切到分卷章节划分
const btn = page.locator('.wenshu-step-nav button').filter({ hasText: '分卷章节划分' }).first()
if (await btn.count()) { await btn.click({ force: true }).catch(e=>push('nav-err:'+e.message)); await page.waitForTimeout(3000) }
push('step_ready inChapters=' + (await page.evaluate(()=>(document.body.innerText||'').indexOf('分卷章节划分')>=0)))
// 点击「按此配置生成章节」
const genBtn = page.locator('button:has-text("按此配置生成章节")').first()
if (await genBtn.count()) { push('click_gen'); await genBtn.click({ force: true }).catch(e=>push('genclick-err:'+e.message)) }
else push('NO_GEN_BTN buttons=' + JSON.stringify(await page.evaluate(()=> [...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).filter(x=>x&&x.length<20).slice(0,30))))
// 轮询完成：按钮文本回到「按此配置生成章节」或出现章节标题
const deadline = Date.now() + 30*60*1000 // 最多30分钟
let completed=false, lastStat=''
while(Date.now()<deadline){
  await page.waitForTimeout(8000)
  const st = await page.evaluate(()=>{
    const btns=[...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim())
    const genTxt=btns.find(x=>x.includes('按此配置生成章节')||x.includes('正在生成章节')||x.includes('生成中'))
    const loading=btns.find(x=>x.includes('正在生成章节'))
    // 统计当前章节标题
    const titles=[...document.querySelectorAll('input,textarea')].map(i=>(i.value||'')).filter(v=>/^第.{1,4}章/.test(v))
    const sums=[...document.querySelectorAll('textarea')].map(i=>(i.value||'')).filter(v=>v.length>10)
    return { loading:!!loading, genTxt: genTxt||null, titles: titles.length, sums: sums.length, hasChapters: (document.body.innerText||'').indexOf('章')>=0 }
  }).catch(()=>null)
  const s=JSON.stringify(st)
  if(s!==lastStat){ push('STAT '+s); lastStat=s }
  if(st && !st.loading && st.titles>0){ completed=true; push('DONE titles='+st.titles+' sums='+st.sums); break }
  if(st && st.loading===false && st.genTxt && st.titles>0){ completed=true; break }
}
push('completed='+completed)
push('FINAL=' + JSON.stringify(await page.evaluate(()=>{
  const v=el=>(el&&el.value!==undefined?el.value:(el&&el.textContent||'')).trim()
  const rows=[]
  document.querySelectorAll('input,textarea').forEach(i=>{
    const prev=i.previousElementSibling; const l=prev?(prev.textContent||'').trim().replace(/[：:]/g,''):''
    if(/卷标题|第.卷/.test(l)) rows.push(['VOL', v(i).slice(0,40)])
    else if(/卷摘要/.test(l)) rows.push(['SUMM', v(i).slice(0,80)])
    else if(/^第.{1,4}章/.test(v(i))) rows.push(['CH', v(i).slice(0,50)])
  })
  const empty=document.querySelectorAll('textarea').filter(i=>!(i.value||'').trim()).length
  return { rows: rows.slice(0,60), emptyTextareas: empty }
}), null, 1))
await page.screenshot({ path: path.join(ROOT, 'gen_chapters.png'), fullPage:true }).catch(()=>{})
await ctx.close().catch(()=>{}); process.exit(0)