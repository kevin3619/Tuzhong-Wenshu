// 在 settings.json 中定位《永历中兴》并检查 characters.personality 模板占用
const fs = require('fs')
const s = JSON.parse(fs.readFileSync('.tuzhong-data/settings.json', 'utf8'))
const keys = Object.keys(s)
console.log('total settings', keys.length)
let target = null, targetId = null
for (const k of keys) {
  const v = s[k]
  const blob = JSON.stringify(v || '')
  if (blob.includes('永历')) { target = v; targetId = k; break }
}
if (!target) { console.log('NOT_FOUND'); process.exit(0) }
console.log('FOUND id', targetId, 'title=', (target.idea?.title || target.title || target.bookTitle || '').slice(0, 30), 'lastStep=', target.lastStep)
const c = target.characters
if (!c) { console.log('NO characters field. keys=', Object.keys(target)); process.exit(0) }
console.log('characterKeys', Object.keys(c).slice(0, 15))
const all = []
if (c.protagonist) all.push(['主角', c.protagonist])
if (c.femaleLead) all.push(['女主', c.femaleLead])
if (Array.isArray(c.femaleLeads)) c.femaleLeads.forEach((x) => all.push(['女主N', x]))
if (Array.isArray(c.antagonists)) c.antagonists.forEach((x) => all.push(['反派', x]))
if (Array.isArray(c.supporting)) c.supporting.forEach((x) => all.push(['配角', x]))
console.log('TOTAL_CHARS', all.length)
let hits = []
all.forEach(([t, x]) => {
  if (x && x.name) {
    const ps = String(x.personality || '')
    if (/性格鲜明|独特原则|多面性的性格|有独立思想|神秘人物/.test(ps) && ps.length < 80) {
      hits.push({ tag: t, name: x.name, role: x.role || x.position || '', personality: ps.slice(0, 50) })
    }
  }
})
console.log('TPL_HITS', hits.length)
hits.slice(0, 40).forEach((h) => console.log(h.tag + '|' + h.name + '|' + h.role + ' = ' + h.personality))
// 也输出一个新性格作为对照（郑成功）
const zcg = all.find(([t, x]) => x && /郑成功/.test(String(x.name || '')))
if (zcg) console.log('CONTROL 郑成功 personality=', String(zcg[1].personality || '').slice(0, 60))