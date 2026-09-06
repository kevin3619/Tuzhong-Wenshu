import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const PROFILE = path.join(ROOT, 'edge-profile')
const APP = 'http://localhost:3001/tuzhong-wenshu'
const mode = process.argv[2] || 'fl'

const browser = await chromium.launchPersistentContext(PROFILE, { channel: 'msedge', headless: true, viewport: { width: 1360, height: 900 } })
const page = browser.pages()[0] || (await browser.newPage())
await page.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(1500)

const ROSTER = ['朱由榔', '吴三桂', '李定国', '郑成功', '沐天波', '王太后']
const needs = mode === 'fl' ? ['主角', '女主'] : ['反派', '配角']
const existing = mode === 'fl' ? [] : ROSTER
const phase = mode === 'fl' ? 'core' : 'supplement'

const result = await page.evaluate(async ({ needs, existing, phase, APP }) => {
  const res = await fetch(APP + '/api/ai-generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      step: 'characters', input: '明朝末年，南明永历朝廷',
      keywords: ['历史', '权谋', '明末'], genre: '历史', novelId: 'temp',
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
      enabledSkills: {}, activeStyle: {}, bestsellerPrefs: {},
    }),
  })
  const t0 = Date.now()
  const json = await res.json().catch(() => null)
  return { status: res.status, ms: Date.now() - t0, json }
}, { needs, existing, phase, APP })

console.log('HTTP', result.status, '耗时', (result.ms / 1000).toFixed(1) + 's')
const d = result.json && result.json.data
if (d) {
  console.log('usedModel=', result.json._meta && result.json._meta.usedModel)
  console.log('data 顶层键=', Object.keys(d).join(','))
  console.log('femaleLead.name=', d.femaleLead && d.femaleLead.name, ' title=', d.femaleLead && d.femaleLead.title)
  console.log('femaleLeads 数=', d.femaleLeads ? d.femaleLeads.length : 0)
  const ag = (d.antagonists || []).map(c => c && c.name + '[' + (c.title||'') + ']').join(',')
  const sp = (d.supporting || []).map(c => c && c.name + '[' + (c.title||'') + ']').join(',')
  console.log('antagonists 数=', d.antagonists ? d.antagonists.length : 0, ag)
  console.log('supporting 数=', d.supporting ? d.supporting.length : 0, sp)
  if (mode === 'fl' && d.femaleLead) {
    fs.writeFileSync(path.join(ROOT, 'fl_debug.json'), JSON.stringify(d.femaleLead, null, 1))
    console.log('女主详情已写入 fl_debug.json')
  }
} else {
  console.log('无 data，body=', JSON.stringify(result.json).slice(0, 400))
}
await browser.close()
process.exit(0)