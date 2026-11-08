'use client'

import { useState, useMemo } from 'react'
import { CheckCircle, AlertTriangle, Shield, Loader2, Wrench, Info } from 'lucide-react'
import { runPitfallCheck } from '@/lib/ai/pitfallRules'
import type { PitfallItem, PitfallSeverity } from '@/lib/ai/pitfallRules'

interface ChapterItem {
  id: string
  title: string
  content: string
  wordCount: number
  status: string
}

interface StepSignatureChecklistProps {
  /** 整包生成数据（推荐）：runPitfallCheck 会覆盖 idea/synopsis/世界观/人物/卷/章/正文全部环节 */
  generatedData?: any
  /** 旧 props（兼容）：仅传逐章正文时退化为「正文子集」检查，避免破坏既有调用方 */
  generatedChapters?: Array<ChapterItem>
  onComplete?: () => void
  /** 预留：一键修复全部（本轮不实现逻辑，仅占位；未传则按钮置灰显示「即将上线」） */
  onRepairAll?: () => void
}

interface AiDetectScore {
  name: string
  score: number
  isInverse?: boolean
  description?: string
}

interface AiDetectIssue {
  severity: 'high' | 'medium' | 'low'
  description: string
}

interface AiDetectResult {
  aiRate?: number
  overallScore?: number
  level?: { label?: string; description?: string }
  scores?: AiDetectScore[]
  issues?: AiDetectIssue[]
}

/** 失败项排序权重：block > warn > info > 通过 */
function failRank(item: PitfallItem): number {
  if (item.passed) return 4
  if (item.severity === 'block') return 0
  if (item.severity === 'warn') return 1
  return 2
}

/** 单项视觉样式（保持暗色 stone 系风格） */
function itemStyle(item: PitfallItem): { box: string; text: string; icon: string } {
  if (item.passed) return { box: 'bg-green-50 border-green-200', text: 'text-green-700', icon: 'text-green-500' }
  if (item.severity === 'block') return { box: 'bg-red-50 border-red-300', text: 'text-red-700', icon: 'text-red-500' }
  if (item.severity === 'warn') return { box: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: 'text-amber-500' }
  return { box: 'bg-stone-50 border-stone-200', text: 'text-stone-700', icon: 'text-stone-400' }
}

function severityBadge(sev: PitfallSeverity): { label: string; cls: string } {
  if (sev === 'block') return { label: '阻断', cls: 'bg-red-100 text-red-700' }
  if (sev === 'warn') return { label: '警告', cls: 'bg-amber-100 text-amber-700' }
  return { label: '提示', cls: 'bg-stone-200 text-stone-600' }
}

