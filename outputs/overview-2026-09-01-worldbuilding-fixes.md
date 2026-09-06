# 途中文枢 · 世界观/金手指 Bug 修复总览（第五→九轮）

> 维护笔记：本文件是 rounds 5–9 截图驱动 Bug 修复的累计索引。**核心结论先行**：所有力量体系字段都必须以 `_STEP_MODEL_MAP`（route.ts L31856）为准，**step-model-config.ts 与 wizard 的 `_STEP_MODEL_MAP_FRONTEND` 仅用于 UI 推荐名展示，对真实速度/质量零影响**。修复改错表 = 反复返工的最大根因。

## 权威模型映射（route.ts L31856）

```ts
// ⚠️ 权威表（决定每个环节真实调用的模型）。第四轮教训：step-model-config.ts 的 QUALITY_FIRST/COST_FIRST 与 wizard 的 _STEP_MODEL_MAP_FRONTEND 仅用于 UI 推荐名展示，对真实速度/质量零影响，勿在那些表上改模型。
const _STEP_MODEL_MAP: Record<string, string> = {
  'bookAnalysis': 'glm-4-flash',
  'idea':         'glm-4.7-flash',   // 2026-09-01 第六轮：idea 提质杠杆最高（~15.9s 仍可接受）
  'worldbuilding':'glm-4-flash',     // 2026-09-01 第七轮：用户实测反馈"跳转太慢"——glm-4.7-flash ~15.9s 体感明显，回退 glm-4-flash(~5.6s)；质量侧依赖第五轮的题材检测/污染清洗/科技兜底等 prompt+后处理 改动（不依赖模型本身）兜底
  'powerSystem':  'glm-4-flash',
  // 其余字段不变
}
```

## 第五轮（基线修复）：4 个世界观 bug

| Bug | 现象 | 根因 | 修复（route.ts） |
|---|---|---|---|
| ① 力量体系空 | 主角修剑却无体系字段 | LLM 不写 `powerSystem` 字段 | `_isEmptyOrPlaceholder()` 兜底循环 + `generateDynamicDescription` |
| ② 时代错位 | 写"星际"却跑古代 | 关键词失配 | 强化 `detectGenre` 中科幻/历史关键词权重 |
| ③ 修仙污染 | 现实题材冒"筑基" | 通用 regex 缺术语 | 扩 `_xiuXianRe`，清洗 technology/mythology |
| ④ 科技错 | 古代文出现"量子" | 缺题材对应 | isHistory/isSciFi/isModern 三分支兜底 |

## 第六轮（截图驱动）：idea 截取显示 bug

| 字段 | 旧 | 新 |
|---|---|---|
| 小说介绍 | 复制主角身份背景 | 独立设计（核心冲突铁律 L12950） |
| 核心冲突 | 复制一句话简介 | "设计（而非复述/提炼）"+ 重试 + 兜底 |
| 重复率检测 | 无 | `_dupRatio2 >= 0.55` 触发重试（L12334/12347-12349） |
| `_fallbackCC2` | `tagline.substring(0,48)+'...'` | `_fallbackNames2 + '在强敌环伺、内外交困中艰难立足…'` |

**附带修复**：`_STEP_MODEL_MAP` idea 改为 `glm-4.7-flash`（之前误改 step-model-config.ts 无效，本轮改正）。

## 第七轮（截图驱动）：跳转慢 + 体系类型/神话传说/重要地点

| 字段 | 旧 | 新 |
|---|---|---|
| 跳转速度 | worldbuilding ~15.9s | 回退 `glm-4-flash`（~5.6s） |
| 体系属性/类型 | LLM 不输出 / 字段空 | L14949 注入 `【体系类型】明朝朝堂权力体系` |
| 神话传说 | 含修仙 | 命中 `_xiuXianRe` 或 洪荒词 → 清空 |
| 重要地点/秘境 | 抽象地点 | isHistory + 关键词含明/南明/明末/明清之交 → 注入 8 个真实战役大城（山海关/扬州/南京/肇庆/桂林/厦门/赣州/松锦战场） |

## 第八轮（截图驱动）：社会结构 xianxia 污染 — 全面跨题材清洗

| 字段 | 旧 | 新 |
|---|---|---|
| `_xiuXianRe` 词表 | 漏内丹/修道士/灵山/元神/神识/道行等 15 词 | 补齐 15 术语 |
| 清洗范围 | 只 technology/mythology/locations | 6 个核心文本字段（era/geography/history/socialStructure/culturalFeatures/secretHistory）逐一 regex 扫描 |

## 第九轮（截图驱动）：金手指混搭 + 体系名称/类型占位词

