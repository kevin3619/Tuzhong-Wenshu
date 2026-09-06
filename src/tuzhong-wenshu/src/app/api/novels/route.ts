import { NextResponse, NextRequest } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminOnlyNovel, extractTokenFromRequest, getRequestActor } from '@/lib/permissions'

// 途中文枢作品存储路径 - 动态解析支持 PM2 环境
function resolveDataDir(): string {
  const candidates = [
    join(process.cwd(), '.tuzhong-data'),
    join(process.cwd(), 'src', 'tuzhong-wenshu', '.tuzhong-data'),
    join(process.cwd(), '..', '.tuzhong-data'),
    '/www/wwwroot/tuzhong-wenshu/.tuzhong-data',
  ]
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch {
      // 继续尝试
    }
  }
  return join(process.cwd(), '.tuzhong-data')
}

const LOCAL_DATA_DIR = resolveDataDir()
const NOVEL_BOOK_FILE = join(LOCAL_DATA_DIR, 'novels.json')
const CHAPTERS_DIR = join(LOCAL_DATA_DIR, 'chapters')

function ensureDataFolder() {
  if (!existsSync(LOCAL_DATA_DIR)) {
    mkdirSync(LOCAL_DATA_DIR, { recursive: true })
  }
}

function loadSettingsMeta(): Record<string, { characterCount: number; aiTitle?: string }> {
  const metaMap: Record<string, { characterCount: number; aiTitle?: string }> = {}
  try {
    const f = join(LOCAL_DATA_DIR, 'settings.json')
    if (!existsSync(f)) return metaMap
    const raw = JSON.parse(readFileSync(f, 'utf-8'))
    if (!raw || typeof raw !== 'object') return metaMap
    for (const nid of Object.keys(raw)) {
      const entry = raw[nid]
      if (!entry || typeof entry !== 'object') continue
      const charsData = (entry as any).characters
      let cc = 0
      if (charsData && typeof charsData === 'object') {
        if ((charsData as any).protagonist) cc++
        if (Array.isArray((charsData as any).femaleLeads)) cc += (charsData as any).femaleLeads.length
        else if ((charsData as any).femaleLead) cc++
        if (Array.isArray((charsData as any).antagonists)) cc += (charsData as any).antagonists.length
        else if ((charsData as any).antagonist) cc++
        if (Array.isArray((charsData as any).supporting)) cc += (charsData as any).supporting.length
        if (Array.isArray((charsData as any).minor) || (charsData as any).others) cc += Array.isArray((charsData as any).minor) ? (charsData as any).minor.length : 0
      }
      const ideaTitle = (entry as any).idea && typeof (entry as any).idea === 'object' ? ((entry as any).idea.title || '') : ''
      metaMap[nid] = { characterCount: cc, aiTitle: ideaTitle || undefined }
    }
  } catch { /* ignore */ }
  return metaMap
}

function loadCountData() {
  let chars: Record<string, any[]> = {}
  let vols: Record<string, any[]> = {}
  try {
    const charsFile = join(LOCAL_DATA_DIR, 'characters.json')
    if (existsSync(charsFile)) {
      const raw = JSON.parse(readFileSync(charsFile, 'utf-8'))
      if (raw && typeof raw === 'object') chars = raw
    }
  } catch { /* ignore */ }
  try {
    const volsFile = join(LOCAL_DATA_DIR, 'volumes.json')
    if (existsSync(volsFile)) {
      const raw = JSON.parse(readFileSync(volsFile, 'utf-8'))
      if (raw && typeof raw === 'object') vols = raw
    }
  } catch { /* ignore */ }
  return { chars, vols }
}

function countCharactersForNovel(novelId: string, fsCharsMap: Record<string, any[]>, settingsMeta: Record<string, { characterCount: number; aiTitle?: string }>): number {
  const fsCount = Array.isArray(fsCharsMap[novelId]) ? fsCharsMap[novelId].length : 0
  const settingsCount = settingsMeta[novelId]?.characterCount || 0
  return Math.max(fsCount, settingsCount)
}

