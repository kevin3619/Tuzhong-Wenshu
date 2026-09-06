// 线上检视：读取 prod settings.json 中《永历中兴》(40249ecb...) 的完整结构，标记 null/空字段
const fs = require('fs')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const PATH = '/root/tuzhong-wenshu/.tuzhong-data/settings.json'
const settings = JSON.parse(fs.readFileSync(PATH, 'utf8'))
const entry = settings[NID]
if (!entry) { console.log('NO_ENTRY for', NID, '| available keys sample:', Object.keys(settings).slice(0,30)); process.exit(0) }

function isEmpty(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length===0) || (typeof v==='object' && v!==null && Object.keys(v).length===0)
}
const stats = { nulls: 0, empties: 0, total: 0, nodes: [] }
function walk(obj, p) {
  if (!obj || typeof obj !== 'object') { stats.total++; if (obj===null||obj===undefined) { stats.nulls++ } ; return }
  if (Array.isArray(obj)) {
    if (obj.length===0) { stats.total++; stats.empties++; stats.nodes.push(p+' = []') }
    obj.forEach((v,i)=>{ if (v && typeof v==='object') walk(v, p+'['+i+']') })
    return
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (v===null||v===undefined) { stats.nulls++; stats.nodes.push(p+'.'+k+' = null') }
    else if (typeof v === 'string' && v.trim()==='') { stats.empties++; stats.nodes.push(p+'.'+k+' = ""') }
    else if (Array.isArray(v) && v.length===0) { stats.empties++; stats.nodes.push(p+'.'+k+' = []') }
    else if (typeof v === 'object') walk(v, p+'.'+k)
  }
}
walk(entry, 'entry')
console.log('TOP_KEYS:', Object.keys(entry))
console.log('STATS:', JSON.stringify({nulls:stats.nulls, empties:stats.empties, total:stats.total, emptyNodes:stats.nodes.length}))
console.log('EMPTY_NODES:')
stats.nodes.forEach(n => console.log('  ' + n))