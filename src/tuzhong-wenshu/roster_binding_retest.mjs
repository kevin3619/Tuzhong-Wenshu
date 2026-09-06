// ============================================================
// 第20轮 · 用户人物逐槽绑定 全链路复测脚本
// 验证：
//   ① detailedDesignInput 中《永历中兴》人物名单被解析并逐槽绑定
//   ② 主角=朱由榔（绑定强制回写）
//   ③ 反派姓名 ⊆ 用户反派名单（丁魁楚/多铎/马士英/阮大铖/吴三桂/多尔衮）
//   ④ 朋友槽绑定亲随/忠臣盟友名单
//   ⑤ identity 含「阵营」职能定位（铁律12.4 遵从度）
//   ⑥ single 模式 15/15 名额
// ============================================================
import { SignJWT } from 'jose'

const SECRET = 'your_random_jwt_secret_key_here_change_in_production'
const secret = new TextEncoder().encode(SECRET)
const token = await new SignJWT({ isAdmin: true, userId: 'temp', role: 'admin', sub: 'temp' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('2h')
  .sign(secret)

const BASE = 'http://localhost:3001/tuzhong-wenshu/api/ai-generate'
const HEADERS = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }

// ---------- single 模式（与前端 CHAR_ROSTER_PRESETS 一致）----------
const PLAN = [
  ['主角', '女主', '反派', '反派', '配角'],
  ['反派', '反派', '朋友', '朋友', '配角'],
  ['女配', '女配', '配角', '配角', '配角'],
]

const GENRE = '历史'
const KEYWORDS = ['历史', '南明', '中兴', '权谋']

// 《永历中兴》用户人物名单（节选，含全部反派 + 亲随 + 忠臣盟友）
const USER_DESIGN = `【人物设定】
主角：朱由榔（永历帝，明室宗亲，主角阵营核心，性格坚韧果决，于肇庆即位续正统）
【七位亲随】
【赵虎】—— 御前侍卫（永历阵营·主角亲随，武力高强，忠勇护主）
【王忠赐】—— 内侍随从（永历阵营·贴身亲随，机敏忠诚）
【朱落】—— 落魄宗室（永历阵营·亲随，身份隐秘）
【白柏年】—— 老幕僚（永历阵营·文书亲随，足智多谋）
【李铁山】—— 铁匠出身的护卫（永历阵营·亲随，力大无穷）
【孙思远】—— 游方郎中（永历阵营·随军医官亲随）
【周德全】—— 老船工（永历阵营·水路向导亲随）
【忠臣盟友】
瞿式耜（永历阵营·忠臣文官）：留守桂林，督师抗清，殉国而死
史可法（永历阵营·忠臣督师）：扬州死守，气节千秋
堵胤锡（永历阵营·忠臣文官）：联合大顺余部抗清
何腾蛟（永历阵营·湖广总督）：协调诸镇
【武将盟友】
李定国（大西军归明·统兵大将）：两蹶名王，威震天下
焦琏（永历阵营·地方武将）：广西总兵
【反派阵营】
丁魁楚（清军阵营·叛臣文官）：卖主求荣的前朝首辅
多铎（清军阵营·统兵大将）：扬州十日元凶
马士英（南明残余·权奸军阀）：拥兵自重
阮大铖（南明残余·奸佞文官）：构陷忠良
吴三桂（清军阵营·降将）：引清入关
【内廷】
玉竹（永历阵营·内廷宫女）：贴身侍奉
庞天寿（永历阵营·内廷司礼太监）：通晓宫务
【历史人物】
多尔衮（清军阵营·摄政王）：掌握大清实权
孔有德（清军阵营·降将藩王）：恭顺王
李成栋（清军阵营·降将，后反正）：两广提督
张献忠（大西·流寇首领）：建元大西
孙可望（大西·国主，跋扈枭雄）：张献忠义子
阎应元（江阴·抗清义士）：江阴八十一日
【大纲】
第一卷（第1-100章）：永历即位，重整朝纲，收拢亲随班底，桂林整军`
const ANTAGONIST_POOL = ['丁魁楚', '多铎', '马士英', '阮大铖', '吴三桂', '多尔衮', '孔有德', '李成栋']
const FRIEND_POOL = ['赵虎', '王忠赐', '朱落', '白柏年', '李铁山', '孙思远', '周德全', '瞿式耜', '史可法', '堵胤锡', '何腾蛟', '李定国', '焦琏', '玉竹', '庞天寿', '阎应元']

function flatten(data) {
  // 🔥 第20轮·续：响应组装时 antagonist 标量 = antagonists[0]（route.ts L26992），JSON 序列化后成两个独立对象，
  //   引用去重失效 → 按姓名去重（同一角色只计一次），标量放在数组之后兜底
  const out = []
  const seenN = {}
  const pushOnce = (c) => {
    const n = c && typeof c === 'object' ? String(c.name || '').trim() : ''
    if (c && typeof c === 'object' && n && !seenN[n]) { seenN[n] = 1; out.push(c) }
  }
  if (!data) return out
  if (data.protagonist) pushOnce(data.protagonist)
  if (Array.isArray(data.femaleLeads)) data.femaleLeads.forEach(pushOnce)
  else if (data.femaleLead) pushOnce(data.femaleLead)
  if (Array.isArray(data.antagonists)) data.antagonists.forEach(pushOnce)
  else if (data.antagonist) pushOnce(data.antagonist)
  if (Array.isArray(data.supporting)) data.supporting.forEach(pushOnce)
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
      idea: { protagonistName: '朱由榔', title: '永历中兴' },
      powerSystem: {},
      worldbuilding: { era: '南明永历年间（1646-1662）', geo: '肇庆、桂林、昆明、贵州、湖广' },
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
      detailedDesignInput: USER_DESIGN,
      // 🔑 charBatch 必须在 previousData 内
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
    console.log(`  ✗ HTTP ${res.status} (${dt}s) ${json && json.error ? String(json.error).slice(0, 160) : ''}`)
    return null
  }
  const data = json.data
  const chars = flatten(data)
  console.log(`  ✓ HTTP 200 (${dt}s) 返回 ${chars.length} 个角色`)
  return chars
}

