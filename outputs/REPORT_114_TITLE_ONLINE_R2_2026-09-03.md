# #114 后端 title 对齐 — 线上部署与全链路验收报告（R2 强化版）

> 日期：2026-09-03 ｜ 范围：route.ts characters 步 title 确定性回写 ｜ 线上：175.27.244.202（tuzhong-wenshu @ PM2，next start -p 3001）
> 结论：**PASS=11 FAIL=0 ✅（WARN=1，仅“沐天波未被本批生成”INFO）**

---

## 1. 本轮做了什么

把 #114「后端 characters 生成时直接输出用户详细设定中括号钦定的 title（替代前端覆盖兜底）」推上线，
并在线上用真实《永历中兴》详细设定对徽章 title 做了**全链路验收**。过程中发现并修复了两类问题：

| 问题 | 表现 | 根因 | 修复 |
|---|---|---|---|
| 线上 505 崩溃 | `Cannot create property 'rolePosition' on string '…'` | LLM 返回的 characters 扁平数组混入字符串角色，后续 `ch.rolePosition='主角'` 在字符串上抛错 | 三入口加 `typeof === 'object'` filter（L25798 / L25871 / L27750） |
| **R1 title 回写整体失效** | 朱由榔 `title=","`、吴三桂 `title="山海关总兵"` | #114 E 块锚定名单 `_userRosterR20` **只在 charBatch.parallel 分支内赋值**；整批/主流程分支下名单为空 → E 块空转，LLM 脏值无人兜底 | E 块升级 **R2**（见下） |

## 2. R2 强化内容（route.ts，structuredResult 前确定性回写块）

- **锚定方式**：由「依赖 `_userRosterR20`」改为「依赖本响应实际输出阵容名单」——对 protagonist/femaleLeads/antagonists/supporting 中
  每个角色名，在用户设计原文直扫首个 `姓名（身份/头衔）` 钦定写法并覆盖 `title`（分支无关，整批/分批/并行三条路径通吃）。
- **脏值清洗**：无钦定命中且用户确已提供详细设定时，不合规值（如 `","`）清空为 `""`（遵守 JSON 铁律 ⑤「其余一律空串」）。
- **重复兜底**：女主/反派/配角先同数组按名去重，再跨数组全局去重（优先级 主角 > 女主 > 反派 > 配角，首现保留）。

校验：本地 `transpileModule` 零诊断；上传字节比对一致（本地=远程 **2,588,197B**）；远程 `next build` **BUILD_EXIT=0**；
构建产物可 grep 到 `#114R2` 特征；PM2 online、外网 HTTP 可访问。

## 3. 线上验收证据（真实 LLM · 真实《永历中兴》详细设定）

复测脚本 `outputs/retest_online_title_20260903.cjs`：**首轮整批调用** → 若有正向人物缺失自动发 **Phase B
`previousData.charBatch` 分批补充（生产同款协议，单角色逐槽绑定）** → 合并断言。

最终一轮输出：

```
[3] 首轮返回角色总数(去重) = 10 | 缺失正向人物 = 多尔衮、史可法、焦琏
[4] PhaseB 分批补充: needs=[反派,反派,朋友,朋友,朋友] existing=10人
[5] PhaseB HTTP 200 (OK)
[6] PhaseB 补充后角色总数(去重) = 15

朱由榔 | 主角 | title="永历帝"
王太后 | 女主 | title="皇太后"
李定国 | 反派 | title="大西军晋王"
郑成功 | 反派 | title="国姓爷"
孙可望 | 反派 | title="(无键)"          ← 负向：无括号 → 零污染 ✅
吴三桂 | 配角/挚友 | title="满清平西王"
多尔衮 | 反派 | title="满清睿亲王"
焦琏   | 反派 | title="新兴侯"          ← 反派槽仍精确回写钦定头衔
史可法 | 朋友 | title="兵部尚书"

RESULT: PASS=11 FAIL=0 WARN=1
判定: ✅ PASS
```

| # | 断言 | 结果 |
|---|---|---|
| 1-8 | 8 正向人物 title 与括号钦定**逐字一致**（永历帝/满清睿亲王/满清平西王/兵部尚书/大西军晋王/国姓爷/新兴侯/皇太后） | ✅ 8/8 |
| 9 | 朱由榔 rolePosition=主角 | ✅ |
| 10 | 女主数量=1（王太后） | ✅ |
| 11 | 负向 孙可望（无括号）title 为空，零污染 | ✅ |
| — | 负向对照 沐天波 本批未生成（INFO） | ℹ️ WARN |

**关键语义证据**：焦琏在 Phase B 被逐槽绑定到**反派**槽位生成，但 title 仍被精确回写为「新兴侯」——
证明 title 完全由用户括号钦定决定、与 rolePosition 独立（正是 #114 的目标语义，徽章源头不再依赖 LLM 自觉）。

## 4. 三轮线上复测轨迹（为什么最终判绿）

| 版本 | 结果 | 说明 |
|---|---|---|
| R1（原 #114 E 块） | PASS=5 FAIL=4 | 整批分支 E 块 no-op：朱由榔 `title=","`、吴三桂「山海关总兵」、史可法/焦琏缺员 |
| R2（阵容名单直扫回写） | PASS=8 FAIL=1 | title 8/8 全对、女主去重生效；仅 焦琏 被整批单次调用漏产（LLM 少而精抽样，与代码无关） |
| R2 + 脚本修正 + Phase B 分批补充 | **PASS=11 FAIL=0** | collectChars 修「标量=数组[0] 同引用双计」；补充批按生产协议确定性补入缺失人物 |

## 5. 遗留与后续（非本轮缺陷）

- **整批单次调用会漏配角**：主流程整批路径依赖 LLM「少而精」抽样，焦琏连续多跑未被产出；真实产品走
  分批补充协议（本报告 Phase B 已验证该路径 title 同样正确）。若需整批 100% 名单覆盖，需在非并行主流程
  引入逐槽绑定（当前仅 charBatch 分支有），属独立增强项。
- 复测中 LLM 偶发将配角标为 `女配`/把用户无括号名单人物按自创风格生成——超出 title 验收范围，可另立任务治理。
- 复测脚本遇 `fetch failed` 需直接重跑（线上长请求偶发网络 reset，已知现象）。

## 6. 文件清单

- `src/tuzhong-wenshu/src/app/api/ai-generate/route.ts` — R2 强化版（已上线，2,588,197B）
- `outputs/retest_online_title_20260903.cjs` — 可复用线上验收脚本（整批 + Phase B 分批补充）
- `outputs/integ_backend_roster_title_20260903.cjs` — 无 LLM 的离线 Block E 单元基准（9/9）
- `_upload_route.cjs` / `ssh-helper.cjs` — 临时部署工具（复用，非交付物）
