const fs = require('fs')
const base = '/www/wwwroot/tuzhong-wenshu/.tuzhong-data'
function keysOf(file) {
  const p = base + '/' + file
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'))
    const ks = Object.keys(d)
    return ks.map(k => {
      const v = d[k]
      let t = v && (v.title || v.bookTitle || v.novelTitle || v.name)
      t = t || (v && v.meta && v.meta.title)
      return { k: k, title: (t || '').toString().slice(0, 20), keys: v && typeof v === 'object' ? Object.keys(v).slice(0, 12) : [] }
    })
  } catch (e) { return [{ k: 'PARSE_ERR:' + e.message }] }
}
console.log('=== settings.json ===')
for (const r of keysOf('settings.json')) console.log(r.k, '| title=', r.title)
console.log('=== novels.json (samples) ===')
for (const r of keysOf('novels.json').slice(0, 25)) console.log(r.k, '| title=', r.title, '| keys=', r.keys.join(','))
console.log('=== volumes.json (all) ===')
for (const r of keysOf('volumes.json')) console.log(r.k, '| title=', r.title, '| keys=', r.keys.join(','))