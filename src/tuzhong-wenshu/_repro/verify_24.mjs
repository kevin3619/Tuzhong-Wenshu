import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'verify_24.log')
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
if (await cont.count()) { await cont.click({ timeout: 8000, force: true }).catch(e=>push('cont-err:'+e.message)); await page.waitForTimeout(4500) }
if (await page.getByText('继续生成', { exact: true }).count()) {
  await page.keyboard.press('Escape').catch(()=>{}); await page.waitForTimeout(800)
  await page.mouse.click(10,10).catch(()=>{}); await page.waitForTimeout(500)
}
const go = async (label, wait=3500)=>{ const ch=page.getByText(label,{exact:true}).first(); if(await ch.count()){ await ch.click({timeout:8000, force:true}).catch(e=>push('click-'+label+'-err:'+e.message)); await page.waitForTimeout(wait) } }

// ========== 问题2：主要人物设定 ==========
push('='.repeat(60))
await go('主要人物设定', 4000)
// 列出所有可见卡片标题 + 是否有进阶设定 Tab
push('CHAR_CARDS=' + JSON.stringify(await page.evaluate(()=>{
  const cards=[...document.querySelectorAll('div')].filter(n=>{
    const t=n.innerText||''; return t.indexOf('基本设定')>=0 && t.length<800 && /朱由榔|主角|女主|反派|配角/.test(t)
  })
  return cards.map(c=>c.innerText.split('\n').slice(0,3).join(' | ')).slice(0,20)
}), null, 1))
// 点第一个主角卡片的「进阶设定」
const advBtns = page.locator('button:has-text("进阶设定"), [role=tab]:has-text("进阶设定"), div:has-text("进阶设定")').first()
await advBtns.click({ timeout: 6000, force: true }).catch(e=>push('advclick-err:'+e.message))
await page.waitForTimeout(1200)
push('PROTAGONIST_ADV=' + JSON.stringify(await page.evaluate(()=>{
  // 找朱由榔卡片
  const cards=[...document.querySelectorAll('div')].filter(n=>{const t=n.innerText||''; return t.indexOf('基本设定')>=0 && t.indexOf('朱由榔')>=0 && t.length<2000})
  const card = cards[cards.length-1] || (cards[0]||null)
  if(!card) return 'NO_CHAR_CARD'
  // 提取 label:value 对
  const rows=[]
  card.querySelectorAll('label,input,textarea').forEach(el=>{
    if(el.tagName==='LABEL'){ return }
    const prev=el.previousElementSibling
    const lab=prev&&(prev.textContent||'').trim().replace(/[：:]/g,'')
    if(lab&&lab.length<24) rows.push([lab, (el.value||el.textContent||'').trim().slice(0,150)])
  })
  return { cardText: card.innerText.slice(0,400), rows: rows.slice(0,24) }
}), null, 1))
await page.screenshot({ path: path.join(ROOT, 'v2_char_adv.png'), fullPage:true }).catch(()=>{})

// ========== 问题4：分卷章节划分 ==========
push('='.repeat(60))
await go('分卷章节划分', 4000)
push('CHAP_DOM=' + JSON.stringify(await page.evaluate(()=>{
  const val=el=>(el&&el.value!==undefined?el.value:(el&&el.textContent||'')).trim()
  const volTitles=[], volSummaries=[], chapTitles=[]
  document.querySelectorAll('input,textarea').forEach(i=>{
    const prev=i.previousElementSibling; if(prev){ const l=(prev.textContent||'').trim()
      if(/卷标题|卷名|第.卷.*名/.test(l)) { if(val(i).length) volTitles.push(val(i).slice(0,60)) }
      else if(/卷摘要|卷简/.test(l)) { if(val(i).length) volSummaries.push(val(i).slice(0,80)) } }
  })
  // 章节标题：输入框或含 第X章 的文本
  document.querySelectorAll('input,textarea').forEach(i=>{ if(/第.{1,4}章/.test(val(i))) chapTitles.push(val(i).slice(0,50)) })
  // 按钮
  const btns=[...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).filter(x=>x&&x.length<18)
  return { volTitles, volSummaries, chapTitles:[...new Set(chapTitles)].slice(0,20), buttons:[...new Set(btns)].slice(0,30),
           hasVolumeStr: (document.body.innerText||'').indexOf('按此配置生成章节')>=0 }
}), null, 1))
await page.screenshot({ path: path.join(ROOT, 'v2_chap.png'), fullPage:true }).catch(()=>{})
await ctx.close().catch(()=>{}); process.exit(0)