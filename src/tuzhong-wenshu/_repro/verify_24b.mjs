import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'verify_24b.log')
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile'), { channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 } })
const page = ctx.pages()[0] || await ctx.newPage()
const push = (s) => fs.appendFileSync(LOG, s + '\n')
fs.writeFileSync(LOG, '')
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.evaluate(() => { try { document.cookie = 'auth_user=kevin; path=/' } catch (e) {} })
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(e => push('draft-err:' + e.message))
await page.waitForTimeout(2000)
const cont = page.getByText('继续生成', { exact: true }).first()
if (await cont.count()) { await cont.click({ timeout: 8000, force: true }).catch(e=>push('cont-err:'+e.message)); await page.waitForTimeout(4500) }
if (await page.getByText('继续生成', { exact: true }).count()) {
  await page.keyboard.press('Escape').catch(()=>{}); await page.waitForTimeout(800)
  await page.mouse.click(10,10).catch(()=>{}); await page.waitForTimeout(500)
}
// 可靠导航：点击 .wenshu-step-nav 内的环节按钮
const go = async (label, wait=3500)=>{
  const btn = page.locator('.wenshu-step-nav button').filter({ hasText: label }).first()
  if (await btn.count()) { await btn.click({ timeout: 8000, force: true }).catch(e=>push('click-'+label+'-err:'+e.message)); await page.waitForTimeout(wait); return true }
  push('NO-NAV-'+label); return false
}

// ========== 问题2：主要人物设定 - 进阶设定 ==========
push('='.repeat(60))
push('【问题2】主要人物设定 · 进阶设定')
await go('主要人物设定', 4000)
// 点朱由榔(主角)卡片的「进阶设定」tab
const advTab = page.locator('button:has-text("进阶设定")').first()
if (await advTab.count()) { await advTab.click({ force: true }).catch(e=>push('advtab-err:'+e.message)); await page.waitForTimeout(1200) }
push('ADV_FIELDS=' + JSON.stringify(await page.evaluate(()=>{
  // 收集所有 label:value（进阶设定区），带出生地/别名等字段
  const res=[]
  document.querySelectorAll('label').forEach(lb=>{
    const lab=(lb.textContent||'').trim()
    if(lab && ['别名/称号','出生地/籍贯','能力等级/段位','核心动机','核心技能/金手指','标志性装备/道具','专业技能/技法','隐藏设定/反差点','弱点/软肋'].includes(lab)){
      const el=lb.nextElementSibling
      let v=''
      if(el) v = el.tagName==='TEXTAREA'||el.tagName==='INPUT' ? (el.value||'') : (el.textContent||'')
      res.push([lab, v.slice(0,200)])
    }
  })
  // 识别主角：含 永历帝/朱由榔 的卡片名
  const names=[...document.querySelectorAll('.wenshu-step-nav button span, h1,h2,h3,h4,[class*=font-bold]')].map(n=>(n.textContent||'').trim()).filter(x=>x&&x.length<16)
  return { fields: res, visibleNames:[...new Set(names)].slice(0,40) }
}), null, 1))
// 读取主角名（第一个 name? 通过输入框 value）
push('CHAR_NAMES=' + JSON.stringify(await page.evaluate(()=>{
  // 角色名通常在姓名输入框
  return [...document.querySelectorAll('input[type=text],input')].map(i=>i.value.trim()).filter(v=>v&&v.length<15).slice(0,30)
}), null, 1))
await page.screenshot({ path: path.join(ROOT, 'v24b_char.png'), fullPage:true }).catch(()=>{})

// ========== 问题4：分卷章节划分 ==========
push('='.repeat(60))
push('【问题4】分卷章节划分')
await go('分卷章节划分', 4500)
push('CHAP=' + JSON.stringify(await page.evaluate(()=>{
  const val=el=>(el&&el.value!==undefined?el.value:(el&&el.textContent||'')).trim()
  const volTitles=[], volSum=[], vols=[]
  document.querySelectorAll('input,textarea').forEach(i=>{
    const prev=i.previousElementSibling
    const l=prev?(prev.textContent||'').trim().replace(/[：:]/g,''):''
    if(/卷标题|卷名|第.*卷.*名/.test(l)&&val(i)) volTitles.push(val(i).slice(0,50))
    else if(/卷摘要|卷简介/.test(l)&&val(i)) volSum.push(val(i).slice(0,80))
  })
  // 结构化卷标题：匹配 "第一卷 标题"
  const body=document.body.innerText||''
  return {
    volTitles, volSum: volSum.slice(0,12),
    hasGenBtn: body.indexOf('按此配置生成章节')>=0,
    hasRegenBtn: body.indexOf('重新生成')>=0,
    bodySnippet: body.slice(0,600).replace(/\n+/g,' | ')
  }
}), null, 1))
await page.screenshot({ path: path.join(ROOT, 'v24b_chap.png'), fullPage:true }).catch(()=>{})
await ctx.close().catch(()=>{}); process.exit(0)