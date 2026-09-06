/**
 * 真实历史人物「徽章（身份头衔）」正史取值模块
 *
 * 背景（用户反馈）：历史/架空历史题材里，真实历史人物的官职爵位是**可查证的事实**，
 * 交给 LLM 自由发挥会出错（如把刘文秀写成"大西军将领"、阎应元写成"江阴"），
 * 反复校正也不如直接取正史/权威史料的定称。
 *
 * 三级取值优先级：
 *   1) 正史职衔表（本文件，离线、确定、零延迟）—— 命中即采用，覆盖 LLM 结果
 *   2) 权威百科查证（百度百科人物词条的官职/爵位字段，结果本地缓存）—— 表内没有时异步查
 *   3) LLM 生成 —— 只用于虚构人物与表/百科都取不到头衔的情况
 *
 * 表内条目一律采用史书定称（《明史》《清史稿》《南明史》等），来源字段标注依据。
 */

export interface HistoricalTitle {
  /** 史书定称，作为徽章文案 */
  title: string
  /** 朝代/政权，用于题材匹配 */
  dynasty: string
  /** 依据来源，便于溯源与人工核对 */
  src: string
}

/**
 * 正史职衔表：只收录有明确史书记载封爵/官职的人物，宁缺毋滥。
 * 同名多身份时取其最著名、最能标识身份的定称。
 */
