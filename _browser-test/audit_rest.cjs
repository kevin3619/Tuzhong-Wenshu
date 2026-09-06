// 查看修复副本中 characters 剩余 18 处空
const fs = require('fs')
const NID = 'd2010e15-03a4-4197-aca5-f572af6e9d94'
const PATH = 'D:/tuzhongwang/tuzhong/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/_browser-test/settings.copy.json'
const entry = JSON.parse(fs.readFileSync(PATH, 'utf8'))[NID]
const empties = []
function walk(obj, p) {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) { obj.forEach((v,i)=>{ if(v && typeof v==='object') walk(v,p+'['+i+']') }); return }
  for (const k of Object.keys(obj)) {
    const v=obj[k]
    if (v===null||v===undefined) empties.push(p+'.'+k+'=null')
    else if (typeof v==='string'&&v.trim()==='') empties.push(p+'.'+k+'=""')
    else if (typeof v==='object') walk(v,p+'.'+k)
  }
}
walk(entry.characters, 'characters')
walk(entry.powerSystem, 'powerSystem')
walk(entry.worldbuilding, 'worldbuilding')
walk(entry.keyPlots, 'keyPlots')
console.log('COUNT=' + empties.length)
empties.forEach(n => console.log('  ' + n))