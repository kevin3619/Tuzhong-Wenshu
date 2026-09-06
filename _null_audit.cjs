// 核查线上《永历中兴》空值字段是否已修复：按环节统计 null/空，并重点打印问题字段
const fs = require('fs')
const PATH = '/www/wwwroot/tuzhong-wenshu/.tuzhong-data/settings.json'
const settings = JSON.parse(fs.readFileSync(PATH, 'utf8'))
// 找标题含"永历"的条目
let nid = null, entry = null
for (const k of Object.keys(settings)) {
  if (JSON.stringify(settings[k]).indexOf('永历') >= 0) { nid = k; entry = settings[k]; break }
}
if (!entry) { console.log('NO_ENTRY 永历 in settings.json keys count=', Object.keys(settings).length); process.exit(0) }
console.log('NID=', nid)
console.log('TOP_KEYS=', Object.keys(entry))

function isEmpty(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && v !== null && Object.keys(v).length === 0)
}
let totalNull = 0, totalEmpty = 0, allNodes = []
function walk(obj, p, section) {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    if (obj.length === 0) { totalEmpty++; allNodes.push({ sec: section, p: p + ' = []' }) }
    obj.forEach((v, i) => { if (v && typeof v === 'object') walk(v, p + '[' + i + ']', section) })
    return
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (v === null || v === undefined) { totalNull++; allNodes.push({ sec: section, p: p + '.' + k + ' = null' }) }
    else if (typeof v === 'string' && v.trim() === '') { totalEmpty++; allNodes.push({ sec: section, p: p + '.' + k + ' = ""' }) }
    else if (Array.isArray(v) && v.length === 0) { totalEmpty++; allNodes.push({ sec: section, p: p + '.' + k + ' = []' }) }
    else if (typeof v === 'object') walk(v, p + '.' + k, section)
  }
}
// 分组统计：按一级节（volumes/world/powerSystem/characters/factions/...）
const secMap = {}
;['volumes', 'world', 'worldSetting', 'powerSystem', 'characters', 'factions', 'plot', 'chapterPlan', 'chapters'].forEach(sec => {
  const v = entry[sec]
  if (v === undefined) { secMap[sec] = 'ABSENT'; return }
  const before = { null: totalNull, empty: totalEmpty }
  walk(v, 'entry.' + sec, sec)
  secMap[sec] = { null: totalNull - before.null, empty: totalEmpty - before.empty }
})
// 其余顶层
const known = ['volumes', 'world', 'worldSetting', 'powerSystem', 'characters', 'factions', 'plot', 'chapterPlan', 'chapters', 'id', 'title', 'step', 'updatedAt']
const other = { null: 0, empty: 0 }
for (const k of Object.keys(entry)) {
  if (known.indexOf(k) >= 0) continue
  if (isEmpty(entry[k])) {
    if (entry[k] === null || entry[k] === undefined) other.null++
    else other.empty++
    allNodes.push({ sec: '(other)', p: 'entry.' + k })
  }
}
console.log('SECTION_STATS=' + JSON.stringify(secMap, null, 1))
console.log('OTHER_EMPTY=', JSON.stringify(other))
console.log('TOTAL: null=' + totalNull + ' empty=' + totalEmpty + ' combined=' + (totalNull + totalEmpty))
// 打印所有空节点
console.log('TOTAL_NODES=', allNodes.length)
const bySec = {}
allNodes.forEach(n => { bySec[n.sec] = (bySec[n.sec] || 0) + 1 })
console.log('EMPTY_BY_SECTION=', JSON.stringify(bySec))
// 重点问题字段明细
console.log('===== KEY PROBLEM FIELDS =====')
const probeKeys = ['job', 'goal', 'powerLevel', 'faction', 'relationship', 'personality', 'background', 'motivation', 'role', 'title', 'summary', 'name', 'realm', 'rank', 'value', 'rule', 'description', 'epoch', 'eraName', 'volumeTitle', 'volTitle']
allNodes.forEach(n => {
  const leaf = n.p.split('.').pop().replace(/\[.*/, '')
  if (probeKeys.indexOf(leaf) >= 0) console.log('  ' + n.sec + ' | ' + n.p)
})