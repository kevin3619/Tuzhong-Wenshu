// 2026-09-03 任务#114 端到端真渲：徽章 title 取「用户详细设定钦定身份」而非 LLM 正史头衔
// 流程：登录(本地 dev JWT) → 首页注入夹具(localStorage) → 拦截 removeItem → 点「AI全自动生成」挂载 wizard
//       → wizard mount 恢复 characters 步 + 以 detailedDesignInput 重归一化 → 断言徽章文案
const puppeteer = require('puppeteer-core')
const crypto = require('crypto')

const BASE = 'http://localhost:3001/tuzhong-wenshu'
const SHOTS = 'D:/tuzhongwang/tuzhong/途中文枢 (Tuzhong Wenshu) - AI 小说写作助手/outputs/shots_20260903c'
const fs = require('fs')
try { fs.mkdirSync(SHOTS, { recursive: true }) } catch (e) {}

// ---------- JWT（手工 HS256，与 jose 签发等价） ----------
const SECRET = 'your_random_jwt_secret_key_here_change_in_production'
function b64url(s) { return Buffer.from(s).toString('base64url') }
function signJwt(userId, isAdmin) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ userId, isAdmin, iat: now, exp: now + 7 * 86400 }))
  const sig = crypto.createHmac('sha256', SECRET).update(header + '.' + payload).digest('base64url')
  return header + '.' + payload + '.' + sig
}
const TOKEN = signJwt('cms4kz25n0000u318jppccxpv', true)

// ---------- 夹具 ----------
const DESIGN =
  '明末永历朝历史架空。主要人物按真实身份标注：朱由榔(永历帝)、沈云姝(永历女官，谋主)、吴三桂(满清平西王)、多尔衮(满清睿亲王)、李定国(大西军晋王)、史可法(兵部尚书)、郑成功(国姓爷)、王太后(皇太后)、沐天波(黔国公)、焦琏(新兴侯)。'

function ch(name, rolePosition, role, gender, aliases, identity, extra) {
  return Object.assign({
    id: 'fx-' + name, name, rolePosition, role, gender, age: role === '长辈' ? 45 : 28,
    identity, aliases, background: identity, appearance: '—', personality: '—',
    skills: [], attributes: { strength: 60, intelligence: 60, command: 60, politics: 60, charm: 60 },
  }, extra || {})
}
// 模拟「后端 LLM 输出」：aliases/identity 为 LLM 按正史知识填的（含错误头衔），title 留空等待前端推导
const FIXTURE = {
  protagonist: ch('朱由榔', '主角', '主角', '男', '永历帝', '永历阵营（主角阵营）皇帝，南明永历天子，颠沛流离仍矢志复明。'),
  femaleLead: ch('沈云姝', '女主', '女主', '女', '云姝', '永历阵营（主角阵营）才女谋主，出身江南书香门第。'),
  femaleLeads: [],
  antagonist: ch('吴三桂', '反派', '反派', '男', '平西王', '清军阵营（敌对）平西王，开关引清的前明总兵。'),
  antagonists: [],
  supporting: [
    ch('多尔衮', '反派', '反派', '男', '摄政王，皇叔父摄政王', '清军阵营（敌对）摄政王，满洲开国摄政、铁腕权臣。'),
    ch('李定国', '忠臣武将', '配角', '男', '延平王，小尉迟', '永历阵营（主角阵营）忠臣武将，大西军晋王，两蹶名王。'),
    ch('史可法', '忠臣文官', '配角', '男', '东阁大学士', '南明阵营（主角阵营）忠臣文官，督师江北、守扬州孤城。'),
    ch('郑成功', '武将', '配角', '男', '延平王，国姓爷', '延明阵营（主角阵营）海疆统帅，据台抗清、拥立永历。'),
    ch('王太后', '长辈', '配角', '女', '太皇太后', '永历阵营（主角阵营）太后，明思宗妃嫔，永历帝嫡母。'),
    ch('沐天波', '忠臣武将', '配角', '男', '黔国公', '永历阵营（主角阵营）国公，镇守滇中的黔国公爵主。'),
    ch('焦琏', '武将', '配角', '男', '新兴侯', '永历阵营（主角阵营）将领，南明忠勇悍将。'),
  ],
  _harem: null,
}
const GEN_DATA = {
  idea: { title: '永历之刃', genre: '历史架空', userDesign: DESIGN },
  worldbuilding: { era: '明末清初', coreSettings: '南明永历朝' },
  powerSystem: null,
  synopsis: null,
  outline: null,
  characters: FIXTURE,
  factions: null,
  relationships: null,
  keyPlots: null,
  chapters: null,
}

// ---------- 预期 ----------
const EXPECT = {
  多尔衮: '满清睿亲王',
  李定国: '大西军晋王',
  史可法: '兵部尚书',
  郑成功: '国姓爷',
  王太后: '皇太后',
  沐天波: '黔国公',
  焦琏: '新兴侯',
  朱由榔: '永历帝',
  吴三桂: '满清平西王',
}

