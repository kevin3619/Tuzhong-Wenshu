import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: true, viewport: { width: 1400, height: 900 },
})
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2000)

const out = await page.evaluate(() => {
  const DRAFT_ID = 'tuzhong-draft-data-d2010e15-03a4-4197-aca5-f572af6e9d94'
  const data = JSON.parse(localStorage.getItem(DRAFT_ID) || '{}')
  const jo = (x) => x == null ? 'null' : (typeof x === 'string' ? x : JSON.stringify(x))
  const kv = {}
  for (const k of ['synopsis', 'outline', 'keyPlots', 'idea', 'worldbuilding', 'powerSystem']) {
    kv[k] = { type: Array.isArray(data[k]) ? 'arr' : typeof data[k], sample: jo(data[k]).slice(0, 900) }
  }
  const chars = data.characters || {}
  kv.characters_proto = { name: jo(chars.protagonist && chars.protagonist.name), role: jo(chars.protagonist && chars.protagonist.role), title: jo(chars.protagonist && chars.protagonist.title), identity: jo(chars.protagonist && chars.protagonist.identity) }
  kv.characters_fl_name = jo(chars.femaleLead && chars.femaleLead.name)
  kv.characters_fl_keys = chars.femaleLead ? Object.keys(chars.femaleLead) : []
  kv.characters_cnt = { fa: jo(chars.femaleLead?.name), antagonists: (chars.antagonists || []).map(a => jo(a.name)), supporting: (chars.supporting || []).map(a => jo(a.name)) }
  const fac = data.factions || {}
  kv.faction_cnt = (fac.factions || []).length
  kv.faction_names = (fac.factions || []).map(f => jo(f.name))
  kv.faction_sample = jo((fac.factions || [])[0]).slice(0, 600)
  return kv
})
fs.writeFileSync(path.join(ROOT, 'probe4.out.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await ctx.close().catch(() => {}); process.exit(0)