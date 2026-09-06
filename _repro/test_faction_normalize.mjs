// 用生产真实 13 个势力验证：合并去重 + 关系互认 + 空值补全 + 修仙模板词清洗
import fs from 'fs'
import url from 'url'
import { normalizeFactions, summarizeFactionReport } from '../src/tuzhong-wenshu/src/lib/faction-normalize.ts'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const raw = JSON.parse(fs.readFileSync(__dirname + '/_factions_real.json', 'utf-8'))
const { factions, report } = normalizeFactions(raw, { historicalGenre: true })

console.log('势力数：' + report.before + ' → ' + report.after)
console.log('摘要：' + summarizeFactionReport(report))
console.log('\n=== 合并明细 ===')
report.merged.forEach(function (m) { console.log('· ' + m.name + ' ← 吸收 ' + m.absorbed.join('、')) })
console.log('\n=== 势力引用修正 ===')
report.aliasFixed.slice(0, 12).forEach(function (a) { console.log('· ' + a.faction + ' [' + a.field + '] ' + a.from + ' → ' + a.to) })
console.log('\n=== 单边关系补全 ===')
report.symmetryFilled.slice(0, 12).forEach(function (s) { console.log('· ' + s.faction + ' [' + s.field + '] += ' + s.added) })

console.log('\n=== 校正后势力一览 ===')
factions.forEach(function (f) {
  console.log('【' + f.name + '】' + f.camp + ' 首领:' + (f.leader || '-'))
  console.log('   领地: ' + (f.territory || '空'))
  console.log('   友方: ' + ((f.allies || []).join('、') || '空') + '  敌方: ' + ((f.enemies || []).join('、') || '空'))
  console.log('   结局: ' + (f.fate || '空'))
  console.log('   底牌: ' + (f.trumpCard || '空'))
  console.log('   轨迹: ' + String(f.developmentTrajectory || '空').slice(0, 90))
})

const X = /护宗大阵|镇派|独门秘技|领地守护禁制|开派祖师|历代观主|掌教|血祭|心法|灵气|修真|修仙|飞升/
const xi = factions.filter(function (f) { return X.test(JSON.stringify(f)) })
const empty = factions.filter(function (f) { return !f.fate || !f.goal || !f.developmentTrajectory || !(f.enemies || []).length })
const dup = factions.map(function (f) { return f.name }).filter(function (n, i, a) { return a.indexOf(n) !== i })
console.log('\n=== 验收 ===')
console.log('残留重复势力名: ' + (dup.length ? dup.join('、') : '无'))
console.log('残留修仙模板词: ' + (xi.length ? xi.map(function (f) { return f.name }).join('、') : '无'))
console.log('仍含关键字段空值: ' + (empty.length ? empty.map(function (f) { return f.name }).join('、') : '无'))
