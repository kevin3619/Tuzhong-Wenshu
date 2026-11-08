import { extractJSONFromText } from '@/lib/ai/llm'

export interface JudgeResult {
  score: number
  issues: string[]
}

/**
 * 🔥 2026-10-19：对标评审——以番茄白金历史文（《大明，李景隆的别样人生》的黄金三章水准）为尺度，
 * 让一个 LLM 当责编审稿，产出「分数 + 具体问题」，问题直接进入定点修复轮。
 */
export async function judgeChapterAgainstBenchmark(
  text: string,
  ctx: { chapterNumber: number; chapterTitle: string; corePlot: string; castBrief: string[]; genre: string; endHook?: string },
  call: (messages: Array<{ role: 'system' | 'user'; content: string }>, opts: { temperature: number; maxTokens: number; timeoutMs: number; label: string }) => Promise<string>,
): Promise<JudgeResult> {
  const system = `你是番茄小说白金历史文的资深责编，评审标准以《永历中兴》对标作品《大明，李景隆的别样人生（大明第一公）》的正文水准为准：
① 剧情因果合理：人物每个举动有动机与筹码，无降智、无巧合空降、无时空错乱；
② 阵营与时空正确：敌方人物不会出现在主角所在的己方地盘；冲突对象与本章剧情摘要一致；
③ 史实考究：崇祯十八年（1645）二月=桂王世子时期，未即位不得称帝受"陛下"，地名官职器物称谓符合明末；
④ 人物刻画：主角冷静有心术、对手有各自算盘、仆从有忠亦有智；语言有辨识度；
⑤ 爽点与钩子：信息差/权谋打脸要落到具体动作与台词，章末有硬钩；若给了【章末必须实现的钩子】，结尾未落到该钩子上=扣分并列为问题；
⑥ 文字质量：画面感强、无复读无注水、无 AI 套话、对话自然顺畅；
⑦ 连续性硬伤（出现任一项即为不合格级问题，必须逐条点名）：已被押下/下狱/革职的人物又被写成若无其事地站在场上；同一情节、同一段描写在章内演了两遍；道具来路不明（突然拿出密图/案底/书信而无铺垫）；凭空多出的有名有姓的新人物；同一套路（如某本"书册"显灵、某类"血字/霉斑/北字"意象）在章内或相邻章节反复刷；人物自称与身份场合不符。
⑧ 可读性与密度（按番茄手机阅读实测）：段落短、长短句交错，单句成段不过量，无连续四句长度相近；每百字感官细节（颜色/光影/声响/冷热/气味/触感）不少于 3 处、情绪落点不少于 2 处，但不堆砌成景物清单；整章读下来顺、不卡、有画面。密度明显不足或读起来发涩，都要点名并给出补哪一段。
⑨ 番茄平台五项指标（移植自 oh-story 已签约作品的番茄评审口径，逐项核对并点名）：
   a. 开头吸引力——前 3 段必须含冲突/悬念/钩子，纯描写或背景介绍开头要点名；
   b. 读者留存——本章结尾必须有"翻页动力"（悬念/反转/新信息），没有就点名；
   c. 题材匹配——内容必须符合标签（历史权谋/逆袭/重生），长时间偏离标签要点名；
   d. 阅读节奏——段落便于手机阅读，机械切段或拖沓要点名；
   e. 情绪节点——情绪起伏要密，约每千字一次反馈；大段情绪平直要指出哪一段缺。
只输出 JSON：{"score":0-100,"issues":["具体问题（指出错在哪、应怎么改）","..."]}；没问题就给 issues: []。`
  const user = `【章节】第${ctx.chapterNumber}章《${ctx.chapterTitle}》
【本章必须实现的剧情（正文必须紧扣，不得跑题）】${ctx.corePlot}
${ctx.endHook ? `【章末必须实现的钩子】${ctx.endHook}\n` : ''}【人物档案】
${ctx.castBrief.length ? ctx.castBrief.join('\n') : '（未提供）'}
【正文】
${text.slice(0, 9000)}`
  try {
    const raw = await call(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { temperature: 0.3, maxTokens: 1200, timeoutMs: 150000, label: '对标评审' },
    )
    const json = JSON.parse(extractJSONFromText(raw))
    const score = Number(json.score)
    const issues = Array.isArray(json.issues) ? json.issues.map((x: any) => String(x)).filter(Boolean).slice(0, 6) : []
    return { score: isNaN(score) ? 0 : Math.max(0, Math.min(100, score)), issues }
  } catch (_e) {
    return { score: 0, issues: [] }
  }
}
