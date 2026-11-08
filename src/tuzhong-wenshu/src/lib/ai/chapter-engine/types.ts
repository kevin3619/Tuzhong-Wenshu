/**
 * 🔥 逐章精写引擎（chapter-engine）—— 类型定义
 *
 * 设计目标：把「一章正文」从单次大模型调用，升级为
 *   节拍表(beat) → 分场景写作(scene) → 装配(assemble) → 质检(audit) → 定点修复(repair)
 * 的多阶段流水线，每一步都有可执行的质量闸门（与具体大模型无关）。
 */

import type { LLMConfig } from '../llm'

/** 引擎入参：由 /api/ai-generate 的 case 'content' 组装传入 */
export interface ChapterEngineInput {
  /** 已解析好的模型配置（路由层已按免费模型池选优） */
  llmConfig: LLMConfig
  /** 🔥 2026-10-21：发起请求的用户（用于用户自有模型优先） */
  userId?: string | null
  /** 🔥 2026-10-21：统一模型路由结果（角色级固定主模型 + 兜底链） */
  routing?: {
    source: 'explicit' | 'user-own' | 'admin' | 'none'
    kind: string
    primary: LLMConfig | null
    prose: LLMConfig | null
    structure: LLMConfig | null
    judge: LLMConfig | null
    chain: LLMConfig[]
    reason?: string
  }
  /** 🔥 2026-10-18：用户在「个人设置→平台AI检测配置」保存的平台标准（设置页→localStorage→写页随请求上传） */
  platformStandards?: PlatformStandard[]
  /** 作品唯一键（novelId；向导传 'temp' 时回落为标题/主角哈希） */
  novelKey?: string
  /** 书名（用于断章台账 key 与断章衔接） */
  novelTitle?: string
  genre?: string
  chapterNumber: number
  chapterTitle: string
  /** 本章核心剧情（来自章节大纲） */
  corePlot: string
  /** 本章爽点（大纲里标注的） */
  shuangPoints?: string
  /** 上一章结尾原文尾部 */
  prevEnding?: string
  /** 前文章节摘要 */
  prevChaptersSummary?: string
  /** 🔥 2026-10-22：前文已出现过的公式化句式（跨章重复黑名单，注入场景提示词） */
  prevPhrases?: string[]
  /** 🔥 2026-10-22：上一章正文（用于跨章重复判定与擦除） */
  prevFullText?: string
  /** 作品设定上下文（人物/世界观/力量体系等，逐条） */
  contextParts: string[]
  /** 目标字数（口径：去空白含标点字符数；默认 2000，区间 1800-2200） */
  targetWords: number
  style?: string
  newCharacters?: string
  protagonistName?: string
  castNames?: string[]
  /** 🔥 2026-10-19：人物档案（一行一人：名｜阵营｜身份｜与主角关系｜时序铁律）——注入节拍表与场景提示词，防人物关系乱贴 */
  castBrief?: string[]
  /** 🔥 2026-10-19：人工剧情施工蓝图（本章逐场设计）——有蓝图时跳过节拍表 LLM，按蓝图执行，剧情可控 */
  blueprint?: {
    premise?: string
    endHook?: string
    beats: Array<Partial<Beat> & {
      /** 本场必须写到的要素（逐条落地） */
      mustWrite?: string[]
      /** 本场必写的台词要点（以人物口吻自然说出） */
      dialogueCues?: string[]
      /** 本场禁止出现的内容 */
      avoid?: string[]
    }>
  }
  /** 仿写/主题保护约束（路由层 buildNovelThemeGuard / getImitateConstraint 注入） */
  imitateConstraint?: string
  /** 进度回调（写服务器日志用） */
  onProgress?: (stage: string, detail?: string) => void
}

/** 🔥 2026-10-18：平台 AI 检测标准（与设置页 platformConfigs 结构对齐的精简版） */
export interface PlatformStandard {
  name?: string
  /** 阈值原文，如 '< 30%' */
  aiStandard?: string
  /** 平台检测维度细则 */
  criteria?: string[]
}

/** 节拍表中的一个节拍（= 一个场景/一个叙事单元） */
export interface Beat {
  /** 1-based */
  index: number
  /** 场景小标题（仅内部使用，不进正文） */
  title: string
  /** 时间（含具体时辰/时段） */
  time: string
  /** 地点（具体到可拍摄的空间） */
  place: string
  /** 出场人物（必须来自传入的出场人物列表） */
  cast: string[]
  /** 主角在本场的目标（必须具体可执行） */
  goal: string
  /** 冲突/阻力（至少一方对抗性压力） */
  conflict: string
  /** 反转或转折（爽点或危机升级） */
  turn: string
  /** 本场爽点类型：打脸/逆袭/收获/突破/立威/悬念…（可为空） */
  shuang: string
  /** 本场结尾留下的钩子（承接下一场） */
  hook: string
  /** 本场目标字数（口径：去空白含标点字符数） */
  words: number
  /** 🔥 2026-10-19：蓝图必写要素 */
  mustWrite?: string[]
  /** 🔥 2026-10-19：蓝图必写台词要点 */
  dialogueCues?: string[]
  /** 🔥 2026-10-19：蓝图禁写清单 */
  avoid?: string[]
}

