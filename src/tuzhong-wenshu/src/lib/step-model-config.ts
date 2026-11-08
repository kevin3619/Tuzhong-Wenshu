/**
 * 环节 → 模型 映射表（中央路由表，唯一权威来源）
 *
 * ⚠️ 2026-08-31 精简后约束：models.json 仅保留 22 条「免费/默认」模型：
 *    硅基流动 8（7 款永久免费 + 1 款 DeepSeek-V4-Flash）
 *    智谱GLM 3（glm-4.7-flash / glm-z1-flash / glm-4-flash，Key 有效）
 *    OpenRouter 10（:free 档，Key 有效）
 *    商汤 (SenseTime) 1（sensenova-6.8-flash-lite，Key 未填，仅作兜底池成员）
 *  ⇒ 本表所有常量必须能在上面 22 条里按 provider+model 精确命中，
 *    否则该环节会回落到默认模型（glm-4-flash）。
 *
 * 选型原则（用户 2026-08-31 要求）：
 *   1. 尽量【少调用付费大模型】，默认只用免费/默认集。
 *   2. 【减少 DeepSeek（deepseek-v4-flash）调用】，多用其它免费大模型。
 *      ⇒ DeepSeek 仅在 bookAnalysis（每部 1 次的开局骨架分析）作为主模型，
 *        其余环节一律走智谱/OpenRouter/硅基免费模型；cost 档完全不用 DeepSeek。
 *   3. 决定成败的骨架环节用最强免费模型（智谱 glm-4.7-flash / OpenRouter minimax-m3），
 *      高频正文环节优先性价比（智谱 glm-4-flash / OpenRouter minimax 系列）。
 *
 * 健康度提示（实测）：
 *   - 智谱GLM 3 款、OpenRouter 10 款 Key 均有效，是主路径首选。
 *   - 硅基流动 Key 当前 401 失效；2026-09-01 已将原映射到硅基免费模型的
 *     powerSystem/factions/relationships 改走 OR_MM3 / ZP_Z1F（有效 Key），消除每步 401 兜底绕路。
 *     硅基仅保留 coverImage(Kolors) 与 bookAnalysis(V4_FLASH) 两处；二者 401 时由 callLLMWithFallback 自动跨到智谱/OpenRouter 兜底，不阻断生成。
 *   - 商汤 Key 未填，本表不主动引用，仅作为兜底池成员。
 *
 * ⚡ 2026-09-01 提速：把 powerSystem/outline/factions 从 OR_MM3 切到 ZP_4F（glm-4-flash，实测 ~5.6s），
 *   这三个步骤原 OR_MM3 响应偏慢且偶发截断/返回空值；ZP_4F「综合全能、最快最稳」实测吞吐明显更快、
 *   JSON 输出完整。骨架环节（worldbuilding/characters/content/contractScore）继续用 ZP_47F 保质量；
 *   推理环节（keyPlots/relationships）继续用 ZP_Z1F 保推理深度。
 *
 * 🔥🔥🔥 2026-09-02 三表机制说明（本表是【前端/向导展示层推荐表】之一，非真实调用唯一来源）：
 *   - 真实调用的唯一权威表 = route.ts 的 _STEP_MODEL_MAP（L33010 区域），其后方新增
 *     _STEP_MODEL_POOL 候选池（每环节 20 个候选，22 款模型全纳入）+ _pickStepModelId 动态选优：
 *     遍历候选池时跳过【健康表冷却中 / 无有效 API Key】的模型，取第一个健康可用者；
 *     全部不可用时回退权威表首选。质量敏感环节（idea/worldbuilding/powerSystem/characters）
 *     首选 minimax-m3:free，高频环节首选 glm-4-flash，推理环节（keyPlots/relationships）首选 glm-z1-flash。
 *   - llm.ts 维护模块级模型健康表 _llmModelHealth：失败≥2 次进冷却（429 硬冷却 15 分钟、
 *     其余软冷却 5 分钟），冷却模型在 modelsToTry 中后置、_pickStepModelId 直接跳过；
 *     429 退避上限 10s，限流模型交给健康表冷却而非无限拖慢。
 *   - 本表（QUALITY_FIRST/COST_FIRST）+ wizard 的 _STEP_MODEL_MAP_FRONTEND 仅用于 UI 展示
 *     「智能推荐模型」标签，需与 route.ts 权威表保持同步（改一处必改三处）。
 *
 * 改配置只需改这张表，不用动业务代码。
 * 🔥 2026-10-17 接入豆包网页版逆向网关（DOUBAO_WEB）：content/imitate/polish 正文类环节首选
 *   doubao（models.json 中 provider='豆包网页版'，apiKey=sessionid，网关监听 127.0.0.1:8000）。
 *   与 route.ts 权威表同步；网关失效时由 callLLMWithFallback 自动回落免费池。
 * API Key 由 resolve-llm-config 从 models.json 按 provider+model 匹配取得。
 */

