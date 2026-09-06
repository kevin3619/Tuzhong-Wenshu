'use client'

import { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { extractText } from '@/lib/text-utils'
import type { GeneratedData } from '../ai-generate-wizard'

interface CharacterData {
  name?: string
  age?: string | number
  role?: string
  title?: string
  camp?: string
  identity?: string
  attributes?: Record<string, number>
  arcNodes?: Array<{ stage: string; event: string; change: string; powerLevel: string }>
  gender?: string
  motivation?: string
  coreMotivation?: string
  aliases?: string
  birthplace?: string
  realmLevel?: string
  weapons?: string
  techniques?: string
  hiddenTraits?: string
  weaknesses?: string
  experience?: string
  socialNetwork?: string
  personalityOrigin?: string
  growthBackground?: string
  speechHabit?: string
  catchphrase?: string
  mentor?: string
  psychologicalTrauma?: string
  moralBottomLine?: string
  decisionPattern?: string
  signatureItem?: string
  themeColor?: string
  values?: string
  contradiction?: string
  [key: string]: unknown
}

interface CharacterCardProps {
  character: CharacterData
  role: string
  roleLabel: string
  roleColor: 'blue' | 'red' | 'pink' | 'green' | 'gray' | 'purple'
  onChange: (updated: CharacterData) => void
  onDelete?: () => void
}

function CharacterCard({ character, role, roleLabel, roleColor, onChange, onDelete }: CharacterCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  // 人物立体化：在原有 basic/advanced/attributes 三个Tab基础上，新增 depth 深度设定Tab
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced' | 'attributes' | 'depth'>('basic')
  // 🔥 Bug3 修复：自定义角色定位持久化
  const [customRoles, setCustomRoles] = useState<string[]>([])
  // 🔥 自定义定位输入框：仅在用户主动选「✏️ 自定义…」或正在编辑时出现
  //   （此前用 isCustomRole 判定，后端职能词会被误判成自定义，导致定位下方多出一行同词输入框）
  const [showRoleInput, setShowRoleInput] = useState(false)
  const [roleDraft, setRoleDraft] = useState('')
  // 🔥 2026-09-03 任务②：徽章（真实身份头衔）点击编辑态
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  // 🔥 2026-09-02 修复（图2 · 二轮）：后端下发的剧情职能（如「忠臣文官」「水师将领」）不在预定义枚举中，
  //   若不注册进 customRoles，下拉会退化成「配角/✏️自定义…」，用户看到的仍是千篇一律的「配角」。
  //   这里把角色自带的定位词自动注册为下拉选项，使「角色定位」直接显示其真实剧情职能。
  useEffect(function() {
    var _r = (character && typeof character.role === 'string') ? character.role.trim() : ''
    if (!_r || _r === '__custom__') return
    if (isPredefinedRole(_r)) return
    setCustomRoles(function(prev) { return prev.indexOf(_r) !== -1 ? prev : prev.concat([_r]) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character && character.role])

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
    // 🔥 2026-09-06 修复：进阶/属性/深度各 Tab 的 textarea 是切换标签后才挂载的，
    //   仅依赖 [character] 不会在切 Tab 时触发 resize → 长文本被固定高度截断。
    //   加入 activeTab 依赖，保证每次切标签后都按内容高度重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, activeTab])

  if (!character) return null

  // 预定义角色定位选项列表（用于判断是否为自定义角色）
  const PREDEFINED_ROLE_VALUES = [
    'protagonist', 'femaleLead', 'antagonist', 'protagonistConfidant', 'confidant',
    'ally', 'mentor', 'rival', '女配', '后宫', '红颜', '兄弟', '姐妹', '长辈',
    'loyalist', 'villain', 'general', 'eunuch', 'supporting', 'neutral', '__custom__',
    // 🔥 2026-09-06 全题材梳理新增：英文枚举与通用中文标签，避免选中后被误判为自定义
    'supervillain', 'camero', '朋友', '恋人', '青梅竹马', '死党', '搭档',
    '引路人', '传承者', '皇后', '公主', '侠客', '术士', '扮演者', '敌对势力', '反派爪牙',
    // AI常用的中文角色名，直接归入预定义避免显示"自定义"
    '忠诚部将', '死士', '军师', '随从', '护卫', '侍女', '管家', '商人', '医者', '探子', '盟友',
    '旧部', '心腹', '谋士', '侍卫', '弟子', '侍从', '副将', '先锋', '斥候',
    // 反派类型（用户需要5个反派角色）
    '幕后黑手', '宿敌', '背叛者', '野心家', '疯狂科学家', '敌对势力', '仇敌',
    // 🔥 关键修复：ROLE_LABEL_MAP中的中文标签也加入预定义列表，避免AI返回"女主"/"主角"时被误判为自定义
    '主角', '女主', '反派', '主角亲信', '亲信', '盟友', '师父/导师', '竞争对手', '忠臣', '将领', '太监', '配角', '中立',
    // 🔥 Bug3 修复：补充朋友/导师/对手/兄长等更多常见中文标签，避免被误判为自定义
    '朋友', '挚友', '兄弟', '结义兄弟', '师兄', '师弟', '师姐', '师妹', '兄长', '义兄', '义弟',
    '父亲', '母亲', '长辈', '族长', '家主', '长老', '亲王', '公爵', '皇帝', '太子',
    '对手', '竞争对手', '同门', '同窗', '护卫', '侍卫', '亲卫', '护卫长',
    '商人', '掌柜', '拍卖会负责人', '商会会长', '酒楼老板',
    '宗门弟子', '真传弟子', '内门弟子', '外门弟子', '宗门长老', '宗主', '掌门',
    '将军', '元帅', '统帅', '丞相', '太守', '刺史', '都督', '总督', '巡抚',
    '皇室成员', '王爷', '王子', '公主', '侯爷',
    '导师', '老师', '教官', '教头', '师尊', '义父', '前辈', '引路人', '长者',
  ]

  // 角色定位枚举值→中文标签映射
  const ROLE_LABEL_MAP: Record<string, string> = {
    protagonist: '主角', femaleLead: '女主', antagonist: '反派',
    protagonistConfidant: '主角亲信', confidant: '亲信', ally: '盟友',
    loyalist: '忠臣', villain: '反派', general: '将领', eunuch: '太监',
    supporting: '配角', '女配': '女配', '后宫': '后宫', '红颜': '红颜',
    neutral: '中立', mentor: '师父/导师', rival: '竞争对手',
    'supervillain': '大反派/终极Boss', 'camero': '路人/龙套',
    '朋友': '朋友/挚友', '恋人': '恋人', '青梅竹马': '青梅竹马',
    '死党': '死党', '搭档': '搭档/伙伴',
    '兄弟': '兄弟', '姐妹': '姐妹', '长辈': '长辈',
    '幕后黑手': '幕后黑手', '宿敌': '宿敌', '背叛者': '背叛者', '野心家': '野心家',
    '疯狂科学家': '疯狂科学家', '敌对势力': '敌对势力',
    // 🔥 Bug3 修复：补充更多朋友/对手/导师映射，避免AI返回"朋友"/"对手"时找不到映射
    '朋友': '盟友', '挚友': '主角亲信', '结义兄弟': '主角亲信',
    '师兄': '主角亲信', '师弟': '主角亲信', '兄长': '主角亲信', '义兄': '主角亲信',
    '同门': '盟友', '同窗': '盟友',
    '父亲': '长辈', '母亲': '长辈', '族长': '长辈', '家主': '长辈',
    '对手': '竞争对手', '竞争对手': '竞争对手',
    '导师': '师父/导师', '老师': '师父/导师', '教官': '师父/导师', '教头': '师父/导师',
    '师尊': '师父/导师', '义父': '长辈', '前辈': '师父/导师', '引路人': '师父/导师', '长者': '长辈',
    '护卫': '忠臣', '侍卫': '忠臣', '亲卫': '忠臣', '护卫长': '忠臣',
    '商人': '盟友', '掌柜': '盟友', '拍卖会负责人': '盟友', '商会会长': '盟友',
    '宗门长老': '长辈', '宗主': '长辈', '掌门': '长辈',
    '长老': '长辈', '亲王': '皇室成员', '公爵': '皇室成员', '皇帝': '皇室成员', '太子': '皇室成员',
    '将军': '将领', '元帅': '将领', '统帅': '将领', '丞相': '忠臣',
  }
  // 增加更多常用角色定位映射
  const extraMappings: Record<string, string> = {
    'mentor': '师父/导师', '导师': '师父/导师', '导师角色': '师父/导师',
    'mentorTemplate': '师父/导师', '灵魂导师': '师父/导师',
    'protagonistConfidant': '主角亲信', 'confidant': '亲信',
    'swornBrotherTemplate': '主角亲信', '生死挚友': '主角亲信',
    'femaleLead': '女主', 'femaleLeadTemplate': '女主',
    'companionBeastTemplate': '灵兽伙伴', '本命神兽': '灵兽伙伴', '契约兽': '灵兽伙伴',
    'earlyAntagonistTemplate': '前期核心反派', 'lateAntagonistTemplate': '后期核心反派',
    'antagonist': '反派', 'villain': '反派', 'rival': '竞争对手',
    'ally': '盟友', 'neutral': '中立', 'loyalist': '忠臣', 'general': '将领',
    'eunuch': '太监', '长辈': '长辈', '女配': '女配', '后宫': '后宫', '红颜': '红颜',
    '姐妹': '姐妹', '主角亲信': '主角亲信', '亲信': '亲信',
    '朋友': '盟友', '挚友': '主角亲信', '兄长': '主角亲信',
    '对手': '竞争对手', '老师': '师父/导师',
  }
  // 合并到 ROLE_LABEL_MAP
  Object.keys(extraMappings).forEach(function(k) {
    if (!ROLE_LABEL_MAP[k]) ROLE_LABEL_MAP[k] = extraMappings[k]
  })

  // 🔥 新增：反向映射——中文标签→枚举值（用于从AI返回的"女主"/"主角"等中文还原为option value）
  const LABEL_TO_ENUM_MAP: Record<string, string> = {}
  Object.keys(ROLE_LABEL_MAP).forEach(function (key) {
    LABEL_TO_ENUM_MAP[ROLE_LABEL_MAP[key]] = key
  })
  // 🔥 Bug2/Bug3 修复：直接建立中文→枚举值的映射表，确保"女主"→"femaleLead"，"朋友"→"ally"等
  const CHINESE_TO_ENUM_MAP: Record<string, string> = {
    '主角': 'protagonist', '核心主角': 'protagonist', '主人公': 'protagonist',
    '女主': 'femaleLead', '女主角': 'femaleLead', '女配角': '女配',
    '反派': 'antagonist', '大反派': 'antagonist', '幕后黑手': 'antagonist',
    '主角亲信': 'protagonistConfidant', '亲信': 'confidant',
    '盟友': 'ally', '中立': 'neutral', '忠臣': 'loyalist', '将领': 'general', '太监': 'eunuch',
    '配角': 'supporting', '女配': '女配', '后宫': '后宫', '红颜': '红颜',
    '师父/导师': 'mentor', '导师': 'mentor', '师父': 'mentor', '师傅': 'mentor',
    '竞争对手': 'rival', '对手': 'rival',
    '兄弟': '兄弟', '姐妹': '姐妹', '长辈': '长辈',
    // 🔥 Bug3 修复：朋友/挚友/对手/兄长等中文→枚举值
    '朋友': 'ally', '挚友': 'protagonistConfidant', '兄长': 'protagonistConfidant', '义兄': 'protagonistConfidant',
    '师兄': 'protagonistConfidant', '师弟': 'protagonistConfidant',
    '同门': 'ally', '同窗': 'ally', '伙伴': 'ally', '战友': 'ally',
    '长老': 'mentor', '族长': 'mentor', '家主': 'mentor',
    '商人': 'ally', '掌柜': 'ally', '商会会长': 'ally', '拍卖会负责人': 'ally', '酒楼老板': 'ally',
    '护卫': 'loyalist', '侍卫': 'loyalist', '亲卫': 'loyalist', '护卫长': 'loyalist',
    '将军': 'general', '元帅': 'general', '统帅': 'general',
    '丞相': 'loyalist', '太守': 'loyalist', '刺史': 'loyalist', '都督': 'loyalist', '总督': 'loyalist', '巡抚': 'loyalist',
    '皇帝': 'loyalist', '太子': 'loyalist', '王爷': 'loyalist', '亲王': 'loyalist', '公爵': 'loyalist',
    '皇室成员': 'loyalist',
    '宗门弟子': 'ally', '真传弟子': 'ally', '内门弟子': 'ally', '外门弟子': 'ally',
    '宗门长老': 'mentor', '宗主': 'mentor', '掌门': 'mentor',
    '老师': 'mentor', '教官': 'mentor', '教头': 'mentor', '师尊': 'mentor', '义父': 'mentor', '前辈': 'mentor', '引路人': 'mentor', '长者': 'mentor',
    '宿敌': 'rival', '背叛者': 'rival', '野心家': 'antagonist', '敌对势力': 'antagonist', '仇敌': 'antagonist',
  }

  // 判断一个角色定位是否是预定义值（支持中文标签和英文枚举）
  const isPredefinedRole = function (role: string): boolean {
    if (!role) return false
    if (PREDEFINED_ROLE_VALUES.indexOf(role) !== -1) return true
    // 如果是中文标签，也视为预定义
    if (LABEL_TO_ENUM_MAP[role]) return true
    // 🔥 Bug3 修复：检查 CHINESE_TO_ENUM_MAP
    if (CHINESE_TO_ENUM_MAP[role]) return true
    // 🔥 后宫模式："女主2"/"女主3" 也视为预定义
    if (/^女主\d+$/.test(role)) return true
    return false
  }

  // 将角色定位归一化为下拉框的value
  const normalizeRoleValue = function (role: string): string {
    if (!role) return '__custom__'
    // 🔥 Bug2/Bug3 修复：先尝试中文→枚举值映射（"女主"→"femaleLead"，"朋友"→"ally"）
    if (CHINESE_TO_ENUM_MAP[role]) return CHINESE_TO_ENUM_MAP[role]
    // 如果是女主1/女主2/后宫女主
    if (/^女主\d+$/.test(role)) return 'femaleLead'
    // 如果直接是英文枚举预定义值
    if (PREDEFINED_ROLE_VALUES.indexOf(role) !== -1 && role !== '__custom__') return role
    // 如果是中文标签，转换为枚举值
    if (LABEL_TO_ENUM_MAP[role]) return LABEL_TO_ENUM_MAP[role]
    // 否则是自定义
    return '__custom__'
  }

  // 🔥 Bug3修复：isCustomRole检查需要包含customRoles状态中的值
  const isCustomRole = typeof character.role === 'string' && character.role && !isPredefinedRole(character.role) && customRoles.indexOf(character.role) !== -1

  // 关键修复：配角卡片中的角色定位绝不允许显示主角/女主
  const MAIN_ROLE_VALUES = ['protagonist', 'femaleLead', '主角', '女主']
  const roleText = typeof character.role === 'string' ? character.role : ''
  // 🔥 后宫模式：检测 "女主2", "女主3" 等动态角色标签
  const isExtraFemaleLead = /^女主\d+$/.test(roleText)
  const mappedLabel = ROLE_LABEL_MAP[roleText] || (isExtraFemaleLead ? roleText : undefined)
  let displayRoleLabel: string
  if (role === 'supporting') {
    const _roleForCard = roleText || ''
    const _englishLabel = ROLE_LABEL_MAP[_roleForCard]
    let _determined: string | null = null
    if (isExtraFemaleLead) {
      _determined = roleText
    } else if (_roleForCard === '朋友' || _roleForCard === '女配') {
      // 🔥 第18轮：阵容预设标签（朋友/女配）徽标显示原词，不再折算成 盟友 等泛化标签
      _determined = _roleForCard
    } else if (_englishLabel) {
      _determined = _englishLabel
    } else if (_roleForCard && _roleForCard !== 'supporting' && _roleForCard !== '__custom__' && _roleForCard !== '配角') {
      _determined = _roleForCard
    } else if (mappedLabel && mappedLabel !== '配角') {
      _determined = mappedLabel
    }
    if (!_determined || _determined === '配角') {
      if (character.role === 'mentor' || /导师|师父|师傅|老师|师尊|导师|前辈|引路人/.test(character.role || '') || /导师|师父|师傅|老师|师尊|前辈|引路人/.test(character.identity || '')) {
        _determined = '师父/导师'
      } else if (character.role === '长辈' || /父亲|母亲|族长|家主|长老|宗主|掌门|义父|长者|叔叔|阿姨|伯父|舅舅/.test(character.role || '') || /父亲|母亲|族长|家主|长老|宗主|掌门|义父|长者/.test(character.identity || '')) {
        _determined = '长辈'
      } else {
        _determined = '配角'
      }
    }
    displayRoleLabel = _determined
    // 只过滤主角和女主标签（因为它们有独立卡片），反派标签允许在配角卡片中显示
    if (displayRoleLabel === '主角' || displayRoleLabel === '女主' || displayRoleLabel === '主人公' || displayRoleLabel === '女主角' || displayRoleLabel === '核心主角' || /^(主角|主人公|核心主角)$/.test(displayRoleLabel)) {
      displayRoleLabel = isExtraFemaleLead ? roleText : '配角'
    }
    // 如果角色明确标记为反派，保留反派标签
    if (/反派|antagonist|villain/i.test(character.role || '') && !/^(主角|女主)/.test(displayRoleLabel)) {
      displayRoleLabel = '反派'
    }
  } else {
    displayRoleLabel = mappedLabel || roleLabel
  }

  const colorMap = {
    blue: { bg: 'from-stone-50 to-stone-100', border: 'border-stone-200', badge: 'bg-stone-700', text: 'text-stone-700' },
    red: { bg: 'from-red-50 to-red-100', border: 'border-red-200', badge: 'bg-red-600', text: 'text-red-700' },
    pink: { bg: 'from-stone-50 to-stone-100', border: 'border-stone-200', badge: 'bg-stone-700', text: 'text-stone-700' },
    green: { bg: 'from-green-50 to-green-100', border: 'border-green-200', badge: 'bg-green-600', text: 'text-green-700' },
    gray: { bg: 'from-stone-50 to-stone-100', border: 'border-stone-200', badge: 'bg-stone-600', text: 'text-stone-700' },
    purple: { bg: 'from-stone-50 to-stone-100', border: 'border-stone-200', badge: 'bg-stone-800', text: 'text-stone-800' },
  }

  const colors = colorMap[roleColor]

  // 🔥 2026-09-03 任务②：徽章 = 真实身份头衔（character.title），与「角色定位」下拉彻底解耦。
  //   用户原话：左上角显示的是真实身份——朱由榔(永历帝)、吴三桂(满清平西王)、沐天波(黔国公)、王太后(皇太后)…
  //   角色定位下拉（忠臣武将/盟友/长辈/配角…）只是剧情职能，绝不反向改写徽章。
  //   徽章始终可点击编辑：输入内容写回 character.title（真实身份头衔），下拉字段 character.role 不受任何影响。
  //   无 title（未生成/未填写）时兜底显示角色定位词，保证卡片头部不为空。
  const _badgeClass = colors.badge
  const _rawTitle = (character && typeof character.title === 'string') ? character.title.trim() : ''
  // title 为空时兜底显示角色定位词（与第五轮行为一致）；title 有值则徽章只显示真实身份头衔
  const _badgeText = _rawTitle || displayRoleLabel || '配角'

  // 判断字段是否为空（用于显示空状态提示）
  const isEmpty = (value: unknown) => {
    if (value === null || value === undefined) return true
    if (typeof value === 'string' && value.trim() === '') return true
    if (Array.isArray(value) && value.length === 0) return true
    if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) return true
    return false
  }

  // 空字段的样式类（使用amber温和黄色代替刺眼的红色）
  const emptyFieldClass = (value: unknown) => {
    return isEmpty(value)
      ? 'border-amber-200 bg-amber-50/30 focus:ring-amber-400 focus:border-amber-400'
      : 'border-stone-200 focus:ring-stone-400'
  }

  // 空字段的placeholder（简洁提示，避免敏感词）
  const emptyPlaceholder = (normalPlaceholder: string) => `基于本作前序设定填写${normalPlaceholder}...`

  // 🔥 2026-09-06 弧光节点去重：按「阶段+事件+变化+战力」复合键去除完全重复的节点，避免多角色弧光列表出现重复项
  const dedupeArcNodes = (nodes: Array<{ stage?: string; event?: string; change?: string; powerLevel?: string }>) => {
    const seen = new Set<string>()
    const out: Array<{ stage: string; event: string; change: string; powerLevel: string }> = []
    for (const n of nodes) {
      const key = `${(n.stage || '').trim()}|${(n.event || '').trim()}|${(n.change || '').trim()}|${(n.powerLevel || '').trim()}`
      if (key && !seen.has(key)) {
        seen.add(key)
        out.push({ stage: n.stage || '', event: n.event || '', change: n.change || '', powerLevel: n.powerLevel || '' })
      }
    }
    return out
  }

  const updateField = (field: string, value: unknown) => {
    if (field === 'arcNodes') {
      const nodes = Array.isArray(value) ? (value as Array<{ stage?: string; event?: string; change?: string; powerLevel?: string }>) : []
      return onChange({ ...character, arcNodes: dedupeArcNodes(nodes) } as CharacterData)
    }
    onChange({ ...character, [field]: value } as CharacterData)
  }

  const updateAttribute = (attr: string, value: number) => {
    onChange({
      ...character,
      attributes: { ...character.attributes, [attr]: value }
    })
  }

  return (
    <div className={`bg-gradient-to-br ${colors.bg} border ${colors.border} rounded-2xl p-5 shadow-lg hover:shadow-xl transition-shadow`}>
      {/* 头部：角色名称和定位 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          {/* 🔥 2026-09-03 任务②：徽章 = 真实身份头衔（点击可直接编辑，写回 character.title）
              · 未进入编辑态：展示徽章文本（title || 角色定位兜底），title 为空时半透明白字 + 铅笔提示"点击填写身份头衔"
              · 编辑态：输入框即时保存到 title；与下方「角色定位」下拉无任何联动 */}
          {editingTitle ? (
            <input
              autoFocus
              type="text"
              value={titleDraft}
              onChange={(e) => { setTitleDraft(e.target.value); updateField('title', e.target.value.trim()) }}
              onBlur={() => { setEditingTitle(false); if (!titleDraft.trim()) updateField('title', '') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setEditingTitle(false); if (!titleDraft.trim()) updateField('title', '') } if (e.key === 'Escape') { setEditingTitle(false); setTitleDraft(_rawTitle); updateField('title', _rawTitle) } }}
              onClick={(e) => e.stopPropagation()}
              placeholder={displayRoleLabel || '真实身份头衔'}
              className={`px-3 py-1 ${_badgeClass} text-white text-sm font-medium rounded-full w-36 outline-none placeholder-white/70`}
              title="编辑真实身份头衔（回车保存，Esc 取消）"
            />
          ) : (
            <button
              type="button"
              onClick={() => { setTitleDraft(_rawTitle); setEditingTitle(true) }}
              className={`px-3 py-1 ${_badgeClass} text-white text-sm font-medium rounded-full cursor-text hover:opacity-90 transition-opacity ${_rawTitle ? '' : 'opacity-90'}`}
              title={_rawTitle
                ? (displayRoleLabel === _rawTitle
                  ? '真实身份头衔（点击可修改；当前显示的是角色定位兜底）'
                  : ('真实身份头衔：' + _rawTitle + '（点击修改，角色定位请在下方下拉调整）'))
                : '真实身份头衔未填写，点击输入（如：永历帝/黔国公/平西王），与角色定位下拉相互独立'}
            >
              {_badgeText}
              {_rawTitle ? null : <span className="ml-1 text-white/70 text-xs">✎</span>}
            </button>
          )}
          <input
            type="text"
            value={character.name || ''}
            onChange={(e) => updateField('name', e.target.value)}
            className={`flex-1 px-3 py-2 bg-white border rounded-lg font-bold text-lg text-stone-900 focus:ring-2 focus:border-transparent ${emptyFieldClass(character.name)}`}
            placeholder={isEmpty(character.name) ? emptyPlaceholder('角色名称') : '角色名称'}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-600 hover:bg-stone-50 transition-colors"
          >
            {isExpanded ? '收起' : '展开'}
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="删除角色"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 基础信息行 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs text-stone-500 mb-1">年龄</label>
          <input
            type="text"
            value={character.age ?? ''}
            onChange={(e) => updateField('age', e.target.value)}
            className={`w-full px-2 py-1.5 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.age)}`}
            placeholder={isEmpty(character.age) ? emptyPlaceholder('年龄') : '如：19岁'}
          />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">性别</label>
          <select
            value={character.gender || ''}
            onChange={(e) => updateField('gender', e.target.value)}
            className={`w-full px-2 py-1.5 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.gender)}`}
          >
            <option value="">未设定</option>
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">角色定位</label>
          {/* 🔥 Bug2 修复：角色定位下拉框逻辑重写
              - 主角/女主/反派卡片：优先使用组件级 role（protagonist/femaleLead/antagonist）
              - 配角卡片：从 character.role 中解析出匹配的枚举值
              - 新增组件级 role 的默认值映射 */}
          {(() => {
            let _defaultByRole: string = role
            if (role === 'protagonist') _defaultByRole = 'protagonist'
            else if (role === 'femaleLead') _defaultByRole = 'femaleLead'
            else if (role === 'antagonist') _defaultByRole = 'antagonist'
            else if (isExtraFemaleLead) _defaultByRole = 'femaleLead'
            else _defaultByRole = 'ally'

            const _parsedRole = normalizeRoleValue(typeof character.role === 'string' ? character.role : '')
            let _finalSelectValue: string
            if (isCustomRole) {
              // 🔥 2026-09-02 修复（图2 · 二轮）：自定义职能（如「忠臣文官」）已被 useEffect 注册为下拉选项，
              //   此处应直接选中该职能本身，而不是跳到「✏️ 自定义…」——后者会让用户以为定位未设置。
              _finalSelectValue = roleText
            } else if (role === 'supporting') {
              if (isExtraFemaleLead) {
                _finalSelectValue = 'femaleLead'
              } else if (_parsedRole && _parsedRole !== '__custom__' &&
                  _parsedRole !== 'protagonist') {
                _finalSelectValue = _parsedRole
              } else {
                _finalSelectValue = _defaultByRole
              }
            } else {
              _finalSelectValue = _defaultByRole
            }

            // 🔥 Bug3修复：将customRoles中的值也加入下拉选项
            const customRoleOptions: Array<{ value: string; label: string }> = customRoles
              .filter(function(cr) { return cr && cr !== '__custom__' })
              .map(function(cr) { return { value: cr, label: cr } })

            // 🔥 第三步：渲染下拉框（统一选项列表 + 自定义角色）
            //   2026-09-06 重新梳理补全：覆盖历史/古言/都市/科幻/玄幻/悬疑/游戏/校园等全类型题材，
            //   保留全部原有枚举值（向后兼容已存数据），按叙事职能与题材归类。
            const _rawOptions: Array<{ value: string; label: string }> = [
              // ===== 核心叙事职能（每本小说必有）=====
              { value: 'protagonist', label: '主角' },
              { value: 'femaleLead', label: '女主' },
              { value: 'antagonist', label: '反派' },
              { value: 'protagonistConfidant', label: '主角亲信' },
              { value: 'confidant', label: '亲信' },
              { value: 'supervillain', label: '大反派/终极Boss' },
              { value: 'supporting', label: '配角' },
              { value: 'neutral', label: '中立' },
              { value: 'camero', label: '路人/龙套' },
              // ===== 亲近与羁绊 =====
              { value: '兄弟', label: '兄弟' },
              { value: '姐妹', label: '姐妹' },
              { value: '长辈', label: '长辈' },
              { value: 'ally', label: '盟友' },
              { value: '朋友', label: '朋友/挚友' },
              { value: '恋人', label: '恋人' },
              { value: '青梅竹马', label: '青梅竹马' },
              { value: '红颜', label: '红颜' },
              { value: '后宫', label: '后宫' },
              { value: '女配', label: '女配' },
              { value: '死党', label: '死党' },
              { value: '搭档', label: '搭档/伙伴' },
              // ===== 导师与传承 =====
              { value: 'mentor', label: '师父/导师' },
              { value: '引路人', label: '引路人' },
              { value: '传承者', label: '传承者' },
              { value: '师兄', label: '师兄/师姐' },
              // ===== 历史 / 古言 / 权谋 / 战争 =====
              { value: 'loyalist', label: '忠臣' },
              { value: 'general', label: '将领' },
              { value: 'eunuch', label: '太监' },
              { value: '皇帝', label: '皇帝' },
              { value: '太子', label: '太子' },
              { value: '皇后', label: '皇后/太后' },
              { value: '公主', label: '公主' },
              { value: '丞相', label: '丞相' },
              { value: '将军', label: '将军' },
              { value: '元帅', label: '元帅' },
              { value: '谋士', label: '谋士/军师' },
              { value: '侠客', label: '侠客' },
              { value: '术士', label: '术士/方士' },
              // ===== 反派与对手 =====
              { value: 'rival', label: '竞争对手' },
              { value: 'villain', label: '反派/敌对头目' },
              { value: '幕后黑手', label: '幕后黑手' },
              { value: '宿敌', label: '宿敌' },
              { value: '背叛者', label: '背叛者' },
              { value: '野心家', label: '野心家' },
              { value: '敌对势力', label: '敌对势力' },
              { value: '反派爪牙', label: '反派爪牙/走狗' },
              // ===== 现代都市 / 校园 / 职场 / 悬疑 =====
              { value: '总裁', label: '总裁/CEO' },
              { value: '白领', label: '白领/职场' },
              { value: '学生', label: '学生' },
              { value: '教师', label: '教师' },
              { value: '医生', label: '医生' },
              { value: '律师', label: '律师' },
              { value: '警察', label: '警察/刑警' },
              { value: '侦探', label: '侦探' },
              { value: '法医', label: '法医' },
              { value: '记者', label: '记者' },
              { value: '黑客', label: '黑客' },
              { value: '创业者', label: '创业者' },
              { value: '明星', label: '明星/艺人' },
              { value: '黑道老大', label: '黑道老大' },
              // ===== 科幻 / 军事 / 未来 =====
              { value: '科学家', label: '科学家' },
              { value: '舰长', label: '舰长/指挥官' },
              { value: '机甲驾驶员', label: '机甲驾驶员' },
              { value: '特工', label: '特工' },
              { value: '军人', label: '军人/士兵' },
              { value: '变异体', label: '变异体/异种' },
              { value: '机器人', label: 'AI/机器人' },
              // ===== 玄幻 / 仙侠 / 异能 =====
              { value: '掌门', label: '掌门' },
              { value: '宗门弟子', label: '宗门弟子' },
              { value: '散修', label: '散修' },
              { value: '炼药师', label: '炼药师' },
              { value: '灵兽伙伴', label: '灵兽伙伴' },
              { value: '异能者', label: '异能者' },
              // ===== 游戏 / 竞技 / 冒险 =====
              { value: '队友', label: '队友' },
              { value: '公会会长', label: '公会会长' },
              { value: 'NPC', label: 'NPC/系统角色' },
              { value: '探险家', label: '探险家' },
              // ===== 服务 / 附属 / 其他 =====
              { value: '管家', label: '管家' },
              { value: '侍女', label: '侍女/丫鬟' },
              { value: '护卫', label: '护卫' },
              { value: '死士', label: '死士' },
              { value: '商人', label: '商人' },
              ...customRoleOptions, // 🔥 Bug3修复：添加自定义角色到选项列表
              { value: '__custom__', label: '✏️ 自定义...' },
            ]
            // 🔥 2026-09-05 修复（用户截图：定位下拉里「忠臣武将」出现两条）：
            //   后端下发的职能词既在固定枚举的中文标签里、又被注册成自定义选项（或带空格的同名词），
            //   渲染前按「标签归一化」去重，同一标签只保留第一条
            const _seenLabel: Record<string, boolean> = {}
            const options: Array<{ value: string; label: string }> = _rawOptions.filter(function (o) {
              const key = String(o.label || '').replace(/\s+/g, '')
              if (!key) return false
              if (_seenLabel[key]) return false
              _seenLabel[key] = true
              return true
            })

            return (
              <>
                <select
                  value={_finalSelectValue}
                  onChange={(e) => {
                    const _selectedValue = e.target.value
                    // 🔥 选「✏️ 自定义…」才弹出输入框；选普通定位时收起并清空草稿
                    if (_selectedValue === '__custom__') {
                      setShowRoleInput(true)
                      setRoleDraft('')
                    } else {
                      setShowRoleInput(false)
                      setRoleDraft('')
                    }
                    // 🔥 Bug3修复：如果是自定义角色选项，确保customRoles状态中包含该值
                    if (_selectedValue !== '__custom__' && _selectedValue !== 'protagonist' && _selectedValue !== 'femaleLead' && _selectedValue !== 'antagonist' &&
                        _selectedValue !== 'protagonistConfidant' && _selectedValue !== 'confidant' && _selectedValue !== 'ally' && _selectedValue !== 'mentor' && _selectedValue !== 'rival' &&
                        _selectedValue !== '女配' && _selectedValue !== '后宫' && _selectedValue !== '红颜' && _selectedValue !== '兄弟' && _selectedValue !== '姐妹' && _selectedValue !== '长辈' &&
                        _selectedValue !== 'loyalist' && _selectedValue !== 'villain' && _selectedValue !== '幕后黑手' && _selectedValue !== '宿敌' && _selectedValue !== '背叛者' &&
                        _selectedValue !== '野心家' && _selectedValue !== '敌对势力' && _selectedValue !== 'general' && _selectedValue !== 'eunuch' && _selectedValue !== 'supporting' && _selectedValue !== 'neutral') {
                      // 这是一个自定义角色值，添加到customRoles
                      if (customRoles.indexOf(_selectedValue) === -1) {
                        setCustomRoles([...customRoles, _selectedValue])
                      }
                    }
                    updateField('role', _selectedValue)
                  }}
                  className="w-full px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-stone-400"
                >
                  {options.map(function(opt) {
                    return <option key={opt.value} value={opt.value}>{opt.label}</option>
                  })}
                </select>
                {/* 🔥 2026-09-05 修复（用户截图：定位下方又出现一条一模一样的"忠臣武将"）：
                    原条件是 isCustomRole || role==='__custom__'，但后端下发的职能词（忠臣文官/忠臣武将/亲随）
                    不在预定义枚举里就会被判成"自定义"，于是下拉已选中该词、下方又渲染一个预填同词的输入框，
                    看起来像重复项。改为：只有用户主动选择「✏️ 自定义…」或正在编辑时才显示输入框。 */}
                {(showRoleInput || character.role === '__custom__') && (
                  <input
                    type="text"
                    value={character.role === '__custom__' ? '' : (roleDraft || '')}
                    onChange={(e) => {
                      const _newRole = e.target.value
                      setRoleDraft(_newRole)
                    }}
                    onBlur={() => {
                      const _newRole = String(roleDraft || '').trim()
                      if (_newRole) {
                        updateField('role', _newRole)
                        if (customRoles.indexOf(_newRole) === -1) setCustomRoles([...customRoles, _newRole])
                      } else if (character.role === '__custom__') {
                        updateField('role', 'supporting')
                      }
                      setShowRoleInput(false)
                      setRoleDraft('')
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    placeholder="输入自定义角色定位..."
                    className="mt-1 w-full px-2 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-stone-400"
                    autoFocus={showRoleInput || character.role === '__custom__'}
                  />
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* 展开后的详细内容 */}
      {isExpanded && (
        <div className="mt-4 border-t border-stone-200 pt-4">
          {/* 身份背景 - 多行完整显示 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-stone-700 mb-2">身份背景</label>
            <textarea
              value={character.identity || ''}
              onChange={(e) => updateField('identity', e.target.value)}
              onInput={autoResize}
              rows={2}
              className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.identity)}`}
              placeholder={isEmpty(character.identity) ? emptyPlaceholder('身份背景') : '详细描述角色的身份背景、出身来历、社会地位等...'}
            />
          </div>
          {/* 标签页切换 */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('basic')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'basic' ? 'bg-stone-800 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              基础设定
            </button>
            <button
              onClick={() => setActiveTab('advanced')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'advanced' ? 'bg-stone-800 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              进阶设定
            </button>
            <button
              onClick={() => setActiveTab('attributes')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'attributes' ? 'bg-stone-800 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              属性面板
            </button>
            {/* 人物深度设定Tab */}
            <button
              onClick={() => setActiveTab('depth')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'depth' ? 'bg-stone-800 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              深度设定
            </button>
          </div>

          {/* 基础设定页 */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">外貌特征</label>
                <textarea
                  value={typeof character.appearance === 'string' ? character.appearance : extractText(character.appearance)}
                  onChange={(e) => updateField('appearance', e.target.value)}
                  onInput={autoResize}
                  rows={3}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.appearance)}`}
                  placeholder={isEmpty(character.appearance) ? emptyPlaceholder('外貌特征') : '描述角色的外貌特征...'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">性格特质</label>
                <textarea
                  value={typeof character.personality === 'string' ? character.personality : extractText(character.personality)}
                  onChange={(e) => updateField('personality', e.target.value)}
                  onInput={autoResize}
                  rows={3}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.personality)}`}
                  placeholder={isEmpty(character.personality) ? emptyPlaceholder('性格特质') : '描述角色的性格特点...'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">人物弧光</label>
                <textarea
                  value={typeof character.growthArc === 'string' ? character.growthArc : extractText(character.growthArc)}
                  onChange={(e) => updateField('growthArc', e.target.value)}
                  onInput={autoResize}
                  rows={6}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 min-h-[120px] ${emptyFieldClass(character.growthArc)}`}
                  placeholder={isEmpty(character.growthArc) ? emptyPlaceholder('人物弧光') : '用连贯的自然段落叙述角色完整成长弧线，包括初始状态、关键转折、挣扎蜕变、最终成为什么样的人...'}
                />
              </div>
              {/* 🔥 2026-09-06 去重：核心动机已归并到「进阶设定」Tab 中的 coreMotivation 字段，此处不再重复展示，避免同一内容跨 Tab 重复 */}
            </div>
          )}

          {/* 进阶设定页 */}
          {activeTab === 'advanced' && (
            <div className="space-y-4">
              {/* 🔥 优化问题4：参考《吞噬星空》百度百科人物介绍，增加通用字段（适用于所有题材） */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">别名/称号</label>
                  <input
                    type="text"
                    value={character.aliases || ''}
                    onChange={(e) => updateField('aliases', e.target.value)}
                    className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.aliases)}`}
                    placeholder={isEmpty(character.aliases) ? emptyPlaceholder('别名/称号') : '基于本作设定填写，如：外号、江湖称号、职级头衔'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">出生地/籍贯</label>
                  <input
                    type="text"
                    value={character.birthplace || ''}
                    onChange={(e) => updateField('birthplace', e.target.value)}
                    className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.birthplace)}`}
                    placeholder={isEmpty(character.birthplace) ? emptyPlaceholder('出生地') : '基于本作世界观设定的地理环境填写'}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">能力等级/段位</label>
                <input
                  type="text"
                  value={character.realmLevel || ''}
                  onChange={(e) => updateField('realmLevel', e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.realmLevel)}`}
                  placeholder={isEmpty(character.realmLevel) ? emptyPlaceholder('能力等级') : '基于本作力量体系/段位体系填写，如：境界等级、职级、段位、军衔等'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">核心动机</label>
                <textarea
                  value={character.coreMotivation || ''}
                  onChange={(e) => updateField('coreMotivation', e.target.value)}
                  onInput={autoResize}
                  rows={2}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.coreMotivation)}`}
                  placeholder={isEmpty(character.coreMotivation) ? emptyPlaceholder('核心动机') : '角色的终极目标是什么？'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">核心技能/金手指</label>
                <textarea
                  value={(Array.isArray(character.skills) ? character.skills : []).join('\n')}
                  onChange={(e) => updateField('skills', e.target.value.split('\n').filter(s => s.trim()))}
                  onInput={autoResize}
                  rows={3}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass((Array.isArray(character.skills) ? character.skills : []).join('\n'))}`}
                  placeholder={(!Array.isArray(character.skills) || character.skills.length === 0) ? emptyPlaceholder('核心技能') : '每行一个技能...'}
                />
              </div>
              {/* 🔥 优化问题4：参考百度百科，增加标志性装备、专业技能字段（通用所有题材） */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">标志性装备/道具</label>
                  <textarea
                    value={character.weapons || ''}
                    onChange={(e) => updateField('weapons', e.target.value)}
                    onInput={autoResize}
                    rows={2}
                    className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.weapons)}`}
                    placeholder={isEmpty(character.weapons) ? emptyPlaceholder('标志性装备') : '基于本作设定填写：武器法宝/科技装备/运动器材/职业工具/奢侈品等'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">专业技能/技法</label>
                  <textarea
                    value={character.techniques || ''}
                    onChange={(e) => updateField('techniques', e.target.value)}
                    onInput={autoResize}
                    rows={2}
                    className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.techniques)}`}
                    placeholder={isEmpty(character.techniques) ? emptyPlaceholder('专业技能') : '基于本作设定填写：功法秘术/职业技能/运动技术/电竞操作/商业手段等'}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">隐藏设定/反差点</label>
                <textarea
                  value={character.hiddenTraits || ''}
                  onChange={(e) => updateField('hiddenTraits', e.target.value)}
                  onInput={autoResize}
                  rows={2}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.hiddenTraits)}`}
                  placeholder={isEmpty(character.hiddenTraits) ? emptyPlaceholder('隐藏设定') : '角色不为人知的一面...'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">弱点/软肋</label>
                <textarea
                  value={character.weaknesses || ''}
                  onChange={(e) => updateField('weaknesses', e.target.value)}
                  onInput={autoResize}
                  rows={2}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.weaknesses)}`}
                  placeholder={isEmpty(character.weaknesses) ? emptyPlaceholder('弱点') : '角色的致命弱点...'}
                />
              </div>
              {/* 🔥 优化问题4：参考百度百科，增加角色经历、人际网络字段 */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">角色经历/重大事件</label>
                <textarea
                  value={character.experience || ''}
                  onChange={(e) => updateField('experience', e.target.value)}
                  onInput={autoResize}
                  rows={4}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 min-h-[100px] ${emptyFieldClass(character.experience)}`}
                  placeholder={isEmpty(character.experience) ? emptyPlaceholder('角色经历') : '基于本作大纲设定填写角色经历的重大事件、转折点、关键节点等'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">人际网络</label>
                <textarea
                  value={character.socialNetwork || ''}
                  onChange={(e) => updateField('socialNetwork', e.target.value)}
                  onInput={autoResize}
                  rows={3}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.socialNetwork)}`}
                  placeholder={isEmpty(character.socialNetwork) ? emptyPlaceholder('人际网络') : '基于本作设定填写：师门传承/好友盟友/仇敌对手/家族成员/所属势力等'}
                />
              </div>
              </div>
          )}

          {/* 属性面板页 */}
          {activeTab === 'attributes' && (
            <div className="space-y-4">
              {[
                { key: 'strength', label: '武力值', color: 'bg-red-500' },
                { key: 'intelligence', label: '智力值', color: 'bg-stone-400' },
                { key: 'command', label: '统帅值', color: 'bg-green-500' },
                { key: 'politics', label: '政治值', color: 'bg-yellow-500' },
                { key: 'charm', label: '魅力值', color: 'bg-stone-400' },
              ].map((attr) => (
                <div key={attr.key} className="flex items-center gap-4">
                  <span className="w-20 text-sm font-medium text-stone-700">{attr.label}</span>
                  <div className="flex-1 flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={character.attributes?.[attr.key] || 50}
                      onChange={(e) => updateAttribute(attr.key, parseInt(e.target.value))}
                      className="flex-1 h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="w-12 text-sm font-medium text-stone-900 text-right">
                      {character.attributes?.[attr.key] || 50}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 深度设定页：人物深度字段 */}
          {activeTab === 'depth' && (
            <div className="space-y-4">
              {/* 性格成因 - textarea，40-80字 */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">性格成因</label>
                <textarea
                  value={character.personalityOrigin || ''}
                  onChange={(e) => updateField('personalityOrigin', e.target.value)}
                  onInput={autoResize}
                  rows={3}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.personalityOrigin)}`}
                  placeholder={isEmpty(character.personalityOrigin) ? emptyPlaceholder('性格成因（40-80字）') : '性格为何如此，成长环境如何塑造了这种性格（40-80字）'}
                />
              </div>
              {/* 成长背景细节 - textarea，40-80字 */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">成长背景细节</label>
                <textarea
                  value={character.growthBackground || ''}
                  onChange={(e) => updateField('growthBackground', e.target.value)}
                  onInput={autoResize}
                  rows={3}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.growthBackground)}`}
                  placeholder={isEmpty(character.growthBackground) ? emptyPlaceholder('成长背景细节（40-80字）') : '原生家庭、童年关键事件等（40-80字）'}
                />
              </div>
              {/* 语言习惯 - input */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">语言习惯</label>
                <input
                  type="text"
                  value={character.speechHabit || ''}
                  onChange={(e) => updateField('speechHabit', e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.speechHabit)}`}
                  placeholder={isEmpty(character.speechHabit) ? emptyPlaceholder('语言习惯') : '说话风格、用词特点'}
                />
              </div>
              {/* 标志性台词/口头禅 - input */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">标志性台词/口头禅</label>
                <input
                  type="text"
                  value={character.catchphrase || ''}
                  onChange={(e) => updateField('catchphrase', e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.catchphrase)}`}
                  placeholder={isEmpty(character.catchphrase) ? emptyPlaceholder('标志性台词') : '角色的代表性台词，如"做好饭等我回来"'}
                />
              </div>
              {/* 导师传承 - input */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">导师传承</label>
                <input
                  type="text"
                  value={character.mentor || ''}
                  onChange={(e) => updateField('mentor', e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.mentor)}`}
                  placeholder={isEmpty(character.mentor) ? emptyPlaceholder('导师传承') : '师承脉络'}
                />
              </div>
              {/* 心理创伤/执念 - input */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">心理创伤/执念</label>
                <input
                  type="text"
                  value={character.psychologicalTrauma || ''}
                  onChange={(e) => updateField('psychologicalTrauma', e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.psychologicalTrauma)}`}
                  placeholder={isEmpty(character.psychologicalTrauma) ? emptyPlaceholder('心理创伤/执念') : '驱动行为的深层心理，如"前世无法守护小花的遗憾"'}
                />
              </div>
              {/* 道德底线 - input */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">道德底线</label>
                <input
                  type="text"
                  value={character.moralBottomLine || ''}
                  onChange={(e) => updateField('moralBottomLine', e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.moralBottomLine)}`}
                  placeholder={isEmpty(character.moralBottomLine) ? emptyPlaceholder('道德底线') : '什么绝对不会做，如"不滥杀无辜"'}
                />
              </div>
              {/* 决策模式 - input */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">决策模式</label>
                <input
                  type="text"
                  value={character.decisionPattern || ''}
                  onChange={(e) => updateField('decisionPattern', e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.decisionPattern)}`}
                  placeholder={isEmpty(character.decisionPattern) ? emptyPlaceholder('决策模式') : '理性/感性/权衡，面对抉择时的倾向'}
                />
              </div>
              {/* 标志性道具/武器 - input */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">标志性道具/武器</label>
                <input
                  type="text"
                  value={character.signatureItem || ''}
                  onChange={(e) => updateField('signatureItem', e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.signatureItem)}`}
                  placeholder={isEmpty(character.signatureItem) ? emptyPlaceholder('标志性道具/武器') : '角色的代表物品'}
                />
              </div>
              {/* 角色主题色/意象 - input */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">角色主题色/意象</label>
                <input
                  type="text"
                  value={character.themeColor || ''}
                  onChange={(e) => updateField('themeColor', e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.themeColor)}`}
                  placeholder={isEmpty(character.themeColor) ? emptyPlaceholder('角色主题色/意象') : '视觉符号'}
                />
              </div>
              {/* 价值观/信念体系 - input */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">价值观/信念体系</label>
                <input
                  type="text"
                  value={character.values || ''}
                  onChange={(e) => updateField('values', e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 ${emptyFieldClass(character.values)}`}
                  placeholder={isEmpty(character.values) ? emptyPlaceholder('价值观/信念体系') : '人物的道德罗盘'}
                />
              </div>

              {/* 角色矛盾点/反差感 */}
              <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-3">
                <label className="block text-sm font-medium text-amber-700 mb-2">
                  <span className="text-amber-600">⚡</span> 角色矛盾点/反差感
                </label>
                {/* 🔥 2026-09-02 修复（Bug C）：改为 textarea 以容纳完整内容，input 单行会被截断 */}
                <textarea
                  value={character.contradiction || ''}
                  onChange={(e) => updateField('contradiction', e.target.value)}
                  onInput={autoResize}
                  rows={3}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 focus:ring-amber-400 ${isEmpty(character.contradiction) ? 'border-amber-300' : 'border-amber-200'}`}
                  placeholder={isEmpty(character.contradiction) ? emptyPlaceholder('角色矛盾点（必填）') : '如：冷酷杀手+护短狂魔、贪生怕死+关键时刻挺身而出'}
                />
                {isEmpty(character.contradiction) && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ 矛盾反差是角色立体化的关键，需设置对立反差的双重特质</p>
                )}
              </div>

              {/* 角色弧光节点列表 */}
              <div className="bg-stone-50/50 border border-stone-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-stone-800">
                    <span className="text-stone-800">📈</span> 角色弧光节点列表
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const _nodes = Array.isArray(character.arcNodes) ? character.arcNodes : []
                      updateField('arcNodes', [..._nodes, { stage: '', event: '', change: '', powerLevel: '' }])
                    }}
                    className="text-xs px-2 py-1 bg-stone-100 text-stone-800 rounded hover:bg-stone-200 transition-colors"
                  >+ 添加弧光节点</button>
                </div>
                <div className="space-y-2">
                  {(character.arcNodes || []).map((node: { stage: string; event: string; change: string; powerLevel: string }, ni: number) => (
                    <div key={ni} className="bg-white border border-stone-200 rounded-lg p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-stone-100 text-stone-800 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                          {ni + 1}
                        </span>
                        <input
                          type="text"
                          value={node.stage || ''}
                          onChange={(e) => {
                            const _nodes = [...(character.arcNodes || [])]
                            _nodes[ni] = { ...node, stage: e.target.value }
                            updateField('arcNodes', _nodes)
                          }}
                          placeholder="阶段名"
                          className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded text-sm font-medium text-stone-900 focus:ring-2 focus:ring-stone-400"
                        />
                        {PowerLevelCtx.show ? (<input
                          type="text"
                          value={node.powerLevel || ''}
                          onChange={(e) => {
                            const _nodes = [...(character.arcNodes || [])]
                            _nodes[ni] = { ...node, powerLevel: e.target.value }
                            updateField('arcNodes', _nodes)
                          }}
                          placeholder="战力等级"
                          className="flex-1 min-w-[120px] px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-stone-400"
                        />) : null}
                        <button
                          type="button"
                          onClick={() => {
                            const _nodes = [...(character.arcNodes || [])]
                            _nodes.splice(ni, 1)
                            updateField('arcNodes', _nodes)
                          }}
                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                        >删除</button>
                      </div>
                      <input
                        type="text"
                        value={node.event || ''}
                        onChange={(e) => {
                          const _nodes = [...(character.arcNodes || [])]
                            _nodes[ni] = { ...node, event: e.target.value }
                          updateField('arcNodes', _nodes)
                        }}
                        placeholder="关键事件"
                        className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-stone-400"
                      />
                      <textarea
                        value={node.change || ''}
                        onChange={(e) => {
                          const _nodes = [...(character.arcNodes || [])]
                          _nodes[ni] = { ...node, change: e.target.value }
                          updateField('arcNodes', _nodes)
                        }}
                        onInput={autoResize}
                        rows={2}
                        placeholder="心理/性格变化"
                        className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-stone-400 resize-y"
                      />
                    </div>
                  ))}
                  {(character.arcNodes || []).length === 0 && (
                    <p className="text-xs text-stone-400 text-center py-2">
                      暂无弧光节点，建议添加5个节点（起步→觉醒→成长→巅峰→超脱）
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface StepCharactersProps {
  data: GeneratedData['characters']
  onChange: (updated: GeneratedData['characters']) => void
  onRegenerate: (step: string, field?: string) => void
  onGenerate: () => void
  onRegenerateAll: () => void
  isLoading: boolean
  isGenerating?: boolean
  genProgress?: { current: number; total: number }
  regeneratePrompt: string
  setRegeneratePrompt: (v: string) => void
  RegenButton: React.ComponentType<{ step: string; field?: string; label: string }>
  createEmptyCharacter: (role: string) => CharacterData
  appendRoleInput: string
  setAppendRoleInput: (v: string) => void
  regeneratingField: string | null
  stepName: string
  showPowerLevel?: boolean
  // 🔥 「一键校正徽章与定位」需要用户自设详细设定原文作为头衔/职能的权威来源
  detailedDesignInput?: string
  // 🔥 题材：历史/架空历史等题材下，真实历史人物的徽章按"正史表 → 权威百科查证 → LLM"三级取值
  genre?: string
  keywords?: string
}

// 弧光节点「战力等级」显隐上下文：由 StepCharacters 按题材设置（历史/朝堂=隐藏）
const PowerLevelCtx = { show: true }

export default function StepCharacters({
  data, onChange, onRegenerate, onGenerate, onRegenerateAll, isLoading, isGenerating, genProgress,
  regeneratePrompt, setRegeneratePrompt, RegenButton, createEmptyCharacter,
  appendRoleInput, setAppendRoleInput, regeneratingField, stepName, showPowerLevel, detailedDesignInput, genre, keywords,
}: StepCharactersProps) {
  // 🔥 题材决定弧光节点「战力等级」显隐（历史/朝堂题材隐藏）
  PowerLevelCtx.show = showPowerLevel !== false
  const isWholeStepRegenerating = regeneratingField === stepName

  // 🔥 一键校正徽章与定位：分批/增量生成时旧批次角色不会再走服务端规范化，
  //   历史遗留的错误定位（全员"竞争对手"）与错误徽章（"短命""支撑危局""江阴"）用此按钮按同一规则重算
  const [normalizing, setNormalizing] = useState(false)
  const [normalizeMsg, setNormalizeMsg] = useState('')
  const handleNormalize = async function () {
    if (normalizing || !data) return
    setNormalizing(true)
    setNormalizeMsg('')
    try {
      const res = await fetch('/tuzhong-wenshu/api/characters/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (typeof localStorage !== 'undefined' ? (localStorage.getItem('token') || '') : '') },
        body: JSON.stringify({ characters: data, detailedDesignInput: detailedDesignInput || '', genre: genre || '', keywords: keywords || '' }),
      })
      const json = await res.json()
      if (!res.ok || !json || json.success !== true || !json.data || !json.data.characters) {
        setNormalizeMsg('⚠️ 校正失败：' + ((json && json.message) || '接口异常'))
        return
      }
      onChange(json.data.characters)
      const changed: Array<{ name: string; field: string; from: string; to: string }> = json.data.changed || []
      const dup: number = json.data.removedDupes || 0
      const filled: number = json.data.titlesFilled || 0
      const histN: number = json.data.historicalApplied || 0
      const onlineN: number = json.data.onlineApplied || 0
      const srcParts: string[] = []
      if (histN > 0) srcParts.push('正史定称 ' + histN + ' 人')
      if (onlineN > 0) srcParts.push('百科查证 ' + onlineN + ' 人')
      if (filled > 0) srcParts.push('AI 拟定 ' + filled + ' 人')
      const extra = (dup > 0 ? '；已合并 ' + dup + ' 条同名重复角色' : '') + (srcParts.length ? '；徽章来源：' + srcParts.join('、') : '')
      setNormalizeMsg(changed.length === 0
        ? '✅ 已检查 ' + (json.data.total || 0) + ' 个角色，徽章与定位均无需调整' + extra
        : '✅ 已校正 ' + changed.length + ' 处：' + changed.slice(0, 6).map(function (c) { return c.name + '·' + c.field + ' ' + c.from + '→' + c.to }).join('，') + (changed.length > 6 ? ' 等' + changed.length + ' 处' : '') + extra)
    } catch (e: unknown) {
      setNormalizeMsg('⚠️ 校正异常：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setNormalizing(false)
    }
  }
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
  }, [data, appendRoleInput])

  // 🔥 极速跳转：后台正在生成中，显示进度条
  // 🔥 修复：增加 !data.protagonist.name 检查，因为normalizeCharactersData总是用ensureChar包装对象
  // 导致data.protagonist永远是真值对象，即使name为空字符串也会跳过加载状态
  if (isGenerating && (!data || !data.protagonist || !data.protagonist.name)) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
          <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">主要人物设定</h3>
            <p className="text-stone-500 text-sm">AI正在基于前文的金手指和世界观设计角色</p>
            <div className="max-w-md mx-auto mt-4">
              <div className="w-full bg-stone-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r wenshu-stripe h-2.5 rounded-full transition-all duration-700 ease-out"
                  style={{ width: genProgress ? Math.round((genProgress.current / genProgress.total) * 100) + '%' : '25%' }}
                />
              </div>
              <p className="text-sm text-stone-500 mt-2">
                {genProgress ? '已生成 ' + genProgress.current + '/' + genProgress.total + ' 个角色' : 'AI正在构思人物设定…'}
              </p>
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="text-center text-stone-400 text-sm animate-pulse">⏳ 页面已跳转，AI继续在后台生成，请稍候…</div>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
          <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">主要人物设定</h3>
            <p className="text-stone-500 text-sm">AI将为故事设计完整的角色阵容</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={function (e) { setRegeneratePrompt(e.target.value) }}
                onKeyDown={function (e) { if (e.key === 'Enter') { onGenerate() } }}
                placeholder="输入你的需求，如：增加一个女性配角，让反派更复杂..."
                className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-stone-50"
              />
              <button
                type="button"
                onClick={onGenerate}
                disabled={isLoading}
                className="whitespace-nowrap inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r wenshu-btn-primary rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '生成中...' : '✨ 生成角色设定'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">主要人物设定</h3>
          <p className="text-stone-500 text-sm">AI为故事设计了完整的角色阵容（可直接编辑）</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={regeneratePrompt}
              onChange={function (e) { setRegeneratePrompt(e.target.value) }}
              onKeyDown={function (e) { if (e.key === 'Enter') { onRegenerateAll() } }}
              placeholder="输入你的需求，如：增加一个女性配角，让反派更复杂..."
              className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-stone-50"
            />
            <button
              type="button"
              onClick={onRegenerateAll}
              disabled={isWholeStepRegenerating}
              className="whitespace-nowrap inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r wenshu-btn-primary rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWholeStepRegenerating ? '生成中...' : '🔄 重新生成'}
            </button>
          </div>
          {/* 增量追加角色输入框 */}
          <div className="max-w-2xl mx-auto mt-4 pt-4 border-t border-stone-100">
            <label className="block text-sm font-medium text-stone-500 mb-2 text-left">增量追加角色（粘贴Markdown表格/角色文案，原有角色保留不动）</label>
            <textarea
              value={appendRoleInput}
              onChange={function (e) { setAppendRoleInput(e.target.value) }}
              onInput={autoResize}
              placeholder="在此粘贴新增角色资料（支持Markdown表格、分段文案），如：&#10;| 姓名 | 年龄 | 身份 | 性格 |&#10;| 张三 | 25 | 剑客 | 冷峻寡言 |&#10;| 李四 | 30 | 商人 | 精明圆滑 |"
              rows={3}
              className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-stone-50 resize-y"
            />
            <div className="flex justify-between items-center mt-2 gap-2">
              <div className="text-xs text-stone-500 flex-1 truncate">{normalizeMsg}</div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleNormalize}
                  disabled={normalizing || isWholeStepRegenerating}
                  title="按与生成环节完全相同的规则，重算全部已有角色的徽章（封号/官职）与角色定位（叙事职能）"
                  className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-stone-800 border border-stone-300 bg-white hover:bg-stone-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {normalizing ? '⏳ 校正中...' : '🔧 一键校正徽章与定位'}
                </button>
                {appendRoleInput && (
                  <button
                    type="button"
                    onClick={function () { setAppendRoleInput('') }}
                    className="px-4 py-2 text-sm text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    清空
                  </button>
                )}
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-stone-800 border border-stone-200 bg-stone-50 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? '⏳ 生成中...' : '✨ 增量生成角色'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🔥 精修进度条：AI后台精修中 */}
      {isGenerating && (
        <div className="text-center py-4 text-stone-800 text-sm">
          <div className="inline-flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
            <span>AI正在精修角色详情（外貌、性格、背景）…</span>
          </div>
        </div>
      )}

      {/* 角色卡片列表 */}
      <div className="space-y-6">
        {/* 主角卡片 */}
        <CharacterCard
          character={data?.protagonist}
          role="protagonist"
          roleLabel="主角"
          roleColor="blue"
          onChange={(updated) => onChange({ ...data, protagonist: updated })}
        />

        {/* 女主卡片 */}
        <CharacterCard
          character={data?.femaleLead}
          role="femaleLead"
          roleLabel="女主"
          roleColor="pink"
          onChange={(updated) => onChange({ ...data, femaleLead: updated })}
        />

        {/* 反派卡片 */}
        <CharacterCard
          character={data?.antagonist}
          role="antagonist"
          roleLabel="反派"
          roleColor="red"
          onChange={(updated) => onChange({ ...data, antagonist: updated })}
        />

        {/* 其他角色卡片 */}
        {data?.supporting?.map((char, index: number) => {
          // 🔥 2026-09-02 第五轮复测：单女主/单反派模式下，过滤完全空对象（无 name）的卡
          //   复现实锤：截图 1/3/4 显示「女主/女主2/女主3」三张空卡，全部字段 = 0/未设定/placeholder。
          //   根因 = LLM 偶尔产出 [{name:'', identity:'某段'} , {...空对象}, {...空对象}]，
          //         normalize 已加 _hasMeaningfulContent 兜底但仍漏掉 identity>4 字的对象。
          //   前端最终防线：map 前再过滤一次，无 name 一律不渲染。
          if (!char) return null
          var _charName = (char && typeof char.name === 'string') ? char.name.trim() : ''
          if (!_charName) return null
          const isExtraFL = /^女主\d+$/.test(char.role || '')
          const isVillain = char && /反派|antagonist|villain/i.test(char.role || '')
          const cardColor: 'blue' | 'red' | 'pink' | 'green' | 'gray' | 'purple' = isExtraFL ? 'pink' : (isVillain ? 'red' : 'gray')
          return (
          <CharacterCard
            key={char.id || `supporting-${index}-${char.name || ''}`}
            character={char}
            role="supporting"
            roleLabel={char.role || '配角'}
            roleColor={cardColor}
            onChange={(updated) => {
              const newSupporting = [...(data?.supporting || [])]
              newSupporting[index] = updated
              onChange({ ...data, supporting: newSupporting })
            }}
            onDelete={() => {
              if (confirm('确定要删除这个角色吗？')) {
                onChange({
                  ...data,
                  supporting: data?.supporting?.filter((_: CharacterData, i: number) => i !== index) || [],
                })
              }
            }}
          />
        )})}
      </div>

      {/* 添加角色按钮 */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => {
            const newCharacter = createEmptyCharacter('配角')
            onChange({
              ...data,
              supporting: [...(data?.supporting || []), newCharacter],
            })
          }}
          className="px-6 py-3 bg-stone-800 text-white rounded-xl text-sm font-medium hover:bg-stone-800 transition-colors shadow-lg hover:shadow-xl"
        >
          + 添加新角色
        </button>
      </div>
    </div>
  )
}
