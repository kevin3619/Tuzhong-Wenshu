/**
 * oh-story · 七类状态变化抽取器（G-08，自包含确定性，零 LLM）
 * ============================================================
 * 依据 long-chapter-quality.md「章节推进」：
 *   本章至少改变 目标 / 风险 / 信息 / 关系 / 资源 / 身份 / 情绪立场 七类状态之一；
 *   「删掉这章会损失哪项状态变化？答不出才需压缩」。
 *
 * 实现口径（确定性、可复测、可解释）：
 *   ① 逐句扫描，用每类状态的【变化锚点】词表 + 主语/宾语格局判定是否构成一次"状态改变事件"；
 *   ② 只有"改变"才计（如「决意/下令/改口」而非「他想」；「到手/归附/折损」而非「有粮」）；
 *   ③ 输出每类的命中次数、证据句（可追溯到章内原文）、覆盖类别集合；
 *   ④ 与细纲/节拍表声明的"应改变类别"比对 → 交集为空 = S2（推进缺失）。
 * 任何分支不抛错；纯字符串处理，无外部依赖。
 */

export type StateCategory = 'goal' | 'risk' | 'info' | 'relation' | 'resource' | 'identity' | 'stance'

export const STATE_CATEGORIES: StateCategory[] = ['goal', 'risk', 'info', 'relation', 'resource', 'identity', 'stance']

export const STATE_LABELS: Record<StateCategory, string> = {
  goal: '目标',
  risk: '风险',
  info: '信息',
  relation: '关系',
  resource: '资源',
  identity: '身份',
  stance: '情绪立场',
}

interface CatRule {
  /** 该类的"状态改变"锚点（必须是改变动作，不是静态描述） */
  change: RegExp
  /** 附加的语境限制（可选）：命中后还需满足，避免假阳性 */
  guard?: RegExp
}

