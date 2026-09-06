'use client'

import { useEffect, useRef, useState } from 'react'
import { Zap, Swords, AlertCircle, Plus, Trash2, ChevronDown } from 'lucide-react'
import type { GeneratedData } from '../ai-generate-wizard'

interface TypeItem {
  id: string
  name: string
  category: string
  description?: string
  order: number
  realmSystem?: string
  cultivationMethod?: string
  restraintRelation?: string
  coreFunction?: string
  triggerCondition?: string
  limitations?: string
  growthPath?: string
}

interface AbilityTemplate {
  name: string
  description: string
  abilities: string[]
  coreFunctions: string[]
  limitations: string[]
  evolution: string
  source: string
}

const abilityTemplates: Record<string, AbilityTemplate> = {}

interface AbilityItem {
  id?: string
  name: string
  type: string
  description?: string
  abilities?: string[]
  coreFunctions?: string[]
  limitations?: string[]
  evolution?: string
  source?: string
  costBacklash?: string
  restraintRelations?: string
  hiddenOrigin?: string
  runawayForm?: string
  fusionPotential?: string
}

// 🔥 题材能力推断：依据力量名称/金手指能力推断体系类型
function inferSystemTypeName(combined: string): string {
  const c = combined || ''
  if (/魔法|斗气|魔导|西幻|骑士|法神|大魔导师|魔兽|魔核/.test(c)) return '魔法体系'
  if (/洪荒|巫族|祖巫|封神|圣人|大罗金仙|神魔|神格|无量/.test(c)) return '洪荒体系'
  if (/武道|武学|武侠|炼体|内力|江湖|内功|武圣|淬体/.test(c)) return '武道体系'
  if (/科技|星际|基因|机甲|赛博|量子|精神念师|星舰/.test(c)) return '科技体系'
  if (/修仙|修真|仙|炼气|筑基|金丹|元婴|化神|渡劫|灵根|宗门/.test(c)) return '修仙体系'
  return ''
}

// 🔥 2026-08-31：金手指类型 → 世界力量体系类型 对应映射（与后端 _deriveWorldSystemType 保持一致），
//    用于"金手指设定同步世界观设定中的力量体系"，确保二者类型对应一致。
function abilityTypeToSystemType(abilityType: string): string {
  if (!abilityType) return ''
  const at = abilityType.trim()
  const map: Record<string, string> = {
    '系统类': '系统流体系',
    '功法类': '修仙体系',
    '血脉类': '血脉体系',
    '神器类': '神器体系',
    '天赋类': '天赋体系',
    '灵魂类': '魂修体系',
    '空间类': '空间体系',
    '时间类': '时间体系',
    '轮回类': '轮回体系',
    '契约类': '契约体系',
    '吞噬类': '吞噬进化体系',
    '领域类': '领域体系',
    '知识类': '知识文明体系',
    '记忆类': '知识文明体系',
    '智谋类': '权谋谋略体系',
    '异能类': '异能等级体系',
    '气运类': '气运体系',
    '无金手指': '无等级体系',
  }
  return map[at] || ''
}

// 🔥 默认境界：力量体系为空时，依据题材/名称给出非空默认层级（至少3-5个境界名）
function defaultRealmLevels(type: string, name: string, abilities: AbilityItem[]): string[] {
  const kw = (type || '') + ' ' + (name || '') + ' ' + (abilities || []).map(function(a: AbilityItem) { return (a.name || '') + ' ' + (a.type || '') }).join(' ')
  if (/魔法|斗气|魔导|西幻|法|龙|魔/.test(kw)) return ['魔法学徒', '初级魔法师', '中级魔法师', '高级魔法师', '大魔导师', '法神']
  if (/科技|星际|机甲|基因|赛博|精神念师|星舰/.test(kw)) return ['D级', 'C级', 'B级', 'A级', 'S级', 'SSS级']
  if (/武道|武侠|炼体|内功|江湖|武功/.test(kw)) return ['三流武者', '二流武者', '一流武者', '绝顶高手', '武道大宗师', '武神']
  if (/洪荒|巫|神魔|圣人|神/.test(kw)) return ['人仙', '地仙', '天仙', '真仙', '金仙', '大罗金仙']
  if (/修仙|修真|仙|炼气|筑基|金丹|元婴|化神|渡劫|灵根|宗门/.test(kw)) return ['炼气期', '筑基期', '金丹期', '元婴期', '化神期', '渡劫期']
  return ['入门级', '初级', '中级', '高级', '巅峰级']
}

// ============================================================================
// 🔥 2026-09-01 第12轮：金手指步「境界/等级体系」对齐【世界观设定步】的三列表格样式
//    世界观设定步渲染形态：品阶 | 文官（职事·散阶） | 武将（武职·爵位），每行 3 个可编辑 input。
//    这里复用与 StepWorldbuilding.parsePowerSystem 完全一致的配对行正则，保证两边解析结果 100% 同步。
// ============================================================================
interface RankRow { rank: string; civil: string; military: string }

// 配对行正则：兼容「未入流｜文『书吏·皂隶·巡拦』｜武『战兵·马卒·力士』」
// 与「正一品→文…→武…」两种写法（分隔字符类同时允许 ｜| ：: → - 与空格）
const RANK_LINE_RE = /^(?:([^｜|文]{1,8}?)\s*[：:|｜→\-]*\s*)?文(?:职|官)?\s*[『「【]?\s*(.+?)\s*[』」】]?\s*[｜|]?\s*武(?:职|官|将)?\s*[『「【]?\s*(.+?)\s*[』」】]?\s*$/