export interface StepModel {
  provider: string
  model: string
  baseUrl: string
  /** 该环节建议的最小 max_tokens，防止推理模型因思考耗尽预算而返回空内容 */
  minTokens?: number
}

// ==================== Provider / BaseUrl ====================
const SILICONFLOW = 'https://api.siliconflow.cn/v1'
const SF = '硅基流动'
const ZHIPU = 'https://open.bigmodel.cn/api/paas/v4'
const ZP = '智谱GLM'
const OPENROUTER = 'https://openrouter.ai/api/v1'
const OR = 'OpenRouter'

// ==================== 硅基流动（7 免费 + 1 DeepSeek，共 8） ====================
/** 硅基免费：正文/仿写备用，文笔尚可 */
const SF_QWEN7B: StepModel = {
  provider: SF,
  model: 'Qwen/Qwen2.5-7B-Instruct',
  baseUrl: SILICONFLOW,
}
/** 硅基免费：结构化输出最稳（大纲/权谋/势力），实测题材准确 */
const SF_GLM9B: StepModel = {
  provider: SF,
  model: 'THUDM/GLM-4-9B-0414',
  baseUrl: SILICONFLOW,
}
/** 硅基免费：推理/剧情节点 */
const SF_GLMZ1_9B: StepModel = {
  provider: SF,
  model: 'THUDM/GLM-Z1-9B-0414',
  baseUrl: SILICONFLOW,
}
/** 硅基免费：备用正文 */
const SF_QWEN8B: StepModel = {
  provider: SF,
  model: 'Qwen/Qwen3-8B',
  baseUrl: SILICONFLOW,
}
/** 硅基免费：极速轻量（质检分类） */
const SF_QWEN4B: StepModel = {
  provider: SF,
  model: 'Qwen/Qwen3.5-4B',
  baseUrl: SILICONFLOW,
}
/** 项目唯一绘图模型 */
const SF_KOLORS: StepModel = {
  provider: SF,
  model: 'Kwai-Kolors/Kolors',
  baseUrl: SILICONFLOW,
}
/**
 * 全平台唯一保留的 DeepSeek 模型（用户要求 1 套）。
 * 仅在 bookAnalysis 作为主模型（每部 1 次），大幅减少调用。
 * ⚠️ 硅基流动 Key 失效时由 callLLMWithFallback 跨到智谱/OpenRouter 兜底。
 */
const V4_FLASH: StepModel = {
  provider: SF,
  model: 'deepseek-ai/DeepSeek-V4-Flash',
  baseUrl: SILICONFLOW,
}

// ==================== 智谱GLM（3 款，Key 有效） ====================
/** 文笔最强免费：正文、仿写、世界观、签约评分。实测 ~15.9s，题材准确 */
const ZP_47F: StepModel = {
  provider: ZP,
  model: 'glm-4.7-flash',
  baseUrl: ZHIPU,
}
/** 推理规划：关键情节、人物关系。带 reasoning */
const ZP_Z1F: StepModel = {
  provider: ZP,
  model: 'glm-z1-flash',
  baseUrl: ZHIPU,
}
/** 综合全能、最快最稳：创意/人物/大纲/简介/润色。实测 ~5.6s */
const ZP_4F: StepModel = {
  provider: ZP,
  model: 'glm-4-flash',
  baseUrl: ZHIPU,
}