export const HISTORICAL_TITLES: Record<string, HistoricalTitle> = {
  // ===== 南明 / 明末清初（永历、弘光、隆武、绍武、大西、清方）=====
  '朱由榔': { title: '永历帝', dynasty: '南明', src: '南明史·永历本纪' },
  '由榔': { title: '永历帝', dynasty: '南明', src: '南明史' },
  '朱由崧': { title: '弘光帝', dynasty: '南明', src: '明史·福王传；南明史' },
  '朱聿键': { title: '隆武帝', dynasty: '南明', src: '南明史·唐王本纪' },
  '朱聿鐭': { title: '绍武帝', dynasty: '南明', src: '南明史·绍武' },
  '监国鲁王': { title: '鲁监国', dynasty: '南明', src: '南明史·鲁王监国' },
  '朱以海': { title: '鲁监国', dynasty: '南明', src: '南明史' },
  '李定国': { title: '晋王', dynasty: '南明', src: '明史·李定国传；永历实录封晋王' },
  '孙可望': { title: '秦王', dynasty: '南明', src: '永历实录；孙可望降明封秦王' },
  '刘文秀': { title: '南川王', dynasty: '南明', src: '明史·刘文秀传' },
  '艾能奇': { title: '定北将军', dynasty: '大西', src: '明史·张献忠传（四将军之一）' },
  '张献忠': { title: '大西皇帝', dynasty: '大西', src: '明史·张献忠传；称帝于成都' },
  '李自成': { title: '大顺皇帝', dynasty: '大顺', src: '明史·李自成传；称帝于西安' },
  '史可法': { title: '兵部尚书', dynasty: '南明', src: '明史·史可法传（武英殿大学士督师）' },
  '瞿式耜': { title: '东阁大学士', dynasty: '南明', src: '明史·瞿式耜传（兵部尚书衔督广西）' },
  '何腾蛟': { title: '大学士', dynasty: '南明', src: '明史·何腾蛟传（东阁大学士督师）' },
  '堵胤锡': { title: '兵部尚书', dynasty: '南明', src: '南明史·堵胤锡传' },
  '黄道周': { title: '武英殿大学士', dynasty: '南明', src: '明史·黄道周传（隆武朝）' },
  '张煌言': { title: '兵部尚书', dynasty: '南明', src: '南明史·张煌言传（后加大学士）' },
  '阎应元': { title: '典史', dynasty: '明', src: '明史·阎应元传（江阴典史）' },
  '黄淳耀': { title: '进士', dynasty: '明', src: '明史·黄淳耀传（崇祯癸未进士）' },
  '焦琏': { title: '总兵', dynasty: '南明', src: '南明史·焦琏传（广西总兵）' },
  '庞天寿': { title: '司礼监太监', dynasty: '南明', src: '南明史（永历朝司礼监）' },
  '马士英': { title: '东阁大学士', dynasty: '南明', src: '明史·马士英传（兼兵部尚书）' },
  '阮大铖': { title: '兵部尚书', dynasty: '南明', src: '明史·阮大铖传（弘光朝）' },
  '左良玉': { title: '宁南伯', dynasty: '明', src: '明史·左良玉传' },
  '高杰': { title: '兴平伯', dynasty: '南明', src: '明史·高杰传' },
  '郑芝龙': { title: '同安侯', dynasty: '南明', src: '清史稿·郑芝龙传（降清封同安侯）' },
  '郑成功': { title: '延平王', dynasty: '南明', src: '清史稿·郑成功传（明封延平王）' },
  '郑鸿逵': { title: '定西侯', dynasty: '南明', src: '南明史·郑鸿逵传' },
  '多尔衮': { title: '摄政王', dynasty: '清', src: '清史稿·多尔衮传（和硕睿亲王摄政）' },
  '多铎': { title: '豫亲王', dynasty: '清', src: '清史稿·多铎传（和硕豫亲王）' },
  '豪格': { title: '肃亲王', dynasty: '清', src: '清史稿·豪格传' },
  '孔有德': { title: '定南王', dynasty: '清', src: '清史稿·孔有德传' },
  '耿仲明': { title: '靖南王', dynasty: '清', src: '清史稿·耿仲明传' },
  '尚可喜': { title: '平南王', dynasty: '清', src: '清史稿·尚可喜传' },
  '吴三桂': { title: '平西王', dynasty: '清', src: '清史稿·吴三桂传' },
  '洪承畴': { title: '兵部尚书', dynasty: '清', src: '清史稿·洪承畴传（太子太保·兵部尚书）' },
  '李成栋': { title: '提督', dynasty: '清', src: '南明史（清广东提督，后反正）' },
  '金声桓': { title: '总兵', dynasty: '明', src: '南明史（左良玉部总兵，后反正）' },
  '王得仁': { title: '总兵', dynasty: '明', src: '南明史（金声桓部将，同反正）' },

  // ===== 明代其他常见人物 =====
  '于谦': { title: '兵部尚书', dynasty: '明', src: '明史·于谦传（少保兼兵部尚书）' },
  '王守仁': { title: '新建伯', dynasty: '明', src: '明史·王守仁传' },
  '王阳明': { title: '新建伯', dynasty: '明', src: '明史·王守仁传' },
  '张居正': { title: '内阁首辅', dynasty: '明', src: '明史·张居正传（万历朝元辅）' },
  '严嵩': { title: '内阁首辅', dynasty: '明', src: '明史·严嵩传' },
  '魏忠贤': { title: '司礼监秉笔太监', dynasty: '明', src: '明史·宦官传' },
  '海瑞': { title: '都御史', dynasty: '明', src: '明史·海瑞传（南京右都御史）' },
  '戚继光': { title: '总兵', dynasty: '明', src: '明史·戚继光传（少保·总兵官）' },
  '郑和': { title: '正使太监', dynasty: '明', src: '明史·郑和传' },
  '李时': { title: '内阁首辅', dynasty: '明', src: '明史·李时传' },
  '杨廷和': { title: '内阁首辅', dynasty: '明', src: '明史·杨廷和传' },

  // ===== 宋 / 唐 / 汉 / 三国 / 秦（常见穿越题材人物）=====
  '岳飞': { title: '枢密副使', dynasty: '宋', src: '宋史·岳飞传（少保·枢密副使）' },
  '秦桧': { title: '太师', dynasty: '宋', src: '宋史·秦桧传（太师·魏国公）' },
  '文天祥': { title: '右丞相', dynasty: '宋', src: '宋史·文天祥传' },
  '包拯': { title: '御史中丞', dynasty: '宋', src: '宋史·包拯传（权御史中丞）' },
  '王安石': { title: '宰相', dynasty: '宋', src: '宋史·王安石传（同中书门下平章事）' },
  '苏轼': { title: '翰林学士', dynasty: '宋', src: '宋史·苏轼传' },
  '狄仁杰': { title: '纳言', dynasty: '唐', src: '旧唐书·狄仁杰传' },
  '魏征': { title: '谏议大夫', dynasty: '唐', src: '旧唐书·魏征传' },
  '房玄龄': { title: '司空', dynasty: '唐', src: '旧唐书·房玄龄传（尚书左仆射）' },
  '长孙无忌': { title: '太尉', dynasty: '唐', src: '旧唐书·长孙无忌传' },
  '安禄山': { title: '东平郡王', dynasty: '唐', src: '旧唐书·安禄山传' },
  '韩信': { title: '楚王', dynasty: '汉', src: '史记·淮阴侯列传' },
  '司马迁': { title: '中书令', dynasty: '汉', src: '汉书·司马迁传' },
  '霍光': { title: '大司马', dynasty: '汉', src: '汉书·霍光传（大司马大将军）' },
  '王莽': { title: '新皇帝', dynasty: '新', src: '汉书·王莽传' },
  '曹操': { title: '魏王', dynasty: '汉', src: '三国志·武帝纪（封魏公进魏王）' },
  '刘备': { title: '汉中王', dynasty: '蜀汉', src: '三国志·先主传' },
  '诸葛亮': { title: '武乡侯', dynasty: '蜀汉', src: '三国志·诸葛亮传（丞相·武乡侯）' },
  '关羽': { title: '汉寿亭侯', dynasty: '蜀汉', src: '三国志·关羽传' },
  '张飞': { title: '车骑将军', dynasty: '蜀汉', src: '三国志·张飞传' },
  '孙权': { title: '吴大帝', dynasty: '东吴', src: '三国志·吴主传' },
  '周瑜': { title: '偏将军', dynasty: '东吴', src: '三国志·周瑜传（南郡太守）' },
  '司马懿': { title: '太傅', dynasty: '魏', src: '晋书·宣帝纪' },
  '李世民': { title: '唐太宗', dynasty: '唐', src: '旧唐书·太宗纪' },
  '李隆基': { title: '唐玄宗', dynasty: '唐', src: '旧唐书·玄宗纪' },
  '武则天': { title: '则天皇帝', dynasty: '周', src: '旧唐书·则天皇后纪' },
  '秦始皇': { title: '始皇帝', dynasty: '秦', src: '史记·秦始皇本纪' },
  '嬴政': { title: '始皇帝', dynasty: '秦', src: '史记·秦始皇本纪' },
  '李斯': { title: '丞相', dynasty: '秦', src: '史记·李斯传' },
  '赵高': { title: '中车府令', dynasty: '秦', src: '史记·蒙恬列传' },
  '项羽': { title: '西楚霸王', dynasty: '楚', src: '史记·项羽本纪' },
  '刘邦': { title: '汉高祖', dynasty: '汉', src: '史记·高祖本纪' },
}

