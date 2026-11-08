import { NextRequest, NextResponse } from 'next/server'
import { getRequestActor } from '@/lib/permissions'
import { normalizeCharactersTitlesAndRoles, dedupeCharactersByName, isTitleLike } from '@/lib/character-normalize'
import { applyHistoricalTitles, isKnownHistoricalFigure, lookupTitlesOnline, isHistoricalGenre } from '@/lib/historical-titles'
import { callLLMWithFallback, extractJSONFromText, type LLMConfig } from '@/lib/ai/llm'
import { loadDefaultLlmConfig } from '@/lib/ai/model-config'

export const runtime = 'nodejs'
export const maxDuration = 180

/**
 * 徽章兜底补全：规范化后仍拿不到合法头衔的角色（"大西军将领"这类群体描述被拒后徽章为空），
 * 让模型按史实与身份背景给出 2-8 字真实官职爵位，一次点击即可补完，无需回炉重生成。
 * 失败静默降级（保持空徽章，前端回退显示角色定位）。
 */
// 模型常犯的错：把身份栏里的群体描述原样抄回来当头衔
const BANNED_TITLE_WORDS = /(将领|首领|头目|战士|兵将|人员|分子|干将|专家|高手|好手|能人|人物|同志|大人|先生|领袖|霸主|英雄|义士|猛将|名将|战将|主将|部将|家将|上将|忠臣|武将|文臣|盟友|亲随|反派|主角|配角|女主|导师|师父)/

function buildTitlePrompt(pending: Array<{ name: string; camp: string; identity: string }>, feedback?: Array<{ name: string; bad: string }>) {
  const list = pending.map(function (p) {
    return '- ' + p.name + '｜阵营：' + (p.camp || '未标注') + '｜身份线索：' + String(p.identity || '').slice(0, 60)
  }).join('\n')
  let prompt = '下面每个角色都要一枚"徽章"＝该人物的**具体官职或爵位名**（不是身份描述）。\n\n'
    + '【硬性要求】\n'
    + '1. 2-6字，必须是可单独成立的官职/爵位/名分专名，例如：南川王、抚南王、晋王、提督、总兵、参将、巡抚、布政使、按察使、东阁大学士、兵部尚书、锦衣卫指挥使、典史、翰林院编修、招讨大将军、皇太后\n'
    + '2. 【禁止照抄身份线索里的群体描述】以下词出现在结果里一律作废：将领、首领、头目、战士、人员、专家、领袖、霸主、英雄、义士、猛将、名将、忠臣、武将、盟友、亲随、反派、主角、配角、导师\n'
    + '   ✗ 错误示范：大西军将领、清军将领、江阴抗清领袖、江西反正将领\n'
    + '   ✓ 正确做法：改用该人真实的爵位/职司（刘文秀史封南川王、艾能奇官居将军、阎应元为典史、金声桓为总兵）\n'
    + '3. 真实历史人物以其史实爵位/官职为准；虚构人物按其阵营与职司拟一个贴切的官爵名\n'
    + '4. 只输出JSON对象 {"姓名":"头衔"}，不要任何解释、注释或多余文字\n\n【角色名单】\n' + list
  if (feedback && feedback.length) {
    prompt += '\n\n【上一轮这些结果不合格，请换成具体官职/爵位名后重新输出】\n'
      + feedback.slice(0, 20).map(function (f) { return '- ' + f.name + '：你给了「' + f.bad + '」（群体描述，不合格）' }).join('\n')
      + '\n请重新输出这些角色的 JSON（同样只输出 {"姓名":"头衔"}）。'
  }
  return prompt
}

/**
 * 徽章兜底补全：规范化后仍拿不到合法头衔的角色（"大西军将领"这类群体描述被拒后徽章为空），
 * 让模型按史实与身份背景给出 2-6 字真实官职爵位；不合格结果带原因重试一次。
 * 失败静默降级（保持空徽章，前端回退显示角色定位）。
 */
