// 线上《永历中兴》全环节数据级审计：空值 / 占位模板 / 修仙主题污染 / 结构
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

const TPL_MARKS = ['性格鲜明','性格开朗','性格稳重','性格复杂','有独立思想','为人处世有其独特原则','多面性的性格','在故事中展现','重要角色','关键角色','神秘人物','形象独特','不可或缺的重要角色','与主角的关系推动故事','此角色','本角色','请点击上方按钮重新生成','数据为空','待补充','待定','${','placeholder','Lorem']
const XIANXIA_WORDS = ['修仙','修真','金丹','元婴','元婴期','筑基','炼气','灵根','丹田','灵力','灵气','灵气盈盈','渡劫','飞升','道侣','灵石','功法','内丹','凡俗皇子','仙人','上仙','宗门','掌门','师门','炼体','元婴修士','刘墨','姜太虚','斗帝','斗气','斗尊','魂族','斗宗','斗皇','大主宰','吞噬','魔尊','武魂','魂环','星斗','东方玄']

function walk(v, ctx, issues, sec) {
  if (v === null || v === undefined) { issues.push({ sec, ctx: ctx || '(null)', val: 'NULL' }); return }
  if (typeof v === 'string') {
    const s = v
    if (!s.trim()) { issues.push({ sec, ctx, val: '(EMPTY_STR)' }); return }
    for (const t of TPL_MARKS) if (s.indexOf(t) >= 0) { issues.push({ sec, ctx: (ctx||'')+' …', val: 'TPL:'+s.slice(0,40) }); break }
    for (const x of XIANXIA_WORDS) if (s.indexOf(x) >= 0) { issues.push({ sec, ctx: (ctx||'')+' …', val: '修仙:'+x+' | '+s.slice(0,60) }); break }
    return
  }
  if (Array.isArray(v)) { if (v.length === 0) issues.push({ sec, ctx: ctx || '(arr)', val: '(EMPTY_ARRAY)' }); v.forEach((it,i)=>walk(it, ctx+`[${i}]`, issues, sec)); return }
  if (typeof v === 'object') {
    const keys = Object.keys(v)
    if (keys.length === 0) { issues.push({ sec, ctx: ctx || '(obj)', val: '(EMPTY_OBJ)' }); return }
    keys.forEach(k=>walk(v[k], ctx?ctx+'.'+k:k, issues, sec)); return
  }
}

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(()=>{})
  await page.waitForTimeout(2500)
  const res = await page.evaluate(async ({ api, nid }) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    return { status: r.status, data: (j && (j.data || j)) || {} }
  }, { api: '/tuzhong-wenshu/api/settings', nid: NID })
  await ctx.close()
  const d = res.data
  const sections = ['idea','synopsis','worldbuilding','powerSystem','characters','factions','relationships','outline','keyPlots','chapters']
  let total = 0
  for (const sec of sections) {
    const issues = []
    if (!d[sec]) { console.log(`[${sec}] MISSING!`); continue }
    walk(d[sec], '', issues, sec)
    // 只显示前 20 条，分类型统计
    const byType = {}
    issues.forEach(i => { const t = i.val.startsWith('NULL')?'null':i.val.startsWith('(EMPTY')?'empty':i.val.startsWith('TPL')?'tpl':i.val.startsWith('修仙')?'xianxia':'other'; byType[t]=(byType[t]||0)+1 })
    total += issues.length
    const sample = issues.slice(0,8).map(i=>`${i.val}`.slice(0,70)).join(' || ')
    console.log(`[${sec}] issues=${issues.length} | ${JSON.stringify(byType)} | e.g. ${sample}`)
  }
  console.log('TOTAL_ISSUES=', total)
  // 报告 characters 结构关键字段
  const CH = d.characters || {}
  console.log('CH keys=', Object.keys(CH).join(','))
  console.log('protagonist=', CH.protagonist&&CH.protagonist.name, '| femaleLead=', CH.femaleLead&&CH.femaleLead.name, '| antagonist=', CH.antagonist&&CH.antagonist.name)
  console.log('antagonists(n)=', (CH.antagonists||[]).length, '| supporting(n)=', (CH.supporting||[]).length, '| femaleLeads(n)=', (CH.femaleLeads||[]).length)
  console.log('antagonist in supporting?', (CH.supporting||[]).some(c=>c&&c.name===((CH.antagonist||{}).name)))
  console.log('extra反派人名=', (CH.antagonists||[]).slice(1).map(c=>c&&c.name).join(','))
  console.log('extra反派在supporting的人数=', (CH.antagonists||[]).slice(1).filter(c=>c&&(CH.supporting||[]).some(s=>s&&s.name===c.name)).length)
})().catch(e => { console.error('FATAL', e); process.exit(1) })