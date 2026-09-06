'use client'

import { useState, useEffect, Fragment, useRef } from 'react'
import {
  Globe,
  Eye,
  Clock,
  Plus,
  Search,
  X,
  Star,
  AlertTriangle,
  Filter,
  MapPin,
  Scroll,
  Swords,
  Building2,
  Bug,
  Gem,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Tag,
  ChevronDown,
  FileText,
  Users,
  Heart,
  Edit3,
  Trash2,
  Sparkles,
  Zap,
  Target,
  Network,
  Settings,
  Layers,
  Image,
  Upload,
} from 'lucide-react'
import Link from 'next/link'

// ============ 类型定义 ============

interface Novel {
  id: string
  title: string
  genre?: string
  status?: string
  wordCount?: number
  lastModified?: string
  created_at?: string
  cover?: string
  description?: string
  userId?: string
  chapters?: number
  characters?: number
  volumes?: number
}

interface WorldSetting {
  id: string
  name: string
  category: string
  description: string
  createdAt: string
  novelId?: string
}

interface Foreshadowing {
  id: string
  content: string
  type: string
  plantedChapter: number
  plannedRecoveryChapter: number | null
  status: 'active' | 'recovered' | 'abandoned'
  importance: number
}

interface TimelineEvent {
  id: string
  chapter: number
  title: string
  description: string
  isMainline: boolean
}

interface RelationshipItem {
  id: string
  from: string
  to: string
  type: string
  description: string
  development?: string
  createdAt: string
  updatedAt?: string
}

interface TypeItem {
  id: string
  name: string
  category: string
  description?: string
  order: number
  // 金手指类型详细字段（与阶段3世界构建-金手指组对齐）
  coreFunction?: string        // 核心功能
  triggerCondition?: string    // 触发条件（原 specificAbilities，重新定义为触发条件）
  limitations?: string         // 限制代价
  growthPath?: string          // 成长路径
  // 兼容字段：旧数据迁移用，新数据不再写入
  specificAbilities?: string
  // 体系类型详细字段（与阶段3世界构建-力量体系组对齐）
  realmSystem?: string         // 境界划分（12级）
  cultivationMethod?: string   // 修炼方式
  restraintRelation?: string   // 克制关系
}

const relationTypeOptions = ['盟友', '敌对', '师徒', '朋友', '对手', '亲属', '君臣', '上下级', '主仆', '从属', '同乡', '同僚', '恋人', '仇敌', '宿敌', '情敌', '故交', '同门', '同族', '恩人', '宿怨', '合作', '利用', '仰慕', '暗恋', '青梅竹马', '生死之交', '莫逆之交', '一面之缘', '血海深仇', '势不两立', '道侣', '未婚夫妻', '契约关系', '附庸', '共犯', '知情者', '监视者', '守护者', '傀儡', '替身', '转世', '前世', '同魂', '血脉', '义结金兰', '结拜', '追随之', '信仰', '信徒']

const categoryOptions = ['地理', '历史', '力量体系', '组织势力', '种族生物', '物品道具', '规则设定']

const categoryIcons: Record<string, React.ElementType> = {
  '地理': MapPin,
  '历史': Scroll,
  '力量体系': Swords,
  '组织势力': Building2,
  '种族生物': Bug,
  '物品道具': Gem,
  '规则设定': BookOpen,
}

const categoryColors: Record<string, string> = {
  '地理': 'bg-green-100 text-green-700',
  '历史': 'bg-amber-100 text-amber-700',
  '力量体系': 'bg-red-100 text-red-700',
  '组织势力': 'bg-blue-100 text-blue-700',
  '种族生物': 'bg-purple-100 text-purple-700',
  '物品道具': 'bg-yellow-100 text-yellow-700',
  '规则设定': 'bg-indigo-100 text-indigo-700',
}

// 通用日期解析：兼容 ISO 字符串 和 纯数字毫秒时间戳，避免 Invalid Date
function parseDateFlex(v: string | number | undefined | null): Date | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'number') {
    const d = new Date(v)
    if (!isNaN(d.getTime())) return d
    return null
  }
  const s = String(v).trim()
  if (!s) return null
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    const d = new Date(n)
    if (!isNaN(d.getTime())) return d
    return null
  }
  const d2 = new Date(s)
  if (!isNaN(d2.getTime())) return d2
  return null
}
function fmtDateFlex(v: string | number | undefined | null, fallback: string = '—'): string {
  const d = parseDateFlex(v)
  if (!d) return fallback
  try { return d.toLocaleDateString('zh-CN') } catch { return fallback }
}

// ============ 主组件 ============

type TopTabType = 'novel' | 'types'
type SubTabType = 'ability' | 'system'
type TabType = 'world' | 'foreshadow' | 'timeline' | 'relationships' | 'aiData'

