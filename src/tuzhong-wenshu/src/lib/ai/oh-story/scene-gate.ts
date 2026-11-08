/**
 * oh-story · 场景三要素门禁（G-09，自包含确定性，零 LLM）
 * ============================================================
 * 依据 long-chapter-quality.md「场景检查」：
 *   场景有目标（人物要什么）／场景有阻碍（什么挡着）／场景有变化（结束后跟之前不同）。
 *
 * 实现口径：
 *   ① 切场景：优先按显式时空位移标记（翌日/三日后/与此同时/当夜…）；无标记时按段落等分为 1-4 场
 *      （oh-story 单章场景数为 1-3 场，故默认切 3 段，段内保持段落完整）；
 *   ② 每场逐句判定三要素证据句：
 *        目标 = 意愿/指令/决意；阻碍 = 转折/受挫/条件不足/对手施压；变化 = 结果落地/状态改变；
 *   ③ 缺任一要素 ⇒ S2，并指明场景号（1-based）与该场缺的是哪一段。
 * 纯字符串处理，可复测，任何分支不抛错。
 */

export interface SceneTriplet {
  /** 场景号（1-based） */
  index: number
  /** 场景起始字符偏移与首句（用于定位） */
  head: string
  /** 该场汉字数 */
  chineseChars: number
  goal: string[]
  obstacle: string[]
  change: string[]
  /** 缺失的要素 */
  missing: Array<'goal' | 'obstacle' | 'change'>
}

export interface SceneGateResult {
  scenes: SceneTriplet[]
  findings: Array<{ rule: string; severity: 'S1' | 'S2' | 'S3' | 'S4'; message: string; evidence: string; fix: string }>
  summary: string
}

// 🔥 T15 扩表：补对白里的请求/指令/劝谏/交代，以及"须/得/该/应/当/不可不"等意愿表达
const GOAL = /(要|想|须|must|必须|得|该|应|当|决意|打定|下令|传令|吩咐|交待|交代|嘱咐|口谕|命[^。！？\n]{0,4}(他|人|诸|各)|派[^。！？\n]{0,4}(去|往)|派了|请|求|劝|谏|禀|报|打算|盘算|谋划|欲|意在|为的是|目的|务必|定要|誓|我[^。！？\n]{0,4}(去|来|办|做)|臣[^。！？\n]{0,4}(请|以为|愿))/
// 🔥 T15 扩表：补"不/未/没/没得/难/死/伤/耗/断/推/拖/瞒/疑/拦"等阻力与代价表达
const OBSTACLE = /(但|却|可是|然而|偏偏|不料|没想|谁知|阻力|受阻|拦|挡|挡住|拦下|不肯|不允|不应|不答|拒绝|反对|争执|僵|难|困|窘|不足|不够|缺|没有[^。！？\n]{0,6}(粮|兵|银|人|时)|来不及|催|逼|压|威胁|要挟|代价|疑问|存疑|不能|无法|不敢|没[^。！？\n]{0,4}(粮|兵|银|人|法|用|了)|未[^。！？\n]{0,4}(到|定|成|决)|死|伤|损|耗|断|拖|瞒|疑|否|惟|唯有|只好|无奈|不得已)/
// 🔥 T15 扩表：补"当场/立刻/随即/就/便/而后/自此/收/交/送/递/记下/写上/改口/定下/斩/押/拘/免"等结果落地
const CHANGE = /(于是|遂|因而|结果|最终|终于|已然|已经|成了|变为|落下|定下|定案|到手|归附|失守|败退|退去|斩|杀了|拿下|交出|同意|应了|答应|签下|画押|按着|抚上印|鸣金|撤|散去|出发|启程|离开|进了城|进了[^。！？\n]{0,4}(门|帐|府)|跪|投降|低头|放[^。！？\n]{0,4}下|不再|再也|此后|当场|立刻|随即|而后|自此|自后|收[^。！？\n]{0,4}(了|起|下)|交[^。！？\n]{0,4}(了|给|出)|送[^。！？\n]{0,4}(去|到|出)|递[^。！？\n]{0,4}(上|去|给)|记[^。！？\n]{0,4}(下|上)|写[^。！？\n]{0,4}(下|上|完)|改了口|押[^。！？\n]{0,4}(下|走|上)|拘[^。！？\n]{0,4}(了|下)|免[^。！？\n]{0,4}了|报[^。！？\n]{0,4}(了|上去)|派人|带去)/

/** 场景切分：显式时空位移优先 */
const SHIFT = /^\s*(翌日|次日|第二天|第二日|三日后|两日后|当夜|是夜|入夜|天亮|天明|清晨|午后|黄昏|傍晚|与此同时|同一时间|另一边|另一处|城头|城下|帐中|府内|殿上|途中|路上|月余|数日后|十数日后|片刻后|半炷香后|许久后)/

function countChinese(s: string): number {
  const m = String(s || '').match(/[\u4e00-\u9fa5]/g)
  return m ? m.length : 0
}

