import { NextRequest, NextResponse } from 'next/server'
import { callLLM, SILICONFLOW_MODELS, XFYUN_MODELS, SILICONFLOW_MODEL_WHITELIST, type LLMMessage } from '@/lib/ai/llm'
import { getRequestActor } from '@/lib/permissions'
import { checkRateLimit, getClientIpFromRequest } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import fs from 'fs'
import path from 'path'

// 优先从 models.json 读取管理员导入的硅基流动 API Key（与 AI 生成路由保持一致）
function getSiliconflowApiKeyFromModels(): string {
  try {
    const modelsPath = path.join(process.cwd(), '.tuzhong-data', 'models.json')
    if (!fs.existsSync(modelsPath)) return ''
    const parsed = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'))
    if (!Array.isArray(parsed)) return ''
    // 优先找封面绘图专用的 Kolors 模型；否则取任意硅基流动有效 key
    const kolors = parsed.find(function (m: any) {
      return m && m.provider && String(m.provider).includes('硅基') && m.model === 'Kwai-Kolors/Kolors' && m.apiKey && !String(m.apiKey).includes('*')
    })
    if (kolors && kolors.apiKey) return String(kolors.apiKey).trim()
    const anySf = parsed.find(function (m: any) {
      return m && m.provider && String(m.provider).includes('硅基') && m.apiKey && !String(m.apiKey).includes('*')
    })
    if (anySf && anySf.apiKey) return String(anySf.apiKey).trim()
  } catch (_e) { console.error('[generate-cover] 读取模型配置提取 API Key 失败:', _e) }
  return ''
}

function getImageDimensions(buffer: ArrayBuffer, contentType: string): { width: number; height: number } | null {
  const arr = new Uint8Array(buffer)
  try {
    if (contentType.includes('png')) {
      if (arr.length < 24) return null
      if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47) {
        const width = (arr[16] << 24) | (arr[17] << 16) | (arr[18] << 8) | arr[19]
        const height = (arr[20] << 24) | (arr[21] << 16) | (arr[22] << 8) | arr[23]
        return { width: width >>> 0, height: height >>> 0 }
      }
    }
    if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      let offset = 2
      while (offset < arr.length - 1) {
        if (arr[offset] !== 0xFF) break
        const marker = arr[offset + 1]
        if (marker === 0xD8 || marker === 0xD9) {
          offset += 2
          continue
        }
        const segmentLength = (arr[offset + 2] << 8) | arr[offset + 3]
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          const height = (arr[offset + 5] << 8) | arr[offset + 6]
          const width = (arr[offset + 7] << 8) | arr[offset + 8]
          return { width, height }
        }
        offset += 2 + segmentLength
      }
    }
    if (contentType.includes('webp')) {
      if (arr.length < 30) return null
      const riff = String.fromCharCode(arr[0], arr[1], arr[2], arr[3])
      const webp = String.fromCharCode(arr[8], arr[9], arr[10], arr[11])
      if (riff === 'RIFF' && webp === 'WEBP') {
        const vp8 = String.fromCharCode(arr[12], arr[13], arr[14], arr[15])
        if (vp8 === 'VP8 ' && arr.length >= 30) {
          const width = arr[26] | (arr[27] << 8)
          const height = arr[28] | (arr[29] << 8)
          return { width: width & 0x3FFF, height: height & 0x3FFF }
        }
        if (vp8 === 'VP8X' && arr.length >= 30) {
          const width = 1 + arr[24] + (arr[25] << 8) + (arr[26] << 16)
          const height = 1 + arr[27] + (arr[28] << 8) + (arr[29] << 16)
          return { width, height }
        }
      }
    }
  } catch (e) {
    console.error('[generate-cover] 解析PNG尺寸失败:', e)
  }
  return null
}

/**
 * 🔥 2026-10-22：封面规格门禁（移植自 oh-story skills/story-cover）
 * - 番茄封面标准比例 3:4（600×800，实际出图 768×1024 同比例）；
 * - 书名 ≤20 字、笔名 ≤12 字，保证在中央 85% 安全区内可排版；
 * - 画面内不生成文字，书名/笔名由前端排版叠加。
 */
function validateCoverSpec(input: { title: string; author: string; genre: string; width: number; height: number }) {
  const warnings: string[] = []
  const titleLen = (input.title || '').trim().length
  const authorLen = (input.author || '').trim().length
  if (titleLen > 20) warnings.push('书名 ' + titleLen + ' 字，超过封面安全排版 20 字上限，建议精简')
  if (authorLen > 12) warnings.push('笔名 ' + authorLen + ' 字，超过 12 字上限，建议精简')
  if (!input.genre) warnings.push('未提供题材，封面风格锚点可能不准')
  const ratio = input.height > 0 ? input.width / input.height : 0
  if (Math.abs(ratio - 0.75) > 0.02) {
    warnings.push('封面比例 ' + input.width + '×' + input.height + ' 非 3:4，番茄建议 600×800')
  }
  return {
    ok: warnings.length === 0,
    titleLen,
    authorLen,
    ratio: Math.round(ratio * 100) / 100,
    safeArea: 'central-85%',
    noTextInImage: true,
    warnings,
  }
}

