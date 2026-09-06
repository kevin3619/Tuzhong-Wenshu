import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'verify_i4b.log')
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile'), { channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 } })
const page = ctx.pages()[0] || await ctx.newPage()
const push = (s) => fs.appendFileSync(LOG, s + '\n')
fs.writeFileSync(LOG, '')
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.evaluate(() => { try { document.cookie = 'auth_user=kevin; path=/' } catch (e) {} })
await page.waitForTimeout(1000)
const aid='d2010e15-03a4-4197-aca5-f572af6e9d94'
// 种子：基于关键剧情节点动态卷数（清掉用户手动卷配置，强制走动态派生）
await page.evaluate((aid)=>{
  localStorage.setItem('tuzhong-active-novel-id', aid)
  localStorage.setItem('tuzhong-current-step', 'chapters')
  try{ localStorage.removeItem('tuzhong-draft-volume-'+aid) }catch(e){}
  try{ localStorage.removeItem('tuzhong-volume-config') }catch(e){}
}, aid)
await page.locator('text=草稿箱').first().click({ timeout: 6000, force: true }).catch(e=>push('draft-err:'+e.message))
await page.waitForTimeout(1800)
const _cont=page.getByText('继续生成',{exact:true}).first()
if(await _cont.count()){ await _cont.click({ timeout:8000, force:true }).catch(e=>push('cont-err:'+e.message)) }
await page.waitForTimeout(9000)
// localStorage 关键剧情节点 -> 卷数来源
push('KPSRC=' + JSON.stringify(await page.evaluate(()=>{
  try{
    const gd=JSON.parse(localStorage.getItem('tuzhong-generated-data')||'{}')
    const kp=gd.keyPlots||{}
    const ol=gd.outline||{}
    return {
      kpVolumes: Array.isArray(kp.volumes)? kp.volumes.length : 0,
      kpVolFirst: (kp.volumes&&kp.volumes[0])? JSON.stringify(kp.volumes[0]).slice(0,180) : null,
      kpNodes: Array.isArray(kp.keyPlots)? kp.keyPlots.length : 0,
      outlineStages: Array.isArray(ol.stages)? ol.stages.length : 0,
    }
  }catch(e){ return { err:String(e) } }
}), null, 1))
// 导图点击「分卷章节划分」确保在该步骤，然后 dump 卷与章节结构
const btn = page.locator('.wenshu-step-nav button').filter({ hasText: '分卷章节划分' }).first()
if (await btn.count()) { await btn.click({ force: true }).catch(e=>push('nav-err:'+e.message)); await page.waitForTimeout(5000) }
push('CHAPTERS=' + JSON.stringify(await page.evaluate(()=>{
  const val=el=>(el&&el.value!==undefined?el.value:(el&&el.textContent||'')).trim()
  // 全部有值输入框（含卷标题/章标题）
  const inputs=[...document.querySelectorAll('input,textarea')].map(i=>val(i)).filter(v=>v&&v.length>=4)
  // 卷标题卡片：抓取含「卷第」的加粗标题或输入值
  const volTitles=inputs.filter(v=>/走|卷|章|风|云|行|传/.test(v)&&v.length<=12)
  const body=document.body.innerText||''
  return {
    inputSample: [...new Set(inputs)].slice(0,60),
    volTitles:[...new Set(volTitles)].slice(0,20),
    hasGenBtn: body.indexOf('按此配置生成章节')>=0,
    inChapters: body.indexOf('分卷章节划分')>=0,
    hasChapterN: /第.{1,3}卷/.test(body),
  }
}), null, 1))
await page.screenshot({ path: path.join(ROOT, 'v_i4b_chap.png'), fullPage:true }).catch(()=>{})
await ctx.close().catch(()=>{}); process.exit(0)