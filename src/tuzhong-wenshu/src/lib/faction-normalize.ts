/**
 * 势力设定规范化：合并重复势力、修关系引用、补齐空字段
 *
 * 背景（用户实测《永历中兴》）：分批生成时同一势力被按"阶段"重复创建——
 *   孙可望集团 / 孙可望集团（安龙） / 孙可望集团（流亡） 三条并存，
 *   瞿式耜集团、郑芝龙集团各两条；且 allies（友方势力）为空、fate 全空、
 *   enemies 里写的是"南明朝廷"而实际势力名是"南明永历朝廷"（引用对不上，前端点不开）。
 *
 * 本模块做四件事（全部确定性、离线、零 LLM 依赖）：
 *   1) 按"基名 + 首领"合并同势力，把阶段差异沉淀进 developmentTrajectory（发展轨迹），不丢信息
 *   2) 把 allies/enemies 里的别名解析成真实势力名（南明朝廷 → 南明永历朝廷）
 *   3) 关系互认：A 视 B 为敌/友，则 B 也应有 A，避免单边空值
 *   4) 结构性补空：fate / description / goal / relationshipWithProtagonist 等按阵营与已有字段推导
 */

export interface FactionNormalizeReport {
  merged: Array<{ name: string; absorbed: string[]; trajectory: string }>
  aliasFixed: Array<{ faction: string; field: string; from: string; to: string }>
  symmetryFilled: Array<{ faction: string; field: string; added: string }>
  filled: Array<{ faction: string; field: string; value: string }>
  before: number
  after: number
}

/** 去掉括号阶段注记与空白，得到势力基名：孙可望集团（安龙）→ 孙可望集团 */
export function factionBaseName(name: unknown): string {
  return String(name || '').replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '').trim()
}

/** 势力名的别名集合，用于把引用解析回真实势力名 */
function aliasSetOf(f: any): string[] {
  const out: string[] = []
  const base = factionBaseName(f.name)
  const full = String(f.name || '').trim()
  if (full) out.push(full)
  if (base) out.push(base)
  // 去尾缀的核心名：南明永历朝廷 → 南明永历 / 南明；郑芝龙集团 → 郑芝龙
  const core = base.replace(/(集团|朝廷|政权|军团|军|部|司|府|盟|会|党|派|国|朝|廷|行营|行在|水师|海军|舰队|公司|公会|商会|世家|宗|门|教|寺|院|台|省|州|府)$/, '')
  if (core && core.length >= 2) {
    out.push(core)
    // 再剥一层朝代/年号前缀：南明永历 → 永历 / 南明
    const core2 = core.replace(/^(南明|南朝|明|清|大西|大顺|东林|西厂|锦衣卫|郑氏|朱明|后金|满清|荷兰|蒙古|西藏|回部)+/, '')
    if (core2 && core2.length >= 2 && core2 !== core) out.push(core2)
  }
  return Array.from(new Set(out.filter(function (x) { return x && x.length >= 2 })))
}

function uniq(list: string[]): string[] {
  const seen: Record<string, boolean> = {}
  const out: string[] = []
  list.forEach(function (x) {
    const v = String(x || '').trim()
    if (!v || seen[v]) return
    seen[v] = true
    out.push(v)
  })
  return out
}

/** 取更"有内容"的字符串：优先更长、且不含占位词 */
function betterString(a: string, b: string): string {
  const x = String(a || '').trim(), y = String(b || '').trim()
  if (!x) return y
  if (!y) return x
  return y.length > x.length ? y : x
}

/** 从领地串里抽出地名（安龙（都城）、贵阳（粮仓） → 安龙、贵阳） */
function placesOf(territory: unknown): string[] {
  return String(territory || '')
    .split(/[、,，;；]+/)
    .map(function (s) { return s.trim() })
    .filter(Boolean)
}

/** 领地合并去重：同一地名只留一条（"安龙（都城）"优先于后出现的"安龙（基地）"） */
function uniqPlaces(list: string[]): string[] {
  const seen: Record<string, boolean> = {}
  const out: string[] = []
  list.forEach(function (p) {
    const key = String(p || '').replace(/[（(][^）)]*[）)]/g, '').trim()
    if (!key || seen[key]) return
    seen[key] = true
    out.push(String(p).trim())
  })
  return out
}

/** 取短语边界内的摘要，避免把"构建火器新军体系"截成"构建火" */
function clipPhrase(s: unknown, max = 14): string {
  const v = String(s || '').trim()
  if (!v) return ''
  if (v.length <= max) return v
  const cut = v.slice(0, max)
  const idx = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('、'), cut.lastIndexOf('；'), cut.lastIndexOf(' '))
  return idx >= 4 ? cut.slice(0, idx) : cut
}

