'use client'

/**
 * 🔥 第四期·爆款终检版 — 终检结果展示组件
 * 显示：AI检测、润色效果、原创查重、合规检测、签约评分、综合判定
 */

import { useState } from 'react'
import { Shield, Zap, FileCheck, Award, AlertTriangle, CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Globe, Lightbulb } from 'lucide-react'

interface FinalCheckResult {
  aiDetect?: {
    overallScore: number
    aiRate: number
    level: string
    scores: Array<{ name: string; score: number; description: string }>
    issues: Array<{ type: string; severity: string; location: string; description: string; suggestedFix: string }>
  }
  polish?: {
    beforeAiRate: number
    afterAiRate: number
    improved: boolean
    improvement: number
    polishedText?: string
  }
  originality?: {
    overallScore: number
    verdict: string
    summary: string
    dimensions: Array<{ name: string; score: number; risk: string; detail: string }>
  }
  compliance?: {
    overallScore: number
    verdict: string
    summary: string
    dimensions: Array<{ name: string; score: number; risk: string; detail: string }>
    riskItems?: string[]
  }
  contract?: {
    overallScore: number
    grade: string
    verdict: string
    strengths: string[]
    weaknesses: string[]
    suggestions: string[]
    dimensions: Array<{ name: string; score: number; comment: string }>
    estimatedPerformance?: string
  }
  platformChecks?: Array<{
    platform: string
    icon: string
    aiRate: number
    aiStandard: string
    pass: boolean
    riskLevel: string
    verdict: string
    dimensions: Array<{ name: string; score: number; risk: string; detail: string }>
  }>
  improvementSuggestions?: Array<{
    category: string
    priority: string
    status: string
    currentValue: string
    targetValue: string
    suggestions: string[]
  }>
  finalVerdict: {
    canSubmit: boolean
    aiRate: number
    originalityScore: number
    complianceScore: number
    contractScore: number
    contractGrade: string
    warnings: string[]
    summary: string
    allLowRisk?: boolean
    totalPlatforms?: number
    passedPlatforms?: number
  }
}

interface StepFinalCheckProps {
  result: FinalCheckResult | null
  loading: boolean
  onCheck: () => void
  onPolish: () => void
  onRetry: () => void
}

