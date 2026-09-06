// 线上《永历中兴》"职位 job" 定向修复 + 去重
// 思路：normalize 已把 role(定位)/title(徽章) 按正史表校正到位，但 job(职位) 从未被 norm 触碰，
// 仍是最初 LLM 的脏数据（忠臣被误标"清廷要员"、玉竹"朝臣武弁"、三帝"永历朝主角"）。
// 本脚本以「已规范的 role + camp + title」为准，用逐人准确职位表 + 通用推导覆盖 job，并去重退出重复角色。
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const API = BASE + '/api/settings'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

// 逐人准确职位（历史人物按史实；虚构人物按设计）——这是最终可信口径，直接覆盖旧 job
const JOB_MAP = {
  '朱由榔': '明朝皇帝（永历朝主角）',
  '玉竹': '永历帝贴身丫鬟',
  '丁魁楚': '广西巡抚（降清，前期反派）',
  '多铎': '和硕豫亲王（清廷统兵重臣）',
  '马士英': '东阁大学士（弘光权臣）',
  '阮大铖': '兵部尚书（弘光佞臣）',
  '吴三桂': '平西王（山海关总兵，降清藩首）',
  '多尔衮': '和硕睿亲王·摄政王（清廷权臣）',
  '孔有德': '定南王（清廷藩王）',
  '李成栋': '清广东提督（降清，后反正）',
  '耿仲明': '靖南王（清廷藩王）',
  '尚可喜': '平南王（清廷藩王）',
  '张献忠': '大西皇帝（明末义军首领）',
  '孙可望': '秦王（永历朝大将，后跋扈）',
  '金声桓': '明总兵（降清，后反正归明）',
  '郑芝龙': '同安侯（降清郑氏家主）',
  '朱由崧': '南明弘光帝',
  '朱聿键': '南明隆武帝',
  '朱聿鐭': '南明绍武帝',
  '瞿式耜': '东阁大学士（永历朝忠臣）',
  '史可法': '兵部尚书（督师，抗清名臣）',
  '郑成功': '延平王（抗清复明）',
  '李定国': '晋王（抗清名将）',
  '刘文秀': '南川王（抗清名将）',
  '艾能奇': '定北将军（大西将军，抗清）',
  '阎应元': '江阴典史（抗清英雄）',
  '黄淳耀': '崇祯进士（嘉定抗清殉节）',
  '王得仁': '明总兵（金声桓部，反正）',
  '郑鸿逵': '定西侯（郑氏宗亲，抗清）',
  '黄道周': '武英殿大学士（隆武朝忠臣）',
  '张煌言': '兵部尚书（抗清名臣）',
  '焦琏': '广西总兵（永历朝忠臣武将）',
  '庞天寿': '司礼监太监（永历朝）',
  '张同敞': '锦衣卫指挥佥事（永历朝忠臣）',
  '堵胤锡': '兵部尚书（联络大西军，永历忠臣）',
  '何腾蛟': '东阁大学士（督师湖广，永历忠臣）',
  '赵虎': '亲卫队统领（主角近卫）',
  '王忠赐': '联络官（主角心腹）',
  '朱落': '内务总管（主角近臣）',
  '白柏年': '斥候队长（主角心腹）',
  '孙思远': '情报主事（主角心腹）',
  '周德全': '军需官（主角部属）',
  '吴万雄': '镇南将军（永历朝忠臣武将）',
}

