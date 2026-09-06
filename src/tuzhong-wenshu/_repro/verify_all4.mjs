import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'verify_all4.log')
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
// 确保弹窗已关闭（若仍显示继续生成则重试 + 清遮罩）
if (await page.getByText('继续生成', { exact: true }).count()) {
  push('modal-still-open, force close')
  await page.keyboard.press('Escape').catch(()=>{}); await page.waitForTimeout(800)
  await page.mouse.click(10, 10).catch(()=>{}); await page.waitForTimeout(500)
}
push('URL=' + page.url())
const go = async (label, wait=3500)=>{ const ch=page.getByText(label,{exact:true}).first(); if(await ch.count()){ await ch.click({timeout:8000, force:true}).catch(e=>push('click-'+label+'-err:'+e.message)); await page.waitForTimeout(wait) } }

// ========== 问题1：导图各环节下方是否显示调用的大模型 ==========
push('='.repeat(60))
push('【问题1】导图导航各环节下方的模型名')
push('NAV_MODELS=' + JSON.stringify(await page.evaluate(()=>{
  // 收集导航栏每个环节项内部的小字（模型名常以浅色小字显示在环节名下方）
  const out=[]
  const nodes=[...document.querySelectorAll('button,div,a,[role=button]')].filter(n=>{
    return n.children && n.children.length>=1 && /环节|设定|大纲|剧情|反派|配角|主角|世界观|力量|势力|分卷|章节/.test(n.textContent||'')
  })
  nodes.slice(0,40).forEach(n=>{
    const inner=(n.textContent||'').trim()
    if(inner.length<40) out.push(inner.replace(/\s+/g,' '))
  })
  // 同时收集 small/span 子元素里的灰色小字
  const smalls=[...document.querySelectorAll('small,span')].map(s=>(s.textContent||'').trim()).filter(x=>x&&x.length<30 && /gpt|deepseek|qwen|glm|模型|kimi|yuan|meta|llama|doubao|开悟|海螺|nv|ernie/i.test(x))
  return { items:[...new Set(out)].slice(0,60), smalls:[...new Set(smalls)].slice(0,40) }
}), null, 1))

// ========== 问题2：主要人物设定-进阶设定 ==========
push('='.repeat(60))
push('【问题2】主要人物设定 - 进阶/属性/深度 Tab')
await go('主要人物设定', 3500)
// 主角卡片通常第一个；尝试点「进阶」「深度设定」「属性设定」等 Tab
for(const t of ['进阶设定','深度设定','属性设定','进阶','深度']){
  const tab=page.getByText(t,{exact:true}).first()
  if(await tab.count()){ await tab.click().catch(()=>{}); await page.waitForTimeout(800) }
}
push('CHAR_ADV=' + JSON.stringify(await page.evaluate(()=>{
  // 找主角（朱由榔）所在卡片：卡片内标题含 朱由榔 或 主角
  const cards=[...document.querySelectorAll('[class*=rounded-xl].bg-white')].filter(n=> n.innerText && /朱由榔|主角/.test(n.innerText))
  return cards.slice(0,2).map(c=>{
    const fields=[]
    c.querySelectorAll('textarea,input,select').forEach(el=>{
      const lab=el.getAttribute('placeholder')|| (el.previousElementSibling? el.previousElementSibling.textContent.trim() : '')
      // 收集所有 label:value
      const prev=el.previousElementSibling
      const l=(prev&&prev.textContent? prev.textContent.trim().replace(/[：:]/g,''):'')
      if(l&&l.length<20) fields.push([l, (el.value||el.textContent||'').slice(0,120)])
    })
    return { title:(c.textContent||'').slice(0,60), fields: fields.slice(0,20) }
  })
}), null, 1))
await page.screenshot({ path: path.join(ROOT, 'v4_char_adv.png'), fullPage:false }).catch(()=>{})

// ========== 问题3：势力设定 ==========
push('='.repeat(60))
push('【问题3】势力设定 - 领地/成员/内部派系等')
await go('势力设定', 3500)
await page.waitForSelector('[class*=rounded-xl].bg-white', { timeout: 10000 }).catch(()=>{})
const facSnap = await page.evaluate(()=>{
  const cards=[...document.querySelectorAll('[class*=rounded-xl].bg-white')].filter(n=> n.innerText && n.innerText.indexOf('理念与定位')>=0)
  return cards.slice(0,14).map(c=>{
    const get=(lbls)=>{
      const el=[...c.querySelectorAll('input,textarea,select')].find(inp=>{
        const prev=inp.previousElementSibling
        return prev && lbls.some(l=>prev.textContent.indexOf(l)>=0)
      })
      return el ? (el.value!==undefined? el.value : el.textContent||'') : null
    }
    // 名称：势力标题（h/首行）
    return {
      name: (c.querySelector('h1,h2,h3,h4,font,b')?.textContent|| c.innerText.split('\n')[0]||'').trim().slice(0,14),
      leader: get(['首领','领袖']),
      territory: get(['领地']),
      members: get(['成员']),
      internalFactions: get(['内部派系']),
      desc: get(['描述']),
      trumpCard: get(['底牌']),
    }
  })
})
push('FAC4=' + JSON.stringify(facSnap, null, 1))
await page.screenshot({ path: path.join(ROOT, 'v4_factions.png'), fullPage:false }).catch(()=>{})

// ========== 问题4：分卷章节划分 ==========
push('='.repeat(60))
push('【问题4】分卷章节划分')
await go('分卷章节划分', 3500)
push('VOL_DOM=' + JSON.stringify(await page.evaluate(()=>{
  const out={ inputs:[], buttons:[], volTitles:[], volSummaries:[], chapTitles:[] }
  const val=el=>(el&&el.value!==undefined?el.value:(el&&el.textContent||'')).trim()
  document.querySelectorAll('input').forEach(i=>{ if(i.value&&i.value.length<40) out.inputs.push(i.value.trim()) })
  document.querySelectorAll('button').forEach(b=>{ const t=(b.textContent||'').trim(); if(t&&t.length<16) out.buttons.push(t) })
  document.querySelectorAll('input,textarea').forEach(i=>{
    const prev=i.previousElementSibling; if(prev){ const l=(prev.textContent||'').trim(); if(/卷标题|卷名|卷名/.test(l)) out.volTitles.push(val(i).slice(0,40)); else if(/卷摘要/.test(l)) out.volSummaries.push(val(i).slice(0,60)) }
  })
  return { seenVols: out.volTitles, seenSum: out.volSummaries, inputs:[...new Set(out.inputs)].slice(0,40), buttons:[...new Set(out.buttons)].slice(0,40) }
}), null, 1))
await page.screenshot({ path: path.join(ROOT, 'v4_chap.png'), fullPage:true }).catch(()=>{})
await ctx.close().catch(()=>{}); process.exit(0)