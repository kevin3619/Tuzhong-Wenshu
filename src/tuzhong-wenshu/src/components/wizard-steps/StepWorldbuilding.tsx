'use client'

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import type { GeneratedData } from '../ai-generate-wizard'

interface StepWorldbuildingProps {
  data: GeneratedData['worldbuilding']
  onChange: (updated: GeneratedData['worldbuilding']) => void
  onRegenerate: (step: string, field?: string) => void
  onGenerate: () => void
  isLoading: boolean
  regeneratePrompt: string
  setRegeneratePrompt: (v: string) => void
  RegenButton: React.ComponentType<{ step: string; field?: string; label: string }>
  regeneratingField: string | null
  stepName: string
}

interface SystemTypeItem {
  id: string
  name: string
  category: string
  description?: string
  realmSystem?: string
  cultivationMethod?: string
  restraintRelation?: string
}

// 🔥 Bug修复：力量体系输入可能来自后端且形态不确定 —— string / 对象{name,type,levels,description} / 含 powerSystemText 字段
// 统一归一化为结构化对象，避免对 string/undefined 调用 .replace 导致渲染崩溃、或界面出现整段原始字符串
interface PowerSystemView {
  name: string
  type: string
  levels: string[]
  ladders?: { label: string; items: string[] }[]
  rankTable?: { rank: string; civil: string; military: string }[]
  description: string
}

function powerSystemText(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name : ''
    const type = typeof o.type === 'string' ? o.type : ''
    const desc = typeof o.description === 'string' ? o.description : ''
    const text = typeof o.powerSystemText === 'string' ? o.powerSystemText : ''
    const levels = Array.isArray(o.levels)
      ? o.levels.map(function(l: unknown) {
          if (typeof l === 'object') {
            const ll = l as Record<string, unknown>
            return String(ll.name || ll.label || '')
          }
          return String(l)
        }).filter(Boolean).join('→')
      : ''
    return [name, type, desc, text, levels].filter(Boolean).join(' ')
  }
  return ''
}

function parsePowerSystemBlock(src: string, label: string): string {
  // 🔥 修复：捕获到"下一个已知块标记"为止（支持跨行、允许内部含【文官】/【武将】等子标记），
  //   否则【境界划分】后紧跟【文官】会让旧正则 [^\n【】]* 捕获为空，导致等级列表显示空。
  // 🔥 2026-09-01 修复：stop 集合必须包含【体系类型】——否则 serialize 后【体系名称】紧跟【体系类型】时，
  //   parsePowerSystemBlock('体系名称') 会一直捕获到【体系类型】块，导致"体系名称"字段显示成
  //   "明朝朝堂权力体系【体系类型】明朝朝堂权力体系" 这种串块错误。
  const known = ['体系名称', '体系描述', '境界划分', '修炼方式', '克制关系', '力量体系', '体系类型']
  const stop = known.filter(function(k) { return k !== label }).map(function(k) { return '【' + k + '】' }).join('|')
  const re = new RegExp('【' + label + '】\\s*([\\s\\S]*?)(?=' + stop + '|$)')
  const m = src.match(re)
  return m && m[1] ? m[1].trim() : ''
}

function inferPowerSystemType(text: string): string {
  if (!text) return ''
  if (/洪荒|巫族|祖巫|天庭|阐教|截教|封神|巫妖/.test(text)) return '洪荒体系'
  if (/修仙|修真|炼气|筑基|金丹|元婴|渡劫|飞升|仙道/.test(text)) return '修仙体系'
  if (/魔法|斗气|魔导|骑士|炼金|教廷/.test(text)) return '魔法体系'
  if (/血脉|龙血|兽血|武魂/.test(text)) return '血脉体系'
  if (/基因|科技|星际|机甲|进化|量子|星舰/.test(text)) return '基因进化体系'
  if (/权力|朝堂|军政|皇权|朝廷|帝王|官制|文官|武将/.test(text)) return '朝堂权力体系'
  if (/武道|武学|炼体|内劲|外功|宗师|江湖|武侠/.test(text)) return '武道体系'
  if (/异能|都市|古武/.test(text)) return '异能等级体系'
  return ''
}

function mergeBrokenParenLevels(arr: string[]): string[] {
  var out: string[] = []
  for (var i = 0; i < arr.length; i++) {
    var cur = arr[i]
    var open = (cur.match(/[（(]/g) || []).length
    var close = (cur.match(/[）)]/g) || []).length
    while (open > close && i + 1 < arr.length) {
      i++
      var nxt = arr[i]
      cur = cur + '，' + nxt
      open += (nxt.match(/[（(]/g) || []).length
      close += (nxt.match(/[）)]/g) || []).length
    }
    if (cur) out.push(cur.trim())
  }
  return out
}

