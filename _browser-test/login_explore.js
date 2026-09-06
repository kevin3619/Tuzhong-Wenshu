// 登录 + 进入草稿箱《永历中兴》，dump 书架/草稿箱 DOM
const { chromium } = require('playwright-core')
const BASE = 'https://tuzhongwang.xyz/tuzhong-wenshu'
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const logs = []
  page.on('console', m => logs.push(m.text().slice(0,300)))
  page.on('pageerror', e => logs.push('PAGEERR: '+e.message))

  // 1. 登录页
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e=>console.log('GOTO1',e.message))
  await page.waitForTimeout(3000)
  // 切到密码登录
  const toggles = page.locator('button:has-text("账号密码登录")')
  const togglesCount = await toggles.count().catch(()=>0)
  if (togglesCount > 0) { await toggles.first().click(); await page.waitForTimeout(800) }
  // 填充
  await page.fill('input[placeholder*="用户名"]', 'kevin').catch(e=>console.log('FILLU',e.message))
  await page.fill('input[placeholder*="密码"]', 'leiyang0').catch(e=>console.log('FILLP',e.message))
  await page.locator('button[type="submit"]:has-text("登录")').first().click().catch(e=>console.log('SUBMIT',e.message))
  await page.waitForTimeout(4000)
  console.log('AFTER_LOGIN_URL=', page.url())

  // 2. 进入草稿箱
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e=>console.log('GOTO2',e.message))
  await page.waitForTimeout(3000)
  // 点击草稿箱
  let clicked = 0
  const draftBtn = page.locator('button:has-text("草稿箱")')
  const dbc = await draftBtn.count().catch(()=>0)
  if (dbc>0) { await draftBtn.first().click(); clicked=1; await page.waitForTimeout(2500) }
  console.log('DRAFT_CLICKED=', clicked, 'URL=', page.url())
  const body = await page.evaluate(()=>document.body.innerText.slice(0,6000)).catch(e=>'ERR'+e.message)
  console.log('========== BOOKSHELF/DRAFT BODY ==========')
  console.log(body)
  // 查找 永历 相关可点击元素
  const yongli = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'))
    return els.filter(e => e.children.length===0 && /永历/.test(e.textContent||'')).map(e=>({tag:e.tagName, cls:(e.className||'').toString().slice(0,40), txt:(e.textContent||'').trim().slice(0,30)})).slice(0,20)
  }).catch(e=>'ERR'+e.message)
  console.log('========== 永历 mentions ==========')
  console.log(JSON.stringify(yongli, null, 1))
  console.log('========== LINKS ==========')
  const links = await page.evaluate(()=>Array.from(document.querySelectorAll('a[href]')).map(a=>a.getAttribute('href')).filter(h=>h&&h!='#').slice(0,60))
  console.log(JSON.stringify(links,null,1))
  console.log('========== CONSOLE TAIL ==========')
  console.log(logs.slice(-15).join('\n'))
  await browser.close()
})().catch(e=>{console.error('FATAL',e);process.exit(1)})