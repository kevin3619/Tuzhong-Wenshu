import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const ROOT = 'D:\\tuzhongwang\\tuzhong\\途中文枢 (Tuzhong Wenshu) - AI 小说写作助手\\src\\tuzhong-wenshu\\_repro'
const APP = 'http://localhost:3001/tuzhong-wenshu'
const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'edge-profile-verify'), {
  channel: 'msedge', headless: false, viewport: { width: 1500, height: 950 },
})
const page = ctx.pages()[0] || await ctx.newPage()
const txt = el => (el && el.textContent || '').trim().replace(/\s+/g, ' ')
const out = []
const push = k => { out.push(k); fs.appendFileSync(path.join(ROOT, 'verify_fixes.log'), `[${new Date().toISOString()}] ${k}\n`) }

// 登录（管理员 kevin / leiyang0）
await page.goto(APP + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(3000)
const ac = page.locator('text=账号密码登录')
if (await ac.count()) { await ac.first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1200) }
const u = page.getByPlaceholder('请输入用户名或手机号')
if (await u.count()) {
  await u.fill('kevin')
  await page.getByPlaceholder('请输入密码').fill('leiyang0')
  const loginBtn = page.locator('button', { hasText: /^登录$/ })
  await loginBtn.first().click({ timeout: 6000 }).catch(async e => { await page.keyboard.press('Enter') })
  await page.waitForTimeout(5000)
  push('login-url=' + page.url())
} else push('NO-USER-FIELD url=' + page.url())

async function goChip(label) {
  const chip = page.getByText(label, { exact: true }).first()
  if (await chip.count()) { await chip.click({ timeout: 8000 }).catch(e => push('chip-err(' + label + '):' + e.message)); await page.waitForTimeout(3500) }
  else push('NO-CHIP: ' + label)
}

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
push('url0=' + page.url())

// 打开草稿箱 → 继续生成
await page.locator('text=草稿箱').first().click({ timeout: 6000 }).catch(e => push('draftbox-err:' + e.message))
await page.waitForTimeout(2000)
const cont = page.getByText('继续生成', { exact: true }).first()
if (await cont.count()) {
  await cont.click({ timeout: 8000 }).catch(e => push('continue-err:' + e.message))
  await page.waitForTimeout(6000)
  push('url-after-continue=' + page.url())
} else push('no-继续生成')

// ---- 1) 势力设定 ----
await goChip('势力设定')
const factionsBody = await page.evaluate(() => document.body.innerText || '')
const facNames = (factionsBody.match(/朝廷|外敌|藩镇|权臣|清流|士绅|商帮|义军|主角阵营|敌对|联盟|势力/g) || [])
const hasFactionFields = /阵营|盟友|敌方|势力|领袖|目标/.test(factionsBody)
push('势力设定包含关键词数量: ' + facNames.length + ' | 有势力字段文本: ' + hasFactionFields)
push('势力设定是否含主角名/南明/永历: ' + /南明|永历|朱由榔|抗清/.test(factionsBody))
await page.screenshot({ path: path.join(ROOT, 'verify_factions.png') }).catch(() => {})

// ---- 2) 整体故事大纲 → 世界观设定 → 背景设定/力量体系 ----
async function dumpTextareas(tag) {
  const tas = await page.evaluate(() => {
    return [...document.querySelectorAll('textarea')].map(t => ({
      ph: t.getAttribute('placeholder') || '',
      val: (t.value || ''),
    }))
  })
  tas.forEach((t, i) => {
    const v = t.val
    const flag = {
      hasMing: v.includes('明朝朝堂权力体系'),
      hasGolden: v.includes('金手指'),
      hasSysName: v.includes('体系名称'),
      hasSysType: v.includes('体系类型'),
      len: v.length,
    }
    push(`[${tag}] ta[${i}] ph=${(t.ph||'').slice(0,18)} | len=${flag.len} | 明朝=${flag.hasMing} 金手指=${flag.hasGolden} 体系名称=${flag.hasSysName} 体系类型=${flag.hasSysType} | head=${v.slice(0,40).replace(/\n/g,'⏎')}`)
  })
}
await goChip('整体故事大纲')
await page.waitForTimeout(2000)
await dumpTextareas('大纲')
const outlineBody = await page.evaluate(() => document.body.innerText || '')
push('大纲含背景设定标签: ' + outlineBody.includes('背景设定'))
push('大纲含力量体系标签: ' + outlineBody.includes('力量体系'))
push('大纲含明朝朝堂权力体系(应false): ' + outlineBody.includes('明朝朝堂权力体系'))
push('大纲含金手指签到(应false): ' + outlineBody.includes('金手指'))
push('大纲含体系名称标签(应false): ' + outlineBody.includes('体系名称'))
// 尝试点击 世界观设定 tab（如果存在）
await goChip('世界观设定')
await page.waitForTimeout(2000)
const wbBody = await page.evaluate(() => document.body.innerText || '')
push('世界观含明朝朝堂权力体系(应false): ' + wbBody.includes('明朝朝堂权力体系'))
push('世界观含金手指签到(应false): ' + wbBody.includes('金手指'))

// ---- 3) 读取 textarea 具体值 ----
const textareas = await page.evaluate(() => {
  const ta = [...document.querySelectorAll('textarea')]
  return ta.map(t => ({ ph: t.getAttribute('placeholder') || '', val: (t.value || '').slice(0, 400) }))
})
textareas.forEach((t, i) => push('textarea[' + i + '] ph=' + t.ph.slice(0, 20) + ' val=' + t.val.replace(/\n/g, '⏎')))

await page.screenshot({ path: path.join(ROOT, 'verify_outline.png') }).catch(() => {})
push('===== DONE =====')
console.log(out.join('\n'))
await ctx.close().catch(() => {}); process.exit(0)