export default function StepSignatureChecklist({
  generatedData,
  generatedChapters = [],
  onComplete,
  onRepairAll,
}: StepSignatureChecklistProps) {
  // 逐章正文（用于 AI 深度检测 + 兼容旧 props）
  const proseChapters: ChapterItem[] = (generatedChapters && generatedChapters.length > 0)
    ? generatedChapters
    : ((generatedData && generatedData.chapters && generatedData.chapters.generatedContent) || [])

  // 全环节检查数据源：优先整包 generatedData；否则退化为仅正文
  const checkData = useMemo(() => {
    if (generatedData && typeof generatedData === 'object') {
      const hasDesign = ['idea', 'synopsis', 'worldbuilding', 'powerSystem', 'factions', 'relationships', 'keyPlots', 'outline']
        .some((k) => generatedData[k] != null)
      const hasVolumes = !!(generatedData.chapters && Array.isArray(generatedData.chapters.volumes) && generatedData.chapters.volumes.length > 0)
      if (hasDesign || hasVolumes) return generatedData
    }
    if (proseChapters.length > 0) return { chapters: { generatedContent: proseChapters } }
    return null
  }, [generatedData, proseChapters])

  const result = useMemo(() => runPitfallCheck(checkData || {}), [checkData])
  const { groups, summary } = result

  const total = summary.total || 0
  const passedCount = summary.passed || 0
  const progress = total > 0 ? Math.round((passedCount / total) * 100) : 0
  const hasData = checkData != null && total > 0

  // AI深度检测状态
  const [aiDetectResult, setAiDetectResult] = useState<AiDetectResult | null>(null)
  const [isAIDetecting, setIsAIDetecting] = useState(false)
  const [aiDetectError, setAiDetectError] = useState('')

  const runAIDetect = async () => {
    setIsAIDetecting(true)
    setAiDetectError('')
    setAiDetectResult(null)
    try {
      const allContent = proseChapters.map((ch: ChapterItem) => ch.content || '').join('\n')
      if (allContent.length < 50) {
        setAiDetectError('正文内容不足，无法进行AI检测（至少需要50字）')
        return
      }
      const res = await fetch('/tuzhong-wenshu/api/ai/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: allContent }),
      })
      if (res.ok) {
        const json = await res.json()
        setAiDetectResult(json.data as AiDetectResult)
      } else {
        const err = await res.json()
        setAiDetectError(err.error || 'AI检测失败，请重试')
      }
    } catch (err) {
      setAiDetectError('AI检测服务不可用，请检查网络连接')
    } finally {
      setIsAIDetecting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-gradient-to-r wenshu-title-band shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="p-6 text-center">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">签约爆款避坑检查</h3>
          <p className="text-stone-500 text-sm">全环节动态检查：创意 / 简介 / 世界观 / 力量体系 / 人物 / 势力 / 关系 / 大纲 / 关键情节 / 卷 / 章 / 正文（按番茄/七猫/起点2026年最新标准）</p>
        </div>
      </div>

      {/* 进度概览 */}
      <div className="bg-gradient-to-r bg-stone-50 rounded-xl p-6 border border-stone-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-stone-800" />
            <span className="text-lg font-semibold text-stone-900">检查进度</span>
            {hasData && summary.block > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                {summary.block} 项阻断项未通过
              </span>
            )}
          </div>
          <div className="text-3xl font-bold text-stone-800">{progress}%</div>
        </div>
        <div className="h-4 bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full wenshu-btn-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-sm text-stone-600">
            已通过 {passedCount}/{total} 项检查{summary.failed > 0 ? `（未通过 ${summary.failed} 项）` : ''}
          </div>
          {/* 一键修复（预留接口） */}
          <button
            type="button"
            onClick={onRepairAll}
            disabled={!onRepairAll}
            title={onRepairAll ? '一键修复全部未通过项' : '即将上线'}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              onRepairAll
                ? 'text-white wenshu-btn-primary hover:opacity-90'
                : 'text-stone-400 bg-stone-100 border border-stone-200 cursor-not-allowed'
            }`}
          >
            <Wrench className="w-4 h-4" />
            {onRepairAll ? '一键修复全部' : '一键修复全部（即将上线）'}
          </button>
        </div>
      </div>

      {!hasData && (
        <div className="bg-white rounded-xl border border-stone-200 p-6 text-sm text-stone-500">
          尚未生成任何环节内容，无法执行避坑检查。请先完成创意 / 世界观 / 大纲 / 章节等环节。
        </div>
      )}

      {/* 分组检查项 */}
      {groups.map((group) => {
        const gPass = group.items.filter((i) => i.passed).length
        const gTotal = group.items.length
        const gBlockFail = group.items.filter((i) => !i.passed && i.severity === 'block').length
        const ordered = [...group.items].sort((a, b) => failRank(a) - failRank(b))
        return (
          <div key={group.key} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="bg-stone-50 px-6 py-4 border-b border-stone-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-stone-700" />
                  <h3 className="text-lg font-semibold text-stone-900">{group.label}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {gBlockFail > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      {gBlockFail} 阻断
                    </span>
                  )}
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    gPass === gTotal ? 'bg-green-100 text-green-700' : 'bg-stone-200 text-stone-700'
                  }`}>
                    通过 {gPass} / 共 {gTotal}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-3">
              {ordered.map((item) => {
                const st = itemStyle(item)
                const badge = severityBadge(item.severity)
                return (
                  <div key={item.id} className={`w-full flex items-start gap-3 p-4 rounded-lg text-left border ${st.box}`}>
                    <div className="mt-0.5">
                      {item.passed ? (
                        <CheckCircle className={`w-5 h-5 ${st.icon}`} />
                      ) : item.severity === 'block' ? (
                        <AlertTriangle className={`w-5 h-5 ${st.icon}`} />
                      ) : item.severity === 'warn' ? (
                        <AlertTriangle className={`w-5 h-5 ${st.icon}`} />
                      ) : (
                        <Info className={`w-5 h-5 ${st.icon}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium flex items-center gap-2 flex-wrap ${st.text}`}>
                        <span>{item.title}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <div className="text-sm text-stone-500 mt-0.5 break-words">{item.detail}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* AI深度检测 - 对接朱雀AI检测引擎 */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="bg-gradient-to-r from-stone-50 to-stone-50 px-6 py-4 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-stone-800" />
            <h3 className="text-xl font-semibold text-stone-900">🤖 AI深度检测（朱雀引擎）</h3>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-stone-600">
            对接朱雀AI检测引擎，分析8个维度：句式多样性、逻辑自然度、用词口语化、段落节奏感、情感真实度、细节密度、AI高频词、模板化程度，输出AI生成概率和签约建议。
          </p>

          {proseChapters.length === 0 ? (
            <p className="text-sm text-stone-400">请先生成章节正文后再进行AI检测</p>
          ) : !aiDetectResult ? (
            <div className="text-center py-4">
              <button
                onClick={runAIDetect}
                disabled={isAIDetecting}
                className="inline-flex items-center gap-2 px-6 py-3 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAIDetecting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    正在AI深度检测中...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5" />
                    开始AI深度检测
                  </>
                )}
              </button>
              {aiDetectError && (
                <p className="text-sm text-red-500 mt-3">{aiDetectError}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 总体评分 */}
              <div className="bg-gradient-to-r from-stone-50 to-stone-50 rounded-lg p-5 border border-stone-100">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-semibold text-stone-900">检测结果</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    (aiDetectResult.aiRate || 0) <= 10 ? 'bg-green-100 text-green-700' :
                    (aiDetectResult.aiRate || 0) <= 30 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    AI概率: {Math.round(aiDetectResult.aiRate || 0)}%
                  </span>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-sm text-stone-600 mb-1">
                    <span>原创度评分</span>
                    <span className="font-semibold">{Math.round(aiDetectResult.overallScore || 0)}/100</span>
                  </div>
                  <div className="h-3 bg-stone-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (aiDetectResult.overallScore || 0) >= 80 ? 'bg-green-500' :
                        (aiDetectResult.overallScore || 0) >= 60 ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, aiDetectResult.overallScore || 0)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-stone-600">签约建议：</span>
                  <span className={`font-semibold ${
                    (aiDetectResult.level?.label || '').includes('优秀') ? 'text-green-600' :
                    (aiDetectResult.level?.label || '').includes('良好') ? 'text-stone-700' :
                    (aiDetectResult.level?.label || '').includes('一般') ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {aiDetectResult.level?.label || '未知'}
                  </span>
                  {aiDetectResult.level?.description && (
                    <span className="text-sm text-stone-500">— {aiDetectResult.level.description}</span>
                  )}
                </div>
              </div>

              {/* 各维度评分 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {aiDetectResult.scores?.map((score: AiDetectScore) => {
                  const scoreValue = score.isInverse ? score.score : score.score
                  return (
                    <div key={score.name} className="bg-stone-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-stone-500 mb-1">{score.name}</div>
                      <div className={`text-lg font-bold ${
                        scoreValue >= 80 ? 'text-green-600' :
                        scoreValue >= 60 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {Math.round(scoreValue)}
                      </div>
                      <div className="text-xs text-stone-400 mt-1">{score.description}</div>
                    </div>
                  )
                })}
              </div>

              {/* 检测到的问题 */}
              {aiDetectResult.issues && aiDetectResult.issues.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-700 mb-2">检测到 {aiDetectResult.issues.length} 个问题：</h4>
                  <ul className="space-y-1">
                    {aiDetectResult.issues.slice(0, 10).map((issue: AiDetectIssue, idx: number) => (
                      <li key={idx} className="text-sm text-red-600 flex items-start gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          issue.severity === 'high' ? 'bg-red-500' :
                          issue.severity === 'medium' ? 'bg-yellow-500' :
                          'bg-stone-400'
                        }`} />
                        {issue.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={runAIDetect}
                disabled={isAIDetecting}
                className="text-sm text-stone-800 hover:text-stone-800 disabled:opacity-50"
              >
                {isAIDetecting ? '检测中...' : '🔄 重新检测'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 总结 */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
          <h3 className="text-xl font-semibold text-stone-900">避坑完成度</h3>
        </div>
        <div className="space-y-3">
          {summary.block > 0 ? (
            <div className="text-lg font-medium text-red-700">
              ❌ 存在 {summary.block} 项阻断级问题，必须先修复！
            </div>
          ) : progress >= 90 ? (
            <div className="text-lg font-medium text-green-700">
              ✨ 完美！已达到签约标准！
            </div>
          ) : progress >= 70 ? (
            <div className="text-lg font-medium text-yellow-700">
              ⚠️ 还差一点点，再检查几项！
            </div>
          ) : (
            <div className="text-lg font-medium text-red-700">
              ❌ 还需要认真检查哦！
            </div>
          )}
          <p className="text-stone-600">
            {proseChapters.length > 0
              ? `已生成 ${proseChapters.length} 章，共 ${proseChapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0).toLocaleString()} 字`
              : '尚未生成正文（当前按设计态字段检查）'}
          </p>
        </div>
      </div>

      {onComplete && (
        <div className="flex gap-3">
          <button
            onClick={runAIDetect}
            className="flex-1 py-4 px-6 rounded-xl font-semibold text-stone-800 border-2 border-stone-200 hover:bg-stone-50 transition-all"
          >
            🔄 重新检查
          </button>
          <button
            onClick={onComplete}
            disabled={progress < 70 || summary.block > 0}
            className={`flex-1 py-4 px-6 rounded-xl font-semibold text-white transition-all ${
              progress >= 70 && summary.block === 0
                ? 'wenshu-btn-primary hover:from-stone-800 hover:to-stone-700'
                : 'bg-stone-400 cursor-not-allowed'
            }`}
          >
            {progress >= 70 && summary.block === 0 ? '✓ 完成检查，继续下一步' : (summary.block > 0 ? '请先修复阻断级问题' : '请至少通过70%的检查')}
          </button>
        </div>
      )}
    </div>
  )
}
