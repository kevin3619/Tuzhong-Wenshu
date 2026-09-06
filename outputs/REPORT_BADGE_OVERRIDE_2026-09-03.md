# 任务 #114 交付报告 — 角色徽章强制采用「用户详细设定钦定身份」

**日期**：2026-09-03（接续 #110/#111/#112/#113 批次）
**问题**：用户截图反馈"角色徽章取的是正史中的内容"（多尔衮→摄政王、李定国→延平王、郑成功→延平王、王太后→太皇太后…），期望徽章=用户在「详细设定输入区」括号内钦定的真实身份（满清睿亲王 / 大西军晋王 / 国姓爷 / 皇太后…）。
**根因**：`normalizeChar` 仅按 LLM 自动填的 `aliases` 首项 / `identity` 首段提取 title（chain ②/③/④），从未解析 `detailedDesignInput` 中用户钦定的「姓名(头衔)」映射。
**方案**（前端兜底，最快闭环；后端 prompt/schema 调整作为后续优化项推迟）：
- `ai-generate-wizard.tsx` 的 `normalizeCharactersData(data, detailedDesignInput?)` 新增第二参，调用内层 `_buildTitleOverrideFromUserDesign` 从详细设定文本中解析「姓名(头衔)」「姓名（头衔）」「姓名:身份」三种映射，构建 `_titleOverride` 字典（长名优先 + used-span 防短名命中长名内部 + 括号内多项身份取首段 + 虚词/说明性脏词拒收 + 2-16 字纯 CJK 校验）。
- `normalizeChar` 签名加 `titleOverride?`，title 提取优先级提升为 ① 用户钦定 → ② 显式 title → ③ aliases 首项 → ④ identity 首段剥前缀。
- 5 处 `normalizeCharactersData` 调用点全部串入 `detailedDesignInput`：L2596 主题快照恢复 / L2746 草稿重开 / L5258 生成 / L6988 重新生成（**本轮收尾**）/ L690 函数签名。
- `StepCharacters.tsx` 徽章（character.title）已在 #111 升级为可点击编辑态，无需再改 UI。

**改动文件**（单文件，~210 行新增/替换）：
- `src/tuzhong-wenshu/src/components/ai-generate-wizard.tsx`（normalizeCharactersData + normalizeChar + 5 处调用点）

**验证**：
| 验证 | 方法 | 结果 |
|------|------|------|
| 解析算法 | 直接抽取 TSX 源码 + `typescript.transpileModule` 求值，6/6 PASS（含括号单身份 / 全角括号多身份取首段 / 冒号映射+叙述性出现不误伤 / 旁注含"的"不误判 / 长名优先 / 混合分隔符换行名单）| ✅ |
| 端到端真渲 | Puppeteer + Edge 151 headless + JWT 注入 + `Storage.removeItem` 拦截 + 「AI全自动生成」挂载 wizard 恢复 characters 步 + 采集徽章文案 | **9/9 PASS** |
| 视觉证据 | 主角卡 + 配角卡 viewport 截图 | 见 `outputs/shots_20260903c/` |

**断言明细**（用户期望映射 vs 实渲徽章）：
| 姓名 | 用户钦定（设计输入） | LLM 正史（未覆盖前） | 实渲徽章 |
|------|--------------------|----------------------|----------|
| 多尔衮 | 满清睿亲王 | 摄政王 | **满清睿亲王** ✅ |
| 李定国 | 大西军晋王 | 延平王 | **大西军晋王** ✅ |
| 史可法 | 兵部尚书 | 东阁大学士 | **兵部尚书** ✅ |
| 郑成功 | 国姓爷 | 延平王 | **国姓爷** ✅ |
| 王太后 | 皇太后 | 太皇太后 | **皇太后** ✅ |
| 沐天波 | 黔国公 | 黔国公 | **黔国公** ✅ |
| 焦琏 | 新兴侯 | 将领 | **新兴侯** ✅ |
| 朱由榔 | 永历帝 | 皇帝 | **永历帝** ✅ |
| 吴三桂 | 满清平西王 | 平西王 | **满清平西王** ✅ |

**关键证据**（与用户截图一一对照）：
- 李定国：LLM aliases 「延平王，小尉迟」→ 旧徽章「延平王」；设计 「李定国(大西军晋王)」→ 新徽章「大西军晋王」✅（用户核心反馈场景）
- 郑成功：LLM aliases 「延平王，国姓爷」→ 旧徽章「延平王」；设计 「郑成功(国姓爷)」→ 新徽章「国姓爷」✅
- 王太后：LLM aliases 「太皇太后」→ 旧徽章「太皇太后」；设计 「王太后(皇太后)」→ 新徽章「皇太后」✅

**未触动 / 推迟项**（待后续迭代）：
- 后端 `route.ts` characters prompt / JSON schema 未加 `title/honorific` 键；后端仍依赖前端 normalizeChar 推导。前端兜底足以闭环；后端显式字段化可作为下轮优化（让 LLM 一次就吐出用户钦定身份，避免客户端再覆盖）。
- `address` 检查：后端 `_llmGenerateCast` 多个池生成（`userDesign` 已传入）——可在 prompt 显式追加"严格按 userDesign 姓名后的括号身份写入 character.title 字段"，进一步省去前端覆盖。
- `StepCharacters` 徽章已可点击编辑（#111 落地），与本次覆盖无冲突；用户保留手动微调权。