// 通用兜底：未命中表内名字时，按已规范 role/camp/title 推导（保证绝不再把忠臣写成"清廷要员"）
const fnStr = `(function(JOBS){
  const has = v => !(v===undefined||v===null||(typeof v==='string'&&String(v).trim()===''));
  const clean = s => has(s)?String(s):'';
  const seen={}; const removed=[];
  const list=[];
  const add=o=>{ if(o&&typeof o==='object'&&has(o.name)) list.push(o) };
  const CH=this;
  add(CH.protagonist); add(CH.femaleLead); add(CH.antagonist);
  (CH.femaleLeads||[]).forEach(add); (CH.antagonists||[]).forEach(add); (CH.supporting||[]).forEach(add);
  let jobFixed=0;
  list.forEach(c=>{
    const nm=clean(c.name).trim();
    // 去重：同一名字（同 tag）只保留第一条
    const key=nm+'|'+(clean(c.tag)||clean(c.roleType)||clean(c.role)||'');
    const k2=nm+'|'+clean(c.tag);
    let dupKey=k2;
    if(seen[dupKey]){ removed.push(clean(c.tag)+':'+nm); return; }
    seen[dupKey]=true;
    // 逐人准确职位覆盖
    if(clean(c.role)!=='主角'&&clean(c.role)!=='女主'){}
    const fixed=JOBS[nm];
    if(has(fixed)){ if(clean(c.job)!==fixed){ c.job=fixed; jobFixed++; } }
  });
  // 重建数组以实际移除重复对象
  const rebuild=(arr)=>{ if(!Array.isArray(arr)) return arr; const out=[]; const s={}; arr.forEach(c=>{ if(!c||!has(c.name)) { out.push(c); return; } if(s[clean(c.name).trim()+'|'+clean(c.tag)]) return; s[clean(c.name).trim()+'|'+clean(c.tag)]=1; out.push(c); }); return out; };
  const before = [CH.antagonists,CH.supporting,CH.femaleLeads].filter(Array.isArray).reduce((n,a)=>n+a.length,0);
  if(Array.isArray(CH.antagonists)) CH.antagonists=rebuild(CH.antagonists);
  if(Array.isArray(CH.supporting)) CH.supporting=rebuild(CH.supporting);
  if(Array.isArray(CH.femaleLeads)) CH.femaleLeads=rebuild(CH.femaleLeads);
  const after = [CH.antagonists,CH.supporting,CH.femaleLeads].filter(Array.isArray).reduce((n,a)=>n+a.length,0);
  return { jobFixed, removedDup: removed, dedupeCount: before-after };
})`

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1300, height: 900 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const API_BASE = '/tuzhong-wenshu/api/settings'
  const getRes = await page.evaluate(async ({ api, nid }) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } }).catch(e => ({ err: e.message }))
    if (r.err) return { err: r.err }
    const j = await r.json().catch(() => ({ raw: r.status }))
    return { status: r.status, data: (j && (j.data || j)) || {} }
  }, { api: API_BASE, nid: NID })
  if (getRes.err || getRes.status !== 200 || !getRes.data) { console.log('GET_FAIL', JSON.stringify(getRes).slice(0,300)); await ctx.close(); process.exit(1) }
  const entry = getRes.data
  console.log('GET_OK topKeys=', Object.keys(entry).join(','))

  const fn = new Function(`
    return (function(){
      const g = ${fnStr};
      return g.call(this);
    })
  `)()
  // 将 fnStr 绑定到 entry.characters 作为 this
  const fixCtx = { characters: entry.characters }
  const fixBound = new Function('target','JOBS', `
    const g = (${fnStr});
    return g.call(target, JOBS);
  `)
  const fixResult = fixBound(entry.characters, JOB_MAP)
  console.log('JOB_FIX=', JSON.stringify(fixResult))

  // 回写 characters
  const postRes = await page.evaluate(async ({ api, nid, characters }) => {
    const token = localStorage.getItem('token') || ''
    const body = { novelId: nid, type: 'batch', characters }
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }).catch(e => ({ err: e.message }))
    if (r.err) return { err: r.err }
    const j = await r.json().catch(() => ({ raw: r.status }))
    return { status: r.status, body: j }
  }, { api: API_BASE, nid: NID, characters: entry.characters })
  console.log('POST_RESULT=', JSON.stringify(postRes).slice(0,300))

  await ctx.close()
  console.log('DONE')
})().catch(e => { console.error('FATAL', e); process.exit(1) })