'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Loader2, BookCopy, Search, FileJson, Upload, Bot, Zap, Library, ChevronLeft, ChevronRight, Filter, RefreshCw, Wand2 } from 'lucide-react'
import { extractText } from '@/lib/text-utils'

interface StepInputProps {
  keywords: string
  setKeywords: (v: string) => void
  detailedDesignInput: string
  setDetailedDesignInput: (v: string) => void
  genre: string
  setGenre: (v: string) => void
  genres: string[]
  // 🔥 三种创作方式选择
  creationMode: 'normal' | 'imitate' | 'fanfiction' | 'custom'
  setCreationMode: (v: 'normal' | 'imitate' | 'fanfiction' | 'custom') => void
  imitateMode: boolean
  setImitateMode: (v: boolean) => void
  imitateSearch: string
  setImitateSearch: (v: string) => void
  imitateResult: Record<string, unknown> | null
  setImitateResult: (v: Record<string, unknown> | null) => void
  imitateLoading: boolean
  setImitateLoading: (v: boolean) => void
  imitateEditing: string | null
  setImitateEditing: (v: string | null) => void
  imitateSearchPhase: 'idle' | 'searching' | 'ai-analyzing' | 'done'
  setImitateSearchPhase: (v: 'idle' | 'searching' | 'ai-analyzing' | 'done') => void
  imitateData: Record<string, unknown> | null
  setImitateData: (v: Record<string, unknown> | null) => void
  // 🔥 主角设定（性别、姓名、年龄、身份背景）
  protagonistName: string
  setProtagonistName: (v: string) => void
  userBookTitle: string
  setUserBookTitle: (v: string) => void
  protagonistGender: string
  setProtagonistGender: (v: string) => void
  protagonistAge: string
  setProtagonistAge: (v: string) => void
  protagonistIdentity: string
  setProtagonistIdentity: (v: string) => void
  // 🔥 主角取名按钮：调用AI根据题材和主角设定生成姓名
  nameLoading: boolean
  onGenerateName: () => void
  // 🔥 自动设计主角：根据作品类型+关键词一键生成完整主角设定
  protagonistDesignLoading: boolean
  onAutoDesignProtagonist: () => void
  // 🔥 万能仿写·拆书导入
  bookAnalysisMode: boolean
  setBookAnalysisMode: (v: boolean) => void
  bookAnalysisJson: string
  setBookAnalysisJson: (v: string) => void
  bookAnalysisResult: Record<string, unknown> | null
  setBookAnalysisResult: (v: Record<string, unknown> | null) => void
  bookAnalysisLoading: boolean
  setBookAnalysisLoading: (v: boolean) => void
  onImportBookAnalysis: () => void
  // 🔥 第二期·自动拆书
  autoBookName: string
  setAutoBookName: (v: string) => void
  autoBookLoading: boolean
  onAutoBookAnalysis: () => void
  onGenerate: () => void
  onImitateSearch: () => void
  isLoading: boolean
}

