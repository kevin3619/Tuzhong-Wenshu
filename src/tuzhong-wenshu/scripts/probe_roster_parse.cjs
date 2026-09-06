// 第21轮：用【用户真实的《永历中兴》人物设定】测试 route.ts 的 parseUserCharacterList
// 直接从 route.ts 抽取函数源码并转译执行，保证与源码算法完全一致（不重复维护副本）。
const fs = require('fs')
const path = require('path')

const ROUTE = path.join(__dirname, '..', 'src', 'app', 'api', 'ai-generate', 'route.ts')
const raw = fs.readFileSync(ROUTE, 'utf8')

// ---- 从 route.ts 抽取指定函数（大括号配平） ----
// ⚠️ 陷阱：返回类型标注里含花括号（Array<{ name: string; ... }>），若从签名处开始配平会提前截断。
//    故先定位函数体起点（第一个 "{\n"），从那里开始配平。
function extractFn(src, header) {
  const i = src.indexOf(header)
  if (i < 0) throw new Error('未找到函数: ' + header)
  const bodyStart = src.indexOf('{\n', i)
  if (bodyStart < 0) throw new Error('未找到函数体起点: ' + header)
  let depth = 0, end = -1
  for (let k = bodyStart; k < src.length; k++) {
    const ch = src[k]
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { end = k + 1; break } }
  }
  if (end < 0) throw new Error('括号未配平: ' + header)
  return src.slice(i, end)
}

// 用项目自带 TypeScript 编译器转译（比手写正则剥类型稳健，源码改签名也不会挂）
const ts = require('typescript')
function stripTs(s) {
  return ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.None } }).outputText
}

const fnList = stripTs(extractFn(raw, 'function parseUserCharacterList(text: string)'))
const fnDesign = stripTs(extractFn(raw, 'function parseUserCharacterDesign(text: string)'))

const sandbox = {}
const factory = new Function(fnDesign + '\n' + fnList + '\nreturn { parseUserCharacterList, parseUserCharacterDesign }')
const { parseUserCharacterList, parseUserCharacterDesign } = factory()

// ---- 真实样本 ----
const samplePath = path.join(__dirname, 'sample-yongli-roster.txt')
const text = fs.readFileSync(samplePath, 'utf8')

const roster = parseUserCharacterList(text)

console.log('='.repeat(70))
console.log('样本文件: scripts/sample-yongli-roster.txt')
console.log('文本长度: ' + text.length + ' 字符')
console.log('【人物设定】锚点: ' + (text.indexOf('【人物设定】') >= 0 ? '存在' : '不存在 → 走 fallback'))
console.log('parseUserCharacterDesign 返回长度: ' + parseUserCharacterDesign(text).length)
console.log('='.repeat(70))
console.log('解析出人物数: ' + roster.length + ' （用户设计总计 42 位）')
console.log('='.repeat(70))

// 按分组统计
const byGroup = {}
roster.forEach(r => { (byGroup[r.group] = byGroup[r.group] || []).push(r.name) })
console.log('\n【分组统计】')
Object.keys(byGroup).forEach(g => {
  console.log('  ' + g + ' (' + byGroup[g].length + '): ' + byGroup[g].join('、'))
})

console.log('\n【明细】')
roster.forEach((r, i) => {
  console.log('  ' + String(i + 1).padStart(2) + '. ' + r.name.padEnd(5, '　') + ' | ' + r.group.padEnd(2, '　') + ' | ' + r.desc.slice(0, 40))
})

console.log('\n【角色定位明细（role = 阵营·职能）】')
roster.forEach((r, i) => {
  console.log('  ' + String(i + 1).padStart(2) + '. ' + r.name.padEnd(5, '　') + ' | score=' + String(r.score).padStart(4) + ' | ' + r.role)
})

// ---- 与期望对比（分组） ----
const EXPECT = {
  '主角': [],
  '女主': [],
  '朋友': ['赵虎', '王忠赐', '朱落', '白柏年', '李铁山', '孙思远', '周德全', '玉竹', '庞天寿', '瞿式耜', '史可法', '郑成功', '李定国', '焦琏', '张同敞', '堵胤锡', '何腾蛟', '吴万雄', '刘文秀', '艾能奇', '阎应元', '黄淳耀', '王得仁', '郑鸿逵', '黄道周', '张煌言'],
  '反派': ['丁魁楚', '多铎', '马士英', '阮大铖', '吴三桂', '多尔衮', '孔有德', '李成栋', '耿仲明', '尚可喜', '张献忠', '孙可望', '金声桓', '郑芝龙', '朱由崧', '朱聿鐭'],
  '配角': ['朱聿键'],
}
// 主角单独标注
EXPECT['主角'] = ['朱由榔']

