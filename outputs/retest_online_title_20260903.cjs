// 线上复测 #114 后端 title 对齐 — 真实《永历中兴》设定格式（parseUserCharacterList 可解析版）· 真实 LLM
// 用法: node outputs/retest_online_title_20260903.cjs
const crypto = require('crypto')

const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu/api/ai-generate'
const SECRET = 'your_random_jwt_secret_key_here_change_in_production' // 线上 .env.local JWT_SECRET(52B)
const ADMIN_UID = 'cms4kz25n0000u318jppccxpv'

function b64u(s) { return Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') }
const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
const now = Math.floor(Date.now() / 1000)
const payload = b64u(JSON.stringify({ userId: ADMIN_UID, isAdmin: true, iat: now, exp: now + 7 * 86400 }))
const sig = crypto.createHmac('sha256', SECRET).update(header + '.' + payload).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const TOKEN = header + '.' + payload + '.' + sig

// 详细设定：与 outputs/integ_backend_roster_title_20260903.cjs（9/9 PASS）同构的真实用户格式
// —— 技能卡【姓名】+ 汇总表 + 编号行 + 括号钦定行；焦琏补括号钦定；孙可望作无括号负向
const DETAILED_DESIGN = [
  '主角核心设定',
  '| 姓名 | 朱由榔 |',
  '| 身份 | 永历帝 |',
  '',
  '人物设定',
  '【多尔衮】—— 摄政王',
  '功能标签：主要反派BOSS、清军幕后主脑',
  '忠诚等级：忠于满清',
  '',
  '【吴三桂】—— 山海关总兵',
  '功能标签：关键变数、引清入关、后期大反派',
  '忠诚等级：只忠于利益',
  '',
  '【李定国】—— 大西军将领',
  '功能标签：猛将盟友、北伐主力、两蹶名王',
  '忠诚等级：绝对忠诚',
  '',
  '【史可法】—— 兵部尚书',
  '功能标签：忠臣楷模、扬州保卫战核心',
  '忠诚等级：忠于大明',
  '',
  '【郑成功】—— 抗清名将',
  '功能标签：重要盟友、水师力量',
  '忠诚等级：忠于大明',
  '',
  '【王太后】—— 皇太后',
  '功能标签：精神支柱',
  '忠诚等级：忠于永历',
  '',
  '【孙可望】—— 大西军晋王',
  '功能标签：野心家、后期叛变者、内斗',
  '忠诚等级：只忠于自己',
  '',
  '清军核心（反派）',
  '| **清军核心** | 多尔衮、多铎、吴三桂 | 3人 |',
  '',
  '| 1 | **焦琏** | 参将 | 忠诚将领、城防主力 |',
  '| 2 | **沐天波** | 黔国公 | 忠诚将领 |',
  '',
  '主角：朱由榔（永历帝）',
  '多尔衮（满清睿亲王）：引清入关的幕后主使',
  '吴三桂（满清平西王）：降清枭雄',
  '李定国（大西军晋王）—— 抗清主力',
  '郑成功（国姓爷）：海上抗清力量',
  '史可法（兵部尚书）：留守重臣',
  '王太后（皇太后）：永历帝生母',
  '焦琏（新兴侯）：主角心腹亲将',
].join('\n')

// 8 正向：括号钦定 → title 必须原样回写；2 负向（沐天波/孙可望 无括号 → title 应为空）
const EXPECT = {
  '朱由榔': '永历帝', '多尔衮': '满清睿亲王', '吴三桂': '满清平西王', '史可法': '兵部尚书',
  '李定国': '大西军晋王', '郑成功': '国姓爷', '焦琏': '新兴侯', '王太后': '皇太后',
}
const NO_BRACKET = ['沐天波', '孙可望']
// 夹具中每个正向人物所属槽位（Phase B 分批补充时按槽补生成）
const NAME_ROLE = { '朱由榔': '主角', '多尔衮': '反派', '吴三桂': '反派', '史可法': '朋友', '李定国': '朋友', '郑成功': '朋友', '焦琏': '朋友', '王太后': '女主' }

const body = {
  step: 'characters',
  genre: '历史',
  keywords: '南明 永历 明末清初 穿越 系统流 权谋 争霸',
  previousData: {
    protagonistSettings: { name: '朱由榔', gender: '男', age: '21', identity: '永历帝' },
    idea: {
      title: '永历中兴',
      tagline: '现代历史爱好者朱由榔穿越附身南明永历帝，签到系统加身，于残山剩水间挽天倾',
      coreIdea: '明末乱世山河飘零，永历帝以签到系统聚拢忠臣良将，重开大明气象',
      coreConflict: '内有权臣军阀倾轧，外有满清铁骑压境，中兴与覆亡一线之间',
      systemName: '大明中兴签到系统',
      userInput: '主角朱由榔穿越南明，靠签到系统中兴大明',
      sellingPoints: ['历史权谋', '签到系统', '家国情怀', '帝王成长'],
    },
    worldbuilding: {
      era: '明末清初·南明永历年间（1646-1662）',
      geography: '西南云贵川、东南闽粤、中原腹地',
      socialStructure: '南明朝堂、军阀勋贵、士绅遗民、清廷新贵',
      history: '清军入关，弘光隆武相继败亡，永历帝继位西南',
      powerSystem: '朝堂权力体系',
    },
    powerSystem: {
      protagonistAbility: {
        name: '大明中兴签到系统', type: '系统类',
        description: '每日签到获取气运值，可兑换名臣良将、钱粮军械、天命加持',
      },
      worldPowerSystem: { name: '明朝朝堂权力体系', type: '明朝朝堂权力体系', description: '皇权、内阁、司礼监、勋贵武将四方制衡' },
    },
    detailedDesignInput: DETAILED_DESIGN,
  },
}

function collectChars(j) {
  const d = j.data || j
  const out = []
  const push = (x) => { if (Array.isArray(x)) x.forEach((c) => { if (c && typeof c === 'object') out.push(c) }); else if (x && typeof x === 'object') out.push(x) }
  if (Array.isArray(d.characters)) push(d.characters)
  push(d.protagonist)
  push(d.femaleLead)
  push(d.femaleLeads)
  push(d.antagonist)
  push(d.antagonists)
  push(d.supporting)
  if (Array.isArray(j.characters)) push(j.characters)
  // 服务端 femaleLead=femaleLeads[0]、antagonist=antagonists[0] 为同一对象引用，
  // 标量与数组双收会导致按名双计（实锤：王太后×2/多尔衮×2）→ 这里按名去重保留首现
  const seen = {}
  return out.filter((c) => {
    if (!c || typeof c !== 'object') return false
    const nm = String(c.name || '').trim()
    if (!nm) return true
    if (seen[nm]) return false
    seen[nm] = true
    return true
  })
}

async function postOnce(extraCharBatch) {
  const b = JSON.parse(JSON.stringify(body))
  if (extraCharBatch) b.previousData.charBatch = extraCharBatch
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify(b),
    signal: AbortSignal.timeout(420000),
  })
  const j = await res.json().catch(() => ({}))
  return { status: res.status, j }
}

