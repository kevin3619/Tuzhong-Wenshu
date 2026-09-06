// 线上《永历中兴》全字段修复：填空值 + 替换模板占位。服务器端直接操作 settings.json（已备份）。
const fs = require('fs')
const path = process.argv[2] || '/root/tuzhong-wenshu/.tuzhong-data/settings.json'
const NID = process.argv[3] || '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const data = JSON.parse(fs.readFileSync(path, 'utf8'))
const e = data[NID]
if (!e) { console.log('NID_NOT_FOUND'); process.exit(1) }

const has = v => !(v === undefined || v === null || (typeof v === 'string' && String(v).trim() === ''))
const nonempty = (s, fb) => has(s) ? String(s).trim() : fb
const clean = s => has(s) ? String(s) : ''
const filled = {}
const bump = k => { filled[k] = (filled[k] || 0) + 1 }
const today = new Date().toISOString().split('T')[0]

const TPL_MARKS = ['性格鲜明','性格开朗','性格稳重','性格复杂','有独立思想','为人处世有其独特原则','独特原则','多面性的性格','在故事中展现','重要角色','关键角色','神秘人物','形象独特','不可或缺的重要角色','作为重要角色在剧情中发挥关键作用','与主角的关系推动故事','此角色','本角色']
const isTplString = s => typeof s === 'string' && s.length <= 80 && TPL_MARKS.some(m => s.indexOf(m) >= 0)

// 实力阶梯（从大纲阶段派生）
let powLadder = []
if (e.outline && Array.isArray(e.outline.stages)) powLadder = e.outline.stages.map(s => s && has(s.powerLevel) ? String(s.powerLevel).replace(/[。，、].*$/, '').trim() : '').filter(Boolean)

function derivePersonality(nm, role, identity, background, camp) {
  const rw = String(role || '') + ' ' + String(camp || '') + ' ' + String(identity || '') + ' ' + String(background || '')
  if (/反派|敌|恶|篡|奸|野心|暴虐|昏|清军|清廷|满清/.test(rw)) return nm + '心高气傲、城府极深，行事狠辣而极擅权变，为达目的不择手段，是主角中兴之路上绕不开的强敌'
  if (/女主|女帝|女将|female|皇后|太后|公主|妃/.test(rw)) return nm + '外柔内刚、聪慧过人，于风雨飘摇的乱世中淬炼出远超常人的坚韧与见识，堪为中兴之贤助'
  if (/主角|永历|南明|明室|帝王/.test(rw)) return nm + '身负中兴重担，沉稳果决、明利害而不失仁厚，于危局中方显守正之志'
  return nm + '阅历世事、机敏圆融，乱世中自有安身立命之道，与主角同心，乐于共复江山'
}
function deriveHidden(nm, role, identity, background) {
  const rw = String(role || '') + ' ' + String(identity || '') + ' ' + String(background || '')
  if (/反派|敌|清/.test(rw)) return nm + '心事深藏于权谋表相之下，为立足乱世不惜投身大潮，亦有旁人无从窥见的执着与隐衷'
  if (/妃|后|太后|公主|女主/.test(rw)) return nm + '看似深居内宠，实则胸藏机变，于暗中守护所珍视之人，是推动局势的隐线'
  return nm + '明面上足智多谋、妥帖周全，暗地里却早已窥见大局走向，藏着不为人知的抱负与底牌'
}
function deriveContra(nm, role, identity, background) {
  const rw = String(role || '') + ' ' + String(identity || '') + ' ' + String(background || '')
  if (/反派|敌|清/.test(rw)) return '表面从容不迫、投赞成礼，内里却权衡利害、别藏机锋，忠奸之相难辨'
  return '表面沉着自持、不露声色，内里却重情重义，为大业隐忍包容，于关键处方显担当'
}

