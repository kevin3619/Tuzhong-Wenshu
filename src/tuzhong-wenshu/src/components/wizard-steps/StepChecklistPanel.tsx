'use client'

/**
 * StepChecklistPanel —— 「全环节避坑检查」纯展示面板（#226c / #226Q）
 *
 * 背景：
 *   全站导航中的「避坑检查」实际落在 finalCheck 步骤，渲染 StepFinalCheck。
 *   本面板被 StepFinalCheck 内嵌到「开始终检」空态与终检结果页**最上方**，
 *   让用户在点击「爆款终检」之前即可看到覆盖 idea / synopsis / 世界观 / 力量体系 /
 *   人物 / 势力 / 关系 / 大纲 / 关键情节 / 卷 / 章 / 正文 全链路的 55 条真实判定结果。
 *
 * 铁律：
 *   1. 纯展示组件 —— 规则计算全部委托 src/lib/ai/pitfallRules.ts 的 runPitfallCheck，
 *      本文件不重复实现任何判定逻辑，也不 import 任何 Next.js 服务端能力。
 *   2. 未通过项置顶（block > warn > info > 通过），便于用户优先处理阻断项。
 *   3. 「一键修复全部」在 onRepairAll 存在时即可点击（不再有「即将上线」置灰路径）；
 *      修复进度 / 结果摘要 / 失败明细由父级 repairState 驱动展示，本组件不自持修复逻辑。
 */

import { useMemo } from 'react'
import { Wrench, Shield, CheckCircle, AlertTriangle, Info, Loader2 } from 'lucide-react'
import { runPitfallCheck } from '@/lib/ai/pitfallRules'
import type { PitfallItem, PitfallSeverity, PitfallResult } from '@/lib/ai/pitfallRules'

/** 单条修复失败项（title + reason，供 UI 明确列出，不得静默吞掉）。 */
export interface RepairFailureItem {
  /** PitfallItem.id */
  id: string
  /** 判定标题 */
  title: string
  /** 失败原因（如 timeout / no-unique-title-candidate / batch-request-failed） */
  reason: string
}

/**
 * 一键修复进度状态（由父级 ai-generate-wizard 持有并以 prop 回传）。
 * 与「通过率」进度条语义分离：通过率 = 判定结果的达标比例，本状态 = 修复作业的推进进度。
 */
export interface RepairState {
  /** 是否正在修复中（true 时按钮文案变「修复中…」并禁用） */
  running: boolean
  /** 已完成修复条数 */
  done: number
  /** 待修复总条数 */
  total: number
  /** 失败条数 */
  failed: number
  /** 结果摘要（如「全部通过，无需修复」/「修复完成：未通过 37 → 2」） */
  message?: string
  /** 当前阶段（可选，仅用于文案/配色细分） */
  phase?: 'checking' | 'deterministic' | 'llm' | 'done' | 'error'
  /** 失败明细（可选；存在时在汇总条下方逐条列出） */
  failures?: RepairFailureItem[]
}

interface StepChecklistPanelProps {
  /** 整包生成数据（idea / synopsis / 世界观 / 人物 / 势力 / 关系 / 大纲 / 关键情节 / 卷 / 章 / 正文） */
  data: any
  /** 一键修复全部未通过项；存在即可点击 */
  onRepairAll?: () => void
  /** 一键修复进度状态（父级持有，纯展示） */
  repairState?: RepairState | null
}

/**
 * 失败项排序权重：block > warn > info > 通过。
 * 返回数字越小越靠前，故未通过项会被排到分组顶部。
 */
function failRank(item: PitfallItem): number {
  if (item.passed) return 4
  if (item.severity === 'block') return 0
  if (item.severity === 'warn') return 1
  return 2
}

/** 单项视觉样式：block 红 / warn 黄 / info 灰蓝 / 通过 绿（沿用仓库既有 stone 暗色系）。 */
function itemStyle(item: PitfallItem): { box: string; text: string; icon: string } {
  if (item.passed) return { box: 'bg-green-50 border-green-200', text: 'text-green-700', icon: 'text-green-500' }
  if (item.severity === 'block') return { box: 'bg-red-50 border-red-300', text: 'text-red-700', icon: 'text-red-500' }
  if (item.severity === 'warn') return { box: 'bg-amber-50 border-amber-300', text: 'text-amber-700', icon: 'text-amber-500' }
  return { box: 'bg-slate-50 border-slate-200', text: 'text-slate-700', icon: 'text-slate-400' }
}

/** 严重度徽章文案与配色。 */
function severityBadge(sev: PitfallSeverity): { label: string; cls: string } {
  if (sev === 'block') return { label: '阻断', cls: 'bg-red-100 text-red-700' }
  if (sev === 'warn') return { label: '警告', cls: 'bg-amber-100 text-amber-700' }
  return { label: '提示', cls: 'bg-slate-200 text-slate-600' }
}

