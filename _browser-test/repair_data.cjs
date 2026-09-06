// 一次性数据修复：永历中兴(d2010e15) settings.json 空值补全
// 用法: node repair_data.cjs [settings.json 路径] [novelId]  （默认本地永历）
// 确定性+幂等：只填空值，不覆盖已有内容
const fs = require('fs')
const NID = process.argv[3] || 'd2010e15-03a4-4197-aca5-f572af6e9d94'
const PATH = process.argv[2] ||
  'D:/tuzhongwang/tuzhong/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/src/tuzhong-wenshu/.tuzhong-data/settings.json'

const all = JSON.parse(fs.readFileSync(PATH, 'utf8'))
if (!all[NID]) { console.error('NID not found:', NID); process.exit(1) }
const e = all[NID]

const has = (v) => (v !== undefined && v !== null && String(v).trim() !== '')
const nonempty = (s, fb) => (has(s) ? String(s).trim() : fb)
let filledCount = 0
const log = []

// ---------- 角色修复 ----------
const chars = e.characters
if (chars) {
  // 实力递进参考（历史本文 bios，来自 outline.stages[].powerLevel）
  const powLadder = ((e.outline && e.outline.stages) || [])
    .map(s => (s && s.powerLevel && String(s.powerLevel).replace(/[。，、].*$/, '').trim()))
    .filter(Boolean)
  const powFb = powLadder.length ? powLadder : ['白身微末', '县丞知县', '州府道台', '方面大员', '封疆大吏', '一方霸主', '天下至尊']

  // 收集所有角色对象
  const allChars = []
  const pushChar = (o) => { if (o && typeof o === 'object' && o.name) allChars.push(o) }
  pushChar(chars.protagonist)
  pushChar(chars.femaleLead)
  if (Array.isArray(chars.femaleLeads)) chars.femaleLeads.forEach(pushChar)
  pushChar(chars.antagonist)
  if (Array.isArray(chars.antagonists)) chars.antagonists.forEach(pushChar)
  if (Array.isArray(chars.supporting)) chars.supporting.forEach(pushChar)

  allChars.forEach(c => {
    const nm = String(c.name || '')
    const role = String(c.role || c.rolePosition || '')
    const isZj = role.includes('主角'), isNz = role.includes('女主')
    const isFp = role.includes('反派'), isMengYou = role.includes('盟')
    const hist = !!(e.idea && /历史|明|清|帝王|王朝|朝廷|争霸|种田|架空历史/.test(String(e.idea.theme || e.idea.genre || e.idea.type || '')))
    const ctx = String(c.identity || c.background || c.motivation || '')

    // camp 阵营：先按身份文案反推，再按角色类型兜底
    if (!has(c.camp)) {
      if (/清军|清廷|清朝|满清/.test(ctx)) c.camp = '清军阵营（敌对）'
      else if (/永历|南明|明朝|明室/.test(ctx)) c.camp = '永历阵营（主角）'
      else if (isFp) c.camp = '敌对阵营（反派）'
      else if (isMengYou) c.camp = '主角阵营·盟友'
      else if (isZj || isNz) c.camp = '主角阵营·核心'
      else c.camp = '主角阵营'
      filledCount++; log.push(nm + '.camp')
    }

    // job 职业/职司
    if (!has(c.job)) {
      if (/皇帝|监国|称帝|天子|帝王/.test(ctx)) c.job = '明朝皇帝（永历朝）'
      else if (/妃|皇后|太后|公主/.test(ctx)) c.job = '后宫眷属'
      else if (/总督|巡抚|尚书|大学士|总兵|参将|副将|都督|锦衣|知府|知县|参政|布政/.test(ctx)) c.job = String(ctx).replace(/[。，、].*$/, '').slice(0, 20)
      else if (isFp) c.job = /清|满/.test(ctx) ? '清廷要员' : '反派权臣'
      else if (isZj) c.job = '永历朝核心人物'
      else c.job = '朝臣武弁'
      filledCount++; log.push(nm + '.job')
    }

    // birthplace 出生地
    if (!has(c.birthplace)) {
      c.birthplace = /桂林/.test(ctx) ? '广西桂林'
        : /辽东|山海关/.test(ctx) ? '辽东（山海关）'
        : /北京|京师/.test(ctx) ? '北直隶京师'
        : isZj ? '广西桂林桂王府' : '大明疆土'
      filledCount++; log.push(nm + '.birthplace')
    }

    // realmLevel 实力等级
    if (!has(c.realmLevel)) {
      c.realmLevel = isFp ? '权倾一方之枭雄'
        : isNz ? '深居内闱之女眷'
        : isZj ? '权倾朝野之帝王（超品）'
        : (isMengYou ? '一方将帅重臣' : '一方家臣将佐')
      filledCount++; log.push(nm + '.realmLevel')
    }

    // weapons 兵器/道具
    if (!has(c.weapons)) {
      const wfb = isFp ? '佩刀、铠甲、御赐兵器'
        : isNz ? '贴身佩饰、随身之物'
        : isZj ? '玉玺、佩剑、御赐冠冕'
        : '随身兵刃、符牌信物'
      c.weapons = (/佩刀|剑|刀|枪|弓|甲|玺|印|剑/.test(ctx)) ? wfb : wfb
      filledCount++; log.push(nm + '.weapons')
    }

    // experience 经历
    if (!has(c.experience)) {
      c.experience = nonempty(c.growthArc, nonempty(c.background, '在明清鼎革乱世中起伏历练'))
      filledCount++; log.push(nm + '.experience')
    }

    // socialNetwork 社交网络
    if (!has(c.socialNetwork)) {
      c.socialNetwork = isZj ? '核心班底、忠臣盟友、武将盟友、敌对势力多维交织'
        : isFp ? '与主角阵营对立，勾结清廷、拉拢降将'
        : isNz ? '与主角及后宫、亲族往来密切'
        : '与主角阵营密切关联，与相关势力互动'
      filledCount++; log.push(nm + '.socialNetwork')
    }

    // personalityOrigin / growthBackground 的空逗号清理
    if (c.personalityOrigin && String(c.personalityOrigin).trim() === ',') { c.personalityOrigin = nonempty(c.personality, nm + '性格根源与成长经历交织'); filledCount++; log.push(nm + '.personalityOrigin') }
    if (c.growthBackground && String(c.growthBackground).trim() === ',') { c.growthBackground = nonempty(c.background, nm + '于乱世中成长历练'); filledCount++; log.push(nm + '.growthBackground') }

    // arcNodes[].powerLevel
    if (Array.isArray(c.arcNodes)) {
      c.arcNodes.forEach((n, i) => {
        if (!n || typeof n !== 'object') return
        if (!has(n.powerLevel)) {
          const st = String(n.stage || n.phase || '')
          let pv = ''
          if (/巅峰|超脱|结局|最终/.test(st)) pv = isFp ? '实力臻于化境，足与主角终极对决' : '已臻此界顶点，无人能及'
          else if (/起步|初生/.test(st)) pv = isFp ? '初具锋芒，尚存忌惮' : '白身微末，蓄势待发'
          else if (powFb[i]) pv = powFb[i]
          else pv = isFp ? '权谋实力随剧情攀升' : '随剧情推进稳步精进'
          n.powerLevel = pv
          filledCount++; log.push(nm + '.arcNodes[' + i + '].powerLevel')
        }
      })
    }

    // 清理 _harem null
    if (c._harem === null || c._harem === undefined) { c._harem = []; filledCount++; log.push(nm + '._harem') }
  })

  // 顶层 characters._harem
  if (chars._harem === null || chars._harem === undefined) { chars._harem = []; filledCount++; log.push('characters._harem') }
}

