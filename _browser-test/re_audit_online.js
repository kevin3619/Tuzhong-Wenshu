// 线上《永历中兴》全流程复测：拉取全量 settings，按创作环节递归审计空值+模板占位
// 覆盖环节：input, idea, synopsis, worldbuilding, powerSystem, characters, factions, relationships, outline, keyPlots, chapters
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

// 在页面内执行的审计（纯函数，递归）
const auditFnStr = `(function(){ 
  const EMPTY_RE = /^[\\s，。、：:；;,.!?！？\\-—~～…\\/|\\\\']*$/;
  const TPL = ['性格鲜明','性格开朗','性格稳重','性格复杂','有独立思想','为人处世有其独特原则','独特原则','多面性的性格','在故事中展现','重要角色','关键角色','神秘人物','形象独特','不可或缺的重要角色','此角色','本角色','待补充','待定','此处填写','XX','xxx','Lorem'];
  const empty = []; const tpl = [];
  function walk(obj, p, stacked){
    if (obj===null) { empty.push(p + '=(null)'); return }
    if (obj===undefined) { empty.push(p + '=(undefined)'); return }
    const t = typeof obj;
    if (t==='string') {
      const s = obj;
      if (EMPTY_RE.test(s)) { empty.push(p + '=(空串:'+JSON.stringify(s.slice(0,10))+')'); return }
      const isTpl = s.length<=80 && TPL.some(m=> s.indexOf(m)>=0);
      if (isTpl) tpl.push(p + '='+s.slice(0,40));
      return
    }
    if (t==='number'||t==='boolean') return;
    if (Array.isArray(obj)) {
      if (obj.length===0) { empty.push(p + '=[]空数组'); return }
      obj.forEach((v,i)=> walk(v, p+'['+i+']', stacked));
      return
    }
    if (t==='object') {
      if (stacked.indexOf(obj)>=0) { empty.push(p+'=(循环引用)'); return }
      stacked.push(obj);
      const keys = Object.keys(obj);
      if (keys.length===0) { empty.push(p + '=()空对象'); }
      keys.forEach(k=> walk(obj[k], p? (p+'.'+k):k, stacked));
      stacked.pop();
    }
  }
  return { empty: empty.slice(0,600), tpl: tpl.slice(0,300), emptyTotal:0 };
})`

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1200, height: 800 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    if (t.trim()) { page = p; break }
  }
  if (!page) { page = ctx.pages()[0] || await ctx.newPage() }
  page.setDefaultTimeout(10000)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)

  // 1. 拉取全量
  const data = await page.evaluate(async ({ api, nid }) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } }).catch(e => ({ err: e.message }))
    if (r.err) return { err: r.err }
    const j = await r.json().catch(() => ({ raw: r.status }))
    return { status: r.status, d: (j && (j.data || j)) || {} }
  }, { api: '/tuzhong-wenshu/api/settings', nid: NID })
  if (data.err || !data.d) { console.log('GET_FAIL', JSON.stringify(data).slice(0, 300)); await ctx.close(); process.exit(1) }
  const d = data.d
  console.log('STATUS=' + data.status, 'topKeys=', Object.keys(d).join(','))

  // 2. 分环节审计（字段级统计）
  const sections = ['idea', 'synopsis', 'worldbuilding', 'powerSystem', 'characters', 'factions', 'relationships', 'outline', 'keyPlots', 'chapters']
  for (const sec of sections) {
    const exists = Object.prototype.hasOwnProperty.call(d, sec)
    if (!exists) { console.log('[' + sec + '] NO_TOP_KEY'); continue }
    const res = await page.evaluate((o) => {
      function fieldOf(p){ const t=p.split('.'); let last=t[t.length-1].replace(/\[\d+\]$/,'').replace(/\]/g,''); let pre=t.length>1?t[t.length-2].replace(/\[\d+\]$/,''):''; return (pre?pre+'.':'')+last }
      const EMPTY_RE = /^[\s，。、：:；;,.!?！？\-—~～…\/|\\']*$/;
      const TPL = ['性格鲜明','性格开朗','性格稳重','性格复杂','有独立思想','为人处世有其独特原则','独特原则','多面性的性格','在故事中展现','重要角色','关键角色','神秘人物','形象独特','不可或缺的重要角色','此角色','本角色','待补充','待定','此处填写','XX','xxx','Lorem','作为重要角色在剧情中发挥关键作用','与主角的关系推动故事发展'];
      const byField={}; const tplField={}; const instances=[];
      function add(m, field, sample){ m[field]=m[field]||{n:0,samples:[]}; if(m[field].n<1) m[field].samples.push(sample); m[field].n++ }
      function walk(obj,p,st){
        if (obj===null){ add(byField, fieldOf(p+p), p+'=(null)'); instances.push(p+'=(null)'); return}
        if (obj===undefined){ add(byField, fieldOf(p+p), p+'=(undef)'); instances.push(p+'=#undef'); return}
        const t=typeof obj
        if(t==='string'&&p){
          const s=obj
          if(EMPTY_RE.test(s)){ add(byField, fieldOf(p), p+'=空串'); instances.push(p+'=空串'); return }
          if(s.length<=80&&TPL.some(m=>s.indexOf(m)>=0)){ add(tplField, fieldOf(p), p+'='+s.slice(0,30)); instances.push('TPL '+p+'='+s.slice(0,30)); return }
          return
        }
        if(t==='number'||t==='boolean')return
        if(Array.isArray(obj)){ if(obj.length===0&&p){ add(byField, fieldOf(p), p+'=[]'); instances.push(p+'=[]'); } obj.forEach((v,i)=>walk(v,p+'['+i+']',st)); return}
        if(t==='object'){ if(st.indexOf(obj)>=0)return; st.push(obj); const ks=Object.keys(obj); if(ks.length===0&&p)add(byField, fieldOf(p), p+'={}'); ks.forEach(k=>walk(obj[k],p?p+'.'+k:k,st)); st.pop(); }
      }
      walk(o,'sec',[])
      return { byField, tplField }
    }, d[sec])
    const emptyFields = res.byField
    const tplFields = res.tplField
    console.log('\n===== [' + sec + '] =====')
    console.log('-- EMPTY fields --')
    Object.keys(emptyFields).sort().forEach(k => console.log('  ' + k + ' ×' + emptyFields[k].n + '  ' + emptyFields[k].samples.join(' | ')))
    if (Object.keys(tplFields).length) {
      console.log('-- TPL fields --')
      Object.keys(tplFields).sort().forEach(k => console.log('  ' + k + ' ×' + tplFields[k].n + '  ' + tplFields[k].samples.join(' | ')))
    } else { console.log('  (无模板占位)') }
  }

  await ctx.close()
  console.log('\nDONE')
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })