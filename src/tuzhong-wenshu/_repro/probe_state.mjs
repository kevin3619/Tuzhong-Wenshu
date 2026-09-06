import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const PROFILE = path.join(ROOT, 'edge-profile')
const BASE = 'http://localhost:3001'
const APP = BASE + '/tuzhong-wenshu'

const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: 'msedge',
  headless: true,
  viewport: { width: 1360, height: 900 },
})
const page = browser.pages()[0] || (await browser.newPage())
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(2000)

const state = await page.evaluate(() => {
  const g = (k) => { try { return localStorage.getItem(k) } catch (e) { return null } }
  let gen = null
  try { gen = JSON.parse(g('tuzhong-generated-data') || 'null') } catch (e) {}
  let novels = []
  try { novels = JSON.parse(g('tuzhong-novels') || '[]') } catch (e) {}
  let chars = gen && gen.characters
  let charSummary = null
  if (chars) {
    try {
      charSummary = {
        protagonist: chars.protagonist ? { name: chars.protagonist.name, rolePos: chars.protagonist.rolePosition, role: chars.protagonist.role, gender: chars.protagonist.gender, title: chars.protagonist.title } : null,
        femaleLead: chars.femaleLead ? { name: chars.femaleLead.name, rolePos: chars.femaleLead.rolePosition, gender: chars.femaleLead.gender, title: chars.femaleLead.title } : null,
        femaleLeads: (chars.femaleLeads || []).map(c => ({ name: c.name, rolePos: c.rolePosition, gender: c.gender })),
        antagonists: (chars.antagonists || []).map(c => ({ name: c.name, rolePos: c.rolePosition, role: c.role, title: c.title })),
        supporting: (chars.supporting || []).map(c => ({ name: c.name, rolePos: c.rolePosition, role: c.role, title: c.title })),
      }
    } catch (e) { charSummary = 'ERROR ' + e.message }
  }
  return {
    url: location.href,
    activeNovelId: g('tuzhong-active-novel-id'),
    currentStep: g('tuzhong-current-step'),
    lastStepKey: g('tuzhong-last-step'),
    token: g('token') ? 'present' : 'absent',
    novelTitles: novels.map(n => ({ title: n.title, id: n.id, status: n.status })),
    charSummary,
    hasGeneratedData: !!gen,
    generatedKeys: gen ? Object.keys(gen) : [],
  }
})

console.log('###STATE###')
console.log(JSON.stringify(state, null, 2))
await page.screenshot({ path: path.join(ROOT, 'probe_home.png'), fullPage: true })
console.log('SHOT_OK')
await browser.close()