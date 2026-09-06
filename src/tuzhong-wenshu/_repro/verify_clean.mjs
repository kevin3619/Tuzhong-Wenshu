import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const push = k => fs.appendFileSync(path.join(ROOT, 'verify_clean.log'), `[${new Date().toISOString()}] ${k}\n`)

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)

const data = await page.evaluate(() => {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('tuzhong-draft-data-'))
  for (const k of keys) {
    try {
      const d = JSON.parse(localStorage.getItem(k) || '{}')
      return {
        coreSettings: d?.worldbuilding?.coreSettings || '',
        powerDesc: d?.powerSystem?.worldPowerSystem?.description || '',
        outlineWB: (d?.outline?.worldBuilding) || null,
        outlineIsObj: d?.outline ? (typeof d.outline === 'object') : false,
      }
    } catch (e) {}
  }
  return { coreSettings: '', powerDesc: '', outlineWB: null, outlineIsObj: false }
})

// 与 wizard 一致的清洗实现
function cleanPowerSystemText(v) {
  let t = String(v || ''); if (!t) return t
  t = t.replace(/金手指[：:][^；;\n}，,、/—]*[；;]?/g, '')
  t = t.replace(/(?:^|[\n；;])\s*【体系名称】[^；;\n]*[；;]?\s*/g, '')
  t = t.replace(/(?:^|[\n；;])\s*【体系类型】[^；;\n]*[；;]?\s*/g, '')
  t = t.replace(/[；;]\s*[；;]+/g, '；').trim()
  return t
}
function cleanSettingPowerSystemBlock(v) {
  let t = String(v || ''); if (!t) return t
  var _topReStr = '(?:时代背景|地理格局|历史脉络|社会结构|世界规则|核心设定|背景设定|总体设定|文明|科技|文化|经济|力量体系|世界观)'
  var _out = t
  for (;;) {
    var _startRe = /(?:^|[｜\n；。])\s*(?:力量体系[：:]?\s*|【力量体系】\s*|【体系名称】\s*)/g
    var _m = _startRe.exec(_out); if (!_m) break
    var _startIdx = _m.index
    var _nextTag = new RegExp('[｜\\n；。]\\s*(' + _topReStr + ')\\s*[：:]', 'g')
    _nextTag.lastIndex = _startIdx + _m[0].length
    var _next = _nextTag.exec(_out)
    var _endIdx = _next ? _next.index : _out.length
    var _removed = _out.slice(_startIdx, _endIdx)
    if (!_removed.length) break
    _out = _out.slice(0, _startIdx) + _out.slice(_endIdx)
  }
  _out = _out.replace(/[\n]+(?=[\n｜])/g, '').replace(/[\n]+\s*[\n]+/g, '\n').replace(/[｜\n；。]\s*$/, '').trim()
  return _out
}

const F = s => ({ len: (s||'').length, hasMing: s.includes('明朝朝堂权力体系'), hasGolden: s.includes('金手指'), hasSysName: s.includes('体系名称'), hasSysType: s.includes('体系类型') })

push('[A] worldbuilding.coreSettings (背景设定候选)')
push('  raw  ' + JSON.stringify(F(data.coreSettings)))
const cs = cleanSettingPowerSystemBlock(data.coreSettings)
push('  clean' + JSON.stringify(F(cs)) + ' head=' + cs.slice(0,50).replace(/\n/g,'⏎'))

push('[B] powerSystem.worldPowerSystem.description (力量体系候选)')
push('  raw  ' + JSON.stringify(F(data.powerDesc)))
const pd = cleanPowerSystemText(data.powerDesc)
push('  clean' + JSON.stringify(F(pd)) + ' head=' + pd.slice(0,60).replace(/\n/g,'⏎'))

push('[C] outline.worldBuilding presence: ' + (data.outlineWB ? 'object' : 'null') + ' | outlineIsObj=' + data.outlineIsObj)
if (data.outlineWB) {
  const s = data.outlineWB.setting || ''; const p = data.outlineWB.powerSystem || ''
  push('  setting raw' + JSON.stringify(F(s)) + ' | powerSystem raw' + JSON.stringify(F(p)))
  push('  setting clean' + JSON.stringify(F(cleanSettingPowerSystemBlock(s))) + ' | powerSystem clean' + JSON.stringify(F(cleanPowerSystemText(p))))
}
push('===== DONE =====')
console.log(JSON.stringify(data, null, 2))
await ctx.close().catch(() => {}); process.exit(0)