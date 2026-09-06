// 🔥 2026-09-03 #114 后端确定性回写块单元测试
// 从 route.ts 中按锚点抽取「#114 后端对齐·确定性回写」try 块，注入假 roster + 设计原文验证 name→title 映射。
'use strict'
const fs = require('fs')
const path = require('path')

const ROUTE = path.join(__dirname, '..', 'src', 'tuzhong-wenshu', 'src', 'app', 'api', 'ai-generate', 'route.ts')
const src = fs.readFileSync(ROUTE, 'utf8')

// —— brace-balance 抽取 try 块 ——
const anchor = '// 🔥 2026-09-03 #114 后端对齐·确定性回写'
const ai = src.indexOf(anchor)
if (ai < 0) { console.error('FAIL: 锚点注释未找到'); process.exit(1) }
// 找本行起始
const lineStart = src.lastIndexOf('\n', ai) + 1
const tryIdx = src.indexOf('try {', ai)
if (tryIdx < 0 || tryIdx - ai > 400) { console.error('FAIL: try 块起始未在锚点附近找到'); process.exit(1) }
// 从 try 的 { 开始做括号配对
const openBrace = src.indexOf('{', tryIdx)
let depth = 0, end = -1
for (let i = openBrace; i < src.length; i++) {
  const ch = src[i]
  if (ch === '{') depth++
  else if (ch === '}') {
    depth--
    if (depth === 0) { end = i; break }
  }
}
if (end < 0) { console.error('FAIL: brace-balance 未闭合'); process.exit(1) }
// 截取到 catch 注释整行结束（含 catch 行便于真实性检查）
const catchTail = src.indexOf('/* title 回写失败不影响主流程 */', end)
const blockEnd = catchTail >= 0 ? src.indexOf('\n', catchTail) : end + 1
let blockSrc = src.slice(lineStart, blockEnd).trim()

// 转成可执行函数体：注入依赖
const ts = require(path.join(__dirname, '..', 'src', 'tuzhong-wenshu', 'node_modules', 'typescript'))

