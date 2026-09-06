// 全盘搜索"朱由崧"与"40249ecb"，定位草稿真实存储
const fs = require('fs')
const path = require('path')
const dir = '/www/wwwroot/tuzhong-wenshu/.tuzhong-data'

function walk(d, hits, depth) {
  if (depth > 4) return
  let entries
  try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch (e) { return }
  for (const en of entries) {
    const full = path.join(d, en.name)
    if (en.isDirectory()) { walk(full, hits, depth + 1); continue }
    if (!/\.(json|db|txt)$/.test(en.name)) continue
    try {
      const buf = fs.readFileSync(full)
      if (buf.includes('朱由崧') || buf.includes('40249ecb')) {
        hits.push((en.name + ' [' + buf.length + 'B] contains 朱由崧=' + buf.includes('朱由崧') + ' id=' + buf.includes('40249ecb')))
      }
    } catch (e) {}
  }
}
const hits = []
walk(dir, hits, 0)
console.log('HITS', hits.length)
hits.forEach((h) => console.log(h))
// 也搜 app 运行时其它可能的 data 目录
for (const alt of ['/www/wwwroot/tuzhong-wenshu/data', '/www/wwwroot/tuzhong-wenshu/.data', '/root/.tuzhong-data', '/www/wwwroot/.tuzhong-data']) {
  if (fs.existsSync(alt)) {
    const h2 = []
    walk(alt, h2, 0)
    if (h2.length) { console.log('ALT', alt); h2.forEach((h) => console.log('  ', h)) }
  }
}