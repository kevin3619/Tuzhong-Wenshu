// 🔥 第20轮单测：parseUserCharacterList 解析 + 逐槽绑定逻辑验证
// 复制自 route.ts（去除 TS 类型标注），与源码保持同一算法。

function parseUserCharacterDesign(text) {
  var full = String(text || '').trim()
  if (!full) return ''
  var sectionRe = /【人物设定】\s*([\s\S]*?)(?=\n【|\n\n\n|$)/m
  var sm = full.match(sectionRe)
  if (sm && sm[1] && sm[1].trim().length > 0) return sm[1].trim()
  var charKw = /^(主角|女主|女配|男配|反派|朋友|导师|师兄|师姐|师弟|师妹|男二|女二|配角|男一号|女一号|男二号|女二号|主要人物)\s*[:：]/
  var lines = full.split(/\r?\n/)
  var hits = []
  for (var li = 0; li < lines.length; li++) {
    var ln = String(lines[li] || '').trim()
    if (ln && charKw.test(ln)) hits.push(ln)
    else if (hits.length > 0 && ln && ln.length > 0 && !/【[^】]+】/.test(ln)) hits.push(ln)
    else if (hits.length > 0 && (!ln || /【[^】]+】/.test(ln))) break
  }
  return hits.join('\n').trim()
}

function parseUserCharacterList(text) {
  var full = String(text || '')
  if (!full.trim()) return []
  var anchor = full.indexOf('【人物设定】')
  var sec = anchor >= 0 ? full.slice(anchor) : (parseUserCharacterDesign(full) || full)
  var lines = sec.split(/\r?\n/)
  var out = []
  var seen = {}
  var curGroup = ''
  for (var i = 0; i < lines.length; i++) {
    var ln = String(lines[i] || '').trim()
    if (!ln || /^[-—=*#·]+$/.test(ln)) continue
    if (/^(第[一二三四五六七八九十百千零\d]+\s*[卷章回节部]|序章|楔子|尾声|番外|正文\s)/.test(ln)) continue
    var hm = ln.match(/^【([^【】]{2,12})】[:：]?$/)
    if (hm) { curGroup = hm[1]; continue }
    var hm2 = ln.match(/^(反派|主角|女主|女配|朋友|配角|盟友|忠臣|亲随|内廷|敌方|历史人物|其他人物|特殊盟友|武将盟友|忠臣盟友|配角阵营|敌方阵营|主角阵营)\s*[:：]$/)
    if (hm2) { curGroup = hm2[1]; continue }
    var name = ''
    var rest = ''
    var group = ''
    var m1 = ln.match(/^【([^【】]{2,8})】\s*(.*)$/)
    var m3 = ln.match(/^(?:\d+[.、)）]\s*)?([^【】（）()：:，,、。；\s]{2,6})\s*[（(]([^）)]{2,40})[)）]\s*[:：,，、]?\s*(.*)$/)
    var m2 = ln.match(/^([^【】（）()：:，,、。；\s]{2,6})\s*[-—–]{1,2}\s*(.+)$/)
    var m4 = ln.match(/^(?:主角|女主|女配|男配|反派|朋友|配角|导师)\s*[:：]\s*(.+)$/)
    if (m1) { name = m1[1].trim(); rest = m1[2] || '' }
    else if (m3) { name = m3[1].trim(); rest = '（' + m3[2] + '）' + (m3[3] || '') }
    else if (m2) { name = m2[1].trim(); rest = m2[2] || '' }
    else if (m4) {
      var body4 = m4[1]
      var nm4 = body4.match(/^([^，。:：;；【】（）()]{2,6})/)
      if (nm4) { name = nm4[1].trim(); rest = body4 }
      group = /^(主角)/.test(ln) ? '主角' : /^(女主|女配)/.test(ln) ? '女主' : /^(反派)/.test(ln) ? '反派' : '朋友'
    }
    if (!name) continue
    if (!/^[\u4e00-\u9fa5A-Za-z·]{2,6}$/.test(name)) continue
    if (/^(人物|角色|技能|设定|名单|阵容|一览|介绍|主要|阵营|本作|全书|第|卷|章)/.test(name)) continue
    if (seen[name]) continue
    seen[name] = true
    var tag = name + ' ' + rest + ' ' + curGroup
    if (!group) {
      if (/反派阵营|敌方阵营|敌对阵营|清军阵营|敌方|敌对/.test(tag)) group = '反派'
      else if (/永历阵营|主角阵营|友方阵营|我方阵营|友方|我方/.test(tag)) {
        group = (/女主|女配|皇后|皇妃|贵妃|宠妃|妃子|公主/.test(tag) && !/亲随|侍卫|护卫|太监|宦官|宫女|侍女|医官/.test(tag)) ? '女主' : '朋友'
      }
      else if (/女主|女配|皇后|皇妃|贵妃|宠妃|妃子|公主|后宫/.test(tag)) group = '女主'
      else if (/忠臣|亲随|盟友|挚友|好友|义士|归明|抗清|反正|义军|友军|友方/.test(tag)) group = '朋友'
      else if (/清军|清廷|后金|大顺|大西|叛|奸|寇|酋|虏|流寇|权奸|政敌|敌将|敌国|敌军|大敌|对手/.test(tag)) group = '反派'
      else if (/主角/.test(tag) && !/亲随|侍卫|护卫/.test(tag)) group = '主角'
      else group = '配角'
    }
    out.push({ name: name, desc: (rest || '').trim().slice(0, 120), group: group })
    if (out.length >= 60) break
  }
  return out
}