export default function StepChecklistPanel({ data, onRepairAll, repairState }: StepChecklistPanelProps) {
  // 规则引擎为纯函数，用 useMemo 避免每次渲染重算
  const result: PitfallResult = useMemo(function () {
    return runPitfallCheck(data || {})
  }, [data])

  const groups = result.groups
  const summary = result.summary
  const total = summary.total || 0
  const passed = summary.passed || 0
  const failed = summary.failed || 0
  const progress = total > 0 ? Math.round((passed / total) * 100) : 0

  // ── 修复进度（与「通过率」条语义分离，另起一条琥珀色进度条） ──
  const repairing = !!(repairState && repairState.running)
  const repairTotal = repairState ? (repairState.total || 0) : 0
  const repairDone = repairState ? (repairState.done || 0) : 0
  const repairFailed = repairState ? (repairState.failed || 0) : 0
  const repairPercent = repairTotal > 0 ? Math.min(100, Math.round((repairDone / repairTotal) * 100)) : 0
  const failures = (repairState && Array.isArray(repairState.failures)) ? repairState.failures : []
  const showRepairBlock = !!repairState && (repairing || !!repairState.message || repairTotal > 0 || failures.length > 0)
  const canRepair = !!onRepairAll && !repairing

  return (
    <div className="space-y-4">
      {/* 标题带 + 一键修复 + 汇总 */}
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-gradient-to-r wenshu-title-band shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-stone-800" />
              <div>
                <h3 className="text-lg font-bold text-stone-900">全环节避坑检查</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  覆盖 创意 / 简介 / 世界观 / 力量体系 / 人物 / 势力 / 关系 / 大纲 / 关键情节 / 卷 / 章 / 正文（番茄 · 七猫 · 起点 2026 标准）
                </p>
              </div>
            </div>
            {/* 一键修复：onRepairAll 存在即可点击；修复中显示「修复中…」并禁用 */}
            <button
              type="button"
              onClick={onRepairAll}
              disabled={!canRepair}
              title={onRepairAll ? '一键修复全部未通过项' : '暂不可用'}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0 ${
                repairing
                  ? 'text-stone-700 bg-amber-100 border border-amber-300 cursor-wait'
                  : onRepairAll
                    ? 'text-white wenshu-btn-primary hover:opacity-90'
                    : 'text-stone-400 bg-stone-100 border border-stone-200 cursor-not-allowed'
              }`}
            >
              {repairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
              {repairing ? '修复中…' : '一键修复全部'}
            </button>
          </div>

          {/* 汇总条：总计 55 条 · 通过 N · 失败 M */}
          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="text-sm text-stone-700">
              总计 <span className="font-bold text-stone-900">{total}</span> 条 ·
              通过 <span className="font-bold text-green-600">{passed}</span> ·
              失败 <span className={`font-bold ${failed > 0 ? 'text-red-600' : 'text-stone-500'}`}>{failed}</span>
              {summary.block > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  {summary.block} 项阻断
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-stone-800">{progress}%</div>
          </div>
          <div className="mt-2 h-3 bg-stone-200 rounded-full overflow-hidden">
            <div className="h-full wenshu-btn-primary transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>

          {/* 修复进度（独立于「通过率」的作业进度条）+ 结果摘要 + 失败明细 */}
          {showRepairBlock && (
            <div className="mt-3 pt-3 border-t border-stone-200/70">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-stone-700 flex items-center gap-2 flex-wrap">
                  {repairing && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />}
                  <span>
                    {repairing ? '正在修复 ' : '修复进度 '}
                    <span className="font-bold text-stone-900">{repairDone}</span>
                    <span className="text-stone-400">/</span>
                    <span className="font-bold text-stone-900">{repairTotal}</span>
                    {repairing ? '…' : ''}
                  </span>
                  {repairFailed > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      {repairFailed} 项失败
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-amber-600">{repairPercent}%</div>
              </div>
              <div className="mt-2 h-2 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${repairFailed > 0 ? 'bg-red-500' : 'bg-amber-500'}`}
                  style={{ width: `${repairPercent}%` }}
                />
              </div>

              {repairState && repairState.message && (
                <div className={`mt-2 text-sm ${
                  repairState.phase === 'error' ? 'text-red-600' : (repairFailed > 0 ? 'text-amber-700' : 'text-green-700')
                }`}>
                  {repairState.message}
                </div>
              )}

              {failures.length > 0 && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-xs font-semibold text-red-700 mb-1">以下 {failures.length} 项未能自动修复：</div>
                  <ul className="space-y-0.5">
                    {failures.map(function (f, i) {
                      return (
                        <li key={f.id || i} className="text-xs text-red-600 break-words">• {f.title}：{f.reason}</li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 分组检查项 */}
      {groups.map(function (group) {
        const gPass = group.items.filter(function (i) { return i.passed }).length
        const gTotal = group.items.length
        const gBlockFail = group.items.filter(function (i) { return !i.passed && i.severity === 'block' }).length
        // 未通过项置顶（block > warn > info > 通过）
        const ordered = [...group.items].sort(function (a, b) { return failRank(a) - failRank(b) })
        return (
          <div key={group.key} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="bg-stone-50 px-5 py-3 border-b border-stone-200">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-stone-900">{group.label}</h4>
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
            <div className="p-4 space-y-2">
              {ordered.map(function (item) {
                const st = itemStyle(item)
                const badge = severityBadge(item.severity)
                return (
                  <div key={item.id} className={`w-full flex items-start gap-3 p-3 rounded-lg text-left border ${st.box}`}>
                    <div className="mt-0.5 shrink-0">
                      {item.passed ? (
                        <CheckCircle className={`w-4 h-4 ${st.icon}`} />
                      ) : item.severity === 'info' ? (
                        <Info className={`w-4 h-4 ${st.icon}`} />
                      ) : (
                        <AlertTriangle className={`w-4 h-4 ${st.icon}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium flex items-center gap-2 flex-wrap text-sm ${st.text}`}>
                        <span>{item.title}</span>
                        {!item.passed && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                        )}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5 break-words">{item.detail}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {total === 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-5 text-sm text-stone-500">
          尚未生成任何环节内容，无法执行避坑检查。请先完成创意 / 世界观 / 大纲 / 章节等环节。
        </div>
      )}
    </div>
  )
}
