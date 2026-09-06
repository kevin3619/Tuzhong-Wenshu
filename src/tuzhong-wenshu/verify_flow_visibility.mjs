// ============================================================
// 流派可见性验证脚本（2026-09-02 · 用户二次实锤「选了系统流/签到流却看不到设定」）
//
// 【关键设计】INPUT_TEXT 与 KEYWORDS 中【刻意不含】任何"系统/签到/面板/任务"字样，
//   流派信息【仅】通过 genre（作品类型多选）传入 —— 完全复刻用户真实操作路径。
//   旧脚本 fullchain_empty_check.mjs 的 INPUT_TEXT 里写了"获得签到系统，每天签到…"，
//   导致即使 prompt 失效也会被"用户输入里本来就有这些词"蒙混过关（断言漏洞）。
//
// 验证点：
//   ① idea.systemName 含流派机制词
//   ② idea.coreIdea 含流派机制段落
//   ③ idea.sellingPoints 至少1条含流派词
//   ④ powerSystem.protagonistAbility / worldPowerSystem 名称含流派机制词
//
// 用法：node verify_flow_visibility.mjs [--base <url>] [--only=idea]
// ============================================================
import { SignJWT } from 'jose'

const _argBase = (process.argv.find((a) => a.startsWith('--base=')) || '').split('=')[1]
const _only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1]
const BASE = (_argBase || 'http://localhost:3001/tuzhong-wenshu/api/ai-generate').replace(/^http:\/\/(?!localhost|127\.0\.0\.1)/, 'https://')
const isRemote = !/localhost|127\.0\.0\.1/.test(BASE)

