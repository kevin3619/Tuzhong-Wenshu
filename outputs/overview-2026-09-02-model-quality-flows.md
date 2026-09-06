# 2026-09-02 世界观 / 金手指换模型 + 密码还原 — 交付报告

## 三项请求全部闭环

### 1. 管理员密码还原（Task #50 ✅）
- kevin 密码从真渲临时值 **kevin123 → 还原 leiyang0**（bcrypt round 12 重哈希）。
- 本地 + 线上双重实测登录：`kevin/leiyang0` → code 200，isAdmin=true，subscriptionTier=lifetime。
- 数据库备份：`prisma/tuzhong.db.bak_20260901_kevin_pwd`（本地）。

### 2. 世界观设定（worldbuilding）换模型 + 字段原创
- **根因**：glm-4-flash 指令遵从度低，把输入原文/详细设定**截取照抄**进字段值。
- **改动**：
  - 权威表 `_STEP_MODEL_MAP`：worldbuilding `glm-4-flash → glm-4.7-flash`（~15.9s，免费池指令遵从最强）。
  - `wbPrompt` 开头注入「**字段原创设计铁律**」（4 条）：每个字段基于设定重新原创设计 / ≥10 字连续相同即判定截取 / 输入锚点贯穿但描述原创扩写 / 名称可沿用但描述必须新写。
- **真测**（历史权谋题材《山河经略》）：era 173 字（含时间线/权力博弈）、geography 165 字（含具体地点）、powerSystem 1063 字（明朝官制体系）、socialStructure 200 字（含层级占比数据）——**全部原创扩写，无截取痕迹**。

### 3. 金手指设定（powerSystem）换模型 + 按作品类型多选流派设计
- **根因**：前端「作品类型（可多选）」用逗号拼接存 genre（如 `玄幻,系统流,签到流`），但 `detectGenre` 只判主题材（玄幻/仙侠/历史…），**不识别流派标签** → 金手指被做成通用"神秘传承/血脉觉醒"。
- **改动**：
  - 权威表：powerSystem `glm-4-flash → glm-4.7-flash`。
  - powerSystem case 注入「**作品类型流派锚定铁律**」：按逗号拆分 genre 提取流派标签（系统流/签到流/面板流/任务流/无限流/诸天流/打卡流/抽奖流/万界流），非历史题材时强制金手指按所选流派机制原创设计；多流派须有融合逻辑；**历史/权谋题材（isNoSystemGenre）不注入**，遵守禁词铁律。
- **真测 1**（玄幻+系统流+签到流+面板流）：`type=系统类`、`name=星海签到面板`、核心功能「每日签到/属性面板/任务发布」、签到 7 天解锁抽奖 / 30 天暴走、来源有逻辑（星海意志激活）——**流派锚定生效**。
- **真测 2 对照组**（纯仙侠无流派标签）：`type=血脉类/龙渊血脉`，保持原有设计——**不误伤普通题材**。
- **线上复测**（部署后）：`type=系统类`、`name=星海战神面板`、coreFunctions 含「签到功能/属性面板/任务系统/兑换商店」——四流派全覆盖，线上生效确认。

## 三表同步（展示一致性）
| 表 | 位置 | worldbuilding | powerSystem |
|---|---|---|---|
| 权威表 | route.ts `_STEP_MODEL_MAP` | glm-4.7-flash ✅ | glm-4.7-flash ✅ |
| 配置表 | step-model-config.ts（QUALITY_FIRST/COST_FIRST） | ZP_47F（原已） | ZP_4F → **ZP_47F** ✅ |
| 前端展示 | ai-generate-wizard.tsx `_STEP_MODEL_MAP_FRONTEND` | glm-4.4 → **glm-4.7-flash** ✅ | glm-4-flash → **glm-4.7-flash** ✅ |

> ⚠️ 权威表仍是 route.ts `_STEP_MODEL_MAP`（决定真实调用）；后两表仅 UI 推荐名展示，已同步保持一致。

## 质量验证
- `tsc --noEmit`：41 个错误**全部为历史遗留**（位于改动区之外，如 L16934/19784/2586 等；本项目 `next.config.ts` 已设 `ignoreBuildErrors:true`），本次改动**零新增类型错误**。
- 本地 dev :3001 三轮真测 + 线上复测全部通过。

## 部署记录
- 服务器备份：`/root/tuzhong-wenshu/_bak_20260902/`（route.ts / step-model-config.ts / ai-generate-wizard.tsx）。
- 上传三文件，MD5 三方一致；`npx next build` BUILD_RC=0；PM2 重启 online（新 PID）。

## 后续建议
- 用户侧验收：在向导「作品类型」勾选系统流/签到流等 → 金手指设定应产出对应机制；若仍不满意可继续微调流派描述措辞。
- 若需整体提速，可评估 characters/content 是否回退 glm-4-flash（当前均为 glm-4.7-flash，单步 ~15.9s）。
