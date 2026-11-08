/**
 * oh-story · 补充门禁（自包含确定性，零 LLM）
 * ============================================================
 * 本文件集中承载四项 T6 门禁，避免散落：
 *   · G-10 一章新概念 ≤ 3（信息传递：设定量可控）
 *   · G-18 前 3 章 opening-gate（开篇落笔：主角 300 字内出场／1000 字内钩子／首场非景物／第一章主要角色 ≤3）
 *   · G-04 相邻两章钩子同型检查（章尾：连续两章不用同一种钩子）
 *   · G-16 judge 失败语义（失败返回 unknown，不触发重写）
 * 纯字符串/数值处理，无外部依赖，任何分支不抛错。
 */

export interface GateFindingLike {
  rule: string
  severity: 'S1' | 'S2' | 'S3' | 'S4'
  message: string
  evidence: string
  fix: string
}

/* ------------------------------------------------------------------ */
/* G-10 新概念上限                                                     */
/* ------------------------------------------------------------------ */

/** 已知设定名（由调用方注入：作品设定库/人物档案/势力表里的专名） */
export interface InfoConceptOptions {
  /** 已知专名集合（命中即不算新概念） */
  knownConcepts?: string[]
  /** 上限（默认 3；oh-story：一章不超 3 个新概念） */
  maxNewConcepts?: number
}

// 🔥 2026-10-26 T15：分词碎片修正。
//   旧版问题（实测 46/60 章误报）：① 「…」引号内多是**对白**（「的执事太监」直接被当成概念）；
//   ② 建制后缀正则会**跨词界**匹配（「是肇庆卫」「所后院」「由榔走出卫」——把前一个动词/助词吞进来）。
//   修正：删除引号模式；建制/地名模式加「不得以助词/动词/代词起头」的前置保护 + 后缀后须接非词界；
//   职官模式保留（区分度高）。另配合 knownConcepts（书级已出现专名）进一步去噪。
const CONCEPT_PATTERNS = [
  /《[^》]{2,12}》/g,                       // 文书/典籍专名（最具区分度）
  // 🔥 T15 再修：中文无词界，必须要求**前置边界**（行首/空白/标点/引号）才可算"一个专名"，
  //   否则仍会跨词界吞掉前一个动词/助词/代词（实测残留：军械库在卫、所后院、由榔走出卫、关在卫、站着的亲卫）
  /(?:^|[\s，。、；：！？…“”「」『』（）【】])([一-龥]{2,4}(?:司|卫|营|阁|院|监|仓|局|隘|港))/g,
  /(?:^|[\s，。、；：！？…“”「」『』（）【】])([一-龥]{2,5}(?:总督|巡抚|按察|布政|守备|参将|游击|都司|千总|把总|佥事|给事中|御史|大学士|尚书|侍郎|知府|知县|通政使|提刑按察))/g, // 职官
]

/** 高频日常词（历史题材每天都在用，不是"新概念"） */
const CONCEPT_STOPLIST = new Set([
  '王府', '抚院', '军中', '城外', '城门', '朝廷', '后宫', '前院', '后院', '厢房', '书房', '大堂',
  '衙门', '县衙', '府衙', '军营', '营中', '帐中', '院中', '城中', '宫中', '殿中', '东门', '南门',
  '西门', '北门', '水门', '大门', '后门', '侧门', '廊下', '仓中', '监中', '局中', '海关', '关口',
  '镇上', '院所', '院落', '医馆', '茶馆', '酒馆', '客栈', '官署', '公署', '行在', '行宫',
])

function collectConcepts(text: string): string[] {
  const out = new Set<string>()
  for (const re of CONCEPT_PATTERNS) {
    const m = String(text || '').match(re)
    // 🔥 T15：前置边界模式命中片段含边界符，需剔除后再入集（并捕获组优先）
    if (m) m.forEach((x) => {
      const inner = (String(x).match(/[一-龥]+/g) || []).join('')
      if (inner) out.add(inner.replace(/[《》「」]/g, ''))
    })
  }
  // 停用词过滤（含长度过滤：机构/地名类至少 3 字才算"概念"）
  return Array.from(out).filter((x) => x.length >= 3 && !CONCEPT_STOPLIST.has(x))
}

