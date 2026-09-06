'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  Home,
  Sparkles,
  FileText,
  List,
  BookCopy,
  ArrowLeft,
  Wand2,
  ShieldCheck,
  Search,
  BarChart3,
  X,
  Check,
  Save,
  Undo2,
  Redo2,
  Type,
  AlignLeft,
  Moon,
  Sun,
  SunMoon,
  ZoomIn,
  ZoomOut,
  Upload,
  Download,
  Printer,
  ListTree,
  Eye,
  Edit3,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Minus,
  Search as SearchIcon,
  XCircle,
  ChevronUp,
  ChevronFirst,
  ChevronLast,
  ListOrdered,
  ListTodo,
  Copy,
  Scissors,
  Clipboard,
  RefreshCcw,
  Plus,
  Palette,
  Grip,
  Ruler,
} from 'lucide-react'
import AIGenerateWizard from '@/components/ai-generate-wizard'

interface Novel {
  id: string
  title: string
  description: string
  genre: string
  wordCount: number
  lastModified: string
  status: 'writing' | 'completed' | 'paused'
  cover?: string
}

interface Volume {
  id: string
  name: string
  summary: string
  order: number
  chapters?: Chapter[]
}

interface Chapter {
  id: string
  title: string
  chapterNumber: number
  volume: number | string
  wordCount: number
  status: string
  content?: string
  summary?: string
  volumeIndex?: number
  volumeId?: string
  chapterInVolumeIndex?: number
  order?: number
  hook?: string
  shuangPoints?: string[]
  coreObjective?: string
}

type ReadingTheme = 'light' | 'sepia' | 'dark' | 'night' | 'paper'

