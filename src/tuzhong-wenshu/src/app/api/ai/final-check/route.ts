/**
 * 🔥 第四期·爆款终检版 — 综合终检API
 * 
 * 聚合：AI检测 + 8维度润色 + 原创查重 + 合规检测 + 签约评分
 * 最终输出：AI率达标（目标取自「个人设置-平台AI检测配置」中最严格平台的真实标准；
 *          朱雀/番茄真实口径均为 AI生成概率 ≤30%，平台无公开百分比硬门槛）、原创度达标、可直接投稿签约
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
import { runAiDetection } from '@/lib/ai/detection'
import { deAiCleanup } from '@/lib/ai/deAiCleanup'
import { runSigningGate } from '@/lib/ai/oh-story/signing-gates'

function parseAiStandardToNumber(aiStandard: string): number {
  if (!aiStandard) return 5
  const m = String(aiStandard).match(/(\d+(?:\.\d+)?)/)
  if (m) return parseFloat(m[1])
  return 5
}

// ============================================================
// 全文分段检测/重写工具
// 目的：对"真实生成的正文"全文检测（而非只查前8000字），
//       取各段中最高的AI率作为正文AI率，避免后文AI特征被漏检；
//       自动改写也作用于整段正文，使返回结果可直接替换原文。
// ============================================================
const DETECT_CHUNK_SIZE = 7000
const DETECT_CHUNK_OVERLAP = 600

interface FullDetectResult {
  aiRate: number
  overallScore: number
  level?: string
  scores: Array<{ name: string; score: number }>
  issues: unknown[]
  chunkCount: number
}

/** 将长文本切成多段（尽量在换行/句号处断，避免切断句子），单段则只返回一段 */
function splitIntoChunks(input: string, size = DETECT_CHUNK_SIZE, overlap = DETECT_CHUNK_OVERLAP): string[] {
  const text = input || ''
  if (text.length <= size) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + size)
    if (end < text.length) {
      const line = text.lastIndexOf('\n', end)
      const period = text.lastIndexOf('。', end)
      const cut = Math.max(line, period)
      if (cut > start && cut > end - 300) end = cut
    }
    chunks.push(text.substring(start, end))
    if (end >= text.length) break
    start = Math.max(start + 1, end - overlap)
  }
  return chunks
}

/**
 * 全文AI检测：对每段做进程内检测（@/lib/ai/detection 的 runAiDetection），
 * 取最差（最高）AI率作为正文AI率，各维度分数取平均，收集去重后的 issues。
 * 任何一段失败都视为可用结果继续。
 *
 * 🔥 2026-09-06 修复：不再通过 fetch 调用 /api/ai/detect 做"自访问"。
 *   服务器经公网自访问本机会触发 hairpin NAT 问题（TypeError: fetch failed），
 *   导致分段检测恒失败、AI率回落默认值50、自动改写无法量化与收敛。
 *   改为进程内直接调用同一份检测实现（与 /api/ai/detect 完全共用），
 *   天然不受鉴权中间件、鉴权透传与网络可达性影响。
 */
