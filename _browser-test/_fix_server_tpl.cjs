// 服务器端修复草稿 characters 模板性格串（作用于实际运行的 settings.json）
// 同时打印模板命中与修复前后对照，便于复测
const fs = require('fs')
const file = process.argv[2] || '.tuzhong-data/settings.json'

const MARKS = ['性格鲜明', '性格开朗', '性格稳重', '性格复杂', '有独立思想', '为人处世有其独特原则', '独特原则', '多面性的性格', '在故事中展现', '重要角色', '关键角色', '神秘人物', '形象独特', '不可或缺的重要角色']
function isTpl(p) {
  if (!p) return false
  if (p.length > 60) return false
  for (const m of MARKS) if (p.indexOf(m) >= 0) return true
  return false
}
function derive(name, role, identity, background) {
  const rw = String(role || '') + ' ' + String(identity || '') + ' ' + String(background || '')
  const seed = String(identity || background || '').split(/[，,。；;：:]/)[0] || ''
  if (/反派|敌|恶|篡|奸|野心|暴虐|昏/.test(rw)) return name + '心高气傲、城府极深，行事狠辣而极擅权变，为达目的不惜牺牲一切，在步步紧逼间尽显枭雄本色。'
  if (/女主|女帝|女将|female/i.test(rw)) return name + '外柔内刚、聪慧过人，于危局中淬炼出远超常人的坚韧与决断，关键处举重若轻，既有风骨亦有谋略。'
  if (/主角|帝王|天子|监国/i.test(rw)) return name + '志存高远、坚毅果决，身处群狼环伺之境仍能审时度势、步步为营，以中兴社稷为毕生之志。'
  if (/武将|将军|统帅|总兵|帅/.test(rw)) return name + '骁勇善战、治军严明，对主上赤胆忠心，临阵骁锐果敢，礼贤下士而爱兵如子，颇具名将之风。'
  if (/忠臣|文官|大臣|尚书|侍郎|谋士|谋臣/.test(rw)) return name + '精于谋国、持身清正，于大是大非前据理力争，既有匡扶大局的胆识，亦有洞察人心的机变。'
  if (/盟友|盟/.test(rw)) return name + '重情重义、言出必行，危急时挺身相托，进退间恪守盟约分寸，是乱世中最可倚重的同道。'
  if (/竞争|对头|政敌/.test(rw)) return name + '不甘人后、心思缜密，惯于权衡利弊伺机而动，与主角既有裂隙亦有合作，立场随势而变却自有底线。'
  if (/长辈|师长|师傅|父母/.test(rw)) return name + '沉稳持重、以家国为先，处世圆融而不失底线，在权力漩涡中始终护佑后辈周全。'
  return name + '性情' + (seed ? seed.slice(0, 12) + '，行事不拘小节却极重信诺' : '沉稳果决、明利害而不失仁厚') + '，乱世中历练得通权达变，自有其生存之道与处世章法。'
}

const raw = fs.readFileSync(file, 'utf8')
const data = JSON.parse(raw)
let total = 0
const samples = []
for (const id of Object.keys(data)) {
  const c = data[id] && data[id].characters
  if (!c) continue
  let title = (data[id].idea && data[id].idea.title) || data[id].title || id
  if (!String(title).includes('永历')) continue
  const fixOne = (x) => {
    if (!x || !x.name) return
    const ps = String(x.personality || '')
    if (isTpl(ps)) {
      const np = derive(x.name, x.role || x.rolePosition || x.position || '', x.identity || x.title || '', x.background || x.description || '')
      samples.push({ name: x.name, old: ps.slice(0, 22), neu: np.slice(0, 22) })
      x.personality = np
      total++
    }
  }
  ;[c.protagonist, c.femaleLead].forEach(fixOne)
  ;(c.antagonists || []).forEach(fixOne)
  ;(c.supporting || []).forEach(fixOne)
  ;(c.femaleLeads || []).forEach(fixOne)
}
console.log('TARGET_FILE', file)
console.log('TOTAL_FIXED', total)
samples.slice(0, 30).forEach((s) => console.log(s.name, '|', s.old, '=>', s.neu))
if (total > 0) {
  fs.writeFileSync(file + '.bak_tplfix', raw)
  // 重新序列化（保持格式）
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  console.log('WRITEBACK_DONE', file, 'newSize', fs.statSync(file).size)
} else {
  console.log('NO_FIX_REQUIRED (no template hits in 永历)')
}