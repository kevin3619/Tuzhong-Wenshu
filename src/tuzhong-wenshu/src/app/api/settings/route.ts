import { NextResponse, NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { isAdminOnlyNovel, getRequestActor, loadNovelMetaOrNull } from '@/lib/permissions'
import { checkNovelAccessFor } from '@/lib/novel-access'
import { atomicWriteJson, runExclusive } from '@/lib/file-lock'

const dataDir = path.join(process.cwd(), '.tuzhong-data')

// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const settingsFile = path.join(dataDir, 'settings.json')

// 🔥 #198 人物模板守卫：拦截模板垃圾回写（LLM 劣质重生成 / 旧 localStorage 回写均会污染人物设定）。
//   规则：incoming 人物字段命中模板黑名单，而 existing 同名字段未命中时，保留 existing（拒收 incoming 该字段）。
const _TPL_GUARDS = [
  '一件与其身份经历紧密相连', '吾辈死生以之', '生于瘴气', '世人多直呼其名', '永生之门', '境界突破桎梏',
  '外表温文尔雅', '血缘关联，这份血脉既是天赋也是诅咒', '过度保护，敌人一旦以此要挟', '盾，为其惯用兵刃',
  '盾的操使', '魂穿桂世子', '命运交织、恩怨纠缠', '初露锋芒，实力仍在', '这份血脉既是天赋也是诅咒',
]
const _isTplStr = function (t: string): boolean {
  const v = t.trim()
  if (!v) return false
  if (_TPL_GUARDS.some(x => v.indexOf(x) !== -1)) return true
  if (/阵营（[^）]{0,6}，/.test(v)) return true // 「XX阵营（主，」括号未闭合模板
  if (/^[0-9０-９\s；;，,.、\-~]+$/.test(v)) return true // 纯数字串垃圾
  return false
}
const _guardCharObj = function (inc: Record<string, any>, exi: Record<string, any>) {
  if (!inc || typeof inc !== 'object' || !exi || typeof exi !== 'object') return
  for (const k of Object.keys(inc)) {
    const iv = inc[k], ev = exi[k]
    if (iv == null) continue
    if (typeof iv === 'string') {
      if (_isTplStr(iv) && typeof ev === 'string' && !_isTplStr(ev)) inc[k] = ev
    } else if (k === 'skills' && Array.isArray(iv) && Array.isArray(ev)) {
      const bad = iv.some((x: any) => typeof x === 'string' && _isTplStr(x))
      if (bad) inc[k] = ev
    }
  }
}
const _guardCharactersTemplates = function (incChars: Record<string, any>, exiChars: Record<string, any>) {
  try {
    if (!incChars || typeof incChars !== 'object' || !exiChars || typeof exiChars !== 'object') return
    // 单数桶（对象）
    for (const bk of ['protagonist', 'antagonist', 'femaleLead']) {
      if (incChars[bk] && typeof incChars[bk] === 'object' && exiChars[bk] && typeof exiChars[bk] === 'object') {
        _guardCharObj(incChars[bk], exiChars[bk])
      }
    }
    // 数组桶（按 name 对齐）
    for (const ak of ['antagonists', 'supporting', 'femaleLeads', 'masters', 'villains']) {
      const ia = incChars[ak], ea = exiChars[ak]
      if (!Array.isArray(ia) || !Array.isArray(ea)) continue
      const exMap: Record<string, any> = {}
      for (const e of ea) { if (e && typeof e === 'object' && e.name) exMap[String(e.name)] = e }
      for (let i = 0; i < ia.length; i++) {
        const ic = ia[i]
        if (ic && typeof ic === 'object' && ic.name && exMap[String(ic.name)]) {
          _guardCharObj(ic, exMap[String(ic.name)])
        }
      }
    }
  } catch (_e) { console.error('[settings] _guardCharactersTemplates 模板守卫异常（不阻断）:', _e) }
}

// 🔥🔥 2026-11-06 修复：删除 #138「主角槽守卫」整段硬编码逻辑。
//   原实现把《永历中兴》主角（朱由榔/永历帝）作为「权威兜底」注入所有草稿的 protagonist 槽，
//   导致任何题材（都市/玄幻等）新草稿的主角被整槽替换成南明皇帝——硬编码模板角色污染，明显错误。
//   主角数据应由 AI 生成或用户编辑产生，服务端写入闸口不再做任何主角注入/回退。

// 配角跨题材漂移清洗：把修仙/玄幻/科幻/金手指错乱词替换为历史语境合规表达
const _cleanSupportingString = function (t: unknown): unknown {
  if (typeof t !== 'string') return t
  return t
    // ── 科幻 / 星际 ──
    .replace(/在血脉传承的残酷浪潮中守护人类文明火种，揭开星域文明消亡的真相，为族人争得一线生机/g, '报效君国、拱卫社稷，助明室抗清复明，还江南士民以太平')
    .replace(/寻找失散在星海中的妹妹，揭开联邦政府掩盖的人体实验黑幕，摧毁非法血脉改造工厂拯救无数受害者/g, '报效君国、督练人马，助朱由榔北伐逐清，护佑黎民免遭兵燹')
    .replace(/找到适合人类殖民的新家园星系，延续人类文明火种，在天地中建立新的家园/g, '操持权柄、招纳枭雄，借乱世坐大，终欲问鼎中原')
    .replace(/探索维度之外的生命终极形态/g, '统揽朝纲、扫平群雄，终成一代雄主')
    .replace(/超越碳基生命桎梏/g, '克服掣肘、广纳贤能')
    .replace(/破解血脉传承的终极奥秘/g, '筚路蓝缕、整军经武')
    .replace(/人类文明火种/g, '华夏衣冠')
    .replace(/血脉传承的残酷浪潮/g, '身逢乱世的艰险')
    .replace(/星域文明城市/g, '边关要塞')
    .replace(/星域战争/g, '两军对垒')
    .replace(/星域文明消亡/g, '江山沦丧')
    .replace(/星域联盟/g, '一方割据')
    .replace(/新家园星系/g, '新的基业')
    .replace(/失散在星海中的妹妹/g, '失散在山河中的亲人')
    .replace(/联邦政府/g, '朝廷')
    .replace(/人体实验/g, '借刀杀人的暗算')
    .replace(/血脉改造工厂/g, '图谋不轨的乱党')
    .replace(/血脉改造/g, '擅权弄柄')
    .replace(/碳基生命/g, '九州疆土')
    .replace(/星域/g, '山河')
    .replace(/星海/g, '江湖')
    .replace(/星系/g, '疆土')
    .replace(/星舰/g, '艨艟')
    .replace(/机甲/g, '甲械')
    .replace(/探索维度之外/g, '问鼎中原')
    .replace(/生命终极形态/g, '皇图霸业')
    // ── 修仙 / 仙侠 / 玄幻 ──
    .replace(/追求修行大道的极致境界。?/g, '练就报国经世的才干')
    .replace(/追求修行大道的极致境界突破桎梏/g, '尽忠报国、不避斧钺')
    .replace(/修行大道/g, '经世之道')
    .replace(/追求修行大道/g, '循正经世')
    .replace(/极致境界/gi, '一统山河')
    .replace(/已臻此界顶点|此界顶点/g, '一统山河')
    .replace(/体内着禁忌力量，每逢月圆之夜便会遭受反噬/g, '早年身历城破家亡之痛，矢志励精图治、整军雪耻')
    .replace(/禁忌力量/g, '隐忍之志')
    .replace(/月圆之夜/g, '每遇兵燹')
    .replace(/遭.*反噬/g, '屡陷险境')
    .replace(/追求武学\/术法\/道术的极致境界/g, '以经世之学辅君')
    .replace(/武学师父/g, '经世宿将')
    .replace(/修炼|修仙|修真|仙侠|渡劫|飞升|元婴|金丹|筑基|炼气|化神|淬体/g, '经世之学')
    .replace(/突破桎梏|超脱生死/g, '报国安民')
    .replace(/境界/g, '格局')
    .replace(/神通|法宝|功法|道术|术法/g, '手段')
    .replace(/灵气|法力|灵力|魂力|斗气/g, '才略')
    .replace(/宗门|灵宠/g, '部曲')
    // ── 武侠技名 → 权谋/兵法 ──
    .replace(/摄政王令牌·操控人心/g, '权谋制衡')
    .replace(/暗影术·隐匿身形|暗影术/g, '谍探之道')
    .replace(/毒箭术·毒杀|毒箭术/g, '雷霆手段')
    .replace(/剑术·破军式/g, '弓马娴熟')
    .replace(/兵法·连环计/g, '兵法韬略')
    .replace(/谋略·借刀杀人/g, '谋略沉机')
    .replace(/宝剑·破军/g, '腰刀')
    // ── 金手指/主题错乱残留 ──
    .replace(/活跃于中兴签到系统、榔以签到系统、立日不落帝国的世界中/g, '')
    .replace(/的操使法度/g, '的治事之道')
    .replace(/铁扇舞/g, '经年养生之道')
    .replace(/名门闺秀或江湖侠女，才貌双全，与主角共谋天下/g, '名门闺秀，才貌双全，与主角共谋抗清复明大业')
    .replace(/让恶人得到应有的惩罚/g, '使恶人伏法、贼寇授首')
    .replace(/踏上强者之路揭开自身身世之谜/g, '周旋于朝野风波、追寻家族身世')
    .replace(/树立强大的南明政权/g, '辅佐南明中兴')
    .replace(/立日不落帝国/g, '大明江山')
    .replace(/建立自己的王朝/g, '问鼎中原')
}

// 🔥 #199 人物回写版本守卫（乐观并发控制，服务端权威）：
//   旧页面/旧 localStorage 快照整体回写会覆盖服务端修复数据（#198 黑名单只能拦模板句，拦不住「内容合理但整体过时」的回写）。
//   规则：服务端为每部作品维护 _charsRev（每次接受 characters 写入后自增），GET 下发、客户端保存回带；
//   incoming rev < 服务端 rev（或未携带 rev 而服务端已有非空 characters）→ 拒收 characters 键，其余键照常合并（服务端赢）。
const _charsSectionNonEmpty = function (c: Record<string, any> | null | undefined): boolean {
  if (!c || typeof c !== 'object') return false
  for (const k of ['protagonist', 'antagonist', 'femaleLead']) {
    const v = c[k]
    if (v && typeof v === 'object') {
      for (const kk of Object.keys(v)) {
        const vv = (v as any)[kk]
        if (typeof vv === 'string' ? !!String(vv).trim() : !!vv) return true
      }
    }
  }
  for (const k of ['antagonists', 'supporting', 'femaleLeads', 'masters', 'villains']) {
    if (Array.isArray(c[k]) && (c[k] as any[]).length > 0) return true
  }
  return false
}
const _charsRevGuard = function (entry: Record<string, any>, incRevRaw: unknown): { accept: boolean; serverRev: number; nextRev: number } {
  const srvRev = Number(entry && entry._charsRev) || 0
  const hasIncRev = incRevRaw != null && String(incRevRaw) !== ''
  const incRev = hasIncRev ? (Number(incRevRaw) || 0) : 0
  const existingNonEmpty = _charsSectionNonEmpty(entry && entry.characters)
  // 服务端 characters 为空 → 放行（新书首次生成）
  if (!existingNonEmpty) return { accept: true, serverRev: srvRev, nextRev: Math.max(srvRev, incRev) + 1 }
  // 存量数据从未版本化（srvRev=0）且 incoming 未带 rev → 视为旧快照：就地惰性上锁 srvRev=1 并拒收
  if (srvRev === 0 && !hasIncRev) {
    try { entry._charsRev = 1 } catch (_e) { console.error('[settings] _charsRev 惰性上锁失败:', _e) }
    return { accept: false, serverRev: 1, nextRev: 1 }
  }
  if (incRev < srvRev) return { accept: false, serverRev: srvRev, nextRev: srvRev }
  return { accept: true, serverRev: srvRev, nextRev: Math.max(srvRev, incRev) + 1 }
}
// 剥离 characters 对象内部误带的 _charsRev（rev 存储在作品条目层，不进 characters）
const _stripCharsRev = function (incChars: Record<string, any>) {
  if (incChars && typeof incChars === 'object' && (incChars as any)._charsRev != null) {
    try { const cp = Object.assign({}, incChars); delete (cp as any)._charsRev; return cp } catch (_e) { return incChars }
  }
  return incChars
}

// 🔥 女主裁撤守卫：#199 rev 守卫只防「版本落后」，防不了「版本新但内容缺卡」——
//   客户端本地快照缺女主卡时（徽章校正后立即持久化 / 热替换后 rev 已更新但快照缺卡），
//   带当前 rev 上送会把服务端多女主静默裁撤（实测 femaleLeads [王氏,戴贵人] 被裁成 [王氏]）。
//   规则：existing.femaleLeads 中每张卡，若其 name 既不在 incoming.femaleLeads 名单中、
//   也不在 incoming.supporting/supportingCharacters 名单中（不是被合法移到配角）→
//   视为「静默裁撤」，把该卡追加回 incoming.femaleLeads 尾部（合并而非拒收），记日志。
//   - femaleLead 主卡不动，只保护 femaleLeads 数组里的额外女主；
//   - incoming.femaleLeads 缺失/为空但 existing 有多卡时，同样按规则合并；
//   - 只保护 femaleLeads，不扩展到 supporting/antagonists（配角删卡是合法操作）；
//   - 防御式：任一非对象直接跳过；按 name 去重；不改变顺序（existing 顺序优先，restored 追加尾部）。
//   - #218b 修订判定规则：本产品 UI 模型中「额外女主」同时挂在 supporting 数组里进 32 卡网格渲染，
//     故「incoming.supporting 仍有此卡但 femaleLeads 缺失」= 被静默裁撤旗标的特征 → 必须回补；
//     「incoming 里彻底无此卡」= 新角色集整体替换/重生成的合法移除 → 尊重不回补。
//     旧版「在 supporting 里出现就跳过」恰好把唯一真实裁撤场景挡死（#218 攻击测试实证：戴贵人
//     同时在 femaleLeads 与 supporting[0]，守卫永不触发）。
const _guardFemaleLeads = function (existingChars: unknown, incomingChars: unknown) {
  try {
    if (!existingChars || typeof existingChars !== 'object') return
    if (!incomingChars || typeof incomingChars !== 'object') return
    const ex = existingChars as Record<string, any>
    const inc = incomingChars as Record<string, any>
    const exList: any[] = Array.isArray(ex.femaleLeads) ? ex.femaleLeads : []
    if (exList.length === 0) return
    const incList: any[] = Array.isArray(inc.femaleLeads) ? inc.femaleLeads : []
    const nameOf = (c: any): string => String(c && typeof c === 'object' ? (c as any).name : (c || '')).trim()
    const incNames = new Set<string>()
    incList.forEach((c) => { const n = nameOf(c); if (n) incNames.add(n) })
    // 回补判定依据：卡片是否仍存在于 incoming 的配角网格（supporting/supportingCharacters）
    const supList: any[] = Array.isArray(inc.supporting)
      ? inc.supporting
      : (Array.isArray(inc.supportingCharacters) ? inc.supportingCharacters : [])
    const supNames = new Set<string>()
    supList.forEach((c) => { const n = nameOf(c); if (n) supNames.add(n) })
    for (let i = 0; i < exList.length; i++) {
      const n = nameOf(exList[i])
      if (!n) continue
      if (incNames.has(n)) continue // 已是女主，无需处理
      if (!supNames.has(n)) continue // incoming 彻底无此卡 → 合法移除，尊重
      incList.push(exList[i])
      incNames.add(n)
    }
    if (incList.length > 0) inc.femaleLeads = incList
  } catch (_e) { console.error('[settings] _guardFemaleLeads 女主守卫异常（不阻断）:', _e) }
}

// 🔥 #219b 权威定位粘性守卫：existing 中 roleConfirmed=true 的角色（用户确认过/修复脚本核实过），
//   incoming（旧标签页快照）缺 roleConfirmed 标记时 = 修复前旧数据回写 → 保服务端已确认的
//   定位与徽章并补回标记；用户主动修改时前端带 roleConfirmed=true（StepCharacters updateField
//   在改 role 时置位）→ 放行不干预。rev 守卫防不了「rev 已同步但内容是旧的」同 rev 竞态，
//   本守卫按内容标记补齐这一环。
const _guardConfirmedChars = function (existingChars: unknown, incomingChars: unknown) {
  try {
    if (!existingChars || typeof existingChars !== 'object') return
    if (!incomingChars || typeof incomingChars !== 'object') return
    const ex = existingChars as Record<string, any>
    const inc = incomingChars as Record<string, any>
    const nameOf = (c: any): string => String(c && typeof c === 'object' ? (c as any).name : '').trim()
    const exMap = new Map<string, any>()
    ;[ex.protagonist, ex.femaleLead, ex.antagonist].forEach((c) => { const n = nameOf(c); if (n && !exMap.has(n)) exMap.set(n, c) })
    ;([] as any[]).concat(
      Array.isArray(ex.femaleLeads) ? ex.femaleLeads : [],
      Array.isArray(ex.antagonists) ? ex.antagonists : [],
      Array.isArray(ex.supporting) ? ex.supporting : [],
    ).forEach((c: any) => { const n = nameOf(c); if (n && !exMap.has(n)) exMap.set(n, c) })
    const applyTo = (list: any[]) => {
      if (!Array.isArray(list)) return
      list.forEach((c) => {
        if (!c || typeof c !== 'object') return
        const n = nameOf(c)
        if (!n) return
        const e = exMap.get(n)
        if (!e || !e.roleConfirmed || c.roleConfirmed) return
        c.roleConfirmed = true
        const curRole = String(c.rolePosition || c.role || '')
        const exRole = String(e.rolePosition || e.role || '')
        if (curRole && exRole && curRole !== exRole) {
          c.rolePosition = exRole
          if (e.role) c.role = e.role
        }
        if (e.title && String(c.title || '') !== String(e.title)) {
          c.title = e.title
        }
      })
    }
    applyTo(Array.isArray(inc.supporting) ? inc.supporting : [])
    applyTo(Array.isArray(inc.antagonists) ? inc.antagonists : [])
    applyTo(Array.isArray(inc.femaleLeads) ? inc.femaleLeads : [])
    ;[inc.protagonist, inc.femaleLead, inc.antagonist].forEach((c) => { if (c && typeof c === 'object') applyTo([c]) })
  } catch (_e) { console.error('[settings] _guardConfirmedChars 定位粘性守卫异常（不阻断）:', _e) }
}

// 🔥 #226 缺陷3：角色年龄守卫 —— 防止 AI 生成 / 旧快照把角色年龄写成漂移值
//   （实测：郑成功被写成 60、多尔衮 52、孙可望 30…与 1646 年基准严重不符；虚构亲随被写成 99 岁）。
//   #226g 升级为「三段式」，#226k 收紧为「精确三段式」：
//     (a) 命中史实人物生年表 HISTORICAL_CHAR_BIRTH → 年龄必须**严格等于** 1646-生年
//         （#226k：容差 AGE_TOLERANCE 由 ±4 收紧为 0，即「有明确生年」的历史人物按史实精确对账；
//          旧 ±4 会把 朱聿鐭(应 41) 停在 38、把 郑成功(应 22) 停在 24 而漏网 → 现一律钳回基准值，
//          无条件，不看 roleConfirmed）；
//     (b) 史实人物但生年待考 HISTORICAL_BIRTH_UNKNOWN → 维持现值（不确定生年不瞎填、不钳制）；
//     (c) 未列为史实人物（虚构）→ 按「身份/定位 → 合理年龄区间」表 _FICTIONAL_AGE_BAND 钳到区间内，
//         越界取最近边界值；无法归类回退 14–70。
//   说明：#219b 的 roleConfirmed 粘性只针对 role/title（见 _guardConfirmedChars / normalizeCharacter），
//   本守卫不再对 age 做 roleConfirmed 旁路——否则「虚构亲随 99 岁」会再次漏网。
//   ⚠️ #226k 史料核实：朱聿键（隆武帝）确生 1602（万历三十年，卒 1646 享年 44），非 1605
//      （1605 是其弟朱聿鐭/绍武帝的生年，勿混淆）。
//   ⚠️ #226L：孙可望 / 王太后 / 刘文秀 / 艾能奇 四人生年原列为「待考」；2026-09-17 经用户拍板
//      采纳史料生年，已按下表精确定年（其中孙可望取 1619 说 → 基准 27）。
const HISTORICAL_CHAR_BIRTH: Record<string, number> = {
  '朱由榔': 1623, '史可法': 1601, '瞿式耜': 1590, '何腾蛟': 1592, '李定国': 1621,
  '郑成功': 1624, '张煌言': 1620, '多尔衮': 1612, '多铎': 1614, '吴三桂': 1612,
  '孔有德': 1602, '张献忠': 1606, '郑芝龙': 1604, '朱由崧': 1607, '朱聿键': 1602,
  '黄道周': 1585, '堵胤锡': 1601, '马士英': 1591, '阮大铖': 1587, '阎应元': 1607,
  '黄淳耀': 1605,
  // 🔥 #226g 补齐：46 张卡中「史书有载生年」而原表缺失者（勘验见 _recon/fix226g_report）
  '张同敞': 1608, // 张居正曾孙，(1608-1651)，永历朝兵部右侍郎兼翰林侍读学士、锦衣卫指挥佥事；原卡误写 26 → 基准 38
  '朱聿鐭': 1605, // 绍武帝，(1605-1647)，隆武帝之弟；基准 41
  '焦琏': 1599,   // 南明广西老将，(1599-1651)，参将/新兴侯；基准 47
  // 🔥 #226L 用户 2026-09-17 拍板：采纳史料生年，按精确口径定年（原归「待考」，现移入本表）
  '王太后': 1594, // 孝正皇太后王氏（王徽灵），永历帝继嫡母 → 基准 52
  '刘文秀': 1633, // 张献忠义子、大西四将军之一 → 基准 13（少年义子将领）
  '艾能奇': 1626, // 张献忠义子、大西四将军之一 → 基准 20
  '孙可望': 1619, // 张献忠义子、大西四将军之首 → 基准 27（用户定 1619 说）
}
// 🔥 #226g 史实人物「生年待考」白名单 —— 命中者维持现值（既不可瞎填、也不按虚构区间钳制）。
//   铁律：资料未载确凿生年者一律归此，严禁臆造区间（用户要求：真实历史人物须据史料，不得乱发挥）。
//   ⚠️ #226L：王太后 / 刘文秀 / 艾能奇 / 孙可望 已按用户拍板移入上表，不再于本表。
const HISTORICAL_BIRTH_UNKNOWN = new Set<string>([
  '王氏',   // 孝刚匡皇后王氏，生年无考
  '戴贵人', // 史载永历帝有贵人戴氏（生皇五子），生年无考
  '李成栋', // 明末降将，(?-1649)，生年无考
  '丁魁楚', // 南明弘光/隆武朝广西巡抚，生年无考
  '金声桓', // 明末清初武将，(?-1649)，生年无考
  '庞天寿', // 🔥 #226L：南明永历朝司礼监宦官，生年无考（维基 1588 说未获用户采纳），维持现值
])
const HISTORICAL_BASE_YEAR = 1646
// 🔥 #226k：容忍带 ±4 → 0（精确）。「有明确生年」的历史人物年龄必须严格 = 1646-生年。
const AGE_TOLERANCE = 0
// 🔥 #226g 虚构角色「身份/定位 → 合理年龄区间」表。
//   匹配角色的身份/定位字段（role/rolePosition/title/job/identity/description/background），
//   取「命中的最具体（spec 最大）那条」；同等具体命中多条取交集，交集为空取首条；均不命中回退 14–70。
//   区间用于拦截「明显不合理」的荒谬值（如虚构亲随/护卫 99 岁），上下界取贴合角色设定的宽区间，
//   避免误伤合理值（如熟年军需官/情报主事/掌印老太监 40–45 岁）。
const _FICTIONAL_AGE_BAND: { cat: string; min: number; max: number; spec: number; kw: string[] }[] = [
  { cat: '侍女/丫鬟/宫女', min: 14, max: 25, spec: 100, kw: ['贴身丫鬟', '丫鬟', '侍女', '宫女', '婢女', '使女', '婢'] },
  { cat: '皇子/少主/世子', min: 5, max: 25, spec: 100, kw: ['皇子', '少主', '世子', '王子', '皇孙', '幼主'] },
  { cat: '少年英才/神童', min: 14, max: 22, spec: 95, kw: ['神童', '少年英才', '天才少年', '少年俊才', '少年才俊'] },
  { cat: '老兵/都头/校尉/百户', min: 25, max: 45, spec: 90, kw: ['老兵', '都头', '校尉', '百户', '千户', '都司', '把总', '千总'] },
  { cat: '亲随/护卫/家丁/侍从', min: 18, max: 50, spec: 85, kw: ['亲随', '亲卫', '护卫', '侍卫', '家丁', '侍从', '随从', '长随', '内侍', '太监', '宦官'] },
  { cat: '叛将/降将', min: 30, max: 55, spec: 80, kw: ['叛将', '降将', '降清', '反正', '贰臣'] },
  { cat: '乡绅/员外/族长', min: 40, max: 65, spec: 80, kw: ['乡绅', '员外', '族长', '士绅', '耆老'] },
  { cat: '商贾/海商/船主', min: 30, max: 60, spec: 80, kw: ['商贾', '海商', '船主', '巨贾', '富商', '盐商'] },
  { cat: '僧道/术士/医者', min: 30, max: 70, spec: 80, kw: ['道士', '术士', '医者', '郎中', '方士', '僧人', '和尚', '法师'] },
  { cat: '老仆/管家/乳母', min: 45, max: 65, spec: 80, kw: ['老仆', '管家', '乳母', '嬷嬷', '老奴'] },
  { cat: '幕僚/文吏/书办', min: 25, max: 50, spec: 75, kw: ['幕僚', '文吏', '书办', '师爷', '主簿', '参谋', '文书'] },
  { cat: '督师/尚书/内阁/巡抚', min: 45, max: 65, spec: 70, kw: ['督师', '尚书', '大学士', '内阁', '巡抚', '首辅', '总督', '阁老'] },
  { cat: '太后/皇后/后妃', min: 25, max: 55, spec: 70, kw: ['太后', '皇后', '后妃', '贵妃', '王妃', '皇妃', '贵人', '妃嫔', '妃'] },
  { cat: '将领/总兵/参将/游击', min: 30, max: 55, spec: 60, kw: ['将领', '总兵', '参将', '游击', '将军', '提督', '统领', '元帅', '武将', '都统', '副将'] },
]
const _FICTIONAL_AGE_MIN = 14
const _FICTIONAL_AGE_MAX = 70
const _AGE_MATCH_FIELDS: string[] = ['role', 'rolePosition', 'title', 'job', 'identity', 'description', 'background']
const _matchFictionalBand = function (c: Record<string, any>): { min: number; max: number; cat: string } {
  const text = _AGE_MATCH_FIELDS.map(function (k) { return String(c[k] == null ? '' : c[k]) }).join('\n')
  const hits = _FICTIONAL_AGE_BAND.filter(function (b) { return b.kw.some(function (k) { return text.indexOf(k) !== -1 }) })
  if (hits.length === 0) return { min: _FICTIONAL_AGE_MIN, max: _FICTIONAL_AGE_MAX, cat: '兜底(14-70)' }
  hits.sort(function (a, b) { return b.spec - a.spec })
  const best = hits[0]
  const same = hits.filter(function (b) { return b.spec === best.spec })
  if (same.length > 1) {
    const mn = Math.max.apply(null, same.map(function (b) { return b.min }))
    const mx = Math.min.apply(null, same.map(function (b) { return b.max }))
    if (mn <= mx) return { min: mn, max: mx, cat: same.map(function (b) { return b.cat }).join('∩') }
  }
  return { min: best.min, max: best.max, cat: best.cat }
}
const _normAgeNum = function (raw: any): number | null {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(/[^\d.]/g, ''))
  if (!isFinite(n) || n <= 0) return null
  return n
}
const _guardCharacterAges = function (chars: any, idea?: any) {
  try {
    if (!chars || typeof chars !== 'object') return
    const _protagonist = (chars && typeof chars === 'object') ? chars.protagonist : null
    const list: any[] = []
    ;[chars.protagonist, chars.femaleLead, chars.antagonist].forEach((c: any) => { if (c && typeof c === 'object') list.push(c) })
    ;([] as any[]).concat(
      Array.isArray(chars.femaleLeads) ? chars.femaleLeads : [],
      Array.isArray(chars.antagonists) ? chars.antagonists : [],
      Array.isArray(chars.supporting) ? chars.supporting : [],
    ).forEach((c: any) => { if (c && typeof c === 'object') list.push(c) })
    const seen = new Set<any>()
    list.forEach((c: any) => {
      if (seen.has(c)) return
      seen.add(c)
      const cur = _normAgeNum(c.age)
      const name = String(c.name || '').trim()
      const birth = name ? HISTORICAL_CHAR_BIRTH[name] : undefined
      // (a) 史实人物（有生年）→ 无条件按 1646 基准钳制；#226k：容差 AGE_TOLERANCE=0，须精确相等
      if (birth != null) {
        const expected = HISTORICAL_BASE_YEAR - birth
        // 🔥 #226M：主角为史实人物时，输入主题年龄(idea.userSpecifiedAge)须与角色年龄对齐，
        //   杜绝「输入主题20岁 vs 角色设定23岁」漂移（输入主题字段此前不被本守卫覆盖，是漂移根因）。
        if (idea && c === _protagonist) {
          const _u = _normAgeNum((idea as any).userSpecifiedAge)
          if (_u == null || Math.abs(_u - expected) > AGE_TOLERANCE) {
            ;(idea as any).userSpecifiedAge = expected
          }
        }
        if (cur == null) {
          c.age = expected
          return
        }
        if (Math.abs(cur - expected) > AGE_TOLERANCE) {
          c.age = expected
        } else { c.age = cur }
        return
      }
      // (b) 史实人物但生年待考 → 维持现值（不钳制）
      if (name && HISTORICAL_BIRTH_UNKNOWN.has(name)) {
        if (cur != null) c.age = cur
        return
      }
      // (c) 虚构角色 → 按身份区间钳制（越界取最近边界值）
      if (cur == null) return
      const band = _matchFictionalBand(c)
      if (cur < band.min) { c.age = band.min }
      else if (cur > band.max) { c.age = band.max }
      else c.age = cur
    })
  } catch (_e) { console.error('[settings] _guardCharacterAges 年龄守卫异常（不阻断）:', _e) }
}

