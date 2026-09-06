import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const push = k => fs.appendFileSync(path.join(ROOT, 'audit.log'), `[${new Date().toISOString()}] ${k}\n`)

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)

const result = await page.evaluate(() => {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('tuzhong-draft-data-'))
  if (!keys.length) return { err: 'no draft' }
  const d = JSON.parse(localStorage.getItem(keys[0]) || '{}')

  // 修仙/玄幻/武侠/跨题材关键词（本作是架空历史+系统流+王朝争霸，出现以下即视为污染）
  const xiexiu = ['修仙','修者','修士','仙尊','灵气','灵根','金丹','元婴','筑基','化神','炼气','练气','渡劫','妖兽','妖丹','仙门','宗门','御剑','飞升','灵石','功法','神识','丹田','真元','夺舍','炼丹','炼器','洞府','秘境','天骄','法宝','真气','先天之境','坐化','参悟','天人合一','修道','仙途','神通','化灵','悟道','剑修','天骄','至尊','大道','天地法则','执剑','灵兽','炼丹师','阵法','符箓','轮回镜','仙家']

  const out = { err: '', topKeys: Object.keys(d), empties: [], pollution: [] }

  const normStr = (s) => { if (s == null) return ''; if (typeof s === 'string') return s; if (Array.isArray(s)) return s.join('；'); try { return JSON.stringify(s) } catch { return String(s) } }
  const isEmptyVal = (v) => {
    if (v == null) return true
    if (typeof v === 'string') return v.trim() === ''
    if (Array.isArray(v)) return v.length === 0
    if (typeof v === 'object') return Object.keys(v).length === 0
    return false
  }

  const walk = (obj, pfx) => {
    if (obj == null) return
    if (Array.isArray(obj)) { obj.forEach((v, i) => walk(v, pfx + '[' + i + ']')); return }
    if (typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        const v = obj[k]
        const path2 = pfx + '.' + k
        if (v && typeof v === 'object') { walk(v, path2) }
      }
      return
    }
    // leaf
    const s = normStr(obj)
    if (!s) out.empties.push(pfx)
    else {
      for (const kw of xiexiu) {
        if (s.includes(kw)) { out.pollution.push(pfx + ' =~ ' + kw + ' :: ' + s.slice(0, 60)); break }
      }
    }
  }
  walk(d, '$')
  // 去重排序
  out.empties = [...new Set(out.empties)].sort()
  out.pollution = [...new Set(out.pollution)].sort()
  return out
})

push('TOP=' + JSON.stringify(result.topKeys))
push('空值字段数量=' + result.empties.length)
result.empties.slice(0, 300).forEach(e => push('  EMPTY ' + e))
push('跨题材污染数量=' + result.pollution.length)
result.pollution.slice(0, 300).forEach(p => push('  POLL ' + p))
push('===== DONE =====')
console.log(JSON.stringify(result, null, 2))
await ctx.close().catch(() => {}); process.exit(0)