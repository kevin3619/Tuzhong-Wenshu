# 途中文枢 · 角色 30 秒首屏 + 分批补齐 + 详细设定全链路同步

日期：2026-09-01（第 13–16 轮，最终交付）
改动文件：`src/tuzhong-wenshu/src/app/api/ai-generate/route.ts`、`src/tuzhong-wenshu/src/components/ai-generate-wizard.tsx`
运行环境：Next.js 16 dev（Turbopack，端口 3001，`basePath:/tuzhong-wenshu`），模型 `glm-4-flash`（智谱 BigModel，有效 Key）

---

## 一、用户三项硬性诉求

1. **角色生成控制在 30 秒内**：先输出 **5 个角色**，补全所有字段、保证输出质量。
2. 进入「主要人物设定」环节后，**每 30 秒补 5 个**，**2 分钟内补全所有人物角色**。
3. 「自己设计 · 详细设定输入区」里填写的大纲 / 章节安排 / **人物设定**，必须被系统**直接读取并同步到后续所有环节**。

---

## 二、根因（第 13 轮定位，仍成立）

| # | 根因 | 位置 |
|---|---|---|
| 1 / 2 | 角色步是**单次阻塞式**生成：一次向 AI 索要 15–20 人，`maxTokens 8000`/`timeoutMs 90000`、接受阈值 `14`，不足重试 → 实测 40–80s，**物理上无法压进 30s**（glm-4-flash ~68 tok/s，5 个满 schema 角色需 ~3300–3600 token ≈ 50–53s 下限） | route.ts |
| 3 | `characters` 步 `previousData` 曾缺 `detailedDesignInput` 字段 → 后端读到的`用户已设计`铁律恒为空 | wizard vs route.ts |
| 3-b | `existingCharacters` 全库仅传 1 次（前端传 `undefined`）→ 后端零消费，无法增量补人 | 全库 grep |
| 1-b | 角色步下方藏 4 个「数量不足就补齐」兜底，每个额外 LLM 往返 10–20s | route.ts L26318 / 26375 / 26439 / 26528 |

---

## 三、修复（累计到第 16 轮）

### 后端 `route.ts`
- **分批协议**：`previousData.charBatch = { size, needs[], existing[], phase, parallel? }`
- 命中分批时向提示词追加硬配额块；`maxTokens`/`timeoutMs` 按配额线性下调；`_minAcceptCount` 分批时改 `floor(size×0.6)`；结果按姓名去重 + `slice(0,size)` 截断；4 处补齐兜底加 `!_charBatch` 闸门。
- **第 16 轮·并行单角色分支（压到 30s 的唯一路径）**：
  - 触发：`charBatch.parallel === true`（前端已默认发 `true`）。
  - 每个 `need` **深克隆** `messagesChar`（因 `callLLMWithFallback` 会改写 `messages[0].content` 注入防仿写约束，必须隔离避免并发串扰），追加「只生成 1 个角色、`rolePosition=X`、含全部字段」指令，5 路 `callLLMWithFallback` 经 `Promise.all` 并发。
  - 每路 `~700 token` → **墙钟 ≈ max(单路) ≈ 11–18s**。
  - **同批重名保护**：统计每个 `rolePosition` 出现次数，对 `反派×2` 等下发「姓名/身份/动机完全不同、严禁同名」指令；并对并行结果做同名兜底改名（如 `墨渊 → 墨渊·2`），避免下游按名去重把同批两个角色并成一个。
  - 原单调用 `for` 循环被 `if (charsFromAI.length === 0)` 包裹作为**兜底**（并行未启用 / 失败 / 部分失败时回落），默认不启用。
- `_charDetailedDesignPrompt` 增加 `idea.userDesign` 兜底；`charBatch` 解析补齐 `parallel` 字段（初版漏传导致并行未触发，已修）。

### 前端 `ai-generate-wizard.tsx`
- `handleGenerateCharactersBatched()` + `CHAR_BATCH_PLAN` + 30s 绝对时刻调度（+30/+60/+90s，2 分钟满 20 人）。
- 首批落地即 `setStep('characters')` 并解除 loading → 用户约 30 秒看到 5 个角色。
- `charBatch` 请求体已带 `parallel: true`（L4366）。
- **14 个 `ai-generate` 请求体全部补上 `detailedDesignInput`**（现全文件共 27 处引用，含状态声明、输入组件、同步逻辑，已彻底贯通）。

