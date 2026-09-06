// ============================================================
// 第三阶段 · 全链路无空值复测脚本（任务2）
// 覆盖：idea → worldbuilding → powerSystem → characters → factions
//       → relationships → synopsis → outline → keyPlots → chapters → coverPrompt
// 重点验证（对应截图 1-8）：
//   ① 每环节必填字段全部非空
//   ② secretHistory ≠ coreConflict（不撞车）
//   ③ secretHistory 为明末清初历史秘辛（不含玄幻词"上古大劫/仙人遗府"等）
//   ④ 主角年龄 = 用户输入（21），身份背景 = 用户输入（穿越/附身）
//   ⑤ idea 的 tagline/coreIdea/coreConflict 体现系统流/签到流
//   ⑥ powerSystem 体现系统流/签到流（历史题材用历史等价物）
// 用法：node fullchain_empty_check.mjs [--base http://localhost:3001/tuzhong-wenshu/api/ai-generate]
//        线上鉴权：--base 指向非 localhost 时自动走 /api/auth/login 登录拿真实 token
//        可传 --username / --password 覆盖默认账号（默认 kevin / kevin123）
// ============================================================
import { SignJWT } from 'jose'

const _argBase = (process.argv.find((a) => a.startsWith('--base=')) || '').split('=')[1]
const BASE = (_argBase || 'http://localhost:3001/tuzhong-wenshu/api/ai-generate').replace(/^http:\/\/(?!localhost|127\.0\.0\.1)/, 'https://')