function parsePowerSystem(raw: unknown): PowerSystemView {
  const empty: PowerSystemView = { name: '', type: '', levels: [], description: '' }
  if (raw == null) return empty
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const levels = Array.isArray(o.levels)
      ? o.levels.map(function(l: unknown) {
          if (typeof l === 'object') {
            const ll = l as Record<string, unknown>
            return String(ll.name || ll.label || '')
          }
          return String(l)
        }).map(function(s: string) { return s.trim() }).filter(Boolean)
      : []
    const extra = typeof o.powerSystemText === 'string' ? o.powerSystemText.trim() : ''
    const desc = [String(o.description || ''), extra].filter(function(s: string) { return s.trim() }).join('\n')
    return {
      name: String(o.name || '').trim(),
      type: (String(o.type || '').trim() || inferPowerSystemType(String(o.name || '') + ' ' + String(o.description || ''))),
      levels: levels,
      description: desc.trim(),
    }
  }
  if (typeof raw === 'string') {
    const s = raw
    if (!s.trim()) return empty
    const view: PowerSystemView = { name: parsePowerSystemBlock(s, '体系名称'), type: '', levels: [], description: '' }
    view.name = String(view.name || '').replace(/[：:。；].*$/, '').trim()
    // 🔥 2026-09-01 修复：优先读取显式【体系类型】块（如"明朝朝堂权力体系"），否则再推断，避免丢失朝代前缀。
    var _typeBlock = parsePowerSystemBlock(s, '体系类型').trim()
    view.type = _typeBlock || inferPowerSystemType(view.name || s)
    // 🔥 修复：LLM 常把配对方阵写成单行「未入流→文『…』｜武『…』；正七品→…」，
    //   这里把全/半角分号统一转成换行，保证逐行配对解析不被吞成一整行。
    const realm = parsePowerSystemBlock(s, '境界划分').replace(/\\n/g, '\n').replace(/[；;]+/g, '\n')
    if (realm) {
      // 🔥 图三修复：优先解析"品阶对齐的文武对照"（每行 rank + 文 + 武），渲染成品阶对照表
      var _rankRows: { rank: string; civil: string; military: string }[] = []
      const _clean = function (x: string): string {
        return String(x || '').replace(/[『「』」【】]/g, '').replace(/[。；;]+$/, '').trim()
      }
      realm.split(/\n+/).forEach(function (line: string) {
        var L = line.trim()
        if (!L) return
        // 🔥 2026-09-01 修复：分隔符字符类同时允许 ｜｜ → ｜ ：空格，
        //   兼容"未入流｜文『…』｜武『…』"（chaotang-ming 表）与"正一品→文…→武…"两种格式。
        var mm = L.match(/^(?:([^｜|文]{1,8}?)\s*[：:|｜→\-]*\s*)?文(?:职|官)?\s*[『「【]?\s*(.+?)\s*[』」】]?\s*[｜|]?\s*武(?:职|官|将)?\s*[『「【]?\s*(.+?)\s*[』」】]?\s*$/)
        if (!mm) return
        var rank = (mm[1] || '').replace(/\s+/g, '').trim()
        var civil = _clean(mm[2])
        var military = _clean(mm[3])
        if (civil || military) _rankRows.push({ rank: rank, civil: civil, military: military })
      })
      var _rcValid = _rankRows.filter(function (r: { rank: string; civil: string; military: string }) { return r.civil || r.military }).length
      if (_rankRows.length >= 3 && _rcValid >= Math.ceil(_rankRows.length * 0.5)) {
        view.rankTable = _rankRows
        view.ladders = [
          { label: '文官（职事·散阶）', items: _rankRows.map(function (r) { return r.civil || '—' }) },
          { label: '武将（武职·爵位）', items: _rankRows.map(function (r) { return r.military || '—' }) },
        ]
        view.levels = _rankRows.reduce(function (a: string[], r) {
          if (r.civil) a.push(r.civil)
          if (r.military) a.push(r.military)
          return a
        }, [])
      } else {
      var _ladders: { label: string; items: string[] }[] = []
      realm.split(/\n+/).forEach(function (line: string) {
        if (!line.trim()) return
        var label = ''
        var body = line
        var m1 = line.match(/^【([^】]{1,6})】\s*([\s\S]+)$/)
        var m2 = line.match(/^\s*([^→：:】\n]{1,8}?)(?:序列|等级|阶梯)?[：:]\s*([\s\S]+)$/)
        if (m1) { label = m1[1].replace(/序列|等级/g, '').trim(); body = m1[2] }
        else if (m2) { label = m2[1].replace(/序列|等级/g, '').trim(); body = m2[2] }
        var items: string[] = []
        body.split(/[→▶>·•;；]/).forEach(function (t: string) {
          t = t.split(/[。]/)[0].trim()
          if (t && t.length <= 12) items.push(t)
        })
        if (items.length > 0) _ladders.push({ label: label, items: items })
      })
      if (_ladders.length > 0) {
        view.ladders = _ladders
        view.levels = _ladders.reduce(function (a: string[], l) { return a.concat(l.items) }, [])
      } else {
        view.levels = mergeBrokenParenLevels(realm.split(/[→▶>·•;；\n]/).map(function (t: string) { return t.trim() }).filter(Boolean))
      }
      }
    }
    const parts: string[] = []
    const desc = parsePowerSystemBlock(s, '体系描述')
    if (desc) parts.push('【体系描述】' + desc)
    const cult = parsePowerSystemBlock(s, '修炼方式')
    if (cult) parts.push('【修炼方式】' + cult)
    const rest = parsePowerSystemBlock(s, '克制关系')
    if (rest) parts.push('【克制关系】' + rest)
    view.description = parts.join('\n')
    // 🔥🔥🔥 修复（世界观-力量体系空值）：力量体系为自然语言（如"基因进化体系，分为12个等级：
    // 基因锁觉醒、基因改造、...基因永恒。每个等级都有独特的能力..."）时，没有【体系名称】/【境界划分】标记，
    // 旧逻辑会解析出空的 体系名称 和 境界等级。此处从自然语言中提取两者，避免显示为空。
    var _usedNaturalParse = false
    if (!view.name || view.levels.length === 0) {
      if (!view.name) {
        var _nlNameM = s.match(/([\u4e00-\u9fff]{2,12}?(?:修炼体系|力量体系|进化体系|修行体系|修真体系|武道体系|修仙体系|魔法体系|斗气体系|异能体系|基因体系|文明体系|系统))/)
        if (_nlNameM && _nlNameM[1]) { view.name = _nlNameM[1]; _usedNaturalParse = true }
        else {
          var _nlNameM2 = s.match(/^[\s]*([\u4e00-\u9fff]{2,12})，/)
          if (_nlNameM2 && _nlNameM2[1] && !/^(整个世界|本世界|这个|其中|以及|需要|可以|分为|一共|这里|首先)/.test(_nlNameM2[1])) { view.name = _nlNameM2[1]; _usedNaturalParse = true }
        }
      }
      if (view.levels.length === 0) {
        var _nlLvM = s.match(/分为\s*[一二三四五六七八九十百千\d]+\s*个?(?:等级|境界|层次|阶段|级别)\s*[:：]\s*([^。；\n]+)/)
        if (_nlLvM && _nlLvM[1]) {
          var _nlLvArr = _nlLvM[1].split(/[、;；\n]/).map(function(_t: string) { return _t.replace(/^[一二三四五六七八九十百千\d]+[.．、]?\s*/, '').trim() }).filter(function(_t: string) { return _t && _t.length <= 40 })
          if (_nlLvArr.length >= 3) { view.levels = _nlLvArr; _usedNaturalParse = true }
        }
        // 🔥🔥🔥 修复2（世界观力量体系境界/等级空值）：模型输出"分为觉醒者、进化者、领域者、...永恒者。"
        // 这种【无"N个等级："前缀】的顿号/逗号连排列表时，上面严格正则匹配不到，导致"境界/等级逐条列表"为空。
        // 此处兜底：匹配"分为…。"之间整段，按顿号/逗号切分，得到有效等级清单。
        if (view.levels.length === 0) {
          var _nlLvM2 = s.match(/分为\s*([^。；\n]{2,})\s*。/)
          if (_nlLvM2 && _nlLvM2[1]) {
            var _nlLvArr2 = _nlLvM2[1].split(/[、;；\n]/).map(function(_t: string) { return _t.replace(/^[一二三四五六七八九十百千\d]+[.．、]?\s*/, '').trim() }).filter(function(_t: string) { return _t && _t.length >= 2 && _t.length <= 40 && !/^(基因|等级|境界|修炼|进化|能力|体系|系统)$/.test(_t) })
            if (_nlLvArr2.length >= 3 && _nlLvArr2.length <= 20) { view.levels = _nlLvArr2; _usedNaturalParse = true }
          }
        }
      }
    }
    // 🔥🔥🔥 修复3（世界力量体系"编号平铺"格式）：模型输出如
    //   【体系名称】商业资本体系：1. 个体户：拥有一定资金…
    //   【体系描述】商业资本体系：1. 个体户：…2. 小微创业：…3. 中小企业：…
    // 这种【有【体系名称】/【体系描述】标记、但等级只以"序号.名称："平铺在体系描述里，且无【境界划分】、无"分为"列表词】的格式，
    // 旧逻辑（只认【境界划分】/ 分为…）会漏掉：体系名称被编号污染成"商业资本体系：1. 个体户：…"，境界/等级解析为空。
    // 此处：①清理被编号污染的体系名称；②从"序号.名称："中抽取出完整等级清单。
    if (view.name) {
      var _pollutedNm = view.name.replace(/\s*[：:]\s*\d+\s*[.．、][\s\S]*$/, '').trim()
      if (_pollutedNm && _pollutedNm.length >= 2 && _pollutedNm.length <= 20) view.name = _pollutedNm
    }
    if (view.levels.length === 0) {
      var _numLv: string[] = []
      var _numRex = /(?:[\s；;，,。、：:\n]|^)\s*[一二三四五六七八九十百千\d]+[.．、]\s*([A-Za-z\u4e00-\u9fff][A-Za-z\u4e00-\u9fff]{1,18})\s*(?:[：:、，,。;；\s]|$)/g
      var _numHit = null
      while ((_numHit = _numRex.exec(s))) {
        var _lvName = _numHit[1].trim()
        if (_lvName && _lvName.length >= 2 && _lvName.length <= 14 && _numLv.indexOf(_lvName) === -1) _numLv.push(_lvName)
      }
      if (_numLv.length >= 3) { view.levels = _numLv.slice(0, 20); _usedNaturalParse = true }
    }
    // 完全无法结构化时兜底为整体描述，避免丢内容/显示空串；若走自然语言解析则保留完整原文为描述
    if ((!view.name && view.levels.length === 0 && !view.description) || (_usedNaturalParse && !view.description)) {
      view.description = s
    }
    return view
  }
  return empty
}