// ========== 测试样本：《永历中兴》风格人物设定 ==========
var sample = `【人物设定】
主角：朱由榔（永历帝，明室宗亲，主角阵营核心，性格坚韧果决）
【七位亲随】
【赵虎】—— 御前侍卫（永历阵营·主角亲随，武力高强，忠勇护主）
【王忠赐】—— 内侍随从（永历阵营·贴身亲随，机敏忠诚）
【朱落】—— 落魄宗室（永历阵营·亲随，身份隐秘）
【白柏年】—— 老幕僚（永历阵营·文书亲随，足智多谋）
【李铁山】—— 铁匠出身的护卫（永历阵营·亲随，力大无穷）
【孙思远】—— 游方郎中（永历阵营·随军医官亲随）
【周德全】—— 老船工（永历阵营·水路向导亲随）
【忠臣盟友】
瞿式耜（永历阵营·忠臣文官）：留守桂林，督师抗清，殉国而死
史可法（永历阵营·忠臣督师）：扬州死守，气节千秋
堵胤锡（永历阵营·忠臣文官）：联合大顺余部抗清
何腾蛟（永历阵营·湖广总督）：协调诸镇
【武将盟友】
李定国（大西军归明·统兵大将）：两蹶名王，威震天下
焦琏（永历阵营·地方武将）：广西总兵
吴万雄（永历阵营·水师统领）
【特殊盟友】
郑成功（东南抗清·海上雄主）：国姓爷
张同敞（永历阵营·忠臣文官）：瞿式耜挚友
【反派阵营】
丁魁楚（清军阵营·叛臣文官）：卖主求荣的前朝首辅
多铎（清军阵营·统兵大将）：扬州十日元凶
马士英（南明残余·权奸军阀）：拥兵自重
阮大铖（南明残余·奸佞文官）：构陷忠良
吴三桂（清军阵营·降将）：引清入关
【内廷】
玉竹（永历阵营·内廷宫女）：贴身侍奉
庞天寿（永历阵营·内廷司礼太监）：通晓宫务
【历史人物】
朱由崧（南明残余·弘光帝）
朱聿键（南明残余·隆武帝）
多尔衮（清军阵营·摄政王）
孔有德（清军阵营·降将藩王）
李成栋（清军阵营·降将，后反正）
张献忠（大西·流寇首领）
孙可望（大西·国主，跋扈枭雄）
阎应元（江阴·抗清义士）`

// ========== ① 解析测试 ==========
var roster = parseUserCharacterList(sample)
console.log('解析人数:', roster.length)
var groupCount = {}
roster.forEach(function (c) { groupCount[c.group] = (groupCount[c.group] || 0) + 1 })
console.log('分组统计:', JSON.stringify(groupCount))
console.log('名单预览:', roster.slice(0, 8).map(function (c) { return c.name + '(' + c.group + ')' }).join('、') + ' ...')

