// 生产端到端复测：characters 步骤的徽章与角色定位
import fs from 'fs'
import url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const detailedDesignInput = `【主角】朱由榔，南明永历帝，穿越者，凭大明中兴签到系统光复大明。
【史可法】永历阵营（主角阵营）·忠臣文官——兵部尚书，弘光朝旧臣，扬州守御者，被主角改写结局后成为麾下重臣。
【瞿式耜】永历阵营（主角阵营）·支撑危局——广西巡抚加兵部尚书衔，署理桂林军政大权，永历朝廷在两广的支柱重臣。
【李定国】永历阵营（主角阵营）·抗清名将——晋王，大西军出身，两蹙名王，西南抗清主力统帅。
【何腾蛟】永历阵营（主角阵营）·湖广督师——总督，拥立朱由榔称帝，湖南前线抵御清军。
【马吉翔】永历阵营（主角阵营）·内廷近侍——太监，司礼监秉笔，依附皇权搅动朝局。
【朱聿键】绍武阵营·争位——绍武帝，唐王之弟，与永历争夺正统，内斗代表，被清军攻破后自缢。
【多尔衮】清廷阵营·宿敌——摄政王，率清军南下灭明，主角争夺天下的生死大敌。
【洪承畴】清廷阵营·降臣——大学士，降清后为前驱，招抚江南，明朝叛臣。
【吴三桂】清廷阵营·藩镇——平西王，引清兵入关，反复无常的野心军阀。`

const previousData = {
  idea: {
    title: '大明中兴', protagonistName: '朱由榔', systemName: '大明中兴签到系统',
    tagline: '末帝朱由榔魂穿南明，凭大明中兴签到系统在危局中重整河山',
    keywords: ['大明', '明朝', '南明', '中兴', '朝堂', '权谋'], genre: '历史',
    coreConflict: '南明小朝廷内忧外患，主角以签到系统辅助光复大明',
    synopsis: '朱由榔魂穿南明末帝，依靠每日签到获得的精粮、图样、白银与人才情报，在文官武将掣肘中步步为营，北伐逐清，重振大明。'
  },
  worldbuilding: {
    era: '南明永历年间，清军入关在即，天下四分五裂',
    geography: '以西南两广为根基，图谋光复两京十三省',
    powerSystem: '【体系名称】明朝朝堂权力体系\n【体系类型】朝堂权力体系\n【境界划分】未入流｜文『书吏·皂隶』｜武『战兵·马卒』\n正七品｜文『知县』｜武『千总』\n正三品｜文『侍郎·布政使』｜武『参将』\n正一品｜文『大学士·三公』｜武『大将军』\n【体系描述】以皇权、阁权、军权、财权四权制衡为核心，科举出身决定文官前程，军功爵位决定武将升迁。',
    socialStructure: '文官集团、武勋集团、宦官集团三方博弈',
    worldRules: '无超自然力量，权力与人心即最大力量'
  },
  powerSystem: {
    protagonistAbility: { name: '大明中兴签到系统', type: '系统类', description: '每日签到获得粮饷、图样、人才情报，辅助主角重整河山' },
    worldPowerSystem: { name: '明朝朝堂权力体系', type: '明朝朝堂权力体系', description: '皇权、阁权、军权、财权四权制衡' }
  },
  keywords: ['大明', '明朝', '南明', '中兴', '朝堂', '权谋'],
  detailedDesignInput
}

const payload = {
  step: 'characters', novelId: 'test-verify-chars', input: '大明 南明 中兴 朝堂 权谋',
  genre: '历史', keywords: ['大明', '明朝', '南明', '中兴', '朝堂', '权谋'],
  previousData, nocache: true
}

const loginRes = await fetch('http://175.27.244.202:3001/tuzhong-wenshu/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'kevin', password: 'leiyang0' })
})
const loginJson = await loginRes.json()
if (!loginJson.data?.token) { console.log('LOGIN FAIL', JSON.stringify(loginJson).slice(0, 200)); process.exit(1) }
const token = loginJson.data.token
console.log('POST characters -> production (可能数分钟)...')
const t0 = Date.now()

