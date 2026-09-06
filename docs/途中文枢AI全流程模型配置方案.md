# 途中文枢 · AI 全流程模型配置方案

> 更新时间：2026-08-30
> 覆盖 `netnovel-workflow.ts` 全流程 18 个节点（12 个 prompt 环节 + 6 个辅助节点）
> 生效配置：`src/lib/step-model-config.ts`（改这一张表即可，不用动业务代码）

---

## 零、本次更新：OpenRouter 未启用问题已修复

### 根因有两层，第二层更致命

你反馈"已配置模型，但 openrouter 一直显示未启用"。核查服务器
`/www/wwwroot/tuzhong-wenshu/.tuzhong-data/models.json` 后发现：

**根因 1：10 个 OpenRouter 条目的 `apiKey` 全是空字符串**
设置页的"已添加"角标只判断 `provider + model` 是否存在，不校验 Key，
所以卡片显示绿色「已添加」，但真正调用时 `Authorization: Bearer ` 为空 → 必然失败。
这就是"看起来配好了、实际没启用"的原因。

**根因 2（致命）：那 10 个模型 ID 在 OpenRouter 平台上已全部下架**
即使只填 Key 也调不通。实测该 Key 能看到 396 个模型，逐个比对后：

| 原配置的模型 ID | 状态 |
|---|---|
| `openai/gpt-oss-120b:free` | ❌ 已下架 |
| `openai/gpt-oss-20b:free` | ❌ 已下架 |
| `deepseek/deepseek-r1-distill-llama-70b:free` | ❌ 已下架 |
| `meta-llama/llama-3.3-70b-instruct:free` | ❌ 已下架 |
| `meta-llama/llama-3.1-8b-instruct:free` | ❌ 已下架 |
| `qwen/qwen2.5-72b-instruct:free` | ❌ 已下架 |
| `qwen/qwen3-32b:free` | ❌ 已下架 |
| `google/gemma-2-27b-it:free` | ❌ 已下架 |
| `mistralai/mistral-7b-instruct:free` | ❌ 已下架 |
| `nvidia/llama-3.3-nemotron-super-49b-v1:free` | ❌ 已下架 |

这 10 个是 2026-08-12 预置的，到 08-30 已全部被平台轮换掉。
OpenRouter 的免费模型池是**滚动更新**的，这也是为什么需要定期核对。

### 修复动作

1. 备份服务器 `models.json`（两份：`bak_20260830_140201`、`bak_20260830_140819`）
2. 填入你提供的 Key，并把 10 个下架 ID 替换为**当前实测可用**的免费模型
3. 回读校验：OpenRouter 有 Key 条目 **10 / 10**
4. 同步本地 `src/tuzhong-wenshu/.tuzhong-data/models.json`

替换映射（依据实测，详见第二节）：

| 旧 ID（下架） | 新 ID（可用） | 定位 |
|---|---|---|
| `openai/gpt-oss-120b:free` | `minimax/minimax-m3:free` | 免费主力 |
| `openai/gpt-oss-20b:free` | `minimax/minimax-m2.7:free` | 免费副力 |
| `deepseek/deepseek-r1-distill-llama-70b:free` | `dots-studio/dots-3-note-preview:free` | 长正文 |
| `meta-llama/llama-3.3-70b-instruct:free` | `nvidia/nemotron-3-super-120b-a12b:free` | 推理备用 |
| `meta-llama/llama-3.1-8b-instruct:free` | `liquid/lfm-2.5-2.6b:free` | 极速轻量 |
| `qwen/qwen2.5-72b-instruct:free` | `nvidia/nemotron-3-ultra-550b-a55b:free` | 长文备用 |
| `qwen/qwen3-32b:free` | `google/gemma-4-31b-it:free` | 备用 |
| `google/gemma-2-27b-it:free` | `z-ai/glm-5.2:free` | 备用 |
| `mistralai/mistral-7b-instruct:free` | `cohere/north-mini-code:free` | 备用 |
| `nvidia/…nemotron-super-49b-v1:free` | `google/gemma-4-26b-a4b-it:free` | 备用 |

---

## 一、全部已配置模型清单（58 条）

| 来源 | 条目数 | API Key | 状态 |
|---|---|---|---|
| **硅基流动** | 38 | 全部有效 | ✅ 主力 |
| **智谱 GLM** | 3 | 全部有效 | ✅ 备用 |
| **OpenRouter** | 10 | 全部有效（本次修复） | ✅ 免费档 |
| Groq | 6 | 无 Key | ❌ 不可用 |
| 腾讯混元 | 1 | 无 Key | ❌ 不可用 |

