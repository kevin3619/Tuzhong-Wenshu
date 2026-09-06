// 线上端到端 2026-09-03 #125：AI全自动生成 wizard 输入主题即建服务端草稿 → 书架草稿箱可见
// 流程: 登录 → 点「AI全自动生成」→ 填书名+关键词(不点开始,不跑LLM) → ensureDraftNovel 应 POST 建 drafting 记录
//       → 查 /api/novels 断言新草稿 → 回书架点「草稿箱」断言 UI 渲染 → 截图
const puppeteer = require('puppeteer-core')
const crypto = require('crypto')
const fs = require('fs')

const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const SHOTS = 'D:/tuzhongwang/tuzhong/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/outputs/shots_20260903d'
try { fs.mkdirSync(SHOTS, { recursive: true }) } catch (e) {}

const TITLE = '复测草稿125·永历密档'
const KEYWORDS = '南明 永历 明末清初 隐秘历史 权谋 单女主'
const log = (...a) => console.log('[d125]', ...a)

function b64u(s) { return Buffer.from(s).toString('base64url') }
const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
const now = Math.floor(Date.now() / 1000)
const p = b64u(JSON.stringify({ userId: 'cms4kz25n0000u318jppccxpv', isAdmin: true, iat: now, exp: now + 86400 }))
const sig = crypto.createHmac('sha256', 'your_random_jwt_secret_key_here_change_in_production').update(h + '.' + p).digest('base64url')
const TOKEN = h + '.' + p + '.' + sig

let PASS = 0, FAIL = 0
function rep(ok, name, detail) { console.log((ok ? '✅ PASS ' : '❌ FAIL ') + name + (detail ? ' | ' + detail : '')); ok ? PASS++ : FAIL++ }

async function apiNovels() {
  const r = await fetch(BASE + '/api/novels', { headers: { Authorization: 'Bearer ' + TOKEN } })
  const j = await r.json().catch(() => ({}))
  const list = (j && (j.data || j.list || j)) || []
  return Array.isArray(list) ? list : ((list.items || []))
}