function cleanRankCell(x: unknown): string {
  return String(x == null ? '' : x).replace(/[『「』」【】]/g, '').replace(/[。；;]+$/, '').trim()
}

// 从任意文本块中解析「品阶 文… 武…」对照表；少于 3 行不采纳（避免误判为对照表）
function parseRankTableFromText(text: unknown): RankRow[] {
  if (typeof text !== 'string' || !text.trim()) return []
  const rows: RankRow[] = []
  String(text).replace(/\\n/g, '\n').replace(/[；;]+/g, '\n').split(/\n+/).forEach(function (line: string) {
    const L = line.trim()
    if (!L) return
    const mm = L.match(RANK_LINE_RE)
    if (!mm) return
    const rank = (mm[1] || '').replace(/\s+/g, '').trim()
    const civil = cleanRankCell(mm[2])
    const military = cleanRankCell(mm[3])
    if (civil || military) rows.push({ rank: rank, civil: civil, military: military })
  })
  return rows.length >= 3 ? rows : []
}

// 从字符串数组（levels / realmSystem 拆分结果）解析配对表
function parseRankTableFromList(list: unknown): RankRow[] {
  if (!Array.isArray(list)) return []
  return parseRankTableFromText(list.map(function (x: unknown) { return String(x == null ? '' : x) }).join('\n'))
}

// 归一化 rankTable：兼容对象数组 {rank,civil,military} 与配对文本字符串数组
function normalizeRankTable(src: unknown): RankRow[] {
  if (!Array.isArray(src)) return []
  const rows: RankRow[] = []
  src.forEach(function (it: unknown) {
    if (!it) return
    if (typeof it === 'string') {
      const mm = it.trim().match(RANK_LINE_RE)
      if (mm) {
        const _c = cleanRankCell(mm[2]); const _m = cleanRankCell(mm[3])
        if (_c || _m) rows.push({ rank: (mm[1] || '').replace(/\s+/g, '').trim(), civil: _c, military: _m })
      }
      return
    }
    if (typeof it === 'object') {
      const o = it as Record<string, unknown>
      const rank = String(o.rank ?? o.level ?? o.name ?? '').trim()
      const civil = String(o.civil ?? o.civilian ?? o.wen ?? o.文 ?? '').trim()
      const military = String(o.military ?? o.wu ?? o.武 ?? '').trim()
      if (civil || military) rows.push({ rank: rank, civil: civil, military: military })
    }
  })
  return rows.length >= 3 ? rows : []
}

// 三列 → 扁平 levels（顺序与世界设定步 serializePowerSystem 保持一致：先文后武、逐阶展开）
function rankTableToLevels(rows: RankRow[]): string[] {
  return (rows || []).reduce(function (a: string[], r: RankRow) {
    if (r.civil) a.push(r.civil)
    if (r.military) a.push(r.military)
    return a
  }, [])
}