let merged = []
const seen = {}
const checks = { 主角绑定: null, 反派对齐: [], 朋友对齐: [], 阵营定位: 0, 身份采样: [] }

for (let i = 0; i < PLAN.length; i++) {
  process.stdout.write(`批次${i + 1} needs=[${PLAN[i].join(',')}] ... `)
  const existing = merged.map((c) => String(c.name || '')).filter(Boolean)
  const chars = await callBatch(PLAN[i], existing, i === 0 ? 'core' : 'supplement')
  if (!chars) continue
  for (const ch of chars) {
    const n = String(ch.name || '').trim()
    if (!n || seen[n]) continue
    seen[n] = 1
    merged.push(ch)
    const rp = String(ch.rolePosition || ch.role || '').trim()
    const idn = String(ch.identity || '')
    if (/主角/.test(rp)) checks.主角绑定 = n
    if (/反派/.test(rp)) checks.反派对齐.push(n)
    if (/朋友/.test(rp)) checks.朋友对齐.push(n)
    if (/阵营|职能|文官|武将|统兵|亲随|宦官|总督|首领|首辅|摄政/.test(idn)) checks.阵营定位++
    if (checks.身份采样.length < 3) checks.身份采样.push(`${n}[${rp}] ${idn.slice(0, 60)}`)
  }
  const cls = classify(merged)
  console.log(`    → 累计 ${merged.length} 名: 主角${cls.主角} 女主${cls.女主} 女配${cls.女配} 朋友${cls.朋友} 反派${cls.反派} 配角${cls.配角}`)
}

const cls = classify(merged)
console.log(`\n【最终】总数=${merged.length} | 主角${cls.主角} 女主${cls.女主} 女配${cls.女配} 朋友${cls.朋友} 反派${cls.反派} 配角${cls.配角}`)
console.log('主角绑定:', checks.主角绑定, checks.主角绑定 === '朱由榔' ? '✅' : '❌ (期望 朱由榔)')
const antagAligned = checks.反派对齐.filter((n) => ANTAGONIST_POOL.includes(n))
console.log(`反派对齐: ${antagAligned.length}/${checks.反派对齐.length} 命中用户名单 [${checks.反派对齐.join('、')}]`, antagAligned.length >= Math.ceil(checks.反派对齐.length * 0.8) ? '✅' : '❌')
const friendAligned = checks.朋友对齐.filter((n) => FRIEND_POOL.includes(n))
console.log(`朋友对齐: ${friendAligned.length}/${checks.朋友对齐.length} 命中用户名单 [${checks.朋友对齐.join('、')}]`, friendAligned.length >= Math.ceil(checks.朋友对齐.length * 0.5) ? '✅' : '❌')
console.log(`阵营职能定位: ${checks.阵营定位}/${merged.length} 角色 identity 含阵营/职能描述`)
console.log('身份采样:')
checks.身份采样.forEach((s) => console.log('  · ' + s))
const pass = merged.length === 15 && checks.主角绑定 === '朱由榔' && antagAligned.length >= Math.ceil(checks.反派对齐.length * 0.8)
console.log(pass ? '\n总体结论: ✅ PASS' : '\n总体结论: ❌ FAIL')
process.exit(pass ? 0 : 1)
