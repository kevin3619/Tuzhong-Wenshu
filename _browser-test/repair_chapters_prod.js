// 修复线上 settings：基于 keyPlots.volumes 生成 chapters 卷章框架并 POST 回服务器
const { chromium } = require('playwright-core')
const path = require('path')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const API = '/tuzhong-wenshu/api/settings'

const repairFnStr = `(function(e){
  const has = (v)=> (v!==undefined && v!==null && String(v).trim()!=='');
  const nonempty=(s,ff)=> has(s)?String(s).trim():ff;
  let filled=0; const log=[];
  // --- 分卷章节（仅当 volumes 缺失/空 且 keyPlots.volumes 有数据）---
  if(!(e.chapters&&Array.isArray(e.chapters.volumes)&&e.chapters.volumes.length) && e.keyPlots&&Array.isArray(e.keyPlots.volumes)&&e.keyPlots.volumes.length){
    const vols=e.keyPlots.volumes.map((v,vi)=>({
      id:'vol-'+(vi+1), volumeNumber:vi+1,
      name:nonempty(v.title,v.name,'第'+(vi+1)+'卷·中兴'),
      summary:nonempty(v.summary,v.coreObjective,'本卷推进中兴大业的关键转折'),
      coreObjective:nonempty(v.coreObjective,v.summary,'推进中兴大业关键阶段'),
      order:vi+1, chapters:[], keyPlots:[nonempty(v.title,'')].filter(Boolean),
    }));
    const totalCh=60, base=Math.floor(totalCh/vols.length), rem=totalCh%vols.length;
    let seq=1; const flat=[];
    vols.forEach((v,vi)=>{
      const cnt=base+(vi<rem?1:0);
      for(let j=0;j<cnt;j++){
        const ch={ id:'ch-'+(vi+1)+'-'+(j+1), title:v.name+'·第'+(j+1)+'节', summary:'承接卷设，推进「'+v.summary.slice(0,24)+'」的剧情发展', shuangPoints:[v.name+'·关键爽点'], hook:'章末悬念（随正文生成补全）', volume:vi+1, chapterNumber:seq, wordCount:0, status:'pending' };
        v.chapters.push(ch); flat.push(ch); seq++;
      }
    });
    if(!e.chapters) e.chapters={};
    e.chapters.volumes=vols; e.chapters.chapters=flat; e.chapters.chapterCount=flat.length; e.chapters.totalWordCount=0;
    filled+=vols.length+flat.length; log.push('chapters.volumes('+vols.length+')+ch('+flat.length+')');
  }
  return { filled: filled, log: log.slice(0,60) };
})`

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1200, height: 800 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto('https://tuzhongwang.xyz/tuzhong-wenshu', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2500)

  // 1. GET
  const getRes = await page.evaluate(async ({ api, nid }) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } }).catch(e => ({ err: e.message }))
    if (r.err) return { err: r.err }
    const j = await r.json().catch(() => ({ raw: r.status }))
    return { status: r.status, data: (j && (j.data || j)) || {} }
  }, { api: API, nid: NID })
  if (getRes.err || getRes.status !== 200 || !getRes.data) { console.log('GET_FAIL', JSON.stringify(getRes).slice(0, 300)); await ctx.close(); process.exit(1) }
  const entry = getRes.data
  console.log('GET_OK topKeys=', Object.keys(entry).join(','))
  console.log('PRE chapters=', entry.chapters ? (Array.isArray(entry.chapters.volumes) ? 'volumes=' + entry.chapters.volumes.length : typeof entry.chapters) : 'ABSENT')
  console.log('keyPlots.volumes=', entry.keyPlots && Array.isArray(entry.keyPlots.volumes) ? entry.keyPlots.volumes.length : 'NA')

  // 2. 修复
  const repairResult = await page.evaluate(({ fnStr, data }) => {
    const fn = new Function('return ' + fnStr)()
    const out = fn(data)
    return { filled: out.filled, log: out.log.slice(0, 60), data }
  }, { fnStr: repairFnStr, data: entry })
  console.log('REPAIR_FILLED=', repairResult.filled, 'sample=', repairResult.log.join(', '))
  const repaired = repairResult.data || entry

  // 3. POST batch 写回 chapters
  const postRes = await page.evaluate(async ({ api, nid, chapters }) => {
    const token = localStorage.getItem('token') || ''
    const body = { novelId: nid, type: 'batch', chapters }
    const r = await fetch(api, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    }).catch(e => ({ err: e.message }))
    if (r.err) return { err: r.err }
    const j = await r.json().catch(() => ({ raw: r.status }))
    return { status: r.status, body: j }
  }, { api: API, nid: NID, chapters: repaired.chapters || {} })
  console.log('POST_RESULT=', JSON.stringify(postRes).slice(0, 400))

  // 4. 回读验证
  await page.waitForTimeout(1200)
  const verify = await page.evaluate(async ({ api, nid }) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    const d = (j && (j.data || j)) || {}
    return {
      status: r.status,
      hasChapters: d.chapters !== undefined && d.chapters !== null,
      volsLen: d.chapters && Array.isArray(d.chapters.volumes) ? d.chapters.volumes.length : -1,
      chapLen: d.chapters && Array.isArray(d.chapters.chapters) ? d.chapters.chapters.length : -1,
      vol0Name: d.chapters && d.chapters.volumes && d.chapters.volumes[0] ? String(d.chapters.volumes[0].name || '').slice(0, 24) : '',
      vol0Summary: d.chapters && d.chapters.volumes && d.chapters.volumes[0] ? String(d.chapters.volumes[0].summary || '').slice(0, 30) : '',
    }
  }, { api: API, nid: NID })
  console.log('VERIFY=', JSON.stringify(verify, null, 1))
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