export interface BeatSheet {
  beats: Beat[]
  /** 全章一句话主旨 */
  premise: string
  /** 章末总钩子（下一章抓手） */
  endHook: string
}

/** 已完成的场景文本 */
export interface SceneResult {
  index: number
  title: string
  text: string
  words: number
}

/** 质检指标 */
export interface ChapterMetrics {
  chineseChars: number
  totalChars: number
  paragraphCount: number
  sentenceCount: number
  avgSentenceChars: number
  dialogueRatio: number
  shuangCount: number
  shuangMarkers: string[]
  hookTail: string
}

export interface AuditResult {
  metrics: ChapterMetrics
  /** AI 高频套话命中（短语 → 次数/权重） */
  cliches: { phrase: string; count: number; weight: number }[]
  /** 元叙事/脚手架命中 */
  scaffoldHits: string[]
  /** 标点问题（未配对引号、半角标点、行尾逗号等） */
  punctuationIssues: string[]
  /** 章内复读（重复的 12 字以上短语） */
  repeatedPhrases: string[]
  /** 跨章重复（与断章台账 9-gram 命中） */
  crossChapterOverlaps: string[]
  /** AI 率（0-100） */
  aiRate: number
  aiScore: number
  aiIssues: string[]
  /** 🔥 2026-10-22：oh-story 签约级门禁 findings（含 S1-S4） */
  signingFindings?: import('../oh-story/signing-gates').GateFinding[]
  /** 🔥 2026-10-22：oh-story 签约级门禁总判定（APPROVE/CONCERNS/REJECT） */
  signingVerdict?: import('../oh-story/signing-gates').GateVerdict
  /** 是否通过全部硬闸门 */
  passed: boolean
  /** 未通过原因（可直接作为修复指令） */
  fails: string[]
}

/** 断章台账中的单章记录 */
export interface LedgerChapter {
  chapterNumber: number
  title: string
  /** 本章摘要（确定性生成，不额外烧模型） */
  digest: string
  /** 结尾原文尾部（供下一章衔接） */
  endingTail: string
  locations: string[]
  cast: string[]
  shuangPoints: string[]
  foreshadows: string[]
  /** 本章高频重复短语 */
  repeatedPhrases: string[]
  /** 关键 9-gram 哈希（跨章查重） */
  ngrams: string[]
  chineseChars: number
  updatedAt: number
}

export interface ChapterLedger {
  key: string
  novelTitle: string
  chapters: LedgerChapter[]
}

/** 引擎返回的质检/统计报告（回传前端 _meta，便于验收） */
export interface EngineReport {
  engine: 'chapter-engine-v1'
  stage: 'ok' | 'degraded' | 'fallback'
  novelKey: string
  chapterNumber: number
  /** 🔥 T9：字数口径唯一值（去空白含标点字符数） */
  wordUnits: number
  /** 参考指标：CJK 字符数（不等于字数口径） */
  chineseChars: number
  totalChars: number
  targetWords: number
  llmCalls: number
  scenes: number
  beats: number
  /** 每轮质检结论（用于验收追溯） */
  rounds: Array<{
    round: number
    chineseChars: number
    shuangCount: number
    dialogueRatio: number
    aiRate: number
    repeatedPhrases: number
    crossChapterOverlaps: number
    fails: string[]
  }>
  repairs: string[]
  /** 🔥 2026-10-19：对标白金责编评审结果（0-100 + 具体问题） */
  judgeScore?: number
  judgeIssues?: string[]
  /** 🔥 2026-10-21：自建朱雀口径复检结果（疑似占比 % 与四维分） */
  zqSuspect?: number
  zqDims?: string[]
  /** 🔥 2026-10-25 T2：oh-story 章级统一门禁的单一 verdict 与五维评分（0-100） */
  qgVerdict?: 'APPROVE' | 'CONCERNS' | 'REJECT'
  fiveDim?: {
    core_consistency: number
    expression: number
    format_consistency: number
    readability: number
    logic_coherence: number
    total: number
  }
  /** 是否使用了人工剧情蓝图（跳过 LLM 节拍表） */
  blueprintUsed?: boolean
  degradeReasons: string[]
  ledgerKey: string
  elapsedMs: number
  usedModels: string[]
}

export interface EngineOutput {
  content: string
  report: EngineReport
}
