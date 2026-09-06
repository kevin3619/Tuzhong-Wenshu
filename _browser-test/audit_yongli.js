// 审计 v7：直接从引导(分卷)点关键数据步骤，抓取真实内容
const { chromium } = require('playwright-core')
const path = require('path')
const fs = require('fs')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const OUT = path.join(__dirname, 'audit_yongli.txt')
const STEP_DIR = path.join(__dirname, 'wizard_shots')
if (!fs.existsSync(STEP_DIR)) fs.mkdirSync(STEP_DIR, { recursive: true })

const TARGETS = ['世界观设定','金手指设定','主要人物设定','势力设定','人物关系图谱','简介卖点','整体故事大纲','关键剧情节点']
const NAV_NOISE = /途中文枢|作品书架|设定中心|风格工坊|SKILL|使用指南|VIP会员|个人设置|管理后台|收起菜单|返回书架|草稿箱|智能推荐|上一步|开始写正文|重新生成|🔁|📋|▼|^K$|Kevin|管理员|^←$|创作中作品|总字数|平均健康度|连续打卡|我的作品|AI全自动生成|新建作品|已完成|健康|100分|^分$|^\d+$|欢迎回来，创作者|你正在创作.*万字|^3613\.3万$|^100%$|^0天$/

function cleanBody(t) {
  if (!t) return ''
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean)
  const bad = [/回到明朝当王爷/,/巫颂/,/剑道独尊/,/大魏宫廷/,/遮天/,/赘婿/,/斗破苍穹/,/凡人修仙传/,/343\.7万字/,/161\.2万字/,/364\.9万字/,/607\.8万字/,/566\.8万字/,/545\.8万字/,/420\.8万字/,/602\.4万字/,/^2026-/,/^搜索作品/]
  const filtered = lines.filter(l => {
    let x = l.replace(/OpenRouter \| MiniMax-M3 \(免费主力\)|DeepSeek-V4-Flash|综合全能：GLM-4-Flash/g, '').trim()
    if (!x) return false
    if (NAV_NOISE.test(x)) return false
    for (const b of bad) if (b.test(x)) return false
    return true
  })
  const uniq = []
  for (const l of filtered) if (uniq[uniq.length - 1] !== l) uniq.push(l)
  return uniq.join('\n')
}

;(async () => {
  const log = []
  const w = (s) => log.push(s)
  w('===== 草稿《永历中兴》关键数据步骤定向审计 =====')
  w('时间: ' + new Date().toLocaleString('zh-CN') + '\n')

  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 940 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.on('dialog', d => d.dismiss().catch(() => {}))
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const dbtn = page.locator('button:has-text("草稿箱")').first()
  if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2000) }
  const gen = page.locator('button:has-text("继续生成")').first()
  if (await gen.count()) { await gen.click(); await page.waitForTimeout(2000) }

  for (let i = 0; i < 30; i++) {
    const n = await page.locator('.step-nav-scroll button').count().catch(() => 0)
    if (n >= 14) break; await page.waitForTimeout(1000)
  }
  w('nav按钮数=' + await page.locator('.step-nav-scroll button').count().catch(()=>0) + ' URL=' + page.url() + '\n')
  await page.waitForTimeout(4000)

  async function capture() {
    const body = await page.evaluate(() => document.body.innerText).catch(() => 'ERR')
    const clean = cleanBody(body)
    const fields = await page.evaluate(() => {
      const out = []
      const push = (t, label, v) => out.push({ t, label, value: String(v).slice(0, 300) })
      document.querySelectorAll('input:not([type=hidden])').forEach(el => push('input', el.placeholder || el.name || el.id || '', el.value || ''))
      document.querySelectorAll('textarea').forEach(el => push('textarea', el.placeholder || el.name || el.id || '', el.value || ''))
      document.querySelectorAll('select').forEach(el => push('select', el.name || el.id || '', el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].text : el.value))
      document.querySelectorAll('[contenteditable="true"]').forEach(el => push('editable', '', el.innerText || ''))
      return out
    }).catch(e => 'ERR:' + e.message)
    const volCard = await page.evaluate(() => {
      const t = document.body.innerText
      return {
        hasVolTitle: /卷标题|卷摘要|卷数设置/.test(t),
        hasDivTitle: /第[一二三四五六七八九十百千0-9]+卷/.test(t),
        hasChapTitle: /第[一二三四五六七八九十百0-9]+章/.test(t),
        nullVisible: (t.match(/null|undefined|NaN/g) || []).length,
      }
    }).catch(() => ({}))
    return { body, clean, fields, volCard }
  }

  async function emit(title, d) {
    w('='.repeat(70))
    w(title)
    w('URL=' + page.url())
    w('卷数据标志: ' + JSON.stringify(d.volCard))
    w('--- 内容区(去书架底噪) ---')
    w(d.clean.slice(0, 2600) || '(内容区为空 → 只露出底层书架，向导该步骤无任何内容渲染)')
    w('--- 表单字段 ---')
    w(Array.isArray(d.fields) && d.fields.length ? JSON.stringify(d.fields, null, 1) : String(d.fields))
    w('')
  }

  // 引导态：分卷章节划分
  let boot = await capture()
  await emit('[引导态] 分卷章节划分', boot)
  await page.screenshot({ path: path.join(STEP_DIR, 'target_00_分卷boot.png'), fullPage: true }).catch(() => {})

  // 先返回 输入主题 确认主人物/主题多值 (供对照)
  const clickNav = async (nm) => {
    return await page.evaluate((name) => {
      const nav = document.querySelector('.step-nav-scroll'); if (!nav) return 'no-nav'
      const b = Array.from(nav.querySelectorAll('button')).find(x => (x.textContent || '').includes(name))
      if (!b) return 'no-btn'
      b.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }); b.click(); return 'ok'
    }, nm)
  }

  for (let i = 0; i < TARGETS.length; i++) {
    const step = TARGETS[i]
    // 若当前在第 N 步，直接点目标步骤（不按顺序，绕过灵感创作）
    const r = await clickNav(step)
    await page.waitForTimeout(4500)
    // 等该步骤内容稳定（若内容区仍只有书架底噪，说明该步骤未渲染）
    let d = await capture()
    for (let t = 0; t < 4; t++) {
      await page.waitForTimeout(2000)
      const d2 = await capture()
      if (d2.clean !== d.clean) { d = d2 } else break
    }
    await emit(`[步骤 ${TARGETS[i]}] 点击=${r}`, d)
    const safe = 'target_' + String(i + 1).padStart(2, '0') + '_' + step.replace(/[\\/:*?"<>|]/g, '_')
    await page.screenshot({ path: path.join(STEP_DIR, safe + '.png'), fullPage: true }).catch(() => {})
  }

  w('===== AUDIT END =====')
  fs.writeFileSync(OUT, log.join('\n'))
  await ctx.close()
  console.log('DONE v7 size=', fs.statSync(OUT).size)
})().catch(e => { console.error('FATAL', e); process.exit(1) })