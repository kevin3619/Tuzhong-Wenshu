// 细看本地 characters/relationships/volumes 空值路径
const fs = require('fs')
const NID = 'd2010e15-03a4-4197-aca5-f572af6e9d94'
const PATH = 'D:/tuzhongwang/tuzhong/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/src/tuzhong-wenshu/.tuzhong-data/settings.json'
const entry = JSON.parse(fs.readFileSync(PATH, 'utf8'))[NID]
const empties = []
function walk(obj, p, sec) {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) { obj.forEach((v, i) => { if (v && typeof v === 'object') walk(v, p + '[' + i + ']', sec) }); return }
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (v === null || v === undefined) empties.push(sec + '|' + p + '.' + k + '=null')
    else if (typeof v === 'string' && v.trim() === '') empties.push(sec + '|' + p + '.' + k + '=""')
    else if (Array.isArray(v) && v.length === 0) empties.push(sec + '|' + p + '.' + k + '=[]')
    else if (typeof v === 'object') walk(v, p + '.' + k, sec)
  }
}
walk(entry.characters, 'entry.characters', 'characters')
walk(entry.relationships, 'entry.relationships', 'relationships')
walk(entry.chapters, 'entry.chapters', 'chapters')
walk(entry.volumes, 'entry.volumes', 'volumes')
console.log('chars+rels+chaps+vols EMPTIES=' + empties.length)
const bucket = {}
empties.forEach(n => { const f = n.split(/[.|]\./).slice(-1)[0] || n.split('=')[0].split('.').pop(); bucket[f] = (bucket[f]||0)+1 })
console.log('BY_FIELD=', JSON.stringify(bucket, null, 1))
console.log('----- chapters/volumes structure -----')
console.log('chapters type=', Array.isArray(entry.chapters) ? 'array[' + entry.chapters.length + ']' : typeof entry.chapters)
if (Array.isArray(entry.chapters)) console.log('chapters[0] keys=', entry.chapters[0] ? Object.keys(entry.chapters[0]) : 'null')
console.log('volumes=', entry.volumes === undefined ? 'ABSENT' : (Array.isArray(entry.volumes) ? 'array[' + entry.volumes.length + ']' : typeof entry.volumes))
console.log('----- relationships sample -----')
if (Array.isArray(entry.relationships && entry.relationships.relationships)) console.log('rels[0] keys=', Object.keys(entry.relationships.relationships[0] || {}))