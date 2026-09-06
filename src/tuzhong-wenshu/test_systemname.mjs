import { SignJWT } from 'jose'

const SECRET = 'your_random_jwt_secret_key_here_change_in_production'
const token = await new SignJWT({ isAdmin: true, userId: 'temp', role: 'admin', sub: 'temp' })
  .setProtectedHeader({ alg: 'HS256' })
  .sign(new TextEncoder().encode(SECRET))

const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu/api/ai-generate'
const body = {
  step: 'idea',
  input: '南明 崇祯太子 朱慈烺 中兴大明 系统在手',
  keywords: ['南明', '崇祯太子', '朱慈烺', '中兴', '系统流', '签到流', '面板流'],
  genre: '历史,系统流,签到流,面板流',
  novelId: 'temp',
}

const res = await fetch(BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify(body),
})
console.log('HTTP', res.status)
const json = await res.json()
const d = json.data || {}
console.log('=== systemName ===', JSON.stringify(d.systemName))
console.log('=== title ===', JSON.stringify(d.title))
console.log('=== tagline(前40) ===', JSON.stringify(String(d.tagline || '').slice(0, 40)))
console.log('=== coreIdea(前60) ===', JSON.stringify(String(d.coreIdea || '').slice(0, 60)))
const sp = Array.isArray(d.sellingPoints) ? d.sellingPoints : []
console.log('=== sellingPoints count ===', sp.length)
const hit = sp.some((s) => /系统|签到|面板/.test(String(s)))
console.log('=== 卖点是否含流派机制词 ===', hit)
const sn = String(d.systemName || '')
const ok = /签到/.test(sn) && /系统$/.test(sn) && !/面板$/.test(sn)
console.log('=== 命名规范判定(签到+以系统结尾+非面板后缀) ===', ok ? 'PASS' : 'FAIL (' + sn + ')')