// 🔥 #226c 合规雷词守卫 —— 番茄签约评审 L0 合规层（一票否决项）的写入路径兜底。
//   背景：上游设计字段（idea/synopsis/outline/worldbuilding/factions/keyPlots/relationships/powerSystem 等）
//   与卷级字段（chapters.volumes[].summary / coreObjective / name）历史遗留了红线词（满清/扬州十日/剃发易服/
//   殖民者/设省/日不落/东印度公司/西班牙/荷兰/印度/澳洲/天皇/中华民族…）。即便离线清洗了数据，
//   旧标签页 autosave 仍可能把污染态整包冲回。此守卫对上述字段做「词级」替换（不改写语序、不重排文本），
//   对新建作品同样生效。只动字符串，绝不抛错；章节标题不在清洗范围（保持 4 字约束）。
const _COMPLY_MAP: [string, string][] = [
  ['南京大屠杀', '城陷之难'], ['英法联军', '西夷联军'], ['八国联军', '西夷联军'],
  ['南京条约', '城下之盟'], ['甲午战争', '海上之役'], ['甲午', '海上之役'],
  ['扬州十日', '扬州之变'], ['嘉定三屠', '嘉定之变'], ['剃发易服', '剃发之令'],
  // 🔥 #226d 屠杀族残留：整句口号优先（避免半句残留），再退到半句。
  ['留头不留发，留发不留头', '剃发之令'], ['留头不留发', '剃发之令'], ['留发不留头', '剃发之令'],
  ['屠城', '血洗'], // 兜底默认值；实际由 _complyFixTuCheng 语境化处理（同句含「屠戮/屠杀」→「城破」）
  ['满清余孽', '清廷残部'], ['满清清廷', '清廷'], ['满清', '清廷'],
  ['英国东印度公司', '西夷海商集团'], ['荷兰东印度公司', '和兰海商集团'], ['东印度公司', '西夷海商集团'],
  ['西班牙殖民者', '佛郎据港之夷'], ['荷兰殖民者', '和兰据港之夷'], ['殖民者', '据港之西夷'],
  ['殖民澳洲', '垦拓南洲'], ['殖民', '海疆经略'],
  ['大英帝国', '极西首邦'], ['泰晤士河', '极西大河'], ['伦敦', '极西都会'], ['英国', '西夷海邦'],
  ['西班牙', '佛郎'], ['荷兰', '和兰'], ['印度', '天竺'], ['澳洲', '南洲'], ['天皇', '岛国之主'],
  ['中华民族', '华夏'], ['日不落帝国', '万国通市之邦'], ['日不落', '万国通市'], ['设省', '置宣慰司'],
  ['屠杀', '屠戮'], ['鞑虏', '清军'], ['异族', '外邦'], ['灭族', '覆亡'],
  ['满汉存亡', '天下存亡'], ['民族存亡', '社稷存亡'], ['民族尊严', '国体尊严'], ['低维文明', '异域文明'],
]
// 🔥 #226d「屠城」语境化替换：优先于通用词表执行。以 。！？；\n 切句，同句已含「屠戮/屠杀」时取
//   「城破」，否则取「血洗」，避免同句出现「屠戮…血洗」的近义重复（配合 屠杀→屠戮 的既有口径）。
const _complyFixTuCheng = function (s: string): string {
  if (s.indexOf('屠城') === -1) return s
  return s.split(/([。！？；\n])/).map(function (seg) {
    if (seg.indexOf('屠城') === -1) return seg
    const rep = (seg.indexOf('屠戮') !== -1 || seg.indexOf('屠杀') !== -1) ? '城破' : '血洗'
    return seg.split('屠城').join(rep)
  }).join('')
}
const _complyCleanText = function (s: string): string {
  let t = _complyFixTuCheng(s)
  for (let i = 0; i < _COMPLY_MAP.length; i++) {
    const a = _COMPLY_MAP[i][0], b = _COMPLY_MAP[i][1]
    if (t.indexOf(a) !== -1) t = t.split(a).join(b)
  }
  t = t.split('清廷清廷').join('清廷') // 收尾去重（防 满清+清廷 叠加成 清廷清廷）
  t = t.split('剃发之令，剃发之令').join('剃发之令') // 整句口号+半句 叠加去重
  t = t.split('剃发之令」五字').join('剃发之令」四字') // 口号由 5 字替换为 4 字，量词同步修正
  return t
}
const _complyCleanDeep = function (node: any): any {
  if (node == null) return node
  if (typeof node === 'string') return _complyCleanText(node)
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) node[i] = _complyCleanDeep(node[i]); return node }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) {
      if (k === '_secRev' || k === '_charsRev' || k === '_charsRevAt') continue
      node[k] = _complyCleanDeep(node[k])
    }
    return node
  }
  return node
}
const _COMPLY_DESIGN_KEYS = ['idea', 'synopsis', 'outline', 'worldbuilding', 'factions', 'keyPlots',
  'relationships', 'powerSystem', 'worldSettings', 'foreshadowings', 'timelineEvents', 'characters']
