import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: false, viewport: { width: 1400, height: 900 },
})
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
const out = await page.evaluate(() => {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('tuzhong-draft-data-'))
  const d = JSON.parse(localStorage.getItem(keys[0]) || '{}')
  const wb = d.worldbuilding || {}
  const probe = {}; 
  ['levels','threeRealms','mythology','heavenlyRules','forbiddenZones','powerSystemType','religion','culture','worldHistory','powerOrigin','raceSystem'].forEach(k=>{ probe[k] = typeof wb[k]==='string'? wb[k] : JSON.stringify(wb[k]); });
  return {
    powerSystem: wb.powerSystem,
    coreSettings: wb.coreSettings,
    keys: Object.keys(wb),
    probe,
  }
})
fs.writeFileSync(path.join(ROOT, 'ps_dump.log'),
  '=== powerSystem ===\n' + (out.powerSystem||'') +
  '\n\n=== coreSettings ===\n' + (out.coreSettings||'') +
  '\n\n=== PROBE fields (cult-checked) ===\n' +
  Object.entries(out.probe).map(([k,v])=>{
    const cult = /修仙|修真|仙侠|炼气|筑基|金丹|元婴|化神|飞升|灵根|丹田|洪荒|剑修|符道|武道/.test(v||'') ? ' [CULT!]' : '';
    return '--- '+k+cult+' ('+((v||'').length)+') ---\n'+((v||'').substring(0,400));
  }).join('\n\n'))
console.log('dumped, len ps=' + ((out.powerSystem||'').length))
await ctx.close().catch(()=>{}); process.exit(0)