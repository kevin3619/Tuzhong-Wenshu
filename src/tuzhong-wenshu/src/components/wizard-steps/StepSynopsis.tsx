'use client'

import { useEffect } from 'react'
import type { GeneratedData } from '../ai-generate-wizard'

interface StepSynopsisProps {
  data: GeneratedData['synopsis']
  onChange: (updated: GeneratedData['synopsis']) => void
  onRegenerate: (step: string, field?: string) => void
  onGenerate: () => void
  isLoading: boolean
  regeneratePrompt: string
  setRegeneratePrompt: (v: string) => void
  RegenButton: React.ComponentType<{ step: string; field?: string; label: string }>
  regeneratingField: string | null
  stepName: string
}

export default function StepSynopsis({
  data, onChange, onRegenerate, onGenerate, isLoading, regeneratePrompt, setRegeneratePrompt, RegenButton, regeneratingField, stepName,
}: StepSynopsisProps) {
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

  const autoResize = function(e: React.FormEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }

  if (!data || (!data.shortIntro && !data.oneLineIntro && !data.fullIntro && !data.sellingPoints)) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📝</div>
          <p className="text-stone-500 text-lg mb-4">简介卖点尚未生成</p>
          <button type="button" onClick={onGenerate} disabled={isWholeStepRegenerating} className="inline-flex items-center gap-2 px-6 py-3 wenshu-btn-primary rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {isWholeStepRegenerating ? '⏳ 生成中...' : '✨ 生成简介卖点'}
          </button>
        </div>
      </div>
    )
  }

  const shortIntro = data.shortIntro || data.oneLineIntro || ''
  const fullIntro = data.fullIntro || data.longIntro || data.synopsis || ''
  const coreGoldenSentence = data.coreGoldenSentence || data.coreGoldenQuote || ''
  const sellingPoints = Array.isArray(data.sellingPoints) ? data.sellingPoints : []
  const tags = Array.isArray(data.tags) ? data.tags : (Array.isArray(data.keywords) ? data.keywords : [])

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden wenshu-card">
        <div className="absolute top-0 left-0 right-0 h-1.5 wenshu-stripe"></div>
        <div className="wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-200">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5 font-serif-wenshu">简介卖点</h3>
          <p className="text-stone-500 text-sm">基于前序设定生成的简介、卖点、标签与核心金句（可直接编辑）</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={regeneratePrompt}
              onChange={(e) => setRegeneratePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
              placeholder={`输入你的需求，如：突出主角金手指、加入热血元素...`}
              className="flex-1 px-4 py-2.5 text-sm wenshu-input"
            />
            <button
              onClick={() => onRegenerate(stepName)}
              disabled={isWholeStepRegenerating}
              className="whitespace-nowrap inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium wenshu-btn-primary rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWholeStepRegenerating ? '生成中...' : '🔄 重新生成'}
            </button>
          </div>
        </div>
      </div>

      <div className="wenshu-card rounded-2xl p-6 space-y-4">
        <div>
          <label className="wenshu-label">一句话简介 <RegenButton step={stepName} field="shortIntro" label="一句话简介" /></label>
          <textarea
            value={shortIntro}
            onChange={(e) => onChange({ ...data, shortIntro: e.target.value, oneLineIntro: e.target.value })}
            onInput={autoResize}
            rows={2}
            placeholder="基于本作题材与主角设定填写一句话简介（30-50字，含主角+金手指+核心冲突）"
            className={`w-full mt-1 px-3 py-2 wenshu-input text-stone-800 ${!shortIntro ? 'border-red-300 bg-red-50/30' : ''}`}
          />
          {!shortIntro && <p className="text-xs text-red-500 mt-1">⚠️ 必填·一句话简介（含主角+金手指+核心冲突）</p>}
        </div>

        <div>
          <label className="wenshu-label">完整简介 <RegenButton step={stepName} field="fullIntro" label="完整简介" /></label>
          <textarea
            value={fullIntro}
            onChange={(e) => onChange({ ...data, fullIntro: e.target.value, longIntro: e.target.value, synopsis: e.target.value })}
            onInput={autoResize}
            rows={6}
            placeholder="基于本作前序设定填写完整简介（200-500字，含背景介绍+主角设定+核心冲突+爽点暗示+悬念钩子）"
            className={`w-full mt-1 px-3 py-2 wenshu-input text-stone-700 leading-relaxed ${!fullIntro ? 'border-red-300 bg-red-50/30' : ''}`}
          />
          {!fullIntro && <p className="text-xs text-red-500 mt-1">⚠️ 必填·完整简介（200-500字）</p>}
        </div>

        <div>
          <label className="wenshu-label">核心金句 <span className="text-amber-700 text-xs ml-1">封面宣传语·主角Slogan</span> <RegenButton step={stepName} field="coreGoldenSentence" label="核心金句" /></label>
          <input
            type="text"
            value={coreGoldenSentence}
            onChange={(e) => onChange({ ...data, coreGoldenSentence: e.target.value, coreGoldenQuote: e.target.value })}
            placeholder="基于本作主角信念与核心冲突设计金句（如：我命由我不由天）"
            className={`w-full mt-1 px-3 py-2 wenshu-input text-base font-medium text-stone-900 ${!coreGoldenSentence ? 'border-red-300 bg-red-50/30' : ''}`}
          />
          {!coreGoldenSentence && <p className="text-xs text-red-500 mt-1">⚠️ 必填·核心金句（封面宣传语）</p>}
        </div>

        <div>
          <label className="wenshu-label">核心卖点（5条） <span className="text-amber-700 text-xs ml-1">含爽点承诺+爽点密度+情绪基调+商业定位</span> <RegenButton step={stepName} field="sellingPoints" label="核心卖点" /></label>
          {sellingPoints.length > 0 ? sellingPoints.map(function(sp: string, i: number) {
            return (
              <input
                key={i}
                type="text"
                value={sp}
                onChange={(e) => {
                  const newSp = [...sellingPoints]
                  newSp[i] = e.target.value
                  onChange({ ...data, sellingPoints: newSp })
                }}
                placeholder={`卖点${i + 1}：基于本作前序设定填写`}
                className="w-full mt-1 px-3 py-2 wenshu-input text-stone-700 text-sm"
              />
            )
          }) : (
            <p className="text-xs text-stone-400 mt-1">暂无卖点数据，可点击重新生成或手动添加</p>
          )}
          {sellingPoints.length > 0 && sellingPoints.length < 5 && (
            <p className="text-xs text-amber-600 mt-1">⚠️ 建议至少5条卖点，当前仅{sellingPoints.length}条</p>
          )}
        </div>

        <div>
          <label className="wenshu-label">标签 <span className="text-amber-700 text-xs ml-1">至少5个，用于平台分类与搜索</span> <RegenButton step={stepName} field="tags" label="标签" /></label>
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.length > 0 ? tags.map(function(tag: string, i: number) {
              return (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full" style={{ background: 'rgba(200, 54, 77, 0.08)', color: '#c8364d', border: '1px solid rgba(200, 54, 77, 0.2)' }}>
                  {tag}
                  <button
                    type="button"
                    onClick={() => {
                      const newTags = tags.filter((_: string, idx: number) => idx !== i)
                      onChange({ ...data, tags: newTags, keywords: newTags })
                    }}
                    className="hover:text-red-700 transition-colors"
                  >×</button>
                </span>
              )
            }) : (
              <p className="text-xs text-stone-400">暂无标签，可点击重新生成或手动添加</p>
            )}
          </div>
          {tags.length > 0 && tags.length < 5 && (
            <p className="text-xs text-amber-600 mt-1">⚠️ 建议至少5个标签，当前仅{tags.length}个</p>
          )}
        </div>

        <div>
          <label className="wenshu-label">关键词 <span className="text-amber-700 text-xs ml-1">至少8个，用于SEO与推荐算法</span> <RegenButton step={stepName} field="keywords" label="关键词" /></label>
          <textarea
            value={Array.isArray(data.keywords) ? data.keywords.join('、') : (data.keywords || '')}
            onChange={(e) => {
              const kwArr = e.target.value.split(/[、,，\s]+/).filter(Boolean)
              onChange({ ...data, keywords: kwArr })
            }}
            onInput={autoResize}
            rows={2}
            placeholder="基于本作前序设定填写关键词（顿号分隔，至少8个）"
            className="w-full mt-1 px-3 py-2 wenshu-input text-stone-700 text-sm"
          />
        </div>
      </div>
    </div>
  )
}
