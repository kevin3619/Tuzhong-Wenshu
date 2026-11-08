'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  BookOpen,
  Plus,
  Sparkles,
  BarChart3,
  Search,
  Clock,
  FileText,
  Award,
  Check,
  X,
  Trash2,
  Loader2,
  FolderOpen,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AIGenerateWizard, {
  // 🔥 2026-09-11 严重 bug 修复：书架↔向导草稿箱双向同步（服务端权威源 + 删除同步）
  deleteDraftShared,
  reconcileDraftsWithServer,
  filterInProgressDrafts,
  readLocalDraftsIndex,
  DRAFTS_INDEX_KEY,
  ACTIVE_NOVEL_ID_KEY,
  PENDING_OPEN_DRAFT_KEY,
  DRAFTS_CHANGED_EVENT,
  type DraftEntry,
} from '@/components/ai-generate-wizard'

// ============ 作品类型枚举（覆盖主流网文平台全部分类） ============
export const GENRE_OPTIONS = [
  // 男频主流
  '玄幻',
  '仙侠',
  '都市',
  '科幻',
  '历史',
  '军事',
  '游戏',
  '体育',
  '灵异',
  '悬疑',
  // 女频主流
  '言情',
  '古代言情',
  '现代言情',
  '仙侠奇缘',
  '玄幻言情',
  '浪漫青春',
  '悬疑推理',
  // 细分类型
  '武侠',
  '奇幻',
  '末世',
  '无限流',
  '系统流',
  '重生',
  '穿越',
  '种田',
  '宅斗',
  '宫斗',
  '权谋',
  '商战',
  '职场',
  '娱乐圈',
  '同人',
  '轻小说',
  '短篇',
  '纪实',
  '乡土',
  '现实',
  '搞笑',
  '诸天万界',
] as const

export type Genre = (typeof GENRE_OPTIONS)[number]

// ============ 小说数据 ============
interface Novel {
  id: string
  title: string
  description: string
  genre: string
  wordCount: number
  lastModified: string
  healthScore: number
  status: 'writing' | 'completed' | 'paused' | 'drafting'
  cover?: string
}

// 计算连续打卡天数（根据所有作品的最后修改日期）
// 注意：SSR 时不使用 new Date()，避免 hydration mismatch
function calcConsecutiveDays(novelList: Novel[], mounted: boolean): number {
  if (novelList.length === 0) return 0
  if (!mounted) return 0 // SSR 时不计算日期相关值，保持与客户端初始渲染一致
  const dates = Array.from(new Set(
    novelList.map(n => n.lastModified).filter(Boolean)
  )).sort().reverse()
  if (dates.length === 0) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today.getTime() - 86400000)

  const latestDate = new Date(dates[0] + 'T00:00:00')
  if (latestDate.getTime() < yesterday.getTime()) return 0

  let streak = 1
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00')
    const curr = new Date(dates[i] + 'T00:00:00')
    const diffDays = (prev.getTime() - curr.getTime()) / 86400000
    if (Math.abs(diffDays - 1) < 0.5) {
      streak++
    } else {
      break
    }
  }
  return streak
}
const getHealthColor = (score: number) => {
  if (score >= 85) return 'bg-green-500'
  if (score >= 70) return 'bg-yellow-500'
  return 'bg-red-500'
}

const getHealthText = (score: number) => {
  if (score >= 85) return '健康'
  if (score >= 70) return '良好'
  return '需优化'
}

// 封面渐变色方案
const coverGradients = [
  'from-stone-500 to-stone-800',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-stone-500 to-rose-600',
  'from-stone-500 to-stone-700',
  'from-amber-500 to-yellow-600',
  'from-cyan-500 to-stone-500',
  'from-violet-500 to-stone-800',
]

