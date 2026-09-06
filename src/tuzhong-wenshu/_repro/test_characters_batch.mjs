// 直接向后端 characters 分批接口发请求，诊断：①女主是否产出 ②补充批是否新增角色 ③title留给徽章
const BASE = 'http://localhost:3001/tuzhong-wenshu'

function summarizeChars(norm, label) {
  console.log('\n===== ' + label + ' =====')
  const arr = norm && norm.characters
  if (Array.isArray(arr)) {
    console.log('normalizeCharactersData 返回 characters[] 数=', arr.length)
    arr.forEach((c, i) => {
      console.log(`  [${i}] name=${c.name} title=${c.title} role=${c.role} rolePosition=${c.rolePosition} gender=${c.gender}`)
    })
  } else {
    console.log('结构化结构: protagonist=', norm && norm.protagonist && norm.protagonist.name,
      ' femaleLead=', norm && norm.femaleLead && norm.femaleLead.name,
      ' femaleLeads=', norm && norm.femaleLeads && norm.femaleLeads.length,
      ' antagonists=', norm && norm.antagonists && norm.antagonists.length,
      ' supporting=', norm && norm.supporting && norm.supporting.length)
  }
}

async function callBatch(needs, existing, phase) {
  const body = {
    step: 'characters',
    input: '明朝末年，南明永历朝廷',
    keywords: ['历史', '权谋', '明末'],
    genre: '历史',
    novelId: 'temp',
    previousData: {
      idea: { title: '永历中兴', protagonistName: '朱由榔', genre: '历史' },
      keywords: ['历史', '权谋', '明末'],
      existingCharacters: existing,
      appendRoleInput: '',
      charBatch: { size: needs.length, needs, existing, phase, parallel: true },
      detailedDesignInput: '',
      protagonistSettings: { name: '朱由榔', gender: '男', age: '', identity: '永历帝' },
      bookAnalysis: { femaleLeadMode: '单女主' },
    },
    enabledSkills: {},
    activeStyle: {},
    bestsellerPrefs: {},
  }
  const t = Date.now()
  const res = await fetch(BASE + '/api/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  console.log('HTTP', res.status, '耗时', ((Date.now() - t) / 1000).toFixed(1) + 's')
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    console.log('响应体前500字:', txt.slice(0, 500))
    return null
  }
  const json = await res.json()
  console.log('usedModel=', json && json._meta && json._meta.usedModel)
  console.log('data 顶层键:', Object.keys(json.data || {}).join(','))
  console.log('data.femaleLead.name=', json.data && json.data.femaleLead && json.data.femaleLead.name)
  console.log('data.femaleLeads 数=', json.data && json.data.femaleLeads && json.data.femaleLeads.length)
  console.log('data.antagonists 数=', json.data && json.data.antagonists && json.data.antagonists.length)
  console.log('data.supporting 数=', json.data && json.data.supporting && json.data.supporting.length)
  return json.data
}

const mode = process.argv[2] || 'fl'   // fl=女主诊断；supp=补充批诊断
const ROSTER = ['朱由榔', '吴三桂', '李定国', '郑成功', '沐天波', '王太后']

if (mode === 'fl') {
  // 仅主角+女主两名单女（单女主）
  const data = await callBatch(['主角', '女主'], [], 'core')
  if (data) {
    summarizeChars({ characters: [], protagonist: data.protagonist, femaleLead: data.femaleLead, femaleLeads: data.femaleLeads, antagonists: data.antagonists, supporting: data.supporting }, '单女主张口 主角+女主')
    if (data.femaleLead) {
      console.log('\n-- femaleLead 完整字段 --')
      console.log(JSON.stringify(data.femaleLead, null, 1))
    }
  }
} else if (mode === 'supp') {
  // 模拟第2批补充：已有 ROSTER，请求 反派+配角 各
  const data = await callBatch(['反派', '配角'], ROSTER, 'supplement')
  if (data) {
    const names = []
    ;['antagonists', 'supporting'].forEach(k => (data[k] || []).forEach(c => c && names.push(c.name)))
    console.log('补充批新增名单(', names.length, '):', names.join('、'))
  }
}
process.exit(0)