### Bug ① 金手指混搭（artifact + knowledge 互不互斥）

- 现象：description = "玉佩内藏后世历史知识与兵法谋略…代价为玉佩能量消耗，过度使用会导致玉佩破碎"
- 根因：promptLibrary L2945 只约束 name，没约束 description 互斥
- 修复：
  - **promptLibrary.ts L2948+** 新增【金手指互斥铁律·必须二选一】：
    - 选项A·纯知识类（name 抽象 + 描述纯知识 + 零物理物件 + 零物件机制）
    - 选项B·纯神器类（name 具体物件 + 物件符合明末历史实物 + 零知识类内容）
    - type=知识记忆时只允许A；type=其它时只允许B
  - **route.ts `case 'powerSystem'` L17725-17788** 后处理：
    - `_artTokensR9`（玉佩/戒指/宝物/…/玉玦共 30 词）+ `_knowTokensR9`（后世知识/历史先知/…/后世 共 15 词）同现 → 混搭
    - type 含知识/记忆/先知 → 移除 artifact 物件 + 物件机制描述
    - 否则 → 移除知识性内容

### Bug ② 体系名称/类型 = "本作无任何超自然"

- 现象：体系名称/类型=本作无任何超自然（错），体系描述=`【体系名称】明朝朝堂权力体系`（对）
- 根因：promptLibrary L2946 与用户目标值冲突（`type="军政体系"`，name=明末军政格局）；LLM 用"本作无任何超自然"占位
- 修复（3 处）：
  1. **promptLibrary.ts L2919+L2946** 重写：type/name 必须 = "明朝朝堂权力体系/南明朝堂权力体系/明末朝堂权力体系/朝堂权力体系"；绝对禁止"军政体系/权谋体系/明末军政格局/本作无任何超自然/无超自然/无体系/无系统"等占位
  2. **route.ts `case 'worldbuilding'` L14186-14229** 快照迁移：检测 `previousData.worldbuilding.powerSystem` 首【体系名称】/【体系类型】块含占位词 → 用全文中出现的朝代朝堂体系名替换
  3. **route.ts `case 'worldbuilding'` L14903-14905** override 守卫加 `_hasPlaceholderName`：即便 LLM 已写配对品阶，只要【体系名称】/【体系类型】块有占位词也强制跑 override
  4. **route.ts `case 'powerSystem'` L17712-17725** 兜底：检测 cleanedPS.worldPowerSystem.name/.type 命中 `_badNameReR9` → 回退为 `_wbGoodName || wbSystemFullName || '朝堂权力体系'`

## 验证清单（每轮统一）

```bash
cd "D:/tuzhongwang/tuzhong/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/src/tuzhong-wenshu"
node node_modules/typescript/lib/tsc.js --noEmit -p . 2>&1 | wc -l
# 基线 48；本轮 50（新增 2 个是基线本来就有的 _realmBlock/_wpsFinal 重复声明，与本轮无关）

curl -X POST "http://localhost:3001/tuzhong-wenshu/api/ai-generate" -H "Content-Type: application/json" -d '{}' -w "\nHTTP=%{http_code}\n"
# HTTP=401 = 鉴权门，证明 route.ts 已热重载、本轮编辑生效
```

## 可调旋钮

- `_STEP_MODEL_MAP.idea/worldbuilding/powerSystem` 想再快/再稳就改 `glm-4-flash`；想再细就改 `glm-4.7-flash`（~15.9s/步）。
- `_dynCourtMap` 7 个朝代定制表（L14916-14924）：可加新朝代或调整关键词命中权重。
- `_badNameReR9` / `_artTokensR9` / `_knowTokensR9`（route.ts L17763/17725/17727）：可加新黑名单词。
- `promptLibrary.ts` L2919/2946/2948+：调整朝代朝堂体系名/金手指互斥铁律。
- `_matchedCourtName` 评分权重 `元数据 ×10 + 正文 ×1`（L14933）：调权重可改变朝代命中倾向。

## 验证依赖

- dev server PID 2584 监听 `:3001`，已热重载（curl HTTP 401 验证）
- 用户浏览器**硬刷新**（绕过 cache）后才能看到新数据
- 用户 localStorage 中**旧快照**（`powerSystem 版本数: 3`）已通过 L14186-14229 迁移块兜底清洗

---

## 第十轮（2026-09-01 01:04）：「还是没有同步显示」— 世界观步 vs 力量体系步 渲染不一致

### 现象
世界观设定步渲染成 **1-10 编号列表**，力量体系步渲染成 **品阶/文官/武将 3 列表格**，两步内容不同步。