const RULES: Record<StateCategory, CatRule> = {
  goal: {
    // 🔥 T15 扩表：补「口谕/交割/领受/调派/嘱咐/点将/派人/让…去/自己去」等实际目标动作与对白指令
    change: /(决意|打定主意|下定决心|定下[^。！？\n]{0,6}(计|策|调)|定策|下令|传令|吩咐|口谕|交待|交代|嘱咐|要[^。！？\n]{0,6}(人|他|你)[^。！？\n]{0,4}(去|办|做)|让[^。！？\n]{0,4}(去|办|做)|派人|派[^。！？\n]{0,4}(去|往)|领命|领受|请缨|揽下|接下[^。！？\n]{0,4}(差|令)|交割|改[^。！？\n]{0,4}(主意|目标|方向)|放弃[^。！？\n]{0,6}(计划|打算|念想)|不再[^。！？\n]{0,6}(打算|想)|立誓|发誓|誓要|务必|此番[^。！？\n]{0,6}(必|定)|此去[^。！？\n]{0,6}(必要|定要)|须[^。！？\n]{0,4}(先|即|得)|得[^。！？\n]{0,4}(先|赶|办))/,
  },
  risk: {
    // 风险升级/新威胁/代价显现/期限
    change: /(危机|危险[^。！？\n]{0,4}(将至|逼近|临头)|若不[^。！？\n]{0,10}(则|便)|否则|后果|代价|倒计时|只剩[^。！？\n]{0,4}(日|天|月)|来不及|限期|三日内|五日内|下月[^。！？\n]{0,4}(前|之前)|被[^。！？\n]{0,6}(围|困|抄|断)|陷[^。！？\n]{0,4}(重围|绝境)|失守|告急|危急|岌岌可危|罪名|弹劾|下狱|问罪|追究|raised|追责)/,
  },
  info: {
    // 新信息被揭示/情报到手/真相暴露/密信/账目/口供
    change: /(得知|获悉|情报|密报|军报|探得|查[^。！？\n]{0,4}(出|明|实)|查明|查出|揭[^。！？\n]{0,4}(开|露)|暴露|露[^。！？\n]{0,4}(馅|底)|真相|原来是|竟是|帐[^。！？\n]{0,4}(目|册)|账册|口供|人证|物证|书信|密信|收到[^。！？\n]{0,4}(信|报|折)|密告|告发|交代了|说出[^。！？\n]{0,4}(实情|真相))/,
  },
  relation: {
    // 关系推进/破裂/结盟/反目/归附/婚约
    change: /(结[^。！？\n]{0,4}(盟|好|亲|交)|盟约|归附|投奔|效忠|臣服|反目|翻脸|背叛|决裂|断交|和好|和解|联姻|婚约|许配|认[^。！？\n]{0,4}(亲|主|师父)|拜[^。！？\n]{0,4}(师|将)|收[^。！？\n]{0,4}(徒|为义子)|形同陌路|势成水火|不再信任|离[^。！？\n]{0,4}心)/,
  },
  resource: {
    // 资源增减（兵/粮/银/城/地盘/印信）
    change: /(到手|收入囊中|归[^。！？\n]{0,4}(我|他|主上)?所有|夺得|缴获|截获|掠[^。！？\n]{0,4}(得|获)|折损|损失|消耗|耗[^。！？\n]{0,4}(尽|光)|缺[^。！？\n]{0,4}(粮|饷|兵|银)|断[^。！？\n]{0,4}(粮|饷|援)|增[^。！？\n]{0,4}(兵|援|饷)|调[^。！？\n]{0,4}(兵|粮|银)|拨[^。！？\n]{0,4}(银|粮|兵)|献[^。！？\n]{0,4}(城|印|银)|献上|交出[^。！？\n]{0,4}(印|符|兵|粮)|失[^。！？\n]{0,4}(城|地|营)|弃[^。！？\n]{0,4}(城|地)|下[^。！？\n]{0,4}(城|营)|克[^。！？\n]{0,4}(城|敌)|破城)/,
  },
  identity: {
    // 身份/名分/职位/资格变化
    change: /(登基|即位|践祚|称帝|封[^。！？\n]{0,4}(王|侯|伯|公|将军|官职)|授[^。！？\n]{0,4}(职|衔|印)|加[^。！？\n]{0,4}(封|号|官)|拜[^。！？\n]{0,4}(相|将|官)|擢[^。！？\n]{0,4}(升|为)|革职|罢[^。！？\n]{0,4}(官|职)|削[^。！？\n]{0,4}(爵|职)|夺[^。！？\n]{0,4}(官|职|爵)|降[^。！？\n]{0,4}(职|级)|下狱|问斩|处斩|自尽|殉[^。！？\n]{0,4}(国|节)|身死|殒命|不治|成了[^。！？\n]{0,4}(皇帝|监国|主帅|首领))/,
  },
  stance: {
    // 🔥 T15 扩表：补「点头/摇头/沉默良久后开口/语气变了/哭/笑/咬牙/叹气」等可见立场变化
    change: /((他|她)[^。！？\n]{0,8}(不[^。！？\n]{0,4}(怕|再犹豫)|终于[^。！？\n]{0,4}(定|狠|忍|放)|想通|释然|不再[^。！？\n]{0,4}(迟疑|犹豫|害怕)|动摇了|服软|认了|心冷|心定|横下心|点了(点)?头|摇了(摇)?头|叹了(口)?气)|(转念|转而|反手|改口|松口|改主意|语气[^。！？\n]{0,4}(变|沉|软))|不再[^。！？\n]{0,6}(相信|忍|等)|忍不[^。！？\n]{0,2}住|眼泪[^。！？\n]{0,4}(掉|落)下来|笑[^。！？\n]{0,2}(出来|了)|哭[^。！？\n]{0,2}出声|咬了咬[^。！？\n]{0,4}牙|沉默[^。！？\n]{0,4}(片刻|半晌|良久))/,
  },
}

export interface StateDeltaHit {
  category: StateCategory
  /** 该类的"改变事件"命中次数 */
  count: number
  /** 证据句（最多 4 条，可追溯到章内原文） */
  evidence: string[]
}

export interface StateDeltaResult {
  /** 发生改变的类别集合（本章推进了什么） */
  changed: StateCategory[]
  /** 未发生改变的类别 */
  unchanged: StateCategory[]
  hits: StateDeltaHit[]
  /** 改变事件总次数 */
  totalEvents: number
  /** 一句话摘要（日志/报告用） */
  summary: string
}

