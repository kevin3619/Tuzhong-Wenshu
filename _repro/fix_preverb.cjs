// 修正 PRE_VERB 行的语法错误（上次编辑误留了 ") 收尾）
const fs = require('fs')
const p = 'src/tuzhong-wenshu/src/lib/character-normalize.ts'
let s = fs.readFileSync(p, 'utf-8')
const lines = s.split('\n')
let hit = -1
for (let i = 0; i < lines.length; i++) {
  if (lines[i].indexOf('const PRE_VERB = /[') === 0) { hit = i; break }
}
if (hit < 0) { console.error('PRE_VERB line not found'); process.exit(1) }
console.log('BEFORE:', lines[hit])
lines[hit] = 'const PRE_VERB = /[任为既即拜授封建迁擢加署判掌统率死战攻守降叛立称废杀诛灭破陷走逃薨崩卒殁蹙克折斩获擒囚缚贬谪配流戍屯驻镇牧知领守御征讨伐剿抚附身魂寄托假扮号自]/'
fs.writeFileSync(p, lines.join('\n'))
console.log('AFTER :', lines[hit])
