// 临时：解析本地 .tuzhong-data JSON，提取《永历中兴》各环节数据结构
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, 'src', 'tuzhong-wenshu', '.tuzhong-data')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea' // 永历中兴

function load(name) {
  const p = path.join(ROOT, name)
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return 'ERR:' + e.message }
}

console.log('=========== novels.json: find novel ===========')
const novels = load('novels.json')
if (Array.isArray(novels)) {
  const n = novels.find(x => x.id === NID) || novels.find(x => (x.title||'').includes('永历'))
  console.log('novel:', JSON.stringify(n ? {id:n.id,title:n.title,status:n.status,keys:Object.keys(n)} : 'NOT FOUND', null, 1))
} else {
  console.log('novels type =', typeof novels, Array.isArray(novels) ? 'array' : Object.keys(novels||{}).length)
}

console.log('\n=========== settings.json structure ===========')
const settings = load('settings.json')
function summarize(obj, depth, maxArr) {
  if (obj === null || obj === undefined) return String(obj)
  if (Array.isArray(obj)) {
    if (obj.length===0) return '[]'
    const sample = summarize(obj[0], depth+1)
    return `Array(${obj.length})[${sample}]`
  }
  if (typeof obj === 'object') {
    const ks = Object.keys(obj)
    const head = ks.slice(0, maxArr||8).map(k => `${k}:${summarize(obj[k], depth+1)}`).join(', ')
    return `{${head}${ks.length>(maxArr||8)?', ...'+(ks.length-(maxArr||8))+' more':''}}`
  }
  const s = String(obj)
  return s.length>40 ? s.slice(0,40)+'…' : s
}
console.log('top keys:', Object.keys(settings).slice(0,20))
// find 永历 in settings
function findNovel(obj, pathStr, found) {
  if (!obj || typeof obj !== 'object') return
  if (obj.id === NID || (obj.title && String(obj.title).includes('永历'))) { found.push(pathStr); }
  const ks = Object.keys(obj)
  for (const k of ks.slice(0,60)) {
    if (k==='stories'||k==='novels'||k==='drafts'||k==='works') { /* dive */ }
    findNovel(obj[k], pathStr+'.'+k, found)
  }
}
const found = []
findNovel(settings, 'settings', found)
console.log('永历 paths found in settings.json:', found.slice(0,10))

console.log('\n=========== relationships.json ===========')
const rel = load('relationships.json')
console.log('type:', Array.isArray(rel)?'array':'object', Array.isArray(rel)?rel.length:'', typeof rel==='object'?Object.keys(rel).slice(0,10):'')

console.log('\n=========== volumes.json ===========')
const vol = load('volumes.json')
console.log('type:', Array.isArray(vol)?'array('+vol.length+')':'object', typeof vol==='object'&&!Array.isArray(vol)?Object.keys(vol).slice(0,10):'')

console.log('\n=========== characters.json ===========')
const ch = load('characters.json')
console.log('type:', Array.isArray(ch)?'array('+ch.length+')':'object', typeof ch==='object'&&!Array.isArray(ch)?Object.keys(ch).slice(0,10):'')