// ========== characters ==========
if (e.characters) {
  const CH = e.characters
  if (CH._harem === null || CH._harem === undefined) { CH._harem = []; bump('_harem') }
  if (!CH.femaleLeads) CH.femaleLeads = []
  const all = []
  const add = o => { if (o && typeof o === 'object' && has(o.name)) all.push(o) }
  add(CH.protagonist); add(CH.femaleLead); add(CH.antagonist)
  ;(CH.antagonists || []).forEach(add); (CH.supporting || []).forEach(add); (CH.femaleLeads || []).forEach(add)

  all.forEach(c => {
    const nm = clean(c.name)
    const role = clean(c.role || c.roleType || c.rolePosition)
    const camp = clean(c.camp)
    const identity = clean(c.identity)
    const background = clean(c.background)
    // 模板串替换
    if (isTplString(clean(c.personality))) { c.personality = derivePersonality(nm, role, identity, background, camp); bump('personality') }
    const ht = clean(c.hiddenTraits)
    if (isTplString(ht) || /以.*示人|外表.*性格鲜明|秘密与不为人知/.test(ht)) { c.hiddenTraits = deriveHidden(nm, role, identity, background); bump('hiddenTraits') }
    const ct = clean(c.contradiction)
    if (isTplString(ct) || /表面从容不迫/.test(ct)) { c.contradiction = deriveContra(nm, role, identity, background); bump('contradiction') }
    // job
    if (!has(c.job)) {
      const ctx = identity + ' ' + background + ' ' + clean(c.rolePosition)
      if (/皇帝|监国|称帝|天子|帝王/.test(ctx)) c.job = '明朝皇帝（永历朝）'
      else if (/皇后|太后|公主|贵妃|妃/.test(ctx)) c.job = '后宫眷属'
      else if (/总督|巡抚|尚书|大学士|总兵|参将|副将|都督|提督|锦衣|知府|知县|参政|布政/.test(ctx)) c.job = ctx.replace(/[。，、].*$/, '').slice(0, 20)
      else if (/清|满/.test(ctx) || /反派|敌/.test(role)) c.job = /清|满/.test(ctx) ? '清廷要员' : '反派权臣'
      else if (/主角/.test(role)) c.job = '永历朝核心人物'
      else if (/盟|抗清|名将|大将|将领/.test(ctx)) c.job = '抗清重臣名将'
      else c.job = '朝臣武弁'
      bump('job')
    }
    if (!has(c.goal)) {
      const ctx = identity + ' ' + background + ' ' + clean(c.motivation)
      if (/反派|敌/.test(role) || /清|满/.test(ctx) || /野心|篡/.test(ctx)) c.goal = /清|满/.test(ctx) ? '助清剪灭南明余烬，博取从龙之功' : '倾轧忠良、把持朝纲，处心积虑打压中兴力量'
      else if (/女主|女帝|皇后|太后|公主/.test(role)) c.goal = '辅佐帝王中兴，护佑家国周全，与主角同心共渡时艰'
      else if (/主角/.test(role)) c.goal = '统合抗清力量，光复大明江山，开创永历中兴盛世'
      else if (/总督|巡抚|总兵|参将|副将|都督|提督|大将|将军|将领/.test(ctx)) c.goal = '整军经武、廓清贼氛，为中兴大业开疆固本'
      else if (/尚书|大学士|侍郎|参政|布政|知府|知县/.test(ctx)) c.goal = '辅弼朝纲、肃清党争，助永历朝政归于清明'
      else c.goal = '于乱世中为中兴大业贡献力量，求取功名前程'
      bump('goal')
    }
    // arcNodes powerLevel
    if (Array.isArray(c.arcNodes)) {
      c.arcNodes.forEach((n, i) => {
        if (n && !has(n.powerLevel)) {
          const st = nonempty(n.stage, n.phase) || clean(n.title)
          if (/巅峰|超脱|结局|最终|大成/.test(st)) n.powerLevel = /反派|敌/.test(role) ? '实力臻于化境，足与主角终极对决' : '已臻此界顶点，无人能及'
          else if (/起步|初生|初窥|初期|白身/.test(st)) n.powerLevel = /反派|敌/.test(role) ? '初具锋芒，尚存忌惮' : '白身微末，蓄势待发'
          else if (powLadder[i]) n.powerLevel = powLadder[i]
          else n.powerLevel = /反派|敌/.test(role) ? '权谋实力随剧情稳步攀升' : '随剧情推进稳步精进，渐成中兴栋梁'
          bump('arcNodes.pow')
        }
      })
    }
  })
}

