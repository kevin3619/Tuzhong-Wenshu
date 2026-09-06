// 审计修复后的副本
const fs = require('fs')
const NID = 'd2010e15-03a4-4197-aca5-f572af6e9d94'
const PATH = 'D:/tuzhongwang/tuzhong/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/_browser-test/settings.copy.json'
const entry = JSON.parse(fs.readFileSync(PATH, 'utf8'))[NID]
const empties = []
function walk(obj, p, sec) {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    if (obj.length === 0) empties.push(sec + '|' + p + '=[]')
    obj.forEach((v, i) => { if (v && typeof v === 'object') walk(v, p + '[' + i + ']', sec) })
    return
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (v === null || v === undefined) empties.push(sec + '|' + p + '.' + k + '=null')
    else if (typeof v === 'string' && v.trim() === '') empties.push(sec + '|' + p + '.' + k + '=""')
    else if (Array.isArray(v) && v.length === 0) empties.push(sec + '|' + p + '.' + k + '=[]')
    else if (typeof v === 'object') walk(v, p + '.' + k, sec)
  }
}
const secs = ['characters','relationships','chapters','volumes','powerSystem','worldbuilding','keyPlots']
const stats = {}
secs.forEach(s => { const before=empties.length; if(entry[s] !== undefined) walk(entry[s], 'entry.'+s, s); stats[s]=empties.length-before })
console.log('EMPTY_BY_SECTION=', JSON.stringify(stats))
console.log('chapters.volumes len=', entry.chapters && Array.isArray(entry.chapters.volumes) ? entry.chapters.volumes.length : 'n/a')
console.log('chapters.chapters len=', entry.chapters && Array.isArray(entry.chapters.chapters) ? entry.chapters.chapters.length : 'n/a')
console.log('rels deepConflict empty=', entry.relationships && entry.relationships.relationships ? entry.relationships.relationships.filter(r => !r.deepConflict || !String(r.deepConflict).trim()).length : 'n/a')