'use client'

import { useState, useEffect, useRef } from 'react'
import { Book, Loader2, ChevronRight, ChevronDown, Edit3, Save, RefreshCw, Pause, Play, X, AlertTriangle } from 'lucide-react'

interface Chapter {
  id: string
  volume?: number
  chapterNumber?: number
  title: string
  content?: string
  summary?: string
  wordCount: number
  status: string
}

interface GenStats {
  startTime: number
  totalWords: number
  completedChapters: number
  failedChapters: number
  totalChapters: number
  elapsedMs: number
  etaMs: number
  throughput: number
  chapterTimings: Array<{ chapter: number; durationMs: number; words: number }>
}

interface StepGeneratingProps {
  currentChapterIndex: number
  progress: number
  generatedChaptersCount: number
  generatedChapters: Chapter[]
  totalChapters: number
  volumes?: Array<{
    name: string
    chapters: Chapter[]
  }>
  // 🔥 第三期·调度中心
  genStatus?: 'idle' | 'running' | 'paused' | 'done' | 'cancelled'
  genStats?: GenStats
  genConcurrency?: number
  genFailedList?: Array<{ index: number; chapter: Chapter; error: string }>
  onPause?: () => void
  onResume?: () => void
  onCancel?: () => void
  onRetryFailed?: () => void
  // 🔥 #226M：正文生成环节「继续生成」入口（覆盖断点续创作/刷新后无入口的缺口）
  onStartGen?: () => void
  // 🔥 逐章生成正文·右上角控制面板（字数 / 风格 / 新角色）：由向导共享 state 下传，回写经 onGenConfigChange
  genTargetWordCount?: number
  genStyle?: string
  genNewCharacters?: string
  onGenConfigChange?: (patch: { targetWordCount?: number; style?: string; newCharacters?: string }) => void
  // 🔥 2026-11-05 批量生成上限：一次生成 N 章（1-20），0=全部
  genBatchLimit?: number
  onGenBatchLimitChange?: (v: number) => void
  // 🔥 Bug修复：编辑章节正文后回写给父级（chapterId + 新内容），避免编辑静默丢失
  onChapterContentChange?: (chapterId: string, content: string) => void
}