// ---------- 力量体系 rules 修复 ----------
if (e.powerSystem && e.powerSystem.worldPowerSystem && !has(e.powerSystem.worldPowerSystem.rules)) {
  e.powerSystem.worldPowerSystem.rules = '以社稷权柄、军功战勋、历史国运为核心的实力构成。官爵军职、民心威望、火器军备与天命气运共同决定各方在明清鼎革大局中的分量与话语权。'
  filledCount++; log.push('powerSystem.worldPowerSystem.rules')
}

// ---------- 关系修复 ----------
const relRoot = e.relationships
if (relRoot && Array.isArray(relRoot.relationships)) {
  relRoot.relationships.forEach(r => {
    const pa = nonempty(r.personA, r.from), pb = nonempty(r.personB, r.to)
    const typ = nonempty(r.relationshipType || r.type, ''),
      desc = nonempty(r.description, ''), circle = nonempty(r.circle, '')
    const isZhudui = /主角/.test(pa + pb)
    const is敌 = /敌|对立|仇|对抗|p/.test(typ + desc)
    // 深度字段补全
    if (!has(r.deepConflict)) {
      r.deepConflict = is敌
        ? (pa + '与' + pb + '立场水火不容，围绕权位与信念冲突不断升级，每一次交锋都刺向对方软肋，恩怨与利益纠葛令矛盾难以化解')
        : (pa + '与' + pb + '虽走近彼此，却因立场与过往各有难言的留白，暗藏的情感与利害在平静下持续发酵，终将在关键抉择处引爆矛盾')
      filledCount++; log.push('relation.' + r.id + '.deepConflict')
    }
    if (!has(r.impactOnPlot)) {
      r.impactOnPlot = isZhudui
        ? '牵动主线用人的走向，每次波折都在动摇主角队伍的根基'
        : ('围绕' + pa + '·' + pb + '的联盟与摩擦，为中兴大业时松时紧地注入变数')
      filledCount++; log.push('relation.' + r.id + '.impactOnPlot')
    }
    if (!has(r.keyEvents)) {
      r.keyEvents = '相遇定交、重要波折、误解对峙、生死考验、关系升华（随剧情展开逐层推进）'
      filledCount++; log.push('relation.' + r.id + '.keyEvents')
    }
    if (!has(r.emotionChange)) {
      r.emotionChange = '由试探观望渐入信任，再历波折考验后愈显坚定（随剧情逐步演变）'
      filledCount++; log.push('relation.' + r.id + '.emotionChange')
    }
    if (!has(r.strength)) {
      r.strength = is敌 ? '壁垒分明、势均力敌且彼此戒备' : '互相信任、配合默契，患难中不断加深'
      filledCount++; log.push('relation.' + r.id + '.strength')
    }
    if (!has(r.evolutionCurve)) {
      r.evolutionCurve = is敌 ? '渐行渐远直至决裂对抗' : '由结识到共事，再生嫌隙与弥合，最终患难与共'
      filledCount++; log.push('relation.' + r.id + '.evolutionCurve')
    }
    if (!has(r.keyMoments)) {
      r.keyMoments = '临危相救、中盘分歧、大局抉择等关键节点'
      filledCount++; log.push('relation.' + r.id + '.keyMoments')
    }
    if (!has(r.plotInfluence)) {
      r.plotInfluence = is敌 ? '构成贯穿始终的对抗阻力，制约主角步伐' : '在军政大局与攻伐反复中发挥关键作用'
      filledCount++; log.push('relation.' + r.id + '.plotInfluence')
    }
  })
}

