'use client'

import { useEffect } from 'react'
import { extractText } from '@/lib/text-utils'
import type { GeneratedData } from '../ai-generate-wizard'
import { autoResize } from '@/hooks/useAutoResize'

type KeyPlotVolume = NonNullable<NonNullable<GeneratedData['keyPlots']>['volumes']>[number]

interface KeyPlotItem {
  title?: string
  volume?: number
  summary?: string
  shuangPoints?: string[]
  [key: string]: unknown
}

interface StepKeyPlotsProps {
  data: GeneratedData['keyPlots']
  onChange: (updated: GeneratedData['keyPlots']) => void
  onRegenerate: (step: string, field?: string) => void
  onGenerate: () => void
  isLoading: boolean
  regeneratePrompt: string
  setRegeneratePrompt: (v: string) => void
  RegenButton: React.ComponentType<{ step: string; field?: string; label: string }>
  regeneratingField: string | null
  stepName: string
}

export default function StepKeyPlots({
  data, onChange, onRegenerate, onGenerate, isLoading, regeneratePrompt, setRegeneratePrompt, RegenButton, regeneratingField, stepName,
}: StepKeyPlotsProps) {
  const isWholeStepRegenerating = regeneratingField === stepName

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
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">关键剧情节点</h3>
            <p className="text-stone-500 text-sm">AI为你的故事设计了核心冲突和关键转折点（可直接编辑）</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
                placeholder="输入你的需求，如：增加一个中期大反转..."
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

  // 检测核心数据是否为空（data存在但关键字段为空）
  const volumesList = Array.isArray(data?.volumes) ? data.volumes : []
  const turningPointsList = Array.isArray(data?.turningPoints) ? data.turningPoints : []
  const keyPlotsList = Array.isArray(data?.keyPlots) ? data.keyPlots : []
  const hasContent = volumesList.length > 0
    || turningPointsList.length > 0
    || keyPlotsList.length > 0
    || (data?.coreConflict && data.coreConflict.length > 10)
    || (data?.climax && data.climax.length > 10)

  if (!hasContent && !isWholeStepRegenerating) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
          <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-1.5">关键剧情节点</h3>
            <p className="text-stone-500 text-sm">AI为你的故事设计了核心冲突和关键转折点（可直接编辑）</p>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
                placeholder="输入你的需求，如：增加一个中期大反转..."
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
          <p className="text-amber-600 text-sm">⚠️ 关键剧情数据为空，请点击上方按钮重新生成</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">关键剧情节点</h3>
          <p className="text-stone-500 text-sm">AI为你的故事设计了核心冲突和关键转折点（可直接编辑）</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={regeneratePrompt}
              onChange={(e) => setRegeneratePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
              placeholder="输入你的需求，如：增加一个中期大反转，让结局更出人意料..."
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

      <div className="space-y-4">
        {keyPlotsList.length > 0 && (
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">关键剧情节点（{keyPlotsList.length}个）</h4>
            <div className="space-y-3">
              {keyPlotsList.map(function(kp: KeyPlotItem, ki: number) {
                return (
                  <div key={ki} className="bg-stone-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-stone-100 text-stone-800 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{ki + 1}</span>
                      <input
                        type="text"
                        value={kp.title || ''}
                        onChange={(e) => {
                          const newKp = [...keyPlotsList]
                          newKp[ki] = { ...kp, title: e.target.value }
                          onChange({ ...data, keyPlots: newKp })
                        }}
                        className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded font-medium text-stone-900 focus:ring-2 focus:ring-stone-400"
                      />
                      <span className="text-xs text-stone-500 shrink-0">第{kp.volume || 1}卷</span>
                    </div>
                    <textarea
                      value={kp.summary || ''}
                      onChange={(e) => {
                        const newKp = [...keyPlotsList]
                        newKp[ki] = { ...kp, summary: e.target.value }
                        onChange({ ...data, keyPlots: newKp })
                      }}
                      onInput={autoResize}
                      rows={2}
                      className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 resize-y focus:ring-2 focus:ring-stone-400"
                    />
                    {(kp.shuangPoints || []).length > 0 && (
                      <p className="text-xs text-amber-600">爽点：{(kp.shuangPoints || []).join(' · ')}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 分卷剧情结构 */}
        {volumesList.length > 0 && (
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">分卷剧情结构</h4>
            <div className="space-y-4">
              {volumesList.map(function (vol: KeyPlotVolume, vi: number) { return (
                <div key={vi} className="bg-stone-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 bg-stone-100 text-stone-800 rounded-full flex items-center justify-center text-sm font-bold shrink-0">{vi + 1}</span>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={vol.name || ''}
                        onChange={(e) => {
                          const newVols = [...volumesList]
                          newVols[vi] = { ...vol, name: e.target.value }
                          onChange({ ...data, volumes: newVols })
                        }}
                        className="w-full px-2 py-1 bg-white border border-stone-200 rounded font-semibold text-stone-900 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-stone-500 font-medium">核心目标</span>
                    <textarea
                      value={vol.coreObjective || ''}
                      onChange={(e) => {
                        const newVols = [...volumesList]
                        newVols[vi] = { ...vol, coreObjective: e.target.value }
                        onChange({ ...data, volumes: newVols })
                      }}
                      onInput={autoResize}
                      rows={2}
                      className="w-full px-2 py-1 mt-1 bg-white border border-stone-200 rounded text-sm text-stone-700 resize-y focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs text-stone-500 font-medium">开篇节点</span>
                      <textarea
                        value={vol.openingNode?.event || ''}
                        onChange={(e) => {
                          const newVols = [...volumesList]
                          newVols[vi] = { ...vol, openingNode: { ...vol.openingNode, event: e.target.value } }
                          onChange({ ...data, volumes: newVols })
                        }}
                        onInput={autoResize}
                        rows={2}
                        className="w-full px-2 py-1 mt-1 bg-white border border-stone-200 rounded text-sm text-stone-600 resize-y focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <span className="text-xs text-stone-500 font-medium">高潮节点</span>
                      <textarea
                        value={vol.climaxNode?.event || ''}
                        onChange={(e) => {
                          const newVols = [...volumesList]
                          newVols[vi] = { ...vol, climaxNode: { ...vol.climaxNode, event: e.target.value } }
                          onChange({ ...data, volumes: newVols })
                        }}
                        onInput={autoResize}
                        rows={2}
                        className="w-full px-2 py-1 mt-1 bg-white border border-stone-200 rounded text-sm text-stone-600 resize-y focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-stone-500 font-medium">卷末钩子</span>
                    <textarea
                      value={vol.endHook?.content || ''}
                      onChange={(e) => {
                        const newVols = [...volumesList]
                        newVols[vi] = { ...vol, endHook: { ...vol.endHook, content: e.target.value } }
                        onChange({ ...data, volumes: newVols })
                      }}
                      onInput={autoResize}
                      rows={2}
                      className="w-full px-2 py-1 mt-1 bg-white border border-stone-200 rounded text-sm text-stone-600 resize-y focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                  </div>
                </div>
              )})}
            </div>
          </div>
        )}

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">核心冲突</h4>
          <textarea
            value={data?.coreConflict || ''}
            onChange={(e) => onChange({ ...data, coreConflict: e.target.value })}
            onInput={autoResize}
            rows={6}
            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700 resize-y min-h-[120px]"
          />
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h4 className="font-semibold text-stone-900 mb-3">关键转折点</h4>
          <div className="space-y-3">
            {(data?.turningPoints || []).map((tp, index: number) => (
              <div key={index} className="bg-stone-50 rounded-lg p-3 space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 bg-stone-100 text-stone-800 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    value={tp.name || ''}
                    onChange={(e) => {
                      const newTPs = [...(data?.turningPoints || [])]
                      newTPs[index] = { ...tp, name: e.target.value }
                      onChange({ ...data, turningPoints: newTPs })
                    }}
                    className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded font-medium text-stone-900 focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                  />
                  <span className="px-2 py-1 bg-stone-100 text-stone-800 rounded text-xs">{tp.position || ''}</span>
                </div>
                <textarea
                  value={typeof tp.description === 'string' ? tp.description : extractText(tp.description)}
                  onChange={(e) => {
                    const newTPs = [...(data?.turningPoints || [])]
                    newTPs[index] = { ...tp, description: e.target.value }
                    onChange({ ...data, turningPoints: newTPs })
                  }}
                  onInput={autoResize}
                  rows={2}
                  className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 resize-y focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                />
                <div>
                  <span className="text-xs text-stone-500">影响：</span>
                  <textarea
                    value={tp.impact || ''}
                    onChange={(e) => {
                      const newTPs = [...(data?.turningPoints || [])]
                      newTPs[index] = { ...tp, impact: e.target.value }
                      onChange({ ...data, turningPoints: newTPs })
                    }}
                    onInput={autoResize}
                    rows={2}
                    className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-sm text-stone-600 resize-y focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">高潮</h4>
            <textarea
              value={data?.climax || ''}
              onChange={(e) => onChange({ ...data, climax: e.target.value })}
              onInput={autoResize}
              rows={6}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700 resize-y min-h-[120px]"
            />
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h4 className="font-semibold text-stone-900 mb-3">结局</h4>
            <textarea
              value={data?.ending || ''}
              onChange={(e) => onChange({ ...data, ending: e.target.value })}
              onInput={autoResize}
              rows={6}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700 resize-y min-h-[120px]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