function isPlaceholder(v: unknown): boolean {
  const s = String(v || '').trim()
  return !s || s.length < 4 || /基于本作|填写|待定|暂无|无$|^N\/A/i.test(s)
}

/**
 * 历史题材下的修仙/玄幻模板词清洗（实测势力字段里混进了"护宗大阵""镇派传承心法""开派祖师""历代观主"等）
 */
const FAC_XIANKXIA_MAP: Array<[RegExp, string]> = [
  [/护宗大阵/g, '护城工事'],
  [/镇派传承心法/g, '祖传练兵之法'],
  [/传承千年的独门秘技/g, '世代相传的独门技艺'],
  [/独门秘技/g, '独门技艺'],
  [/领地守护禁制/g, '世袭防务'],
  [/掌教研究员/g, '首领'],
  [/掌教/g, '首领'],
  [/开派祖师/g, '创立者'],
  [/历代观主/g, '历代首领'],
  [/观主/g, '首领'],
  [/掌门|宗主/g, '首领'],
  [/血祭召唤术/g, '死士夜袭'],
  [/血祭/g, '酷烈'],
  [/灵气|灵力|修真|修仙|飞升|渡劫|金丹|元婴|筑基/g, '根基'],
  [/功法/g, '成法'],
  [/法宝/g, '重器'],
  [/妖兽|灵兽/g, '猛兽'],
  [/宗门/g, '本军'],
  [/护宗/g, '护军'],
  [/心法/g, '要诀'],
]

function scrubXianxia(v: unknown): string {
  let s = String(v || '')
  FAC_XIANKXIA_MAP.forEach(function (p) { s = s.replace(p[0], p[1]) })
  return s
}

/** 残缺/套话模板判定：如"时期建立，传承多年，在历代首领经营下稳步发展…"（缺朝代前缀、纯套话） */
function isBrokenTemplate(v: unknown): boolean {
  const s = String(v || '').trim()
  if (!s) return true
  if (/^时期/.test(s)) return true
  if (/传承多年，在历代/.test(s)) return true
  if (/随主角成长而逐步恢复元气、重回巅峰$/.test(s)) return true
  return false
}

/** 用势力自身事实重写发展轨迹（不依赖 LLM，保证有内容且不串题材） */
function rewriteTrajectory(f: any): string {
  const name = factionBaseName(f.name) || '该势力'
  const leader = String(f.leader || '').trim()
  const place = placesOf(f.territory)[0] || '其辖地'
  const camp = String(f.camp || '')
  const goal = String(f.goal || '').trim()
  const head = name + (leader ? '（' + leader + '主之）' : '') + '起于' + place
  const mid = goal ? '以「' + clipPhrase(goal) + '」为纲' : '在乱世中先求自保、再图扩张'
  const tail = /己方|主角/.test(camp) ? '，随主角整军经武而脱胎换骨，终成中兴根基'
    : /敌/.test(camp) ? '，与主角由摩擦走向决战，最终被削平或收编'
      : /友/.test(camp) ? '，与主角结为唇齿，共渡危局后保全建制'
        : '，在各方拉锯中反复权衡，最终随大势定其去留'
  return head + '，' + mid + tail
}

/** 阵营推导的结局（fate）文案，避免整栏空值 */
function fateByCamp(f: any): string {
  const camp = String(f.camp || f.type || '')
  const goal = String(f.goal || '').trim()
  const name = factionBaseName(f.name) || '该势力'
  if (/己方|主角/.test(camp)) return '随主角一路壮大，从立足之地成长为定鼎根基，终成' + (goal ? '实现「' + clipPhrase(goal) + '」' : '新朝柱石') + '的核心'
  if (/敌/.test(camp)) return '与主角由对峙走向决战，主力被逐一击破，首领或降或亡，部众编入新朝体系'
  if (/友/.test(camp)) return '与主角结为唇齿之援，共渡危局，事成之后保全建制、共享中兴之功'
  if (/亦敌亦友/.test(camp)) return '在合作与对抗之间反复摇摆，最终在关键一战中作出抉择，或归附或覆灭'
  return '在大势变动中力求自保，先观望后择主，最终被纳入新秩序或被边缘化'
}

/**
 * 规范化整套势力（返回新数组 + 变更报告；不修改入参对象结构以外的数据）
 */