**交付物**：
- `outputs/REPORT_BADGE_OVERRIDE_2026-09-03.md`（本报告）
- `outputs/shots_20260903c/{a-protagonist-title,b-supporting-title}.png`（2 张真渲证据）
- `outputs/utitle_parser_check.cjs`（算法一致性单测，可保留复用）
- `outputs/e2e_title_badge_20260903.cjs`（端到端真渲脚本，可保留复用）

**类型检查**：`tsc --noEmit` 报 23 处错误均位于与本次改动无关的既有位置（`wizard.tsx` L3331/3458/6235/7979、`route.ts` L33725+/34010+、`dev-test-characters/page.tsx` L92、`StepPowerSystem.tsx` L211 等均为历史遗留）；本次改动区 L690-790 与 L6988 均零报错。

---

# 第二轮（后端对齐 · 2026-09-03 晚）—— 推迟项兑现

**目标**：让后端 characters 生成一次就输出用户钦定的 `title`（入库/持久化数据自洽，供后续大纲/正文等步骤直接消费，不再只靠前端渲染期覆盖）。

## 改动清单（`src/app/api/ai-generate/route.ts`，共 5 处）

| # | 位置（编辑后行号） | 改动 | 作用 |
|---|---|---|---|
| A | L25558 JSON 模板 | `{"name":"","title":"",...}` 在 name 后插入 `title` 键 | schema 层面要求每张角色卡携带 title |
| B | L25556 JSON 铁律新增 ⑤ | title 取值规则：仅「姓名（身份/头衔）」括号钦定时原样写入；其余一律空串；**严禁正史官职/百科/别名**（多尔衮禁「摄政王」、李定国禁「延平王」） | 防 LLM 把正史知识塞进 title |
| C | L25480 用户设定规则新增 6 | 「姓名(头衔)」→ title 原样照写铁律 + 反例 | 让 LLM 依据用户设定产 title |
| D | L25703-25704 并行单角色 | 字段清单加 `title` + 同规则（≤12 字、不受 40-60 字约束） | 并行每路同样约束 |
| E | L28030-28065 structuredResult 前 | 确定性回写块：以 `_userRosterR20`（parseUserCharacterList 确认的用户人物）为锚，从设计原文提取「姓名（头衔）」→ 覆盖 `char.title`（protagonist/femaleLeads/antagonists/supporting 全量） | **不依赖 LLM 自觉**的兜底，保证入库 title 与用户钦定一致 |

## 验证

1. **tsc --noEmit**：本快照基线 56 处历史遗留错误（`route.ts` L13444-34191、`wizard.tsx` L3331/3458/6235/7979、`page.tsx` TS2367 等既有区域）。**编辑区零新增报错**：route.ts 254xx-256xx / 2570x / 2803x-28065 无任何 error TS。
2. **单元测试** `outputs/utitle_backend_override_check.cjs`：从 route.ts 按锚点 brace-balance 抽取 E 块真实源码 + transpileModule 后执行 —— **8/8 PASS**：
   - 正向：朱由榔→永历帝 / 多尔衮→满清睿亲王（不写摄政王）/ 郑成功→国姓爷（顿号取首段）/ 王太后→皇太后 / 吴三桂→满清平西王 / 焦琏→新兴侯
   - 负向：无括号人物（沐天波）不进 map、不覆盖 LLM title；脏词开头（李定国（别名…））按 badword 拒绝
3. **语义一致性**：后端 title = 前端 titleOverride 同源同义（皆取「姓名后首括号段」）；前端渲染仍以 titleOverride 优先，双保险不冲突。
4. **真实 42 人样本零回归**：`scripts/probe_roster_parse.cjs`（真实《永历中兴》人物设定 sample-yongli-roster.txt）在本次编辑后重跑：解析 44 人、分组与历史基线一致（主角1/朋友26/反派16/配角1）——5 处编辑未影响解析器。
5. **真实风格集成验证** `outputs/integ_backend_roster_title_20260903.cjs`（裸【】技能卡 + 汇总表 + 编号行 + 括号钦定行混合）：串跑 parseUserCharacterDesign → parseUserCharacterList → 回写块 E —— **9/9 PASS**；关键正信号：多尔衮技能卡标题「摄政王」（正史词）被括号钦定「多尔衮（满清睿亲王）」确定性胜出 → title=满清睿亲王；无括号人物（吴三桂/沐天波/焦琏）title 保持空、零污染。

## 尚未执行（需用户确认）
- **真实 LLM 联调**：需本地 Next 服务 + provider key 走一次 characters 分批生成，看各批 JSON 是否带 title（约 40-90s/次、耗 token、会写状态）——默认不做，留给线上验证。
- **线上部署**：本改动尚未部署至 175.27.244.202。如需上线：`_deploy.sh` 流程 + PM2 reload 后再用真实《永历中兴》设定复测徽章。

## 交付物（本轮新增）
- `outputs/utitle_backend_override_check.cjs`（E 块单测，可复用）
- 本报告「第二轮」段