async function backfillTitles(llm: LLMConfig, pending: Array<{ name: string; camp: string; identity: string }>, dbg?: any): Promise<Record<string, string>> {
  if (!pending.length) return {}
  const out: Record<string, string> = {}
  const rejected: Array<{ name: string; bad: string }> = []
  for (var round = 0; round < 2; round++) {
    const todo = pending.filter(function (p) { return !out[p.name] })
    if (!todo.length) break
    const messages = [
      { role: 'system' as const, content: '你是中国历史题材小说的设定编辑，只输出纯JSON。' },
      { role: 'user' as const, content: buildTitlePrompt(todo, round === 1 ? rejected : undefined) },
    ]
    try {
      const r = await callLLMWithFallback(llm, messages, undefined, { temperature: round === 0 ? 0.2 : 0.1, maxTokens: 900 })
      if (dbg) { dbg['raw' + round] = String(r.content || '').slice(0, 300); dbg.model = r.usedModel || llm.model }
      // 🔥 修复：extractJSONFromText 返回的是 JSON「字符串」而非对象，
      //   此前按对象判断导致解析恒失败、模型给出的正确头衔（南川王/典史/抚南王）全被丢弃
      const rawStr = extractJSONFromText(r.content)
      let parsed: any = null
      const candidates = [rawStr, String(rawStr || '').replace(/,\s*([}\]])/g, '$1'), String(rawStr || '').replace(/'/g, '"')]
      for (const cand of candidates) {
        if (!cand || typeof cand !== 'string') continue
        try { parsed = JSON.parse(cand); break } catch (_e) { console.error('[characters/normalize] JSON容错解析一种候选失败，尝试下一种:', _e) }
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.keys(parsed).forEach(function (k) {
          const name = String(k).trim()
          const v = String(parsed[k] || '').trim()
          if (!name || !v) return
          if (BANNED_TITLE_WORDS.test(v) || !isTitleLike(v)) { rejected.push({ name: name, bad: v }); return }
          out[name] = v
        })
      } else if (dbg) { dbg['parseFailed' + round] = true }
    } catch (e: any) {
      if (dbg) dbg['error' + round] = e instanceof Error ? e.message : String(e)
      break
    }
  }
  if (dbg) { dbg.rejected = rejected.slice(0, 12) }
  return out
}

