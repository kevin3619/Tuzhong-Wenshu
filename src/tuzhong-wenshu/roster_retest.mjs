import { SignJWT } from 'jose'

// ============================================================
// 第18轮 · 主要人物设定（三套阵容配比）全链路复测脚本
// 修复点 vs 上一版：charBatch 必须放在 previousData 内（后端只读
// previousData.charBatch，旧脚本放在请求体顶层导致分批/并行分支未触发）
// ============================================================
const SECRET = 'your_random_jwt_secret_key_here_change_in_production'
const secret = new TextEncoder().encode(SECRET)
const token = await new SignJWT({ isAdmin: true, userId: 'temp', role: 'admin', sub: 'temp' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('2h')
  .sign(secret)

const BASE = 'http://localhost:3001/tuzhong-wenshu/api/ai-generate'
const HEADERS = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }

// ---------- 阵容预设（与前端 CHAR_ROSTER_PRESETS 完全一致）----------
const PRESETS = {
  single: [
    ['主角', '女主', '反派', '反派', '配角'],
    ['反派', '反派', '朋友', '朋友', '配角'],
    ['女配', '女配', '配角', '配角', '配角'],
  ],
  dual: [
    ['主角', '女主', '女主', '反派', '反派'],
    ['反派', '反派', '反派', '朋友', '朋友'],
    ['女配', '配角', '配角', '配角', '配角'],
  ],
  harem: [
    ['主角', '女主', '女主', '女主', '女主'],
    ['反派', '反派', '反派', '反派', '配角'],
    ['配角', '配角', '配角', '配角', '配角'],
  ],
}

const GENRE = '玄幻'
const KEYWORDS = ['玄幻', '重生', '热血']

function flatten(data) {
  const out = []
  if (!data) return out
  if (data.protagonist) out.push(data.protagonist)
  if (Array.isArray(data.femaleLeads)) out.push(...data.femaleLeads)
  else if (data.femaleLead) out.push(data.femaleLead)
  if (data.antagonist) out.push(data.antagonist)
  if (Array.isArray(data.antagonists)) out.push(...data.antagonists)
  if (Array.isArray(data.supporting)) out.push(...data.supporting)
  return out
}

function classify(chars) {
  const c = { 主角: 0, 女主: 0, 女配: 0, 朋友: 0, 反派: 0, 配角: 0, 其他: 0 }
  for (const ch of chars) {
    const rp = String(ch.rolePosition || ch.role || '').trim()
    if (/主角/.test(rp)) c.主角++
    else if (/女主/.test(rp)) c.女主++
    else if (/女配/.test(rp)) c.女配++
    else if (/朋友/.test(rp)) c.朋友++
    else if (/反派/.test(rp)) c.反派++
    else if (/配角/.test(rp)) c.配角++
    else c.其他++
  }
  return c
}

async function callBatch(needs, existing, phase) {
  const body = {
    step: 'characters',
    input: KEYWORDS.join(' '),
    keywords: KEYWORDS,
    genre: GENRE,
    novelId: 'temp',
    previousData: {
      idea: { protagonistName: '林渊' },
      powerSystem: '修炼体系：以灵气淬体，共分九重天境界',
      worldbuilding: {},
      synopsis: {},
      outline: {},
      factions: {},
      relationships: {},
      keywords: KEYWORDS,
      imitate: null,
      appendRoleInput: '',
      existingCharacters: existing,
      characters: null,
      bookAnalysis: null,
      detailedDesignInput: '',
      // 🔑 关键修复：charBatch 必须在 previousData 内，后端 _cbRaw = previousData?.charBatch
      charBatch: { size: needs.length, needs, existing, phase, parallel: true },
    },
    llmConfig: { provider: 'siliconflow', model: 'THUDM/GLM-4-9B-0414' },
    enabledSkills: [],
    activeStyle: {},
    bestsellerPrefs: {},
  }
  const t0 = Date.now()
  const res = await fetch(BASE, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  if (!res.ok) {
    console.log(`  ✗ HTTP ${res.status} (${dt}s) ${json && json.error ? String(json.error).slice(0, 120) : ''}`)
    return null
  }
  const data = json.data
  const chars = flatten(data)
  console.log(`  ✓ HTTP 200 (${dt}s) 返回 ${chars.length} 个角色`)
  return chars
}

async function runMode(mode) {
  console.log(`\n===== 阵容模式: ${mode} =====`)
  const plan = PRESETS[mode]
  let merged = []
  const seen = {}
  for (let i = 0; i < plan.length; i++) {
    process.stdout.write(`  批次${i + 1} needs=[${plan[i].join(',')}] ... `)
    const existing = merged.map((c) => String(c.name || '')).filter(Boolean)
    const chars = await callBatch(plan[i], existing, i === 0 ? 'core' : 'supplement')
    if (!chars) continue
    for (const ch of chars) {
      const n = String(ch.name || '').trim()
      if (n && !seen[n]) { seen[n] = 1; merged.push(ch) }
    }
    const cls = classify(merged)
    console.log(`    → 累计 ${merged.length} 名: 主角${cls.主角} 女主${cls.女主} 女配${cls.女配} 朋友${cls.朋友} 反派${cls.反派} 配角${cls.配角}`)
  }
  const cls = classify(merged)
  console.log(`  【${mode} 最终】总数=${merged.length} | 主角${cls.主角} 女主${cls.女主} 女配${cls.女配} 朋友${cls.朋友} 反派${cls.反派} 配角${cls.配角} 其他${cls.其他}`)
  return { mode, total: merged.length, ...cls }
}

const results = []
results.push(await runMode('single'))
results.push(await runMode('dual'))
results.push(await runMode('harem'))

const EXPECT = {
  single: { total: 15, 主角: 1, 女主: 1, 女配: 2, 朋友: 2, 反派: 4, 配角: 5 },
  dual:   { total: 15, 主角: 1, 女主: 2, 女配: 1, 朋友: 2, 反派: 5, 配角: 4 },
  harem:  { total: 15, 主角: 1, 女主: 4, 女配: 0, 朋友: 0, 反派: 4, 配角: 6 },
}

console.log('\n================ 复测汇总（实测 vs 期望）================')
console.log('模式      项     总数  主角 女主 女配 朋友 反派 配角 其他')
let allPass = true
for (const r of results) {
  const e = EXPECT[r.mode]
  const row = (tag, v) =>
    `${r.mode.padEnd(7)} ${tag.padEnd(5)} ${String(v.total).padStart(4)}  ${v.主角}    ${v.女主}    ${v.女配}    ${v.朋友}    ${v.反派}    ${v.配角}    ${v.其他 || 0}`
  console.log(row('实测', r))
  console.log(row('期望', e))
  const ok = r.total >= e.total && r.主角 >= e.主角 && r.女主 >= e.女主 && r.反派 >= e.反派 &&
    (r.女配 + r.朋友 + r.配角 + r.其他) >= (e.女配 + e.朋友 + e.配角) && r.其他 <= 2
  console.log(`  → ${ok ? '✅ PASS（总数≥15 且六类配比达标）' : '❌ FAIL'}`)
  if (!ok) allPass = false
}
console.log(`\n总体结论: ${allPass ? '✅ 三套阵容全部达标' : '❌ 存在未达标模式，需继续修复'}`)
process.exit(0)