function serializePowerSystem(v: PowerSystemView): string {
  const parts: string[] = []
  if (v.name.trim()) parts.push('【体系名称】' + v.name.trim())
  // 🔥 2026-09-01 修复：持久化"体系类型"，否则编辑【体系属性/类型】后会在下次解析时被推断值覆盖（无法编辑/选择）。
  if (v.type.trim()) parts.push('【体系类型】' + v.type.trim())
  if (v.rankTable && v.rankTable.length >= 3) {
    parts.push('【境界划分】' + v.rankTable.map(function (r) {
      return (r.rank || '') + '→文『' + (r.civil || '—') + '』｜武『' + (r.military || '—') + '』'
    }).join('\n'))
  } else
  if ((v.ladders || []).map(function (l) { return { label: (l.label || '').trim(), items: (l.items || []).map(function (x) { return x.trim() }).filter(Boolean) } }).filter(function (l) { return l.items.length > 0 }).length >= 2) {
    const _lad = v.ladders!.map(function (l) { return { label: (l.label || '').trim(), items: (l.items || []).map(function (x) { return x.trim() }).filter(Boolean) } }).filter(function (l) { return l.items.length > 0 })
    parts.push('【境界划分】' + _lad.map(function (l) { return (l.label ? '【' + l.label + '】' : '') + l.items.join('→') }).join('\n'))
  } else {
    const levels = v.levels.map(function(l: string) { return l.trim() }).filter(Boolean)
    if (levels.length > 0) parts.push('【境界划分】' + levels.join('→'))
  }
  if (v.description.trim()) parts.push(v.description.trim())
  return parts.join('\n')
}