// ==================== OpenRouter（10 款 :free，Key 有效） ====================
/** 免费主力：非推理，1M 上下文，JSON 输出干净，max_tokens=500 也不空 */
const OR_MM3: StepModel = {
  provider: OR,
  model: 'minimax/minimax-m3:free',
  baseUrl: OPENROUTER,
}
/** 免费副力：推理模型，必须给足 max_tokens */
const OR_MM27: StepModel = {
  provider: OR,
  model: 'minimax/minimax-m2.7:free',
  baseUrl: OPENROUTER,
  minTokens: 2000,
}
/** 长正文：512K 上下文，实测输出最长 */
const OR_DOTS: StepModel = {
  provider: OR,
  model: 'dots-studio/dots-3-note-preview:free',
  baseUrl: OPENROUTER,
}
/** 极速轻量：65K 上下文，适合短判定（合规/原创性快检） */
const OR_LFM: StepModel = {
  provider: OR,
  model: 'liquid/lfm-2.5-2.6b:free',
  baseUrl: OPENROUTER,
}

// ==================== 豆包网页版逆向网关（2026-10-17 接入） ====================
/** 正文/仿写/润色首选：豆包网页版（doubao-free-api 网关，OpenAI 兼容，apiKey=sessionid） */
const DOUBAO_WEB: StepModel = {
  provider: '豆包网页版',
  model: 'doubao',
  baseUrl: 'http://127.0.0.1:8000/v1',
}

// ==================== 两套配置 ====================

/**
 * 质量优先（默认档）：骨架与正文用最强免费模型冲白金爆款。
 * DeepSeek 仅出现在 bookAnalysis（每部 1 次）。
 */
// 🔥 2026-09-01 全局提速：所有环节统一 ZP_4F(glm-4-flash, 实测 ~5.6s，Key 有效、最稳最快)。
//   此前 worldbuilding/content/contractScore/imitate 用 ZP_47F(~15.9s)、keyPlots/relationships 用推理模型、compliance/originality 用 OR_LFM，
//   导致每个环节跳转均 >6s。现其余环节仍走 ZP_4F 保速度。
// 🔥 2026-09-01(二轮) 质量回补：worldbuilding 单步回退到 ZP_47F(glm-4.7-flash, ~15.9s)。
//   用户反馈每环节输出质量不达标（数据污染/截取显示/空值），而世界观是下游一切字段的源头，
//   故把最质量敏感的 worldbuilding 切回最强免费模型。代价：该单步 ~15.9s（仍 < 原 >6s 的综合体验投诉阈值）。
// 🔥 2026-09-01(三轮) 质量回补：idea 步也回退到 ZP_47F。
//   用户截图实锤 idea 步的 tagline/coreIdea/coreConflict 沦为"主角身份背景"的同义复述/截取显示（glm-4-flash 推理弱 + 旧 coreConflict prompt 强制"禁止新增设定"）。
//   同时改写 coreConflict 抽取脚本为"戏剧设计而非提炼" + 新增与 tagline 重复度检测（≥55% 触发重试）。
//   idea 是灵感/简介/冲突/卖点的源头，搭 worldbuilding 之后下游一切字段的第二根支柱。
//   若需进一步提质，可继续把 characters/content/contractScore 也切回 ZP_47F（会整体变慢，见下方映射）。
const QUALITY_FIRST: Record<string, StepModel> = {
  bookAnalysis: ZP_4F,
  // 🔥 2026-09-02 限流热切换：智谱 glm-4.7-flash 晚高峰持续 429 → 4 个质量敏感环节临时切
  //   OR_MM3（minimax-m3:free，OpenRouter 实测 200 + 历史题材流派精神保留 + 主角名零漂移）。
  //   与 route.ts _STEP_MODEL_MAP（权威表）同步。限流解除后可恢复 ZP_47F。
  idea: OR_MM3,
  // 🔥 2026-09-02 金手指换模型：powerSystem 切 OR_MM3——glm-4-flash 指令遵从度低，
  //   导致金手指无视"作品类型（可多选）"中的流派标签（系统流/签到流等）做成通用设定。
  //   与 route.ts _STEP_MODEL_MAP（权威表）同步。
  powerSystem: OR_MM3,
  keyPlots: ZP_4F,
  worldbuilding: OR_MM3,
  // 🔥 2026-09-01 第20轮：characters 切 ZP_47F——glm-4-flash 无视禁重名/用户人物纳入指令，质量不达标。
  //   与 route.ts _STEP_MODEL_MAP（权威表）同步；代价 ~15.9s/路，由并行单角色生成补偿。
  //   ⚠️ 2026-09-02：glm-4.7-flash 限流(429) → 临时切 OR_MM3。
  characters: OR_MM3,
  outline: ZP_4F,
  chapters: ZP_4F,
  factions: ZP_4F,
  relationships: ZP_4F,
  synopsis: ZP_4F,
  content: DOUBAO_WEB,
  imitate: DOUBAO_WEB,
  polish: DOUBAO_WEB,
  compliance: ZP_4F,
  originality: ZP_4F,
  contractScore: ZP_4F,
  coverPrompt: ZP_4F,
  coverImage: SF_KOLORS,
  // 向导专用环节
  autoDesignProtagonist: ZP_4F,
  generateName: ZP_4F,
}

