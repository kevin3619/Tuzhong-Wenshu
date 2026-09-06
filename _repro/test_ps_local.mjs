// 直接调用生产 powerSystem 步骤，验证金手指类型校正 + 修仙词净化 + 体系描述境界划分
import fs from 'fs'
import url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const previousData = {
  idea: {
    title: '大明中兴',
    protagonistName: '朱由榔',
    systemName: '大明中兴签到系统',
    tagline: '末帝朱由榔魂穿南明，凭大明中兴签到系统在危局中重整河山',
    keywords: ['大明', '明朝', '南明', '中兴', '朝堂', '权谋'],
    genre: '历史',
    coreConflict: '南明小朝廷内忧外患，主角以签到系统辅助光复大明',
    synopsis: '朱由榔魂穿南明末帝，依靠每日签到获得的精粮、图样、白银与人才情报，在文官武将掣肘中步步为营，北伐逐清，重振大明。'
  },
  worldbuilding: {
    era: '南明永历年间，清军入关在即，天下四分五裂',
    geography: '以西南三省为根基， ambition 光复两京十三省',
    powerSystem: '【体系名称】明朝朝堂权力体系\n【体系类型】朝堂权力体系\n【境界划分】未入流｜文『书吏·皂隶·巡拦』｜武『战兵·马卒·力士』\n正九品｜文『主簿·巡检』｜武『把总』\n正七品｜文『知县·按察使』｜武『千总』\n正五品｜文『郎中·同知』｜武『守备』\n正三品｜文『侍郎·布政使』｜武『参将』\n正一品｜文『大学士·三公』｜武『大将军』\n【体系描述】以皇权、阁权、军权、财权四权制衡为核心，科举出身决定文官前程，军功爵位决定武将升迁。',
    socialStructure: '文官集团、武勋集团、宦官集团三方博弈',
    worldRules: '无超自然力量，权力与人心即最大力量'
  },
  characters: {
    protagonist: { name: '朱由榔', identity: '南明末帝', motivation: '光复大明' },
    importantCharacters: [
      { name: '李定国', identity: '晋王、大将军', motivation: '效忠明室收复失地' },
      { name: '马吉翔', identity: '首辅大学士', motivation: '保住权位' }
    ]
  }
}

const payload = {
  step: 'powerSystem',
  novelId: 'test-verify-ps',
  input: '生成金手指设定',
  genre: '历史',
  keywords: ['大明', '明朝', '南明', '中兴', '朝堂', '权谋'],
  previousData,
  nocache: true
}

console.log('POST -> production ...')
const t0 = Date.now()
// 先登录拿 token
const loginRes = await fetch('http://localhost:3001/tuzhong-wenshu/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'kevin', password: 'leiyang0' })
})
const loginJson = await loginRes.json()
if (!loginJson.data || !loginJson.data.token) { console.log('LOGIN FAIL:', JSON.stringify(loginJson).slice(0, 300)); process.exit(1) }
const token = loginJson.data.token
console.log('login ok, token len', token.length)

fetch('http://localhost:3001/tuzhong-wenshu/api/ai-generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
  body: JSON.stringify(payload)
}).then(async (r) => {
  const text = await r.text()
  console.log('HTTP', r.status, 'elapsed', ((Date.now() - t0) / 1000).toFixed(1) + 's', 'len', text.length)
  let data
  try { data = JSON.parse(text) } catch (e) { console.log('NON-JSON:', text.slice(0, 500)); process.exit(1) }
  if (!data.success) { console.log('FAIL:', JSON.stringify(data).slice(0, 600)); process.exit(1) }
  const ps = data.data
  const pa = ps.protagonistAbility || {}
  const wps = ps.worldPowerSystem || {}
  const out = {
    name: pa.name,
    type: pa.type,
    abilitiesArr: Array.isArray(ps.protagonistAbilities) ? ps.protagonistAbilities.map(a => ({ name: a.name, type: a.type })) : null,
    descriptionHead: String(pa.description || '').slice(0, 260),
    wpsName: wps.name,
    wpsType: wps.type,
    wpsDesc: String(wps.description || '').slice(0, 400)
  }
  console.log(JSON.stringify(out, null, 2))

  // 检查修仙/神秘词残留
  const badWords = ['天授', '气运所凝', '镇国玉璧', '脑海光幕', '玉璧', '光幕', '灵气', '修炼', '法宝', '经脉', '金丹', '元婴', '筑基', '丹田', '修为', '修士', '心魔', '渡劫', '飞升', '功法', '秘境', '上古', '器灵', '阵法', '符箓', '灵石', '真气', '神魂', '法力']
  const allText = JSON.stringify(ps)
  const hits = []
  for (const w of badWords) {
    if (allText.indexOf(w) !== -1) {
      const idx = allText.indexOf(w)
      hits.push(w + '  …context: ' + allText.slice(Math.max(0, idx - 30), idx + 30).replace(/\n/g, ' '))
    }
  }
  console.log('\n=== 修仙/神秘词残留检查 ===')
  console.log(hits.length ? hits.join('\n') : '✅ 无残留')
  fs.writeFileSync(__dirname + '/_ps_test_result.json', JSON.stringify(ps, null, 2))
  console.log('\nsaved -> _ps_test_result.json')
}).catch((e) => { console.error('ERR:', e.message); process.exit(1) })