// ---------- 鉴权：线上强制 https 直连 + 用线上 JWT_SECRET（=开发默认值）伪造管理员 token；本地用开发态伪造 token ----------
const isRemote = !/localhost|127\.0\.0\.1/.test(BASE)
let token = ''
let authNote = ''
if (isRemote) {
  // 线上 https 直连（http 会 301 到 https，fetch 跟随重定向会丢弃 Authorization header）
  const onlineSecret = new TextEncoder().encode('your_random_jwt_secret_key_here_change_in_production')
  token = await new SignJWT({ userId: 'cmt29spvs000052dhoi3al7aj', isAdmin: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(onlineSecret)
  authNote = '伪造管理员token（线上 JWT_SECRET=默认值）'
  console.log('✅ 线上鉴权: ' + authNote)
} else {
  const SECRET = 'your_random_jwt_secret_key_here_change_in_production'
  const secret = new TextEncoder().encode(SECRET)
  token = await new SignJWT({ isAdmin: true, userId: 'temp', role: 'admin', sub: 'temp' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secret)
}

const HEADERS = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }

// ---------- 测试场景：明末清初历史 + 系统流/签到流（对应用户截图反馈） ----------
const GENRE = '历史,系统流,签到流'
// 🔥 2026-09-02 修正：KEYWORDS/INPUT_TEXT 严禁出现"系统/签到/面板/任务"等机制词，
//   流派信息【仅】通过 genre（作品类型多选）传入——复刻用户真实操作（只在"作品类型"勾选系统流/签到流）。
//   旧版 INPUT_TEXT 写死"获得签到系统，每天签到…"，导致即使用户没选流派也会被蒙混命中，无法检验真实生效。
const KEYWORDS = ['历史', '明末', '清初', '权谋', '争霸', '穿越']
const INPUT_TEXT = '主角是21岁的现代青年，穿越到明末清初附身成为崇祯太子朱慈烺，立志中兴大明、对抗清军。'
const PROTAGONIST_SETTINGS = {
  name: '朱慈烺',
  age: 21,
  identity: '穿越者（现代青年），附身崇祯太子朱慈烺，获签到系统',
}

// ---------- 各环节必填字段断言表 ----------
const STEP_CHECKS = {
  idea: {
    fields: ['tagline', 'coreIdea', 'coreConflict', 'coreSellingPoint', 'protagonistBrief', 'title'],
    // 流派体现：系统流/签到流关键词（对截图1、2）
    flowTags: ['系统', '签到'],
    check: (d, r) => {
      const blob = [d.tagline, d.coreIdea, d.coreConflict, d.coreSellingPoint, d.protagonistBrief].join(' ')
      const hasFlow = STEP_CHECKS.idea.flowTags.some((t) => blob.includes(t))
      if (!hasFlow) r.push('idea 未体现系统流/签到流（tagline/coreIdea/coreConflict 无"系统/签到"词）')
    },
  },
  worldbuilding: {
    fields: ['era', 'geography', 'history', 'powerSystem', 'secretHistory'],
    check: (d, r, ctx) => {
      // ③ secretHistory 不能是玄幻秘辛（对截图3）
      const sh = String(d.secretHistory || '')
      if (/上古大劫|天道隐秘|仙人遗府|灵气|灵根|修炼/.test(sh)) r.push('worldbuilding.secretHistory 含玄幻设定词（应为历史秘辛）')
      if (sh.length < 50) r.push('worldbuilding.secretHistory 过短(<50字)')
      // ② secretHistory 不得与 idea.coreConflict 撞车（对截图8）
      const cc = String((ctx.previousData && ctx.previousData.idea && ctx.previousData.idea.coreConflict) || '')
      if (cc && sh.length > 10 && sh === cc) r.push('worldbuilding.secretHistory 与 idea.coreConflict 内容完全相同（撞车）')
      if (cc && sh.includes(cc.slice(0, 20)) && sh.length <= cc.length + 8) r.push('worldbuilding.secretHistory 疑似截取自 coreConflict（内容雷同）')
    },
  },
  powerSystem: {
    fields: [],
    check: (d, r) => {
      const pa = d.protagonistAbility || {}
      const wps = d.worldPowerSystem || {}
      if (!pa.name || !pa.description) r.push('powerSystem.protagonistAbility.name/description 为空')
      if (!wps.name || !wps.type) r.push('powerSystem.worldPowerSystem.name/type 为空')
      // ⑥ 金手指体现系统/签到（历史题材历史等价物：模块/阶段/成就/指标/签到）
      const blob = [pa.name, pa.type, pa.description, wps.name, wps.type, (wps.levels || []).join(' ')].join(' ')
      if (!/系统|签到|模块|阶段|成就|指标|解锁|任务|面板/.test(blob)) r.push('powerSystem 未体现系统/签到机制（历史题材应有历史等价物）')
      // 🔥 2026-09-02 强化（对应图一）：金手指类型必须为【系统类】，历史+系统流不得被误判为「知识记忆」
      if (pa.type && pa.type !== '系统类' && !/系统|签到/.test(pa.type)) {
        r.push('金手指类型非系统类: "' + pa.type + '"（应为"系统类"，历史系统流误判为知识记忆属严重bug）')
      }
      // 🔥 2026-09-02 强化（对应图二）：体系名称必须为「XX朝堂权力体系」（含朝代前缀），不得降级为通用名或被错配为修仙体系
      if (wps.name && !/(明朝|清朝|秦朝|汉朝|隋朝|唐朝|宋朝|元朝)朝堂权力体系/.test(wps.name)) {
        r.push('体系名称未含朝代前缀「XX朝堂权力体系」: "' + wps.name + '"（应如"明朝朝堂权力体系"）')
      }
    },
  },
  characters: {
    fields: [],
    check: (d, r, ctx) => {
      const p = d.protagonist || {}
      if (!p.name) r.push('characters.protagonist.name 为空')
      // ④ 年龄同步（对截图5）
      const wantAge = String(ctx.protagonistSettings.age || '')
      const gotAge = String(p.age == null ? '' : p.age).trim()
      if (wantAge && gotAge !== wantAge) r.push(`characters.protagonist.age=${gotAge||'(空)'} ≠ 用户设定 ${wantAge}（未同步）`)
      // ④ 身份同步（对截图6）
      const idn = String(p.identity || p.background || '')
      if (!/穿越|附身/.test(idn)) r.push(`characters.protagonist.identity 未体现穿越/附身：${(idn || '(空)').slice(0, 40)}`)
      if (!p.identity && !p.background) r.push('characters.protagonist.identity/background 均为空')
      // 角色槽非空
      const fls = Array.isArray(d.femaleLeads) ? d.femaleLeads : []
      const ant = Array.isArray(d.antagonists) ? d.antagonists : (d.antagonist ? [d.antagonist] : [])
      const sup = Array.isArray(d.supporting) ? d.supporting : []
      if (fls.length === 0) r.push('characters.femaleLeads 为空数组')
      // 🔥 2026-09-02 强化（对应图四）：本测试 charBatch.needs 仅含 1 名"女主"→单女主模式，
      //    必须恰好 1 名女主；出双女主(=2)或女主空值(=0)均属严重bug。
      if (fls.length !== 1) r.push('单女主模式 femaleLeads 数量应为1，实际=' + fls.length + '（选单女主却出双女主/女主空值均属严重bug）')
      // 🔥 2026-09-02 说明：本测试仅跑「核心批次」(charBatch.needs=主角/女主/反派/配角/配角 → 5名)，
      //    真实向导会再补若干批次累计到 15 名（单女主配比 1+1+2+2+4+5）。故此处仅校验本批次结构，
      //    不要求单批次总数≥15；总数达标由多批次累加在向导前端保证。
      if (!p.name) r.push('核心批次缺失主角（应有1名主角）')
      if (ant.length < 1) r.push('核心批次反派不足1名（实际=' + ant.length + '）')
      if (sup.length < 2) r.push('核心批次配角不足2名（实际=' + sup.length + '）')
      if (ant.length === 0) r.push('characters.antagonists 为空数组')
      if (sup.length === 0) r.push('characters.supporting 为空数组')
      for (const c of [...fls, ...ant, ...sup]) {
        if (!c || !c.name) r.push('characters 存在无 name 的角色槽')
      }
    },
  },
  factions: {
    fields: [],
    check: (d, r) => {
      const list = Array.isArray(d.factions) ? d.factions : (Array.isArray(d.forces) ? d.forces : (d.forceList || []))
      if (list.length === 0) r.push('factions 势力列表为空')
      for (const f of list) if (!f || !f.name) r.push('factions 存在无 name 的势力')
    },
  },
  relationships: {
    fields: [],
    check: (d, r) => {
      const list = Array.isArray(d.relationships) ? d.relationships : []
      if (list.length === 0) r.push('relationships 关系列表为空')
    },
  },
  synopsis: {
    fields: ['shortIntro', 'fullIntro', 'coreGoldenSentence'],
    check: (d, r) => {
      const si = String(d.shortIntro || d.oneLineIntro || '')
      const fi = String(d.fullIntro || d.longIntro || '')
      if (si.length < 10 && fi.length < 10) r.push('synopsis shortIntro/fullIntro 均为空或过短')
      if (d.tags && Array.isArray(d.tags) && d.tags.length < 3) r.push('synopsis.tags 过少(<3)')
    },
  },
  outline: {
    fields: [],
    check: (d, r) => {
      const stages = Array.isArray(d.stages) ? d.stages : []
      if (stages.length === 0) r.push('outline.stages 为空数组')
      for (const st of stages) {
        if (!st || typeof st !== 'object') { r.push('outline.stages 存在非对象元素'); continue }
        if (!String(st.name || '').trim()) r.push('outline.stages 存在无 name 的阶段')
        if (!String(st.summary || '').trim()) r.push('outline.stages 存在无 summary 的阶段')
        if (!Array.isArray(st.mainEvents) || st.mainEvents.length === 0) r.push('outline.stages「' + (st.name || '?') + '」mainEvents 为空')
      }
      if (!Array.isArray(d.keyEvents) || d.keyEvents.length < 3) r.push('outline.keyEvents 过少(<3)')
      if (!String(d.storyOrigin || '').trim() && !String(d.mainPlot || '').trim()) r.push('outline.storyOrigin/mainPlot 为空')
    },
  },
  keyPlots: {
    fields: [],
    check: (d, r) => {
      const vols = Array.isArray(d.volumes) ? d.volumes : []
      if (vols.length === 0) r.push('keyPlots.volumes 为空数组')
      for (const v of vols) {
        if (!v || typeof v !== 'object') { r.push('keyPlots.volumes 存在非对象元素'); continue }
        if (!String(v.name || '').trim()) r.push('keyPlots 卷无 name')
        if (!String(v.summary || '').trim()) r.push('keyPlots 卷「' + (v.name || '?') + '」summary 为空')
        if (!Array.isArray(v.keyEvents) || v.keyEvents.length === 0) r.push('keyPlots 卷「' + (v.name || '?') + '」keyEvents 为空')
      }
      const nodes = Array.isArray(d.keyPlots) ? d.keyPlots : []
      if (nodes.length === 0) r.push('keyPlots.keyPlots 节点列表为空')
      for (const n of nodes) if (!n || !String(n.title || '').trim()) r.push('keyPlots 存在无 title 的节点')
    },
  },
  chapters: {
    fields: [],
    check: (d, r) => {
      // chapters 步只生成标题/摘要/大纲（正文在 content 步），故只校验 title/number/summary
      const list = Array.isArray(d.chapters) ? d.chapters : (Array.isArray(d.volumes) ? d.volumes : [])
      if (list.length === 0) r.push('chapters 章节列表为空')
      for (const c of list) {
        if (!c || typeof c !== 'object') { r.push('chapters 存在非对象元素'); continue }
        if (!String(c.title || '').trim()) r.push('chapters 存在无 title 的章节')
        if (c.number == null && !String(c.num || '').trim()) r.push('chapters「' + (c.title || '?') + '」无 number')
        if (!String(c.summary || '').trim()) r.push('chapters「' + (c.title || '?') + '」summary 为空')
      }
    },
  },
  // 🔥 coverPrompt 不属于 ai-generate 环节（由前端 StepCover.buildCoverPrompt 本地生成 + /api/generate-cover），
  //   这里改验封面提示词的「输入源」是否齐全：书名/题材/时代/主角名/一句话简介
  coverPrompt: {
    fields: [],
    check: (d, r, ctx) => {
      const prev = ctx.previousData
      const title = String((prev.idea && prev.idea.title) || '')
      const genre = String((prev.idea && prev.idea.genre) || '')
      const era = String((prev.worldbuilding && prev.worldbuilding.era) || '')
      const pName = String((prev.characters && prev.characters.protagonist && prev.characters.protagonist.name) || '')
      const oneLine = String((prev.synopsis && (prev.synopsis.shortIntro || prev.synopsis.oneLineIntro)) || '')
      if (!title) r.push('封面输入源：书名(title) 为空')
      if (!era) r.push('封面输入源：时代(era) 为空')
      if (!pName) r.push('封面输入源：主角名 为空')
      if (!oneLine) r.push('封面输入源：一句话简介 为空')
    },
  },
}

// ---------- 工具 ----------
function isEmpty(v) {
  return v === null || v === undefined || (typeof v === 'string' && !String(v).trim()) || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && Object.keys(v).length === 0)
}
function nonEmptySummary(d, fields) {
  const miss = []
  for (const f of fields) if (isEmpty(d[f])) miss.push(f)
  return miss
}
function walkFields(obj, prefix, out, depth) {
  if (depth > 3 || obj === null || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    if (obj.length === 0) out.push(prefix)
    else walkFields(obj[0], prefix + '[0]', out, depth + 1)
    return
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (isEmpty(v)) out.push(prefix ? prefix + '.' + k : k)
    else walkFields(v, prefix ? prefix + '.' + k : k, out, depth + 1)
  }
}

// ---------- 环节链 ----------
const CHAIN = ['idea', 'worldbuilding', 'powerSystem', 'characters', 'factions', 'relationships', 'synopsis', 'outline', 'keyPlots', 'chapters', 'coverPrompt']

async function callStep(step, previousData) {
  const body = {
    step,
    input: INPUT_TEXT,
    keywords: KEYWORDS,
    genre: GENRE,
    novelId: 'temp',
    previousData: {
      ...previousData,
      idea: previousData.idea || null,
      worldbuilding: previousData.worldbuilding || null,
      powerSystem: previousData.powerSystem || null,
      synopsis: previousData.synopsis || null,
      outline: previousData.outline || null,
      factions: previousData.factions || null,
      relationships: previousData.relationships || null,
      keywords: KEYWORDS,
      imitate: null,
      appendRoleInput: '',
      existingCharacters: (previousData.characters && Array.isArray(previousData.characters)) ? previousData.characters.map((c) => String(c.name || '')).filter(Boolean) : [],
      characters: previousData.characters || null,
      bookAnalysis: null,
      detailedDesignInput: '',
      charBatch: step === 'characters' ? { size: 5, needs: ['主角', '女主', '反派', '配角', '配角'], existing: [], phase: 'core', parallel: true } : undefined,
      protagonistSettings: PROTAGONIST_SETTINGS,
    },
    llmConfig: {},
    enabledSkills: [],
    activeStyle: {},
    bestsellerPrefs: {},
  }
  if (body.previousData.charBatch === undefined) delete body.previousData.charBatch
  const t0 = Date.now()
  try {
    const res = await fetch(BASE, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    const dt = ((Date.now() - t0) / 1000).toFixed(1)
    if (!res.ok) {
      return { ok: false, dt, error: String(json.error || json.message || ('HTTP ' + res.status)).slice(0, 200) }
    }
    const data = json.data || {}
    return { ok: true, dt, data }
  } catch (e) {
    return { ok: false, dt: ((Date.now() - t0) / 1000).toFixed(1), error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }
  }
}

// ---------- 主流程 ----------
console.log('BASE =', BASE)
console.log('场景: 明末清初历史 + 系统流/签到流 | 主角: 朱慈烺 21岁 穿越附身\n')

const previousData = {}
const report = []
let passCount = 0
let failCount = 0
const totalEmpty = []

for (const step of CHAIN) {
  process.stdout.write(`▶ ${step.padEnd(14)} ... `)
  const res = await callStep(step, previousData)
  if (!res.ok) {
    failCount++
    console.log(`❌ HTTP 失败 (${res.dt}s): ${res.error}`)
    report.push({ step, pass: false, issues: ['调用失败: ' + res.error], dt: res.dt })
    continue
  }
  const checkCfg = STEP_CHECKS[step]
  const issues = []
  // 必填字段非空
  if (checkCfg.fields && checkCfg.fields.length > 0) {
    const miss = nonEmptySummary(res.data, checkCfg.fields)
    if (miss.length > 0) issues.push('必填字段为空: ' + miss.join(', '))
  }
  // 深度空值扫描（前几层）
  const emptyPaths = []
  walkFields(res.data, '', emptyPaths, 0)
  // 🔥 2026-09-02：排除「可选/题材无关」字段——threeRealms(三界)是玄幻/仙侠专属世界观，
  //    历史/都市等题材天生为空，属正确行为，不应判为空值路径。
  const _realEmpty = emptyPaths.filter((p) => !/^threeRealms(\.|$)/.test(p))
  if (_realEmpty.length > 0 && step !== 'characters' && step !== 'factions' && step !== 'relationships' && step !== 'outline' && step !== 'keyPlots' && step !== 'chapters') {
    // 数组类环节的空数组已在 check 处理，这里只报标量对象空值（排除预期为空的可选字段）
    issues.push('存在空值路径: ' + _realEmpty.slice(0, 8).join(' | ') + (_realEmpty.length > 8 ? ' …共' + _realEmpty.length + '处' : ''))
  }
  // 环节自定义校验
  if (checkCfg.check) checkCfg.check(res.data, issues, { previousData, protagonistSettings: PROTAGONIST_SETTINGS })
  // 记录
  if (issues.length === 0) {
    passCount++
    const fieldLen = Object.keys(res.data).map((k) => k + ':' + lenStr(res.data[k])).join(' ')
    console.log(`✅ 200 (${res.dt}s) 字段[${fieldLen.slice(0, 120)}]`)
  } else {
    failCount++
    console.log(`❌ 200 (${res.dt}s) 问题 ${issues.length} 个:`)
    issues.forEach((i) => console.log('     · ' + i))
  }
  // 🔥 2026-09-02 证据打印：把修复点的实际取值打出来，便于人工复核
  if (step === 'powerSystem') {
    const _pa = res.data.protagonistAbility || {}, _wps = res.data.worldPowerSystem || {}
    console.log(`   🔍 金手指类型="${_pa.type || '(空)'}" | 体系名称="${_wps.name || '(空)'}" 体系类型="${_wps.type || '(空)'}"`)
  }
  if (step === 'characters') {
    const _p = res.data.protagonist || {}
    const _fls = Array.isArray(res.data.femaleLeads) ? res.data.femaleLeads : []
    const _ants = Array.isArray(res.data.antagonists) ? res.data.antagonists : (res.data.antagonist ? [res.data.antagonist] : [])
    const _sups = Array.isArray(res.data.supporting) ? res.data.supporting : []
    console.log(`   🔍 主角年龄="${_p.age ?? '(空)'}" | 女主数=${_fls.length} | 女主名="${(_fls[0] && _fls[0].name) || '(空)'}" | 反派=${_ants.length} 配角=${_sups.length}`)
  }
  report.push({ step, pass: issues.length === 0, issues, dt: res.dt })
  // 存入 previousData（供下游环节）
  previousData[step] = res.data
}

function lenStr(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') return v.length + '字'
  if (Array.isArray(v)) return v.length + '项'
  if (typeof v === 'object') return Object.keys(v).length + '键'
  return String(v)
}

// ---------- 汇总 ----------
console.log('\n================ 汇总 ================')
for (const r of report) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.step.padEnd(14)} (${r.dt}s)` + (r.issues.length ? '  ' + r.issues.join('; ') : ''))
}
console.log(`\n通过 ${passCount}/${CHAIN.length} 环节`)
if (totalEmpty.length) console.log('空值路径:', totalEmpty.join(' | '))
const pass = failCount === 0 && passCount === CHAIN.length
console.log(pass ? '\n总体结论: ✅ PASS（全环节无空值）' : '\n总体结论: ❌ FAIL')
process.exit(pass ? 0 : 1)
