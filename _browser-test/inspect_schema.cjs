// 审视 chapters/volumes 结构与角色关键对象结构
const fs = require('fs')
const NID = 'd2010e15-03a4-4197-aca5-f572af6e9d94'
const PATH = 'D:/tuzhongwang/tuzhong/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/src/tuzhong-wenshu/.tuzhong-data/settings.json'
const entry = JSON.parse(fs.readFileSync(PATH, 'utf8'))[NID]
console.log('===== chapters object =====')
console.log(JSON.stringify(entry.chapters, null, 1).slice(0, 2500))
console.log('===== keyPlots (驱动卷) =====')
console.log('keyPlots keys=', Array.isArray(entry.keyPlots) ? entry.keyPlots.map(p => Object.keys(p||{})) : Object.keys(entry.keyPlots||{}))
console.log(JSON.stringify(entry.keyPlots, null, 1).slice(0, 2000))
console.log('===== outline =====')
console.log('outline type=', Array.isArray(entry.outline)?'arr':'obj')
console.log(JSON.stringify(entry.outline, null, 1).slice(0, 1500))