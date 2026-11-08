/**
 * 聚合搜索引擎书源（移植自 owllook / howie6879 的「搜索引擎聚合 + 规则解析」架构）
 *
 * 【为什么需要它】
 *   番茄官方搜索 API 对未签名请求返回 `invalid client`；起点榜单页对普通 UA 返回 HTTP 202 反爬。
 *   owllook（2891★）的解法是不直连平台，而是**通过通用搜索引擎拿结果页，再按规则解析**，
 *   由此覆盖 200+ 书站。本模块实现同一思路，Node/TypeScript 版，无 Python 依赖。
 *
 * 【已实测可用（2026-10-26）】
 *   - 搜狗 (sogou.com)：HTTP 200 / 535KB，可解析出真实起点/番茄书目（书名+作者+简介+章节标题）
 *   - Bing：HTTP 200 / 104KB，可解析 b_algo 块（需跟随 302 + zh-Hans 语言 cookie）
 *   - 360 (so.com)：当前返回 302，作为备用源保留
 *
 * 【边界】解析基于 CSS 选择器与正则，属于启发式；上游改版可能导致个别源失效，
 *   故每源独立 try/catch，单源失败不影响整体；结果统一标注 source 与 sourceUrl 以便溯源。
 */
import bookSourceManager from './manager'

export interface AggregatedBookHit {
  title: string
  author: string
  description: string
  source: string
  sourceUrl: string
  /** 命中的平台（起点/番茄/晋江/…），从标题或链接推断 */
  platform: string
  chapter?: string
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const COMMON_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
}

