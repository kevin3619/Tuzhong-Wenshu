// 打印 protagonist / antagonist[0] / femaleLead 完整对象 + relationships[0]
const fs = require('fs')
const NID = 'd2010e15-03a4-4197-aca5-f572af6e9d94'
const PATH = 'D:/tuzhongwang/tuzhong/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/src/tuzhong-wenshu/.tuzhong-data/settings.json'
const c = JSON.parse(fs.readFileSync(PATH, 'utf8'))[NID]
console.log('===== protagonist =====')
console.log(JSON.stringify(c.characters.protagonist, null, 1).slice(0, 3000))
console.log('===== antagonist[0] =====')
console.log(JSON.stringify(c.characters.antagonists[0], null, 1).slice(0, 2600))