async function main() {
  const ver = await (await fetch('http://127.0.0.1:9333/json/version')).json()
  const browser = await puppeteer.connect({ browserWSEndpoint: ver.webSocketDebuggerUrl, defaultViewport: { width: 1440, height: 1200 } })
  const page = await browser.newPage()
  const log = (...a) => console.log('[e2e]', ...a)
  try {
    // 1) 登录态：先落在 /login（公开页）写 cookie + localStorage
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.setCookie({ name: 'token', value: TOKEN, domain: 'localhost', path: '/' })
    await page.evaluate((t) => { localStorage.setItem('token', t) }, TOKEN)
    await new Promise(r => setTimeout(r, 1200))

    // 2) 首页
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForFunction(() => document.body && document.body.innerText.includes('我的作品'), { timeout: 20000 }).catch(() => log('wait home content timeout'))
    await new Promise(r => setTimeout(r, 2500))

    // 3) 拦截 removeItem（保住夹具 key），再写夹具
    await page.evaluate(() => {
      const orig = Storage.prototype.removeItem
      Storage.prototype.removeItem = function (key) {
        if (typeof key === 'string' && key.indexOf('tuzhong-') === 0) return
        return orig.call(this, key)
      }
    })
    await page.evaluate(([step, theme, gen]) => {
      localStorage.setItem('tuzhong-current-step', step)
      localStorage.setItem('tuzhong-theme-input', JSON.stringify(theme))
      localStorage.setItem('tuzhong-generated-data', JSON.stringify(gen))
      localStorage.setItem('tuzhong-active-novel-id', 'utitle-fixture')
    }, ['characters',
      { keywords: ['历史架空'], genre: '历史架空', detailedDesignInput: DESIGN, protagonistName: '朱由榔', userBookTitle: '永历之刃', protagonistGender: '男', protagonistAge: '27', protagonistIdentity: '永历帝', creationMode: 'full' },
      GEN_DATA])

    // 4) 点「AI全自动生成」挂载 wizard（其内部 removeItem 被拦截，夹具保留 → mount 恢复 characters 步）
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      const b = btns.find(x => (x.textContent || '').indexOf('AI全自动生成') !== -1)
      if (!b) return false
      b.click(); return true
    })
    log('AI全自动生成 clicked:', clicked)
    if (!clicked) throw new Error('button not found')

    // 5) 等待 characters 步卡片出现（主角姓名输入框）
    await page.waitForFunction(() => {
      const ins = Array.from(document.querySelectorAll('input.font-bold'))
      return ins.some(i => (i.value || '').trim() === '朱由榔')
    }, { timeout: 30000 }).catch(async () => { log('wait 朱由榔 timeout — dump body text head'); const t = await page.evaluate(() => document.body.innerText.slice(0, 600)); log(t) })
    await new Promise(r => setTimeout(r, 1500))

    // 6) 采集 姓名→徽章
    const map = await page.evaluate(() => {
      const out = {}
      document.querySelectorAll('div[class*="rounded-2xl"]').forEach((card) => {
        const nameInput = card.querySelector('input.font-bold')
        if (!nameInput) return
        const nm = (nameInput.value || '').trim()
        if (!nm) return
        let bt = nameInput.previousElementSibling
        let btxt = ''
        if (bt) {
          if (bt.tagName === 'BUTTON') btxt = (bt.textContent || '').replace(/✎/g, '').trim()
          else if (bt.tagName === 'INPUT') btxt = (bt.value || '').trim()
        }
        if (out[nm] && btxt === '') return
        out[nm] = btxt
      })
      return out
    })
    log('badge map:', JSON.stringify(map, null, 0))

    // 7) 断言
    let pass = 0, fail = 0
    const failRows = []
    for (const nm of Object.keys(EXPECT)) {
      const got = map[nm]
      if (got === EXPECT[nm]) { pass++; log('PASS', nm, '→', got) }
      else { fail++; failRows.push({ nm, expect: EXPECT[nm], got: got || '(无)' }); log('FAIL', nm, 'expect', EXPECT[nm], 'got', got || '(无)') }
    }
    console.log(`\n[e2e] ${pass}/${pass + fail} PASS`)
    if (failRows.length) console.log('[e2e] failures:', JSON.stringify(failRows, null, 2))

    // 8) 截图证据（viewport 截图，禁 fullPage）
    const shots = []
    const el = await page.evaluateHandle(() => {
      const ins = Array.from(document.querySelectorAll('input.font-bold'))
      const it = ins.find(i => (i.value || '').trim() === '朱由榔')
      if (!it) return null
      return it.closest('div[class*="rounded-2xl"]') || it
    })
    if (el) { await el.asElement().scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 600)) }
    const p1 = SHOTS + '/a-protagonist-title.png'
    await page.screenshot({ path: p1 })
    shots.push(p1)
    // supporting 区域截图：找李定国卡
    const el2 = await page.evaluateHandle(() => {
      const ins = Array.from(document.querySelectorAll('input.font-bold'))
      const it = ins.find(i => (i.value || '').trim() === '李定国')
      return it ? (it.closest('div[class*="rounded-2xl"]') || it) : null
    })
    if (el2) { await el2.asElement().scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 600)) }
    const p2 = SHOTS + '/b-supporting-title.png'
    await page.screenshot({ path: p2 })
    shots.push(p2)
    console.log('[e2e] shots:', shots.join('\n'))
    process.exitCode = fail === 0 ? 0 : 1
  } catch (e) {
    console.error('[e2e] error:', e)
    try { await page.screenshot({ path: SHOTS + '/error.png' }) } catch (_) {}
    process.exitCode = 2
  } finally {
    try { await browser.close() } catch (e) { }
  }
}

main()
