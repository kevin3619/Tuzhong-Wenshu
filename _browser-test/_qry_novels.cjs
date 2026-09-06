// 检查 novels.json 中《永历中兴》的 characters 结构
const fs = require('fs')
const j = JSON.parse(fs.readFileSync('.tuzhong-data/novels.json', 'utf8'))
console.log('TYPE', Array.isArray(j) ? 'array' : 'obj', 'KEYS', Object.keys(j).slice(0, 10))
const findIn = (j) => {
  if (Array.isArray(j)) {
    const hit = j.filter((n) => String(n.title || n.name || '').includes('永历'))
    return hit
  }
  if (j && typeof j === 'object') {
    // 可能是 {id: novel} 或 {list: []}
    for (const k of Object.keys(j)) {
      if (Array.isArray(j[k])) {
        const hit = j[k].filter((n) => String(n.title || n.name || '').includes('永历'))
        if (hit.length) return hit
      }
    }
  }
  return []
}
const hits = findIn(j)
console.log('HIT_COUNT', hits.length)
hits.forEach((n) => {
  console.log('---NOVEL---', n.id, n.title || n.name, 'hasCharacters', !!n.characters)
  if (n.characters) {
    const c = n.characters
    console.log('characterKeys', Object.keys(c).slice(0, 12))
    const all = []
    if (c.protagonist) all.push(['主角', c.protagonist])
    if (c.femaleLead) all.push(['女主', c.femaleLead])
    if (Array.isArray(c.antagonists)) c.antagonists.forEach((x) => all.push(['反派', x]))
    if (Array.isArray(c.supporting)) c.supporting.forEach((x) => all.push(['配角', x]))
    let hits2 = []
    all.forEach(([t, x]) => {
      if (x && x.name) {
        const ps = String(x.personality || '')
        if (/性格鲜明|独特原则|多面性的性格/.test(ps) && ps.length < 80) {
          hits2.push(t + ':' + x.name + '=' + ps.slice(0, 48))
        }
      }
    })
    console.log('TOTAL_CHARS', all.length, 'TPL_HITS', hits2.length)
    hits2.slice(0, 30).forEach((h) => console.log(h))
  }
})