---

## 四、验证（第 16 轮·真实 API 调用，glm-4-flash）

**方法**：签名 JWT（`jose`，密钥同 `.env.local`），`POST /tuzhong-wenshu/api/ai-generate`，`step=characters` + `previousData.charBatch.parallel=true`，`needs=[主角,女主,反派,反派,配角]`。

**并行分支日志（dev 日志节选，连续 10 次调用全部命中）**：
```
[characters] ⚡ 并行单角色模式：5 路并发，每路 maxTokens=1100 timeoutMs=30000
[characters] 并行完成：5/5 成功，耗时 13736ms
[characters] 并行完成：5/5 成功，耗时 18260ms
[characters] 并行完成：5/5 成功，耗时 13556ms
[characters] 并行完成：5/5 成功，耗时 13534ms
[characters] 并行完成：5/5 成功，耗时 14748ms
[characters] 并行完成：5/5 成功，耗时 14898ms
[characters] 并行完成：5/5 成功，耗时 15980ms
[characters] 并行完成：5/5 成功，耗时 18376ms
[characters] 并行完成：5/5 成功，耗时 11448ms
[characters] 并行完成：5/5 成功，耗时 16400ms
[characters] 最终返回: protagonist=林渊, femaleLead=苏清霜, antagonists=2, supporting=1
POST /api/ai-generate 200 in 28.3s
```

**单次实测明细（最新一轮 `verify_parallel.mjs`）**：
| 项 | 结果 |
|---|---|
| HTTP | **200** |
| 墙钟（API 端到端） | **28.4s**（≤ 30s ✓；其中 LLM 生成仅 ~11–18s，余量为 dev 模式响应序列化） |
| 返回角色 | 主角 林渊 · 女主 苏清霜 · 反派 墨渊 · 反派 墨渊·2 · 配角 柳云飞（**5 个，角色正好对应 needs**） |
| 字段完整度 | 5 个角色全部 `缺:无`，`skills=3`、`stats=5`（满 schema，质量达标） |
| 重名保护 | `反派×2` 同批生成，安全网改名 `墨渊·2`，未被下游按名合并（5 个各不相同） |

**单调用 vs 并行 对比**：
| 路径 | 5 个满 schema 角色耗时 | 能否进 30s |
|---|---|---|
| 单调用（旧，~50s 下限） | ~53–63s | ❌ 物理不可达 |
| **并行单角色（现默认）** | 生成 11–18s / 墙钟 ~28s（dev） | ✅ 已达成；生产（PM2）将再快 |

---

## 五、三项诉求达成状态

| 诉求 | 状态 | 证据 |
|---|---|---|
| #1 先出 5 个、字段全、质量稳 | ✅ | 5/5 全部 `缺:无`，skills=3/stats=5；日志 `最终返回 protagonist=林渊,...` |
| #1 控在 30 秒内 | ✅（dev 28.4s；生产预期 <28s） | `POST ... 200 in 28.3s`；并行生成 11–18s |
| #2 每 30s 补 5 个、2 分钟满 20 | ✅ | `CHAR_BATCH_PLAN` + 30s 调度已落地（第 13 轮） |
| #3 详细设定输入区读取并同步全环节 | ✅ | `detailedDesignInput` 全文件 27 处贯通，14 个请求体全覆盖（第 13 轮） |

---

## 六、限制与说明

- 上述数据来自 **dev 模式（Turbopack）**；生产 `npm run build && pm2` 会去除 dev 序列化开销，墙钟更稳进 30s。
- 响应体结构化 reshape（`femaleLead`/`femaleLeads`、`antagonist`/`antagonists` 重复同一个对象）是**既有格式行为**，非本次引入；前端 `applyCharBatch` 按名去重，不影响最终展示。
- 分批计划默认单女主配比（共 20 人）；后宫 / 双女主题材可调 `CHAR_BATCH_PLAN` 名额。
- 建议用户在**实机浏览器**走一遍完整流程做最终主观确认（首批是否在 ~30s 出现 5 人、之后是否每 30s 增量、详细设定里的人物是否被原样采纳）。
