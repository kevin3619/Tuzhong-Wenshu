'use client'

import { useEffect } from 'react'
import { extractText } from '@/lib/text-utils'
import type { GeneratedData } from '../ai-generate-wizard'
import { autoResize } from '@/hooks/useAutoResize'

type OutlineDynamicItem = {
  [key: string]: string | string[] | number | undefined
}

interface StepOutlineProps {
  data: GeneratedData['outline']
  onChange: (updated: GeneratedData['outline']) => void
  onRegenerate: (step: string, field?: string) => void
  onGenerate: () => void
  isLoading: boolean
  regeneratePrompt: string
  setRegeneratePrompt: (v: string) => void
  RegenButton: React.ComponentType<{ step: string; field?: string; label: string }>
  regeneratingField: string | null
  stepName: string
}

export default function StepOutline({
  data, onChange, onRegenerate, onGenerate, isLoading, regeneratePrompt, setRegeneratePrompt, RegenButton, regeneratingField, stepName,
}: StepOutlineProps) {
  const isWholeStepRegenerating = regeneratingField === stepName
  // 🔥 图1：仅"有等级战力需求"的题材（修仙/洪荒/西幻/科幻等）显示"战力等级"字段；朝堂/历史等官阶体系隐藏
  const _showPowerLevel = (function () {
    var _wbPsRaw: any = (data as any)?.worldBuilding?.powerSystem
    var _wbPs = typeof _wbPsRaw === 'string' ? _wbPsRaw : JSON.stringify(_wbPsRaw || '')
    var _plvText = ((data?.stages || []).map(function (s: any) { return String(s?.powerLevel || '') }).join(' '))
    var _hay = _wbPs + ' ' + _plvText
    var _isCourt = /朝堂|官职|官阶|品|皇权|科举|门阀|胥吏|文官|武将|九品|帝|皇|将相|尚书|知县|总兵/.test(_hay)
    var _isLevelBased = /境|期|重|转|劫|斗气|魔法|炼气|筑基|金丹|元婴|仙人|洪荒|巫|妖|神境|基因|异能|段位|等级/.test(_hay)
    if (!_wbPs.trim() && !_plvText.trim()) return true
    return _isLevelBased && !_isCourt
  })()

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
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">整体故事大纲</h3>
            <p className="text-stone-500 text-sm">AI构建了完整的故事框架（可直接编辑）</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
                placeholder="输入你的需求，如：增加一条复仇线..."
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

  // 检测核心数据是否为空（data存在但关键字段为空数组/空字符串）
  const stagesList = Array.isArray(data?.stages) ? data.stages : []
  const mainPlotList = Array.isArray(data?.mainPlot) ? data.mainPlot : []
  const hasContent = stagesList.length > 0 || mainPlotList.length > 0 || (data?.storyOrigin && data.storyOrigin.length > 10)

  if (!hasContent && !isWholeStepRegenerating) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
          <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">整体故事大纲</h3>
            <p className="text-stone-500 text-sm">AI构建了完整的故事框架（可直接编辑）</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
                placeholder="输入你的需求，如：增加一条复仇线..."
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
          <p className="text-amber-600 text-sm">⚠️ 故事大纲数据为空，请点击上方按钮重新生成</p>
        </div>
      </div>
    )
  }

  // 主题与节奏字段：主题思想、伏笔回收映射、多线叙事结构、节奏曲线、主角成长曲线、冲突层次、多势力战力同步、反派成长曲线、关键道具谱系
  const depthFields = ['theme', 'narrativeLines', 'foreshadowingMap', 'rhythmCurve', 'protagonistGrowthCurve', 'conflictLayers', 'triRacePowerLevels', 'antagonistGrowthCurve', 'keyArtifacts']

  // 通用：更新主题与节奏字段（顶层标量或数组整体替换）
  const handleDepthFieldChange = function(field: string, value: unknown) {
    onChange({ ...data, [field]: value })
  }

  // 通用：更新列表中某一项的某个字段
  const handleDepthListItemChange = function(field: string, index: number, key: string, value: unknown) {
    const newList = [...(data?.[field] || [])]
    newList[index] = { ...newList[index], [key]: value }
    onChange({ ...data, [field]: newList })
  }

  // 通用：向列表添加一项
  const handleDepthListItemAdd = function(field: string, newItem: Record<string, unknown>) {
    const newList = [...(data?.[field] || []), newItem]
    onChange({ ...data, [field]: newList })
  }

  // 通用：从列表删除一项
  const handleDepthListItemRemove = function(field: string, index: number) {
    const newList = [...(data?.[field] || [])]
    newList.splice(index, 1)
    onChange({ ...data, [field]: newList })
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">整体故事大纲</h3>
          <p className="text-stone-500 text-sm">AI构建了完整的故事框架（可直接编辑）</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={regeneratePrompt}
              onChange={(e) => setRegeneratePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRegenerate('outline')}
              placeholder="输入你的需求，如：增加一条复仇线，加入更多反转..."
              className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-stone-50"
            />
            <button
              type="button"
              onClick={() => onRegenerate('outline')}
              disabled={isLoading}
              className="whitespace-nowrap inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r wenshu-btn-primary rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '生成中...' : '🔄 重新生成'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">故事起源 <RegenButton step={stepName} field="storyOrigin" label="故事起源" /></h4>
          <textarea
            value={data?.storyOrigin || ''}
            onChange={(e) => onChange({ ...data, storyOrigin: e.target.value })}
            onInput={autoResize}
            rows={6}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700 resize-y min-h-[120px]"
          />
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">主线剧情 <RegenButton step={stepName} field="mainPlot" label="主线剧情" /></h4>
          <ul className="space-y-2">
            {(data?.mainPlot || []).map((plot: string, index: number) => (
              <li key={index} className="flex items-start space-x-3">
                <span className="w-6 h-6 bg-stone-100 text-stone-700 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                  {index + 1}
                </span>
                <textarea
                  value={plot}
                  onChange={(e) => {
                    const newPlot = [...(data?.mainPlot || [])]
                    newPlot[index] = e.target.value
                    onChange({ ...data, mainPlot: newPlot })
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
          <h4 className="font-semibold text-stone-900 mb-3">故事阶段 <RegenButton step={stepName} field="stages" label="故事阶段" /></h4>
          <div className="space-y-4">
            {(data?.stages || []).map((stage, index: number) => (
              <div key={index} className="bg-stone-50 rounded-lg p-3 space-y-3 border border-stone-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-7 h-7 bg-stone-100 text-stone-800 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    value={stage.name || ''}
                    onChange={(e) => {
                      const newStages = [...(data?.stages || [])]
                      newStages[index] = { ...stage, name: e.target.value }
                      onChange({ ...data, stages: newStages })
                    }}
                    className="w-32 px-2 py-1 bg-white border border-stone-200 rounded font-medium text-stone-900 focus:ring-2 focus:ring-stone-400 focus:border-transparent shrink-0"
                  />
                  {_showPowerLevel && (<>
                  <span className="text-xs text-stone-400 whitespace-nowrap shrink-0">战力等级</span>
                  <input
                    type="text"
                    value={stage.powerLevel || ''}
                    onChange={(e) => {
                      const newStages = [...(data?.stages || [])]
                      newStages[index] = { ...stage, powerLevel: e.target.value }
                      onChange({ ...data, stages: newStages })
                    }}
                    className="flex-1 min-w-[280px] px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                  />
                  </>)}
                </div>
                <textarea
                  value={stage.summary || ''}
                  onChange={(e) => {
                    const newStages = [...(data?.stages || [])]
                    newStages[index] = { ...stage, summary: e.target.value }
                    onChange({ ...data, stages: newStages })
                  }}
                  onInput={autoResize}
                  rows={2}
                  className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 resize-y focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                />
                <div>
                  <label className="text-xs font-medium text-stone-400">主要事件</label>
                  <ul className="mt-1 space-y-1">
                    {(stage.mainEvents && stage.mainEvents.length > 0 ? stage.mainEvents : ['暂无']).map((evt: string, ei: number) => (
                      <li key={ei} className="flex items-start gap-2">
                        <span className="text-stone-300 mt-0.5">•</span>
                        <input
                          type="text"
                          value={evt}
                          onChange={(e) => {
                            const newStages = [...(data?.stages || [])]
                            const newEvents = [...(stage.mainEvents || [])]
                            newEvents[ei] = e.target.value
                            newStages[index] = { ...stage, mainEvents: newEvents }
                            onChange({ ...data, stages: newStages })
                          }}
                          className="flex-1 px-2 py-0.5 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-400">爽点</label>
                  <ul className="mt-1 space-y-1">
                    {(stage.shuangPoints && stage.shuangPoints.length > 0 ? stage.shuangPoints : ['暂无']).map((sp: string, si: number) => (
                        <li key={si} className="flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">★</span>
                          <input
                            type="text"
                            value={sp}
                            onChange={(e) => {
                              const newStages = [...(data?.stages || [])]
                              const newPoints = [...stage.shuangPoints]
                              newPoints[si] = e.target.value
                              newStages[index] = { ...stage, shuangPoints: newPoints }
                              onChange({ ...data, stages: newStages })
                            }}
                            className="flex-1 px-2 py-0.5 bg-white border border-stone-200 rounded text-sm text-amber-700 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">世界观设定 <RegenButton step={stepName} field="worldBuilding" label="世界观设定" /></h4>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-stone-500">背景设定</label>
              <textarea
                value={data?.worldBuilding?.setting || ''}
                onChange={(e) =>
                  onChange({
                    ...data,
                    worldBuilding: { ...(data?.worldBuilding || {}), setting: e.target.value },
                  })
                }
                onInput={autoResize}
                rows={2}
                className="w-full mt-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-stone-500">力量体系</label>
              <textarea
                value={(() => {
                  const ps: unknown = data?.worldBuilding?.powerSystem
                  if (typeof ps === 'string') return ps
                  if (Array.isArray(ps)) {
                    return ps.map((item: unknown) => {
                      if (typeof item === 'string') return item
                      if (typeof item === 'object' && item !== null) {
                        const obj = item as Record<string, unknown>
                        return obj.name || obj.level || obj.title || extractText(obj)
                      }
                      return String(item)
                    }).join('；')
                  }
                  if (typeof ps === 'object' && ps !== null) return extractText(ps)
                  return ''
                })()}
                onChange={(e) =>
                  onChange({
                    ...data,
                    worldBuilding: { ...(data?.worldBuilding || {}), powerSystem: e.target.value },
                  })
                }
                onInput={autoResize}
                rows={2}
                className="w-full mt-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">关键事件 <RegenButton step={stepName} field="keyEvents" label="关键事件" /></h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(data?.keyEvents || []).map((event, index: number) => {
              // 🔥 Bug3修复：兼容字符串和对象两种格式
              const isStringEvent = typeof event === 'string'
              const eventObj = isStringEvent ? { name: event, position: '', impact: '' } : event
              return (
              <div key={index} className="bg-stone-50 rounded-lg p-3 space-y-2">
                <input
                  type="text"
                  value={eventObj.name || ''}
                  onChange={(e) => {
                    const newEvents = [...(data?.keyEvents || [])]
                    newEvents[index] = isStringEvent ? { name: e.target.value, position: eventObj.position, impact: eventObj.impact } : { ...eventObj, name: e.target.value }
                    onChange({ ...data, keyEvents: newEvents })
                  }}
                  placeholder="事件名称"
                  className="w-full px-2 py-1 bg-white border border-stone-200 rounded font-medium text-stone-900 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                />
                <input
                  type="text"
                  value={eventObj.position || ''}
                  onChange={(e) => {
                    const newEvents = [...(data?.keyEvents || [])]
                    newEvents[index] = isStringEvent ? { name: eventObj.name, position: e.target.value, impact: eventObj.impact } : { ...eventObj, position: e.target.value }
                    onChange({ ...data, keyEvents: newEvents })
                  }}
                  placeholder="所在阶段"
                  className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-500 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                />
                <textarea
                  value={eventObj.impact || ''}
                  onChange={(e) => {
                    const newEvents = [...(data?.keyEvents || [])]
                    newEvents[index] = isStringEvent ? { name: eventObj.name, position: eventObj.position, impact: e.target.value } : { ...eventObj, impact: e.target.value }
                    onChange({ ...data, keyEvents: newEvents })
                  }}
                  onInput={autoResize}
                  rows={2}
                  placeholder="事件影响"
                  className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                />
              </div>
            )})}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">结局 <RegenButton step={stepName} field="ending" label="结局" /></h4>
          <textarea
            value={data?.ending || ''}
            onChange={(e) => onChange({ ...data, ending: e.target.value })}
            onInput={autoResize}
            rows={6}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700 resize-y min-h-[120px]"
          />
        </div>

        {/* 主题、伏笔、多线叙事与节奏设计（基于本作前序设定） */}
        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💎</span>
            <h4 className="font-semibold text-amber-900">主题与节奏</h4>
            <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">基于前序设定</span>
          </div>
          <p className="text-xs text-amber-700 mb-3">基于本作前序设定做主题、伏笔、多线叙事与节奏设计</p>

          {/* 主题思想 */}
          <div className="bg-white border border-amber-200 rounded-lg p-3 mb-3">
            <label className="text-sm font-medium text-amber-900 mb-1 block">主题思想 / 思想内核</label>
            <p className="text-xs text-stone-500 mb-2">作品的核心思想（30-60字）</p>
            <textarea
              value={data?.theme || ''}
              onChange={(e) => handleDepthFieldChange('theme', e.target.value)}
              onInput={autoResize}
              rows={2}
              placeholder="基于本作灵感创作的coreIdea：填写本作的核心思想/主题内核"
              className="w-full px-3 py-2 bg-stone-50 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-stone-700"
            />
          </div>

          {/* 节奏曲线 */}
          <div className="bg-white border border-amber-200 rounded-lg p-3 mb-3">
            <label className="text-sm font-medium text-amber-900 mb-1 block">节奏曲线</label>
            <p className="text-xs text-stone-500 mb-2">爽点密度、低谷位置、高潮分布的整体设计（50-100字）</p>
            <textarea
              value={data?.rhythmCurve || ''}
              onChange={(e) => handleDepthFieldChange('rhythmCurve', e.target.value)}
              onInput={autoResize}
              rows={3}
              placeholder="基于本作故事大纲：填写5阶段节奏曲线（如：低速成长→加速闯荡→高潮崛起→全书高潮→收尾）"
              className="w-full px-3 py-2 bg-stone-50 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-stone-700"
            />
          </div>

          {/* 多线叙事结构 */}
          <div className="bg-white border border-amber-200 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-amber-900">多线叙事结构</label>
              <button
                type="button"
                onClick={() => handleDepthListItemAdd('narrativeLines', { name: '', type: '主线', description: '', keyNodes: [] })}
                className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors"
              >+ 添加叙事线</button>
            </div>
            <div className="space-y-2">
              {(data?.narrativeLines || []).map((line: OutlineDynamicItem, index: number) => (
                <div key={index} className="bg-stone-50 border border-stone-200 rounded-lg p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={line.name || ''}
                      onChange={(e) => handleDepthListItemChange('narrativeLines', index, 'name', e.target.value)}
                      placeholder="基于本作主线：填写线名（使用前文真实主角名+核心事件）"
                      className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded text-sm font-medium text-stone-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    <select
                      value={line.type || '主线'}
                      onChange={(e) => handleDepthListItemChange('narrativeLines', index, 'type', e.target.value)}
                      className="px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    >
                      <option value="主线">主线</option>
                      <option value="支线">支线</option>
                      <option value="暗线">暗线</option>
                      <option value="感情线">感情线</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleDepthListItemRemove('narrativeLines', index)}
                      className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >删除</button>
                  </div>
                  <textarea
                    value={line.description || ''}
                    onChange={(e) => handleDepthListItemChange('narrativeLines', index, 'description', e.target.value)}
                    onInput={autoResize}
                    rows={2}
                    placeholder="线描述"
                    className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  <div>
                    <label className="text-xs font-medium text-stone-400">关键节点</label>
                    <input
                      type="text"
                      value={Array.isArray(line.keyNodes) ? line.keyNodes.join('、') : (line.keyNodes || '')}
                      onChange={(e) => {
                        // 用、分隔关键节点，过滤空值
                        const nodes = e.target.value.split('、').map(function(s) { return s.trim() }).filter(function(s) { return s })
                        handleDepthListItemChange('narrativeLines', index, 'keyNodes', nodes)
                      }}
                      placeholder="用、分隔关键节点"
                      className="w-full mt-1 px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
              ))}
              {(data?.narrativeLines || []).length === 0 && (
                <p className="text-xs text-stone-400 text-center py-2">暂无叙事线，点击上方按钮添加</p>
              )}
            </div>
          </div>

          {/* 伏笔埋设与回收映射表 */}
          <div className="bg-white border border-amber-200 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-amber-900">伏笔埋设与回收映射表</label>
              <button
                type="button"
                onClick={() => handleDepthListItemAdd('foreshadowingMap', { id: '伏笔' + ((data?.foreshadowingMap || []).length + 1), content: '', plantedChapter: '', recoveredChapter: '', importance: 3 })}
                className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors"
              >+ 添加伏笔</button>
            </div>
            <div className="space-y-2">
              {(data?.foreshadowingMap || []).map((foreshadow: OutlineDynamicItem, index: number) => (
                <div key={index} className="bg-stone-50 border border-stone-200 rounded-lg p-2 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={foreshadow.id || ''}
                      onChange={(e) => handleDepthListItemChange('foreshadowingMap', index, 'id', e.target.value)}
                      placeholder="伏笔编号/标识"
                      className="w-28 px-2 py-1 bg-white border border-stone-200 rounded text-sm font-medium text-stone-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={foreshadow.plantedChapter || ''}
                      onChange={(e) => handleDepthListItemChange('foreshadowingMap', index, 'plantedChapter', e.target.value)}
                      placeholder="埋设位置（如：第X卷/X章）"
                      className="flex-1 min-w-[120px] px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    <span className="text-stone-400">→</span>
                    <input
                      type="text"
                      value={foreshadow.recoveredChapter || ''}
                      onChange={(e) => handleDepthListItemChange('foreshadowingMap', index, 'recoveredChapter', e.target.value)}
                      placeholder="回收位置（如：后期/第X卷）"
                      className="flex-1 min-w-[120px] px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    <select
                      value={foreshadow.importance || 3}
                      onChange={(e) => handleDepthListItemChange('foreshadowingMap', index, 'importance', Number(e.target.value))}
                      className="px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    >
                      <option value={1}>★1</option>
                      <option value={2}>★2</option>
                      <option value={3}>★3</option>
                      <option value={4}>★4</option>
                      <option value={5}>★5</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleDepthListItemRemove('foreshadowingMap', index)}
                      className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >删除</button>
                  </div>
                  <textarea
                    value={foreshadow.content || ''}
                    onChange={(e) => handleDepthListItemChange('foreshadowingMap', index, 'content', e.target.value)}
                    onInput={autoResize}
                    rows={2}
                    placeholder="基于本作故事大纲：填写伏笔内容（参考关键道具/角色身世/历史秘辛）"
                    className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              ))}
              {(data?.foreshadowingMap || []).length === 0 && (
                <p className="text-xs text-stone-400 text-center py-2">暂无伏笔，点击上方按钮添加</p>
              )}
            </div>
          </div>

          {/* 主角成长曲线 */}
          <div className="bg-white border border-amber-200 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-amber-900">主角成长曲线</label>
              <button
                type="button"
                onClick={() => handleDepthListItemAdd('protagonistGrowthCurve', { stage: '', growthPoint: '', psychologicalChange: '', powerLevel: '' })}
                className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors"
              >+ 添加成长节点</button>
            </div>
            <div className="space-y-2">
              {(data?.protagonistGrowthCurve || []).map((node: OutlineDynamicItem, index: number) => (
                <div key={index} className="bg-stone-50 border border-stone-200 rounded-lg p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={node.stage || ''}
                      onChange={(e) => handleDepthListItemChange('protagonistGrowthCurve', index, 'stage', e.target.value)}
                      placeholder="基于本作故事大纲：对应阶段（如：初期/中期/后期）"
                      className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded text-sm font-medium text-stone-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    {_showPowerLevel && (<input
                      type="text"
                      value={node.powerLevel || ''}
                      onChange={(e) => handleDepthListItemChange('protagonistGrowthCurve', index, 'powerLevel', e.target.value)}
                      placeholder="基于本作力量体系：战力等级（参考体系等级名称）"
                      className="flex-1 min-w-[140px] px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />)}
                    <button
                      type="button"
                      onClick={() => handleDepthListItemRemove('protagonistGrowthCurve', index)}
                      className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >删除</button>
                  </div>
                  <input
                    type="text"
                    value={node.growthPoint || ''}
                    onChange={(e) => handleDepthListItemChange('protagonistGrowthCurve', index, 'growthPoint', e.target.value)}
                    placeholder="基于本作主角设定：成长点（参考主角身份+金手指能力）"
                    className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  <textarea
                    value={node.psychologicalChange || ''}
                    onChange={(e) => handleDepthListItemChange('protagonistGrowthCurve', index, 'psychologicalChange', e.target.value)}
                    onInput={autoResize}
                    rows={2}
                    placeholder="心理变化"
                    className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              ))}
              {(data?.protagonistGrowthCurve || []).length === 0 && (
                <p className="text-xs text-stone-400 text-center py-2">暂无成长节点，点击上方按钮添加</p>
              )}
            </div>
          </div>

          {/* 核心冲突层次 */}
          <div className="bg-white border border-amber-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-amber-900">核心冲突层次</label>
              <button
                type="button"
                onClick={() => handleDepthListItemAdd('conflictLayers', { layer: '', conflict: '', stakes: '' })}
                className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors"
              >+ 添加冲突层</button>
            </div>
            <div className="space-y-2">
              {(data?.conflictLayers || []).map((layer: OutlineDynamicItem, index: number) => (
                <div key={index} className="bg-stone-50 border border-stone-200 rounded-lg p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={layer.layer || ''}
                      onChange={(e) => handleDepthListItemChange('conflictLayers', index, 'layer', e.target.value)}
                      placeholder="冲突层次（如 家国存亡 / 朝堂权争 / 新旧之阻）"
                      className="flex-1 min-w-0 px-2 py-1 bg-white border border-stone-200 rounded text-sm font-medium text-stone-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => handleDepthListItemRemove('conflictLayers', index)}
                      className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >删除</button>
                  </div>
                  <input
                    type="text"
                    value={layer.conflict || ''}
                    onChange={(e) => handleDepthListItemChange('conflictLayers', index, 'conflict', e.target.value)}
                    placeholder="基于本作核心冲突：冲突内容（参考势力设定+coreConflict）"
                    className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  <textarea
                    value={layer.stakes || ''}
                    onChange={(e) => handleDepthListItemChange('conflictLayers', index, 'stakes', e.target.value)}
                    onInput={autoResize}
                    rows={2}
                    placeholder="基于本作核心冲突：赌注/代价（参考势力存亡/主角信念）"
                    className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              ))}
              {(data?.conflictLayers || []).length === 0 && (
                <p className="text-xs text-stone-400 text-center py-2">暂无冲突层，点击上方按钮添加</p>
              )}
            </div>
          </div>

          {/* 🔥 多势力战力等级同步展示（基于本作力量体系动态展示，无题材绑定硬编码） */}
          {(() => {
            // 基于本作力量体系动态检测：仅当data?.triRacePowerLevels已存在（由LLM基于力量体系生成）时才显示
            const triRaceLevels = data?.triRacePowerLevels
            if (!triRaceLevels || typeof triRaceLevels !== 'object') return null
            const raceKeys = Object.keys(triRaceLevels).filter(k => Array.isArray(triRaceLevels[k]) && triRaceLevels[k].length > 0)
            if (raceKeys.length === 0) return null
            const raceColors: Record<string, { border: string; dot: string; text: string; badge: string }> = {
              巫族: { border: 'border-orange-200', dot: 'bg-orange-500', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-600' },
              仙道: { border: 'border-stone-200', dot: 'bg-stone-400', text: 'text-stone-700', badge: 'bg-stone-100 text-stone-700' },
              妖族: { border: 'border-green-200', dot: 'bg-green-500', text: 'text-green-700', badge: 'bg-green-100 text-green-600' },
            }
            const defaultColor = { border: 'border-stone-200', dot: 'bg-stone-500', text: 'text-stone-700', badge: 'bg-stone-100 text-stone-600' }
            return (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-amber-900">
                    <span className="text-amber-600">⚔️</span> 多势力战力等级同步
                    <span className="text-xs text-amber-600 ml-2">基于本作力量体系设定动态展示</span>
                  </label>
                </div>
                <div className={`grid grid-cols-${raceKeys.length} gap-3`}>
                  {raceKeys.map((race) => {
                    const c = raceColors[race] || defaultColor
                    const levels = triRaceLevels[race]
                    return (
                      <div key={race} className={`bg-white border ${c.border} rounded-md p-2`}>
                        <h5 className={`text-xs font-bold ${c.text} mb-1 flex items-center gap-1`}>
                          <span className={`w-2 h-2 ${c.dot} rounded-full`}></span>{race}
                        </h5>
                        <ul className="text-xs text-stone-700 space-y-0.5">
                          {levels.map((level: string, idx: number) => (
                            <li key={idx} className="flex items-center gap-1">
                              <span className={`w-4 h-4 ${c.badge} rounded-full flex items-center justify-center text-[10px] font-bold shrink-0`}>{idx + 1}</span>
                              <input
                                type="text"
                                value={level}
                                onChange={(e) => {
                                  const _trl = { ...(data?.triRacePowerLevels || {}) }
                                  const _arr = [...(_trl[race] || [])]
                                  _arr[idx] = e.target.value
                                  _trl[race] = _arr
                                  onChange({ ...data, triRacePowerLevels: _trl })
                                }}
                                className="flex-1 min-w-0 px-1 py-0.5 bg-transparent border-0 border-b border-transparent hover:border-stone-200 focus:border-stone-400 text-xs text-stone-700 focus:outline-none focus:ring-0"
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* 🔥 反派成长曲线（与主角成长曲线对应，基于本作前序设定做反派势力成长轨迹设计） */}
          <div className="bg-white border-2 border-red-200 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-red-900">
                <span className="text-red-600">😈</span> 反派成长曲线
                <span className="text-xs text-red-500 ml-2">（与主角对应）</span>
              </label>
              <button
                type="button"
                onClick={() => handleDepthListItemAdd('antagonistGrowthCurve', { stage: '', antagonist: '', growthPoint: '', powerLevel: '', threatLevel: '' })}
                className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              >+ 添加反派节点</button>
            </div>
            <div className="space-y-2">
              {(data?.antagonistGrowthCurve || []).map((node: OutlineDynamicItem, index: number) => (
                <div key={index} className="bg-red-50/50 border border-red-200 rounded-lg p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={node.stage || ''}
                      onChange={(e) => handleDepthListItemChange('antagonistGrowthCurve', index, 'stage', e.target.value)}
                      placeholder="基于本作故事大纲：对应阶段（如：初期威胁/中期对抗/后期决战）"
                      className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded text-sm font-medium text-stone-900 focus:ring-2 focus:ring-red-400 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={node.antagonist || ''}
                      onChange={(e) => handleDepthListItemChange('antagonistGrowthCurve', index, 'antagonist', e.target.value)}
                      placeholder="基于本作角色设定：反派名（使用前文真实反派角色名）"
                      className="flex-1 min-w-[140px] px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-red-400 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => handleDepthListItemRemove('antagonistGrowthCurve', index)}
                      className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >删除</button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={node.powerLevel || ''}
                      onChange={(e) => handleDepthListItemChange('antagonistGrowthCurve', index, 'powerLevel', e.target.value)}
                      placeholder="基于本作力量体系：战力等级（参考体系等级名称）"
                      className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-red-400 focus:border-transparent"
                    />
                    <select
                      value={node.threatLevel || ''}
                      onChange={(e) => handleDepthListItemChange('antagonistGrowthCurve', index, 'threatLevel', e.target.value)}
                      className="px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-red-400 focus:border-transparent"
                    >
                      <option value="">威胁等级</option>
                      <option value="低">低</option>
                      <option value="中">中</option>
                      <option value="高">高</option>
                      <option value="极高">极高</option>
                      <option value="灭世">灭世</option>
                    </select>
                  </div>
                  <textarea
                    value={node.growthPoint || ''}
                    onChange={(e) => handleDepthListItemChange('antagonistGrowthCurve', index, 'growthPoint', e.target.value)}
                    onInput={autoResize}
                    rows={2}
                    placeholder="基于本作反派设定：成长点/威胁升级（参考反派成长曲线节点）"
                    className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-red-400 focus:border-transparent resize-y"
                  />
                </div>
              ))}
              {(data?.antagonistGrowthCurve || []).length === 0 && (
                <p className="text-xs text-red-400 text-center py-2">
                  暂无反派节点，建议添加5个节点对应主角成长（反派战力须略高于同期主角，制造紧迫感）
                </p>
              )}
            </div>
          </div>

          {/* 🔥 关键道具谱系（基于本作前序设定做关键道具设计，无题材绑定示例） */}
          <div className="bg-white border-2 border-stone-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-stone-900">
                <span className="text-stone-800">🏺</span> 关键道具谱系
                <span className="text-xs text-stone-500 ml-2">（基于本作前序设定：参考金手指/力量体系/世界观）</span>
              </label>
              <button
                type="button"
                onClick={() => handleDepthListItemAdd('keyArtifacts', { name: '', type: '', origin: '', function: '', owner: '', importance: 3 })}
                className="text-xs px-2 py-1 bg-stone-100 text-stone-700 rounded hover:bg-stone-200 transition-colors"
              >+ 添加关键道具</button>
            </div>
            <div className="space-y-2">
              {(data?.keyArtifacts || []).map((artifact: OutlineDynamicItem, index: number) => (
                <div key={index} className="bg-stone-50/50 border border-stone-200 rounded-lg p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-stone-100 text-stone-800 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={artifact.name || ''}
                      onChange={(e) => handleDepthListItemChange('keyArtifacts', index, 'name', e.target.value)}
                      placeholder="基于本作金手指/力量体系：道具名（使用前文真实道具名）"
                      className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded text-sm font-medium text-stone-900 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={artifact.type || ''}
                      onChange={(e) => handleDepthListItemChange('keyArtifacts', index, 'type', e.target.value)}
                      placeholder="类型（如 核心凭依 / 军事根本 / 神器 / 功法）"
                      className="px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => handleDepthListItemRemove('keyArtifacts', index)}
                      className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >删除</button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={artifact.origin || ''}
                      onChange={(e) => handleDepthListItemChange('keyArtifacts', index, 'origin', e.target.value)}
                      placeholder="基于本作历史背景：来历（参考世界观隐秘历史）"
                      className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={artifact.owner || ''}
                      onChange={(e) => handleDepthListItemChange('keyArtifacts', index, 'owner', e.target.value)}
                      placeholder="基于本作角色设定：持有者（使用前文真实角色名）"
                      className="flex-1 min-w-[100px] px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                  </div>
                  <textarea
                    value={artifact.function || ''}
                    onChange={(e) => handleDepthListItemChange('keyArtifacts', index, 'function', e.target.value)}
                    onInput={autoResize}
                    rows={2}
                    placeholder="基于本作金手指/力量体系：功能/作用（参考金手指核心功能）"
                    className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-700 focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-y"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-500">重要性</label>
                    <select
                      value={artifact.importance || 3}
                      onChange={(e) => handleDepthListItemChange('keyArtifacts', index, 'importance', parseInt(e.target.value))}
                      className="px-2 py-1 bg-white border border-stone-200 rounded text-xs text-stone-600 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    >
                      <option value={1}>★（点缀）</option>
                      <option value={2}>★★（辅助）</option>
                      <option value={3}>★★★（重要）</option>
                      <option value={4}>★★★★（核心）</option>
                      <option value={5}>★★★★★（贯穿全书）</option>
                    </select>
                  </div>
                </div>
              ))}
              {(data?.keyArtifacts || []).length === 0 && (
                <p className="text-xs text-stone-400 text-center py-2">
                  暂无关键道具，建议添加3-5个核心道具（基于本作金手指/力量体系设计）
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
