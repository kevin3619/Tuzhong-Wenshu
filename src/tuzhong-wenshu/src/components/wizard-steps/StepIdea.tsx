'use client'

import { useEffect } from 'react'
import type { GeneratedData } from '../ai-generate-wizard'
import { autoResize } from '@/hooks/useAutoResize'

interface StepIdeaProps {
  data: GeneratedData['idea']
  onChange: (updated: GeneratedData['idea']) => void
  onRegenerate: (step: string, field?: string) => void
  onGenerate: () => void
  isLoading: boolean
  regeneratePrompt: string
  setRegeneratePrompt: (v: string) => void
  RegenButton: React.ComponentType<{ step: string; field?: string; label: string }>
  regeneratingField: string | null
  stepName: string
}

export default function StepIdea({
  data, onChange, onRegenerate, onGenerate, isLoading, regeneratePrompt, setRegeneratePrompt, RegenButton, regeneratingField, stepName,
}: StepIdeaProps) {
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


  // 🔥 2026-09-10 #219 「目标读者 [object Object]」：LLM/上游字段值可能是对象/数组，受控 value 直接渲染会显示 "[object Object]"。
  //   统一转为可读文本，杜绝任何单值字段出现对象泄漏。
  const toText = function(v: any): string {
    if (v === null || v === undefined) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (Array.isArray(v)) return v.map(toText).filter(Boolean).join('；')
    if (typeof v === 'object') {
      var parts: string[] = []
      ;['text', 'value', 'content', 'profile', 'description', 'label', 'name', 'summary', 'detail'].forEach(function(k) {
        if (v[k] != null && typeof v[k] !== 'object') parts.push(String(v[k]))
      })
      if (parts.length) return parts.join('；')
      try { return JSON.stringify(v) } catch (e) { return '' }
    }
    return ''
  }

  if (!data || !data.title && !data.tagline) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">💡</div>
          <p className="text-stone-500 text-lg mb-4">故事灵感尚未生成</p>
          <button type="button" onClick={onGenerate} disabled={isWholeStepRegenerating} className="inline-flex items-center gap-2 px-6 py-3 text-white bg-stone-800 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isWholeStepRegenerating ? '⏳ 生成中...' : '✨ 生成故事灵感'}
          </button>
        </div>
      </div>
    )
  }

  const tagline = toText(data.tagline || data.hook)
  const sellingPoints = Array.isArray(data.sellingPoints) ? data.sellingPoints.map(toText) : (data.coreSellingPoint ? [toText(data.coreSellingPoint)] : [])
  const coreConflict = toText(data.coreConflict)

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="bg-gradient-to-r wenshu-title-band px-6 pt-6 pb-4 text-center border-b border-stone-100">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">灵感创作</h3>
          <p className="text-stone-500 text-sm">基于你的关键词，AI为你构思了以下故事方向（可直接编辑）</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={regeneratePrompt}
              onChange={(e) => setRegeneratePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRegenerate(stepName)}
              placeholder={`输入你的需求，如：把主角改为女性，加入穿越元素...`}
              className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-stone-50"
            />
            <button
              onClick={() => onRegenerate(stepName)}
              disabled={isWholeStepRegenerating}
              className="whitespace-nowrap inline-flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r wenshu-btn-primary rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWholeStepRegenerating ? '生成中...' : '🔄 重新生成'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-stone-50 rounded-2xl p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-stone-500">书名 <RegenButton step={stepName} field="title" label="书名" /></label>
          <input
            type="text"
            value={toText(data.title)}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-lg font-bold text-stone-900"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-stone-500">一句话简介 <span className="text-amber-600 text-xs ml-1">含电梯演讲+对标作品+主角反差+黄金三章钩子</span> <RegenButton step={stepName} field="tagline" label="一句话简介" /></label>
          <textarea
            value={tagline}
            onChange={(e) => onChange({ ...data, tagline: e.target.value, hook: e.target.value })}
            onInput={autoResize}
            rows={5}
            placeholder="【一句话简介（直接在此写全）】
