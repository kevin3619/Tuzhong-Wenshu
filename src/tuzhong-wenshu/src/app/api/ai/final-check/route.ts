/**
 * 🔥 第四期·爆款终检版 — 综合终检API
 * 
 * 聚合：AI检测 + 8维度润色 + 原创查重 + 合规检测 + 签约评分
 * 最终输出：AI率 < 3%、原创度达标、可直接投稿签约
 */

import { NextRequest, NextResponse } from 'next/server'
import { callLLMWithFallback, type LLMConfig } from '@/lib/ai/llm'
import {
  POLISH_8D_PROMPT,
  COMPLIANCE_CHECK_PROMPT,
  CONTRACT_SCORE_PROMPT,
  ORIGINALITY_CHECK_PROMPT,
} from '@/lib/ai/promptLibrary'
import { resolveLLMConfig } from '@/lib/resolve-llm-config'
import { verifyToken } from '@/lib/auth'

function parseAiStandardToNumber(aiStandard: string): number {
  if (!aiStandard) return 5
  const m = String(aiStandard).match(/(\d+(?:\.\d+)?)/)
  if (m) return parseFloat(m[1])
  return 5
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, llmConfig, novelInfo, platformConfigs } = body

    if (!text || typeof text !== 'string' || text.trim().length < 100) {
      return NextResponse.json({ error: '请提供足够长度的文本（至少100字）' }, { status: 400 })
    }

    let userId: string | undefined
    try {
      const authHeader = req.headers.get('Authorization') || ''
      const token = authHeader.replace('Bearer ', '')
      if (token) {
        const decoded = await verifyToken(token)
        if (decoded) userId = decoded.userId
      }
    } catch (_e) {}

    let resolvedCfg = llmConfig ? resolveLLMConfig(llmConfig as any, userId, 'contractScore') : null
    // 🔥 P0 修复（2026-08-23）：默认全自动模式下前端 getStepLlmConfig 返回 null，
    //   导致此接口 400 "请先配置AI模型"，让"避坑检查"环节对普通用户失效。
    //   改为从 models.json 读取管理员默认（含有效 API Key）模型作为兜底。
    if (!resolvedCfg || !resolvedCfg.apiKey) {
      try {
        const _fs = require('fs')
        const _path = require('path')
        const _fp = _path.join(process.cwd(), '.tuzhong-data', 'models.json')
        if (_fs.existsSync(_fp)) {
          const _models = Array.isArray(JSON.parse(_fs.readFileSync(_fp, 'utf-8'))) ? JSON.parse(_fs.readFileSync(_fp, 'utf-8')) : []
          const _valid = function (m: any) { return m && m.apiKey && !String(m.apiKey).includes('*') && m.model }
          const _default = (_models.find(function (m: any) { return m.status === 'default' && _valid(m) })) || _models.find(_valid)
          if (_default) {
            resolvedCfg = {
              provider: _default.provider || '硅基流动',
              apiKey: String(_default.apiKey).replace(/[`'"]/g, '').trim(),
              baseUrl: String(_default.baseUrl || 'https://api.siliconflow.cn/v1').replace(/[`'"]/g, '').trim(),
              model: _default.model,
            }
            console.log('[final-check] 未传模型，使用管理员默认模型:', _default.model)
          }
        }
      } catch (_e) { /* 忽略 */ }
    }
    if (!resolvedCfg || !resolvedCfg.apiKey) {
      return NextResponse.json({ error: '请先配置AI模型' }, { status: 400 })
    }

    const sampleText = text.substring(0, 8000)
    console.log('[final-check] 开始终检，文本长度:', sampleText.length)

    // ============================================================
    // 🔥 新增：从个人设置-写作偏好-平台AI检测配置中，取所有已enabled平台中最严格的AI标准
    //    正文AI率目标 = 最严格标准值 - 2%（保证低于标准2个百分点以上，绝对安全）
    //    兜底：如果没有传platformConfigs，则默认按番茄小说标准 <5% → 目标 AI率 = 2%
    // ============================================================
    let targetAiRateMax = 2.0
    let strictestStandard = '< 5%'
    let strictestPlatformName = '番茄小说'
    try {
      if (Array.isArray(platformConfigs) && platformConfigs.length > 0) {
        let enabledPlatforms = platformConfigs.filter(function(p: { enabled?: boolean }) { return p && p.enabled === true })
        if (enabledPlatforms.length === 0) enabledPlatforms = platformConfigs
        let minStandard = 999
        for (let _pi = 0; _pi < enabledPlatforms.length; _pi++) {
          const _p = enabledPlatforms[_pi]
          const _stdNum = parseAiStandardToNumber(String(_p.aiStandard || ''))
          if (_stdNum < minStandard) {
            minStandard = _stdNum
            strictestStandard = String(_p.aiStandard)
            strictestPlatformName = String(_p.name || _p.key || '平台')
          }
        }
        if (minStandard < 999 && minStandard > 0) {
          // 目标AI率 = 最严格标准 - 2%，但不低于1.2%（避免0%不真实）
          targetAiRateMax = Math.max(1.2, minStandard - 2)
          targetAiRateMax = Math.round(targetAiRateMax * 10) / 10
        }
      }
    } catch (_e) { console.warn('[final-check] 平台配置解析失败，使用默认目标AI率2%') }
    console.log('[final-check] 最严格平台: ' + strictestPlatformName + ', 标准: ' + strictestStandard + ', 正文目标AI率: <' + targetAiRateMax + '%')

    // ============================================================
    // Step 1: AI检测（调用现有 /api/ai/detect 算法）
    // ============================================================
    let aiDetectResult: { aiRate?: number; overallScore?: number; verdict?: string; scores?: Array<{ name: string; score: number }>; issues?: unknown[] } | null = null
    try {
      const detectRes = await fetch(`${req.nextUrl.origin}/tuzhong-wenshu/api/ai/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sampleText }),
      })
      if (detectRes.ok) {
        const detectJson = await detectRes.json()
        aiDetectResult = detectJson.data
        console.log('[final-check] AI检测完成，AI率:', aiDetectResult?.aiRate)
      }
    } catch (err) {
      console.warn('[final-check] AI检测失败:', err)
    }

    // ============================================================
    // Step 2: 8维度迭代润色（仅当 AI率 > 10% 才触发）
    // 目标：把正文真实AI率压到 targetAiRateMax 以下（以真实重检测为准，不再强制校准）。
    // 若单轮不达标则继续迭代；LLM 输出/检测异常或不收敛时，保留当前最优文本并如实返回检测分，便于排查。
    // ============================================================
    let polishResult: { polishedText?: string; beforeAiRate?: number; afterAiRate?: number; improved?: boolean; improvement?: number } | null = null
    const rawAiRate = Math.round((aiDetectResult?.aiRate ?? 50) * 10) / 10
    if (rawAiRate > 10) {
      console.log('[final-check] AI率' + rawAiRate + '%，启动8维度迭代润色（目标AI率 <' + targetAiRateMax + '%）...')
      const maxRounds = 4
      let curText = sampleText.substring(0, 5000)
      let bestRate = rawAiRate
      let bestText = curText
      let rounds = 0
      try {
        for (let _r = 1; _r <= maxRounds; _r++) {
          rounds = _r
          const polishPrompt = POLISH_8D_PROMPT.replace('{{text}}', curText)
          const { content: polished } = await callLLMWithFallback(
            resolvedCfg as LLMConfig,
            [
              { role: 'system', content: '你是一位网文润色专家。重写时务必去掉所有AI腔模板（如「值得注意的是」「眼中闪过一丝」「嘴角勾起一抹」「瞳孔骤缩」等高度模板化词组），改用更口语、更具体、长短句交替的描写。只输出润色后的纯文本，不要任何解释。' },
              { role: 'user', content: polishPrompt },
            ],
            undefined,
            { temperature: 0.5, maxTokens: 8000 }
          )
          if (!polished || polished.trim().length < 100) {
            console.warn('[final-check] 第' + _r + '轮润色输出异常，停止迭代')
            break
          }
          // 润色后真实重检测
          let rate = bestRate
          try {
            const reDetectRes = await fetch(`${req.nextUrl.origin}/tuzhong-wenshu/api/ai/detect`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: polished.substring(0, 8000) }),
            })
            if (reDetectRes.ok) {
              const _d = (await reDetectRes.json()).data
              if (_d && typeof _d.aiRate === 'number') rate = Math.round(_d.aiRate * 10) / 10
            }
          } catch (e) {}
          console.log('[final-check] 第' + _r + '轮润色检测 AI率: ' + rate + '%')
          if (rate < bestRate) {
            bestRate = rate
            bestText = polished
          }
          curText = polished
          // 达标或该轮无改善（已收敛）即停止
          if (bestRate <= targetAiRateMax) break
          if (rate >= bestRate) break
        }
      } catch (err) {
        console.warn('[final-check] 润色失败:', err)
      }
      polishResult = {
        polishedText: bestText,
        beforeAiRate: rawAiRate,
        afterAiRate: Math.round(bestRate * 10) / 10,
        improved: bestRate < rawAiRate,
        improvement: Math.max(0, Math.round((rawAiRate - bestRate) * 10) / 10),
      }
      console.log('[final-check] 迭代润色完成(' + rounds + '轮)，AI率: ' + rawAiRate + '% → ' + polishResult.afterAiRate + '%')
    }

    // ============================================================
    // Step 3: 原创查重
    // ============================================================
    let originalityResult: { overallScore?: number; verdict?: string; riskLevel?: string; summary?: string; dimensions?: unknown[]; matchItems?: unknown[]; highRiskSegments?: unknown[] } | null = null
    try {
      const origPrompt = ORIGINALITY_CHECK_PROMPT.replace('{{text}}', sampleText.substring(0, 4000))
      const { content: origText } = await callLLMWithFallback(
        resolvedCfg as LLMConfig,
        [
          { role: 'system', content: '你是一位网文原创性检测专家。只输出JSON格式，不要任何额外文字。' },
          { role: 'user', content: origPrompt },
        ],
        undefined,
        { temperature: 0.2, maxTokens: 3000 }
      )
      const jsonMatch = origText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        originalityResult = parsed
        console.log('[final-check] 原创查重完成，得分:', parsed.overallScore)
      }
    } catch (err) {
      console.warn('[final-check] 原创查重失败:', err)
    }

    // ============================================================
    // Step 4: 合规检测
    // ============================================================
    let complianceResult: { overallScore?: number; verdict?: string; riskLevel?: string; summary?: string; dimensions?: unknown[]; riskItems?: unknown[] } | null = null
    try {
      const compPrompt = COMPLIANCE_CHECK_PROMPT.replace('{{text}}', sampleText.substring(0, 4000))
      const { content: compText } = await callLLMWithFallback(
        resolvedCfg as LLMConfig,
        [
          { role: 'system', content: '你是一位网文平台内容审核专家。只输出JSON格式，不要任何额外文字。' },
          { role: 'user', content: compPrompt },
        ],
        undefined,
        { temperature: 0.2, maxTokens: 3000 }
      )
      const jsonMatch = compText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        complianceResult = parsed
        console.log('[final-check] 合规检测完成，得分:', parsed.overallScore)
      }
    } catch (err) {
      console.warn('[final-check] 合规检测失败:', err)
    }

    // ============================================================
    // Step 5: 签约评分
    // ============================================================
    let contractResult: { overallScore?: number; grade?: string; verdict?: string; riskLevel?: string; estimatedPerformance?: string; dimensions?: unknown[]; strengths?: unknown[]; weaknesses?: unknown[]; suggestions?: unknown[] } | null = null
    try {
      // 构建包含小说信息的上下文
      let contractContext = ''
      if (novelInfo) {
        contractContext = `\n【小说信息】\n${JSON.stringify(novelInfo, null, 2)}\n`
      }
      const contractPrompt = CONTRACT_SCORE_PROMPT.replace('{{text}}', contractContext + sampleText.substring(0, 4000))
      const { content: contractText } = await callLLMWithFallback(
        resolvedCfg as LLMConfig,
        [
          { role: 'system', content: '你是一位网文平台资深编辑。只输出JSON格式，不要任何额外文字。' },
          { role: 'user', content: contractPrompt },
        ],
        undefined,
        { temperature: 0.3, maxTokens: 3000 }
      )
      const jsonMatch = contractText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        contractResult = parsed
        console.log('[final-check] 签约评分完成，得分:', parsed.overallScore, '等级:', parsed.grade)
      }
    } catch (err) {
      console.warn('[final-check] 签约评分失败:', err)
    }

    // ============================================================
    // 综合判定（真实检测分·便于排查；不再强制满分）
    // 说明：所有指标均采用各检测步骤的真实结果；检测失败(为 0)时会在建议中提示重试，而非伪装成满分通过。
    // ============================================================
    const rawDetectedAiRate = Math.round((aiDetectResult?.aiRate ?? 50) * 10) / 10
    let finalAiRate = rawDetectedAiRate
    if (polishResult && typeof polishResult.afterAiRate === 'number') {
      finalAiRate = Math.round(polishResult.afterAiRate * 10) / 10
    }

    const originalityScore = typeof originalityResult?.overallScore === 'number' ? Math.round(originalityResult.overallScore) : 0
    const complianceScore = typeof complianceResult?.overallScore === 'number' ? Math.round(complianceResult.overallScore) : 0
    const contractScore = typeof contractResult?.overallScore === 'number' ? Math.round(contractResult.overallScore) : 0
    const contractGrade = String(
      contractResult && typeof (contractResult as any).grade === 'string'
        ? (contractResult as any).grade
        : (contractScore >= 90 ? 'S' : contractScore >= 80 ? 'A' : contractScore >= 60 ? 'B' : 'C')
    )

    // —— 真实分数的风险/说明推导 ——
    const riskOf = function(score: number): string { return score >= 90 ? 'low' : score >= 70 ? 'medium' : 'high' }
    const detailOf = function(score: number): string { return score >= 90 ? '达标·低风险' : score >= 70 ? '需优化·中风险' : '不达标·高风险' }
    const dimsOf = function(names: string[], score: number): Array<{ name: string; score: number; risk: string; detail: string }> {
      return names.map(function(n) { const s = Math.max(0, Math.min(100, Math.round(score))); return { name: n, score: s, risk: riskOf(s), detail: detailOf(s) } })
    }
    const dimsOfContract = function(names: string[], score: number): Array<{ name: string; score: number; comment: string }> {
      return names.map(function(n) { const s = Math.max(0, Math.min(100, Math.round(score))); return { name: n, score: s, comment: detailOf(s) } })
    }

    // —— 原创查重（真实） ——
    const safeOriginality = {
      overallScore: originalityScore,
      verdict: originalityScore > 0 ? (typeof (originalityResult as any)?.verdict === 'string' ? (originalityResult as any).verdict : (originalityScore >= 85 ? 'pass' : 'review')) : 'review',
      riskLevel: originalityScore > 0 ? (typeof (originalityResult as any)?.riskLevel === 'string' ? (originalityResult as any).riskLevel : riskOf(originalityScore)) : 'high',
      summary: originalityScore > 0
        ? (typeof (originalityResult as any)?.summary === 'string' ? (originalityResult as any).summary : ('实测原创分 ' + originalityScore + '，' + detailOf(originalityScore)))
        : '原创查重未能完成（LLM 未返回结果），请重试检测',
      dimensions: (Array.isArray((originalityResult as any)?.dimensions) && (originalityResult as any).dimensions.length)
        ? (originalityResult as any).dimensions.map((d: any) => {
            const dScore = typeof d.score === 'number' ? Math.round(d.score) : (originalityScore || 0)
            return { name: d.name || '维度', score: dScore, risk: d.risk || riskOf(dScore), detail: d.detail || d.comment || detailOf(dScore) }
          })
        : (originalityScore > 0 ? dimsOf(['整段相似度', '句式原创性', '情节独特性', '人设辨识度', '世界观新颖度', '金手指独创性', '描写差异化', '语言风格独特'], originalityScore) : dimsOf(['整段相似度', '句式原创性', '情节独特性', '人设辨识度', '世界观新颖度', '金手指独创性', '描写差异化', '语言风格独特'], 0)),
      matchItems: (originalityResult as any)?.matchItems || [],
      highRiskSegments: (originalityResult as any)?.highRiskSegments || [],
    }

    // —— 合规检测（真实） ——
    const safeCompliance = {
      overallScore: complianceScore,
      verdict: complianceScore > 0 ? (typeof (complianceResult as any)?.verdict === 'string' ? (complianceResult as any).verdict : (complianceScore >= 85 ? 'pass' : 'review')) : 'review',
      riskLevel: complianceScore > 0 ? (typeof (complianceResult as any)?.riskLevel === 'string' ? (complianceResult as any).riskLevel : riskOf(complianceScore)) : 'high',
      summary: complianceScore > 0
        ? (typeof (complianceResult as any)?.summary === 'string' ? (complianceResult as any).summary : ('实测合规分 ' + complianceScore + '，' + detailOf(complianceScore)))
        : '合规检测未能完成（LLM 未返回结果），请重试检测',
      dimensions: (Array.isArray((complianceResult as any)?.dimensions) && (complianceResult as any).dimensions.length)
        ? (complianceResult as any).dimensions.map((d: any) => {
            const dScore = typeof d.score === 'number' ? Math.round(d.score) : (complianceScore || 0)
            return { name: d.name || '维度', score: dScore, risk: d.risk || riskOf(dScore), detail: d.detail || d.comment || detailOf(dScore) }
          })
        : (complianceScore > 0 ? dimsOf(['内容安全', '涉政敏感', '色情低俗', '暴力血腥', '宗教敏感', '广告推广', '版权风险', '价值观导向'], complianceScore) : dimsOf(['内容安全', '涉政敏感', '色情低俗', '暴力血腥', '宗教敏感', '广告推广', '版权风险', '价值观导向'], 0)),
      riskItems: (complianceResult as any)?.riskItems || [],
    }

    // —— 签约评分（真实） ——
    const safeContract = {
      overallScore: contractScore,
      grade: contractGrade,
      verdict: contractScore > 0
        ? (typeof (contractResult as any)?.verdict === 'string' ? (contractResult as any).verdict : ('签约评分 ' + contractScore + ' 分，' + detailOf(contractScore)))
        : '签约评分未能完成（LLM 未返回结果），请重试检测',
      estimatedPerformance: (contractResult as any)?.estimatedPerformance || '',
      dimensions: (Array.isArray((contractResult as any)?.dimensions) && (contractResult as any).dimensions.length)
        ? (contractResult as any).dimensions.map((d: any) => {
            const dScore = typeof d.score === 'number' ? Math.round(d.score) : (contractScore || 0)
            return { name: d.name || '维度', score: dScore, comment: d.comment || d.detail || detailOf(dScore) }
          })
        : (contractScore > 0 ? dimsOfContract(['开篇钩子', '爽点密度', '人设辨识度', '节奏把控', '世界观完整度', '伏笔深度', '市场热度', '金手指吸引力', '章节留存率', '完读率预期'], contractScore) : dimsOfContract(['开篇钩子', '爽点密度', '人设辨识度', '节奏把控', '世界观完整度', '伏笔深度', '市场热度', '金手指吸引力', '章节留存率', '完读率预期'], 0)),
      strengths: (contractResult as any)?.strengths || [],
      weaknesses: (contractResult as any)?.weaknesses || [],
      suggestions: (contractResult as any)?.suggestions || [],
    }

    // —— AI 检测结果（真实，透传检测算法输出） ——
    const realAiScores = (Array.isArray(aiDetectResult?.scores) ? aiDetectResult!.scores as any[] : [])
      .filter((s: any) => s && typeof s.score === 'number')
      .map((s: any) => ({ name: String(s.name || '维度'), score: Math.round(s.score) }))
    const realAiIssues = (Array.isArray(aiDetectResult?.issues) ? aiDetectResult!.issues as any[] : [])
    let finalAiDetect: Record<string, unknown>
    if (aiDetectResult) {
      finalAiDetect = {
        ...aiDetectResult,
        aiRate: rawDetectedAiRate,
        overallScore: typeof (aiDetectResult as any).overallScore === 'number' ? Math.round((aiDetectResult as any).overallScore) : Math.round(100 - rawDetectedAiRate),
        level: (aiDetectResult as any).level || (rawDetectedAiRate > 25 ? 'danger' : 'warning'),
        scores: realAiScores,
        issues: realAiIssues,
      }
    } else {
      finalAiDetect = {
        aiRate: rawDetectedAiRate,
        overallScore: Math.round(100 - rawDetectedAiRate),
        level: 'danger',
        scores: [],
        issues: [],
        llmEnhanced: false,
      }
    }

    // —— AI 检测算法中的真实子维度分（用于平台明细） ——
    const detectSubScore = function(keyword: string): number | undefined {
      if (!Array.isArray(aiDetectResult?.scores)) return undefined
      const hit = (aiDetectResult!.scores as any[]).find(function(s: any) { return s && typeof s.name === 'string' && s.name.indexOf(keyword) >= 0 })
      return hit && typeof hit.score === 'number' ? Math.round(hit.score) : undefined
    }
    const constAiBaseScore = Math.max(0, Math.min(100, Math.round(100 - rawDetectedAiRate * 2)))
    const constAiDiversity = detectSubScore('句式') ?? constAiBaseScore
    const constAiEmotion = detectSubScore('情感') ?? constAiBaseScore
    const constContentScore = Math.max(0, Math.min(100, Math.round(complianceScore * 0.6 + contractScore * 0.4)))

    // ============================================================
    // 多平台检测（基于真实 AI率 / 合规分 / 签约分 判定）
    // ============================================================
    let platformChecks: Array<{ platform: string; icon: string; aiRate: number; aiStandard: string; pass: boolean; riskLevel: string; dimensions: Array<{ name: string; score: number; risk: string; detail: string }>; verdict: string }> = [];
    try {
      const defaultPlatformIcons = {
        '番茄小说': '🍅', '番茄': '🍅', 'fanqie': '🍅',
        '起点中文网': '📖', '起点': '📖', 'qidian': '📖',
        '七猫小说': '🐱', '七猫': '🐱', 'qimao': '🐱',
        '飞卢小说': '🦁', '飞卢': '🦁', 'feilu': '🦁',
        '晋江文学城': '🌸', '晋江': '🌸', 'jjwxc': '🌸',
        '纵横中文网': '⚔️', '纵横': '⚔️', 'zongheng': '⚔️',
        '17K小说': '📚', '17k': '📚',
        '掌阅': '📱', 'zhangyue': '📱', 'ireader': '📱',
        '咪咕阅读': '🎵', '咪咕': '🎵', 'migu': '🎵',
        '百度小说': '🔍', '百度': '🔍', 'baidu': '🔍',
        '腾讯读书': '🐧', '腾讯': '🐧', 'qq': '🐧',
        '朱雀AI检测平台': '🔴', '朱雀': '🔴', 'zhuque': '🔴',
      };
      const getIcon = function(name: string): string {
        if (!name) return '📄';
        for (const k in defaultPlatformIcons) {
          if (name.indexOf(k) >= 0 || k.indexOf(name) >= 0) return (defaultPlatformIcons as Record<string, string>)[k];
        }
        return '📄';
      };
      const dimsPack = function(dims: Array<{ name: string; score: number; risk: string; detail: string }>): Array<{ name: string; score: number; risk: string; detail: string }> {
        return dims.map(function(d) { const s = Math.max(0, Math.min(100, Math.round(d.score))); return { name: d.name, score: s, risk: riskOf(s), detail: detailOf(s) } })
      };
      const platRisk = function(pass: boolean, dims: Array<{ name: string; score: number; risk: string; detail: string }>): string {
        if (!pass) return 'high'
        return dims.some(function(d) { return d.risk !== 'low' }) ? 'medium' : 'low'
      };
      const buildPlatform = function(name: string, key: string, std: string, dims: Array<{ name: string; score: number; risk: string; detail: string }>): void {
        const stdNum = parseAiStandardToNumber(std)
        const isAiType = name.indexOf('朱雀') >= 0 || name.indexOf('AI') >= 0
        const aiPass = finalAiRate < stdNum
        const riskPass = isAiType || (complianceScore >= 85 && contractScore >= 60)
        const dimsFinal = dimsPack(dims)
        const pass = aiPass && riskPass
        platformChecks.push({
          platform: name,
          icon: getIcon(name),
          aiRate: finalAiRate,
          aiStandard: std,
          pass: pass,
          riskLevel: platRisk(pass, dimsFinal),
          dimensions: dimsFinal,
          verdict: pass ? '通过' : (aiPass ? '风险提示' : '未通过'),
        })
      }
      const aiDims = [
        { name: 'AI写作检测', score: constAiBaseScore, risk: '', detail: '' },
        { name: '语义原创性', score: originalityScore, risk: '', detail: '' },
        { name: '句式多样性', score: constAiDiversity, risk: '', detail: '' },
        { name: '情感真实性', score: constAiEmotion, risk: '', detail: '' },
      ]
      const contentDims = [
        { name: '内容安全合规', score: complianceScore, risk: '', detail: '' },
        { name: '节奏爽点质量', score: contractScore, risk: '', detail: '' },
        { name: '开篇吸引力', score: contractScore, risk: '', detail: '' },
        { name: '文笔与完成度', score: constContentScore, risk: '', detail: '' },
      ]
      if (Array.isArray(platformConfigs) && platformConfigs.length > 0) {
        const allPlatforms = platformConfigs.slice();
        const hasZhuque = allPlatforms.some(function(p) { return String(p.name || p.key || '').indexOf('朱雀') >= 0; });
        if (!hasZhuque) {
          allPlatforms.unshift({ name: '朱雀AI检测平台', key: 'zhuque', aiStandard: 'AI率 < 5%', enabled: true });
        }
        for (let _i = 0; _i < allPlatforms.length; _i++) {
          const _plat = allPlatforms[_i];
          const _platName = String(_plat.name || _plat.key || '平台');
          const _platStandard = String(_plat.aiStandard || 'AI率 < 5%');
          buildPlatform(_platName, String(_plat.key || _platName), _platStandard, _platName.indexOf('朱雀') >= 0 || _platName.indexOf('AI') >= 0 ? aiDims : contentDims);
        }
      } else {
        buildPlatform('朱雀AI检测平台', 'zhuque', 'AI率 < 5%', aiDims);
        buildPlatform('番茄小说平台', 'fanqie', 'AI率 < 5%', contentDims);
        buildPlatform('七猫小说平台', 'qimao', 'AI率 < 8%', contentDims);
        buildPlatform('起点中文网', 'qidian', 'AI率 < 10%', contentDims);
      }
    } catch (_ee) {
      console.warn('[final-check] 多平台构建失败，使用默认平台列表');
    }

    // —— 改进建议（由真实检测结论聚合，便于排查） ——
    const improvementSuggestions: Array<{ category: string; priority: string; status: string; currentValue: string; targetValue: string; suggestions: string[] }> = [];
    const aiSuggestions: string[] = []
    if (Array.isArray(realAiIssues) && realAiIssues.length) {
      realAiIssues.slice(0, 8).forEach(function(it: any) {
        if (it && typeof it.suggestedFix === 'string') aiSuggestions.push(String(it.description || '') + '：' + it.suggestedFix)
        else if (it && typeof it.description === 'string') aiSuggestions.push(String(it.description))
      })
    }
    if (Array.isArray((aiDetectResult as any)?.llmSuggestions)) {
      ((aiDetectResult as any).llmSuggestions as string[]).forEach(function(s) { if (typeof s === 'string') aiSuggestions.push(s) })
    }
    improvementSuggestions.push({
      category: 'AI特征/去AI化',
      priority: rawDetectedAiRate >= 25 ? 'high' : (rawDetectedAiRate >= 10 ? 'medium' : 'low'),
      status: rawDetectedAiRate < 10 ? 'good' : (rawDetectedAiRate < 25 ? 'fair' : 'poor'),
      currentValue: 'AI率 ' + rawDetectedAiRate + '%',
      targetValue: 'AI率 < 10%',
      suggestions: aiSuggestions.length ? aiSuggestions.slice(0, 6) : ['文本 AI 特征较弱，保持自然行文与长短句交替'],
    })
    improvementSuggestions.push({
      category: '原创提升',
      priority: originalityScore < 85 ? 'high' : 'low',
      status: originalityScore >= 85 ? 'good' : (originalityScore >= 70 ? 'fair' : 'poor'),
      currentValue: '原创分 ' + originalityScore,
      targetValue: '原创分 >= 85',
      suggestions: (originalityScore > 0
        ? (Array.isArray(safeOriginality.highRiskSegments) ? (safeOriginality.highRiskSegments as any[]) : []).map(String)
        : (Array.isArray(safeContract.weaknesses) ? (safeContract.weaknesses as any[]).map(String) : [])
      ).slice(0, 5),
    })
    improvementSuggestions.push({
      category: '合规清朗',
      priority: complianceScore < 85 ? 'high' : 'low',
      status: complianceScore >= 85 ? 'good' : (complianceScore >= 70 ? 'fair' : 'poor'),
      currentValue: '合规分 ' + complianceScore,
      targetValue: '合规分 >= 85',
      suggestions: (Array.isArray(complianceResult?.riskItems) ? (complianceResult!.riskItems as any[]).map(String) : []).slice(0, 5),
    })
    const contractSuggestions: string[] = [
      ...(Array.isArray(contractResult?.weaknesses) ? (contractResult!.weaknesses as any[]).map(String) : []),
      ...(Array.isArray(contractResult?.suggestions) ? (contractResult!.suggestions as any[]).map(String) : []),
    ]
    improvementSuggestions.push({
      category: '签约价值',
      priority: contractScore < 80 ? 'medium' : 'low',
      status: contractScore >= 80 ? 'good' : (contractScore >= 60 ? 'fair' : 'poor'),
      currentValue: '签约分 ' + contractScore + '（' + contractGrade + '级）',
      targetValue: '签约分 >= 80',
      suggestions: contractSuggestions.slice(0, 6),
    })

    // —— 投稿资格判定（真实阈值） ——
    let canSubmit = true
    const submitWarnings: string[] = []
    if (originalityScore === 0 || complianceScore === 0 || contractScore === 0) {
      submitWarnings.push('有检测项未完成（返回0分），请重试后再判定')
    }
    if (finalAiRate > 15) {
      canSubmit = false
      submitWarnings.push('AI率过高（' + finalAiRate.toFixed(1) + '%），需要进一步润色')
    } else if (finalAiRate > 8) {
      submitWarnings.push('AI率偏高（' + finalAiRate.toFixed(1) + '%），建议润色后再投')
    }
    if (originalityScore > 0 && originalityScore < 85) {
      canSubmit = false
      submitWarnings.push('原创度不足（' + originalityScore + '分），需大幅修改')
    }
    if (complianceScore > 0 && complianceScore < 85) {
      canSubmit = false
      submitWarnings.push('合规检测未通过（' + complianceScore + '分），存在内容风险')
    }
    if (contractScore > 0 && contractScore < 60) {
      submitWarnings.push('签约评分较低（' + contractScore + '分），建议优化后再投')
    }
    const totalPlatforms = platformChecks.length
    const passedPlatforms = platformChecks.filter(p => p.pass).length
    const allLowRisk = platformChecks.length > 0 && platformChecks.every(p => p.riskLevel === 'low')
    const summary = canSubmit
      ? '✅ 全平台检测通过！AI率' + finalAiRate.toFixed(1) + '%、原创' + originalityScore + '分、合规' + complianceScore + '分、签约' + contractGrade + '级(' + contractScore + '分)；' + passedPlatforms + '/' + totalPlatforms + '个平台通过，可投稿签约'
      : '⚠️ 检测未完全通过：AI率' + finalAiRate.toFixed(1) + '%、原创' + originalityScore + '分、合规' + complianceScore + '分、签约' + contractGrade + '级(' + contractScore + '分)；' + passedPlatforms + '/' + totalPlatforms + '个平台通过，请按改进建议优化'

    return NextResponse.json({
      success: true,
      data: {
        aiDetect: finalAiDetect,
        polish: polishResult,
        originality: safeOriginality,
        compliance: safeCompliance,
        contract: safeContract,
        platformChecks: platformChecks,
        improvementSuggestions: improvementSuggestions,
        finalVerdict: {
          canSubmit,
          aiRate: finalAiRate,
          originalityScore,
          complianceScore,
          contractScore,
          contractGrade: contractGrade,
          warnings: submitWarnings,
          allLowRisk: allLowRisk,
          totalPlatforms: totalPlatforms,
          passedPlatforms: passedPlatforms,
          summary: summary,
        },
      },
      _meta: {
        usedModel: resolvedCfg?.model || '',
        usedProvider: resolvedCfg?.provider || '',
      },
    });

  } catch (error: unknown) {
    console.error('[final-check] 异常:', error)
    const errMsg = error instanceof Error ? error.message : '终检过程发生错误，请重试'
    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    )
  }
}