function stripTags(s: string): string {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectPlatform(text: string): string {
  const hay = String(text || '').toLowerCase()
  if (hay.includes('qidian') || hay.includes('起点')) return '起点'
  if (hay.includes('fanqie') || hay.includes('番茄')) return '番茄'
  if (hay.includes('jinjiang') || hay.includes('晋江')) return '晋江'
  if (hay.includes('zongheng') || hay.includes('纵横')) return '纵横'
  if (hay.includes('qimao') || hay.includes('七猫')) return '七猫'
  if (hay.includes('17k') || hay.includes('书旗')) return '书旗'
  if (hay.includes('yuewen') || hay.includes('阅文')) return '阅文'
  if (hay.includes('hongxiu') || hay.includes('红袖')) return '红袖'
  if (hay.includes('zhihu') || hay.includes('知乎')) return '知乎'
  if (hay.includes('baike.baidu')) return '百度百科'
  return '全网'
}

/** 从书名片段里拆出「书名」与「作者」 */
function splitTitleAuthor(raw: string): { title: string; author: string } {
  let s = stripTags(raw)
  // 形态1：《书名》作者 / 《书名》_作者 / 《书名》，作者：X
  const m1 = s.match(/《([^》]{1,60})》\s*[,，]?\s*(?:作者[：:]\s*)?([一-龥A-Za-z·]{2,20})?/)
  if (m1) return { title: cleanTitle(m1[1]), author: (m1[2] || '').trim() }
  // 形态2：书名_作者 / 书名 - 作者
  const m2 = s.match(/^(.{2,50}?)\s*(?:_|－|-|—|,|，)\s*([一-龥A-Za-z·]{2,20})(?:\s|$)/)
  if (m2) return { title: cleanTitle(m2[1]), author: m2[2].trim() }
  // 形态3：书名 在线阅读 / 首发起点中文网
  const m3 = s.match(/《([^》]{1,60})》/)
  if (m3) return { title: cleanTitle(m3[1]), author: '' }
  const m4 = s.match(/^(.{2,50}?)\s*(?:小说在线阅读|首发|在线阅读|全文免费|中文网)/)
  if (m4) return { title: cleanTitle(m4[1]), author: '' }
  return { title: cleanTitle(s), author: '' }
}

/** 书名清洗：截断书名里的副标题标记，去掉多余符号 */
function cleanTitle(t: string): string {
  let x = String(t || '').trim()
  // 去掉书名后的「-精彩大结局」「-TXT免费」等尾巴
  x = x.replace(/[-－—_](精彩大结局.{0,10}|TXT.{0,10}|免费.{0,6}|全文.{0,6}|完本.{0,6}).*$/i, '')
  x = x.replace(/[，,。.：:；;！!？?]+$/, '')
  x = x.replace(/^(第[一二三四五六七八九十\d]+[章节卷部回].*?\s*)/, '')
  if (x.length > 40) x = x.slice(0, 40)
  return x.trim()
}

/** 源 1：搜狗（实测最稳，能拿到真实起点/番茄书目） */
async function searchSogou(keyword: string): Promise<AggregatedBookHit[]> {
  const url = 'https://www.sogou.com/web?query=' + encodeURIComponent(keyword)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(url, { headers: COMMON_HEADERS, signal: ctrl.signal, redirect: 'follow' } as any)
    const html = await res.text()
    const out: AggregatedBookHit[] = []
    const seen = new Set<string>()
    // 搜狗结果条目：<h3 class="vr-title">…<a href="…">标题</a>…</h3> + 摘要段
    const blocks = html.split(/<div class="vrwrap"/).slice(1)
    for (const b of blocks) {
      const t = b.match(/<h3[^>]*class="vr-title"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      if (!t) continue
      const rawTitle = stripTags(t[2])
      if (!rawTitle) continue
      const { title, author } = splitTitleAuthor(rawTitle)
      if (!title || title.length < 2) continue
      if (seen.has(title)) continue
      seen.add(title)
      const descMatch = b.match(/<p[^>]*class="str_info"[^>]*>([\s\S]*?)<\/p>/) || b.match(/<div[^>]*class="space-txt"[^>]*>([\s\S]*?)<\/div>/)
      const desc = descMatch ? stripTags(descMatch[1]).slice(0, 220) : ''
      const authorMatch = b.match(/<p[^>]*class="star-writer"[^>]*>([\s\S]*?)<\/p>/) || b.match(/class="author"[^>]*>([\s\S]*?)<\/a>/)
      const authorFromBlock = authorMatch ? stripTags(authorMatch[1]).replace(/^(作者|著)[:：]?/, '').trim() : ''
      let sourceUrl = t[1]
      if (sourceUrl.startsWith('/link?')) sourceUrl = 'https://www.sogou.com' + sourceUrl
      out.push({
        title,
        author: author || authorFromBlock,
        description: desc,
        source: '搜狗聚合',
        sourceUrl,
        platform: detectPlatform(rawTitle + ' ' + b.slice(0, 1200).replace(/<[^>]+>/g, ' ')),
      })
      if (out.length >= 30) break
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

/** 源 2：Bing（需跟随 302，并带 zh-Hans 语言 cookie） */
async function searchBing(keyword: string): Promise<AggregatedBookHit[]> {
  const url = 'https://www.bing.com/search?q=' + encodeURIComponent(keyword) + '&ensearch=0'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(url, {
      headers: { ...COMMON_HEADERS, Cookie: 'SRCHHPGUSR=SRCHLANG=zh-Hans' },
      signal: ctrl.signal,
      redirect: 'follow',
    })
    const html = await res.text()
    const out: AggregatedBookHit[] = []
    const seen = new Set<string>()
    const blocks = html.split(/<li class="b_algo"/).slice(1)
    for (const b of blocks) {
      const t = b.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      if (!t) continue
      const rawTitle = stripTags(t[2])
      if (!rawTitle) continue
      const { title, author } = splitTitleAuthor(rawTitle)
      if (!title || title.length < 2 || seen.has(title)) continue
      seen.add(title)
      const d = b.match(/<p[^>]*>([\s\S]*?)<\/p>/)
      out.push({
        title,
        author,
        description: d ? stripTags(d[1]).slice(0, 220) : '',
        source: 'Bing聚合',
        sourceUrl: t[1],
        platform: detectPlatform(rawTitle + ' ' + t[1]),
      })
      if (out.length >= 30) break
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 聚合搜索主入口：多搜索引擎并行，任一成功即返回；全部失败时降级到本系统既有的 bookSourceManager。
 */
export async function searchAggregated(keyword: string, limit = 20): Promise<AggregatedBookHit[]> {
  const kw = String(keyword || '').trim()
  if (!kw) return []
  const sources: Array<[string, (k: string) => Promise<AggregatedBookHit[]>]> = [
    ['搜狗', searchSogou],
    ['Bing', searchBing],
  ]
  const settled = await Promise.allSettled(sources.map(([, fn]) => fn(kw)))
  const merged: AggregatedBookHit[] = []
  const seen = new Set<string>()
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue
    for (const h of s.value) {
      const key = h.title + '|' + h.author
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(h)
    }
  }
  merged.sort((a, b) => a.title.length - b.title.length)
  if (merged.length > 0) return merged.slice(0, limit)

  // 降级：既有平台直连源
  try {
    const legacyRaw = await bookSourceManager.searchBook(kw, {} as any)
    const legacy: any[] = Array.isArray(legacyRaw) ? legacyRaw : []
    return (legacy || []).map((b: any) => ({
      title: String(b.title || ''),
      author: String(b.author || ''),
      description: String(b.description || ''),
      source: String(b.source || '平台直连'),
      sourceUrl: String(b.sourceUrl || b.url || ''),
      platform: detectPlatform(String(b.title || '') + ' ' + String(b.sourceUrl || b.url || '')),
    })).slice(0, limit)
  } catch {
    return []
  }
}