function sentencesOf(text: string): string[] {
  return String(text || '')
    .split(/[。！？…\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
}

/** 切场景（返回每场的段落数组 + 起始偏移） */
function splitScenes(text: string): Array<{ head: string; body: string; offset: number }> {
  const paras: Array<{ p: string; offset: number }> = []
  let idx = 0
  for (const raw of String(text || '').split('\n')) {
    const p = raw.trim()
    if (p) paras.push({ p, offset: idx })
    idx += raw.length + 1
  }
  if (!paras.length) return []

  // ① 显式位移标记处切
  const cuts: number[] = []
  for (let i = 1; i < paras.length; i++) {
    if (SHIFT.test(paras[i].p)) cuts.push(i)
  }
  const groups: Array<{ p: string; offset: number }[]> = []
  if (cuts.length >= 2) {
    let start = 0
    for (const c of cuts) {
      if (c - start >= 1) { groups.push(paras.slice(start, c)); start = c }
    }
    groups.push(paras.slice(start))
  } else {
    // ② 无明显位移标记：按段落数等分 1-3 场（保持段落完整）
    const n = paras.length >= 9 ? 3 : paras.length >= 6 ? 2 : 1
    const per = Math.ceil(paras.length / n)
    for (let i = 0; i < paras.length; i += per) groups.push(paras.slice(i, i + per))
  }
  return groups.filter((g) => g.length).map((g) => ({
    head: (g[0].p || '').slice(0, 40),
    body: g.map((x) => x.p).join('\n'),
    offset: g[0].offset,
  }))
}

export function runSceneGate(text: string, _opts: Record<string, unknown> = {}): SceneGateResult {
  const out: SceneGateResult = { scenes: [], findings: [], summary: '' }
  try {
    const scenes = splitScenes(text)
    if (!scenes.length) return out
    scenes.forEach((sc, i) => {
      const cc = countChinese(sc.body)
      const sents = sentencesOf(sc.body)
      const goal: string[] = [], obstacle: string[] = [], change: string[] = []
      for (const s of sents) {
        if (GOAL.test(s) && goal.length < 3) goal.push(s.slice(0, 50))
        if (OBSTACLE.test(s) && obstacle.length < 3) obstacle.push(s.slice(0, 50))
        if (CHANGE.test(s) && change.length < 3) change.push(s.slice(0, 50))
      }
      const missing: Array<'goal' | 'obstacle' | 'change'> = []
      if (!goal.length) missing.push('goal')
      if (!obstacle.length) missing.push('obstacle')
      if (!change.length) missing.push('change')
      out.scenes.push({ index: i + 1, head: sc.head, chineseChars: cc, goal, obstacle, change, missing })

      // 场景过短（<120 汉字）时不判三要素缺失，避免把过场句误判（oh-story：低压/过场章留阶段目标即可）
      // 🔥 T15：最小可判场长 120→200（过场/短切场次不判三要素）；缺段判级 S2→S3（词典法缺段属提示级）
      if (cc < 200) return
      if (missing.length >= 2) {
        out.findings.push({
          rule: 'scene-triplet-missing',
          severity: 'S3',
          message: '第 ' + (i + 1) + ' 场缺场景三要素中的 ' + missing.length + ' 项：缺' +
            missing.map((m) => (m === 'goal' ? '目标' : m === 'obstacle' ? '阻碍' : '变化')).join('、') +
            '（该场 ' + cc + ' 汉字，首句「' + sc.head + '」）',
          evidence: sc.head,
          fix: '给第 ' + (i + 1) + ' 场补上缺的要素：目标＝人物此刻要什么；阻碍＝什么挡着；变化＝结束后跟之前不同（落在动作/结果）',
        })
      } else if (missing.length === 1) {
        out.findings.push({
          rule: 'scene-triplet-weak',
          severity: 'S4',
          message: '第 ' + (i + 1) + ' 场缺「' + (missing[0] === 'goal' ? '目标' : missing[0] === 'obstacle' ? '阻碍' : '变化') + '」证据句（首句「' + sc.head + '」）',
          evidence: sc.head,
          fix: '补一句可指认的' + (missing[0] === 'goal' ? '意愿/指令' : missing[0] === 'obstacle' ? '阻力/受挫' : '结果落地') + '句',
        })
      }
    })
    const okCount = out.scenes.filter((s) => s.missing.length === 0).length
    out.summary = '场景 ' + out.scenes.length + ' 场 · 三要素齐备 ' + okCount + '/' + out.scenes.length +
      (out.findings.length ? ' · 缺段 ' + out.findings.length + ' 处' : '')
    return out
  } catch (_e) {
    return out
  }
}

/** 供 60 章报告使用的一行摘要 */
export function sceneLine(chapterNumber: number, title: string, r: SceneGateResult): string {
  return 'ch' + chapterNumber + ' 《' + title + '》：' + r.summary
}