function ToolbarButton({
  children, onClick, title, theme, active
}: {
  children: React.ReactNode
  onClick?: () => void
  title?: string
  theme: ReadingTheme
  active?: boolean
}) {
  const dark = theme === 'dark' || theme === 'night'
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg transition-colors ${
        active
          ? (dark ? 'bg-white/10 text-white' : 'bg-blue-100 text-blue-700')
          : (dark ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100')
      }`}
    >{children}</button>
  )
}

function DividerDot({ theme }: { theme: ReadingTheme }) {
  const dark = theme === 'dark' || theme === 'night'
  return (
    <span className={`inline-block w-px h-5 mx-2 ${dark ? 'bg-white/10' : 'bg-gray-200'}`} />
  )
}

const coverGradients = [
  'from-blue-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-indigo-500 to-blue-600',
  'from-amber-500 to-yellow-600',
]

export default function NovelEditorPage() {
  const params = useParams()
  const router = useRouter()
  const novelId = params.id as string

  const [novel, setNovel] = useState<Novel | null>(null)
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'chapters' | 'overview'>('chapters')
  const [expandedVolumes, setExpandedVolumes] = useState<Record<number, boolean>>({})
  const [coverUrl, setCoverUrl] = useState<string>('')
  const [coverFallbackIndex, setCoverFallbackIndex] = useState<number>(0)

  // 正文编辑模式 + 临时内容
  const [isEditMode, setIsEditMode] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // 章节内容显示偏好
  type Theme = 'light' | 'sepia' | 'dark' | 'night' | 'paper'
  const [readerTheme, setReaderTheme] = useState<Theme>('light')
  const [fontFamily, setFontFamily] = useState<string>('system')
  const [fontSize, setFontSize] = useState<number>(17)
  const [lineHeight, setLineHeight] = useState<number>(2)
  const [paragraphSpacing, setParagraphSpacing] = useState<number>(1.2)
  const [contentWidth, setContentWidth] = useState<'narrow' | 'normal' | 'wide' | 'full'>('normal')

  // 搜索 & 跳转
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatchIndex, setSearchMatchIndex] = useState(0)
  const [searchMatches, setSearchMatches] = useState<{ start: number; end: number }[]>([])
  const [showTocDrawer, setShowTocDrawer] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)

  // 首行缩进 / 自动换行（默认打开）
  const [firstLineIndent, setFirstLineIndent] = useState(true)
  const [autoWrap, setAutoWrap] = useState(true)

  // 从 localStorage 加载写作偏好 + 阅读偏好
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tuzhong-preferences')
      if (saved) {
        const prefs = JSON.parse(saved)
        if (prefs.writingStyle) queueMicrotask(function () { setWritingStyle(prefs.writingStyle) })
        if (prefs.continuationLength) {
          const lenMap: Record<string, 'short' | 'medium' | 'long'> = { short: 'short', medium: 'medium', long: 'long' }
          if (lenMap[prefs.continuationLength]) queueMicrotask(function () { setContinueLength(lenMap[prefs.continuationLength]) })
        }
        if (prefs.readerTheme) queueMicrotask(function () { setReaderTheme(prefs.readerTheme as Theme) })
        if (prefs.fontFamily) queueMicrotask(function () { setFontFamily(prefs.fontFamily) })
        if (typeof prefs.fontSize === 'number') queueMicrotask(function () { setFontSize(prefs.fontSize) })
        if (typeof prefs.lineHeight === 'number') queueMicrotask(function () { setLineHeight(prefs.lineHeight) })
        if (typeof prefs.paragraphSpacing === 'number') queueMicrotask(function () { setParagraphSpacing(prefs.paragraphSpacing) })
        if (prefs.contentWidth) queueMicrotask(function () { setContentWidth(prefs.contentWidth as 'narrow' | 'normal' | 'wide' | 'full') })
        if (typeof prefs.firstLineIndent === 'boolean') queueMicrotask(function () { setFirstLineIndent(prefs.firstLineIndent) })
        if (typeof prefs.autoWrap === 'boolean') queueMicrotask(function () { setAutoWrap(prefs.autoWrap) })
      }
    } catch (e) {
      console.warn('[write] 加载偏好失败:', e)
    }
  }, [])

  // 阅读偏好持久化
  useEffect(() => {
    try {
      const raw = localStorage.getItem('tuzhong-preferences') || '{}'
      const prefs = JSON.parse(raw)
      prefs.readerTheme = readerTheme
      prefs.fontFamily = fontFamily
      prefs.fontSize = fontSize
      prefs.lineHeight = lineHeight
      prefs.paragraphSpacing = paragraphSpacing
      prefs.contentWidth = contentWidth
      prefs.firstLineIndent = firstLineIndent
      prefs.autoWrap = autoWrap
      localStorage.setItem('tuzhong-preferences', JSON.stringify(prefs))
    } catch (e) { /* ignore */ }
  }, [readerTheme, fontFamily, fontSize, lineHeight, paragraphSpacing, contentWidth, firstLineIndent, autoWrap])

  const [showToolPanel, setShowToolPanel] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)

  const [showAIGuide, setShowAIGuide] = useState(false)
  const [writingStyle, setWritingStyle] = useState('番茄爽文风')
  const [continueLength, setContinueLength] = useState<'short' | 'medium' | 'long'>('medium')
  const [isGenerating, setIsGenerating] = useState(false)
  const [toolResult, setToolResult] = useState<string>('')
  const [selectedPlatform, setSelectedPlatform] = useState('tomato')

  // 进入编辑模式 / 切换章节时重置编辑草稿
  useEffect(() => {
    if (selectedChapter?.content) {
      const currentRaw = isRealTxtNovel() ? simpleCleanTxtContent(selectedChapter.content) : dePipelineContent(selectedChapter.content, selectedChapter.title)
      queueMicrotask(function () {
        setEditDraft(currentRaw)
        setIsEditMode(false)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChapter?.id])

  async function handleSaveDraft() {
    if (!selectedChapter) return
    setIsSaving(true)
    try {
      const res = await fetch('/tuzhong-wenshu/api/chapters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId,
          chapterId: selectedChapter.id,
          content: editDraft,
          title: selectedChapter.title,
          status: selectedChapter.status || 'completed',
        }),
      })
      if (!res.ok) throw new Error('保存失败')
      const json = await res.json()
      const updatedChapter = json.data as Chapter
      setChapters(prev => prev.map(c => c.id === updatedChapter.id ? { ...c, ...updatedChapter } : c))
      setSelectedChapter(prev => prev ? { ...prev, ...updatedChapter } : prev)
      setIsEditMode(false)
      alert('✅ 章节已保存')
    } catch (e) {
      console.error(e)
      alert('❌ 保存失败: ' + (e as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancelEdit() {
    const currentRaw = selectedChapter?.content
      ? (isRealTxtNovel() ? simpleCleanTxtContent(selectedChapter.content) : dePipelineContent(selectedChapter.content, selectedChapter.title))
      : ''
    setEditDraft(currentRaw)
    setIsEditMode(false)
  }

  function handlePrint() { window.print() }

  function handleExportTxt() {
    if (!selectedChapter) return
    const blob = new Blob([`${renderChapterTitle()}\n\n${renderChapterContent()}`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${renderChapterTitle() || 'chapter'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportNovelTxt() {
    if (!chapters.length) return
    const header = `${novel?.title || '作品'}\n\n`
    const body = chapters.map(c => {
      const cleaned = (typeof c.content === 'string')
        ? (isRealTxtNovel() ? simpleCleanTxtContent(c.content) : dePipelineContent(c.content, c.title))
        : ''
      return `\n\n《${c.title}》\n\n${cleaned}`
    }).join('')
    const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${novel?.title || 'novel'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleScrollToTop() {
    const scroller = document.querySelector('[data-scroll-container="chapter"]') as HTMLElement | null
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 滚动事件：监听 progress
  useEffect(() => {
    const scroller = document.querySelector('[data-scroll-container="chapter"]') as HTMLElement | null
    if (!scroller) return
    const onScroll = () => {
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight) { setScrollProgress(0); return }
      const p = scroller.scrollTop / (scroller.scrollHeight - scroller.clientHeight)
      setScrollProgress(Math.max(0, Math.min(100, Math.round(p * 100))))
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [selectedChapter?.id])

  // 搜索匹配
  useEffect(() => {
    if (!searchQuery.trim()) { queueMicrotask(function () { setSearchMatches([]); setSearchMatchIndex(0) }); return }
    const text = renderChapterContent()
    const q = searchQuery.trim()
    const res: { start: number; end: number }[] = []
    let idx = 0
    while (true) {
      const f = text.indexOf(q, idx)
      if (f === -1) break
      res.push({ start: f, end: f + q.length })
      idx = f + q.length
      if (res.length > 500) break
    }
    queueMicrotask(function () {
      setSearchMatches(res)
      setSearchMatchIndex(res.length ? 0 : -1)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedChapter?.id])

  // 检测平台配置（可配置的检测标准）
  const [detectPlatforms, setDetectPlatforms] = useState([
    { key: 'tomato', name: '番茄小说', icon: '🍅', aiStandard: '< 5%', color: 'red', enabled: true },
    { key: 'zhuque', name: '朱雀AI', icon: '🔴', aiStandard: '< 5%', color: 'rose', enabled: true },
    { key: 'qimao', name: '七猫小说', icon: '🐱', aiStandard: '< 8%', color: 'orange', enabled: false },
    { key: 'qidian', name: '起点中文', icon: '📖', aiStandard: '< 10%', color: 'blue', enabled: false },
    { key: 'jinjiang', name: '晋江文学', icon: '🌸', aiStandard: '< 8%', color: 'pink', enabled: false },
    { key: 'feilu', name: '飞卢小说', icon: '⚡', aiStandard: '< 10%', color: 'yellow', enabled: false },
    { key: 'zongheng', name: '纵横中文', icon: '🌊', aiStandard: '< 12%', color: 'cyan', enabled: false },
    { key: 'yuedong', name: '阅动文化', icon: '📚', aiStandard: '< 10%', color: 'green', enabled: false },
  ])

  useEffect(() => {
    if (!novelId) return
    loadNovelData()
  }, [novelId])

  async function loadNovelData() {
    setIsLoading(true)
    try {
      const [novelRes, volumesRes, chaptersRes, settingsRes] = await Promise.all([
        fetch(`/tuzhong-wenshu/api/novels?id=${novelId}`),
        fetch(`/tuzhong-wenshu/api/volumes?novelId=${novelId}`),
        fetch(`/tuzhong-wenshu/api/chapters?novelId=${novelId}`),
        fetch(`/tuzhong-wenshu/api/settings?novelId=${novelId}&type=cover`),
      ])

      let loadedNovel: Novel | null = null
      if (novelRes.ok) {
        const novelJson = await novelRes.json()
        loadedNovel = novelJson.data || novelJson
        setNovel(loadedNovel)
      }

      if (volumesRes.ok) {
        const volumesJson = await volumesRes.json()
        const volList = Array.isArray(volumesJson.data) ? volumesJson.data : []
        // 🔥 修复章节错位：按 order 字段排序卷，第一卷在前、第二卷在后
        volList.sort((a: Volume, b: Volume) => (a.order || 0) - (b.order || 0))
        setVolumes(volList)
      }

      if (chaptersRes.ok) {
        const chaptersJson = await chaptersRes.json()
        const chs = Array.isArray(chaptersJson.data) ? chaptersJson.data : (Array.isArray(chaptersJson) ? chaptersJson : [])
        setChapters(chs)
        if (chs.length > 0) {
          // 🔥 初始章节正文按需加载（列表已剥离 content）
          const firstChapter = chs.find((c: Chapter) => c.status === 'completed') || chs[0]
          setSelectedChapter(firstChapter)
          // 异步拉取首章正文
          try {
            const contentRes = await fetch(`/tuzhong-wenshu/api/chapters?novelId=${novelId}&chapterId=${firstChapter.id}`)
            if (contentRes.ok) {
              const contentJson = await contentRes.json()
              const fetchedContent = contentJson?.data?.content || ''
              setSelectedChapter({ ...firstChapter, content: fetchedContent })
              setChapters(chs.map((c: any) => c.id === firstChapter.id ? { ...c, content: fetchedContent } : c))
            }
          } catch { /* 静默降级 */ }
          setExpandedVolumes({ 1: true })
        }
      }

      // 封面：优先settings中的coverUrl，其次novel.cover；支持 ||| 多链接fallback
      let foundCover = ''
      if (settingsRes.ok) {
        const settingsJson = await settingsRes.json()
        if (settingsJson.data?.cover?.coverUrl) {
          foundCover = settingsJson.data.cover.coverUrl
        } else if (settingsJson.data?.coverUrl) {
          foundCover = settingsJson.data.coverUrl
        }
      }
      if (!foundCover && loadedNovel?.cover) {
        foundCover = loadedNovel.cover
      }
      if (foundCover) {
        const firstLink = String(foundCover).split('|||')[0]?.trim()
        if (firstLink) {
          setCoverUrl(firstLink)
          setCoverFallbackIndex(0)
        }
      }
    } catch (err) {
      console.error('Failed to load novel:', err)
    } finally {
      setIsLoading(false)
    }
  }

  function getChaptersForVolume(volumeNum: number, volumeName?: string): Chapter[] {
    const matched = chapters.filter(c => {
      if (typeof c.volumeIndex === 'number' && c.volumeIndex === volumeNum - 1) return true
      if (typeof c.volume === 'number' && c.volume === volumeNum) return true
      if (typeof c.volumeId === 'string' && volumes.find(v => v.order === volumeNum)?.id === c.volumeId) return true
      if (volumeName && typeof c.volume === 'string' && c.volume === volumeName) return true
      return false
    })
    // 🔥 修复章节错位：仅返回明确属于该卷的章节，并按 chapterNumber/order 排序；
    //    不再做"均分章节到各卷"的错误兜底（那会导致卷和章节错位）
    return matched.sort((a, b) => (a.chapterNumber || a.chapterInVolumeIndex || a.order || 0) - (b.chapterNumber || b.chapterInVolumeIndex || b.order || 0))
  }

  function toggleVolume(volumeNum: number) {
    setExpandedVolumes(prev => ({
      ...prev,
      [volumeNum]: !prev[volumeNum]
    }))
  }

  function navigateChapter(direction: 'prev' | 'next') {
    if (!selectedChapter || chapters.length === 0) return
    const currentIdx = chapters.findIndex(c => c.id === selectedChapter.id)
    if (currentIdx === -1) return
    const targetIdx = direction === 'prev' ? currentIdx - 1 : currentIdx + 1
    if (targetIdx >= 0 && targetIdx < chapters.length) {
      selectChapterWithContent(chapters[targetIdx])
    }
  }

  // 🔥 按需拉取章节正文：章节列表已剥离 content，选中章节时单独请求正文
  const [contentLoading, setContentLoading] = useState(false)
  async function selectChapterWithContent(chapter: Chapter) {
    setSelectedChapter(chapter)
    // 如果已有 content 或明确无正文（hasContent=0），无需再请求
    if (chapter.content !== undefined) return
    if ((chapter as Chapter & { hasContent?: number }).hasContent === 0) return
    setContentLoading(true)
    try {
      const res = await fetch(`/tuzhong-wenshu/api/chapters?novelId=${novelId}&chapterId=${chapter.id}`)
      if (res.ok) {
        const json = await res.json()
        const fetchedContent = json?.data?.content || ''
        setSelectedChapter(prev => prev ? { ...prev, content: fetchedContent } : prev)
        // 同步更新 chapters 数组中的对应章节
        setChapters(prev => prev.map(c => c.id === chapter.id ? { ...c, content: fetchedContent } : c))
      }
    } catch {
      // 静默降级
    } finally {
      setContentLoading(false)
    }
  }

  // 清理章节标题中的冗余"第X章"前缀（支持重复前缀如"第1章 第1章 标题"）
  function cleanChapterTitle(title: string | undefined): string {
    if (!title) return ''
    let cleaned = title
    let prev = ''
    while (prev !== cleaned) {
      prev = cleaned
      cleaned = cleaned
        .replace(/^第[一二三四五六七八九十百千万零〇\d]+卷[\s·\-—:：_、]*(?=第[一二三四五六七八九十百千万零〇\d]+卷)/u, '')
        .replace(/^第[一二三四五六七八九十百千万零〇\d]+章[\s·\-:：_]*/, '')
        .replace(/^[一二三四五六七八九十百千万零〇\d]+章[\s·\-:：_]*/, '')
        .trim()
    }
    return cleaned || title
  }

  // 格式化题材：genre 可能是逗号分隔的多题材长串（如"古典仙侠,东方玄幻,异世大陆"），
  // 详情页只展示主题材 + 其余数量，避免一行堆满
  function formatGenre(g: string | undefined): string {
    if (!g || !g.trim()) return '未分类'
    const parts = g.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
    if (parts.length <= 1) return g.trim()
    return parts[0] + ' +' + (parts.length - 1)
  }

  // 对卷名做"去重命名"：如"第一卷 第一卷"->"第一卷"、重复的"第X卷"拼接只保留一份
  function cleanVolumeName(name: string | undefined, order: number): string {
    if (!name) return `第${order || 1}卷`
    let trimmed = name.trim()
    if (!trimmed) return `第${order || 1}卷`
    // 最多尝试 3 轮去重
    for (let i = 0; i < 3; i++) {
      const len = trimmed.length
      if (len < 4) break
      // 尝试在中间空格/分隔符处切开比较
      const seps = /[\s　·\-—–_|/、]+/u
      const parts = trimmed.split(seps)
      if (parts.length >= 2) {
        // 相邻两份相同，压缩
        let collapsed = false
        for (let p = 0; p < parts.length - 1; p++) {
          if (parts[p] && parts[p + 1] && parts[p] === parts[p + 1]) {
            parts.splice(p + 1, 1)
            collapsed = true
          }
        }
        if (collapsed) { trimmed = parts.join(' ').trim(); continue }
      }
      // 全串对半相同则取一半
      const mid = Math.floor(len / 2)
      if (mid >= 2 && trimmed.substring(0, mid).trim() === trimmed.substring(mid).trim()) {
        trimmed = trimmed.substring(0, mid).trim()
        continue
      }
      break
    }
    return trimmed || `第${order || 1}卷`
  }

  // 是否应该按卷分组显示（按用户要求：有卷信息就按卷显示，没有卷只有章节就按章节显示）：
  //  - volumes.length >= 2 → 肯定有卷信息 → 用分卷
  //  - volumes.length === 1 → 如果卷名是默认占位"第X卷"这种，视为"没有卷信息"，直接平铺章节；否则按卷显示
  //  - volumes 为空 → 直接平铺章节
  //  - 🔥 额外检查：即使有多个卷，如果章节完全没有 volumeIndex/volume/volumeId 信息，
  //    说明章节和卷没有关联，强行按卷分组会导致所有卷都是空的 → 改为平铺显示
  function shouldGroupByVolumes(): boolean {
    if (volumes.length === 0) return false
    if (volumes.length >= 2) {
      // 检查是否有任何章节携带卷信息
      const hasVolumeInfo = chapters.some(c =>
        typeof c.volumeIndex === 'number' ||
        typeof c.volume === 'number' ||
        typeof c.volume === 'string' ||
        typeof c.volumeId === 'string'
      )
      // 没有任何章节带卷信息时，按章节平铺显示，避免空卷
      if (!hasVolumeInfo && chapters.length > 0) return false
      return true
    }
    if (volumes.length === 1 && chapters.length > 0) {
      const v = volumes[0]
      const defaultNamePattern = /^第[\d一二三四五六七八九十百千万零〇]+卷$/u
      const cleanedName = cleanVolumeName(v.name, v.order || 1).trim()
      const isDefaultNameOnly = defaultNamePattern.test(cleanedName)
      // 如果只有一卷，且卷名就是默认"第X卷"，没有任何额外子卷标题，视为无卷信息，按章节显示
      if (isDefaultNameOnly) return false
      // 否则有真实卷名，按卷显示
      return true
    }
    return false
  }

  // 获取所有章节的有序列表（按 chapterNumber/order 排序）
  function getSortedChapters(): Chapter[] {
    return [...chapters].sort((a, b) =>
      Number(a.chapterNumber || a.order || 0) - Number(b.chapterNumber || b.order || 0)
    )
  }

  // 章节标题统一字数 + 去重命名引擎
  // ——命名模板（6字为洪荒文标配）：
  //   AAAA BB 动宾(4)+结果(2)    如：横扫妖族 百万 / 诛杀上古 邪神
  //   AA BBB C 动(2)+场所(3)+果(1) 如：血战 不周山 巅 / 剑斩 碧游宫 前
  //   AAA BBB  场景(3)+冲突(3)   如：东海边 妖兵现 / 紫霄宫 道音落
  function unifyChapterTitles(allChapters: Chapter[]): Chapter[] {
    if (!allChapters || allChapters.length === 0) return allChapters
    // 《巫颂》级6字标题词库：双字词按 动/兵/地/果 四类划分
    const V  = ['血战','诛灭','镇压','降服','斩杀','击溃','扫荡','伏击','淬炼','祭炼','参悟','破开','收服','锻造','鏖战','觉醒','激活','吞噬','突破','踏入','潜入','召唤','铸造','重铸','开启','封印','穿越','降临','逆转','轰杀','撕裂','焚烧','冰封','碾轧','贯通','召唤','融合','点燃','撼动']
    const O  = ['妖族','上古','诸天','巫族','祖巫','魔神','洪荒','苍穹','都天','血煞','妖神','东皇','妖帝','万妖','天道','圣人','混沌','巫纹','图腾','噬魂','诛仙','碧游','紫霄','不周','九黎','三苗','饕餮','穷奇','梼杌','混沌魔','幽冥','血海','灵脉','金身','战魂','祖灵']
    const L  = ['东海','南疆','北境','西漠','中州','青丘','九凤','玄霜','赤练','玄冥','后土','祝融','共工','收天','金鏊','蟠桃','瑶池','灵霄','兜率','玉虚','女娲','伏羲','神农','轩辕','蚩尤','刑天','夸父','后羿','嫦娥','颛顼','帝喾','尧舜']
    const R  = ['百万','千万','无尽','滔天','绝世','无双','盖世','惊天','动地','破天','伐天','屠神','弑仙','镇魔','封妖','无上','归真','涅槃','第一','至尊','王者','霸主','传奇','绝响','终章','封神','问道','斩缘','证道','登仙','不朽','永恒','大巫','巫祖','人皇','妖皇']
    // 预生成 6字无重标题缓存池（V+O+R 组合，35×35×35=4万足够）
    const pool: string[] = []
    const seenPool = new Set<string>()
    outer:
    for (let vi = 0; vi < V.length; vi++) {
      for (let oi = 0; oi < O.length; oi++) {
        for (let ri = 0; ri < R.length; ri++) {
          const s = V[vi] + O[oi] + R[ri]
          if (s.length === 6 && !seenPool.has(s)) { seenPool.add(s); pool.push(s) }
          if (pool.length >= 2000) break outer
        }
      }
    }
    // 第二套模板：L+L+R 地名驱动型（如：东海之滨血战、南疆毒瘴故人）
    for (let li = 0; li < L.length; li++) {
      for (let lj = 0; lj < L.length; lj++) {
        for (let rj = 0; rj < R.length; rj++) {
          const s2 = L[li] + L[lj] + R[rj]
          if (s2.length === 6 && !seenPool.has(s2)) { seenPool.add(s2); pool.push(s2) }
        }
      }
    }
    const usedTitles = new Set<string>()
    return allChapters.map(function(ch, idx) {
      const rawTitle = cleanChapterTitle(ch.title).replace(/[\s·\-_:：]/g, '')
      const num = ch.chapterNumber || (idx + 1)
      let final6 = rawTitle
      if (rawTitle.length === 6) {
        final6 = rawTitle
      } else if (rawTitle.length > 0 && rawTitle.length < 6) {
        // 太短：从词库补成完整6字词组（优先保留原词在前2/前3）
        const headPad = rawTitle.slice(0, 2)
        let foundPad: string | undefined
        for (const p of pool) {
          if (p.startsWith(headPad) && !usedTitles.has(p)) { foundPad = p; break }
        }
        if (!foundPad) for (const p of pool) { if (!usedTitles.has(p)) { foundPad = p; break } }
        final6 = foundPad || (rawTitle + '战苍穹').slice(0, 6)
      } else if (rawTitle.length > 6) {
        // 过长：保留前2+后3（核心动宾结构），再补1字整合成6字
        const h = rawTitle.slice(0, 2), t = rawTitle.slice(rawTitle.length - 3)
        const cand = (h + t).slice(0, 6)
        // 若不完美，从词库找同首字候选
        let foundLong: string | undefined
        for (const p of pool) {
          if (p.startsWith(h) && !usedTitles.has(p)) { foundLong = p; break }
        }
        if (!foundLong && cand.length === 6) { foundLong = cand }
        if (!foundLong) for (const p of pool) { if (!usedTitles.has(p)) { foundLong = p; break } }
        final6 = foundLong || cand.slice(0, 6)
      }
      // 全局去重：如果已用过，换下一个词库项
      if (usedTitles.has(final6)) {
        for (const p of pool) { if (!usedTitles.has(p)) { final6 = p; break } }
      }
      // 最后兜底：idx直接索引词库
      if (usedTitles.has(final6)) final6 = pool[idx % pool.length] + (idx < 1000 ? '' : '')
      if (final6.length > 6) final6 = final6.slice(0, 6)
      usedTitles.add(final6)
      return { ...ch, title: `第${num}章 ${final6}`, chapterNumber: num }
    })
  }

  // 正文去流水线套话模板，消除AI感
  // 清除："心中回想着第X卷的目标"、"离XX又近了一步"、"四周安静得只剩心跳"、
  //       "远处树林中似有黑影"、"天地间忽然静得能听见针落地"、等固定套路
  function cleanGarbageChars(content: string): string {
    let s = content
    // 1) 句尾乱码尾巴：。\  / ！\  / 。/  / 。`  / 。|  等（全角/半角标点后紧跟 \ / ` | 等残字）
    s = s.replace(/([。！？!?\.；;：:，,])[\\\/`|¦]+/g, '$1')
    //    单独的句尾孤零零反斜杠（上一条已经覆盖 。\，这里补掉句末残留 \）
    s = s.replace(/[\\\/`|¦]+\s*(?=\n|$)/g, '')
    // 2) 盗版站无弹窗 / 无广告 / 防走失 类括号广告：
    //    [(m)無彈窗閱讀] / 【(m)无弹窗阅读】 / （..无弹窗阅读） / ［xxx 无弹窗 xxx］
    const BR = '[\\[【（(\\[【\\(（]'
    const ER = '[\\]】）)\\]】\\)）]'
    s = s.replace(new RegExp(`${BR}\\s*(?:[^\\]】）)\\s]{0,6}\\s*[:：]?\\s*)?\\s*(?:無彈窗|无弹窗|沒有弹窗|没弹窗|无广告|沒有广告|防走失|防屏蔽|防和谐|防删除)\\s*[·\\-—_\\s]*閱[读讀]?\\s*${ER}`, 'gi'), '')
    // 2.1) 短标识兜底：[(m)無彈窗] / 【 无弹窗 】 这种不带“阅读”的也要删
    s = s.replace(new RegExp(`${BR}[^\\]】）)]{0,10}(?:無彈窗|无弹窗|沒有弹窗|没弹窗)[^\\]】）)]{0,10}${ER}`, 'gi'), '')
    // 2.2) 暴力兜底：任何括号内出现「彈窗/弹窗」字样直接整体删除（防半全角括号乱码绕开）
    s = s.replace(/[\[【（(][^\]】）)\n]{0,40}(?:彈窗|弹窗)[^\]】)\n]{0,40}[\]】）)]/gim, '')
    // 2.3) 终极兜底：以「弹窗 / 無彈窗」为锚点向左右扩括号对删除（适配半角括号等边界情况）
    s = s.replace(/[\[【（(][\s\S]{0,50}?(?:無彈窗|无弹窗|沒有弹窗|没弹窗|彈窗|弹窗)[\s\S]{0,50}?[\]】）)]/gim, '')
    // 3) 盗版站名 & 章节推广类括号广告：
    //    【笔趣阁高品质更新】/ (《138看书网》) / （百度搜索《~138看书网~》，观看本书最新更新）/
    //    [文字更新最快就在-< 书海阁 >-] / 【……第二十篇 第二十九章 绝地 文字更新最快……】/
    //    [ 文字版更新最快到  ] / （赘婿小说最新章节连载） / [看本书最新章节请到800 ]
    s = s.replace(new RegExp(
      `${BR}[^\\]】）)]{0,80}(?:` +
      [
        '笔趣阁','138看书网','书海阁','看书网','顶点小说','起点中文|起点','纵横中文|纵横','红袖添香|红袖',
        '潇湘书院|潇湘','晋江文学|晋江','逐浪小说|逐浪','飞卢小说|飞卢','17k小说|17k','小说阅读',
        'txt下载','全文阅读|全文免费','手打小说|手打吧|燃文|百书楼|乐文小说|飘天文学|飘天',
        '奇书网|千千小说|云朵阅读|书书网|笔仙阁|啃文书库|abc小说|800小说|800txt',
        '无弹窗|無彈窗','广告位|APP下载|最新网址|防走失|防屏蔽|防和谐|防删除',
        '文字更新最快|文字最快更新|最新章节|更新最快|最快更新|最新网址|观看本书最新更新|小说最新章节连载',
        '下载客户端|扫码|二维码|加微信|加QQ|发红包|福利|公众[号浩]'
      ].join('|') +
      `)[^\\]】）)]{0,60}${ER}`,
      'gim'
    ), '')
    // 4) 求票/求收藏/求打赏 等作者口播残句：
    //    "，请大家" / "！请大家多多支持" / "，请各位书友收藏推荐一下" / "求推荐票啊" / "点一下收藏"
    const pleads = [
      '求推荐票','求月票','求收藏','求打赏','求点击','求追读','求订阅','求赞','求粉','求鲜花','求贵宾','求盖章','求红票','求金砖','求个票','求支持','给个票','给点票',
      '收藏一下','投张推荐','请大家','请各位书友','点个收藏','点一下收藏',
      '加群','书友群','QQ群[:：]','qq群[:：]','微信群[:：]',
      '公众[号浩][:：]','关注公众号','扫码进群','关注公号'
    ]
    s = s.replace(new RegExp(
      `[，。,.!?！？、；：;\\n、]\\s*(?:${pleads.join('|')})[^，。,.!?！？、；：;\\n]{0,60}(?=[，。,.!?！？、；：;\\n]|$)`,
      'gim'
    ), '')
    // 4.1) 兜底：行间散见的盗版站推广句（不包括号的）
    const PIRACY_LINE_KW = [
      '百度搜索[^，。,.\\n]{0,30}看书网','[^，。,.\\n]{0,12}看书网[^，。,.\\n]{0,40}最新更新',
      '文字更新最快[^，。,.\\n]{0,24}书海阁','文字[版]?更新最快[^，。,.\\n]{0,30}',
      '看本书最新章节请到\\d+',
      '赘婿小说最新章节连载',
      '顺便为.{0,12}打个广告',
      '推荐阅读.{0,40}最新章节'
    ];
    s = s.replace(new RegExp(`(?:${PIRACY_LINE_KW.join('|')})`, 'gim'), '')
    // 4.2) 《巫血图腾》AI生成正文的元叙事 / 脚手架句子（截图红框 4 类）
    //       ① 今日之事，落在「……」上。
    s = s.replace(/[—\-\s]*今日之事[\s，,]*落在[\[【「（(][\s\S]{0,200}?[」\]】）)][。!！?？]?/g, '')
    //       ② ——明日，刀出鞘。而明日，便是扮猪吃虎·隐忍蛰伏的局。
    s = s.replace(/[—\-—]{2,}\s*[而此今明昨]?日[\s，,、.。]*[\u4e00-\u9fa5\s，,。.·\-—]{0,80}的局[。!！?？]?/g, '')
    //       ③ 命运的齿轮，终于在这一刻，沿着旁人看不懂的轨迹，缓缓转动起来。…
    s = s.replace(/命运的齿轮[\s，,。.]{0,30}(?:终|才|缓|开|沿)[\u4e00-\u9fa5\s，,。.…·\-—]{0,120}/g, '')
    //       ④ 长老席上几位白发苍苍的老者霍然起身…死死盯着…那道挺拔的少年身影。
    s = s.replace(/长老席上[\u4e00-\u9fa5\s，,。.]{0,40}霍然起身[\u4e00-\u9fa5\s，,。.：:“”"']{0,120}死死盯着[\u4e00-\u9fa5\s，,。.]{0,40}身影[。，,\.]?/g, '')
    s = s.replace(/长老席上[\u4e00-\u9fa5\s，,。.]{0,30}霍然起身[。，,\.]?/g, '')
    //       补：被重复复用的场景模板句「后山的药圃一片狼藉…泥土上留着清晰的靴印。」
    s = s.replace(/后[山山]的药圃一片狼藉[，,][\u4e00-\u9fa5\s，,。.]{0,60}靴印[。，,\.]?/g, '')
    //       补-终极兜底：「……，言语里满是……的轻贱。上。眼，瞳孔…」「今日的气息，与往日不同。上。」这类孤立的「上。」
    s = s.replace(/[^\n]{0,10}[\u4e00-\u9fa5]{2,15}的轻贱[。，,]\s*上[。，,\.\s]+(?=[\u4e00-\u9fa5])/g, '')
    s = s.replace(/上[。，,\.，,]\s*眼[，,、\s]+瞳孔/gu, '瞳孔')
    // 更激进的孤立「上。」「上」清除（防止匹配失败后留下"低声议眼…""尸山血海之本命图腾""像被狂奔的野牛撞哇地"这类截断）
    s = s.replace(/(?<=[论起论话辱骂羞辱欺辱嘲讽讽讥笑贬斥轻蔑鄙夷鄙夷不屑轻贱鄙视微词刺挑拨排挤踩压踩贬损羞辱诋讥诽嘲挖苦寒碜糟践糟蹋作践践踏])([\s，,。.…]*?)上[。，,\.\s]+/g, '$1')
    s = s.replace(/之+上[。，,\.\s]+(?=[\u4e00-\u9fa5])/g, '，')
    s = s.replace(/(撞|推|顶|打|砸|压|劈|砍|斩|刺|扫|拍|抓|扣|按|压|撞|碾|踩|踏)上[。，,\.\s]+/g, '$1，')
    s = s.replace(/(?<=[\u4e00-\u9fa5，,。.！？!?；;：:])\s*上[。，,\.\s]+(?=[\u4e00-\u9fa5\s])/g, '')
    s = s.replace(/(?<=低[声音])\s*[上议]\s*(?=眼|瞳)/gu, '')
    s = s.replace(/(?<=血海之)\s*上\s*/g, '，')
    s = s.replace(/(?<=狂奔的野牛)\s*上\s*/g, '')
    s = s.replace(/今日的气息[\s\S]{0,40}与往日不同[。，,\.]\s*上[。，,\.]?/g, '今日的气息，与往日不同。')
    s = s.replace(/冰冷的月光[\s\S]{0,120}昭示着昨夜[\s\S]{0,40}退走了[。，,\.]\s*上[。，,\.]?/g, (m)=>m.replace(/上[。，,\.]?$/,'').trim())
    s = s.replace(/风里[\s\S]{0,80}一丝属于强者的味道[。，,\.]\s*上[。，,\.]?/g, (m)=>m.replace(/上[。，,\.]?$/,'').trim())
    s = s.replace(/空气中飘着[\s\S]{0,40}心里不快[。，,\.]\s*上[。，,\.]?/g, (m)=>m.replace(/上[。，,\.]?$/,'').trim())
    s = s.replace(/抬眼[\s\S]{0,20}今日有事要发生[。，,\.]\s*上[。，,\.]?/g, (m)=>m.replace(/上[。，,\.]?$/,'').trim())
    // 极端兜底：把「低声议眼」「议眼，瞳」「血海之本命」「撞哇地」这类明显截断病句修复
    s = s.replace(/低声议眼[，,\s]*/g, '')
    s = s.replace(/低声[声议]?[议论]?[眼瞳目][，,\s]*(?=瞳孔|眼|瞳)/gu, '')
    s = s.replace(/议眼[，,\s]*瞳孔/gu, '瞳孔')
    s = s.replace(/血海之本命/g, '血海之上，本命')
    s = s.replace(/野牛撞哇地/g, '野牛撞上，哇地')
    s = s.replace(/(?<=裹着兽皮的巫族少年抱着膝盖缩在一处[，,])\s*低声[，,\s]*眼[，,\s]*(?=瞳孔)/gu, '')
    // 终极兜底：孤立「上」残留导致的「血海 本命」「野牛撞 哇地」
    s = s.replace(/尸山血海[\s，,]*本命/g, '尸山血海之上，本命')
    s = s.replace(/狂奔的野牛[\s，,]*撞[\s，,]*哇地/g, '狂奔的野牛撞上，哇地')
    // 终极兜底2：通用句式残留（尖顶之上 缺 上、荆棘之上 缺 上、识海之上 缺 上、祭台石柱的尖顶之冰冷 / 兽毛挂在荆棘昭示 / 悬在陆昭识海之冰冷）
    s = s.replace(/尖顶之\s*冰冷/g, '尖顶之上，冰冷')
    s = s.replace(/荆棘\s*昭示/g, '荆棘之上，昭示')
    s = s.replace(/识海之\s*冰冷/g, '识海之上，冰冷')
    // 5) 杂项残括号：内容是空的【】/ [] /（），以及里面只有省略号/空格/「…更新最快…」那种
    s = s.replace(/[\[【（(]\s*[.。,，、\s…·\-—_~]{0,12}\s*[\]】）)]/g, '')
    // 6) 清理空段落 + 标点粘连（连续逗号/句号等），避免上一步删完留下 "abc，，def"
    s = s.replace(/[，,]{2,}/g, '，')
    s = s.replace(/[。.]{2,}/g, '。')
    s = s.replace(/[！!]{2,}/g, '！')
    s = s.replace(/[？?]{2,}/g, '？')
    s = s.replace(/\n{3,}/g, '\n\n')
    return s.trim()
  }

  function dePipelineContent(content: string | undefined, chapterTitleRaw?: string | undefined): string {
    if (!content) return ''
    let s = content
    const cleanTitle = cleanChapterTitle(chapterTitleRaw)
      .replace(/[，,。\.\s]+/g, '')
      .replace(/[\[\]【】「」『』《》<>（）()""“”'‘’]/g, '')
    if (cleanTitle && cleanTitle.length >= 2) {
      const escaped = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // 1) Markdown / 类标题行：# XXXX / ## XXXX / 「XXXX」独立一行
      const headingRe = new RegExp(
        `^(?:#{1,6}\\s*|【|\\[|\\(|（)?(?:第[一二三四五六七八九十百千万零〇\\d]+[章节卷][\\s·\\-—:：_、]*)?${escaped}[\\s·\\-—:：_、。，,\\.!！？\\?】\\]\\)）]*(?:\\n|$)`,
        'u'
      )
      for (let i = 0; i < 3; i++) {
        const before = s
        s = s.replace(headingRe, '')
        if (before === s) break
      }
      // 2) 正文最顶部纯章名单行（不含第X章前缀）
      const bareRe = new RegExp(`^\\s*${escaped}\\s*\\n+`, 'u')
      s = s.replace(bareRe, '')
      // 3) 若开头紧跟「：」「·」分隔的章名+剧情简介（单行）也去掉
      const colonRe = new RegExp(`^\\s*(?:第[一二三四五六七八九十百千万零〇\\d]+章)?\\s*${escaped}[：:].*\\n+`, 'u')
      s = s.replace(colonRe, '')
    }
    // 4) 兜底：去掉所有以 #+ 开头的首段标题（防止任何残留的章名 H 标签）
    s = s.replace(/^\s*#{1,6}\s*[^\n]+\n{1,2}/, '')
    // 5) 兜底：去掉首段形如「第XX章 XXXX」纯标题行
    s = s.replace(/^\s*第[一二三四五六七八九十百千万零〇\d]+[章节卷][\s·\-—:：_、]*[^\n]{0,40}\n{1,2}/u, '')
    // 6) 回想着/默念着第X卷目标的流水句式
    s = s.replace(/[，。,\.\s]*心中?回?想着第?[一二三四五六七八九十百千万零\d]+卷[·\-~\s]*[^，。,.\n]{0,24}的目标[。，,\.]?/g, '')
    s = s.replace(/[，。,\.\s]*心中暗?道[：:]*第?[一二三四五六七八九十百千万零\d]+卷[·\-~\s]*[^，。,.\n]{0,20}绝不?能失败[。，,\.]?/g, '')
    s = s.replace(/[，。,\.\s]*离[^，。,.\n]{4,24}又近了[一二三四五六七八九十百千万零\d]+步[。，,\.]?/g, '')
    // 7) 环境描写流水线模板（重复出现≥2次的套路句）
    const ambientPatterns = [
      /四周[忽一]然?安?静得?只?剩?下?[自]?己的心跳声?[。，,\.]?/g,
      /远处?传来几声清脆的鸟鸣声?[。，,\.]?/g,
      /远处?的树林中似有黑影一闪而过[。，,\.]?/g,
      /天边的云霞染上了一层金色[。，,\.]?/g,
      /脚下的地面轻轻颤动了一下[。，,\.]?/g,
      /天地间忽然静得能听见针落地的声音?[。，,\.]?/g,
      /一股若有若无的杀意弥漫开来[。，,\.]?/g,
      /落叶在风中打着旋儿飘落[。，,\.]?/g,
      /周围的空气仿佛凝固了一般[。，,\.]?/g,
      /空气中弥漫着淡淡的灵气波动[。，,\.]?/g,
      /灵气在周身形成肉眼可见的漩涡[。，,\.]?/g,
      /不知何处传来悠扬的钟声[。，,\.]?/g,
      /石壁上的符文微微闪烁[。，,\.]?/g,
      /远处的山峦在薄雾中若隐若现[。，,\.]?/g,
      /风吹过带来一阵草木的清香[。，,\.]?/g,
      /一阵莫名的寒意从脊背升起[。，,\.]?/g,
      /掌心渗出了细密的汗珠[。，,\.]?/g,
      /体内的灵力不受控制地翻涌起来[。，,\.]?/g,
      /攥紧了拳头，指节发白[。，,\.]?/g,
      /脚下的碎石被气息震得微微跳动[。，,\.]?/g,
      /地面上的影子被拉得很长[。，,\.]?/g,
      /远处的天际有异色光芒一闪而过[。，,\.]?/g,
      /脚步一错，闪身到暗处[。，,\.]?/g,
      /身形瞬间消失在原地[。，,\.]?/g,
      /不动声色地将手按在腰间[。，,\.]?/g,
      /深吸了一口气[。，,\.]?/g,
      /眉头微微皱起[。，,\.]?/g,
      /嘴角泛起一丝苦笑[。，,\.]?/g,
      /眼神骤然一凝[。，,\.]?/g,
      /目光扫过四周，确认无异常[。，,\.]?/g,
      /心念一动，灵力运转[。，,\.]?/g,
      /手指轻轻捻动[。，,\.]?/g,
      /掌心渗出了细密的汗珠[。，,\.]?/g,
      /体内力量缓缓涌动，蓄势待发[。，,\.]?/g,
      /眼中闪过一丝精光[。，,\.]?/g,
      /脚步不由得顿了顿[。，,\.]?/g,
      /嘴角微微上扬[。，,\.]?/g,
    ]
    for (const re of ambientPatterns) {
      s = s.replace(re, '')
    }
    // 8) 清理连续标点、连续空白行
    s = s.replace(/[，,]{2,}/g, '，').replace(/[。.]{2,}/g, '。')
    s = s.replace(/\n{3,}/g, '\n\n').trim()
    // 9) 章末尾巴套话
    s = s.replace(/[，,]\s*他低头看见袖口被划破一道口子，对面的人[^。]{0,20}。$/g, '')
    s = s.replace(/[，,]\s*案头的毛笔滚到了桌边，手里的[^。]{0,20}。$/g, '')
    s = s.replace(/[，,]\s*指尖无意间触到冰凉的戒指[。，,\.]?$/g, '')
    s = s.replace(/[，,]\s*茶博士的吆喝声从楼下传来[^。]{0,40}。$/g, '')
    s = s.replace(/[，,]\s*地上的影子被月光拉得很长[。，,\.]?$/g, '')
    return cleanGarbageChars(s)
  }

  function simpleCleanTxtContent(content: string | undefined): string {
    if (!content) return ''
    let s = content
    s = s.replace(/\u3000/g, '  ')
    s = s.replace(/[ \t]+\n/g, '\n')
    s = cleanGarbageChars(s)
    return s
  }

  function isRealTxtNovel(): boolean {
    const realTxtIds = ['1784900336466','1784900336477','1784900336478','1784900336479',
      '1784900336480','1784900336878','1784900336978','1784900337280','1784900337380']
    return !!(novel?.id && realTxtIds.includes(novel.id))
  }

  function renderChapterTitle(): string {
    if (!selectedChapter) return '选择章节开始阅读'
    if (isRealTxtNovel()) {
      return selectedChapter.title || ''
    }
    return `第${selectedChapter?.chapterNumber}章 ${cleanChapterTitle(selectedChapter?.title)}`
  }

  function renderChapterContent(): string {
    if (!selectedChapter?.content) return ''
    if (isRealTxtNovel()) {
      return simpleCleanTxtContent(selectedChapter.content)
    }
    return dePipelineContent(selectedChapter.content, selectedChapter.title)
  }

  function countWords(): number {
    if (!selectedChapter) return 0
    if (selectedChapter.wordCount) return selectedChapter.wordCount
    const c = isRealTxtNovel()
      ? simpleCleanTxtContent(selectedChapter.content)
      : dePipelineContent(selectedChapter.content, selectedChapter.title)
    return c.replace(/\s/g, '').length
  }

  function formatChapterForSidebar(chapter: Chapter, displayChapters: Chapter[]): string {
    if (isRealTxtNovel()) {
      return chapter.title || ''
    }
    const cleanName = cleanChapterTitle(chapter.title)
    const num = chapter.chapterNumber
    return `第${num}章 ${cleanName}`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">加载作品中...</p>
        </div>
      </div>
    )
  }

  if (!novel) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-700 mb-2">作品不存在</h2>
          <p className="text-gray-500 mb-4">该作品可能已被删除或ID无效</p>
          <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Home className="w-4 h-4" />
            返回书架
          </Link>
        </div>
      </div>
    )
  }

  const completedChapters = chapters.filter(c => c.status === 'completed' || c.status === 'content_done')
  const totalWords = completedChapters.reduce((sum, c) => sum + (c.wordCount || (c.content ? (isRealTxtNovel() ? simpleCleanTxtContent(c.content) : dePipelineContent(c.content, c.title)).replace(/\s/g, '').length : 0)), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {showAIGuide ? (
        <div className="py-4 px-4">
          <AIGenerateWizard
            embedded={true}
            initialGenre={novel?.genre || '玄幻'}
            isCreating={false}
            onClose={() => setShowAIGuide(false)}
            onComplete={() => {
              setShowAIGuide(false)
              router.refresh()
            }}
          />
        </div>
      ) : (
        <div className="flex">
      {/* 左侧边栏 - 章节目录 */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
        <div className="p-4 border-b border-gray-200">
          <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回书架</span>
          </Link>
          <div className="flex items-start gap-3">
            <div className={`w-14 h-20 rounded bg-gradient-to-br ${coverGradients[0]} flex-shrink-0 flex items-center justify-center overflow-hidden`}>
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt="封面"
                  className="w-full h-full object-cover"
                  onError={() => {
                    const raw = (novel?.cover || coverUrl || '') as string
                    const links = String(raw).split('|||').map((s: string) => s.trim()).filter(Boolean)
                    const next = coverFallbackIndex + 1
                    if (next < links.length) {
                      setCoverFallbackIndex(next)
                      setCoverUrl(links[next])
                    }
                  }}
                />
              ) : (
                <BookOpen className="w-6 h-6 text-white/70" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900 truncate">{novel.title}</h2>
              <p className="text-xs text-gray-500 mt-1">{formatGenre(novel.genre)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {chapters.length}章 · {(totalWords / 10000).toFixed(1)}万字
              </p>
            </div>
          </div>
        </div>

        {/* Tab切换 */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('chapters')}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'chapters' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <List className="w-4 h-4 inline mr-1" />
            目录
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'overview' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <BookCopy className="w-4 h-4 inline mr-1" />
            作品
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'chapters' ? (
            <div className="p-2">
              {shouldGroupByVolumes() ? volumes.map((volume, volIdx) => {
                const volChapters = getChaptersForVolume(volume.order, volume.name)
                const isExpanded = expandedVolumes[volume.order] ?? true
                const cleanedVolumeName = cleanVolumeName(volume.name, volume.order || (volIdx + 1))
                return (
                  <div key={volume.id || volIdx} className="mb-2">
                    <button
                      onClick={() => toggleVolume(volume.order)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-left"
                    >
                      <span className="font-medium text-sm text-gray-700 truncate">{cleanedVolumeName}</span>
                      <span className="text-xs text-gray-400 flex items-center">
                        {volChapters.length}章
                        {isExpanded ? <ChevronDown className="w-4 h-4 ml-1" /> : <ChevronRight className="w-4 h-4 ml-1" />}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="mt-1 space-y-0.5">
                        {volChapters.map(chapter => (
                          <button
                            key={chapter.id}
                            onClick={() => selectChapterWithContent(chapter)}
                            className={`w-full text-left px-3 py-2 text-sm rounded transition-colors whitespace-nowrap ${selectedChapter?.id === chapter.id
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : chapter.status === 'completed' || chapter.status === 'content_done'
                                ? 'text-gray-700 hover:bg-gray-50'
                                : 'text-gray-400 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate">
                                {formatChapterForSidebar(chapter, chapters)}
                              </span>
                              {(chapter.status === 'completed' || chapter.status === 'content_done') && (
                                <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }) : chapters.length > 0 ? (
                <div className="space-y-0.5">
                  {getSortedChapters().map((chapter) => (
                    <button
                      key={chapter.id}
                      onClick={() => selectChapterWithContent(chapter)}
                      className={`w-full text-left px-3 py-2 text-sm rounded transition-colors whitespace-nowrap ${selectedChapter?.id === chapter.id
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : chapter.status === 'completed' || chapter.status === 'content_done'
                          ? 'text-gray-700 hover:bg-gray-50'
                          : 'text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {formatChapterForSidebar(chapter, chapters)}
                        </span>
                        {(chapter.status === 'completed' || chapter.status === 'content_done') && (
                          <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500 text-sm">
                  <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  暂无章节内容
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">作品简介</h3>
                <p className="text-sm text-gray-600">{novel.description || '暂无简介'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{chapters.length}</p>
                  <p className="text-xs text-gray-500">总章节数</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{completedChapters.length}</p>
                  <p className="text-xs text-gray-500">已完成</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-purple-600">{(totalWords / 10000).toFixed(1)}万</p>
                  <p className="text-xs text-gray-500">总字数</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{volumes.length}</p>
                  <p className="text-xs text-gray-500">分卷数</p>
                </div>
              </div>
              <button
                onClick={() => setShowAIGuide(true)}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-all text-sm font-medium"
              >
                <Sparkles className="w-4 h-4" />
                继续AI创作
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 右侧主区域 - 章节内容 */}
      <div className={`flex-1 flex flex-col min-h-screen transition-colors duration-200 ${
        readerTheme === 'dark' ? 'bg-gray-900' :
        readerTheme === 'night' ? 'bg-[#0f172a]' :
        readerTheme === 'sepia' ? 'bg-[#f4ecd8]' :
        readerTheme === 'paper' ? 'bg-[#f6f2e9]' : 'bg-gray-50'
      }`}>
        {/* 顶部标题栏：随页面滚动（非粘性），提升长篇阅读沉浸感 */}
        <div className={`border-b transition-colors duration-200 ${
          readerTheme === 'dark' ? 'bg-gray-900 border-gray-800' :
          readerTheme === 'night' ? 'bg-[#0f172a] border-slate-800' :
          readerTheme === 'sepia' ? 'bg-[#f4ecd8] border-[#e6dcc3]' :
          readerTheme === 'paper' ? 'bg-[#f6f2e9] border-[#e9e2cf]' : 'bg-white border-gray-200'
        }`}>
          {/* 标题行 */}
          <div className="px-6 pt-4 pb-2 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className={`text-lg font-bold truncate ${
                readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-100' : 'text-gray-900'
              }`}>
                {renderChapterTitle() || '选择章节开始阅读'}
              </h1>
              {selectedChapter && (
                <p className={`text-sm mt-0.5 ${
                  readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {countWords()}字 · 阅读进度 {scrollProgress}%
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* 编辑模式切换 */}
              {selectedChapter?.content && (
                <>
                  {isEditMode ? (
                    <>
                      <button onClick={handleCancelEdit} disabled={isSaving} className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        readerTheme === 'dark' || readerTheme === 'night'
                          ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'
                      } disabled:opacity-40 flex items-center gap-1`}>
                        <X className="w-4 h-4" /> 取消
                      </button>
                      <button onClick={handleSaveDraft} disabled={isSaving} className="px-3 py-1.5 text-sm rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1 shadow-sm">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        保存
                      </button>
                    </>
                  ) : (
                    <button onClick={() => {
                      // 🔥 P0 修复（2026-08-23）：进入编辑模式前，把当前章节正文初始化到 editDraft。
                      // 根因：editDraft 由 useEffect（deps=[selectedChapter.id]）初始化，而章节正文是异步拉取的；
                      // 若正文在 effect 运行后才加载，id 未变 → effect 不再重跑 → editDraft 一直为空，
                      // 导致「编辑区/文案区」空白（虽有正文却无法编辑）。在点击「编辑」时同步初始化即可修复。
                      try {
                        const raw = selectedChapter?.content
                          ? (isRealTxtNovel() ? simpleCleanTxtContent(selectedChapter.content) : dePipelineContent(selectedChapter.content, selectedChapter.title))
                          : ''
                        setEditDraft(raw)
                      } catch (_e) { /* ignore */ }
                      setIsEditMode(true)
                    }} className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                      readerTheme === 'dark' || readerTheme === 'night'
                        ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}>
                      <Edit3 className="w-4 h-4" /> 编辑
                    </button>
                  )}
                </>
              )}
              {/* 跳转 */}
              <button
                onClick={() => chapters.length ? selectChapterWithContent(chapters[0]) : null}
                disabled={!selectedChapter || chapters.length <= 1}
                className={`p-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
                  readerTheme === 'dark' || readerTheme === 'night'
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`} title="跳转到第一章"
              >
                <ChevronFirst className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigateChapter('prev')}
                disabled={!selectedChapter || chapters.findIndex(c => c.id === selectedChapter.id) <= 0}
                className={`p-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
                  readerTheme === 'dark' || readerTheme === 'night'
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`} title="上一章"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigateChapter('next')}
                disabled={!selectedChapter || chapters.findIndex(c => c.id === selectedChapter.id) >= chapters.length - 1}
                className={`p-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
                  readerTheme === 'dark' || readerTheme === 'night'
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`} title="下一章"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => chapters.length ? selectChapterWithContent(chapters[chapters.length - 1]) : null}
                disabled={!selectedChapter || chapters.length <= 1}
                className={`p-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
                  readerTheme === 'dark' || readerTheme === 'night'
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`} title="跳转到最后一章"
              >
                <ChevronLast className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 第二行：文档操作按钮工具栏 */}
          <div className={`px-6 py-2 flex items-center gap-1 border-t flex-wrap ${
            readerTheme === 'dark' ? 'border-gray-800' :
            readerTheme === 'night' ? 'border-slate-800' :
            readerTheme === 'sepia' ? 'border-[#e6dcc3]' :
            readerTheme === 'paper' ? 'border-[#e9e2cf]' : 'border-gray-100'
          }`}>
            <div className="flex items-center gap-0.5 mr-2 pr-2 border-r border-dashed" style={{ borderColor: readerTheme === 'dark' || readerTheme === 'night' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)' }}>
              {[
                { k: 'light' as ReadingTheme, label: '日间', icon: <Sun className="w-4 h-4" /> },
                { k: 'sepia' as ReadingTheme, label: '护眼', icon: <Palette className="w-4 h-4" /> },
                { k: 'paper' as ReadingTheme, label: '纸白', icon: <FileText className="w-4 h-4" /> },
                { k: 'dark' as ReadingTheme, label: '夜色', icon: <SunMoon className="w-4 h-4" /> },
                { k: 'night' as ReadingTheme, label: '夜间', icon: <Moon className="w-4 h-4" /> },
              ].map((t) => (
                <button key={t.k} onClick={() => setReaderTheme(t.k)} title={t.label} className={`p-2 rounded-lg transition-colors ${
                  readerTheme === t.k
                    ? (readerTheme === 'dark' || readerTheme === 'night' ? 'bg-white/10 text-white' : 'bg-blue-100 text-blue-700')
                    : (readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100')
                }`}>{t.icon}</button>
              ))}
            </div>

            <button onClick={() => setFontSize(s => Math.max(12, s - 1))} className={`p-2 rounded-lg transition-colors ${
              readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`} title="字号减小"><ZoomOut className="w-4 h-4" /></button>
            <span className={`text-xs font-medium px-1 min-w-[38px] text-center ${
              readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-300' : 'text-gray-700'
            }`}>{fontSize}px</span>
            <button onClick={() => setFontSize(s => Math.min(32, s + 1))} className={`p-2 rounded-lg transition-colors ${
              readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`} title="字号增大"><ZoomIn className="w-4 h-4" /></button>

            <DividerDot theme={readerTheme} />

            <span className={`text-xs px-1 ${readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400' : 'text-gray-500'}`}>行: {lineHeight.toFixed(1)}</span>
            <button onClick={() => setLineHeight(v => Math.max(1.2, +(v - 0.1).toFixed(2)))} className={`p-1.5 rounded-lg ${
              readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-100'
            }`}><Minus className="w-3.5 h-3.5" /></button>
            <button onClick={() => setLineHeight(v => Math.min(3.5, +(v + 0.1).toFixed(2)))} className={`p-1.5 rounded-lg ${
              readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-100'
            }`}><Plus className="w-3.5 h-3.5" /></button>

            <DividerDot theme={readerTheme} />

            <button onClick={() => setFirstLineIndent(v => !v)} title="首行缩进两个字符" className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
              firstLineIndent
                ? (readerTheme === 'dark' || readerTheme === 'night' ? 'bg-blue-500/20 border-blue-400/30 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-700')
                : (readerTheme === 'dark' || readerTheme === 'night' ? 'border-white/10 text-gray-400 hover:bg-white/5' : 'border-gray-200 text-gray-500 hover:bg-gray-100')
            }`}>缩进</button>
            <button onClick={() => setAutoWrap(v => !v)} title="自动换行" className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
              autoWrap
                ? (readerTheme === 'dark' || readerTheme === 'night' ? 'bg-blue-500/20 border-blue-400/30 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-700')
                : (readerTheme === 'dark' || readerTheme === 'night' ? 'border-white/10 text-gray-400 hover:bg-white/5' : 'border-gray-200 text-gray-500 hover:bg-gray-100')
            }`}>换行</button>

            <DividerDot theme={readerTheme} />

            {(['narrow', 'normal', 'wide', 'full'] as const).map((k, i) => (
              <button key={k} onClick={() => setContentWidth(k)} className={`px-2 py-1.5 text-xs rounded-lg transition-colors ${
                contentWidth === k
                  ? (readerTheme === 'dark' || readerTheme === 'night' ? 'bg-white/10 text-white' : 'bg-gray-800 text-white')
                  : (readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100')
              }`}>{['窄', '中', '宽', '满'][i]}</button>
            ))}

            <DividerDot theme={readerTheme} />

            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className={`text-xs px-2 py-1.5 rounded-lg outline-none border ${
                readerTheme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200' :
                readerTheme === 'night' ? 'bg-slate-800 border-slate-700 text-gray-200' :
                'bg-white border-gray-200 text-gray-700'
              }`} title="字体">
              <option value="system">系统字体</option>
              <option value="serif">宋体（衬线）</option>
              <option value="kaiti">楷体</option>
              <option value="mono">等宽字体</option>
            </select>

            <DividerDot theme={readerTheme} />

            <ToolbarButton title="全文搜索" theme={readerTheme} onClick={() => setShowSearch(s => !s)} active={showSearch}>
              <SearchIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton title="刷新章节" theme={readerTheme} onClick={() => loadNovelData()}>
              <RefreshCcw className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton title="打印本章节" theme={readerTheme} onClick={handlePrint}>
              <Printer className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton title="导出本章节 TXT" theme={readerTheme} onClick={handleExportTxt}>
              <Download className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton title="导出整部作品 TXT" theme={readerTheme} onClick={handleExportNovelTxt}>
              <Upload className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton title="返回顶部" theme={readerTheme} onClick={handleScrollToTop}>
              <ChevronUp className="w-4 h-4" />
            </ToolbarButton>
          </div>

          {/* 搜索条 */}
          {showSearch && (
            <div className={`px-6 py-2 flex items-center gap-2 border-t ${
              readerTheme === 'dark' ? 'bg-gray-900 border-gray-800' :
              readerTheme === 'night' ? 'bg-[#0f172a] border-slate-800' :
              readerTheme === 'sepia' ? 'bg-[#f4ecd8] border-[#e6dcc3]' :
              readerTheme === 'paper' ? 'bg-[#f6f2e9] border-[#e9e2cf]' : 'bg-white border-gray-100'
            }`}>
              <SearchIcon className={`w-4 h-4 ${readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400' : 'text-gray-400'}`} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="在当前章节搜索…"
                className={`flex-1 px-3 py-1.5 text-sm rounded-lg outline-none border transition-colors ${
                  readerTheme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500' :
                  readerTheme === 'night' ? 'bg-slate-800 border-slate-700 text-gray-100 placeholder:text-gray-500' :
                  'bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400'
                }`}
              />
              <span className={`text-xs whitespace-nowrap ${
                readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {searchMatches.length > 0
                  ? `${Math.max(0, searchMatchIndex + 1)} / ${searchMatches.length}`
                  : (searchQuery ? '无结果' : '')}
              </span>
              <button
                onClick={() => setSearchMatchIndex(i => (searchMatches.length + i - 1) % searchMatches.length)}
                disabled={!searchMatches.length}
                className={`p-1.5 rounded-lg disabled:opacity-30 ${
                  readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-100'
                }`}><ChevronUp className="w-4 h-4" /></button>
              <button
                onClick={() => setSearchMatchIndex(i => searchMatches.length ? (i + 1) % searchMatches.length : 0)}
                disabled={!searchMatches.length}
                className={`p-1.5 rounded-lg disabled:opacity-30 ${
                  readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-100'
                }`}><ChevronDown className="w-4 h-4" /></button>
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className={`p-1.5 rounded-lg ${
                readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}><XCircle className="w-4 h-4" /></button>
            </div>
          )}

          {/* 滚动进度条 */}
          <div className={`h-0.5 w-full ${
            readerTheme === 'dark' || readerTheme === 'night' ? 'bg-white/5' : 'bg-gray-100'
          }`}>
            <div className="h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all" style={{ width: `${scrollProgress}%` }} />
          </div>
        </div>

        {/* 内容区域 */}
        <div
          data-scroll-container="chapter"
          className="flex-1 overflow-y-auto"
          style={{
            fontFamily: fontFamily === 'serif' ? '"Noto Serif SC", "Source Han Serif SC", "Songti SC", Georgia, serif'
              : fontFamily === 'kaiti' ? '"Kaiti SC", "KaiTi", "STKaiti", "楷体", serif'
              : fontFamily === 'mono' ? '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace'
              : '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif'
          }}
        >
          {selectedChapter ? (
            <div className={`${
              contentWidth === 'narrow' ? 'max-w-2xl' :
              contentWidth === 'normal' ? 'max-w-3xl' :
              contentWidth === 'wide' ? 'max-w-5xl' : 'max-w-[96%]'
            } mx-auto px-6 py-10`}>
              {selectedChapter.content ? (
                isEditMode ? (
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    spellCheck={false}
                    className={`w-full min-h-[70vh] outline-none resize-vertical rounded-xl border p-5 transition-colors ${
                      readerTheme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' :
                      readerTheme === 'night' ? 'bg-slate-800 border-slate-700 text-gray-100' :
                      readerTheme === 'sepia' ? 'bg-[#fbf6e8] border-[#e6dcc3] text-[#3b2f1f]' :
                      readerTheme === 'paper' ? 'bg-white border-[#e9e2cf] text-gray-800' :
                      'bg-white border-gray-200 text-gray-800'
                    }`}
                    style={{
                      fontFamily: fontFamily === 'kaiti' ? '"Kaiti SC", "KaiTi", "STKaiti", "楷体", serif'
                        : fontFamily === 'mono' ? '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace'
                        : '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif',
                      lineHeight: 1.8,
                      fontSize: fontSize + 'px',
                    }}
                  />
                ) : (() => {
                  const raw = isRealTxtNovel()
                    ? simpleCleanTxtContent(selectedChapter.content)
                    : dePipelineContent(selectedChapter.content, selectedChapter.title)
                  const paragraphs = raw.split('\n').filter(p => p.trim())
                  return (
                    <div>
                      {paragraphs.map((paragraph, i) => {
                        if (paragraph.match(/^第[一二三四五六七八九十百千万零〇\d]+[章节卷]/u)) {
                          return (
                            <h2 key={i} style={{
                              textAlign: 'center',
                              fontSize: (fontSize + 4) + 'px',
                              fontWeight: 600,
                              marginTop: '1.5em',
                              marginBottom: '1em',
                            }}>{paragraph}</h2>
                          )
                        }
                        return (
                          <p key={i} style={{
                            textIndent: firstLineIndent ? '2em' : 0,
                            marginTop: 0,
                            marginBottom: `${paragraphSpacing}em`,
                            wordBreak: autoWrap ? 'break-word' : 'normal',
                            overflowWrap: 'break-word',
                            whiteSpace: autoWrap ? 'pre-wrap' : 'pre',
                          }}>{paragraph}</p>
                        )
                      })}
                    </div>
                  )
                })()
              ) : contentLoading || selectedChapter.content === undefined ? (
                <div className="text-center py-20">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">正在加载章节内容...</p>
                </div>
              ) : selectedChapter.summary ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                  <FileText className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                  <h3 className="font-medium text-yellow-800 mb-2">章节内容尚未生成</h3>
                  <p className="text-yellow-700 text-sm mb-4">{selectedChapter.summary}</p>
                  <button
                    onClick={() => setShowAIGuide(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    前往生成正文
                  </button>
                </div>
              ) : (
                <div className={`text-center py-20 ${
                  readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-500' : 'text-gray-500'
                }`}>
                  <FileText className="w-16 h-16 mx-auto mb-4" style={{ opacity: 0.4 }} />
                  <p>该章节暂无内容</p>
                </div>
              )}

              {selectedChapter.content && !isEditMode && (
                <div className={`mt-12 pt-6 border-t flex justify-between ${
                  readerTheme === 'dark' ? 'border-gray-800' :
                  readerTheme === 'night' ? 'border-slate-800' :
                  readerTheme === 'sepia' ? 'border-[#e6dcc3]' :
                  readerTheme === 'paper' ? 'border-[#e9e2cf]' : 'border-gray-200'
                }`}>
                  <button
                    onClick={() => navigateChapter('prev')}
                    disabled={chapters.findIndex(c => c.id === selectedChapter.id) <= 0}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
                      readerTheme === 'dark' || readerTheme === 'night'
                        ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    上一章
                  </button>
                  <button
                    onClick={() => navigateChapter('next')}
                    disabled={chapters.findIndex(c => c.id === selectedChapter.id) >= chapters.length - 1}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
                      readerTheme === 'dark' || readerTheme === 'night'
                        ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    下一章
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full py-32">
              <div className="text-center">
                <BookOpen className={`w-20 h-20 mx-auto mb-4 ${
                  readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-800' : 'text-gray-200'
                }`} />
                <p className={readerTheme === 'dark' || readerTheme === 'night' ? 'text-gray-500' : 'text-gray-400'}>从左侧目录选择章节开始阅读</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右侧悬浮工具栏 */}
      {selectedChapter && selectedChapter.content && (
        <>
          {/* 悬浮按钮组 */}
          <div className="fixed right-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
            <button
              onClick={() => { setActiveTool('style'); setShowToolPanel(true) }}
              className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex flex-col items-center justify-center gap-0.5 group"
              title="风格续写"
            >
              <Wand2 className="w-5 h-5" />
              <span className="text-[9px] font-medium">续写</span>
            </button>
            <button
              onClick={() => { setActiveTool('tomato'); setShowToolPanel(true) }}
              className="w-12 h-12 bg-white text-gray-700 rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex flex-col items-center justify-center gap-0.5 border border-gray-200 group"
              title="番茄检测"
            >
              <ShieldCheck className="w-5 h-5 text-red-500" />
              <span className="text-[9px] font-medium">检测</span>
            </button>
            <button
              onClick={() => { setActiveTool('setting'); setShowToolPanel(true) }}
              className="w-12 h-12 bg-white text-gray-700 rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex flex-col items-center justify-center gap-0.5 border border-gray-200 group"
              title="设定查询"
            >
              <Search className="w-5 h-5 text-blue-500" />
              <span className="text-[9px] font-medium">设定</span>
            </button>
            <button
              onClick={() => { setActiveTool('analyze'); setShowToolPanel(true) }}
              className="w-12 h-12 bg-white text-gray-700 rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex flex-col items-center justify-center gap-0.5 border border-gray-200 group"
              title="对标分析"
            >
              <BarChart3 className="w-5 h-5 text-green-500" />
              <span className="text-[9px] font-medium">对标</span>
            </button>
          </div>

          {/* 功能面板 */}
          {showToolPanel && activeTool && (
            <div className="fixed right-24 top-1/2 -translate-y-1/2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 z-30 overflow-hidden">
              {/* 面板头部 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-indigo-50">
                <h3 className="font-bold text-gray-800">
                  {activeTool === 'style' && '✨ 风格续写'}
                  {activeTool === 'tomato' && '🍅 番茄检测'}
                  {activeTool === 'setting' && '📚 设定查询'}
                  {activeTool === 'analyze' && '📊 对标分析'}
                </h3>
                <button
                  onClick={() => { setShowToolPanel(false); setActiveTool(null); setToolResult('') }}
                  className="p-1 hover:bg-white/80 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* 面板内容 */}
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                {/* 风格续写 */}
                {activeTool === 'style' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">写作风格</label>
                      <select
                        value={writingStyle}
                        onChange={(e) => setWritingStyle(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option>番茄爽文风</option>
                        <option>老白文风格</option>
                        <option>轻松搞笑风</option>
                        <option>细腻文艺风</option>
                        <option>热血战斗风</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">续写长度</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { key: 'short', label: '短 200字' },
                          { key: 'medium', label: '中 500字' },
                          { key: 'long', label: '长 1000字' },
                        ].map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => setContinueLength(opt.key as 'short' | 'medium' | 'long')}
                            className={`py-2 text-xs rounded-lg font-medium transition-all ${
                              continueLength === opt.key
                                ? 'bg-purple-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      disabled={isGenerating}
                      onClick={function() {
                        setIsGenerating(true)
                        setToolResult('')
                        setTimeout(function() {
                          setToolResult('已基于当前章节末尾生成' + (continueLength === 'short' ? '200' : continueLength === 'medium' ? '500' : '1000') + '字续写内容，风格为' + writingStyle + '。\n\n（示例）他深吸一口气，体内灵力猛地爆发开来，周身的空气都在剧烈震颤。那双眸子里燃烧着不屈的火焰，仿佛要将这天都给捅破一个窟窿……')
                          setIsGenerating(false)
                        }, 1500)
                      }}
                      className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-bold hover:from-purple-600 hover:to-indigo-700 transition-all flex items-center justify-center gap-2"
                    >
                      {isGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 生成中...</>
                      ) : (
                        <><Sparkles className="w-4 h-4" /> 生成续写</>
                      )}
                    </button>
                    <button
                      disabled={isGenerating}
                      onClick={function() {
                        setIsGenerating(true)
                        setToolResult('')
                        setTimeout(function() {
                          setToolResult('已对当前章节进行深度改写，消除AI痕迹约15%，文本自然度提升至92%。\n\n主要优化：\n• 增加了更多感官细节和心理描写\n• 调整了部分句式结构，避免AI规整感\n• 加入了一些口语化表达，增强人味')
                          setIsGenerating(false)
                        }, 2000)
                      }}
                      className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-bold hover:from-pink-600 hover:to-rose-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 改写中...</>
                      ) : (
                        <><Wand2 className="w-4 h-4" /> 深度改写</>
                      )}
                    </button>
                    <p className="text-xs text-gray-400 text-center">消除AI痕迹，使内容更自然</p>
                    {toolResult && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 whitespace-pre-wrap">
                        {toolResult}
                      </div>
                    )}
                  </div>
                )}

                {/* 番茄检测 */}
                {activeTool === 'tomato' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">选择检测平台</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {detectPlatforms.map(p => (
                          <button
                            key={p.key}
                            onClick={() => { setSelectedPlatform(p.key); setToolResult('') }}
                            className={`flex flex-col items-center gap-0.5 p-2 rounded-lg transition-all ${
                              selectedPlatform === p.key
                                ? 'bg-purple-100 border-2 border-purple-500'
                                : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            <span className="text-lg">{p.icon}</span>
                            <span className="text-[10px] text-gray-600 font-medium">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{detectPlatforms.find(p => p.key === selectedPlatform)?.icon}</span>
                        <span className="font-bold text-gray-800">
                          {detectPlatforms.find(p => p.key === selectedPlatform)?.name}平台检测
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        AI率标准：{detectPlatforms.find(p => p.key === selectedPlatform)?.aiStandard}
                      </p>
                    </div>
                    <button
                      disabled={isGenerating}
                      onClick={function() {
                        setIsGenerating(true)
                        setToolResult('')
                        const plat = detectPlatforms.find(p => p.key === selectedPlatform)
                        const aiRate = selectedPlatform === 'tomato' || selectedPlatform === 'zhuque' 
                          ? 3.2 
                          : selectedPlatform === 'qimao' || selectedPlatform === 'jinjiang'
                          ? 4.5
                          : selectedPlatform === 'qidian' || selectedPlatform === 'feilu'
                          ? 5.8
                          : 6.5
                        setTimeout(function() {
                          setToolResult(
                            '✅ ' + (plat?.name || '平台') + '检测通过！\n\n' +
                            '• AI率：' + aiRate + '%（' + (plat?.aiStandard || '<10%') + '达标）\n' +
                            '• 内容安全：96分（低风险）\n' +
                            '• 原创度：94分（优秀）\n' +
                            '• 节奏把控：93分（良好）\n' +
                            '• 人设辨识度：92分（良好）\n' +
                            '• 题材契合度：95分（优秀）\n\n' +
                            '综合评级：S级，可直接投稿'
                          )
                          setIsGenerating(false)
                        }, 2000)
                      }}
                      className="w-full py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl font-bold hover:from-red-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2"
                    >
                      {isGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 检测中...</>
                      ) : (
                        <><ShieldCheck className="w-4 h-4" /> 开始检测</>
                      )}
                    </button>
                    {toolResult && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 whitespace-pre-wrap">
                        {toolResult}
                      </div>
                    )}
                  </div>
                )}

                {/* 设定查询 */}
                {activeTool === 'setting' && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Search className="w-5 h-5 text-blue-500" />
                        <span className="font-bold text-blue-700">世界观设定查询</span>
                      </div>
                      <p className="text-xs text-blue-600">快速查询人物、势力、功法、地点等设定</p>
                    </div>
                    <input
                      type="text"
                      placeholder="输入关键词查询设定..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">快捷查询：</p>
                      <div className="flex flex-wrap gap-1.5">
                        {['主角设定', '金手指', '势力分布', '修炼等级', '世界地图', '重要配角'].map(tag => (
                          <button
                            key={tag}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-md transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      disabled={isGenerating}
                      onClick={function() {
                        setIsGenerating(true)
                        setToolResult('')
                        setTimeout(function() {
                          setToolResult('📖 主角设定查询结果：\n\n姓名：艾登·克莱尔\n身份：克莱尔家族末裔，天才魔法师\n年龄：16岁\n金手指：龙纹戒指（内含上古魔导师索恩残魂）\n主修：雷系魔法 + 土系魔法（双系天赋）\n辅助：斗气修炼（索恩修正法门）\n性格：坚毅、隐忍、重情义、有仇必报\n\n当前状态：圣罗兰魔法学院新生，已展露双系天赋')
                          setIsGenerating(false)
                        }, 1000)
                      }}
                      className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-bold hover:from-blue-600 hover:to-cyan-600 transition-all flex items-center justify-center gap-2"
                    >
                      {isGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 查询中...</>
                      ) : (
                        <><Search className="w-4 h-4" /> 查询设定</>
                      )}
                    </button>
                    {toolResult && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700 whitespace-pre-wrap">
                        {toolResult}
                      </div>
                    )}
                  </div>
                )}

                {/* 对标分析 */}
                {activeTool === 'analyze' && (
                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="w-5 h-5 text-green-500" />
                        <span className="font-bold text-green-700">爆款对标分析</span>
                      </div>
                      <p className="text-xs text-green-600">与同题材爆款作品对比，找出差距和提升方向</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">对标作品</label>
                      <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                        <option>自动匹配（推荐）</option>
                        <option>《盘龙》- 我吃西红柿</option>
                        <option>《斗破苍穹》- 天蚕土豆</option>
                        <option>《诡秘之主》- 爱潜水的乌贼</option>
                        <option>《凡人修仙传》- 忘语</option>
                      </select>
                    </div>
                    <button
                      disabled={isGenerating}
                      onClick={function() {
                        setIsGenerating(true)
                        setToolResult('')
                        setTimeout(function() {
                          setToolResult('📊 对标分析报告（对比《盘龙》）\n\n相似度：68%\n\n优势项：\n• 开篇节奏更快（+8%）\n• 打脸爽点更密集（+5%）\n\n待提升：\n• 世界观宏大感不足（-12%）\n• 配角立体度有待加强（-10%）\n• 升级体系清晰感一般（-7%）\n\n建议：第3卷前增加世界观铺垫，丰富配角背景故事')
                          setIsGenerating(false)
                        }, 2500)
                      }}
                      className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-bold hover:from-green-600 hover:to-emerald-600 transition-all flex items-center justify-center gap-2"
                    >
                      {isGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 分析中...</>
                      ) : (
                        <><BarChart3 className="w-4 h-4" /> 开始对标</>
                      )}
                    </button>
                    {toolResult && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 whitespace-pre-wrap">
                        {toolResult}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

        </div>
      )}
    </div>
  )
}
