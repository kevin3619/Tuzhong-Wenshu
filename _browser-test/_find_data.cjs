// 查找永历中兴数据实际存储位置
const fs = require('fs')
const path = require('path')
const dir = '/www/wwwroot/tuzhong-wenshu/.tuzhong-data'
const files = fs.readdirSync(dir)
console.log('FILES', files.filter((f) => !/\.png|\.bak|\.md/.test(f)))
// 搜索所有 json 中含"永历"的文件
for (const f of files) {
  if (!f.endsWith('.json')) continue
  try {
    const buf = fs.readFileSync(path.join(dir, f), 'utf8')
    if (buf.includes('永历')) console.log('HAS_YONGLI =>', f, 'size', buf.length)
  } catch (e) {}
}
// settings.json 结构概要
try {
  const raw = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')
  console.log('settings.json size', raw.length)
  const s = JSON.parse(raw)
  if (Array.isArray(s)) {
    console.log('settings ARRAY len', s.length)
    s.slice(0, 5).forEach((x) => console.log('SET', x.novelId || x.id, 'title=', (x.title || x.bookTitle || x.idea?.title || x.lastStep || ''), 'lastStep=', x.lastStep))
  } else {
    console.log('settings keys', Object.keys(s).slice(0, 20))
  }
} catch (e) { console.log('settings err', e.message) }