export function normalizeFactions(input: any, opts?: { fillStructural?: boolean; historicalGenre?: boolean }): { factions: any[]; report: FactionNormalizeReport } {
  const arr: any[] = Array.isArray(input) ? input.slice()
    : (input && Array.isArray(input.factions) ? input.factions.slice() : [])
  const report: FactionNormalizeReport = { merged: [], aliasFixed: [], symmetryFilled: [], filled: [], before: arr.length, after: arr.length }
  if (!arr.length) return { factions: arr, report }
  const fillStructural = opts?.fillStructural !== false
  const historical = !!opts?.historicalGenre

  // ---------- 1) 合并同势力（基名相同，或基名相同且首领一致） ----------
  const groups: Record<string, any[]> = {}
  const order: string[] = []
  arr.forEach(function (f: any) {
    if (!f || typeof f !== 'object') return
    const base = factionBaseName(f.name)
    if (!base) return
    const leader = String(f.leader || '').trim()
    // 首领不同则视为不同势力（如"清廷多铎部"与"清廷海防司"基名不同，天然分开）
    const key = base + (leader ? '｜' + leader : '')
    if (!groups[key]) { groups[key] = []; order.push(key) }
    groups[key].push(f)
  })

  const merged: any[] = []
  order.forEach(function (key) {
    const list = groups[key]
    if (!list.length) return
    if (list.length === 1) { merged.push(list[0]); return }
    const primary = list.slice().sort(function (a, b) {
      const sa = JSON.stringify(a).length, sb = JSON.stringify(b).length
      return sb - sa
    })[0]
    const others = list.filter(function (x) { return x !== primary })
    const phaseNames = list.map(function (x) { return String(x.name || '') }).filter(Boolean)
    const allPlaces = uniqPlaces(list.reduce(function (acc: string[], x: any) { return acc.concat(placesOf(x.territory)) }, [] as string[]))
    const trajectory = '阶段沿革：' + phaseNames.map(function (n) {
      const ph = (String(n).match(/[（(]([^）)]{1,8})[）)]/) || [])[1] || ''
      const place = placesOf((list.find(function (x) { return String(x.name) === n }) || {}).territory)[0] || ''
      return factionBaseName(n) + (ph ? '·' + ph : '') + (place ? '（' + place + '）' : '')
    }).join(' → ')

    const m: any = Object.assign({}, primary)
    m.name = factionBaseName(primary.name) || primary.name
    m.territory = allPlaces.join('、')
    m.developmentTrajectory = betterString(m.developmentTrajectory, trajectory)
    m.strength = list.map(function (x) { return String(x.strength || '') }).sort(function (a, b) { return b.length - a.length })[0] || m.strength
    m.allies = uniq(list.reduce(function (acc: string[], x: any) { return acc.concat(Array.isArray(x.allies) ? x.allies.map(String) : []) }, [] as string[]))
    m.enemies = uniq(list.reduce(function (acc: string[], x: any) { return acc.concat(Array.isArray(x.enemies) ? x.enemies.map(String) : []) }, [] as string[]))
    m.members = uniq(list.reduce(function (acc: string[], x: any) { return acc.concat(Array.isArray(x.members) ? x.members.map(String) : []) }, [] as string[]))
    m.coreResources = uniq(list.reduce(function (acc: string[], x: any) { return acc.concat(Array.isArray(x.coreResources) ? x.coreResources.map(function (r: any) { return typeof r === 'string' ? r : String(r && (r.name || r.item || r.resource) || '') }) : []) }, [] as string[]).filter(Boolean))
    m.flagshipFigures = uniq(list.reduce(function (acc: string[], x: any) { return acc.concat(Array.isArray(x.flagshipFigures) ? x.flagshipFigures.map(function (r: any) { return typeof r === 'string' ? r : String(r && (r.name || r.title) || '') }) : []) }, [] as string[]).filter(Boolean))
    m.internalFactions = uniq(list.reduce(function (acc: string[], x: any) { return acc.concat(Array.isArray(x.internalFactions) ? x.internalFactions.map(String) : []) }, [] as string[]))
    ;['goal', 'description', 'philosophy', 'historyGrudges', 'hiddenAgenda', 'culture', 'symbol', 'trumpCard', 'coreConflict', 'fate', 'relationshipWithProtagonist', 'relationToProtagonist', 'relationshipWith', 'powerRank', 'strengthTier'].forEach(function (k) {
      m[k] = list.reduce(function (acc: string, x: any) { return betterString(acc, String(x[k] || '')) }, String(m[k] || ''))
    })
    merged.push(m)
    report.merged.push({ name: String(m.name), absorbed: others.map(function (o: any) { return String(o.name) }), trajectory: String(m.developmentTrajectory || '') })
  })

  // ---------- 2) 别名解析：把 allies/enemies 的引用对齐到真实势力名 ----------
  const aliasToReal: Record<string, string> = {}
  merged.forEach(function (f: any) {
    const real = String(f.name || '')
    aliasSetOf(f).forEach(function (a) {
      if (!aliasToReal[a]) aliasToReal[a] = real
    })
  })
  const resolveName = function (ref: string): string {
    const r = String(ref || '').trim()
    if (!r) return r
    if (aliasToReal[r]) return aliasToReal[r]
    const base = factionBaseName(r)
    if (aliasToReal[base]) return aliasToReal[base]
    // 🔥 前缀式解析：引用"南明朝廷"而实际势力名是"南明永历朝廷"（中间插了年号），
    //   按"引用核心词是某势力名的前缀"匹配；命中唯一才替换，避免误并不同势力
    const refCore = base.replace(/(集团|朝廷|政权|军团|军|部|司|府|盟|会|党|派|国|朝|廷|水师|舰队|公司|公会|商会|世家|行营|行在)$/, '')
    if (refCore && refCore.length >= 2) {
      const hits = Object.keys(aliasToReal).filter(function (a) {
        return a.length > refCore.length && a.indexOf(refCore) === 0
      })
      const uniqHits = Array.from(new Set(hits.map(function (h) { return aliasToReal[h] })))
      if (uniqHits.length === 1) return uniqHits[0]
    }
    return r
  }
  merged.forEach(function (f: any) {
    ;['allies', 'enemies'].forEach(function (field) {
      const list = Array.isArray((f as any)[field]) ? (f as any)[field] : []
      const next = uniq(list.map(resolveName).filter(function (x: string) { return x && x !== f.name }))
      list.forEach(function (orig: string, i: number) {
        const got = next[i]
        if (got && orig && orig !== got) report.aliasFixed.push({ faction: String(f.name), field: field, from: orig, to: got })
      })
      ;(f as any)[field] = next
    })
  })

  // ---------- 3) 关系互认（对称补全），避免单边空值 ----------
  const byName: Record<string, any> = {}
  merged.forEach(function (f: any) { byName[String(f.name)] = f })
  merged.forEach(function (f: any) {
    ;['allies', 'enemies'].forEach(function (field) {
      const rev = field === 'allies' ? 'allies' : 'enemies'
      ;(f[field] || []).forEach(function (other: string) {
        const o = byName[other]
        if (!o) return
        if (!Array.isArray(o[rev])) o[rev] = []
        if (o[rev].indexOf(f.name) === -1) {
          o[rev].push(f.name)
          o[rev] = uniq(o[rev].filter(function (x: string) { return x && x !== o.name }))
          report.symmetryFilled.push({ faction: String(o.name), field: rev, added: String(f.name) })
        }
      })
    })
  })

  // ---------- 4) 历史题材：清洗修仙/玄幻模板词（势力字段实测混入"护宗大阵""开派祖师"等） ----------
  if (historical) {
    const STR_FIELDS = ['name', 'leader', 'territory', 'strength', 'goal', 'description', 'fate', 'philosophy',
      'historyGrudges', 'hiddenAgenda', 'powerRank', 'culture', 'symbol', 'strengthTier', 'trumpCard',
      'coreConflict', 'developmentTrajectory', 'relationshipWithProtagonist', 'relationToProtagonist', 'relationshipWith']
    merged.forEach(function (f: any) {
      STR_FIELDS.forEach(function (k) {
        if (typeof f[k] === 'string' && f[k]) {
          const cleaned = scrubXianxia(f[k]).trim()
          if (cleaned && cleaned !== f[k]) f[k] = cleaned
        }
      })
      ;['members', 'internalFactions', 'coreResources', 'flagshipFigures'].forEach(function (k) {
        if (Array.isArray(f[k])) f[k] = f[k].map(function (x: any) { return typeof x === 'string' ? scrubXianxia(x).trim() : x })
      })
    })
  }

  // ---------- 5) 结构性补空 + 残缺模板重写 ----------
  if (fillStructural) {
    merged.forEach(function (f: any) {
      const put = function (field: string, value: string) {
        if (!value) return
        f[field] = value
        report.filled.push({ faction: String(f.name), field: field, value: String(value).slice(0, 40) })
      }
      // 发展轨迹：空/残缺模板（"时期建立，传承多年…"缺朝代前缀）一律按势力事实重写
      if (isPlaceholder(f.developmentTrajectory) || isBrokenTemplate(f.developmentTrajectory)) {
        put('developmentTrajectory', rewriteTrajectory(f))
      }
      if (isPlaceholder(f.fate)) put('fate', fateByCamp(f))
      if (isPlaceholder(f.goal)) put('goal', (f.camp === '敌方' ? '扩张地盘、削弱主角一方' : f.camp === '友方' ? '自保图存、借中兴之势延续血脉' : '稳固根基、积蓄问鼎之力'))
      if (isPlaceholder(f.description)) {
        put('description', [factionBaseName(f.name), f.leader ? '由' + f.leader + '统领' : '', f.territory ? '盘踞' + placesOf(f.territory)[0] : '', f.goal ? '志在' + f.goal : ''].filter(Boolean).join('，'))
      }
      if (isPlaceholder(f.relationshipWithProtagonist)) put('relationshipWithProtagonist', fateByCamp({ camp: f.camp, goal: f.goal }).slice(0, 30))
      if (isPlaceholder(f.symbol)) put('symbol', f.camp === '敌方' ? '黑底狼旗' : f.camp === '友方' ? '青旗' : '赤旗')
      // 🔥 2026-09-06 修复：势力级别必须是前端下拉合法值（传说/超级/一流/二流/三流 + 势力），
      // 否则下拉框匹配不上显示为空；同时把实力梯度描述文本规范为 SSS/SS/S/A/B/C/D
      const _RANK_SET = ['传说势力', '超级势力', '一流势力', '二流势力', '三流势力']
      const _TIER_BY_RANK: Record<string, string> = { '传说势力': 'SSS', '超级势力': 'SS', '一流势力': 'S', '二流势力': 'A', '三流势力': 'B' }
      const _prCur = String(f.powerRank || '').trim()
      if (_RANK_SET.indexOf(_prCur) === -1) {
        const _sText = String(f.strengthTier || f.strength || '')
        let _rank = ''
        if (/SSS|顶级|传说|神话|霸主/.test(_sText)) _rank = '传说势力'
        else if (/SS|超级|顶尖|最强|精锐|鼎盛/.test(_sText)) _rank = '超级势力'
        else if (/^S$|一流|强势|上层|精良|先进/.test(_sText)) _rank = '一流势力'
        else if (/三流|微弱|弱小/.test(_sText)) _rank = '三流势力'
        else _rank = /A|强/.test(_sText) ? '一流势力' : '二流势力'
        put('powerRank', _rank)
      }
      if (isPlaceholder(f.strengthTier) || !/^(SSS|SS|S|A|B|C|D)$/i.test(String(f.strengthTier || '').trim())) {
        put('strengthTier', _TIER_BY_RANK[String(f.powerRank || '').trim()] || (/己方|主角/.test(String(f.camp || '')) ? 'S' : 'A'))
      }
      if (isPlaceholder(f.hiddenAgenda)) put('hiddenAgenda', f.camp === '敌方' ? '暗中清除异己，独揽大权' : f.camp === '友方' ? '保住本部人马与地盘，不参与无谓内斗' : '观望风向，随时准备倒向胜者')
      if (isPlaceholder(f.culture)) put('culture', /军|营|部|司|府/.test(String(f.name || '')) ? '尚武重功，令行禁止，赏罚以首级论' : '重乡土宗族，利益捆绑，对外先谈价后动手')
      if (isPlaceholder(f.trumpCard)) put('trumpCard', f.camp === '敌方' ? '一支藏在' + (placesOf(f.territory)[0] || '后方') + '的精锐奇兵' : '一条外人不知的粮道与兵源')
      if (isPlaceholder(f.coreConflict)) put('coreConflict', f.camp === '敌方' ? '内部争权与对外扩张的两线消耗' : '生存空间与立场选择之间的拉扯')
    })
  }

  report.after = merged.length
  return { factions: merged, report }
}

/** 供前端/接口展示的摘要文案 */
export function summarizeFactionReport(r: FactionNormalizeReport): string {
  const parts: string[] = []
  if (r.merged.length) parts.push('合并重复势力 ' + r.merged.length + ' 组')
  if (r.aliasFixed.length) parts.push('修正势力引用 ' + r.aliasFixed.length + ' 处')
  if (r.symmetryFilled.length) parts.push('补全单边关系 ' + r.symmetryFilled.length + ' 处')
  if (r.filled.length) parts.push('填充空字段 ' + r.filled.length + ' 处')
  return parts.length ? parts.join('，') : '无需调整'
}