console.log('\n' + '='.repeat(70))
console.log('【与期望对比】')
const got = {}
roster.forEach(r => { got[r.name] = r.group })
let okCnt = 0, missCnt = 0, wrongCnt = 0
const expected41 = Object.keys(EXPECT).reduce((a, g) => a + EXPECT[g].length, 0)
console.log('期望人物总数: ' + expected41 + '，实际解析: ' + roster.length)
console.log('')
Object.keys(EXPECT).forEach(g => {
  EXPECT[g].forEach(nm => {
    const g2 = got[nm]
    if (!g2) { console.log('  ❌ 未解析出: ' + nm + ' (期望' + g + ')'); missCnt++ }
    else if (g2 === g) { okCnt++ }
    else { console.log('  ⚠️  分组错误: ' + nm + ' 实际=' + g2 + ' 期望=' + g); wrongCnt++ }
  })
})
console.log('')
console.log('  正确: ' + okCnt + ' | 分组错误: ' + wrongCnt + ' | 未解析出: ' + missCnt)
console.log('  覆盖率: ' + okCnt + '/' + expected41 + ' = ' + (okCnt / expected41 * 100).toFixed(1) + '%')
console.log('='.repeat(70))

// ================= 槽位绑定模拟（复刻 route.ts 的逐槽绑定算法） =================
function simulateBinding(roster, needs, existing) {
  const exSet = {}
  ;(existing || []).forEach(n => { exSet[n] = true })
  const pool = { '主角': [], '女主': [], '反派': [], '朋友': [], '配角': [] }
  roster.forEach(u => { if (!exSet[u.name]) (pool[u.group] || pool['配角']).push(u) })
  Object.keys(pool).forEach(k => pool[k].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)))
  const needChain = {
    '主角': ['主角'], '女主': ['女主'], '女配': ['女配', '女主'],
    '反派': ['反派'], '朋友': ['朋友', '配角'], '配角': ['配角', '朋友'],
  }
  const slotBind = {}
  needs.forEach((need, i) => {
    const chain = needChain[need] || ['配角', '朋友']
    let bound = null
    for (const c of chain) { const q = pool[c]; if (q && q.length) { bound = q.shift(); break } }
    slotBind[i] = bound
  })
  // 女主/女配槽无真实女性角色可绑 → 降级为配角槽
  needs.forEach((need, i) => {
    if ((need === '女主' || need === '女配') && !slotBind[i]) {
      needs[i] = '配角'
      for (const c of ['配角', '朋友']) { const q = pool[c]; if (q && q.length) { slotBind[i] = q.shift(); break } }
    }
  })
  return { slotBind, needs }
}

const PRESETS = {
  '单女主': ['主角', '女主', '女配', '女配', '朋友', '朋友', '反派', '反派', '反派', '反派', '配角', '配角', '配角', '配角', '配角'],
  '双女主': ['主角', '女主', '女主', '女配', '朋友', '朋友', '反派', '反派', '反派', '反派', '反派', '配角', '配角', '配角', '配角'],
  '后宫多女主': ['主角', '女主', '女主', '女主', '女主', '反派', '反派', '反派', '反派', '配角', '配角', '配角', '配角', '配角', '配角'],
}

console.log('\n【15 槽位绑定模拟 · 三套阵容】')
console.log('='.repeat(70))
Object.keys(PRESETS).forEach(mode => {
  const needs = PRESETS[mode].slice()
  const { slotBind } = simulateBinding(roster, needs, [])
  let boundCnt = 0
  const rows = []
  needs.forEach((nd, i) => {
    const b = slotBind[i]
    if (b) { boundCnt++; rows.push('  ' + String(i + 1).padStart(2) + '. [' + nd + '] ' + b.name.padEnd(4, '　') + ' → ' + b.role) }
    else rows.push('  ' + String(i + 1).padStart(2) + '. [' + nd + '] ❌ 无绑定（将自创）')
  })
  console.log('\n▶ ' + mode + '：绑定 ' + boundCnt + '/' + needs.length)
  rows.forEach(r => console.log(r))
  const names = Object.keys(slotBind).map(k => slotBind[k] && slotBind[k].name).filter(Boolean)
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  console.log('  自创槽位: ' + (needs.length - boundCnt) + ' | 重名: ' + (dup.length ? dup.join('、') : '无'))
})
console.log('\n' + '='.repeat(70))
