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
}: StepGeneratingProps) {
  const [activeVolume, setActiveVolume] = useState<number>(0)
  const [activeChapter, setActiveChapter] = useState<number>(0)
  const [editingContent, setEditingContent] = useState<string>('')
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)

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
    if (!chapter) {
      // 如果找不到，找第一个已生成的章节
      const firstCompleted = generatedChapters[0]
      if (firstCompleted) {
        return firstCompleted
      }
      return null
    }
    return chapter
  }

  const activeChapterData = getActiveChapter()

  // 处理编辑保存
  const handleSave = () => {
    setIsEditing(false)
    // 这里可以处理保存逻辑
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
                          <div className="flex items-center gap-2">
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
                          </div>
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