/** 题材是否属于"真实历史背景"（架空/穿越到真实朝代也算） */
export function isHistoricalGenre(genre: string, keywords?: string): boolean {
  const s = String(genre || '') + ' ' + String(keywords || '')
  return /历史|架空历史|两宋元明|明清|明朝|南明|明末|宋元|唐|汉|三国|秦汉|隋唐|五代|清|民国|穿越|权谋|朝堂|争霸|国运/.test(s)
}

/** 查表：命中返回史书定称，未命中返回 null */
export function lookupHistoricalTitle(name: unknown): HistoricalTitle | null {
  const n = String(name || '').trim()
  if (!n) return null
  if (HISTORICAL_TITLES[n]) return HISTORICAL_TITLES[n]
  // 容错：去掉"（某某）"注记、空格后再试
  const cleaned = n.replace(/[（(][^）)]*[）)]/g, '').trim()
  if (cleaned && cleaned !== n && HISTORICAL_TITLES[cleaned]) return HISTORICAL_TITLES[cleaned]
  return null
}

function eachCharacter(characters: any, fn: (c: any) => void) {
  if (!characters || typeof characters !== 'object') return
  const lists = [characters.protagonist, characters.femaleLead, characters.antagonist,
    characters.femaleLeads, characters.antagonists, characters.supporting]
  const seen = new Set<any>()
  lists.forEach(function (l: any) {
    if (!l) return
    const arr = Array.isArray(l) ? l : [l]
    arr.forEach(function (c: any) {
      if (!c || typeof c !== 'object' || seen.has(c) || !c.name) return
      seen.add(c)
      fn(c)
    })
  })
}