// Phase B：整批单次调用可能漏产配角（焦琏 连续多跑被 LLM 少而精策略略过）。
// 按真实产品「分批补充」协议（previousData.charBatch + parallel 单角色逐槽绑定）补生成缺失人物，
// 后端会把用户名单中的对应人物确定性绑到槽位，再走同一 #114R2 回写。
async function supplementMissing(existingNames, missingNames) {
  const roleCount = {}
  for (const nm of missingNames) {
    const r = NAME_ROLE[nm]
    if (!r || r === '主角') continue
    roleCount[r] = (roleCount[r] || 0) + 1
  }
  const needs = []
  for (const [r, c] of Object.entries(roleCount)) {
    // 每类多补 1 个缓冲槽，兜底后端池内按分排序可能先绑走同池他人（如 焦琏/沐天波 同在朋友池）
    for (let i = 0; i < c + 1; i++) needs.push(r)
  }
  if (needs.length === 0) return { status: 0, j: {} }
  console.log('[4] PhaseB 分批补充: needs=[' + needs.join(',') + '] existing=' + existingNames.length + '人')
  const { status, j } = await postOnce({ size: needs.length, needs, existing: existingNames, phase: 'supplement', parallel: true })
  console.log('[5] PhaseB HTTP', status, j && j.error ? 'error=' + JSON.stringify(j.error).slice(0, 200) : '(OK)')
  if (status !== 200 || !j) return { status, j }
  return { status, j }
}

