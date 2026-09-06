// 隔离测试 worldbuilding 步的 threeRealms 兜底是否生效（本地 dev5 / 线上）
import { SignJWT } from 'jose'

const _argBase = (process.argv.find((a) => a.startsWith('--base=')) || '').split('=')[1]
const BASE = (_argBase || 'http://localhost:3001/tuzhong-wenshu/api/ai-generate').replace(/^http:\/\/(?!localhost|127\.0\.0\.1)/, 'https://')
const isRemote = !/localhost|127\.0\.0\.1/.test(BASE)
const SECRET = 'your_random_jwt_secret_key_here_change_in_production'
const secret = new TextEncoder().encode(SECRET)
const token = await new SignJWT(isRemote ? { userId: 'cmt29spvs000052dhoi3al7aj', isAdmin: true } : { isAdmin: true, userId: 'temp', role: 'admin', sub: 'temp' })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret)
const HEADERS = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }

const GENRE = '历史,系统流,签到流'
const KEYWORDS = ['历史', '明末', '清初', '权谋', '争霸', '穿越']
const INPUT_TEXT = '主角是21岁的现代青年，穿越到明末清初附身成为崇祯太子朱慈烺，立志中兴大明、对抗清军。'

const body = {
  step: 'worldbuilding',
  input: INPUT_TEXT,
  keywords: KEYWORDS,
  genre: GENRE,
  novelId: 'temp',
  previousData: {
    idea: {
      title: '崇祯太子中兴录',
      keywords: KEYWORDS,
      tagline: '现代青年穿越附身崇祯太子，激活每日签到系统',
      coreIdea: '朱慈烺借签到系统积累国力，中兴大明',
      coreConflict: '内忧外患，关外清军压境，朝内党争',
      protagonistName: '朱慈烺',
      modernName: '林轩',
    },
    keywords: KEYWORDS,
    imitate: null,
    protagonistSettings: { name: '朱慈烺', age: 21, identity: '穿越者' },
  },
  llmConfig: {}, enabledSkills: [], activeStyle: {}, bestsellerPrefs: {},
}

const t0 = Date.now()
const res = await fetch(BASE, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
const json = await res.json().catch(() => ({}))
const dt = ((Date.now() - t0) / 1000).toFixed(1)
console.log('STATUS', res.status, '(' + dt + 's)')
const d = json.data || {}
console.log('--- threeRealms ---')
console.log(JSON.stringify(d.threeRealms, null, 2))
console.log('--- secretHistory (前80) ---')
console.log(String(d.secretHistory || '').slice(0, 80))
console.log('--- powerSystem (前120) ---')
console.log(String(d.powerSystem || '').slice(0, 120))