const _guardComplianceWords = function (payload: any, _novelId?: string) {
  try {
    if (!payload || typeof payload !== 'object') return
    // 1) 上游设计字段（含嵌套的 userDesign，其仅做词级替换、不改写语序）
    _COMPLY_DESIGN_KEYS.forEach((k) => {
      if ((payload as any)[k] !== undefined) (payload as any)[k] = _complyCleanDeep((payload as any)[k])
    })
    // 2) 卷级字段：递归定位任意层级的 volumes 数组，清洗 summary / coreObjective / name
    const _seen: any[] = []
    const _findVols = function (node: any) {
      if (!node || typeof node !== 'object' || _seen.indexOf(node) !== -1) return
      _seen.push(node)
      if (Array.isArray(node)) { node.forEach(_findVols); return }
      for (const k of Object.keys(node)) {
        const v = (node as any)[k]
        if (k === 'volumes' && Array.isArray(v)) {
          v.forEach((vol: any) => {
            if (!vol || typeof vol !== 'object') return
            if (typeof vol.summary === 'string') vol.summary = _complyCleanText(vol.summary)
            if (typeof vol.coreObjective === 'string') vol.coreObjective = _complyCleanText(vol.coreObjective)
            if (typeof vol.name === 'string') vol.name = _complyCleanText(vol.name)
            // 🔥 #226d：残留雷词（屠城/留头不留发 等）落在章节级文本字段（summary/hook/sceneSetting…）。
            //   旧标签页 autosave 整包回写时同样需兜底，故对每章「非标题」字符串/数组字段做词级清洗；
            //   唯独跳过 title / _llmTitle（4 字标题约束不可破坏）与 id/number 等非文本标识。
            if (Array.isArray(vol.chapters)) {
              vol.chapters.forEach((ch: any) => {
                if (!ch || typeof ch !== 'object') return
                for (const ck of Object.keys(ch)) {
                  if (ck === 'title' || ck === '_llmTitle' || ck === 'id' || ck === 'number' || ck === 'chapterNumber') continue
                  const cv = (ch as any)[ck]
                  if (typeof cv === 'string') (ch as any)[ck] = _complyCleanText(cv)
                  else if (Array.isArray(cv)) (ch as any)[ck] = _complyCleanDeep(cv)
                }
              })
            }
          })
        }
        _findVols(v)
      }
    }
    _findVols(payload)
  } catch (_e) { console.error('[settings] _guardComplianceWords 合规词守卫异常（不阻断保存）:', _e) }
}

// 🔥 #226e 创作模式落库守卫 —— 前端有运行时兜底（无 creationMode 时按 userDesign 推断），但数据层
//   历史遗留 idea.creationMode === undefined（换端/清空 userDesign 会回退），此守卫把推断值落库。
//   口径：仅当 creationMode 不是合法枚举之一时，按 userDesign 是否非空推断（非空→custom，空→normal）；
//   已是合法值（用户显式选择）时不覆盖。
const _VALID_CREATION_MODES = ['normal', 'imitate', 'fanfiction', 'custom']
const _normalizeCreationMode = function (payload: any) {
  try {
    if (!payload || typeof payload !== 'object') return
    const idea = (payload as any).idea
    if (!idea || typeof idea !== 'object') return
    const cur = (idea as any).creationMode
    if (typeof cur === 'string' && _VALID_CREATION_MODES.indexOf(cur) !== -1) return // 合法值不覆盖
    const ud = String((idea as any).userDesign || '').trim()
    ;(idea as any).creationMode = ud.length > 0 ? 'custom' : 'normal'
  } catch (_e) { console.error('[settings] _normalizeCreationMode 创作模式归一异常（不阻断）:', _e) }
}