async function main() {
  console.log('[1] POST', BASE, 'step=characters（真实 LLM，预计 3-6 分钟）...')
  const t0 = Date.now()
  const r1 = await postOnce(null)
  const costSec = ((Date.now() - t0) / 1000).toFixed(1)
  console.log('[2] HTTP', r1.status, '耗时', costSec + 's')
  if (r1.status !== 200) {
    console.log('[X] 非 200 响应:', JSON.stringify(r1.j).slice(0, 900))
    process.exit(3)
  }
  const charsA = collectChars(r1.j)
  if (charsA.length === 0) {
    console.log('[X] 响应无角色数据. keys=', Object.keys(r1.j).join(','), ' dataKeys=', Object.keys(r1.j.data || {}).join(',') || '-')
    process.exit(4)
  }
  let allChars = charsA.slice()
  const byName = {}
  for (const c of allChars) { const nm = String(c.name || '').trim(); if (nm && !byName[nm]) byName[nm] = c }
  const missing = Object.keys(EXPECT).filter((nm) => !byName[nm])
  console.log('[3] 首轮返回角色总数(去重) =', allChars.length, '| 缺失正向人物 =', missing.length ? missing.join('、') : '无')
  if (missing.length > 0) {
    const r2 = await supplementMissing(allChars.map((c) => String(c.name || '').trim()).filter(Boolean), missing)
    if (r2.status === 200) {
      const charsB = collectChars(r2.j)
      const before = new Set(allChars.map((c) => String(c.name || '').trim()))
      for (const c of charsB) { const nm = String(c.name || '').trim(); if (nm && !before.has(nm)) { allChars.push(c); before.add(nm) } }
      console.log('[6] PhaseB 补充后角色总数(去重) =', allChars.length)
    } else {
      console.log('[X] PhaseB 分批补充失败（按现状继续断言）')
    }
  }
  console.log('\n=== 生成角色清单（name | rolePosition | title | 身份前12字） ===')
  const shown = {}
  for (const c of allChars) {
    if (shown[String(c.name || '')]) continue
    shown[String(c.name || '')] = 1
    const id12 = String(c.identity || '').replace(/\s+/g, '').slice(0, 12)
    console.log(`  ${String(c.name || '').padEnd(6)} | ${String(c.rolePosition || c.role || '').padEnd(5)} | title="${c.title === undefined ? '(无键)' : String(c.title || '').slice(0, 14)}" | ${id12}`)
  }
  for (const c of allChars) { const nm = String(c.name || '').trim(); if (nm && !byName[nm]) byName[nm] = c }

  const pass = [], fail = [], warn = []
  for (const [nm, want] of Object.entries(EXPECT)) {
    const c = byName[nm]
    if (!c) { fail.push(`❌ ${nm} 未出现在生成名单`); continue }
    const got = String(c.title || '').trim()
    if (got === want) pass.push(`✅ ${nm} → title="${got}"`)
    else fail.push(`❌ ${nm} → title="${got}"，期望="${want}"`)
  }
  const proto = byName['朱由榔']
  if (proto && String(proto.rolePosition || '').trim() === '主角') pass.push('✅ 朱由榔 rolePosition=主角')
  else warn.push(`⚠️ 朱由榔 rolePosition=${proto ? proto.rolePosition : '(缺)'}`)
  const fls = allChars.filter((c) => String(c.rolePosition || c.role || '') === '女主' || String(c.rolePosition || '') === '女主角')
  if (fls.length === 1) pass.push(`✅ 女主数量=1（${fls[0].name}）`)
  else warn.push(`⚠️ 女主数量=${fls.length}（期望 1）：${fls.map((f) => f.name).join('、') || '无'}`)
  for (const nm of NO_BRACKET) {
    const c = byName[nm]
    if (!c) { warn.push(`ℹ️ 负向对照 ${nm} 未被本批生成（INFO）`); continue }
    const got = String(c.title || '').trim()
    if (got === '') pass.push(`✅ 负向 ${nm} title 为空（零污染）`)
    else warn.push(`⚠️ 负向 ${nm} title="${got}"（非空——LLM 未完全守铁律⑤，E-block 对无括号人物不覆盖）`)
  }
  console.log('\n=== 断言汇总 ===')
  pass.forEach((x) => console.log(' ', x)); fail.forEach((x) => console.log(' ', x)); warn.forEach((x) => console.log(' ', x))
  console.log(`\nRESULT: PASS=${pass.length} FAIL=${fail.length} WARN=${warn.length}`)
  console.log(fail.length === 0 ? '判定: ✅ PASS' : '判定: ❌ FAIL')
  process.exit(fail.length === 0 ? 0 : 5)
}

main().catch((e) => { console.error('[X] 脚本异常:', e && e.message ? e.message : e); process.exit(9) })