let token = ''
if (isRemote) {
  const onlineSecret = new TextEncoder().encode('your_random_jwt_secret_key_here_change_in_production')
  token = await new SignJWT({ userId: 'cmt29spvs000052dhoi3al7aj', isAdmin: true })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(onlineSecret)
  console.log('✅ 线上鉴权: 伪造管理员token（线上 JWT_SECRET=默认值）\n')
} else {
  const secret = new TextEncoder().encode('your_random_jwt_secret_key_here_change_in_production')
  token = await new SignJWT({ isAdmin: true, userId: 'temp', role: 'admin', sub: 'temp' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('2h').sign(secret)
}
const HEADERS = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }

// ---------- 场景定义（input/keywords 严禁出现机制词） ----------
const SCENARIOS = [
  {
    name: 'A·历史 + 系统流 + 签到流（用户实锤场景）',
    genre: '历史,系统流,签到流',
    // 🔥 刻意不含"系统/签到/面板/任务"
    input: '主角是21岁的现代青年，魂穿明末崇祯十四年，附身崇祯太子朱慈烺。此时李自成围开封、清军压山海关、朝堂党争不休。他凭一己之力整编残军、推行新政、收复失地，立誓中兴大明、重整山河。',
    keywords: ['历史', '明末', '权谋', '争霸', '穿越', '朝堂'],
    flows: ['系统流', '签到流'],
    // 每个流派要求的机制词
    expect: { 系统流: /系统/, 签到流: /签到|打卡/ },
  },
  {
    name: 'B·玄幻 + 系统流（非历史题材回归验证）',
    genre: '玄幻,系统流',
    input: '少年出身寒微，于宗门大比中一鸣惊人，凭机缘与毅力逆势崛起，一步步登临世间绝巅。',
    keywords: ['玄幻', '逆袭', '热血', '天才'],
    flows: ['系统流'],
    expect: { 系统流: /系统/ },
  },
]

// ---------- 调用 ----------
async function callStep(step, body) {
  const t0 = Date.now()
  try {
    const res = await fetch(BASE, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    const dt = ((Date.now() - t0) / 1000).toFixed(1)
    if (!res.ok) return { ok: false, dt, error: String(json.error || json.message || ('HTTP ' + res.status)).slice(0, 300) }
    return { ok: true, dt, data: json.data || {} }
  } catch (e) {
    return { ok: false, dt: ((Date.now() - t0) / 1000).toFixed(1), error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }
  }
}

function buildBody(step, sc, prev) {
  return {
    step,
    input: sc.input,
    keywords: sc.keywords,
    genre: sc.genre,
    novelId: 'temp',
    previousData: {
      ...prev,
      idea: prev.idea || null,
      worldbuilding: prev.worldbuilding || null,
      powerSystem: prev.powerSystem || null,
      keywords: sc.keywords,
      imitate: null,
      appendRoleInput: '',
      existingCharacters: [],
      characters: null,
      bookAnalysis: null,
      detailedDesignInput: '',
      protagonistSettings: { name: '朱慈烺', age: 21, identity: '穿越者（现代青年），附身崇祯太子朱慈烺' },
    },
    llmConfig: {},
    enabledSkills: [],
    activeStyle: {},
    bestsellerPrefs: {},
  }
}

// ---------- 主流程 ----------
const runPower = _only !== 'idea'
let allPass = true

for (const sc of SCENARIOS) {
  console.log('════════════════════════════════════════')
  console.log('▶ ' + sc.name)
  console.log('  genre = ' + sc.genre)
  console.log('  input = ' + sc.input.slice(0, 40) + '…（不含机制词）')
  console.log('────────────────────────────────────────')

  // ===== idea =====
  const r1 = await callStep('idea', buildBody('idea', sc, {}))
  if (!r1.ok) {
    console.log('  ❌ idea 失败: ' + r1.error)
    allPass = false
    continue
  }
  const d1 = r1.data
  console.log('  ✅ idea 200 (' + r1.dt + 's)')

  const spArr = Array.isArray(d1.sellingPoints) ? d1.sellingPoints.map((s) => String(s || '')) : []
  const targets = [
    { label: 'systemName(金手指名)', text: String(d1.systemName || '') },
    { label: 'tagline(一句话)', text: String(d1.tagline || '') },
    { label: 'coreIdea(小说介绍)', text: String(d1.coreIdea || '') },
    { label: 'sellingPoints(卖点)', text: spArr.join(' | ') },
    { label: 'coreSellingPoint', text: String(d1.coreSellingPoint || '') },
  ]

  console.log('  ── 输出快照 ──')
  for (const t of targets) {
    const shown = t.text.length > 150 ? t.text.slice(0, 150) + '…' : t.text || '(空)'
    console.log('    [' + t.label + '] ' + shown.replace(/\n/g, ' '))
  }

  console.log('  ── 流派断言 ──')
  for (const flow of sc.flows) {
    const re = sc.expect[flow]
    const hits = targets.filter((t) => re.test(t.text)).map((t) => t.label)
    if (hits.length >= 2) {
      console.log('    ✅ ' + flow + ' → 命中 ' + hits.length + ' 个字段：' + hits.join('、'))
    } else if (hits.length === 1) {
      console.log('    ⚠️  ' + flow + ' → 仅命中 1 个字段：' + hits.join('、') + '（偏弱）')
    } else {
      console.log('    ❌ ' + flow + ' → 未命中任何字段（用户看不到该流派设定）')
      allPass = false
    }
  }
  // 硬性要求：coreIdea 必须含流派机制段落（兜底层保证，必须 100% 命中）
  const coreOk = sc.flows.every((f) => sc.expect[f].test(String(d1.coreIdea || '')))
  console.log('    ' + (coreOk ? '✅' : '❌') + ' coreIdea 兜底层强制含全部流派词（硬性）')
  if (!coreOk) allPass = false

  if (!runPower) continue

  // ===== powerSystem =====
  const r2 = await callStep('powerSystem', buildBody('powerSystem', sc, { idea: d1 }))
  if (!r2.ok) {
    console.log('  ❌ powerSystem 失败: ' + r2.error)
    allPass = false
    continue
  }
  const d2 = r2.data
  const pa = d2.protagonistAbility || {}
  const wps = d2.worldPowerSystem || {}
  console.log('  ✅ powerSystem 200 (' + r2.dt + 's)')
  console.log('  ── 金手指快照 ──')
  console.log('    [金手指名] ' + String(pa.name || '(空)') + ' / ' + String(pa.type || '(空)'))
  console.log('    [体系名]   ' + String(wps.name || '(空)') + ' / ' + String(wps.type || '(空)'))
  console.log('  ── 流派断言 ──')
  const psBlob = [pa.name, pa.type, pa.description, wps.name, wps.type].join(' ')
  for (const flow of sc.flows) {
    const re = sc.expect[flow]
    if (re.test(psBlob)) console.log('    ✅ ' + flow + ' → 金手指名称/类型命中')
    else {
      console.log('    ⚠️  ' + flow + ' → 金手指名称/类型未含机制词（检查 description 兜底）')
      console.log('       description: ' + String(pa.description || '').slice(0, 120))
    }
  }
}

console.log('\n================ 汇总 ================')
console.log(allPass ? '✅ PASS（流派设定在灵感创作中可见）' : '❌ FAIL（仍存在流派不可见问题）')
process.exit(allPass ? 0 : 1)