/**
 * 「一键校正徽章与定位」
 *
 * 背景：分批/增量生成时已有角色会被原样合并、不再走服务端规范化，历史批次遗留的错误定位
 * （如全员"竞争对手"）、错误徽章（"短命""支撑危局""大西军将领"）与同名重复角色会一直留在草稿里。
 * 本接口按与生成环节完全相同的规则重跑一遍，并补全缺失徽章。
 *
 * 入参：{ characters, detailedDesignInput?, fillTitles? }
 * 出参：{ success, data: { characters, changed[], removedDupes, titlesFilled, total } }
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestActor(request)
    if (!actor.userId) {
      return NextResponse.json({ code: 401, message: '未登录，请先登录' }, { status: 401 })
    }

    const body = await request.json()
    const characters: any = body && body.characters
    if (!characters || typeof characters !== 'object') {
      return NextResponse.json({ code: 400, message: 'characters 不能为空' }, { status: 400 })
    }

    const collect = (obj: any) => {
      if (!obj || typeof obj !== 'object') return []
      if (Array.isArray(obj)) return obj.filter(Boolean)
      return [obj]
    }
    const flatten = () => {
      const arr: any[] = []
      arr.push(...collect(characters.protagonist), ...collect(characters.femaleLead))
      arr.push(...collect(characters.femaleLeads), ...collect(characters.antagonists))
      arr.push(...collect(characters.supporting), ...collect(characters.antagonist))
      return arr.filter(function (c: any) { return c && c.name })
    }

    const snap = new Map<string, { title: string; role: string }>()
    flatten().forEach(function (c: any) {
      snap.set(String(c.name), { title: String(c.title || ''), role: String(c.rolePosition || c.role || '') })
    })

    normalizeCharactersTitlesAndRoles(characters, String(body.detailedDesignInput || ''))
    // 🔥 清理分批/增量合并造成的同名重复角色（实测 56 条记录里只有 41 人）
    const removedDupes = dedupeCharactersByName(characters)

    // 🔥 第一级：正史职衔表——真实历史人物的官职爵位是可查证事实，直接以史书定称为准，
    //   覆盖 LLM/规范化给出的头衔（用户反馈：不该让模型乱设计）
    const genreHint = String(body.genre || '') + ' ' + String(body.keywords || '')
    const histChanged = applyHistoricalTitles(characters)

    // 🔥 第二级：表内没有、但徽章仍为空的历史向角色 → 查权威百科（结果本地缓存）
    let onlineFilled = 0
    const onlineNames: string[] = []
    if (isHistoricalGenre(genreHint)) {
      flatten().forEach(function (c: any) {
        if (String(c.title || '').trim()) return
        if (isKnownHistoricalFigure(c.name)) return
        const nm = String(c.name || '').trim()
        if (nm && nm.length >= 2 && nm.length <= 6) onlineNames.push(nm)
      })
      if (onlineNames.length) {
        const map = await lookupTitlesOnline(onlineNames)
        flatten().forEach(function (c: any) {
          const hit = map[String(c.name)]
          if (hit && !String(c.title || '').trim()) {
            c.title = hit.title
            c.titleSource = '查证:' + hit.src
            onlineFilled++
          }
        })
      }
    }

    // 🔥 第三级：仍无徽章的（多为虚构人物）才交给 LLM 拟一个贴切官爵
    let titlesFilled = 0
    const titleDebug: any = { pending: 0, llm: false, raw: '', parsedKeys: 0 }
    if (body.fillTitles !== false) {
      const pending = flatten()
        .filter(function (c: any) { return !String(c.title || '').trim() })
        .map(function (c: any) { return { name: String(c.name), camp: String(c.camp || ''), identity: String(c.identity || c.background || '') } })
      titleDebug.pending = pending.length
      if (pending.length) {
        const llm = (body.llmConfig as LLMConfig) || loadDefaultLlmConfig()
        titleDebug.llm = !!(llm && llm.model)
        titleDebug.model = llm && llm.model
        if (llm) {
          const map = await backfillTitles(llm, pending, titleDebug)
          titleDebug.parsedKeys = Object.keys(map).length
          flatten().forEach(function (c: any) {
            const t = map[String(c.name)]
            if (!String(c.title || '').trim() && t) { c.title = t; titlesFilled++ }
          })
        }
      }
    }

    const after = flatten()
    const changed: Array<{ name: string; field: string; from: string; to: string }> = []
    const reported = new Set<string>()
    after.forEach(function (c: any) {
      const old = snap.get(String(c.name))
      if (!old) return
      const newRole = String(c.rolePosition || c.role || '')
      const newTitle = String(c.title || '')
      const k1 = String(c.name) + '|role', k2 = String(c.name) + '|title'
      if (old.role !== newRole && !reported.has(k1)) { reported.add(k1); changed.push({ name: String(c.name), field: '角色定位', from: old.role, to: newRole }) }
      if (old.title !== newTitle && !reported.has(k2)) { reported.add(k2); changed.push({ name: String(c.name), field: '徽章', from: old.title, to: newTitle || '(空)' }) }
    })

    return NextResponse.json({
      code: 200, success: true,
      data: {
        characters, changed, removedDupes, titlesFilled, total: after.length, titleDebug,
        // 徽章来源统计：正史表命中数 / 百科查证数 / LLM 兜底数
        historicalApplied: histChanged.length, onlineApplied: onlineFilled,
      },
    })
  } catch (error: any) {
    console.error('[characters/normalize] 校正失败:', error)
    return NextResponse.json(
      { code: 500, message: '校正失败：' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
