// 把用户真实 41 角色（含重复）POST 到生产 /api/characters/normalize，验证线上效果
import http from 'http'
import fs from 'fs'
import url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const rows = JSON.parse(fs.readFileSync(__dirname + '/_real_rows.json', 'utf-8'))
// 模拟实测到的重复：antagonists 里 丁魁楚…郑成功 整段出现两次
const dupBlock = rows.filter(r => ['丁魁楚','马士英','阮大铖','多尔衮','孔有德','李成栋','耿仲明','尚可喜','张献忠','孙可望','金声桓','郑芝龙','郑成功'].includes(r[0]))
const chars = {
  protagonist: { name: rows[0][0], title: rows[0][1], rolePosition: rows[0][2], camp: rows[0][3], identity: rows[0][4], background: '' },
  femaleLeads: rows.filter(r => r[2] === '女主').map(r => ({ name: r[0], title: r[1], rolePosition: r[2], camp: r[3], identity: r[4], background: '' })),
  antagonists: rows.filter(r => r[2] === '反派' || ['多铎'].includes(r[0])).map(r => ({ name: r[0], title: r[1], rolePosition: r[2], camp: r[3], identity: r[4], background: '' })).concat(dupBlock.map(r => ({ name: r[0], title: r[1], rolePosition: r[2], camp: r[3], identity: r[4], background: '' }))),
  supporting: rows.filter(r => !['反派','主角','女主'].includes(r[2]) && r[0] !== '多铎').map(r => ({ name: r[0], title: r[1], rolePosition: r[2], camp: r[3], identity: r[4], background: '' })),
}
const total = 1 + chars.femaleLeads.length + chars.antagonists.length + chars.supporting.length
console.log('提交角色条数(含重复):', total)

const post = (path, body, token) => new Promise((res, rej) => {
  const data = JSON.stringify(body)
  const req = http.request({
    host: '175.27.244.202', port: 3001, path: '/tuzhong-wenshu' + path, method: 'POST', timeout: 0,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...(token ? { Authorization: 'Bearer ' + token } : {}) }
  }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })) })
  req.on('error', rej); req.write(data); req.end()
})

const lg = await post('/api/auth/login', { username: 'kevin', password: 'leiyang0' })
const token = JSON.parse(lg.body).data.token
const r = await post('/api/characters/normalize', { characters: chars, detailedDesignInput: '' }, token)
const j = JSON.parse(r.body)
if (!j.success) { console.log('FAIL', r.status, r.body.slice(0, 300)); process.exit(1) }
const d = j.data
console.log('HTTP', r.status, '| 校正处数:', d.changed.length, '| 合并重复:', d.removedDupes, '| 补全(LLM):', d.titlesFilled, '| 正史定称:', d.historicalApplied, '| 百科查证:', d.onlineApplied, '| 校正后条数:', d.total)

const BAD = /(短命|支撑|危局|有志无权|江湖|绰号|昏君|附身|两蹙|^军将领|江阴$|嘉定$)/
const out = []
const all = [].concat(d.characters.protagonist || [], d.characters.femaleLeads || [], d.characters.antagonists || [], d.characters.supporting || [])
for (const c of all) {
  const bad = c.title && BAD.test(c.title)
  const own = /主角阵营|朋友/.test(c.camp || '') && !/反派|敌对/.test(c.camp || '')
  const wrong = own && (c.rolePosition === '反派' || c.rolePosition === '竞争对手')
  if (bad || wrong) out.push((wrong ? '⚠定位 ' : '⚠徽章 ') + c.name + ' → ' + c.rolePosition + '/' + c.title)
}
console.log('\n校正后角色定位分布:', JSON.stringify(all.reduce((a, c) => { a[c.rolePosition] = (a[c.rolePosition] || 0) + 1; return a }, {})))
console.log('关键角色:', ['刘文秀','艾能奇','李成栋','张献忠','孙可望','金声桓','阎应元','黄淳耀','王得仁','吴三桂','郑成功','史可法','李定国','朱由崧','朱聿键','朱聿鐭','朱落','周德全'].map(n => {
  const c = all.find(x => x.name === n); return c ? n + '=' + c.rolePosition + '/' + (c.title || '空') : n + '=缺失'
}).join(' | '))
console.log('诊断:', JSON.stringify(d.titleDebug).slice(0,600))
console.log(out.length ? '\n' + out.join('\n') : '\n=== 生产接口验证通过：无非法徽章、无己方误判 ===')
