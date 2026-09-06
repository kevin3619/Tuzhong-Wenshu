const fs = require('fs')
const path = '/www/wwwroot/tuzhong-wenshu/.tuzhong-data'
for (const f of fs.readdirSync(path)) {
  if (!f.endsWith('.json') || f.includes('.bak')) continue
  const fp = path + '/' + f
  const raw = fs.readFileSync(fp, 'utf8')
  const has = raw.includes('永历')
  console.log(f + ': 永历=' + has + ' size=' + raw.length)
  if (has) {
    // 找到包含永历的最顶层键
    try {
      const data = JSON.parse(raw)
      for (const k of Object.keys(data)) {
        const s = JSON.stringify(data[k])
        if (s.includes('永历')) console.log('   KEY=' + k + ' titleFn=' + (data[k] && data[k].title))
      }
    } catch (e) { console.log('   parse skip', e.message) }
  }
}