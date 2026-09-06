// 线上复测 2026-09-03 #126/#127（真实 LLM）：
//   段A step=worldbuilding：明末隐秘历史题材 → 断言全字段无修仙/跨题材漂移词（用户截图实锤问题）
//   段B step=characters：单女主 + 用户钦定明末人物 → 断言女主唯一/无裸露JSON键/技能无重复/钦定角色落位/title防回归
//   🔥 2026-09-03 R3：段B 改为【模拟前端分批协议】（core 批 + 2 轮 supplement 批，每批 5 名额、带 existing），
//     不再一次性全量请求（免费模型限流下全量常 >900s 超时）。与线上真实 UI 行为一致，每批 ≤5 分钟。
// 用法: node outputs/retest_online_126_127_20260903.cjs [A|B]（默认 both）
const crypto = require('crypto')
const https = require('https')
const ONLY = process.argv[2] || 'both'

// RETEST_BASE 环境变量覆盖：服务器本机直连 http://127.0.0.1:3001（沙箱代理会黑洞 node 直连公网 443）
const BASE = process.env.RETEST_BASE || 'https://tuzhongwang.xyz/tuzhong-wenshu/api/ai-generate'
const SECRET = 'your_random_jwt_secret_key_here_change_in_production' // 线上 .env.local JWT_SECRET(52B)
const ADMIN_UID = 'cms4kz25n0000u318jppccxpv'

function b64u(s) { return Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') }
const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
const now = Math.floor(Date.now() / 1000)
const payload = b64u(JSON.stringify({ userId: ADMIN_UID, isAdmin: true, iat: now, exp: now + 7 * 86400 }))
const sig = crypto.createHmac('sha256', SECRET).update(header + '.' + payload).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const TOKEN = header + '.' + payload + '.' + sig

// ---------- 题材：明末清初·南明永历·隐秘历史（绝不含任何修仙引导词——真实用户场景） ----------
const THEME_KEYWORDS = '南明 永历 明末清初 隐秘历史 单女主 权谋 争霸 家国 帝王'

// ---------- 修仙/跨题材漂移禁词表（对照用户截图：#121/#126 修复目标） ----------
const DRIFT_WORDS = [
  '修仙', '修真', '修士', '修者', '宗门', '洞天', '灵山', '福地', '灵根', '灵脉', '灵田', '灵气',
  '金丹', '元婴', '筑基', '炼气', '练气', '化神', '大乘', '渡劫', '飞升', '仙门', '仙府', '仙帝',
  '散修', '闭关', '道侣', '道门', '功法', '法诀', '神通', '神识', '法宝', '丹药', '炼丹', '炼器',
  '灵兽', '阵旗', '禁制', '仙尊', '大能', '太上忘情', '道韵', '灵宝', '坐死关',
  '洞天与皇朝并行', '门派与皇朝并行', '社稷入定', '修道门阀', '灵山福地', '气运之子',
  '洪荒', '巫族', '祖巫', '鸿钧', '量劫', '封神演义', '阐教', '截教',
  '斗气', '魔法师', '斗罗', '魂环', '武魂', '血脉觉醒', '基因锁', '异能者', '觉醒异能', '系统空间',
]
const DRIFT_RE = new RegExp(DRIFT_WORDS.join('|'))
function scanDrift(obj, path, hits) {
  if (obj == null) return
  if (typeof obj === 'string') {
    const m = obj.match(DRIFT_RE)
    if (m) hits.push({ path, word: m[0], sample: obj.slice(Math.max(0, m.index - 18), m.index + 22) })
    return
  }
  if (Array.isArray(obj)) { obj.forEach((v, i) => scanDrift(v, path + '[' + i + ']', hits)); return }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) scanDrift(obj[k], path ? path + '.' + k : k, hits)
  }
}

// ---------- 段A 入参 ----------
const A_BODY = {
  step: 'worldbuilding',
  genre: '历史',
  keywords: THEME_KEYWORDS,
  previousData: {
    idea: {
      title: '永历密档',
      tagline: '南明永历朝隐秘历史：帝党与阉宦、忠奸与暗线交织，复国大业藏在层层密档之下',
      coreIdea: '明末清初南明永历朝，帝党在残山剩水间以隐秘手段聚拢忠臣，对抗清廷与内部倾轧',
      coreConflict: '外部清军压境步步紧逼，内部勋贵军阀各怀异心，真假密档扑朔迷离',
      systemName: '',
      userInput: '写一本南明永历朝的隐秘历史权谋小说',
      sellingPoints: ['历史权谋', '隐秘档案', '家国情怀', '朝堂博弈'],
    },
    worldbuilding: { era: '明末清初·南明永历年间（1646-1662）', coreSettings: '南明永历朝 隐秘历史' },
    powerSystem: null,
  },
}

