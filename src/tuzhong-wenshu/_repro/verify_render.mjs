import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const LOG = path.join(ROOT, 'verify_render.log')
fs.writeFileSync(LOG, '')
const push = (k) => fs.appendFileSync(LOG, k + '\n')

const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const t = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim()

// ensure logged in via cookies if not
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.evaluate(() => {
  try { document.cookie = 'auth_user=kevin; path=/' } catch (e) {}
})

// open draft box
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(e => push('draftbox-err:' + e.message))
await page.waitForTimeout(2000)

// there may be a "继续生成" button for the draft
const cont = page.getByText('继续生成', { exact: true }).first()
if (await cont.count()) {
  await cont.click({ timeout: 8000 }).catch(e => push('continue-err:' + e.message))
  await page.waitForTimeout(4000)
}

const STEPS = ['输入主题','核心创意','世界观设定','金手指设定','主要人物设定','势力设定','人物关系图谱','简介卖点','整体故事大纲','关键剧情节点']

const summarizeTextarea = async () => {
  return await page.evaluate(() => {
    const emptyVals = []
    document.querySelectorAll('textarea, input[type=text]').forEach(e => {
      const v = (e.value || '').trim()
      const placeholder = (e.getAttribute('placeholder') || '')
      const visible = e.offsetParent !== null
      if (visible && !v && placeholder && !/搜索|名称|搜索角色|搜索人员/.test(placeholder)) {
        emptyVals.push(placeholder)
      }
    })
    // visible-only body text (ignore hidden step DOM)
    let vtxt = ''
    document.querySelectorAll('body *').forEach(e => {
      if (e.offsetParent === null) return
      if (vtxt.length > 60000) return
      if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE') return
      vtxt += (e.textContent || ' ') + ' '
    })
    const body = vtxt
    const hasRegenPrompt = body.includes('请点击上方按钮重新生成')
    // collect theme-consistency terms (visible-only)
    const cultHit = (body.match(/修仙|修真|仙侠|炼气|筑基|金丹|元婴|化神|飞升|灵根|丹田/gi) || []).length
    const cultMatches = [...new Set((body.match(/.{0,10}(修仙|修真|仙侠|炼气|筑基|金丹|元婴|化神|飞升|灵根|丹田).{0,10}/gi) || []))].slice(0, 6)
    return {
      emptyInputPlaceholders: emptyVals.slice(0, 30),
      hasRegenPrompt,
      cultHits: cultHit,
      cultMatches,
      hasNingjiabao: body.includes('沈青璃') || body.includes('宁家堡'),
      bodyLen: body.length,
    }
  })
}

for (const s of STEPS) {
  // click nav
  const btns = page.locator(`button:has-text("${s}")`)
  const n = await btns.count()
  if (n === 0) { push(`[${s}] 未找到导航按钮`); continue }
  await btns.nth(0).click().catch(e => push(`[${s}] click-err:${e.message.split('\n')[0]}`))
  await page.waitForTimeout(1600)
  const r = await summarizeTextarea()
  // per-step theme check
  push(`===== ${s} =====`)
  push(`  regenPrompt=${r.hasRegenPrompt} cultHits=${r.cultHits} 沈青璃/宁家堡=${r.hasNingjiabao}`)
  if (r.cultHits) push(`  修仙词实例: ${r.cultMatches.join(' || ')}`)
  if (r.emptyInputPlaceholders.length) push(`  空输入占位: ${'['+r.emptyInputPlaceholders.join(',')+']'}`)
  else push('  可见输入: 无空值')
}

await page.screenshot({ path: path.join(ROOT, 'verify_render_final.png'), fullPage: false }).catch(() => {})
console.log('verify done, see %s', LOG)
await ctx.close().catch(() => {}); process.exit(0)