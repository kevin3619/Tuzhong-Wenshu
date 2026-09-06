// 最终复测：草稿《永历中兴》4个原始问题逐一验证
// 1) 思维导图模型显示  2) 主角高级设置  3) 势力设置字段  4) 分卷章节卷配置
const { chromium } = require('playwright-core')
const path = require('path')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1500, height: 960 },
  })
  let page = null
  for (const p of ctx.pages()) {
    const t = await p.evaluate(() => (document.body.textContent || '').slice(0, 80)).catch(() => '')
    if (t.includes('分卷章节划分') || t.includes('输入主题') || t.includes('返回书架')) { page = p; break }
  }
  if (!page) {
    page = ctx.pages()[0] || await ctx.newPage()
    page.setDefaultTimeout(10000)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
  }
  page.setDefaultTimeout(10000)

  // 进入向导
  let inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
  if (!inWizard) {
    const backBtn = page.locator('button:has-text("返回书架")').first()
    if (await backBtn.count()) { await backBtn.click(); await page.waitForTimeout(2500) }
    const dbtn = page.locator('button:has-text("草稿箱")').first()
    if (await dbtn.count()) { await dbtn.click(); await page.waitForTimeout(2500) }
    for (let i = 0; i < 20; i++) {
      const draftCard = page.locator('text=永历中兴').first()
      if (await draftCard.count()) {
        const card = draftCard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or contains(@class,"rounded")][1]')
        const gen = card.locator('button:has-text("继续生成")').first()
        if (await gen.count()) { await gen.click({ timeout: 8000 }).catch(() => {}) } else { await draftCard.click({ timeout: 8000 }).catch(() => {}) }
        break
      }
      await page.waitForTimeout(1500)
    }
    for (let i = 0; i < 30; i++) {
      inWizard = await page.evaluate(() => (document.body.textContent || '').includes('分卷章节划分')).catch(() => false)
      if (inWizard) break
      await page.waitForTimeout(1000)
    }
  }
  console.log('IN_WIZARD=' + inWizard + ' URL=' + page.url())

  // ============ 问题1：思维导图模型显示 ============
  // 先检查 stepModels 是否恢复（localStorage）
  const stepModelsState = await page.evaluate((nid) => {
    const out = { lsKey: '', models: null, uiShows: false, uiSnippet: '' }
    const aid = localStorage.getItem('tuzhong-active-novel-id') || 'global'
    out.lsKey = 'tuzhong-step-models-' + aid
    try {
      const raw = localStorage.getItem(out.lsKey)
      if (raw) out.models = JSON.parse(raw)
    } catch (e) { out.models = 'ERR' }
    // 检查 UI 是否显示模型
    const body = (document.body.textContent || '').replace(/\s+/g, ' ')
    const m = /(模型|Model)[：:\s]*([A-Za-z0-9.\-]+(?:\s*\/\s*[A-Za-z0-9.\-]+)?)/.exec(body)
    out.uiShows = !!m
    out.uiSnippet = body.slice(0, 200)
    return out
  }, NID)
  console.log('===== 问题1 思维导图模型 =====')
  console.log(JSON.stringify(stepModelsState, null, 1))

  // ============ 问题2：主角高级设置 ============
  // 进入主要人物设定
  const charBtn = page.locator('button').filter({ hasText: '主要人物设定' }).first()
  if (await charBtn.count()) { await charBtn.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3000) }
  const charState = await page.evaluate(() => {
    const out = { advBtn: false, advModal: false, fields: {}, truncation: [] }
    const body = (document.body.textContent || '').replace(/\s+/g, ' ')
    out.advBtn = /高级设置|高级选项/.test(body)
    // 点击高级设置按钮
    return out
  })
  // 尝试点击主角的高级设置按钮
  const advBtn = page.locator('button:has-text("高级设置")').first()
  const advCount = await advBtn.count()
  if (advCount) { await advBtn.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(2000) }
  const advState = await page.evaluate(() => {
    const body = (document.body.textContent || '').replace(/\s+/g, ' ')
    const out = { open: false, inputs: {}, truncated: [] }
    // 检查输入框
    const inputs = Array.from(document.querySelectorAll('input,textarea,select'))
    out.inputCount = inputs.length
    inputs.slice(0, 30).forEach((el, i) => {
      const ph = el.getAttribute('placeholder') || ''
      const val = (el.value || '').trim()
      const label = (el.getAttribute('data-label') || ph || ('field' + i)).slice(0, 20)
      if (ph) out.inputs['ph_' + label] = val.slice(0, 40) || '(empty)'
      if (val && /\.\.\.|…|待定|暂无|基于本作|此处填写|XX/.test(val)) out.truncated.push({ label, val: val.slice(0, 40) })
    })
    out.modalVisible = /高级设置/.test(body) && out.inputCount > 0
    return out
  })
  console.log('===== 问题2 主角高级设置 =====')
  console.log('advBtnCount=' + advCount)
  console.log(JSON.stringify(advState, null, 1))
  await page.screenshot({ path: 'final_adv.png', fullPage: false })

  // ============ 问题3：势力设置 ============
  const facBtn = page.locator('button').filter({ hasText: '势力设定' }).first()
  if (await facBtn.count()) { await facBtn.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3000) }
  const facState = await page.evaluate(() => {
    const out = { powerRanks: [], strengthTiers: [], emptySelects: 0, emptyInputs: 0, factionNames: [] }
    document.querySelectorAll('select').forEach(sel => {
      const opts = Array.from(sel.options).map(o => o.value)
      const val = sel.value
      if (String(val).includes('势力') || opts.some(o => String(o).includes('势力'))) {
        out.powerRanks.push({ val: String(val).slice(0, 20), opts: opts.slice(0, 8) })
      }
      if (opts.includes('SSS') || opts.includes('A')) {
        out.strengthTiers.push({ val: String(val).slice(0, 20) })
      }
      if (!sel.value) out.emptySelects++
    })
    document.querySelectorAll('input,textarea').forEach(el => {
      if (!(el.value || '').trim() && !el.getAttribute('placeholder')) out.emptyInputs++
    })
    // 势力名称
    const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
    const nameRe = /([\u4e00-\u9fa5A-Za-z]{2,12}集团|[\u4e00-\u9fa5A-Za-z]{2,12}朝廷|[\u4e00-\u9fa5A-Za-z]{2,12}军团|[\u4e00-\u9fa5A-Za-z]{2,12}政权|[\u4e00-\u9fa5A-Za-z]{2,12}军)/g
    out.factionNames = Array.from(new Set((txt.match(nameRe) || []).slice(0, 20)))
    return out
  }).catch(e => 'ERR:' + e.message)
  console.log('===== 问题3 势力设置 =====')
  console.log(JSON.stringify(facState, null, 1))
  await page.screenshot({ path: 'final_factions.png', fullPage: false })

  // ============ 问题4：分卷章节 ============
  const chapBtn = page.locator('button').filter({ hasText: '分卷章节划分' }).first()
  const cc = await chapBtn.count()
  console.log('===== 问题4 分卷章节 =====')
  if (cc) {
    const st = await chapBtn.evaluate(el => ({ disabled: el.disabled, cls: String(el.className).slice(0, 80) }))
    console.log('chapBtn state=' + JSON.stringify(st))
    if (!st.disabled) {
      await chapBtn.click({ timeout: 8000 }).catch(e => console.log('CLICK_ERR', e.message.split('\n')[0]))
      await page.waitForTimeout(4000)
      const after = await page.evaluate(() => {
        const txt = (document.body.textContent || '').replace(/\s+/g, ' ')
        // 收集卷配置
        const volCountMatch = /(卷数设置|总卷数|分卷数量|设置卷数)[：:\s]*(\d+)/.exec(txt)
        const volTitles = (txt.match(/第[一二三四五六七八九十\d]+卷[：:：\s]*[^。；，]{2,20}/g) || []).slice(0, 10)
        return {
          head: txt.slice(0, 160),
          hasVolumeCount: /卷数设置|总卷数/.test(txt),
          volCount: volCountMatch ? volCountMatch[2] : null,
          hasVolTitle: /卷标题/.test(txt),
          hasVolSummary: /卷摘要/.test(txt),
          hasGenFromConfig: /按此配置生成|生成章节/.test(txt),
          hasWarn: /部分卷数据不完整|数据为空/.test(txt),
          volTitles: volTitles.slice(0, 8),
        }
      })
      console.log('AFTER_CHAP_CLICK=' + JSON.stringify(after, null, 1))
      await page.screenshot({ path: 'final_chapters.png', fullPage: false })
    }
  } else {
    const navs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button'))
        .map(b => (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24))
        .filter(t => t && !/草稿箱|新建|全自动|收起|继续生成|删除|🗑/.test(t))
        .slice(0, 40)
    })
    console.log('NO chapBtn, navs=' + JSON.stringify(navs, null, 1))
  }

  await ctx.close()
})().catch(e => { console.error('FATAL', e); process.exit(1) })