// 🔥 世界力量体系归一化：name/type/levels 为空时给出非空默认值（兼容 type 字段是对象/数组的情况）
//   2026-09-01：新增 wbText 兜底——金手指自身 worldPowerSystem 为空时，从世界观设定力量体系文本补齐，确保两环节同步显示。
function buildWorldPowerSystemView(data: GeneratedData['powerSystem'], abilities: AbilityItem[], systemTypes: TypeItem[], wbText?: string): { name: string; type: string; description: string; levels: string[]; rankTable: RankRow[]; ladders: { label: string; items: string[] }[] } {
  const src = (data && data.worldPowerSystem && typeof data.worldPowerSystem === 'object') ? data.worldPowerSystem as Record<string, unknown> : {}
  let name = (typeof src.name === 'string' ? src.name : src.name == null ? '' : String(src.name)).trim()
  let type = (typeof src.type === 'string' ? src.type : src.type == null ? '' : String(src.type)).trim()
  let description = (typeof src.description === 'string' ? src.description : src.description == null ? '' : String(src.description)).trim()
  let levels: string[] = Array.isArray(src.levels)
    ? src.levels.map(function(l: unknown) {
        if (typeof l === 'object') {
          const ll = l as Record<string, unknown>
          return String(ll.name || ll.label || '')
        }
        return String(l)
      }).map(function(s: string) { return s.trim() }).filter(Boolean)
    : []
  // 🔥 修复Bug1：无条件从世界观设定文本抽取【境界划分】真值块，供后续 rankTable 三列重建使用
  //   （此前仅在 name/type/levels 皆空的分支里计算，导致金手指自身已填充时拿不到配对表 → 退化成扁平列表）
  var _realmBlock = wbText ? ((String(wbText).match(/【境界划分】([\s\S]*?)(?=【|$)/) || [])[1] || '') : ''
  // 🔥 2026-09-01 兜底：金手指自身 worldPowerSystem 关键字段为空时，从世界观设定-力量体系文本补齐（含带朝代前缀的 type）
  if ((!name || !type || levels.length === 0) && wbText) {
    var _wbName = (wbText.match(/【体系名称】([^\n]*)/) || [])[1] || ''
    var _wbType = (wbText.match(/【体系类型】([^\n]*)/) || [])[1] || ''
    var _wbDesc = (wbText.match(/【体系描述】([^\n]*)/) || [])[1] || ''
    var _wbLevels: string[] = []
    if (_realmBlock) {
      _realmBlock.split(/\n+/).forEach(function (line: string) {
        var _civ = (line.match(/文[『「【]([^』】]+)[』」】]/) || [])[1] || ''
        var _mil = (line.match(/武[『「【]([^』】]+)[』」】]/) || [])[1] || ''
        if (_civ) _wbLevels.push(_civ.trim())
        if (_mil) _wbLevels.push(_mil.trim())
      })
    }
    if (!name && _wbName) name = _wbName.trim()
    if (!type && _wbType) type = _wbType.trim()
    if (!description && _wbDesc) description = _wbDesc.trim()
    if (levels.length === 0 && _wbLevels.length > 0) levels = _wbLevels
  }
  // 🔥 2026-09-01 第12轮：构建「品阶 / 文官 / 武将」三列 rankTable，使本步渲染形态与世界设定步完全一致。
  //   优先级：本步自身编辑结果 > 世界观设定步的【境界划分】真值 > AI 直出的配对 levels > 设定中心体系模板。
  let rankTable: RankRow[] = normalizeRankTable(src.rankTable)
  if (rankTable.length < 3) rankTable = parseRankTableFromText(_realmBlock)
  if (rankTable.length < 3) rankTable = parseRankTableFromList(src.levels)
  if (rankTable.length < 3) {
    const _matchedType = systemTypes.find(function (t: TypeItem) {
      return (type && t.name === type) || (name && t.name === name)
    })
    if (_matchedType && _matchedType.realmSystem) {
      rankTable = parseRankTableFromText(String(_matchedType.realmSystem))
    }
  }
  // type 为空时依据名称/能力推断（systemTypes 里同名校验仅为高亮所用，不强制）
  if (!type) type = inferSystemTypeName(name + ' ' + abilities.map(function(a: AbilityItem) { return (a.name || '') + ' ' + (a.type || '') }).join(' '))
  const finalName = name || type
  if (levels.length === 0) levels = defaultRealmLevels(type, finalName, abilities)
  // 有对照表时，levels 以对照表为准，确保两个步骤显示完全同步
  if (rankTable.length >= 3) levels = rankTableToLevels(rankTable)
  // 🔥 2026-09-01 视觉对齐：同时产出 ladders 形态（与 StepWorldbuilding 一致），用于无 rankTable 但有 2+ 列分组时的双栏渲染
  const ladders: { label: string; items: string[] }[] = rankTable.length >= 3
    ? [
        { label: '文官（职事·散阶）', items: rankTable.map(function (r) { return r.civil || '' }) },
        { label: '武将（武职·爵位）', items: rankTable.map(function (r) { return r.military || '' }) },
      ]
    : []
  return {
    name: finalName,
    type: type,
    description: description,
    levels: levels,
    rankTable: rankTable,
    ladders: ladders,
  }
}

// 🔥 成长发展路线默认值：ability.evolution 为空时，依据金手指能力生成非空默认成长路线
function buildDefaultEvolution(ability: AbilityItem): string {
  const name = (ability.name || '').trim() || '该金手指'
  const type = (ability.type || '').trim()
  const abilities = (ability.abilities && ability.abilities.length)
    ? ability.abilities.slice(0, 3).map(function(a: string) { return a.trim() }).filter(Boolean)
    : []
  const isSystemStyle = /系统/.test(name) || /系统/.test(type)
  const stages = isSystemStyle
    ? ['初级激活', '中级成长', '高级蜕变', '巅峰觉醒']
    : ['入门启蒙', '成长突破', '蜕变进化', '巅峰圆满']
  const lines = stages.map(function(stage: string, i: number) {
    const abilityDesc = abilities[i] ? '核心能力"' + abilities[i] + '"得到强化，战力与境界同步提升。' : '解锁更高层潜力的同时，升级代价与反噬逐级递增。'
    return '阶段' + (i + 1) + '【' + stage + '】：' + name + (type ? '（' + type + '）' : '') + '完成' + stage + '突破。' + abilityDesc + '与该阶段主线关键剧情（卷' + (i + 1) + '高潮）深度绑定。'
  })
  return '【成长发展路线】\n' + lines.join('\n')
}

// 🔥 体系类型下拉框：可滚动（max-height + overflow-y:auto）、足够 z-index、支持已选高亮、防坑位溢出裁切
interface TypeDropdownProps {
  value: string
  options: TypeItem[]
  placeholder: string
  onSelect: (name: string) => void
}

function TypeDropdown({ value, options, placeholder, onSelect }: TypeDropdownProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const currentVal = (value == null ? '' : String(value)).trim()
  const selected = options.find(function(o: TypeItem) { return o.name === currentVal })

  useEffect(function() {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return function() { document.removeEventListener('mousedown', handleOutside) }
  }, [open])

  const groups: Record<string, TypeItem[]> = {}
  options.forEach(function(o: TypeItem) {
    if (!groups[o.category]) groups[o.category] = []
    groups[o.category].push(o)
  })

  return (
    <div ref={wrapRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(function(v) { return !v })}
        className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-700 text-left text-sm flex items-center justify-between focus:ring-2 focus:ring-stone-400 focus:border-transparent"
      >
        <span className={selected ? 'text-stone-700' : 'text-stone-400'}>
          {selected ? selected.name : (currentVal || placeholder)}
        </span>
        <ChevronDown className="w-4 h-4 text-stone-400 shrink-0 ml-2" />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-[100] mt-1 bg-white border border-stone-200 rounded-lg shadow-xl"
          style={{ maxHeight: 280, overflowY: 'auto' }}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-stone-400 text-sm">暂无类型，请在设定中心维护</div>
          ) : (
            Object.keys(groups).map(function(category: string) { return (
              <div key={category}>
                <div className="px-3 py-1 bg-stone-50 text-xs font-medium text-stone-500 sticky top-0 border-b border-stone-100">{category}</div>
                {groups[category].map(function(item: TypeItem) {
                  const active = item.name === currentVal
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setOpen(false); onSelect(item.name) }}
                      className={'w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex items-center justify-between ' + (active ? 'bg-amber-100 font-medium text-amber-800' : 'text-stone-700')}
                    >
                      <span>{item.name}{item.description ? '（' + item.description + '）' : ''}</span>
                      {active && <span className="text-amber-600 shrink-0 ml-1">✓</span>}
                    </button>
                  )
                })}
              </div>
            ) })
          )}
        </div>
      )}
    </div>
  )
}

