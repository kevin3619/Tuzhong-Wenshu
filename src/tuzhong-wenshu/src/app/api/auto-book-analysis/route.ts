/**
 * 自动拆书API - 第二期核心接口
 * 
 * 输入书名 → 搜索书籍信息 → LLM深度拆解 → 结构化映射 → 返回完整分析
 * 打通「搜索+长文本解析+结构化映射」全链路
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildBookAnalysisMapping, BOOK_ANALYSIS_PROMPT } from '@/lib/ai/promptLibrary'
import { callLLMWithFallback } from '@/lib/ai/llm'
import { lenientParseJSON } from '@/lib/ai/json-lenient'
import { deconstructChapterBlueprint } from '@/lib/ai/story-deconstruct'

// 复用第一期拆书搜索的数据库
interface BookData {
  title: string
  author: string
  genre: string
  status: string
  chapterCount: string
  wordCount: string
  synopsis: string
  tags: string[]
  characters: Array<{ name: string; role: string; note: string }>
  structure: string
  sellingPoints: string[]
  worldBuilding: string
  powerSystem: string
  writingStyle: string
  keywords: string[]
  source: string
  sourceUrl?: string
  accuracyNote?: string
  // 修复 v4 TS2339：补充实际使用但接口缺失的字段
  totalChapters?: number
  confidence?: number
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { bookName, llmConfig } = body

    if (!bookName || !bookName.trim()) {
      return NextResponse.json({ error: '请输入小说名称' }, { status: 400 })
    }

    // 🔥 2026-08-21：自动模式下前端 getStepLlmConfig 返回 null，导致此接口 400 "请先配置AI模型"，
    //   从而让仿写模式自动拆书失败、回退到普通模式。这里改为：前端未显式传模型时，
    //   自动从 models.json 读取管理员默认（含有效 API Key）模型作为拆书用模型。
    var _effLlmConfig = llmConfig && llmConfig.apiKey ? llmConfig : null
    if (!_effLlmConfig) {
      try {
        const _fs = require('fs')
        const _path = require('path')
        const _fp = _path.join(process.cwd(), '.tuzhong-data', 'models.json')
        if (_fs.existsSync(_fp)) {
          const _models = Array.isArray(JSON.parse(_fs.readFileSync(_fp, 'utf-8'))) ? JSON.parse(_fs.readFileSync(_fp, 'utf-8')) : []
          const _valid = function (m: any) { return m && m.apiKey && !String(m.apiKey).includes('*') && m.model }
          // 🔥 P2 #8 安全修复：只取管理员共享默认模型（status==='default'），
          //   不回退「任意首个有效 Key 模型」——models.json 含多用户模型，会越权占用他人 Key。
          const _default = _models.find(function (m: any) { return m.status === 'default' && _valid(m) }) || null
          if (_default) {
            _effLlmConfig = {
              provider: _default.provider || '硅基流动',
              apiKey: String(_default.apiKey).replace(/[`'"]/g, '').trim(),
              baseUrl: String(_default.baseUrl || 'https://api.siliconflow.cn/v1').replace(/[`'"]/g, '').trim(),
              model: _default.model,
            }
          }
        }
      } catch (_e) { console.error('[auto-book-analysis] 读取默认模型配置失败:', _e) }
    }
    if (!_effLlmConfig) {
      const _envKey = String((process.env.SILICONFLOW_API_KEY as string) || '')
      if (_envKey) {
        _effLlmConfig = {
          provider: '硅基流动',
          apiKey: _envKey.replace(/[`'"]/g, '').trim(),
          baseUrl: String((process.env.SILICONFLOW_BASE_URL as string) || 'https://api.siliconflow.cn/v1').replace(/[`'"]/g, '').trim(),
          model: String((process.env.SILICONFLOW_MODEL_PRIMARY as string) || 'THUDM/GLM-4-9B-0414'),
        }
      }
    }

    const searchName = bookName.trim()
    console.log('[auto-book-analysis] 开始自动拆书:', searchName)

    // Step 1: 搜索书籍信息
    let bookData: BookData | null = null
    try {
      // 调用内部 book-search API
      const searchRes = await fetch(`${req.nextUrl.origin}/tuzhong-wenshu/api/book-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookName: searchName }),
      })
      if (searchRes.ok) {
        const searchJson = await searchRes.json()
        if (searchJson.success && searchJson.data) {
          bookData = searchJson.data
        }
      }
    } catch (err) {
      console.error('[auto-book-analysis] 全网搜索图书信息失败:', err)
    }

    // Step 2: 构建LLM提示词
    let bookInfoPrompt = ''
    if (bookData) {
      // 有真实数据，构建详细上下文
      // 将数据分为"铁律数据"（必须严格遵循）和"参考数据"（可补充）
      const ironcladData: string[] = []
      if (bookData.author) ironcladData.push(`- 作者：${bookData.author}`)
      if (bookData.wordCount) ironcladData.push(`- 总字数：${bookData.wordCount}`)
      if (bookData.chapterCount) ironcladData.push(`- 总章节数：${bookData.chapterCount}`)
      if (bookData.genre) ironcladData.push(`- 类型：${bookData.genre}`)
      if (bookData.status) ironcladData.push(`- 状态：${bookData.status}`)
      
      // 从角色中提取主角名作为铁律
      const protagonist = bookData.characters.find(c => c.role === '主角' || c.role === '男主')
      if (protagonist) {
        ironcladData.push(`- 主角姓名：${protagonist.name}`)
      }
      
      bookInfoPrompt = `以下是从百度搜索获取的小说《${bookData.title}》的真实信息，请基于这些信息进行深度拆解：

【🔥🔥🔥 铁律数据·绝对不能改·最高优先级】
以下数据是从网络公开资料中提取的真实数据，你的分析必须严格遵循，绝对不能编造或修改！
${ironcladData.join('\n')}
⚠️ 注意：totalChapters 和 avgChapterWords 字段必须基于真实的章节数和字数计算，不能瞎编！

【基本信息】
- 书名：${bookData.title}
- 作者：${bookData.author}
- 类型：${bookData.genre}
- 状态：${bookData.status}
- 章节数：${bookData.chapterCount}
- 总字数：${bookData.wordCount}

【简介】
${bookData.synopsis || '（从搜索结果中提取）'}

【主要角色】
${bookData.characters && bookData.characters.length > 0 
  ? bookData.characters.map(c => `- ${c.name}（${c.role}）：${c.note}`).join('\n')
  : '（请基于你对该小说的了解补充）'}

【标签/关键词】
${bookData.keywords?.join('、') || bookData.tags?.join('、') || ''}

请基于以上真实信息，深度拆解该小说的创作骨架。关键数据（字数、章节数、作者、主角名）必须严格遵循，绝对不能编造！`
    } else {
      // 无真实数据，让LLM基于自身知识分析
      bookInfoPrompt = `请基于你对网络小说《${searchName}》的了解，深度拆解该小说的创作骨架。如果你不了解这部小说，请基于该类型小说的典型创作模式给出合理分析，并注明哪些数据是你的推测。`
    }

    const prompt = BOOK_ANALYSIS_PROMPT.replace(/\{\{bookTitle\}\}/g, searchName)
    const fullPrompt = `${prompt}\n\n【参考信息】\n${bookInfoPrompt}\n\n请严格按照上述JSON格式输出拆解结果，所有字段必须填充，JSON必须完整有效。🔥 关键数据（字数、章节数、作者、主角名）必须与真实数据一致，绝对不能编造！`

    // Step 3: 调用LLM进行拆解
    const llmResponse = await callLLMWithFallback(
      _effLlmConfig,
      [
        { role: 'system', content: '你是一位专业的网文拆书分析师。只输出JSON格式，不要任何额外文字。' },
        { role: 'user', content: fullPrompt },
      ],
      undefined,
      { temperature: 0.3, maxTokens: 8000 }
    )

    // Step 4: 解析LLM返回的JSON
    let analysis: Record<string, unknown>
    const responseText = llmResponse.content
    try {
      // 尝试提取JSON（可能被包裹在代码块中）
      let jsonStr = responseText
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim()
      }
      analysis = JSON.parse(jsonStr)
    } catch (parseErr) {
      // 尝试修复常见JSON问题
      try {
        const cleaned = responseText
          .replace(/```(?:json)?\s*/g, '')
          .replace(/```\s*$/g, '')
          .replace(/\/\/[^\n]*/g, '')
          .trim()
        analysis = JSON.parse(cleaned)
      } catch {
        // 🔥 P0 修复：免费档 9B 模型产出"语义正确但 JSON 语法有小错"的高频问题原文，
        //   直接丢弃太浪费。改为用 lenientParseJSON 做最大努力容错解析，宁可返回部分正确
        //   的对象，也不返回 500 导致前端"自动拆书失败→回退普通模式"，让仿写全链路失效。
        let _lenient: any = null
        try { _lenient = lenientParseJSON(responseText) } catch (_le) { _lenient = null }
        if (_lenient && typeof _lenient === 'object' && Object.keys(_lenient).length > 0) {
          analysis = _lenient as Record<string, unknown>
        } else {
          return NextResponse.json({
            error: 'AI拆解结果格式异常，请重试或使用手动导入',
            rawResponse: responseText.substring(0, 500),
          }, { status: 500 })
        }
      }
    }

    // 校验必填字段
    if (!analysis.bookName) analysis.bookName = searchName
    if (!analysis.bookGenre) analysis.bookGenre = bookData?.genre || '玄幻'

    // 🔥 P2.1.1-P2.1.4 修复：从搜索结果补全空字段（作者/类型/字数/章节数）
    // LLM 拆解有时会漏填这些基础字段，必须从 bookData 中补全
    if (!analysis.author && bookData?.author) {
      analysis.author = bookData.author
    }
    if (!analysis.bookGenre || analysis.bookGenre === '玄幻') {
      // 如果 LLM 兜底为玄幻但 bookData 有更准确的类型，使用 bookData 的类型
      if (bookData?.genre && bookData.genre !== '玄幻') {
        analysis.bookGenre = bookData.genre
      }
    }
    if (!analysis.totalChapters && bookData?.totalChapters) {
      analysis.totalChapters = bookData.totalChapters
    } else if (!analysis.totalChapters && bookData?.chapterCount) {
      // chapterCount 字符串格式："746章"，提取数字
      const numMatch = String(bookData.chapterCount).match(/\d+/)
      if (numMatch) {
        analysis.totalChapters = parseInt(numMatch[0], 10)
      }
    }
    if (!analysis.totalWords && bookData?.wordCount) {
      analysis.totalWords = bookData.wordCount
    }
    // 主角名兜底
    if (!analysis.protagonistName && bookData?.characters) {
      const proto = bookData.characters.find((c: { role?: string; name?: string }) => c.role === '主角' || c.role === '男主')
      if (proto?.name) {
        analysis.protagonistName = proto.name
      }
    }

    console.log('[auto-book-analysis] 拆解完成:', analysis.bookName, 'Genre:', analysis.bookGenre, '作者:', analysis.author || '(空)')

    // 🔥 2026-08-27 #9 schema 规范化：修复 LLM 乱键 + 数值兜底，保证 buildBookAnalysisMapping 能取到规范键
    try {
      const _keySignatures: Record<string, string[]> = {
        worldviewFramework: ['worldview', '世界观'],
        powerSystemModel: ['powerfinger', 'powersystem', 'goldenfinger', 'cheat', '金手指', '力量体系'],
        characterArchetypes: ['character', 'archetype', '人设', '角色'],
        factionStructure: ['faction', '势力', 'organ'],
        plotStructure: ['plot', '剧情', 'storyline'],
      }
      const _lower = (k: string) => String(k).toLowerCase()
      for (const canonical of Object.keys(_keySignatures)) {
        if (analysis[canonical] && typeof analysis[canonical] === 'object') continue
        const sigs = _keySignatures[canonical]
        for (const k of Object.keys(analysis)) {
          if (k === canonical) continue
          const lk = _lower(k)
          if (sigs.some(s => lk.includes(s.toLowerCase())) && analysis[k] && typeof analysis[k] === 'object') {
            analysis[canonical] = analysis[k]
            break
          }
        }
      }
      // 数值兜底：totalChapters / avgChapterWords 归入合理网文区间
      const _tc = Number(analysis.totalChapters)
      if (!Number.isFinite(_tc) || _tc < 10 || _tc > 20000) { analysis.totalChapters = bookData?.totalChapters || 200 }
      const _aw = Number(analysis.avgChapterWords)
      if (!Number.isFinite(_aw) || _aw < 800 || _aw > 6000) { analysis.avgChapterWords = 2500 }
    } catch (_normErr) { console.warn('[auto-book-analysis] #9 规范化异常（忽略）:', _normErr) }

    // Step 5: 执行结构化映射
    const mapping = buildBookAnalysisMapping(analysis)

    // Step 6: 章节级仿写骨架（黄金三章/单章循环/节奏/伏笔/爽点/禁止复制清单）
    //   失败或解析失败一律降级为 null，绝不影响原有返回值
    let chapterBlueprint: any = null
    try {
      chapterBlueprint = await deconstructChapterBlueprint({
        bookName: String(analysis.bookName || searchName),
        bookMeta: bookData || analysis,
        llmConfig: _effLlmConfig,
      })
    } catch (_bpErr) {
      console.warn('[auto-book-analysis] 章节骨架拆解失败（已忽略）:', _bpErr)
      chapterBlueprint = null
    }

    return NextResponse.json({
      success: true,
      data: {
        analysis,
        mapping,
        ...(chapterBlueprint ? { chapterBlueprint } : {}),
        bookName: analysis.bookName,
        bookGenre: analysis.bookGenre,
        // 🔥 P2.1.1-P2.1.4 修复：确保关键字段在响应顶层也可访问
        author: analysis.author || bookData?.author || '',
        totalChapters: analysis.totalChapters || bookData?.totalChapters || 300,
        totalWords: analysis.totalWords || bookData?.wordCount || '',
        avgChapterWords: analysis.avgChapterWords || 2500,
        protagonistName: analysis.protagonistName || '',
        // 搜索来源信息（含完整字段，方便前端展示）
        searchSource: bookData ? {
          title: bookData.title,
          author: bookData.author,
          genre: bookData.genre,
          source: bookData.source,
          sourceUrl: bookData.sourceUrl,
          chapterCount: bookData.chapterCount,
          wordCount: bookData.wordCount,
          totalChapters: bookData.totalChapters,
          synopsis: bookData.synopsis ? String(bookData.synopsis).substring(0, 200) : '',
          accuracyNote: bookData.accuracyNote,
          confidence: bookData.confidence,
        } : null,
      }
    })

  } catch (error: unknown) {
    console.error('[auto-book-analysis] 异常:', error)
    const errMsg = error instanceof Error ? error.message : '自动拆书失败，请稍后重试'
    return NextResponse.json({
      error: errMsg || '自动拆书失败，请稍后重试',
    }, { status: 500 })
  }
}