// ---------- 分卷章节修复 ----------
if ((!e.chapters || (Array.isArray(e.chapters.volumes) && e.chapters.volumes.length === 0)) && e.keyPlots && Array.isArray(e.keyPlots.volumes) && e.keyPlots.volumes.length) {
  const vols = e.keyPlots.volumes.map((v, vi) => ({
    id: 'vol-' + (vi + 1),
    volumeNumber: vi + 1,
    name: nonempty(v.title, v.name, '第' + (vi + 1) + '卷·中兴'),
    summary: nonempty(v.summary, v.coreObjective, '本卷推进中兴大业的关键转折'),
    coreObjective: nonempty(v.coreObjective, v.summary, '推进中兴大业关键阶段'),
    order: vi + 1,
    chapters: [],
    keyPlots: [nonempty(v.title, '')].filter(Boolean),
  }))
  // 均匀分配章节
  const totalCh = 60
  const base = Math.floor(totalCh / vols.length), rem = totalCh % vols.length
  let chSeq = 1
  const flatChapters = []
  vols.forEach((v, vi) => {
    const cnt = base + (vi < rem ? 1 : 0)
    for (let j = 0; j < cnt; j++) {
      const ch = {
        id: 'ch-' + (vi + 1) + '-' + (j + 1),
        title: v.name + '·第' + (j + 1) + '节',
        summary: '承接卷设，推进「' + v.summary.slice(0, 24) + '」的剧情发展',
        shuangPoints: [v.name + '·关键爽点'],
        hook: '章末悬念（随正文生成补全）',
        volume: vi + 1,
        chapterNumber: chSeq,
        wordCount: 0,
        status: 'pending',
      }
      v.chapters.push(ch)
      flatChapters.push(ch)
      chSeq++
    }
  })
  if (!e.chapters) e.chapters = {}
  e.chapters.volumes = vols
  e.chapters.chapters = flatChapters
  e.chapters.chapterCount = flatChapters.length
  e.chapters.totalWordCount = 0
  filledCount += vols.length + flatChapters.length
  log.push('chapters.volumes(' + vols.length + ') + chapters(' + flatChapters.length + ')')
}

fs.writeFileSync(PATH, JSON.stringify(all, null, 2), 'utf8')
console.log('FILLED=', filledCount)
console.log('SAMPLE=', log.slice(0, 40).join(', '))
console.log('DONE_PATH=', PATH)