// ---------- 段B 入参 ----------
const B_DESIGN = [
  '主角核心设定',
  '| 姓名 | 朱由榔 |',
  '| 身份 | 永历帝 |',
  '',
  '人物设定（单女主）',
  '【沈云姝】—— 永历女官',
  '功能标签：女主、帝党谋主、执掌密档',
  '忠诚等级：忠于永历帝',
  '',
  '【吴三桂】—— 山海关总兵',
  '功能标签：引清入关、关键变数、后期大反派',
  '忠诚等级：只忠于利益',
  '',
  '【多尔衮】—— 摄政王',
  '功能标签：清廷幕后主脑、主要反派',
  '忠诚等级：忠于满清',
  '',
  '【李定国】—— 大西军将领',
  '功能标签：抗清名将、两蹶名王',
  '忠诚等级：忠于大明',
  '',
  '【郑成功】—— 抗清名将',
  '功能标签：海上抗清力量、国姓爷',
  '忠诚等级：忠于大明',
  '',
  '【史可法】—— 兵部尚书',
  '功能标签：忠臣楷模、扬州保卫战核心',
  '忠诚等级：忠于大明',
  '',
  '清军核心（反派）',
  '| **清军核心** | 多尔衮、多铎、吴三桂 | 3人 |',
  '',
  '| 1 | **焦琏** | 新兴侯 | 主角心腹亲将 |',
  '| 2 | **沐天波** | 黔国公 | 忠勇将领 |',
  '',
  '主角：朱由榔（永历帝）',
  '沈云姝（永历女官）：女主，执掌隐秘档案的谋主',
  '吴三桂（满清平西王）：降清枭雄',
  '多尔衮（满清睿亲王）：引清入关幕后主使',
  '李定国（大西军晋王）：抗清主力',
  '郑成功（国姓爷）：海上抗清力量',
  '史可法（兵部尚书）：留守重臣',
  '焦琏（新兴侯）：主角心腹亲将',
].join('\n')

const B_BODY = {
  step: 'characters',
  genre: '历史',
  keywords: THEME_KEYWORDS,
  previousData: {
    protagonistSettings: { name: '朱由榔', gender: '男', age: '21', identity: '永历帝' },
    idea: {
      title: '永历密档',
      tagline: '南明永历朝隐秘历史：帝党与阉宦、忠奸与暗线交织，复国大业藏在层层密档之下',
      coreIdea: '明末清初南明永历朝，帝党在残山剩水间以隐秘手段聚拢忠臣，对抗清廷与内部倾轧',
      coreConflict: '外部清军压境步步紧逼，内部勋贵军阀各怀异心，真假密档扑朔迷离',
      systemName: '',
      userInput: '写一本南明永历朝的隐秘历史权谋小说',
      sellingPoints: ['历史权谋', '隐秘档案', '家国情怀', '朝堂博弈'],
    },
    worldbuilding: {
      era: '明末清初·南明永历年间（1646-1662）',
      geography: '西南云贵川、东南闽粤、中原腹地',
      socialStructure: '南明朝堂、军阀勋贵、士绅遗民、清廷新贵',
      history: '清军入关，弘光隆武相继败亡，永历帝继位西南',
      powerSystem: '朝堂权力体系',
    },
    powerSystem: {
      protagonistAbility: { name: '', type: '', description: '' },
      worldPowerSystem: { name: '明朝朝堂权力体系', type: '明朝朝堂权力体系', description: '皇权、内阁、司礼监、勋贵武将四方制衡' },
    },
    detailedDesignInput: B_DESIGN,
  },
}

// ---------- 断言工具 ----------
const RESULT = { A: [], B: [] }
let PASS = 0, FAIL = 0
function report(group, ok, name, detail) {
  const line = (ok ? '✅ PASS ' : '❌ FAIL ') + name + (detail ? ' | ' + detail : '')
  RESULT[group].push(line)
  console.log(line)
  ok ? PASS++ : FAIL++
}

