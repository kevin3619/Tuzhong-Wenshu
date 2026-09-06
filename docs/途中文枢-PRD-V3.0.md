# 途中文枢 (Tuzhong Wenshu) - AI 小说写作助手 产品需求文档

**版本**: V3.3
**更新日期**: 2026-08-08
**产品定位**: 基于大语言模型的网文智能创作全流程辅助工具
**本次同步**: PRD 与实际代码完全对齐（18 种 step、四种创作模式、硅基流动 7 款免费模型 + 本地 Ollama 多模型 fallback、Kwai-Kolors 绘图、角色智能兜底、题材感知体系、正文 2000-2500 字白金爆款标准、卷章节默认 5×60=300 章、Novel→Volume→Chapter 落库模型；修正「都市/历史题材跨题材仙侠词泄漏」与「非穿越题材被强制注入穿越模板」两处生成质量问题）

---

## 目录

1. [产品概述](#1-产品概述)
2. [用户角色与权限](#2-用户角色与权限)
3. [功能模块总览](#3-功能模块总览)
4. [用户系统](#4-用户系统)
5. [作品书架](#5-作品书架)
6. [AI 全自动创作向导](#6-ai-全自动创作向导)
7. [作品编辑与写作](#7-作品编辑与写作)
8. [设定中心](#8-设定中心)
9. [人物管理](#9-人物管理)
10. [写作风格](#10-写作风格)
11. [对标作品](#11-对标作品)
12. [VIP 会员系统](#12-vip-会员系统)
13. [管理后台](#13-管理后台)
14. [技术架构](#14-技术架构)
15. [数据库设计](#15-数据库设计)
16. [API 接口清单](#16-api-接口清单)

---

## 1. 产品概述

### 1.1 产品愿景
途中文枢是一款面向网文创作者的 AI 辅助写作工具，通过多 Agent 协作的智能创作工作流，从灵感到正文，提供全流程的 AI 辅助创作能力，帮助创作者高效产出高质量的网络小说。

### 1.2 核心价值
- **全流程自动化**: 从灵感捕捉到正文生成，18 步向导式全自动创作
- **多 Agent 协作**: 主创作 Agent + 世界观 Agent + 人物 Agent + 细纲 Agent 协同工作
- **世界观一致性**: 全局上下文管理，确保长篇创作中世界观、人设前后一致
- **硅基流动免费模型**: 7 款永久免费模型（9B 及以下），含 GLM-4-9B、Qwen3-8B、Kwai-Kolors 绘图等
- **四种创作模式**: 仿写模式（拆书搜索）、同人模式（原作故事线穿越）、自己设计（手动输入详细大纲）、AI 全自动生成（普通模式·仅关键词）
- **题材感知体系**: 历史/玄幻/科幻/都市/仙侠等题材自动识别，动态调整力量体系/角色/势力模板
- **智能兜底机制**: 角色（主角/女主/反派/配角）不足时基于题材自动补全，避免空数据
- **番茄风检测**: 内置番茄小说风格质量检测，优化爆款概率
- **搜索拆书**: 通过知名小说库 + 百度百科 + 起点中文网 + 番茄小说多源交叉验证，100% 准确提取原作设定用于同人创作

### 1.3 目标用户
- 网络小说作者（新手/老手）
- 网文工作室
- IP 内容创作者

---

## 2. 用户角色与权限

### 2.1 普通用户（免费版）
- 注册/登录（账号密码、微信扫码）
- 创建 1 部作品
- AI 生成基础功能（受每日额度限制）
- 基础设定管理
- 每日 3000 字生成额度

### 2.2 VIP 会员
- 所有免费版功能
- 解锁多部作品创作
- 更高每日生成额度
- 优先使用高级模型
- 专属客服支持

**会员套餐**:
| 套餐 | 价格 | 有效期 | 优惠 |
|------|------|--------|------|
| 月度会员 | ¥79.9 | 30天 | - |
| 季度会员 | ¥219 | 90天 | 9折 |
| 年度会员 | ¥799 | 365天 | 约67折 |

### 2.3 管理员
- 所有用户功能
- 用户管理（查看、禁用、启用）
- 订单管理（审核、确认）
- 系统配置（品牌 Logo、支付配置）
- 数据统计面板

---

## 3. 功能模块总览

### 3.1 页面清单
| 页面路径 | 页面名称 | 模块归属 |
|----------|----------|----------|
| `/login` | 登录/注册页 | 用户系统 |
| `/qr-scan` | 扫码确认页（⚠️ 实际未独立建页，微信扫码登录由 `/api/wechat/qrcode` + `/api/wechat/check` 接口实现，二维码内嵌于登录页） | 用户系统 |
| `/` | 作品书架（含 AI 创作向导入口 + 拆书搜索入口） | 作品管理 |
| `/ai-generate` | AI 全自动生成（重定向桩，自动跳回首页向导） | 创作向导 |
| `/write/[id]` | 作品编辑器 | 写作编辑 |
| `/settings/world` | 设定中心 | 世界观设定 |
| `/characters` | 人物管理 | 人物设定 |
| `/style` | 写作风格 | 风格管理 |
| `/reference` | 对标作品 | 参考作品 |
| `/skills` | SKILL 技能 | 技能管理 |
| `/guide` | 使用指南 | 帮助系统 |
| `/vip` | VIP 会员 | 支付会员 |
| `/settings` | 个人设置 | 用户设置 |
| `/admin` | 管理后台 | 系统管理 |

### 3.2 核心工作流
```
【模式一：仿写创作 (imitate)】
拆书搜索(imitateSearch) → 灵感创作(idea) → 世界观设定(worldbuilding) → 金手指/力量体系(powerSystem)
    → 人物设定(characters) → 势力设定(factions) → 人物关系图谱(relationships) → 简介卖点(synopsis)
    → 整体故事大纲(outline) → 关键剧情(keyPlots) → 分卷章节(chapters) → 逐章正文(content)
    → 避坑检查 → 封面生成(cover) → 完成
    （所有角色名/地名/势力名 100% 原创，仅学习原作结构/节奏/爽点设计）

【模式二：同人模式 (fanfiction)】
拆书搜索(imitateSearch) → 灵感创作(idea，保留原作世界观与修炼体系 fanfictionSource/fanfictionBookData) → ...（后续步骤同模式一）
    （主角穿越成原作角色，拥有穿越者知识/前知优势，以主角为核心走原作故事线）

【模式三：自己设计 (custom)】
用户直接粘贴详细大纲/章节安排/人物设定 → 灵感创作(idea) → ...（后续步骤同上，系统读取并补全缺失部分）

【模式四：AI 全自动生成 / 普通模式 (normal)】
主题输入(input，仅关键词) → 灵感创作(idea) → ...（后续步骤同上）
```

**完整 step 清单（18 种）**:
| Step | 名称 | 说明 |
|------|------|------|
| input | 主题输入 | 输入题材/关键词/选择平台风格 |
| imitateSearch | 仿写搜索 | 搜索知名小说并拆书提取设定 |
| imitate | 同人/仿写灵感 | 基于拆书结果生成同人/仿写向的灵感与设定 |
| idea | 灵感创作 | 生成书名/简介/卖点/主角 |
| bookAnalysis | 拆书分析 | 深度分析原作结构 |
| worldbuilding | 世界观 | 时代/地理/历史/社会结构 |
| powerSystem | 力量体系 | 金手指/修炼体系/升级规则 |
| characters | 人物设定 | 主角/女主/反派/配角（20+角色） |
| factions | 势力设定 | 门派/组织/势力关系 |
| relationships | 关系图谱 | 可视化人物关系图 |
| synopsis | 简介卖点 | 简介/宣传语/目标读者 |
| outline | 故事大纲 | 分卷规划/主线剧情 |
| keyPlots | 关键剧情 | 转折/高潮/伏笔设计 |
| coreConflict | 核心冲突 | 提取/生成故事核心冲突与主线张力 |
| chapters | 章节划分 | 分卷章节/标题/摘要 |
| content | 正文生成 | 逐章2000-2500字正文（白金爆款标准） |
| cover | 封面生成 | Kwai-Kolors AI绘图 |
| generateName | 自动取名 | 角色原创命名 |
| autoDesignProtagonist | 主角设计 | 主角人设自动生成 |
| typeDetail | 题材细化 | 题材标签精细化 |

### 3.3 拆书搜索工作流（同人创作专用）
```
搜索关键词 → 多源并发抓取（知名小说库 > 百度百科 > 起点中文网 > 番茄小说 > 搜狗/360）
    → 字段级加权投票 → 异常值检测 → 数据质量预过滤 → 用户确认 → 注入同人创作上下文
```

---

## 4. 用户系统

### 4.1 注册
**页面**: `/login`（切换到注册模式）

**功能描述**:
- 用户通过用户名、密码、昵称注册账号
- 密码长度 6-16 位
- 用户名唯一校验
- 注册成功自动登录并跳转首页

**字段**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 用户名 | String | 是 | 唯一，4-20字符 |
| 昵称 | String | 是 | 显示名称 |
| 密码 | String | 是 | 6-16位，bcrypt加密存储 |

### 4.2 登录
**支持方式**:
1. **账号密码登录**: 用户名 + 密码
2. **微信扫码登录**: 生成微信二维码，扫码确认登录

**登录状态管理**:
- Token 存储: localStorage + Cookie
- Token 有效期: 30 天
- 记住密码功能（localStorage 存储）

### 4.3 个人设置
**页面**: `/settings`

**功能模块**:
1. **AI 模型配置**
   - 支持 20+ 主流大模型提供商
   - 可添加多个模型配置，设置默认模型
   - 模型参数配置（temperature、topP、maxTokens 等）
   - API Key 加密存储
   - 支持本地模型（Ollama/LM Studio/vLLM）

2. **写作风格设置**
   - 预设风格选择
   - 自定义风格参数
   - 风格样本上传与分析

3. **账号设置**
   - 昵称修改
   - 头像设置
   - 密码修改

**已配置 AI 模型（7 款永久免费）**:
| 模型 | 用途 | 默认 |
|------|------|------|
| THUDM/GLM-4-9B-0414 | **正文主力**（质量高/速度快） | ✅ default |
| Qwen/Qwen3-8B | 综合备用 | - |
| THUDM/GLM-Z1-9B-0414 | 角色推理/权谋 | - |
| Qwen/Qwen2.5-7B-Instruct | 轻量备用 | - |
| Qwen/Qwen3.5-4B | 极速轻量 | - |
| tencent/Hunyuan-MT-7B | 翻译润色 | - |
| Kwai-Kolors/Kolors | **封面绘图**（完全免费） | - |

**本地模型兜底（Ollama）**: 当硅基流动免费模型触发限流（HTTP 429）或超时，系统自动回退至本地 Ollama 推理（零成本、零限流、无需联网）。通过环境变量 `OLLAMA_MODELS` 配置本地模型列表（默认 `qwen2.5:14b,qwen2.5:7b,deepseek-r1:14b`，按序 fallback；兼容旧字段 `OLLAMA_MODEL` 单值）。Ollama 服务需本地运行（默认 `http://localhost:11434`）。详见 14.3。

**API 提供商**: 硅基流动 SiliconFlow（https://api.siliconflow.cn/v1）
**配置文件**: `.tuzhong-data/models.json`（系统级模型配置，含 API Key）
**环境变量**: `SILICONFLOW_API_KEY`（.env.local 优先级高于 .env）

> **历史说明**: 早期版本支持 20+ 模型提供商（OpenAI/Claude/DeepSeek/讯飞星火等），V3.0 后统一迁移至硅基流动免费模型以降低用户使用成本。高级用户仍可在个人设置中自定义其他模型。

---

## 5. 作品书架

**页面**: `/`

### 5.1 功能描述
作品书架是用户的创作首页，展示所有作品的概览信息，提供快捷入口。

### 5.2 核心功能

#### 5.2.1 数据统计卡片
- **创作中作品**: 当前正在创作的作品数量
- **总字数**: 所有作品累计字数（万）
- **平均健康度**: 作品健康度平均分
- **连续打卡**: 连续创作天数

#### 5.2.2 作品列表
- 网格布局展示作品卡片
- 支持按标题搜索
- 作品封面（渐变背景 + 标题）
- 作品状态标签（创作中/已完成/已暂停）
- 作品类型
- 字数统计
- 最后修改时间
- 健康度评分及进度条

#### 5.2.3 新建作品
- 作品名称（必填）
- 作品类型（下拉选择，40+ 种分类）
- 作品简介（选填）
- 创建成功自动进入 AI 创作向导

**作品类型列表**:
- 男频: 玄幻、仙侠、都市、科幻、历史、军事、游戏、体育、灵异、悬疑
- 女频: 言情、古代言情、现代言情、仙侠奇缘、玄幻言情、浪漫青春、悬疑推理
- 细分: 武侠、奇幻、末世、无限流、系统流、重生、穿越、种田、宅斗、宫斗、权谋、商战、职场、娱乐圈、同人、轻小说、短篇、纪实、乡土、现实、搞笑、诸天万界

#### 5.2.4 删除作品
- 二次确认弹窗
- 删除后无法恢复
- 级联删除所有章节、设定、人物等数据

#### 5.2.5 快捷操作
- **AI 全自动生成**: 打开 AI 创作向导，从零开始生成一部完整小说
- **新建作品**: 手动创建作品基础信息

---

## 6. AI 全自动创作向导

**页面**: `/ai-generate`（重定向桩，实际入口在首页 `/` 由"AI 全自动生成"按钮触发）  
**组件**: `ai-generate-wizard.tsx` + `wizard-steps/` 目录下 14 个步骤组件

### 6.1 概述
AI 全自动创作向导是产品的核心功能，通过 14 个步骤的向导式交互，配合多 Agent 协作，从零开始生成一部完整的网络小说。步骤支持点击跳转（已完成步骤可点击回退），数据通过 localStorage 持久化以防止刷新丢失。

### 6.2 创作步骤详解

#### 步骤 1: 主题输入 (StepInput)
- **四种创作方式选择**（核心交互）：
  - **仿写模式 (imitate)**：搜索原作并拆书，学习其结构/节奏/爽点，但角色名/地名/势力名 100% 原创
  - **同人模式 (fanfiction)**：搜索原作，主角穿越成其中角色，保留原作世界观与修炼体系，走原作故事线
  - **自己设计 (custom)**：直接粘贴已设计的大纲/章节安排/人物设定，系统读取后补全其余内容
  - **AI 全自动 / 普通模式 (normal)**：仅输入关键词，由 AI 从零生成
- 输入小说主题/关键词（同人亦可在关键词中以"XX同人"格式触发，例如"吞噬星空同人"，与上方同人模式等效）
- 选择作品类型（可多选，可叠加）
- 主角设定（姓名/性别/年龄/身份背景，可留空由 AI 自动生成；支持 AI 自动设计主角、自动取名）
- 万能仿写·手动导入拆书结果（粘贴外部 AI 拆书 JSON 或自动拆书）
- 选择 AI 模型
- 同步拆书结果（若用户先进行了拆书搜索，自动注入原作世界观与修炼体系）

#### 步骤 2: 灵感创作 (StepIdea)
- AI 生成多个创意方向（3-5个）
- 每个创意包含: 书名、一句话钩子、核心卖点、目标读者
- 同人模式下保留原作世界观与修炼体系字段（fanfictionSource、fanfictionBookData）
- 用户选择满意的创意方向
- 支持字段级重新生成（含上下文一致性约束）
- 支持重新生成

#### 步骤 3: 世界观设定 (StepWorldbuilding)
- 时代背景（era，目标长度 ≥100 字）
- 地理版图（geography，目标长度 ≥120 字）
- 历史走向（history，目标长度 ≥120 字）
- 力量体系（powerSystem，目标长度 ≥150 字）
- 世界规则
- 社会结构
- 科技水平
- **智能重试机制**: 字段长度不达标时自动重试，最多 3 次

#### 步骤 4: 金手指设定 (StepPowerSystem)
- 主角特殊能力/系统/传承设定
- 能力等级划分
- 升级规则
- 能力限制与代价
- 自动校验与一致性修复（validateAndFixPowerSystem）

#### 步骤 5: 主要人物设定 (StepCharacters)
- 主角设定（姓名、性格、外貌、背景、能力、成长弧线）
- 女主/重要女配设定
- 反派设定
- 重要配角设定
- 每个角色包含: 基本信息、性格特点、外貌描述、背景故事、能力技能
- 主角名修改时自动同步至：灵感、简介、卖点、一句话钩子等所有关联字段

#### 步骤 6: 势力设定 (StepFactions)
- 主要门派/宗门/组织
- 势力等级划分
- 势力间关系
- 核心成员

#### 步骤 7: 人物关系图谱 (StepRelationships)
- 可视化人物关系图（Cytoscape）
- 关系类型: 敌对、友好、师徒、爱慕、亲人、利用、其他
- 关系强度: 1-5 级
- 支持拖拽调整位置
- 关系描述

#### 步骤 8: 简介卖点 (StepSynopsis)
- 作品简介（shortIntro / oneLineIntro / fullIntro / synopsis）
- 核心卖点提炼（coreSellingPoint、sellingPoints）
- 目标受众分析
- 一句话宣传语（tagline、hook）

#### 步骤 9: 整体故事大纲 (StepOutline)
- 主线剧情梳理
- 故事阶段划分（卷一、卷二...）
- 各阶段核心目标
- 关键事件节点
- 爽点节奏规划

#### 步骤 10: 关键剧情节点 (StepKeyPlots)
- 核心剧情节点详细设计
- 转折点设计
- 高潮情节设计
- 伏笔埋设规划

#### 步骤 11: 分卷章节划分 (StepChapters)
- 分卷结构（卷名、卷大纲、核心目标）
- 每卷章节规划
- 章节标题 + 章节摘要
- 字数估算
- 卷名自动去重（sanitizeVolumeName）
- 章节摘要与卷摘要相似度交叉检测，避免重复
- **卷/章数可配置**：默认 volumeConfig={volumeCount:5, chaptersPerVolume:60}（目标 300 章）；用户中途修改卷数/章数时，系统基于新配置重新生成卷标题、卷摘要、章标题、章摘要（去重 + 无空值校验），无需重跑前序步骤

#### 步骤 12: 逐章生成正文 (StepGenerating)
- 按章节批量生成正文
- 实时显示生成进度
- 每章 2000-2500 字
- 保持上下文一致性
- 支持中断/继续生成

#### 步骤 13: 避坑检查 (StepFinalCheck)
- AI 痕迹检测
- 连贯性评分
- 同质化风险
- 影子禁令风险
- 爽点密度
- 沉浸感评分
- 冷启动效果
- 综合评分 + 修改建议

#### 步骤 14: 制作小说封面 (StepCover)
- AI 生成小说封面（SVG 渐变背景 + 星光 + 题材装饰）
- 支持多种风格
- 封面预览
- 完成后跳转至完成态，可一键进入作品编辑器

### 6.3 向导核心特性
- **步骤快照**: 每步完成自动保存快照，支持回退
- **数据校验**: 步骤数据格式自动校验与修复
- **落库模型**: 作品经 `/api/novels` 创建，正文按 `volumes`（卷：name/summary/coreObjective/order）+ `chapters`（章：chapterNumber/title/content/wordCount/volumeIndex）嵌套数组写入 Novel/Volume/Chapter 三张表；书架字数统计来自章节内容累计，必须传入 chapters 数组才能正确落库（仅传顶层 content 字符串会导致书架显示 0 字）
- **懒加载**: 步骤组件按需动态加载，提升性能
- **进度指示**: 顶部步骤条显示当前进度
- **上一步/下一步**: 支持在步骤间导航
- **点击跳转**: 已完成的步骤支持点击直接跳转（hasStepData 中 input 步骤恒返回 true）
- **上下文传递**: 前序步骤数据自动传递给后续步骤
- **localStorage 持久化**: step 与 generatedData 持久化到 localStorage，刷新不丢失状态
- **字段级重新生成**: 任意步骤支持单字段重新生成，自动携带前序步骤上下文（标题/简介/卖点/冲突/设定/力量体系）保证一致性
- **题材一致性检查**: 东方元素关键词检测，避免东方题材错配西方奇幻内容；同人模式保留原作世界观与修炼体系
- **stripSchemaEcho 字段标签前缀剥离**: AI 按提示词格式回写 `"时代背景：上古洪荒..."` 时，仅剥离"时代背景"标签前缀，保留后续真实内容；仅当剥离后内容为空时才视为纯 schema 回写返回空。该机制仅用于 worldbuilding 步骤，避免误清 era/geography 字段导致前端 isEmptyResult 误判为"空结果"
- **worldbuilding 智能重试**: 字段长度未达阈值（era≥100 / geography≥120 / history≥120 / powerSystem≥150 字）时自动重试，最多 3 次
- **deepSanitizeContent 全局清理**: 递归处理嵌套对象，清除原著专有名词、真实历史名称、`[原文占位·参考结构]` 占位符、乱码标点等
- **cleanStructuredData**: 递归清理嵌套对象中的占位符与空值，避免前端显示空字符串
- **isEmptyResult 空结果判定**: 各步骤独立判定逻辑，worldbuilding 判定为 era/geography 均不存在或长度 ≤5 字

---

## 7. 作品编辑与写作

**页面**: `/write/[id]`

### 7.1 页面布局
- **左侧**: 卷/章节目录树
- **中间**: 正文编辑区
- **右侧**: 工具栏（AI 辅助功能）

### 7.2 核心功能

#### 7.2.1 章节管理
- 分卷结构展示
- 章节列表（可展开/收起卷）
- 章节状态（草稿/已完成/已发布）
- 字数统计
- 支持新建章节、删除章节
- 支持调整章节顺序

#### 7.2.2 正文编辑
- 富文本编辑
- 实时字数统计
- 自动保存
- 版本历史

#### 7.2.3 AI 辅助写作
- **AI 续写**: 基于当前内容继续生成
- **AI 改写**: 选中段落进行改写优化
- **风格模仿**: 按指定风格重写
- **番茄检测**: 章节质量检测（见 7.3）

### 7.3 番茄风质量检测
**数据库表**: `tomato_reports`

**检测维度**:
| 维度 | 说明 |
|------|------|
| AI 痕迹 | 检测 AI 生成痕迹 |
| 连贯性 | 上下文逻辑连贯性 |
| 同质化 | 与现有作品的相似度风险 |
| 影子禁令 | 敏感内容/违规风险 |
| 爽点密度 | 爽点分布频率 |
| 沉浸感 | 读者代入感评分 |
| 冷启动 | 开篇吸引力评分 |
| 综合评分 | 总体质量评分 |

**输出**:
- 各项评分（0-100）
- 问题清单
- 优化建议

---

## 8. 设定中心

**页面**: `/settings/world`

### 8.1 功能描述
管理作品的世界观设定，支持层级化的设定管理。

### 8.2 设定分类
| 分类 | 说明 |
|------|------|
| 地理 geography | 地理版图、地形地貌、重要地点 |
| 历史 history | 历史年表、重大事件 |
| 力量体系 power_system | 修炼体系、等级划分 |
| 组织 organization | 门派、宗门、国家、组织 |
| 种族 race | 智慧种族设定 |
| 物品 item | 法宝、丹药、功法等 |
| 规则 rule | 世界运行规则 |

### 8.3 核心功能
- 设定的增删改查
- 层级结构（支持父子设定）
- 设定详情编辑
- 元数据扩展（JSON 格式）

---

## 9. 人物管理

**页面**: `/characters`

### 9.1 功能描述
管理作品中的所有人物角色，支持可视化关系图谱。

### 9.2 人物属性
| 属性 | 类型 | 说明 |
|------|------|------|
| 姓名 | String | 角色名称 |
| 别名 | String[] | 其他称呼 |
| 性别 | Enum | male/female/other |
| 年龄 | Int | 角色年龄 |
| 角色定位 | Enum | 主角/反派/配角/路人 |
| 外貌 | JSON | 外貌描述 |
| 性格 | JSON | 性格特点 |
| 背景 | JSON | 背景故事 |
| 能力 | JSON | 技能能力 |
| 代表色 | String | 图谱节点颜色 |
| 位置坐标 | Int, Int | 关系图位置 |

### 9.3 关系图谱
- **技术方案**: Cytoscape + cytoscape-react
- **关系类型**: 敌对、友好、师徒、爱慕、亲人、利用、其他
- **关系强度**: 1-5 级
- **交互**: 支持拖拽节点、缩放、平移
- **视图切换**: 列表视图 / 图谱视图

---

## 10. 写作风格

**页面**: `/style`

### 10.1 功能描述
管理和配置 AI 写作风格，支持预设风格和自定义风格。

### 10.2 风格参数
| 参数 | 范围 | 说明 |
|------|------|------|
| 正式度 formality | 0-100 | 文风正式/口语化程度 |
| 情感强度 emotionIntensity | 0-100 | 情感表达浓烈程度 |
| 描写密度 descriptionDensity | 0-100 | 环境/外貌描写密度 |
| 对话占比 dialogueRatio | 0-100 | 对话在文中的比例 |
| 修辞频率 rhetoricFrequency | 0-100 | 比喻/拟人等修辞使用频率 |
| 节奏 pacing | 0-100 | 叙事节奏快慢 |
| 文字密度 languageDensity | 0-100 | 用词繁复/简洁程度 |
| 时代感 eraFeel | 0-100 | 古风/现代感 |
| 爽点密度 excitementDensity | 0-100 | 爽点/高潮频率 |

### 10.3 预设风格
- 辰东玄幻风
- 耳根仙侠风
- 会说话的肘子都市风
- 桐华言情风
- 当年明月历史风
- 等等...

### 10.4 风格分析
- 上传样本文本
- AI 自动分析风格参数
- 生成风格画像

---

## 11. 对标作品

**页面**: `/reference`

### 11.1 功能描述
上传/添加对标作品，分析其风格和结构，辅助 AI 模仿学习。

### 11.2 核心功能
- 作品信息录入（书名、作者、类型）
- 全文上传/粘贴
- AI 风格分析
- 风格参数提取
- 作为风格参考用于生成

---

## 12. VIP 会员系统

**页面**: `/vip`

### 12.1 会员套餐
| 套餐 | 价格 | 有效期 | 热门标记 |
|------|------|--------|----------|
| 月度会员 | ¥79.9 | 30天 | - |
| 季度会员 | ¥219 | 90天 | ✓ |
| 年度会员 | ¥799 | 365天 | - |

### 12.2 支付方式
- **微信支付**: 扫码支付，生成动态二维码
- **支付截图审核**: 支持上传支付截图人工审核

### 12.3 订单状态
| 状态码 | 状态 | 说明 |
|--------|------|------|
| 0 | 待支付/待审核 | 订单创建，等待支付或审核 |
| 1 | 支付成功 | 支付已确认，会员已生效 |
| 2 | 已失效/已驳回 | 订单过期或审核不通过 |

### 12.4 微信支付流程
1. 用户选择套餐，点击支付
2. 调用 `/api/wechat/pay/qrcode` 生成支付二维码
3. 显示二维码 + 倒计时（30分钟有效）
4. 前端轮询 `/api/wechat/pay/check` 检查支付状态
5. 支付成功后更新会员状态，跳转成功页
6. 微信支付回调: `/api/wechat/pay/callback`

---

## 13. 管理后台

**页面**: `/admin`（仅管理员可见）

### 13.1 数据概览 (Dashboard)
**API**: `/api/admin/stats`

**统计指标**:
- 总用户数
- VIP 用户数
- 总作品数
- 今日活跃用户
- 待处理支付订单数

### 13.2 用户管理
**API**: `/api/admin/users`

**功能**:
- 用户列表（分页）
- 查看用户详情（作品数、会员状态等）
- 启用/禁用用户
- 设为管理员/取消管理员

### 13.3 订单管理
**API**: `/api/admin/payments`

**功能**:
- 支付订单列表
- 订单状态筛选
- 支付截图审核（通过/驳回）
- 手动确认到账

### 13.4 系统配置
**API**: `/api/admin/config`

**配置项**:
1. **基础配置**: 系统名称、描述等
2. **品牌配置**: 品牌 Logo 上传
3. **支付配置**: 微信支付商户号、API 密钥、证书上传

---

## 14. 技术架构

### 14.1 技术栈
| 层级 | 技术选型 |
|------|----------|
| 前端框架 | Next.js 16 (App Router) + React 19 |
| UI 框架 | Tailwind CSS |
| 图标库 | lucide-react |
| 数据库 | SQLite + Prisma ORM |
| 认证 | 自建 JWT + bcrypt 密码加密 |
| 第三方登录 | 微信扫码登录 |
| 支付 | 微信支付 Native |
| 关系图谱 | Cytoscape + cytoscape-react |
| 二维码 | qrcode.react + qrcode |
| 图表 | Recharts |
| 语言 | TypeScript |

### 14.2 项目结构
```
src/
  app/
    (main)/           # 主布局路由组
      admin/          # 管理后台
      ai-generate/    # AI 生成向导页
      characters/     # 人物管理
      guide/          # 使用指南
      reference/      # 对标作品
      settings/       # 设置（个人 + 世界）
      skills/         # SKILL 技能
      style/          # 写作风格
      vip/            # VIP 会员
      write/[id]/     # 作品编辑器
      page.tsx        # 首页（书架）
    api/              # API 路由
    login/            # 登录页
    qr-scan/          # 扫码确认页（⚠️ 未独立建页，微信登录走 wechat/* 接口，见 4.2）
  components/         # 组件
    wizard-steps/     # 创作向导各步骤组件
  lib/                # 业务逻辑库
    ai/               # AI 相关
    book-sources/     # 书籍源
  prisma/             # 数据库 schema
  public/             # 静态资源
  scripts/            # 脚本
```

### 14.3 AI 服务架构
- **多模型代理层**: `ai-proxy-client.ts` 统一封装不同模型的调用（讯飞星火: astron-code-latest、SiliconFlow 等）
- **安全管道**: `safe-pipeline.ts` 确保生成内容安全
- **内容校验**: `proj-content-check.ts` 项目级内容一致性检查
- **上下文存储**: `proj-context-store.ts` 管理创作上下文
- **提示词库**: `promptLibrary.ts` 系统化提示词管理
- **创作向导主接口**: `/api/ai-generate/route.ts` 按 step 参数分发至各步骤处理器，包含 stripSchemaEcho、cleanStructuredData、deepSanitizeContent 等数据清理工具
- **多模型 fallback 链路**: `effectiveLlmConfig` 按环节自动选型（idea/worldbuilding/powerSystem/characters/factions/relationships/outline/synopsis/keyPlots/chapters 等结构化步 → GLM-Z1-9B；正文 content → GLM-4-9B），并在硅基流动限流/超时时回退本地 Ollama（`OLLAMA_MODELS`，默认 qwen2.5:14b → qwen2.5:7b → deepseek-r1:14b）。`callLLMWithFallback` 统一封装跨供应商重试与超时（Ollama 超时 600s）；正文步额外经 `CONTENT_STRICT_RULES` + `cleanNovelContent` 剥离元叙事标签与跨题材词
- **跨题材清洗（globalClean）**: 每次生成后按题材递归清洗结果对象中的跨题材专属词汇——历史（`_historyCrossReplacements`）、都市/现代（`_modernCrossReplacements`，2026-08-08 新增）、修仙（`_xiuxianCrossReplacements`）、西幻（`_westernCrossReplacements`）、科幻（`_scifiCrossReplacements`）五套替换词库，确保非本题材不出现他题材标志性词汇（如都市不出「万界/鸿蒙」、历史不出「宗门/渡劫」）
- **字段级重试**: worldbuilding 步骤内置智能重试（3 次重试 + 字段长度阈值验证）

### 14.4 拆书搜索架构（同人创作专用）
- **数据源管理器**: `lib/book-sources/manager.ts` 统一调度多源抓取与字段级加权投票
- **数据源清单**:
  - `famous-novels.ts` 知名小说库（最高优先级，权重 +20，覆盖《吞噬星空》《盘龙》《星辰变》《大奉打更人》《诡秘之主》《凡人修仙传》等 19+ 部热门作品）
  - `baidu-source.ts` 百度百科数据源（权重 +20，使用 Playwright + stealth 插件反反爬）
  - `qidian-source.ts` 起点中文网（权重 +12，双模式：静态抓取 + Playwright 渲染，自动 Cookie 管理 + 代理池 + 浏览器指纹模拟）
  - `fanqie-source.ts` 番茄小说（权重 +7，含同人派生作品过滤 + 知名小说保护机制，匹配阈值 0.8/0.9）
  - `sogou-source.ts` / `360-source.ts` 搜狗/360 百科（权重 +3，作为补充数据源）
  - `firecrawl-source.ts` Firecrawl（权重 -10，仅作为最后兜底）
- **数据融合机制**: 字段级加权投票 + 异常值检测（字数/章节数比例合理性）+ 数据质量预过滤（过滤质量分 <40 的源）
- **反爬策略**: Playwright 内置 13 项指纹伪装 + playwright-extra + puppeteer-extra-plugin-stealth + 页面标题一致性验证 + 数据校验

### 14.5 运行环境
- **Node.js**: v22.22.2（推荐）/ v24.17.0（备用）
- **开发服务器**: Next.js 16 Turbopack（`npx next dev -p 3001`）
- **服务地址**: http://localhost:3001/tuzhong-wenshu
- **基础路径**: /tuzhong-wenshu（basePath 配置）
- **数据库**: SQLite + Prisma ORM
- **包管理器**: npm
- **管理员账号**: kevin / kevin123

### 14.6 已知问题与修复记录（V3.3）
| 问题 | 严重度 | 状态 | 修复方案 |
|------|--------|------|----------|
| API Key 被旧值覆盖 | P0 | ✅已修复 | .env.local 统一为硅基流动有效 key |
| 模型认证失败 | P0 | ✅已修复 | effectiveLlmConfig 优先读 models.json |
| 力量体系玄幻污染 | P1 | ✅已修复 | 按题材动态生成（历史→朝堂/玄幻→修真） |
| 势力返回空数组 | P1 | ✅已修复 | 别名兼容+salvage+题材兜底6势力 |
| 主角名级联丢失 | P1 | ✅已修复 | protagonistSettings.name 兜底 |
| 正文跑题/重复 | P1 | ✅已修复 | 默认模型改为 GLM-4-9B-0414 |
| 玄幻词残留 | P2 | ✅已修复 | history 清洗词库补充20+词 |
| Kwai-Kolors 绘图400 | P1 | ✅已修复 | 根因：API Key 无效，换 key 后正常 |
| 配角/反派为空 | P2 | ✅已修复 | 恢复智能兜底机制（题材感知动态生成） |
| imitateSearch 超时 | P2 | ⚠️已知限制 | 依赖外部网络，有本地拆书库兜底 |
| 生产构建沙箱拦截 | P3 | ⚠️已知限制 | 部署时手动清理 .next 目录 |
| 首页加载 2-3s | P3 | ⚠️优化建议 | 图片懒加载 + SWR 缓存 |
| 都市/历史题材仙侠词泄漏（如「万界」「诸天」「鸿蒙」） | P1 | ✅**本次修复** | 新增 `_modernCrossReplacements` 替换词库 + globalClean 都市/现代分支；并补全 history 词库裸词「万界/诸天」 |
| 非穿越题材被强制注入穿越模板（"现代灵魂X魂穿主角"） | P1 | ✅**本次修复** | 新增 `_noTransmigrationHint` 反向约束（未请求穿越时禁止魂穿/现代灵魂/穿越者）；历史穿越模板改为仅当 `_isTransmigration` 为真时生效 |
| 本地 Ollama deepseek-r1 回退过慢 | P3 | ⚠️已知限制 | deepseek-r1:14b 本地推理约 320s，交互式生成偶发超时；建议批量/离线场景使用或移出默认交互 fallback |

---

## 附录 A：测试信息

### 测试地址与账号
| 项目 | 值 |
|------|-----|
| 本地访问地址 | http://localhost:3001/tuzhong-wenshu |
| 管理员账号 | kevin |
| 管理员密码 | kevin123 |
| VIP 状态 | lifetime（终身会员） |

### 测试覆盖（2026-08-02 全项目测试）
- 页面可达性: 16/16 ✅
- 浏览器交互: 19/19 ✅
- API 接口: 全部通过 ✅
- AI 模型可用: 7/7（含绘图）✅
- AI 全自动流程: 13/14 步骤主题一致 ✅
- 白金爆款输出: 2829字《南明中兴录》达标 ✅
- **综合评级: A-档** ✅

### 测试覆盖（2026-08-08 AI 全流程调试）
- 题材隔离验证: 历史/都市/科幻/玄幻 4 题材 `idea` 步实测，主角名锁定正确（朱厚照/林枫/叶辰/楚风），非穿越题材零穿越模板、都市/历史零仙侠词泄漏 ✅
- 修复回归: 都市「万界」仙侠词泄漏、历史/都市被强制注入「现代灵魂魂穿」模板 两处已修复并回归通过 ✅
- 正文步（content）逻辑与清洗管道（`CONTENT_STRICT_RULES`/`cleanNovelContent`）已就位；连续压测触发硅基流动 429 时会回退本地 Ollama，deepseek-r1:14b 推理约 320s 致单次生成偶发超时，待优化 fallback 顺序（详见 14.6 已知限制）

---

**文档结束**

### 15.1 数据表清单
| 表名 | 说明 |
|------|------|
| users | 用户表 |
| novels | 作品表 |
| volumes | 分卷表 |
| chapters | 章节表 |
| characters | 人物表 |
| character_relationships | 人物关系表 |
| world_settings | 世界设定表 |
| foreshadowings | 伏笔表 |
| tomato_reports | 番茄检测报告表 |
| writing_styles | 写作风格表 |
| ai_model_configs | AI 模型配置表 |
| reference_works | 对标作品表 |
| payments | 支付记录表 |
| system_config | 系统配置表 |

### 15.2 核心表结构
详见 [schema.prisma](file:///D:/途中网开发项目/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/src/tuzhong-wenshu/prisma/schema.prisma)

---

## 16. API 接口清单

### 16.1 认证相关
| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/login` | POST | 账号密码登录 |
| `/api/auth/me` | GET | 获取当前用户信息 |
| `/api/auth/update-profile` | POST | 更新用户资料 |
| `/api/auth/qr-login` | POST | 生成微信登录二维码 |
| `/api/auth/qr-scan` | POST | 扫码（小程序端调用） |
| `/api/auth/qr-confirm` | POST | 确认登录（小程序端调用） |
| `/api/auth/test-api-key` | POST | 测试 API Key 有效性 |

### 16.2 作品相关
| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/novels` | GET | 获取作品列表 |
| `/api/novels` | POST | 创建作品 |
| `/api/novels` | DELETE | 删除作品 |
| `/api/novels/search` | GET | 搜索作品 |
| `/api/volumes` | GET/POST | 分卷管理 |
| `/api/chapters` | GET/POST/PUT/DELETE | 章节管理 |

### 16.3 设定相关
| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/settings` | GET/POST | 世界设定管理 |
| `/api/settings/types` | GET | 设定分类 |
| `/api/settings/models` | GET/POST | AI 模型配置 |
| `/api/settings/llm` | GET/POST | LLM 配置 |
| `/api/characters` | GET/POST/PUT/DELETE | 人物管理 |
| `/api/characters/relationships` | GET/POST | 人物关系管理 |
| `/api/styles` | GET/POST | 写作风格管理 |

### 16.4 AI 生成相关
| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/ai-generate` | POST | 创作向导主接口（按 step 参数分发：input/imitateSearch/imitate/idea/bookAnalysis/coreConflict/worldbuilding/powerSystem/characters/factions/relationships/synopsis/outline/keyPlots/chapters/content/cover/generateName/autoDesignProtagonist/typeDetail） |
| `/api/ai/generate` | POST | 旧版 AI 生成内容（兼容保留） |
| `/api/ai/continue` | POST | AI 续写 |
| `/api/ai/rewrite` | POST | AI 改写 |
| `/api/ai/final-check` | POST | 爆款终检 |
| `/api/ai/analyze-style` | POST | 风格分析 |
| `/api/ai/detect` | POST | 内容检测 |
| `/api/ai/benchmark` | POST | 模型基准测试 |
| `/api/ai-proxy` | POST | AI 代理（统一调用，封装多模型差异） |
| `/api/generate-cover` | POST | 独立封面生成（SVG 渐变背景 + 星光 + 题材装饰） |

### 16.5 拆书搜索相关（同人创作专用）
| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/book-search` | GET | 书籍关键词搜索（多源并发：知名小说库 > 百度百科 > 起点中文网 > 番茄小说 > 搜狗/360 > Firecrawl） |
| `/api/auto-book-analysis` | POST | 自动书籍分析（字段级加权投票 + 异常值检测 + 数据质量预过滤） |
| `/api/confirm-book` | POST | 用户确认拆书结果，注入同人创作上下文（fanfictionSource、fanfictionBookData） |

### 16.6 支付相关
| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/payments` | GET | 获取支付记录 |
| `/api/wechat/pay/qrcode` | POST | 生成微信支付二维码 |
| `/api/wechat/pay/check` | POST | 查询支付状态 |
| `/api/wechat/pay/callback` | POST | 微信支付回调 |

### 16.7 管理后台
| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/admin/stats` | GET | 数据统计 |
| `/api/admin/users` | GET/POST | 用户管理 |
| `/api/admin/payments` | GET/POST | 订单管理 |
| `/api/admin/config` | GET/POST | 系统配置 |
| `/api/admin/upload-cert` | POST | 上传支付证书 |

### 16.8 其他
| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/config/public` | GET | 公共配置（品牌 Logo 等） |
| `/api/config/payment` | GET | 支付配置（公开） |
| `/api/wechat/qrcode` | GET | 微信登录二维码 |
| `/api/wechat/check` | POST | 微信登录状态检查 |
| `/api/wechat/callback` | GET | 微信登录回调 |
| `/api/wechat/mock-login` | POST | 微信登录 Mock（开发环境） |
| `/api/wechat/pay-notify` | POST | 微信支付通知（备用回调） |
| `/api/ollama/models` | GET | 获取本地 Ollama 模型列表 |
| `/api/vip/check` | GET | 检查用户 VIP 状态 |

---

**文档结束**