export default function WorldSettingsPage() {
  const [activeTopTab, setActiveTopTab] = useState<TopTabType>('novel')
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>('ability')
  const [activeTab, setActiveTab] = useState<TabType>('world')

  // 作品选择状态
  const [novels, setNovels] = useState<Novel[]>([])
  const [selectedNovelId, setSelectedNovelId] = useState<string>('')
  const [loadingNovels, setLoadingNovels] = useState(true)

  // 世界设定状态
  const [settings, setSettings] = useState<WorldSetting[]>([])
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewingSetting, setViewingSetting] = useState<WorldSetting | null>(null)
  const [showAddSettingModal, setShowAddSettingModal] = useState(false)
  const [newSetting, setNewSetting] = useState({ name: '', category: '地理', description: '' })
  const [loadingSettings, setLoadingSettings] = useState(false)

  // 类型维护状态
  const [abilityTypes, setAbilityTypes] = useState<TypeItem[]>([])
  const [systemTypes, setSystemTypes] = useState<TypeItem[]>([])
  const [loadingTypes, setLoadingTypes] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editingType, setEditingType] = useState<TypeItem | null>(null)
  const [typeForm, setTypeForm] = useState({
    name: '',
    category: '其他',
    description: '',
    order: 999,
    coreFunction: '',
    triggerCondition: '',
    limitations: '',
    growthPath: '',
    realmSystem: '',
    cultivationMethod: '',
    restraintRelation: '',
  })
  const [generatingTypeDetail, setGeneratingTypeDetail] = useState(false)
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null)

  // 伏笔追踪状态
  const [foreshadowings, setForeshadowings] = useState<Foreshadowing[]>([])
  const [foreshadowFilter, setForeshadowFilter] = useState('全部')
  const [showAddForeshadowModal, setShowAddForeshadowModal] = useState(false)
  const [newForeshadow, setNewForeshadow] = useState({
    content: '',
    type: '伏笔',
    plantedChapter: 1,
    plannedRecoveryChapter: '',
    importance: 3,
  })

  // 时间线状态
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'mainline' | 'side'>('all')
  const [showAddTimelineModal, setShowAddTimelineModal] = useState(false)

  // 人物关系状态
  const [relationships, setRelationships] = useState<RelationshipItem[]>([])
  const [loadingRelationships, setLoadingRelationships] = useState(false)
  const [showAddRelModal, setShowAddRelModal] = useState(false)
  const [editingRelId, setEditingRelId] = useState<string | null>(null)
  const [relFilter, setRelFilter] = useState('全部')
  const [newRel, setNewRel] = useState({ from: '', to: '', type: '盟友', description: '', development: '' })

  // AI生成数据状态
  const [aiData, setAiData] = useState<{
    idea?: { title?: string; protagonistName?: string; tagline?: string; sellingPoints?: string[] | string }
    worldbuilding?: { era?: string; geography?: string; powerSystem?: string; socialStructure?: string }
    powerSystem?: { worldPowerSystem?: { name?: string; description?: string }; protagonistAbility?: { name?: string } }
    characters?: {
      protagonist?: { name?: string; identity?: string }
      femaleLead?: { name?: string }
      femaleLeads?: Array<{ name?: string }>
      antagonists?: Array<{ name?: string; identity?: string }>
    }
    factions?: { factions?: Array<{ name?: string; description?: string; camp?: string }> }
    keyPlots?: { volumes?: Array<{ name?: string; title?: string; summary?: string; coreObjective?: string; openingNode?: { event?: string } }> }
    outline?: { storyOrigin?: string; mainPlot?: string[] }
    synopsis?: Record<string, unknown>
  }>({})
  const [loadingAiData, setLoadingAiData] = useState(false)

  // 加载作品列表（增强容错：支持多次重试 + 解析异常降级）
  useEffect(() => {
    let cancelled = false
    const fetchNovels = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return
        try {
          setLoadingNovels(true)
          const token = localStorage.getItem('token') || localStorage.getItem('auth_token') || ''
          const headers: Record<string, string> = {}
          if (token) headers['Authorization'] = 'Bearer ' + token
          const response = await fetch('/tuzhong-wenshu/api/novels', {
            headers,
            cache: 'no-store',
          })
          if (!response.ok) {
            if (attempt < 2) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue }
            setLoadingNovels(false)
            break
          }
          const text = await response.text()
          if (cancelled) return
          let data: any = null
          try { data = JSON.parse(text) } catch {
            // 响应被截断：尝试截取有效 JSON 部分
            const braceEnd = text.lastIndexOf(']}')
            if (braceEnd > 0) {
              try { data = JSON.parse(text.substring(0, braceEnd + 2)) } catch { data = null }
            }
          }
          if (data) {
            const list = data.data || data.novels || (Array.isArray(data) ? data : [])
            if (Array.isArray(list) && list.length > 0) {
              setNovels(list)
              setLoadingNovels(false)
              return
            }
          }
          if (attempt < 2) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))) }
        } catch (error) {
          console.error('加载作品列表失败 (attempt ' + (attempt + 1) + '):', error)
          if (attempt < 2) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))) }
        }
      }
      setLoadingNovels(false)
    }
    fetchNovels()
    return () => { cancelled = true }
  }, [])

  // 加载类型数据
  const fetchTypes = async () => {
    try {
      setLoadingTypes(true)
      const response = await fetch('/tuzhong-wenshu/api/settings/types')
      if (response.ok) {
        const text = await response.text()
        try {
          const data = JSON.parse(text)
          if (data.success && data.data) {
            setAbilityTypes(data.data.abilityTypes || [])
            setSystemTypes(data.data.systemTypes || [])
          } else {
            console.warn('类型数据返回异常:', data)
          }
        } catch (parseErr) {
          console.error('类型数据 JSON 解析失败（可能响应被截断）:', parseErr, '响应长度:', text?.length)
        }
      }
    } catch (error) {
      console.error('加载类型数据失败:', error)
    } finally {
      setLoadingTypes(false)
    }
  }

  useEffect(() => {
    queueMicrotask(function () { fetchTypes() })
  }, [])

  // 打开新增类型弹窗
  const handleOpenAddType = () => {
    setEditingType(null)
    setTypeForm({
      name: '',
      category: '其他',
      description: '',
      order: 999,
      coreFunction: '',
      triggerCondition: '',
      limitations: '',
      growthPath: '',
      realmSystem: '',
      cultivationMethod: '',
      restraintRelation: '',
    })
    setShowTypeModal(true)
  }

  // 打开编辑类型弹窗
  const handleOpenEditType = (item: TypeItem) => {
    setEditingType(item)
    setTypeForm({
      name: item.name,
      category: item.category,
      description: item.description || '',
      order: item.order,
      coreFunction: item.coreFunction || '',
      // 字段迁移兼容：优先 triggerCondition，回退到 specificAbilities
      triggerCondition: item.triggerCondition || item.specificAbilities || '',
      limitations: item.limitations || '',
      growthPath: item.growthPath || '',
      realmSystem: item.realmSystem || '',
      cultivationMethod: item.cultivationMethod || '',
      restraintRelation: item.restraintRelation || '',
    })
    setShowTypeModal(true)
  }

  // 保存类型
  const handleSaveType = async () => {
    if (!typeForm.name.trim()) {
      alert('请输入类型名称')
      return
    }

    try {
      const currentType = activeSubTab === 'ability' ? 'ability' : 'system'
      const method = editingType ? 'PUT' : 'POST'
      const body = editingType
        ? { type: currentType, item: { ...typeForm, id: editingType.id } }
        : { type: currentType, item: typeForm }

      const response = await fetch('/tuzhong-wenshu/api/settings/types', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setShowTypeModal(false)
          fetchTypes()
        }
      }
    } catch (error) {
      console.error('保存类型失败:', error)
      alert('保存失败，请重试')
    }
  }

  // 删除类型
  const handleDeleteType = async (id: string) => {
    if (!confirm('确定要删除这个类型吗？')) {
      return
    }

    try {
      const currentType = activeSubTab === 'ability' ? 'ability' : 'system'
      const response = await fetch(`/tuzhong-wenshu/api/settings/types?type=${currentType}&id=${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          fetchTypes()
        }
      }
    } catch (error) {
      console.error('删除类型失败:', error)
      alert('删除失败，请重试')
    }
  }

  // AI自动生成详细字段
  const handleAiGenerateTypeDetail = async () => {
    if (!typeForm.name.trim()) {
      alert('请先输入类型名称')
      return
    }

    const currentType = activeSubTab === 'ability' ? 'ability' : 'system'
    const novelGenre = selectedNovel?.genre || ''

    setGeneratingTypeDetail(true)
    try {
      const response = await fetch('/tuzhong-wenshu/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'typeDetail',
          novelId: selectedNovelId || '',
          input: typeForm.name,
          field: currentType,
          genre: novelGenre,
          keywords: [],
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          const generated = data.data
          setTypeForm((prev) => ({
            ...prev,
            description: generated.description || prev.description,
            coreFunction: generated.coreFunction || prev.coreFunction,
            // 兼容 AI 返回的新字段 triggerCondition 和旧字段 specificAbilities
            triggerCondition: generated.triggerCondition || generated.specificAbilities || prev.triggerCondition,
            limitations: generated.limitations || prev.limitations,
            growthPath: generated.growthPath || prev.growthPath,
            realmSystem: generated.realmSystem || prev.realmSystem,
            cultivationMethod: generated.cultivationMethod || prev.cultivationMethod,
            restraintRelation: generated.restraintRelation || prev.restraintRelation,
          }))
        } else {
          alert(data.error || data.message || 'AI生成失败，请重试')
        }
      } else {
        const errData = await response.json().catch(() => ({}))
        alert(errData.error || 'AI生成失败，请重试')
      }
    } catch (error) {
      console.error('AI生成详细字段失败:', error)
      alert('AI生成失败，请检查网络后重试')
    } finally {
      setGeneratingTypeDetail(false)
    }
  }

  // 获取当前选中类型列表
  const getCurrentTypeList = () => {
    return activeSubTab === 'ability' ? abilityTypes : systemTypes
  }

  // 按分类分组
  const getTypesByCategory = () => {
    const list = getCurrentTypeList()
    const groups: Record<string, TypeItem[]> = {}
    list.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = []
      }
      groups[item.category].push(item)
    })
    return groups
  }

  // 加载设定数据（当选择作品后）
  useEffect(() => {
    if (!selectedNovelId) {
      queueMicrotask(function () {
        setSettings([])
        setForeshadowings([])
        setTimelineEvents([])
        setRelationships([])
        setAiData({})
      })
      return
    }

    const fetchSettings = async () => {
      try {
        setLoadingSettings(true)
        setLoadingAiData(true)
        // 🔥 携带 auth token 确保能读取作品设定
        const token = localStorage.getItem('token') || localStorage.getItem('auth_token') || ''
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = 'Bearer ' + token
        const response = await fetch(`/tuzhong-wenshu/api/settings?novelId=${selectedNovelId}`, { headers })
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setSettings(data.data.worldSettings || [])
            setForeshadowings(data.data.foreshadowings || [])
            setTimelineEvents(data.data.timelineEvents || [])
            setAiData({
              worldbuilding: data.data.worldbuilding || {},
              powerSystem: data.data.powerSystem || {},
              characters: data.data.characters || {},
              factions: data.data.factions || {},
              keyPlots: data.data.keyPlots || {},
              idea: data.data.idea || {},
              synopsis: data.data.synopsis || {},
              outline: data.data.outline || {},
            })
          }
        }
      } catch (error) {
        console.error('加载设定数据失败:', error)
      } finally {
        setLoadingSettings(false)
        setLoadingAiData(false)
      }
    }

    const fetchRelationships = async () => {
      try {
        setLoadingRelationships(true)
        const token = localStorage.getItem('token') || localStorage.getItem('auth_token') || ''
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = 'Bearer ' + token
        const response = await fetch(`/tuzhong-wenshu/api/characters/relationships?novelId=${selectedNovelId}`, { headers })
        if (response.ok) {
          const data = await response.json()
          setRelationships(data.data || [])
        }
      } catch (error) {
        console.error('加载人物关系失败:', error)
      } finally {
        setLoadingRelationships(false)
      }
    }

    fetchSettings()
    fetchRelationships()
  }, [selectedNovelId])

  // 筛选世界设定
  const filteredSettings = settings.filter((s) => {
    const matchesCategory = selectedCategory === '全部' || s.category === selectedCategory
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // 筛选伏笔
  const _fsStatusMap: Record<string, string> = { '活跃': 'active', '已回收': 'recovered', '已废弃': 'abandoned' }
  const filteredForeshadowings = foreshadowings.filter((f) => {
    if (foreshadowFilter === '全部') return true
    const want = _fsStatusMap[foreshadowFilter] || foreshadowFilter
    const actual = f.status === 'resolved' ? 'recovered' : f.status
    return actual === want
  })

  // 筛选时间线
  const filteredTimeline = timelineEvents.filter((e) => {
    if (timelineFilter === 'all') return true
    if (timelineFilter === 'mainline') return e.isMainline
    return !e.isMainline
  })

  // 添加设定
  const handleAddSetting = async () => {
    if (!newSetting.name.trim() || !selectedNovelId) return
    
    const setting: WorldSetting = {
      id: String(Date.now()),
      name: newSetting.name,
      category: newSetting.category,
      description: newSetting.description,
      createdAt: new Date().toISOString().split('T')[0],
      novelId: selectedNovelId,
    }
    
    try {
      const response = await fetch('/tuzhong-wenshu/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...setting, novelId: selectedNovelId, type: 'worldSetting' }),
      })
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setSettings([...settings, data.data])
        } else {
          setSettings([...settings, setting])
        }
      } else {
        setSettings([...settings, setting])
      }
    } catch (error) {
      setSettings([...settings, setting])
    }
    
    setNewSetting({ name: '', category: '地理', description: '' })
    setShowAddSettingModal(false)
  }

  // 添加伏笔
  const handleAddForeshadow = () => {
    if (!newForeshadow.content.trim()) return
    const foreshadow: Foreshadowing = {
      id: String(Date.now()),
      content: newForeshadow.content,
      type: newForeshadow.type,
      plantedChapter: newForeshadow.plantedChapter,
      plannedRecoveryChapter: newForeshadow.plannedRecoveryChapter ? Number(newForeshadow.plannedRecoveryChapter) : null,
      status: 'active',
      importance: newForeshadow.importance,
    }
    setForeshadowings([...foreshadowings, foreshadow])
    setNewForeshadow({ content: '', type: '伏笔', plantedChapter: 1, plannedRecoveryChapter: '', importance: 3 })
    setShowAddForeshadowModal(false)
  }

  // 人物关系 CRUD
  const handleAddRelationship = async () => {
    if (!newRel.from.trim() || !newRel.to.trim() || !selectedNovelId) return
    try {
      const response = await fetch('/tuzhong-wenshu/api/characters/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelId: selectedNovelId, ...newRel }),
      })
      if (response.ok) {
        const data = await response.json()
        setRelationships([...relationships, data.data])
        setNewRel({ from: '', to: '', type: '盟友', description: '', development: '' })
        setShowAddRelModal(false)
      }
    } catch (error) {
      console.error('添加关系失败:', error)
    }
  }

  const handleUpdateRelationship = async () => {
    if (!editingRelId || !selectedNovelId) return
    try {
      const response = await fetch('/tuzhong-wenshu/api/characters/relationships', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelId: selectedNovelId, relationshipId: editingRelId, ...newRel }),
      })
      if (response.ok) {
        const data = await response.json()
        setRelationships(relationships.map(function (r) { return r.id === editingRelId ? data.data : r }))
        setNewRel({ from: '', to: '', type: '盟友', description: '', development: '' })
        setEditingRelId(null)
        setShowAddRelModal(false)
      }
    } catch (error) {
      console.error('更新关系失败:', error)
    }
  }

  const handleDeleteRelationship = async (id: string) => {
    if (!confirm('确定要删除这条关系吗？')) return
    try {
      const response = await fetch(`/tuzhong-wenshu/api/characters/relationships?novelId=${selectedNovelId}&relationshipId=${id}`, { method: 'DELETE' })
      if (response.ok) {
        setRelationships(relationships.filter(function (r) { return r.id !== id }))
      }
    } catch (error) {
      console.error('删除关系失败:', error)
    }
  }

  const handleEditRelationship = (rel: RelationshipItem) => {
    setNewRel({ from: rel.from, to: rel.to, type: rel.type, description: rel.description, development: rel.development || '' })
    setEditingRelId(rel.id)
    setShowAddRelModal(true)
  }

  const filteredRelationships = relationships.filter(function (r) {
    if (relFilter === '全部') return true
    return r.type === relFilter
  })

  const statusLabels: Record<string, string> = {
    active: '活跃',
    recovered: '已回收',
    abandoned: '已废弃',
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    recovered: 'bg-blue-100 text-blue-700',
    abandoned: 'bg-gray-100 text-gray-500',
  }

  const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'world', label: '世界设定', icon: Globe },
    { id: 'foreshadow', label: '伏笔追踪', icon: Eye },
    { id: 'timeline', label: '时间线', icon: Clock },
    { id: 'relationships', label: '人物关系', icon: Users },
    { id: 'aiData', label: 'AI设定概览', icon: Sparkles },
  ]

  // 获取选中作品的名称
  const selectedNovel = novels.find(n => n.id === selectedNovelId)

  // 封面上传状态
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string>('')
  const coverFileInputRef = useRef<HTMLInputElement>(null)
  const prevNovelIdRef = useRef<string>('')

  // Toast 通知状态
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 封面移除确认对话框状态
  const [showRemoveCoverConfirm, setShowRemoveCoverConfirm] = useState(false)

  useEffect(function () {
    if (selectedNovelId && selectedNovelId !== prevNovelIdRef.current) {
      prevNovelIdRef.current = selectedNovelId
      setCoverPreviewUrl('/tuzhong-wenshu/api/novels/cover?id=' + encodeURIComponent(selectedNovelId) + '&_=' + Date.now())
    } else if (!selectedNovelId) {
      setCoverPreviewUrl('')
    }
  }, [selectedNovelId])

  const prevCoverUrlRef = useRef<string>('')

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!selectedNovelId) return
    if (file.size > 5 * 1024 * 1024) { showToast('封面图片不能超过5MB', 'error'); return }
    const mimeRe = new RegExp('image/(jpeg|png|webp|gif|svg)')
    if (!mimeRe.test(file.type)) { showToast('仅支持 JPG/PNG/WebP/GIF/SVG 格式', 'error'); return }
    setCoverUploading(true)
    const localPreview = URL.createObjectURL(file)
    prevCoverUrlRef.current = localPreview
    setCoverPreviewUrl(localPreview)
    const formData = new FormData()
    formData.append('novelId', selectedNovelId)
    formData.append('file', file)
    const token = localStorage.getItem('token') || localStorage.getItem('auth_token') || ''
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = 'Bearer ' + token
    try {
      const res = await fetch('/tuzhong-wenshu/api/novels/upload-cover', {
        method: 'POST',
        headers,
        body: formData,
      })
      if (res.ok) {
        const json = await res.json()
        if (json.success) {
          const newUrl = json.data.cover + '&_=' + Date.now()
          prevCoverUrlRef.current = newUrl
          setCoverPreviewUrl(newUrl)
          showToast('封面已更新', 'success')
        } else {
          showToast('封面上传失败：' + (json.message || '未知错误'), 'error')
          const fallbackUrl = '/tuzhong-wenshu/api/novels/cover?id=' + encodeURIComponent(selectedNovelId) + '&_=' + Date.now()
          if (prevCoverUrlRef.current !== fallbackUrl) {
            prevCoverUrlRef.current = fallbackUrl
            setCoverPreviewUrl(fallbackUrl)
          }
        }
      } else {
        showToast('封面上传失败（HTTP ' + res.status + '）', 'error')
        const fallbackUrl = '/tuzhong-wenshu/api/novels/cover?id=' + encodeURIComponent(selectedNovelId) + '&_=' + Date.now()
        if (prevCoverUrlRef.current !== fallbackUrl) {
          prevCoverUrlRef.current = fallbackUrl
          setCoverPreviewUrl(fallbackUrl)
        }
      }
    } catch {
      showToast('封面上传失败，请重试', 'error')
      const fallbackUrl = '/tuzhong-wenshu/api/novels/cover?id=' + encodeURIComponent(selectedNovelId) + '&_=' + Date.now()
      if (prevCoverUrlRef.current !== fallbackUrl) {
        prevCoverUrlRef.current = fallbackUrl
        setCoverPreviewUrl(fallbackUrl)
      }
    } finally {
      setCoverUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 顶级标签页 */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="flex items-center border-b border-gray-200 px-4">
            <button
              onClick={() => setActiveTopTab('novel')}
              className={'flex items-center space-x-2 px-6 py-4 text-sm font-medium border-b-2 transition-all duration-200 ' +
                (activeTopTab === 'novel'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300')}
            >
              <BookOpen className="w-4 h-4" />
              <span>作品设定</span>
            </button>
            <button
              onClick={() => setActiveTopTab('types')}
              className={'flex items-center space-x-2 px-6 py-4 text-sm font-medium border-b-2 transition-all duration-200 ' +
                (activeTopTab === 'types'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300')}
            >
              <Layers className="w-4 h-4" />
              <span>金手指/体系类型</span>
            </button>
          </div>
        </div>

        {/* 作品设定内容 */}
        {activeTopTab === 'novel' && (
          <>
        {/* 作品选择器 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">选择作品：</span>
            </div>
            {loadingNovels ? (
              <div className="flex items-center space-x-2 text-gray-400">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                <span className="text-sm">加载中...</span>
              </div>
            ) : (
              <div className="relative flex-1 max-w-xs">
                <select
                  value={selectedNovelId}
                  onChange={(e) => setSelectedNovelId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white text-sm"
                >
                  <option value="">请先选择作品</option>
                  {novels.map((novel) => (
                    <option key={novel.id} value={novel.id}>
                      {novel.title}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}
            {selectedNovel && (
              <span className="text-sm text-gray-500">
                当前作品：<span className="font-medium text-gray-700">{selectedNovel.title}</span>
              </span>
            )}
          </div>
        </div>

        {/* 作品详情信息面板 */}
        {selectedNovel && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600" />
                作品详情
              </h3>
              <span className={'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ' +
                (selectedNovel.status === 'writing' ? 'bg-blue-50 text-blue-700' :
                 selectedNovel.status === 'completed' ? 'bg-green-50 text-green-700' :
                 selectedNovel.status === 'paused' ? 'bg-amber-50 text-amber-700' :
                 'bg-gray-50 text-gray-600')}>
                <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                {selectedNovel.status === 'writing' ? '连载中' :
                 selectedNovel.status === 'completed' ? '已完结' :
                 selectedNovel.status === 'paused' ? '已暂停' :
                 selectedNovel.status === 'draft' ? '草稿' :
                 selectedNovel.status || '未知状态'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">字数</div>
                <div className="text-lg font-semibold text-gray-900">{(selectedNovel.wordCount || 0).toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">章节</div>
                <div className="text-lg font-semibold text-gray-900">{selectedNovel.chapters || 0}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">人物</div>
                <div className="text-lg font-semibold text-gray-900">{selectedNovel.characters || 0}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">卷数</div>
                <div className="text-lg font-semibold text-gray-900">{selectedNovel.volumes || 0}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">类型</div>
                <div className="text-sm font-medium text-gray-900 truncate">{selectedNovel.genre || '未分类'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">最后更新</div>
                <div className="text-sm font-medium text-gray-900">
                  {fmtDateFlex(selectedNovel.lastModified)}
                </div>
              </div>
            </div>
            {selectedNovel.description && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs text-gray-500 mb-1.5">作品简介</div>
                <p className="text-sm text-gray-700 line-clamp-2">{selectedNovel.description}</p>
              </div>
            )}
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
              <span>创建时间：{fmtDateFlex(selectedNovel.created_at)}</span>
              <span>ID：{selectedNovel.id?.substring(0, 8)}...</span>
            </div>
          </div>
        )}

        {/* 封面修改区域 */}
        {selectedNovelId && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center gap-6">
              {/* 封面预览 */}
              <div className="flex-shrink-0">
                <div className="w-28 h-40 rounded-lg border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
                  {coverPreviewUrl ? (
                    <img
                      src={coverPreviewUrl}
                      alt="封面预览"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <Image className="w-8 h-8 text-gray-300" />
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1.5 text-center">当前封面</p>
              </div>
              {/* 封面操作 */}
              <div className="flex-1">
                <h3 className="text-sm font-medium text-gray-700 mb-2">修改作品封面</h3>
                <p className="text-xs text-gray-500 mb-3">支持 JPG/PNG/WebP/GIF/SVG 格式，最大 5MB</p>
                <div className="flex items-center gap-3">
                  <input
                    ref={coverFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleCoverUpload}
                    disabled={coverUploading}
                  />
                  <button
                    onClick={() => coverFileInputRef.current?.click()}
                    disabled={coverUploading}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {coverUploading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" className="opacity-75" />
                        </svg>
                        <span>上传中...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>上传封面</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowRemoveCoverConfirm(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>移除</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 未选择作品时的空状态提示 */}
        {!selectedNovelId && !loadingNovels && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center mb-6">
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">请先选择作品</h3>
            <p className="text-sm text-gray-500">选择一个作品后，即可查看和管理该作品的设定、伏笔和时间线</p>
          </div>
        )}

        {/* 加载设定数据时的状态 */}
        {selectedNovelId && loadingSettings && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center mb-6">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-sm text-gray-500">正在加载设定数据...</p>
          </div>
        )}

        {/* 标签页导航 */}
        {selectedNovelId && !loadingSettings && (
          <div className="border-b border-gray-200 mb-6">
            <div className="flex items-center space-x-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={'flex items-center space-x-2 px-5 py-3 text-sm font-medium border-b-2 transition-all duration-200 ' +
                    (activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300')}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ========== 世界设定标签页 ========== */}
        {selectedNovelId && !loadingSettings && activeTab === 'world' && (
          <div>
            {/* 分类筛选 + 搜索 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
              <div className="flex items-center space-x-2 flex-wrap">
                <button
                  onClick={() => setSelectedCategory('全部')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategory === '全部'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  全部
                </button>
                {categoryOptions.map((cat) => {
                  const Icon = categoryIcons[cat]
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`flex items-center space-x-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedCategory === cat
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{cat}</span>
                    </button>
                  )
                })}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索设定..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            {/* 设定卡片网格 */}
                    {filteredSettings.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredSettings.map((setting) => {
                          const Icon = categoryIcons[setting.category] || Globe
                          return (
                            <div
                              key={setting.id}
                              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-200 transition-all"
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center space-x-3">
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${categoryColors[setting.category]}`}>
                                    <Icon className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <h3 className="font-semibold text-gray-900">{setting.name}</h3>
                                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full mt-0.5 ${categoryColors[setting.category]}`}>
                                      {setting.category}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 line-clamp-3 mt-2">{typeof setting.description === 'string' ? setting.description : '暂无描述'}</p>
                              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                                <span className="text-xs text-gray-400">{setting.createdAt}</span>
                                <button 
                                  onClick={() => setViewingSetting(setting)}
                                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  查看详情
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                        <div className="w-20 h-20 mx-auto mb-4 bg-blue-50 rounded-full flex items-center justify-center">
                          <Globe className="w-10 h-10 text-blue-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">开始创建世界设定</h3>
                        <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                          {selectedNovelId 
                            ? '为您的作品添加世界观设定，包括地理环境、历史背景、力量体系等内容' 
                            : '请先从上方选择一个作品，然后开始创建设定'}
                        </p>
                        {selectedNovelId && (
                          <button 
                            onClick={() => setShowAddSettingModal(true)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            添加第一个设定
                          </button>
                        )}
                      </div>
                    )}
          </div>
        )}

        {/* ========== 伏笔追踪标签页 ========== */}
        {selectedNovelId && !loadingSettings && activeTab === 'foreshadow' && (
          <div>
            {/* 状态筛选 */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                {['全部', '活跃', '已回收', '已废弃'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setForeshadowFilter(status)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      foreshadowFilter === status
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {status}
                    {status !== '全部' && (
                      <span className="ml-1.5 text-xs">
                        ({foreshadowings.filter(f => status === '活跃' ? f.status === 'active' : status === '已回收' ? f.status === 'recovered' : f.status === 'abandoned').length})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="text-sm text-gray-500">
                共 {foreshadowings.length} 条伏笔
              </div>
            </div>

            {/* 伏笔表格 */}
            {filteredForeshadowings.length > 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">伏笔内容</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">埋设章节</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">计划回收</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">重要程度</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredForeshadowings.map((f) => {
                        const isOverdue = f.status === 'active' && f.plannedRecoveryChapter !== null && f.plannedRecoveryChapter < 20
                        return (
                          <tr key={f.id} className={`hover:bg-gray-50 transition-colors ${isOverdue ? 'bg-red-50' : ''}`}>
                            <td className={`px-6 py-4 text-sm ${isOverdue ? 'text-red-700 font-medium' : 'text-gray-900'}`}>
                              <div className="flex items-center space-x-2">
                                {isOverdue && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                                <span>{f.content}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">{f.type}</span>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600 text-center">第{f.plantedChapter}章</td>
                            <td className={`px-4 py-4 text-sm text-center ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                              {f.plannedRecoveryChapter ? `第${f.plannedRecoveryChapter}章` : '-'}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className={`px-2 py-1 text-xs rounded-full ${statusColors[f.status]}`}>
                                {statusLabels[f.status]}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <div className="flex items-center justify-center space-x-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    className={`w-3.5 h-3.5 ${star <= f.importance ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`}
                                  />
                                ))}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <div className="w-20 h-20 mx-auto mb-4 bg-purple-50 rounded-full flex items-center justify-center">
                  <Eye className="w-10 h-10 text-purple-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">管理您的伏笔</h3>
                <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                  追踪作品中的重要线索，记录埋设位置、回收计划和当前状态，确保剧情连贯不脱节
                </p>
                <button 
                  onClick={() => setShowAddForeshadowModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  记录第一个伏笔
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========== 时间线标签页 ========== */}
        {selectedNovelId && !loadingSettings && activeTab === 'timeline' && (
          <div>
            {/* 主线/支线切换 */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-2">
                {[
                  { id: 'all', label: '全部' },
                  { id: 'mainline', label: '主线' },
                  { id: 'side', label: '支线' },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setTimelineFilter(filter.id as typeof timelineFilter)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      timelineFilter === filter.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="text-sm text-gray-500">
                共 {filteredTimeline.length} 个事件
              </div>
            </div>

            {/* 横向时间轴 */}
            {filteredTimeline.length > 0 ? (
              <>
                <div className="bg-white rounded-xl border border-gray-200 p-8">
                  <div className="relative">
                    {/* 时间轴线 */}
                    <div className="absolute top-8 left-0 right-0 h-0.5 bg-gray-200"></div>

                    {/* 事件节点 */}
                    <div className="flex items-start overflow-x-auto pb-4">
                      {filteredTimeline.map((event, index) => (
                        <div key={event.id} className="flex flex-col items-center flex-shrink-0" style={{ width: `${100 / filteredTimeline.length}%`, minWidth: '140px' }}>
                          {/* 章节号 */}
                          <div className={`text-xs font-medium mb-2 ${event.isMainline ? 'text-blue-600' : 'text-gray-400'}`}>
                            第{event.chapter}章
                          </div>

                          {/* 节点圆点 */}
                          <div className={`w-4 h-4 rounded-full border-2 z-10 ${
                            event.isMainline
                              ? 'bg-blue-600 border-blue-600'
                              : 'bg-white border-gray-400'
                          }`}></div>

                          {/* 连接线 */}
                          <div className={`w-0.5 h-4 ${event.isMainline ? 'bg-blue-300' : 'bg-gray-200'}`}></div>

                          {/* 事件卡片 */}
                          <div className={`mx-1 p-3 rounded-lg border text-center max-w-[140px] ${
                            event.isMainline
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-gray-50 border-gray-200'
                          }`}>
                            <h4 className={`text-sm font-semibold mb-1 ${event.isMainline ? 'text-blue-900' : 'text-gray-700'}`}>
                              {event.title}
                            </h4>
                            <p className="text-xs text-gray-500 line-clamp-2">{typeof event.description === 'string' ? event.description : '暂无描述'}</p>
                            {!event.isMainline && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 bg-gray-200 text-gray-500 text-[10px] rounded">
                                支线
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 时间线图例 */}
                <div className="flex items-center justify-center space-x-6 mt-4 text-sm text-gray-500">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                    <span>主线事件</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full border-2 border-gray-400 bg-white"></div>
                    <span>支线事件</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <div className="w-20 h-20 mx-auto mb-4 bg-orange-50 rounded-full flex items-center justify-center">
                  <Clock className="w-10 h-10 text-orange-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">构建作品时间线</h3>
                <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                  以时间轴形式展示小说的关键事件，清晰区分主线和支线，帮助您把控整体叙事节奏
                </p>
                <button 
                  onClick={() => setShowAddTimelineModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  添加第一个事件
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========== 人物关系标签页 ========== */}
        {selectedNovelId && !loadingSettings && activeTab === 'relationships' && (
          <div>
            {/* 筛选栏 + 操作按钮 */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={function () { setRelFilter('全部') }}
                  className={'px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ' +
                    (relFilter === '全部'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300')}>
                  全部
                </button>
                {relationTypeOptions.map(function (type) {
                  return (
                    <button key={type}
                      onClick={function () { setRelFilter(type) }}
                      className={'px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ' +
                        (relFilter === type
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300')}>
                      {type}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={function () { setNewRel({ from: '', to: '', type: '盟友', description: '', development: '' }); setEditingRelId(null); setShowAddRelModal(true) }}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 hover:-translate-y-0.5 transition-all duration-200 shadow-sm">
                <Plus className="w-4 h-4" />
                <span>新增人物关系</span>
              </button>
            </div>

            {/* 主体内容区 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              {loadingRelationships ? (
                <div className="py-16 text-center">
                  <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-sm text-gray-400">正在加载关系数据...</p>
                </div>
              ) : filteredRelationships.length > 0 ? (
                <div className="space-y-3">
                  {filteredRelationships.map(function (rel) {
                    return (
                      <div key={rel.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-gray-50/50 rounded-xl border border-gray-100 hover:bg-white hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200">
                        {/* 关系双方 */}
                        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
                          <span className="text-sm font-semibold text-gray-800 truncate">{rel.from}</span>
                          <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' +
                            (rel.type === '敌对' || rel.type === '对手' || rel.type === '仇敌'
                              ? 'bg-red-50 text-red-600'
                              : rel.type === '恋人' || rel.type === '亲属'
                              ? 'bg-pink-50 text-pink-600'
                              : 'bg-blue-50 text-blue-600')}>
                            {rel.type}
                          </span>
                          <span className="text-sm font-semibold text-gray-800 truncate">{rel.to}</span>
                        </div>
                        {/* 描述 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-500 truncate">{rel.description || '暂无描述'}</p>
                          {rel.development && <p className="text-xs text-gray-400 mt-0.5 truncate">{rel.development}</p>}
                        </div>
                        {/* 操作 */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={function () { handleEditRelationship(rel) }}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                            title="编辑">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={function () { handleDeleteRelationship(rel.id) }}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200"
                            title="删除">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-14 text-center">
                  <div className="w-16 h-16 mx-auto mb-5 bg-blue-50 rounded-full flex items-center justify-center">
                    <Users className="w-8 h-8 text-blue-400/70" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">管理人物关系</h3>
                  <p className="text-sm text-gray-400 mb-7 max-w-sm mx-auto leading-relaxed">
                    在这里维护人物关系后，可在AI全自动生成小说的人物关系图谱中直接选用
                  </p>
                  <button
                    onClick={function () { setNewRel({ from: '', to: '', type: '盟友', description: '', development: '' }); setEditingRelId(null); setShowAddRelModal(true) }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 hover:-translate-y-0.5 transition-all duration-200 shadow-sm">
                    <Plus className="w-4 h-4" />
                    <span>添加第一条关系</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== AI设定概览标签页 ========== */}
        {selectedNovelId && !loadingSettings && activeTab === 'aiData' && (
          <div>
            {loadingAiData ? (
              <div className="py-16 text-center">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm text-gray-400">正在加载AI生成数据...</p>
              </div>
            ) : !aiData.idea?.title ? (
              <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
                <div className="w-20 h-20 mx-auto mb-4 bg-purple-50 rounded-full flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-purple-400/70" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">暂无AI生成数据</h3>
                <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto leading-relaxed">
                  请在「AI全自动生成小说」中完成各环节的生成，数据将自动同步到此处
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 灵感创作 */}
                {aiData.idea?.title && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Zap className="w-5 h-5 text-yellow-500" /> 灵感创作
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><span className="text-sm text-gray-500">书名：</span><span className="text-sm font-medium text-gray-800">{aiData.idea.title}</span></div>
                      <div><span className="text-sm text-gray-500">主角名：</span><span className="text-sm font-medium text-gray-800">{aiData.idea.protagonistName || '—'}</span></div>
                      <div className="md:col-span-2"><span className="text-sm text-gray-500">一句话简介：</span><span className="text-sm text-gray-700">{aiData.idea.tagline || '—'}</span></div>
                      {aiData.idea.sellingPoints && (
                        <div className="md:col-span-2">
                          <span className="text-sm text-gray-500">核心卖点：</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {(Array.isArray(aiData.idea.sellingPoints) ? aiData.idea.sellingPoints : []).map(function(sp: string, i: number) {
                              return <span key={i} className="px-2 py-0.5 bg-yellow-50 text-yellow-700 text-xs rounded-full border border-yellow-200">{sp}</span>
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 世界观设定 */}
                {aiData.worldbuilding && Object.keys(aiData.worldbuilding).length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Globe className="w-5 h-5 text-blue-500" /> 世界观设定
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {aiData.worldbuilding.era && <div><span className="text-sm text-gray-500">时代背景：</span><span className="text-sm text-gray-700">{aiData.worldbuilding.era}</span></div>}
                      {aiData.worldbuilding.geography && <div><span className="text-sm text-gray-500">地理环境：</span><span className="text-sm text-gray-700">{aiData.worldbuilding.geography}</span></div>}
                      {aiData.worldbuilding.powerSystem && <div className="md:col-span-2"><span className="text-sm text-gray-500">力量体系：</span><span className="text-sm text-gray-700">{aiData.worldbuilding.powerSystem}</span></div>}
                      {aiData.worldbuilding.socialStructure && <div className="md:col-span-2"><span className="text-sm text-gray-500">社会结构：</span><span className="text-sm text-gray-700">{aiData.worldbuilding.socialStructure}</span></div>}
                    </div>
                  </div>
                )}

                {/* 力量体系 */}
                {aiData.powerSystem?.worldPowerSystem?.name && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Swords className="w-5 h-5 text-red-500" /> 力量体系
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><span className="text-sm text-gray-500">世界力量体系：</span><span className="text-sm font-medium text-gray-800">{aiData.powerSystem.worldPowerSystem.name}</span></div>
                      <div><span className="text-sm text-gray-500">主角金手指：</span><span className="text-sm font-medium text-gray-800">{aiData.powerSystem.protagonistAbility?.name || '—'}</span></div>
                      {aiData.powerSystem.worldPowerSystem.description && <div className="md:col-span-2"><span className="text-sm text-gray-500">体系描述：</span><span className="text-sm text-gray-700">{aiData.powerSystem.worldPowerSystem.description}</span></div>}
                    </div>
                  </div>
                )}

                {/* 人物设定 */}
                {aiData.characters?.protagonist?.name && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5 text-green-500" /> 人物设定
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">主角</span>
                        <span className="text-sm font-medium text-gray-800">{aiData.characters.protagonist.name}</span>
                        {aiData.characters.protagonist.identity && <span className="text-xs text-gray-500">({aiData.characters.protagonist.identity})</span>}
                      </div>
                      {aiData.characters.femaleLead?.name && (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-pink-100 text-pink-700 text-xs rounded-full">女主</span>
                          <span className="text-sm font-medium text-gray-800">{aiData.characters.femaleLead.name}</span>
                        </div>
                      )}
                      {Array.isArray(aiData.characters.femaleLeads) && aiData.characters.femaleLeads.filter(function(f) { return f.name !== aiData.characters?.femaleLead?.name }).map(function(f) {
                        return (
                          <div key={f.name} className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-pink-100 text-pink-700 text-xs rounded-full">女主</span>
                            <span className="text-sm font-medium text-gray-800">{f.name}</span>
                          </div>
                        )
                      })}
                      {Array.isArray(aiData.characters.antagonists) && aiData.characters.antagonists.slice(0, 3).map(function(a) {
                        return (
                          <div key={a.name} className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">反派</span>
                            <span className="text-sm font-medium text-gray-800">{a.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 势力设定 */}
                {Array.isArray(aiData.factions?.factions) && aiData.factions.factions.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-indigo-500" /> 势力设定
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {aiData.factions.factions.map(function(f) {
                        return (
                          <span key={f.name} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-sm rounded-lg border border-indigo-200">
                            {f.name}{f.camp ? ' (' + f.camp + ')' : ''}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 关键剧情 */}
                {Array.isArray(aiData.keyPlots?.volumes) && aiData.keyPlots.volumes.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Target className="w-5 h-5 text-orange-500" /> 关键剧情节点
                    </h3>
                    <div className="space-y-3">
                      {aiData.keyPlots.volumes.slice(0, 5).map(function(v, i) {
                        return (
                          <div key={i} className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                            <span className="text-sm font-bold text-orange-600 whitespace-nowrap">{v.name || ('第' + (i + 1) + '卷')}</span>
                            <span className="text-sm text-gray-600 line-clamp-2">{v.coreObjective || v.openingNode?.event || '—'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 大纲 */}
                {aiData.outline?.storyOrigin && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-teal-500" /> 故事大纲
                    </h3>
                    <p className="text-sm text-gray-700 mb-3">{aiData.outline.storyOrigin}</p>
                    {Array.isArray(aiData.outline.mainPlot) && (
                      <div className="space-y-1">
                        {aiData.outline.mainPlot.slice(0, 5).map(function(p: string, i: number) {
                          return <div key={i} className="text-sm text-gray-600">阶段{i + 1}：{p}</div>
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
          </>
        )}

        {/* 金手指/体系类型内容 */}
        {activeTopTab === 'types' && (
          <div className="bg-white rounded-xl border border-gray-200">
            {/* 子标签页 */}
            <div className="flex items-center border-b border-gray-200 px-6">
              <button
                onClick={() => setActiveSubTab('ability')}
                className={'flex items-center space-x-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-all duration-200 ' +
                  (activeSubTab === 'ability'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300')}
              >
                <Zap className="w-4 h-4" />
                <span>金手指类型</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  {abilityTypes.length}
                </span>
              </button>
              <button
                onClick={() => setActiveSubTab('system')}
                className={'flex items-center space-x-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-all duration-200 ' +
                  (activeSubTab === 'system'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300')}
              >
                <Network className="w-4 h-4" />
                <span>世界力量体系类型</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  {systemTypes.length}
                </span>
              </button>
              <div className="ml-auto">
                <button
                  onClick={handleOpenAddType}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>新增类型</span>
                </button>
              </div>
            </div>

            {/* 类型列表 */}
            <div className="p-6">
              {loadingTypes ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm text-gray-500">正在加载类型数据...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(getTypesByCategory()).map(([category, items]) => (
                    <div key={category}>
                      <div className="flex items-center space-x-2 mb-3">
                        <span className="text-sm font-semibold text-gray-700">{category}</span>
                        <span className="text-xs text-gray-400">{items.length} 个</span>
                      </div>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2.5 text-center font-medium text-gray-600 w-16">排序</th>
                              <th className="px-4 py-2.5 text-center font-medium text-gray-600">{activeSubTab === 'ability' ? '金手指名称' : '体系名称'}</th>
                              <th className="px-4 py-2.5 text-center font-medium text-gray-600">{activeSubTab === 'ability' ? '金手指类型' : '体系类型'}</th>
                              <th className="px-4 py-2.5 text-center font-medium text-gray-600">{activeSubTab === 'ability' ? '金手指描述' : '体系描述'}</th>
                              <th className="px-4 py-2.5 text-center font-medium text-gray-600 w-24">详情</th>
                              <th className="px-4 py-2.5 text-center font-medium text-gray-600 w-36">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {items.map((item) => {
                              const hasDetail = activeSubTab === 'ability'
                                ? !!(item.coreFunction || item.triggerCondition || item.specificAbilities || item.limitations || item.growthPath)
                                : !!(item.realmSystem || item.cultivationMethod || item.restraintRelation)
                              const isExpanded = expandedTypeId === item.id
                              return (
                                <Fragment key={item.id}>
                                  <tr className={'hover:bg-gray-50 transition-colors ' + (isExpanded ? 'bg-blue-50/40' : '')}>
                                    <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">{item.order}</td>
                                    <td className="px-4 py-3 text-center whitespace-nowrap font-medium text-gray-900">
                                      <div className="flex items-center justify-center gap-2" title={item.name}>
                                        <span className="overflow-hidden text-ellipsis max-w-[120px]">{item.name}</span>
                                        {hasDetail && (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-50 text-green-600 text-[10px] rounded-full border border-green-200 flex-shrink-0">
                                            <Sparkles className="w-2.5 h-2.5" />
                                            已配置
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">
                                      <span className="overflow-hidden text-ellipsis max-w-[120px] inline-block" title={item.category || '-'}>{item.category || '-'}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">
                                      <span className="overflow-hidden text-ellipsis max-w-[200px] inline-block" title={item.description || '-'}>{item.description || '-'}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center whitespace-nowrap">
                                      <button
                                        onClick={() => setExpandedTypeId(isExpanded ? null : item.id)}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1"
                                        title={isExpanded ? '收起详情' : '展开详情'}
                                      >
                                        <span className="text-xs">{isExpanded ? '收起' : '展开'}</span>
                                        <ChevronDown className={'w-3.5 h-3.5 transition-transform ' + (isExpanded ? 'rotate-180' : '')} />
                                      </button>
                                    </td>
                                    <td className="px-4 py-3 text-center whitespace-nowrap">
                                      <button
                                        onClick={() => handleOpenEditType(item)}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-block mr-1"
                                        title="编辑"
                                      >
                                        <Edit3 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteType(item.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-block"
                                        title="删除"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                  {isExpanded && (
                                    <tr className="bg-gray-50/50">
                                      <td colSpan={6} className="px-6 py-4">
                                        {/* 🔥 优化样式：所有详情字段统一单列纵向排列，保持一致美观 */}
                                        <div className="space-y-4">
                                          {activeSubTab === 'ability' ? (
                                            <>
                                              <div>
                                                <span className="text-xs font-medium text-gray-500">核心功能</span>
                                                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.coreFunction || '暂未配置'}</p>
                                              </div>
                                              <div>
                                                <span className="text-xs font-medium text-gray-500">触发条件</span>
                                                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.triggerCondition || item.specificAbilities || '暂未配置'}</p>
                                              </div>
                                              <div>
                                                <span className="text-xs font-medium text-gray-500">能力限制</span>
                                                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.limitations || '暂未配置'}</p>
                                              </div>
                                              <div>
                                                <span className="text-xs font-medium text-gray-500">成长发展路线</span>
                                                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.growthPath || '暂未配置'}</p>
                                              </div>
                                            </>
                                          ) : (
                                            <>
                                              <div>
                                                <span className="text-xs font-medium text-gray-500">境界/等级体系</span>
                                                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.realmSystem || '暂未配置'}</p>
                                              </div>
                                              <div>
                                                <span className="text-xs font-medium text-gray-500">修炼方式</span>
                                                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.cultivationMethod || '暂未配置'}</p>
                                              </div>
                                              <div>
                                                <span className="text-xs font-medium text-gray-500">克制关系</span>
                                                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.restraintRelation || '暂未配置'}</p>
                                              </div>
                                            </>
                                          )}
                                          {item.description && (
                                            <div className="pt-2 border-t border-gray-200">
                                              <span className="text-xs font-medium text-gray-500">{activeSubTab === 'ability' ? '金手指描述' : '体系描述'}</span>
                                              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.description}</p>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ========== 添加设定弹窗 ========== */}
      {showAddSettingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">添加设定</h3>
              <button
                onClick={() => setShowAddSettingModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input
                  type="text"
                  value={newSetting.name}
                  onChange={(e) => setNewSetting({ ...newSetting, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="设定名称"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                <select
                  value={newSetting.category}
                  onChange={(e) => setNewSetting({ ...newSetting, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">详细描述</label>
                <textarea
                  value={newSetting.description}
                  onChange={(e) => setNewSetting({ ...newSetting, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="描述这个设定的详细内容..."
                ></textarea>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setShowAddSettingModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleAddSetting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== 添加伏笔弹窗 ========== */}
      {showAddForeshadowModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">添加伏笔</h3>
              <button
                onClick={() => setShowAddForeshadowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">伏笔内容</label>
                <textarea
                  value={newForeshadow.content}
                  onChange={(e) => setNewForeshadow({ ...newForeshadow, content: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="描述伏笔的内容..."
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
                  <select
                    value={newForeshadow.type}
                    onChange={(e) => setNewForeshadow({ ...newForeshadow, type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="伏笔">伏笔</option>
                    <option value="暗示">暗示</option>
                    <option value="悬念">悬念</option>
                    <option value="铺垫">铺垫</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">重要程度</label>
                  <div className="flex items-center space-x-1 mt-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setNewForeshadow({ ...newForeshadow, importance: star })}
                        className="focus:outline-none"
                      >
                        <Star
                          className={`w-6 h-6 transition-colors ${
                            star <= newForeshadow.importance ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">埋设章节</label>
                  <input
                    type="number"
                    value={newForeshadow.plantedChapter}
                    onChange={(e) => setNewForeshadow({ ...newForeshadow, plantedChapter: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min={1}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">计划回收章节</label>
                  <input
                    type="number"
                    value={newForeshadow.plannedRecoveryChapter}
                    onChange={(e) => setNewForeshadow({ ...newForeshadow, plannedRecoveryChapter: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="可选"
                    min={1}
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setShowAddForeshadowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleAddForeshadow}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== 添加/编辑人物关系弹窗 ========== */}
      {showAddRelModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6 shadow-xl shadow-black/10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">{editingRelId ? '编辑人物关系' : '新增人物关系'}</h3>
              <button
                onClick={function () { setShowAddRelModal(false); setEditingRelId(null) }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all duration-200">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">角色A</label>
                  <input type="text" value={newRel.from}
                    onChange={function (e) { setNewRel({ ...newRel, from: e.target.value }) }}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 outline-none text-sm" placeholder="输入角色名称" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">角色B</label>
                  <input type="text" value={newRel.to}
                    onChange={function (e) { setNewRel({ ...newRel, to: e.target.value }) }}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 outline-none text-sm" placeholder="输入角色名称" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">关系类型</label>
                <select value={newRel.type}
                  onChange={function (e) { setNewRel({ ...newRel, type: e.target.value }) }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 outline-none text-sm bg-white">
                  {relationTypeOptions.map(function (t) { return <option key={t} value={t}>{t}</option> })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">关系描述</label>
                <textarea value={newRel.description}
                  onChange={function (e) { setNewRel({ ...newRel, description: e.target.value }) }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 outline-none text-sm resize-none" rows={3} placeholder="简要描述两个角色之间的关系..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">关系发展过程 <span className="text-gray-400 font-normal">（可选）</span></label>
                <textarea value={newRel.development}
                  onChange={function (e) { setNewRel({ ...newRel, development: e.target.value }) }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 outline-none text-sm resize-none" rows={2} placeholder="描述关系的发展变化过程..." />
              </div>
              <div className="flex gap-3 pt-5">
                <button
                  onClick={function () { setShowAddRelModal(false); setEditingRelId(null) }}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-all duration-200 text-sm font-medium">取消</button>
                <button
                  onClick={function () { editingRelId ? handleUpdateRelationship() : handleAddRelationship() }}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-200 text-sm font-medium shadow-sm">
                  {editingRelId ? '保存修改' : '确认添加'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== 查看设定详情弹窗 ========== */}
      {viewingSetting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className={`inline-block px-2 py-1 text-xs rounded-full ${categoryColors[viewingSetting.category]}`}>
                  {viewingSetting.category}
                </span>
                <h3 className="text-xl font-bold text-gray-900 mt-2">{viewingSetting.name}</h3>
              </div>
              <button
                onClick={() => setViewingSetting(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
                <p className="text-gray-600 whitespace-pre-wrap">{typeof viewingSetting.description === 'string' ? viewingSetting.description : '暂无描述'}</p>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t border-gray-100">
                <span>创建时间：{viewingSetting.createdAt}</span>
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setViewingSetting(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => {
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors opacity-50 cursor-not-allowed"
                title="编辑功能即将上线"
              >
                编辑（即将上线）
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 类型编辑弹窗 ========== */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                {editingType ? '编辑' + (activeSubTab === 'ability' ? '金手指类型' : '体系类型') : '新增' + (activeSubTab === 'ability' ? '金手指类型' : '体系类型')}
              </h3>
              <button
                onClick={() => setShowTypeModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {activeSubTab === 'ability' ? '金手指名称' : '体系名称'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  placeholder={activeSubTab === 'ability' ? '请输入金手指名称' : '请输入体系名称'}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {activeSubTab === 'ability' ? '金手指类型' : '体系类型'}
                </label>
                <input
                  type="text"
                  value={typeForm.category}
                  onChange={(e) => setTypeForm({ ...typeForm, category: e.target.value })}
                  placeholder="如：超凡类、东方玄幻、其他"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {activeSubTab === 'ability' ? '金手指描述' : '体系描述'}
                </label>
                <textarea
                  value={typeForm.description}
                  onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                  placeholder={activeSubTab === 'ability' ? '详细说明该金手指的运作机制、来源和核心特点' : '详细说明该力量体系的运作规则、修炼方式和核心特点'}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                />
              </div>

              {/* AI自动生成按钮 */}
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-100">
                <Sparkles className={'w-5 h-5 ' + (generatingTypeDetail ? 'text-gray-300' : 'text-purple-500')} />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-700">AI自动生成详细字段</span>
                  <p className="text-xs text-gray-500">{selectedNovel ? '根据当前作品题材自动填充' : '将使用默认题材生成'}</p>
                </div>
                <button
                  onClick={handleAiGenerateTypeDetail}
                  disabled={generatingTypeDetail || !typeForm.name.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingTypeDetail ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>生成中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI生成</span>
                    </>
                  )}
                </button>
              </div>

              {/* 金手指类型详细字段 */}
              {activeSubTab === 'ability' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">核心功能</label>
                    <textarea
                      value={typeForm.coreFunction}
                      onChange={(e) => setTypeForm({ ...typeForm, coreFunction: e.target.value })}
                      placeholder="说明该金手指最核心的功能作用"
                      rows={2}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">触发条件</label>
                    <textarea
                      value={typeForm.triggerCondition}
                      onChange={(e) => setTypeForm({ ...typeForm, triggerCondition: e.target.value })}
                      placeholder="说明该金手指的触发条件（如：生死危机下基因锁开启、特殊血脉激活、系统认主等），100-200字"
                      rows={3}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">能力限制</label>
                    <textarea
                      value={typeForm.limitations}
                      onChange={(e) => setTypeForm({ ...typeForm, limitations: e.target.value })}
                      placeholder="列出使用限制或代价，每项一行"
                      rows={2}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">成长发展路线</label>
                    <textarea
                      value={typeForm.growthPath}
                      onChange={(e) => setTypeForm({ ...typeForm, growthPath: e.target.value })}
                      placeholder="描述该金手指从初期到后期的成长进阶路线"
                      rows={3}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                    />
                  </div>
                </>
              )}

              {/* 体系类型详细字段 */}
              {activeSubTab === 'system' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">境界/等级体系</label>
                    <textarea
                      value={typeForm.realmSystem}
                      onChange={(e) => setTypeForm({ ...typeForm, realmSystem: e.target.value })}
                      placeholder="列出该体系从低到高的境界/等级（建议12级），每个境界一行，格式为'境界名：简要说明'"
                      rows={6}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">修炼方式</label>
                    <textarea
                      value={typeForm.cultivationMethod}
                      onChange={(e) => setTypeForm({ ...typeForm, cultivationMethod: e.target.value })}
                      placeholder="说明该体系的修炼途径、方法和核心要点，100-200字（如：通过科举、军功、门荫等途径入仕；通过引气入体、炼化灵气等修炼）"
                      rows={3}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">克制关系</label>
                    <textarea
                      value={typeForm.restraintRelation}
                      onChange={(e) => setTypeForm({ ...typeForm, restraintRelation: e.target.value })}
                      placeholder="说明该体系与其他力量的克制关系，100-200字（必须包含：被什么克制+克制什么+克制原因，如：巫道克仙道、祖血压万族、被天火/仙道元神克制）"
                      rows={3}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  排序
                </label>
                <input
                  type="number"
                  value={typeForm.order}
                  onChange={(e) => setTypeForm({ ...typeForm, order: parseInt(e.target.value) || 999 })}
                  placeholder="排序数值，越小越靠前"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3 mt-6">
              <button
                onClick={() => setShowTypeModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={handleSaveType}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                {editingType ? '保存修改' : '确认添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast 通知 - 页面居中显示 */}
      {toast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className={'px-6 py-4 rounded-xl shadow-2xl text-sm font-medium text-white flex items-center gap-2 pointer-events-auto ' + 
            (toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600')
          }>
            {toast.type === 'success' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
            {toast.type === 'error' && <AlertTriangle className="w-6 h-6" />}
            {toast.type === 'info' && <AlertTriangle className="w-6 h-6" />}
            <span className="text-base">{toast.message}</span>
          </div>
        </div>
      )}

      {/* 封面移除确认对话框 */}
      {showRemoveCoverConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">确认移除封面</h3>
            <p className="text-sm text-gray-600 mb-4">确定要移除该作品的封面吗？移除后可随时上传新封面替换。</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRemoveCoverConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  if (!selectedNovelId) return
                  const token = localStorage.getItem('token') || localStorage.getItem('auth_token') || ''
                  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
                  if (token) headers['Authorization'] = 'Bearer ' + token
                  setCoverUploading(true)
                  try {
                    const res = await fetch('/tuzhong-wenshu/api/novels', {
                      method: 'PUT',
                      headers,
                      body: JSON.stringify({ id: selectedNovelId, cover: '', coverUrl: '' }),
                    })
                    if (res.ok) {
                      setShowRemoveCoverConfirm(false)
                      prevCoverUrlRef.current = ''
                      setCoverPreviewUrl('')
                      showToast('封面已移除', 'success')
                    } else {
                      showToast('移除封面失败，请重试', 'error')
                    }
                  } catch {
                    showToast('移除封面失败，请重试', 'error')
                  } finally {
                    setCoverUploading(false)
                  }
                }}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