export default function StepGenerating({
  currentChapterIndex,
  progress,
  generatedChaptersCount,
  generatedChapters,
  totalChapters,
  volumes,
  // 🔥 第三期·调度中心
  genStatus,
  genStats,
  genConcurrency,
  genFailedList,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
  onStartGen,
  // 🔥 2026-10-25 T2：默认 2000（区间 1800-2200）
  genTargetWordCount = 2000,
  genBatchLimit = 0,
  onGenBatchLimitChange,
  genStyle = '正剧',
  genNewCharacters = '',
  onGenConfigChange,
  onChapterContentChange,
}: StepGeneratingProps) {
  const [activeVolume, setActiveVolume] = useState<number>(0)
  const [activeChapter, setActiveChapter] = useState<number>(0)
  const [editingContent, setEditingContent] = useState<string>('')
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  // 🔥 章节行内「AI 操作」：同一时间只允许一个章节处理中，失败仅做行内提示、不清空原文
  const [aiBusyChapterId, setAiBusyChapterId] = useState<string>('')
  const [aiError, setAiError] = useState<{ chapterId: string; message: string } | null>(null)
  const aiErrorTimerRef = useRef<number | null>(null)
  // 标记「修改」按钮意图，避免切章 effect 把刚装入的编辑内容清掉
  const editIntentRef = useRef<string>('')

  // 🔥 清理章节标题：确保只保留一次"第X章"前缀
  const sanitizeTitle = function(raw: string, chNum: number): string {
    if (!raw) return `第${chNum}章`
    let title = raw.trim()
    title = title.replace(/第\d+章\s*/g, '')
    title = title.replace(/第[一二三四五六七八九十百千\d]+章\s*/g, '')
    title = title.replace(/^\d+\s*/, '')
    if (!title.trim()) title = '关键剧情'
    return `第${chNum}章 ${title.trim()}`
  }

  // 使用volumes构建完整的章节列表（如果有volumes数据的话）
  // 将 generatedChapters 中的内容合并到 volumes 的章节中
  const allVolumes = volumes && volumes.length > 0
    ? volumes.map((vol) => ({
        ...vol,
        chapters: (vol.chapters || []).map((ch: Chapter) => {
          // 在 generatedChapters 中查找对应的已生成章节内容（多策略匹配）
          const generated = generatedChapters.find(
            (gc: Chapter) => {
              if (!gc) return false
              if (gc.id && ch.id && gc.id === ch.id) return true
              if (gc.chapterNumber && ch.chapterNumber && gc.chapterNumber === ch.chapterNumber) return true
              if (gc.title && ch.title && gc.title === ch.title) return true
              return false
            }
          )
          if (generated && generated.content) {
            return { ...ch, content: generated.content, wordCount: generated.wordCount, status: generated.status }
          }
          return ch
        })
      }))
    : [{
        name: '第一卷',
        chapters: generatedChapters
      }]

  // 计算当前正在生成的章节
  const _currentGeneratingIndex = currentChapterIndex

  // 每3章自动滚动到最新章节
  useEffect(() => {
    if (generatedChapters.length > 0 && generatedChapters.length % 3 === 0) {
      const lastChapter = generatedChapters[generatedChapters.length - 1]
      const lastVol = lastChapter && lastChapter.volume
      if (lastChapter && lastVol != null) {
        queueMicrotask(function() { setActiveVolume(lastVol - 1) })
        const volChapters = allVolumes[lastVol - 1]?.chapters || []
        const chapterIdx = volChapters.findIndex((c: Chapter) => c.chapterNumber === lastChapter.chapterNumber)
        if (chapterIdx >= 0) {
          queueMicrotask(function() { setActiveChapter(chapterIdx) })
        }
      }
    }
  }, [generatedChapters.length, allVolumes])

  // 获取当前活跃章节
  const getActiveChapter = () => {
    const vol = allVolumes[activeVolume]
    if (!vol) return null
    const chapter = vol.chapters[activeChapter]
    if (chapter && chapter.content) {
      return chapter
    }
    // 🔥 修复「正文面板空白」：当前活跃章节（规划章）尚无正文时，
    //   回退到 generatedChapters 中对应章节（按 chapterNumber/id/title 匹配），
    //   否则生成中的首章永远只显示"请等待章节生成..."
    const _cn = chapter && chapter.chapterNumber
    const _id = chapter && chapter.id
    const _tt = chapter && chapter.title
    const _matched = generatedChapters.find(function (gc: any) {
      if (!gc || !gc.content) return false
      if (_cn && gc.chapterNumber && gc.chapterNumber === _cn) return true
      if (_id && gc.id && gc.id === _id) return true
      if (_tt && gc.title && gc.title === _tt) return true
      return false
    })
    if (_matched) return _matched
    // 再退一步：任意一章已生成正文就用第一章，让面板有内容可看
    if (!chapter) {
      const firstCompleted = generatedChapters.find(function (gc: any) { return gc && gc.content })
      if (firstCompleted) return firstCompleted
    }
    if (!chapter) return null
    return chapter
  }

  const activeChapterData = getActiveChapter()

  // 🔥 Bug修复：切章节时清掉上一章的编辑残留（否则新章编辑区显示旧章文本）
  // 🔥 兼容「行内修改」：若切章意图就是进入该章编辑，则把该章正文装入 editingContent
  useEffect(() => {
    const curKey = String((activeChapterData && activeChapterData.id) || '__no_id__')
    if (isEditing && editIntentRef.current === curKey && activeChapterData && activeChapterData.content) {
      setEditingContent(String(activeChapterData.content))
    } else {
      setEditingContent('')
    }
    editIntentRef.current = ''
  }, [activeChapterData && activeChapterData.id])

  // 处理编辑保存
  const handleSave = () => {
    // 🔥 Bug修复：此前只 setIsEditing(false)，编辑内容被静默丢弃；
    // 现在把编辑结果回写给父级（写回 generatedChapters/generatedData，随后续保存流程持久化）
    if (activeChapterData && editingContent && editingContent !== activeChapterData.content) {
      try {
        onChapterContentChange && onChapterContentChange(String(activeChapterData.id || ''), editingContent)
      } catch (_e) { console.error('[StepGenerating] 回写章节内容失败:', _e) }
    }
    setIsEditing(false)
    setEditingContent('')
  }

  // ============================================================
  // 🔥 章节行内「修改 / AI 操作」
  // ============================================================

  // 行内错误提示：红字，4 秒后自动消失（下次操作时也会被清掉）
  const showAiError = function (chapterId: string, message: string) {
    setAiError({ chapterId: chapterId, message: message })
    if (aiErrorTimerRef.current) window.clearTimeout(aiErrorTimerRef.current)
    aiErrorTimerRef.current = window.setTimeout(function () {
      setAiError(function (prev) { return prev && prev.chapterId === chapterId ? null : prev })
    }, 4000)
  }

  useEffect(function () {
    return function () {
      if (aiErrorTimerRef.current) window.clearTimeout(aiErrorTimerRef.current)
    }
  }, [])

  // 章节写回用的 id：优先取 generatedChapters 里那一章的 id（父级按 id 回写），卷章节自身 id 兜底
  const resolveChapterId = function (chapter: Chapter | null): string {
    if (!chapter) return ''
    const byId = chapter.id
      ? generatedChapters.find(function (gc: any) { return gc && gc.id && String(gc.id) === String(chapter.id) })
      : null
    if (byId && byId.id) return String(byId.id)
    const matched = generatedChapters.find(function (gc: any) {
      if (!gc) return false
      if (chapter.chapterNumber && gc.chapterNumber && gc.chapterNumber === chapter.chapterNumber) return true
      if (chapter.title && gc.title && gc.title === chapter.title) return true
      return false
    })
    if (matched && matched.id) return String(matched.id)
    return chapter.id ? String(chapter.id) : ''
  }

  // 当前生效的 AI 模型配置（与向导一致：优先用户上次选择，其次默认模型）
  const readLlmConfig = function (): any {
    try {
      const raw = localStorage.getItem('tuzhong-llm-config')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.apiKey) return parsed
      }
      const modelsRaw = localStorage.getItem('tuzhong-ai-models')
      if (modelsRaw) {
        const models = JSON.parse(modelsRaw)
        if (Array.isArray(models) && models.length > 0) {
          const picked = models.find(function (m: any) { return m && m.status === 'default' }) ||
            models.find(function (m: any) { return m && m.status === 'active' }) || models[0]
          if (picked && picked.apiKey) {
            return {
              provider: String(picked.provider || '').replace(/\s*\([^)]*\)\s*/g, '').trim(),
              apiKey: picked.apiKey,
              baseUrl: String(picked.baseUrl || '').replace(/[`'"]/g, '').trim(),
              model: picked.model,
            }
          }
        }
      }
    } catch (_e) {}
    return null
  }

  // 行内「修改」：选中该章并进入编辑态（复用 isEditing / editingContent / handleSave）
  const handleEnterEdit = function (volIndex: number, chIndex: number, chapter: Chapter) {
    if (!chapter || !chapter.content) return
    setActiveVolume(volIndex)
    setActiveChapter(chIndex)
    editIntentRef.current = String(chapter.id || '__no_id__')
    setEditingContent(String(chapter.content))
    setIsEditing(true)
    if (typeof window !== 'undefined') {
      window.setTimeout(function () {
        if (editorRef.current) {
          editorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
          editorRef.current.focus()
        }
      }, 60)
    }
  }

  // AI 结果统一写回：本地编辑态 + 父级状态（不改动原有内容更新路径）
  const applyChapterContent = function (chapter: Chapter, newContent: string) {
    const chapterId = resolveChapterId(chapter)
    if (chapterId && onChapterContentChange) {
      try {
        onChapterContentChange(chapterId, newContent)
      } catch (_e) { console.error('[StepGenerating] AI 结果回写失败:', _e) }
    }
    const activeId = resolveChapterId(activeChapterData || null)
    if (chapterId && activeId && chapterId === activeId && isEditing) {
      setEditingContent(newContent)
    }
  }

  // 行内「AI 操作」：润色 / 重写 / 续写（按摘要重生暂无后端入口，禁用）
  const handleAiAction = async function (chapter: Chapter, chapterKey: string, action: string) {
    if (!chapter || !chapter.content || !String(chapter.content).trim()) return
    if (aiBusyChapterId) return
    const originalText = String(chapter.content)
    const llmConfig = readLlmConfig()
    if (!llmConfig) {
      showAiError(chapterKey, '未配置 AI 模型，请先到个人设置中配置')
      return
    }

    setAiBusyChapterId(chapterKey)
    setAiError(null)
    try {
      let newContent = ''

      if (action === 'polish' || action === 'rewrite') {
        // 契约：POST /api/ai/rewrite { text, style, intensity: light|medium|deep, llmConfig }
        // 返回：{ data: { rewrittenText } }
        const res = await fetch('/tuzhong-wenshu/api/ai/rewrite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: originalText,
            style: 'fanqie',
            intensity: action === 'rewrite' ? 'deep' : 'medium',
            llmConfig: llmConfig,
          }),
        })
        const json = await res.json().catch(function () { return null })
        if (!res.ok) throw new Error((json && json.error) || 'AI 润色失败，请稍后重试')
        newContent = String((json && json.data && json.data.rewrittenText) || '')
      } else if (action === 'continue') {
        // 契约：POST /api/ai/continue { context, style, length: short|medium|long, llmConfig }
        // 返回：{ data: { options: string[] } }
        const res = await fetch('/tuzhong-wenshu/api/ai/continue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: originalText,
            style: 'default',
            length: 'long',
            llmConfig: llmConfig,
          }),
        })
        const json = await res.json().catch(function () { return null })
        if (!res.ok) throw new Error((json && json.error) || 'AI 续写失败，请稍后重试')
        const options = json && json.data && json.data.options
        const picked = Array.isArray(options)
          ? options.find(function (o: any) { return typeof o === 'string' && o.trim() && o.indexOf('[该选项生成失败') !== 0 })
          : ''
        if (!picked) throw new Error('AI 返回内容为空，已保留原文')
        newContent = originalText.replace(/\s+$/, '') + '\n\n' + String(picked).trim()
      } else {
        throw new Error('暂不支持该操作')
      }

      if (!newContent.trim()) throw new Error('AI 返回内容为空，已保留原文')

      applyChapterContent(chapter, newContent)
      setAiError(null)
    } catch (err: any) {
      // 失败保留原文，只在行内提示
      showAiError(chapterKey, (err && err.message) || 'AI 操作失败，已保留原文')
    } finally {
      setAiBusyChapterId('')
    }
  }

  // 格式化字数
  const formatWordCount = (count: number) => {
    if (count >= 10000) {
      return `${(count / 10000).toFixed(1)}万`
    }
    return `${count.toLocaleString()}`
  }

  // 分组显示章节（每3章为一组）
  const getChaptersByGroup = (chapters: Chapter[], groupSize: number = 3) => {
    const groups: Chapter[][] = []
    for (let i = 0; i < chapters.length; i += groupSize) {
      groups.push(chapters.slice(i, i + groupSize))
    }
    return groups
  }

  const formatTime = (ms: number): string => {
    if (ms <= 0) return '--'
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return seconds + '秒'
    if (seconds < 3600) return Math.floor(seconds / 60) + '分' + (seconds % 60) + '秒'
    return Math.floor(seconds / 3600) + '时' + Math.floor((seconds % 3600) / 60) + '分'
  }

  return (
    <div className="h-[800px] bg-stone-50 flex">
      {/* 左侧边栏 - 章节列表 */}
      <div className="w-72 bg-white border-r border-stone-200 flex flex-col">
        {/* 顶部标题 */}
        <div className="p-4 border-b border-stone-200">
          <h3 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
            <Book className="w-5 h-5 text-stone-700" />
            作品目录
          </h3>
          <p className="text-sm text-stone-500 mt-1">
            共 {totalChapters} 章，已生成 {generatedChaptersCount} 章
          </p>
        </div>

        {/* 章节进度条 */}
        {progress < 100 && (
          <div className="p-3 border-b border-stone-100">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-stone-600">{genStatus === 'paused' ? '已暂停' : '正在生成...'}</span>
              <span className="text-stone-700 font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-stone-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${genStatus === 'paused' ? 'bg-yellow-400' : 'wenshu-btn-primary'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* 卷列表 */}
        <div className="flex-1 overflow-y-auto">
          {allVolumes.map((volume, volIndex) => {
            const isActiveVol = activeVolume === volIndex
            // 🔥 Bug修复：status字段对齐 - 同时统计 completed(正文已完成) 和 planned(已规划未写正文)
            const completedCount = volume.chapters.filter((c: Chapter) => c.status === 'completed').length
            const plannedCount = volume.chapters.filter((c: Chapter) => c.status === 'planned').length
            
            return (
              <div key={volIndex} className="border-b border-stone-100">
                <div
                  className="flex items-center gap-2 p-3 cursor-pointer hover:bg-stone-50"
                  onClick={() => setActiveVolume(isActiveVol ? -1 : volIndex)}
                >
                  <span className="text-stone-500">
                    {isActiveVol ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                  <span className={`font-medium ${isActiveVol ? 'text-stone-700' : 'text-stone-700'}`}>
                    {volume.name || `第${volIndex + 1}卷`}
                  </span>
                  <span className="text-xs text-stone-400 ml-auto">
                    {/* 🔥 Bug修复：显示正文进度+规划进度，避免0/60看起来像卡住 */}
                    {completedCount > 0
                      ? <span className="text-green-600">{completedCount}/{volume.chapters.length}</span>
                      : plannedCount > 0
                        ? <span className="text-stone-400">{plannedCount}/{volume.chapters.length} 规划</span>
                        : <span>0/{volume.chapters.length}</span>
                    }
                  </span>
                </div>

                {/* 章节列表 */}
                {isActiveVol && (
                  <div className="bg-stone-50 py-1">
                    {volume.chapters.map((chapter: Chapter, chIndex: number) => {
                      const isActive = activeVolume === volIndex && activeChapter === chIndex
                      const isGenerating = chapter.status === 'generating'
                      const isCompleted = chapter.status === 'completed'
                      const isPlanned = chapter.status === 'planned'
                      // 🔥 行内「修改 / AI 操作」：未生成只禁用，生成中禁用 AI，全局同一时间只允许一个 AI 任务
                      const chapterKey = String(chapter.id || `${volIndex}-${chIndex}`)
                      const hasContent = !!(chapter.content && String(chapter.content).trim())
                      const isAiBusy = aiBusyChapterId === chapterKey
                      const aiDisabled = !hasContent || isGenerating || !!aiBusyChapterId
                      const aiDisabledTitle = isGenerating
                        ? '本章正在生成中，请稍候'
                        : !hasContent
                        ? '本章尚未生成，等待生成完成后可用'
                        : aiBusyChapterId
                        ? '正在处理其他章节'
                        : ''

                      return (
                        <div
                          key={`${volIndex}-${chIndex}`}
                          className={`px-4 py-2 text-sm cursor-pointer border-l-4 transition-colors ${
                            isActive
                              ? 'bg-stone-50 border-l-stone-400 text-stone-700'
                              : isCompleted
                              ? 'border-l-transparent hover:bg-stone-100 text-stone-700'
                              : isPlanned
                              ? 'border-l-stone-300 hover:bg-stone-100 text-stone-500'
                              : 'border-l-transparent hover:bg-stone-100 text-stone-400'
                          }`}
                          onClick={() => {
                            if (isCompleted || isGenerating || isPlanned) {
                              setActiveVolume(volIndex)
                              setActiveChapter(chIndex)
                            }
                          }}
                        >
                          <div className="flex items-center gap-1.5">
                            {isGenerating && (
                              <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
                            )}
                            {isCompleted && !isGenerating && (
                              <span className="text-green-500">✓</span>
                            )}
                            {isPlanned && !isGenerating && (
                              <span className="text-stone-400 text-xs">○</span>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">
                                {sanitizeTitle(chapter.title, chapter.chapterNumber || (chIndex + 1))}
                              </div>
                              {chapter.wordCount > 0 && (
                                <div className="text-xs text-stone-400">
                                  {formatWordCount(chapter.wordCount)} 字
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0" onClick={function (e) { e.stopPropagation() }}>
                              <button
                                type="button"
                                disabled={!hasContent || isAiBusy}
                                title={isAiBusy ? 'AI 正在处理本章' : hasContent ? '修改本章正文' : '本章尚未生成正文'}
                                onClick={function () { handleEnterEdit(volIndex, chIndex, chapter) }}
                                className={`px-1.5 py-0.5 text-[10px] border rounded ${
                                  hasContent && !isAiBusy
                                    ? 'border-stone-300 text-stone-600 hover:bg-stone-100'
                                    : 'border-stone-200 text-stone-300 cursor-not-allowed'
                                }`}
                              >
                                修改
                              </button>
                              {isAiBusy ? (
                                <span className="px-1 py-0.5 text-[10px] text-stone-400">处理中…</span>
                              ) : (
                                <select
                                  value=""
                                  disabled={aiDisabled}
                                  title={aiDisabledTitle}
                                  onChange={function (e) {
                                    const act = e.target.value
                                    if (act) handleAiAction(chapter, chapterKey, act)
                                  }}
                                  className={`px-1 py-0.5 text-[10px] border rounded bg-white max-w-[86px] ${
                                    aiDisabled
                                      ? 'border-stone-200 text-stone-300 cursor-not-allowed'
                                      : 'border-stone-300 text-stone-600 cursor-pointer'
                                  }`}
                                >
                                  <option value="" disabled>AI 操作</option>
                                  <option value="polish">润色本章</option>
                                  <option value="rewrite">重写本章</option>
                                  <option value="continue">续写本章</option>
                                  <option value="regen" disabled title="等待生成完成后可用">按摘要重生本章</option>
                                </select>
                              )}
                            </div>
                          </div>
                          {aiError && aiError.chapterId === chapterKey && (
                            <div className="mt-1 pl-4 text-[11px] text-red-500 leading-snug">{aiError.message}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 中间区域 - 编辑区域 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部工具栏 */}
        <div className="bg-white border-b border-stone-200 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeChapterData && (
              <>
                <span className="text-sm font-medium text-stone-700">
                  {sanitizeTitle(activeChapterData.title, activeChapterData.chapterNumber || 1)}
                </span>
                <span className="text-xs text-stone-400">
                  · {formatWordCount(activeChapterData.wordCount || 0)}
                </span>
              </>
            )}
            {!activeChapterData && (
              <span className="text-sm text-stone-500">请选择章节</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeChapterData && activeChapterData.content && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded-md"
              >
                {isEditing ? <Save className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                {isEditing ? '保存' : '编辑'}
              </button>
            )}
          </div>
        </div>

        {/* 编辑内容区域 */}
        <div className="flex-1 overflow-y-auto bg-white p-8">
          {activeChapterData && activeChapterData.content ? (
            <div className="max-w-4xl mx-auto">
              {/* 章节标题 */}
              <h1 className="text-3xl font-bold text-stone-900 mb-8 text-center">
                {sanitizeTitle(activeChapterData.title, activeChapterData.chapterNumber || 1)}
              </h1>

              {/* 正文内容 */}
              {isEditing ? (
                <textarea
                  ref={editorRef}
                  value={editingContent || activeChapterData.content}
                  onChange={(e) => setEditingContent(e.target.value)}
                  onBlur={handleSave}
                  className="w-full min-h-[500px] p-4 text-lg leading-relaxed text-stone-700 border border-stone-300 rounded-lg resize-vertical focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-stone-400"
                  placeholder="正在生成中..."
                />
              ) : (
                <div className="text-lg leading-relaxed text-stone-700 whitespace-pre-wrap">
                  {activeChapterData.content}
                </div>
              )}

              {/* 章节信息 */}
              <div className="mt-12 pt-8 border-t border-stone-200 text-center text-sm text-stone-500">
                <p>本章共 {formatWordCount(activeChapterData.wordCount || 0)} 字</p>
                {activeChapterData.status === 'generating' && (
                  <p className="text-stone-400 mt-2 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在生成中...
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-stone-500">
              <Book className="w-16 h-16 text-stone-300 mb-4" />
              <p className="text-lg">请等待章节生成...</p>
              <p className="text-sm mt-2">或从左侧选择已生成的章节</p>
            </div>
          )}
        </div>
      </div>

      {/* 🔥 第三期·调度中心右侧边栏 */}
      <div className="w-64 bg-white border-l border-stone-200 flex flex-col">
        {/* 🔥 逐章生成正文·右上角控制面板（字数 / 风格 / 新角色） */}
        <div className="p-4 border-b border-stone-200 bg-stone-50">
          <h4 className="font-medium text-stone-800 mb-3 text-sm flex items-center gap-1.5">
            <Edit3 className="w-4 h-4 text-stone-600" />
            本章生成设置
          </h4>

          {/* 字数控制：滑块 + 数值输入（1500-4000，默认 2000 / 区间 1800-2200 番茄标准章） */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-stone-600">目标字数</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1500}
                  max={4000}
                  step={50}
                  value={genTargetWordCount}
                  onChange={(e) => onGenConfigChange && onGenConfigChange({ targetWordCount: Number(e.target.value) })}
                  className="w-16 px-1.5 py-1 text-xs text-right border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-400"
                />
                <span className="text-xs text-stone-400">字</span>
              </div>
            </div>
            <input
              type="range"
              min={1500}
              max={4000}
              step={50}
              value={genTargetWordCount}
              onChange={(e) => onGenConfigChange && onGenConfigChange({ targetWordCount: Number(e.target.value) })}
              className="w-full accent-stone-700 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>1500</span>
              <span>4000</span>
            </div>
          </div>

          {/* 🔥 2026-11-05 批量生成上限：一次生成 N 章（1-20），0=全部。配合断点续生成=分批体验 */}
          <div className="mb-3">
            <label className="block text-xs text-stone-600 mb-1">本次生成章数 <span className="text-stone-400">（防长跑漂移）</span></label>
            <select
              value={genBatchLimit === undefined ? 0 : genBatchLimit}
              onChange={(e) => onGenBatchLimitChange && onGenBatchLimitChange(Number(e.target.value))}
              className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-400 bg-white"
            >
              <option value={0}>全部（一次生成完）</option>
              <option value={1}>1 章</option>
              <option value={3}>3 章</option>
              <option value={5}>5 章</option>
              <option value={10}>10 章</option>
              <option value={15}>15 章</option>
              <option value={20}>20 章</option>
            </select>
            <p className="text-[10px] text-stone-400 mt-0.5">每次点「继续生成」只跑前 N 个未完成章，跑完再点继续</p>
          </div>

          {/* 风格选择（50 种，网文风格全覆盖） */}
          <div className="mb-3">
            <label className="block text-xs text-stone-600 mb-1">生成风格 <span className="text-stone-400">（50）</span></label>
            <select
              value={genStyle}
              onChange={(e) => onGenConfigChange && onGenConfigChange({ style: e.target.value })}
              className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-stone-400 max-h-40"
            >
              <optgroup label="通用风格">
                <option value="正剧">正剧</option>
                <option value="权谋">权谋</option>
                <option value="沙场">沙场</option>
                <option value="市井">市井</option>
                <option value="抒情">抒情</option>
                <option value="搞笑">搞笑</option>
                <option value="热血">热血</option>
                <option value="暗黑">暗黑</option>
                <option value="治愈">治愈</option>
                <option value="悲壮">悲壮</option>
                <option value="冷峻">冷峻</option>
                <option value="轻快">轻快</option>
              </optgroup>
              <optgroup label="仙侠 · 修真">
                <option value="东方玄幻">东方玄幻</option>
                <option value="西方玄幻">西方玄幻</option>
                <option value="热血玄幻">热血玄幻</option>
                <option value="废柴流">废柴流</option>
                <option value="重生玄幻">重生玄幻</option>
                <option value="穿越玄幻">穿越玄幻</option>
                <option value="修真修仙">修真修仙</option>
                <option value="洪荒神话">洪荒神话</option>
                <option value="末日修真">末日修真</option>
                <option value="御兽养成">御兽养成</option>
                <option value="法宝神通">法宝神通</option>
              </optgroup>
              <optgroup label="都市 · 现实">
                <option value="都市异能">都市异能</option>
                <option value="都市兵王">都市兵王</option>
                <option value="都市医仙">都市医仙</option>
                <option value="总裁豪门">总裁豪门</option>
                <option value="赘婿上门">赘婿上门</option>
                <option value="神医下山">神医下山</option>
                <option value="都市悬疑">都市悬疑</option>
                <option value="都市现实">都市现实</option>
              </optgroup>
              <optgroup label="历史 · 架空">
                <option value="历史穿越">历史穿越</option>
                <option value="历史军事">历史军事</option>
                <option value="王朝争霸">王朝争霸</option>
                <option value="架空历史">架空历史</option>
                <option value="民国谍战">民国谍战</option>
                <option value="江湖武侠">江湖武侠</option>
              </optgroup>
              <optgroup label="科幻 · 末世">
                <option value="星际征战">星际征战</option>
                <option value="机甲战争">机甲战争</option>
                <option value="末世求生">末世求生</option>
                <option value="赛博朋克">赛博朋克</option>
                <option value="时间循环">时间循环</option>
                <option value="太空歌剧">太空歌剧</option>
              </optgroup>
              <optgroup label="悬疑 · 灵异">
                <option value="灵异探险">灵异探险</option>
                <option value="本格推理">本格推理</option>
                <option value="规则怪谈">规则怪谈</option>
                <option value="克苏鲁">克苏鲁</option>
                <option value="民间怪谈">民间怪谈</option>
              </optgroup>
              <optgroup label="游戏 · 竞技">
                <option value="网游小说">网游小说</option>
                <option value="职业竞技">职业竞技</option>
                <option value="游戏副本">游戏副本</option>
              </optgroup>
              <optgroup label="无限流 · 系统">
                <option value="无限副本">无限副本</option>
                <option value="系统流">系统流</option>
                <option value="主神空间">主神空间</option>
                <option value="签到流">签到流</option>
                <option value="吞噬进化">吞噬进化</option>
              </optgroup>
            </select>
          </div>

          {/* 新角色 */}
          <div>
            <label className="block text-xs text-stone-600 mb-1">登场新角色</label>
            <input
              type="text"
              value={genNewCharacters}
              placeholder="姓名 / 简述，可留空"
              onChange={(e) => onGenConfigChange && onGenConfigChange({ newCharacters: e.target.value })}
              className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>
          <p className="text-[10px] text-stone-400 mt-2 leading-snug">
            设置将应用于本次「开始生成正文」所生成章节的提示词。
          </p>
        </div>

        {/* 调度控制区 */}
        {genStatus && (genStatus === 'running' || genStatus === 'paused') && (
          <div className="p-4 border-b border-stone-200">
            <h4 className="font-medium text-stone-800 mb-3 text-sm">🎛️ 调度控制</h4>
            <div className="flex gap-2">
              {genStatus === 'running' && onPause && (
                <button onClick={onPause} className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-xs font-medium">
                  <Pause className="w-3.5 h-3.5" />暂停
                </button>
              )}
              {genStatus === 'paused' && onResume && (
                <button onClick={onResume} className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xs font-medium">
                  <Play className="w-3.5 h-3.5" />继续
                </button>
              )}
              {onCancel && (
                <button onClick={onCancel} className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-xs font-medium">
                  <X className="w-3.5 h-3.5" />取消
                </button>
              )}
            </div>
          </div>
        )}

        {/* 🔥 #226M：正文生成环节「继续生成」入口——覆盖断点续创作/页面刷新后无入口的缺口 */}
        {genStatus && genStatus !== 'running' && genStatus !== 'paused' && onStartGen && totalChapters - generatedChaptersCount > 0 && (
          <div className="p-4 border-b border-stone-200">
            <h4 className="font-medium text-stone-800 mb-3 text-sm">🎛️ 调度控制</h4>
            <button
              onClick={onStartGen}
              className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-stone-700 text-white rounded-lg hover:bg-stone-800 text-xs font-medium"
            >
              <Play className="w-3.5 h-3.5" />
              {generatedChaptersCount > 0 ? '继续生成' : '开始生成正文'}
            </button>
          </div>
        )}

        {/* 失败重试区 */}
        {genFailedList && genFailedList.length > 0 && genStatus !== 'running' && (
          <div className="p-4 border-b border-red-200 bg-red-50">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm font-medium text-red-700">{genFailedList.length} 章生成失败</span>
            </div>
            {onRetryFailed && (
              <button onClick={onRetryFailed} className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-xs font-medium">
                <RefreshCw className="w-3.5 h-3.5" />重试失败章节
              </button>
            )}
          </div>
        )}

        {/* 🔥 2026-09-30 性能优化·当前章实时状态（心跳驱动，解决"卡住不动"体感） */}
        {genStatus === 'running' && (genStats as any)?.currentChapter && (
          <div className="p-4 border-b border-emerald-200 bg-emerald-50">
            <div className="flex items-center gap-2 mb-1">
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
              <span className="text-sm font-medium text-emerald-800">
                正在生成第 {(genStats as any).currentChapter.index} 章
              </span>
            </div>
            <div className="text-xs text-emerald-700">
              已用 {(genStats as any).currentChapter.elapsedSec || 0} 秒
              {(genStats as any).currentChapter.retry > 0 ? (
                <span className="text-orange-600 ml-1">· 重试 {(genStats as any).currentChapter.retry}/3</span>
              ) : null}
            </div>
          </div>
        )}

        {/* 生成统计 */}
        <div className="p-4 border-b border-stone-200">
          <h4 className="font-medium text-stone-800 mb-3 text-sm">📊 生成统计</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-500">已完成</span>
              <span className="text-green-600 font-medium">
                {genStats?.completedChapters || generatedChaptersCount} 章
              </span>
            </div>
            {genStats?.failedChapters ? (
              <div className="flex justify-between">
                <span className="text-stone-500">失败</span>
                <span className="text-red-600 font-medium">{genStats.failedChapters} 章</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-stone-500">待生成</span>
              <span className="text-stone-600">{totalChapters - generatedChaptersCount} 章</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">总字数</span>
              <span className="text-stone-700 font-medium">
                {genStats?.totalWords ? formatWordCount(genStats.totalWords) : formatWordCount(generatedChapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0))}
              </span>
            </div>
          </div>
        </div>

        {/* 🔥 实时进度指标 */}
        {genStats && genStats.elapsedMs > 0 && (
          <div className="p-4 border-b border-stone-200">
            <h4 className="font-medium text-stone-800 mb-3 text-sm">⏱️ 实时指标</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">已用时</span>
                <span className="text-stone-700">{formatTime(genStats.elapsedMs)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">预计剩余</span>
                <span className="text-stone-800 font-medium">{formatTime(genStats.etaMs)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">吞吐量</span>
                <span className="text-green-600 font-medium">{genStats.throughput} 字/分</span>
              </div>
              {genConcurrency ? (
                <div className="flex justify-between">
                  <span className="text-stone-500">并发数</span>
                  <span className="text-stone-700">{genConcurrency}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* 最近生成 */}
        <div className="p-4 flex-1">
          <h4 className="font-medium text-stone-800 mb-3 text-sm">📝 最近生成</h4>
          <div className="space-y-1.5">
            {[...generatedChapters].reverse().slice(0, 8).map((chapter, idx) => (
              <div key={idx} className="text-xs">
                <div className="flex items-center justify-between">
                  <span className={`truncate max-w-[120px] ${chapter.status === 'completed' ? 'text-stone-700' : 'text-stone-400'}`}>
                    {sanitizeTitle(chapter.title, chapter.chapterNumber || (generatedChapters.length - idx))}
                  </span>
                  <span className="text-stone-400 ml-1">
                    {formatWordCount(chapter.wordCount || 0)}
                  </span>
                </div>
              </div>
            ))}
            {generatedChapters.length === 0 && (
              <p className="text-xs text-stone-400">等待生成...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