export default function StepInput({
  keywords, setKeywords, detailedDesignInput, setDetailedDesignInput, genre, setGenre, genres,
  creationMode, setCreationMode,
  imitateMode, setImitateMode,
  imitateSearch, setImitateSearch,
  imitateResult, setImitateResult,
  imitateLoading, setImitateLoading,
  imitateEditing, setImitateEditing,
  imitateSearchPhase, setImitateSearchPhase,
  imitateData, setImitateData,
  // 🔥 主角设定（性别、姓名、年龄、身份背景）
  protagonistName, setProtagonistName,
  userBookTitle, setUserBookTitle,
  protagonistGender, setProtagonistGender,
  protagonistAge, setProtagonistAge,
  protagonistIdentity, setProtagonistIdentity,
  // 🔥 主角取名按钮
  nameLoading, onGenerateName,
  // 🔥 自动设计主角
  protagonistDesignLoading, onAutoDesignProtagonist,
  // 🔥 万能仿写·拆书导入
  bookAnalysisMode, setBookAnalysisMode,
  bookAnalysisJson, setBookAnalysisJson,
  bookAnalysisResult, setBookAnalysisResult,
  bookAnalysisLoading, setBookAnalysisLoading,
  onImportBookAnalysis,
  // 🔥 第二期·自动拆书
  autoBookName, setAutoBookName,
  autoBookLoading, onAutoBookAnalysis,
  onGenerate, onImitateSearch, isLoading,
}: StepInputProps) {
  // 🔥 修复：确保setDetailedDesignInput始终是function，防止undefined错误
  const _safeSetDetailedDesignInput = typeof setDetailedDesignInput === 'function' ? setDetailedDesignInput : function(v: string) { console.warn('[StepInput] setDetailedDesignInput is undefined, input ignored') }
  const _safeDetailedDesignInput = typeof detailedDesignInput === 'string' ? detailedDesignInput : ''

  // 🔥 类型断言辅助：imitateResult 的嵌套字段（ESLint --fix 将 any 改为 unknown 后需要断言）
  const _protagonistInfo = imitateResult?.protagonistInfo as { name?: string; description?: unknown; background?: unknown } | undefined
  const _femaleLeadInfo = imitateResult?.femaleLeadInfo as { name?: string; description?: unknown; background?: unknown } | undefined
  const _originalDetails = imitateResult?.originalDetails as { protagonist?: { name?: string; background?: unknown }; femaleLead?: { name?: string; background?: unknown } } | undefined

  // 语义去重：基于核心词提取和子串匹配
  const semanticDedup = function(arr: string[]): string[] {
    const result: string[] = []
    const usedCores: string[] = []
    // 核心语义词表：出现这些词的关键词视为语义重复
    const _semanticWords = /^(争霸|巫道|蛮荒|部族|修行|觉醒|进化|战斗|冒险|修炼|杀伐|崛起|纪元|高燃|热血|洪荒|巫族|妖族|人族|万族|异族|凶兽|疆域|无敌|传承|决战)$/
    arr.forEach(function(k) {
      // 提取核心词：去掉常见前缀修饰词
      let core = k.replace(/^(上古|太古|远古|热血|杀伐|高燃|宏大|极致|层层|大规模|重振|各大)/, '').trim()
      if (core.length < 2) core = k
      // 检查是否与已有关键词语义重复
      let isDup = false
      for (let i = 0; i < usedCores.length; i++) {
        const existing = usedCores[i]
        // 核心词完全相同
        if (core === existing) { isDup = true; break }
        // 一个是另一个的子串且长度差>=2
        if (core.length >= 2 && existing.length >= 2) {
          if (core.indexOf(existing) !== -1 || existing.indexOf(core) !== -1) { isDup = true; break }
        }
        // 共享2字以上语义子串
        if (core.length >= 2 && existing.length >= 2) {
          for (let j = 0; j <= core.length - 2; j++) {
            const sub = core.substring(j, j + 2)
            if (sub.length === 2 && existing.indexOf(sub) !== -1 && _semanticWords.test(sub)) {
              isDup = true; break
            }
          }
          if (isDup) break
        }
      }
      if (!isDup) {
        result.push(k)
        usedCores.push(core)
      }
    })
    return result
  }

  // 关键词去重函数：按空格/逗号/顿号分隔，去重后重新拼接
  const uniqueKeywords = function(text: string): string {
    if (!text.trim()) return ''
    const arr = text.split(/[\s,，、]+/).filter(Boolean)
    const seen = new Set<string>()
    const result: string[] = []
    arr.forEach(function(k) {
      if (!seen.has(k)) { seen.add(k); result.push(k) }
    })
    // 语义去重：基于核心词提取和子串匹配
    return semanticDedup(result).join(' ')
  }

  // 🔥 V3 新增：数据源浏览功能 state
  const [showBrowse, setShowBrowse] = useState(false)
  const [browseGenre, setBrowseGenre] = useState('全部')
  const [browsePage, setBrowsePage] = useState(1)
  const [browsePageSize] = useState(20)
  const [browseItems, setBrowseItems] = useState<Record<string, unknown>[]>([])
  const [browseTotal, setBrowseTotal] = useState(0)
  const [browseTotalPages, setBrowseTotalPages] = useState(1)
  const [browseGenres, setBrowseGenres] = useState<string[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseSearchKeyword, setBrowseSearchKeyword] = useState('')
  const [databaseStats, setDatabaseStats] = useState<{ total: number; genres: string[] } | null>(null)

  const autoResize = function(e: React.FormEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }

  useEffect(function() {
    const timer = setTimeout(function() {
      document.querySelectorAll('textarea').forEach(function(ta) {
        ta.style.height = 'auto'
        ta.style.height = ta.scrollHeight + 'px'
      })
    }, 50)
    return function() { clearTimeout(timer) }
  }, [keywords, bookAnalysisJson, imitateResult, imitateEditing])

  // 🔥 V3 新增：加载数据源统计信息（组件挂载时一次性加载）
  useEffect(function() {
    fetch('/tuzhong-wenshu/api/book-search?mode=stats')
      .then(function(res) { return res.json() })
      .then(function(json) {
        if (json.success) {
          setDatabaseStats({ total: json.total, genres: json.genres || [] })
          setBrowseGenres(['全部'].concat(json.genres || []))
        }
      })
      .catch(function(e) { console.warn('[StepInput] 加载数据源统计失败:', e) })
  }, [])

  // 🔥 V3 新增：加载数据源浏览数据（按类型/页码/关键词）
  const loadBrowseData = useCallback(function(genre: string, page: number, keyword: string) {
    setBrowseLoading(true)
    let url = '/tuzhong-wenshu/api/book-search?mode=' + (keyword.trim() ? 'search' : 'browse') + '&pageSize=' + browsePageSize + '&page=' + page
    if (keyword.trim()) {
      url += '&keyword=' + encodeURIComponent(keyword.trim())
    } else {
      url += '&genre=' + encodeURIComponent(genre)
    }
    fetch(url)
      .then(function(res) { return res.json() })
      .then(function(json) {
        if (json.success) {
          setBrowseItems(json.items || [])
          setBrowseTotal(json.total || 0)
          setBrowseTotalPages(json.totalPages || 1)
          if (json.genres && json.genres.length > 0) {
            setBrowseGenres(['全部'].concat(json.genres))
          }
        } else {
          setBrowseItems([])
          setBrowseTotal(0)
          setBrowseTotalPages(1)
        }
      })
      .catch(function(e) {
        console.warn('[StepInput] 加载浏览数据失败:', e)
        setBrowseItems([])
        setBrowseTotal(0)
        setBrowseTotalPages(1)
      })
      .finally(function() { setBrowseLoading(false) })
  }, [browsePageSize])

  // 🔥 V3 新增：展开浏览面板时首次加载数据
  useEffect(function() {
    if (showBrowse && browseItems.length === 0 && !browseLoading) {
      queueMicrotask(function() { loadBrowseData(browseGenre, browsePage, browseSearchKeyword) })
    }
  }, [showBrowse]) // eslint-disable-line react-hooks/exhaustive-deps

  // 🔥 V3 新增：选择书籍后自动填充搜索框并触发搜索
  const handleSelectNovel = function(novel: Record<string, unknown>) {
    setImitateSearch(String(novel.title || ''))
    setShowBrowse(false)
    // 自动触发搜索
    setTimeout(function() {
      onImitateSearch()
    }, 50)
  }

  // 🔥 V3 新增：切换类型筛选
  const handleGenreChange = function(genre: string) {
    setBrowseGenre(genre)
    setBrowsePage(1)
    setBrowseSearchKeyword('')
    loadBrowseData(genre, 1, '')
  }

  // 🔥 V3 新增：关键词搜索
  const handleBrowseSearch = function() {
    setBrowsePage(1)
    loadBrowseData('全部', 1, browseSearchKeyword)
  }

  // 🔥 V3 新增：翻页
  const handlePageChange = function(newPage: number) {
    if (newPage < 1 || newPage > browseTotalPages) return
    setBrowsePage(newPage)
    loadBrowseData(browseGenre, newPage, browseSearchKeyword)
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-gradient-to-r wenshu-title-band shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r wenshu-stripe"></div>
        <div className="p-6 text-center">
          <h3 className="text-xl font-bold text-stone-900 mb-1.5">输入你的创作主题</h3>
          <p className="text-stone-500 text-base">AI将根据你的关键词，全自动生成一部完整的小说</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* 🔥 三种创作方式选择器 */}
        <div className="border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r wenshu-title-band">
            <h3 className="text-base font-semibold text-stone-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-stone-700" />
              选择创作方式
            </h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 仿写模式 */}
              <button
                type="button"
                onClick={() => {
                  setCreationMode('imitate')
                  setImitateMode(true)
                }}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  creationMode === 'imitate'
                    ? 'border-stone-400 bg-stone-50 shadow-md'
                    : 'border-stone-200 bg-white hover:border-stone-400 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <BookCopy className={`w-5 h-5 ${creationMode === 'imitate' ? 'text-stone-800' : 'text-stone-400'}`} />
                  <span className={`font-semibold text-base font-serif-wenshu ${creationMode === 'imitate' ? 'text-stone-800' : 'text-stone-600'}`}>
                    仿写模式
                  </span>
                  {creationMode === 'imitate' && <span className="ml-auto text-stone-800">✓</span>}
                </div>
                <p className="text-sm text-stone-500 leading-relaxed">
                  学习原作品的<span className="font-medium text-stone-700">剧情结构、节奏把控、爽点设计、文笔风格、人物配比</span>，但所有角色名/地名/势力名100%原创。
                </p>
              </button>

              {/* 同人文 */}
              <button
                type="button"
                onClick={() => {
                  setCreationMode('fanfiction')
                  setImitateMode(true)
                }}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  creationMode === 'fanfiction'
                    ? 'border-stone-500 bg-stone-50 shadow-md'
                    : 'border-stone-200 bg-white hover:border-stone-400 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Bot className={`w-5 h-5 ${creationMode === 'fanfiction' ? 'text-red-700' : 'text-stone-400'}`} />
                  <span className={`font-semibold text-base ${creationMode === 'fanfiction' ? 'text-red-700' : 'text-stone-700'}`}>
                    同人文
                  </span>
                  {creationMode === 'fanfiction' && <span className="ml-auto text-red-700">✓</span>}
                </div>
                <p className="text-sm text-stone-500 leading-relaxed">
                  整体故事、剧情按原作品故事线，主角穿越成其中一个角色，拥有<span className="font-medium text-stone-700">穿越者知识/前知优势</span>，以主角为核心走原作品故事线。
                </p>
              </button>

              {/* 自己设计 */}
              <button
                type="button"
                onClick={() => {
                  setCreationMode('custom')
                  setImitateMode(false)
                }}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  creationMode === 'custom'
                    ? 'border-stone-500 bg-stone-50 shadow-md'
                    : 'border-stone-200 bg-white hover:border-stone-400 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FileJson className={`w-5 h-5 ${creationMode === 'custom' ? 'text-amber-700' : 'text-stone-400'}`} />
                  <span className={`font-semibold text-base font-serif-wenshu ${creationMode === 'custom' ? 'text-amber-800' : 'text-stone-600'}`}>
                    自己设计
                  </span>
                  {creationMode === 'custom' && <span className="ml-auto text-amber-700">✓</span>}
                </div>
                <p className="text-sm text-stone-500 leading-relaxed">
                  输入已设计好的<span className="font-medium text-stone-700">小说大纲、章节安排、人物设定</span>等详细内容，系统将直接读取并同步到后续所有环节，在此基础上补全其它内容。
                </p>
              </button>
            </div>

            {/* 普通模式按钮（不选择以上三种时为普通模式） */}
            {creationMode !== 'normal' && (
              <button
                type="button"
                onClick={() => {
                  setCreationMode('normal')
                  setImitateMode(false)
                }}
                className="mt-3 text-sm text-stone-500 hover:text-stone-700 underline"
              >
                ← 返回普通模式（仅通过关键词生成）
              </button>
            )}
          </div>
        </div>

        {/* 仿写/同人文 搜索区域 */}
        {(creationMode === 'imitate' || creationMode === 'fanfiction') && (
        <div className="border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r wenshu-title-band">
            <h3 className="text-base font-semibold text-stone-900 flex items-center gap-2">
              <BookCopy className="w-5 h-5 text-stone-700" />
              {creationMode === 'fanfiction' ? '同人文 · 搜索原作品' : '仿写模式 · 搜索原作品'}
            </h3>
          </div>

          <div className="p-5">
              <p className="text-base text-stone-600 mb-4">
                {creationMode === 'fanfiction'
                  ? '搜索一部原作品，系统将按其故事线生成同人文。主角将穿越成故事中的角色，拥有穿越者知识/前知优势，以主角为核心走原作品故事线。'
                  : '搜索一本小说，系统将自动拆解其结构（书名、简介、世界观、力量体系、角色等），然后按照该结构仿写一本全新的小说。所有角色名/地名/势力名100%原创。'}
              </p>

              {/* 搜索输入框 */}
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={imitateSearch}
                  onChange={(e) => setImitateSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onImitateSearch()}
                  placeholder="输入小说名称，如：绍宋、诡秘之主、斗破苍穹..."
                  disabled={imitateLoading}
                  className={`flex-1 px-4 py-3 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent transition-all text-base ${
                    imitateLoading ? 'cursor-not-allowed opacity-60' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={onImitateSearch}
                  disabled={imitateLoading || !imitateSearch.trim()}
                  className="px-6 py-3 bg-stone-800 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-base font-medium"
                >
                  {imitateLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      搜索中...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      搜索拆书
                    </>
                  )}
                </button>
              </div>

              {/* 🔥 V3 新增：浏览数据源按钮 + 统计信息 */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowBrowse(!showBrowse)}
                  className={`px-4 py-2 rounded-lg text-base font-medium flex items-center gap-2 transition-colors border ${
                    showBrowse
                      ? 'bg-stone-100 text-amber-800 border-stone-300'
                      : 'bg-white text-amber-700 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <Library className="w-4 h-4" />
                  {showBrowse ? '收起数据源' : '浏览数据源'}
                </button>
                {databaseStats && (
                  <span className="text-base text-stone-500">
                    📚 数据源共收录 <span className="font-semibold text-amber-700">{databaseStats.total}</span> 本全网爆款网文
                    {browseGenres.length > 1 ? `，${browseGenres.length - 1} 个类型` : ''}
                  </span>
                )}
              </div>

              {/* 🔥 V3 新增：数据源浏览面板（类型筛选 + 关键词搜索 + 书籍列表 + 分页） */}
              {showBrowse && (
                <div className="mb-4 border border-stone-200 rounded-xl bg-gradient-to-br from-stone-50/50 to-stone-50/50 overflow-hidden">
                  {/* 面板头部 */}
                  <div className="px-4 py-3 bg-white/60 border-b border-stone-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-base font-semibold text-amber-800">
                      <Filter className="w-4 h-4" />
                      数据源浏览（选择一本小说进行拆书仿写）
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBrowse(false)}
                      className="text-stone-400 hover:text-stone-600 text-base"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 关键词搜索框 */}
                  <div className="px-4 py-3 bg-white/40 border-b border-stone-100">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={browseSearchKeyword}
                        onChange={(e) => setBrowseSearchKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleBrowseSearch()}
                        placeholder="搜索书名/作者/类型，如：修仙、辰东、都市..."
                        className="flex-1 px-3 py-2 text-base bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={handleBrowseSearch}
                        disabled={browseLoading}
                        className="px-4 py-2 text-base bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        {browseLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                        搜索
                      </button>
                      {browseSearchKeyword && (
                        <button
                          type="button"
                          onClick={() => { setBrowseSearchKeyword(''); handleGenreChange('全部') }}
                          className="px-3 py-2 text-base bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200"
                        >
                          清除
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 类型筛选标签 */}
                  {!browseSearchKeyword && (
                    <div className="px-4 py-3 bg-white/30 border-b border-stone-100">
                      <div className="flex flex-wrap gap-2">
                        {browseGenres.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => handleGenreChange(g)}
                            className={`px-3 py-1 rounded-full text-base font-medium transition-colors ${
                              browseGenre === g
                                ? 'bg-stone-800 text-white'
                                : 'bg-white text-amber-700 border border-stone-200 hover:bg-stone-50'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 书籍列表 */}
                  <div className="max-h-96 overflow-y-auto">
                    {browseLoading ? (
                      <div className="px-4 py-12 text-center text-stone-500">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        加载中...
                      </div>
                    ) : browseItems.length === 0 ? (
                      <div className="px-4 py-12 text-center text-stone-500 text-base">
                        未找到匹配的小说
                      </div>
                    ) : (
                      <div className="divide-y divide-stone-100">
                        {browseItems.map((novel) => (
                          <button
                            key={String(novel.id)}
                            type="button"
                            onClick={() => handleSelectNovel(novel)}
                            className="w-full px-4 py-3 text-left hover:bg-stone-50 transition-colors flex items-start gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-stone-900 text-base truncate">
                                  {String(novel.title || '未命名')}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-base bg-stone-100 text-amber-800 shrink-0">
                                  {String(novel.primaryGenre || '未知')}
                                </span>
                                {novel.status ? (
                                  <span className={`px-1.5 py-0.5 rounded text-base shrink-0 ${
                                    String(novel.status) === '已完结' ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-700'
                                  }`}>
                                    {String(novel.status)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-base text-stone-500 flex items-center gap-3 flex-wrap">
                                <span>作者：{String(novel.author || '未知')}</span>
                                {Number(novel.chapterCount) > 0 && <span>章节：{Number(novel.chapterCount)}</span>}
                                {novel.wordCount ? <span>字数：{String(novel.wordCount)}</span> : null}
                              </div>
                            </div>
                            <div className="text-amber-700 text-base shrink-0 mt-1 font-medium">
                              选择 →
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 分页控件 */}
                  {!browseSearchKeyword && browseTotalPages > 1 && (
                    <div className="px-4 py-3 bg-white/60 border-t border-stone-100 flex items-center justify-between">
                      <span className="text-base text-stone-500">
                        共 {browseTotal} 本，第 {browsePage}/{browseTotalPages} 页
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePageChange(browsePage - 1)}
                          disabled={browsePage <= 1 || browseLoading}
                          className="px-2 py-1 text-base bg-white border border-stone-200 rounded text-amber-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <ChevronLeft className="w-3 h-3" /> 上一页
                        </button>
                        <span className="text-base text-stone-600 px-2">{browsePage} / {browseTotalPages}</span>
                        <button
                          type="button"
                          onClick={() => handlePageChange(browsePage + 1)}
                          disabled={browsePage >= browseTotalPages || browseLoading}
                          className="px-2 py-1 text-base bg-white border border-stone-200 rounded text-amber-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          下一页 <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 拆书结果 - 数据源驱动版 V3（统一为简洁展示区，所有数据来自数据源文件，100% 准确） */}
              {imitateResult && (
                <div className="space-y-4">
                  {/* 数据来源徽章：根据 source/confidence 显示准确提示 */}
                  {imitateResult.source ? (
                    <div className={`rounded-lg p-3 border ${
                      Number(imitateResult.confidence || 0) >= 100 ? 'bg-green-50 border-green-200' :
                      Number(imitateResult.confidence || 0) >= 75 ? 'bg-stone-50 border-stone-200' :
                      'bg-orange-50 border-orange-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {Number(imitateResult.confidence || 0) >= 100 ? '✅' : '❌'}
                        </span>
                        <span className="text-base font-medium text-stone-700">{String(imitateResult.source)}</span>
                        <span className="text-base text-stone-500 ml-auto">
                          {Number(imitateResult.confidence || 0) >= 100
                            ? '数据准确完整（来自数据源文件）'
                            : '未找到·请从下方数据源浏览列表中选择'}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {/* 基础信息卡片 - 可编辑 */}
                  <div className="bg-white rounded-lg p-4 border border-stone-200">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-stone-800 text-base">📖 {String(imitateResult.title)}</h4>
                      <span className="text-base text-stone-400">点击文字可编辑</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-base">
                      {[
                        { key: 'author', label: '作者' },
                        { key: 'genre', label: '类型' },
                        { key: 'status', label: '状态' },
                        { key: 'chapterCount', label: '章节数' },
                        { key: 'wordCount', label: '字数' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <span className="text-stone-500">{label}：</span>
                          {imitateEditing === key ? (
                            <input
                              type="text"
                              autoFocus
                              value={typeof imitateResult[key] === 'object' ? JSON.stringify(imitateResult[key]) : String(imitateResult[key] || '')}
                              onChange={(e) => setImitateResult({ ...imitateResult, [key]: e.target.value })}
                              onBlur={() => setImitateEditing(null)}
                              onKeyDown={(e) => e.key === 'Enter' && setImitateEditing(null)}
                              className="inline-block px-1 py-0.5 border border-stone-300 rounded text-base font-medium w-auto"
                            />
                          ) : (
                            <span
                              onClick={() => setImitateEditing(key)}
                              className={`font-medium cursor-pointer hover:bg-stone-50 px-1 py-0.5 rounded transition-colors ${
                                key === 'status' && imitateResult.status === '已完结' ? 'text-green-600' :
                                key === 'status' && imitateResult.status === '连载中' ? 'text-stone-700' :
                                imitateResult[key] === '搜索未找到' ? 'text-orange-500 italic' : ''
                              }`}
                              title="点击编辑"
                            >
                              {typeof imitateResult[key] === 'object' ? extractText(imitateResult[key]) : (String(imitateResult[key] ?? '暂无数据'))}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 核心拆解 - 统一展示区（替代原"拆解详情"） */}
                  <div className="bg-white rounded-lg p-4 border border-stone-200 space-y-3 text-base">
                    <h5 className="font-semibold mb-2 text-base">📋 核心拆解</h5>

                    {/* 主角设定 */}
                    {(_protagonistInfo?.name || _originalDetails?.protagonist?.name) && (
                      <div className="bg-stone-50 rounded-lg p-3">
                        <span className="text-stone-800 font-medium text-base">🦸 主角设定</span>
                        <p className="mt-1 text-stone-700 text-base">
                          <strong>{_protagonistInfo?.name || _originalDetails?.protagonist?.name}</strong>
                        </p>
                        <p className="mt-1 text-stone-600 text-base">
                          {extractText(_protagonistInfo?.description || _protagonistInfo?.background || _originalDetails?.protagonist?.background || '')}
                        </p>
                      </div>
                    )}

                    {/* 女主设定 */}
                    {(_femaleLeadInfo?.name || _originalDetails?.femaleLead?.name) && (
                      <div className="bg-stone-50 rounded-lg p-3">
                        <span className="text-red-700 font-medium text-base">💖 女主设定</span>
                        <p className="mt-1 text-stone-700 text-base">
                          <strong>{_femaleLeadInfo?.name || _originalDetails?.femaleLead?.name}</strong>
                        </p>
                        <p className="mt-1 text-stone-600 text-base">
                          {extractText(_femaleLeadInfo?.description || _femaleLeadInfo?.background || _originalDetails?.femaleLead?.background || '')}
                        </p>
                      </div>
                    )}

                    {/* 简介 - 可编辑 */}
                    <div>
                      <span className="text-stone-500 font-medium">简介：</span>
                      {imitateEditing === 'synopsis' ? (
                        <textarea
                          autoFocus
                          value={String(imitateResult.synopsis || '')}
                          onChange={(e) => setImitateResult({ ...imitateResult, synopsis: e.target.value })}
                          onBlur={() => setImitateEditing(null)}
                          onInput={(e) => {
                            const t = e.target as HTMLTextAreaElement
                            t.style.height = 'auto'
                            t.style.height = t.scrollHeight + 'px'
                          }}
                          className="w-full mt-1 p-2 border border-stone-300 rounded text-base"
                          rows={3}
                        />
                      ) : (
                        <p
                          className="mt-1 text-stone-700 cursor-pointer hover:bg-stone-50 p-1 rounded text-base leading-relaxed"
                          onClick={() => setImitateEditing('synopsis')}
                          title="点击编辑"
                        >
                          {extractText(imitateResult.synopsis || '') || '(暂无简介)'}
                        </p>
                      )}
                    </div>

                    {/* 世界观 - 可编辑 */}
                    <div>
                      <span className="text-stone-500 font-medium">世界观：</span>
                      {imitateEditing === 'worldBuilding' ? (
                        <textarea
                          autoFocus
                          value={extractText(imitateResult.worldBuilding || '')}
                          onChange={(e) => setImitateResult({ ...imitateResult, worldBuilding: e.target.value })}
                          onBlur={() => setImitateEditing(null)}
                          onInput={(e) => {
                            const t = e.target as HTMLTextAreaElement
                            t.style.height = 'auto'
                            t.style.height = t.scrollHeight + 'px'
                          }}
                          className="w-full mt-1 p-2 border border-stone-300 rounded text-base"
                          rows={3}
                        />
                      ) : (
                        <p
                          className="mt-1 text-stone-700 cursor-pointer hover:bg-stone-50 p-1 rounded text-base leading-relaxed whitespace-pre-line"
                          onClick={() => setImitateEditing('worldBuilding')}
                          title="点击编辑"
                        >
                          {extractText(imitateResult.worldBuilding || '') || '(暂无世界观信息)'}
                        </p>
                      )}
                    </div>

                    {/* 力量体系 - 可编辑 */}
                    <div>
                      <span className="text-stone-500 font-medium">力量体系：</span>
                      {imitateEditing === 'powerSystem' ? (
                        <textarea
                          autoFocus
                          value={extractText(imitateResult.powerSystem || '')}
                          onChange={(e) => setImitateResult({ ...imitateResult, powerSystem: e.target.value })}
                          onBlur={() => setImitateEditing(null)}
                          onInput={(e) => {
                            const t = e.target as HTMLTextAreaElement
                            t.style.height = 'auto'
                            t.style.height = t.scrollHeight + 'px'
                          }}
                          className="w-full mt-1 p-2 border border-stone-300 rounded text-base"
                          rows={3}
                        />
                      ) : (
                        <p
                          className="mt-1 text-stone-700 cursor-pointer hover:bg-stone-50 p-1 rounded text-base leading-relaxed whitespace-pre-line"
                          onClick={() => setImitateEditing('powerSystem')}
                          title="点击编辑"
                        >
                          {extractText(imitateResult.powerSystem || '') || '(暂无力量体系信息)'}
                        </p>
                      )}
                    </div>

                    {/* 核心卖点 - 可编辑 */}
                    <div>
                      <span className="text-stone-500 font-medium">核心卖点：</span>
                      {imitateEditing === 'sellingPoints' ? (
                        <textarea
                          autoFocus
                          value={(Array.isArray(imitateResult.sellingPoints) ? imitateResult.sellingPoints : []).join('\n')}
                          onChange={(e) => {
                            const arr = e.target.value.split(/[\n，、；;,]+/).map(s => s.trim()).filter(Boolean)
                            setImitateResult({ ...imitateResult, sellingPoints: arr })
                          }}
                          onBlur={() => setImitateEditing(null)}
                          className="w-full mt-1 p-2 border border-stone-300 rounded text-base"
                          rows={3}
                          placeholder="每行一个卖点"
                        />
                      ) : (
                        <div
                          className="mt-1 flex flex-wrap gap-2 cursor-pointer hover:bg-stone-50 p-1 rounded"
                          onClick={() => setImitateEditing('sellingPoints')}
                          title="点击编辑"
                        >
                          {(Array.isArray(imitateResult.sellingPoints) && imitateResult.sellingPoints.length > 0) ? (
                            imitateResult.sellingPoints.slice(0, 12).map((sp: unknown, i: number) => (
                              <span key={i} className="px-2 py-1 bg-green-50 text-green-700 rounded text-base">{String(sp).slice(0, 24)}</span>
                            ))
                          ) : (
                            <span className="text-stone-400 text-base">（暂无卖点信息）</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 写作风格 - 可编辑 */}
                    {imitateResult.writingStyle ? (
                      <div>
                        <span className="text-stone-500 font-medium">写作风格：</span>
                        {imitateEditing === 'writingStyle' ? (
                          <textarea
                            autoFocus
                            value={extractText(imitateResult.writingStyle)}
                            onChange={(e) => setImitateResult({ ...imitateResult, writingStyle: e.target.value })}
                            onBlur={() => setImitateEditing(null)}
                            className="w-full mt-1 p-2 border border-stone-300 rounded text-base"
                            rows={2}
                          />
                        ) : (
                          <p
                            className="mt-1 text-stone-700 cursor-pointer hover:bg-stone-50 p-1 rounded text-base"
                            onClick={() => setImitateEditing('writingStyle')}
                            title="点击编辑"
                          >
                            {extractText(imitateResult.writingStyle)}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        // ===== 1. 作品类型：合并模式（不删除已选类型） =====
                        if (imitateResult.genre) {
                          // 拆分仿写小说的类型（可能是单个或多个，用逗号、顿号分隔）
                          const imitateGenres = String(imitateResult.genre)
                            .split(/[,，、\s]+/)
                            .map(function(s: string) { return s.trim() })
                            .filter(Boolean)
                          // 类型映射（与"万能仿写·拆书导入"按钮保持一致）
                          const genreMap: Record<string, string> = {
                            '西幻': '奇幻', '玄幻': '玄幻', '都市': '都市', '历史': '历史',
                            '科幻': '科幻', '仙侠': '仙侠', '武侠': '武侠', '悬疑': '悬疑',
                            '言情': '言情', '末世': '末世', '游戏': '游戏', '轻小说': '轻小说',
                            '二次元': '二次元', '东方玄幻': '玄幻', '异世大陆': '奇幻',
                            '修真文明': '仙侠', '高武世界': '玄幻', '远古神话': '玄幻',
                          }
                          const mappedGenres = imitateGenres.map(function(g: string) {
                            return genreMap[g] || g
                          }).filter(function(g: string) {
                            // 只保留在 genres 数组中存在的类型
                            return genres.indexOf(g) !== -1
                          })
                          if (mappedGenres.length > 0) {
                            const currentGenres = genre.split(',').map(function(s: string) { return s.trim() }).filter(Boolean)
                            mappedGenres.forEach(function(g: string) {
                              if (currentGenres.indexOf(g) === -1) {
                                currentGenres.push(g)
                              }
                            })
                            setGenre(currentGenres.join(','))
                          }
                        }

                        // ===== 2. 关键词/主题：用仿写小说的 sellingPoints + tags + powerSystem 关键词 =====
                        const kwCandidates: string[] = []
                        // 从 sellingPoints 提取
                        if (Array.isArray(imitateResult.sellingPoints) && imitateResult.sellingPoints.length > 0) {
                          imitateResult.sellingPoints.forEach(function(sp: unknown) {
                            const s = String(sp).trim()
                            if (s) kwCandidates.push(s)
                          })
                        }
                        // 从 keywords 或 tags 提取
                        const srcArr = (imitateResult.keywords && Array.isArray(imitateResult.keywords)) ? imitateResult.keywords
                          : (imitateResult.tags && Array.isArray(imitateResult.tags)) ? imitateResult.tags
                          : []
                        srcArr.forEach(function(k: unknown) {
                          const s = String(k).trim()
                          if (s) kwCandidates.push(s)
                        })
                        // 从 worldBuilding 提取关键设定词
                        if (imitateResult.worldBuilding && typeof imitateResult.worldBuilding === 'string') {
                          const wbText = String(imitateResult.worldBuilding)
                          // 提取关键设定词（如：九天十地、北斗星域、仙域等）
                          const settingMatches = wbText.match(/[\u4e00-\u9fa5]{2,6}/g) || []
                          settingMatches.slice(0, 5).forEach(function(s: string) {
                            if (s && s.length >= 2 && s.length <= 6) kwCandidates.push(s)
                          })
                        }
                        // 过滤角色名、作者名、书名
                        const _filterNames: string[] = []
                        if (imitateResult.title) _filterNames.push(String(imitateResult.title))
                        if (imitateResult.author) _filterNames.push(String(imitateResult.author))
                        if (_protagonistInfo?.name) _filterNames.push(String(_protagonistInfo.name))
                        if (_femaleLeadInfo?.name) _filterNames.push(String(_femaleLeadInfo.name))
                        const _filterSet = new Set<string>()
                        _filterNames.forEach(function(n) {
                          if (n && n.trim()) {
                            _filterSet.add(n.trim())
                            if (n.indexOf('·') >= 0) {
                              n.split('·').forEach(function(p) { if (p.trim() && p.trim().length >= 2) _filterSet.add(p.trim()) })
                            }
                          }
                        })
                        const filteredKw = kwCandidates.filter(function(kw: string) {
                          if (!kw || !kw.trim()) return false
                          const k = kw.trim()
                          for (const fn of _filterSet) {
                            if (k === fn || k.indexOf(fn) >= 0 || fn.indexOf(k) >= 0) return false
                          }
                          if (k.length < 2) return false
                          if (/^\d+$/.test(k)) return false
                          if (k.length > 15) return false
                          return true
                        })
                        // 去重（完全匹配 + 语义去重）
                        const seen = new Set<string>()
                        let uniqueKw: string[] = []
                        filteredKw.forEach(function(k: string) {
                          if (!seen.has(k)) { seen.add(k); uniqueKw.push(k) }
                        })
                        // 语义去重：基于核心词提取和子串匹配
                        uniqueKw = semanticDedup(uniqueKw)
                        // 关键词：用仿写小说的关键词完全替换（避免保留无关的旧关键词）
                        if (uniqueKw.length > 0) {
                          setKeywords(uniqueKw.slice(0, 30).join(' '))
                        } else {
                          // 如果仿写小说没有可提取的关键词，清空旧关键词（避免与仿写小说无关）
                          setKeywords('')
                        }

                        setImitateData(imitateResult)
                        try {
                          localStorage.setItem('tuzhong-imitate-data', JSON.stringify(imitateResult))
                          console.log('[仿写] 保存仿写数据:', imitateResult.title)
                        } catch (e) {}
                      }}
                      className="flex-1 px-4 py-3 bg-stone-800 text-white rounded-xl hover:bg-stone-800 font-medium text-base"
                    >
                      ✅ 使用此结构开始仿写
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImitateResult(null)
                        setImitateSearch('')
                        setImitateSearchPhase('idle')
                      }}
                      className="flex-1 px-4 py-3 border border-stone-200 rounded-xl hover:bg-stone-50 font-medium text-base"
                    >
                      重新搜索
                    </button>
                  </div>
                </div>
              )}

              {/* 热门小说推荐 */}
              {!imitateResult && (
                <div className="mt-4">
                  <p className="text-base text-stone-500 mb-2">热门推荐：</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      // 经典热门
                      '庆余年', '诡秘之主', '斗破苍穹', '遮天', '凡人修仙传',
                      '全职高手', '赘婿', '雪中悍刀行', '大奉打更人', '斗罗大陆',
                      // 番茄热门
                      '我在精神病院学斩神', '十日终焉', '从红月开始', '九星霸体诀',
                      '剑道第一仙', '签到十年我举世无敌', '神级龙卫',
                      // 耳根系列
                      '仙逆', '求魔', '我欲封天',
                      // 我吃西红柿
                      '盘龙', '星辰变', '吞噬星空', '莽荒纪',
                      // 天蚕土豆
                      '武动乾坤', '大主宰',
                      // 宅猪
                      '牧神记', '人道至尊',
                      // 老鹰吃小鸡
                      '全球高武', '万族之劫',
                      // 其他
                      '蛊真人', '大王饶命', '巫颂', '完美世界',
                    ].map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setImitateSearch(name)
                          setImitateMode(true)
                        }}
                        className="px-3 py-1.5 bg-white border border-stone-200 rounded-full text-base text-stone-600 hover:bg-stone-50 hover:text-stone-800 hover:border-stone-300 transition-colors"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

        {/* 🔥 万能仿写·手动导入拆书结果 */}
        <div className="border border-green-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-green-50 to-emerald-50">
            <h3 className="text-base font-semibold text-stone-900 flex items-center gap-2">
              <FileJson className="w-5 h-5 text-green-600" />
              万能仿写·手动导入拆书结果
            </h3>
            <button
              type="button"
              onClick={() => setBookAnalysisMode(!bookAnalysisMode)}
              className={`px-3 py-1.5 rounded-lg text-base font-medium transition-colors ${
                bookAnalysisMode
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200'
              }`}
            >
              {bookAnalysisMode ? '✓ 已开启拆书导入' : '开启拆书导入'}
            </button>
          </div>

          {bookAnalysisMode && (
            <div className="p-5">
              <p className="text-base text-stone-600 mb-4">
                使用AI工具（豆包/ChatGPT/Claude等）拆解目标小说，将拆书结果粘贴到下方，系统将自动映射生成全新原创设定。
              </p>

              {/* 拆书提示词复制区 */}
              <div className="bg-stone-50 rounded-lg p-4 mb-4 border border-stone-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-blue-900 text-base">第一步：复制拆书提示词到外部AI</h4>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch('/tuzhong-wenshu/api/ai-generate', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            step: 'bookAnalysis',
                            input: '',
                            keywords: [],
                            genre: '玄幻',
                            novelId: 'temp',
                            llmConfig: { provider: 'none', apiKey: 'none', baseUrl: '', model: '' },
                            bookAnalysisJson: '{}',
                          }),
                        })
                        // If API fails (expected since no real LLM), just use the prompt from code
                      } catch (e) {}
                      // Fallback: copy a generic prompt
                      const prompt = `请深度拆解小说【在此填写书名】的创作骨架。\n要求：只提取结构、逻辑、节奏、方法论，不保留原文句子、人名、地名。\n输出标准化JSON格式。\n\n详细提示词模板已内置在系统中，你可直接使用豆包/ChatGPT等工具输入：\n"请拆解小说《XXX》的创作骨架，输出包含世界观、力量体系、人设原型、势力格局、主线剧情、关键节点、分卷节奏、文风特征、爽点模式等9个维度的标准化JSON。"`
                      await navigator.clipboard.writeText(prompt)
                      alert('通用拆书提示词已复制到剪贴板！\n\n在豆包/ChatGPT中粘贴，将【书名】替换为目标小说即可。')
                    }}
                    className="text-base px-3 py-1.5 bg-stone-400 text-white rounded hover:bg-stone-700 flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" />
                    复制通用拆书提示词
                  </button>
                </div>
                <p className="text-base text-stone-700">
                  提示词已内置在系统中，点击上方按钮可复制通用版本。在外部AI中拆书后，将返回的JSON粘贴到下方即可。
                </p>
              </div>

              {/* 🔥 第二期·自动拆书：输入书名一键拆解 */}
              <div className="bg-stone-50 rounded-lg p-4 mb-4 border border-stone-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-stone-900 text-base flex items-center gap-1.5">
                    <Bot className="w-4 h-4" />
                    自动拆书（输入书名，AI自动拆解）
                  </h4>
                  <span className="text-base px-2 py-0.5 bg-stone-200 text-stone-800 rounded-full font-medium">NEW</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={autoBookName}
                    onChange={(e) => setAutoBookName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && autoBookName.trim() && !autoBookLoading) onAutoBookAnalysis() }}
                    placeholder="输入小说名称，如：盘龙、斗破苍穹、诡秘之主..."
                    disabled={autoBookLoading}
                    className="flex-1 px-4 py-2.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-500 focus:border-transparent text-base disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={onAutoBookAnalysis}
                    disabled={autoBookLoading || !autoBookName.trim()}
                    className="px-5 py-2.5 bg-stone-800 text-white rounded-xl hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium text-base whitespace-nowrap"
                  >
                    {autoBookLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        拆解中...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        自动拆书
                      </>
                    )}
                  </button>
                </div>
                <p className="text-base text-stone-700 mt-2">
                  支持《盘龙》《斗破苍穹》《吞噬星空》《诡秘之主》《凡人修仙传》《巫颂》等热门小说。输入书名后AI自动搜索+拆解，结果自动填入下方JSON区。
                </p>
              </div>

              {/* JSON粘贴区 */}
              <div className="mb-4">
                <h4 className="font-medium text-stone-700 text-base mb-2">{autoBookName ? '第三步' : '第二步'}：粘贴拆书结果JSON</h4>
                <textarea
                  value={bookAnalysisJson}
                  onChange={(e) => setBookAnalysisJson(e.target.value)}
                  onInput={autoResize}
                  placeholder={`将AI拆书返回的JSON粘贴到这里...\n\n示例格式：\n{\n  "bookName": "盘龙",\n  "bookGenre": "西幻",\n  "totalChapters": 806,\n  "worldviewFramework": { ... },\n  "powerSystemModel": { ... },\n  ...\n}`}
                  rows={8}
                  disabled={bookAnalysisLoading}
                  className={`w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-base min-h-[120px] ${
                    bookAnalysisLoading ? 'cursor-not-allowed opacity-60' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={onImportBookAnalysis}
                  disabled={bookAnalysisLoading || !bookAnalysisJson.trim()}
                  className="mt-3 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium text-base"
                >
                  {bookAnalysisLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      解析中...
                    </>
                  ) : (
                    <>
                      <FileJson className="w-4 h-4" />
                      导入拆书结果
                    </>
                  )}
                </button>
              </div>

              {/* 导入结果展示 */}
              {bookAnalysisResult && (
                <div className="space-y-3">
                  <div className="rounded-lg p-3 bg-green-50 border border-green-200">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">✅</span>
                      <span className="text-base font-medium text-green-700">
                        拆书结果导入成功！
                      </span>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-green-200">
                    <h4 className="font-semibold text-green-700 mb-2 text-base">📖 拆书结果概览</h4>
                    <div className="grid grid-cols-2 gap-3 text-base">
                      <div>
                        <span className="text-stone-500">书名：</span>
                        <span className="font-medium">{String(bookAnalysisResult.bookName || '-')}</span>
                      </div>
                      <div>
                        <span className="text-stone-500">类型：</span>
                        <span className="font-medium">{String(bookAnalysisResult.bookGenre || '-')}</span>
                      </div>
                      <div>
                        <span className="text-stone-500">总章节：</span>
                        <span className="font-medium">{String(bookAnalysisResult.totalChapters || '-')}</span>
                      </div>
                      <div>
                        <span className="text-stone-500">章节均字：</span>
                        <span className="font-medium">{String(bookAnalysisResult.avgChapterWords || '-')}</span>
                      </div>
                    </div>
                    {bookAnalysisResult.mapping ? (
                      <div className="mt-3 text-base text-stone-500">
                        已映射 {Object.keys(bookAnalysisResult.mapping as Record<string, unknown>).length} 个维度的结构化上下文，将在后续生成环节中自动注入。
                      </div>
                    ) : null}
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        // 将拆书类型映射到系统预置类型
                        const genreMap: Record<string, string> = {
                          '西幻': '奇幻', '玄幻': '玄幻', '都市': '都市', '历史': '历史',
                          '科幻': '科幻', '仙侠': '仙侠', '武侠': '武侠', '悬疑': '悬疑',
                          '言情': '言情', '末世': '末世', '游戏': '游戏', '轻小说': '轻小说',
                          '二次元': '二次元',
                        }
                        const mappedGenre = genreMap[String(bookAnalysisResult.bookGenre)] || '玄幻'
                        if (mappedGenre && !genre.includes(mappedGenre)) {
                          const current = genre.split(',').map((s: string) => s.trim()).filter(Boolean)
                          if (!current.includes(mappedGenre)) {
                            setGenre([...current, mappedGenre].join(','))
                          }
                        }
                      }}
                      className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium text-base"
                    >
                      ✅ 使用此拆书结构开始仿写
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBookAnalysisResult(null)
                        setBookAnalysisJson('')
                        setBookAnalysisMode(false)
                      }}
                      className="flex-1 px-4 py-3 border border-stone-200 rounded-xl hover:bg-stone-50 font-medium text-base"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
        )}

        <div>
          <label className="block text-base font-medium text-stone-700 mb-2">作品类型（可多选）</label>
          <div className="flex flex-wrap gap-2">
            {genres.map((g) => {
              const selected = genre.split(',').map(function(s: string) { return s.trim() }).indexOf(g) !== -1
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    const current = genre.split(',').map(function(s: string) { return s.trim() }).filter(Boolean)
                    if (selected) {
                      setGenre(current.filter(function(s: string) { return s !== g }).join(','))
                    } else {
                      setGenre([...current, g].join(','))
                    }
                  }}
                  className={'px-3 py-1.5 text-base rounded-full border transition-colors ' +
                    (selected
                      ? 'bg-stone-400 text-white border-stone-400'
                      : 'bg-white text-stone-600 border-stone-300 hover:border-stone-400')}
                >
                  {g}
                </button>
              )
            })}
          </div>
          {genre ? (
            <p className="text-base text-stone-500 mt-2">已选：{genre}</p>
          ) : (
            <p className="text-base text-stone-400 mt-2">点击标签选择类型（可多选）</p>
          )}
        </div>

        <div>
          <label className="block text-base font-medium text-stone-700 mb-2">书名（可选）</label>
          <input
            type="text"
            name="userBookTitle"
            value={userBookTitle || ''}
            onChange={(e) => setUserBookTitle && setUserBookTitle(e.target.value)}
            placeholder="留空则由AI自动生成最匹配的书名；填写则严格使用你的书名"
            className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-500 focus:border-transparent text-base"
          />
        </div>

        <div>
          <label className="block text-base font-medium text-stone-700 mb-2">关键词 / 主题</label>
          <textarea
            name="keywords"
            value={keywords}
            onChange={(e) => setKeywords(uniqueKeywords(e.target.value))}
            onInput={autoResize}
            placeholder="例如：退婚流 废材逆袭 三年之约"
            rows={3}
            className="w-full px-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-stone-500 focus:border-transparent text-base"
          />
          <p className="text-base text-stone-500 mt-2">提示：输入越详细，AI生成的内容越精准。建议输入 3-8 个关键词，例如：&quot;修仙 宗门 逆天改命 热血爽文&quot;</p>
        </div>

        {/* 🔥 主角设定：性别、姓名、年龄、身份背景（基于AI小说全类型人物角色名字自动生成设计规则） */}
        <div className="border border-stone-200 rounded-xl overflow-hidden bg-gradient-to-br from-stone-50/40 to-stone-50/40">
          <div className="px-5 py-3 bg-white/60 border-b border-stone-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-700" />
            <h4 className="text-base font-semibold text-stone-900">主角设定（可选）</h4>
            <span className="text-sm text-stone-500 ml-1">留空则由AI根据题材与关键词自动生成</span>
            <button
              type="button"
              onClick={onAutoDesignProtagonist}
              disabled={protagonistDesignLoading || !genre.trim() || !keywords.trim()}
              className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm transition-all"
            >
              {protagonistDesignLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{protagonistDesignLoading ? '设计中...' : 'AI自动设计主角'}</span>
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">主角姓名</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={protagonistName}
                    onChange={(e) => setProtagonistName(e.target.value)}
                    placeholder="留空则AI按题材自动命名"
                    maxLength={20}
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent text-base"
                  />
                  <button
                    type="button"
                    onClick={onGenerateName}
                    disabled={nameLoading}
                    title="根据主题和主角设定AI取名"
                    className="flex items-center gap-1 px-3 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
                  >
                    {nameLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    <span>取名</span>
                  </button>
                  <button
                    type="button"
                    onClick={onGenerateName}
                    disabled={nameLoading}
                    title="刷新生成新的名字"
                    className="flex items-center gap-1 px-3 py-2 bg-stone-600 text-white rounded-lg hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
                  >
                    {nameLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    <span>刷新</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">主角性别</label>
                <select
                  value={protagonistGender}
                  onChange={(e) => setProtagonistGender(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent text-base"
                >
                  <option value="">不指定（AI按题材判定）</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">主角年龄</label>
                <input
                  type="text"
                  value={protagonistAge}
                  onChange={(e) => setProtagonistAge(e.target.value)}
                  placeholder="如：18、十六岁（可选）"
                  maxLength={10}
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">主角身份背景</label>
                <input
                  type="text"
                  value={protagonistIdentity}
                  onChange={(e) => setProtagonistIdentity(e.target.value)}
                  placeholder="如：废柴少爷、退役兵王、现代学霸（可选）"
                  maxLength={40}
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent text-base"
                />
              </div>
            </div>
            <div className="text-sm text-stone-600 bg-stone-50/60 rounded-lg px-3 py-2 leading-relaxed">
              <span className="font-semibold text-amber-800">命名规则：</span>
              AI 将依据
              <span className="font-medium text-amber-800"> 全类型人物角色名字自动生成设计规则 </span>
              自动判定命名风格——东方玄幻/仙侠/洪荒用中式原创姓名，西幻/魔法斗气用西式姓名（名·姓结构），历史类用符合朝代特征的姓名，都市类用现代中式姓名；严禁使用网络小说高频默认姓氏（林、叶、萧、苏、秦、白、楚、云、沈、顾）及原著专有名词。若你在此指定姓名，AI 将严格沿用，不再自行创造。
            </div>
          </div>
        </div>

        {/* 🔥 详细设定输入区：所有创作模式均可填写（custom 高亮必填；imitate/fanfiction/normal 为可选，用于喂10卷大纲锁定分卷） */}
        {(true) && (
        <div className={`rounded-xl overflow-hidden ${
          creationMode === 'custom'
            ? 'border-2 border-stone-500 shadow-lg'
            : 'border-2 border-amber-300'
        }`}>
          <div className={`px-4 py-2 border-b ${
            creationMode === 'custom'
              ? 'bg-stone-50 border-stone-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <label className={`block text-base font-medium ${
              creationMode === 'custom' ? 'text-amber-800' : 'text-amber-800'
            }`}>
              {creationMode === 'custom' ? '📝 自己设计 · 详细设定输入区' : '详细设定输入区（可选：填写10卷大纲可锁定分卷，AI不再自行重规划）'}
            </label>
            <p className={`text-base mt-0.5 ${
              creationMode === 'custom' ? 'text-amber-700' : 'text-amber-700'
            }`}>在此输入已设计好的小说大纲、章节安排、人物设定等详细内容，系统将直接读取并同步到后续所有环节</p>
          </div>
          <textarea
            value={_safeDetailedDesignInput}
            onChange={(e) => _safeSetDetailedDesignInput(e.target.value)}
            onInput={autoResize}
            placeholder={`【小说大纲】\n第一卷：XXXXX\n第二卷：XXXXX\n\n【人物设定】\n主角：XXX，身份：XXX，性格：XXX\n女主：XXX，身份：XXX，性格：XXX\n\n【力量体系】\n修炼等级：XXX→XXX→XXX\n\n【世界观】\n时代背景：XXX\n地理设定：XXX\n\n【章节安排】\n第1章：XXX\n第2章：XXX\n...`}
            rows={creationMode === 'custom' ? 12 : 8}
            className="w-full px-4 py-3 bg-white text-stone-800 border-none focus:outline-none focus:ring-0 resize-none text-base leading-relaxed"
          />
          <div className={`px-4 py-2 border-t ${
            creationMode === 'custom'
              ? 'bg-stone-50 border-stone-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <p className={`text-base ${
              creationMode === 'custom' ? 'text-amber-700' : 'text-amber-700'
            }`}>💡 提示：输入的内容越详细，AI生成的小说越符合你的预期。系统会根据已有内容自动补全缺失部分。</p>
          </div>
        </div>
        )}

      </div>
    </div>
  )
}