async function main() {
  const ver = await (await fetch('http://127.0.0.1:9333/json/version')).json()
  const browser = await puppeteer.connect({ browserWSEndpoint: ver.webSocketDebuggerUrl, defaultViewport: { width: 1440, height: 2200 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 150)))

  try {
    // 0) 记基线：现有 drafting 数
    const before = await apiNovels()
    const beforeDrafts = before.filter(n => String(n.status || '').includes('draft')).length
    log('基线: novels total=' + before.length + ' drafting=' + beforeDrafts)

    // 1) 登录
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 40000 })
    await page.setCookie({ name: 'token', value: TOKEN, url: BASE })
    await page.evaluate(t => { try { localStorage.setItem('token', t) } catch (e) {} }, TOKEN)
    await new Promise(r => setTimeout(r, 1500))

    // 2) 首页 → 点 AI全自动生成
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 40000 })
    await page.waitForFunction(() => document.body && document.body.innerText.includes('我的作品'), { timeout: 30000 }).catch(() => {})
    await new Promise(r => setTimeout(r, 2500))
    const clicked = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent || '').indexOf('AI全自动生成') !== -1)
      if (!b) return false; b.click(); return true
    })
    rep(clicked, '点击 AI全自动生成 挂载 wizard', '')

    // 3) 填书名 + 关键词（触发 #125 Effect：自动分配 id + ensureDraftNovel）
    const filled = await page.evaluate(([title, kw]) => {
      const setV = (el, v) => {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      const wait = (ms) => new Promise(r => setTimeout(r, ms))
      return (async () => {
        // 等 keywords textarea 出现（wizard 输入主题步）
        for (let i = 0; i < 40; i++) {
          const ta = document.querySelector('textarea[name="keywords"]')
          if (ta) break
          await wait(500)
        }
        const ta = document.querySelector('textarea[name="keywords"]')
        if (!ta) return 'NO_KEYWORDS_TA'
        const inputs = Array.from(document.querySelectorAll('input'))
        const titleInput = inputs.find(x => (x.placeholder || '').indexOf('留空则由AI自动生成最匹配的书名') !== -1)
        if (titleInput) setV(titleInput, title)
        setV(ta, kw)
        // 主角姓名输入（可选，稳定触发详细设计）——先只保证触发条件成立
        await wait(600)
        // 🔥 2026-09-03 #125R4：模拟 effect 双触发（React 连续渲染时 id 分配 effect 会跑 2 次）。
        //   再次 setV 相同值触发一轮新的 input → effect 依赖数组变化 → 第二次 ensureDraftNovel 调用。
        //   R3（组件内 IIFE 锁）在此场景仍会重复 POST 建 2 条草稿（线上实测）；R4 模块级锁必须收敛为 1 条。
        setV(ta, kw + ' ')
        await wait(400)
        setV(ta, kw)
        await wait(400)
        return { hasTitle: !!titleInput, taLen: ta.value.length }
      })()
    }, [TITLE, KEYWORDS])
    log('fill result:', JSON.stringify(filled))
    rep(filled && filled.taLen > 0, 'wizard 主题输入完成（未点开始，不跑 LLM）', '')

    // 4) 等 fire-and-forget ensureDraftNovel 完成
    await new Promise(r => setTimeout(r, 8000))
    await page.screenshot({ path: SHOTS + '/03-draft-input-filled.png' })

    // 5) API 断言：服务端出现 status=drafting 的新草稿（R4：多次 effect 触发后必须【恰好 1 条】，不允许重复）
    const after = await apiNovels()
    const newDraft = after.filter(n => String(n.status || '').includes('draft') && (n.title || '').indexOf('复测草稿125') !== -1)
    rep(newDraft.length === 1, '服务端 /api/novels 出现新 drafting 草稿（幂等：恰好1条）', newDraft.length + ' 条 title=' + (newDraft[0] && newDraft[0].title) + ' id=' + (newDraft[0] && newDraft[0].id))
    const draftId = newDraft.length ? newDraft[0].id : ''

    // 6) 回书架 → 草稿箱 UI 断言
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 40000 })
    await new Promise(r => setTimeout(r, 3000))
    await page.screenshot({ path: SHOTS + '/04-shelf-home.png' })
    const boxClicked = await page.evaluate((title) => {
      const btns = Array.from(document.querySelectorAll('button, [role="tab"], a'))
      const b = btns.find(x => (x.textContent || '').trim() === '草稿箱' || ((x.textContent || '').trim().indexOf('草稿箱') !== -1 && (x.textContent || '').trim().length < 10))
      if (!b) return false
      b.click(); return true
    }, TITLE)
    log('书架草稿箱点击:', boxClicked)
    await new Promise(r => setTimeout(r, 3500))
    const draftUI = await page.evaluate(() => {
      const t = document.body.innerText || ''
      return { hasTitle: t.indexOf('复测草稿125') !== -1, hasDraftLabel: /草稿|中断|创作中|进行中/.test(t), around: (() => { const i = t.indexOf('复测草稿125'); return i >= 0 ? t.slice(Math.max(0, i - 120), i + 260).replace(/\n+/g, ' | ') : t.slice(0, 400).replace(/\n+/g, ' | ') })() }
    })
    console.log('DRAFT_UI=' + JSON.stringify(draftUI, null, 1).slice(0, 900))
    rep(draftUI.hasTitle, '书架草稿箱 UI 显示该中断草稿（含标题）', '')
    await page.screenshot({ path: SHOTS + '/05-draftbox-listed.png' })

    log('创建草稿 id =', draftId, '（用于后续清理）')
    console.log('RESULT PASS=' + PASS + ' FAIL=' + FAIL)
  } catch (e) {
    console.error('[FATAL]', e.message)
    console.log('RESULT PASS=' + PASS + ' FAIL=' + FAIL)
  }
  await browser.close()
  process.exit(FAIL ? 1 : 0)
}
main()
