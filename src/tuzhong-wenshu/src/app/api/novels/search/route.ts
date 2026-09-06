import { NextRequest, NextResponse } from 'next/server'

// 对标作品搜索API
// 优先对接真实API，API不可用时使用经典作品参考库

const TIMEOUT_MS = 8000

// 统一返回的作品接口
interface NovelWork {
  id: string
  title: string
  author: string
  genre: string
  wordCount: number
  description: string
  source: string
  coverUrl: string
  lastUpdate: string
}

// 经典网文参考库（用于对标分析的真实作品数据）
// 这些是真实存在的经典网文，用于帮助用户进行写作风格对标
const CLASSIC_WORKS: NovelWork[] = [
  { id: 'ref-1', title: '斗破苍穹', author: '天蚕土豆', genre: '玄幻', wordCount: 5300000, description: '三十年河东，三十年河西，莫欺少年穷！废材逆袭经典，热血升级流代表作。', source: '起点中文网', coverUrl: '', lastUpdate: '2011-07' },
  { id: 'ref-2', title: '遮天', author: '辰东', genre: '玄幻', wordCount: 5100000, description: '冰冷与黑暗并存的宇宙深处，九具庞大的龙尸拉着一口古老的铜棺...宏大世界观，悬念迭起。', source: '起点中文网', coverUrl: '', lastUpdate: '2013-05' },
  { id: 'ref-3', title: '凡人修仙传', author: '忘语', genre: '仙侠', wordCount: 7800000, description: '一个普通山村小子，偶然下进入到当地江湖小门派，成了一名记名弟子...凡人流开山之作。', source: '起点中文网', coverUrl: '', lastUpdate: '2013-09' },
  { id: 'ref-4', title: '诡秘之主', author: '爱潜水的乌贼', genre: '悬疑', wordCount: 3800000, description: '蒸汽与机械的浪潮中，谁能触及非凡？克苏鲁+蒸汽朋克，设定严谨神作。', source: '起点中文网', coverUrl: '', lastUpdate: '2020-05' },
  { id: 'ref-5', title: '庆余年', author: '猫腻', genre: '历史', wordCount: 4200000, description: '积善之家，必有余庆，留余庆，留余庆，忽遇恩人...权谋+穿越，文笔细腻。', source: '起点中文网', coverUrl: '', lastUpdate: '2008-01' },
  { id: 'ref-6', title: '全职高手', author: '蝴蝶蓝', genre: '游戏', wordCount: 5600000, description: '网游荣耀中被誉为教科书级别的顶尖高手叶修...电竞题材巅峰之作。', source: '起点中文网', coverUrl: '', lastUpdate: '2014-04' },
  { id: 'ref-7', title: '完美世界', author: '辰东', genre: '玄幻', wordCount: 5800000, description: '一粒尘可填海，一根草斩日月星辰...辰东又一神作，世界观宏大。', source: '起点中文网', coverUrl: '', lastUpdate: '2016-08' },
  { id: 'ref-8', title: '大奉打更人', author: '卖报小郎君', genre: '仙侠', wordCount: 4500000, description: '这个世界很诡异，有武夫、有道人、有儒生...探案+修仙，幽默风趣。', source: '起点中文网', coverUrl: '', lastUpdate: '2021-06' },
  { id: 'ref-9', title: '雪中悍刀行', author: '烽火戏诸侯', genre: '武侠', wordCount: 4500000, description: '江湖是一张珠帘。大人物小人物，是珠子...江湖气十足，文笔老辣。', source: '起点中文网', coverUrl: '', lastUpdate: '2019-12' },
  { id: 'ref-10', title: '将夜', author: '猫腻', genre: '玄幻', wordCount: 4200000, description: '与天斗，其乐无穷...猫腻代表作，哲学思辨与热血并存。', source: '起点中文网', coverUrl: '', lastUpdate: '2014-05' },
  { id: 'ref-11', title: '牧神记', author: '宅猪', genre: '玄幻', wordCount: 5800000, description: '大墟的祖神说，牧儿，你要守护好天魔教...改革流玄幻，设定新颖。', source: '起点中文网', coverUrl: '', lastUpdate: '2019-07' },
  { id: 'ref-12', title: '剑来', author: '烽火戏诸侯', genre: '仙侠', wordCount: 8500000, description: '大千世界，无奇不有...烽火又一力作，慢热但后劲十足。', source: '起点中文网', coverUrl: '', lastUpdate: '连载中' },
  { id: 'ref-13', title: '天道图书馆', author: '横扫天涯', genre: '玄幻', wordCount: 5200000, description: '穿越异界，脑海中出现一个图书馆...系统流爽文，节奏明快。', source: '起点中文网', coverUrl: '', lastUpdate: '2019-04' },
  { id: 'ref-14', title: '万族之劫', author: '老鹰吃小鸡', genre: '玄幻', wordCount: 8300000, description: '万族林立，人族求存...热血爽文，更新速度惊人。', source: '起点中文网', coverUrl: '', lastUpdate: '2021-05' },
  { id: 'ref-15', title: '深空之流浪舰队', author: '最终永恒', genre: '科幻', wordCount: 3200000, description: '人类文明进入星际时代...硬科幻题材，设定严谨。', source: '起点中文网', coverUrl: '', lastUpdate: '2020-08' },
  { id: 'ref-16', title: '赘婿', author: '愤怒的香蕉', genre: '历史', wordCount: 5100000, description: '武朝末年，岁月峥嵘...历史穿越，商战+权谋，慢热精品。', source: '起点中文网', coverUrl: '', lastUpdate: '连载中' },
  { id: 'ref-17', title: '我有一座恐怖屋', author: '我会修空调', genre: '悬疑', wordCount: 3500000, description: '继承一座恐怖屋...灵异恐怖题材，惊悚刺激。', source: '起点中文网', coverUrl: '', lastUpdate: '2019-06' },
  { id: 'ref-18', title: '超神机械师', author: '齐佩甲', genre: '科幻', wordCount: 4800000, description: '穿越到游戏世界，成为NPC...游戏科幻，设定新颖有趣。', source: '起点中文网', coverUrl: '', lastUpdate: '2021-02' },
  { id: 'ref-19', title: '绍宋', author: '榴弹怕水', genre: '历史', wordCount: 2300000, description: '穿越宋朝，历史文精品，考据严谨，文笔老练，主角赵构。', source: '起点中文网', coverUrl: '', lastUpdate: '2021-03' },
  { id: 'ref-20', title: '赤心巡天', author: '情何以甚', genre: '仙侠', wordCount: 4000000, description: '少年侠气，交结五都雄...仙侠新秀，文笔优美，人物刻画出色。', source: '起点中文网', coverUrl: '', lastUpdate: '连载中' },
]

