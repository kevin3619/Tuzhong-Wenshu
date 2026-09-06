'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { extractText } from '@/lib/text-utils'
import type { GeneratedData } from '../ai-generate-wizard'

type FactionItem = NonNullable<NonNullable<GeneratedData['factions']>['factions']>[number]

interface StepFactionsProps {
  data: GeneratedData['factions']
  onChange: (updated: GeneratedData['factions']) => void
  onRegenerate: (step: string, field?: string) => void
  onGenerate: () => void
  isLoading: boolean
  regeneratePrompt: string
  setRegeneratePrompt: (v: string) => void
  RegenButton: React.ComponentType<{ step: string; field?: string; label: string }>
  regeneratingField: string | null
  stepName: string
  // 🔥 一键校正势力需要题材判断（历史题材才清洗修仙模板词）
  genre?: string
  keywords?: string
}

export default function StepFactions({
  data, onChange, onRegenerate, onGenerate, isLoading, regeneratePrompt, setRegeneratePrompt, RegenButton, regeneratingField, stepName, genre, keywords,
}: StepFactionsProps) {
  const isWholeStepRegenerating = regeneratingField === stepName

  // 🔥 一键校正势力：合并分批生成造成的同势力重复条目、对齐关系引用、补全空字段
  const [normalizing, setNormalizing] = useState(false)
  const [normalizeMsg, setNormalizeMsg] = useState('')
  const handleNormalize = async function () {
    if (normalizing || !data?.factions?.length) return
    setNormalizing(true)
    setNormalizeMsg('')
    try {
      const res = await fetch('/tuzhong-wenshu/api/factions/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (typeof localStorage !== 'undefined' ? (localStorage.getItem('token') || '') : '') },
        body: JSON.stringify({ factions: data.factions, genre: genre || '', keywords: keywords || '' }),
      })
      const json = await res.json()
      if (!res.ok || !json || json.success !== true || !json.data || !Array.isArray(json.data.factions)) {
        setNormalizeMsg('⚠️ 校正失败：' + ((json && json.message) || '接口异常'))
        return
      }
      onChange({ ...data, factions: json.data.factions })
      const rep = json.data.report || {}
      const mergedN = (rep.merged || []).length
      setNormalizeMsg('✅ ' + (json.data.summary || '已校正') + (mergedN ? '（' + rep.before + ' → ' + rep.after + ' 个势力）' : ''))
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
  // 数组字段解析：逗号/顿号分隔字符串 → 数组（用于内部派系/核心资源/招牌人物/友方/敌方）
  const _parseArrayField = function(text: string): string[] {
    if (!text) return []
    return text.split(/[，,、；;]/).map(function(s) { return s.trim() }).filter(function(s) { return s.length > 0 })
  }
  // 统一更新势力某字段
  const _updateFactionField = function(index: number, field: string, value: unknown) {
    const newFactions = [...(data?.factions || [])]
    newFactions[index] = { ...(newFactions[index] || {}), [field]: value }
    onChange({ ...data, factions: newFactions })
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

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
          <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">势力设定</h3>
            <p className="text-stone-500 text-sm">AI为你的故事设计了完整的势力格局（可直接编辑）</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
                placeholder="输入你的需求，如：增加一个隐藏势力..."
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
      </div>
    )
  }

  const factionsList = Array.isArray(data?.factions) ? data.factions : []

  if (factionsList.length === 0 && !isWholeStepRegenerating) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
          <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">势力设定</h3>
            <p className="text-stone-500 text-sm">AI为你的故事设计了完整的势力格局（可直接编辑）</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
                placeholder="输入你的需求，如：增加一个隐藏势力..."
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
        <div className="text-center py-4">
          <p className="text-amber-600 text-sm">⚠️ 势力数据为空，请点击上方按钮重新生成</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">势力设定</h3>
          <p className="text-stone-500 text-sm">AI为你的故事设计了完整的势力格局（可直接编辑）</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={regeneratePrompt}
              onChange={(e) => setRegeneratePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
              placeholder="输入你的需求，如：增加一个隐藏势力，让势力关系更复杂..."
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
          {/* 🔥 一键校正势力：合并重复势力、对齐关系引用、补全空字段 */}
          <div className="flex items-center justify-center gap-3 mt-3">
            <button
              type="button"
              onClick={handleNormalize}
              disabled={normalizing || isWholeStepRegenerating || !(data?.factions?.length)}
              title="合并分批生成造成的同势力重复条目（如某集团、某集团（安龙）、某集团（流亡）并存），阶段差异并入发展轨迹；同时把友方/敌方引用对齐到真实势力名、补全单边关系与空字段"
              className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-stone-800 border border-stone-300 bg-white hover:bg-stone-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {normalizing ? '⏳ 校正中...' : '🔧 一键校正重复势力与空字段'}
            </button>
            {normalizeMsg && <span className="text-xs text-stone-500">{normalizeMsg}</span>}
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => {
            const newFaction = {
              id: `faction-${Date.now()}`,
              name: '',
              type: '',
              strength: '',
              leader: '',
              description: '',
              territory: '',
              // 深度字段（向后兼容：旧数据无这些字段时以 || 兜底）
              philosophy: '',
              internalFactions: [],
              coreResources: [],
              allies: [],
              enemies: [],
              historyGrudges: '',
              hiddenAgenda: '',
              powerRank: '',
              flagshipFigures: [],
              culture: '',
              relationToProtagonist: '',
              symbol: '',
              // 新增四个深度字段
              strengthTier: '',
              trumpCard: '',
              coreConflict: '',
              developmentTrajectory: '',
            }
            onChange({
              ...data,
              factions: [...(data?.factions || []), newFaction],
            })
          }}
          className="px-3 py-1.5 bg-stone-800 text-white rounded-lg text-sm"
        >
          + 添加势力
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {factionsList.map((faction: FactionItem, index: number) => (
          <div key={faction.id || index} className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 mb-2">
              <input
                type="text"
                value={faction.type || faction.camp || ''}
                onChange={(e) => {
                  const newFactions = [...(data?.factions || [])]
                  newFactions[index] = { ...faction, type: e.target.value, camp: e.target.value }
                  onChange({ ...data, factions: newFactions })
                }}
                className={`w-20 px-2 py-1 text-xs rounded-full text-center focus:ring-2 focus:ring-amber-500 focus:border-transparent ${
                  (faction.camp || faction.type || '') === '己方' ? 'bg-stone-100 text-stone-700' :
                  (faction.camp || faction.type || '') === '友方' ? 'bg-green-100 text-green-700' :
                  (faction.camp || faction.type || '') === '敌方' ? 'bg-red-100 text-red-700' :
                  (faction.camp || faction.type || '') === '亦敌亦友' ? 'bg-stone-100 text-stone-800' :
                  'bg-amber-100 text-amber-700'
                }`}
              />
              <input
                type="text"
                value={faction.name || ''}
                onChange={(e) => {
                  const newFactions = [...(data?.factions || [])]
                  newFactions[index] = { ...faction, name: e.target.value }
                  onChange({ ...data, factions: newFactions })
                }}
                className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded font-bold text-stone-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => {
                  if (confirm('确定要删除这个势力吗？')) {
                    onChange({
                      ...data,
                      factions: data?.factions?.filter((_, i: number) => i !== index),
                    })
                  }
                }}
                className="text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-stone-500">实力：</span>
                <input
                  type="text"
                  value={faction.strength || ''}
                  onChange={(e) => {
                    const newFactions = [...(data?.factions || [])]
                    newFactions[index] = { ...faction, strength: e.target.value }
                    onChange({ ...data, factions: newFactions })
                  }}
                  className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <span className="text-stone-500">首领：</span>
                <input
                  type="text"
                  value={faction.leader || ''}
                  onChange={(e) => {
                    const newFactions = [...(data?.factions || [])]
                    newFactions[index] = { ...faction, leader: e.target.value }
                    onChange({ ...data, factions: newFactions })
                  }}
                  className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <span className="text-stone-500">领地：</span>
                <input
                  type="text"
                  value={faction.territory || ''}
                  onChange={(e) => {
                    const newFactions = [...(data?.factions || [])]
                    newFactions[index] = { ...faction, territory: e.target.value }
                    onChange({ ...data, factions: newFactions })
                  }}
                  className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <span className="text-stone-500 block mb-1">描述：</span>
                <textarea
                  value={typeof faction.description === 'string' ? faction.description : extractText(faction.description)}
                  onChange={(e) => {
                    const newFactions = [...(data?.factions || [])]
                    newFactions[index] = { ...faction, description: e.target.value }
                    onChange({ ...data, factions: newFactions })
                  }}
                  onInput={autoResize}
                  rows={2}
                  className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* ============ 势力深度字段 ============ */}
            <div className="border-t border-dashed border-stone-200 pt-3 mt-3 space-y-3">
              {/* —— 理念与定位 —— */}
              <div className="space-y-2 text-sm">
                <div className="text-xs font-semibold text-stone-800 bg-stone-50 px-2 py-0.5 rounded inline-block">理念与定位</div>
                <div>
                  <span className="text-stone-500 block mb-1">势力理念/宗旨：</span>
                  <textarea
                    value={faction.philosophy || ''}
                    onChange={function(e) { _updateFactionField(index, 'philosophy', e.target.value) }}
                    onInput={autoResize}
                    rows={2}
                    placeholder="本势力追求的核心目标与信念"
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-stone-500 block mb-1">势力级别：</span>
                    <select
                      value={faction.powerRank || ''}
                      onChange={function(e) { _updateFactionField(index, 'powerRank', e.target.value) }}
                      className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    >
                      <option value="">请选择</option>
                      <option value="传说势力">传说势力</option>
                      <option value="超级势力">超级势力</option>
                      <option value="一流势力">一流势力</option>
                      <option value="二流势力">二流势力</option>
                      <option value="三流势力">三流势力</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-stone-500 block mb-1">旗帜/标识：</span>
                    <input
                      type="text"
                      value={faction.symbol || ''}
                      onChange={function(e) { _updateFactionField(index, 'symbol', e.target.value) }}
                      placeholder="本势力的旗帜/标识/纹章"
                      className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-stone-500 block mb-1">势力文化/风气：</span>
                  <input
                    type="text"
                    value={faction.culture || ''}
                    onChange={function(e) { _updateFactionField(index, 'culture', e.target.value) }}
                    placeholder="本势力崇尚的价值观/文化特征"
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* —— 内部结构 —— */}
              <div className="space-y-2 text-sm">
                <div className="text-xs font-semibold text-stone-700 bg-stone-50 px-2 py-0.5 rounded inline-block">内部结构</div>
                <div>
                  <span className="text-stone-500 block mb-1">内部派系（逗号分隔）：</span>
                  <input
                    type="text"
                    value={(Array.isArray(faction.internalFactions) ? faction.internalFactions : []).join('，')}
                    onChange={function(e) { _updateFactionField(index, 'internalFactions', _parseArrayField(e.target.value)) }}
                    placeholder="内部派系名称+主张"
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <span className="text-stone-500 block mb-1">核心资源/经济基础（逗号分隔）：</span>
                  <input
                    type="text"
                    value={(Array.isArray(faction.coreResources) ? faction.coreResources : []).join('，')}
                    onChange={function(e) { _updateFactionField(index, 'coreResources', _parseArrayField(e.target.value)) }}
                    placeholder="掌控的核心资源/经济基础"
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <span className="text-stone-500 block mb-1">招牌人物/战力天花板（逗号分隔）：</span>
                  <input
                    type="text"
                    value={(Array.isArray(faction.flagshipFigures) ? faction.flagshipFigures : []).join('，')}
                    onChange={function(e) { _updateFactionField(index, 'flagshipFigures', _parseArrayField(e.target.value)) }}
                    placeholder="招牌人物+职位/能力"
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* —— 外交关系 —— */}
              <div className="space-y-2 text-sm">
                <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded inline-block">外交关系</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-stone-500 block mb-1">友方势力（逗号分隔）：</span>
                    <input
                      type="text"
                      value={(Array.isArray(faction.allies) ? faction.allies : []).join('，')}
                      onChange={function(e) { _updateFactionField(index, 'allies', _parseArrayField(e.target.value)) }}
                      placeholder="结盟的势力名"
                      className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <span className="text-stone-500 block mb-1">敌方势力（逗号分隔）：</span>
                    <input
                      type="text"
                      value={(Array.isArray(faction.enemies) ? faction.enemies : []).join('，')}
                      onChange={function(e) { _updateFactionField(index, 'enemies', _parseArrayField(e.target.value)) }}
                      placeholder="敌对的势力名"
                      className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-stone-500 block mb-1">历史恩怨：</span>
                  <textarea
                    value={faction.historyGrudges || ''}
                    onChange={function(e) { _updateFactionField(index, 'historyGrudges', e.target.value) }}
                    onInput={autoResize}
                    rows={2}
                    placeholder="与其他势力的历史恩怨"
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* —— 故事钩子 —— */}
              <div className="space-y-2 text-sm">
                <div className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded inline-block">故事钩子</div>
                <div>
                  <span className="text-stone-500 block mb-1">隐藏目的：</span>
                  <textarea
                    value={faction.hiddenAgenda || ''}
                    onChange={function(e) { _updateFactionField(index, 'hiddenAgenda', e.target.value) }}
                    onInput={autoResize}
                    rows={2}
                    placeholder="暗中追求的真实目的"
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <span className="text-stone-500 block mb-1">与主角关系演变：</span>
                  <input
                    type="text"
                    value={faction.relationToProtagonist || ''}
                    onChange={function(e) { _updateFactionField(index, 'relationToProtagonist', e.target.value) }}
                    placeholder="与主角的关系演变"
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* —— 实力梯度与底牌 —— */}
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-stone-500 block mb-1">实力梯度：</span>
                    <select
                      value={faction.strengthTier || ''}
                      onChange={function(e) { _updateFactionField(index, 'strengthTier', e.target.value) }}
                      className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    >
                      <option value="">选择梯度</option>
                      <option value="SSS">SSS（灭世级）</option>
                      <option value="SS">SS（超一流）</option>
                      <option value="S">S（一流）</option>
                      <option value="A">A（二流）</option>
                      <option value="B">B（三流）</option>
                      <option value="C">C（四流）</option>
                      <option value="D">D（微型）</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-stone-500 block mb-1">势力底牌/杀手锏：</span>
                    <input
                      type="text"
                      value={faction.trumpCard || ''}
                      onChange={function(e) { _updateFactionField(index, 'trumpCard', e.target.value) }}
                      placeholder="本势力的杀手锏/底牌"
                      className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-stone-500 block mb-1">核心利益冲突（驱动剧情）：</span>
                  <textarea
                    value={faction.coreConflict || ''}
                    onChange={function(e) { _updateFactionField(index, 'coreConflict', e.target.value) }}
                    onInput={autoResize}
                    rows={2}
                    placeholder="与其他势力的核心利益冲突"
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <span className="text-stone-500 block mb-1">势力发展轨迹（兴衰曲线）：</span>
                  <textarea
                    value={faction.developmentTrajectory || ''}
                    onChange={function(e) { _updateFactionField(index, 'developmentTrajectory', e.target.value) }}
                    onInput={autoResize}
                    rows={2}
                    placeholder="本势力的兴衰轨迹"
                    className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
            {/* ============ 势力深度字段 END ============ */}
          </div>
        ))}
      </div>
    </div>
  )
}
