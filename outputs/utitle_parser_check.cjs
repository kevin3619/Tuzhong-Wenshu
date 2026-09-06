// 2026-09-03 任务#114：徽章 title 覆盖解析器 一致性单测
// 直接从 ai-generate-wizard.tsx 抽取 _buildTitleOverrideFromUserDesign 源码求值，
// 保证被测逻辑与线上代码完全一致（无复制漂移）。
const fs = require('fs')
const path = require('path')

const TSX = path.join(__dirname, '..', 'src', 'tuzhong-wenshu', 'src', 'components', 'ai-generate-wizard.tsx')
const src = fs.readFileSync(TSX, 'utf8').replace(/\r\n/g, '\n')

const startMark = 'function _buildTitleOverrideFromUserDesign(text: string): Record<string, string> {'
const si = src.indexOf(startMark)
if (si < 0) { console.error('START MARKER NOT FOUND'); process.exit(1) }
// 花括号配平定位函数结尾（避免锚点依赖缩进/换行风格）
let depth = 0
let ei = -1
for (let i = si; i < src.length; i++) {
  const ch = src[i]
  if (ch === '{') depth++
  else if (ch === '}') {
    depth--
    if (depth === 0) { ei = i + 1; break }
  }
}
if (ei < 0) { console.error('FUNCTION END NOT FOUND'); process.exit(1) }
const fnSrc = src.slice(si, ei)

const ts = require(path.join(__dirname, '..', 'src', 'tuzhong-wenshu', 'node_modules', 'typescript'))

// ---- 运行环境 shims ----
const sandbox = {
  normalizeToString: (v) => (v === null || v === undefined ? '' : String(v).trim()),
  _ovr: undefined,
}
// 注入 data 之后求值该函数（data 是函数闭包外层的变量名）
function runParser(data, design) {
  const code = `
    var data = ${JSON.stringify(data)};
    ${fnSrc}
    _result = _buildTitleOverrideFromUserDesign(${JSON.stringify(design)});
  `
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  const _result = {}
  // eslint-disable-next-line no-new-func
  return new Function('normalizeToString', '_result', js + '; return _result;')(sandbox.normalizeToString, _result)
}

// ---- 夹具：LLM 返回角色名单（含其正史错配身份信息），用户设计文本给出钦定身份 ----
const roster = {
  protagonist: { name: '朱由榔' },
  femaleLead: { name: '王太后' },
  antagonists: [{ name: '多尔衮' }, { name: '李定国' }],
  supporting: [{ name: '郑成功' }, { name: '史可法' }, { name: '沐天波' }, { name: '焦琏' }],
  characters: [],
}

const cases = [
  {
    name: '括号单身份',
    design: '主要人物：多尔衮(满清睿亲王)、李定国(大西军晋王)、史可法(兵部尚书)、郑成功(国姓爷)、王太后(皇太后)、沐天波(黔国公)',
    expect: { 多尔衮: '满清睿亲王', 李定国: '大西军晋王', 史可法: '兵部尚书', 郑成功: '国姓爷', 王太后: '皇太后', 沐天波: '黔国公' },
  },
  {
    name: '全角括号+多身份取首段',
    design: '郑成功（国姓爷，延平王）\n李定国（大西军晋王，抗清名将）\n多尔衮（满清睿亲王，摄政王）',
    expect: { 郑成功: '国姓爷', 李定国: '大西军晋王', 多尔衮: '满清睿亲王' },
  },
  {
    name: '冒号映射 + 叙述性出现不应命中',
    design: '多尔衮：满清睿亲王\n当时李定国正驻守云南（李定国追击清军）\n郑成功：国姓爷',
    expect: { 多尔衮: '满清睿亲王', 郑成功: '国姓爷' }, // 李定国在括号内但内容不是身份 → 不覆盖
  },
  {
    name: '叙述句括号旁注不误伤',
    design: '李定国(本名李定国，字宁宇)率军抗清，郑成功（成功收复台湾的民族英雄）收复失地',
    expect: {}, // 本名…、含"的"长句 → 均被拒
  },
  {
    name: '长名优先防止短名嵌长名',
    design: '焦琏(新兴侯)与焦(人名)无关；多尔衮（满清睿亲王）',
    roster2: { protagonist: { name: '焦琏' }, supporting: [{ name: '焦' }, { name: '多尔衮' }], characters: [] },
    expect: { 焦琏: '新兴侯', 多尔衮: '满清睿亲王' },
  },
  {
    name: '混合分隔符换行名单',
    design: '一、多尔衮（满清睿亲王）\n二、李定国（大西军晋王）\n三、沐天波(黔国公)：沐王府当家',
    expect: { 多尔衮: '满清睿亲王', 李定国: '大西军晋王', 沐天波: '黔国公' },
  },
]

let pass = 0
for (const c of cases) {
  const data2 = c.roster2 || roster
  const got = runParser(data2, c.design)
  const keys = Object.keys(c.expect)
  const ok = keys.every((k) => got[k] === c.expect[k]) && Object.keys(got).length === keys.length
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`)
  if (!ok) {
    console.log('   design:', JSON.stringify(c.design))
    console.log('   expect:', JSON.stringify(c.expect))
    console.log('   got   :', JSON.stringify(got))
  }
  if (ok) pass++
}
console.log(`\n${pass}/${cases.length} PASS`)
process.exit(pass === cases.length ? 0 : 1)
