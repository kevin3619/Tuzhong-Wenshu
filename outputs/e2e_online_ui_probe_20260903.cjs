// 线上 UI 探针 2026-09-03：#125 草稿箱显示 + 书架现状
// 登录(伪造 JWT) → 首页 dump 书架/草稿箱结构 → 截图
const puppeteer = require('puppeteer-core')
const crypto = require('crypto')
const fs = require('fs')

const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
const SHOTS = 'D:/tuzhongwang/tuzhong/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/outputs/shots_20260903d'
try { fs.mkdirSync(SHOTS, { recursive: true }) } catch (e) {}

const SECRET = 'your_random_jwt_secret_key_here_change_in_production'
function b64u(s) { return Buffer.from(s).toString('base64url') }
const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
const now = Math.floor(Date.now() / 1000)
const p = b64u(JSON.stringify({ userId: 'cms4kz25n0000u318jppccxpv', isAdmin: true, iat: now, exp: now + 86400 }))
const sig = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url')
const TOKEN = h + '.' + p + '.' + sig

const log = (...a) => console.log('[probe]', ...a)

async function main() {
  const ver = await (await fetch('http://127.0.0.1:9333/json/version')).json()
  const browser = await puppeteer.connect({ browserWSEndpoint: ver.webSocketDebuggerUrl, defaultViewport: { width: 1440, height: 2200 } })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 200)))
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200)) })

  try {
    // 1) 登录
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 40000 })
    await page.setCookie({ name: 'token', value: TOKEN, url: BASE })
    await page.evaluate((t) => { try { localStorage.setItem('token', t) } catch (e) {} }, TOKEN)
    await new Promise(r => setTimeout(r, 1500))

    // 2) 首页
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 40000 })
    await page.waitForFunction(() => document.body && document.body.innerText.includes('我的作品'), { timeout: 30000 }).catch(() => log('wait 我的作品 timeout'))
    await new Promise(r => setTimeout(r, 3500))

    // 3) 页面结构 dump
    const dump = await page.evaluate(() => {
      const out = { url: location.href, title: document.title, textHead: '', buttons: [], tabs: [], draftRows: [], novelCards: [] }
      const t = document.body.innerText || ''
      out.textHead = t.slice(0, 700).replace(/\n+/g, ' | ')
      out.buttons = Array.from(document.querySelectorAll('button')).map(b => (b.textContent || '').trim()).filter(x => x && x.length < 20).slice(0, 40)
      const tabSel = Array.from(document.querySelectorAll('[role="tab"], [class*="tab" i]')).map(x => (x.textContent || '').trim()).filter(x => x && x.length < 12).slice(0, 20)
      out.tabs = tabSel
      // 草稿/作品相关行
      const rows = Array.from(document.querySelectorAll('[class*="card" i], [class*="item" i], [class*="row" i], li')).slice(0, 200)
      for (const r of rows) {
        const tx = (r.textContent || '').replace(/\s+/g, ' ').trim()
        if (tx && tx.length < 120 && /草稿|中断|未完成|创作中/.test(tx)) out.draftRows.push(tx)
      }
      for (const r of rows) {
        const tx = (r.textContent || '').replace(/\s+/g, ' ').trim()
        if (tx && tx.length < 80 && /书|传|志|记|录|帝|妃|录|缘/.test(tx) && !out.novelCards.includes(tx)) out.novelCards.push(tx)
      }
      return out
    })
    console.log(JSON.stringify(dump, null, 1).slice(0, 3200))
    await page.screenshot({ path: SHOTS + '/01-home.png' })

    // 4) 找「AI全自动生成」按钮，点击挂载 wizard → dump 草稿箱列表
    const hasAuto = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      const b = btns.find(x => (x.textContent || '').indexOf('AI全自动生成') !== -1)
      if (!b) return false
      b.click(); return true
    })
    log('AI全自动生成 clicked:', hasAuto)
    if (hasAuto) {
      await new Promise(r => setTimeout(r, 6000))
      const wiz = await page.evaluate(() => {
        const out = { textHead: '', draftBoxBtn: false, draftItems: [] }
        const t = document.body.innerText || ''
        const idx = t.indexOf('AI全自动生成')
        out.textHead = (idx >= 0 ? t.slice(Math.max(0, idx - 100), idx + 900) : t.slice(0, 900)).replace(/\n+/g, ' | ')
        out.draftBoxBtn = Array.from(document.querySelectorAll('button')).some(b => /草稿箱/.test(b.textContent || ''))
        const all = document.body.innerText || ''
        const m = all.match(/(未命名草稿|草稿)[^\n]{0,40}/g)
        out.draftItems = m ? Array.from(new Set(m)).slice(0, 15) : []
        return out
      })
      console.log('WIZARD_DUMP=' + JSON.stringify(wiz, null, 1).slice(0, 2600))
      await page.screenshot({ path: SHOTS + '/02-wizard-mounted.png' })
    }

    log('pageerrors:', errors.length ? errors.slice(0, 5) : '无')
  } catch (e) {
    console.error('[FATAL]', e.message)
  }
  await browser.close()
  process.exit(0)
}
main()