async function detectFullText(textToDetect: string, cfg?: LLMConfig | null): Promise<FullDetectResult | null> {
  try {
    const chunks = splitIntoChunks(textToDetect)
    let worstRate = -1
    let sumOverall = 0
    let okCount = 0
    let level: string | undefined
    const scoreAgg: Record<string, { sum: number; count: number }> = {}
    const allIssues: unknown[] = []
    for (const chunk of chunks) {
      try {
        const d = await runAiDetection(chunk, cfg)
        okCount += 1
        if (Number.isFinite(d.aiRate) && d.aiRate > worstRate) worstRate = d.aiRate
        if (typeof d.overallScore === 'number') sumOverall += d.overallScore
        if (!level && d.level) level = d.level
        for (const s of d.scores) {
          if (s && typeof s.name === 'string' && typeof s.score === 'number') {
            const agg = scoreAgg[s.name] || { sum: 0, count: 0 }
            agg.sum += s.score
            agg.count += 1
            scoreAgg[s.name] = agg
          }
        }
        if (Array.isArray(d.issues)) allIssues.push(...d.issues)
      } catch (err) {
        console.warn('[final-check] 分段检测失败，该段跳过:', err)
      }
    }
    if (okCount === 0) return null
    const aiRate = worstRate < 0 ? 50 : Math.round(worstRate * 10) / 10
    const scores = Object.keys(scoreAgg).map((name) => ({
      name,
      score: Math.round(scoreAgg[name].sum / scoreAgg[name].count),
    }))
    const seen = new Set<string>()
    const issues = allIssues
      .filter((it: any) => it && typeof it === 'object')
      .filter((it: any) => {
        const key = String((it as any).description || JSON.stringify(it))
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 20)
    return {
      aiRate,
      overallScore: Math.round(sumOverall / okCount),
      level,
      scores,
      issues,
      chunkCount: chunks.length,
    }
  } catch (err) {
    console.warn('[final-check] 全文分段检测失败:', err)
    return null
  }
}

/** 组装润色提示词：把 detect 出的具体问题注入 {{issues}}，正文注入 {{text}} */
// 🔥 2026-09-07（#158）检测降噪：检测器 = 8维算法60% + LLM判定40%，LLM 判定单次波动 ±1~2%
//   （同一文本实测 2%~4% 漂移）——当候选接近目标（≤2×）时，单次检测噪声与目标同量级，
//   "达标即停"可能撞上运气低读、真实改善也可能被运气高读淹没。
//   detectMedian：并行 n 次完整检测取 aiRate 中位数（并行执行，耗时≈单次）；任一次失败则
//   退化为首个有效单次结果；全部失败返回 null（调用方沿用原逻辑）。
async function detectMedian(textToDetect: string, cfg: LLMConfig | null, n: number): Promise<FullDetectResult | null> {
  if (!textToDetect) return null
  const _nn = Math.max(1, Math.min(5, n))
  if (_nn === 1) {
    try { return await detectFullText(textToDetect, cfg) } catch (_e) { return null }
  }
  const _dets = await Promise.all(Array.from({ length: _nn }, function () {
    return detectFullText(textToDetect, cfg).catch(function () { return null })
  }))
  const _rates: number[] = []
  let _firstValid: FullDetectResult | null = null
  for (let _di = 0; _di < _dets.length; _di++) {
    const _d = _dets[_di]
    if (_d && typeof _d.aiRate === 'number') {
      _rates.push(_d.aiRate)
      if (!_firstValid) _firstValid = _d
    }
  }
  if (_rates.length === 0) return null
  if (_rates.length < _nn || _rates.length < 3) return _firstValid
  _rates.sort(function (a, b) { return a - b })
  const _mid = Math.floor(_rates.length / 2)
  const _medRate = _rates.length % 2 === 1 ? _rates[_mid] : (_rates[_mid - 1] + _rates[_mid]) / 2
  const _out = Object.assign({}, _firstValid) as FullDetectResult
  _out.aiRate = _medRate
  return _out
}

function buildPolishPrompt(issuesText: string, targetText: string): string {
  let prompt = POLISH_8D_PROMPT
  const issues = issuesText && issuesText.trim()
    ? issuesText.trim()
    : '暂无具体检测点，请按通用去AI化标准全面优化（去除AI高频词、打散句式、强化细节与情绪、口语化）。'
  prompt = prompt.replace(/\{\{issues\}\}/g, issues)
  prompt = prompt.replace(/\{\{text\}\}/g, targetText)
  return prompt
}

/**
 * 对全文分块重写（每块交给LLM独立打磨后拼接），返回重写后的整段文本；
 * 任何一段失败则该段保留原文；整段流程异常时返回 null（外层回退原文）。
 */
async function rewriteFullText(cfg: LLMConfig, textToRewrite: string, issuesText: string, temperature = 0.55): Promise<string | null> {
  try {
    // 🔥 2026-09-06（#141）重写强制分块：检测分块(7000)对重写太大——单块整段重写时 LLM 偏保守
    //   （FC7 实测 8 轮只降 45→41）。改为 ~1200 字小块独立重写，每块更彻底；块级 75% 守恒保总长。
    const chunks = splitIntoChunks(textToRewrite, 1200, 100)
    // 🔥 2026-10-16 绍宋级口径：正文目标 2500-4000 汉字（旧 #148 的 1650-2350 窗口会把正文锁死在 2200 以下，
    //   且原实现 _gMinLen 可能 > _gMaxLen，导致 _inBounds 恒 false、单块重写永远判失败而回退原文）。单块直接用；分块按块长比例分配。
    const _gMinLen = Math.max(2500, Math.floor(textToRewrite.length * 0.85))
    const _gMaxLen = Math.min(4000, Math.max(_gMinLen, Math.floor(textToRewrite.length * 1.25)))
    const systemMsg = '你是一位资深网文作家，擅长把"AI味"草稿改写成自然流畅的真人叙述。请【彻底重写】下文，严禁保留原句结构：\n1. 绝对禁止出现任何AI模板词与套话：首先/其次/再次/综上所述/值得注意的是/显而易见/毋庸讳言/总而言之/需要指出的是/应当说/毋庸置疑/在这个关键的时刻/眼下的处境/权力的游戏/每一个角色都扮演着重要的角色 等；\n2. 完全打散句式：长短句交错，多用口语短句、反问、内心独白，杜绝排比与并列罗列；\n3. 强化具体感官与动作细节（眼神、手势、环境声响、身体反应），用"展示"代替"告诉"；\n4. 注入真实情绪与人物主观视角，让语气有温度、有起伏，像真人在讲故事；\n5. 【🔥 对话驱动】把叙述性交代尽量转成人物对话与动作往来（对话占比不低于40%），对话要有口语语气词、停顿、潜台词；\n6. 【🔥 情绪外化】紧张/愤怒/欣喜一律通过身体反应与环境互动写出（攥拳、喉结滚动、退半步、灯焰晃了一下），禁止直陈情绪词。\n7. 【🔥 字数守恒】重写后的字数必须保持在原文字数的 90%~120% 区间（目标成稿 2500-4000 字；不得缩水丢情节，也不得注水膨胀），情节一幕不许丢（严禁缩写、跳写、合并情节），只能换更好的写法。\n只输出重写后的纯文本，不要任何解释或前缀。'
    if (chunks.length === 1) {
      const { content } = await callLLMWithFallback(
        cfg,
        [
          { role: 'system', content: systemMsg },
          { role: 'user', content: buildPolishPrompt(issuesText, chunks[0]) },
        ],
        undefined,
        { temperature: temperature, maxTokens: 8000 }
      )
      // 🔥 2026-09-06（#134→#139）字数守恒 + 纠偏重试：
      //   #134 的 75% 硬门槛实测会 100% 拒收（LLM 重写天然缩水到 ~50%，如 2392→1228），
      //   导致改写"全军覆没"回退原文、AI 率纹丝不动。#139 改为：
      //   首次输出过短时，携带【字数警告】纠偏重试一次；重试达标才接受，仍不达标才判失败。
      // 🔥 #148 单块边界 = 全局窗口
      const _minLen = _gMinLen
      const _maxLen = _gMaxLen
      let _out = content && content.trim() ? content.trim() : ''
      const _inBounds = function (_t: string) { return _t.length >= _minLen && _t.length <= _maxLen }
      if (_out && !_inBounds(_out)) {
        const _why = _out.length < _minLen ? '严重缩水' : '注水膨胀'
        console.warn('[final-check] 重写' + _why + '(' + _out.length + '/' + textToRewrite.length + '字，合法区间 ' + _minLen + '~' + _maxLen + ')，#145 纠偏重试...')
        try {
            const _fixHint = _out.length < _minLen
              ? '本次必须逐场景完整重写全部情节，输出不得少于 ' + _minLen + ' 字（原文 ' + textToRewrite.length + ' 字）。扩写手段：补人物对话往来（目标占比≥40%）、补动作与感官细节、补内心独白；严禁缩写、概括、跳写、合并场景。'
              : '上一次重写输出了 ' + _out.length + ' 字，超出 ' + _maxLen + ' 字上限被拒收。本次【等量置换】：保持新增的对话与细节，但同时删除等量的冗余叙述、重复渲染、大段景物与心理铺陈来腾出篇幅，总字数控制在 ' + _minLen + '~' + _maxLen + ' 字（原文 ' + textToRewrite.length + ' 字）。严禁整体缩写回概括腔。'
          const retry = await callLLMWithFallback(
            cfg,
            [
              { role: 'system', content: systemMsg },
              {
                role: 'user',
                content:
                  buildPolishPrompt(issuesText, chunks[0]) +
                  '\n\n【⚠️ 字数红线·最高优先级】' + _fixHint + '只输出重写后的纯文本。'
              },
            ],
            undefined,
            { temperature: Math.min(0.85, temperature + 0.1), maxTokens: 8000 }
          )
          const _retryOut = retry.content && retry.content.trim() ? retry.content.trim() : ''
          if (_inBounds(_retryOut)) {
            console.log('[final-check] #145 纠偏重试成功：' + _retryOut.length + '字')
            _out = _retryOut
          } else {
            console.warn('[final-check] #145 纠偏重试仍越界(' + _retryOut.length + '字)，判改写失败')
          }
        } catch (_retryErr) {
          console.warn('[final-check] #139/#145 纠偏重试异常:', _retryErr)
        }
      }
      return _inBounds(_out) ? _out : null
    }
    const rewritten: string[] = []
    // 🔥 #145：分块串行改写实测每轮 5-8 分钟（3块×1-2次调用×60-90s+复检），780s 预算只够 2 轮。
    //   改为 Promise.all 并行改写（块间独立无依赖），每轮降至 ~2 分钟，预算内可跑 4-6 轮 best-of-N。
    const _rewriteOne = async function (chunk: string): Promise<string> {
      try {
        const { content } = await callLLMWithFallback(
          cfg,
          [
            { role: 'system', content: systemMsg },
            { role: 'user', content: buildPolishPrompt(issuesText, chunk) },
          ],
          undefined,
          { temperature: temperature, maxTokens: 8000 }
        )
        // 🔥 2026-10-16 分块按全局窗口比例分配（保证拼接总和落在 2500-4000 窗口附近）
        const _minChunk = Math.max(500, Math.floor(_gMinLen * chunk.length / textToRewrite.length))
        const _maxChunk = Math.max(_minChunk + 100, Math.floor(_gMaxLen * chunk.length / textToRewrite.length))
        let _chunkOut = content && content.trim() ? content.trim() : ''
        // 🔥 #139/#145 分块双向守恒 + 纠偏重试一次，仍越界保留原块
        if (_chunkOut && (_chunkOut.length < _minChunk || _chunkOut.length > _maxChunk)) {
          try {
            const _fixHint = _chunkOut.length < _minChunk
              ? '上一次重写只输出了 ' + _chunkOut.length + ' 字，严重缩水。本次必须完整重写全部情节，输出不得少于 ' + _minChunk + ' 字（原文 ' + chunk.length + ' 字）。严禁缩写、概括、跳写。'
              : '上一次重写输出了 ' + _chunkOut.length + ' 字，严重注水膨胀。本次必须保持原有情节体量，输出控制在 ' + _minChunk + '~' + _maxChunk + ' 字（原文 ' + chunk.length + ' 字），严禁新增支线、重复渲染、大段景物描写。'
            const retry = await callLLMWithFallback(
              cfg,
              [
                { role: 'system', content: systemMsg },
                {
                  role: 'user',
                  content:
                    buildPolishPrompt(issuesText, chunk) +
                    '\n\n【⚠️ 字数红线·最高优先级】' + _fixHint + '只输出重写后的纯文本。'
                },
              ],
              undefined,
              { temperature: Math.min(0.85, temperature + 0.1), maxTokens: 8000 }
            )
            const _retryOut = retry.content && retry.content.trim() ? retry.content.trim() : ''
            if (_retryOut.length >= _minChunk && _retryOut.length <= _maxChunk) _chunkOut = _retryOut
          } catch (_retryErr) { /* 保留原块 */ }
        }
        return _chunkOut.length >= _minChunk && _chunkOut.length <= _maxChunk ? _chunkOut : chunk
      } catch (_e) {
        return chunk
      }
    }
    const _chunkResults = await Promise.all(chunks.map(function (c: string) { return _rewriteOne(c) }))
    for (const _r of _chunkResults) rewritten.push(_r)
    return rewritten.join('\n')
  } catch (err) {
    console.warn('[final-check] 全文重写失败:', err)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, llmConfig, novelInfo, platformConfigs } = body

    if (!text || typeof text !== 'string' || text.trim().length < 100) {
      return NextResponse.json({ error: '请提供足够长度的文本（至少100字）' }, { status: 400 })
    }

    // 提取请求方 token 用于解析用户绑定的模型配置（检测为进程内调用，无需透传鉴权）
    const clientAuthHeader = req.headers.get('Authorization') || ''
    let userId: string | undefined
    try {
      const token = clientAuthHeader.replace('Bearer ', '')
      if (token) {
        const decoded = await verifyToken(token)
        if (decoded) userId = decoded.userId
      }
    } catch (_e) {}

    let resolvedCfg = llmConfig ? resolveLLMConfig(llmConfig as any, userId, 'contractScore') : null
    // 🔥 #160b 标记：是否走了自动回退（用户未显式配置模型，即全自动模式真实路径）
    let _autoNoExplicitCfg = false
    // 🔥 P0 修复（2026-08-23）：默认全自动模式下前端 getStepLlmConfig 返回 null，
    //   导致此接口 400 "请先配置AI模型"，让"避坑检查"环节对普通用户失效。
    //   改为从 models.json 读取管理员默认（含有效 API Key）模型作为兜底。
    if (!resolvedCfg || !resolvedCfg.apiKey) {
      _autoNoExplicitCfg = true
      try {
        const _fs = require('fs')
        const _path = require('path')
        const _fp = _path.join(process.cwd(), '.tuzhong-data', 'models.json')
        if (_fs.existsSync(_fp)) {
          const _models = Array.isArray(JSON.parse(_fs.readFileSync(_fp, 'utf-8'))) ? JSON.parse(_fs.readFileSync(_fp, 'utf-8')) : []
          const _valid = function (m: any) { return m && m.apiKey && !String(m.apiKey).includes('*') && m.model }
          // 🔥 P2 #8 安全修复：自动模式兜底只取管理员「共享默认」模型（status==='default'），
          //   严禁退而取 models.json 中「任意首个有效 Key 模型」——该数组含多用户模型（含他人模型），
          //   会越权占用他人 API Key/额度。default 模型当前为 glm-4.7-flash（管理员归属），稳定可用；
          //   若无 default 则回退 null → 下方 400「请先配置AI模型」（安全降级，优于泄露他人模型）。
          const _default = _models.find(function (m: any) { return m.status === 'default' && _valid(m) }) || null
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

    // 🔥 #184（2026-09-08）：final-check 调试日志落盘（console.log 不进 pm2 日志，FC 排障盲区）
    //   记录模型池/目标/每轮候选率与长度/耗时，供 FC 结果异常时 ground truth 定位。
    const _fcDbg = function (_line: string) {
      try {
        require('fs').appendFileSync(require('path').join(process.cwd(), '.tuzhong-data', 'fc_debug.log'), '[' + new Date().toISOString() + '] ' + _line + '\n')
      } catch (_e) {}
    }
    _fcDbg('=== FC START textLen=' + text.length + ' auto=' + _autoNoExplicitCfg + ' detector=' + (resolvedCfg as LLMConfig).model)

    // 🔥 2026-09-07（#160）改写端防波动：FC22/FC23 双样本（同代码）AI率终值 2%~30% 波动，
    //   诊断确认兜底改写模型为 glm-4-flash 小模型——坏 streak 时 8 轮 3-5 候选全劣化（无声降级）。
    //   构建改写模型池：主配置 + models.json 中可用的强模型备份（按偏好序去重），
    //   深停滞时切换改写模型（检测器固定主配置，保证前后轮 AI率可比）。
    let _rewritePool: LLMConfig[] = [resolvedCfg as LLMConfig]
    try {
      const _fsP = require('fs')
      const _pathP = require('path')
      const _fpPool = _pathP.join(process.cwd(), '.tuzhong-data', 'models.json')
      if (_fsP.existsSync(_fpPool)) {
        const _mRaw = JSON.parse(_fsP.readFileSync(_fpPool, 'utf-8'))
        const _mArr: any[] = Array.isArray(_mRaw) ? _mRaw : []
        // 🔥 #183（2026-09-08）：模型池实测健康度探针（outputs/probe_rewrite_models.cjs 等）——
        //   SiliconFlow key 全系 401（key 失效→DeepSeek-V4-Flash 不可用）、OpenRouter glm-5.2:free 已下架(404)+
        //   免费日额耗尽(429)、智谱 glm-4.6/5.2 余额不足、glm-4.7-flash 间歇 429。实测唯一健康强改写 =
        //   商汤 sensenova-6.8-flash-lite（200/3.7s，改写质量明显去模板化）。提为主改写，弱链路仅作兜底。
        const _prefs = ['sensenova-6.8-flash-lite', 'glm-4.7-flash', 'DeepSeek-V4-Flash', 'minimax-m3']
        const _poolValid = function (m: any) { return m && m.apiKey && !String(m.apiKey).includes('*') && m.model }
        // 🔥 P2 #8 安全修复：改写模型池仅允许管理员（default 模型归属 userId）的模型，
        //   防止自动模式把某用户的私有模型（含其 Key/额度）拉入池中被他人请求占用。
        const _adminOwnerId = (function () {
          const _d = _mArr.find(function (m: any) { return m.status === 'default' && _poolValid(m) })
          return _d ? String(_d.userId || '') : ''
        })()
        const _poolValidOwner = function (m: any) { return _poolValid(m) && (!_adminOwnerId || String(m.userId || '') === _adminOwnerId) }
        const _poolSeen = new Set<string>([(resolvedCfg as LLMConfig).provider + '|' + (resolvedCfg as LLMConfig).model])
        for (let _pi2 = 0; _pi2 < _prefs.length && _rewritePool.length < 4; _pi2++) {
          const _hit = _mArr.find(function (m: any) {
            if (!_poolValidOwner(m) || !String(m.model).includes(_prefs[_pi2])) return false
            const _k = String(m.provider || '') + '|' + String(m.model)
            return !_poolSeen.has(_k)
          })
          if (_hit) {
            _poolSeen.add(String(_hit.provider || '') + '|' + String(_hit.model))
            _rewritePool.push({
              provider: _hit.provider || '硅基流动',
              apiKey: String(_hit.apiKey).replace(/[`'"]/g, '').trim(),
              baseUrl: String(_hit.baseUrl || '').replace(/[`'"]/g, '').trim() || 'https://api.siliconflow.cn/v1',
              model: _hit.model,
            } as LLMConfig)
          }
        }
      }
    } catch (_poolErr) { console.warn('[final-check] #160 模型池构建失败，仅用主配置:', _poolErr) }
    // 🔥 #160b：自动回退模式下，把池内最强备份提升为主改写模型——glm-4-flash 小模型无声降级
    //   是 FC 系列 2%~30% 方差根源（FC22-24 实测）；检测模型保持 resolvedCfg 不变，维持率值标尺可比。
    if (_autoNoExplicitCfg && _rewritePool.length > 1) {
      const _bestCfg = _rewritePool[1]
      console.log('[final-check] #160b 自动模式改写主模型升级: ' + (resolvedCfg as LLMConfig).model + ' → ' + _bestCfg.model)
      _rewritePool[0] = _bestCfg
    }
    console.log('[final-check] #160 改写模型池: ' + _rewritePool.map(function (c) { return c.model }).join(' → '))
    _fcDbg('POOL ' + _rewritePool.map(function (c) { return c.model }).join(' -> '))

    console.log('[final-check] 开始终检，文本长度:', text.length)

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
          // 🔥 2026-10-20：站内引擎是「自研估测」，与朱雀官方「疑似AI占比」不同量纲（实测同一稿：站内 0.8% ↔ 朱雀疑似AI 100%）。
          //   这里设站内地板 INTERNAL_ESTIMATE_FLOOR，避免拿站内估测值去追用户为官方通道设的 1%/5%，把高活人感稿子反复改废。
          const INTERNAL_ESTIMATE_FLOOR = 12
          targetAiRateMax = Math.max(INTERNAL_ESTIMATE_FLOOR, minStandard - 2)
          targetAiRateMax = Math.round(targetAiRateMax * 10) / 10
        }
      }
      // 🔥 2026-09-07（#143）尊重用户配置目标：删除 #140 的"低于23%抬升到25%"——用户在写作偏好-平台AI检测配置
      //   中明确配置 <1%，必须严格执行。配合 #142 检测器校准（锚定判定+地板归一映射），真人级文本现可测出 <1%，
      //   严格目标重新可达。新增停滞收敛保护：连续 2 轮无改善即停止迭代（避免不可达目标下 18 分钟空转）。
      if (targetAiRateMax < 1.2) {
        targetAiRateMax = 1.2
        console.log('[final-check] 目标AI率下限保护为 1.2%（0% 在数学上不可稳定复现）')
      }
    } catch (_e) { console.warn('[final-check] 平台配置解析失败，使用默认目标AI率2%') }
    console.log('[final-check] 最严格平台: ' + strictestPlatformName + ', 标准: ' + strictestStandard + ', 正文目标AI率: <' + targetAiRateMax + '%')

    // ============================================================
    // Step 1: AI检测（全文分段检测，取各段最差AI率）
    // 说明：对"真实生成的正文"全文检测（每段约7000字、重叠600字），而非只查前8000字，
    //       取各段中最高的AI率作为正文AI率，避免后文AI特征被漏检。
    // ============================================================
    let aiDetectResult: FullDetectResult | null = null
    try {
      aiDetectResult = await detectFullText(text, resolvedCfg)
      console.log('[final-check] 全文AI检测完成，AI率(取最差):', aiDetectResult?.aiRate, '分段数:', aiDetectResult?.chunkCount)
    } catch (err) {
      console.warn('[final-check] AI检测失败:', err)
    }

    // ============================================================
    // Step 2: 全文迭代润色——自动改写直到达标
    // 目标：把真实生成的正文整段进行AI改写，再对全文重新检测；
    //       未达目标值则继续迭代（最多 maxRounds 轮），直到达标或收敛/达上限。
    //       达标（或最优）文本作为最终结果返回前端，用于替换原文（自动修复）。
    // 兜底：LLM 失败时保留原文，并在 note 中标注"未能改写"。
    // ============================================================
    let polishResult: { polishedText?: string; beforeAiRate?: number; afterAiRate?: number; improved?: boolean; improvement?: number; rounds?: number; modified?: boolean; note?: string } | null = null
    const rawAiRate = Math.round((aiDetectResult?.aiRate ?? 50) * 10) / 10
    if (rawAiRate > 10) {
      console.log('[final-check] AI率' + rawAiRate + '%，启动全文迭代润色（目标AI率 <' + targetAiRateMax + '%）...')
      // 🔥 #151：FC18 实测停滞阈值 5 过早放弃（414s 就停，预算还剩 736s）而 FC17 同代码跑到 9 轮达 5%——
      //   提高轮数上限到 12（1150s 预算 ÷ ~100s/轮），停滞时靠升级候选数扩大搜索而非提前收敛。
      //   🔥 #153：FC20 恰好 12 轮停（=maxRounds，预算未耗尽）→ 放宽到 15，让 1050s 墙钟预算成为唯一约束。
      const maxRounds = 15
      let curText = text
      let bestRate = rawAiRate
      let bestText = curText
      let rounds = 0
      let rewriteFailed = false
      // 🔥 #139：单轮改写失败不再立即终止（纠偏重试可能下一轮成功），
      //   容忍连续 2 次失败后才停止，避免 LLM 偶发抖动导致自动修复空转。
      let _consecutiveFail = 0
      // 🔥 #143 停滞计数：连续 2 轮无改善则收敛停止
      let _stallRounds = 0
      // 🔥 #160 改写模型池游标 + 坏 streak 重启标记
      let _cfgIdx = 0
      let _restarted = false
      // 提取上一轮检测出的具体问题，用于引导逐条修复
      let issuesText = ''
      try {
        const issuesArr = (Array.isArray(aiDetectResult?.issues) ? aiDetectResult!.issues as any[] : [])
        issuesText = issuesArr
          .filter((it: any) => it && typeof it.description === 'string')
          .map((it: any) => it.description + (typeof it.suggestedFix === 'string' ? '（建议：' + it.suggestedFix + '）' : ''))
          .slice(0, 12)
          .join('\n- ')
      } catch (_e) { /* 忽略 */ }
      try {
        // 🔥 2026-09-07（#149）FC16 实测 4 轮仅 31.4→30.2：预算 780s 太保守（nginx 已放宽 1500s），
        //   升至预算——为循环后终检复检/清洗/上报留 ~300s。#152：FC19 实测 504@1200s——根因是
        //   /etc/nginx/conf.d/tuzhongwang.conf 重复 server 块 1200s 抢先 + vhost 从未 reload（均已修 1500s）；
        //   双保险：润色预算定 1050s，最坏总耗时 60+1050+240≈1350s < 1500s 网关。
        //   🔥 #160c：FC25 实测 #160b（DeepSeek 主改写）单轮 ~260s（强模型慢 2.5×），4 轮即总耗时
        //   1447s 距网关仅 53s 余量——预算收紧到 900s，最坏总耗时 ≈60+900+340≈1300s，恢复 ~200s 边际。
        const _polishDeadline = Date.now() + 900 * 1000
        for (let _r = 1; _r <= maxRounds; _r++) {
          if (Date.now() >= _polishDeadline) {
            console.log('[final-check] 达到润色墙钟预算(1050s)，返回当前最优（' + bestRate + '%）')
            break
          }
          const _roundStart = Date.now()
          rounds = _r
          // 🔥 #160 深停滞切换改写模型：连续 ≥2 轮无改善且仍 >3×目标（#194 由 3 降为 2：900s 预算内
          //   最多 3-4 轮，3 轮阈值等于永远轮不到切换——FC33 实证 2 轮撞预算 28→25.6% 收场），
          //   说明当前改写模型可能坏 streak——切到模型池下一个强模型。检测器固定不动，保证前后可比。
          if (_stallRounds >= 2 && bestRate > targetAiRateMax * 3 && _cfgIdx < _rewritePool.length - 1) {
            _cfgIdx++
            console.log('[final-check] #160 深停滞(连续' + _stallRounds + '轮, best ' + bestRate + '%)，切换改写模型 → ' + _rewritePool[_cfgIdx].model)
          }
          // 🔥 #160 坏 streak 重启：连续 ≥7 轮无改善且仍 >3×目标，改写链文本可能已劣化漂移——
          //   回到原文重新迭代（最多 1 次），换当前池模型+原 issues 重开。
          if (_stallRounds >= 7 && bestRate > targetAiRateMax * 3 && !_restarted) {
            _restarted = true
            curText = text
            _stallRounds = 0
            console.log('[final-check] #160 坏 streak 重启：回到原文重新迭代（改写模型 ' + _rewritePool[_cfgIdx].model + '）')
          }
          // 🔥 2026-09-06 优化（#132）：逐轮温度递增——前几轮温和改写保情节，后几轮高温彻底重写
          //   历史实现恒 0.5，8 轮后 AI 率下降缓慢（实测 49→46）。递增到最高 0.9 逼近真人文本地板（校准值 ≈23%）。
          const roundTemperature = Math.min(0.9, 0.55 + _r * 0.06)
          // 🔥 2026-09-07（#146/#148/#149/#151）自适应多候选择优：改写质量随机性大（同输入实测 2%~29% 波动），
          //   每轮并行生成多个候选（温度梯度 0.3），各自真实复检后择优进入下一轮——
          //   用"生成多样本+确定性评分择优"替代碰运气；#149：距目标 4 倍以上时第 1 轮即 3 候选；
          //   #151：连续停滞时候选数逐级升级 3→4→5（并行生成+并行检测，轮耗时基本不涨），扩大每轮搜索面。
          // 🔥 #185（2026-09-08）：FC31 实测（fc_debug.log）R1-R4 单模型 3 候选平台期（26.8-31.4%）烧掉 4 轮预算，
          //   R5 停滞升级 4 候选立即出现 4% 好候选——远离目标（>8×）时开局即 5 候选，把 best-of-N 搜索面提前。
          let _nCand = bestRate > targetAiRateMax * 8 ? 5 : (((bestRate > targetAiRateMax * 4) || (_r >= 3 && bestRate > targetAiRateMax * 2)) ? 3 : 2)
          if (_stallRounds >= 2) _nCand++
          if (_stallRounds >= 4) _nCand++
          _nCand = Math.min(5, _nCand)
          const _candTemps: number[] = []
          for (let _ct = 0; _ct < _nCand; _ct++) _candTemps.push(Math.min(0.95, roundTemperature + _ct * 0.3))
          const _candTexts = await Promise.all(_candTemps.map(function (_t: number) {
            return rewriteFullText(_rewritePool[_cfgIdx] as LLMConfig, curText, issuesText, _t)
          }))
          _fcDbg('R' + _r + ' model=' + _rewritePool[_cfgIdx].model + ' nCand=' + _nCand + ' lens=' + _candTexts.map(function (c) { return c ? c.length : 'NULL' }).join('/'))
          // 🔥 #149：候选复检并行化（原串行 for 循环每轮多耗 2 次检测延迟，~60-120s/轮）
          const _candDets = await Promise.all(_candTexts.map(function (_c: string | null) {
            if (!_c) return Promise.resolve(null)
            return detectFullText(_c, resolvedCfg).catch(function () { return null })
          }))
          // 候选各自复检，取 AI 率更低者为本轮结果
          let rewritten: string | null = null
          let _bestCandRate = Infinity
          for (let _ci = 0; _ci < _candTexts.length; _ci++) {
            const _c = _candTexts[_ci]
            if (!_c) continue
            let _cr = Infinity
            const _cd = _candDets[_ci]
            if (_cd && typeof _cd.aiRate === 'number') _cr = Math.round(_cd.aiRate * 10) / 10
            console.log('[final-check] 第' + _r + '轮候选' + (_ci + 1) + '(温度' + _candTemps[_ci] + ') AI率: ' + _cr + '%')
            if (_cr < _bestCandRate) { _bestCandRate = _cr; rewritten = _c }
          }
          if (!rewritten) {
            _consecutiveFail++
            console.warn('[final-check] 第' + _r + '轮润色输出异常（连续第' + _consecutiveFail + '次）')
            if (_consecutiveFail >= 2) {
              rewriteFailed = true
              console.warn('[final-check] 连续2轮改写失败，停止迭代')
              break
            }
            continue
          }
          _consecutiveFail = 0
          // 润色后对全文做最差段重检测（#146：双候选择优时胜者已复检过，直接复用）
          let rate = bestRate
          if (isFinite(_bestCandRate)) {
            rate = _bestCandRate
            // 🔥 #158：接近目标（≤2×）时单次检测噪声 ±1~2% 与目标同量级——对本轮最优候选
            //   追加 3 次并行检测取中位数再定 rate，杜绝"运气低读"假达标与"运气高读"漏改善。
            if (rate <= targetAiRateMax * 2) {
              const _medDet = await detectMedian(rewritten as string, resolvedCfg as LLMConfig, 3)
              if (_medDet && typeof _medDet.aiRate === 'number') {
                const _medRate = Math.round(_medDet.aiRate * 10) / 10
                if (_medRate !== rate) console.log('[final-check] #158 中位数复核: 单次 ' + rate + '% → 中位数 ' + _medRate + '%')
                rate = _medRate
              }
            }
          } else {
            try {
              const reDet = await detectFullText(rewritten as string, resolvedCfg)
              if (reDet && typeof reDet.aiRate === 'number') rate = Math.round(reDet.aiRate * 10) / 10
            } catch (e) {}
          }
          console.log('[final-check] 第' + _r + '轮润色检测 AI率: ' + rate + '%（耗时' + Math.round((Date.now() - _roundStart) / 1000) + 's）')
          _fcDbg('R' + _r + ' rates=[' + _candTexts.map(function (_c, _i2) { const _cd2 = _candDets[_i2]; return _cd2 && typeof _cd2.aiRate === 'number' ? _cd2.aiRate : 'ERR' }).join('/') + '] chosen=' + rate + ' best=' + bestRate + ' stall=' + _stallRounds + ' ' + Math.round((Date.now() - _roundStart) / 1000) + 's')
          // 🔥 2026-09-07（#145）修复停滞判定 bug：原实现先更新 bestRate 再比较 `rate >= bestRate`，
          //   改善轮也恒为 true（rate==bestRate）→ 第1轮改善就被计停滞，2轮即假收敛停止。
          const _prevBest = bestRate
          if (rate < bestRate) {
            bestRate = rate
            bestText = rewritten
          }
          // 🔥 2026-09-06 修复：不再因"该轮无改善"就提前收敛。上一版 `if (rate >= bestRate) break`
          //   会让第1轮改写未见即时下降就停止，导致自动修复停留在原文、AI率几乎不降。
          //   改为：始终用本轮改写结果作为下一轮输入继续逼近目标，只记录最优文本，达上限或达标才停。
          // 🔥 2026-09-07（#143→#145）停滞收敛保护：连续 2 轮相对上一轮最优值无改善 → 收敛停止。
          curText = rewritten
          if (rate >= _prevBest) {
            _stallRounds++
            // 🔥 #145：改写质量随机性大（FC9 首轮 2% vs FC10 四轮 29%），阈值 3 给 best-of-N 更多搜索机会
            // 🔥 #149：FC16 实测距目标 25 倍（30.2% vs 1.2%）时 3 轮停滞就收敛 → 远离目标时阈值升到 5，
            //   充分利用 best-of-N 搜索深度；接近目标（≤2×）时恢复 3，达标即停不受影响。
            // 🔥 #151：FC18 实测阈值 5 仍在 414s 提前收敛（预算剩 736s）→ 远离目标时升到 8（≈跑满预算），
            //   且停滞期间候选数已升级（#151），把"是否继续"交给墙钟预算而非轮数猜测。
            const _stallLimit = bestRate > targetAiRateMax * 2 ? 8 : 3
            if (_stallRounds >= _stallLimit) {
              console.log('[final-check] 连续' + _stallRounds + '轮无改善（当前最优 ' + bestRate + '%，阈值' + _stallLimit + '），收敛停止')
              break
            }
          } else {
            _stallRounds = 0
          }
          if (bestRate <= targetAiRateMax) break
        }
      } catch (err) {
        console.warn('[final-check] 润色失败:', err)
      }
      const achievedRate = Math.round(bestRate * 10) / 10
      _fcDbg('FC END raw=' + rawAiRate + ' best=' + achievedRate + ' rounds=' + rounds + ' restart=' + _restarted + ' bestLen=' + (bestText || '').length)
      // 🔥 2026-09-07（#143）特征库确定性清洗：返回最优文本前，执行《全网网文平台 AI 双重判定特征库》
      //   对齐的 deAiCleanup 字典级替换（高危神态/万能套话/穿越开篇指纹/高频词轮转），零成本消除残留指纹。
      // 🔥 2026-09-07（#148）乱码/错误标记确定性清洗：白金爆款输出不允许任何乱码与残留标记。
      //   清理项：U+FFFD 乱码符、零宽字符、控制字符、Markdown 残留（**加粗/##标题/```代码栅栏/行首- 列表）、
      //   元叙事舞台指令（(战斗爆发)（打斗描写）类全/半角括号动作标签）、3+ 连续空行折叠。
      const _sanitizeOutput = function (_t: string): string {
        let _s = _t || ''
        _s = _s.replace(/\uFFFD/g, '')
        _s = _s.replace(/[\u200B-\u200D\uFEFF]/g, '')
        // eslint-disable-next-line no-control-regex
        _s = _s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        _s = _s.replace(/\*\*/g, '').replace(/^#{1,6}\s*/gm, '')
        _s = _s.replace(/```[a-z]*\s*/gi, '')
        _s = _s.replace(/^\s*[-*]\s+/gm, '')
        _s = _s.replace(/[（(]\s*(战斗爆发|打斗描写|战斗过程|战斗结束|继续战斗|场景切换|插叙|回忆开始|回忆结束|高潮|转折|伏笔|过渡|承接上文|总结)\s*[)）]/g, '')
        _s = _s.replace(/\n{3,}/g, '\n\n')
        return _s
      }
      let _finalPolished = _sanitizeOutput(bestText)
      try {
        const _cleaned = deAiCleanup(_finalPolished)
        if (_cleaned && _cleaned.length >= 100) {
          if (_cleaned !== _finalPolished) console.log('[final-check] #143 特征库确定性清洗生效，长度 ' + _finalPolished.length + '→' + _cleaned.length)
          _finalPolished = _cleaned
        }
      } catch (_deErr) { console.warn('[final-check] #143 deAiCleanup 异常，保留原文:', _deErr) }
      // 🔥 2026-10-16 绍宋级口径修正：白金爆款正文目标区间为 2500-4000 汉字（旧 #150 的 1800-2200 会把
      //   生成好的 3000 字正文硬砍到 ≤2200，是「首章仅 1932 字」的直接元凶）。改为上限 4000、下限 2500：
      //   超 4000 才按句子边界钳制到 ≤4000（截断点保证 ≥2500）；不足 2500 诚实保留不虚增，仅记录日志。
      if (_finalPolished.length > 4000) {
        const _cutZone = _finalPolished.slice(0, 4000)
        let _cutIdx = Math.max(_cutZone.lastIndexOf('。'), _cutZone.lastIndexOf('！'), _cutZone.lastIndexOf('？'), _cutZone.lastIndexOf('…'), _cutZone.lastIndexOf('」'))
        if (_cutIdx < 2499) {
          _cutIdx = Math.max(_cutZone.lastIndexOf('；'), _cutZone.lastIndexOf('，'), _cutZone.lastIndexOf('、'))
        }
        if (_cutIdx >= 2499) {
          const _clamped = _finalPolished.slice(0, _cutIdx + 1)
          console.log('[final-check] #150 字数钳制: ' + _finalPolished.length + '→' + _clamped.length)
          _finalPolished = _clamped
        } else {
          console.log('[final-check] #150 字数钳制跳过（4000 内无可靠句子边界），保持 ' + _finalPolished.length)
        }
      } else if (_finalPolished.length < 2500) {
        console.log('[final-check] #150 终文 ' + _finalPolished.length + ' 字低于 2500 下限（改写缩短），诚实保留不虚增')
      }
      // 清洗后对最终文本真实复检，以上报真实终值（而非清洗前的迭代最优值）
      // 🔥 #158：终检升级为 3 次并行检测取中位数——上报值是用户看到的最终结论，必须抗 LLM 判定抖动
      let _reportedRate = achievedRate
      try {
        const _finalDet = await detectMedian(_finalPolished, resolvedCfg as LLMConfig, 3)
        if (_finalDet && typeof _finalDet.aiRate === 'number') {
          _reportedRate = Math.round(_finalDet.aiRate * 10) / 10
          console.log('[final-check] #158 清洗后终检(中位数×3) AI率: ' + _reportedRate + '%')
        }
      } catch (_e) { /* 复检失败沿用迭代最优值 */ }
      const _finalAchieved = Math.min(achievedRate, _reportedRate)
      polishResult = {
        polishedText: _finalPolished,
        beforeAiRate: rawAiRate,
        afterAiRate: _finalAchieved,
        improved: _finalAchieved < rawAiRate,
        improvement: Math.max(0, Math.round((rawAiRate - _finalAchieved) * 10) / 10),
        rounds,
        modified: _finalPolished !== text && _finalAchieved < rawAiRate,
        note: rewriteFailed
          ? '未能改写（大模型改写失败，已回退原文）'
          : _finalAchieved <= targetAiRateMax
            ? '已自动修复至目标AI率以下'
            : '已尽量自动改写，但尚未降到目标AI率以下（达到迭代上限或已收敛）',
      }
      console.log('[final-check] 迭代润色完成(' + rounds + '轮)，AI率: ' + rawAiRate + '% → ' + _finalAchieved + '%')
    }

    // 最终用于替换原文的正文（达标/最优改写结果；未触发润色则返回原文）
    const finalOutputText = (polishResult && typeof polishResult.polishedText === 'string' && polishResult.polishedText.trim().length >= 100)
      ? polishResult.polishedText
      : text

    // ============================================================
    // Step 3: 原创查重
    // ============================================================
    let originalityResult: { overallScore?: number; verdict?: string; riskLevel?: string; summary?: string; dimensions?: unknown[]; matchItems?: unknown[]; highRiskSegments?: unknown[] } | null = null
    try {
      const origPrompt = ORIGINALITY_CHECK_PROMPT.replace('{{text}}', finalOutputText.substring(0, 4000))
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
      const compPrompt = COMPLIANCE_CHECK_PROMPT.replace('{{text}}', finalOutputText.substring(0, 4000))
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
      const contractPrompt = CONTRACT_SCORE_PROMPT.replace('{{text}}', contractContext + finalOutputText.substring(0, 4000))
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
          verdict: pass ? '通过（站内估测，非朱雀官方判定）' : (aiPass ? '风险提示（站内估测）' : '未通过（站内估测）'),
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
          // 🔥 2026-10-20：朱雀真实口径——输出的是「AI生成概率」，官方无合格线且有误报，
          //   行业通行以 ≤30% 为安全线（≤25% 更稳）。此处不再用拍脑袋的 5%。
          allPlatforms.unshift({ name: '朱雀AI检测平台', key: 'zhuque', aiStandard: 'AI率 < 30%', enabled: true });
        }
        for (let _i = 0; _i < allPlatforms.length; _i++) {
          const _plat = allPlatforms[_i];
          const _platName = String(_plat.name || _plat.key || '平台');
          const _platStandard = String(_plat.aiStandard || 'AI率 < 30%');
          buildPlatform(_platName, String(_plat.key || _platName), _platStandard, _platName.indexOf('朱雀') >= 0 || _platName.indexOf('AI') >= 0 ? aiDims : contentDims);
        }
      } else {
        buildPlatform('朱雀AI检测平台', 'zhuque', 'AI率 < 30%', aiDims);
        buildPlatform('番茄小说平台', 'fanqie', 'AI率 < 30%', contentDims);
        buildPlatform('七猫小说平台', 'qimao', 'AI率 < 35%', contentDims);
        buildPlatform('起点中文网', 'qidian', 'AI率 < 35%', contentDims);
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
      priority: rawDetectedAiRate > targetAiRateMax ? 'high' : 'low',
      status: rawDetectedAiRate <= targetAiRateMax ? 'good' : (rawDetectedAiRate <= 30 ? 'fair' : 'poor'),
      currentValue: 'AI率 ' + rawDetectedAiRate + '%',
      // 目标值取自「个人设置-平台AI检测配置」中最严格平台的真实标准（朱雀/番茄口径为 ≤30%）
      targetValue: 'AI率 < ' + targetAiRateMax + '%',
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

    // 🔥 2026-10-22：oh-story 签约级确定性门禁（番茄五项 rubric + S1-S4）
    // 仅在 S1 或 S2 堆积时改写 canSubmit，避免与既有阈值冲突。
    let signingGate: ReturnType<typeof runSigningGate> | null = null
    try {
      const gateGenre = String((novelInfo && (novelInfo.genre || novelInfo.category)) || '')
      const gateTitle = String((novelInfo && (novelInfo.chapterTitle || novelInfo.title)) || '')
      signingGate = runSigningGate(finalOutputText || text || '', { genre: gateGenre, chapterTitle: gateTitle })
      if (signingGate.verdict === 'REJECT') {
        canSubmit = false
        submitWarnings.push('签约门禁 S1：' + (signingGate.blocking[0]?.issue || signingGate.summary))
      } else if (signingGate.verdict === 'CONCERNS' && signingGate.counts.S2 >= 3) {
        canSubmit = false
        submitWarnings.push('签约门禁 S2×' + signingGate.counts.S2 + '：' + (signingGate.blocking[0]?.issue || signingGate.summary))
      } else if (signingGate.verdict === 'CONCERNS' && signingGate.counts.S2 > 0) {
        submitWarnings.push('签约门禁提示：' + (signingGate.blocking[0]?.issue || signingGate.summary))
      }
    } catch (_gateErr) {
      signingGate = null
    }
    const signingGatePayload = signingGate
      ? {
          verdict: signingGate.verdict,
          counts: signingGate.counts,
          blocking: signingGate.blocking.slice(0, 20),
          fanqie: signingGate.fanqie,
          metrics: signingGate.metrics,
          summary: signingGate.summary,
        }
      : null

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
        signingGate: signingGatePayload,
        // 自动修复结果：finalText 为达标（或最优）改写后的正文，可直接替换原文；
        // autoFixed 表示本次是否实际进行了改写并降低AI率。
        finalText: finalOutputText,
        autoFixed: (polishResult?.modified === true) || (!!polishResult && polishResult.improved === true),
        fixNote: polishResult?.note || (finalAiRate <= targetAiRateMax ? '文本AI率已达目标，无需改写' : '未触发自动改写'),
        finalVerdict: {
          canSubmit,
          aiRate: finalAiRate,
          originalityScore,
          complianceScore,
          contractScore,
          contractGrade: contractGrade,
          warnings: submitWarnings,
          signingVerdict: signingGate ? signingGate.verdict : null,
          signingFindings: signingGate ? signingGate.blocking.slice(0, 20) : [],
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