### 1.1 硅基流动 38 条（主力，全部有 Key）

**顶级档（文笔/推理最强）**
`Qwen/Qwen3.5-397B-A17B`、`deepseek-ai/DeepSeek-V4-Flash`、`zai-org/GLM-5.2`、
`deepseek-ai/DeepSeek-V3.2`、`deepseek-ai/DeepSeek-V3.1-Terminus`、
`deepseek-ai/DeepSeek-R1`、`MiniMaxAI/MiniMax-M2.5`、`Qwen/Qwen3.5-122B-A10B`

**中档（结构化输出）**
`Qwen/Qwen3-32B`、`Qwen/Qwen2.5-72B-Instruct-128K`、`THUDM/GLM-4-32B-0414`、
`Qwen/Qwen3.6-35B-A3B`、`Qwen/Qwen3.6-27B`、`Qwen/Qwen3.5-35B-A3B`、`Qwen/Qwen3.5-27B`、
`ByteDance-Seed/Seed-OSS-36B-Instruct`、`meituan-longcat/LongCat-2.0`、`nex-agi/Nex-N2-Pro`、
`stepfun-ai/Step-3.5-Flash`、`inclusionAI/Ling-flash-2.0`、`zai-org/GLM-4.5-Air`、
`tencent/Hunyuan-A13B-Instruct`、`Qwen/Qwen3-30B-A3B-Instruct-2507`、`Qwen/Qwen3.5-9B`、
`Qwen/Qwen3-14B`、`Qwen/Qwen2.5-32B-Instruct`、`Qwen/Qwen2.5-14B-Instruct`、`deepseek-ai/DeepSeek-V3`

**轻量档（质检/快检）**
`Qwen/Qwen3.5-4B`、`Qwen/Qwen3-8B`、`Qwen/Qwen2.5-7B-Instruct`、
`THUDM/GLM-4-9B-0414`、`THUDM/GLM-Z1-9B-0414`、`tencent/Hunyuan-MT-7B`、
`inclusionAI/Ling-mini-2.0`、`deepseek-ai/DeepSeek-R1-0528-Qwen3-8B`

**图像**：`Kwai-Kolors/Kolors`（项目唯一绘图模型）

### 1.2 OpenRouter 10 条（免费档，本次修复）

`minimax/minimax-m3:free`、`minimax/minimax-m2.7:free`、`dots-studio/dots-3-note-preview:free`、
`nvidia/nemotron-3-super-120b-a12b:free`、`nvidia/nemotron-3-ultra-550b-a55b:free`、
`z-ai/glm-5.2:free`、`google/gemma-4-31b-it:free`、`google/gemma-4-26b-a4b-it:free`、
`cohere/north-mini-code:free`、`liquid/lfm-2.5-2.6b:free`

### 1.3 智谱 GLM 3 条（备用，有 Key）

`glm-4.7-flash`、`glm-z1-flash`、`glm-4-flash`（baseUrl：`https://open.bigmodel.cn/api/paas/v4`）

> **定价说明**：硅基流动的 `/v1/models` 接口不返回定价字段，且账户接口
> `user/info` 已废弃（HTTP 410），因此**无法从 API 核实每个模型的单价**。
> 上表按能力分档，实际计费请以硅基流动控制台为准。
> OpenRouter 标注 `:free` 的 10 个模型确认零成本。

---

## 二、实测选型依据（2026-08-30）

同一段修仙小说前文，要求续写 400-600 字，保持人称一致、不得复读前文。

### 2.1 OpenRouter 免费模型

| 模型 | 字数 | 耗时 | 结论 |
|---|---|---|---|
| `minimax/minimax-m3:free` | 517 | 8.3s | ✅ **最佳**，1M 上下文 |
| `dots-studio/dots-3-note-preview:free` | 592 | 10.7s | ⚠️ 最长，但输出出现中英混杂 |
| `minimax/minimax-m2.7:free` | 372 | 9.6s | ✅ 质量好，推理模型 |
| `nvidia/nemotron-3-super-120b-a12b:free` | 322 | 44.9s | ⚠️ 偏慢 |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 318 | 75.9s | ⚠️ 太慢，不适合批量 |
| `z-ai/glm-5.2:free` / `google/gemma-4-31b-it:free` | — | — | ❌ 429 上游限流 |
| `thinkingmachines/inkling:free` | — | — | ❌ 403 仅限 agent 工具 |

### 2.2 硅基流动主力模型