export default function Home() {
  const router = useRouter()
  const [novels, setNovels] = useState<Novel[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [coverFallbackMap, setCoverFallbackMap] = useState<Record<string, number>>({})

  // 新建作品弹窗状态
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newGenre, setNewGenre] = useState<string>('玄幻')
  const [newDescription, setNewDescription] = useState('')
  const [createSuccess, setCreateSuccess] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // AI生成向导弹窗状态
  const [showAIGuide, setShowAIGuide] = useState(false)
  const [aiGuideNovelId, setAiGuideNovelId] = useState<string | null>(null)
  const [showDraftsModal, setShowDraftsModal] = useState(false)

  // 删除确认弹窗状态（作品 / 草稿通用，最小结构）
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; status?: string } | null>(null)

  // 🔥🔥🔥 2026-09-11 严重 bug 修复：书架↔向导草稿箱双向同步
  //   书架草稿箱不再只按 novels.filter(status==='drafting') 渲染，而是与服务端对账后的
  //   「服务端 ∪ 本地索引」并集（与向导草稿箱同源），删除两侧共用 deleteDraftShared。
  const [draftList, setDraftList] = useState<DraftEntry[]>([])
  const [novelsLoaded, setNovelsLoaded] = useState(false)
  const serverDrafts = useMemo(() => novels.filter(n => n.status === 'drafting'), [novels])

  // 从服务端重新拉取作品列表
  const refreshNovels = async () => {
    try {
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = 'Bearer ' + token
      const res = await fetch('/tuzhong-wenshu/api/novels', { headers })
      if (res.ok) {
        const json = await res.json()
        if (json.data && Array.isArray(json.data)) {
          setNovels(json.data)
        }
      }
    } catch (e) {
      console.error('[home] 加载作品列表失败，保留当前数据:', e)
    } finally {
      setIsLoading(false)
      setNovelsLoaded(true)
    }
  }

  // 标记客户端已挂载（避免 SSR/客户端 hydration mismatch）
  useEffect(() => {
    queueMicrotask(function () { setMounted(true) })
  }, [])

  // 初始化时通过 API 加载作品数据（服务端文件存储，不依赖 localStorage）
  useEffect(() => { void refreshNovels() }, [])

  // 与服务端对账草稿列表：服务端 ∪ 本地（按 id 去重，服务端优先），剪除服务端已删项，写回本地索引
  // 注意：必须在作品列表首次加载完成后再对账，避免用空列表误剪本地条目
  useEffect(() => {
    if (!novelsLoaded) return
    setDraftList(reconcileDraftsWithServer(serverDrafts))
  }, [novelsLoaded, serverDrafts])

  // 草稿变更即时同步：同页自定义事件（tuzhong-drafts-changed）+ 跨标签 storage 事件
  useEffect(() => {
    const onDraftsChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      if (detail && detail.deletedId) {
        // 乐观移除被删项（书架侧 / 向导侧删除均走这里）
        setNovels(prev => prev.filter(n => n.id !== detail.deletedId))
        setDraftList(prev => prev.filter(d => d.id !== detail.deletedId))
      } else {
        setDraftList(filterInProgressDrafts(readLocalDraftsIndex()))
      }
      void refreshNovels()
    }
    const onStorage = (e: StorageEvent) => {
      if (!e || !e.key) return
      if (e.key === DRAFTS_INDEX_KEY || e.key === ACTIVE_NOVEL_ID_KEY) {
        // 其它标签页删/改了草稿 → 先按本地索引即时刷新，再从服务端复核
        setDraftList(filterInProgressDrafts(readLocalDraftsIndex()))
        void refreshNovels()
      }
    }
    window.addEventListener(DRAFTS_CHANGED_EVENT, onDraftsChanged)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(DRAFTS_CHANGED_EVENT, onDraftsChanged)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const filteredNovels = novels.filter(novel =>
    novel.status !== 'drafting' &&
    novel.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const stats = {
    totalNovels: novels.length,
    totalWords: novels.reduce((sum, n) => sum + n.wordCount, 0),
    avgHealth: novels.length > 0 ? Math.round(novels.reduce((sum, n) => sum + n.healthScore, 0) / novels.length) : 0,
    writingDays: calcConsecutiveDays(novels, mounted)
  }

  // 创建新作品（通过 API 保存到服务端文件）
  const handleCreateNovel = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newTitle.trim() || isCreating) return

    setIsCreating(true)

    try {
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = 'Bearer ' + token
      const res = await fetch('/tuzhong-wenshu/api/novels', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          title: newTitle.trim(),
          genre: newGenre,
          description: newDescription.trim() || '暂无简介',
        }),
      })

      if (res.ok) {
        const json = await res.json()
        const newNovel = json.data as Novel

        setNovels((prev) => [newNovel, ...prev])
        setCreateSuccess(true)

        setTimeout(() => {
          setShowCreateModal(false)
          setCreateSuccess(false)
          setNewTitle('')
          setNewGenre('玄幻')
          setNewDescription('')
          setAiGuideNovelId(newNovel.id)
          setShowAIGuide(true)
        }, 1500)
      } else {
        const err = await res.json()
        if (err.code === 402) {
          alert(err.error + '\n\n请前往「VIP会员」页面开通VIP后继续创作。')
        } else {
          alert('创建失败，请重试')
        }
      }
    } catch {
      alert('创建失败，请重试')
    } finally {
      setIsCreating(false)
    }
  }

  // 打开新建弹窗时重置
  const openCreateModal = () => {
    setNewTitle('')
    setNewGenre('玄幻')
    setNewDescription('')
    setCreateSuccess(false)
    setShowCreateModal(true)
  }

  // 删除作品
  // 删除作品 / 草稿：统一走 deleteDraftShared（服务端删除 + 本地草稿清理 + 两侧即时同步）
  const handleDeleteNovel = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    try {
      await deleteDraftShared(target.id, target.title)
      // 乐观移除 + 重新拉取服务端列表，保证书架 / 向导 / 跨标签一致
      setNovels((prev) => prev.filter((n) => n.id !== target.id))
      setDraftList((prev) => prev.filter((d) => d.id !== target.id))
      setDeleteTarget(null)
      void refreshNovels()
    } catch {
      alert('删除失败，请重试')
    }
  }

  // 书架草稿箱「继续生成」：服务端草稿沿用原恢复逻辑；本地独有草稿交给向导按本地副本恢复
  const handleResumeDraftItem = (draft: DraftEntry) => {
    const isServerDraft = serverDrafts.some((d) => d.id === draft.id)
    if (isServerDraft) { void handleResumeDraft(draft.id); return }
    try { localStorage.setItem(PENDING_OPEN_DRAFT_KEY, draft.id) } catch (e) { console.error('[home] 写入草稿恢复标记失败:', e) }
    setShowDraftsModal(false)
    setShowAIGuide(true)
  }

  const handleResumeDraft = async (novelId: string) => {
    try {
      const token = localStorage.getItem('token')
      const r = await fetch(`/tuzhong-wenshu/api/settings?novelId=${novelId}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
      // 🔥 Bug修复：此前未判 r.ok —— 401/500 时 j.data=undefined，用空对象覆盖全局草稿快照，造成数据丢失
      if (!r.ok) { alert('打开草稿失败（' + r.status + '），请重新登录后重试'); return }
      const j = await r.json()
      // 🔥 Bug修复：只有拿到有效快照才写入 localStorage，避免空对象覆盖
      if (!j || typeof j !== 'object' || !j.data || typeof j.data !== 'object' || Object.keys(j.data).length === 0) { alert('该草稿快照为空或服务端返回异常，无法恢复'); return }
      const d = j.data || {}
      if (!d || typeof d !== 'object' || Object.keys(d).length === 0) { alert('该草稿快照为空，无法恢复'); return }
      const gen: Record<string, any> = {
        idea: d.idea || null, worldbuilding: d.worldbuilding || null, powerSystem: d.powerSystem || null,
        characters: d.characters || null, factions: d.factions || null, relationships: d.relationships || null,
        synopsis: d.synopsis || null, outline: d.outline || null, keyPlots: d.keyPlots || null, chapters: d.chapters || null,
      }
      // 🔥 2026-09-08 #161 封面恢复：服务端快照 cover.coverUrl 映射回 generatedData.coverUrl（封面步解锁门依赖）
      if (d.cover && typeof d.cover === 'object' && d.cover.coverUrl) gen.coverUrl = d.cover.coverUrl
      localStorage.setItem('tuzhong-generated-data', JSON.stringify(gen))
      localStorage.setItem('tuzhong-active-novel-id', novelId)
      // 🔥 2026-09-03 #120：回到「中断时所处的环节」，而不是一律跳到 chapters
      //    （settings 中的 lastStep 由 AI 向导每完成一步落盘写入）
      var _resumeStep = typeof d.lastStep === 'string' && d.lastStep && d.lastStep !== 'complete' && d.lastStep !== 'input' ? d.lastStep : 'chapters'
      localStorage.setItem('tuzhong-current-step', _resumeStep)
      setShowDraftsModal(false)
      setShowAIGuide(true)
    } catch (e) {
      alert('打开草稿失败，请重试')
    }
  }

  return (
    <div>
      {showAIGuide ? (
        <div className="py-4">
          <AIGenerateWizard
            embedded={true}
            initialGenre=""
            isCreating={false}
            onClose={() => setShowAIGuide(false)}
            onComplete={async (novelData, generatedData) => {
              try {
                const token = localStorage.getItem('token')
                const headers: Record<string, string> = { 'Content-Type': 'application/json' }
                if (token) headers['Authorization'] = 'Bearer ' + token
                const res = await fetch('/tuzhong-wenshu/api/novels', {
                  method: 'POST',
                  headers: headers,
                  body: JSON.stringify({
                    title: novelData.title,
                    genre: novelData.genre,
                    description: novelData.description || '暂无简介',
                    chapters: novelData.chapters || [],
                    volumes: novelData.volumes || [],
                    worldbuilding: generatedData?.worldbuilding,
                    powerSystem: generatedData?.powerSystem,
                    characters: generatedData?.characters,
                    factions: generatedData?.factions,
                    relationships: generatedData?.relationships,
                    outline: generatedData?.outline,
                    keyPlots: generatedData?.keyPlots,
                    idea: generatedData?.idea,
                    synopsis: generatedData?.synopsis,
                    coverUrl: generatedData?.coverUrl,
                  }),
                })
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}))
                  if (err.code === 402) {
                    alert(err.error + '\n\n请前往「VIP会员」页面开通VIP后继续创作。')
                  } else {
                    alert('作品保存失败：' + (err.error || '请重试'))
                  }
                  return // 保存失败时不关闭向导，让用户可重试
                }
                const json = await res.json()
                const newNovel = json.data as Novel
                // 立即更新书架列表，确保新作品显示
                setNovels((prev) => [newNovel, ...prev])
                // 同步保存到 localStorage 作为备份
                try {
                  const existingNovels = JSON.parse(localStorage.getItem('tuzhong-novels') || '[]')
                  existingNovels.unshift({
                    ...novelData,
                    ...generatedData,
                    id: newNovel.id,
                    createdAt: new Date().toISOString(),
                  })
                  localStorage.setItem('tuzhong-novels', JSON.stringify(existingNovels))
                  localStorage.setItem('tuzhong-active-novel-id', newNovel.id)
                } catch (e) {
                  console.warn('[AI生成] localStorage备份失败:', e)
                }
                setShowAIGuide(false)
                router.refresh()
              } catch (e) {
                console.error('[AI生成] 保存作品到服务器失败:', e)
                alert('保存作品失败，请检查网络后重试')
              }
            }}
          />
        </div>
      ) : (
        <>
      {/* 搜索栏 */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <input
            type="text"
            placeholder="搜索作品..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-stone-500 transition-all"
          />
        </div>
      </div>

      {/* 欢迎区域 */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-stone-900 mb-2">
          {novels.length > 0 ? '欢迎回来，创作者！' : '开始你的创作之旅'}
        </h2>
        <p className="text-stone-600">
          {novels.length > 0
            ? `你正在创作 ${novels.filter(n => n.status === 'writing').length} 部作品，共 ${(stats.totalWords / 10000).toFixed(1)} 万字`
            : '点击"新建作品"或"AI全自动生成"按钮，开始你的第一部小说'
          }
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-stone-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-500 mb-1">创作中作品</p>
                <p className="text-2xl font-bold text-stone-900">{stats.totalNovels}</p>
              </div>
              <div className="w-12 h-12 bg-stone-50 rounded-xl flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-stone-700" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-stone-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-500 mb-1">总字数</p>
                <p className="text-2xl font-bold text-stone-900">{(stats.totalWords / 10000).toFixed(1)}万</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-stone-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-500 mb-1">平均健康度</p>
                <p className="text-2xl font-bold text-stone-900">{stats.avgHealth}%</p>
              </div>
              <div className="w-12 h-12 bg-stone-50 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-stone-800" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-stone-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-500 mb-1">连续打卡</p>
                <p className="text-2xl font-bold text-stone-900">{stats.writingDays}天</p>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center">
                <Award className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* 快捷操作区 */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-stone-900">我的作品</h3>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowDraftsModal(true)}
              className="relative flex items-center space-x-2 px-5 py-2.5 bg-[#b8860b] text-white rounded-lg hover:bg-[#9a7209] transition-all font-medium shadow-lg shadow-stone-200"
            >
              <FolderOpen className="w-4 h-4" />
              <span>草稿箱</span>
              {draftList.length > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-[#c8364d] text-white text-xs flex items-center justify-center">{draftList.length}</span>
              )}
            </button>
            <button
              onClick={() => { 
                localStorage.removeItem('tuzhong-current-step')
                localStorage.removeItem('tuzhong-generated-data')
                localStorage.removeItem('tuzhong-volume-config')
                localStorage.removeItem('tuzhong-generated-chapters')
                localStorage.removeItem('tuzhong-current-chapter-idx')
                localStorage.removeItem('tuzhong-active-novel-id')
                // 🔥 一并清除「输入主题」快照：否则开新书时会把上一本的主题/主角设定残留带进新流程
                localStorage.removeItem('tuzhong-theme-input')
                setAiGuideNovelId(null); 
                setShowAIGuide(true) 
              }}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-[#c8364d] to-[#b8860b] text-white rounded-lg hover:from-[#a82841] hover:to-[#d4a84b] transition-all shadow-lg shadow-stone-200 hover:shadow-xl hover:-translate-y-0.5 font-medium"
            >
              <Sparkles className="w-4 h-4" />
              <span>AI全自动生成</span>
            </button>
            <button
              onClick={openCreateModal}
              className="flex items-center space-x-2 px-4 py-2 bg-[#c8364d] text-white rounded-lg hover:bg-[#a82841] transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>新建作品</span>
            </button>
          </div>
        </div>

        {/* 作品网格 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-5 gap-4">
          {/* 作品卡片 */}
          {filteredNovels.map((novel, index) => (
            <div
              key={novel.id}
              className="group bg-white rounded-xl border border-stone-200 hover:border-stone-300 hover:shadow-lg transition-all overflow-hidden relative"
            >
              {/* 删除按钮 - 悬停时显示 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteTarget(novel)
                }}
                className="absolute top-3 right-3 z-10 w-8 h-8 bg-black/50 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                title="删除作品"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* 封面区域 - 点击跳转作品编辑/阅读页面 */}
              <Link
                href={`/write/${novel.id}`}
                className="block"
              >
              <div className={`aspect-[2/3] bg-gradient-to-br ${coverGradients[index % coverGradients.length]} relative overflow-hidden w-full`}>
                {novel.cover ? (
                  (() => {
                    const links = String(novel.cover).split('|||').map((s) => s.trim()).filter(Boolean)
                    const fIdx = coverFallbackMap[novel.id] ?? 0
                    if (fIdx < 0) return null
                    const useUrl = links[fIdx] || links[0] || ''
                    return useUrl ? (
                      <img
                        key={fIdx}
                        src={useUrl}
                        alt={novel.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={() => {
                          const next = fIdx + 1
                          if (next < links.length) {
                            setCoverFallbackMap((m) => ({ ...m, [novel.id]: next }))
                          } else {
                            setCoverFallbackMap((m) => ({ ...m, [novel.id]: -1 }))
                          }
                        }}
                      />
                    ) : null
                  })()
                ) : null}
                <div className="absolute inset-0 bg-black/20"></div>
                <div className="absolute top-2 right-2">
                  <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                    novel.status === 'writing' ? 'bg-green-100 text-green-700' :
                    novel.status === 'completed' ? 'bg-stone-100 text-stone-700' :
                    'bg-stone-100 text-stone-700'
                  }`}>
                    {novel.status === 'writing' ? '创作中' :
                     novel.status === 'completed' ? '已完成' : '已暂停'}
                  </span>
                </div>
                <div className="absolute bottom-2 left-2 right-2">
                  <h4 className="text-white font-bold text-sm truncate drop-shadow-md">{novel.title || '未命名作品'}</h4>
                  <p className="text-white/90 text-xs truncate drop-shadow-md">{novel.genre}</p>
                </div>
              </div>

              {/* 内容区域 */}
              <div className="p-3">
                <p className="text-stone-600 text-xs line-clamp-2 mb-2 h-8">{typeof novel.description === 'string' ? novel.description : '暂无简介'}</p>

                {/* 统计信息 */}
                <div className="flex items-center justify-between text-[11px] text-stone-500 mb-2">
                  <div className="flex items-center space-x-1">
                    <FileText className="w-3 h-3" />
                    <span>{novel.wordCount > 0 ? `${(novel.wordCount / 10000).toFixed(1)}万字` : '未开始'}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{novel.lastModified}</span>
                  </div>
                </div>

                {/* 健康度 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${getHealthColor(novel.healthScore)}`}></div>
                    <span className="text-[11px] text-stone-600">{getHealthText(novel.healthScore)}</span>
                  </div>
                  <span className="text-[11px] font-medium text-stone-900">{novel.healthScore}分</span>
                </div>
                <div className="mt-1.5 h-1 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getHealthColor(novel.healthScore)} transition-all`}
                    style={{ width: `${novel.healthScore}%` }}
                  ></div>
                </div>
              </div>
              </Link>
            </div>
          ))}
        </div>

      {/* ==================== 新建作品弹窗 ==================== */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-6 border-b border-stone-100">
              <h3 className="text-lg font-semibold text-stone-900">新建作品</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>

            {/* 创建成功提示 */}
            {createSuccess ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <h4 className="text-lg font-semibold text-stone-900 mb-2">作品创建成功！</h4>
                <p className="text-sm text-stone-500">正在跳转到 AI 小说自动创作向导...</p>
              </div>
            ) : (
              <form onSubmit={handleCreateNovel} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">作品名称 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-stone-500 outline-none"
                    placeholder="输入作品名称"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">作品类型</label>
                  <select
                    value={newGenre}
                    onChange={(e) => setNewGenre(e.target.value)}
                    className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-stone-500 outline-none"
                  >
                    {GENRE_OPTIONS.map((genre) => (
                      <option key={genre} value={genre}>
                        {genre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">作品简介</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-stone-500 outline-none resize-none"
                    rows={3}
                    placeholder="简单描述一下你的作品..."
                  ></textarea>
                </div>
                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 border border-stone-300 text-stone-700 rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={!newTitle.trim() || isCreating}
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-stone-700 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>创建中...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>创建</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 草稿箱弹窗 */}
      {showDraftsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setShowDraftsModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
              <h3 className="text-lg font-semibold text-stone-900 flex items-center gap-2"><FolderOpen className="w-5 h-5 text-[#c8364d]" /> 草稿箱</h3>
              <button onClick={() => setShowDraftsModal(false)} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-y-auto">
              {draftList.length === 0 ? (
                <div className="text-center py-12 text-stone-400">
                  <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>暂无草稿</p>
                  <p className="text-sm mt-1">AI 全自动生成中途退出/刷新未完成的作品会保存在这里（已与向导草稿箱同步）</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {draftList.map(n => (
                    <div key={n.id} className="flex items-center justify-between p-3 border border-stone-200 rounded-lg hover:bg-stone-50">
                      <div className="min-w-0">
                        <div className="font-medium text-stone-900 truncate">{n.title || '（未命名草稿）'}</div>
                        <div className="text-xs text-stone-500 mt-0.5">
                          {n.genre || '未定题材'} · {((n.wordCount || 0) / 10000).toFixed(1)}万字
                          {n.lastModified ? ' · ' + n.lastModified : (n.updatedAt ? ' · ' + new Date(n.updatedAt).toLocaleDateString('zh-CN') : '')}
                          {' · 未完成(可续生成)'}
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-3 flex items-center gap-2">
                        <button onClick={() => handleResumeDraftItem(n)} className="px-3 py-1.5 bg-[#c8364d] text-white rounded-lg text-sm hover:bg-[#a82841] transition-colors">继续生成</button>
                        <button onClick={() => setDeleteTarget({ id: n.id, title: n.title || '（未命名草稿）' })} title="删除草稿" className="px-2 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition-colors">🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-stone-200 text-xs text-stone-400">草稿已与服务端同步：此处删除会同步到「AI 全自动生成」向导内的草稿箱，反之亦然。</div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-stone-900">确认删除</h3>
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-stone-400 hover:text-stone-600 p-1 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center py-4">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <p className="text-stone-700 mb-1">
                确定要删除作品
              </p>
              <p className="text-lg font-bold text-stone-900 mb-2">《{deleteTarget.title}》</p>
              <p className="text-sm text-stone-500">删除后无法恢复，所有章节和正文将被清除</p>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 border border-stone-300 text-stone-700 rounded-lg hover:bg-stone-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDeleteNovel}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

        </>
      )}
    </div>
  )
}
