// 复测：服务器修复后，settings GET 返回的角色性格是否还有模板串
const fs = require('fs')
const raw = fs.readFileSync('.tuzhong-data/settings.json', 'utf8')
const data = JSON.parse(raw)
const MARKS = ['性格鲜明', '性格开朗', '性格稳重', '性格复杂', '有独立思想', '为人处世有其独特原则', '独特原则', '多面性的性格', '在故事中展现', '重要角色', '关键角色', '神秘人物', '形象独特', '不可或缺的重要角色']
function isTpl(p) { if (!p) return false; if (p.length > 60) return false; for (const m of MARKS) if (p.indexOf(m) >= 0) return true; return false }
let totalChar = 0, tplRemain = 0
const remainSamples = []
for (const id of Object.keys(data)) {
  const c = data[id] && data[id].characters
  if (!c) continue
  const title = (data[id].idea && data[id].idea.title) || data[id].title || id
  if (!String(title).includes('永历')) continue
  const cb = [c.protagonist, c.femaleLead]
  cb.forEach((x) => { if (x && x.name) { totalChar++; if (isTpl(x.personality)) { tplRemain++; remainSamples.push(x.name + '=' + x.personality.slice(0, 24)) } } })
  ;(c.antagonists || []).forEach((x) => { if (x && x.name) { totalChar++; if (isTpl(x.personality)) { tplRemain++; remainSamples.push(x.name + '=' + x.personality.slice(0, 24)) } } })
  ;(c.supporting || []).forEach((x) => { if (x && x.name) { totalChar++; if (isTpl(x.personality)) { tplRemain++; remainSamples.push(x.name + '=' + x.personality.slice(0, 24)) } } })
  // 抽样几个关键角色
  const keyNames = ['朱由榔', '朱由崧', '朱聿键', '朱聿鐭', '郑成功', '李定国', '多铎', '多尔衮', '孙可望', '马士英']
  const all2 = cb.concat(c.antagonists || [], c.supporting || [])
  for (const kn of keyNames) { const f = all2.find((x) => x && x.name === kn); if (f) console.log('CHAR', kn, '|', String(f.personality || '').slice(0, 40)) }
}
console.log('TOTAL', totalChar, 'TPL_REMAIN', tplRemain)
remainSamples.slice(0, 20).forEach((s) => console.log('REMAIN', s))