// 🔥 #219b userDesign 旧句守卫：旧标签页带回的残句（「非遗实系统」/旧题材定位行）就地修复为
//   与 15 个作品类型 chips 对齐的新表述（前后文一致性，用户 #219 问题①）。
const _UD_OLD_LINE = '【题材定位】历史架空（明末清初）穿越权谋军事爽文，双女主，国运争霸，种田经商，扮猪吃虎废材逆袭，系统流先知流任务流面板流元素并用（以穿越者知识为核心金手指，非遗实系统）。'
const _UD_NEW_LINE = '【题材定位】历史架空、两宋元明（明末清初），穿越权谋军事爽文；双女主；国运争霸；种田经商；扮猪吃虎、废材逆袭；系统流、签到流、任务流、面板流元素并用（金手指为先知类穿越者知识体系，非超人力外挂系统，系统面板仅作任务提示与进度呈现）。'
const _guardUserDesign = function (idea: unknown) {
  try {
    if (!idea || typeof idea !== 'object') return
    const ud = (idea as any).userDesign
    if (typeof ud !== 'string' || !ud) return
    if (ud.indexOf('非遗实系统') === -1 && ud.indexOf('系统流先知流任务流面板流元素并用') === -1) return
    let out = ud.split(_UD_OLD_LINE).join(_UD_NEW_LINE)
    out = out.split('【金手指设计（非系统）】').join('【金手指设计（先知类·非外挂系统）】')
    out = out.split('非遗实系统').join('非外挂系统')
    ;(idea as any).userDesign = out
  } catch (_e) { console.error('[settings] _guardUserDesign 旧句守卫异常（不阻断）:', _e) }
}

// 🔥 #201 全环节版本守卫：把 #199 的 characters rev 机制推广到 batch 的全部核心环节
//   （idea/synopsis/outline/keyPlots/factions/relationships/worldbuilding/powerSystem + chapters 结构）。
//   旧页面/旧 localStorage 快照 batch 回写时，落后环节整键拒收（服务端赢），其余环节照常合并。
//   注意：章节正文存于 .tuzhong-data/chapters/ 独立文件（/api/chapters 自管），不经 settings batch，不受影响。
const _anySectionNonEmpty = function (v: any): boolean {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') {
    for (const k of Object.keys(v)) {
      const vv = (v as any)[k]
      if (typeof vv === 'string' ? !!String(vv).trim() : !!vv) return true
    }
    return false
  }
  if (typeof v === 'string') return !!v.trim()
  return false
}
const _secRevGuard = function (entry: Record<string, any>, key: string, incRevRaw: unknown): { accept: boolean; serverRev: number; nextRev: number } {
  const _map = (entry && entry._secRev && typeof entry._secRev === 'object') ? entry._secRev : {}
  const srvRev = Number(_map[key]) || 0
  const hasIncRev = incRevRaw != null && String(incRevRaw) !== ''
  const incRev = hasIncRev ? (Number(incRevRaw) || 0) : 0
  const existingNonEmpty = _anySectionNonEmpty(entry ? (entry as any)[key] : undefined)
  if (!existingNonEmpty) return { accept: true, serverRev: srvRev, nextRev: Math.max(srvRev, incRev) + 1 }
  if (srvRev === 0 && !hasIncRev) {
    try { entry._secRev = entry._secRev || {}; (entry._secRev as any)[key] = 1 } catch (_e) { console.error('[settings] _secRev 惰性上锁失败:', _e) }
    return { accept: false, serverRev: 1, nextRev: 1 }
  }
  if (incRev < srvRev) return { accept: false, serverRev: srvRev, nextRev: srvRev }
  return { accept: true, serverRev: srvRev, nextRev: Math.max(srvRev, incRev) + 1 }
}
// 单环节写入方（worldbuilding/powerSystem/factions 等独立编辑页）只 bump rev 不拒收——
// 保证独立页的编辑永远可保存，同时让 wizard 旧标签页的下一次 batch 因 rev 落后被拒并自愈回拉。
const _bumpSecRev = function (entry: Record<string, any>, key: string) {
  try {
    entry._secRev = entry._secRev || {}
    const cur = Number((entry._secRev as any)[key]) || 0
    ;(entry._secRev as any)[key] = cur + 1
  } catch (_e) { console.error('[settings] _bumpSecRev 环节版本号递增异常（不阻断）:', _e) }
}