function sentences(text: string): string[] {
  return String(text || '')
    .split(/[。！？…；\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
}

/**
 * 抽取一章的七类状态变化。
 * @param text 章节正文（纯正文，可含标题行）
 * @param opts.expectCategories 细纲/节拍表声明的"本章应改变类别"（用于缺失判定）
 */
export function extractStateDeltas(text: string, opts: { expectCategories?: StateCategory[] } = {}): StateDeltaResult {
  const out: StateDeltaResult = { changed: [], unchanged: [], hits: [], totalEvents: 0, summary: '' }
  try {
    const sents = sentences(text)
    for (const cat of STATE_CATEGORIES) {
      const rule = RULES[cat]
      const evidence: string[] = []
      let count = 0
      for (const s of sents) {
        if (rule.change.test(s)) {
          count++
          if (evidence.length < 4) evidence.push(s.length > 60 ? s.slice(0, 60) + '…' : s)
        }
      }
      out.hits.push({ category: cat, count, evidence })
      if (count > 0) out.changed.push(cat)
      else out.unchanged.push(cat)
      out.totalEvents += count
    }
    const expect = Array.isArray(opts.expectCategories) ? opts.expectCategories.filter(Boolean) : []
    const missing = expect.filter((c) => out.changed.indexOf(c) < 0)
    out.summary = '改变 ' + out.changed.length + '/7 类（' + (out.changed.map((c) => STATE_LABELS[c]).join('、') || '无') + '）' +
      ' · 事件 ' + out.totalEvents + (expect.length ? (' · 细纲期望[' + expect.map((c) => STATE_LABELS[c]).join('、') + ']缺[' + (missing.map((c) => STATE_LABELS[c]).join('、') || '无') + ']') : '')
    return out
  } catch (_e) {
    return out
  }
}

/**
 * 推进门禁判定：按 oh-story「至少改变七类状态之一」+ 细纲期望比对。
 * 返回 findings 形状的对象数组（由 quality-gate 统一并入 S1-S4 表）。
 */
export function stateDeltaFindings(text: string, opts: { expectCategories?: StateCategory[] } = {}): Array<{
  rule: string; severity: 'S1' | 'S2' | 'S3' | 'S4'; message: string; evidence: string; fix: string
}> {
  const r = extractStateDeltas(text, opts)
  const out: Array<{ rule: string; severity: 'S1' | 'S2' | 'S3' | 'S4'; message: string; evidence: string; fix: string }> = []
  // 七类全无 = 本章没有推进（S2，非 S1：慢热章允许低压小变化，但仍需至少一类）
  if (r.changed.length === 0) {
    out.push({
      rule: 'state-delta-none',
      // 🔥 T15：降为 S3——抽取器是词典法，零命中不等于"本章真没推进"（编辑第三轮独立结论：60/60 章
      //   都可指认状态变化）。保留定位价值，不把达标章打成 CONCERNS。需人工/LLM 复核。
      severity: 'S3',
      message: '本章未改变七类状态中的任何一类（目标/风险/信息/关系/资源/身份/情绪立场）——删掉这章不会损失状态变化',
      evidence: '',
      fix: '给本章至少一类可指认的状态改变，并落在具体动作或结果上（哪怕低压：小收益、小让步、小发现）',
    })
  } else if (r.changed.length === 1) {
    out.push({
      rule: 'state-delta-single',
      severity: 'S4',
      message: '本章仅改变 1 类状态（' + STATE_LABELS[r.changed[0]] + '），推进偏薄',
      evidence: (r.hits.find((h) => h.count > 0) || { evidence: [] }).evidence.slice(0, 1).join(''),
      fix: '再补一类可见变化（如同时改变"信息"与"关系"），但不必为凑数加戏',
    })
  }
  // 细纲期望类别缺失 = S2（与批准细纲冲突才算必须修，这里按建议修判 S2/S3）
  const expect = Array.isArray(opts.expectCategories) ? opts.expectCategories.filter(Boolean) : []
  const missing = expect.filter((c) => r.changed.indexOf(c) < 0)
  if (missing.length && missing.length >= Math.max(1, Math.ceil(expect.length / 2))) {
    out.push({
      rule: 'state-delta-vs-plan',
      severity: 'S3',
      message: '细纲要求改变【' + expect.map((c) => STATE_LABELS[c]).join('、') + '】，正文实际缺【' + missing.map((c) => STATE_LABELS[c]).join('、') + '】',
      evidence: r.summary,
      fix: '按细纲补齐缺失类别的改变事件（落在动作/结果，不要用概述代替）',
    })
  }
  return out
}

/** 30 秒可读的一行报告（供 60 章实测报告使用） */
export function stateLine(chapterNumber: number, title: string, r: StateDeltaResult): string {
  return 'ch' + chapterNumber + ' 《' + title + '》：改变 ' + r.changed.length + '/7 [' +
    r.changed.map((c) => STATE_LABELS[c]).join(',') + '] 事件' + r.totalEvents
}