interface StepPowerSystemProps {
  data: GeneratedData['powerSystem']
  // 🔥 2026-09-01 修复：传入世界观设定-力量体系文本，金手指 worldPowerSystem 为空时兜底同步显示，确保两环节一致。
  worldbuildingText?: string
  onChange: (updated: GeneratedData['powerSystem']) => void
  onRegenerate: (step: string, field?: string) => void
  onGenerate: () => void
  isLoading: boolean
  regeneratePrompt: string
  setRegeneratePrompt: (v: string) => void
  RegenButton: React.ComponentType<{ step: string; field?: string; label: string }>
  regeneratingField: string | null
  stepName: string
}

function renderAbilityCard(ability: AbilityItem, abIdx: number, total: number, data: GeneratedData['powerSystem'], onChange: (updated: GeneratedData['powerSystem']) => void, abilityTypeOptions: React.ReactNode) {
  const abilitiesList: AbilityItem[] = Array.isArray(data?.protagonistAbilities) ? data.protagonistAbilities : []
  const isPrimary = abIdx === 0

  const updateAbility = function(field: string, value: unknown) {
    const newAbilities = [...abilitiesList]
    newAbilities[abIdx] = { ...newAbilities[abIdx], [field]: value }
    const newData = { ...data, protagonistAbilities: newAbilities }
    if (isPrimary) {
      newData.protagonistAbility = { ...newAbilities[0] }
    }
    onChange(newData as NonNullable<GeneratedData['powerSystem']>)
  }

  const updateAbilitySub = function(field: string, subIdx: number, value: unknown) {
    const newAbilities = [...abilitiesList]
    const arr = [...(newAbilities[abIdx][field as keyof AbilityItem] as unknown[] || [])]
    arr[subIdx] = value
    newAbilities[abIdx] = { ...newAbilities[abIdx], [field]: arr }
    const newData = { ...data, protagonistAbilities: newAbilities }
    if (isPrimary) {
      newData.protagonistAbility = { ...newAbilities[0] }
    }
    onChange(newData as NonNullable<GeneratedData['powerSystem']>)
  }

  const handleTypeChange = function(newType: string) {
    const newAbilities = [...abilitiesList]
    newAbilities[abIdx] = {
      ...newAbilities[abIdx],
      type: newType,
    }
    const newData = { ...data, protagonistAbilities: newAbilities }
    if (isPrimary) {
      newData.protagonistAbility = { ...newAbilities[0] }
      // 🔥 2026-08-31：金手指类型变更 → 同步世界观力量体系类型（取值于金手指/体系类型）
      const derivedSysType = abilityTypeToSystemType(newType)
      if (derivedSysType) {
        newData.worldPowerSystem = {
          ...(data?.worldPowerSystem || {}),
          type: derivedSysType,
        }
      }
    }
    onChange(newData as NonNullable<GeneratedData['powerSystem']>)
  }

  const handleDelete = function() {
    if (total <= 1) return
    const newAbilities = abilitiesList.filter(function(_: unknown, i: number) { return i !== abIdx })
    const newData = { ...data, protagonistAbilities: newAbilities }
    if (newAbilities.length > 0) {
      newData.protagonistAbility = { ...newAbilities[0] }
    }
    onChange(newData as NonNullable<GeneratedData['powerSystem']>)
  }

  const abColor = isPrimary ? 'amber' : 'orange'
  const bgGrad = isPrimary ? 'from-amber-50 to-orange-50' : 'from-orange-50 to-yellow-50'
  const ringColor = isPrimary ? 'focus:ring-amber-500' : 'focus:ring-orange-500'
  const textColor = isPrimary ? 'text-amber-600' : 'text-orange-600'
  const bgBadge = isPrimary ? 'bg-amber-100' : 'bg-orange-100'
  const cardBorder = isPrimary ? 'border-amber-200' : 'border-orange-200'

  return (
    <div key={abIdx} className={'bg-gradient-to-br ' + bgGrad + ' rounded-xl p-4 space-y-3 border ' + cardBorder}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-stone-900 flex items-center space-x-2">
          <Zap className={'w-5 h-5 ' + textColor} />
          <span>{isPrimary ? '主角金手指（主）' : '金手指' + (abIdx + 1)}</span>
          {isPrimary && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">核心</span>}
        </h4>
        {total > 1 && (
          <button
            type="button"
            onClick={handleDelete}
            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="删除此金手指"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-stone-500">金手指名称</label>
          <input
            type="text"
            value={ability.name || ''}
            onChange={(e) => updateAbility('name', e.target.value)}
            className={'w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg font-medium text-stone-900 ' + ringColor + ' focus:border-transparent'}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-stone-500">金手指类型</label>
          <select
            value={ability.type || ''}
            onChange={(e) => handleTypeChange(e.target.value)}
            className={'w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-700 ' + ringColor + ' focus:border-transparent'}
          >
            <option value="">-- 选择类型 --</option>
            {abilityTypeOptions}
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-stone-500">金手指描述 <span className="text-amber-600 text-xs ml-1">含来源+代价+克制+伏笔+暴走+融合潜力</span></label>
        <textarea
          value={ability.description || ''}
          onChange={(e) => updateAbility('description', e.target.value)}
          onInput={(e) => { const ta = e.currentTarget; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }}
          rows={10}
          placeholder={`【金手指描述·需包含7个分段，每段50-100字，总计400-700字】
━━━ 金手指来源（决定本质）━━━
交代【谁创造+为何存在+主角如何获得】，如：上古大能遗留 / 系统绑定 / 血脉觉醒 / 天道赐福

━━━ 核心能力（3-5个主能力）━━━
列出金手指的核心能力名称+功能描述

━━━ 代价/反噬机制（驱动成长·无代价则无张力）━━━
包含【触发条件+反噬表现+递进层级+缓解方式】

━━━ 克制关系（平衡战力·制造矛盾）━━━
包含【被什么克制+克制什么+克制原因+克制程度】

━━━ 隐藏来历/伏笔（后期大反转）━━━
包含【表面来历+真实来历+宿命关联+何时揭晓】

━━━ 失控形态/暴走设定（爽点爆发）━━━
包含【触发条件+外在变化+战力飙升+危害+制止方式】

━━━ 融合潜力（后期升级路线）━━━
包含【可融合力量+融合效果+融合条件/风险+终极形态】
`}
          className={'w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-700 ' + ringColor + ' focus:border-transparent'}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-stone-500">核心功能</label>
        {ability.coreFunctions && ability.coreFunctions.length > 0 ? (
          <ul className="space-y-1 mt-1">
            {ability.coreFunctions.map(function(func: string, fi: number) { return (
              <li key={fi} className="flex items-start space-x-2">
                <span className={'w-5 h-5 ' + bgBadge + ' ' + textColor + ' rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5'}>
                  {fi + 1}
                </span>
                <span className="px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 flex-1 whitespace-pre-wrap">
                  {func}
                </span>
              </li>
            )})}
          </ul>
        ) : (
          <p className="mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-400 text-sm">等待AI生成核心功能</p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium text-stone-500">具体能力</label>
        {ability.abilities && ability.abilities.length > 0 ? (
          <ul className="space-y-1 mt-1">
            {(ability.abilities || []).map(function(ab: string, abi: number) { return (
              <li key={abi} className="flex items-start space-x-2">
                <span className={'w-5 h-5 ' + bgBadge + ' ' + textColor + ' rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5'}>
                  {abi + 1}
                </span>
                <textarea
                  value={ab}
                  onChange={(e) => updateAbilitySub('abilities', abi, e.target.value)}
                  onInput={(e) => { const ta = e.currentTarget; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }}
                  rows={2}
                  className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </li>
            )})}
          </ul>
        ) : (
          <p className="mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-400 text-sm">等待AI生成具体能力</p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium text-stone-500">能力限制</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {(() => {
            const limitations = ability.limitations
            const list = Array.isArray(limitations)
              ? limitations.filter(function(l: string) { return l && l.trim() })
              : (limitations && String(limitations).trim() ? [String(limitations)] : [])
            if (list.length === 0) {
              return <span className="text-stone-400 text-sm">（暂无明确限制，可点击重新生成）</span>
            }
            return list.map(function(limitation: string, li: number) { return (
              <span key={li} className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-sm whitespace-pre-wrap">
                {limitation}
              </span>
            )})
          })()}
        </div>
      </div>

      {/* 深度字段：来源/代价/克制/伏笔/暴走/融合 */}
      <div>
        <label className="text-sm font-medium text-stone-500">金手指来源</label>
        <textarea
          value={ability.source || ''}
          onChange={(e) => updateAbility('source', e.target.value)}
          onInput={(e) => { const ta = e.currentTarget; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }}
          rows={2}
          placeholder="基于本作金手指设定填写来源：交代【谁创造+为何存在+主角如何获得】"
          className={'w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-700 ' + ringColor + ' focus:border-transparent'}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-stone-500">代价/反噬机制</label>
        <textarea
          value={ability.costBacklash || ''}
          onChange={(e) => updateAbility('costBacklash', e.target.value)}
          onInput={(e) => { const ta = e.currentTarget; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }}
          rows={2}
          placeholder="基于本作金手指设定填写代价/反噬：包含【触发条件+反噬表现+递进层级+缓解方式】"
          className={'w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-700 ' + ringColor + ' focus:border-transparent'}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-stone-500">克制关系</label>
        <textarea
          value={ability.restraintRelations || ''}
          onChange={(e) => updateAbility('restraintRelations', e.target.value)}
          onInput={(e) => { const ta = e.currentTarget; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }}
          rows={2}
          placeholder="基于本作金手指设定填写克制关系：包含【被什么克制+克制什么+克制原因+克制程度】"
          className={'w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-700 ' + ringColor + ' focus:border-transparent'}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-stone-500">隐藏来历/伏笔</label>
        <textarea
          value={ability.hiddenOrigin || ''}
          onChange={(e) => updateAbility('hiddenOrigin', e.target.value)}
          onInput={(e) => { const ta = e.currentTarget; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }}
          rows={2}
          placeholder="基于本作金手指设定填写隐藏来历：包含【表面来历+真实来历+宿命关联+何时揭晓】"
          className={'w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-700 ' + ringColor + ' focus:border-transparent'}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-stone-500">失控形态/暴走设定</label>
        <textarea
          value={ability.runawayForm || ''}
          onChange={(e) => updateAbility('runawayForm', e.target.value)}
          onInput={(e) => { const ta = e.currentTarget; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }}
          rows={2}
          placeholder="基于本作金手指设定填写暴走形态：包含【触发条件+外在变化+战力飙升+危害+制止方式】"
          className={'w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-700 ' + ringColor + ' focus:border-transparent'}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-stone-500">融合潜力</label>
        <textarea
          value={ability.fusionPotential || ''}
          onChange={(e) => updateAbility('fusionPotential', e.target.value)}
          onInput={(e) => { const ta = e.currentTarget; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }}
          rows={2}
          placeholder="基于本作金手指设定填写融合潜力：包含【可融合力量+融合效果+融合条件/风险+终极形态】"
          className={'w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-700 ' + ringColor + ' focus:border-transparent'}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-stone-500">成长发展路线 <span className="text-amber-600 text-xs ml-1">含进化节点链+升级代价+与剧情融合点</span></label>
        <textarea
          value={(ability.evolution && String(ability.evolution).trim()) ? String(ability.evolution) : buildDefaultEvolution(ability)}
          onChange={(e) => updateAbility('evolution', e.target.value)}
          onInput={(e) => { const ta = e.currentTarget; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }}
          rows={14}
          placeholder={`【成长发展路线·需包含3个分段】
━━━ 升级条件与代价（驱动主角成长动力）━━━
① 日常修炼：每日修炼方式
② 突破磨砺：突破所需磨砺
③ 资源消耗：突破所需资源
④ 反噬代价：突破代价

━━━ 进化节点链（12个等级对齐力量体系·每个节点推动关键剧情）━━━
节点1【等级1名称】：突破条件-xxx，突破表现-xxx，剧情推动-xxx
节点2【等级2名称】：突破条件-xxx，突破表现-xxx，剧情推动-xxx
...（共12个节点）

━━━ 与剧情融合点（金手指必须推动关键剧情）━━━
① 关键节点1→推动剧情1（第X卷高潮·第X章）
② 关键节点2→推动剧情2（第X卷大反转·第X章）
...
`}
          className={'w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-700 min-h-[200px] ' + ringColor + ' focus:border-transparent'}
        />
      </div>
    </div>
  )
}

export default function StepPowerSystem({
  data, worldbuildingText, onChange, onRegenerate, onGenerate, isLoading, regeneratePrompt, setRegeneratePrompt, RegenButton, regeneratingField, stepName,
}: StepPowerSystemProps) {
  const isWholeStepRegenerating = regeneratingField === stepName
  const [abilityTypes, setAbilityTypes] = useState<TypeItem[]>([])
  const [systemTypes, setSystemTypes] = useState<TypeItem[]>([])
  const [loadingTypes, setLoadingTypes] = useState(false)

  useEffect(function() {
    const fetchTypes = async () => {
      try {
        setLoadingTypes(true)
        const response = await fetch('/tuzhong-wenshu/api/settings/types')
        if (response.ok) {
          const text = await response.text()
          try {
            const result = JSON.parse(text)
            if (result.success && result.data) {
              setAbilityTypes(result.data.abilityTypes || [])
              setSystemTypes(result.data.systemTypes || [])
            }
          } catch (parseErr) {
            console.error('类型数据 JSON 解析失败:', parseErr, '响应长度:', text?.length)
          }
        }
      } catch (error) {
        console.error('加载类型数据失败:', error)
      } finally {
        setLoadingTypes(false)
      }
    }
    fetchTypes()
  }, [])

  const renderAbilityTypeOptions = () => {
    if (abilityTypes.length === 0) {
      return <option value="">暂无类型，请在设定中心维护</option>
    }
    const groups: Record<string, TypeItem[]> = {}
    abilityTypes.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = []
      }
      groups[item.category].push(item)
    })
    return Object.entries(groups).map(([category, items]) => (
      <optgroup key={category} label={category}>
        {items.map((item) => (
          <option key={item.id} value={item.name}>
            {item.name}{item.description ? `（${item.description}）` : ''}
          </option>
        ))}
      </optgroup>
    ))
  }

  const autoResize = function(e: React.FormEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }

  useEffect(function() {
    function resizeAllTextareas() {
      document.querySelectorAll('textarea').forEach(function(ta) {
        ta.style.height = 'auto'
        ta.style.height = ta.scrollHeight + 'px'
      })
    }
    const t1 = setTimeout(resizeAllTextareas, 200)
    const t2 = setTimeout(resizeAllTextareas, 600)
    const t3 = setTimeout(resizeAllTextareas, 1200)
    return function() {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [data])

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
          <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">金手指设定</h3>
            <p className="text-stone-500 text-sm">AI将为你的主角设计独特的能力体系和成长路线</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
                placeholder={`输入你的需求，如：增强能力描写，细化成长路线...`}
                className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-stone-50"
              />
              <button
                type="button"
                onClick={onGenerate}
                disabled={isWholeStepRegenerating}
                className="whitespace-nowrap inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r wenshu-btn-primary rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isWholeStepRegenerating ? '生成中...' : '✨ 生成金手指设定'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  let abilitiesList: AbilityItem[] = []
  if (Array.isArray(data?.protagonistAbilities) && data.protagonistAbilities.length > 0) {
    abilitiesList = data.protagonistAbilities
  } else if (data?.protagonistAbility && (data.protagonistAbility.name || data.protagonistAbility.type)) {
    abilitiesList = [data.protagonistAbility]
  }

  // 🔥 世界力量体系归一化：name/type/levels 为空时给出非空默认值，避免空体系/类型字段类型错误
  const wpsView = buildWorldPowerSystemView(data, abilitiesList, systemTypes, worldbuildingText)
  const hasWorldPowerSystem = !!(data?.worldPowerSystem) && typeof data.worldPowerSystem === 'object'
  const hasAnyContent = abilitiesList.length > 0 || hasWorldPowerSystem

  const addNewAbility = function() {
    const newAbility: AbilityItem = {
      name: '',
      type: '',
      abilities: [],
      limitations: [],
      evolution: '',
      description: '',
    }
    const newAbilities = [...abilitiesList, newAbility]
    const newData = { ...data, protagonistAbilities: newAbilities }
    if (newAbilities.length === 1) {
      newData.protagonistAbility = { ...newAbility }
    }
    onChange(newData)
  }

  // 🔥 世界力量体系类型选择：兼容 type 字段值为对象/数组，转为字符串后与选项匹配；为空时保留默认层级
  const handleSystemTypeChange = function(newType: string) {
    const systemTypeItem = systemTypes.find(function(t: TypeItem) { return t.name === newType })
    let levels: string[] = []
    if (systemTypeItem && systemTypeItem.realmSystem) {
      // 设定中心 realmSystem 使用 → 分隔，兼容 \n ; > • 等多种分隔符
      levels = String(systemTypeItem.realmSystem)
        .split(/[→>•·;\n]/)
        .map(function(s: string) { return s.trim() })
        .filter(function(s: string) { return s.length > 0 })
    }
    // 选中的体系无境界时保留当前默认层级，确保世界力量体系不为空
    const finalLevels = levels.length > 0 ? levels : (wpsView.levels || [])
    const updatedData = {
      ...(data || {}),
      worldPowerSystem: {
        ...(data?.worldPowerSystem || {}),
        type: newType,
        name: systemTypeItem ? systemTypeItem.name : (data?.worldPowerSystem?.name || newType),
        description: systemTypeItem ? (systemTypeItem.description || '') : (data?.worldPowerSystem?.description || ''),
        levels: finalLevels,
        cultivationMethod: systemTypeItem ? (systemTypeItem.cultivationMethod || '') : (data?.worldPowerSystem?.cultivationMethod || ''),
        restraintRelation: systemTypeItem ? (systemTypeItem.restraintRelation || '') : (data?.worldPowerSystem?.restraintRelation || ''),
      },
    }
    onChange(updatedData)
    // 用户手动选择体系类型时回写设定中心（若该体系字段不完整则补充）
    if (newType && systemTypeItem) {
      const _selSysItem = systemTypeItem
      fetch('/tuzhong-wenshu/api/settings/types', { method: 'GET' })
        .then(function(r) { return r.json() })
        .then(function(d) {
          if (!d || !d.success) return
          const found = (d.data.systemTypes || []).find(function(t: TypeItem) { return t.name === newType })
          if (found && (!found.realmSystem || !found.cultivationMethod || !found.restraintRelation)) {
            const _upd: Record<string, unknown> = { id: found.id, name: newType }
            let _need = false
            if (!found.realmSystem && _selSysItem.realmSystem) { _upd.realmSystem = _selSysItem.realmSystem; _need = true }
            if (!found.cultivationMethod && _selSysItem.cultivationMethod) { _upd.cultivationMethod = _selSysItem.cultivationMethod; _need = true }
            if (!found.restraintRelation && _selSysItem.restraintRelation) { _upd.restraintRelation = _selSysItem.restraintRelation; _need = true }
            if (_need) {
              fetch('/tuzhong-wenshu/api/settings/types', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'system', item: _upd }),
              }).catch(function(e: unknown) { console.warn('[StepPowerSystem] 回写体系字段失败:', e instanceof Error ? e.message : String(e)) })
            }
          }
        })
        .catch(function(e: unknown) { console.warn('[StepPowerSystem] 查询体系失败:', e instanceof Error ? e.message : String(e)) })
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">金手指设定</h3>
          <p className="text-stone-500 text-sm">AI为你的主角设计了独特的能力体系和成长路线{abilitiesList.length > 1 ? '（双/多金手指）' : ''}</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={regeneratePrompt}
              onChange={(e) => setRegeneratePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
              placeholder={`输入你的需求，如：支持双金手指，增强能力描写...`}
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

      {!hasAnyContent && (
        <div className="text-center py-4 text-amber-600 text-sm">
          <AlertCircle className="w-5 h-5 mx-auto mb-2" />
          <p className="font-medium">数据返回不完整</p>
          <p className="mt-1">AI已返回数据，但主角能力字段为空。请点击&quot;🔄 重新生成&quot;按钮。</p>
        </div>
      )}

      <div className="space-y-4">
        {abilitiesList.map(function(ab: AbilityItem, abi: number) {
          return renderAbilityCard(ab, abi, abilitiesList.length, data, onChange, renderAbilityTypeOptions())
        })}

        {abilitiesList.length > 0 && abilitiesList.length < 4 && (
          <button
            type="button"
            onClick={addNewAbility}
            className="w-full py-3 border-2 border-dashed border-amber-300 rounded-xl text-amber-600 hover:bg-amber-50 hover:border-amber-400 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            添加金手指（支持双/多金手指设定）
          </button>
        )}

        {hasWorldPowerSystem && (
          <div className="bg-gradient-to-br from-stone-50 to-stone-50 rounded-xl p-4 space-y-3">
            <h4 className="font-semibold text-stone-900 flex items-center space-x-2">
              <Swords className="w-5 h-5 text-stone-700" />
              <span>世界力量体系</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-stone-500">体系名称</label>
                <input
                  type="text"
                  value={wpsView.name}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      worldPowerSystem: { ...(data.worldPowerSystem || {}), name: e.target.value, levels: wpsView.levels },
                    })
                  }
                  className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg font-medium text-stone-900 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-stone-500">体系类型</label>
                <TypeDropdown
                  value={wpsView.type}
                  options={systemTypes}
                  placeholder="-- 选择体系类型 --"
                  onSelect={handleSystemTypeChange}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-stone-500">体系描述</label>
              <textarea
                value={wpsView.description}
                onChange={(e) => onChange({ ...data, worldPowerSystem: { ...data?.worldPowerSystem, description: e.target.value, name: wpsView.name, type: wpsView.type, levels: wpsView.levels } })}
                onInput={(e) => { const ta = e.currentTarget; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }}
                rows={4}
                placeholder="基于本作世界观设定填写体系整体运作方式：包含【谁可以修炼+如何修炼+力量来源+社会影响+体系核心特征+流派分支】"
                className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-700 text-sm focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-y"
              />
            </div>

            {/* 🔥 2026-09-01 第12轮：境界/等级体系渲染三态对齐【世界观设定步】，形态：rankTable(3列表格) / ladders(2列网格) / levels(列表) */}
            <div>
              <label className="text-sm font-medium text-stone-500">境界/等级体系{wpsView.rankTable && wpsView.rankTable.length >= 3 ? '（文官 / 武将 对照）' : ''}</label>
              {wpsView.rankTable && wpsView.rankTable.length >= 3 ? (
                <div className="mt-1 border border-stone-200 rounded-lg overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-100 text-stone-600 text-xs">
                        <th className="px-2 py-1.5 text-left font-semibold w-20">品阶</th>
                        <th className="px-2 py-1.5 text-left font-semibold">文官（职事·散阶）</th>
                        <th className="px-2 py-1.5 text-left font-semibold">武将（武职·爵位）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wpsView.rankTable.map(function (r, ri) {
                        const updRankCell = function (key: 'civil' | 'military', v: string) {
                          const nr = wpsView.rankTable.map(function (x, i) { return i === ri ? { ...x, [key]: v } : x })
                          const nl = rankTableToLevels(nr)
                          onChange({ ...data, worldPowerSystem: { ...(data?.worldPowerSystem || {}), rankTable: nr, levels: nl } })
                        }
                        return (
                          <tr key={ri} className="border-t border-stone-100 align-top">
                            <td className="px-2 py-1 text-stone-500 text-xs whitespace-nowrap">{r.rank || ('第' + (ri + 1) + '阶')}</td>
                            <td className="px-1 py-1">
                              <input type="text" value={r.civil || ''} onChange={function (e) { updRankCell('civil', e.target.value) }} className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 text-sm focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
                            </td>
                            <td className="px-1 py-1">
                              <input type="text" value={r.military || ''} onChange={function (e) { updRankCell('military', e.target.value) }} className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 text-sm focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : wpsView.ladders && wpsView.ladders.filter(function (l) { return l.items.length > 0 }).length >= 2 ? (
                <div className="mt-1 grid grid-cols-2 gap-3">
                  {wpsView.ladders.filter(function (l) { return l.items.length > 0 }).map(function (lad, ci) {
                    return (
                      <div key={ci} className="border border-stone-200 rounded-lg p-2 bg-white">
                        <div className="text-xs font-semibold text-stone-700 mb-1.5 text-center pb-1 border-b border-stone-100">{lad.label || ('序列' + (ci + 1))}</div>
                        <ul className="space-y-1">
                          {lad.items.map(function (it: string, ri: number) {
                            return (
                              <li key={ri} className="flex items-center space-x-2">
                                <span className="w-5 h-5 bg-stone-100 text-stone-600 rounded-full flex items-center justify-center text-xs font-medium shrink-0">{ri + 1}</span>
                                <span className="flex-1 px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 text-sm whitespace-pre-wrap">{it}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              ) : (wpsView.levels && wpsView.levels.length > 0) ? (
                <ul className="mt-1 space-y-1">
                  {wpsView.levels.map(function (level: string, li: number) {
                    return (
                      <li key={li} className="flex items-start space-x-2">
                        <span className="w-5 h-5 bg-stone-100 text-stone-600 rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">{li + 1}</span>
                        <span className="flex-1 px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-stone-700 text-sm whitespace-pre-wrap">{level}</span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="mt-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-400">
                  暂无境界等级，可点击上方&quot;🔄 重新生成&quot;
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