/** 公开：抽取正文里的专名（已过滤停用词），供报告/门禁共用 */
export function collectConceptNames(text: string): string[] { try { return collectConcepts(text) } catch (_e) { return [] } }

export function infoConceptFindings(text: string, opts: InfoConceptOptions = {}): GateFindingLike[] {
  const out: GateFindingLike[] = []
  try {
    const max = Number(opts.maxNewConcepts || 3)
    const known = new Set((opts.knownConcepts || []).map((s) => String(s).trim()).filter(Boolean))
    const all = collectConcepts(text)
    const fresh = all.filter((c) => !known.has(c))
    if (!fresh.length) return out
    // 🔥 T15：专名（地名/建制/职官）在历史题材每章天然出现多个，阈值口径改为
    //   >max+5（=8）才判 S2「设定超载」，>max（=3）判 S3；并支持 knownConcepts 书级设定库去噪。
    if (fresh.length > max + 5) {
      out.push({
        rule: 'info-concept-overflow',
        severity: 'S2',
        message: '本章新概念 ' + fresh.length + ' 个（上限 ' + max + '）——设定量超载：' + fresh.slice(0, 8).join('、'),
        evidence: fresh.slice(0, 6).join('、'),
        fix: '把超出上限的新概念改为已有设定的称呼，或把说明拆到后续章节随冲突引出；一章只放眼前这场戏用得上的一条',
      })
    } else if (fresh.length > max) {
      out.push({
        rule: 'info-concept-overflow',
        severity: 'S3',
        message: '本章新概念 ' + fresh.length + ' 个（上限 ' + max + '）：' + fresh.slice(0, 8).join('、'),
        evidence: fresh.slice(0, 6).join('、'),
        fix: '压到 3 个以内；信息跟着冲突走，不做百科式介绍',
      })
    }
    return out
  } catch (_e) {
    return out
  }
}

/** 供报告使用 */
export function conceptLine(chapterNumber: number, title: string, text: string, known: string[] = []): string {
  const all = collectConcepts(text)
  const knownSet = new Set(known)
  const fresh = all.filter((c) => !knownSet.has(c))
  return 'ch' + chapterNumber + ' 《' + title + '》：新概念 ' + fresh.length + (fresh.length ? ' [' + fresh.slice(0, 6).join(',') + ']' : '')
}

/* ------------------------------------------------------------------ */
/* G-18 前 3 章 opening-gate                                            */
/* ------------------------------------------------------------------ */

export interface OpeningGateOptions {
  chapterNumber: number
  /** 主角名（用于 300 字内出场判定） */
  protagonistName?: string
  /** 第 1 章允许的主要角色名单（用于 ≤3 判定） */
  mainCast?: string[]
}

export const OPENING_CHAPTER_LIMIT = 3

/** 需在主角 300 字内出场、1000 字内出现第一个"想往下看的点" */
export const OPENING_PROTAGONIST_BY = 300
export const OPENING_HOOK_BY = 1000

const HOOK_POINT = /(却|竟|突然|危机|急报|刀|血|杀|闯入|追|围|逼|抢|逃|破|怒|吼|质问|弹劾|查办|密报|军报|来不及|只剩|必须|否则|抉择|两难)/
const SCENERY_OPEN = /^\s*(天空|天色|窗外|阳光|乌云|风|雨|雪|夜色|月色|清晨|傍晚|朝阳|夕阳|暮色|晨雾|远山|山峦|江面|海面)/
const CHAPTER1_GOAL = /(要|想|须|必须|得|决意|打算|定要|务必|誓|目的|为的是|下令|传令|吩咐)/

function chineseCharsUpTo(s: string, idx: number): number {
  const m = String(s || '').slice(0, idx).match(/[\u4e00-\u9fa5]/g)
  return m ? m.length : 0
}