function countChaptersFromFs(novelId: string): number {
  try {
    const f = join(CHAPTERS_DIR, String(novelId) + '.json')
    if (!existsSync(f)) return 0
    const data = JSON.parse(readFileSync(f, 'utf-8'))
    if (Array.isArray(data)) return data.length
    if (data && Array.isArray(data.chapters)) return data.chapters.length
    return 0
  } catch {
    return 0
  }
}

function loadNovelBooks() {
  if (!existsSync(NOVEL_BOOK_FILE)) {
    return []
  }

  let fileRawText
  try {
    fileRawText = readFileSync(NOVEL_BOOK_FILE, 'utf-8')
  } catch (readErr) {
    return []
  }

  let parsedBooks
  try {
    parsedBooks = JSON.parse(fileRawText)
  } catch (parseErr) {
    return []
  }

  if (!Array.isArray(parsedBooks)) {
    return []
  }

  return parsedBooks
}

function saveNovelBooks(allBooks: unknown[]) {
  ensureDataFolder()
  writeFileSync(NOVEL_BOOK_FILE, JSON.stringify(allBooks, null, 2), 'utf-8')
}

// 作品条目结构
type NovelBookEntry = {
  id: string
  title: string
  description: string
  genre: string
  wordCount: number
  lastModified: string
  healthScore: unknown
  status: string
  created_at: string
  cover?: string
}