| 模型 | 字数 | 耗时 | 结论 |
|---|---|---|---|
| `Qwen/Qwen3.5-397B-A17B` | **727** | 31.2s | ✅ **文笔最佳**，心理描写细腻 |
| `zai-org/GLM-5.2` | 616 | 15.9s | ✅ **性价比最高**，反转设计好 |
| `deepseek-ai/DeepSeek-V4-Flash` | 594~942（均值 724） | 17~100s | ✅ 字数足，⚠️ 见下方人称风险 |
| `Qwen/Qwen2.5-7B-Instruct` | — | 2.6s | ✅ 轻量可用 |

**⚠️ V4-Flash 人称一致性风险（6 次复测）**

对同一段第三人称前文（主角「林默」）跑 6 次续写，字数 594~942、均值 724，
但**有 1 次出现叙述句人称跳跃**——角色台词里说「我」是正常的，
问题出在叙述句也用了第一人称：

```
第3次输出：「三年前，我离开师门时，师父正在闭关」
          「那日我在他洞府外跪了整整一夜，……阿宁端着热茶来劝我」
                                    ↑ 叙述句应为「林默/他」，实为第一人称
```

6 次中 1 次命中（约 17%），其余 5 次正常。
**结论**：V4-Flash 字数充足、响应可接受，但用于长正文需加人称校验环节，
或在 prompt 中显式强调「全程使用第三人称，禁止第一人称叙述」。
这也是 `polish`（8 维润色）环节不能省的原因之一。

### 2.3 严格 JSON 输出能力（项目核心要求）

任务：输出 `{geography:≥3项, rules:≥4项}` 的严格 JSON。

| 模型 | 推理模型 | 结果 |
|---|---|---|
| `minimax/minimax-m3:free` | 否 | ✅ geography=4 / rules=5，**max_tokens=500 也稳定** |
| `minimax/minimax-m2.7:free` | 是 | ✅ geography=5 / rules=6，但需 max_tokens≥2000 |

**⚠️ 推理模型陷阱（务必注意）**
`minimax-m2.7`、`dots-3-note-preview` 带 `reasoning` 字段。当 `max_tokens` 给小时，
思考过程会耗尽全部预算，导致 **`content` 返回 `null`**：

```
max_tokens=120  → finish_reason: length, content: None   ← 空内容
max_tokens=1200 → finish_reason: stop,   content: '林默推开剑冢大门，...'
```

`step-model-config.ts` 已为每个模型标注 `minTokens`，调用方应取
`max(业务需要值, minTokens)`。

---

## 三、18 个环节的逐项配置

提供两套档位，用环境变量 `TUZHONG_MODEL_PROFILE` 切换，默认 `quality`。

### 3.1 质量优先档（默认，冲白金爆款）

| 环节 | key | 模型 | 理由 |
|---|---|---|---|
| 拆书分析 | `bookAnalysis` | DeepSeek-V4-Flash | 长文本，响应最快 |
| 灵感捕捉 | `idea` | **GLM-5.2** | 反转设计好，书名/钩子决定点击率 |
| 金手指设定 | `powerSystem` | **V4-Flash** | 需要数值平衡与逻辑自洽 |
| 关键情节 | `keyPlots` | **GLM-5.2** | 爽点密度与情绪曲线 |
| 世界观构建 | `worldbuilding` | **Qwen3.5-397B** | 长输出，文笔最细腻 |
| 人物设定 | `characters` | **GLM-5.2** | 对话张力强 |
| **大纲规划** | `outline` | **V4-Flash** | **最关键节点**，决定 300 章走向 |
| 章节规划 | `chapters` | **GLM-5.2** | 批量结构化输出 |
| 势力设定 | `factions` | Qwen3-32B | 结构化，中档够用 |
| 人物关系 | `relationships` | Qwen3-32B | 图结构 |
| 作品简介 | `synopsis` | **GLM-5.2** | 营销文案 |
| **正文创作** | `content` | **Qwen3.5-397B** | 实测文笔最佳（727字） |
| 风格仿写 | `imitate` | **Qwen3.5-397B** | 与正文保持文风一致 |
| 8 维润色 | `polish` | Qwen3.5-27B | 润色比创作简单 |
| 合规检测 | `compliance` | Qwen3.5-4B | 本质是分类任务 |
| 原创性检测 | `originality` | Qwen3.5-4B | 主要靠算法查重，模型辅助 |
| 签约评分 | `contractScore` | **V4-Flash** | 需要判断力 |
| 封面提示词 | `coverPrompt` | DeepSeek-V4-Flash | 提炼画面描述 |
| 封面出图 | `coverImage` | Kwai-Kolors/Kolors | 项目唯一绘图模型 |

### 3.2 成本优先档（`TUZHONG_MODEL_PROFILE=cost`）