/**
 * 对整套角色应用正史取值（同步、离线）。
 * 真实历史人物一律以史书定称为准，覆盖 LLM/校正给出的不准确头衔。
 */
export function applyHistoricalTitles(characters: any): Array<{ name: string; from: string; to: string; src: string }> {
  const changed: Array<{ name: string; from: string; to: string; src: string }> = []
  eachCharacter(characters, function (c: any) {
    const hit = lookupHistoricalTitle(c.name)
    if (!hit) return
    const old = String(c.title || '').trim()
    c.title = hit.title
    c.titleSource = '正史:' + hit.src           // 溯源标记，前端可在徽章提示里展示
    if (old !== hit.title) changed.push({ name: String(c.name), from: old, to: hit.title, src: hit.src })
  })
  return changed
}

/** 角色是否为表中收录的真实历史人物（供上层决定"要不要再问 LLM"） */
export function isKnownHistoricalFigure(name: unknown): boolean {
  return !!lookupHistoricalTitle(name)
}

// ==================== 权威百科查证（表内没有时的在线兜底） ====================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const CACHE_DIR = join(process.cwd(), '.tuzhong-data')
const CACHE_FILE = join(CACHE_DIR, 'historical-titles-cache.json')
let _cache: Record<string, { title: string; src: string; at: number }> | null = null
const _inflight: Record<string, Promise<{ title: string; src: string } | null>> = {}

function loadCache() {
  if (_cache) return _cache
  try {
    _cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) : {}
  } catch (_e) { _cache = {} }
  return _cache!
}

function saveCache() {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(CACHE_FILE, JSON.stringify(_cache || {}, null, 2), 'utf-8')
  } catch (_e) { /* 缓存写失败不影响主流程 */ }
}

// 官职/爵位类后缀（用于从百科正文里挑出可作徽章的定称）
const OFFICE_TAIL = /(帝|王|侯|公|丞相|宰相|太师|太傅|太保|少师|少保|尚书|大学士|学士|侍郎|御史|都御史|巡抚|总督|都督|总兵|提督|参将|副将|游击|将军|校尉|统领|司马|司空|太尉|刺史|太守|知府|知县|县丞|典史|教谕|翰林|编修|检讨|庶吉士|詹事|中丞|中书令|令尹|首辅|元辅|祭酒|都护|都监|都虞候|节度使|经略使|观察使|团练使|招讨使|宣抚使|转运使|盐运使|布政使|按察使|参政|参议|佥事|主事|郎中|员外|长史|别驾|参军|国姓爷|太监|秉笔|司礼监|指挥使|千户|百户|万户|伯)$/
const BANNED_RESULT = /(将领|首领|头目|战士|人员|专家|领袖|霸主|英雄|义士|猛将|名将|忠臣|武将|盟友|亲随|反派|主角|配角|女主|导师|皇帝之|王子|公主之|王爷之)/

/** 剥离史书/百科里的叙述用动词前缀（"官至礼部尚书"→"礼部尚书"、"曾任兵部侍郎"→"兵部侍郎"） */
function stripNarrativePrefix(v: string): string {
  var s = String(v || '').trim()
  s = s.replace(/^(?:官至|官居|历任|曾任|任|累迁|迁转|迁|转|拜|授|封|赠|追赠|进|加|领|署|出为|入为|起家|官)[：:，、]?/, '')
  // 仍含叙述字时，取最后一个官职后缀片段
  if (/[至为任于与及]/.test(s)) {
    const parts = s.split(/[至为于，、；;]/)
    s = parts[parts.length - 1].trim()
  }
  return s
}