export async function GET(request: NextRequest) {
  try {
    // 🔥 解析用户身份（先做认证，确保后续查询均按权限过滤）
    let currentUserId: string | null = null
    let isAdmin = false

    const tokenVal = extractTokenFromRequest(request)
    if (tokenVal) {
      const tokenPayload = await verifyToken(tokenVal)
      if (tokenPayload) {
        currentUserId = tokenPayload.userId
        isAdmin = tokenPayload.isAdmin || false
      }
    }

    // 🔥 修复：同时读取文件系统和 Prisma DB，合并后返回
    const fsBookList = loadNovelBooks()
    let dbBookList: Array<Record<string, unknown>> = []
    try {
      // 管理员可查看所有作品；普通用户仅查询自己的作品
      const dbQuery: any = {}
      if (!isAdmin && currentUserId) {
        dbQuery.where = { userId: currentUserId }
      }
      const dbNovels = await prisma.novel.findMany(dbQuery)
      dbBookList = dbNovels.map(function (n) {
        return {
          id: n.id,
          title: n.title,
          description: n.description || '',
          genre: n.genre || '玄幻',
          wordCount: Number(n.currentWordCount || 0),
          lastModified: n.updatedAt || n.createdAt || '',
          healthScore: n.healthScore,
          status: n.status || 'writing',
          created_at: n.createdAt || '',
          cover: n.coverUrl || undefined,
          userId: n.userId,
        }
      })
    } catch (_e) {
      /* DB 读取失败时静默降级，仅使用 FS */
    }

    // 合并 FS 和 DB 作品，FS 优先覆盖 DB（保持原有行为）
    const mergedMap = new Map<string, Record<string, unknown>>()
    for (let i = 0; i < dbBookList.length; i++) {
      const b = dbBookList[i]
      const bid = String(b.id || '')
      if (bid) mergedMap.set(bid, b)
    }
    for (let i = 0; i < fsBookList.length; i++) {
      const b = fsBookList[i]
      const bid = String((b as Record<string, unknown>).id || '')
      if (bid) mergedMap.set(bid, b as Record<string, unknown>)
    }
    const bookList = Array.from(mergedMap.values())

    // 🔥 用户身份已在文件开头解析（currentUserId, isAdmin），此处直接使用

    // 🔥 个人书架过滤：仅显示「本人作品」+「管理员专属参考库」
    // 不再把其他普通用户（如 cmsbbmp0）创建的作品混入管理员书架
    let filteredBooks = (bookList as Array<Record<string, unknown>>).filter(function (book) {
      if (currentUserId && String(book.userId || '') === currentUserId) return true
      if (isAdmin && isAdminOnlyNovel(String(book.id))) return true
      return false
    })

    // 🔥 Bug修复：支持 ?id=xxx 参数返回单个作品详情
    // 🔥 封面处理：所有 base64 / URL / path 封面均改为代理 URL，避免大 JSON 响应触发 ERR_INCOMPLETE_CHUNKED_ENCODING
    // 🔥 单本查询宽松匹配 + 所有权校验：admin 可看所有，普通用户仅可看自己的
    const urlObj = new URL(request.url)
    const novelId = urlObj.searchParams.get('id')
    if (novelId) {
      const looseMatch = (item: Record<string, unknown> | NovelBookEntry): boolean => {
        const sid = String((item as Record<string, unknown>).id ?? '')
        const nid = String(novelId)
        if (sid === nid) return true
        // 数字相等匹配（避免 1784xxx number / string 类型不一致导致漏匹配）
        const sNum = Number(sid); const nNum = Number(nid)
        if (!Number.isNaN(sNum) && !Number.isNaN(nNum) && sNum === nNum) return true
        return false
      }
      // 🔥 单查优先在「全量合并 bookList」中搜，不受管理员过滤影响；随后单独做所有权校验
      const candidates = Array.from(mergedMap.values())
      let target: Record<string, unknown> | NovelBookEntry | undefined = candidates.find(looseMatch)
      if (!target) target = fsBookList.find((b) => looseMatch(b as Record<string, unknown>)) as Record<string, unknown> | undefined
      if (!target) target = dbBookList.find((b) => looseMatch(b))
      if (!target) {
        console.warn('[novels GET] 未找到作品 id=' + novelId + ', FS=' + fsBookList.length + ', DB=' + dbBookList.length + ', 合并=' + bookList.length)
        return NextResponse.json({ error: '作品不存在', debug: { fsCount: fsBookList.length, dbCount: dbBookList.length, asked: novelId } }, { status: 404 })
      }
      // 所有权校验
      const tUserId = String((target as Record<string, unknown>).userId ?? '')
      const tId = String((target as Record<string, unknown>).id ?? '')
      if (!isAdmin) {
        const blockedAdminOnly = isAdminOnlyNovel(tId)
        const notOwned = tUserId !== currentUserId
        if (blockedAdminOnly || notOwned) {
          console.warn('[novels GET] 无权访问作品 id=' + novelId + ', uid=' + tUserId + ', current=' + currentUserId)
          return NextResponse.json({ error: '无权访问该作品' }, { status: 403 })
        }
      }
      // 🔥 封面转换：无论 base64 / URL，一律替换为代理端点 URL（让响应体尽可能小，避免分块编码被截断）
      const hasAnyCover = !!(target as Record<string, unknown>).cover || !!(target as Record<string, unknown>).coverUrl
      const safeBook: Record<string, unknown> = { ...(target as Record<string, unknown>) } as Record<string, unknown>
      if (hasAnyCover) {
        const coverTs = (target as Record<string, unknown>).coverUpdatedAt || Date.now()
        safeBook.cover = '/tuzhong-wenshu/api/novels/cover?id=' + encodeURIComponent(tId || novelId) + '&v=' + coverTs
      } else {
        safeBook.cover = ''
      }
      delete safeBook.coverUrl
      const { chars: sChars, vols: sVols } = loadCountData()
      const sMeta = loadSettingsMeta()
      safeBook.chapters = countChaptersFromFs(tId || novelId)
      safeBook.characters = countCharactersForNovel(tId || novelId, sChars, sMeta)
      safeBook.volumes = Array.isArray(sVols[tId || novelId]) ? sVols[tId || novelId].length : 0
      return NextResponse.json({ data: safeBook })
    }

    // 🔥 列表视图：将 base64 封面替换为代理 URL，减小响应体，避免 ERR_INCOMPLETE_CHUNKED_ENCODING
    const { chars: charMap, vols: volMap } = loadCountData()
    const settingsMeta = loadSettingsMeta()
    const cleanedBooks: (NovelBookEntry & { chapters?: number; characters?: number; volumes?: number; userId?: string })[] = []
    for (let i = 0; i < filteredBooks.length; i++) {
      const raw = filteredBooks[i] as unknown as Record<string, unknown>
      const bid = String(raw.id || '')
      const hasCover = !!raw.cover || !!raw.coverUrl
      const desc = String(raw.description || '').trim()
      const shortDesc = desc.length > 500 ? desc.substring(0, 500) + '...' : desc
      const fsChapters = countChaptersFromFs(bid)
      const fsChars = countCharactersForNovel(bid, charMap, settingsMeta)
      const fsVols = Array.isArray(volMap[bid]) ? volMap[bid].length : 0
      const rawCreatedAt = raw.created_at || raw.createdAt || raw.id || ''
      cleanedBooks.push({
        id: bid,
        title: String(raw.title || '').trim() || '未命名作品',
        description: shortDesc || '暂无简介',
        genre: String(raw.genre || '') || '玄幻',
        wordCount: Number(raw.wordCount || 0),
        lastModified: String(raw.lastModified || raw.updatedAt || ''),
        healthScore: raw.healthScore ? Number(raw.healthScore) : 100,
        status: String(raw.status || '') || 'writing',
        created_at: String(rawCreatedAt),
        cover: hasCover ? '/tuzhong-wenshu/api/novels/cover?id=' + encodeURIComponent(bid) + '&v=' + (raw.coverUpdatedAt || Date.now()) : undefined,
        chapters: fsChapters,
        characters: fsChars,
        volumes: fsVols,
        userId: String(raw.userId || ''),
      })
    }

    // 🔥 修复排序 bug：原代码用 Number(id) 对 UUID 排序返回 NaN 导致排序失效
    // 改为按创建时间倒序排列（兼容纯数字时间戳和ISO字符串）
    function parseCreatedTime(ca: string | number): number {
      if (!ca) return 0
      if (typeof ca === 'number') return ca
      const s = String(ca).trim()
      if (!s) return 0
      if (/^\d+$/.test(s)) {
        const n = Number(s)
        if (!Number.isNaN(n)) return n
      }
      const t = new Date(s).getTime()
      return Number.isNaN(t) ? 0 : t
    }
    cleanedBooks.sort(function (a, b) {
      const at = parseCreatedTime(a.created_at || a.lastModified) || parseCreatedTime(a.id)
      const bt = parseCreatedTime(b.created_at || b.lastModified) || parseCreatedTime(b.id)
      return bt - at
    })

    // 🔥 修复：按 ID 去重而不是按标题去重，避免不同作品因标题相同被误删
    const uniqueBooks: NovelBookEntry[] = []
    const seenIds = new Set<string>()
    for (let i = 0; i < cleanedBooks.length; i++) {
      const bid = String(cleanedBooks[i].id || '').trim()
      if (!bid || seenIds.has(bid)) continue
      seenIds.add(bid)
      uniqueBooks.push(cleanedBooks[i])
    }

    return NextResponse.json({ data: uniqueBooks, total: uniqueBooks.length })
  } catch (e) {
    console.error('[novels GET] 错误:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ data: [], total: 0, error: '加载作品列表失败' }, { status: 500 })
  }
}

// 创建新作品（含VIP免费限制）
export async function POST(request: NextRequest) {
  let reqBody
  try {
    reqBody = await request.json()
  } catch (jsonErr) {
    return NextResponse.json({ error: '请求数据格式错误' }, { status: 400 })
  }

  // 读取用户身份
  const authHeader = request.headers.get('authorization')
  let bkUserId = 'anonymous'
  let userVipTier = 'free'
  let isAdmin = false

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const tokenVal = authHeader.split(' ')[1]
    const tokenPayload = await verifyToken(tokenVal)

    if (tokenPayload) {
      bkUserId = tokenPayload.userId
      isAdmin = tokenPayload.isAdmin || false

      // 从数据库读取实际VIP状态（含过期校验）
      const dbUser = await prisma.user.findUnique({ where: { id: bkUserId } })

      if (dbUser) {
        userVipTier = dbUser.subscriptionTier || 'free'

        // VIP过期检查（仅对限时会员生效，永久会员不会过期）
        const isTimeLimited = userVipTier === 'pro' || userVipTier === 'monthly' || userVipTier === 'quarterly' || userVipTier === 'annual'
        if (isTimeLimited && dbUser.subscriptionExpiresAt) {
          const nowTime = new Date()
          const expireTime = new Date(dbUser.subscriptionExpiresAt)
          if (nowTime > expireTime) {
            userVipTier = 'free'
          }
        }
      }
    }
  }

  // 管理员跳过所有数量限制；所有VIP tier（pro/permanent/monthly/quarterly/annual）都不受免费用户限制
  // 只有 subscriptionTier === 'free' 的用户才受第1本限制
  if (!isAdmin && userVipTier === 'free') {
    const allBooks = loadNovelBooks()

    let userBookCount = 0
    for (let i = 0; i < allBooks.length; i++) {
      if (allBooks[i].userId === bkUserId) {
        userBookCount++
      }
    }

    if (userBookCount >= 1) {
      return NextResponse.json(
        { code: 402, error: '免费用户仅限创建第1本作品，第2本起需开通任意一档VIP会员' },
        { status: 402 }
      )
    }
  }

  const todayDate = new Date()
  const dateText = todayDate.getFullYear() + '-' +
    String(todayDate.getMonth() + 1).padStart(2, '0') + '-' +
    String(todayDate.getDate()).padStart(2, '0')

  // 计算AI生成正文的字数（若存在）
  let totalWordCount = 0
  if (Array.isArray(reqBody.chapters)) {
    for (let i = 0; i < reqBody.chapters.length; i++) {
      const ch = reqBody.chapters[i]
      if (ch && typeof ch.wordCount === 'number') {
        totalWordCount += ch.wordCount
      } else if (ch && typeof ch.content === 'string') {
        totalWordCount += ch.content.length
      }
    }
  }

  // 修复 v4 M8：使用 crypto.randomUUID() 生成不可预测的唯一 ID，避免时间戳枚举攻击
  const newBookId = crypto.randomUUID()
  const nowIso = new Date().toISOString()
  const newBook = {
    id: newBookId,
    userId: bkUserId,
    title: reqBody.title || '未命名作品',
    description: reqBody.description || '暂无简介',
    genre: reqBody.genre || '玄幻',
    wordCount: totalWordCount,
    lastModified: dateText,
    healthScore: 100,
    status: (reqBody.status === 'drafting' ? 'drafting' : 'writing'),
    created_at: nowIso,
    cover: reqBody.coverUrl || undefined
  }

  const allBooks = loadNovelBooks()
  allBooks.unshift(newBook)
  saveNovelBooks(allBooks)

  // 🔥 保存章节文件：若有AI生成的章节则保存，否则不创建默认占位章节（由 PATCH /api/chapters 后续补全）
  try {
    if (!existsSync(CHAPTERS_DIR)) {
      mkdirSync(CHAPTERS_DIR, { recursive: true })
    }
    const chapterFile = join(CHAPTERS_DIR, `${newBook.id}.json`)
    if (!existsSync(chapterFile)) {
      if (Array.isArray(reqBody.chapters) && reqBody.chapters.length > 0) {
        const chaptersToSave = []
        for (let i = 0; i < reqBody.chapters.length; i++) {
          const ch = reqBody.chapters[i]
          chaptersToSave.push({
            id: ch.id || crypto.randomUUID(),
            chapterNumber: ch.chapterNumber || (i + 1),
            title: ch.title || ('第' + (i + 1) + '章'),
            content: ch.content || '',
            wordCount: ch.wordCount || (ch.content ? ch.content.length : 0),
            status: ch.status || 'draft',
            order: i + 1,
            volume: ch.volume,
            volumeIndex: ch.volumeIndex,
          })
        }
        writeFileSync(chapterFile, JSON.stringify(chaptersToSave, null, 2), 'utf-8')
        console.log('[novels] 已保存AI生成的 ' + chaptersToSave.length + ' 章正文到小说 ' + newBook.id)
      } else {
        // 🔥 Bug修复：chapters 为空数组时不创建默认占位章节（避免与后续 PATCH 的章节重复）
        // 只创建一个空数组，等待 PATCH /api/chapters 后续补全
        writeFileSync(chapterFile, JSON.stringify([], null, 2), 'utf-8')
        console.log('[novels] 已为小说 ' + newBook.id + ' 创建空章节数组，等待后续 PATCH 补全')
      }
    }
  } catch (e) {
    console.warn('[novels] 创建章节文件失败:', e)
  }

  // 🔥 保存AI生成的完整设定数据到 settings.json（世界观、人物、势力等）
  try {
    const settingsFile = join(LOCAL_DATA_DIR, 'settings.json')
    let allSettings: Record<string, any> = {}
    if (existsSync(settingsFile)) {
      try {
        allSettings = JSON.parse(readFileSync(settingsFile, 'utf-8'))
      } catch (parseErr) {
        allSettings = {}
      }
    }
    if (!allSettings[newBook.id]) {
      allSettings[newBook.id] = {}
    }
    if (reqBody.worldbuilding) allSettings[newBook.id].worldbuilding = reqBody.worldbuilding
    if (reqBody.powerSystem) allSettings[newBook.id].powerSystem = reqBody.powerSystem
    if (reqBody.characters) allSettings[newBook.id].characters = reqBody.characters
    if (reqBody.factions) allSettings[newBook.id].factions = reqBody.factions
    if (reqBody.relationships) allSettings[newBook.id].relationships = reqBody.relationships
    if (reqBody.outline) allSettings[newBook.id].outline = reqBody.outline
    if (reqBody.keyPlots) allSettings[newBook.id].keyPlots = reqBody.keyPlots
    if (reqBody.idea) allSettings[newBook.id].idea = reqBody.idea
    if (reqBody.synopsis) allSettings[newBook.id].synopsis = reqBody.synopsis
    if (reqBody.volumes) allSettings[newBook.id].chapters = { volumes: reqBody.volumes }
    if (reqBody.coverUrl) allSettings[newBook.id].cover = { coverUrl: reqBody.coverUrl }
    writeFileSync(settingsFile, JSON.stringify(allSettings, null, 2), 'utf-8')
    console.log('[novels] 已保存AI生成设定到 settings.json for 小说 ' + newBook.id)
  } catch (e) {
    console.warn('[novels] 保存设定数据失败:', e)
  }

  // 🔥 Bug修复：同步保存 volumes 数据到 volumes.json，使 /write/[id] 页面能加载章节列表
  try {
    if (Array.isArray(reqBody.volumes) && reqBody.volumes.length > 0) {
      const volumesFile = join(LOCAL_DATA_DIR, 'volumes.json')
      let allVolumes: Record<string, unknown[]> = {}
      if (existsSync(volumesFile)) {
        try {
          allVolumes = JSON.parse(readFileSync(volumesFile, 'utf-8'))
        } catch {
          allVolumes = {}
        }
      }
      // 转换为 /api/volumes 期望的数据结构
      allVolumes[newBook.id] = reqBody.volumes.map((vol: { id?: string; name?: string; summary?: string; volumeSummary?: string; coreObjective?: string; order?: number; chapters?: unknown[] }, idx: number) => ({
        id: vol.id || crypto.randomUUID(),
        novelId: newBook.id,
        name: vol.name || ('第' + (idx + 1) + '卷'),
        summary: vol.summary || vol.volumeSummary || '',
        coreObjective: vol.coreObjective || '',
        order: vol.order || (idx + 1),
        chapters: Array.isArray(vol.chapters) ? vol.chapters : [],
        createdAt: new Date().toISOString(),
      }))
      writeFileSync(volumesFile, JSON.stringify(allVolumes, null, 2), 'utf-8')
      console.log('[novels] 已保存 ' + allVolumes[newBook.id].length + ' 卷到 volumes.json for 小说 ' + newBook.id)
    }
  } catch (e) {
    console.warn('[novels] 保存volumes数据失败:', e)
  }

  return NextResponse.json({ data: newBook }, { status: 201 })
}