// 读取设定数据
function readSettings() {
  if (!fs.existsSync(settingsFile)) {
    return {}
  }
  try {
    const data = fs.readFileSync(settingsFile, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

// 写入设定数据
function writeSettings(data: Record<string, unknown>) {
  atomicWriteJson(settingsFile, data)
}


const checkNovelAccess = (request: Request | NextRequest, novelId: string) =>
  checkNovelAccessFor(request, novelId, '设定')

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')

  const allSettings = readSettings()

  if (novelId) {
    const access = await checkNovelAccess(request, novelId)
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
    }
    // 返回特定作品的设定
    const data = allSettings[novelId] || {}

    // 🔥🔥 先保留世界设定对象快照 {worldMap,powerSystem,...}，避免后续被转换为数组后丢失
    const snapshotWSO: Record<string, any> =
      (!Array.isArray(data.worldSettings) && data.worldSettings && typeof data.worldSettings === 'object')
        ? JSON.parse(JSON.stringify(data.worldSettings)) : {}

    // 自动从AI生成数据派生 worldSettings（如果用户未手动添加，或者是旧对象格式 {worldMap,powerSystem...} 未转换为数组格式）
    const isWSPopulatedArray = Array.isArray(data.worldSettings) && data.worldSettings.length > 0
    if (!isWSPopulatedArray) {
      const derivedWS: Record<string, unknown>[] = []
      const _today = new Date().toISOString().split('T')[0]
      if (data.worldbuilding) {
        const wb = data.worldbuilding
        if (wb.era) derivedWS.push({ id: 'wb-era', name: '时代背景', category: '历史', description: wb.era, createdAt: _today, novelId })
        if (wb.geography) derivedWS.push({ id: 'wb-geo', name: '地理环境', category: '地理', description: wb.geography, createdAt: _today, novelId })
        if (wb.history) derivedWS.push({ id: 'wb-his', name: '历史背景', category: '历史', description: wb.history, createdAt: _today, novelId })
        if (wb.powerSystem) derivedWS.push({ id: 'wb-ps', name: '力量体系', category: '力量体系', description: wb.powerSystem, createdAt: _today, novelId })
        if (wb.socialStructure) derivedWS.push({ id: 'wb-ss', name: '社会结构', category: '规则设定', description: wb.socialStructure, createdAt: _today, novelId })
        if (wb.technology) derivedWS.push({ id: 'wb-tech', name: '科技工艺', category: '物品道具', description: wb.technology, createdAt: _today, novelId })
        if (wb.culturalFeatures) derivedWS.push({ id: 'wb-cul', name: '文化风俗', category: '历史', description: wb.culturalFeatures, createdAt: _today, novelId })
        if (wb.secretHistory) derivedWS.push({ id: 'wb-secret', name: '隐秘历史', category: '历史', description: wb.secretHistory, createdAt: _today, novelId })
        if (wb.coreSettings) derivedWS.push({ id: 'wb-core', name: '核心设定', category: '规则设定', description: wb.coreSettings, createdAt: _today, novelId })
        if (wb.rules) derivedWS.push({ id: 'wb-rules-main', name: '世界规则', category: '规则设定', description: typeof wb.rules === 'string' ? wb.rules : (Array.isArray(wb.rules) ? wb.rules.join('；') : ''), createdAt: _today, novelId })
        if (Array.isArray(wb.rules)) wb.rules.forEach(function(rule: string, i: number) {
          if (i > 0) derivedWS.push({ id: 'wb-rule-' + i, name: '规则' + (i + 1), category: '规则设定', description: rule, createdAt: _today, novelId })
        })
      }
      if (data.powerSystem) {
        const wps = data.powerSystem
        if (wps.worldPowerSystem) {
          derivedWS.push({ id: 'ps-main', name: wps.worldPowerSystem.name || '世界力量体系', category: '力量体系', description: wps.worldPowerSystem.description || JSON.stringify(wps.worldPowerSystem), createdAt: _today, novelId })
        }
        // 主角能力/金手指作为物品道具或力量体系
        if (wps.protagonistAbility || wps.protagonistAbilities) {
          const _abList = wps.protagonistAbilities || (wps.protagonistAbility ? [wps.protagonistAbility] : [])
          if (Array.isArray(_abList)) _abList.forEach(function(ab, i: number) {
            if (!ab || typeof ab !== 'object') return
            const _abName = ab.name || ('主角能力' + (i + 1))
            const _abDesc = ab.description || ab.effect || ''
            let _abCat = '力量体系'
            // 戒指/剑/刀/鼎/塔/珠/镜/符/印 等实物归物品道具
            if (/戒|剑|刀|鼎|塔|珠|镜|符|印|枪|弓|甲|衣|盘|书|卷|壶|钟/.test(_abName)) _abCat = '物品道具'
            derivedWS.push({ id: 'ps-ab-' + i, name: _abName, category: _abCat, description: _abDesc, createdAt: _today, novelId })
          })
        }
      }
      if (data.factions && Array.isArray(data.factions.factions)) {
        data.factions.factions.forEach(function(f: any, i: number) {
          derivedWS.push({ id: 'fac-' + i, name: f.name, category: '组织势力', description: f.description || (f.leader ? '首领：' + f.leader : ''), createdAt: _today, novelId })
        })
      }
      // 🔥 种族生物：从人物/主角背景/技能/世界观/势力中提取种族、魔兽、血脉信息
      const _creatureSet: Record<string, string> = {}
      function addCreature(name: string, desc: string) {
        if (!name || name.length < 2) return
        if (!_creatureSet[name]) _creatureSet[name] = desc || name
      }
      if (data.characters) {
        const _chars = data.characters
        let _allCharList: Record<string, unknown>[] = []
        if (_chars.protagonist) _allCharList.push(_chars.protagonist)
        if (Array.isArray(_chars.femaleLeads)) _allCharList = _allCharList.concat(_chars.femaleLeads)
        if (_chars.femaleLead) _allCharList.push(_chars.femaleLead)
        if (Array.isArray(_chars.antagonists)) _allCharList = _allCharList.concat(_chars.antagonists)
        if (_chars.antagonist) _allCharList.push(_chars.antagonist)
        if (Array.isArray(_chars.supporting)) _allCharList = _allCharList.concat(_chars.supporting)
        _allCharList.forEach(function(c) {
          if (!c) return
          // 🔥 #196 防御：skills 在 UI 侧是 string（核心技能/杀手锏 textarea），此处旧代码
          //   按 string[] 调 .join → TypeError → 整个 GET /api/settings 500，草稿同步全挂。
          const _skillsTxt = Array.isArray(c.skills) ? (c.skills as string[]).join('；') : String(c.skills || '')
          const _cText = [c.identity, c.background, c.appearance, c.personality, _skillsTxt].filter(Boolean).join('|')
          // 提取种族/生命形态：兼顾奇幻与科幻（星际/基因进化）
          const _raceMatches = _cText.match(/(机械族|硅基生命|碳基生命|虫族|星兽|异兽|基因兽|智慧种族|外星文明|机械神教|AI生命|能量生命|龙血战士|终极战士|魔法师|骑士|圣域强者|精灵|矮人|龙族|兽人|魔族|神族|血族|妖精|魔兽|神兽|圣兽|巨龙|亡灵|巫妖|天使|恶魔|半神|巨人|泰坦)/g)
          if (_raceMatches) _raceMatches.forEach(function(r: string) { addCreature(r, '作品中出现的种族/生命形态：' + r) })
        })
      }
      // 从worldbuilding补充种族
      if (data.worldbuilding) {
        const _wbRaceField = data.worldbuilding.raceSystem || data.worldbuilding.races || data.worldbuilding.species || ''
        const _wbText = [data.worldbuilding.era, data.worldbuilding.geography, data.worldbuilding.history, data.worldbuilding.powerSystem, data.worldbuilding.culturalFeatures, data.worldbuilding.secretHistory, data.worldbuilding.coreSettings, (typeof _wbRaceField === 'string' ? _wbRaceField : JSON.stringify(_wbRaceField))].filter(Boolean).join('|')
        const _wbRaceMatches = _wbText.match(/(机械族|硅基生命|硅基文明|碳基生命|虫族|星兽|异兽|基因兽|智慧种族|智慧文明|外星文明|外星种族|神秘文明|星际文明|机械神教|AI生命|能量生命|异族|龙血战士|精灵|矮人|龙族|兽人|魔族|神族|血族|妖精|魔兽|神兽|圣兽|巨龙|亡灵|巫妖|恶魔|天使|人鱼|海族|巨人|泰坦|半身人|侏儒)/g)
        if (_wbRaceMatches) _wbRaceMatches.forEach(function(r: string) { addCreature(r, '世界观中记载的种族/生命形态：' + r) })
      }
      // 从 factions 补充（外星势力常含种族属性）
      if (data.factions && Array.isArray(data.factions.factions)) {
        data.factions.factions.forEach(function(f: any) {
          if (!f || !f.name) return
          const _ft = [f.name, f.type, f.description].filter(Boolean).join('|')
          const _fr = _ft.match(/(机械族|硅基生命|碳基生命|虫族|星兽|异兽|基因兽|智慧种族|外星文明|机械神教|AI生命|能量生命|魔族|神族|血族|龙族|兽人)/g)
          if (_fr) _fr.forEach(function(r: string) { addCreature(r, (f.description || ('势力【' + f.name + '】关联的种族/生命形态')) .slice(0, 120)) })
        })
      }
      Object.keys(_creatureSet).forEach(function(cName, i) {
        derivedWS.push({ id: 'race-' + i, name: cName, category: '种族生物', description: _creatureSet[cName], createdAt: _today, novelId })
      })
      // 🔥🔥 追加：从世界设定对象格式 {worldMap, powerSystem, cultivationMethods...} 也转成数组条目
      if (!Array.isArray(data.worldSettings) && data.worldSettings && typeof data.worldSettings === 'object') {
        const wso: Record<string, any> = data.worldSettings as any
        // worldMap -> 地理
        if (typeof wso.worldMap === 'string' && wso.worldMap.length > 5) {
          derivedWS.push({ id: 'wsobj-worldMap', name: '世界地图/架构', category: '地理', description: wso.worldMap, createdAt: _today, novelId })
        }
        // powerSystem (worldSettings对象下) -> 力量体系
        if (typeof wso.powerSystem === 'string' && wso.powerSystem.length > 5) {
          derivedWS.push({ id: 'wsobj-powerSystem', name: '力量修炼体系', category: '力量体系', description: wso.powerSystem, createdAt: _today, novelId })
        }
        if (typeof wso.cultivationMethods === 'string' && wso.cultivationMethods.length > 5) {
          derivedWS.push({ id: 'wsobj-cultivationMethods', name: '修炼功法品阶', category: '力量体系', description: wso.cultivationMethods, createdAt: _today, novelId })
        }
        if (typeof wso.forcesFactions === 'string' && wso.forcesFactions.length > 5) {
          derivedWS.push({ id: 'wsobj-forcesFactions', name: '势力组织总览', category: '组织势力', description: wso.forcesFactions, createdAt: _today, novelId })
        }
        if (typeof wso.geographyRegions === 'string' && wso.geographyRegions.length > 5) {
          derivedWS.push({ id: 'wsobj-geographyRegions', name: '地理区域划分', category: '地理', description: wso.geographyRegions, createdAt: _today, novelId })
        }
        if (typeof wso.historicalEvents === 'string' && wso.historicalEvents.length > 5) {
          derivedWS.push({ id: 'wsobj-historicalEvents', name: '世界重大历史', category: '历史', description: wso.historicalEvents, createdAt: _today, novelId })
        }
      }
      data.worldSettings = derivedWS
    }

    // 自动从keyPlots/outline派生 timelineEvents（如果用户未手动添加）
    if (!data.timelineEvents || data.timelineEvents.length === 0) {
      const derivedTL: Record<string, unknown>[] = []
      let chapterCounter = 0
      // 🔥🔥 新增：从 plotOutline (stage1~stage4) 派生 timelineEvents（数据迁移产生的字段）
      if (data.plotOutline && typeof data.plotOutline === 'object' && !data.keyPlots?.volumes?.length && !data.outline?.stages?.length) {
        const stageKeys = ['stage1', 'stage2', 'stage3', 'stage4'].filter(function (sk) { return !!data.plotOutline[sk] })
        const DEFAULT_WC = ['15万', '40万', '80万', '100万']
        stageKeys.forEach(function (sk, si) {
          const stg: any = data.plotOutline[sk]
          if (!stg) return
          const sTitle = stg.title || ('第' + (si + 1) + '阶段')
          const sSummary = stg.summary || ''
          const keyEvents: string[] = Array.isArray(stg.keyEvents) ? stg.keyEvents : []
          const wcStr = (stg.expectedWordCount || DEFAULT_WC[si] || '20万').toString()
          const wcMatch = wcStr.match(/(\d+)/)
          // 粗略估算：1万字约3章
          let volChapters = wcMatch ? Math.max(Math.round(parseInt(wcMatch[1]) / 3), 5) : 15
          derivedTL.push({
            id: 'po-vol-' + si,
            chapter: chapterCounter + 1,
            title: sTitle,
            description: sSummary,
            isMainline: true,
          })
          if (keyEvents.length > 0) {
            keyEvents.forEach(function (evt: string, ei: number) {
              derivedTL.push({
                id: 'po-' + si + '-' + ei,
                chapter: chapterCounter + Math.ceil((ei + 1) * volChapters / (keyEvents.length + 1)),
                title: sTitle + '·事件' + (ei + 1),
                description: evt,
                isMainline: true,
              })
            })
          }
          chapterCounter += volChapters
        })
      }
      if (data.keyPlots) {
        const kp = data.keyPlots
        var _stripVolPrefix = function (nm: string) { return String(nm || '').replace(/^第[一二三四五六七八九十百千零\d]+卷[·:：\s]*/, '').trim() }
        var _nodeChapter = function (n: any): number { var m = String(n && n.chapterRange || '').match(/(\d+)/); return m ? parseInt(m[1], 10) : 0 }
        // 预计算每卷最小章号 + 全局最大章号
        var _volMinChap: Record<number, number> = {}
        var _maxChap = 0
        if (Array.isArray(kp.keyPlots)) {
          kp.keyPlots.forEach(function (n: any) {
            var ch = _nodeChapter(n); var vn = n.volume || 1
            if (ch > 0) { if (_volMinChap[vn] == null || ch < _volMinChap[vn]) _volMinChap[vn] = ch; if (ch > _maxChap) _maxChap = ch }
          })
        }
        if (_maxChap === 0) _maxChap = 30
        // 卷头：去重复前缀，章号取该卷首个节点章号（无节点则按卷序估算）
        if (Array.isArray(kp.volumes)) {
          kp.volumes.forEach(function (v: any, vi: number) {
            if (v.summary || v.name) {
              var _vch = _volMinChap[vi + 1] || Math.max(1, Math.round((vi) * _maxChap / Math.max(kp.volumes.length, 1)) + 1)
              derivedTL.push({
                id: 'kp-vol-' + vi,
                chapter: _vch,
                title: '第' + (vi + 1) + '卷·' + (_stripVolPrefix(v.name || v.title) || ('卷' + (vi + 1))),
                description: v.summary || '',
                isMainline: true,
                isVolumeHeader: true,
              })
            }
          })
        }
        // 事件：用真实关键剧情节点标题 + 节点章号
        if (Array.isArray(kp.keyPlots)) {
          kp.keyPlots.forEach(function (n: any, ni: number) {
            if (!n) return
            var _ntitle = _stripVolPrefix(n.title || '') || ('节点' + (ni + 1))
            var _nch = _nodeChapter(n) || (ni + 1)
            derivedTL.push({ id: 'kp-node-' + ni, chapter: _nch, volume: n.volume || 1, title: _ntitle, description: String(n.summary || n.impact || '').slice(0, 200), isMainline: true })
          })
        }
        if (kp.climax) { derivedTL.push({ id: 'kp-climax', chapter: _maxChap, title: '故事高潮', description: String(kp.climax).slice(0, 200), isMainline: true }) }
        if (kp.ending) { derivedTL.push({ id: 'kp-ending', chapter: _maxChap + 1, title: '结局', description: String(kp.ending).slice(0, 200), isMainline: true }) }
        if (Array.isArray(kp.turningPoints)) {
          kp.turningPoints.forEach(function (tp: any, i: number) {
            const _tpDesc = typeof tp === 'string' ? tp : (tp.description || tp.impact || tp.event || '')
            const _tpName = (typeof tp === 'string') ? String(tp).slice(0, 12) : (tp.name || String(_tpDesc).split(/[，。；]/)[0].slice(0, 12) || ('转折' + (i + 1)))
            derivedTL.push({ id: 'kp-tp-' + i, chapter: Math.max(1, Math.round((i + 1) * _maxChap / (kp.turningPoints.length + 1))), title: _tpName, description: String(_tpDesc).slice(0, 200), isMainline: false })
          })
        }
      }
      // 补充 outline 的 keyEvents（兼容 mainEvent 字符串 和 mainEvents 数组）
      if (data.outline && Array.isArray(data.outline.stages)) {
        data.outline.stages.forEach(function(stg: any, si: number) {
          if (!stg) return
          const stageTitle = stg.name || ('阶段' + (si + 1))
          const stageCh = Math.ceil((si + 1) * Math.max(chapterCounter, 60) / (data.outline.stages.length + 1))
          // 单事件字符串
          if (stg.mainEvent) {
            derivedTL.push({
              id: 'ol-stg-' + si,
              chapter: stageCh,
              title: stageTitle,
              description: stg.mainEvent + (stg.shuangPoint ? '（爽点：' + stg.shuangPoint + '）' : ''),
              isMainline: true,
            })
          }
          // 多事件数组
          if (Array.isArray(stg.mainEvents) && stg.mainEvents.length > 0) {
            stg.mainEvents.forEach(function(evt: string, ei: number) {
              if (!evt || typeof evt !== 'string') return
              derivedTL.push({
                id: 'ol-stg-' + si + '-' + ei,
                chapter: Math.max(1, Math.ceil(stageCh - 30 + (ei + 1) * 60 / (stg.mainEvents.length + 1))),
                title: stageTitle + '·事件' + (ei + 1),
                description: evt + (Array.isArray(stg.shuangPoints) && stg.shuangPoints[ei] ? '（爽点：' + stg.shuangPoints[ei] + '）' : ''),
                isMainline: true,
              })
            })
          }
        })
      }
      data.timelineEvents = derivedTL
    }

    // 自动从keyPlots/outline/idea/factions/relationships 派生 foreshadowings（如果用户未手动添加）
    if (!data.foreshadowings || data.foreshadowings.length === 0) {
      const derivedFS: Record<string, unknown>[] = []
      let _fsCounter = 0
      // 已写章数（用于判定伏笔是否已回收）
      let _writtenChapters = 0
      try {
        if (data.chapters && Array.isArray(data.chapters.generatedContent)) _writtenChapters = data.chapters.generatedContent.filter(function (c: any) { return c && c.content && c.content.length > 50 }).length
        else if (data.chapters && Array.isArray(data.chapters.chapters)) _writtenChapters = data.chapters.chapters.length
      } catch (e) { console.error('[settings] 统计已写章数（data.chapters）失败:', e) }
      try {
        if (_writtenChapters === 0) {
          const fs2 = require('fs')
          const path2 = require('path')
          const _chFile = path2.join(process.cwd(), '.tuzhong-data', 'chapters', String(novelId) + '.json')
          if (fs2.existsSync(_chFile)) {
            const _chData = JSON.parse(fs2.readFileSync(_chFile, 'utf-8'))
            const _arr = Array.isArray(_chData) ? _chData : (_chData && _chData.chapters) || []
            _writtenChapters = _arr.filter(function (c: any) { return c && c.content && c.content.length > 50 }).length
          }
        }
      } catch (e) { console.error('[settings] 读取章节文件统计已写章数失败:', e) }
      const _pushFs = function(name: string, content: string, type: string, planted: number, recover: number, importance: number) {
        if (content && content.length > 3) {
          _fsCounter++
          derivedFS.push({
            id: 'fs-' + _fsCounter,
            name: name,
            content: content,
            type: type,
            plantedChapter: planted,
            plannedRecoveryChapter: recover,
            status: (recover > 0 && recover <= _writtenChapters) ? 'recovered' : 'active',
            importance: importance,
          })
        }
      }
      // 🔥 2026-08-27 去模板化：伏笔名/内容只用小说原文短语，不加"势力·/阶段·/关系·/伏笔N"等归类前缀与【】包裹
      var _clause = function (t: string, max: number): string {
        var s = String(t || '').trim().split(/[。！？；，,、]/)[0].trim()
        if (!s) s = String(t || '').trim()
        return s.slice(0, max || 16)
      }
      // 关键剧情转折点
      if (data.keyPlots && Array.isArray(data.keyPlots.turningPoints)) {
        data.keyPlots.turningPoints.forEach(function(tp: any, i: number) {
          const _tpDesc = typeof tp === 'string' ? tp : (tp.event || tp.description || tp.impact || tp.name || '')
          const _tpName = (typeof tp === 'string') ? _clause(tp, 16) : (tp.name || _clause(_tpDesc, 16))
          if (_tpDesc && _tpDesc.length > 3) {
            _pushFs(_tpName, String(_tpDesc).slice(0, 200), i % 3 === 0 ? '主线' : (i % 3 === 1 ? '身份' : '金手指'),
              Math.ceil((i + 1) * 10 / (data.keyPlots.turningPoints.length + 1)),
              Math.ceil((i + 1) * 30 / (data.keyPlots.turningPoints.length + 1)) + 10, 5 - (i % 3))
          }
        })
      }
      // 分卷钩子/核心冲突
      if (data.keyPlots && Array.isArray(data.keyPlots.volumes)) {
        data.keyPlots.volumes.forEach(function(v: any, vi: number) {
          if (v.hook && v.hook.length > 5) {
            _pushFs(_clause(v.hook, 16), String(v.hook).slice(0, 200), '卷末钩子', 1 + vi * 20, (vi + 1) * 20, 4)
          }
          if (v.coreConflict && v.coreConflict.length > 5 && vi === 0) {
            _pushFs(_clause(v.coreConflict, 16), String(v.coreConflict).slice(0, 200), '主线', 1, 50, 5)
          }
        })
      }
      // outline 阶段
      if (data.outline && Array.isArray(data.outline.stages)) {
        data.outline.stages.forEach(function(st: any, i: number) {
          const _stName = st.name || st.stageName || ('第' + (i + 1) + '阶段')
          const _stSummary = st.summary || st.mainEvent || ''
          if (_stSummary && _stSummary.length > 5) {
            _pushFs(String(_stName).slice(0, 16), String(_stSummary).slice(0, 200), '主线',
              1 + i * Math.floor(300 / Math.max(data.outline.stages.length, 1)), 1 + (i + 1) * Math.floor(300 / Math.max(data.outline.stages.length, 1)), 5)
          }
        })
      }
      // 势力
      if (data.factions && Array.isArray(data.factions.factions)) {
        data.factions.factions.slice(0, 8).forEach(function(f: any, i: number) {
          if (!f || !f.name) return
          const _desc = (typeof f.description === 'string' ? f.description : (f.goal || ''))
          const _rel = f.relationToProtagonist || f.attitude || ''
          if (_desc || _rel) {
            _pushFs(String(f.name).slice(0, 16), (String(_desc || '') + (_rel ? ('。与主角：' + _rel) : '')).slice(0, 200), '势力',
              1 + i * 30, 1 + i * 30 + 60, 4)
          }
        })
      }
      // 主角身世
      if (data.characters && data.characters.protagonist) {
        const _protag = data.characters.protagonist
        if (_protag.background && _protag.background.length > 20) {
          _pushFs('主角身世', String(_protag.background).slice(0, 200), '身份', 1, 80, 4)
        }
      }
      if (data.characters && Array.isArray(data.characters.antagonists)) {
        data.characters.antagonists.slice(0, 4).forEach(function(an: any, i: number) {
          if (!an || !an.name) return
          const _threat = an.threat || an.motive || an.background || ''
          if (_threat) { _pushFs(String(an.name).slice(0, 16), String(_threat).slice(0, 200), '反派', 5 + i * 20, 50 + i * 30, 4) }
        })
      }
      if (data.characters && Array.isArray(data.characters.supporting)) {
        data.characters.supporting.slice(0, 6).forEach(function(sp: any, i: number) {
          if (!sp || !sp.name) return
          const _arc = sp.arc || sp.experience || sp.background || ''
          if (_arc) { _pushFs(String(sp.name).slice(0, 16), String(_arc).slice(0, 200), '人物', 10 + i * 25, 70 + i * 25, 3) }
        })
      }
      // 关系反转
      if (data.relationships && Array.isArray(data.relationships.relationships)) {
        data.relationships.relationships.slice(0, 8).forEach(function(r: any, i: number) {
          if (!r) return
          const _desc = r.description || r.dynamics || ''
          const _from = r.from || r.character1 || ''
          const _to = r.to || r.character2 || ''
          if (_desc && _from && _to) {
            _pushFs((_from + '与' + _to).slice(0, 16), String(_desc).slice(0, 200), '关系', 8 + i * 20, 60 + i * 20, 4)
          }
        })
      }
      // 从idea核心卖点/冲突提取
      if (data.idea && data.idea.coreConflict && data.idea.coreConflict.length > 5) {
        _pushFs(_clause(data.idea.coreConflict, 16), String(data.idea.coreConflict).slice(0, 200), '主线', 1, 100, 5)
      }
      data.foreshadowings = derivedFS
    }

    // 🔥 2026-08-27 #3：人物关系为空时，从 characters 派生完整关系（主角↔女主/反派/配角/导师），供图谱渲染
    try {
      const _relEmpty = !data.relationships || (typeof data.relationships === 'object' && Object.keys(data.relationships).length === 0) || (data.relationships && Array.isArray(data.relationships.relationships) && data.relationships.relationships.length === 0)
      if (_relEmpty && data.characters) {
        const c = data.characters
        const proto = c.protagonist && c.protagonist.name ? c.protagonist.name : ''
        const nodesMap: Record<string, any> = {}
        const rels: any[] = []
        const addNode = function (name: string, role: string) { if (name && !nodesMap[name]) nodesMap[name] = { id: name, name: name, role: role || '' } }
        const addRel = function (from: string, to: string, relation: string, desc: string) { if (from && to && from !== to) rels.push({ from: from, to: to, relation: relation || '关联', description: String(desc || '').slice(0, 120) }) }
        addNode(proto, '主角')
        const _fls = Array.isArray(c.femaleLeads) ? c.femaleLeads : (c.femaleLead ? [c.femaleLead] : [])
        _fls.forEach(function (f: any) { if (f && f.name) { addNode(f.name, f.role || '女主'); addRel(proto, f.name, f.relationship || '恋人/女主', f.identity || f.background) } })
        const _ants = Array.isArray(c.antagonists) ? c.antagonists : (c.antagonist ? [c.antagonist] : [])
        _ants.forEach(function (a: any) { if (a && a.name) { addNode(a.name, a.role || '反派'); addRel(proto, a.name, a.relationship || '敌对', a.motive || a.identity || a.background) } })
        ;(Array.isArray(c.supporting) ? c.supporting : []).forEach(function (s: any) { if (s && s.name) { addNode(s.name, s.role || s.identity || '配角'); addRel(proto, s.name, s.relationship || '同伴', s.identity || s.background) } })
        ;(Array.isArray(c.masters) ? c.masters : (c.mentor ? [c.mentor] : [])).forEach(function (m: any) { if (m && m.name) { addNode(m.name, m.role || '导师'); addRel(proto, m.name, m.relationship || '师徒', m.identity || m.background) } })
        if (rels.length > 0) data.relationships = { nodes: Object.values(nodesMap), relationships: rels }
      }
    } catch (_relErr) { console.error('[settings] writeSettings 关系图派生异常（不阻断写入）:', _relErr) }

    // 🔥🔥 将 plotOutline.stages 同步为 outline { storyOrigin, mainPlot }（供前端"大纲"Tab展示）
    if ((!data.outline || typeof data.outline !== 'object' || Object.keys(data.outline).length === 0)
      && data.plotOutline && typeof data.plotOutline === 'object') {
      const storyOriginBuilder: string[] = []
      const mainPlotBuilder: string[] = []
      const stageKeys = ['stage1', 'stage2', 'stage3', 'stage4']
      for (const sk of stageKeys) {
        const stg: any = data.plotOutline[sk]
        if (!stg) continue
        if (stg.summary) storyOriginBuilder.push('【' + (stg.title || sk) + '】' + stg.summary)
        if (Array.isArray(stg.keyEvents)) mainPlotBuilder.push.apply(mainPlotBuilder, stg.keyEvents)
      }
      data.outline = {
        storyOrigin: (data.idea && (data.idea.synopsis || data.idea.coreIdea))
          ? (data.idea.synopsis || data.idea.coreIdea)
          : storyOriginBuilder.join('\n\n'),
        mainPlot: mainPlotBuilder.length > 0 ? mainPlotBuilder : undefined,
      }
    }

    // 🔥🔥 将 style + worldSettings(原对象格式) 同步为 worldbuilding（供前端"AI核心数据"Tab展示）
    // snapshotWSO 已在函数开头（worldSettings 被转换为数组之前）就准备好了
    const hasStyle = data.style && typeof data.style === 'object' && Object.keys(data.style).some(function (k) { return !!(data.style as any)[k] })
    if (Object.keys(snapshotWSO).length > 0 || hasStyle) {
      const wb = data.worldbuilding && typeof data.worldbuilding === 'object' ? data.worldbuilding : {}
      if (snapshotWSO.worldMap && !wb.geography) wb.geography = snapshotWSO.worldMap
      if (snapshotWSO.powerSystem && !wb.powerSystem) wb.powerSystem = snapshotWSO.powerSystem
      if (snapshotWSO.geographyRegions && !wb.geography) wb.geography = (wb.geography ? wb.geography + '\n' : '') + snapshotWSO.geographyRegions
      if (snapshotWSO.historicalEvents && !wb.history) wb.history = snapshotWSO.historicalEvents
      if (snapshotWSO.forcesFactions && !wb.socialStructure) wb.socialStructure = snapshotWSO.forcesFactions
      if (snapshotWSO.cultivationMethods && !wb.powerSystem) wb.powerSystem = snapshotWSO.cultivationMethods
      if ((snapshotWSO.worldMap || snapshotWSO.powerSystem) && !wb.era) {
        wb.era = (data.idea && data.idea.backgroundEra) || snapshotWSO.worldMap?.slice(0, 60) || ''
      }
      if (data.style && typeof data.style === 'object') {
        if (!wb.coreSettings && (data.style.tone || data.style.pacing || data.style.vocabulary)) {
          const parts: string[] = []
          if (data.style.tone) parts.push('整体文风：' + data.style.tone)
          if (data.style.pacing) parts.push('叙事节奏：' + data.style.pacing)
          if (data.style.vocabulary && Array.isArray(data.style.vocabulary)) parts.push('关键词汇：' + data.style.vocabulary.join('、'))
          if (parts.length > 0) wb.coreSettings = parts.join('\n')
        }
        if (!wb.culturalFeatures && Array.isArray(data.style.references)) {
          wb.culturalFeatures = '参考作品风格：' + data.style.references.join('、')
        }
      }
      data.worldbuilding = wb
    }

    // 🔥🔥 将 worldSettings(原对象格式) + style 同步为 keyPlots.volumes（供前端大纲Tab的volumes展示）
    if ((!data.keyPlots || typeof data.keyPlots !== 'object' || !Array.isArray(data.keyPlots.volumes) || data.keyPlots.volumes.length === 0)
      && data.plotOutline && typeof data.plotOutline === 'object') {
      const volumes: any[] = []
      const turningPoints: any[] = []
      const stageKeys = ['stage1', 'stage2', 'stage3', 'stage4']
      for (const sk of stageKeys) {
        const stg: any = data.plotOutline[sk]
        if (!stg) continue
        const events: string[] = Array.isArray(stg.keyEvents) ? stg.keyEvents : []
        volumes.push({
          name: stg.title || ('第' + (stageKeys.indexOf(sk) + 1) + '卷'),
          title: stg.title,
          summary: stg.summary || '',
          chapterCount: Math.ceil(parseInt((stg.expectedWordCount || '20万').toString().match(/\d+/)?.[0] || '20') / 3),
          keyEvents: events,
          openingNode: events[0] ? { event: events[0] } : undefined,
          coreObjective: events[events.length - 1] || '',
          hook: events[events.length - 1] || '',
        })
        if (events.length >= 2) {
          turningPoints.push(events[Math.floor(events.length / 2)])
        }
      }
      data.keyPlots = Object.assign({}, data.keyPlots || {}, {
        volumes: volumes,
        turningPoints: turningPoints,
        climax: volumes[2]?.summary || '',
        ending: volumes[3]?.summary || '',
      })
    }

    // 🔥🔥 #226k：第二处「派生固化写盘」——判定为 (i) 派生值持久化 → 停止落盘。派生只读视图，不落库（#226k）。
    //   原逻辑：relationships.json 中该作品为空时，从 settings.json 的 data.relationships「镜像」写入 relationships.json（旧数据兼容）。
    //   判定依据 (i)：
    //     · 写入内容 == data.relationships（权威源就是 settings.json；本 GET 的 return 也是 data.relationships，不依赖本段）；
    //     · 唯一读取方 /api/characters/relationships 自身已有同款「为空则从 settings.json 派生并返回」的回退（其 route.ts L70-90），
    //       故本段是**可重建的冗余缓存**，停掉不丢数据（读取方会按需重建）；
    //     · 触发条件限定「relationships.json 该作品为空」，此时目标文件里本无用户数据可丢。
    //   ⚠️ 未动 POST 路径的 L1596（用户保存时把真实关系合并进 relationships.json）——那属写路径用户数据，保留。
    try {
      const relFile = path.join(dataDir, 'relationships.json')
      let allRels: Record<string, unknown[]> = {}
      if (fs.existsSync(relFile)) {
        try { allRels = JSON.parse(fs.readFileSync(relFile, 'utf-8')) } catch(e) { allRels = {} }
      }
      const needSyncRels = !!(data.relationships && Array.isArray(data.relationships.relationships) && data.relationships.relationships.length > 0)
        && (!allRels[novelId] || !Array.isArray(allRels[novelId]) || allRels[novelId].length === 0)
      if (needSyncRels) {
        // #226k 派生镜像不落库（/api/characters/relationships 会按需重建）
      }
    } catch(e) {
      console.error('[settings GET] 同步relationships失败', e)
    }

    // 🔥 持久化派生数据到settings.json，避免下次重复派生
    let needPersistDerived = false
    const derivedPatch: Record<string, any> = {}
    if (!allSettings[novelId]) {
      allSettings[novelId] = {}
      needPersistDerived = true
    }
    // worldSettings 仅当原本不是 populated array 时，才写回新派生的 array (覆盖旧对象格式)
    const originalIsPopulatedArray = Array.isArray(allSettings[novelId].worldSettings) && allSettings[novelId].worldSettings.length > 0
    if (data.worldSettings && data.worldSettings.length > 0 && !originalIsPopulatedArray) {
      allSettings[novelId].worldSettings = data.worldSettings
      derivedPatch.worldSettings = data.worldSettings
      needPersistDerived = true
    }
    const origTimelinePop = Array.isArray(allSettings[novelId].timelineEvents) && allSettings[novelId].timelineEvents.length > 0
    if (data.timelineEvents && data.timelineEvents.length > 0 && !origTimelinePop) {
      allSettings[novelId].timelineEvents = data.timelineEvents
      derivedPatch.timelineEvents = data.timelineEvents
      needPersistDerived = true
    }
    const origFsPop = Array.isArray(allSettings[novelId].foreshadowings) && allSettings[novelId].foreshadowings.length > 0
    if (data.foreshadowings && data.foreshadowings.length > 0 && !origFsPop) {
      allSettings[novelId].foreshadowings = data.foreshadowings
      derivedPatch.foreshadowings = data.foreshadowings
      needPersistDerived = true
    }
    // 🔥🔥 持久化 worldbuilding / outline / keyPlots (从 plotOutline / style / worldSettings 对象派生的)
    if (data.worldbuilding && typeof data.worldbuilding === 'object' && Object.keys(data.worldbuilding).length > 0) {
      const curWb = allSettings[novelId].worldbuilding && typeof allSettings[novelId].worldbuilding === 'object' ? Object.keys(allSettings[novelId].worldbuilding).length : 0
      if (curWb === 0) {
        allSettings[novelId].worldbuilding = data.worldbuilding
        derivedPatch.worldbuilding = data.worldbuilding
        needPersistDerived = true
      }
    }
    if (data.outline && typeof data.outline === 'object' && (data.outline.storyOrigin || data.outline.mainPlot)) {
      const curO = allSettings[novelId].outline
      if (!curO || typeof curO !== 'object' || (!curO.storyOrigin && !Array.isArray(curO.mainPlot))) {
        allSettings[novelId].outline = data.outline
        derivedPatch.outline = data.outline
        needPersistDerived = true
      }
    }
    if (data.keyPlots && typeof data.keyPlots === 'object' && Array.isArray(data.keyPlots.volumes) && data.keyPlots.volumes.length > 0) {
      const curKp = allSettings[novelId].keyPlots
      if (!curKp || typeof curKp !== 'object' || !Array.isArray(curKp.volumes) || curKp.volumes.length === 0) {
        allSettings[novelId].keyPlots = data.keyPlots
        derivedPatch.keyPlots = data.keyPlots
        needPersistDerived = true
      }
    }
    // 🔥🔥 #226k：停止「派生固化回写」——派生值仅为本次响应的**只读视图**，绝不落库。
    //   背景：旧逻辑会把上方五段派生（worldSettings/timelineEvents/foreshadowings/worldbuilding/outline/keyPlots）
    //   在「原字段为空」时写回 settings.json。派生值一旦落库即成为「存量已固化派生字段」，
    //   此后上游字段改了、下游仍显示旧固化值 → 设定中心内容漂移（用户报告的 bug #3）。
    //   处置：本段不再 writeSettings；空值派生本身**保留**（见上方各段，只作用于本次响应/内存对象，前端体验不变）。
    //   落库与否须人工决定：用户要求先出「存量已固化派生字段」比对清单再逐条定去留
    //   （清单见 outputs/226_存量派生字段比对清单.md）。derivedPatch 仅保留用于日志观测。
    //   ⚠️ diff 审计：本改动只摘除「写回磁盘」路径（原 #162b 的 read-modify-write），
    //     不触碰 GET 返回体（下方 return 仍取自 data.*），故响应内容形状完全不变。
    if (needPersistDerived) {
      // #226k 派生值不落库（只读视图），derivedPatch 仅用于日志观测
    }

    return NextResponse.json({
      success: true,
      data: {
        worldSettings: data.worldSettings || [],
        foreshadowings: data.foreshadowings || [],
        timelineEvents: data.timelineEvents || [],
        worldbuilding: data.worldbuilding || {},
        powerSystem: data.powerSystem || {},
        characters: data.characters || {},
        factions: data.factions || {},
        keyPlots: data.keyPlots || {},
        cover: data.cover || {},
        idea: data.idea || {},
        synopsis: data.synopsis || {},
        outline: data.outline || {},
        relationships: data.relationships || {},
        chapters: data.chapters || {},
        lastStep: (data as Record<string, unknown>).lastStep || '',
        // 🔥 #199 人物版本号下发：客户端保存时回带，服务端据此拒绝落后回写
        _charsRev: Number((data as Record<string, unknown>)._charsRev) || 0,
        // 🔥 #201 全环节版本号下发（⚠️ 必须全环节补全默认值 0：否则新客户端对「从未写过」的环节
        //   map 缺键，会被守卫误判为未带 rev 而拒收+上锁——实测 B1/C1 假阳性根因）
        _secRev: ((): Record<string, number> => {
          const _m = (data as any)._secRev && typeof (data as any)._secRev === 'object' ? (data as any)._secRev : {}
          const _out: Record<string, number> = {}
          // 先铺「全环节默认值 0」（#201：客户端 map 缺键会被守卫误判 stale）
          for (const _k of ['idea', 'synopsis', 'characters', 'factions', 'relationships', 'keyPlots', 'outline', 'chapters', 'worldbuilding', 'powerSystem']) {
            _out[_k] = Number(_m[_k]) || 0
          }
          // 🔥 #226f：再叠加磁盘上实际存在的全部键（volumeKeyPlot 等历史/新增环节）→ 下发 superset。
          //   仅 10 键白名单会漏键 → 客户端 rev map 缺键 → 回合写被判 stale 拒收（与上方 #201 规则自相矛盾）。
          //   Set 去重 + 过滤 __proto__/constructor/prototype 防原型污染。
          const _seen = new Set<string>(Object.keys(_out))
          for (const _k of Object.keys(_m)) {
            if (_seen.has(_k)) continue
            if (_k === '__proto__' || _k === 'constructor' || _k === 'prototype') continue
            _out[_k] = Number(_m[_k]) || 0
            _seen.add(_k)
          }
          return _out
        })(),
      }
    })
  }

  // 返回所有作品的设定（按作品分组，按权限过滤）
  const actor = await getRequestActor(request)
  if (actor.isAdmin) {
    return NextResponse.json({ success: true, data: allSettings })
  }
  const filtered: Record<string, unknown> = {}
  for (const key of Object.keys(allSettings)) {
    if (isAdminOnlyNovel(key)) continue
    const meta = loadNovelMetaOrNull(key)
    if (meta && actor.userId && meta.userId === actor.userId) filtered[key] = allSettings[key]
  }
  return NextResponse.json({ success: true, data: filtered })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { novelId, type, ...settingData } = body

  if (!novelId) {
    return NextResponse.json({ success: false, error: '缺少 novelId 参数' }, { status: 400 })
  }

  // 🔥 #226c 合规词守卫：无论 characters/id 单环节分支还是 batch 分支，写入前统一对
  //   「设计字段 + 卷级字段」做词级清洗，防止旧标签页 autosave 把红线词冲回污染态（新建作品同样生效）。
  try { _guardComplianceWords(settingData as any, novelId) } catch (_e) { console.error('[settings] 合规词守卫失败（不阻断保存）:', _e) }
  // 🔥 #226e 创作模式落库守卫：creationMode 缺失/非法时按 userDesign 推断落库（单环节与 batch 统一覆盖）。
  try { _normalizeCreationMode(settingData as any) } catch (_e) { console.error('[settings] creationMode 归一失败（不阻断保存）:', _e) }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  return await runExclusive(settingsFile, async () => {
    const allSettings = readSettings()
    if (!allSettings[novelId]) {
      allSettings[novelId] = {}
    }

    if (type === 'worldSetting') {
    // 添加单个世界设定项
    if (!allSettings[novelId].worldSettings) {
      allSettings[novelId].worldSettings = []
    }
    const newSetting = {
      id: Date.now().toString(),
      ...settingData,
      createdAt: new Date().toISOString().split('T')[0],
    }
    allSettings[novelId].worldSettings.push(newSetting)
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: newSetting }, { status: 201 })
  } else if (type === 'worldbuilding') {
    // 保存完整的世界观数据
    allSettings[novelId].worldbuilding = settingData
    _bumpSecRev(allSettings[novelId] as any, 'worldbuilding') // 🔥 #201：独立页编辑后 bump，wizard 旧标签页下次 batch 将被判落后
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: allSettings[novelId].worldbuilding })
  } else if (type === 'powerSystem') {
    // 🔥 2026-11-05 金手指保护守卫：防旧标签页 autosave 回写旧版金手指——
    //   该作品金手指名称为「大明中兴签到系统」时，写入的 description 必须含「中兴币」（新版特征），否则拒收 409 要求前端重拉
    try {
      var _gfNovel = 'd8ac6b1b-0d2a-473b-adcc-1a73add1a45b'
      if (novelId === _gfNovel && settingData && settingData.protagonistAbility) {
        var _paName = String(settingData.protagonistAbility.name || '')
        var _paDesc = String(settingData.protagonistAbility.description || '')
        if (_paName.indexOf('大明中兴签到系统') >= 0 && _paDesc.indexOf('中兴币') === -1) {
          console.warn('[settings] 🛡️ 金手指保护守卫：拦截旧版金手指回写（缺「中兴币」特征），要求前端重拉最新数据')
          return NextResponse.json({ success: false, code: 'STALE_GOLDFINGER', message: '检测到旧版金手指数据（缺少中兴币设定），请刷新页面获取最新设定后再操作', data: allSettings[novelId].powerSystem }, { status: 409 })
        }
      }
    } catch (_gfE) { console.warn('[settings] 金手指守卫异常（不阻断）:', _gfE) }
    // 保存力量体系
    allSettings[novelId].powerSystem = settingData
    _bumpSecRev(allSettings[novelId] as any, 'powerSystem') // 🔥 #201
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: allSettings[novelId].powerSystem })
  } else if (type === 'characters') {
    // 保存人物设定
    // 🔥 #198 模板守卫：拦截模板垃圾回写
    try { _guardCharactersTemplates(settingData as any, allSettings[novelId].characters as any) } catch (_e) { console.error('[settings] 模板守卫失败（不阻断保存）:', _e) }
    // 🔥 女主裁撤守卫：版本新但内容缺卡 → 追加回被静默裁撤的女主卡（合并而非拒收）
    try { _guardFemaleLeads(allSettings[novelId].characters as any, settingData as any) } catch (_e) { console.error('[settings] 女主守卫失败（不阻断保存）:', _e) }
    // 🔥 #219b 权威定位粘性守卫：旧快照（缺 roleConfirmed）不得回写冲掉已确认定位/徽章
    try { _guardConfirmedChars(allSettings[novelId].characters as any, settingData as any) } catch (_e) { console.error('[settings] 定位粘性守卫失败（不阻断保存）:', _e) }
    // 🔥 #226 年龄守卫：史实人物年龄范围校验（新生成/旧快照纠正），虚构角色只做类型归一
    try { _guardCharacterAges(settingData as any, (settingData as any).idea) } catch (_e) { console.error('[settings] 年龄守卫失败（不阻断保存）:', _e) }
    // 🔥 #199 版本守卫：rev 落后/缺失 → 拒收 characters（服务端赢），惰性上锁后需先写盘
    const _g = _charsRevGuard(allSettings[novelId] as any, (settingData as any)._charsRev)
    if (!_g.accept) {
      try { writeSettings(allSettings) } catch (_we) { console.error('[settings] 守卫后写盘 writeSettings 失败:', _we) }
      console.warn('[settings POST characters] #199 拒收落后回写: novelId=', novelId, 'incRev=', (settingData as any)._charsRev, 'srvRev=', _g.serverRev)
      return NextResponse.json({ success: true, staleCharacters: true, serverRev: _g.serverRev, data: allSettings[novelId].characters })
    }
    allSettings[novelId].characters = _stripCharsRev(settingData as any) as any
    ;(allSettings[novelId] as any)._charsRev = _g.nextRev
    ;(allSettings[novelId] as any)._charsRevAt = new Date().toISOString()
    writeSettings(allSettings)
    return NextResponse.json({ success: true, serverRev: _g.nextRev, data: allSettings[novelId].characters })
  } else if (type === 'factions') {
    // 保存势力设定
    allSettings[novelId].factions = settingData
    _bumpSecRev(allSettings[novelId] as any, 'factions') // 🔥 #201
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: allSettings[novelId].factions })
  } else if (type === 'foreshadowing') {
    // 保存伏笔
    if (!allSettings[novelId].foreshadowings) {
      allSettings[novelId].foreshadowings = []
    }
    const newForeshadowing = {
      id: Date.now().toString(),
      ...settingData,
      status: 'active'
    }
    allSettings[novelId].foreshadowings.push(newForeshadowing)
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: newForeshadowing }, { status: 201 })
  } else if (type === 'timeline') {
    // 保存时间线
    if (!allSettings[novelId].timelineEvents) {
      allSettings[novelId].timelineEvents = []
    }
    const newEvent = {
      id: Date.now().toString(),
      ...settingData
    }
    allSettings[novelId].timelineEvents.push(newEvent)
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: newEvent }, { status: 201 })
  } else if (type === 'batch') {
    // 🔥 2026-09-08 #160 空数据回写防护：前端空挂载/异常状态下会把各环节刷成 {} 后批量写回，
    //    服务端非空环节数据会被整体冲掉（实测把《永历中兴》idea 清成 {}）。
    //    规则：incoming 环节为空（空对象/空数组）而 existing 环节非空时，保留 existing，跳过该键。
    const CORE_STEPS = ['idea', 'synopsis', 'characters', 'factions', 'relationships', 'keyPlots', 'outline', 'chapters', 'worldbuilding', 'powerSystem']
    const _isEmptySection = function (v: any): boolean {
      if (v == null) return true
      if (Array.isArray(v)) return v.length === 0
      if (typeof v === 'object') {
        for (const k of Object.keys(v)) {
          const vv = (v as any)[k]
          if (typeof vv === 'string' ? !!vv.trim() : !!vv) return false
        }
        return true
      }
      if (typeof v === 'string') return !v.trim()
      return false
    }
    const _protectedKeys: string[] = []
    const _safeData: Record<string, unknown> = Object.assign({}, settingData)
    for (const stepKey of CORE_STEPS) {
      const incoming = (_safeData as any)[stepKey]
      const existing = (allSettings[novelId] as any)[stepKey]
      if (incoming === undefined) continue
      if (_isEmptySection(incoming) && !_isEmptySection(existing)) {
        delete (_safeData as any)[stepKey]
        _protectedKeys.push(stepKey)
      }
    }
    if (_protectedKeys.length > 0) {
      console.warn('[settings POST batch] #160 拒绝空数据覆盖非空环节:', novelId, _protectedKeys.join(','))
    }
    // 🔥 2026-11-05 金手指守卫（batch 路径）：旧快照回写旧版金手指时拒收该键（其余键照常合并）
    if ((_safeData as any).powerSystem && novelId === 'd8ac6b1b-0d2a-473b-adcc-1a73add1a45b') {
      try {
        var _bPA = ((_safeData as any).powerSystem as any).protagonistAbility
        var _ePA = ((allSettings[novelId] as any).powerSystem as any)?.protagonistAbility
        var _bName = _bPA ? String(_bPA.name || '') : ''
        var _bDesc = _bPA ? String(_bPA.description || '') : ''
        var _eDesc = _ePA ? String(_ePA.description || '') : ''
        if (_bName.indexOf('大明中兴签到系统') >= 0 && _bDesc.indexOf('中兴币') === -1) {
          if (_eDesc.indexOf('中兴币') >= 0 || !_ePA) {
            delete (_safeData as any).powerSystem
            console.warn('[settings] 🛡️ 金手指守卫（batch）: 拦截旧版金手指回写（缺中兴币特征），保留服务端新版')
          }
        }
      } catch (_gfBE) { console.error('[settings] 金手指守卫失败（batch，不阻断）:', _gfBE) }
    }
        // 🔥 #198 模板守卫：characters 环节在合并前拦截模板垃圾回写
    if ((_safeData as any).characters && allSettings[novelId].characters) {
      try {
        _guardCharactersTemplates((_safeData as any).characters, allSettings[novelId].characters as any)
      } catch (_e) { console.error('[settings] 模板守卫失败（batch，不阻断保存）:', _e) }
    }
    // 🔥 #219b 权威定位粘性守卫：旧快照（缺 roleConfirmed）不得回写冲掉已确认定位/徽章
    if ((_safeData as any).characters && allSettings[novelId].characters) {
      try { _guardConfirmedChars(allSettings[novelId].characters as any, (_safeData as any).characters) } catch (_e) { console.error('[settings] 定位粘性守卫失败（batch，不阻断保存）:', _e) }
    }
    // 🔥 #226 年龄守卫：史实人物年龄范围校验（与 existing 是否存在无关，新书同样生效）
    if ((_safeData as any).characters) {
      try { _guardCharacterAges((_safeData as any).characters, (_safeData as any).idea) } catch (_e) { console.error('[settings] 年龄守卫失败（batch，不阻断保存）:', _e) }
    }
    // 🔥 #219b userDesign 旧句守卫：旧快照带回的残句就地修复（题材定位行对齐 chips）
    try { _guardUserDesign((_safeData as any).idea as any) } catch (_e) { console.error('[settings] userDesign 守卫失败（不阻断保存）:', _e) }
    // 🔥 #199 版本守卫：characters 落后回写拒收（服务端赢，其余键照常合并）
    let _staleChars = false
    const _incCharsRev = (_safeData as any)._charsRev
    delete (_safeData as any)._charsRev // rev 存储在作品条目层，由守卫统一写入，避免被 incoming 原样覆盖
    if ((_safeData as any).characters) {
      // 🔥 女主裁撤守卫：版本新但内容缺卡 → 追加回被静默裁撤的女主卡（合并而非拒收）
      try { _guardFemaleLeads(allSettings[novelId].characters as any, (_safeData as any).characters) } catch (_e) { console.error('[settings] 女主守卫失败（batch，不阻断保存）:', _e) }
      const _g2 = _charsRevGuard(allSettings[novelId] as any, _incCharsRev)
      if (!_g2.accept) {
        delete (_safeData as any).characters
        _staleChars = true
        console.warn('[settings POST batch] #199 拒收落后 characters 回写: novelId=', novelId, 'incRev=', _incCharsRev, 'srvRev=', _g2.serverRev)
      } else {
        (_safeData as any).characters = _stripCharsRev((_safeData as any).characters)
        ;(allSettings[novelId] as any)._charsRev = _g2.nextRev
        ;(allSettings[novelId] as any)._charsRevAt = new Date().toISOString()
      }
    }
    // 🔥 #201 全环节版本守卫：落后环节整键拒收（服务端赢），其余环节照常合并
    const _incSecRevRaw = (_safeData as any)._secRev
    const _incSecRev = (_incSecRevRaw && typeof _incSecRevRaw === 'object' && !Array.isArray(_incSecRevRaw)) ? _incSecRevRaw : {}
    delete (_safeData as any)._secRev
    const _staleSecs: string[] = []
    // 🔥 #226f：守卫范围由「固定 10 个核心环节」扩为「核心环节 ∪ 客户端本次回带的 rev 键」，使 GET 下发的
    //   全部键（如 volumeKeyPlot）能被一致地版本化；否则这些环节既不拒收也不 bump，rev 语义不一致。
    //   仅当 _safeData 实际带该环节时才处理（不发明环节）。过滤原型污染键。
    const _guardKeys: string[] = CORE_STEPS.slice()
    for (const _k of Object.keys(_incSecRev)) {
      if (_guardKeys.indexOf(_k) !== -1) continue
      if (_k === '__proto__' || _k === 'constructor' || _k === 'prototype') continue
      _guardKeys.push(_k)
    }
    for (const stepKey of _guardKeys) {
      if (stepKey === 'characters') continue // #199 已单独处理
      if ((_safeData as any)[stepKey] === undefined) continue
      const _sg = _secRevGuard(allSettings[novelId] as any, stepKey, (_incSecRev as any)[stepKey])
      if (!_sg.accept) {
        delete (_safeData as any)[stepKey]
        _staleSecs.push(stepKey)
      } else {
        (allSettings[novelId] as any)._secRev = (allSettings[novelId] as any)._secRev || {};
        ((allSettings[novelId] as any)._secRev as any)[stepKey] = _sg.nextRev
      }
    }
    if (_staleSecs.length > 0) {
      console.warn('[settings POST batch] #201 拒收落后环节回写:', novelId, _staleSecs.join(','))
    }
    Object.assign(allSettings[novelId], _safeData)

    // 同步AI生成的人物关系到独立的relationships.json（供/api/characters/relationships读取）
    // #160：使用 _safeData（被保护跳过的环节不再参与同步，避免空关系覆盖）
    const _relPayload: any = (_safeData as any).relationships
    if (_relPayload && Array.isArray(_relPayload.relationships)) {
      try {
        const relFile = path.join(dataDir, 'relationships.json')
        let allRels: Record<string, unknown[]> = {}
        if (fs.existsSync(relFile)) {
          allRels = JSON.parse(fs.readFileSync(relFile, 'utf-8'))
        }
        const existingRels = allRels[novelId] || []
        const existingKeys = new Set(existingRels.map(function(r) {
          const rr = r as { from: string; to: string; type: string }
          return rr.from + '|' + rr.to + '|' + rr.type
        }))
        const newRels = _relPayload.relationships
          .filter(function(r: any) { return r && r.from && r.to && !existingKeys.has(r.from + '|' + r.to + '|' + r.type) })
          .map(function(r: any) {
            return {
              id: r.id || Date.now().toString() + Math.random().toString(36).slice(2, 6),
              from: r.from, to: r.to, type: r.type,
              description: r.description || r.initialRelation || '',
              development: r.development || '',
              createdAt: new Date().toISOString(),
            }
          })
        allRels[novelId] = existingRels.concat(newRels)
        fs.writeFileSync(relFile, JSON.stringify(allRels, null, 2), 'utf-8')
      } catch (e) {
        console.warn('[settings] Failed to sync relationships:', e)
      }
    }

    writeSettings(allSettings)
    // 🔥 #224 性能修复：batch 保存只回带「版本号」，不再回带整条作品数据。
    //   原实现 data: allSettings[novelId] 会把该作品全部环节（含 600 章，实测 1.45MB）序列化回传，
    //   在公网 ~330KB/s 下每次保存额外多耗 4s+，并发保存时响应被中断 → ERR_INCOMPLETE_CHUNKED_ENCODING → 错误页。
    //   前端 saveSettings 仅消费 data._charsRev / data._secRev 与 staleCharacters / staleSections，故瘦身后语义不变。
    const _slimEntry = allSettings[novelId] as any
    const _slimSecRev = (_slimEntry._secRev && typeof _slimEntry._secRev === 'object' && !Array.isArray(_slimEntry._secRev)) ? _slimEntry._secRev : {}
    return NextResponse.json(Object.assign(
      { success: true, data: { _charsRev: Number(_slimEntry._charsRev) || 0, _secRev: _slimSecRev } },
      _staleChars ? { staleCharacters: true, serverRev: Number(_slimEntry._charsRev) || 0 } : {},
      _staleSecs.length > 0 ? { staleSections: _staleSecs } : {}
    ))
  } else if (type === 'cover') {
    // 保存封面数据
    allSettings[novelId].cover = {
      coverUrl: settingData.coverUrl || '',
      coverTitle: settingData.coverTitle || '',
      coverAuthor: settingData.coverAuthor || '',
      coverGenre: settingData.coverGenre || '',
      updatedAt: new Date().toISOString(),
    }
    writeSettings(allSettings)
    return NextResponse.json({ success: true, data: allSettings[novelId].cover })
  }

  return NextResponse.json({ success: false, error: '无效的类型' }, { status: 400 })
  })
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { novelId, settingId, type, ...updateData } = body

  if (!novelId) {
    return NextResponse.json({ success: false, error: '缺少 novelId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  return await runExclusive(settingsFile, async () => {
    const allSettings = readSettings()
    if (!allSettings[novelId]) {
      return NextResponse.json({ success: false, error: '作品不存在' }, { status: 404 })
    }

    if (type === 'worldSetting' && settingId) {
      const index = (allSettings[novelId].worldSettings || []).findIndex((s: any) => s.id === settingId)
    if (index !== -1) {
      allSettings[novelId].worldSettings[index] = { ...allSettings[novelId].worldSettings[index], ...updateData }
      writeSettings(allSettings)
      return NextResponse.json({ success: true, data: allSettings[novelId].worldSettings[index] })
    }
  } else if (type === 'foreshadowing' && settingId) {
    const index = (allSettings[novelId].foreshadowings || []).findIndex((f: any) => f.id === settingId)
    if (index !== -1) {
      allSettings[novelId].foreshadowings[index] = { ...allSettings[novelId].foreshadowings[index], ...updateData }
      writeSettings(allSettings)
      return NextResponse.json({ success: true, data: allSettings[novelId].foreshadowings[index] })
    }
  }

  return NextResponse.json({ success: false, error: '设定不存在' }, { status: 404 })
  })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const novelId = searchParams.get('novelId')
  const settingId = searchParams.get('settingId')
  const type = searchParams.get('type')

  if (!novelId) {
    return NextResponse.json({ success: false, error: '缺少 novelId 参数' }, { status: 400 })
  }

  const access = await checkNovelAccess(request, novelId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error || '无权访问' }, { status: access.status || 403 })
  }

  return await runExclusive(settingsFile, async () => {
    const allSettings = readSettings()
    if (!allSettings[novelId]) {
      return NextResponse.json({ success: false, error: '作品不存在' }, { status: 404 })
    }

    if (type === 'worldSetting' && settingId) {
      allSettings[novelId].worldSettings = (allSettings[novelId].worldSettings || []).filter((s: any) => s.id !== settingId)
    writeSettings(allSettings)
    return NextResponse.json({ success: true })
  } else if (type === 'foreshadowing' && settingId) {
    allSettings[novelId].foreshadowings = (allSettings[novelId].foreshadowings || []).filter((f: any) => f.id !== settingId)
    writeSettings(allSettings)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ success: false, error: '无效的请求' }, { status: 400 })
  })
}
