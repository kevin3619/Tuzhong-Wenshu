import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const push = k => fs.appendFileSync(path.join(ROOT, 'audit2.log'), `[${new Date().toISOString()}] ${k}\n`)

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)

const result = await page.evaluate(() => {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('tuzhong-draft-data-'))
  if (!keys.length) return { err: 'no draft' }
  const d = JSON.parse(localStorage.getItem(keys[0]) || '{}')
  const out = { steps: {} }

  const isEmptyV = (v) => {
    if (v == null) return true
    if (typeof v === 'string') return v.trim() === ''
    if (Array.isArray(v)) return v.length === 0
    if (typeof v === 'object') return Object.keys(v).length === 0
    return false
  }
  const typeOf = (v) => Array.isArray(v) ? 'arr(' + v.length + ')' : (v === null ? 'null' : (typeof v === 'object' ? 'obj(' + Object.keys(v).length + ')' : (typeof v === 'string' ? 'str(' + v.length + ')' : typeof v)))

  for (const step of ['idea','worldbuilding','powerSystem','characters','factions','relationships','synopsis','outline','keyPlots','chapters']) {
    const sd = d[step]
    out.steps[step] = { type: typeOf(sd), empties: [], nonEmptyCount: 0, totalSub: 0 }
    if (sd == null) continue
    const walk = (o, pfx) => {
      if (o == null) return
      if (Array.isArray(o)) {
        if (o.length === 0) out.steps[step].empties.push(pfx + '[]')
        o.forEach((v, i) => walk(v, pfx + '[' + i + ']'))
        return
      }
      if (typeof o === 'object') {
        const kk = Object.keys(o)
        if (kk.length === 0) out.steps[step].empties.push(pfx + '{}')
        kk.forEach(k => {
          const v = o[k]
          const p2 = pfx ? pfx + '.' + k : k
          if (v && typeof v === 'object') walk(v, p2)
          else {
            out.steps[step].totalSub++
            if (isEmptyV(v)) out.steps[step].empties.push(p2)
            else out.steps[step].nonEmptyCount++
          }
        })
        return
      }
      out.steps[step].totalSub++
      if (isEmptyV(o)) out.steps[step].empties.push(pfx)
      else out.steps[step].nonEmptyCount++
    }
    walk(sd, '')
  }
  return out
})

for (const [k, v] of Object.entries(result.steps || {})) {
  push(`【${k}】type=${v.type} 非空叶=${v.nonEmptyCount}`)
  v.empties.slice(0, 120).forEach(e => push('    EMPTY ' + e))
  if (v.empties.length === 0) push('    (该环节无空值)')
}
push('===== DONE =====')
console.log(JSON.stringify(result, null, 2))
await ctx.close().catch(() => {}); process.exit(0)