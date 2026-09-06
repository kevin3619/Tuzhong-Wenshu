// 🔥 2026-09-03 #114 后端对齐·集成验证（无 LLM、无线上）
// 用真实《永历中兴》风格设定文档（Markdown 技能卡 + 汇总表 + 简写括号行混合），
// 串跑 route.ts 真实源码：parseUserCharacterDesign → parseUserCharacterList → #114 确定性回写块 E，
// 验证「真实 roster → title 回写」在复杂格式下不失效。
'use strict'
const fs = require('fs')
const path = require('path')
const ts = require(path.join(__dirname, '..', 'src', 'tuzhong-wenshu', 'node_modules', 'typescript'))

const ROUTE = path.join(__dirname, '..', 'src', 'tuzhong-wenshu', 'src', 'app', 'api', 'ai-generate', 'route.ts')
const src = fs.readFileSync(ROUTE, 'utf8')

// ---------- 抽取：标记边界切片（函数声明起点 → 下一个顶级标记），避免返回类型 Array<{...}> 干扰括号配对 ----------
function extractFnByBounds(startMarker, endMarker, endFromStart) {
  const si = src.indexOf(startMarker)
  if (si < 0) throw new Error('未找到起点 ' + startMarker)
  let ei = endFromStart ? src.indexOf(endMarker, si) : src.indexOf(endMarker)
  if (ei < 0) throw new Error('未找到终点 ' + endMarker)
  // 去掉终点标记前的整行换行（保留函数自身的闭合 } ）
  let cut = src.lastIndexOf('\n', ei)
  if (cut < si) cut = si
  return src.slice(si, cut)
}
// ---------- 抽取 #114 回写块（锚注释 → catch 注释行结束） ----------
function extractBlockE() {
  const anchor = '// 🔥 2026-09-03 #114 后端对齐·确定性回写'
  const ai = src.indexOf(anchor)
  if (ai < 0) throw new Error('未找到 #114 锚注释')
  const lineStart = src.lastIndexOf('\n', ai) + 1
  const tryIdx = src.indexOf('try {', ai)
  const openBrace = src.indexOf('{', tryIdx)
  let d = 0, end = -1
  for (let i = openBrace; i < src.length; i++) {
    if (src[i] === '{') d++
    else if (src[i] === '}') { d--; if (d === 0) { end = i; break } }
  }
  const catchTail = src.indexOf('/* title 回写失败不影响主流程 */', end)
  const blockEnd = catchTail >= 0 ? src.indexOf('\n', catchTail) : end + 1
  return src.slice(lineStart, blockEnd).trim()
}

const trans = (s) => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText

// 组装可执行上下文：函数声明 + 注入
const fnDesign = new Function(trans(extractFnByBounds('function parseUserCharacterDesign', 'function parseUserCharacterList', true)) + '\nreturn parseUserCharacterDesign')
const fnList = new Function(trans(extractFnByBounds('function parseUserCharacterList', '// 🔥 2026-08-27 动态兜底', true)) + '\nreturn parseUserCharacterList')
const parseUserCharacterDesign = fnDesign()
const parseUserCharacterList = fnList()

// Block E 依赖 _charUserDesignRaw/_userRosterR20/protagonist/femaleLeads/antagonists/supporting
// 组装：把块源码（去掉自身 try/catch 外壳）放进 runBlockE 执行上下文
function makeBlockRunner(blockSrcJs) {
  const wrapper = `
return function runBlockE(designRaw, roster, proto, fl, ant, sup) {
  var _charUserDesignRaw = designRaw
  var _userRosterR20 = roster
  var protagonist = proto
  var femaleLeads = fl
  var antagonists = ant
  var supporting = sup
${blockSrcJs}
  return { protagonist: protagonist, femaleLeads: femaleLeads, antagonists: antagonists, supporting: supporting }
}`
  return new Function(wrapper)
}
const runBlockE = makeBlockRunner(trans(extractBlockE().replace(/^try \{/, '').replace(/\} catch \(_tErr\) \{ \/\* title 回写失败不影响主流程 \*\/ \}$/, '')))()