// 转译 TS 类型注解 → 纯 JS（new Function 不能解析 ': Record<...>'）
blockSrc = ts.transpileModule(blockSrc, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText

const wrapper = `
function run(titleMapTest, ctor) {
  var _charUserDesignRaw = titleMapTest.designRaw
  var _userRosterR20 = titleMapTest.roster
  var protagonist = titleMapTest.protagonist
  var femaleLeads = titleMapTest.femaleLeads || []
  var antagonists = titleMapTest.antagonists || []
  var supporting = titleMapTest.supporting || []
  try {
${blockSrc}
  } catch (e) { return { err: String(e && e.message || e) } }
  return { map: _charTitleMapR20, protagonist: protagonist, femaleLeads: femaleLeads, antagonists: antagonists, supporting: supporting }
}
`
const fn = new Function('titleMapTest', wrapper + '\nreturn run(titleMapTest)') // eslint-disable-line no-new-func

// —— 夹具 ——
const roster = [
  { name: '朱由榔', desc: '主角', group: '主角', role: '永历阵营（主角阵营·核心）·核心主角', score: 1000 },
  { name: '多尔衮', desc: '摄政王', group: '反派', role: '清军阵营（敌对）·武官', score: 90 },
  { name: '李定国', desc: '大西军晋王', group: '朋友', role: '大西军阵营·武官', score: 70 },
  { name: '史可法', desc: '兵部尚书', group: '朋友', role: '永历阵营·文官', score: 60 },
  { name: '郑成功', desc: '国姓爷', group: '朋友', role: '永历阵营·水师将领', score: 70 },
  { name: '王太后', desc: '（皇太后）', group: '配角', role: '永历阵营·宗室', score: 30 },
  { name: '吴三桂', desc: '满清平西王', group: '反派', role: '清军阵营·武官', score: 80 },
  { name: '沐天波', desc: '黔国公', group: '朋友', role: '永历阵营·武官', score: 40 }, // 无括号 → 不应进 map
  { name: '焦琏', desc: '新兴侯', group: '朋友', role: '永历阵营·武官', score: 50 },
]

const designRaw = [
  '主角：朱由榔（永历帝）',
  '反派：多尔衮(满清睿亲王)、吴三桂（满清平西王）',
  '李定国（大西军晋王，西军柱石）—— 抗清主力',
  '朋友：史可法（兵部尚书）、郑成功（国姓爷，延平王）',
  '王太后（皇太后）：永历帝生母',
  '焦琏（新兴侯）',
].join('\n')

const ctor = (name, role, title) => ({ name, rolePosition: role, title: title || '', identity: name + '相关身份' })

// cases：每个 case 指定 protagonist 数组与四类集合，断言 title 覆盖后结果
const cases = [
  {
    name: '主角朱由榔(永历帝) 覆盖',
    data: { protagonist: ctor('朱由榔', '主角', ''), femaleLeads: [], antagonists: [], supporting: [] },
    expect: { '朱由榔': '永历帝' },
  },
  {
    name: '半角括号 多尔衮(满清睿亲王) 覆盖 + 不写入正史摄政王',
    data: { protagonist: null, femaleLeads: [], antagonists: [ctor('多尔衮', '反派', '')], supporting: [] },
    expect: { '多尔衮': '满清睿亲王' },
  },
  {
    name: '顿号分割取首段 郑成功→国姓爷',
    data: { protagonist: null, femaleLeads: [], antagonists: [], supporting: [ctor('郑成功', '配角', '')] },
    expect: { '郑成功': '国姓爷' },
  },
  {
    name: '括号前缀desc型 王太后(皇太后) → 皇太后（roster desc 本就带括号也应命中原文行）',
    data: { protagonist: null, femaleLeads: [], antagonists: [], supporting: [ctor('王太后', '配角', '')] },
    expect: { '王太后': '皇太后' },
  },
  {
    name: '无括号人物(沐天波/黔国公) 不得进 map、不得覆盖 LLM title',
    data: { protagonist: null, femaleLeads: [], antagonists: [], supporting: [ctor('沐天波', '配角', '黔国公')] },
    expect: {} // map 空；title 保持 LLM 值
  },
  {
    name: '反派 吴三桂(满清平西王) 覆盖',
    data: { protagonist: null, femaleLeads: [], antagonists: [ctor('吴三桂', '反派', '')], supporting: [] },
    expect: { '吴三桂': '满清平西王' },
  },
  {
    name: '焦琏(新兴侯) 覆盖',
    data: { protagonist: null, femaleLeads: [], antagonists: [], supporting: [ctor('焦琏', '配角', '')] },
    expect: { '焦琏': '新兴侯' },
  },
  {
    name: '否定：括号内含脏词(李定国（别名大西军晋王）) 不写入？→ 锚定首个括号即别名开头时按 badword 拒绝',
    data: { protagonist: null, femaleLeads: [], antagonists: [], supporting: [ctor('李定国', '配角', '')] },
    designRaw2: '李定国（别名大西军晋王，小尉迟）',
    expectNoKey: ['李定国'],
  },
]

let pass = 0, fail = 0
for (let i = 0; i < cases.length; i++) {
  const cs = cases[i]
  const d = cs.data
  const input = {
    designRaw: cs.designRaw2 || designRaw,
    roster,
    protagonist: d.protagonist,
    femaleLeads: d.femaleLeads,
    antagonists: d.antagonists,
    supporting: d.supporting,
  }
  const r = fn(input)
  if (r.err) { console.log(`✗ case${i + 1} ${cs.name}: 执行异常 ${r.err}`); fail++; continue }
  const map = r.map || {}
  const problems = []
  const all = [r.protagonist, ...r.femaleLeads, ...r.antagonists, ...r.supporting].filter(Boolean)
  // 正向断言
  for (const nm of Object.keys(cs.expect || {})) {
    const ch = all.find(c => c && c.name === nm)
    if (!ch) { problems.push(`${nm}: 角色不存在`); continue }
    if (ch.title !== cs.expect[nm]) problems.push(`${nm}: title=${JSON.stringify(ch.title)} 期望 ${JSON.stringify(cs.expect[nm])}`)
  }
  // 负向断言
  for (const nm of (cs.expectNoKey || [])) {
    if (map[nm]) problems.push(`${nm}: 不应进入 map（got ${map[nm]}）`)
  }
  if (problems.length === 0) { console.log(`✓ case${i + 1} ${cs.name}`); pass++ }
  else { console.log(`✗ case${i + 1} ${cs.name}\n   ` + problems.join('\n    ')); fail++ }
}

console.log(`\n==== 单元测试结果: ${pass}/${pass + fail} PASS ====`)
process.exit(fail ? 1 : 0)
