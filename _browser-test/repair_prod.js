// 生产修复：通过已登录浏览器页面上下文，对永历中兴(40249ecb) 用应用API GET→修复→POST(batch)→回读验证
// 全程在页面上下文内用同源 fetch + localStorage token，避免暴露凭据到 shell、不依赖 SSH
const { chromium } = require('playwright-core')
const path = require('path')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const API = '/tuzhong-wenshu/api/settings'

// 在页面内执行的修复逻辑（纯函数，仅填空值，幂等）
const repairFnStr = `(function(e){
  const has = (v)=> (v!==undefined && v!==null && String(v).trim()!=='');
  let filled=0; const log=[];
  const nonempty=(s,ff)=> has(s)?String(s).trim():ff;
  // --- 角色 ---
  const chars=e.characters;
  if(chars){
    const powLadder=((e.outline&&e.outline.stages)||[]).map(s=>(s&&s.powerLevel&&String(s.powerLevel).replace(/[。，、].*$/,'').trim())).filter(Boolean);
    const powFb=powLadder.length?powLadder:['白身微末','县丞知县','州府道台','方面大员','封疆大吏','天下至尊'];
    const allChars=[];
    const pc=o=>{ if(o&&typeof o==='object'&&o.name) allChars.push(o) };
    if(chars._harem===null||chars._harem===undefined){ chars._harem=[]; filled++; log.push('top._harem') }
    pc(chars.protagonist); pc(chars.femaleLead);
    if(Array.isArray(chars.femaleLeads)) chars.femaleLeads.forEach(pc);
    pc(chars.antagonist);
    if(Array.isArray(chars.antagonists)) chars.antagonists.forEach(pc);
    if(Array.isArray(chars.supporting)) chars.supporting.forEach(pc);
    allChars.forEach(c=>{
      const nm=String(c.name||'');
      const role=String(c.role||c.rolePosition||'');
      const isZj=role.includes('主角'), isNz=role.includes('女主'), isFp=role.includes('反派'), isMy=role.includes('盟');
      const ctx=String(c.identity||c.background||c.motivation||'');
      if(!has(c.camp)){
        if(/清军|清廷|清朝|满清/.test(ctx)) c.camp='清军阵营（敌对）';
        else if(/永历|南明|明朝|明室/.test(ctx)) c.camp='永历阵营（主角）';
        else if(isFp) c.camp='敌对阵营（反派）';
        else if(isMy) c.camp='主角阵营·盟友';
        else if(isZj||isNz) c.camp='主角阵营·核心';
        else c.camp='主角阵营';
        filled++; log.push(nm+'.camp');
      }
      if(!has(c.job)){
        if(/皇帝|监国|称帝|天子|帝王/.test(ctx)) c.job='明朝皇帝（永历朝）';
        else if(/妃|皇后|太后|公主/.test(ctx)) c.job='后宫眷属';
        else if(/总督|巡抚|尚书|大学士|总兵|参将|副将|都督|锦衣|知府|知县|参政|布政/.test(ctx)) c.job=String(ctx).replace(/[。，、].*$/,'').slice(0,20);
        else if(isFp) c.job=/清|满/.test(ctx)?'清廷要员':'反派权臣';
        else if(isZj) c.job='永历朝核心人物';
        else c.job='朝臣武弁';
        filled++; log.push(nm+'.job');
      }
      if(!has(c.goal)){
        if(isFp) c.goal=/清|满/.test(ctx)?'助清剪灭南明余烬，博取从龙之功':'倾轧忠良、把持朝纲，处心积虑打压中兴力量';
        else if(isNz) c.goal='辅佐帝王中兴，护佑家国周全，与主角同心共渡时艰';
        else if(isZj) c.goal='统合抗清力量，光复大明江山，开创永历中兴盛世';
        else if(/总督|巡抚|总兵|参将|副将|都督|提督|大将|将军/.test(ctx)) c.goal='整军经武、廓清贼氛，为中兴大业开疆固本';
        else if(/尚书|大学士|侍郎|参政|布政|知府|知县/.test(ctx)) c.goal='辅弼朝纲、肃清党争，助永历朝政归于清明';
        else c.goal='于乱世中为中兴大业贡献力量，求取功名前程';
        filled++; log.push(nm+'.goal');
      }
      if(!has(c.birthplace)){
        c.birthplace=/桂林/.test(ctx)?'广西桂林':/辽东|山海关/.test(ctx)?'辽东（山海关）':/北京|京师/.test(ctx)?'北直隶京师':isZj?'广西桂林桂王府':'大明疆土';
        filled++; log.push(nm+'.birthplace');
      }
      if(!has(c.realmLevel)){
        c.realmLevel=isFp?'权倾一方之枭雄':isNz?'深居内闱之女眷':isZj?'权倾朝野之帝王（超品）':(isMy?'一方将帅重臣':'一方家臣将佐');
        filled++; log.push(nm+'.realmLevel');
      }
      if(!has(c.weapons)){
        c.weapons=isFp?'佩刀、铠甲、御赐兵器':isNz?'贴身佩饰、随身之物':isZj?'玉玺、佩剑、御赐冠冕':'随身兵刃、符牌信物';
        filled++; log.push(nm+'.weapons');
      }
      if(!has(c.experience)){ c.experience=nonempty(c.growthArc, nonempty(c.background, nm+'在明清鼎革乱世中起伏历练')); filled++; log.push(nm+'.experience') }
      if(!has(c.socialNetwork)){
        c.socialNetwork=isZj?'核心班底、忠臣盟友、武将盟友、敌对势力多维交织':isFp?'与主角阵营对立，勾结清廷、拉拢降将':isNz?'与主角及后宫、亲族往来密切':'与主角阵营密切关联，与相关势力互动';
        filled++; log.push(nm+'.socialNetwork');
      }
      if(c.personalityOrigin && String(c.personalityOrigin).trim()===','){ c.personalityOrigin=nonempty(c.personality, nm+'性格根源与成长经历交织'); filled++; log.push(nm+'.personalityOrigin') }
      if(c.growthBackground && String(c.growthBackground).trim()===','){ c.growthBackground=nonempty(c.background, nm+'于乱世中成长历练'); filled++; log.push(nm+'.growthBackground') }
      if(Array.isArray(c.arcNodes)){
        c.arcNodes.forEach((n,i)=>{
          if(!n||typeof n!=='object') return;
          if(!has(n.powerLevel)){
            const st=String(n.stage||n.phase||'');
            let pv='';
            if(/巅峰|超脱|结局|最终/.test(st)) pv=isFp?'实力臻于化境，足与主角终极对决':'已臻此界顶点，无人能及';
            else if(/起步|初生/.test(st)) pv=isFp?'初具锋芒，尚存忌惮':'白身微末，蓄势待发';
            else if(powFb[i]) pv=powFb[i];
            else pv=isFp?'权谋实力随剧情攀升':'随剧情推进稳步精进';
            n.powerLevel=pv; filled++; log.push(nm+'.aN['+i+'].pow');
          }
        });
      }
      if(c._harem===null||c._harem===undefined){ c._harem=[]; filled++; log.push(nm+'._harem') }
    });
  }
  // --- powerSystem.rules ---
  if(e.powerSystem&&e.powerSystem.worldPowerSystem&&!has(e.powerSystem.worldPowerSystem.rules)){
    e.powerSystem.worldPowerSystem.rules='以社稷权柄、军功战勋、历史国运为核心的实力构成。官爵军职、民心威望、火器军备与天命气运共同决定各方在明清鼎革大局中的分量与话语权。';
    filled++; log.push('ps.rules');
  }
  // --- 关系 ---
  const rr=e.relationships;
  if(rr&&Array.isArray(rr.relationships)){
    rr.relationships.forEach(r=>{
      const pa=nonempty(r.personA,r.from), pb=nonempty(r.personB,r.to);
      const typy=String(r.relationshipType||r.type||''); const desc=String(r.description||'');
      const isDj=/敌|对立|仇|对抗/.test(typy+desc);
      if(!has(r.deepConflict)){ r.deepConflict=isDj?pa+'与'+pb+'立场水火不容，围绕权位与信念冲突不断升级，每一次交锋都刺向对方软肋，恩怨与利益纠葛令矛盾难以化解':pa+'与'+pb+'虽走近彼此，却因立场与过往各有难言的留白，暗藏的情感与利害在平静下持续发酵，终将在关键抉择处引爆矛盾'; filled++; log.push('rel.deepConflict') }
      if(!has(r.impactOnPlot)){ r.impactOnPlot='围绕'+pa+'·'+pb+'的联盟与摩擦，为中兴大业时松时紧地注入变数'; filled++; log.push('rel.impact') }
      if(!has(r.keyEvents)){ r.keyEvents='相遇定交、重要波折、误解对峙、生死考验、关系升华（随剧情展开逐层推进）'; filled++; log.push('rel.keyEvents') }
      if(!has(r.emotionChange)){ r.emotionChange='由试探观望渐入信任，再历波折考验后愈显坚定（随剧情逐步演变）'; filled++; log.push('rel.emotion') }
      if(!has(r.strength)){ r.strength=isDj?'壁垒分明、势均力敌且彼此戒备':'互相信任、配合默契，患难中不断加深'; filled++; log.push('rel.strength') }
      if(!has(r.evolutionCurve)){ r.evolutionCurve=isDj?'渐行渐远直至决裂对抗':'由结识到共事，再生嫌隙与弥合，最终患难与共'; filled++; log.push('rel.evolve') }
      if(!has(r.keyMoments)){ r.keyMoments='临危相救、中盘分歧、大局抉择等关键节点'; filled++; log.push('rel.kMoment') }
      if(!has(r.plotInfluence)){ r.plotInfluence=isDj?'构成贯穿始终的对抗阻力，制约主角步伐':'在军政大局与攻伐反复中发挥关键作用'; filled++; log.push('rel.plot') }
    });
  }
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
  // 1. GET 生产数据
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
  console.log('PRE chapters=', entry.chapters ? (Array.isArray(entry.chapters) ? 'arr' : typeof entry.chapters) : 'ABSENT')

  // 2. 修复（页面内执行）—— 必须返回修复后的完整数据，Node 侧才能 POST
  const repairResult = await page.evaluate(({ fnStr, data }) => {
    const fn = new Function('return ' + fnStr)()
    const out = fn(data)
    return { filled: out.filled, log: out.log.slice(0, 60), data }
  }, { fnStr: repairFnStr, data: entry })
  console.log('REPAIR_FILLED=', repairResult.filled, 'sample=', repairResult.log.join(', '))
  const repaired = repairResult.data || entry

  // 3. POST batch 仅发送修复的 4 个分区（chapters 由修复函数从 keyPlots 派生）
  const postRes = await page.evaluate(async ({ api, nid, sections }) => {
    const token = localStorage.getItem('token') || ''
    const body = { novelId: nid, type: 'batch', ...sections }
    const r = await fetch(api, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    }).catch(e => ({ err: e.message }))
    if (r.err) return { err: r.err }
    const j = await r.json().catch(() => ({ raw: r.status }))
    return { status: r.status, body: j }
  }, { api: API, nid: NID, sections: {
    characters: repaired.characters || {},
    relationships: repaired.relationships || {},
    powerSystem: repaired.powerSystem || {},
    chapters: repaired.chapters || {},
  } })
  console.log('POST_RESULT=', JSON.stringify(postRes).slice(0, 400))

  // 4. 回读验证
  await page.waitForTimeout(1200)
  const verify = await page.evaluate(async ({ api, nid }) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    const d = (j && (j.data || j)) || {}
    // 计算关键空值
    let cEmpty = 0, relEmpty = 0
    const cnt = (o) => { if(!o||typeof o!=='object') return; for(const k of Object.keys(o)){ const v=o[k]; if(v===null||v===undefined||(typeof v==='string'&&v.trim()==='')) cEmpty++; else if(typeof v==='object') cnt(v) } }
    if (d.characters) cnt(d.characters)
    if (d.relationships && Array.isArray(d.relationships.relationships)) {
      relEmpty = d.relationships.relationships.filter(r => !r.deepConflict || !String(r.deepConflict).trim()).length
    }
    const chars = d.characters || {}
    return {
      status: r.status,
      charsEmpty: cEmpty,
      relDeepConflictEmpty: relEmpty,
      volsLen: d.chapters && Array.isArray(d.chapters.volumes) ? d.chapters.volumes.length : -1,
      chapLen: d.chapters && Array.isArray(d.chapters.chapters) ? d.chapters.chapters.length : -1,
      protCamp: chars.protagonist ? chars.protagonist.camp : '',
      protJob: chars.protagonist ? chars.protagonist.job : '',
      aN0: chars.protagonist && chars.protagonist.arcNodes && chars.protagonist.arcNodes[0] ? chars.protagonist.arcNodes[0].powerLevel : '',
    }
  }, { api: API, nid: NID })
  console.log('VERIFY=', JSON.stringify(verify))
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })