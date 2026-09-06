// 线上《永历中兴》characters 综合修复：
//  A) 补全 17 个角色的 mentor（师承）——替换修仙式"出身师门"模板为史实/设定师承
//  B) 合并 antagonists[1:]（额外反派）进 supporting —— 使主人物环节完整显示全员
// 在 Node 内直接 GET→变换→POST，幂等。
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

// 史实师承（逐人精确，架空历史按正史/合理设定取直；替换修仙式模板）
const MENTOR_MAP = {
  '玉竹': '自幼随永历潜邸入侍，得宫中书吏与老嬷嬷教导，识文断字、知书达理',
  '多铎': '满洲宗室，幼习骑射，受兄长多尔衮与宗族前辈督训，长于兵略',
  '朱由崧': '崇祯朝福王宗藩，宫中师傅授习经史，然荒嬉少学，承袭福王封爵',
  '朱聿鐭': '唐王一脉宗室，少习经术、性狷介，广州监国短暂而亡',
  '史可法': '少师从东林名臣左光斗，受其刚直忠义之风，以气节自砥砺',
  '郑成功': '少随父郑芝龙居闽，师从江左名士，饱读诗书，兼习海事军政',
  '李定国': '幼年家遭离乱，为张献忠收养，习战阵骑射，又得军师讲授兵法韬略',
  '赵虎': '行伍出身，随老卒队长习武艺阵法，忠勇机敏',
  '周德全': '早年在军中任书办督造，得军需老吏指点仓储调度之术',
  '堵胤锡': '少受业于楚地大儒，长于经略联络，善交四方豪杰',
  '何腾蛟': '乡贡入仕，受业于同乡宿儒，兼习督师经略之术',
  '吴万雄': '行伍起家，随镇将征战，得老将指点，深沉持重',
  '刘文秀': '大西军旧部，随张献忠转战，得军师柴文灿等讲授韬略',
  '艾能奇': '张献忠养子，自幼习武从军，随军征讨，晓畅军阵',
  '王得仁': '左良玉部将，营伍出身，久经战阵，得主帅信重',
  '郑鸿逵': '郑氏宗族子弟，习海事武备，助兄郑芝龙经营海贸军务',
  '黄道周': '明末大儒，师承闽地学统，通经博古，以气节学问名世',
}
const TPL = '出身师门，由一位严厉却护短的恩师一手带大'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: 'msedge', headless: true, args: ['--no-sandbox'] })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(()=>{})
  await page.waitForTimeout(2500)
  const getRes = await page.evaluate(async ({ api, nid }) => {
    const token = localStorage.getItem('token') || ''
    const r = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    return { status: r.status, data: (j && (j.data || j)) || {} }
  }, { api: '/tuzhong-wenshu/api/settings', nid: NID })
  if (getRes.status !== 200 || !getRes.data) { console.log('GET_FAIL'); await ctx.close(); process.exit(1) }
  const CH = getRes.data.characters || {}

  const all = []
  const add = o => { if (o && typeof o === 'object' && o.name) all.push(o) }
  add(CH.protagonist); add(CH.femaleLead); add(CH.antagonist)
  ;(CH.femaleLeads||[]).forEach(add); (CH.antagonists||[]).forEach(add); (CH.supporting||[]).forEach(add)

  // A) mentor 修复
  let mentorFixed = 0
  all.forEach(c => {
    const m = String(c.mentor||'')
    if (m.indexOf('师门') >= 0 || m.indexOf('出身师门') >= 0) {
      if (MENTOR_MAP[c.name]) { c.mentor = MENTOR_MAP[c.name]; mentorFixed++ }
      else { c.mentor = '早年受业于乡资深明理之士，长于实务与历练，不畏艰难'; mentorFixed++ }
    }
  })

  // B) 合并额外反派进 supporting（按姓名去重，Non-dupflying）
  let merged = 0
  const supporting = Array.isArray(CH.supporting) ? CH.supporting : (CH.supporting = [])
  const names = new Set(supporting.map(s => s && s.name ? String(s.name).trim() : '').filter(Boolean))
  ;(CH.antagonists||[]).forEach((ant, i) => {
    if (i === 0) return // 主反派已由 antagonist 卡显示
    const nm = ant && ant.name ? String(ant.name).trim() : ''
    if (nm && !names.has(nm)) { supporting.push(ant); names.add(nm); merged++ }
  })

  const postRes = await page.evaluate(async ({ api, nid, characters }) => {
    const token = localStorage.getItem('token') || ''
    const body = { novelId: nid, type: 'batch', characters }
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) })
    const j = await r.json().catch(()=>null)
    return { status: r.status, body: j }
  }, { api: '/tuzhong-wenshu/api/settings', nid: NID, characters: CH })
  console.log('MENTOR_FIXED=', mentorFixed, '| MERGED_EXTRA_VILLAIN=', merged)
  console.log('supporting(n)=', supporting.length, '| postStatus=', postRes.status, '| postOk=', !!(postRes.body && (postRes.body.success)))
  await ctx.close()
  console.log('DONE')
})().catch(e => { console.error('FATAL', e); process.exit(1) })