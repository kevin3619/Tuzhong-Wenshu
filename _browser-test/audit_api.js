// v10：登录态直接拉取永历完整 /api/settings，离线审计全部环节空值/模板占位
const { chromium } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const OUT = path.join(__dirname, 'audit_api.txt')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const TPL_MARKERS = ['性格鲜明','为人处世有其独特原则','多面性的性格','有着自己的坚持和信念','在故事中展现出','形象独特','关键角色','重要人物生成','神秘人物','由AI','自动添加','示例角色','待补充','TODO']
;(async () => {
  const log = []
  const w = s => log.push(s)
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  const data = await page.evaluate(async (nid) => {
    const r = await fetch(`/tuzhong-wenshu/api/settings?novelId=${nid}`)
    if (!r.ok) return { http: r.status }
    const j = await r.json()
    return (j && j.data) || j
  }, NID)
  await ctx.close()
  if (!data || data.http) { console.log('HTTP=' + (data && data.http)); process.exit(1) }
  w('===== 永历中兴 /api/settings 离线审计 =====')
  w('TOP_KEYS=' + JSON.stringify(Object.keys(data)) + '\n')

  const secStats = {}
  const tplSamples = []
  const allEmpty = []
  function walk(obj, p, sec) {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      if (obj.length === 0) { allEmpty.push(sec + '|' + p + '=[]') }
      obj.forEach((v, i) => walk(v, p + '[' + i + ']', sec))
      return
    }
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      const leaf = p + '.' + k
      if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
        allEmpty.push(sec + '|' + leaf)
      } else if (Array.isArray(v) && v.length === 0) {
        allEmpty.push(sec + '|' + leaf + '=[]')
      } else if (typeof v === 'object') {
        walk(v, leaf, sec)
      } else if (typeof v === 'string' && TPL_MARKERS.some(m => v.includes(m))) {
        tplSamples.push(sec + '|' + leaf + ':' + v.slice(0, 60))
      }
    }
  }
  // 分环节统计
  const secs = ['idea','worldbuilding','powerSystem','characters','factions','relationships','synopsis','outline','keyPlots','chapters']
  secs.forEach(s => {
    const v = data[s]
    if (v === undefined) { secStats[s] = 'ABSENT'; return }
    const before = allEmpty.length
    const tBefore = tplSamples.length
    walk(v, 'entry.' + s, s)
    secStats[s] = { empty: allEmpty.length - before, tpl: tplSamples.length - tBefore, size: Array.isArray(v) ? v.length : (typeof v === 'object' ? Object.keys(v).length : 'other') }
  })
  w('EMPTY_TPL_BY_SECTION=' + JSON.stringify(secStats, null, 1) + '\n')
  w('TOTAL_EMPTY_NODES=' + allEmpty.length)
  w('TOTAL_TPL_SAMPLES=' + tplSamples.length + '\n')

  // 关键字段空值分组统计
  const kwGroups = {
    characterJobGoal: ['job','goal'],
    characterPower: ['powerLevel','realm'],
    factionFields: ['relationship','summary','goal'],
    chapterVol: ['volTitle','title','summary','volumeTitle'],
    relationship: ['description','relation'],
  }
  w('===== 关键字段空值条目计数 =====')
  for (const [g, kws] of Object.entries(kwGroups)) {
    const hits = allEmpty.filter(p => { const leaf = p.split('|')[1] || p; return kws.some(k => leaf.toLowerCase().includes(k.toLowerCase())) })
    w(g + ': ' + hits.length)
    hits.slice(0, 12).forEach(h => w('    ' + h))
  }

  w('\n===== 模板占位样例 (first 40) =====')
  tplSamples.slice(0, 40).forEach(t => w('  ' + t))
  fs.writeFileSync(OUT, log.join('\n'))
  console.log('DONE size=', fs.statSync(OUT).size)
})().catch(e => { console.error('FATAL', e); process.exit(1) })