① 电梯演讲（30字内）：基于本作题材一句话概括主角+金手指+核心冲突
② 对标作品：3部同题材同类爆款作品
③ 主角核心矛盾/反差感：基于本作主角设定填写反差感
④ 黄金三章钩子：基于本作核心冲突设计前3章钩子
⑤ 全书宣传语（封面用）：基于本作题材与爽点设计封面宣传语
⑥ 主角Slogan：基于本作主角性格与信念设计Slogan
⑦ 文风定位：基于本作题材定位文风
⑧ 爽点模式：基于本作题材定位爽点模式（如：每3章1小爽每卷1大爽）"
            className={`w-full mt-1 px-3 py-2 border rounded-lg text-stone-700 focus:ring-2 focus:ring-stone-400 focus:border-transparent ${!tagline ? 'border-red-300 bg-red-50/30' : 'border-stone-200 bg-white'}`}
          />
          {!tagline && <p className="text-xs text-red-500 mt-1">⚠️ 必填·对标/主角反差/黄金三章/Slogan/文风/爽点直接在此字段写全</p>}
        </div>
        <div>
          <label className="text-sm font-medium text-stone-500">核心卖点（5条） <span className="text-amber-600 text-xs ml-1">含爽点承诺+爽点密度+情绪基调+商业定位</span> <RegenButton step={stepName} field="sellingPoints" label="核心卖点" /></label>
          {sellingPoints.map(function(sp: string, i: number) {
            return (
              <input
                key={i}
                type="text"
                value={sp}
                onChange={(e) => {
                  const newSP = [...sellingPoints]
                  newSP[i] = e.target.value
                  onChange({ ...data, sellingPoints: newSP, coreSellingPoint: newSP[0] || '' })
                }}
                placeholder={`卖点${i + 1}（基于本作题材与金手指设计爽点承诺/爽点密度/情绪基调/商业定位）`}
                className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700 text-sm"
              />
            )
          })}
          {sellingPoints.length < 5 && (
            <button
              type="button"
              onClick={() => {
                const newSP = [...sellingPoints, '']
                onChange({ ...data, sellingPoints: newSP })
              }}
              className="mt-1 text-xs text-stone-700 hover:underline"
            >+ 添加卖点</button>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-stone-500">核心冲突 <span className="text-amber-600 text-xs ml-1">含表层+深层+本质三层矛盾</span> <RegenButton step={stepName} field="coreConflict" label="核心冲突" /></label>
          <textarea
            value={coreConflict}
            onChange={(e) => onChange({ ...data, coreConflict: e.target.value })}
            onInput={autoResize}
            rows={4}
            placeholder="【核心冲突（直接在此写全）】
① 表层冲突：基于本作题材与势力设定填写表面冲突
② 深层冲突：基于本作势力设定填写各方利益博弈
③ 本质矛盾：基于本作世界观填写核心传承/信念之争
④ 主角内在冲突：基于本作主角设定填写内心矛盾
⑤ 商业卖点定位：基于本作题材定位爽点密度与商业卖点"
            className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-stone-500">目标读者 <RegenButton step={stepName} field="targetAudience" label="目标读者" /></label>
          <input
            type="text"
            value={toText(data.targetAudience)}
            onChange={(e) => onChange({ ...data, targetAudience: e.target.value })}
            className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-stone-500">主题思想 <RegenButton step={stepName} field="theme" label="主题思想" /></label>
          <textarea
            value={toText(data.theme)}
            onChange={(e) => onChange({ ...data, theme: e.target.value })}
            onInput={autoResize}
            rows={2}
            className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-stone-500">文风定位 <RegenButton step={stepName} field="writingStyle" label="文风定位" /></label>
            <input
              type="text"
              value={toText(data.writingStyle)}
            onChange={(e) => onChange({ ...data, writingStyle: e.target.value })}
            className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
          />
          </div>
          <div>
            <label className="text-sm font-medium text-stone-500">爽点模式 <RegenButton step={stepName} field="shuangPattern" label="爽点模式" /></label>
            <input
              type="text"
              value={toText(data.shuangPattern)}
            onChange={(e) => onChange({ ...data, shuangPattern: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-stone-500">情绪基调 <RegenButton step={stepName} field="emotionTone" label="情绪基调" /></label>
            <input
              type="text"
              value={toText(data.emotionTone)}
            onChange={(e) => onChange({ ...data, emotionTone: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-stone-500">商业定位 <RegenButton step={stepName} field="commercialPositioning" label="商业定位" /></label>
            <input
              type="text"
              value={toText(data.commercialPositioning)}
            onChange={(e) => onChange({ ...data, commercialPositioning: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-700"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-stone-500">核心金句 <RegenButton step={stepName} field="coreGoldenQuote" label="核心金句" /></label>
          <textarea
            value={toText(data.coreGoldenQuote)}
            onChange={(e) => onChange({ ...data, coreGoldenQuote: e.target.value })}
            onInput={autoResize}
            rows={3}
            className={`w-full mt-1 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-stone-700 italic ${!data.coreGoldenQuote ? 'border-red-300 bg-red-50/30' : ''}`}
          />
        </div>
      </div>
    </div>
  )
}
