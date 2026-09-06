// novels.json 各作品标题 + characters 模板
const fs = require('fs')
const j = JSON.parse(fs.readFileSync('.tuzhong-data/novels.json', 'utf8'))
console.log('novels count', Array.isArray(j) ? j.length : 'obj')
let list = Array.isArray(j) ? j : Object.values(j)
list.forEach((n, i) => {
  const t = n.title || n.name || n.bookTitle || n.idea?.title || ''
  console.log(i, 'id=', n.id, 'title=', t, 'lastStep=', n.lastStep, 'stt=', n.status)
  if (String(t).includes('永历')) {
    console.log('  >>> HAVE characters?', !!n.characters, 'keys', n.characters ? Object.keys(n.characters).slice(0, 10) : '-')
  }
})
// settings 对象 key 与有没有 title
const s = JSON.parse(fs.readFileSync('.tuzhong-data/settings.json', 'utf8'))
for (const k of Object.keys(s)) {
  const v = s[k] || {}
  console.log('SET', k, 'idea.title=', v.idea?.title || v.title || '', 'lastStep=', v.lastStep || '')
}