// 带超时的 fetch 封装
async function fetchWithTimeout(url: string, timeoutMs: number = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
      }
    })
    return response
  } finally {
    clearTimeout(timer)
  }
}

// ==================== 尝试真实API ====================

async function tryRealAPIs(keyword: string): Promise<{ works: NovelWork[], source: string }> {
  // 尝试追书神器API
  try {
    const url = `https://api.zhuishushenqi.com/book/fuzzy-search?query=${encodeURIComponent(keyword)}`
    const response = await fetchWithTimeout(url)
    
    if (response.ok) {
      const data = await response.json()
      const books = data?.books || []
      
      if (Array.isArray(books) && books.length > 0) {
        const works = books.map((book: Record<string, unknown>) => ({
          id: String(book._id || ''),
          title: String(book.title || ''),
          author: String(book.author || '佚名'),
          genre: String(book.majorCate || book.minorCate || '其他'),
          wordCount: parseInt(String(book.wordCount || '0'), 10) || 0,
          description: String(book.shortIntro || ''),
          source: '追书神器',
          coverUrl: String(book.cover || ''),
          lastUpdate: String(book.updated || ''),
        }))
        return { works, source: '追书神器API' }
      }
    }
  } catch (err) {
    console.warn('[小说搜索] 追书神器API失败:', err)
  }

  return { works: [], source: '' }
}

// ==================== 本地搜索（经典作品库） ====================

function searchLocal(keyword: string): NovelWork[] {
  const kw = keyword.toLowerCase()
  return CLASSIC_WORKS.filter(work => 
    work.title.toLowerCase().includes(kw) ||
    work.author.toLowerCase().includes(kw) ||
    work.genre.toLowerCase().includes(kw) ||
    work.description.toLowerCase().includes(kw)
  )
}

// ==================== GET 路由处理 ====================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q') || ''
  const type = searchParams.get('type') || 'search'

  // 搜索模式
  if (type === 'search') {
    if (!query.trim()) {
      return NextResponse.json({
        success: true,
        works: [],
        message: '请输入搜索关键词',
      })
    }

    const keyword = query.trim()
    
    // 先尝试真实API
    const apiResult = await tryRealAPIs(keyword)
    if (apiResult.works.length > 0) {
      return NextResponse.json({
        success: true,
        works: apiResult.works,
        total: apiResult.works.length,
        source: apiResult.source,
        message: `从${apiResult.source}找到 ${apiResult.works.length} 部相关作品`,
      })
    }

    // API无结果，使用本地经典作品库
    const localResults = searchLocal(keyword)
    
    return NextResponse.json({
      success: true,
      works: localResults,
      total: localResults.length,
      source: '经典作品库',
      message: localResults.length > 0
        ? `从经典作品库找到 ${localResults.length} 部相关作品`
        : '未找到相关作品，请尝试：斗破、遮天、诡秘、庆余年、全职高手等关键词',
    })
  }

  // 获取全部经典作品（用于推荐）
  if (type === 'all') {
    return NextResponse.json({
      success: true,
      works: CLASSIC_WORKS,
      total: CLASSIC_WORKS.length,
      source: '经典作品库',
    })
  }

  // 未知 type
  return NextResponse.json({
    success: false,
    message: `不支持的请求类型: ${type}，支持的类型有: search, all`,
  }, { status: 400 })
}