export function openingGateFindings(text: string, opts: OpeningGateOptions): GateFindingLike[] {
  const out: GateFindingLike[] = []
  try {
    if (!opts || !(opts.chapterNumber >= 1 && opts.chapterNumber <= OPENING_CHAPTER_LIMIT)) return out
    const t = String(text || '')
    const n = Number(opts.chapterNumber)
    const firstPara = (t.split('\n').find((x) => x.trim()) || '').trim()
    const cjkTotal = (t.match(/[\u4e00-\u9fa5]/g) || []).length

    // ① 首场不得是景物/天气/世界观铺陈
    if (SCENERY_OPEN.test(firstPara)) {
      out.push({
        rule: 'opening-scenery',
        severity: 'S2',
        message: '第 ' + n + ' 章开篇为景物/天气铺陈（非入戏）：「' + firstPara.slice(0, 30) + '」',
        evidence: firstPara.slice(0, 40),
        fix: '首段前 3 行直接切入冲突/悬念/对话或主角紧迫决断；环境五感全章只点染一两处且绑定人物处境',
      })
    }

    // ② 主角 300 字内出场
    const pname = String(opts.protagonistName || '').trim()
    if (pname) {
      const at = t.indexOf(pname)
      const charsBefore = at >= 0 ? chineseCharsUpTo(t, at) : -1
      if (at < 0 || charsBefore > OPENING_PROTAGONIST_BY) {
        out.push({
          rule: 'opening-protagonist-late',
          severity: 'S2',
          message: '第 ' + n + ' 章主角「' + pname + '」' + (at < 0 ? '全章未点名出场' : '在第 ' + charsBefore + ' 个汉字处才出场（要求 ≤' + OPENING_PROTAGONIST_BY + '）'),
          evidence: firstPara.slice(0, 40),
          fix: '让主角在开篇 300 字内出场并处在压力里（用动作/对话带出，不做身世介绍）',
        })
      }
    }

    // ③ 1000 字内出现第一个"想往下看的点"
    const head = t.slice(0, Math.max(1200, Math.ceil(t.length * 0.5)))
    const hookIdx = head.search(HOOK_POINT)
    const hookChars = hookIdx >= 0 ? chineseCharsUpTo(t, hookIdx) : -1
    if (hookChars < 0 || hookChars > OPENING_HOOK_BY) {
      out.push({
        rule: 'opening-hook-late',
        severity: 'S2',
        message: '第 ' + n + ' 章' + (hookChars < 0 ? '全章未见反常/危机/筹码露头' : '第一个悬念点出现在第 ' + hookChars + ' 个汉字处（要求 ≤' + OPENING_HOOK_BY + '）'),
        evidence: firstPara.slice(0, 40),
        fix: '开篇 1000 字内给出反常、危机或筹码露头',
      })
    }

    // ④ 第 1 章：主要角色 ≤3；章末读者能说出主角眼下要干什么
    if (n === 1) {
      const cast = (opts.mainCast || []).map((s) => String(s).trim()).filter(Boolean)
      const appeared = cast.filter((name) => t.indexOf(name) >= 0)
      if (appeared.length > 3) {
        out.push({
          rule: 'opening-cast-overflow',
          severity: 'S3',
          message: '第 1 章出场主要角色 ' + appeared.length + ' 个（要求 ≤3）：' + appeared.slice(0, 6).join('、'),
          evidence: appeared.slice(0, 6).join('、'),
          fix: '合并或后移次要角色；后文没戏份的配角不给名字',
        })
      }
      const tail = t.slice(-420)
      if (!CHAPTER1_GOAL.test(tail)) {
        out.push({
          rule: 'opening-ch1-goal-missing',
          severity: 'S3',
          message: '第 1 章结尾未让读者看清主角眼下要干什么（尾部 420 字无意愿/决断句）',
          evidence: tail.slice(-40),
          fix: '在章末落一句主角眼下要做的事（或用一个动作让意图可见），使读者能一句话说出"他要干什么"',
        })
      }
    }
    return out
  } catch (_e) {
    return out
  }
}

