// 直接 JWT 鉴权 + 调用 characters API，校验：①单女主 slot 非空 ②title 徽章为真实身份头衔（非通用职能词）
import { SignJWT } from 'jose'

const BASE = 'http://localhost:3001/tuzhong-wenshu'
const SECRET = 'your_random_jwt_secret_key_here_change_in_production'
const enc = new TextEncoder().encode(SECRET)

const token = await new SignJWT({ userId: 'reprotest-user', isAdmin: false })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(enc)

const mode = process.argv[2] || 'fl'
const NEEDS_CORE = ['主角', '女主', '反派', '配角']
const ROSTER = ['朱由榔', '吴三桂', '李定国', '郑成功', '沐天波', '王太后', '史可法']
const needs = mode === 'fl' ? ['主角', '女主'] : ['反派', '配角']
const existing = mode === 'fl' ? [] : ROSTER.map(n => ({ name: n }))
const phase = mode === 'fl' ? 'core' : 'supplement'

const body = {
  step: 'characters', input: '明朝末年，南明永历朝廷，权谋与抗清',
  keywords: ['历史', '权谋', '明末'], genre: '历史', novelId: 'reprotest-char',
  previousData: {
    idea: { title: '永历中兴', protagonistName: '朱由榔', genre: '历史', tagline: '南明永历帝朱由榔在乱世中联明抗清' },
    keywords: ['历史', '权谋', '明末'],
    existingCharacters: existing,
    appendRoleInput: '',
    charBatch: { size: needs.length, needs, existing, phase, parallel: true },
    detailedDesignInput: '南明永历时期各派系斗争',
    protagonistSettings: { name: '朱由榔', gender: '男', age: '26', identity: '永历帝' },
    bookAnalysis: { femaleLeadMode: '单女主' },
  },
  enabledSkills: [], activeStyle: [], bestsellerPrefs: [],
}

const t0 = Date.now()
const res = await fetch(BASE + '/api/ai-generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(600000),
})
const ms = Date.now() - t0
const json = await res.json().catch(() => null)
console.log('== HTTP', res.status, '耗时', (ms / 1000).toFixed(1) + 's')
console.log('usedModel=', json && json._meta && json._meta.usedModel,
  ' | msg=', json && json.error ? json.error : '')

const d = json && json.data
if (!d) { console.log('no data:', JSON.stringify(json).slice(0, 500)); process.exit(1) }

const GEN = ['主角', '女主', '配角', '反派', '导师', '盟友', '忠臣', '武将', '文臣', '皇后', '宠妃', '王妃', '公主', '丫鬟', '小厮']
function judge(title) {
  const t = String(title || '').trim()
  if (!t) return 'EMPTY'
  if (GEN.includes(t)) return 'GENERIC(!!!)'
  if (/^(主角|配角|反派|女主|男二|男三|女二|女三)$/.test(t)) return 'GENERIC(!!!)'
  return 'ok'
}

const slots = { femaleLead: d.femaleLead, protagonist: d.protagonist, antagonists: d.antagonists, supporting: d.supporting,
  mentor: d.mentor, femaleLeads: d.femaleLeads }
for (const key of Object.keys(slots)) {
  const arr = Array.isArray(slots[key]) ? slots[key] : (slots[key] ? [slots[key]] : [])
  if (arr.length === 0 || (arr.length === 1 && !arr[0])) { console.log(`—— ${key}: (空)`.padEnd(40)); continue }
  arr.forEach(c => {
    const nm = c && c.name || '?'
    const rp = c && c.rolePosition || ''
    const tl = c && c.title || ''
    console.log(`—— ${key}`.padEnd(12), `| 姓名:${String(nm).padEnd(6)}`, `| 定位:${String(rp).padEnd(8)}`,
      `| title徽章:${String(tl).padEnd(10)}`, `[${judge(tl)}]`)
  })
}
console.log('== 校验：是否存在空 title 或通用职能词 title —', JSON.stringify({ empty: judgeAll(d), note: '含(空)/(GENERIC)即失败' }))
function judgeAll(dd) {
  let bad = 0
  for (const key of ['protagonist', 'femaleLead', 'antagonists', 'supporting', 'mentor', 'femaleLeads']) {
    const arr = Array.isArray(dd[key]) ? dd[key] : (dd[key] ? [dd[key]] : [])
    for (const c of arr) { if (judge(c && c.title) !== 'ok') bad++ }
  }
  return bad
}