// 更新作品（修复 v4 C7：补充权限校验，仅作品所有者或管理员可修改）
export async function PUT(request: NextRequest) {
  let reqBody
  try {
    reqBody = await request.json()
  } catch (jsonErr) {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  if (!reqBody.id) {
    return NextResponse.json({ error: '缺少作品ID' }, { status: 400 })
  }

  // 鉴权：校验登录态 + 作品归属
  const actor = await getRequestActor(request)
  if (!actor.userId) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  const allBooks = loadNovelBooks()

  let foundIdx = -1
  for (let i = 0; i < allBooks.length; i++) {
    if (allBooks[i].id === reqBody.id) {
      foundIdx = i
      break
    }
  }

  if (foundIdx === -1) {
    return NextResponse.json({ error: '作品不存在' }, { status: 404 })
  }

  // 仅作品所有者或管理员可修改（管理员专属知名小说禁止普通用户修改）
  const bookEntry: NovelBookEntry & { userId?: string } = allBooks[foundIdx]
  if (!actor.isAdmin) {
    if (isAdminOnlyNovel(String(bookEntry.id))) {
      return NextResponse.json({ error: '无权修改此作品' }, { status: 403 })
    }
    if (bookEntry.userId && String(bookEntry.userId) !== String(actor.userId)) {
      return NextResponse.json({ error: '无权修改他人作品' }, { status: 403 })
    }
  }

  if (reqBody.cover !== undefined || reqBody.coverUrl !== undefined) {
    reqBody.coverUpdatedAt = Date.now()
  }
  allBooks[foundIdx] = Object.assign({}, allBooks[foundIdx], reqBody)
  saveNovelBooks(allBooks)

  return NextResponse.json({ data: allBooks[foundIdx] })
}

// 删除作品及其章节（修复 v4 C7：补充权限校验，仅作品所有者或管理员可删除）
export async function DELETE(request: NextRequest) {
  const urlAddr = new URL(request.url)
  const bookId = urlAddr.searchParams.get('id')

  if (!bookId) {
    return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 })
  }

  // 鉴权：校验登录态 + 作品归属
  const actor = await getRequestActor(request)
  if (!actor.userId) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  const allBooks = loadNovelBooks()

  // 先找到作品校验权限
  const targetBook: (NovelBookEntry & { userId?: string }) | undefined = (allBooks as Array<NovelBookEntry & { userId?: string }>).find((b) => b.id === bookId)
  if (!targetBook) {
    return NextResponse.json({ error: '作品不存在' }, { status: 404 })
  }
  if (!actor.isAdmin) {
    if (isAdminOnlyNovel(String(bookId))) {
      return NextResponse.json({ error: '无权删除此作品' }, { status: 403 })
    }
    if (targetBook.userId && String(targetBook.userId) !== String(actor.userId)) {
      return NextResponse.json({ error: '无权删除他人作品' }, { status: 403 })
    }
  }

  const keptBooks = []
  for (let i = 0; i < allBooks.length; i++) {
    if (allBooks[i].id !== bookId) {
      keptBooks.push(allBooks[i])
    }
  }
  saveNovelBooks(keptBooks)

  const chapterDir = join(LOCAL_DATA_DIR, 'chapters', bookId + '.json')
  if (existsSync(chapterDir)) {
    unlinkSync(chapterDir)
  }

  return NextResponse.json({ runCheckTag: true })
}