/* ------------------------------------------------------------------ */
/* G-04 相邻两章钩子同型                                                */
/* ------------------------------------------------------------------ */

export const HOOK_TYPES_FOR_DIVERSITY = [
  '紧急危机', '未完成动作', '突发揭示/新信息', '神秘物品', '两难抉择', '承诺/威胁', '疑问留白', '动作收束', 'none',
] as const

export function hookDiversityFindings(curHookType: string, prevHookType?: string | null, opts: { chapterNumber?: number } = {}): GateFindingLike[] {
  const out: GateFindingLike[] = []
  try {
    const cur = String(curHookType || 'none')
    const prev = String(prevHookType || '').trim()
    if (!prev || cur === 'none') return out
    if (cur === prev) {
      out.push({
        rule: 'hook-type-repeat',
        // 🔥 T15：相邻章钩子同型属**风格建议**（oh-story 亦列为风格项），降为 S4（仅提示），不驱动 CONCERNS
        severity: 'S4',
        message: '第 ' + (opts.chapterNumber || '?') + ' 章章尾钩子与上一章同型（都是「' + cur + '」）——oh-story：连续两章不用同一种钩子',
        evidence: 'prev=' + prev + ' cur=' + cur,
        fix: '换一类钩子（按章尾 13 式与本章情绪重选），或把落点前移到未完成动作/信息差',
      })
    }
    return out
  } catch (_e) {
    return out
  }
}

/* ------------------------------------------------------------------ */
/* G-16 judge 失败语义                                                  */
/* ------------------------------------------------------------------ */

/** judge 结果的统一形状（与 chapter-engine/judge.ts 的 JudgeResult 兼容 + 允许失败标记） */
export interface JudgeLike {
  score?: number
  issues?: string[]
  degraded?: boolean
}

export interface NormalizedJudge {
  /** 归一化后的分数；失败/不可用时为 null（unknown，不是 0 分） */
  score: number | null
  issues: string[]
  /** 本次判定是否失效（解析失败/超时/降级） */
  degraded: boolean
  reason: string
}

/**
 * 归一化 judge 结果：失败返回 score=null（unknown），**不得**当成 0 分。
 * 依据：T1 实测 chapter-engine/judge.ts 解析失败时返回 {score:0, issues:[]}，
 *   会让「调用失败」被误当成「质量 0 分」并触发定点重写。
 */
export function normalizeJudgeResult(raw: JudgeLike | null | undefined): NormalizedJudge {
  try {
    if (!raw || typeof raw !== 'object') return { score: null, issues: [], degraded: true, reason: '无 judge 结果（缺参/调用失败）' }
    const issues = Array.isArray(raw.issues) ? raw.issues.map((x) => String(x)).filter(Boolean) : []
    const s = Number(raw.score)
    const explicitDegrade = raw.degraded === true
    // 失败特征：无分数 / 非有限数 / 显式降级 / 0 分且无任何问题描述（原实现的两条失败路径之一）
    if (!isFinite(s)) return { score: null, issues, degraded: true, reason: 'judge 分数非有限数' }
    if (explicitDegrade) return { score: null, issues, degraded: true, reason: 'judge 显式降级' }
    if (s === 0 && issues.length === 0) return { score: null, issues, degraded: true, reason: 'judge 返回 0 分且无 issues（原实现把解析失败伪装成 0 分）' }
    return { score: s, issues, degraded: false, reason: 'ok' }
  } catch (_e) {
    return { score: null, issues: [], degraded: true, reason: 'judge 结果归一化异常' }
  }
}

/** 是否应当因 judge 判定而触发重写：只有拿到了有效分数才允许触发 */
export function shouldRewriteByJudge(raw: JudgeLike | null | undefined, threshold = 70): boolean {
  const n = normalizeJudgeResult(raw)
  if (n.degraded || n.score === null) return false
  return n.score < threshold
}