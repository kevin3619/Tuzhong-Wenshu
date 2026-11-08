'use client'

import { useState, useEffect, useRef } from 'react'
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
import {
  applyPreferencesToLocalStorage,
  fetchServerPreferences,
  getLocalPrefsUpdatedAt,
  getLocalZhuqueApiKey,
  pushServerPreferences,
  resolveStyleId,
  resolveStyleName,
} from '@/lib/user-preferences-client'

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
  const [coverZoomOpen, setCoverZoomOpen] = useState<boolean>(false)

  // 封面灯箱：ESC 关闭 + 锁定背景滚动
  useEffect(() => {
    if (!coverZoomOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCoverZoomOpen(false) }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [coverZoomOpen])

  // 正文编辑模式 + 临时内容
  const [isEditMode, setIsEditMode] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  // 🔥 修复（P0 正文被覆盖/丢稿）：草稿基线 + 切章序号。旧实现把「上一章」的异步正文
  //   写进「当前选中章节」，用户一保存就把新章节原稿覆盖；且切章/刷新无脏值守卫。
  const draftBaselineRef = useRef('')
  const editDraftRef = useRef('')
  const chapterSwitchSeqRef = useRef(0)
  useEffect(function () { editDraftRef.current = editDraft }, [editDraft])
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
        if (prefs.writingStyle) queueMicrotask(function () { setWritingStyle(resolveStyleName(String(prefs.writingStyle))) })
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

    // 🔥 2026-10-20：账号级偏好同步——换浏览器/设备登录后仍能拿到已保存的风格与平台标准
    fetchServerPreferences().then(function (res) {
      if (!res || !res.data) return
      if (res.updatedAt < getLocalPrefsUpdatedAt()) return
      applyPreferencesToLocalStorage(res.data, res.updatedAt)
      applyDetectPlatformsFromLocal()
      const d = res.data as Record<string, any>
      if (d.writingStyle) queueMicrotask(function () { setWritingStyle(resolveStyleName(String(d.writingStyle))) })
      if (d.continuationLength) {
        const lenMap: Record<string, 'short' | 'medium' | 'long'> = { short: 'short', medium: 'medium', long: 'long' }
        const v = lenMap[String(d.continuationLength)]
        if (v) queueMicrotask(function () { setContinueLength(v) })
      }
    }).catch(function () { /* 离线时继续用本机缓存 */ })
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
    } catch (e) { console.error('[write] 保存阅读偏好失败:', e) }
  }, [readerTheme, fontFamily, fontSize, lineHeight, paragraphSpacing, contentWidth, firstLineIndent, autoWrap])

  const [showToolPanel, setShowToolPanel] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)

  const [showAIGuide, setShowAIGuide] = useState(false)
  const [writingStyle, setWritingStyle] = useState('番茄爽文风')
  const [continueLength, setContinueLength] = useState<'short' | 'medium' | 'long'>('medium')
  const [isGenerating, setIsGenerating] = useState(false)
  const [toolResult, setToolResult] = useState<string>('')
  // ============================================================
  // 🔥 修复（P1 假功能）：右侧「风格续写 / 深度改写」此前是 setTimeout + 写死的示例文本
  //   （甚至自称「消除AI痕迹约15%，自然度提升至92%」），用户会误以为 AI 真的分析了自己的书。
  //   现改为真实调用后端接口；模型不可用时直接报错，绝不编造结果。
  // ============================================================
  const [toolBusy, setToolBusy] = useState(false)
  const [toolError, setToolError] = useState('')
  const [continueOptions, setContinueOptions] = useState<string[]>([])
  const [rewriteResult, setRewriteResult] = useState('')
  const [toolNotice, setToolNotice] = useState('')
  const [settingQuery, setSettingQuery] = useState('')

  async function aiPost(url: string, payload: Record<string, unknown>): Promise<Record<string, any>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    try {
      const t = typeof window !== 'undefined' ? (localStorage.getItem('token') || '') : ''
      if (t) headers.Authorization = 'Bearer ' + t
    } catch { /* 隐私模式退回 cookie 鉴权 */ }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
    const json = await res.json().catch(function () { return null })
    if (!res.ok) {
      if (res.status === 401) throw new Error('登录已过期，请重新登录')
      throw new Error((json && (json.error || json.message)) || ('服务返回 HTTP ' + res.status))
    }
    return (json && json.data) ? json.data : (json || {})
  }

  function toolSourceText(): string {
    if (isEditMode && editDraft) return editDraft
    return selectedChapter?.content || ''
  }

  async function handleRealContinue() {
    const src = toolSourceText()
    if (src.trim().length < 30) { setToolError('本章正文太短（不足 30 字），无法续写'); return }
    setToolBusy(true); setToolError(''); setToolNotice(''); setContinueOptions([]); setToolResult('')
    try {
      const data = await aiPost('/tuzhong-wenshu/api/ai/continue', {
        context: src.slice(-1800), style: writingStyle, length: continueLength,
      })
      const opts = Array.isArray(data.options) ? data.options.filter(function (o: unknown) { return typeof o === 'string' && (o as string).trim() }) : []
      if (!opts.length) throw new Error('模型未返回续写内容（请检查 AI 模型配置）')
      setContinueOptions(opts)
      setToolNotice('已生成 ' + opts.length + ' 个续写方向，可追加到本章末尾')
    } catch (e) { setToolError('续写失败：' + ((e as Error)?.message || String(e))) } finally { setToolBusy(false) }
  }

  async function handleRealRewrite() {
    const src = toolSourceText()
    if (src.trim().length < 30) { setToolError('本章正文太短（不足 30 字），无法改写'); return }
    setToolBusy(true); setToolError(''); setToolNotice(''); setToolResult(''); setRewriteResult('')
    try {
      const data = await aiPost('/tuzhong-wenshu/api/ai/rewrite', { text: src, style: 'fanqie', intensity: 'medium' })
      const out = String(data.rewrittenText || '').trim()
      if (!out) throw new Error('模型未返回改写结果')
      setRewriteResult(out)
      setToolNotice(String(data.llmWarning || '') || '改写完成，可一键替换草稿')
    } catch (e) { setToolError('改写失败：' + ((e as Error)?.message || String(e))) } finally { setToolBusy(false) }
  }

  function applyContinueToDraft(text: string) {
    const base = toolSourceText()
    setEditDraft(base ? base + '\n\n' + text : text)
    editDraftRef.current = base ? base + '\n\n' + text : text
    setIsEditMode(true)
    setToolNotice('已追加到正文末尾并进入编辑模式，点「保存」才会写库')
  }

  const settingsBundleRef = useRef<{ novelId: string; characters: any[]; world: unknown } | null>(null)

  async function loadSettingsBundle() {
    if (settingsBundleRef.current && settingsBundleRef.current.novelId === novelId) return settingsBundleRef.current
    const grab = async function (url: string) {
      try {
        const r = await fetch(url)
        if (!r.ok) return null
        const j = await r.json()
        return j && j.data !== undefined ? j.data : j
      } catch { return null }
    }
    const qs = 'novelId=' + encodeURIComponent(novelId || '')
    const [ch, world] = await Promise.all([grab('/tuzhong-wenshu/api/characters?' + qs), grab('/tuzhong-wenshu/api/settings?' + qs)])
    const characters = Array.isArray(ch) ? ch : (ch && Array.isArray((ch as any).characters) ? (ch as any).characters : [])
    const bundle = { novelId: novelId || '', characters, world }
    settingsBundleRef.current = bundle
    return bundle
  }

  function collectSettingLeaves(node: unknown, kw: string, cap: number, path = ''): string[] {
    const out: string[] = []
    const walk = function (v: unknown, p: string) {
      if (out.length >= cap) return
      if (typeof v === 'string') {
        const s = v.trim()
        if (s && (!kw || s.includes(kw) || p.includes(kw))) out.push((p ? p + '：' : '') + s.slice(0, 80))
        return
      }
      if (Array.isArray(v)) { v.forEach(function (x, i) { walk(x, p + '[' + i + ']') }); return }
      if (v && typeof v === 'object') Object.keys(v as Record<string, unknown>).forEach(function (k) { walk((v as Record<string, unknown>)[k], p ? p + '.' + k : k) })
    }
    walk(node, path)
    return out
  }

  async function handleSettingQuery(kw: string) {
    setToolBusy(true); setToolError(''); setToolResult('')
    try {
      const bundle = await loadSettingsBundle()
      const key = String(kw || '').trim()
      const body = toolSourceText()
      const lines: string[] = []
      const chars: any[] = bundle.characters
      if (chars.length) {
        const matched = chars.filter(function (c) {
          const name = String(c && (c.name || c.姓名) || '')
          if (!name) return false
          return key ? (name.includes(key) || JSON.stringify(c).includes(key)) : body.includes(name)
        }).slice(0, 10)
        lines.push(key ? ('【人物设定 · 命中 ' + matched.length + ' / 共 ' + chars.length + ' 人】') : ('【本章疑似出场人物 · ' + matched.length + ' / 共 ' + chars.length + ' 人】'))
        matched.forEach(function (c) {
          lines.push('• ' + [String(c.name || ''), String(c.title || c.role || ''), String(c.identity || ''), String(c.personality || '').slice(0, 30), String(c.relationshipWithProtagonist || '').slice(0, 30)].filter(Boolean).join('｜'))
        })
      }
      const leaves = collectSettingLeaves(bundle.world, key, 12)
      if (leaves.length) { lines.push(key ? '【世界观/设定命中】' : '【世界观设定摘要】'); leaves.forEach(function (l) { lines.push('• ' + l) }) }
      setToolResult(lines.length ? lines.join('\n') : (key ? ('设定库里没有匹配「' + key + '」的条目。') : '本作暂无可查询的设定数据。'))
    } catch (e) { setToolError('查询失败：' + ((e as Error)?.message || String(e))) } finally { setToolBusy(false) }
  }

  /**
   * 🔥 原「对标分析」返回写死的「对比《盘龙》相似度68%」——平台内没有这些书的正文，
   *   任何百分比都是编造的。改为只报当前正文真实算得出的指标。
   */
  function handleSelfCheck() {
    const src = toolSourceText()
    if (src.trim().length < 50) { setToolError('本章正文太短，无法统计'); return }
    setToolError(''); setToolResult('')
    const clean = src.replace(/\s+/g, '')
    const paras = src.split('\n').map(function (s) { return s.trim() }).filter(Boolean)
    const sents = src.split(/[。！？…]+/).map(function (s) { return s.trim() }).filter(function (s) { return s.length > 1 })
    const dialog = (src.match(/[「“"][^」”"]{2,}[」”"]/g) || []).join('')
    const dialogRatio = clean.length ? Math.round((dialog.replace(/\s+/g, '').length / clean.length) * 100) : 0
    const lens = paras.map(function (p) { return p.replace(/\s+/g, '').length })
    const mean = lens.reduce(function (a, b) { return a + b }, 0) / (lens.length || 1)
    const cv = mean ? Math.round(Math.sqrt(lens.reduce(function (a, b) { return a + (b - mean) * (b - mean) }, 0) / (lens.length || 1)) / mean * 100) : 0
    const banned = ['值得注意的是', '总而言之', '综上所述', '由此可见', '瞳孔骤缩', '倒吸一口凉气', '嘴角勾起一抹', '眼中闪过一丝']
      .map(function (w) { return { w: w, n: (src.match(new RegExp(w, 'g')) || []).length } }).filter(function (x) { return x.n > 0 })
    const lines = [
      '【本章真实指标】',
      '· 正文净字数：' + clean.length,
      '· 段落数：' + paras.length + '，平均段长：' + Math.round(mean) + ' 字',
      '· 平均句长：' + Math.round(clean.length / Math.max(1, sents.length)) + ' 字',
      '· 对话占比：' + dialogRatio + '%（平台参考 25%–35%）',
      '· 段长波动系数：' + cv + '%' + (cv < 25 ? '（偏均匀，节奏容易单调）' : '（有起伏）'),
      banned.length ? ('· AI 高频词命中：' + banned.map(function (x) { return x.w + '×' + x.n }).join('、')) : '· AI 高频词命中：0',
      '',
      '说明：不再提供与《盘龙》等作品「相似度」——平台内没有这些书的正文数据可比对。',
    ]
    setToolResult(lines.join('\n'))
  }

  function replaceDraftWithRewrite(text: string) {
    setEditDraft(text)
    editDraftRef.current = text
    setIsEditMode(true)
    setToolNotice('已用改写结果替换草稿（未保存），点「保存」写库')
  }
  const [selectedPlatform, setSelectedPlatform] = useState('tomato')

  // 进入编辑模式 / 切换章节时重置编辑草稿
  useEffect(() => {
    if (selectedChapter?.content) {
      const currentRaw = isRealTxtNovel() ? simpleCleanTxtContent(selectedChapter.content) : dePipelineContent(selectedChapter.content, selectedChapter.title)
      queueMicrotask(function () {
        setEditDraft(currentRaw)
        editDraftRef.current = currentRaw
        draftBaselineRef.current = currentRaw
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
      // 🔥 保存成功后刷新脏值基线，避免切章时误报「有未保存修改」
      draftBaselineRef.current = editDraft
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

  // 🔥 2026-10-18：「AI生成」按钮——按分卷/章节摘要整章重写（与生成向导同一条 ai-generate 精写链路）
  // 🔥 2026-10-18-2：目标字数自由输入 + 目标章节自由选择/批量（2 或 2-4 或 1,3,5）
  const [regenWordsInput, setRegenWordsInput] = useState('2500')
  const [regenChapterInput, setRegenChapterInput] = useState('1')
  const [regenElapsed, setRegenElapsed] = useState(0)
  const regenAbortRef = useRef<AbortController | null>(null)

  // 生成中计时（让等待状态可感知，不再"空转"）
  useEffect(() => {
    if (!isGenerating) return
    setRegenElapsed(0)
    const timer = setInterval(() => setRegenElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [isGenerating])

  // 解析章节规格：'3' / '3-5' / '1,3,5-6'
  function parseChapterList(spec: string): number[] {
    // 🔥 2026-11-01 支持「卷N」语法：一卷 60 章一键批量
    const volMatch = spec.trim().match(/^卷\s*(\d+)$/)
    if (volMatch) {
      const vo = Number(volMatch[1])
      const volList = chapters
        .filter(c => Number((c as any).volume) === vo)
        .map(c => Number((c as any).chapterNumber))
        .filter(n => n > 0)
        .sort((x: number, y: number) => x - y)
      if (volList.length) return volList.slice(0, 60)
    }
    const out: number[] = []
    for (const part of spec.split(/[,，\s]+/)) {
      if (!part) continue
      const m = part.match(/(\d+)\s*[-—~]\s*(\d+)/)
      if (m) {
        let a = Number(m[1]); let b = Number(m[2])
        if (a > b) { const t = a; a = b; b = t }
        for (let i = a; i <= b && i <= a + 59; i++) out.push(i)
      } else {
        const v = parseInt(part, 10)
        if (!isNaN(v)) out.push(v)
      }
    }
    // 🔥 2026-11-01 批量放宽：支持一卷 60 章批量（原 slice(0,10) 静默砍章是 60 章批量失败的首因）
    return Array.from(new Set(out)).slice(0, 60)
  }

  // 读取用户在「个人设置→平台AI检测配置」保存的平台标准，随生成请求上传（服务端注入引擎提示词+AI率闸门）
  function readPlatformStandards(): Array<{ name: string; aiStandard: string; criteria: string[] }> {
    try {
      let src: any[] = []
      const raw1 = localStorage.getItem('tuzhong-platform-configs')
      if (raw1) src = JSON.parse(raw1) || []
      if (!Array.isArray(src) || src.length === 0) {
        const prefsRaw = localStorage.getItem('tuzhong-preferences')
        if (prefsRaw) {
          const prefs = JSON.parse(prefsRaw)
          if (Array.isArray(prefs.platformConfigs)) src = prefs.platformConfigs
        }
      }
      return (Array.isArray(src) ? src : [])
        .filter((p: any) => p && p.enabled)
        .map((p: any) => ({
          name: (typeof p.name === 'string' && p.name) || '',
          aiStandard: (typeof p.aiStandard === 'string' && p.aiStandard) || '',
          criteria: Array.isArray(p.criteria) ? p.criteria.filter((c: any) => typeof c === 'string').slice(0, 4) : [],
        }))
    } catch (_e) { return [] }
  }

  // 🔥 单章生成辅助：返回 { zh, content }；错误直接抛出（批量循环里统一处理）
  async function regenOneChapter(tn: number, targetWords: number, signal: AbortSignal, prevEndingIn: string): Promise<{ zh: number; content: string }> {
    const chapter = chapters.find(c => Number((c as any).chapterNumber) === tn) as any
    if (!chapter) throw new Error('目录中没有第 ' + tn + ' 章')
    const curSummary = chapter.summary || (volumes.find(v => v.order === chapter.volume)?.summary || '')
    if (!curSummary) throw new Error('第 ' + tn + ' 章没有章节摘要，请先在设定中心补全章节大纲')
    const chIdx = chapters.findIndex(c => c.id === chapter.id)
    // 上一章结尾：外部传入（批量时沿用上一章产物；单章时由调用方传入）
    const prevData: any = {
      chapterNumber: tn,
      chapterTitle: chapter.title || ('第' + tn + '章'),
      corePlot: curSummary,
      shuangPoints: chapter.shuangPoints || '',
      prevEnding: prevEndingIn || '（新章开始）',
      prevChaptersSummary: chapters.filter((c, i) => i < chIdx)
        .map((c, i) => '第' + ((c as any).chapterNumber || i + 1) + '章《' + (c.title || '') + '》：' + (c.summary || '').slice(0, 40))
        .join('\n'),
      idea: { title: novel?.title || '', genre: novel?.genre || '' },
      synopsis: novel?.description || '',
      worldbuilding: {}, powerSystem: {}, characters: {}, outline: '', keyPlots: {},
      // 🔥 2026-10-22 跨章保护（与引擎闸门同口径）：
      //   引擎的「跨章撞句」防护依赖前文 n-gram 黑名单与上一章全文；
      //   应用内批量此前没传这两项 → 引擎的跨章保护形同虚设（实测相邻章撞句 36~44 处、词汇分布掉到 67）。
      //   这里把最近 3 章正文传过去，引擎据此自算公式句黑名单（batch 路径同源）。
      prevFullText: chapters.filter((c, i) => i < chIdx && i >= chIdx - 3)
        .map((c: any) => String((c as any).content || ''))
        .filter(Boolean)
        .join('\n'),
      // 卷/章摘要随卷传入（引擎的跨章口径与平台标准不依赖这里，仅作上下文）
      chapters: { volumes: volumes.map(v => ({ name: v.name, summary: v.summary, order: v.order })) },
    }
    const res = await fetch('/tuzhong-wenshu/api/ai-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: 'content',
        input: { title: chapter.title || ('第' + tn + '章'), summary: curSummary, engineNovelKey: novelId },
        genre: novel?.genre || '',
        novelId,
        targetWordCount: targetWords,
        style: writingStyle,
        newCharacters: '',
        previousData: prevData,
        platformStandards: readPlatformStandards(),
      }),
      signal,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status))
    const data = json?.data
    let content = typeof data === 'string' ? data : (data && (data.content || data.text)) || ''
    if (!content && data && typeof data === 'object') {
      let best = '', bestN = 0
      ;(function walk(o: any) {
        if (typeof o === 'string') { const n = (o.match(/[\u4e00-\u9fa5]/g) || []).length; if (n > bestN) { bestN = n; best = o } return }
        if (o && typeof o === 'object') for (const k in o) { try { walk(o[k]) } catch (_e) {} }
      })(data)
      content = best
    }
    const zh = (content.match(/[\u4e00-\u9fa5]/g) || []).length
    if (!content || zh < 500) throw new Error('第 ' + tn + ' 章生成内容过短（' + zh + ' 汉字），已放弃写回')
    const saveRes = await fetch('/tuzhong-wenshu/api/chapters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ novelId, chapterId: chapter.id, content, title: chapter.title || selectedChapter?.title, status: 'completed' }),
    })
    if (!saveRes.ok) throw new Error('第 ' + tn + ' 章生成成功但保存失败')
    // 更新本地章节状态（正文同步刷新）
    try {
      const sj = await saveRes.json()
      const updatedChapter = sj.data as Chapter
      setChapters(prev => prev.map(c => c.id === updatedChapter.id ? { ...c, ...updatedChapter, ...(updatedChapter.content ? {} : { content }) } : c))
      if (selectedChapter && selectedChapter.id === updatedChapter.id) {
        queueMicrotask(() => {
          setSelectedChapter(prev => prev ? { ...prev, ...updatedChapter, content: (updatedChapter as any).content || content } as Chapter : prev)
          setEditDraft((updatedChapter as any).content || content)
          setIsEditMode(false)
        })
      }
    } catch (_e) { /* 状态刷新失败不影响写回 */ }
    return { zh, content }
  }

  async function handleAIRegenerate() {
    if (!novelId || isGenerating) return
    const targets = parseChapterList(regenChapterInput)
    if (!targets.length) { alert('请填写目标章节：单章填 2，批量填 2-4 或 1,3,5，或输入 卷1/卷2 直接跑一整卷（≤60章）'); return }
    for (const tn of targets) {
      const c = chapters.find(x => Number((x as any).chapterNumber) === tn)
      if (!c) { alert('目录中没有第 ' + tn + ' 章'); return }
      if (!(c as any).summary && !window.confirm('第 ' + tn + ' 章没有章节摘要，无法按摘要重写（会被跳过并报错）。继续？')) return
    }
    // 🔥 字数自由输入（800-8000），不再固定三档
    const parsedWords = parseInt(regenWordsInput, 10)
    const targetWords = Math.min(8000, Math.max(800, isNaN(parsedWords) ? 2500 : parsedWords))
    const targetPreview = targets.length > 8 ? targets.slice(0, 8).join(',') + '…共' + targets.length + '章' : targets.join(',')
    const hoursHint = Math.round(targets.length * 5 / 6) / 10
    if (!window.confirm('将按分卷/章节摘要重新生成第 ' + targetPreview + '，并覆盖对应正文。字数目标 ' + targetWords + ' 汉字，预计约 ' + hoursHint + ' 小时（每章 3-10 分钟）。中途失败自动跳过并汇总，已成功章不会重复生成，请保持页面打开。继续？')) return
    setIsGenerating(true)
    setToolResult('')
    const aborter = new AbortController()
    regenAbortRef.current = aborter
    try {
      // 首章衔接：取目标首章前一章节选尾部；批量内自动串联上一章生成稿
      let prevEnding = ''
      const firstIdx = chapters.findIndex(c => Number((c as any).chapterNumber) === targets[0])
      if (firstIdx > 0) {
        try {
          const pRes = await fetch(`/tuzhong-wenshu/api/chapters?novelId=${novelId}&chapterId=${chapters[firstIdx - 1].id}`)
          if (pRes.ok) prevEnding = String((await pRes.json())?.data?.content || '').slice(-500)
        } catch (_e) { /* 静默降级 */ }
      }
      const doneLog: string[] = []
      const failLog: string[] = []
      for (let t = 0; t < targets.length; t++) {
        if (aborter.signal.aborted) break
        const tn = targets[t]
        setToolResult('（' + (t + 1) + '/' + targets.length + '）正在生成第 ' + tn + ' 章… 逐场景精写中最长约 10 分钟')
        // 🔥 2026-11-01 单章容错：失败重试 1 次（冷却 15s 躲限流），仍失败则跳过记录——不再一章失败中断整批
        let okOne = false
        let lastErrMsg = ''
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const { zh, content } = await regenOneChapter(tn, targetWords, aborter.signal, prevEnding || '（新章开始）')
            prevEnding = content.slice(-500)
            doneLog.push('第' + tn + '章 ' + zh + '字')
            okOne = true
            break
          } catch (e) {
            if (aborter.signal.aborted) break
            const msg = ((e as Error).message || String(e)).slice(0, 80)
            lastErrMsg = msg
            if (attempt === 1) {
              setToolResult('（' + (t + 1) + '/' + targets.length + '）第 ' + tn + ' 章首次失败（' + msg + '），15 秒后自动重试一次…')
              await new Promise(r => setTimeout(r, 15000))
            }
          }
        }
        if (!okOne && !aborter.signal.aborted) {
          failLog.push('第' + tn + '章：' + lastErrMsg)
          // 🔥 衔接连链保护：失败章的下一章改用该章当前已存内容结尾（新旧稿均可），保证批内不断链、不漂移
          try {
            const cur = chapters.find(c => Number((c as any).chapterNumber) === tn)
            const cRes = await fetch('/tuzhong-wenshu/api/chapters?novelId=' + novelId + '&chapterId=' + (cur as any).id)
            const cText = String((await cRes.json())?.data?.content || '')
            if (cText) prevEnding = cText.slice(-500)
          } catch (_e) { /* 保持原 prevEnding */ }
        }
      }
      if (aborter.signal.aborted) {
        setToolResult('⏹ 已取消生成。已完成：' + (doneLog.join('、') || '无') + (failLog.length ? '；失败跳过：' + failLog.join('；') : '') + '。未完成的章节未被改动，可从失败章号继续（衔接自动接上）。')
      } else if (failLog.length) {
        setToolResult('⚠ 批量完成：成功 ' + doneLog.length + ' 章（' + doneLog.join('、') + '）；失败 ' + failLog.length + ' 章——' + failLog.join('；') + '。直接从失败章号重新发起即可续跑，已成功章不会重复生成。')
      } else {
        setToolResult('✅ 已按卷/章摘要重新生成 ' + doneLog.length + ' 章：' + doneLog.join('、') + '，均已自动保存。')
      }
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError') {
        setToolResult('⏹ 已取消本次生成（未改动本章内容）')
      } else {
        const msg = err.message || String(e)
        setToolResult('❌ ' + msg)
        alert('❌ AI生成失败: ' + msg)
      }
    } finally {
      setIsGenerating(false)
      regenAbortRef.current = null
    }
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
  }, [searchQuery, selectedChapter?.id, selectedChapter?.content])

  // 检测平台配置（可配置的检测标准）
  const [detectPlatforms, setDetectPlatforms] = useState([
    { key: 'tomato', name: '番茄小说', icon: '🍅', aiStandard: '< 30%', color: 'red', enabled: true },
    { key: 'zhuque', name: '朱雀AI', icon: '🔴', aiStandard: '< 40%', color: 'rose', enabled: true },
    { key: 'qimao', name: '七猫小说', icon: '🐱', aiStandard: '< 35%', color: 'orange', enabled: false },
    { key: 'qidian', name: '起点中文', icon: '📖', aiStandard: '< 35%', color: 'blue', enabled: false },
    { key: 'jinjiang', name: '晋江文学', icon: '🌸', aiStandard: '< 20%', color: 'pink', enabled: false },
    { key: 'feilu', name: '飞卢小说', icon: '⚡', aiStandard: '< 40%', color: 'yellow', enabled: false },
    { key: 'zongheng', name: '纵横中文', icon: '🌊', aiStandard: '< 35%', color: 'cyan', enabled: false },
    { key: 'yuedong', name: '阅动文化', icon: '📚', aiStandard: '< 30%', color: 'green', enabled: false },
  ])

  // 🔥 2026-10-19：检测标准与「个人设置→平台AI检测配置」同步——用户改过的标准（如 <1%）必须在这里生效
  function applyDetectPlatformsFromLocal() {
    try {
      let src: any[] = []
      const raw1 = localStorage.getItem('tuzhong-platform-configs')
      if (raw1) src = JSON.parse(raw1) || []
      if (!Array.isArray(src) || src.length === 0) {
        const prefsRaw = localStorage.getItem('tuzhong-preferences')
        if (prefsRaw) {
          const prefs = JSON.parse(prefsRaw)
          if (Array.isArray(prefs.platformConfigs)) src = prefs.platformConfigs
        }
      }
      if (!Array.isArray(src) || src.length === 0) return
      setDetectPlatforms(function (prev) {
        return prev.map(function (def) {
          const saved = src.find(function (s: any) { return s && s.key === def.key })
          if (!saved) return def
          return {
            ...def,
            name: (typeof saved.name === 'string' && saved.name) || def.name,
            aiStandard: (typeof saved.aiStandard === 'string' && saved.aiStandard.trim()) || def.aiStandard,
            enabled: typeof saved.enabled === 'boolean' ? saved.enabled : def.enabled,
          }
        })
      })
    } catch (_e) { /* localStorage 读取失败时保持默认 */ }
  }

  useEffect(function () {
    applyDetectPlatformsFromLocal()
    // 同一浏览器其他标签页改了偏好，这里同步刷新
    const onStorage = function (e: StorageEvent) {
      if (e.key === 'tuzhong-platform-configs' || e.key === 'tuzhong-preferences') applyDetectPlatformsFromLocal()
    }
    window.addEventListener('storage', onStorage)
    return function () { window.removeEventListener('storage', onStorage) }
  }, [])

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
          } catch (e) { console.error('[write] 拉取首章正文失败，静默降级:', e) }
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
    // 卷归属优先级：数字 volume > volumeId > volumeIndex > 卷名字符串
    // volumeIndex 既有 0 基也有 1 基数据，这里按全量数据的最小值判断基准，避免卷与章节整体错位
    const idxVals = chapters.map(c => (typeof c.volumeIndex === 'number' ? c.volumeIndex : NaN)).filter(n => !isNaN(n))
    const idxBase = idxVals.length > 0 && Math.min(...idxVals) === 0 ? 0 : 1
    const matched = chapters.filter(c => {
      if (typeof c.volume === 'number') return c.volume === volumeNum
      if (typeof c.volumeId === 'string') {
        const v = volumes.find(x => x.order === volumeNum)
        if (v && v.id === c.volumeId) return true
      }
      if (typeof c.volumeIndex === 'number') return c.volumeIndex === volumeNum - 1 + idxBase
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

  async function navigateChapter(direction: 'prev' | 'next') {
    if (!selectedChapter || chapters.length === 0) return
    const currentIdx = chapters.findIndex(c => c.id === selectedChapter.id)
    if (currentIdx === -1) return
    const targetIdx = direction === 'prev' ? currentIdx - 1 : currentIdx + 1
    if (targetIdx >= 0 && targetIdx < chapters.length) {
      await selectChapterWithContent(chapters[targetIdx])
    }
  }

  // 🔥 按需拉取章节正文：章节列表已剥离 content，选中章节时单独请求正文
  const [contentLoading, setContentLoading] = useState(false)
  /** 切章前的脏值守卫：true = 允许切换 */
  async function guardUnsavedSwitch(): Promise<boolean> {
    if (!isEditMode) return true
    if (editDraftRef.current === draftBaselineRef.current) return true
    const saveFirst = window.confirm('当前章节有未保存的修改。\n\n【确定】= 先保存再切换章节\n【取消】= 停留在本章（可点「取消编辑」放弃本次修改）')
    if (!saveFirst) return false
    await handleSaveDraft()
    return true
  }

  async function selectChapterWithContent(chapter: Chapter) {
    if (!(await guardUnsavedSwitch())) return
    const mySeq = ++chapterSwitchSeqRef.current
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
        // 🔥 已有更新的切章请求时，只回填列表缓存，绝不覆盖当前选中章节（否则串正文）
        if (mySeq !== chapterSwitchSeqRef.current) {
          setChapters(prev => prev.map(c => c.id === chapter.id ? { ...c, content: fetchedContent } : c))
          return
        }
        setSelectedChapter(prev => (prev && prev.id === chapter.id) ? { ...prev, content: fetchedContent } : prev)
        // 同步更新 chapters 数组中的对应章节
        setChapters(prev => prev.map(c => c.id === chapter.id ? { ...c, content: fetchedContent } : c))
      }
    } catch (e) {
      console.error('[write] 拉取章节正文失败，静默降级:', e)
    } finally {
      if (mySeq === chapterSwitchSeqRef.current) setContentLoading(false)
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
    s = s.replace(/(?<=[。.！?？…\n])[ \t]*上[。，,\.]+(?=[\u4e00-\u9fa5])/g, '')
    s = s.replace(/之+上[。，,\.\s]+(?=[\u4e00-\u9fa5])/g, '，')
    s = s.replace(/(撞|推|顶|打|砸|压|劈|砍|斩|刺|扫|拍|抓|扣|按|压|撞|碾|踩|踏)上[。，,\.\s]+/g, '$1，')
    // 2026-11-01 修复：原通用孤立上正则误伤正常文本（「落在他脸上。」「压在舌根上，」「磕在他的牙上，」全被吞），已并入上方收紧版（仅句末标点/行首后的孤立上才清理）
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
            <div
              onClick={function () { if (coverUrl) setCoverZoomOpen(true) }}
              title={coverUrl ? '点击查看大图' : undefined}
              className={`w-14 h-20 rounded bg-gradient-to-br ${coverGradients[0]} flex-shrink-0 flex items-center justify-center overflow-hidden ${coverUrl ? 'cursor-zoom-in' : ''}`}>
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
                      } catch (_e) { console.error('[write] 进入编辑模式前清洗正文失败:', _e) }
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
              onClick={() => { setActiveTool('regen'); setShowToolPanel(true); const tn = (selectedChapter as any)?.chapterNumber || (chapters.findIndex(c => c.id === selectedChapter?.id) + 1); if (tn) setRegenChapterInput(String(tn)) }}
              className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex flex-col items-center justify-center gap-0.5 group"
              title="AI生成本章（按卷/章摘要重新设计）"
            >
              <RefreshCcw className="w-5 h-5" />
              <span className="text-[9px] font-medium">AI生成</span>
            </button>
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
                  {activeTool === 'regen' && '🔁 AI生成本章'}
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
                {/* AI生成本章（按卷/章摘要整章重写） */}
                {activeTool === 'regen' && (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500 leading-relaxed">
                      按设定中心的<b>分卷摘要</b>与<b>章节摘要</b>整章重写正文（走逐章精写引擎，含QA闸门与平台AI检测标准）。支持批量：依序逐章生成并自动保存，章与章自动衔接。生成约每章 3-10 分钟。
                    </p>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">目标章节（可自由修改，支持批量）</label>
                      <input
                        type="text"
                        value={regenChapterInput}
                        onChange={(e) => setRegenChapterInput(e.target.value)}
                        disabled={isGenerating}
                        placeholder="如 2 或 2-4 或 1,3,5"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                      />
                      <p className="text-xs text-gray-400 mt-1">单章填章号；批量填区间（2-4）或列表（1,3,5），最多同时 10 章，按顺序逐章生成与保存</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">目标字数（可自由修改）</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={800}
                          max={8000}
                          step={100}
                          value={regenWordsInput}
                          onChange={(e) => setRegenWordsInput(e.target.value)}
                          disabled={isGenerating}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                        />
                        <span className="text-xs text-gray-500 shrink-0">汉字</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">建议范围 1000-6000，任意数值即时生效</p>
                    </div>
                    <button
                      disabled={isGenerating}
                      onClick={handleAIRegenerate}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCcw className="w-4 h-4 animate-spin" />
                          生成中 {Math.floor(regenElapsed / 60)}分{regenElapsed % 60 < 10 ? '0' : ''}{regenElapsed % 60}秒…
                        </>
                      ) : (
                        <><RefreshCcw className="w-4 h-4" /> 开始重新生成本章</>
                      )}
                    </button>
                    {isGenerating && (
                      <>
                        <button
                          onClick={() => { if (regenAbortRef.current) regenAbortRef.current.abort() }}
                          className="w-full py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
                        >
                          取消生成（本章内容不会被改动）
                        </button>
                        <p className="text-[11px] text-gray-400 text-center">正在逐场景精写并质检，最长约 10 分钟；若与其它生成任务同时运行会变慢</p>
                      </>
                    )}
                    {toolResult && (
                      <div className={`text-xs rounded-lg p-3 whitespace-pre-wrap ${toolResult.startsWith('✅') ? 'bg-green-50 text-green-700' : toolResult.startsWith('❌') ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`}>
                        {toolResult}
                      </div>
                    )}
                  </div>
                )}
                {/* 风格续写 */}
                {activeTool === 'style' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">写作风格</label>
                      <select
                        value={writingStyle}
                        onChange={(e) => {
                          const styleName = e.target.value
                          setWritingStyle(styleName)
                          // 选择后同步回写作偏好（设置页与生成向导共用同一个风格）
                          try {
                            const raw = JSON.parse(localStorage.getItem('tuzhong-preferences') || '{}')
                            const id = resolveStyleId(styleName)
                            if (id) raw.writingStyle = id
                            raw._updatedAt = Date.now()
                            localStorage.setItem('tuzhong-preferences', JSON.stringify(raw))
                            pushServerPreferences(raw)
                          } catch (_e) { /* ignore */ }
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        {/* 🔥 2026-10-26：风格库从 5 个硬编码扩为 PRESET_STYLES 全量 60+ 种（按平台分组），与设置页/向导同源 */}
                        <optgroup label="通用与经典">
                          <option>番茄爽文风</option>
                          <option>老白文风格</option>
                          <option>轻松搞笑风</option>
                          <option>细腻文艺风</option>
                          <option>热血战斗风</option>
                          <option>古典仙侠问道风</option>
                          <option>凡人流稳健修仙风</option>
                          <option>传统玄幻升级风</option>
                          <option>历史权谋朝堂风</option>
                          <option>古风宫廷宅斗风</option>
                          <option>当年明月历史风</option>
                          <option>年代生活流风</option>
                        </optgroup>
                        <optgroup label="起点系">
                          <option>天蚕土豆玄幻风</option>
                          <option>辰东遮天荒古风</option>
                          <option>耳根仙逆求魔风</option>
                          <option>忘语凡人修仙风</option>
                          <option>爱潜水的乌贼风</option>
                          <option>萧鼎诛仙虐恋仙侠风</option>
                          <option>官术/官居一品 官场历史风</option>
                        </optgroup>
                        <optgroup label="番茄/七猫系">
                          <option>番茄番茄梗式搞笑爽文风</option>
                          <option>番茄战神回归都市风</option>
                          <option>番茄废柴签到系统流</option>
                          <option>七猫大一柱都市神豪风</option>
                          <option>系统流金手指风</option>
                        </optgroup>
                        <optgroup label="飞卢系">
                          <option>飞卢综漫同人脑洞风</option>
                          <option>飞卢曝光+向真文体</option>
                          <option>飞卢女频快穿虐渣风</option>
                          <option>综漫同人快穿风</option>
                        </optgroup>
                        <optgroup label="晋江/女频">
                          <option>现代言情甜宠风</option>
                          <option>桐华言情风</option>
                          <option>墨宝非宝甜宠暖爱风</option>
                          <option>山海卷轴古风言情风</option>
                          <option>晋江耽美甜虐风</option>
                          <option>晋江女强重生复仇风</option>
                          <option>晋江女频玄幻仙侠风</option>
                          <option>甜宠日常恋爱风</option>
                        </optgroup>
                        <optgroup label="悬疑推理">
                          <option>东野圭吾悬疑风</option>
                          <option>阿加莎推理黄金风</option>
                          <option>雷米刑侦悬疑风</option>
                          <option>刑侦悬疑推理风</option>
                          <option>南派三叔盗墓悬疑风</option>
                          <option>天下霸唱鬼吹灯冒险风</option>
                          <option>民俗灵异怪谈风</option>
                        </optgroup>
                        <optgroup label="科幻">
                          <option>刘慈欣硬科幻风</option>
                          <option>海伯利安太空歌剧风</option>
                          <option>王晋康生命科幻风</option>
                          <option>末日废土进化流风</option>
                        </optgroup>
                        <optgroup label="都市/游戏">
                          <option>都市神医下山风</option>
                          <option>都市豪门总裁风</option>
                          <option>都市重生逆袭风</option>
                          <option>都市异能觉醒风</option>
                          <option>全职高手电竞职业风</option>
                          <option>网游-从零开始数据流风</option>
                          <option>大富翁经营养成风</option>
                        </optgroup>
                        <optgroup label="其他题材">
                          <option>金庸武侠风</option>
                          <option>古龙悬疑武侠风</option>
                          <option>梁羽生正气武侠风</option>
                          <option>西幻领主种田风</option>
                          <option>魔法学院成长风</option>
                          <option>铁血军事战争风</option>
                          <option>末世求生基建风</option>
                          <option>无限流副本闯关风</option>
                          <option>刘地师无限副本风</option>
                          <option>黄衣之王克苏鲁神话风</option>
                        </optgroup>
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
                      onClick={async function() {
                        setIsGenerating(true)
                        setToolResult('')
                        try {
                          // 🔥 2026-10-26：假示例 → 真实续写（/api/ai/continue）
                          const lenMap: Record<string, number> = { short: 200, medium: 500, long: 1000 }
                          const targetLen = lenMap[continueLength] || 500
                          const tail = String((selectedChapter as any)?.content || '').slice(-600)
                          const res = await fetch('/tuzhong-wenshu/api/ai/continue', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') },
                            body: JSON.stringify({
                              context: tail || '（当前章节为空，从新书开头续写）',
                              style: { name: writingStyle, parameters: {} },
                              length: continueLength,
                              targetLength: targetLen,
                              novelId: (selectedChapter as any)?.novelId || novelId,
                              chapterTitle: (selectedChapter as any)?.title || ''
                            })
                          })
                          const j = await res.json()
                          if (j && j.success && j.data && j.data.content) {
                            setToolResult(j.data.content)
                          } else {
                            setToolResult('续写失败：' + ((j && j.error) || '接口未返回内容') + '\n\n提示：可在「设置 → AI模型」检查免费模型可用性。')
                          }
                        } catch (e: any) {
                          setToolResult('续写请求异常：' + (e?.message || e))
                        } finally {
                          setIsGenerating(false)
                        }
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
                        handleRealRewrite()
                      }}
                      className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-bold hover:from-pink-600 hover:to-rose-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 改写中...</>
                      ) : (
                        <><Wand2 className="w-4 h-4" /> 深度改写</>
                      )}
                    </button>
                    <p className="text-xs text-gray-400 text-center">调用已配置的 AI 模型；失败会直接报错，不再返回示例文本</p>
                    {toolNotice && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700 whitespace-pre-wrap">{toolNotice}</div>
                    )}
                    {toolError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">{toolError}</div>
                    )}
                    {continueOptions.map(function (opt: string, i: number) {
                      return (
                        <div key={'copt' + i} className="bg-white border border-purple-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-purple-700">续写方向 {i + 1}</span>
                            <button onClick={function () { applyContinueToDraft(opt) }} className="px-2 py-1 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700">追加到章末</button>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-72 overflow-auto">{opt}</p>
                        </div>
                      )
                    })}
                    {rewriteResult && (
                      <div className="bg-white border border-pink-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-pink-700">改写结果</span>
                          <button onClick={function () { replaceDraftWithRewrite(rewriteResult) }} className="px-2 py-1 text-xs bg-pink-600 text-white rounded-md hover:bg-pink-700">替换草稿</button>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-72 overflow-auto">{rewriteResult}</p>
                      </div>
                    )}
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
                      <button
                        disabled={isGenerating}
                        onClick={function () {
                          const srcText = (selectedChapter && selectedChapter.content) ? String(selectedChapter.content) : ''
                          if (!srcText || srcText.replace(/\s/g, '').length < 50) {
                            setToolResult('⚠️ 当前章节正文不足 50 字，无法送检。')
                            return
                          }
                          setIsGenerating(true)
                          // 🔥 2026-10-26：优先用用户自填的朱雀 Key（存在浏览器本地偏好，不传服务端）
                          const _zKey = getLocalZhuqueApiKey()
                          setToolResult(_zKey
                            ? '正在调用朱雀官方模型检测，请稍候…'
                            : '未填写朱雀 API Key，正在使用站内 AI 检测（可在「设置」填入 Key 启用官方判定）…')
                          fetch('/tuzhong-wenshu/api/ai/zhuque-detect', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: srcText, apiKey: _zKey }),
                          }).then(async function (res) {
                            const json = await res.json().catch(function () { return null })
                            if (!res.ok || !json || !json.data) {
                              setToolResult('❌ 检测失败：' + ((json && json.error) || ('HTTP ' + res.status)) + (_zKey ? '' : '（未填朱雀 Key 时本应自动降级站内检测，请反馈）'))
                              return
                            }
                            const z = json.data
                            const segLines = (z.segments || []).slice(0, 8).map(function (s: any) {
                              return '  · ' + s.labelName + '（置信 ' + Math.round(Number(s.confidence || 0) * 100) + '%）：' + s.length + '字 「' + String(s.head || '').replace(/\n/g, ' ') + '…」'
                            }).join('\n')
                            setToolResult(
                              (z.pass ? '✅ ' : '❌ ') + (z.isOfficialZhuque ? '朱雀官方模型判定' : '站内 AI 检测（朱雀口径本地代理）') + (z.isOfficialZhuque ? '' : '　·　可在「设置」填入朱雀 API Key 升级为官方判定') + '（' + (z.model || '') + '）\n\n' +
                              '• 人工占比：' + z.humanRatio + '%\n' +
                              '• AI占比：' + z.aiRatio + '%\n' +
                              '• 疑似AI占比：' + z.suspectedRatio + '%（目标 ≤' + z.targetSuspectedRatio + '%，' + (z.pass ? '达标' : '未达标') + '）\n' +
                              '• 整体置信度：' + (z.softmaxConfidence !== null && z.softmaxConfidence !== undefined ? Math.round(Number(z.softmaxConfidence) * 1000) / 10 + '%' : '—') + '\n' +
                              (z.dimensions && z.dimensions.length ? '\n四维判定：\n' + z.dimensions.map(function (d: any) { return '  · ' + d.name + '：' + d.score + '分（' + d.detail + '）' }).join('\n') + '\n' : '') +
                              (segLines ? '\n分段判定：\n' + segLines + '\n' : '') +
                              '\n说明：' + (z.note || '疑似AI占比超标的段落都是叙述/说明/罗列句，应改写为动作、对话与身体感。')
                            )
                          }).catch(function (e) {
                            setToolResult('❌ 朱雀官方检测失败：' + String(e && e.message ? e.message : e))
                          }).finally(function () { setIsGenerating(false) })
                        }}
                        className="mt-2 w-full py-2 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-lg text-sm font-bold hover:from-red-700 hover:to-rose-700 transition-all flex items-center justify-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4" /> 朱雀口径自检（自建标准·疑似AI≤5%）
                      </button>
                    </div>
                    <button
                      disabled={isGenerating}
                      onClick={function() {
                        const plat = detectPlatforms.find(p => p.key === selectedPlatform)
                        const srcText = (selectedChapter && selectedChapter.content) ? String(selectedChapter.content) : ''
                        if (!srcText || srcText.replace(/\s/g, '').length < 50) {
                          setToolResult('⚠️ 当前章节正文不足 50 字，无法检测。请先生成/选择有正文的章节。')
                          return
                        }
                        setIsGenerating(true)
                        setToolResult('')
                        fetch('/tuzhong-wenshu/api/ai/detect', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ text: srcText }),
                        }).then(async function(res) {
                          const json = await res.json().catch(function() { return null })
                          if (!res.ok || !json || !json.data) {
                            setToolResult('❌ 检测失败：' + ((json && json.error) || ('HTTP ' + res.status)))
                            return
                          }
                          const det = json.data
                          const std = plat && plat.aiStandard ? String(plat.aiStandard) : ''
                          const m = std.match(/(\d+(?:\.\d+)?)/)
                          const threshold = m ? Number(m[1]) : null
                          const rateVal = Math.round(Number(det.aiRate) * 10) / 10
                          // 严格口径：标准写「<1%」时须真小于 1%；写「≤1%」才允许等于 1%
                          const strictLt = /[<＜]/.test(std) && !/[≤≦]/.test(std)
                          const pass = threshold === null ? true : (strictLt ? rateVal < threshold : rateVal <= threshold)
                          const dims = Array.isArray(det.scores)
                            ? det.scores.slice(0, 8).map(function(s: any) { return '• ' + s.name + '：' + Math.round(s.score) + '分' }).join('\n')
                            : ''
                          const issues = Array.isArray(det.issues)
                            ? det.issues.slice(0, 4).map(function(it: any) { return '⚠️ ' + (it && (it.description || it.type) || '') }).filter(Boolean).join('\n')
                            : ''
                          setToolResult(
                            (pass ? '✅ ' : '❌ ') + (plat ? plat.name : '平台') + '检测' + (pass ? '达标' : '未达标') + '\n\n' +
                            '• 平台自研估测AI率：' + rateVal.toFixed(1) + '%（标准 ' + (std || '未设置') + '）\n' +
                            (dims ? dims + '\n' : '') +
                            (issues ? '\n主要问题：\n' + issues + '\n' : '') +
                            '\n说明：这是站内自研算法的估测值，不是朱雀官方检测结果（朱雀官方判定须走官方通道：网页版或 EdgeOne Makers API）。' +
                            '标准取自「个人设置→平台AI检测配置」。' + (pass ? '' : '建议重新生成或按上述问题修改后再测。')
                          )
                        }).catch(function(e) {
                          setToolResult('❌ 检测失败：' + (e && e.message ? e.message : String(e)))
                        }).finally(function() {
                          setIsGenerating(false)
                        })
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
                      value={settingQuery}
                      onChange={function (e) { setSettingQuery(e.target.value) }}
                      onKeyDown={function (e) { if (e.key === 'Enter') handleSettingQuery(settingQuery) }}
                      placeholder="输入人名/地名/势力等关键词，回车查询..."
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
                        handleSettingQuery(settingQuery)
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
                        handleSelfCheck()
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

      {/* 封面大图灯箱 */}
      {coverZoomOpen && coverUrl && (
        <div
          onClick={function () { setCoverZoomOpen(false) }}
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <button
            onClick={function (e) { e.stopPropagation(); setCoverZoomOpen(false) }}
            title="关闭 (ESC)"
            aria-label="关闭"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={coverUrl}
            alt="封面大图"
            onClick={function (e) { e.stopPropagation() }}
            onError={function () {
              const raw = (novel?.cover || coverUrl || '') as string
              const links = String(raw).split('|||').map(function (s) { return s.trim() }).filter(Boolean)
              const next = coverFallbackIndex + 1
              if (next < links.length) {
                setCoverFallbackIndex(next)
                setCoverUrl(links[next])
              } else {
                setCoverZoomOpen(false)
              }
            }}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl select-none"
          />
        </div>
      )}
    </div>
  )
}