// 用原生 http 避开 undici 默认 headersTimeout（角色步耗时数分钟）
import http from 'http'
const bodyStr = JSON.stringify(payload)
const text = await new Promise((resolve, reject) => {
  const req = http.request({
    host: '175.27.244.202', port: 3001, path: '/tuzhong-wenshu/api/ai-generate', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'Content-Length': Buffer.byteLength(bodyStr) },
    timeout: 0
  }, (res) => {
    let buf = ''
    res.on('data', (ch) => { buf += ch })
    res.on('end', () => { console.log('HTTP', res.statusCode, 'elapsed', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'len', buf.length); resolve(buf) })
  })
  req.setTimeout(0)
  req.on('error', reject)
  req.write(bodyStr); req.end()
})
let data
try { data = JSON.parse(text) } catch (e) { console.log('NON-JSON', text.slice(0, 400)); process.exit(1) }
if (!data.success) { console.log('FAIL', JSON.stringify(data).slice(0, 400)); process.exit(1) }
const d = data.data
const all = [d.protagonist].concat(d.femaleLeads || [], d.antagonists || [], d.supporting || [])
  .filter(Boolean)
fs.writeFileSync(__dirname + '_chars_result.json', JSON.stringify(d, null, 2))

const TITLE_RE = /(帝|皇|王|后|妃|主|公|侯|伯|尚书|大学士|学士|将军|巡抚|总督|都督|侍郎|总兵|提督|参将|副将|丞相|首辅|阁老|太监|指挥使|元帅|刺史|太守|卿|统领|校尉|知府|知县|主簿|同知|通判|会长|总裁|总监|队长|掌柜|东家|老板|医师|大夫|教授|博士|师父|道长|法师|骑士|公爵|伯爵|领主|主教|夫人|郡主|公主|王妃|太子|亲王|郡王|监国|国主|皇帝|王爷|掌门|宗主|长老|教主|督师|统帅|御史|郎中|员外|司业|翰林|状元|榜眼|探花|秀才|举人|进士)$/
// 用户名单钦定的己方重臣：定位必须是忠臣系/亲随，不得是 竞争对手/反派/盟友/配角
const MUST_LOYAL = { '史可法': ['忠臣文官','忠臣'], '瞿式耜': ['忠臣文官','忠臣'], '李定国': ['忠臣武将','忠臣'], '何腾蛟': ['忠臣文官','忠臣武将','忠臣'], '马吉翔': ['亲随','忠臣'], '郑成功': ['忠臣武将','忠臣'] }
// 定位必须是标准枚举值，杜绝"文官/宗室/宿敌—"这类未规范化的原始词
const CANON_ROLE = ['主角','女主','反派','主角亲信','亲信','亲随','盟友','师父/导师','竞争对手','女配','后宫','红颜','兄弟','姐妹','长辈','忠臣','忠臣文官','忠臣武将','将领','太监','配角','中立','幕后黑手','宿敌','背叛者','野心家','敌对势力']
let issues = 0
console.log('\n角色数:', all.length)
for (const c of all) {
  const self = String(c.camp || '') + ' ' + String(c.identity || '').split(/[；;，,。\n]/)[0]
  const isOwn = /主角阵营|我方|己方|麾下|拥立|辅佐|效忠|忠臣|抗清|殉国|支柱/.test(self)
  const role = String(c.rolePosition || c.role || '')
  const badRole = isOwn && (role === '竞争对手' || role === '反派' || role === '敌对势力' || role === '背叛者')
  const badCanon = CANON_ROLE.indexOf(role) === -1
  const title = String(c.title || '').trim()
  const badTitle = title.length > 0 && (!TITLE_RE.test(title) || /[，。、—：:]/.test(title) || title.length > 8)
  const _must = MUST_LOYAL[c.name]
  const badLoyal = !!(_must && _must.indexOf(role) === -1)
  const archId = /说书|艺人|名医|圣手|悬壶|盐商|巨贾|隐世|高人|江湖|游侠/.test(String(c.identity || ''))
  if (badRole || badTitle || badLoyal || archId || badCanon) issues++
  console.log(`${(badRole || badTitle || badLoyal || archId || badCanon) ? '❌' : '✅'} ${(c.name || '').padEnd(6, ' ')} 定位=${role.padEnd(6)} 徽章=${(title || '(空→显示定位)').padEnd(10)}${badRole ? ' ⚠己方被判对手/反派' : ''}${badCanon ? ' ⚠非标准定位值' : ''}${badLoyal ? ' ⚠名单钦定职能未生效' : ''}${badTitle ? ' ⚠徽章非头衔' : ''}${archId ? ' ⚠身份仍是通用模板' : ''}`)
}
console.log(issues === 0 ? '\n=== 生产端到端验证通过：定位均为标准枚举且贴合名单钦定职能、徽章为干净头衔、身份无通用模板 ===' : `\n=== 存在 ${issues} 处问题 ===`)
