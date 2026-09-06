# 途中文枢（tuzhong-wenshu）项目长期记忆

## 环境与部署
- 生产域 https://tuzhongwang.xyz（服务器 175.27.244.202:/root/tuzhong-wenshu，PM2 运行）。
- 部署链路：本地改 `src/tuzhong-wenshu/src/components/*` → `upload-b64.cjs` 上传 → 远程 `rm -rf .next && npm run build`（~72s）→ `pm2 restart`。构建成功后远程 `.next/static/chunks/` 内 grep 特征串确认新产物。
- 线上 UI 真渲验证用 puppeteer 手动拉起 msedge headless + CDP；登录用伪造 JWT（HMAC secret 存 `outputs/jwt-secret.txt`）。注入草稿路径：AI全自动生成 → 草稿箱 → 草稿行内「打开」→ 等 h4【角色】出现。

## UI 结构（测试探针必须知道）
- 角色卡 4-Tab：基础设定/进阶设定/属性面板/深度设定，默认 `activeTab='basic'`。
  - ⚡ 角色矛盾点/反差感（contradiction）在**深度设定** Tab（bg-amber-50/50 区块）——默认不渲染，提取前须逐卡点击「深度设定」。
  - 徽章↔角色定位联动、年龄段位等在常驻头部（isExpanded=true）。
- `normalizeCharactersData` 会把不合法女主（如男性历史人物）降级配角，再从 femaleLeads[0] 扶正——**UI 女主卡数据源是 femaleLeads[0]，不是 femaleLead**；测试 corrupt 需同步破坏 femaleLeads[0]。
- textarea 的值不在 innerText 中，字符级断言必须取 ta.value。

## 已知产品逻辑/坑
- `_repairTruncation`（ai-generate-wizard.tsx）修复残句门槛已放宽为 `_m[1].trim().length >= 3`（旧 >=10 拒修 6 字前缀短残句，如「表面外柔内刚…」）。禁止回退门槛。

## 截图规范
- **禁用 fullPage:true**：会滚动跳回 Dashboard（截图与首页重复、体积恒定 ~61,909B）。一律 viewport（fullPage:false）+ scrollIntoView 定位。
- 截图与数据提取须在全页滚动**之前**完成，避免 React 回收树导致 NO_KEY。

## 角色徽章 title 优先级（2026-09-03 #114 落地）
- 顺序：①用户在「详细设定输入区」括号/冒号内钦定身份（如「多尔衮(满清睿亲王)」） → ②后端显式 `title/honorific` → ③`aliases` 首项纯 CJK 2-10 字 → ④`identity` 首段剥阵营前缀纯 CJK 2-12 字。LLM 按正史自由填的 aliases（如李定国「延平王」）会被用户钦定覆盖。
- 解析器实现于 `ai-generate-wizard.tsx` `_buildTitleOverrideFromUserDesign`：长名优先 + used-span 防短名命中长名内部 + 括号内多项取首段 + 虚词/脏词拒收 + 2-16 字纯 CJK。5 处调用点全部串入 `detailedDesignInput`（L690 签名 / L2596 主题快照恢复 / L2746 草稿重开 / L5258 生成 / L6988 重新生成）。
- 测试脚本：`outputs/utitle_parser_check.cjs`（算法单测，brace-balance 抽取 TSX 函数源码 + transpileModule 求值）+ `outputs/e2e_title_badge_20260903.cjs`（Puppeteer 端到端，含 JWT 自签、Storage.removeItem 拦截、点 AI全自动生成挂载 wizard）。
- 后端对齐（同日晚）：`route.ts` characters 步 JSON 模板/铁律/并行指令均加 `title`（禁正史头衔）；另有确定性回写块（structuredResult 前，以 `_userRosterR20` 为锚提取「姓名（头衔）」覆盖入库 title）。前端渲染仍以 titleOverride 优先，双保险。

## 草稿创建幂等锁（2026-09-03 #125 R4 落地）
- `ai-generate-wizard.tsx` 模块顶部 `_draftCreateInflight: Promise<string>|null` 提升至**模块作用域**（非组件内 IIFE），保证 React 多次渲染/并发 effect 触发下 `ensureDraftNovel` 仍串行只 POST 一次。
- 配套：`persistDraftProgress` 重新调用 `ensureDraftNovel` 当 `_id==='temp'||_id.startsWith('draft-')`；自动 id effect 在存在标题/主题内容时 fire-and-forget。
- 验证：`outputs/e2e_online_draft125_20260903.cjs`（4/4 PASS：双触发下服务端恰好 1 条 drafting + 书架草稿箱 UI 显示「未完成(可续生成)」+ 继续生成按钮）；干净基线（drafting=0）下复测必为恰好 1 条。

## 跨题材漂移清洗词典（2026-09-03 #126/#127 R7 落地）
- `_historyCrossReplacementsBase`（route.ts:3954）累加：修真境界词→朝代化（举人/进士/大夫）、宗门→门阀、灵山福地→名山大川、散修→游方道士、洞天与皇朝并行→朝堂与江湖并行、灵山福地垄断修行资源→名山大川垄断士子礼乐教化、**道侣→恋人**（R7，恋人同属关系 35 枚举合法值，30581/30642 行本就合并处理）。R7 同时在字典尾部追加 #127 补全（炼器/法器/法阵/炼丹/灵鼎→兵器/器具/阵图/合药/药鼎等）。
- 词典生效范围：globalClean 在每个 step 末尾对 result 递归清洗（`#127-R7` 影响 characters 文本字段 + relationships 枚举值，但道侣→恋人无枚举破坏）。DRIFT_WORDS（test 端）+ 历史词典（生产端）双层保险。

## parseUserCharacterList 分组排序（2026-09-03 #127 R5/R6 落地）
- 分组顺序改为 `villain → protagonist → femaleLead → friend`（femaleLead 提前到 ally 前），防止 `RE_ALLY`（忠于永历/女官）抢先匹配掉女主。
- 新增 `fm2` 冒号式核心字段行解析（`^(功能标签|忠诚等级|官职|...)[:：]...(.{1,80})$`），与原本 Markdown 表格行并存。覆盖用户输入「功能标签：女主、帝党谋主、执掌密档」这种自然书写。

## 本地复测脚本直连线上踩坑（2026-09-03 #127 R7 收尾）
- 本沙箱设了 `HTTP(S)_PROXY=127.0.0.1:55778` 但 `node https.request`/`undici fetch` 默认不读 env proxy；pm2 restart 启动后 2-4 分钟内 node 直连公网 443 出现"8 秒假 REQ_TIMEOUT"（TCP 被黑洞 ~8s 后触发 setTimeout 回调；curl 通过 env proxy 正常但慢 7s）。**线上 LLM 复测统一改为服务器本机跑**：把脚本 `node _upload_route.cjs` 上传到 `/tmp/`（先 `ssh touch` 让 upload 助手的 cp-f 备份链不炸），ssh-helper `nohup ... < /dev/null > log 2>&1 &` 后台拉起，`ssh-helper tail /tmp/xxx.log` 轮询。
- 3001 端口虽是 TLS（cert 无 127.0.0.1 altname），**公网 URL 更稳**（cert CN 匹配）。脚本加 `process.env.RETEST_BASE` 覆盖默认，默认行为不变。
- 复测脚本：`outputs/retest_online_126_127_20260903.cjs`（A=worldbuilding、B=characters，B 走 3 批协议 core/sup/sup 模拟前端 charBatch），最终 R7 跑出 **A 9/9 + B 16/16 全 PASS**。
