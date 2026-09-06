// 检查 settings.json 是否含草稿ID 40249ecb，以及永历相关存储
const fs = require('fs')
const raw = fs.readFileSync('.tuzhong-data/settings.json', 'utf8')
console.log('settings.json contains 40249ecb:', raw.includes('40249ecb'))
console.log('contains 永历:', raw.includes('永历'))
console.log('size', raw.length)
const s = JSON.parse(raw)
console.log('object keys', Object.keys(s).length)
// 每个key的title和id
for (const k of Object.keys(s)) {
  const v = s[k] || {}
  console.log('KEY', k, 'len', JSON.stringify(v).length)
  // 打印v的顶层键数
  console.log('  topKeys', Object.keys(v).slice(0, 8).join(','))
}