'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronRight, Trash2, Plus, User, Shield, Sword, Heart, Users, Edit2, X, Save } from 'lucide-react'
import { extractText } from '@/lib/text-utils'
import type { GeneratedData } from '../ai-generate-wizard'

type RelationshipItem = Partial<NonNullable<NonNullable<GeneratedData['relationships']>['relationships']>[number]> & {
  id?: string
  impactOnPlot?: string
  circle?: string
  conflictType?: string
  intensity?: number
  developmentStage?: string
  triggerCondition?: string
  asymmetry?: string
  boundPlotNode?: string
  evolutionCurve?: string
  keyMoments?: string
  deepConflict?: string
  plotInfluence?: string
  relationship?: string
  relationType?: string
  impact?: string
}
type CharactersData = NonNullable<GeneratedData['characters']> & {
  femaleLeads?: Array<{ name?: string; identity?: string }>
  antagonists?: Array<{ name?: string; identity?: string }>
}

// 关系图节点组件 - 统一卡片大小、一排三人、点击可编辑
function RelationshipGraph({ relationships, characters, onChange: onRelationsChange }: { relationships: RelationshipItem[], characters: CharactersData | undefined, onChange: (rels: RelationshipItem[]) => void }) {
  const [selectedChar, setSelectedChar] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)

  const autoResize = function(e: React.FormEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }

  // 收集所有角色名
  const characterNames = new Set<string>()
  relationships.forEach(rel => {
    if (rel.from) characterNames.add(rel.from)
    if (rel.to) characterNames.add(rel.to)
  })

  // 获取角色信息
  const getCharInfo = (name: string) => {
    if (!name) return { role: '配角', identity: '未知身份' }
    if (characters?.protagonist?.name === name) return { role: '主角', identity: characters?.protagonist?.identity || '主角' }
    const femaleLeads = characters?.femaleLeads || []
    if (characters?.femaleLead?.name === name) return { role: '女主', identity: characters?.femaleLead?.identity || '女主' }
    const foundFemale = femaleLeads.find((f: { name?: string; identity?: string }) => f.name === name)
    if (foundFemale) return { role: '女主', identity: foundFemale.identity || '女主' }
    const antagonists = characters?.antagonists || []
    if (characters?.antagonist?.name === name) return { role: '反派', identity: characters?.antagonist?.identity || '反派' }
    const foundAntagonist = antagonists.find((a: { name?: string; identity?: string }) => a.name === name)
    if (foundAntagonist) return { role: '反派', identity: foundAntagonist.identity || '反派' }
    const supporting = characters?.supporting || []
    const foundSupport = supporting.find((s: { name?: string; identity?: string; background?: string; role?: string }) => s.name === name)
    if (foundSupport) {
      let roleLabel = '配角'
      const roleFromChar = foundSupport.role
      if (roleFromChar && typeof roleFromChar === 'string') {
        if (roleFromChar === 'antagonist' || roleFromChar === '反派') roleLabel = '反派'
        else if (roleFromChar.indexOf('女主') !== -1) roleLabel = '女主'
        else roleLabel = roleFromChar
      }
      return { role: roleLabel, identity: foundSupport.identity || foundSupport.background || roleLabel }
    }
    return { role: '配角', identity: '重要角色' }
  }

  // 角色头像背景色
  const getAvatarBg = (role: string) => {
    switch (role) {
      case '主角': return 'from-stone-400 to-stone-700'
      case '女主': return 'from-stone-500 to-stone-700'
      case '反派': return 'from-red-500 to-red-600'
      case '导师': return 'from-stone-400 to-stone-800'
      default: return 'from-slate-500 to-slate-600'
    }
  }

  // 获取某角色的所有关系
  // 🔥 2026-09-02 第五轮复测（截图8 · Bug E）：UI 层最终兜底防线，
  //   即使后端未归一化（localStorage 旧数据、用户跨设备等）也保证 7 个核心字段永远不空。
  //   此外，下拉框枚举值必须命中 UI 列表，不再把空字符串 / 自由文本透传到控件 value。
  const _CIRCLE_CANON = ['核心圈层', '主力圈层', '外围圈层', '宿命圈层']
  const _CONFLICT_CANON = ['固定矛盾', '动态矛盾', '隐性矛盾', '无矛盾']
  const _DEV_CANON = ['初识', '建立', '深化', '转折', '稳定', '破裂', '敌对']
  const _pickFromCanon = (v: unknown, canon: string[], fb: string): string => {
    var _s = typeof v === 'string' ? v.trim() : ''
    if (canon.indexOf(_s) !== -1) return _s
    // 命中语义（如"亲密"→核心圈层）—轻微意图推导
    if (canon === _CIRCLE_CANON) {
      if (/核心|至亲|挚友|知己|恋人|夫妻|血亲|父子|母子|家族|核心圈/.test(_s)) return '核心圈层'
      if (/主力|盟友|战友|同僚|上下级|将军|统帅|师徒|君臣|主仆|朋友/.test(_s)) return '主力圈层'
      if (/宿命|宿敌|死敌|世仇|血海|势不两立/.test(_s)) return '宿命圈层'
    }
    if (canon === _CONFLICT_CANON) {
      if (/背叛|血仇|仇恨|争夺|敌对|冲突|对立|旧怨|嫌隙|利益|固定/.test(_s)) return '固定矛盾'
      if (/暗藏|暗中|表面|隐忍|潜伏|心怀|暗流|提防|隐性/.test(_s)) return '隐性矛盾'
      if (/无/.test(_s)) return '无矛盾'
    }
    if (canon === _DEV_CANON) {
      if (/初识|初遇|相识|初见|新识/.test(_s)) return '初识'
      if (/深化|加深|升温|深爱|浓|挚/.test(_s)) return '深化'
      if (/转折|转变|剧变|翻转|变化/.test(_s)) return '转折'
      if (/稳定|牢固|坚不可摧|深厚|坚实|相守/.test(_s)) return '稳定'
      if (/破裂|决裂|疏远|断绝|分道/.test(_s)) return '破裂'
      if (/反目|为敌|敌对|兵戎|交恶/.test(_s)) return '敌对'
    }
    return fb
  }
  const _inferCircle = (relType: string, _desc: string): string => {
    if (/宿敌|世仇|宿命|死敌|血海|势不两立|仇敌/.test(relType + ' ' + _desc)) return '宿命圈层'
    if (/配偶|恋人|夫妻|皇后|主仆|血亲|家族/.test(relType + ' ' + _desc)) return '核心圈层'
    if (/盟友|战友|同级|将军|统帅|君臣|朋友|师徒|上下级/.test(relType)) return '主力圈层'
    return '外围圈层'
  }
  const _inferConflict = (relType: string, _desc: string): string => {
    if (/背叛|血仇|仇恨|敌对|冲突|对立|争夺|旧怨|嫌隙|利益/.test(relType + ' ' + _desc)) return '固定矛盾'
    if (/暗藏|暗中|表面|隐忍|潜伏|心怀|暗流|提防/.test(_desc)) return '隐性矛盾'
    if (/对头|仇|恨|敌对|争霸|势不两立/.test(relType)) return '固定矛盾'
    return '动态矛盾'
  }
  const _inferDevStage = (relType: string, _desc: string): string => {
    if (/血仇|世仇|血海|势不两立|仇敌/.test(relType)) return '敌对'
    if (/恋人|夫妻|配偶|皇后|深爱|挚爱|莫逆/.test(relType)) return '深化'
    if (/盟友|战友|同盟|君臣|师徒/.test(relType)) return '稳定'
    if (/宿怨|旧怨|误会|裂痕/.test(_desc)) return '破裂'
    if (/初识|初遇|相识|新识/.test(_desc)) return '初识'
    return '建立'
  }

  const getCharRelations = (name: string) => {
    // 新增字段：四大圈层与矛盾体系，使用 ||'' 或 ||1 兜底，向后兼容旧数据
    const rels: Array<{
      index: number; otherName: string; type: string; direction: string;
      description: string; impactOnPlot: string;
      circle: string; conflictType: string; intensity: number;
      developmentStage: string; triggerCondition: string; asymmetry: string; boundPlotNode: string;
      evolutionCurve: string; keyMoments: string; deepConflict: string; plotInfluence: string;
      [key: string]: unknown;
    }> = []
    relationships.forEach((rel, idx) => {
      const relType = rel.type || rel.relationship || '盟友'
      const desc = rel.development || rel.description || ''
      const impact = rel.impactOnPlot || rel.impact || ''
      // 🔥 第五轮复测：所有 7 个核心字段前端最终兜底（绝不允许 '' 透传到 UI）
      // 圈层归属：核心圈层/主力圈层/外围圈层/宿命圈层
      const circle = _pickFromCanon(rel.circle, _CIRCLE_CANON, _inferCircle(relType, desc))
      // 矛盾类型：固定矛盾/动态矛盾/隐性矛盾/无矛盾
      const conflictType = _pickFromCanon(rel.conflictType, _CONFLICT_CANON, _inferConflict(relType, desc))
      // 关系强度等级：1-10分（超出区间收回 1-10）
      const _rawIntensity = typeof rel.intensity === 'number' ? rel.intensity : parseInt((rel.intensity as any) || '0', 10)
      const intensity = (_rawIntensity >= 1 && _rawIntensity <= 10) ? _rawIntensity : 5
      // 关系发展阶段：初识/建立/深化/转折/稳定/破裂/敌对
      const developmentStage = _pickFromCanon(rel.developmentStage, _DEV_CANON, _inferDevStage(relType, desc))
      // 关系转折触发条件（永远给一段非空文本，避免 placeholder 久挂）
      var triggerCondition = typeof rel.triggerCondition === 'string' ? rel.triggerCondition.trim() : ''
      if (!triggerCondition) {
        if (desc && desc.length >= 8) triggerCondition = desc.substring(0, Math.min(40, desc.length))
        else triggerCondition = '两人因' + (relType || '此') + '关系在关键事件中被推到同一处境，关系由此展开'
      }
      // 双向情感差异
      var asymmetry = typeof rel.asymmetry === 'string' ? rel.asymmetry.trim() : ''
      if (!asymmetry) {
        asymmetry = intensity >= 8 ? '双方均高度在意此关系'
          : intensity >= 5 ? '一方主动，一方回应'
          : '一方主导，另一方保持距离'
      }
      // 绑定剧情节点
      var boundPlotNode = typeof rel.boundPlotNode === 'string' ? rel.boundPlotNode.trim() : ''
      if (!boundPlotNode) {
        if (typeof rel.keyEvents === 'string' && rel.keyEvents.length >= 4) {
          boundPlotNode = rel.keyEvents.substring(0, Math.min(40, rel.keyEvents.length))
        } else {
          boundPlotNode = '故事开篇阶段，关系随主线推进而展开'
        }
      }
      // 关系深度演变数据（4个字段，向后兼容）
      var evolutionCurve = typeof rel.evolutionCurve === 'string' ? rel.evolutionCurve.trim() : ''
      if (!evolutionCurve) {
        // 用 developmentStage 拼最小可读版本
        evolutionCurve = '初识→' + (developmentStage || '建立') + '→深化'
      }
      var keyMoments = typeof rel.keyMoments === 'string' ? rel.keyMoments.trim() : ''
      if (!keyMoments && typeof rel.keyEvents === 'string' && rel.keyEvents.length >= 4) {
        keyMoments = rel.keyEvents
      }
      if (!keyMoments) {
        keyMoments = '1. 初识场景 2. 关键冲突事件 3. 关系转折 4. 终局定性'
      }
      var deepConflict = typeof rel.deepConflict === 'string' ? rel.deepConflict.trim() : ''
      if (!deepConflict && desc && desc.length >= 8) {
        deepConflict = '表面' + (relType || '此') + '关系，本质上反映了乱世中个体对' + (relType || '命运') + '的挣扎与选择'
      }
      if (!deepConflict) {
        deepConflict = '表面：单纯的' + (relType || '关联') + '；本质：错综复杂的家国/江湖/阵营利益交织'
      }
      var plotInfluence = typeof rel.plotInfluence === 'string' ? rel.plotInfluence.trim() : ''
      if (!plotInfluence) {
        if (impact && impact.length >= 8) plotInfluence = impact
        else plotInfluence = '此关系在主线推进阶段承担' + (relType || '重要') + '功能，参与关键剧情节点'
      }
      if (rel.from === name && rel.to) {
        rels.push({ index: idx, otherName: rel.to, type: relType, direction: '→', description: desc, impactOnPlot: impact, circle, conflictType, intensity, developmentStage, triggerCondition, asymmetry, boundPlotNode, evolutionCurve, keyMoments, deepConflict, plotInfluence })
      } else if (rel.to === name && rel.from) {
        rels.push({ index: idx, otherName: rel.from, type: relType, direction: '←', description: desc, impactOnPlot: impact, circle, conflictType, intensity, developmentStage, triggerCondition, asymmetry, boundPlotNode, evolutionCurve, keyMoments, deepConflict, plotInfluence })
      }
    })
    return rels
  }

  // 关系类型对应的颜色
  const getRelColor = (type: string) => {
    const intimateTypes = ['恋人', '爱人', '伴侣', '夫妻', '道侣', '未婚夫妻', '青梅竹马', '暗恋', '仰慕', '至亲', '亲属', '师徒', '师父', '导师', '恩人', '故交', '知己', '挚友', '兄弟', '母子', '父子', '父女', '母女', '姐妹', '兄妹', '姐弟', '义父', '义母', '义子', '义女', '养父', '养母', '养子', '养女', '继父', '继母', '继子', '继女', '赏识', '器重', '宠爱', '溺爱', '疼爱', '关照', '提拔', '栽培', '知遇之恩']
    const allyTypes = ['盟友', '同盟', '合作', '朋友', '战友', '同门', '同乡', '同僚', '伙伴', '上下级', '主仆', '从属', '追随', '信仰', '继承人', '契约关系', '臣服', '结盟', '联盟', '联手', '协作', '配合', '互助', '互利', '共赢', '同志', '同事', '同伴', '搭档', '同窗', '同学', '发小', '邻居', '乡邻', '同袍', '袍泽', '表面臣服实则中立']
    const enemyTypes = ['仇敌', '对手', '敌人', '敌对', '死敌', '宿敌', '宿怨', '血海深仇', '势不两立', '利用', '仇视', '世仇', '背叛', '翻脸', '决裂', '针锋相对', '水火不容', '不共戴天', '你死我活', '夺妻之恨', '杀父之仇', '灭门之仇', '夺宝之仇', '断道之仇', '阻道之仇', '毁家之仇', '陷害', '算计', '阴谋', '暗算', '打击', '打压', '排挤', '倾轧', '碾压', '欺凌', '欺辱', '羞辱', '侮辱', '蔑视', '鄙视', '轻视', '无视', '敌视', '仇视', '怒视', '怒目', '怒对', '怒骂', '怒斥', '怒喝', '怒吼', '怒啸', '怒嚎', '猎杀', '追捕', '围剿', '清剿', '铲除', '剿灭']

    if (intimateTypes.includes(type)) return 'bg-red-100 text-red-700 border-red-300'
    if (allyTypes.includes(type)) return 'bg-green-100 text-green-700 border-green-300'
    if (enemyTypes.includes(type)) return 'bg-orange-100 text-orange-700 border-orange-300'
    return 'bg-slate-100 text-slate-700 border-slate-300'
  }

  // 更新关系
  const updateRel = (index: number, updates: Partial<RelationshipItem>) => {
    const newRels = [...relationships]
    newRels[index] = { ...newRels[index], ...updates }
    onRelationsChange(newRels)
  }

  // 删除关系
  const deleteRel = (index: number) => {
    if (confirm('确定要删除这个关系吗？')) {
      const newRels = relationships.filter((_, i) => i !== index)
      onRelationsChange(newRels)
    }
  }

  const charNamesArray = Array.from(characterNames)
  if (charNamesArray.length === 0) return null

  // 选中角色的关系
  const selectedRels = selectedChar ? getCharRelations(selectedChar) : []

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-6 border border-slate-200">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-slate-700">
          《人物关系图》
        </h3>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-gradient-to-r from-stone-400 to-stone-500 text-white text-xs font-medium rounded-full shadow-sm">
            AI生成
          </span>
          {selectedChar && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1 px-3 py-1 bg-stone-400 text-white text-xs font-medium rounded-full shadow-sm hover:bg-stone-700 transition-colors"
            >
              <Edit2 className="w-3 h-3" /> 编辑
            </button>
          )}
        </div>
      </div>

      {/* 角色关系卡片网格 - 响应式排列，统一卡片高度 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
        {charNamesArray.map((name) => {
          const info = getCharInfo(name)
          const rels = getCharRelations(name)
          const avatarBg = getAvatarBg(info.role)
          const isSelected = selectedChar === name

          return (
            <div key={name} className="flex">
              {/* 角色卡片 - 统一高度 */}
              <div
                className={`w-full flex flex-col bg-white rounded-xl shadow-md border-2 transition-all cursor-pointer overflow-hidden ${
                  isSelected ? 'border-stone-400 shadow-lg ring-2 ring-stone-200' : 'border-slate-200 hover:border-slate-300 hover:shadow-lg'
                }`}
                onClick={() => {
                  setSelectedChar(name)
                  setEditMode(false)
                }}
              >
                {/* 头像区 */}
                <div className={`h-14 bg-gradient-to-br ${avatarBg} flex items-center justify-center relative flex-shrink-0`}>
                  <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm">
                    <span className="text-lg">
                      {info.role === '主角' ? '👤' : info.role === '女主' ? '👧' : info.role === '反派' ? '😈' : info.role === '导师' ? '🧙' : '👥'}
                    </span>
                  </div>
                  <span className="absolute bottom-0 right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-slate-500 shadow-sm">
                    {info.role === '主角' ? <User className="w-2.5 h-2.5" /> : info.role === '女主' ? <Heart className="w-2.5 h-2.5" /> : info.role === '反派' ? <Sword className="w-2.5 h-2.5" /> : <Users className="w-2.5 h-2.5" />}
                  </span>
                </div>

                {/* 角色信息区 - flex-grow填充剩余空间 */}
                <div className="p-3 flex flex-col flex-grow">
                  <h4 className="text-center font-bold text-slate-800 text-sm mb-1">【{name}】</h4>
                  <p className="text-center text-xs text-slate-600 mb-2 line-clamp-2 leading-tight" title={info.identity}>
                    ✦ {info.identity}
                  </p>

                  {/* 关系列表 */}
                  <div className="border-t border-slate-100 pt-2 flex-grow">
                    <p className="text-xs text-slate-400 mb-1">
                      关系：({rels.length})
                    </p>
                    <div className="space-y-1">
                      {rels.slice(0, 4).map((rel, idx) => (
                        <div key={idx} className={`text-xs flex items-center gap-1 px-1.5 py-0.5 rounded border ${getRelColor(rel.type)}`}>
                          <span className="opacity-60 flex-shrink-0">{rel.direction}</span>
                          <span className="font-medium truncate min-w-0 flex-1">{rel.otherName}</span>
                          <span className="opacity-60 flex-shrink-0 text-[10px]">({rel.type})</span>
                        </div>
                      ))}
                      {rels.length > 4 && (
                        <div className="text-xs text-slate-400 text-center">...还有{rels.length - 4}条关系</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 选中角色的详细编辑区域 */}
      {selectedChar && (
        <div className={`mt-4 rounded-xl border-2 overflow-hidden transition-all ${editMode ? 'border-stone-400 bg-stone-50/30' : 'border-slate-300 bg-white'}`}>
          {/* 头部 */}
          <div className={`px-4 py-3 flex items-center justify-between ${editMode ? 'bg-stone-400 text-white' : 'bg-slate-100 text-slate-700'}`}>
            <div className="flex items-center gap-2">
              {editMode && <Edit2 className="w-4 h-4" />}
              <span className="font-bold">{selectedChar}</span>
              <span className="text-sm opacity-70">({selectedRels.length}条关系)</span>
            </div>
            <div className="flex items-center gap-2">
              {editMode && (
                <button
                  onClick={() => setEditMode(false)}
                  className="flex items-center gap-1 px-2 py-1 bg-white text-stone-700 text-xs font-medium rounded hover:bg-stone-100 transition-colors"
                >
                  <Save className="w-3 h-3" /> 保存
                </button>
              )}
              <button
                onClick={() => { setSelectedChar(null); setEditMode(false) }}
                className="p-1 hover:bg-opacity-20 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 关系详情列表 */}
          <div className="p-4 space-y-3">
            {selectedRels.map((rel) => (
              <div key={rel.index} className={`rounded-lg border p-3 ${getRelColor(rel.type)} border`}>
                {/* 关系头部 */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-sm">{selectedChar}</span>
                  <span className="text-slate-500">{rel.direction}</span>
                  {editMode ? (
                    <input
                      type="text"
                      value={rel.otherName}
                      onChange={(e) => {
                        if (rel.direction === '→') {
                          updateRel(rel.index, { to: e.target.value })
                        } else {
                          updateRel(rel.index, { from: e.target.value })
                        }
                      }}
                      className="flex-1 px-2 py-1 text-sm font-medium bg-white border border-slate-200 rounded focus:border-stone-400 focus:outline-none"
                    />
                  ) : (
                    <span className="font-medium">{rel.otherName}</span>
                  )}
                  {editMode ? (
                    <select
                      value={rel.type}
                      onChange={(e) => updateRel(rel.index, { type: e.target.value })}
                      className="px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:border-stone-400 focus:outline-none"
                    >
                      <option value="盟友">盟友</option>
                      <option value="恋人">恋人</option>
                      <option value="敌对">敌对</option>
                      <option value="师徒">师徒</option>
                      <option value="朋友">朋友</option>
                      <option value="对手">对手</option>
                      <option value="亲属">亲属</option>
                      <option value="君臣">君臣</option>
                      <option value="主仆">主仆</option>
                      <option value="追随者">追随者</option>
                      <option value="其他">其他</option>
                    </select>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-white/50 rounded">{rel.type}</span>
                  )}
                  {editMode && (
                    <button
                      onClick={() => deleteRel(rel.index)}
                      className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 关系描述 */}
                <div className="bg-white/60 rounded-lg p-2">
                  <div className="text-xs text-slate-500 mb-1">关系描述：</div>
                  {editMode ? (
                    <textarea
                      value={rel.description}
                      onChange={(e) => updateRel(rel.index, { development: e.target.value, description: e.target.value })}
                      onInput={autoResize}
                      rows={2}
                      placeholder="基于本作角色设定填写关系发展过程、关键事件、情感变化..."
                      className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:border-stone-400 focus:outline-none"
                    />
                  ) : (
                    <p className="text-xs text-slate-700">
                      {rel.description || '暂无描述'}
                    </p>
                  )}
                </div>

                {/* 剧情影响 */}
                <div className="bg-white/60 rounded-lg p-2 mt-2">
                  <div className="text-xs text-slate-500 mb-1">🎯 剧情影响：</div>
                  {editMode ? (
                    <textarea
                      value={rel.impactOnPlot || ''}
                      onChange={(e) => updateRel(rel.index, { impactOnPlot: e.target.value })}
                      onInput={autoResize}
                      rows={2}
                      placeholder="基于本作故事大纲填写该关系在哪个情节/阶段产生什么具体影响..."
                      className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:border-stone-400 focus:outline-none"
                    />
                  ) : (
                    <p className="text-xs text-slate-700">
                      {rel.impactOnPlot || '暂无剧情影响'}
                    </p>
                  )}
                </div>

                {/* 圈层归属 & 矛盾体系（数据沉淀字段） */}
                <div className="bg-white/60 rounded-lg p-2 mt-2">
                  <div className="text-xs text-slate-500 mb-2">🎯 圈层归属 & 矛盾体系：</div>

                  {/* 圈层归属 + 矛盾类型 */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">圈层归属</label>
                      {editMode ? (
                        <select
                          value={rel.circle}
                          onChange={(e) => updateRel(rel.index, { circle: e.target.value })}
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:border-stone-400 focus:outline-none"
                        >
                          <option value="">未设定</option>
                          <option value="核心圈层">核心圈层</option>
                          <option value="主力圈层">主力圈层</option>
                          <option value="外围圈层">外围圈层</option>
                          <option value="宿命圈层">宿命圈层</option>
                        </select>
                      ) : (
                        <p className="text-xs text-slate-700">{rel.circle || '未设定'}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">矛盾类型</label>
                      {editMode ? (
                        <select
                          value={rel.conflictType}
                          onChange={(e) => updateRel(rel.index, { conflictType: e.target.value })}
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:border-stone-400 focus:outline-none"
                        >
                          <option value="">未设定</option>
                          <option value="固定矛盾">固定矛盾</option>
                          <option value="动态矛盾">动态矛盾</option>
                          <option value="隐性矛盾">隐性矛盾</option>
                          <option value="无矛盾">无矛盾</option>
                        </select>
                      ) : (
                        <p className="text-xs text-slate-700">{rel.conflictType || '未设定'}</p>
                      )}
                    </div>
                  </div>

                  {/* 关系强度 + 发展阶段 */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">关系强度（1-10）</label>
                      {editMode ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={1}
                            max={10}
                            value={rel.intensity}
                            onChange={(e) => updateRel(rel.index, { intensity: Number(e.target.value) })}
                            className="flex-1"
                          />
                          <span className="text-xs text-slate-700 font-medium min-w-[28px] text-center">{rel.intensity}</span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-700">{rel.intensity} / 10</p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">发展阶段</label>
                      {editMode ? (
                        <select
                          value={rel.developmentStage}
                          onChange={(e) => updateRel(rel.index, { developmentStage: e.target.value })}
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:border-stone-400 focus:outline-none"
                        >
                          <option value="">未设定</option>
                          <option value="初识">初识</option>
                          <option value="建立">建立</option>
                          <option value="深化">深化</option>
                          <option value="转折">转折</option>
                          <option value="稳定">稳定</option>
                          <option value="破裂">破裂</option>
                          <option value="敌对">敌对</option>
                        </select>
                      ) : (
                        <p className="text-xs text-slate-700">{rel.developmentStage || '未设定'}</p>
                      )}
                    </div>
                  </div>

                  {/* 双向情感差异 */}
                  <div className="mb-2">
                    <label className="text-[10px] text-slate-500 block mb-0.5">双向情感差异（asymmetry）</label>
                    {editMode ? (
                      <input
                        type="text"
                        value={rel.asymmetry}
                        onChange={(e) => updateRel(rel.index, { asymmetry: e.target.value })}
                        placeholder="基于本作角色设定：填写双方对彼此情感差异（如：A信任B，B暗中利用A）"
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:border-stone-400 focus:outline-none"
                      />
                    ) : (
                      <p className="text-xs text-slate-700">{rel.asymmetry || '未设定'}</p>
                    )}
                  </div>

                  {/* 关系转折触发条件 */}
                  <div className="mb-2">
                    <label className="text-[10px] text-slate-500 block mb-0.5">关系转折触发条件</label>
                    {editMode ? (
                      <textarea
                        value={rel.triggerCondition}
                        onChange={(e) => updateRel(rel.index, { triggerCondition: e.target.value })}
                        onInput={autoResize}
                        rows={2}
                        placeholder="基于本作前序设定：填写触发关系质变的具体事件（参考灵感创作/人物设定的核心冲突）"
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:border-stone-400 focus:outline-none"
                      />
                    ) : (
                      <p className="text-xs text-slate-700">{rel.triggerCondition || '未设定'}</p>
                    )}
                  </div>

                  {/* 绑定剧情节点 */}
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">绑定剧情节点</label>
                    {editMode ? (
                      <input
                        type="text"
                        value={rel.boundPlotNode}
                        onChange={(e) => updateRel(rel.index, { boundPlotNode: e.target.value })}
                        placeholder="基于本作故事大纲：填写此关系绑定的卷/章/关键事件节点"
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:border-stone-400 focus:outline-none"
                      />
                    ) : (
                      <p className="text-xs text-slate-700">{rel.boundPlotNode || '未设定'}</p>
                    )}
                  </div>

                  {/* 关系深度演变数据（基于本作前序设定做关系深度演变设计） */}
                  <div className="col-span-2 mt-1 p-2 bg-amber-50/40 border border-amber-200 rounded space-y-2">
                    <div className="text-[10px] font-semibold text-amber-700">关系深度演变数据</div>
                    {/* 关系演变曲线 */}
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">关系演变曲线</label>
                      {editMode ? (
                        <input
                          type="text"
                          value={rel.evolutionCurve || ''}
                          onChange={(e) => updateRel(rel.index, { evolutionCurve: e.target.value })}
                          placeholder="基于本作剧情发展：填写关系5阶段演变曲线（如：初遇戒备→共患难信任→生死相托→背叛决裂→真相和解）"
                          className="w-full px-2 py-1 text-xs bg-white border border-amber-200 rounded focus:border-amber-400 focus:outline-none"
                        />
                      ) : (
                        <p className="text-xs text-slate-700">{rel.evolutionCurve || '未设定'}</p>
                      )}
                    </div>
                    {/* 关系关键节点 */}
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">关系关键节点（转折事件）</label>
                      {editMode ? (
                        <textarea
                          value={rel.keyMoments || ''}
                          onChange={(e) => updateRel(rel.index, { keyMoments: e.target.value })}
                          onInput={autoResize}
                          rows={2}
                          placeholder="基于本作前序设定：列出关系发展的4个关键转折点（如：1.初遇场景+关系性质 2.合作事件+关系变化 3.冲突事件+关系转折 4.结局场景+关系定性）"
                          className="w-full px-2 py-1 text-xs bg-white border border-amber-200 rounded focus:border-amber-400 focus:outline-none resize-y"
                        />
                      ) : (
                        <p className="text-xs text-slate-700 whitespace-pre-wrap">{rel.keyMoments || '未设定'}</p>
                      )}
                    </div>
                    {/* 关系深层矛盾 */}
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">深层矛盾（表面vs本质）</label>
                      {editMode ? (
                        <input
                          type="text"
                          value={rel.deepConflict || ''}
                          onChange={(e) => updateRel(rel.index, { deepConflict: e.target.value })}
                          placeholder="基于本作核心冲突：填写表面矛盾↔本质矛盾的对照（参考灵感创作的coreConflict）"
                          className="w-full px-2 py-1 text-xs bg-white border border-amber-200 rounded focus:border-amber-400 focus:outline-none"
                        />
                      ) : (
                        <p className="text-xs text-slate-700">{rel.deepConflict || '未设定'}</p>
                      )}
                    </div>
                    {/* 关系对剧情推动 */}
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">剧情推动力</label>
                      {editMode ? (
                        <input
                          type="text"
                          value={rel.plotInfluence || ''}
                          onChange={(e) => updateRel(rel.index, { plotInfluence: e.target.value })}
                          placeholder="基于本作故事大纲：填写此关系对主角成长/剧情推进/高潮事件的具体作用"
                          className="w-full px-2 py-1 text-xs bg-white border border-amber-200 rounded focus:border-amber-400 focus:outline-none"
                        />
                      ) : (
                        <p className="text-xs text-slate-700">{rel.plotInfluence || '未设定'}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 图例说明 */}
      <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-200" /> 亲密关系
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-200" /> 盟友关系
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-200" /> 敌对关系
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-slate-200" /> 其他关系
        </div>
      </div>

      {/* 提示 */}
      {!selectedChar && (
        <div className="mt-4 text-center text-xs text-slate-400">
          💡 点击角色卡片查看详情
        </div>
      )}
    </div>
  )
}

// 保留旧的CharacterRelationshipCard用于其他可能的调用，但主要展示已替换为新的关系图
function CharacterRelationshipCard({ charName, charInfo, categorized, getRelCategory, updateRel, deleteRel }: {
  charName: string
  charInfo: { role: string; color: string; borderColor: string; bgColor: string; headerBg: string; textColor: string; lightBg: string; badgeBg: string; badgeText: string }
  categorized: Record<string, RelationshipItem[]>
  getRelCategory: (type: string) => { label: string; icon: string; catBg: string; catBorder: string; catText: string }
  updateRel: (index: number, updates: Partial<RelationshipItem>) => void
  deleteRel: (index: number) => void
}) {
  const [isExpanded, setIsExpanded] = useState(true)

  const autoResize = function(e: React.FormEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }

  const totalRels = Object.values(categorized).flat().length
  const categoryOrder = ['至亲至爱', '盟友下属', '对手仇敌', '泛交关系']

  return (
    <div className={`border ${charInfo.borderColor} rounded-xl overflow-hidden bg-stone-50 shadow-sm`}>
      {/* 卡片头部 - 可折叠 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full ${charInfo.headerBg} text-white px-4 py-3 flex items-center justify-between hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20`}>
            {charInfo.role}
          </span>
          <span className="text-lg font-bold">{charName}</span>
          <span className="text-sm opacity-80">({totalRels}条关系)</span>
        </div>
        <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <ChevronRight className="w-5 h-5" />
        </span>
      </button>

      {/* 卡片内容 */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {categoryOrder.map(catLabel => {
            const rels = categorized[catLabel]
            if (!rels || rels.length === 0) return null
            const catInfo = getRelCategory(rels[0].type || '')

            return (
              <div key={catLabel} className={`border ${catInfo.catBorder} rounded-lg overflow-hidden bg-white`}>
                {/* 分类标题 */}
                <div className={`${catInfo.catBg} px-3 py-2 flex items-center gap-2`}>
                  <span>{catInfo.icon}</span>
                  <span className={`text-sm font-semibold ${catInfo.catText}`}>{catLabel}</span>
                  <span className={`text-xs ${catInfo.catText} opacity-60`}>({rels.length})</span>
                </div>

                {/* 关系列表 - 卡片式样式 */}
                <div className="divide-y divide-stone-100">
                  {rels.map(rel => {
                    const isFrom = rel.from === charName
                    const otherName = isFrom ? rel.to : rel.from
                    const direction = isFrom ? '→' : '←'

                    // 获取关系描述、情感、技能、剧情影响等信息用于卡片展示
                    const relDesc = typeof rel.development === 'string' ? rel.development : (typeof rel.description === 'string' ? rel.description : '')
                    const relType = rel.type || rel.relationship || rel.relationType || '盟友'
                    const keyEventsRaw: unknown = rel.keyEvents
                    const keyEvents = keyEventsRaw ? (typeof keyEventsRaw === 'string' ? keyEventsRaw : Array.isArray(keyEventsRaw) ? keyEventsRaw.join('；') : '') : ''
                    const emotionChange = rel.emotionChange ? (typeof rel.emotionChange === 'string' ? rel.emotionChange : '') : ''
                    const impactOnPlot = rel.impactOnPlot || rel.impact || ''

                    return (
                      <div key={rel._index} className="p-4 space-y-3 hover:bg-stone-50 transition-colors">
                        {/* 关系头部：对方姓名 + 关系类型 + 删除 */}
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${charInfo.badgeBg} ${charInfo.badgeText}`}>
                            {charName}
                          </span>
                          <span className="text-stone-400 text-xs">{direction}</span>
                          <input
                            type="text"
                            value={otherName || ''}
                            onChange={(e) => {
                              if (isFrom) {
                                updateRel(rel._index, { to: e.target.value })
                              } else {
                                updateRel(rel._index, { from: e.target.value })
                              }
                            }}
                            className="flex-1 min-w-0 px-2 py-0.5 text-sm font-medium text-stone-800 bg-transparent border-b border-transparent hover:border-stone-300 focus:border-stone-400 focus:outline-none rounded"
                            placeholder="基于本作角色设定填写对方姓名..."
                          />
                          <select
                            value={relType}
                            onChange={(e) => updateRel(rel._index, { type: e.target.value })}
                            className="px-2 py-0.5 text-xs rounded-md border border-stone-200 bg-white text-stone-700 focus:ring-1 focus:ring-stone-400 focus:outline-none"
                          >
                            <option value="盟友">盟友</option>
                            <option value="敌对">敌对</option>
                            <option value="师徒">师徒</option>
                            <option value="朋友">朋友</option>
                            <option value="对手">对手</option>
                            <option value="亲属">亲属</option>
                            <option value="君臣">君臣</option>
                            <option value="上下级">上下级</option>
                            <option value="主仆">主仆</option>
                            <option value="从属">从属</option>
                            <option value="同乡">同乡</option>
                            <option value="同僚">同僚</option>
                            <option value="恋人">恋人</option>
                            <option value="仇敌">仇敌</option>
                            <option value="宿敌">宿敌</option>
                            <option value="情敌">情敌</option>
                            <option value="故交">故交</option>
                            <option value="同门">同门</option>
                            <option value="同族">同族</option>
                            <option value="恩人">恩人</option>
                            <option value="宿怨">宿怨</option>
                            <option value="合作">合作</option>
                            <option value="利用">利用</option>
                            <option value="仰慕">仰慕</option>
                            <option value="暗恋">暗恋</option>
                            <option value="青梅竹马">青梅竹马</option>
                            <option value="生死之交">生死之交</option>
                            <option value="莫逆之交">莫逆之交</option>
                            <option value="血海深仇">血海深仇</option>
                            <option value="势不两立">势不两立</option>
                            <option value="道侣">道侣</option>
                            <option value="未婚夫妻">未婚夫妻</option>
                            <option value="契约关系">契约关系</option>
                            <option value="追随">追随</option>
                            <option value="信仰">信仰</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => deleteRel(rel._index)}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="删除关系"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* 卡片行样式展示 - 模仿用户提供的样式 */}
                        <div className="bg-stone-100 rounded-lg p-3 space-y-2 text-sm font-mono">
                          {/* 关系描述行 */}
                          <div className="flex items-start gap-2">
                            <span className="font-bold text-stone-700 whitespace-nowrap min-w-[80px]">| 关系描述 |</span>
                            <textarea
                              value={relDesc}
                              onChange={(e) => updateRel(rel._index, { development: e.target.value, description: e.target.value })}
                              onInput={autoResize}
                              rows={2}
                              placeholder="基于本作角色设定填写关系发展过程、关键事件、情感变化..."
                              className="flex-1 px-2 py-1 text-sm text-stone-800 bg-white border border-stone-200 rounded focus:ring-1 focus:ring-stone-400 focus:outline-none"
                            />
                          </div>

                          {/* 关键事件行 */}
                          {keyEvents && (
                            <div className="flex items-start gap-2">
                              <span className="font-bold text-stone-700 whitespace-nowrap min-w-[80px]">| 关键事件 |</span>
                              <span className="text-stone-600 flex-1 text-xs mt-1">📌 {keyEvents}</span>
                            </div>
                          )}

                          {/* 情感轨迹行 */}
                          {emotionChange && (
                            <div className="flex items-start gap-2">
                              <span className="font-bold text-stone-700 whitespace-nowrap min-w-[80px]">| 情感轨迹 |</span>
                              <span className="text-stone-600 flex-1 text-xs mt-1">💫 {emotionChange}</span>
                            </div>
                          )}

                          {/* 剧情影响行 */}
                          {impactOnPlot && (
                            <div className="flex items-start gap-2">
                              <span className="font-bold text-stone-700 whitespace-nowrap min-w-[80px]">| 剧情影响 |</span>
                              <span className="text-stone-600 flex-1 text-xs mt-1">🎯 {impactOnPlot}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface StepRelationshipsProps {
  data: GeneratedData['relationships']
  characters: GeneratedData['characters']
  onChange: (updated: GeneratedData['relationships']) => void
  onRegenerate: (step: string, field?: string) => void
  onGenerate: () => void
  isLoading: boolean
  regeneratePrompt: string
  setRegeneratePrompt: (v: string) => void
  RegenButton: React.ComponentType<{ step: string; field?: string; label: string }>
  appendGraphInput: string
  setAppendGraphInput: (v: string) => void
  regeneratingField: string | null
  stepName: string
}

export default function StepRelationships({
  data, characters, onChange, onRegenerate, onGenerate, isLoading, regeneratePrompt, setRegeneratePrompt, RegenButton,
  appendGraphInput, setAppendGraphInput, regeneratingField, stepName,
}: StepRelationshipsProps) {
  const isWholeStepRegenerating = regeneratingField === stepName
  const _maintainedRels = useState<RelationshipItem[]>([])
  const maintainedRels = _maintainedRels[0]
  const setMaintainedRels = _maintainedRels[1]
  const _showRelDropdown = useState(false)
  const showRelDropdown = _showRelDropdown[0]
  const setShowRelDropdown = _showRelDropdown[1]
  const _relIdCounter = useRef(0)

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

  useEffect(function () {
    fetch('/tuzhong-wenshu/api/characters/relationships')
      .then(function (r) { return r.json() })
      .then(function (resp) {
        setMaintainedRels(resp.data ? (Object.values(resp.data).flat() as RelationshipItem[]) : [])
      })
      .catch(function () {})
  }, [])

  // 从维护的关系中选择并添加到当前图谱
  const handleSelectMaintainedRel = function (rel: RelationshipItem) {
    _relIdCounter.current = _relIdCounter.current + 1
    const newRelation = {
      id: 'rel-' + _relIdCounter.current,
      from: rel.from || '',
      to: rel.to || '',
      type: rel.type || '盟友',
      initialRelation: rel.initialRelation || '',
      development: rel.development || '',
      keyEvents: rel.keyEvents || '',
      emotionChange: rel.emotionChange || '',
      finalRelation: rel.finalRelation || '',
      description: rel.description || '',
      impactOnPlot: rel.impactOnPlot || rel.impact || '',
      // 圈层归属 & 矛盾体系字段（从维护关系导入，向后兼容兜底）
      circle: rel.circle || '',
      conflictType: rel.conflictType || '',
      intensity: rel.intensity || 1,
      developmentStage: rel.developmentStage || '',
      triggerCondition: rel.triggerCondition || '',
      asymmetry: rel.asymmetry || '',
      boundPlotNode: rel.boundPlotNode || '',
    }
    onChange({
      ...data,
      relationships: [...(data?.relationships || []), newRelation],
    })
    setShowRelDropdown(false)
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
          <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">人物关系图谱</h3>
            <p className="text-stone-500 text-sm">AI将为故事角色构建完整的关系网络</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
                placeholder={`输入你的需求，如：增加主角和反派的师徒关系...`}
                className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-stone-50"
              />
              <button
                type="button"
                onClick={onGenerate}
                disabled={isWholeStepRegenerating}
                className="whitespace-nowrap inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r wenshu-btn-primary rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isWholeStepRegenerating ? '生成中...' : '✨ 生成人物关系'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 检测关系数组是否为空（data存在但relationships为空数组）
  const relsList = Array.isArray(data?.relationships) ? data.relationships : []
  console.log('[StepRelationships] data:', data, 'relsList length:', relsList.length, 'first rel:', relsList.length > 0 ? JSON.stringify(relsList[0]) : 'empty')
  if (relsList.length > 0) {
    console.log('[StepRelationships] rel types:', relsList.map(function(r: RelationshipItem) { return r.type || r.relationship || 'UNDEFINED' }).join(', '))
  }
  // 检测是否所有关系的from/to或personA/personB均为空（AI返回了空名称）
  const hasValidNames = relsList.some(function(r: RelationshipItem) { return (r.from || r.to || r.personA || r.personB) })
  if ((relsList.length === 0 || !hasValidNames) && !isWholeStepRegenerating) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
          <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">人物关系图谱</h3>
            <p className="text-stone-500 text-sm">AI为故事角色构建了完整的关系网络（可直接编辑）</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
                placeholder={`输入你的需求，如：增加主角和反派的师徒关系...`}
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
        <div className="text-center py-4 text-amber-600 text-sm">
          <p>⚠️ 人物关系数据为空，请点击上方按钮重新生成</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">人物关系图谱</h3>
          <p className="text-stone-500 text-sm max-w-2xl mx-auto">AI为故事角色构建了完整的关系网络（可直接编辑）</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={regeneratePrompt}
              onChange={(e) => setRegeneratePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
              placeholder={`输入你的需求，如：增加主角和反派的师徒关系...`}
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

      {/* 四大圈层架构 */}
      <div className="bg-gradient-to-r from-stone-50 via-stone-50 to-stone-50 rounded-2xl p-6 border border-stone-200">
        <h4 className="text-lg font-bold text-stone-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">🎯</span> 人物关系核心架构（四大圈层）
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 核心圈层 */}
          <div className="bg-white rounded-xl p-4 border-2 border-red-300 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <h5 className="font-bold text-red-700 text-sm">核心圈层</h5>
              <span className="text-xs text-red-400">绑定主角全程剧情</span>
            </div>
            <p className="text-xs text-stone-600 mb-2">CP/挚爱、生死兄弟、授业恩师、贴身追随者</p>
            <div className="space-y-1 text-xs text-stone-500">
              <p className="flex items-start gap-1"><span className="text-red-400 mt-0.5">•</span> 利益绑定、生死相依、知晓主角秘密</p>
              <p className="flex items-start gap-1"><span className="text-red-400 mt-0.5">•</span> 参与核心主线、伴随主角成长至终局</p>
              <p className="flex items-start gap-1"><span className="text-red-400 mt-0.5">•</span> 主角后盾、情感软肋、团战战力</p>
            </div>
          </div>

          {/* 主力圈层 */}
          <div className="bg-white rounded-xl p-4 border-2 border-stone-300 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 bg-stone-400 rounded-full" />
              <h5 className="font-bold text-stone-700 text-sm">主力圈层</h5>
              <span className="text-xs text-stone-400">中期核心助力/阻力</span>
            </div>
            <p className="text-xs text-stone-600 mb-2">宗门同门、势力盟友、敌对天才、中层对手</p>
            <div className="space-y-1 text-xs text-stone-500">
              <p className="flex items-start gap-1"><span className="text-stone-400 mt-0.5">•</span> 阶段性同行、利益合作、亦敌亦友</p>
              <p className="flex items-start gap-1"><span className="text-stone-400 mt-0.5">•</span> 制造中期冲突、资源互换、势力博弈</p>
              <p className="flex items-start gap-1"><span className="text-stone-400 mt-0.5">•</span> 打脸升级对象、有明确立场</p>
            </div>
          </div>

          {/* 外围圈层 */}
          <div className="bg-white rounded-xl p-4 border-2 border-green-300 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 bg-green-500 rounded-full" />
              <h5 className="font-bold text-green-700 text-sm">外围圈层</h5>
              <span className="text-xs text-green-400">前期工具人+长线伏笔</span>
            </div>
            <p className="text-xs text-stone-600 mb-2">家族长辈、街坊邻里、普通同门、底层小反派</p>
            <div className="space-y-1 text-xs text-stone-500">
              <p className="flex items-start gap-1"><span className="text-green-400 mt-0.5">•</span> 短期出场、推动开局剧情</p>
              <p className="flex items-start gap-1"><span className="text-green-400 mt-0.5">•</span> 铺垫世界观、无长期绑定</p>
              <p className="flex items-start gap-1"><span className="text-green-400 mt-0.5">•</span> 新手村冲突、衬托主角人设</p>
            </div>
          </div>

          {/* 宿命圈层 */}
          <div className="bg-white rounded-xl p-4 border-2 border-stone-300 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 bg-stone-400 rounded-full" />
              <h5 className="font-bold text-stone-800 text-sm">宿命圈层</h5>
              <span className="text-xs text-stone-400">终极伏笔·大结局关键</span>
            </div>
            <p className="text-xs text-stone-600 mb-2">上古先祖、前世羁绊、幕后黑手、天道棋子</p>
            <div className="space-y-1 text-xs text-stone-500">
              <p className="flex items-start gap-1"><span className="text-stone-400 mt-0.5">•</span> 前期隐匿、只留线索、掌控世界秘密</p>
              <p className="flex items-start gap-1"><span className="text-stone-400 mt-0.5">•</span> 与主角身世深度绑定</p>
              <p className="flex items-start gap-1"><span className="text-stone-400 mt-0.5">•</span> 支撑终极剧情、主线反转</p>
            </div>
          </div>
        </div>
      </div>

      {/* 核心人物双向关系明细 */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm">
        <h4 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2">
          <span className="text-2xl">📋</span> 核心人物双向关系明细（可直接编辑）
        </h4>

        {/* 操作区域：增量追加/导入/添加关系 */}
        <div className="mb-6 p-4 bg-stone-50/80 rounded-xl border border-stone-100">
          {/* 增量追加输入框 */}
          <div className="max-w-2xl mx-auto mb-3">
            <label className="block text-sm font-medium text-stone-500 mb-2 text-left">增量追加人物关系（粘贴新增角色/势力文案，原有图谱保留不动）</label>
            <textarea
              value={appendGraphInput}
              onChange={function (e) { setAppendGraphInput(e.target.value) }}
              onInput={autoResize}
              placeholder="输入新增角色或势力信息，系统自动并入现有图谱..."
              rows={2}
              className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-white resize-y"
            />
            <div className="flex justify-end mt-2 gap-2">
              {appendGraphInput && (
                <button
                  type="button"
                  onClick={function () { setAppendGraphInput('') }}
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
                {isLoading ? '⏳ 生成中...' : (appendGraphInput ? '✨ 增量合并图谱' : '✨ 生成人物关系')}
              </button>
            </div>
          </div>

          {/* 导入/添加按钮 */}
          <div className="flex justify-end gap-2">
            {/* 从后台维护的关系中选择 */}
            <div className="relative">
              <button
                type="button"
                onClick={function () { setShowRelDropdown(!showRelDropdown) }}
                className="px-3 py-1.5 bg-stone-700 text-white rounded-lg text-sm flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> 从维护关系导入
              </button>
              {showRelDropdown && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-stone-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                  <div className="p-2 border-b border-stone-100 text-xs text-stone-500">选择已维护的人物关系导入到当前图谱</div>
                  {maintainedRels.length > 0 ? maintainedRels.map(function (rel: RelationshipItem) {
                    return (
                      <button
                        key={rel.id}
                        type="button"
                        onClick={function () { handleSelectMaintainedRel(rel) }}
                        className="w-full px-3 py-2 text-left hover:bg-stone-50 border-b border-stone-50 last:border-b-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-stone-800">{rel.from}</span>
                          <span className="px-1.5 py-0.5 bg-stone-100 text-stone-800 text-xs rounded-full">{rel.type}</span>
                          <span className="text-sm font-medium text-stone-800">{rel.to}</span>
                        </div>
                        {rel.description && <p className="text-xs text-stone-500 mt-0.5 truncate">{rel.description}</p>}
                      </button>
                    )
                  }) : (
                    <div className="p-4 text-center text-sm text-stone-400">暂无维护的关系数据，请在设定中心→人物关系中添加</div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                const newRelation = {
                  id: `rel-${Date.now()}`,
                  from: characters?.protagonist?.name || '',
                  to: '',
                  type: '',
                  initialRelation: '',
                  development: '',
                  keyEvents: '',
                  emotionChange: '',
                  finalRelation: '',
                  description: '',
                  impactOnPlot: '',
                  // 圈层归属 & 矛盾体系字段（新增，默认空/1）
                  circle: '',
                  conflictType: '',
                  intensity: 1,
                  developmentStage: '',
                  triggerCondition: '',
                  asymmetry: '',
                  boundPlotNode: '',
                }
                onChange({
                  ...data,
                  relationships: [...(data?.relationships || []), newRelation],
                })
              }}
              className="px-3 py-1.5 bg-stone-800 text-white rounded-lg text-sm"
            >
              + 添加关系
            </button>
          </div>
        </div>

        {/* 可视化关系图 */}
        {relsList.length > 0 && (
          <div>
            <RelationshipGraph 
              relationships={relsList} 
              characters={characters} 
              onChange={(newRels) => {
                onChange({
                  ...data,
                  relationships: newRels as NonNullable<NonNullable<GeneratedData['relationships']>['relationships']>
                })
              }}
            />
          </div>
        )}
      </div>

      {/* 人物关系矛盾体系 */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm">
        <h4 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2">
          <span className="text-2xl">⚡</span> 人物关系矛盾体系（持续制造剧情冲突）
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
            <h5 className="font-bold text-red-700 text-sm mb-2">固定矛盾（贯穿全文）</h5>
            <p className="text-xs text-stone-600">主角与终极反派的宿命对立、主角阵营与敌对阵营的利益厮杀</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
            <h5 className="font-bold text-yellow-700 text-sm mb-2">动态矛盾（阶段性更新）</h5>
            <p className="text-xs text-stone-600">盟友间的理念分歧、CP间的误会隔阂、中立势力的倒戈摇摆</p>
          </div>
          <div className="bg-stone-50 rounded-xl p-4 border border-stone-200">
            <h5 className="font-bold text-stone-800 text-sm mb-2">隐性矛盾（反转伏笔）</h5>
            <p className="text-xs text-stone-600">看似忠臣实则卧底、看似仇敌实则守护者、亲人暗藏私心、盟友背负秘密使命</p>
          </div>
        </div>
      </div>

      {/* 人物关系成长&演变轨迹 */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm">
        <h4 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2">
          <span className="text-2xl">📈</span> 人物关系成长&演变轨迹（杜绝人设僵硬）
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-xl p-4 border border-green-200">
            <h5 className="font-bold text-green-700 text-sm mb-2">正向演变</h5>
            <div className="space-y-1 text-xs text-stone-600">
              <p className="flex items-center gap-1"><span className="text-green-500">↗</span> 冷漠疏离→全心信任</p>
              <p className="flex items-center gap-1"><span className="text-green-500">↗</span> 针锋相对→并肩同行</p>
              <p className="flex items-center gap-1"><span className="text-green-500">↗</span> 互相利用→生死相守</p>
            </div>
          </div>
          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
            <h5 className="font-bold text-red-700 text-sm mb-2">反向演变</h5>
            <div className="space-y-1 text-xs text-stone-600">
              <p className="flex items-center gap-1"><span className="text-red-500">↘</span> 亲密无间→渐行渐远</p>
              <p className="flex items-center gap-1"><span className="text-red-500">↘</span> 忠心追随→背叛反目</p>
              <p className="flex items-center gap-1"><span className="text-red-500">↘</span> 善意帮扶→暗藏算计</p>
            </div>
          </div>
          <div className="bg-stone-50 rounded-xl p-4 border border-stone-200">
            <h5 className="font-bold text-stone-700 text-sm mb-2">波动演变（最适配网文高热度）</h5>
            <div className="space-y-1 text-xs text-stone-600">
              <p className="flex items-center gap-1"><span className="text-stone-400">↔</span> 亦敌亦友、分分合合</p>
              <p className="flex items-center gap-1"><span className="text-stone-400">↔</span> 对立制衡、双向拉扯</p>
            </div>
          </div>
        </div>
      </div>

      {/* 人物关系禁忌规则 */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-200">
        <h4 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2">
          <span className="text-2xl">⚠️</span> 人物关系禁忌规则（防崩人设、防逻辑bug）
        </h4>
        <div className="space-y-2">
          <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-amber-100">
            <span className="flex-shrink-0 w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
            <p className="text-sm text-stone-700">所有人物的爱恨、站队、背叛、付出必有合理动机，杜绝无脑黑、无脑舔、莫名反水</p>
          </div>
          <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-amber-100">
            <span className="flex-shrink-0 w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
            <p className="text-sm text-stone-700">核心圈层人物关系不随意崩塌，反转必须有前期伏笔铺垫</p>
          </div>
          <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-amber-100">
            <span className="flex-shrink-0 w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
            <p className="text-sm text-stone-700">主角的羁绊关系服务剧情，不强行开后宫、不强行孤身一人</p>
          </div>
          <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-amber-100">
            <span className="flex-shrink-0 w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
            <p className="text-sm text-stone-700">反派的针对、盟友的相助、CP的偏爱均有根源，无突兀剧情</p>
          </div>
          <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-amber-100">
            <span className="flex-shrink-0 w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold">5</span>
            <p className="text-sm text-stone-700">人物关系随主角实力、格局、身世解锁同步升级，全程贴合剧情节奏</p>
          </div>
        </div>
      </div>

      {/* 核心人物双向关系明细区域的结束标签已在上文关闭 */}
    </div>
  )
}