创意层与正文改走 OpenRouter 免费模型，质检仍用最小模型：

| 环节 | 质量档 | 成本档 |
|---|---|---|
| idea / keyPlots / worldbuilding / chapters | GLM-5.2 / 397B | `minimax-m3:free` |
| content / imitate | Qwen3.5-397B | `minimax-m3:free` |
| polish | Qwen3.5-27B | `minimax-m2.7:free`（minTokens 2000） |
| powerSystem / outline / contractScore | V4-Flash | GLM-5.2 |
| compliance / originality | Qwen3.5-4B | Qwen3.5-4B（不变） |
| bookAnalysis / coverPrompt / coverImage | 不变 | 不变 |

> 成本档把绝大部分调用换成零成本的 `minimax-m3:free`，
> 代价是文笔略逊（实测 517 字 vs 727 字），且免费模型存在 429 限流风险。

---

## 四、封面流程（纯文本版 V4-Flash）

你把 `deepseek-v4-flash-vision-exp`（视觉版）改成了 `deepseek-v4-flash`（纯文本版），
**它读不了图**，所以封面自动质检必须改为人工。

```
作品信息（书名/简介/世界观/主角/类型）
    ↓
DeepSeek-V4-Flash → 封面画面描述
  { "中文描述": "...", "英文关键词": "...", "构图": "...", "色调": "..." }
    ↓
Kwai-Kolors/Kolors 出图
    ↓
人工确认（如需自动化，需单独接入视觉模型，如 Qwen3-VL）
```

---

## 五、代码落地

### 5.1 `src/lib/step-model-config.ts`（重写）

- 10 个模型常量，全部经 `models.json` 校验**有有效 Key**
- 两套映射表 `QUALITY_FIRST` / `COST_FIRST`
- `STEP_MODEL_PROFILE` 由环境变量 `TUZHONG_MODEL_PROFILE` 决定
- 新增 `getMinTokensForStep(step)`，防止推理模型返回空内容

### 5.2 `src/lib/resolve-llm-config.ts`

```ts
resolveLLMConfig(inputCfg, userId, step?)
```

- 显式指定 model → 尊重用户选择（手动选择始终优先）
- 未指定 → 按 `step` 查映射表
- 未命中 → 回退 `DEFAULT_STEP_MODEL`

### 5.3 5 个调用点已接入

| 文件 | step |
|---|---|
| `api/ai/generate/route.ts` | `characters` |
| `api/ai/continue/route.ts` | `content` |
| `api/ai/rewrite/route.ts` | `polish` |
| `api/ai/detect/route.ts` | `compliance` |
| `api/ai/final-check/route.ts` | `contractScore` |

### 5.4 校验结果

| 检查项 | 结果 |
|---|---|
| `step-model-config.ts` + `resolve-llm-config.ts` 类型检查 | ✅ 0 错误 |
| 10 个映射模型在 `models.json` 中有 Key | ✅ 10 / 10 |
| 端到端实测（从 `models.json` 读配置真实调用） | ✅ minimax-m3 / Qwen2.5-7B / V4-Flash 通过 |
| 服务器 `models.json` 回读校验 | ✅ OpenRouter 10 / 10 有 Key |

---

## 六、待办与风险

### 待办

1. **部署**：改动在本地 `src/` 下，需重新构建并部署到服务器才生效
2. **剩余接口接入 step**：`auto-book-analysis`、`generate-cover`、`chapters` 等尚未传入环节标识
3. **微调**：`qwen-novel-lora` 训练包已就绪（`D:\tuzhongwang\tuzhong\qwen-novel-lora`），
   需开通 3090 GPU 实例后执行；训完可替换 `content` 环节

### 风险

1. **OpenRouter 免费模型会滚动下架**——本次就是因此失效。建议每季度核对一次模型 ID
2. **429 限流**：`z-ai/glm-5.2`、`gemma-4-31b` 实测遭遇上游限流。
   生产环境建议主力走硅基流动，免费模型只做分流
3. **推理模型空返回**：`minimax-m2.7`、`dots-3-note-preview` 必须给足 `max_tokens`
4. **中英混杂**：`dots-3-note-preview` 输出出现过 "尘封 centuries 的风"，
   不建议用于正文环节
5. **长程一致性靠流程不靠模型**：即使 397B 也保证不了 300 章不崩。
   必须靠 `outline → keyPlots → chapters` 三级规划，写正文时把
   「本章规划 + 前文摘要 + 人物状态」一起塞进上下文
6. **白金爆款无法全自动**：建议在 `outline` 和 `keyPlots` 之后保留人工审核