// ---------- 真实风格夹具（对齐 scripts/sample-yongli-roster.txt 的裸【】技能卡/编号行/汇总表 + 用户括号钦定行） ----------
const DESIGN = [
  '主角核心设定',
  '| 姓名 | 朱由榔 |',
  '| 身份 | 永历帝 |',
  '',
  '人物设定',
  '【多尔衮】—— 摄政王',
  '功能标签：主要反派BOSS、清军幕后主脑',
  '忠诚等级：忠于满清',
  '',
  '【吴三桂】—— 山海关总兵',
  '功能标签：关键变数、引清入关、后期大反派',
  '忠诚等级：只忠于利益',
  '',
  '【李定国】—— 大西军将领',
  '功能标签：猛将盟友、北伐主力、两蹶名王',
  '忠诚等级：绝对忠诚',
  '',
  '【史可法】—— 兵部尚书',
  '功能标签：忠臣楷模、扬州保卫战核心',
  '忠诚等级：忠于大明',
  '',
  '【郑成功】—— 抗清名将',
  '功能标签：重要盟友、水师力量',
  '忠诚等级：忠于大明',
  '',
  '【王太后】—— 皇太后',
  '功能标签：精神支柱',
  '忠诚等级：忠于永历',
  '',
  '清军核心（反派）',
  '| **清军核心** | 多尔衮、多铎、吴三桂 | 3人 |',
  '',
  '| 1 | **焦琏** | 参将 | 忠诚将领、城防主力 |',
  '| 2 | **沐天波** | 黔国公 | 忠诚将领 |',
  '',
  '主角：朱由榔（永历帝）',
  '多尔衮（满清睿亲王）：引清入关的幕后主使',
  '李定国（大西军晋王）—— 抗清主力',
  '郑成功（国姓爷）：海上抗清力量',
  '史可法（兵部尚书）：留守重臣',
  '王太后（皇太后）：永历帝生母',
].join('\n')

const roster = parseUserCharacterList(DESIGN)
const des = parseUserCharacterDesign(DESIGN)

console.log('【parseUserCharacterDesign】抽取段落长度=' + des.length + '（' + des.split('\n').length + ' 行）')

// 按 roster 组装模拟最终角色卡（组别即 rolePosition 的对应数组）
const proto = roster.filter(r => r.group === '主角').map(r => ({ name: r.name, rolePosition: '主角', title: '' }))
const fl = roster.filter(r => r.group === '女主').map(r => ({ name: r.name, rolePosition: '女主', title: '' }))
const ant = roster.filter(r => r.group === '反派').map(r => ({ name: r.name, rolePosition: '反派', title: '' }))
const sup = roster.filter(r => r.group !== '主角' && r.group !== '女主' && r.group !== '反派').map(r => ({ name: r.name, rolePosition: '配角', title: '' }))
console.log('【parseUserCharacterList】roster=' + roster.length + ' 人 | 分组: 主角' + proto.length + ' 女主' + fl.length + ' 反派' + ant.length + ' 其他' + sup.length)
console.log('  roster 明细: ' + roster.map(r => r.name + '(' + r.group + ')[' + (r.desc || '').slice(0, 14) + ']').join('、'))

const out = runBlockE(DESIGN, roster, proto[0] || null, fl, ant, sup)
if (out.err) { console.log('✗ BlockE 执行异常: ' + out.err); process.exit(1) }
const all = [out.protagonist, ...out.femaleLeads, ...out.antagonists, ...out.supporting].filter(Boolean)

const expect = { '朱由榔': '永历帝', '多尔衮': '满清睿亲王', '李定国': '大西军晋王', '史可法': '兵部尚书', '郑成功': '国姓爷', '王太后': '皇太后' }
// 无「姓名（」括号钦定 → 不进 map、title 保持空（不被 LLM/正史词污染；文档里吴三桂技能卡标题是「山海关总兵」也绝不回写）
const expectNoTitle = ['吴三桂', '沐天波', '焦琏']

let pass = 0, fail = 0
for (const nm of Object.keys(expect)) {
  const ch = all.find(c => c && c.name === nm)
  if (!ch) { console.log(`✗ ${nm}: 角色不在最终数组中`); fail++; continue }
  if (ch.title === expect[nm]) { console.log(`✓ ${nm} → ${ch.title}`); pass++ }
  else { console.log(`✗ ${nm}: title=${JSON.stringify(ch.title)} 期望 ${JSON.stringify(expect[nm])}`); fail++ }
}
for (const nm of expectNoTitle) {
  const ch = all.find(c => c && c.name === nm)
  const ok = ch && !ch.title
  console.log((ok ? '✓' : '✗') + ` ${nm} 无括号 → title 保持空（${ok ? '未被污染' : 'got ' + JSON.stringify(ch && ch.title)}）`)
  if (ok) pass++; else fail++
}

console.log(`\n==== 集成验证结果: ${pass}/${pass + fail} PASS ====`)
process.exit(fail ? 1 : 0)
