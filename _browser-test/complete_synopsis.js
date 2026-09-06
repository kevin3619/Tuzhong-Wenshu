// 补齐 synopsis 缺失的 6 个字段（页面内 GET→修复→POST batch，避免覆盖已有内容）
const { chromium } = require('playwright-core')
const path = require('path')
const USER_DATA_DIR = path.join(__dirname, '..', '_browser-profile')
const NID = '40249ecb-3bf6-434c-ad94-15dfeabc88ea'
const API = '/tuzhong-wenshu/api/settings'
const SNAME = '朱由榔'

const intro = '21世纪程序员雨田诺，因熬夜猝死魂穿明末，附身桂王世子朱由榔。知晓历史走向，绑定大明中兴签到系统，每日签到得奖励、查历史先知、视属性面板。从肇庆即位到昆明扎根，从两蹶名王到饮马长江，从收复北京到灭族满清，再到殖民全球建立日不落帝国。每一个让炎黄子孙憋屈的历史节点，他都要亲手逆转：扬州十日反杀清军，剃发易服复我衣冠，吴三桂跪地求饶，日本天皇俯首称臣，欧洲列强瑟瑟发抖。'

;(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'msedge', headless: true, args: ['--no-sandbox'], viewport: { width: 1200, height: 800 },
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto('https://tuzhongwang.xyz/tuzhong-wenshu', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const res = await page.evaluate(async ({ api, nid, SNAME, intro }) => {
    const token = localStorage.getItem('token') || ''
    const g = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } })
    const gj = await g.json()
    const synopsis = (gj && (gj.data || gj))?.synopsis || {}
    // 补齐 6 个字段
    const hook = '大明崇祯末年，现代程序员雨田诺猝死魂穿桂王世子朱由榔。刚睁眼，城破家亡、清军铁蹄已至城下——他脑海中的大明中兴签到系统骤然亮起，第一份奖励竟是扬州守军的完整城防火器图。当世人都认定南明气数已尽，他却要在群狼环伺中，把一盘死局杀回万里江山。'
    const golden = '王朝气数将尽，我便逆天改命；天下衣冠易主，我自重铸汉统——签到一天，复兴一日！'
    const perVersion = '【签到系统×历史中兴】程序员魂穿朱由榔，绑定大明中兴签到系统：每日签到领火器图样、粮草补给、先知先觉。扬州十日反手登基，两蹶名王饮马长江，从肇庆到昆明，从收复北京到日不落帝国，每一个憋屈的历史节点都被他亲手逆转——点击就送满清投降全体套餐！'
    const targetReader = '喜欢穿越历史、签到系统、国运争霸题材的读者；对明清鼎革、抗清中兴情怀有共鸣的男频读者；偏好碾压式爽点、单女主、种田升级流和科技降维打击的受众。'

    synopsis.openingHook = synopsis.openingHook || hook
    synopsis.coreGoldenQuote = synopsis.coreGoldenQuote || golden
    synopsis.goldenQuote = synopsis.goldenQuote || ('「' + SNAME + '」愿以一身担起天下中兴之念——山河为卷，岁月为墨。')
    synopsis.fanqieVersion = synopsis.fanqieVersion || perVersion
    synopsis.qidianVersion = synopsis.qidianVersion || intro
    synopsis.targetReaderProfile = synopsis.targetReaderProfile || targetReader

    // 确保 suspenseSetup 为数组
    if (!Array.isArray(synopsis.suspenseSetup) || synopsis.suspenseSetup.length === 0) {
      synopsis.suspenseSetup = ['系统来源之谜：大明中兴签到系统从何而来，为何选中朱由榔', '朝堂权谋：东林党与楚党的党争是否会将中兴大业拖入深渊', '清军降将吴三桂的走向，是否会成为最大变数']
    }
    // 附带补齐 idea
    let idea = (gj && (gj.data || gj))?.idea || {}
    const ideaFix = (k, v) => { if (!idea[k] || String(idea[k]).trim() === '') idea[k] = v }
    ideaFix('genre', '历史架空/男频爽文')
    ideaFix('style', '热血、碾压式爽点、种田经营、科技降维')

    const p = await fetch(api, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ novelId: nid, type: 'batch', synopsis, idea }),
    }).catch(e => ({ err: e.message }))
    if (p.err) return { err: p.err }
    const pj = await p.json().catch(() => ({ raw: p.status }))
    // 验证
    const vg = await fetch(api + '?novelId=' + nid, { headers: { Authorization: 'Bearer ' + token } })
    const vj = await vg.json()
    const vs = (vj && (vj.data || vj))?.synopsis || {}
    const emptyKeys = ['openingHook','coreGoldenQuote','goldenQuote','fanqieVersion','qidianVersion','targetReaderProfile'].filter(k => !vs[k] || !String(vs[k]).trim())
    const vi = (vj && (vj.data || vj))?.idea || {}
    return { postStatus: p.status, synopsisEmptyKeys: emptyKeys, genre: vi.genre, style: vi.style, suspenseLen: Array.isArray(vs.suspenseSetup) ? vs.suspenseSetup.length : -1 }
  }, { api: API, nid: NID, SNAME, intro })
  console.log('COMPLETE_SYNOPSIS=', JSON.stringify(res))
  await ctx.close()
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })