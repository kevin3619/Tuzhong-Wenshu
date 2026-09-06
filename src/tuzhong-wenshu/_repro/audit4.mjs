import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const DRAWINGS = ['修仙','修真','玄幻','仙侠','炼气','筑基','金丹','元婴','渡劫','飞升','斗气','斗帝','斗宗','魂力','魔法','斗罗','斗破','魔兽','剑修','金丹期','元婴期','灵根','大道','圣人','混沌','洪荒','妖族','灵兽','功法','道法','神通','法力','境界突破','突破金丹','灵气']
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: true, viewport: { width: 1400, height: 900 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const LOG = path.join(ROOT, 'audit4.log')
const push = k => fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${k}\n`)

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2000)

const result = await page.evaluate((drawings) => {
  const DRAFT_ID = 'd2010e15-03a4-4197-aca5-f572af6e9d94'
  const datakey = 'tuzhong-draft-data-' + DRAFT_ID
  const stepkey = 'tuzhong-draft-step-' + DRAFT_ID
  const themekey = 'tuzhong-draft-theme-' + DRAFT_ID
  const has = k => { try { return localStorage.getItem(k) != null } catch { return false } }
  const data = (() => { try { return JSON.parse(localStorage.getItem(datakey)) || null } catch { return null } })()
  const step = localStorage.getItem(stepkey)
  const theme = localStorage.getItem(themekey)
  const out = { datakey, hasData: has(datakey), hasStep: has(stepkey), hasTheme: has(themekey), step, theme: theme?.slice(0, 200) }

  const isEmptyV = (v) => {
    if (v == null) return true
    if (typeof v === 'string') return v.trim() === ''
    if (Array.isArray(v)) return v.length === 0
    if (typeof v === 'object') return Object.keys(v).length === 0
    return false
  }
  const typeOf = (v) => Array.isArray(v) ? 'arr(' + v.length + ')' : (v === null ? 'null' : (typeof v === 'object' ? 'obj(' + Object.keys(v).length + ')' : (typeof v === 'string' ? 'str(' + v.length + ')' : typeof v)))

  const steps = {}
  const ALL_STEPS = ['idea','worldbuilding','powerSystem','characters','factions','relationships','synopsis','outline','keyPlots','chapters']
  for (const stepName of ALL_STEPS) {
    const sd = data ? data[stepName] : undefined
    const rec = { type: typeOf(sd), isEmpty: isEmptyV(sd), empties: [], nonEmpty: 0, total: 0, hits: [] }
    if (sd != null) {
      const walk = (o, pfx) => {
        if (o == null) return
        if (Array.isArray(o)) {
          if (o.length === 0) rec.empties.push(pfx + '[]')
          o.forEach((v, i) => walk(v, pfx + '[' + i + ']'))
          return
        }
        if (typeof o === 'object') {
          const kk = Object.keys(o)
          if (kk.length === 0) rec.empties.push(pfx + '{}')
          kk.forEach(k => {
            const v = o[k]
            const p2 = pfx ? pfx + '.' + k : k
            if (v && typeof v === 'object') walk(v, p2)
            else {
              rec.total++
              if (isEmptyV(v)) rec.empties.push(p2)
              else {
                rec.nonEmpty++
                const s = String(v)
                for (const w of drawings) if (s.includes(w)) { rec.hits.push(p2 + '≈' + w); break }
              }
            }
          })
          return
        }
        rec.total++
        if (isEmptyV(o)) rec.empties.push(pfx)
        else {
          rec.nonEmpty++
          const s = String(o)
          for (const w of drawings) if (s.includes(w)) { rec.hits.push(pfx + '≈' + w); break }
        }
      }
      walk(sd, '')
    }
    steps[stepName] = rec
  }
  out.steps = steps
  return out
}, DRAWINGS)

push('== datakey=' + (result.datakey || '') + ' step=' + (result.step ?? '-') + ' hasData=' + result.hasData + ' hasTheme=' + result.hasTheme)
push('   theme=' + String(result.theme || ''))
for (const [k, v] of Object.entries(result.steps || {})) {
  push(`【${k}】type=${v.type} isEmpty=${v.isEmpty} 非空=${v.nonEmpty}/${v.total}`)
  ;(v.empties || []).slice(0, 80).forEach(e => push('    EMPTY ' + e))
  if (!(v.empties || []).length) push('    (无空值)')
  ;(v.hits || []).slice(0, 20).forEach(h => push('    🚫跨题材 ' + h))
}
push('===== DONE =====')
console.log(JSON.stringify(result, null, 2))
await ctx.close().catch(() => {}); process.exit(0)