// ========== powerSystem ==========
if (e.powerSystem) {
  const w = e.powerSystem.worldPowerSystem
  if (w) {
    if (!has(w.rules)) { w.rules = nonempty(e.worldbuilding && (e.worldbuilding.history || e.worldbuilding.era), '以社稷权柄、军功战勋、历史国运为核心的实力构成。官爵军职、民心威望、火器军备与天命气运共同决定各方在明清鼎革大局中的分量与话语权'); bump('ps.rules') }
    if (!Array.isArray(w.elements) || w.elements.length === 0) { w.elements = ['官爵军职', '军功战勋', '民心威望', '火器军备', '天命气运']; bump('ps.elements') }
  }
  const ensureEv = o => { if (o && Array.isArray(o.evolutionNodes) && o.evolutionNodes.length === 0) { o.evolutionNodes = ['初窥门径', '稳步精进', '登峰造极']; bump('ps.evolutionNodes') } }
  ensureEv(e.powerSystem.protagonistAbility)
  if (Array.isArray(e.powerSystem.protagonistAbilities)) e.powerSystem.protagonistAbilities.forEach(ensureEv)
}

// ========== factions ==========
if (e.factions && Array.isArray(e.factions.factions)) {
  e.factions.factions.forEach(f => {
    const fname = clean(f.name)
    const fdesc = clean(f.description)
    const fgoals = clean(f.goals || f.coreGoal)
    const ftype = clean(f.type || f.category)
    const hostile = /清|敌|反派|鞑|虏/.test(fname + ftype + fdesc + fgoals)
    const allied = /盟|明|永历南|明朝|南明|忠/.test(fname + ftype)
    if (!has(f.territory)) { f.territory = /朝廷|皇室|中央|帝/.test(fname) ? '形胜之地（两广云贵勾连呼应，合江南旧疆为周旋之域）' : /军|军团|集团/.test(fname) ? '驻地扼要，控扼水陆咽喉' : /教|派|门/.test(fname) ? '山门基地及信众辐辏之地' : '在明清鼎革犬牙交错之地自占地盘、互为进退'; bump('fac.territory') }
    if (!has(f.philosophy)) { f.philosophy = fname + '以「' + (fgoals ? fgoals.replace(/[。，、].*$/, '').slice(0, 10) : '图存争雄') + '」为宗旨，聚拢人心、结为团体，于乱世中自成一局'; bump('fac.philosophy') }
    if (!has(f.strengthTier)) { f.strengthTier = hostile ? 'S级（一方强敌，势焰正盛）' : allied ? 'A级（中兴基石，举足轻重）' : 'B级（地方势力，尤为关键）'; bump('fac.strengthTier') }
    if (!has(f.historyGrudges)) { f.historyGrudges = '夹在南明与满清之间多年，与' + (hostile ? '反清复明之士' : '敌对阵营') + '积下兵戈仇怨，恩怨纠葛绵延至今'; bump('fac.historyGrudges') }
    if (!has(f.relationToProtagonist)) { f.relationToProtagonist = hostile ? '与主角阵营互为敌忾，明争暗斗不断' : allied ? '与主角结盟共襄中兴大业，互为倚重' : '与主角若即若离，既合作又警惕'; bump('fac.relationToProtagonist') }
    if (!Array.isArray(f.members) || f.members.length === 0) { const cand = []; const CH = e.characters || {}; [CH.protagonist, CH.femaleLead, CH.antagonist].concat(CH.antagonists || [], CH.supporting || [], CH.femaleLeads || []).forEach(g => { if (g && g.name && (clean(g.camp).indexOf(fname.slice(0, 2)) >= 0 || fname.indexOf(g.name.slice(0, 2)) >= 0)) cand.push(clean(g.name)) }); f.members = cand.length ? cand : ['举足轻重的栋梁人物']; bump('fac.members') }
    if (!Array.isArray(f.flagshipFigures) || f.flagshipFigures.length === 0) { const CH = e.characters || {}; const each = [CH.protagonist, CH.femaleLead, CH.antagonist].concat(CH.antagonists || [], CH.supporting || []).map(g => g && g.name ? clean(g.name) : '').filter(Boolean); f.flagshipFigures = each.length ? each.slice(-2) : ['核心要员']; bump('fac.flagship') }
    if (!Array.isArray(f.allies) || f.allies.length === 0) { f.allies = hostile ? [] : ['永历朝廷、明朝遗臣']; bump('fac.allies') }
    if (!Array.isArray(f.enemies) || f.enemies.length === 0) { f.enemies = hostile ? ['永历朝廷、明朝遗臣'] : ['满清、清廷鹰犬']; bump('fac.enemies') }
    if (!Array.isArray(f.coreResources) || f.coreResources.length === 0) { f.coreResources = ['土地钱粮'].concat(/军|军团/.test(fname) ? ['火器军械'] : ['人丁甲兵']); bump('fac.resources') }
    if (!Array.isArray(f.internalFactions) || f.internalFactions.length === 0) { f.internalFactions = []; bump('fac.internal') }
  })
}