export default function StepFinalCheck({ result, loading, onCheck, onPolish, onRetry }: StepFinalCheckProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    aiDetect: true,
    polish: false,
    originality: false,
    compliance: false,
    contract: false,
    platformChecks: true,
    improvements: false,
  })

  const toggleSection = function(key: string) {
    setExpandedSections(function(prev) {
      return { ...prev, [key]: !prev[key] }
    })
  }

  const getScoreColor = function(score: number) {
    if (score >= 85) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBg = function(score: number) {
    if (score >= 85) return 'bg-green-50 border-green-200'
    if (score >= 60) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  const getGradeBadge = function(grade: string) {
    switch (grade) {
      case 'S': return { bg: 'bg-gradient-to-r from-yellow-400 to-amber-500', text: 'S级', desc: '强烈推荐签约' }
      case 'A': return { bg: 'bg-gradient-to-r from-green-400 to-emerald-500', text: 'A级', desc: '推荐签约' }
      case 'B': return { bg: 'bg-gradient-to-r from-stone-400 to-sky-500', text: 'B级', desc: '可考虑签约' }
      case 'C': return { bg: 'bg-gradient-to-r from-stone-400 to-slate-500', text: 'C级', desc: '不建议签约' }
      default: return { bg: 'bg-stone-300', text: grade, desc: '' }
    }
  }

  const getRiskBadge = function(risk: string) {
    switch (risk) {
      case 'high': return { bg: 'bg-red-100 text-red-700', text: '高风险' }
      case 'medium': return { bg: 'bg-yellow-100 text-yellow-700', text: '中风险' }
      case 'low': return { bg: 'bg-green-100 text-green-700', text: '低风险' }
      default: return { bg: 'bg-stone-100 text-stone-600', text: risk }
    }
  }

  if (!result && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield className="w-16 h-16 text-stone-300 mb-4" />
        <h3 className="text-lg font-semibold text-stone-600 mb-2">爆款终检</h3>
        <p className="text-sm text-stone-400 mb-6">检测AI率、原创度、合规性，评估签约价值</p>
        <button
          onClick={onCheck}
          className="px-8 py-3 wenshu-btn-primary rounded-xl font-medium text-sm flex items-center gap-2"
        >
          <Shield className="w-4 h-4" />
          开始终检
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <RefreshCw className="w-12 h-12 text-stone-400 animate-spin mb-4" />
        <h3 className="text-lg font-semibold text-stone-600 mb-1">终检进行中...</h3>
        <p className="text-sm text-stone-400">正在检测AI率、原创度、合规性、签约价值</p>
      </div>
    )
  }

  if (!result) return null

  const v = result.finalVerdict

  return (
    <div className="space-y-4">
      {/* 综合判定横幅 */}
      <div className={`rounded-xl p-6 border-2 ${v.canSubmit ? (v.warnings.length > 0 ? 'bg-yellow-50 border-yellow-300' : 'bg-green-50 border-green-300') : 'bg-red-50 border-red-300'}`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${v.canSubmit ? (v.warnings.length > 0 ? 'bg-yellow-100' : 'bg-green-100') : 'bg-red-100'}`}>
            {v.canSubmit ? (v.warnings.length > 0 ? <AlertTriangle className="w-6 h-6 text-yellow-600" /> : <CheckCircle className="w-6 h-6 text-green-600" />) : <XCircle className="w-6 h-6 text-red-600" />}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-stone-900 mb-1">
              {v.canSubmit ? (v.warnings.length > 0 ? '基本达标，但需注意' : '✅ 检测通过！可投稿签约') : '❌ 检测未通过'}
            </h3>
            <p className="text-sm text-stone-600">{v.summary}</p>
          </div>
        </div>

        {/* 核心指标 */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="bg-white rounded-lg p-3 text-center border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">AI率</div>
            <div className={`text-xl font-bold ${v.aiRate < 5 ? 'text-green-600' : v.aiRate < 15 ? 'text-yellow-600' : 'text-red-600'}`}>
              {v.aiRate.toFixed(1)}%
            </div>
            <div className="text-xs text-stone-400">{v.aiRate < 5 ? '达标' : '偏高'}</div>
          </div>
          <div className="bg-white rounded-lg p-3 text-center border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">原创度</div>
            <div className={`text-xl font-bold ${getScoreColor(v.originalityScore)}`}>
              {v.originalityScore}
            </div>
            <div className="text-xs text-stone-400">{v.originalityScore >= 60 ? '达标' : '不足'}</div>
          </div>
          <div className="bg-white rounded-lg p-3 text-center border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">合规分</div>
            <div className={`text-xl font-bold ${getScoreColor(v.complianceScore)}`}>
              {v.complianceScore}
            </div>
            <div className="text-xs text-stone-400">{v.complianceScore >= 60 ? '达标' : '风险'}</div>
          </div>
          <div className="bg-white rounded-lg p-3 text-center border border-stone-100">
            <div className="text-xs text-stone-500 mb-1">签约评级</div>
            <div className="text-xl font-bold text-stone-800">{v.contractGrade || 'N/A'}</div>
            <div className="text-xs text-stone-400">{v.contractScore}分</div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 mt-4">
          {v.aiRate > 10 && (
            <button onClick={onPolish} className="flex-1 px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-800 text-sm font-medium flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" />
              一键润色去AI
            </button>
          )}
          <button onClick={onRetry} className="flex-1 px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 text-sm font-medium flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" />
            重新检测
          </button>
        </div>
      </div>

      {/* AI检测详情 */}
      {result.aiDetect && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <button onClick={function() { toggleSection('aiDetect') }} className="w-full flex items-center justify-between p-4 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-stone-800" />
              <span className="font-semibold text-stone-800">AI检测报告</span>
              <span className={`text-sm font-medium ${getScoreColor(result.aiDetect.overallScore)}`}>
                {result.aiDetect.overallScore}分 · AI率 {result.aiDetect.aiRate}%
              </span>
            </div>
            {expandedSections.aiDetect ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
          </button>
          {expandedSections.aiDetect && (
            <div className="p-4 border-t border-stone-100 space-y-3">
              {/* 8维度评分 */}
              <div className="grid grid-cols-4 gap-2">
                {(result.aiDetect?.scores || []).map(function(s, i) {
                  return (
                    <div key={i} className="bg-stone-50 rounded-lg p-2 text-center">
                      <div className="text-xs text-stone-500">{s.name}</div>
                      <div className={`text-lg font-bold ${getScoreColor(s.score)}`}>{s.score}</div>
                    </div>
                  )
                })}
              </div>
              {/* 问题列表 */}
              {result.aiDetect?.issues && result.aiDetect.issues.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-stone-700">发现 {result.aiDetect.issues.length} 个问题</div>
                  {result.aiDetect.issues.slice(0, 8).map(function(issue, i) {
                    const severityBadge = issue.severity === 'high' ? { bg: 'bg-red-100 text-red-700', text: '严重' }
                      : issue.severity === 'medium' ? { bg: 'bg-yellow-100 text-yellow-700', text: '中等' }
                      : { bg: 'bg-stone-100 text-stone-700', text: '轻微' }
                    return (
                      <div key={i} className="bg-stone-50 rounded-lg p-3 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${severityBadge.bg}`}>{severityBadge.text}</span>
                          <span className="text-stone-700 font-medium">{issue.description}</span>
                          <span className="text-xs text-stone-400">{issue.location}</span>
                        </div>
                        <div className="text-xs text-stone-800">💡 {issue.suggestedFix}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 润色效果 */}
      {result.polish && (
        <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
          <button onClick={function() { toggleSection('polish') }} className="w-full flex items-center justify-between p-4 hover:bg-green-50">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-stone-800">8维度润色效果</span>
              <span className="text-sm text-green-600 font-medium">
                AI率 {result.polish.beforeAiRate}% → {result.polish.afterAiRate}%
                {result.polish.improved && <TrendingDown className="w-3.5 h-3.5 inline ml-1" />}
              </span>
            </div>
            {expandedSections.polish ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
          </button>
          {expandedSections.polish && (
            <div className="p-4 border-t border-stone-100">
              <div className="flex items-center gap-4 mb-3">
                <div className="flex-1 bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-red-500">润色前AI率</div>
                  <div className="text-xl font-bold text-red-600">{result.polish.beforeAiRate}%</div>
                </div>
                <div className="text-stone-400">→</div>
                <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-green-500">润色后AI率</div>
                  <div className="text-xl font-bold text-green-600">{result.polish.afterAiRate}%</div>
                </div>
                <div className="flex-1 bg-stone-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-stone-400">降低</div>
                  <div className="text-xl font-bold text-stone-800">-{result.polish.improvement.toFixed(1)}%</div>
                </div>
              </div>
              {result.polish.polishedText && (
                <details className="text-sm">
                  <summary className="text-stone-800 cursor-pointer">查看润色后文本</summary>
                  <div className="mt-2 p-3 bg-stone-50 rounded-lg max-h-60 overflow-y-auto whitespace-pre-wrap text-xs text-stone-700">
                    {result.polish.polishedText}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* 原创查重 */}
      {result.originality && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <button onClick={function() { toggleSection('originality') }} className="w-full flex items-center justify-between p-4 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-stone-700" />
              <span className="font-semibold text-stone-800">原创查重</span>
              <span className={`text-sm font-medium ${getScoreColor(result.originality.overallScore)}`}>
                {result.originality.overallScore}分 · {result.originality.verdict === 'pass' ? '✅ 通过' : result.originality.verdict === 'review' ? '⚠️ 需审查' : '❌ 未通过'}
              </span>
            </div>
            {expandedSections.originality ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
          </button>
          {expandedSections.originality && (
            <div className="p-4 border-t border-stone-100 space-y-3">
              <p className="text-sm text-stone-600">{result.originality.summary}</p>
              {result.originality.dimensions && result.originality.dimensions.map(function(d, i) {
                const risk = getRiskBadge(d.risk)
                return (
                  <div key={i} className="flex items-center justify-between bg-stone-50 rounded-lg p-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-stone-700">{d.name}</div>
                      <div className="text-xs text-stone-500">{d.detail}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${risk.bg}`}>{risk.text}</span>
                      <span className={`text-lg font-bold ${getScoreColor(d.score)}`}>{d.score}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 合规检测 */}
      {result.compliance && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <button onClick={function() { toggleSection('compliance') }} className="w-full flex items-center justify-between p-4 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-600" />
              <span className="font-semibold text-stone-800">合规检测</span>
              <span className={`text-sm font-medium ${getScoreColor(result.compliance.overallScore)}`}>
                {result.compliance.overallScore}分 · {result.compliance.verdict === 'pass' ? '✅ 通过' : result.compliance.verdict === 'review' ? '⚠️ 需审查' : '❌ 未通过'}
              </span>
            </div>
            {expandedSections.compliance ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
          </button>
          {expandedSections.compliance && (
            <div className="p-4 border-t border-stone-100 space-y-3">
              <p className="text-sm text-stone-600">{result.compliance.summary}</p>
              {result.compliance.riskItems && result.compliance.riskItems.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-sm font-medium text-red-700 mb-1">风险项</div>
                  {result.compliance.riskItems.map(function(item, i) {
                    return <div key={i} className="text-sm text-red-600">• {item}</div>
                  })}
                </div>
              )}
              {result.compliance.dimensions && result.compliance.dimensions.map(function(d, i) {
                const risk = getRiskBadge(d.risk)
                return (
                  <div key={i} className="flex items-center justify-between bg-stone-50 rounded-lg p-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-stone-700">{d.name}</div>
                      <div className="text-xs text-stone-500">{d.detail}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${risk.bg}`}>{risk.text}</span>
                      <span className={`text-lg font-bold ${getScoreColor(d.score)}`}>{d.score}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 签约评分 */}
      {result.contract && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <button onClick={function() { toggleSection('contract') }} className="w-full flex items-center justify-between p-4 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-600" />
              <span className="font-semibold text-stone-800">签约评分</span>
              <span className={`${getGradeBadge(result.contract.grade).bg} text-white px-2 py-0.5 rounded-full text-xs font-bold`}>
                {getGradeBadge(result.contract.grade).text}
              </span>
              <span className="text-sm text-stone-500">{result.contract.overallScore}分</span>
            </div>
            {expandedSections.contract ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
          </button>
          {expandedSections.contract && (
            <div className="p-4 border-t border-stone-100 space-y-3">
              <div className="text-sm font-medium text-stone-800">{result.contract.verdict}</div>
              {result.contract.estimatedPerformance && (
                <div className="text-xs text-stone-500">📈 {result.contract.estimatedPerformance}</div>
              )}
              {/* 维度评分 */}
              {result.contract.dimensions && result.contract.dimensions.map(function(d, i) {
                return (
                  <div key={i} className="flex items-center justify-between bg-stone-50 rounded-lg p-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-stone-700">{d.name}</div>
                      <div className="text-xs text-stone-500">{d.comment}</div>
                    </div>
                    <div className="w-16">
                      <div className="w-full bg-stone-200 rounded-full h-2">
                        <div className={`h-2 rounded-full ${d.score >= 80 ? 'bg-green-500' : d.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: d.score + '%' }} />
                      </div>
                      <div className="text-xs text-right mt-0.5 text-stone-500">{d.score}</div>
                    </div>
                  </div>
                )
              })}
              {/* 优点 & 不足 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-sm font-medium text-green-700 mb-1">✅ 优点</div>
                  {result.contract.strengths && result.contract.strengths.map(function(s, i) {
                    return <div key={i} className="text-xs text-green-600">• {s}</div>
                  })}
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-sm font-medium text-red-700 mb-1">⚠️ 不足</div>
                  {result.contract.weaknesses && result.contract.weaknesses.map(function(w, i) {
                    return <div key={i} className="text-xs text-red-600">• {w}</div>
                  })}
                </div>
              </div>
              {/* 改进建议 */}
              {result.contract.suggestions && result.contract.suggestions.length > 0 && (
                <div className="bg-stone-50 rounded-lg p-3">
                  <div className="text-sm font-medium text-stone-800 mb-1">💡 改进建议</div>
                  {result.contract.suggestions.map(function(s, i) {
                    return <div key={i} className="text-xs text-stone-800">• {s}</div>
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 多平台检测 */}
      {result.platformChecks && result.platformChecks.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <button onClick={function() { toggleSection('platformChecks') }} className="w-full flex items-center justify-between p-4 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-stone-800" />
              <span className="font-semibold text-stone-800">多平台签约检测</span>
              <span className="text-sm font-medium text-green-600">
                {result.finalVerdict?.passedPlatforms || result.platformChecks.length}/{result.platformChecks.length}个平台通过
              </span>
            </div>
            {expandedSections.platformChecks ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
          </button>
          {expandedSections.platformChecks && (
            <div className="p-4 border-t border-stone-100 space-y-4">
              {/* 平台卡片 */}
              <div className="grid grid-cols-2 gap-3">
                {result.platformChecks.map(function(p: { platform: string; icon: string; aiRate: number; aiStandard: string; pass: boolean; riskLevel: string; verdict: string; dimensions: Array<{ name: string; score: number; risk: string; detail: string }> }, i: number) {
                  return (
                    <div key={i} className={`rounded-lg p-3 border ${p.pass ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{p.icon}</span>
                          <span className="text-sm font-semibold text-stone-800">{p.platform}</span>
                        </div>
                        {p.pass ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">通过</span>
                        ) : (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">未通过</span>
                        )}
                      </div>
                      <div className="text-xs text-stone-500 mb-2">标准：{p.aiStandard}</div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-stone-500">AI率</span>
                        <span className={`text-sm font-bold ${p.aiRate < 5 ? 'text-green-600' : p.aiRate < 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {p.aiRate?.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* 风险汇总（基于真实判定，不再硬编码"全部低风险"） */}
              {result.finalVerdict?.allLowRisk ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-semibold text-green-700">所有检测细项均为低风险</span>
                  </div>
                  <p className="text-xs text-green-600">全部平台检测维度均为低风险，无中风险和高风险项。</p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-semibold text-yellow-700">存在中/高风险项</span>
                  </div>
                  <p className="text-xs text-yellow-600">
                    平台通过 {result.finalVerdict?.passedPlatforms || 0}/{result.finalVerdict?.totalPlatforms || result.platformChecks?.length || 0}，
                    仍有检测项为实际中高风险，建议按「优化改进建议」调整后再投。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 改进建议 */}
      {result.improvementSuggestions && result.improvementSuggestions.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <button onClick={function() { toggleSection('improvements') }} className="w-full flex items-center justify-between p-4 hover:bg-stone-50">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              <span className="font-semibold text-stone-800">优化改进建议</span>
              <span className="text-sm font-medium text-stone-500">{result.improvementSuggestions.length}项</span>
            </div>
            {expandedSections.improvements ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
          </button>
          {expandedSections.improvements && (
            <div className="p-4 border-t border-stone-100 space-y-3">
              {result.improvementSuggestions.map(function(item: { category: string; priority: string; status: string; currentValue: string; targetValue: string; suggestions: string[] }, i: number) {
                const statusBadge = item.status === 'good' 
                  ? { bg: 'bg-green-100 text-green-700', text: '良好' }
                  : item.status === 'fair' 
                  ? { bg: 'bg-yellow-100 text-yellow-700', text: '可优化' }
                  : { bg: 'bg-red-100 text-red-700', text: '需改进' }
                return (
                  <div key={i} className="bg-stone-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge.bg}`}>{statusBadge.text}</span>
                        <span className="text-sm font-semibold text-stone-800">{item.category}</span>
                      </div>
                      <span className="text-xs text-stone-500">当前：{item.currentValue} → 目标：{item.targetValue}</span>
                    </div>
                    <ul className="space-y-1">
                      {item.suggestions.map(function(s: string, j: number) {
                        return (
                          <li key={j} className="text-xs text-stone-600 flex items-start gap-1.5">
                            <span className="text-stone-400 mt-0.5">•</span>
                            <span>{s}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}