/** 从百科纯文本里抽取该人物的官职/爵位定称 */
export function extractTitleFromBaikeText(text: string, name: string): string {
  const t = String(text || '')
  // ① 信息栏字段优先（官职/爵位/封号/谥号）
  const field = t.match(/(?:官职|官位|爵位|封号|身份|职务)\s*[：:]\s*([^\s，。、；;|]{2,12})/)
  if (field) {
    const v = stripNarrativePrefix(field[1])
    if (v && OFFICE_TAIL.test(v) && !BANNED_RESULT.test(v)) return v
  }
  // ② 概述句："XX（？—？），明朝兵部尚书"、"XX，封平西王"、"官至礼部尚书"
  const esc = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sent = t.match(new RegExp(esc + '[\\s\\S]{0,140}?((?:[南北]?明|清|宋|唐|汉|元|秦|隋|三国|五代|民国|大西|大顺|蜀汉|东吴|南明)?[\\u4e00-\\u9fa5]{0,6}(?:' + OFFICE_TAIL.source.replace(/\$$/, '') + '))'))
  if (sent) {
    const v = stripNarrativePrefix(sent[1])
    if (v && v.length >= 2 && v.length <= 12 && OFFICE_TAIL.test(v) && !BANNED_RESULT.test(v)) return v
  }
  return ''
}

/** 拉取百度百科人物词条正文（fetch 优先，失败回退 Playwright） */
async function fetchBaikePersonText(name: string): Promise<string> {
  const url = 'https://baike.baidu.com/item/' + encodeURIComponent(name)
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal: AbortSignal.timeout(6000),
    })
    if (resp.ok) {
      const html = await resp.text()
      if (html && html.length > 3000 && !/百度安全验证|网络不安全|访问验证/.test(html.slice(0, 2000))) {
        return html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      }
    }
  } catch (_e) { /* 回退 Playwright */ }
  try {
    const pw = (await import('./book-sources/playwright-manager')).default
    const browser = await pw.getBrowser()
    try {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
      const text = await page.evaluate(() => document.body.innerText)
      await page.close().catch(() => {})
      return String(text || '')
    } finally { pw.releaseBrowser(browser) }
  } catch (_e2) { return '' }
}

/**
 * 在线查证某人物的史书头衔（结果缓存，失败返回 null 交给上层降级）。
 * 只用于"看起来是真实历史人物"的角色，避免给虚构人物瞎查。
 */
export async function lookupTitleOnline(name: unknown): Promise<{ title: string; src: string } | null> {
  const n = String(name || '').trim()
  if (!n || n.length > 6) return null
  const table = lookupHistoricalTitle(n)
  if (table) return { title: table.title, src: table.src }
  const cache = loadCache()
  const cached = cache[n]
  if (cached && cached.title) return { title: cached.title, src: cached.src || '百度百科' }
  if (_inflight[n]) return _inflight[n]
  _inflight[n] = (async function () {
    try {
      const text = await fetchBaikePersonText(n)
      const title = text ? extractTitleFromBaikeText(text, n) : ''
      if (!title) { cache[n] = { title: '', src: '', at: Date.now() }; saveCache(); return null }
      const rec = { title: title, src: '百度百科·' + n, at: Date.now() }
      cache[n] = rec
      saveCache()
      return { title: rec.title, src: rec.src }
    } catch (_e) { return null }
    finally { delete _inflight[n] }
  })()
  return _inflight[n]
}

/** 批量在线查证（限并发，避免打爆来源） */
export async function lookupTitlesOnline(names: string[], limit = 12): Promise<Record<string, { title: string; src: string }>> {
  const out: Record<string, { title: string; src: string }> = {}
  const queue = names.filter(Boolean).slice(0, limit)
  let idx = 0
  const workers = [0, 1, 2].map(async function () {
    while (idx < queue.length) {
      const i = idx++
      const nm = queue[i]
      const r = await lookupTitleOnline(nm)
      if (r) out[nm] = r
    }
  })
  await Promise.race([Promise.all(workers), new Promise(function (r) { setTimeout(r, 25000) })])
  return out
}