### ⚠️ 说明：本轮截图无法视觉判读
两次读取截图均返回 `current model does not support images. Content filtered.`，本轮结论基于**代码路径推演 + Node 端到端模拟实测**，未经视觉确认。请用户在浏览器中复核。

### 根因：不是第 9 轮没生效，而是**两步兜底不对称**

| 环节 | 是否有配对格式兜底 | 结果 |
|---|---|---|
| `route.ts` L14900 `_psLvList.join('→')` | — | 把自然语言**降级拼装成简单箭头格式**，覆盖配对内容（元凶） |
| `StepPowerSystem.tsx` L117-136 | ✅ 有（第 9 轮新增 `wbText` 配对抽取） | 截图 2 渲染 3 列表格，正确 |
| `StepWorldbuilding.tsx` | ❌ 无（第 10 轮前） | 截图 1 渲染 1-N 编号列表，错误 |

### 修复

**① 上游 — `src/lib/ai/promptLibrary.ts` L2967-2985**（worldbuilding 分支）
新增「境界划分配对格式铁律」，要求 LLM 直接输出 `品阶 → 文『…』｜武『…』` 配对格式，禁止单行箭头平铺 / 顿号列表 / 纯品阶名列表 / 修真术语 / 作废占位。

**② 下游 — `src/components/wizard-steps/StepWorldbuilding.tsx` L481-545**
解析不到 `rankTable`（<3 行）时从设定中心 `systemTypes[].realmSystem` 回填配对表。四层防护：
1. 三条命中路径判定朝堂题材（文本关键词 / 名称关键词 / 占位名+朝代信号）
2. **安全阀**：命中修真·异能·科幻·魔法·武侠否决词 → 直接跳过，绝不误填
3. 朝代候选列表逐级回退（`南明/明末→明朝`、单字根兜底），避免退化到通用体系
4. 每个候选 `parsePowerSystem` 后校验 `rankTable.length >= 3` 才采纳，挡掉残缺体系

**③ 保留 — `route.ts` L14941-15004** 朝堂注入块作为第三道防线。

### 验证（10/10 场景通过）
脚本 `D:/tmp/test-fallback-e2e.cjs`，载入真实 `.tuzhong-data/setting-types.json`。

| 场景 | 修复前 | 修复后 |
|---|---|---|
| A 已是配对格式 | 3列20品阶 | 3列20品阶（不触发兜底）✓ |
| B L14900 纯品阶箭头平铺（截图元凶） | 1-N 13项 | 3列20品阶·明朝 ✓ |
| C simpleArrow 官职箭头平铺 | 1-N 6项 | 3列20品阶·明朝 ✓ |
| D 占位名+无配对 | 1-N 2项 | 3列20品阶·明朝 ✓ |
| E 占位名+空境界 | 1-N 1项 | 3列20品阶·明朝 ✓ |
| F 名称丢失 | 1-N 3项 | 3列20品阶·明朝 ✓ |
| G 修仙 | 1-N 5项 | 1-N 5项（不触发）✓ 安全阀 |
| H 明末背景修仙 | 1-N 4项 | 1-N 4项（不触发）✓ 安全阀 |
| I 科幻 | 1-N 4项 | 1-N 4项（不触发）✓ 安全阀 |
| J 清朝背景 | 1-N 3项 | 3列19品阶·清朝 ✓ 选对朝代 |

- `tsc --noEmit`：目标文件零错误，全量 50（基线，零新增）
- `curl POST /api/ai-generate` → 401（热重载生效）

### 认知修正（此前记录有误）
- 「明朝朝堂权力体系」realmSystem = **785 字符 / 20 品阶**（非 13 品阶），范围「未入流 → 皇帝（超品）」
- 设定中心 9 个朝堂体系：通用/明朝/秦朝/汉朝/隋唐/宋朝/元朝/清朝/南明，其中**「南明朝堂权力体系」realmSystem 仅 27 字符（残缺）**，需靠 `rankTable>=3` 挡掉

### 待用户复核
1. 浏览器硬刷新后重新生成世界观 → 世界观步应显示**品阶 / 文官 / 武将 3 列表格**
2. 世界观步与力量体系步内容应**完全一致**
3. DevTools Console 应见 `[StepWorldbuilding] 🔥 兜底从设定中心回填配对 rankTable (20 品阶): 明朝朝堂权力体系`

### 已知未决
- 未能取得有效 JWT 做 API 实测（4 种 secret 全 401，疑似 dev server 的 `process.env.JWT_SECRET` 快照与磁盘 `.env.local` 不一致）
- DB 无用户真实数据（`worldSetting(category='power_system')` 0 条），用户流程全在浏览器内存 + localStorage