/**
 * 成本优先（免费档）：完全不调用 DeepSeek，正文/创意走 OpenRouter 免费模型。
 * 🔥 2026-09-01 提速同步：慢模型(OR_MM3/OR_MM27/OR_DOTS)统一换 ZP_4F，避免每个环节 >6s。
 * 🔥 2026-09-01 第20轮：characters 同步切 ZP_47F（见 QUALITY_FIRST 注释）。
 */
const COST_FIRST: Record<string, StepModel> = {
  bookAnalysis: ZP_4F,
  // 🔥 2026-09-02 限流热切换：与 QUALITY_FIRST / route.ts 权威表同步切 OR_MM3
  idea: OR_MM3,
  // 🔥 2026-09-02 金手指换模型：powerSystem 切 OR_MM3（与 QUALITY_FIRST / route.ts 权威表同步）
  powerSystem: OR_MM3,
  keyPlots: ZP_4F,
  worldbuilding: OR_MM3,
  // 🔥 2026-09-01 第20轮：与 QUALITY_FIRST / route.ts 权威表同步切 ZP_47F
  //   ⚠️ 2026-09-02：glm-4.7-flash 限流(429) → 临时切 OR_MM3
  characters: OR_MM3,
  outline: ZP_4F,
  chapters: ZP_4F,
  factions: ZP_4F,
  relationships: ZP_4F,
  synopsis: ZP_4F,
  content: DOUBAO_WEB,
  imitate: DOUBAO_WEB,
  polish: DOUBAO_WEB,
  compliance: ZP_4F,
  originality: ZP_4F,
  contractScore: ZP_4F,
  coverPrompt: ZP_4F,
  coverImage: SF_KOLORS,
  // 向导专用环节
  autoDesignProtagonist: ZP_4F,
  generateName: ZP_4F,
}

/**
 * 当前生效的配置档位。
 * 'quality' = 质量优先（默认，冲白金爆款）
 * 'cost'    = 成本优先（免费模型为主，适合跑量测试）
 *
 * 可用环境变量 TUZHONG_MODEL_PROFILE 覆盖，无需改代码：
 *   TUZHONG_MODEL_PROFILE=cost npm run build
 */
const PROFILE: string = String(process.env.TUZHONG_MODEL_PROFILE || 'quality').toLowerCase()

export const STEP_MODEL_PROFILE: 'quality' | 'cost' = PROFILE === 'cost' ? 'cost' : 'quality'

export const STEP_MODEL_MAP: Record<string, StepModel> =
  PROFILE === 'cost' ? COST_FIRST : QUALITY_FIRST

/** 环节未命中映射表时的兜底模型（健康免费模型） */
export const DEFAULT_STEP_MODEL: StepModel = ZP_47F

/**
 * 按环节取模型配置
 * @param step 环节 key，如 'outline' / 'content'
 * @returns 命中则返回该环节配置，否则返回全局默认
 */
export function getModelForStep(step?: string): StepModel {
  if (!step) return DEFAULT_STEP_MODEL
  return STEP_MODEL_MAP[step] || DEFAULT_STEP_MODEL
}

/**
 * 取该环节建议的最小 max_tokens。
 * 调用方应取 max(业务需要值, minTokens)，避免推理模型返回空内容。
 */
export function getMinTokensForStep(step?: string): number {
  if (!step) return 0
  return STEP_MODEL_MAP[step]?.minTokens || 0
}