// 封面生成API - 使用SDXL图片生成，失败时降级为SVG占位封面
export async function POST(request: NextRequest) {
  try {
    // 修复 v4 C9：增加 JWT 登录校验，防止匿名滥用付费图片生成
    const actor = await getRequestActor(request)
    if (!actor.userId) {
      return NextResponse.json({ error: '请先登录后再生成封面' }, { status: 401 })
    }

    // 修复 v6 M9：封面生成接口速率限制（每用户每分钟 3 次，图片生成成本较高）
    const clientIp = getClientIpFromRequest(request)
    const rateLimitKey = 'generate-cover:' + actor.userId + ':' + clientIp
    const rateLimitResult = checkRateLimit(rateLimitKey, 3, 60 * 1000, 3 * 60 * 1000)
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ error: '请求过于频繁，请稍后再试' }, {
        status: 429,
        headers: rateLimitResult.retryAfterSec ? { 'Retry-After': String(rateLimitResult.retryAfterSec) } : {}
      })
    }

    const body = await request.json()
    const { prompt, title, author, genre, width, height, colorScheme, previousData } = body || {}

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: '缺少封面描述' }, { status: 400 })
    }

    // 输入清洗：限制长度，防止注入
    const safePrompt = prompt.trim().slice(0, 500)
    const safeTitle = (title || '未命名小说').trim().slice(0, 100)
    const safeAuthor = (author || '').trim().slice(0, 50)
    const safeGenre = (genre || '').trim().slice(0, 20)
    // 封面尺寸，默认番茄小说尺寸
    const coverWidth = Number(width) || 600
    const coverHeight = Number(height) || 800
    const coverCheck = validateCoverSpec({
      title: safeTitle,
      author: safeAuthor,
      genre: safeGenre,
      width: coverWidth,
      height: coverHeight,
    })

    // 🔥 2026-10-22 题材视觉锚点库（移植自 oh-story skills/story-cover/references/cover-styles.md）
    //   该仓库的封面流程已被番茄签约作品验证：题材定风格层 → 平台定比例（番茄 600×800 = 3:4）→
    //   画面层分前景人物/中景场景/远景氛围；书名与笔名必须落在中央 85% 安全区。
    //   这里只借用它的「题材视觉词汇」，配色仍由本作设定动态推导（保持本项目原有优势）。
    const _COVER_STYLE_ANCHORS: Array<{ re: RegExp; text: string }> = [
      {
        re: /历史|古代|明|宋|唐|三国|大明|朝堂|权谋|战争|将军|谋士|军事|宫斗|古装/,
        text: '题材风格标签：historical Chinese war epic, grand battlefield panorama；\n人物：将军铠甲/谋士长袍，执兵器或持文牍，姿态有决断；\n背景三层：前景人物或器物（官印/军报/刀枪），中景城墙/军营/朝堂座次，远景烽火与烟尘天际；\n色彩：铁灰 + 暗红 + 土黄，金甲光泽与烽火橙点缀；\n光效：dramatic battlefield firelight, smoke-filled sky, sunset over war；\n书名字体：heavy stone-carved seal script in deep red；笔名字体：small dignified white Song typeface text；\n画风：digital painting style，不要照片感。',
      },
      {
        re: /玄幻|仙侠|修真|洪荒|神话|上古|封神|巫|灵气|境界/,
        text: '题材风格标签：Chinese xianxia fantasy epic, celestial mountains and floating islands；\n人物：长袍剑修/持灵器，周身灵光；\n背景三层：前景人物或法器，中景山门云海，远景仙宫与星河；\n色彩：靛蓝 + 金白 + 墨黑，灵光青紫点缀；\n光效：ethereal spirit glow, flowing clouds, moonlight halo。',
      },
      {
        re: /宫斗|宅斗|古言|言情|后宫|闺阁/,
        text: '题材风格标签：Chinese palace intrigue romance, ornate interior with silk drapes；\n人物：华服女子/朝服男子，仪态克制；\n背景三层：前景宫灯/绣帕，中景回廊朱门，远景宫墙暮色；\n色彩：胭脂红 + 黛青 + 象牙金；\n光效：candlelit interior, soft rose and gold rim light。',
      },
      {
        re: /都市|现代|职场|商战|校园|重生|异能/,
        text: '题材风格标签：modern urban drama, neon cityscape；\n人物：现代着装主角，剪影或半身；\n背景三层：前景道具，中景玻璃幕墙街景，远景城市夜色；\n色彩：冷蓝 + 暖橙 + 墨黑；\n光效：cinematic neon rim light, shallow depth of field。',
      },
    ]
    const _pickAnchor = (text: string): string => {
      for (const a of _COVER_STYLE_ANCHORS) if (a.re.test(text)) return a.text
      return ''
    }

    // 🔥 修复：从前序设定中提取核心视觉要素，让 LLM 基于本作前序设定动态推导配色与风格
    // 不再使用硬编码题材→配色映射（如洪荒=金橙红黑·仙侠=青白紫金等）
    const _prevIdea = previousData?.idea || {}
    const _prevSynopsis = previousData?.synopsis || {}
    const _prevWb = previousData?.worldbuilding || {}
    const _prevChars = previousData?.characters || {}
    const _prevPs = previousData?.powerSystem || {}
    const _prevBa = previousData?.bookAnalysis || {}
    // 构建前序设定摘要（仅提取视觉相关字段，控制总长度避免超长）
    const _prevSettingLines: string[] = []
    // 🔥 P1 修复：优先注入拆书结果中的题材/文风信息，确保封面贴合目标作品
    if (_prevBa.bookName) _prevSettingLines.push('【仿写目标作品】' + String(_prevBa.bookName).slice(0, 60))
    if (_prevBa.bookGenre) _prevSettingLines.push('【目标作品题材】' + String(_prevBa.bookGenre).slice(0, 40))
    if (_prevBa.analysis?.writingStyle) _prevSettingLines.push('【目标作品文风】' + String(_prevBa.analysis.writingStyle).slice(0, 100))
    if (_prevBa.analysis?.synopsis) _prevSettingLines.push('【目标作品简介】' + String(_prevBa.analysis.synopsis).slice(0, 150))
    if (_prevIdea.title) _prevSettingLines.push('【作品标题】' + String(_prevIdea.title).slice(0, 60))
    if (_prevIdea.theme || _prevIdea.writingStyle) _prevSettingLines.push('【主题/文风】' + String(_prevIdea.theme || '').slice(0, 80) + ' / ' + String(_prevIdea.writingStyle || '').slice(0, 80))
    if (_prevWb.era) _prevSettingLines.push('【时代背景】' + String(_prevWb.era).slice(0, 100))
    if (_prevWb.geography || _prevWb.location || _prevWb.background) _prevSettingLines.push('【地理环境】' + String(_prevWb.geography || _prevWb.location || _prevWb.background || '').slice(0, 150))
    if (_prevWb.atmosphere || _prevWb.tone) _prevSettingLines.push('【世界氛围】' + String(_prevWb.atmosphere || _prevWb.tone || '').slice(0, 100))
    if (_prevChars.protagonist?.name) _prevSettingLines.push('【主角姓名】' + String(_prevChars.protagonist.name).slice(0, 40))
    if (_prevChars.protagonist?.appearance) _prevSettingLines.push('【主角外貌】' + String(_prevChars.protagonist.appearance).slice(0, 150))
    if (_prevChars.protagonist?.signatureItem || _prevChars.protagonist?.signature) _prevSettingLines.push('【主角标志物】' + String(_prevChars.protagonist.signatureItem || _prevChars.protagonist.signature || '').slice(0, 100))
    if (_prevChars.protagonist?.clothing || _prevChars.protagonist?.outfit) _prevSettingLines.push('【主角服装】' + String(_prevChars.protagonist.clothing || _prevChars.protagonist.outfit || '').slice(0, 100))
    if (_prevPs.coreElement || _prevPs.name) _prevSettingLines.push('【力量体系核心】' + String(_prevPs.coreElement || _prevPs.name || '').slice(0, 100))
    if (_prevSynopsis.oneLineIntro || _prevIdea.hook) _prevSettingLines.push('【一句话简介】' + String(_prevSynopsis.oneLineIntro || _prevIdea.hook || '').slice(0, 120))
    if (_prevSynopsis.emotionTone) _prevSettingLines.push('【情感基调】' + String(_prevSynopsis.emotionTone).slice(0, 80))
    const _prevSettingText = _prevSettingLines.join('\n')

    // 主URL - 使用SiliconFlow API（项目中已配置的大模型服务）
    const siliconFlowUrl = process.env.SILICONFLOW_BASE_URL || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2'
    const siliconFlowApiKey = process.env.SILICONFLOW_API_KEY || ''

    // 备选URL1 - 使用trae图片生成API
    // 构建增强的竖版封面prompt，确保生成竖版封面图
    const traePrompt = `${safePrompt}, vertical portrait book cover, portrait orientation, tall format, vertical composition, book cover design, portrait aspect ratio, vertical layout`
    const traeUrl = `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(traePrompt)}&image_size=portrait_4_3`

    // 备选URL2 - 使用DeepAI API（修复 v4 C9：从环境变量读取 API Key，移除硬编码）
    const deepAiUrl = `https://api.deepai.org/api/text2img`
    const deepAiApiKey = process.env.DEEPAI_API_KEY || ''

    console.log('[generate-cover] 开始生成封面:', { title: safeTitle, author: safeAuthor, genre: safeGenre })

    // ============ 🔥 新封面流水线（首选）：Qwen2.5-7B 生成绘画Prompt → Kwai-Kolors 绘图 ============
    // SiliconFlow（硅基流动）API 固定使用 https://api.siliconflow.cn/v1，不读取 SILICONFLOW_BASE_URL（可能指向讯飞星火）
    const sfBaseUrl = 'https://api.siliconflow.cn/v1'
    // 🔥 关键修复：优先读取 models.json 中管理员导入的硅基流动 Key（页面一键导入后全局生效）。
    // 未导入时回退到 SILICONFLOW_API_KEY 环境变量，但 .env 中不应再硬编码密钥。
    // 硅基流动的密钥必须是 sk- 开头，避免误用讯飞星火密钥格式（appid:apikey:secret）导致 401。
    const modelsSfKey = getSiliconflowApiKeyFromModels()
    const envSfKey = (process.env.SILICONFLOW_API_KEY as string) || ''
    const candidateSfKey = modelsSfKey || envSfKey
    const isSfKeyFormat = typeof candidateSfKey === 'string' && candidateSfKey.startsWith('sk-') && candidateSfKey.length > 20
    // 修复 v4 C9：移除对 SILICONFLOW_MODELS[0]?.apiKey 硬编码密钥的回退，仅使用 models.json 或环境变量
    const sfApiKey = isSfKeyFormat ? candidateSfKey : ''
    const useKwaiPipeline = !!(sfApiKey && SILICONFLOW_MODEL_WHITELIST.has('Kwai-Kolors/Kolors'))
    // 收集 Kwai-Kolors 流水线的错误信息，用于在所有方案失败时返回到前端
    let kwaiPipelineError: string = ''
    // 记录实际使用的封面模型，用于前端展示
    let actualCoverModel = 'Kwai-Kolors/Kolors'

    if (useKwaiPipeline) {
      try {
        // -------- Step1：Qwen/Qwen2.5-7B-Instruct 生成正向+反向绘画提示词 --------
        // 🔥 修复：移除硬编码题材→配色映射，改为要求 LLM 基于本作前序设定动态推导配色
        const coverPromptGenMessages: LLMMessage[] = [
          {
            role: 'system',
            content: '你是中文网文封面美术总监，精通番茄小说Top100+起点月票榜爆款封面视觉要素。\n' +
              '任务：根据输入的【标题】【作者】【题材】【用户描述】【本作前序设定】，输出严格JSON格式的绘画提示词，分正向提示词(positivePrompt)和反向提示词(negativePrompt)。\n' +
              '正向提示词(positivePrompt)要求（200-300字中文，以【本作主题与意境】为第一核心，不要强行放人物）：\n' +
              '1. 画面主体（依据小说主题/核心冲突/世界观，选择最能表达本书的视觉主体：可以是宏大场景、时代意象、象征性器物/建筑/山河/战场/城池/舰队/秘境等；人物仅为可选点缀，绝不能作为强制居中的人物特写大头贴；除非题材本身以单人英雄为卖点，否则以场景与意境为主、人物占比小或不出镜）\n' +
              '2. 主题表达（必须呼应【本作前序设定】的核心冲突与情感基调，让读者一眼看懂本书讲什么）\n' +
              '3. 光影氛围（电影级布光·体积光·明暗对比·景深·氛围粒子·黄金时刻或戏剧性光源）\n' +
              '4. 场景细节（基于【本作前序设定】的地理环境/时代背景/世界氛围设计，考据准确、有信息量）\n' +
              '5. 艺术风格（电影海报级质感·高细节写实CG渲染/厚涂数字绘画·构图大气有张力·色彩层次丰富；坚决避免低幼卡通、明显手绘笔触、塑料感与廉价插画风）\n' +
              '6. 构图规范（竖版封面构图·视觉焦点明确·顶部留白15%给书名·底部留白15%给作者/题材·左右留边5%装饰）\n' +
              '7. 色彩体系（强制：必须基于【本作前序设定】中的世界氛围/情感基调/力量体系核心动态推导三色系配色·主色+深色背景+高光点缀·冷暖对比·禁止使用题材→配色的硬编码映射·禁止跨题材混搭配色）\n' +
              '反向提示词(negativePrompt)要求（80-120字中文）：\n' +
              '低质量·模糊·变形·畸形·丑陋·水印·logo·签名·任何文字·多余手指/肢体·拼接·色块崩坏·脏污·噪点·过曝·欠曝·扁平化·卡通幼态·明显手绘草图感·强制居中人物大头贴·肖像特写·画框·裁切头手·透视错误·人体比例错误·性别模糊·表情呆滞·塑料感·AI感\n' +
              '仅输出JSON：{"positivePrompt":"...","negativePrompt":"..."}，不要解释不要代码块不要思考。'
          },
          {
            role: 'user',
            content: _prevSettingText
              ? `【标题】${safeTitle}\n【作者】${safeAuthor || '佚名'}\n【题材】${safeGenre || '玄幻'}\n【用户原始描述】${safePrompt}\n\n【本作前序设定】\n${_prevSettingText}\n\n请严格基于【本作前序设定】中的主角外貌、标志物、地理环境、世界氛围、力量体系核心、情感基调动态推导配色与风格，生成正向+反向提示词JSON。禁止使用题材→配色的硬编码映射。`
              : `【标题】${safeTitle}\n【作者】${safeAuthor || '佚名'}\n【题材】${safeGenre || '玄幻'}\n【用户原始描述】${safePrompt}\n\n请生成正向+反向提示词JSON。`
          }
        ]
        const promptCfg = { provider: '硅基流动', apiKey: sfApiKey, baseUrl: sfBaseUrl, model: 'Qwen/Qwen2.5-7B-Instruct' }
        // 🔥 2026-10-22 题材视觉锚点（移植自 oh-story skills/story-cover/references/cover-styles.md，
        //   该仓库的封面流程已被番茄签约作品验证）。只作为「视觉词汇锚点」注入，
        //   具体配色仍由本作前序设定动态推导（不做题材→配色的硬编码映射）。
        const _styleAnchor = _pickAnchor(String(safeGenre || '') + ' ' + String(safePrompt || '') + ' ' + String(_prevWb.era || ''))
        if (_styleAnchor) {
          coverPromptGenMessages[1].content += '\n\n【题材视觉锚点（参照以下词汇与层次，配色仍须结合本作设定推导）】\n' + _styleAnchor
        }
        // 🔥 Step1 超时 90 秒（文本生成任务）
        const promptRaw = await callLLM(promptCfg, coverPromptGenMessages, { maxTokens: 1000, temperature: 0.63, timeoutMs: 90000 })
        let promptJsonStr = promptRaw
          .replace(/```json\s*/gi, '').replace(/```\s*/g, '')
          .replace(/<think[\s\S]*?<\/think>/gi, '')
          .replace(/<ret>/gi, '\n').trim()
        const pFirst = promptJsonStr.indexOf('{')
        const pLast = promptJsonStr.lastIndexOf('}')
        if (pFirst !== -1 && pLast > pFirst) promptJsonStr = promptJsonStr.substring(pFirst, pLast + 1)
        let positivePrompt = safePrompt
        let negativePrompt = 'blurry, low quality, bad anatomy, watermark, text, signature, deformed'
        try {
          const promptObj = JSON.parse(promptJsonStr)
          if (promptObj.positivePrompt && typeof promptObj.positivePrompt === 'string') positivePrompt = promptObj.positivePrompt.slice(0, 600)
          if (promptObj.negativePrompt && typeof promptObj.negativePrompt === 'string') negativePrompt = promptObj.negativePrompt.slice(0, 300)
        } catch (_jsonErr) {
          console.error('[generate-cover] 解析prompt JSON失败，使用默认提示词:', _jsonErr)
        }

        // 加入封面强化后缀（竖版构图、768×1024番茄标准、专业级封面要求）
        // 🔥 修复：移除硬编码"主色金/青/红"和"古风边框"，边框/风格完全由题材和前序设定动态推导
        // 🔥 基于题材动态选择边框装饰风格
        const _coverKeywords = String((_prevIdea.keywords || [])?.join(' ') || '') + ' ' + String((_prevSynopsis.keywords || [])?.join(' ') || '')
        const _coverGenre = String(safeGenre || '') + ' ' + _coverKeywords + ' ' + String(_prevIdea.title || '') + ' ' + String(_prevWb.era || '')
        let _borderStyle = '精美装饰边框'
        let _artStyle = '电影海报级写实CG·高细节数字绘画'
        if (/科幻|星际|宇宙|基因|机甲|未来|赛博|末世|星舰|虫族|银河|外星|科技|吞噬星空|星域|维度|量子/i.test(_coverGenre)) {
          _borderStyle = '科幻几何光效边框（能量线条·电路纹理·星辰点缀·金属质感）'
          _artStyle = '科幻电影海报级写实CG'
        } else if (/西幻|魔法|斗气|骑士|魔法学院|教廷|精灵|矮人|盘龙|西方|奇幻|玉兰大陆|魔法师|战士/i.test(_coverGenre)) {
          _borderStyle = '魔幻花纹边框（魔法符文·藤蔓卷草·哥特花纹·宝石装饰）'
          _artStyle = '西幻电影海报级写实CG'
        } else if (/洪荒|封神|巫族|上古|神话|巫妖|阐教|截教|鸿钧|祖巫|巫血图腾|部落/i.test(_coverGenre)) {
          _borderStyle = '上古图腾边框（青铜饕餮纹·祥云回纹·兽纹·巫祭图腾）'
          _artStyle = '上古神话电影海报级写实CG'
        } else if (/都市|现代|都市异能|商战|职场|校园|重生|城市|公司/i.test(_coverGenre)) {
          _borderStyle = '简约现代边框（几何线条·光影渐变·城市剪影装饰）'
          _artStyle = '现代都市电影海报级写实CG'
        } else {
          _borderStyle = '国风祥云边框（祥云卷纹·山水纹样·古典回纹·精美花纹）'
          _artStyle = '国风电影海报级写实CG·高细节数字绘画'
        }
        const verticalSuffix = '，竖版封面构图（768×1024，3:4），专业网文封面视觉，' + _artStyle + '，8K超高清，电影级布光（黄金侧光+体积光+暗角vignette+高对比HDR），材质与光影细节丰富（金属/石质/织物/木纹等质感·空气透视·景深），画面以主题场景与意境为视觉主体（不强制出现人物，避免居中人物大头贴），' + _borderStyle + '，画面视觉焦点居中偏下，顶部留白15%书名区，底部留白15%作者区，左右留边5%装饰纹区，禁止画面内任何文字/字母/数字，masterpiece，best quality，ultra-detailed，cinematic，trending on artstation'
        const finalPositive = (positivePrompt + verticalSuffix).slice(0, 1000)

        // -------- Step2：Kwai-Kolors/Kolors 生成封面图（768×1024 番茄标准竖版） --------
        // 🔥 关键修复：SiliconFlow API 使用 image_size 字符串参数，而不是 width/height
        // Kwai-Kolors/Kolors 支持的竖版尺寸：768x1024 (3:4)、960x1280 (3:4)、720x1280 (9:16)
        const coverW = 768
        const coverH = 1024
        const coverImageSize = '768x1024'
        // 🔥 图像生成超时 180 秒（图像生成通常需要更长时间）
        const kolorsController = new AbortController()
        const kolorsTimeout = setTimeout(() => kolorsController.abort(), 180000)
        const kolorsRes = await fetch(`${sfBaseUrl}/images/generations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sfApiKey },
          body: JSON.stringify({
            model: 'Kwai-Kolors/Kolors',
            prompt: finalPositive,
            negative_prompt: negativePrompt,
            image_size: coverImageSize,  // SiliconFlow API 使用 image_size 字符串参数
            batch_size: 1,
            num_inference_steps: 30,
            guidance_scale: 7.5,
            // 通过 provider 参数请求返回 base64 数据（SiliconFlow 默认返回 URL）
            provider: {
              enable_image_base64: true,
            },
          }),
          signal: kolorsController.signal,
        })
        clearTimeout(kolorsTimeout)
        if (kolorsRes.ok) {
          const kolorsData = await kolorsRes.json()
          // 🔥 兼容多种返回格式：data[0].b64_json、data[0].url、images[0].b64_json、images[0].url
          const b64 = kolorsData?.data?.[0]?.b64_json || kolorsData?.images?.[0]?.b64_json
          const kolorsImgUrl = kolorsData?.data?.[0]?.url || kolorsData?.images?.[0]?.url
          if (b64 && typeof b64 === 'string' && b64.length > 1000) {
            return NextResponse.json({
              coverUrl: `data:image/png;base64,${b64}`,
              title: safeTitle,
              coverCheck,
              positivePrompt: finalPositive,
              negativePrompt: negativePrompt,
              pipeline: 'Kwai-Kolors',
              width: coverW,
              height: coverH,
              _meta: { usedModel: actualCoverModel, usedProvider: '硅基流动' },
            })
          }
          // 如果返回的是 URL，下载图片并转换为 base64
          if (kolorsImgUrl && typeof kolorsImgUrl === 'string' && /^https?:\/\//.test(kolorsImgUrl)) {
            try {
              const imgResp = await fetch(kolorsImgUrl, { signal: AbortSignal.timeout(30000) })
              if (imgResp.ok) {
                const imgBuf = await imgResp.arrayBuffer()
                const imgB64 = Buffer.from(imgBuf).toString('base64')
                if (imgB64 && imgB64.length > 1000) {
                  return NextResponse.json({
                    coverUrl: `data:image/png;base64,${imgB64}`,
                    title: safeTitle,
                    coverCheck,
                    positivePrompt: finalPositive,
                    negativePrompt: negativePrompt,
                    pipeline: 'Kwai-Kolors',
                    width: coverW,
                    height: coverH,
                    _meta: { usedModel: actualCoverModel, usedProvider: '硅基流动' },
                  })
                }
              }
            } catch (dlErr: unknown) {
              console.error('[generate-cover] 封面图片下载失败:', dlErr)
            }
          }
          kwaiPipelineError = 'Kwai-Kolors 返回空图片数据'
        } else {
          const kErr = await kolorsRes.text()
          kwaiPipelineError = 'Kwai-Kolors HTTP ' + kolorsRes.status + ': ' + kErr.substring(0, 200)
        }
      } catch (pipeErr: unknown) {
        const pipeErrMsg = pipeErr instanceof Error ? pipeErr.message : String(pipeErr)
        kwaiPipelineError = pipeErrMsg
      }
    } else {
      // 🔥 如果 API key 缺失或格式错误，记录明确错误信息
      if (!sfApiKey) {
        kwaiPipelineError = '硅基流动 API 密钥未配置（环境变量 SILICONFLOW_API_KEY 缺失或不是 sk- 开头格式，且硬编码密钥不可用）'
      } else if (!SILICONFLOW_MODEL_WHITELIST.has('Kwai-Kolors/Kolors')) {
        kwaiPipelineError = 'Kwai-Kolors/Kolors 模型不在硅基流动白名单中'
      }
    }

    // ============ 首选方案：尝试使用SiliconFlow API（旧SDXL兜底，保留） ============
    // 🔥🔥🔥 问题4修复：讯飞星火API（SILICONFLOW_BASE_URL指向xf-yun.com）不支持/images/generations端点
    // 只有当base URL包含siliconflow.cn时才尝试SiliconFlow API，否则跳过避免浪费180秒超时
    if (siliconFlowApiKey && /siliconflow\.cn/i.test(siliconFlowUrl)) {
      try {
        const sfController = new AbortController()
        const sfTimeoutId = setTimeout(() => sfController.abort(), 180000)
        
        const sfRes = await fetch(`${siliconFlowUrl}/images/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${siliconFlowApiKey}`,
          },
          body: JSON.stringify({
            prompt: safePrompt,
            model: 'SDXL',
            response_format: 'base64',
            width: coverWidth,
            height: coverHeight,
          }),
          signal: sfController.signal,
        })
        
        clearTimeout(sfTimeoutId)
        
        if (sfRes.ok) {
          const data = await sfRes.json()
          if (data?.data?.[0]?.b64_json) {
            const base64Url = `data:image/png;base64,${data.data[0].b64_json}`
            return NextResponse.json({
              coverUrl: base64Url,
              title: safeTitle,
              coverCheck,
              _meta: { usedModel: actualCoverModel, usedProvider: '硅基流动' },
            })
          }
        }
      } catch (sfErr: unknown) {
        console.error('[generate-cover] 硅基流动封面生成失败:', sfErr)
      }
    }

    // ============ 备选方案1：尝试使用trae图片生成API ============
    const maxRetries = 5
    let finalImageUrl: string | null = null
    let finalImageData: string | null = null
    const startTime = Date.now()

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      try {
        const imageRes = await fetch(traeUrl, { signal: controller.signal })
        clearTimeout(timeoutId)


        if (imageRes.ok) {
          const contentType = imageRes.headers.get('content-type') || ''

          if (contentType.startsWith('image/')) {
            const imageBuffer = await imageRes.arrayBuffer()
            const imageSizeKB = imageBuffer.byteLength / 1024

            // 质量检测1：太小的图片（<2KB）很可能是占位图，跳过
            // 🔥🔥🔥 问题4修复：放宽阈值（从5KB→2KB），避免有效的小图片被跳过
            if (imageSizeKB < 2) {
              if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 5000))
                continue
              }
              break
            }

            // 质量检测2：检查图片尺寸
            const dims = getImageDimensions(imageBuffer, contentType)
            if (dims) {

              // 🔥🔥🔥 问题4修复：放宽宽高比检测（从0.5-1.2→0.3-1.5），接受更多竖版图片
              // portrait_4_3比例约为0.75，但trae API可能返回略有偏差的图片
              const ratio = dims.width / dims.height
              if (ratio < 0.3 || ratio > 1.5) {
                if (attempt < maxRetries - 1) {
                  await new Promise(resolve => setTimeout(resolve, 6000))
                  continue
                }
                // 🔥🔥🔥 问题4修复：如果是最后一次重试，即使宽高比不符也接受图片（有图总比SVG好）
              }
            }

            // 图片质量合格
            const imageBase64 = Buffer.from(imageBuffer).toString('base64')
            const imageMime = contentType.split(';')[0].trim() || 'image/png'
            const dataUrl = `data:${imageMime};base64,${imageBase64}`
            finalImageData = dataUrl
            break
          }

          // 尝试解析JSON，提取图片URL
          const responseText = await imageRes.text()

          // 🔥 2026-10-16 占位图拦截：trae API 未就绪时会返回文本占位提示
          //   （如「The image is generating... Please refresh preview.」）或 HTML 错误页。
          //   旧逻辑只认 JSON 字段 / http 前缀，未识别占位文本，导致占位/低质结果被当正式封面继续合成。
          //   此处显式识别占位特征 → 跳过本轮、继续重试/回退（只接受真正的图片 URL / JSON / data URL）。
          if (!/^\s*(https?:\/\/|\{|\[|data:image\/)/.test(responseText) ||
              /generating|refresh preview|please wait|still processing|image is being|生成中|请刷新/i.test(responseText)) {
            if (attempt < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, 4000))
              continue
            }
            break
          }

          try {
            const data = JSON.parse(responseText)
            const imageUrl = data?.coverUrl || data?.url || data?.image_url || data?.imageUrl
              || data?.data?.url || data?.result?.url || data?.image
              || data?.data?.image_url || data?.result?.image_url
            if (imageUrl && typeof imageUrl === 'string' && imageUrl.length > 10) {
              finalImageUrl = imageUrl
              break
            }
            const base64Data = data?.base64 || data?.image_base64 || data?.data?.base64
              || data?.result?.base64 || data?.imageData
            if (base64Data && typeof base64Data === 'string' && base64Data.length > 100) {
              const base64Url = `data:image/png;base64,${base64Data}`
              finalImageData = base64Url
              break
            }
          } catch (jsonErr) {
            const trimmed = responseText.trim()
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
              finalImageUrl = trimmed
              break
            }
          }
        } else {
          break
        }
      } catch (fetchErr: unknown) {
        clearTimeout(timeoutId)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
      }
      
      if (Date.now() - startTime > 60000) {
        break
      }
    }

    if (finalImageData || finalImageUrl) {
      actualCoverModel = 'trae-image'
    }

    if (finalImageData) {
      return NextResponse.json({
        coverUrl: finalImageData,
        title: safeTitle,
        coverCheck,
        _meta: { usedModel: actualCoverModel, usedProvider: 'trae' },
      })
    }
    if (finalImageUrl) {
      return NextResponse.json({
        coverUrl: finalImageUrl,
        title: safeTitle,
        coverCheck,
        _meta: { usedModel: actualCoverModel, usedProvider: 'trae' },
      })
    }

    // ============ 备选方案2：尝试使用DeepAI API（仅当配置了 DEEPAI_API_KEY 时） ============
    if (deepAiApiKey) {
      try {
        const deepAiController = new AbortController()
        const deepAiTimeoutId = setTimeout(() => deepAiController.abort(), 60000)

        const deepAiRes = await fetch(deepAiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': deepAiApiKey,
          },
          body: JSON.stringify({ text: safePrompt }),
          signal: deepAiController.signal,
        })

        clearTimeout(deepAiTimeoutId)

        if (deepAiRes.ok) {
          const data = await deepAiRes.json()
          if (data?.output_url) {
            return NextResponse.json({
              coverUrl: data.output_url,
              title: safeTitle,
              coverCheck,
              _meta: { usedModel: 'DeepAI/text2img', usedProvider: 'DeepAI' },
            })
          }
        }
      } catch (deepAiErr: unknown) {
        console.error('[generate-cover] DeepAI 封面生成失败:', deepAiErr)
      }
    }

    // ============ 降级方案：生成SVG占位封面 ============
    // 🔥 关键修复：将 Kwai-Kolors 流水线错误信息传递到前端，便于诊断
    const fallbackReason = kwaiPipelineError || '所有图片API均不可用'
    console.log('[generate-cover] 降级原因:', fallbackReason)
    const svgCover = generateSVGCover(safeTitle, safeAuthor, safeGenre, coverWidth, coverHeight, colorScheme)
    // 使用base64编码，避免URL编码中#字符被解析为fragment标识符导致SVG内容截断
    const svgBase64 = Buffer.from(svgCover, 'utf-8').toString('base64')
    const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`

    return NextResponse.json({
      coverUrl: svgDataUrl,
      svgContent: svgCover,
      title: safeTitle,
      coverCheck,
      isFallback: true,
      // 🔥 将详细的错误原因返回到前端，便于用户和开发者诊断
      fallbackReason: fallbackReason,
      _meta: { usedModel: 'SVG-Fallback', usedProvider: 'local' },
    })
  } catch (error) {
    console.error('[generate-cover] 封面生成失败:', error)
    // 修复 v4 C10：生产环境不向客户端泄露内部异常详情
    const isProd = process.env.NODE_ENV === 'production'
    const errMsg = isProd
      ? '封面生成服务异常，请稍后重试'
      : (error instanceof Error ? (error.message || '未知错误') : String(error))
    return NextResponse.json(
      { error: '封面生成失败：' + errMsg },
      { status: 500 }
    )
  }
}

// 生成SVG占位封面（当图片API不可用时的降级方案）
function generateSVGCover(title: string, author: string, genre: string, width: number, height: number, customColorScheme?: { colors?: string[] }): string {
  // 根据类型选择颜色方案，如果有自定义配色方案则使用
  const colorSchemes: Record<string, { bg: string; accent: string; text: string }> = {
    '玄幻': { bg: '#1a0a2e', accent: '#d4a017', text: '#f0e6d3' },
    '仙侠': { bg: '#0a1628', accent: '#7eb8da', text: '#e8f0f8' },
    '都市': { bg: '#1a1a2e', accent: '#e94560', text: '#f0f0f0' },
    '历史': { bg: '#2e1a0a', accent: '#c9a96e', text: '#f5e6d3' },
    '科幻': { bg: '#0a0a1a', accent: '#00d4ff', text: '#e0f0ff' },
    '末世': { bg: '#1a0a0a', accent: '#ff4444', text: '#e0d0d0' },
    '悬疑': { bg: '#0a0a0a', accent: '#888888', text: '#d0d0d0' },
    '武侠': { bg: '#1a0a0a', accent: '#c9a96e', text: '#f0e6d3' },
    '系统流': { bg: '#0a1a2e', accent: '#00ff88', text: '#e0f0e0' },
    '重生': { bg: '#2e0a1a', accent: '#ffd700', text: '#f0e0d0' },
    '穿越': { bg: '#1a0a2e', accent: '#ff6b9d', text: '#f0e0f0' },
    '洪荒': { bg: '#0d0d1a', accent: '#ff6b35', text: '#f5e6d3' },
    '西幻': { bg: '#1a0a1a', accent: '#9b59b6', text: '#f0e6f0' },
    '奇幻': { bg: '#0a1a1a', accent: '#27ae60', text: '#e8f5e9' },
    '神话': { bg: '#1a0a0a', accent: '#f39c12', text: '#fef5e7' },
    '都市异能': { bg: '#1a1a2e', accent: '#e74c3c', text: '#ffebee' },
    '宫斗': { bg: '#2e1a2e', accent: '#e91e63', text: '#fce4ec' },
    '种田': { bg: '#0a1a0a', accent: '#8bc34a', text: '#f1f8e9' },
    '网游': { bg: '#0a0a2e', accent: '#3498db', text: '#ecf0f1' },
  }
  
  // 使用自定义配色方案或默认配色方案
  let scheme = colorSchemes[genre] || colorSchemes['玄幻']
  if (customColorScheme && customColorScheme.colors && customColorScheme.colors.length >= 3) {
    scheme = {
      bg: customColorScheme.colors[1] || scheme.bg,
      accent: customColorScheme.colors[0] || scheme.accent,
      text: customColorScheme.colors[2] || scheme.text,
    }
  }

  // 按比例缩放
  const scale = Math.min(width / 250, height / 350)
  const centerX = width / 2
  const titleSize = Math.round(22 * scale)
  const authorSize = Math.round(12 * scale)
  const tagSize = Math.round(10 * scale)
  const titleLineHeight = Math.round(36 * scale)
  const titleCharsPerLine = Math.max(6, Math.floor(12 * (width / 250)))

  const titleLines = wrapText(title, titleCharsPerLine)
  const titleY = titleLines.length === 1 ? height * 0.51 : (titleLines.length === 2 ? height * 0.47 : height * 0.43)

  const titleElements = titleLines.map((line, i) =>
    `<text x="${centerX}" y="${titleY + i * titleLineHeight}" text-anchor="middle" font-family="serif" font-size="${titleSize}" font-weight="bold" fill="${scheme.accent}">${escapeXml(line)}</text>`
  ).join('\n    ')

  // 根据题材生成装饰性背景元素
  let decorativeElements = ''
  const _genreLower = (genre || '').toLowerCase()
  const isXuanhuan = /玄幻|奇幻|魔幻|异界|异世/.test(genre)
  const isXianxia = /仙侠|修真|修仙|武侠/.test(genre)
  const isHistory = /历史|三国|大唐|大宋|大明|大清|权谋|种田/.test(genre)
  const isCity = /都市|职场|娱乐|校园/.test(genre)
  const isScifi = /科幻|末世|未来|星际|机甲/.test(genre)
  const isMystery = /悬疑|推理|灵异|恐怖|诡异/.test(genre)
  
  // ========== 远景层：山脉/建筑轮廓 ==========
  let farScene = ''
  
  // 通用远山剪影（所有题材底部都有）
  let mountainSilhouette = ''
  const _mountainY = height * 0.55
  mountainSilhouette += `<path d="M0 ${_mountainY + height * 0.08} L${width * 0.08} ${_mountainY + height * 0.02} L${width * 0.15} ${_mountainY + height * 0.06} L${width * 0.25} ${_mountainY - height * 0.02} L${width * 0.35} ${_mountainY + height * 0.04} L${width * 0.45} ${_mountainY - height * 0.05} L${width * 0.55} ${_mountainY + height * 0.03} L${width * 0.65} ${_mountainY - height * 0.03} L${width * 0.75} ${_mountainY + height * 0.05} L${width * 0.85} ${_mountainY - height * 0.01} L${width * 0.92} ${_mountainY + height * 0.04} L${width} ${_mountainY + height * 0.07} L${width} ${height} L0 ${height} Z" fill="${scheme.accent}" opacity="0.08"/>`
  mountainSilhouette += `<path d="M0 ${_mountainY + height * 0.15} L${width * 0.1} ${_mountainY + height * 0.08} L${width * 0.2} ${_mountainY + height * 0.12} L${width * 0.3} ${_mountainY + height * 0.05} L${width * 0.4} ${_mountainY + height * 0.1} L${width * 0.5} ${_mountainY + height * 0.03} L${width * 0.6} ${_mountainY + height * 0.09} L${width * 0.7} ${_mountainY + height * 0.06} L${width * 0.8} ${_mountainY + height * 0.11} L${width * 0.9} ${_mountainY + height * 0.07} L${width} ${_mountainY + height * 0.13} L${width} ${height} L0 ${height} Z" fill="${scheme.accent}" opacity="0.12"/>`
  farScene += mountainSilhouette
  
  // 玄幻/仙侠：添加云雾、月亮、仙山楼阁
  if (isXuanhuan || isXianxia) {
    // 月亮/太阳
    const moonY = height * 0.18
    const moonR = width * 0.09
    farScene += `<circle cx="${width * 0.72}" cy="${moonY}" r="${moonR}" fill="${scheme.accent}" opacity="0.12"/>`
    farScene += `<circle cx="${width * 0.72}" cy="${moonY}" r="${moonR * 0.8}" fill="${scheme.accent}" opacity="0.08"/>`
    // 仙山塔/楼阁剪影（中景）
    const pagodaX = width * 0.3
    const pagodaY = height * 0.42
    farScene += `<rect x="${pagodaX - 6 * scale}" y="${pagodaY}" width="${12 * scale}" height="${height * 0.08}" fill="${scheme.accent}" opacity="0.15"/>`
    farScene += `<polygon points="${pagodaX - 10 * scale},${pagodaY} ${pagodaX + 10 * scale},${pagodaY} ${pagodaX},${pagodaY - 12 * scale}" fill="${scheme.accent}" opacity="0.15"/>`
    farScene += `<polygon points="${pagodaX - 14 * scale},${pagodaY + height * 0.02} ${pagodaX + 14 * scale},${pagodaY + height * 0.02} ${pagodaX - 8 * scale},${pagodaY - 4 * scale} ${pagodaX + 8 * scale},${pagodaY - 4 * scale}" fill="${scheme.accent}" opacity="0.12"/>`
    // 右侧小塔
    farScene += `<rect x="${width * 0.65}" y="${height * 0.48}" width="${8 * scale}" height="${height * 0.05}" fill="${scheme.accent}" opacity="0.1"/>`
    farScene += `<polygon points="${width * 0.65 - 6 * scale},${height * 0.48} ${width * 0.65 + 14 * scale},${height * 0.48} ${width * 0.65 + 4 * scale},${height * 0.48 - 8 * scale}" fill="${scheme.accent}" opacity="0.1"/>`
    // 云雾带
    for (let _ci = 0; _ci < 6; _ci++) {
      const _cx = width * (0.05 + _ci * 0.18)
      const _cy = height * (0.3 + (_ci % 3) * 0.08)
      const _cw = width * (0.12 + (_ci % 2) * 0.06)
      const _ch = height * 0.03
      farScene += `<ellipse cx="${_cx}" cy="${_cy}" rx="${_cw}" ry="${_ch}" fill="${scheme.text}" opacity="0.06"/>`
    }
    // 悬浮山石
    farScene += `<ellipse cx="${width * 0.15}" cy="${height * 0.28}" rx="${width * 0.05}" ry="${height * 0.02}" fill="${scheme.accent}" opacity="0.1"/>`
    farScene += `<ellipse cx="${width * 0.85}" cy="${height * 0.32}" rx="${width * 0.04}" ry="${height * 0.015}" fill="${scheme.accent}" opacity="0.08"/>`
  }
  
  // 历史/权谋：宫殿建筑轮廓
  if (isHistory) {
    // 宫殿飞檐剪影
    const palaceY = height * 0.4
    // 主殿
    farScene += `<rect x="${width * 0.35}" y="${palaceY}" width="${width * 0.3}" height="${height * 0.12}" fill="${scheme.accent}" opacity="0.15"/>`
    farScene += `<polygon points="${width * 0.32},${palaceY} ${width * 0.68},${palaceY} ${width * 0.62},${palaceY - height * 0.06} ${width * 0.38},${palaceY - height * 0.06}" fill="${scheme.accent}" opacity="0.18"/>`
    farScene += `<polygon points="${width * 0.3},${palaceY + height * 0.02} ${width * 0.7},${palaceY + height * 0.02} ${width * 0.64},${palaceY - height * 0.03} ${width * 0.36},${palaceY - height * 0.03}" fill="${scheme.accent}" opacity="0.12"/>`
    // 左右配殿
    farScene += `<rect x="${width * 0.12}" y="${palaceY + height * 0.04}" width="${width * 0.15}" height="${height * 0.08}" fill="${scheme.accent}" opacity="0.1"/>`
    farScene += `<polygon points="${width * 0.1},${palaceY + height * 0.04} ${width * 0.29},${palaceY + height * 0.04} ${width * 0.25},${palaceY} ${width * 0.14},${palaceY}" fill="${scheme.accent}" opacity="0.12"/>`
    farScene += `<rect x="${width * 0.73}" y="${palaceY + height * 0.04}" width="${width * 0.15}" height="${height * 0.08}" fill="${scheme.accent}" opacity="0.1"/>`
    farScene += `<polygon points="${width * 0.71},${palaceY + height * 0.04} ${width * 0.9},${palaceY + height * 0.04} ${width * 0.86},${palaceY} ${width * 0.75},${palaceY}" fill="${scheme.accent}" opacity="0.12"/>`
  }
  
  // 都市/现代：城市天际线
  if (isCity) {
    const skylineY = height * 0.4
    const buildings = [
      { x: 0.05, w: 0.08, h: 0.22 },
      { x: 0.14, w: 0.06, h: 0.15 },
      { x: 0.21, w: 0.1, h: 0.28 },
      { x: 0.32, w: 0.07, h: 0.18 },
      { x: 0.4, w: 0.12, h: 0.32 },
      { x: 0.53, w: 0.08, h: 0.2 },
      { x: 0.62, w: 0.1, h: 0.26 },
      { x: 0.73, w: 0.06, h: 0.14 },
      { x: 0.8, w: 0.09, h: 0.24 },
      { x: 0.9, w: 0.07, h: 0.17 },
    ]
    for (let _bi = 0; _bi < buildings.length; _bi++) {
      const _b = buildings[_bi]
      farScene += `<rect x="${width * _b.x}" y="${skylineY + height * (0.3 - _b.h)}" width="${width * _b.w}" height="${height * _b.h}" fill="${scheme.accent}" opacity="0.12"/>`
      // 窗户灯光
      for (let _wi = 0; _wi < 3; _wi++) {
        for (let _wj = 0; _wj < 5; _wj++) {
          if ((_wi + _wj) % 2 === 0) {
            farScene += `<rect x="${width * _b.x + width * 0.01 + _wi * width * 0.02}" y="${skylineY + height * (0.3 - _b.h) + height * 0.02 + _wj * height * 0.03}" width="${width * 0.008}" height="${height * 0.012}" fill="${scheme.accent}" opacity="0.25"/>`
          }
        }
      }
    }
  }
  
  // 科幻/末世：废墟/未来建筑
  if (isScifi) {
    const scifiY = height * 0.45
    // 科技感圆环
    farScene += `<circle cx="${width * 0.5}" cy="${height * 0.25}" r="${width * 0.15}" fill="none" stroke="${scheme.accent}" stroke-width="1" opacity="0.1"/>`
    farScene += `<circle cx="${width * 0.5}" cy="${height * 0.25}" r="${width * 0.12}" fill="none" stroke="${scheme.accent}" stroke-width="0.5" opacity="0.08"/>`
    // 残破建筑
    farScene += `<rect x="${width * 0.1}" y="${scifiY}" width="${width * 0.12}" height="${height * 0.15}" fill="${scheme.accent}" opacity="0.1"/>`
    farScene += `<polygon points="${width * 0.1},${scifiY} ${width * 0.22},${scifiY} ${width * 0.22},${scifiY - height * 0.03} ${width * 0.15},${scifiY - height * 0.05} ${width * 0.1},${scifiY - height * 0.02}" fill="${scheme.accent}" opacity="0.08"/>`
    farScene += `<rect x="${width * 0.7}" y="${scifiY - height * 0.03}" width="${width * 0.15}" height="${height * 0.18}" fill="${scheme.accent}" opacity="0.12"/>`
  }
  
  // 悬疑/灵异：枯树、残月
  if (isMystery) {
    // 残月
    farScene += `<circle cx="${width * 0.3}" cy="${height * 0.2}" r="${width * 0.07}" fill="${scheme.accent}" opacity="0.08"/>`
    farScene += `<circle cx="${width * 0.3 - width * 0.02}" cy="${height * 0.2 - height * 0.01}" r="${width * 0.06}" fill="${scheme.bg}" opacity="1"/>`
    // 枯树剪影
    farScene += `<path d="M${width * 0.15} ${height * 0.6} L${width * 0.15} ${height * 0.4} L${width * 0.12} ${height * 0.48} M${width * 0.15} ${height * 0.45} L${width * 0.18} ${height * 0.38} M${width * 0.15} ${height * 0.5} L${width * 0.11} ${height * 0.44}" stroke="${scheme.accent}" stroke-width="2" opacity="0.15" fill="none"/>`
    farScene += `<path d="M${width * 0.85} ${height * 0.58} L${width * 0.85} ${height * 0.42} L${width * 0.88} ${height * 0.5} M${width * 0.85} ${height * 0.47} L${width * 0.82} ${height * 0.4} M${width * 0.85} ${height * 0.52} L${width * 0.89} ${height * 0.46}" stroke="${scheme.accent}" stroke-width="2" opacity="0.12" fill="none"/>`
  }
  
  decorativeElements += farScene
  
  // ========== 中景层：星光/光点/漂浮物 ==========
  
  // 通用装饰：星光/光点效果（所有题材都有）
  let starDots = ''
  for (let _si = 0; _si < 40; _si++) {
    const _sx = Math.floor((_si * 37 + 13) % 92 + 4)
    const _sy = Math.floor((_si * 53 + 7) % 50 + 5)
    const _sr = (_si % 3 === 0) ? 1.8 : ((_si % 2 === 0) ? 1.2 : 0.8)
    const _so = 0.2 + ((_si * 7) % 30) / 100
    starDots += `<circle cx="${width * _sx / 100}" cy="${height * _sy / 100}" r="${_sr * scale}" fill="${scheme.accent}" opacity="${_so}"/>`
  }
  decorativeElements += starDots
  
  // 玄幻/仙侠：添加飞舞的花瓣/光点
  if (isXuanhuan || isXianxia) {
    let petals = ''
    for (let _pi = 0; _pi < 15; _pi++) {
      const _px = width * ((_pi * 29 + 17) % 90 + 5) / 100
      const _py = height * ((_pi * 41 + 23) % 60 + 15) / 100
      const _ps = 2 + (_pi % 3)
      petals += `<ellipse cx="${_px}" cy="${_py}" rx="${_ps * scale}" ry="${_ps * 0.6 * scale}" fill="${scheme.accent}" opacity="0.25" transform="rotate(${_pi * 25} ${_px} ${_py})"/>`
    }
    decorativeElements += petals
  }
  
  // 历史：飘落的花瓣/灯笼
  if (isHistory) {
    let lanterns = ''
    for (let _li = 0; _li < 5; _li++) {
      const _lx = width * (0.15 + _li * 0.18)
      const _ly = height * 0.12 + (_li % 2) * height * 0.05
      lanterns += `<ellipse cx="${_lx}" cy="${_ly}" rx="${8 * scale}" ry="${10 * scale}" fill="${scheme.accent}" opacity="0.2"/>`
      lanterns += `<rect x="${_lx - 1.5 * scale}" y="${_ly - 14 * scale}" width="${3 * scale}" height="${5 * scale}" fill="${scheme.accent}" opacity="0.25"/>`
      lanterns += `<line x1="${_lx}" y1="${_ly - 16 * scale}" x2="${_lx}" y2="${_ly - 22 * scale}" stroke="${scheme.accent}" stroke-width="1" opacity="0.2"/>`
    }
    decorativeElements += lanterns
  }
  
  // 都市：霓虹光点
  if (isCity) {
    let neonDots = ''
    for (let _ni = 0; _ni < 20; _ni++) {
      const _nx = width * ((_ni * 23 + 11) % 85 + 8) / 100
      const _ny = height * ((_ni * 31 + 19) % 25 + 55) / 100
      neonDots += `<circle cx="${_nx}" cy="${_ny}" r="${1.5 * scale}" fill="${scheme.accent}" opacity="0.35"/>`
    }
    decorativeElements += neonDots
  }
  
  // 科幻：数据流/粒子
  if (isScifi) {
    let particles = ''
    for (let _pai = 0; _pai < 25; _pai++) {
      const _pax = width * ((_pai * 19 + 7) % 90 + 5) / 100
      const _pay = height * ((_pai * 29 + 13) % 40 + 10) / 100
      particles += `<rect x="${_pax}" y="${_pay}" width="${1.5 * scale}" height="${1.5 * scale}" fill="${scheme.accent}" opacity="0.3" transform="rotate(45 ${_pax} ${_pay})"/>`
    }
    decorativeElements += particles
  }
  
  // ========== 近景层：前景装饰 ==========
  
  // 通用前景：底部光晕
  decorativeElements += `<rect x="0" y="${height * 0.6}" width="${width}" height="${height * 0.4}" fill="url(#bottomFade)"/>`
  
  // 标题位置调整：移到底部（类似专业小说封面布局）
  const titleAreaY = height * 0.72
  const titleNewY = titleLines.length === 1 ? titleAreaY : (titleLines.length === 2 ? titleAreaY - height * 0.03 : titleAreaY - height * 0.06)
  
  // 重新生成标题元素（底部布局）
  const newTitleElements = titleLines.map((line, i) =>
    `<text x="${centerX}" y="${titleNewY + i * titleLineHeight}" text-anchor="middle" font-family="serif" font-size="${titleSize}" font-weight="bold" fill="${scheme.accent}" style="text-shadow: 0 0 ${10 * scale}px ${scheme.accent}40;">${escapeXml(line)}</text>`
  ).join('\n    ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="bgGradient" cx="50%" cy="20%" r="80%">
      <stop offset="0%" stop-color="${scheme.accent}" stop-opacity="0.18"/>
      <stop offset="40%" stop-color="${scheme.bg}" stop-opacity="1"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.4"/>
    </radialGradient>
    <linearGradient id="topGlow" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="${scheme.accent}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${scheme.accent}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottomFade" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.5"/>
    </linearGradient>
    <linearGradient id="titleBgGradient" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="50%" stop-color="#000000" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
  <rect width="${width}" height="${height * 0.35}" fill="url(#topGlow)"/>
  ${decorativeElements}
  <rect x="0" y="${height * 0.55}" width="${width}" height="${height * 0.45}" fill="url(#titleBgGradient)"/>
  <rect x="${width * 0.04}" y="${height * 0.04}" width="${width * 0.92}" height="${height * 0.92}" fill="none" stroke="${scheme.accent}" stroke-width="1" opacity="0.25" rx="${width * 0.015}"/>
  <rect x="${width * 0.06}" y="${height * 0.06}" width="${width * 0.88}" height="${height * 0.88}" fill="none" stroke="${scheme.accent}" stroke-width="0.5" opacity="0.15" rx="${width * 0.015}"/>
  <line x1="${width * 0.04}" y1="${height * 0.12}" x2="${width * 0.12}" y2="${height * 0.04}" stroke="${scheme.accent}" stroke-width="1" opacity="0.3"/>
  <line x1="${width * 0.88}" y1="${height * 0.04}" x2="${width * 0.96}" y2="${height * 0.12}" stroke="${scheme.accent}" stroke-width="1" opacity="0.3"/>
  <line x1="${width * 0.04}" y1="${height * 0.88}" x2="${width * 0.12}" y2="${height * 0.96}" stroke="${scheme.accent}" stroke-width="1" opacity="0.3"/>
  <line x1="${width * 0.88}" y1="${height * 0.96}" x2="${width * 0.96}" y2="${height * 0.88}" stroke="${scheme.accent}" stroke-width="1" opacity="0.3"/>
  <text x="${centerX}" y="${height * 0.66}" text-anchor="middle" font-family="sans-serif" font-size="${authorSize}" fill="${scheme.text}" opacity="0.8">${escapeXml(author || '佚名')} 著</text>
  ${newTitleElements}
  <rect x="${width * 0.3}" y="${height * 0.88}" width="${width * 0.4}" height="1" fill="${scheme.accent}" opacity="0.4"/>
  <rect x="${centerX - 40 * scale}" y="${height * 0.92}" width="${80 * scale}" height="${22 * scale}" rx="${11 * scale}" fill="none" stroke="${scheme.accent}" stroke-width="1" opacity="0.5"/>
  <text x="${centerX}" y="${height * 0.92 + 15 * scale}" text-anchor="middle" font-family="sans-serif" font-size="${tagSize}" fill="${scheme.accent}" opacity="0.7">${escapeXml(genre || '小说')}</text>
</svg>`
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const mid = Math.floor(text.length / 2)
  // 尝试在中间附近找标点符号或空格作为断点
  const breakChars = ['·', '：', '，', ' ', '、', '的', '之']
  let breakPoint = mid
  for (const ch of breakChars) {
    const idx = text.indexOf(ch, mid - 2)
    if (idx >= maxChars - 2 && idx <= text.length - 2) {
      breakPoint = idx + 1
      break
    }
  }
  if (breakPoint < maxChars) breakPoint = maxChars
  if (breakPoint > text.length - 3) breakPoint = text.length - 3
  return [text.slice(0, breakPoint), text.slice(breakPoint)]
}