// ========== relationships ==========
if (e.relationships && Array.isArray(e.relationships.relationships)) {
  e.relationships.relationships.forEach(r => {
    const a = nonempty(r.personA, r.from) || '此方'
    const b = nonempty(r.personB, r.to) || '彼方'
    const typy = clean(r.relationshipType || r.type)
    const desc = clean(r.description)
    const isDj = /敌|对立|仇|对抗|交锋|争|反/.test(typy + desc)
    if (!has(r.deepConflict)) { r.deepConflict = isDj ? a + '与' + b + '立场水火不容，围绕权位与信念冲突不断升级，每一次交锋都刺向对方软肋，恩怨与利益纠葛令矛盾难以化解' : a + '与' + b + '虽走近彼此，却因立场与过往各有难言的留白，暗藏的情感与利害在平静下持续发酵，终将在关键抉择处引爆矛盾'; bump('rel.deepConflict') }
    ;['impactOnPlot', 'plotInfluence'].forEach(k => { if (isTplString(clean(r[k]))) { r[k] = isDj ? a + '与' + b + '的对抗贯穿始终，构成主角中兴路上的主要阻力' : a + '与' + b + '的纽带对时局和主角的进退产生深远影响'; bump('rel.' + k) } })
  })
}

// ========== synopsis ==========
if (e.synopsis) {
  const idea = e.idea || {}
  const title = nonempty(idea.title, clean(e.title) || '永历中兴')
  const one = clean(e.synopsis.brief || e.synopsis.synopsis || idea.theme || '')
  const base = one ? one.replace(/[。，、；;].*$/, '') : ''
  if (!has(e.synopsis.openingHook)) { e.synopsis.openingHook = '乱世之中，大明气数垂危，永历君臣困守一隅，大厦将倾之际，中兴之主自绝境走出。' + base; bump('syn.opening') }
  if (!has(e.synopsis.goldenQuote)) { e.synopsis.goldenQuote = title + '，当兴万世之业，还我大明山河'; bump('syn.goldenQuote') }
  if (!has(e.synopsis.coreGoldenQuote)) { e.synopsis.coreGoldenQuote = '山河未倾，志气未灭；帝王之业，必由中兴而生'; bump('syn.coreGoldenQuote') }
  if (!has(e.synopsis.fanqieVersion)) { e.synopsis.fanqieVersion = '大明末路，永历帝于绝境中奋起：外御强虏，内除奸佞，一纸丹书，定鼎中兴。' + base; bump('syn.fanqie') }
  if (!has(e.synopsis.qidianVersion)) { e.synopsis.qidianVersion = '穿越乱世、金手指加身的永历主角，翻云覆雨间逆转南明败局，成就一代中兴帝王。' + base; bump('syn.qidian') }
  if (!has(e.synopsis.targetReaderProfile)) { e.synopsis.targetReaderProfile = '偏好历史争锋、权谋智斗与热血逆袭的读者'; bump('syn.target') }
  if (!Array.isArray(e.synopsis.suspenseSetup) || e.synopsis.suspenseSetup.length === 0) { e.synopsis.suspenseSetup = ['永历朝廷能否在满清铁骑下撑过存亡之秋', '中兴大业背后潜伏的内鬼与暗流', '主角身世与气运的终极谜底']; bump('syn.suspense') }
}

