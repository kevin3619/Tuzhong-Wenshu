import { NextRequest, NextResponse } from 'next/server'
import { getRequestActor } from '@/lib/permissions'
import { normalizeFactions, summarizeFactionReport } from '@/lib/faction-normalize'
import { loadDefaultLlmConfig } from '@/lib/ai/model-config'
import { callLLMWithFallback, extractJSONFromText } from '@/lib/ai/llm'

export const runtime = 'nodejs'
export const maxDuration = 180

/**
 * 「一键校正势力」
 *
 * 背景：分批生成会把同一势力按"阶段"重复创建（实测《永历中兴》13 条里孙可望集团占 3 条、
 * 瞿式耜集团与郑芝龙集团各 2 条），且友方势力/结局等字段留空、敌方引用了不存在的势力名
 * （"南明朝廷" vs 实际"南明永历朝廷"）。本接口按与生成环节完全相同的规则重跑一遍。
 *
 * 入参：{ factions: 势力数组, genre?: string, keywords?: string, polishProse?: boolean }
 * 出参：{ success, data: { factions, report, summary, polished } }
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestActor(request)
    if (!actor.userId) {
      return NextResponse.json({ code: 401, message: '未登录，请先登录' }, { status: 401 })
    }

    const body = await request.json()
    const input = body && (Array.isArray(body.factions) ? body.factions : (body.factions && body.factions.factions))
    if (!Array.isArray(input) || !input.length) {
      return NextResponse.json({ code: 400, message: 'factions 不能为空' }, { status: 400 })
    }

    const genreText = String(body.genre || '') + ' ' + String(body.keywords || '')
    const historical = /历史|架空|两宋元明|明清|明朝|南明|明末|宋元|唐|汉|三国|秦汉|隋唐|五代|清|民国|权谋|朝堂/.test(genreText)

    const { factions, report } = normalizeFactions(input, { historicalGenre: historical })

    // 可选：把合并后仍偏模板化的长文案（发展轨迹/结局/底牌）交给模型润色成贴合本书的表述
    let polished = 0
    if (body.polishProse === true && historical) {
      const llm = loadDefaultLlmConfig()
      if (llm) {
        try {
          const brief = factions.slice(0, 14).map(function (f: any) {
            return '- ' + f.name + '（' + (f.camp || '') + '，首领' + (f.leader || '未知') + '，据' + String(f.territory || '').split('、')[0] + '）'
          }).join('\n')
          const msgs = [
            { role: 'system' as const, content: '你是历史题材小说的设定编辑，只输出纯JSON。' },
            {
              role: 'user' as const,
              content: '按下列势力写一句"发展轨迹"（30-60字，含兴起之地、关键转折、最终走向），'
                + '要求：只写现实权谋与战事，禁止修仙/玄幻词（灵气、功法、护宗大阵、开派祖师等），不要套话。\n\n'
                + brief + '\n\n只输出JSON对象 {"势力名":"发展轨迹"}。',
            },
          ]
          const r = await callLLMWithFallback(llm, msgs, undefined, { temperature: 0.4, maxTokens: 1200 })
          const raw = extractJSONFromText(r.content)
          let parsed: any = null
          try { parsed = JSON.parse(raw) } catch (_e) { parsed = null }
          if (parsed && typeof parsed === 'object') {
            factions.forEach(function (f: any) {
              const v = String(parsed[String(f.name)] || '').trim()
              if (v && v.length >= 10 && !/灵气|功法|护宗|修真|修仙|飞升|金丹|元婴/.test(v)) { f.developmentTrajectory = v; polished++ }
            })
          }
        } catch (_e) { /* 润色失败保留确定性文案 */ }
      }
    }

    return NextResponse.json({
      code: 200, success: true,
      data: { factions, report, summary: summarizeFactionReport(report), polished },
    })
  } catch (error: any) {
    console.error('[factions/normalize] 校正失败:', error)
    return NextResponse.json(
      { code: 500, message: '校正失败：' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
