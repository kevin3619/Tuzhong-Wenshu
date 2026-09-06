// 本地审计：永历中兴(d2010e15) 当前空值/模板占位（与线上数据同构，验证本地副本）
const fs = require('fs')
const NID = 'd2010e15-03a4-4197-aca5-f572af6e9d94'
const PATH = 'D:/tuzhongwang/tuzhong/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/src/tuzhong-wenshu/.tuzhong-data/settings.json'
const all = JSON.parse(fs.readFileSync(PATH, 'utf8'))
console.log('HAS_NID=', !!all[NID])
const entry = all[NID]
if (!entry) { console.log('keys:', Object.keys(all).slice(0,10)); process.exit(1) }
console.log('TOP_KEYS=', Object.keys(entry).join(','))

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
const secs = ['worldbuilding','powerSystem','characters','factions','relationships','keyPlots','synopsis','outline','idea','volumes','chapters']
const secStats = {}
secs.forEach(s => {
  const v = entry[s]
  if (v === undefined) { secStats[s] = 'ABSENT'; return }
  const before = totalEmpty
  walk(v, 'entry.' + s, s)
  secStats[s] = totalEmpty - before
})
let otherEmpty = 0
for (const k of Object.keys(entry)) { if (secs.indexOf(k) < 0 && (entry[k] === null || entry[k] === undefined || entry[k] === '' || (Array.isArray(entry[k]) && entry[k].length === 0))) { otherEmpty++ } }
console.log('EMPTY_COUNT_BY_SECTION=', JSON.stringify(secStats))
console.log('TOTAL_EMPTY=', totalEmpty + otherEmpty)

// 模板占位统计
const tplRe = /鲜明，为人处世有其独特原则|心底却藏着一段不愿对人言说|性格鲜明[，,]|负责[^。]{2,8}[，。]/g
const samples = []
function walkTpl(obj, p, sec) {
  if (!obj || typeof obj !== 'object') return
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (typeof v === 'string' && tplRe.test(v)) {
      tplRe.lastIndex = 0
      samples.push(sec + '|' + p + '.' + k)
    } else if (v && typeof v === 'object') walkTpl(v, p + '.' + k, sec)
  }
}
const tsecs = ['characters','relationships','factions']
tsecs.forEach(s => { const v=entry[s]; if(v && typeof v==='object') walkTpl(v,'entry.'+s,s) })
console.log('TPL_SAMPLES=', samples.length)
samples.slice(0,20).forEach(s=>console.log('  '+s))