// ========== idea.keywords ==========
if (e.idea) {
  if (!Array.isArray(e.idea.keywords) || e.idea.keywords.length === 0) {
    const kw = (clean(e.idea.theme) || clean(e.idea.concept) || '南明永历中兴').split(/[\s,，、；;]+/).map(s => s.trim()).filter(s => s && s.length >= 2).slice(0, 6)
    e.idea.keywords = kw.length ? kw : ['永历', '南明', '中兴', '抗清']
    bump('idea.keywords')
  }
}

// ========== worldbuilding.historicalEpochs ==========
if (e.worldbuilding) {
  if (!Array.isArray(e.worldbuilding.historicalEpochs) || e.worldbuilding.historicalEpochs.length === 0) {
    const wb = e.worldbuilding
    e.worldbuilding.historicalEpochs = [
      { name: '明室倾颓', period: '明清鼎革之际', desc: nonempty(wb.history, wb.era) || '大明倾覆、清军入关，南明诸帝走马更迭', createdAt: today },
      { name: '永历中兴', period: '本作主线', desc: '永历帝统合抗清力量，力图中兴大明', createdAt: today }
    ]
    bump('wb.epochs')
  }
}

// ========== outline.triRacePowerLevels ==========
if (e.outline) {
  if (!Array.isArray(e.outline.triRacePowerLevels) || e.outline.triRacePowerLevels.length === 0) {
    e.outline.triRacePowerLevels = (powLadder.length ? powLadder : ['白身微末', '州府道台', '一方大员', '天下至尊']).map((p, i) => ({ tier: '第' + (i + 1) + '境', name: p, desc: '乱世实力层次' }))
    bump('out.triRace')
  }
}

// ========== keyPlots volumes shuangPoints 空位 ==========
if (e.keyPlots && Array.isArray(e.keyPlots.volumes)) {
  e.keyPlots.volumes.forEach(v => {
    if (Array.isArray(v.shuangPoints)) v.shuangPoints.forEach((sp, i) => { if (!has(sp)) { v.shuangPoints[i] = '本卷剧情推向「' + (clean(v.title || v.name || v.coreObjective) || ('第' + (i + 1) + '阶段')) + '」时的关键爽点高潮'; bump('kp.shuang') } })
  })
}

// ========== chapters volumes keyPlots 空数组 ==========
if (e.chapters && Array.isArray(e.chapters.volumes)) {
  e.chapters.volumes.forEach(v => {
    if (!Array.isArray(v.keyPlots) || v.keyPlots.length === 0) {
      v.keyPlots = Array.isArray(v.keyPlots) ? v.keyPlots : []
      const t = clean(v.coreObjective || v.summary || v.name || '')
      v.keyPlots.push((t ? '推进「' + t.replace(/[。，、].*$/, '').slice(0, 20) + '」的关键剧情' : '推进本卷主线剧情的关键节点'))
      bump('ch.keyPlots')
    }
  })
}

fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
console.log('FIXED', JSON.stringify(filled))
console.log('SIZE_KB', Math.round(fs.statSync(path).size / 1024))