function collectChars(j) {
  const d = j.data || j
  const out = []
  const push = (x) => { if (Array.isArray(x)) x.forEach((c) => { if (c && typeof c === 'object') out.push(c) }); else if (x && typeof x === 'object') out.push(x) }
  if (Array.isArray(d.characters)) push(d.characters)
  push(d.protagonist); push(d.femaleLead); push(d.femaleLeads); push(d.antagonist); push(d.antagonists); push(d.supporting)
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
function str(v) { return v == null ? '' : String(v) }

// 裸露 JSON 键 / 未解析对象字符串检测
const RAW_JSON_RE = /^\s*\{|^\s*"[A-Za-z_][A-Za-z0-9_]*"\s*:|^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*["{\[]/
const TEXT_FIELDS = ['description', 'background', 'personality', 'motivation', 'identity', 'role', 'goals', 'contradiction', 'dream', 'appearance', 'skillsDesc', 'techniquesDesc', 'storyline', 'relationship', 'arc']
function hasRawJson(v) { return RAW_JSON_RE.test(v) }

// https.request 封装：无 headers/body 闲置超时（undici 默认 300s 会误杀 5-10 分钟的 characters 分批调用），外层统一 900s
function postRaw(bodyObj) {
  return new Promise(function (resolve, reject) {
    const urlObj = new URL(BASE)
    const payload = JSON.stringify(bodyObj)
    const req = https.request({
      hostname: urlObj.hostname, port: 443, path: urlObj.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN, 'Content-Length': Buffer.byteLength(payload) },
    }, function (res) {
      let data = ''
      res.on('data', function (d) { data += d })
      res.on('end', function () {
        let j = {}
        try { j = JSON.parse(data) } catch (e) { j = { _raw: data.slice(0, 300) } }
        resolve({ status: res.statusCode, j })
      })
    })
    req.setTimeout(900000, function () { req.destroy(new Error('REQ_TIMEOUT_900s')) })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}
async function postOnce(body, ms) {
  const out = await postRaw(body)
  return out
}

// ================= 段A：worldbuilding #126 =================
async function stageA() {
  console.log('\n===== 段A worldbuilding：明末隐秘历史 题材漂移扫描 =====')
  const t0 = Date.now()
  const { status, j } = await postOnce(A_BODY, 420000)
  console.log('HTTP', status, '耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's')
  if (status !== 200) { report('A', false, 'worldbuilding HTTP 200', 'got ' + status + ' ' + JSON.stringify(j).slice(0, 300)); return }
  const wb = (j.data && typeof j.data === 'object' ? j.data : j)
  const keys = Object.keys(wb).join(',')
  console.log('返回键: ' + keys)
  // 1) 全字段漂移扫描（包括嵌套）
  const hits = []
  scanDrift(wb, '', hits)
  report('A', hits.length === 0, '全字段无修仙/跨题材漂移词', hits.length ? hits.slice(0, 5).map(h => h.path + '∈「' + h.word + '」…' + h.sample).join(' ; ') : '')
  // 2) socialStructure 字段专项（用户截图实锤字段）
  const ss = str(wb.socialStructure || (wb.worldSocial && str(wb.worldSocial.socialStructure)) || '')
  report('A', ss.length >= 8, 'socialStructure 非空且长度≥8', 'len=' + ss.length)
  const ssHits = []
  scanDrift(ss, 'socialStructure', ssHits)
  report('A', ssHits.length === 0, 'socialStructure 无漂移词', ssHits.length ? ssHits.map(h => '「' + h.word + '」').join('、') : '')
  console.log('  socialStructure =', ss.slice(0, 180))
  // 3) 题材一致性：正文应含明史元素
  const fullText = JSON.stringify(wb)
  report('A', /永历|南明|明朝|崇祯|清军|朝堂|皇帝|皇权|内阁|勋贵|士绅|遗民|锦衣卫|东厂|密档|明史/.test(fullText), '正文含明史主题元素', '')
  // 4) 关键结构字段存在
  for (const f of ['era', 'geography', 'socialStructure', 'history', 'culture', 'politicalStructure']) {
    if (Object.prototype.hasOwnProperty.call(wb, f)) {
      report('A', str(wb[f]).length >= 4, '字段 ' + f + ' 非空', 'len=' + str(wb[f]).length)
    }
  }
}

// ================= 段B：characters #127 =================
// 🔥 2026-09-03 R3：模拟前端真实分批协议。单女主 plan：
//   批1 core:        ['主角','女主','反派','反派','配角']
//   批2 supplement:  ['反派','反派','朋友','朋友','配角']
//   批3 supplement:  ['女配','女配','配角','配角','配角']
//   每批带 existing（已生成角色名）+ characters（已生成数据），逐步合并后统一断言。
async function stageB() {
  console.log('\n===== 段B characters：单女主 + 用户钦定明末人物（分批协议）质量断言 =====')
  const BATCH_PLAN = [
    { needs: ['主角', '女主', '反派', '反派', '配角'], phase: 'core' },
    { needs: ['反派', '反派', '朋友', '朋友', '配角'], phase: 'supplement' },
    { needs: ['女配', '女配', '配角', '配角', '配角'], phase: 'supplement' },
  ]
  const allChars = []
  const seenNames = new Set()
  let lastAcc = null
  for (let bi = 0; bi < BATCH_PLAN.length; bi++) {
    const bp = BATCH_PLAN[bi]
    const existing = allChars.map(c => String(c.name || '').trim()).filter(Boolean)
    const body = JSON.parse(JSON.stringify(B_BODY))
    body.previousData.charBatch = { size: bp.needs.length, needs: bp.needs, existing: existing, phase: bp.phase, parallel: true }
    // characters 增量传入：前端真实路径每批携带上一批已生成数据（existingCharacters 语义已在 charBatch.existing）
    console.log('\n  ---- 批' + (bi + 1) + ' ' + bp.phase + ' needs=[' + bp.needs.join(',') + '] existing=' + existing.length + '名 ----')
    const t0 = Date.now()
    const { status, j } = await postOnce(body, 300000)
    console.log('HTTP', status, '耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's')
    if (status !== 200) {
      report('B', false, '批' + (bi + 1) + ' ' + bp.phase + ' HTTP 200', 'got ' + status + ' ' + JSON.stringify(j).slice(0, 300))
      continue
    }
    const batchChars = collectChars(j)
    // 去重后合并（按 name）
    let added = 0
    for (const c of batchChars) {
      const nm = String(c.name || '').trim()
      if (!nm) { allChars.push(c); added++; continue }
      if (seenNames.has(nm)) continue
      seenNames.add(nm); allChars.push(c); added++
    }
    lastAcc = j
    console.log('  本批返回 ' + batchChars.length + ' 名，合并新增 ' + added + ' 名，累计 ' + allChars.length + ' 名')
  }
  if (allChars.length === 0) { report('B', false, 'characters 至少一批成功返回', '全批失败'); return }
  const chars = allChars
  report('B', chars.length >= 8, '角色总数≥8', 'got ' + chars.length)

  // 1) 女主唯一性（单女主铁律）
  const heroines = chars.filter(c => str(c.rolePosition).includes('女主') || str(c.role).includes('女主'))
  report('B', heroines.length === 1, '单女主模式：女主恰 1 名', 'got ' + heroines.length + (heroines.length ? ' → ' + heroines.map(h => h.name).join(',') : ''))
  if (heroines.length === 1) {
    const h = heroines[0]
    report('B', str(h.name).length > 0 && str(h.gender) === '女', '女主性别=女且有名', 'name=' + h.name + ' gender=' + h.gender)
    const userWanted = ['沈云姝'].find(n => str(h.name).includes(n) || str(h.aliases || '').includes(n) || (h.titleOverride || h.title || '').includes(n))
    report('B', !!userWanted, '女主按用户输入输出（沈云姝）', 'name=' + h.name + ' aliases=' + str(h.aliases).slice(0, 30))
  } else if (heroines.length > 1) {
    console.log('  [详情] 多女主名单:', heroines.map(h => h.name + '(' + h.rolePosition + ')').join(' , '))
  }

  // 2) 每个角色的字段质量扫描
  let rawJsonChars = [], dupSkillChars = [], dupTextFieldChars = [], driftChars = [], emptyCoreChars = [], truncChars = []
  for (const c of chars) {
    const nm = str(c.name)
    // 2a) 裸露 JSON 键
    for (const f of TEXT_FIELDS) {
      const v = str(c[f])
      if (v && hasRawJson(v)) { rawJsonChars.push(nm + '.' + f + '=' + v.slice(0, 60)); break }
    }
    if (typeof c === 'object') {
      for (const k of Object.keys(c)) {
        const v = c[k]
        if (typeof v === 'string' && v.length > 0 && hasRawJson(v) && !['id', 'name'].includes(k)) { rawJsonChars.push(nm + '.' + k + '=' + v.slice(0, 60)); break }
      }
    }
    // 2b) skills × techniques 重复
    const sk = (Array.isArray(c.skills) ? c.skills : []).map(str)
    const te = (Array.isArray(c.techniques) ? c.techniques : []).map(str)
    const dup = sk.filter(s => s && te.includes(s))
    if (dup.length) dupSkillChars.push(nm + ' 重复=' + dup.join(','))
    // 2c) 文本字段相互重复（identity≈background≈role 判定：完全相等或一方包含另一方>80%）
    const tf = {}
    for (const f of ['identity', 'background', 'role', 'description', 'personality']) if (str(c[f]).length >= 6) tf[f] = str(c[f])
    const tfArr = Object.keys(tf)
    for (let i = 0; i < tfArr.length; i++) for (let k2 = i + 1; k2 < tfArr.length; k2++) {
      const a = tf[tfArr[i]], b = tf[tfArr[k2]]
      if (a === b || (a.length > 12 && b.length > 12 && (a.includes(b) || b.includes(a)))) { dupTextFieldChars.push(nm + ':' + tfArr[i] + '≈' + tfArr[k2]); break }
    }
    // 2d) 漂移词（角色不应变成修仙人物）
    const hits = []
    scanDrift(c, nm, hits)
    if (hits.length) driftChars.push(nm + '∈「' + hits[0].word + '」')
    // 2e) 截断残留（以省略号收尾的文本字段）
    for (const f of TEXT_FIELDS) {
      const v = str(c[f])
      if (v && (/…{1,3}$/.test(v) || /\.{3,}$/.test(v)) && v.length < 80) { truncChars.push(nm + '.' + f + ' len=' + v.length); break }
    }
  }
  report('B', rawJsonChars.length === 0, '无角色字段裸露 JSON 键/未解析字符串', rawJsonChars.slice(0, 3).join(' ; '))
  report('B', dupSkillChars.length === 0, 'skills×techniques 无重复', dupSkillChars.slice(0, 3).join(' ; '))
  report('B', dupTextFieldChars.length === 0, '角色文本字段无整段重复', dupTextFieldChars.slice(0, 3).join(' ; '))
  report('B', driftChars.length === 0, '角色无修仙/跨题材漂移', driftChars.slice(0, 3).join(' ; '))
  report('B', truncChars.length === 0, '无异常截断残留(省略号收尾短字段)', truncChars.slice(0, 3).join(' ; '))

  // 3) 钦定核心角色落位
  const names = chars.map(c => str(c.name))
  const want = ['朱由榔', '吴三桂', '多尔衮']
  for (const w of want) report('B', names.some(n => n.includes(w)), '钦定角色落位: ' + w, '')
  // 4) 主角/女主核心字段完整
  const prot = chars.find(c => str(c.rolePosition).includes('主角')) || chars[0]
  if (prot) {
    let emptyCore = []
    // ⚠️ gender 为单字「男/女」，判空必须是 trim 后为空，不能按长度<2（会把合法单字误判为空）
    for (const f of ['identity', 'background', 'personality', 'rolePosition']) if (str(prot[f]).trim().length === 0) emptyCore.push(f)
    if (str(prot.gender).trim().length === 0) emptyCore.push('gender')
    if (String(prot.age == null ? '' : prot.age).trim().length === 0) emptyCore.push('age')
    report('B', emptyCore.length === 0, '主角核心字段完整', emptyCore.length ? '缺:' + emptyCore.join(',') : 'name=' + prot.name + ' gender=' + prot.gender + ' role=' + prot.rolePosition + ' title=' + (prot.titleOverride || prot.title || ''))
  }
  // 5) title/徽章 防回归（括号钦定 → title 回写；吴三桂=满清平西王 多尔衮=满清睿亲王）
  const tExpect = { '吴三桂': '满清平西王', '多尔衮': '满清睿亲王', '朱由榔': '永历帝' }
  for (const [nm, t] of Object.entries(tExpect)) {
    const c = chars.find(x => str(x.name).includes(nm))
    if (!c) { report('B', false, 'title防回归 ' + nm + '（角色缺失）', ''); continue }
    const tt = str(c.titleOverride || c.title || c.honorific || '')
    report('B', tt.includes(t), 'title防回归 ' + nm, 'title=' + tt)
  }
}

async function main() {
  console.log('[复测] #126/#127 线上真实 LLM · ' + new Date().toISOString() + ' · 段=' + ONLY)
  if (ONLY !== 'B') await stageA()
  if (ONLY !== 'A') await stageB()
  console.log('\n===== 汇总 =====')
  console.log('PASS=' + PASS + ' FAIL=' + FAIL)
  console.log('\n--- 段A 明细 ---')
  RESULT.A.forEach(l => console.log(l))
  console.log('--- 段B 明细 ---')
  RESULT.B.forEach(l => console.log(l))
  process.exit(FAIL ? 1 : 0)
}

main().catch(e => { console.error('[FATAL]', e); process.exit(9) })