export default function StepWorldbuilding({
  data, onChange, onRegenerate, onGenerate, isLoading, regeneratePrompt, setRegeneratePrompt, RegenButton, regeneratingField, stepName,
}: StepWorldbuildingProps) {
  const isWholeStepRegenerating = regeneratingField === stepName
  // 🔥 修复问题2：加载设定中心体系类型，供力量体系字段联动取值
  const [systemTypes, setSystemTypes] = useState<SystemTypeItem[]>([])
  const [selectedSystemType, setSelectedSystemType] = useState<string>('')

  useEffect(function() {
    fetch('/tuzhong-wenshu/api/settings/types')
      .then(function(r) { return r.json() })
      .then(function(d) {
        if (d && d.success && Array.isArray(d.data.systemTypes)) {
          setSystemTypes(d.data.systemTypes)
        }
      })
      .catch(function(e: unknown) { console.warn('[StepWorldbuilding] 加载体系类型失败:', e instanceof Error ? e.message : String(e)) })
  }, [])

  const autoResize = function(e: React.FormEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }

  useEffect(function() {
    const timer = setTimeout(function() {
      document.querySelectorAll('textarea').forEach(function(ta) {
        ta.style.height = 'auto'
        ta.style.height = ta.scrollHeight + 'px'
      })
    }, 50)
    return function() { clearTimeout(timer) }
  }, [data])

  // 🔥 修复问题2：从设定中心选择已有体系类型时，同步填充力量体系文本
  // 业务逻辑：世界观设定-力量体系优先取值设定中心已有体系，确保三处同步
  const handleSelectSystemType = function(typeName: string) {
    setSelectedSystemType(typeName)
    if (!typeName) return
    const sysItem = systemTypes.find(function(t) { return t.name === typeName })
    if (!sysItem) return
    // 组合体系信息为文本，填充到 powerSystem 字段
    const parts: string[] = []
    parts.push('【体系名称】' + sysItem.name)
    // 🔥 2026-09-01 修复：取值时一并写入带朝代前缀的【体系类型】（如"明朝朝堂权力体系"），保证三处一致。
    parts.push('【体系类型】' + typeName)
    if (sysItem.description) parts.push('【体系描述】' + sysItem.description)
    if (sysItem.realmSystem) parts.push('【境界划分】' + sysItem.realmSystem)
    if (sysItem.cultivationMethod) parts.push('【修炼方式】' + sysItem.cultivationMethod)
    if (sysItem.restraintRelation) parts.push('【克制关系】' + sysItem.restraintRelation)
    const combinedText = parts.join('\n')
    onChange({ ...data, powerSystem: combinedText, powerSystemType: typeName } as NonNullable<GeneratedData['worldbuilding']>)
  }

  // 🔥 2026-08-30 问题1：进入世界观步时，若力量体系尚未从设定中心选定，自动匹配最贴合的体系类型并回填，
  //   使 体系名称/体系属性/境界等级 三处与设定中心一致，不再显示空值或把整段描述塞进体系名称。
  useEffect(function() {
    if (systemTypes.length === 0) return
    if (selectedSystemType) return
    const _psText = (powerSystemText(data?.powerSystem) || '') + ' ' + String((data as any)?.era || '') + ' ' + String((data as any)?.history || '')
    if (!_psText.trim()) return
    // 朝代识别（长词优先，避免"南北朝"被"朝"误判）
    const _dynastyWords = ['民国', '南北朝', '三国', '两晋', '明朝', '清代', '大清', '宋朝', '唐朝', '汉朝', '元朝', '隋朝', '秦朝', '周朝', '明', '清', '宋', '唐', '汉', '元', '隋', '晋', '秦']
    let _dynasty = ''
    for (let d = 0; d < _dynastyWords.length; d++) { if (_psText.indexOf(_dynastyWords[d]) !== -1) { _dynasty = _dynastyWords[d]; break } }
    // 归一到设定中心里"XX朝堂权力体系"的朝代前缀
    const _dynMap: Record<string, string> = { '明': '明朝', '清': '清朝', '宋': '宋朝', '唐': '唐朝', '汉': '汉朝', '元': '元朝', '隋': '隋朝', '晋': '两晋', '秦': '秦朝', '周': '周朝', '三国': '三国', '南北朝': '南北朝', '民国': '民国', '两晋': '两晋' }
    const _dynKey = _dynMap[_dynasty] || _dynasty
    const _domains: Array<string[]> = [
      ['朝堂', '权力', '皇权', '军政', '朝廷', '帝王', '官制', '文官', '武将'],
      ['修仙', '修真', '炼气', '筑基', '金丹', '元婴', '渡劫', '飞升'],
      ['魔法', '斗气', '骑士', '炼金', '教廷'],
      ['基因', '科技', '星际', '机甲', '进化', '量子', '星舰'],
      ['武道', '武学', '炼体', '内劲', '宗师', '江湖', '武侠'],
      ['血脉', '龙血', '兽血', '武魂'],
      ['洪荒', '巫族', '祖巫', '天庭', '阐教', '截教', '封神'],
    ]
    const _hitDomain = function(text: string): number {
      for (let d = 0; d < _domains.length; d++) { if (_domains[d].some(function(k) { return text.indexOf(k) !== -1 })) return d }
      return -1
    }
    const _psDomain = _hitDomain(_psText)
    let best = ''; let bestScore = 0
    for (const t of systemTypes) {
      if (!t || !t.name) continue
      let score = 0
      if (_dynKey && t.name.indexOf(_dynKey) !== -1 && t.name.indexOf('朝堂权力体系') !== -1) score += 30
      if (_psText.indexOf(t.name) !== -1) score += 10
      const _core = t.name.replace(/体系|力量|等级|修炼|文明|系统/g, '')
      if (_core.length >= 2 && _psText.indexOf(_core) !== -1) score += 5
      const _tDomain = _hitDomain(t.name)
      if (_tDomain !== -1 && _tDomain === _psDomain) score += 4
      if (score > bestScore) { bestScore = score; best = t.name }
    }
    if (best && bestScore >= 5) handleSelectSystemType(best)
    // 🔥 2026-09-01 修复：仅在设定中心类型加载完成时自动匹配一次，避免用户编辑力量体系任一字段后被自动匹配逻辑回写覆盖（导致"不能编辑/不能选择"）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemTypes])

  // 🔥 Bug修复：检查数据是否存在且关键字段不为空
  if (!data || !data.era && !data.geography) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
          <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">世界观设定</h3>
            <p className="text-stone-500 text-sm">AI将为你的小说构建完整的世界观</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
                placeholder={`输入你的需求，如：把时代背景改为唐朝，加入修仙元素...`}
                className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-stone-50"
              />
              <button
                type="button"
                onClick={onGenerate}
                disabled={isLoading}
                className="whitespace-nowrap inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r wenshu-btn-primary rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '生成中...' : '✨ 生成世界观设定'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 🔥 题材感知：基于data内容动态判断当前题材，避免硬编码模板污染
  // 仅决定哪些专属字段需要显示，不影响字段内容（内容100%由LLM基于前环节生成）
  const detectCurrentGenre = (): 'honghuang' | 'xianxia' | 'western' | 'scifi' | 'history' | 'modern' | 'generic' => {
    const era = (data?.era || '') + ''
    const powerSystem = powerSystemText(data?.powerSystem)
    const geography = (data?.geography || '') + ''
    const history = (data?.history || '') + ''
    const combined = era + ' ' + powerSystem + ' ' + geography + ' ' + history
    // 🔥 关键修复：西幻/魔法斗气题材（含盘龙）优先级最高，防止被洪荒/修仙误判
    // 仿写盘龙时即使包含"龙血"等可能误判的关键词，也必须锁定西幻
    if (/魔法|斗气|魔导|骑士|炼金|龙血|精灵|矮人|神格|玉兰大陆|盘龙|西幻|魔法师|教廷|魔兽|魔核/.test(combined)) return 'western'
    // 科幻/星际题材
    if (/星际|宇宙|基因|星舰|机甲|赛博|量子|纳米|吞噬星空|精神念师/.test(combined)) return 'scifi'
    // 历史/权谋题材
    if (/朝堂|权谋|科举|王朝|皇帝|宰相|江湖|武侠|战国|三国/.test(combined)) return 'history'
    // 现代题材
    if (/现代|都市|商战|互联网|金融|手机|电脑/.test(combined)) return 'modern'
    // 洪荒/巫族/封神题材（放在后面，防止"图腾""巫"等通用词误判）
    if (/洪荒|巫族|祖巫|封神|阐教|截教|盘古|不周山|天庭|妖族|巫道|量劫|圣人|大罗金仙/.test(combined)) return 'honghuang'
    // 修仙/仙侠题材
    if (/修仙|修真|炼气|筑基|金丹|元婴|化神|渡劫|宗门|灵气|灵根|丹药|法器|符箓|阵法/.test(combined)) return 'xianxia'
    return 'generic'
  }
  const currentGenre = detectCurrentGenre()
  // 仅洪荒/修仙题材显示"三界结构"和"天道法则"（这些是东方玄幻/修仙专属概念）
  const showEasternMythologyFields = currentGenre === 'honghuang' || currentGenre === 'xianxia'

  // 清理占位符：过滤掉AI可能生成的XXXX等占位符
  const cleanText = (val: string): string => {
    if (!val) return ''
    return val
      // ⚠️ 关键：必须先移除包含XXXX的括号/范围表达式，再替换剩余的XXXX
      .replace(/（公元\s*XXXX[^）]*）/gi, '')
      .replace(/（[^）]*XXXX[^）]*）/g, '')
      .replace(/公元\s*XXXX\s*年[—\-—]\s*公元\s*XXXX\s*年/g, '')
      .replace(/公元\s*XXXX\s*年/g, '')
      .replace(/XXXX+/gi, '未详')
      .replace(/某某/g, '')
      .replace(/待定|未知|暂未确定/g, '')
      .replace(/\s*（\s*）/g, '')
      .replace(/\s*\(\s*\)\s*/g, '')
      .trim()
  }

  // 全局文本清洗函数：过滤特殊字符、重复乱码、空字符串
  const cleanWorldbuildingText = (val: string): string => {
    if (!val) return ''
    // 1. 保留中文、英文、数字、常用标点，过滤其他特殊字符
    let cleaned = val.replace(/[^一-鿿　-〿＀-￯ a-zA-Z0-9，。！？；：""''（）【】《》、…—～·\s\-]/g, '')
    // 2. 过滤连续重复的相同字符超过3次（乱码特征）
    cleaned = cleaned.replace(/(.)\1{3,}/g, function (_match: string, char: string) {
      // 中文字符（可能是有意义的重复如"哈哈"）保留前2个
      if (/[一-鿿]/.test(char)) return char + char
      // 其他字符保留1个
      return char
    })
    // 3. 移除纯空格行
    cleaned = cleaned.replace(/^\s*$/gm, '')
    // 4. 去除首尾空白
    cleaned = cleaned.trim()
    return cleaned
  }

  // 力量体系归一化：兼容后端返回 string / 对象 / 含 powerSystemText，统一为结构化展示
  var powerSystemView = parsePowerSystem(data?.powerSystem)
  // 🔥 2026-09-01 第10轮修复：解析不到配对 rankTable 且为朝堂题材时，从设定中心找同名体系回填配对内容，
  //   避免后端 post-processing 漏掉 simpleArrow 格式时世界观步渲染 1-10 列表。
  try {
    var _rtDegenerate = !!(powerSystemView.rankTable && powerSystemView.rankTable.length >= 3 && powerSystemView.rankTable.filter(function (r) { return r.civil || r.military }).length < Math.ceil(powerSystemView.rankTable.length * 0.5))
    if ((!powerSystemView.rankTable || powerSystemView.rankTable.length < 3 || _rtDegenerate) && systemTypes.length > 0) {
      var _psTextF = powerSystemText(data?.powerSystem) || ''
      // 🔥 2026-09-01 第11轮修复：把 socialStructure / geography 也纳入判定，避免"政治权谋/封王拜相/内阁六部"信号仅藏在社会结构里时被遗漏，
      //   导致真实朝堂题被强行套上 "1 书吏·皂隶" 这样的等级竖排列表。
      var _psHayF = _psTextF + ' ' + String((data as any)?.era || '') + ' ' + String((data as any)?.history || '') + ' ' + String((data as any)?.socialStructure || '') + ' ' + String((data as any)?.geography || '')
      // 三条命中路径任一成立即判定为朝堂/官制题材：
      //  ① 体系文本或 era/history/socialStructure/geography 含朝堂官制关键词
      //  ② 体系名称/类型本身含朝堂官制关键词（AI 常把真实体系名写在 name 上）
      //  ③ 体系名称/类型是作废占位（无超自然/无体系/无系统…）且 era/history 有朝代信号 → 占位必然要被真实体系替换
      var _nmRawF = String(powerSystemView.name || '') + ' ' + String(powerSystemView.type || '')
      var _placeholderF = /本作无|该作无|本书无|无任何超自然|无任何体系|无任何系统|无超自然|无体系|无系统|不设体系|不立体系|不设等级|无等级/.test(_nmRawF + ' ' + _psTextF)
      var _dynastyF = /明朝|清朝|唐朝|宋朝|汉朝|秦朝|元朝|隋朝|两晋|南北朝|南明|明末|晚清|民国|大秦|大宋|大明|大清/.test(_psHayF)
      // 🔥 安全阀：力量体系本身已是明确的非朝堂体系（修真/异能/科幻/魔法/武侠内力等）时，
      //    绝不回填朝堂官制表 —— 否则历史背景里提到"明朝/朝堂"就会把修仙体系误改成官阶表。
      // 🔥 2026-09-01 第11轮修复：「武功」/「兵法」虽常出现于武侠/朝堂均有可能，但「武林门派/内力/真气/真气/真气」是门派专属——
      //    把 _nonCourtSystemF 限于明确超自然/门派专属词（内力|真气|武林|江湖门派），避免「政治权谋+明朝」被误判成非朝堂。
      var _nonCourtSystemF = /炼气|筑基|金丹|元婴|化神|渡劫|大乘|合体|洞虚|开光|融合|灵根|修真|修仙|仙帝|仙尊|斗气|斗者|魔导|魔法师|剑圣|剑神|武魂|魂力|魂士|异能|觉醒者|超能力|机甲|星舰|基因锁|源力|念力|内力|真气|武林|江湖门派/.test(_nmRawF + ' ' + _psTextF)
      // 🔥 2026-09-01 第11轮修复：扩展朝堂关键词列表——除显式官职词外，加入
      //    "政治|权谋|官场|朝堂|权贵|封王拜相|内阁|六部|皇权|督抚|将军|侯伯|殿阁|尚书|侍郎|学士|知县|知府|宰相|布政|按察|巡抚|提督|总兵|参将|游击|节度|经略|都察|御史|进士|举人|秀才|殿试|解元|会元|三元|帝王|皇帝|皇朝|王侯|侯爵|爵位|中枢|省府|州县|知州|布政使|按察使|都督|钦差|九卿|卿|府尹|京官|地方官|文臣|武将|将帅|将军|士绅|士族|武将|武职|文职|武臣|文臣|王公|百官|朝臣"
      //    避免政治权谋/封王拜相/六部内阁 类信号被判定正则"漏网"，导致竖排 ul 永远不变成表格。
      var _isCourtF = !_nonCourtSystemF && (
        /(朝堂|权谋|政治|官场|朝廷|皇朝|朝政|朝廷|权贵|官场|权力|官职|品阶|九品|文官|武将|衙门|部院|科举|品级|内阁|六部|皇权|督抚|将军|侯伯|殿阁|尚书|侍郎|学士|知县|知府|宰相|布政|按察|巡抚|提督|总兵|参将|游击|节度|经略|都察|御史|进士|举人|秀才|殿试|解元|会元|三元|帝王|皇帝|封王拜相|王侯|侯爵|爵位|中枢|省府|州县|知州|布政使|按察使|都督|钦差|九卿|卿|府尹|京官|地方官|文臣|武臣|王公|百官|朝臣|中枢|朝堂|武将|武职|文职|将帅|士绅|士族|官制)/.test(_psHayF) ||
        /(朝堂|权谋|政治|官场|朝廷|权力体系|品阶|九品|文官|武将|官制|爵位|内阁|六部|皇权|督抚|将军|尚书|宰相|布政|按察|巡抚|帝王|皇朝|朝堂|权贵|中枢|朝政|百官|朝臣|将帅|士绅|士族|文臣|武臣|王公)/.test(_nmRawF) ||
        (_placeholderF && _dynastyF)
      )
      if (_isCourtF) {
        var _nmF = String(powerSystemView.name || '').trim() || String(((_psTextF.match(/【体系名称】\s*([^\n]+)/) || [])[1] || '')).trim()
        var _tgtF: SystemTypeItem | undefined = undefined
        if (_nmF) _tgtF = systemTypes.find(function (t: SystemTypeItem) { return t.name === _nmF })
        if (!_tgtF) {
          // 🔥 朝代信号按"具体→宽泛"逐级回退：体系名 → 体系全文 → era → history。
          //    原先只从体系名取朝代，遇到占位名（"本作无任何超自然体系"）会取不到朝代，
          //    导致落到通用"朝堂权力体系"而非"明朝朝堂权力体系"。
          var _dynSrcF = [_nmF, _psTextF, String((data as any)?.era || ''), String((data as any)?.history || '')].join(' ')
          var _dynMatchF = _dynSrcF.match(/(南明|明末|南北朝|两晋|民国|晚清|隋唐|隋|唐|宋|元|明|清|汉|秦|晋)/)
          var _dynKeyF = _dynMatchF ? _dynMatchF[1] : ''
          var _dynMapF: Record<string, string> = { '明': '明朝', '清': '清朝', '宋': '宋朝', '唐': '唐朝', '汉': '汉朝', '元': '元朝', '隋': '隋朝', '晋': '两晋', '秦': '秦朝', '南北朝': '南北朝', '两晋': '两晋', '民国': '民国', '晚清': '清朝', '隋唐': '隋唐朝' }
          // 🔥 朝代候选按优先级排列：命中体（南明/明末）→ 母朝代（明朝）→ 单字根兜底。
          //    设定中心未必有"明末朝堂权力体系"，若只取第一命中会落空并退化到通用体系。
          var _dynCandF: string[] = []
          var _pushCandF = function (k: string) { if (k && _dynCandF.indexOf(k) === -1) _dynCandF.push(k) }
          if (_dynKeyF === '南明' || _dynKeyF === '明末') { _pushCandF(_dynKeyF); _pushCandF('明朝') }
          else _pushCandF(_dynMapF[_dynKeyF] || _dynKeyF)
          var _singleF = String(_dynKeyF).match(/[明清唐宋汉元隋秦晋]/)
          if (_singleF) {
            var _smF: Record<string, string> = { '明': '明朝', '清': '清朝', '唐': '唐朝', '宋': '宋朝', '汉': '汉朝', '元': '元朝', '隋': '隋朝', '秦': '秦朝', '晋': '两晋' }
            _pushCandF(_smF[_singleF[0]])
          }
          // 逐个候选尝试，取第一个能解析出 >=3 品阶配对表的体系（避免选中 realmSystem 过短的残缺体系）
          for (var _ci = 0; _ci < _dynCandF.length; _ci++) {
            var _candF = systemTypes.find(function (t: SystemTypeItem) {
              return t.name.indexOf(_dynCandF[_ci]) !== -1 && t.name.indexOf('朝堂权力体系') !== -1 && t.realmSystem && /文『|｜武/.test(t.realmSystem)
            })
            if (_candF && _candF.realmSystem) {
              var _tryF = parsePowerSystem('【体系名称】' + _candF.name + '\n【体系类型】' + _candF.name + '\n【境界划分】' + _candF.realmSystem)
              if (_tryF.rankTable && _tryF.rankTable.length >= 3) { _tgtF = _candF; break }
            }
          }
          if (!_tgtF) _tgtF = systemTypes.find(function (t: SystemTypeItem) { return t.name.indexOf('朝堂权力体系') !== -1 && t.realmSystem && /文『|｜武/.test(t.realmSystem) })
        }
        if (_tgtF && _tgtF.realmSystem && /文『|｜武/.test(_tgtF.realmSystem)) {
          var _pairedF = parsePowerSystem('【体系名称】' + _tgtF.name + '\n【体系类型】' + _tgtF.name + '\n【境界划分】' + _tgtF.realmSystem)
          if (_pairedF.rankTable && _pairedF.rankTable.length >= 3) {
            powerSystemView = {
              name: _tgtF.name,
              type: _tgtF.name,
              levels: _pairedF.levels,
              ladders: _pairedF.ladders,
              rankTable: _pairedF.rankTable,
              description: powerSystemView.description || String(_tgtF.description || ''),
            } as PowerSystemView
            console.log('[StepWorldbuilding] 🔥 兜底从设定中心回填配对 rankTable (' + _pairedF.rankTable.length + ' 品阶): ' + _tgtF.name)
          }
        }
      }
    }
  } catch (_pfErr) { /* 兜底失败不影响主流程 */ }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">世界观设定</h3>
          <p className="text-stone-500 text-sm">AI为你的小说构建了完整的世界观（可直接编辑）</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={regeneratePrompt}
              onChange={(e) => setRegeneratePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
              placeholder={`输入你的需求，如：把时代背景改为唐朝，加入修仙元素...`}
              className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-stone-50"
            />
            <button
              type="button"
              onClick={() => onRegenerate(stepName)}
              disabled={isWholeStepRegenerating}
              className="whitespace-nowrap inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r wenshu-btn-primary rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWholeStepRegenerating ? '生成中...' : '🔄 重新生成'}
            </button>
          </div>
        </div>
      </div>

      {/* 🔥 核心字段空值检测 */}
      {(!data?.era || data.era.trim() === '' || !data?.geography || data.geography.trim() === '') && (
        <div className="text-center py-4 text-amber-600 text-sm">
          <AlertCircle className="w-5 h-5 mx-auto mb-2" />
          <p className="font-medium">世界观核心字段缺失</p>
          <p className="mt-1">
            {!data?.era || data.era.trim() === '' ? '时代背景为空。' : ''}
            {!data?.geography || data.geography.trim() === '' ? '地理环境为空。' : ''}
            请点击&quot;🔄 重新生成&quot;按钮重试。
          </p>
        </div>
      )}

      {data?._contentWarning && (
        <div className="text-center py-4 text-amber-600 text-sm">
          <AlertCircle className="w-5 h-5 mx-auto mb-2" />
          <p className="font-medium">内容偏离警告</p>
          <p className="mt-1">{data._contentWarning}</p>
        </div>
      )}

      <div className="space-y-4">

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">时代背景 <RegenButton step={stepName} field="era" label="时代背景" /></h4>
          <textarea
            value={cleanText(data?.era || '')}
            onChange={(e) => onChange({ ...data, era: e.target.value })}
            onInput={autoResize}
            rows={2}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
          />
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">地理环境 <RegenButton step={stepName} field="geography" label="地理环境" /></h4>
          <textarea
            value={cleanText(data?.geography || '')}
            onChange={(e) => onChange({ ...data, geography: e.target.value })}
            onInput={autoResize}
            rows={2}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
          />
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">历史背景 <RegenButton step={stepName} field="history" label="历史背景" /></h4>
          <textarea
            value={cleanText(data?.history || '')}
            onChange={(e) => onChange({ ...data, history: e.target.value })}
            onInput={autoResize}
            rows={6}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700 min-h-[120px]"
          />
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">世界规则 <RegenButton step={stepName} field="rules" label="世界规则" /></h4>
          <ul className="space-y-2">
            {(Array.isArray(data?.rules) ? data.rules : []).map((rule: string, index: number) => (
              <li key={`rule-${index}-${rule.slice(0, 10)}`} className="flex items-start space-x-3">
                <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                  {index + 1}
                </span>
                <textarea
                  value={rule}
                  onChange={(e) => {
                    const newRules = [...(data?.rules || [])]
                    newRules[index] = e.target.value
                    onChange({ ...data, rules: newRules })
                  }}
                  onInput={autoResize}
                  rows={2}
                  className="flex-1 px-3 py-1 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">力量体系 <RegenButton step={stepName} field="powerSystem" label="力量体系" /></h4>
          {/* 🔥 修复问题2：设定中心联动下拉 - 优先取值设定中心已有体系，确保三处同步 */}
          <div className="mb-3">
            <label className="text-xs font-medium text-stone-500 mb-1 block">
              从设定中心取值（可选）：选择已有体系类型，自动同步填充下方力量体系文本，确保世界观/金手指/设定中心三处一致
            </label>
            <select
              value={selectedSystemType}
              onChange={(e) => handleSelectSystemType(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-700 text-sm focus:ring-2 focus:ring-stone-400 focus:border-transparent"
            >
              <option value="">-- 由AI自动设计（不从设定中心取值）--</option>
              {systemTypes.length > 0 && Object.entries(
                systemTypes.reduce(function(acc: Record<string, SystemTypeItem[]>, t) {
                  if (!acc[t.category]) acc[t.category] = []
                  acc[t.category].push(t)
                  return acc
                }, {})
              ).map(function([category, items]) {
                return (
                  <optgroup key={category} label={category}>
                    {items.map(function(item) {
                      return (
                        <option key={item.id} value={item.name}>
                          {item.name}{item.description ? `（${item.description}）` : ''}
                        </option>
                      )
                    })}
                  </optgroup>
                )
              })}
            </select>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1">体系名称</label>
                <input
                  type="text"
                  value={powerSystemView.name}
                  onChange={(e) => {
                    const v = { ...powerSystemView, name: e.target.value }
                    onChange({ ...data, powerSystem: serializePowerSystem(v), powerSystemType: (data as any)?.powerSystemType } as NonNullable<GeneratedData['worldbuilding']>)
                  }}
                  placeholder="体系名称"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-700 text-sm focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1">体系属性/类型</label>
                <input
                  type="text"
                  // 🔥 2026-09-01 修复：优先显示自动匹配/手动选定的带朝代前缀类型（如"明朝朝堂权力体系"），可编辑可下拉联动。
                  value={selectedSystemType || powerSystemView.type}
                  onChange={(e) => {
                    const _t = e.target.value
                    setSelectedSystemType(_t)
                    const v = { ...powerSystemView, type: _t }
                    onChange({ ...data, powerSystem: serializePowerSystem(v), powerSystemType: _t || (data as any)?.powerSystemType } as NonNullable<GeneratedData['worldbuilding']>)
                  }}
                  placeholder="如：明朝朝堂权力体系 / 灵力体系 / 武道体系"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-700 text-sm focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">境界/等级体系（文官 / 武将 对照）</label>
              {powerSystemView.rankTable && powerSystemView.rankTable.length >= 3 ? (
                <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-100 text-stone-600 text-xs">
                        <th className="px-2 py-1.5 text-left font-semibold w-20">品阶</th>
                        <th className="px-2 py-1.5 text-left font-semibold">文官（职事·散阶）</th>
                        <th className="px-2 py-1.5 text-left font-semibold">武将（武职·爵位）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {powerSystemView.rankTable.map(function (r, ri) { return (
                        <tr key={ri} className="border-t border-stone-100 align-top">
                          <td className="px-2 py-1 text-stone-500 text-xs whitespace-nowrap">{r.rank || ('第' + (ri + 1) + '阶')}</td>
                          <td className="px-1 py-1">
                            <input type="text" value={r.civil} onChange={(e) => {
                              const nr = powerSystemView.rankTable!.map(function (x, i) { return i === ri ? { ...x, civil: e.target.value } : x })
                              const nl = [{ label: '文官（职事·散阶）', items: nr.map(function (x) { return x.civil || '—' }) }, { label: '武将（武职·爵位）', items: nr.map(function (x) { return x.military || '—' }) }]
                              const v = { ...powerSystemView, rankTable: nr, ladders: nl, levels: nr.reduce(function (a: string[], x) { if (x.civil) a.push(x.civil); if (x.military) a.push(x.military); return a }, []) }
                              onChange({ ...data, powerSystem: serializePowerSystem(v), powerSystemType: (data as any)?.powerSystemType } as NonNullable<GeneratedData['worldbuilding']>)
                            }} className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 text-sm focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
                          </td>
                          <td className="px-1 py-1">
                            <input type="text" value={r.military} onChange={(e) => {
                              const nr = powerSystemView.rankTable!.map(function (x, i) { return i === ri ? { ...x, military: e.target.value } : x })
                              const nl = [{ label: '文官（职事·散阶）', items: nr.map(function (x) { return x.civil || '—' }) }, { label: '武将（武职·爵位）', items: nr.map(function (x) { return x.military || '—' }) }]
                              const v = { ...powerSystemView, rankTable: nr, ladders: nl, levels: nr.reduce(function (a: string[], x) { if (x.civil) a.push(x.civil); if (x.military) a.push(x.military); return a }, []) }
                              onChange({ ...data, powerSystem: serializePowerSystem(v), powerSystemType: (data as any)?.powerSystemType } as NonNullable<GeneratedData['worldbuilding']>)
                            }} className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 text-sm focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              ) : powerSystemView.ladders && powerSystemView.ladders.filter(function(l){return l.items.length>0}).length >= 2 ? (
                <div className="grid grid-cols-2 gap-3">
                  {powerSystemView.ladders.filter(function(l){return l.items.length>0}).map(function(lad, ci) {
                    const _laddersArr = powerSystemView.ladders!.filter(function(l){return l.items.length>0})
                    return (
                    <div key={ci} className="border border-stone-200 rounded-lg p-2 bg-white">
                      <div className="text-xs font-semibold text-stone-700 mb-1.5 text-center pb-1 border-b border-stone-100">{lad.label || ('序列' + (ci + 1))}</div>
                      <ul className="space-y-1">
                        {lad.items.map(function(it: string, ri: number) { return (
                          <li key={ri} className="flex items-center space-x-2">
                            <span className="w-5 h-5 bg-stone-100 text-stone-600 rounded-full flex items-center justify-center text-xs font-medium shrink-0">{ri + 1}</span>
                            <input
                              type="text"
                              value={it}
                              onChange={(e) => {
                                const nl = _laddersArr.map(function(l){ return { label: l.label, items: l.items.slice() } })
                                if (nl[ci]) nl[ci].items[ri] = e.target.value
                                const v = { ...powerSystemView, ladders: nl, levels: nl.reduce(function(a: string[], l){ return a.concat(l.items) }, []) }
                                onChange({ ...data, powerSystem: serializePowerSystem(v), powerSystemType: (data as any)?.powerSystemType } as NonNullable<GeneratedData['worldbuilding']>)
                              }}
                              className="flex-1 min-w-0 px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 text-sm focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                            />
                          </li>
                        )})}
                      </ul>
                    </div>
                    )
                  })}
                </div>
              ) : powerSystemView.levels.length > 0 ? (
                <ul className="space-y-1">
                  {powerSystemView.levels.map(function(lv: string, li: number) { return (
                    <li key={li} className="flex items-start space-x-2">
                      <span className="w-5 h-5 bg-stone-100 text-stone-600 rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">{li + 1}</span>
                      <input
                        type="text"
                        value={lv}
                        onChange={(e) => {
                          const vs = [...powerSystemView.levels]
                          vs[li] = e.target.value
                          const v = { ...powerSystemView, levels: vs }
                          onChange({ ...data, powerSystem: serializePowerSystem(v), powerSystemType: (data as any)?.powerSystemType } as NonNullable<GeneratedData['worldbuilding']>)
                        }}
                        className="flex-1 px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-stone-700 text-sm focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const vs = powerSystemView.levels.filter(function(_v: string, i: number) { return i !== li })
                          const v = { ...powerSystemView, levels: vs }
                          onChange({ ...data, powerSystem: serializePowerSystem(v), powerSystemType: (data as any)?.powerSystemType } as NonNullable<GeneratedData['worldbuilding']>)
                        }}
                        className="shrink-0 w-6 h-6 text-red-500 hover:bg-red-50 rounded-full text-sm flex items-center justify-center"
                        title="删除此项"
                      >✕</button>
                    </li>
                  )})}
                </ul>
              ) : (
                <p className="text-xs text-stone-400 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg">
                  暂无境界等级，可手动添加，或点击&quot;🔄 重新生成&quot;
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  const v = { ...powerSystemView, levels: [...powerSystemView.levels, ''] }
                  onChange({ ...data, powerSystem: serializePowerSystem(v), powerSystemType: (data as any)?.powerSystemType } as NonNullable<GeneratedData['worldbuilding']>)
                }}
                className="mt-1 px-3 py-1 text-sm text-stone-700 hover:bg-stone-50 rounded-lg border border-stone-200"
              >+ 添加等级</button>
            </div>

            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">体系描述（修炼方式 / 克制关系等）</label>
              <textarea
                value={powerSystemView.description}
                onChange={(e) => {
                  const v = { ...powerSystemView, description: e.target.value }
                  onChange({ ...data, powerSystem: serializePowerSystem(v), powerSystemType: (data as any)?.powerSystemType } as NonNullable<GeneratedData['worldbuilding']>)
                }}
                onInput={autoResize}
                rows={4}
                placeholder="描述体系运作方式：修炼方式、克制关系、体系核心特征等"
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700 min-h-[100px]"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">文化特色 <RegenButton step={stepName} field="culturalFeatures" label="文化特色" /></h4>
          <textarea
            value={cleanWorldbuildingText(cleanText(data?.culturalFeatures || ''))}
            onChange={(e) => onChange({ ...data, culturalFeatures: e.target.value })}
            onInput={autoResize}
            rows={2}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
          />
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">隐秘历史 <RegenButton step={stepName} field="secretHistory" label="隐秘历史" /></h4>
          <textarea
            value={cleanWorldbuildingText(cleanText(data?.secretHistory || ''))}
            onChange={(e) => onChange({ ...data, secretHistory: e.target.value })}
            onInput={autoResize}
            rows={2}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
          />
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">社会结构 <RegenButton step={stepName} field="socialStructure" label="社会结构" /></h4>
          <textarea
            value={cleanWorldbuildingText(cleanText(data?.socialStructure || ''))}
            onChange={(e) => onChange({ ...data, socialStructure: e.target.value })}
            onInput={autoResize}
            rows={2}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
          />
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">科技水平 <RegenButton step={stepName} field="technology" label="科技水平" /></h4>
          <textarea
            value={cleanWorldbuildingText(cleanText(data?.technology || ''))}
            onChange={(e) => onChange({ ...data, technology: e.target.value })}
            onInput={autoResize}
            rows={2}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
          />
        </div>
      </div>

      {/* 世界观扩展：种族 / 纪元 / 文明断层等深度字段 */}
      <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-white shadow-md">
        <div className="px-6 py-4 space-y-4">

          {/* 种族体系：可增删数组 */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">种族体系 <RegenButton step={stepName} field="raceSystem" label="种族体系" /></h4>
            <ul className="space-y-2">
              {(Array.isArray(data?.raceSystem) ? data.raceSystem : []).map((race: string, index: number) => (
                <li key={`race-${index}-${race.slice(0, 10)}`} className="flex items-start space-x-3">
                  <span className="w-6 h-6 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                    {index + 1}
                  </span>
                  <textarea
                    value={race}
                    onChange={(e) => {
                      const newRaces = [...(data?.raceSystem || [])]
                      newRaces[index] = e.target.value
                      onChange({ ...data, raceSystem: newRaces })
                    }}
                    onInput={autoResize}
                    rows={1}
                    className="flex-1 px-3 py-1 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
                    placeholder="基于本作世界观设定填写种族名称+势力分布..."
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newRaces = [...(data?.raceSystem || [])]
                      newRaces.splice(index, 1)
                      onChange({ ...data, raceSystem: newRaces })
                    }}
                    className="shrink-0 w-6 h-6 text-red-500 hover:bg-red-50 rounded-full text-sm flex items-center justify-center"
                    title="删除此项"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                onChange({ ...data, raceSystem: [...(data?.raceSystem || []), ''] })
              }}
              className="mt-2 px-3 py-1 text-sm text-stone-700 hover:bg-stone-50 rounded-lg border border-stone-200"
            >
              + 添加种族
            </button>
          </div>

          {/* 历史纪元链 */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">历史纪元链 <RegenButton step={stepName} field="eraChain" label="历史纪元链" /></h4>
            <textarea
              value={cleanText(data?.eraChain || '')}
              onChange={(e) => onChange({ ...data, eraChain: e.target.value })}
              onInput={autoResize}
              rows={2}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
              placeholder="基于本作世界观设定填写历史纪元演进（建议40-80字）"
            />
          </div>

          {/* 文明断层 / 传承体系 */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">文明断层 / 传承体系 <RegenButton step={stepName} field="civilizationFault" label="文明断层" /></h4>
            <textarea
              value={cleanWorldbuildingText(cleanText(data?.civilizationFault || ''))}
              onChange={(e) => onChange({ ...data, civilizationFault: e.target.value })}
              onInput={autoResize}
              rows={3}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
              placeholder="基于本作世界观设定填写文明兴衰与传承脉络（建议40-80字）"
            />
          </div>

          {/* 地缘政治格局 */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">地缘政治格局 <RegenButton step={stepName} field="geopolitics" label="地缘政治格局" /></h4>
            <textarea
              value={cleanWorldbuildingText(cleanText(data?.geopolitics || ''))}
              onChange={(e) => onChange({ ...data, geopolitics: e.target.value })}
              onInput={autoResize}
              rows={3}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
              placeholder="基于本作世界观设定填写主要势力的地理分布格局（建议40-80字）"
            />
          </div>

          {/* 经济体系 */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">经济体系 <RegenButton step={stepName} field="economicSystem" label="经济体系" /></h4>
            <textarea
              value={cleanText(data?.economicSystem || '')}
              onChange={(e) => onChange({ ...data, economicSystem: e.target.value })}
              onInput={autoResize}
              rows={2}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
              placeholder="基于本作世界观设定填写主要贸易形式、货币、特产等"
            />
          </div>

          {/* 宗教信仰体系 */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">宗教信仰体系 <RegenButton step={stepName} field="religion" label="宗教信仰体系" /></h4>
            <textarea
              value={cleanText(data?.religion || '')}
              onChange={(e) => onChange({ ...data, religion: e.target.value })}
              onInput={autoResize}
              rows={2}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
              placeholder="基于本作世界观设定填写主要信仰与宗教派系"
            />
          </div>

          {/* 禁忌与律法：可增删数组 */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">禁忌与律法 <RegenButton step={stepName} field="taboos" label="禁忌与律法" /></h4>
            <ul className="space-y-2">
              {(Array.isArray(data?.taboos) ? data.taboos : []).map((taboo: string, index: number) => (
                <li key={`taboo-${index}-${taboo.slice(0, 10)}`} className="flex items-start space-x-3">
                  <span className="w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                    {index + 1}
                  </span>
                  <textarea
                    value={taboo}
                    onChange={(e) => {
                      const newTaboos = [...(data?.taboos || [])]
                      newTaboos[index] = e.target.value
                      onChange({ ...data, taboos: newTaboos })
                    }}
                    onInput={autoResize}
                    rows={1}
                    className="flex-1 px-3 py-1 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
                    placeholder="基于本作世界观设定填写禁忌律法"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newTaboos = [...(data?.taboos || [])]
                      newTaboos.splice(index, 1)
                      onChange({ ...data, taboos: newTaboos })
                    }}
                    className="shrink-0 w-6 h-6 text-red-500 hover:bg-red-50 rounded-full text-sm flex items-center justify-center"
                    title="删除此项"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                onChange({ ...data, taboos: [...(data?.taboos || []), ''] })
              }}
              className="mt-2 px-3 py-1 text-sm text-stone-700 hover:bg-stone-50 rounded-lg border border-stone-200"
            >
              + 添加禁忌
            </button>
          </div>

          {/* 神话传说 */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">神话传说 <RegenButton step={stepName} field="mythology" label="神话传说" /></h4>
            <textarea
              value={cleanWorldbuildingText(cleanText(data?.mythology || ''))}
              onChange={(e) => onChange({ ...data, mythology: e.target.value })}
              onInput={autoResize}
              rows={3}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
              placeholder={currentGenre === 'history' || currentGenre === 'modern' ? '本作时代背景下的历史传说 / 民间谶纬 / 帝王受命异闻（建议30-60字，须贴合当前主题）' : '本世界流传的核心神话传说（建议30-60字）'}
            />
            {(currentGenre === 'history' || currentGenre === 'modern') && (
              <p className="mt-1.5 text-xs text-stone-400">提示：当前为{ currentGenre === 'history' ? '历史/朝堂' : '现代' }题材，神话传说宜改写为符合该时代背景的历史传说、民间谶纬或都市怪谈，避免出现仙侠/洪荒式神话。</p>
            )}
          </div>

          {/* 世界观深度（三界/禁地/天道设定） */}
          <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-xl p-4 space-y-4">

            {/* 三界结构 - 仅东方玄幻/修仙题材显示 */}
            {showEasternMythologyFields && (
            <div className="bg-white border border-amber-200 rounded-lg p-3">
              <label className="text-sm font-medium text-amber-900 mb-2 block">三界结构（天庭/地界/幽冥）</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <span className="text-xs text-stone-700 font-medium block mb-1">天庭（仙道）</span>
                  <textarea
                    value={cleanText(data?.threeRealms?.heaven || '')}
                    onChange={(e) => onChange({ ...data, threeRealms: { ...(data?.threeRealms || {}), heaven: e.target.value } })}
                    onInput={autoResize}
                    rows={2}
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-xs text-stone-700 focus:ring-2 focus:ring-stone-400 resize-y"
                    placeholder="基于本作世界观设定填写天庭仙道所在"
                  />
                </div>
                <div>
                  <span className="text-xs text-orange-600 font-medium block mb-1">地界/人间</span>
                  <textarea
                    value={cleanText(data?.threeRealms?.earth || '')}
                    onChange={(e) => onChange({ ...data, threeRealms: { ...(data?.threeRealms || {}), earth: e.target.value } })}
                    onInput={autoResize}
                    rows={2}
                    className="w-full px-2 py-1 bg-stone-50 border border-orange-200 rounded text-xs text-stone-700 focus:ring-2 focus:ring-orange-400 resize-y"
                    placeholder="基于本作世界观设定填写人间核心地域"
                  />
                </div>
                <div>
                  <span className="text-xs text-stone-800 font-medium block mb-1">幽冥（冥界/鬼界）</span>
                  <textarea
                    value={cleanText(data?.threeRealms?.underworld || '')}
                    onChange={(e) => onChange({ ...data, threeRealms: { ...(data?.threeRealms || {}), underworld: e.target.value } })}
                    onInput={autoResize}
                    rows={2}
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-xs text-stone-700 focus:ring-2 focus:ring-stone-400 resize-y"
                    placeholder="基于本作世界观设定填写幽冥冥界所在"
                  />
                </div>
              </div>
            </div>
            )}

            {/* 重要地点/秘境列表 - 通用字段，所有题材显示 */}
            <div className="bg-white border border-amber-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-amber-900">重要地点/秘境列表</label>
                <button
                  type="button"
                  onClick={() => onChange({ ...data, forbiddenZones: [...(Array.isArray(data?.forbiddenZones) ? data.forbiddenZones : []), { name: '', danger: '', desc: '' }] })}
                  className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                >+ 添加地点</button>
              </div>
              <div className="space-y-2">
                {(Array.isArray(data?.forbiddenZones) ? data.forbiddenZones : []).map((zone: Record<string, unknown>, zi: number) => (
                  <div key={zi} className="bg-stone-50 border border-stone-200 rounded-lg p-2 flex items-start gap-2">
                    <span className="w-5 h-5 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{zi + 1}</span>
                    <div className="flex-1 space-y-1">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={String(zone.name || '')}
                          onChange={(e) => {
                            const nz = [...(data?.forbiddenZones || [])]
                            nz[zi] = { ...zone, name: e.target.value }
                            onChange({ ...data, forbiddenZones: nz })
                          }}
                          placeholder="基于本作世界观设定填写地点/秘境名称"
                          className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded text-xs font-medium text-stone-900 focus:ring-2 focus:ring-amber-400"
                        />
                        <select
                          value={String(zone.danger || '')}
                          onChange={(e) => {
                            const nz = [...(data?.forbiddenZones || [])]
                            nz[zi] = { ...zone, danger: e.target.value }
                            onChange({ ...data, forbiddenZones: nz })
                          }}
                          className="px-2 py-1 bg-white border border-stone-200 rounded text-xs text-stone-600 focus:ring-2 focus:ring-amber-400"
                        >
                          <option value="">危险度</option>
                          <option value="低">低</option>
                          <option value="中">中</option>
                          <option value="高">高</option>
                          <option value="极高">极高</option>
                          <option value="禁入">禁入</option>
                        </select>
                      </div>
                      <input
                        type="text"
                        value={String(zone.desc || '')}
                        onChange={(e) => {
                          const nz = [...(data?.forbiddenZones || [])]
                          nz[zi] = { ...zone, desc: e.target.value }
                          onChange({ ...data, forbiddenZones: nz })
                        }}
                        placeholder="根据本世界设定描述该地点特色与由来"
                        className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-xs text-stone-600 focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nz = [...(data?.forbiddenZones || [])]
                        nz.splice(zi, 1)
                        onChange({ ...data, forbiddenZones: nz })
                      }}
                      className="shrink-0 w-5 h-5 text-red-500 hover:bg-red-50 rounded text-xs flex items-center justify-center"
                    >✕</button>
                  </div>
                ))}
                {(!data?.forbiddenZones || data.forbiddenZones.length === 0) && (
                  <p className="text-xs text-stone-400 text-center py-2">暂无重要地点，建议添加3-5个</p>
                )}
              </div>
            </div>

            {/* 天道法则 - 仅东方玄幻/修仙题材显示 */}
            {showEasternMythologyFields && (
            <div className="bg-white border border-amber-200 rounded-lg p-3">
              <label className="text-sm font-medium text-amber-900 mb-2 block">天道法则（世界运行根本规则）</label>
              <p className="text-xs text-stone-500 mb-2">天道运行的底层规则，如气运、因果、天劫、气数</p>
              <textarea
                value={cleanText(data?.heavenlyRules || '')}
                onChange={(e) => onChange({ ...data, heavenlyRules: e.target.value })}
                onInput={autoResize}
                rows={3}
                className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-amber-400 resize-y"
                placeholder="基于本作世界观设定填写世界运行的底层规则"
              />
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
