// 核查线上永历(NID=40249ecb)各环节设置的空值情况（字符级），对照已知问题字段
const fs = require('fs')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const PATH = '/www/wwwroot/tuzhong-wenshu/.tuzhong-data/settings.json'
const all = JSON.parse(fs.readFileSync(PATH, 'utf8'))
console.log('SETTINGS_KEYS_COUNT=', Object.keys(all).length, 'HAS_NID=', !!all[NID])
const entry = all[NID]
if (!entry) { console.log('NID not in settings.json. Keys sample:', Object.keys(all).slice(0, 20)); process.exit(1) }
console.log('TOP_KEYS=', Object.keys(entry))

let totalEmpty = 0
const empties = []
function walk(obj, p, sec) {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    if (obj.length === 0) { totalEmpty++; empties.push(sec + '|' + p + '=[]') }
    obj.forEach((v, i) => { if (v && typeof v === 'object') walk(v, p + '[' + i + ']', sec) })
    return
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (v === null || v === undefined) { totalEmpty++; empties.push(sec + '|' + p + '.' + k + '=null') }
    else if (typeof v === 'string' && v.trim() === '') { totalEmpty++; empties.push(sec + '|' + p + '.' + k + '=""') }
    else if (Array.isArray(v) && v.length === 0) { totalEmpty++; empties.push(sec + '|' + p + '.' + k + '=[]') }
    else if (typeof v === 'object') walk(v, p + '.' + k, sec)
  }
}
const secs = ['worldSetting','worldbuilding','powerSystem','characters','factions','relationships','keyPlots','synopsis','outline','idea','volumes','chapters']
const secStats = {}
secs.forEach(s => {
  const v = entry[s]
  if (v === undefined) { secStats[s] = 'ABSENT'; return }
  const before = totalEmpty
  walk(v, 'entry.' + s, s)
  secStats[s] = totalEmpty - before
})
// 顶层其他
let otherEmpty = 0
for (const k of Object.keys(entry)) { if (secs.indexOf(k) < 0 && (entry[k] === null || entry[k] === undefined || entry[k] === '' || (Array.isArray(entry[k]) && entry[k].length === 0))) { otherEmpty++ } }
console.log('EMPTY_COUNT_BY_SECTION=', JSON.stringify(secStats))
console.log('OTHER_TOP_EMPTY=', otherEmpty)
console.log('TOTAL_EMPTY=', totalEmpty + otherEmpty)

// 各环节核心规模
const size = (v) => Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : (v ? 'set' : 'null'))
console.log('SIZES=', JSON.stringify({
  worldbuilding: size(entry.worldbuilding), powerSystem: size(entry.powerSystem),
  characters: size(entry.characters), factions: size(entry.factions),
  relationships: size(entry.relationships), keyPlots: size(entry.keyPlots),
  synopsis: size(entry.synopsis), outline: size(entry.outline), idea: size(entry.idea),
  volumes: size(entry.volumes), chapters: size(entry.chapters),
}))

// 重点字段明细（前80条）
console.log('===== PROBE EMPTY NODES (first 80) =====')
const probeKw = ['job','goal','powerLevel','faction','relationship','personality','background','motivation','role','realm','rank','color','rule','epoch','eraName','name','summary','title','description','identity','ambition']
const interesting = empties.filter(n => {
  const leaf = n.split('.')[0].split('|')[1] || n.split('.').slice(-1)[0]
  return probeKw.some(k => (leaf || '').toLowerCase().includes(k))
})
(interesting.length ? interesting : empties).slice(0, 80).forEach(n => console.log('  ' + n))