var byName = {}
roster.forEach(function (c) { byName[c.name] = c })
var cases = [
  ['朱由榔', '主角'], ['赵虎', '朋友'], ['王忠赐', '朋友'], ['白柏年', '朋友'],
  ['瞿式耜', '朋友'], ['史可法', '朋友'], ['堵胤锡', '朋友'],
  ['李定国', '朋友'], ['郑成功', '朋友'],
  ['丁魁楚', '反派'], ['多铎', '反派'], ['马士英', '反派'], ['阮大铖', '反派'],
  ['吴三桂', '反派'], ['多尔衮', '反派'], ['张献忠', '反派'], ['孙可望', '反派'],
  ['阎应元', '朋友'],
  ['玉竹', '朋友'], ['庞天寿', '朋友'],
]
var pass = 0, fail = 0
cases.forEach(function (t) {
  var got = byName[t[0]] ? byName[t[0]].group : 'MISSING'
  if (got === t[1]) pass++
  else { fail++; console.log('  ✗ ' + t[0] + ' 期望 ' + t[1] + ' 实际 ' + got) }
})
console.log('① 解析分组: PASS ' + pass + '/' + cases.length + (fail === 0 ? ' ✅' : ' ❌'))

// ========== ② 逐槽绑定模拟（single 模式 3 批） ==========
var needChain = {
  '主角': ['主角'], '女主': ['女主'], '女配': ['女配', '女主'],
  '反派': ['反派'], '朋友': ['朋友', '配角'], '配角': ['配角', '朋友'],
}
function simulateBatch(needs, existing) {
  var exSet = {}
  ;(existing || []).forEach(function (n) { exSet[n] = true })
  var pool = { '主角': [], '女主': [], '反派': [], '朋友': [], '配角': [] }
  roster.forEach(function (c) { if (!exSet[c.name]) pool[c.group].push(c) })
  var binds = []
  needs.forEach(function (n) {
    var chain = needChain[n] || ['配角', '朋友']
    var bound = null
    for (var i = 0; i < chain.length && !bound; i++) {
      if (pool[chain[i]] && pool[chain[i]].length > 0) bound = pool[chain[i]].shift()
    }
    binds.push(n + '→' + (bound ? bound.name : '(自创)'))
  })
  return binds
}

var presets = {
  single: [ // 批次1 核心5 + 批次2/3 各5（按前端 CHAR_ROSTER_PRESETS 配比 1,1,2,2,4,5）
    ['主角', '女主', '反派', '反派', '配角'],
    ['反派', '反派', '女配', '女配', '朋友'],
    ['朋友', '朋友', '朋友', '朋友', '配角'],
  ],
  dual: [
    ['主角', '女主', '女主', '反派', '反派'],
    ['反派', '反派', '反派', '女配', '朋友'],
    ['朋友', '朋友', '朋友', '配角', '配角'],
  ],
  harem: [
    ['主角', '女主', '女主', '反派', '反派'],
    ['反派', '反派', '女主', '配角', '配角'],
    ['配角', '配角', '配角', '配角', '配角'],
  ],
}
console.log('\n② 逐槽绑定模拟:')
var boundTotal = 0, slotTotal = 0
Object.keys(presets).forEach(function (mode) {
  var existing = []
  var seenBoundMode = {}
  var lines = presets[mode].map(function (needs, bi) {
    var binds = simulateBatch(needs, existing)
    binds.forEach(function (b) {
      slotTotal++
      var nm = b.split('→')[1]
      if (nm !== '(自创)') { boundTotal++; if (seenBoundMode[nm]) console.log('  ⚠️ ' + mode + ' 跨批重复绑定: ' + nm); seenBoundMode[nm] = true }
      existing.push(nm)
    })
    return '  批次' + (bi + 1) + ': ' + binds.join(' | ')
  })
  console.log('[' + mode + ']')
  lines.forEach(function (l) { console.log(l) })
})
console.log('绑定率: ' + boundTotal + '/' + slotTotal + '（剩余为自创补位）')
console.log(fail === 0 ? '\n全部验证通过 ✅' : '\n存在失败项 ❌')
