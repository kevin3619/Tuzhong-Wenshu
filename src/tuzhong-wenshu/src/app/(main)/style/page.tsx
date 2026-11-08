'use client'

import { useState, useEffect } from 'react'
import { getLLMConfig, saveLLMConfig, type LLMConfig } from '@/lib/ai/llm'
import {
  Palette,
  Upload,
  Sparkles,
  ChevronRight,
  Star,
  BookOpen,
  Swords,
  Heart,
  Zap,
  Search,
  Filter,
  MoreVertical,
  Copy,
  Check,
  RefreshCw,
  Download,
  Trash2,
  Edit3,
  Plus,
  AlertTriangle
} from 'lucide-react'
import Link from 'next/link'
import { PRESET_STYLES } from '@/lib/ai-service'

// 扩展预设风格
const extendedStyles = [
  ...PRESET_STYLES,
  {
    id: 'romance-tonghua',
    name: '桐华言情风',
    category: '言情',
    description: '桐华式言情风格，情感细腻，文笔优美，虐心又温暖',
    parameters: {
      formality: 65,
      emotionIntensity: 95,
      descriptionDensity: 85,
      dialogueRatio: 65,
      rhetoricFrequency: 80,
      pacing: 50,
      languageDensity: 75,
      eraFeel: 60,
      excitementDensity: 55
    }
  }
]

export default function StyleWorkshop() {
  const [activeTab, setActiveTab] = useState<'market' | 'my-styles' | 'trainer' | 'laboratory'>('market')
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [searchQuery, setSearchQuery] = useState('')
  const [showStyleDetail, setShowStyleDetail] = useState<string | null>(null)
  const [isTraining, setIsTraining] = useState(false)
  const [trainingStep, setTrainingStep] = useState(0)
  // 风格训练器：真实AI分析状态
  const [trainerText, setTrainerText] = useState('')                    // 用户输入/上传的文本
  const [trainerAnalyzing, setTrainerAnalyzing] = useState(false)        // AI分析中
  const [trainerError, setTrainerError] = useState('')                   // 分析错误信息
  const [trainerResult, setTrainerResult] = useState<{
    parameters: Record<string, number>
    dnaReport: {
      narrativeRhythm: string
      wordHabit: string
      sentenceStructure: string
      emotionExpression: string
      rhetoricFeature: string
      strengths: string
      weaknesses: string
      overallStyle: string
    }
    suggestedName: string
    suggestedCategory: string
    usedModel: string
    sampleLength: number
    originalLength: number
  } | null>(null)
  const [trainerStyleName, setTrainerStyleName] = useState('')           // 用户可编辑的风格名称
  const [trainerSaving, setTrainerSaving] = useState(false)              // 保存中
  const [trainerSaved, setTrainerSaved] = useState(false)                // 已保存
  const fileInputRef = useState<HTMLInputElement | null>(null)
  const [fileInputRefEl, setFileInputRefEl] = fileInputRef
  const [laboratoryParams, setLaboratoryParams] = useState({
    formality: 50,
    emotionIntensity: 70,
    descriptionDensity: 60,
    dialogueRatio: 50,
    rhetoricFrequency: 55,
    pacing: 70,
    languageDensity: 60,
    eraFeel: 50,
    excitementDensity: 75
  })
  const [previewText, setPreviewText] = useState('')
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [copied, setCopied] = useState(false)
  const [editingStyle, setEditingStyle] = useState<string | null>(null)
  const [applyingStyle, setApplyingStyle] = useState<string | null>(null)
  const [deletingStyleId, setDeletingStyleId] = useState<string | null>(null)

  // 用户自定义风格状态
  const [userStyles, setUserStyles] = useState<Array<{
    id: string
    name: string
    description: string
    createdAt: string
    usageCount: number
  }>>([])
  const [isLoadingStyles, setIsLoadingStyles] = useState(false)
  // v4 C8：系统级默认 LLM 配置（当用户 localStorage 未配置时使用）
  const [sysDefaultLlm, setSysDefaultLlm] = useState<LLMConfig | null>(null)
  // 🔥 风格训练器：动态模型名称，从当前配置自动获取
  const [trainerModelName, setTrainerModelName] = useState('大模型')

  // 从 API 获取用户保存的风格
  useEffect(() => {
    const fetchUserStyles = async () => {
      setIsLoadingStyles(true)
      try {
        const response = await fetch('/tuzhong-wenshu/api/styles')
        if (response.ok) {
          const data = await response.json()
          setUserStyles(data.data || [])
        }
      } catch (error) {
        console.error('获取用户风格失败:', error)
      } finally {
        setIsLoadingStyles(false)
      }
    }

    fetchUserStyles()
  }, [])

  // v4 C8：页面初始化时拉取系统级 LLM 默认配置，当 localStorage 未配置时直接使用
  useEffect(() => {
    let active = true
    const fetchSysDefaults = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
        // 🔥 安全修复配套：AI 默认配置只对已登录用户下发，需带 token 并声明需要 AI 配置
        const _hdrs: Record<string, string> = { 'x-want-ai-config': '1' }
        if (token) _hdrs.Authorization = 'Bearer ' + token
        const resp = await fetch('/tuzhong-wenshu/api/config/public', { headers: _hdrs })
        if (!resp.ok) return
        const json = await resp.json()
        // 🔥 修复（P1 泄漏）：此前会把平台级 ai_api_key 取回浏览器并写进 localStorage；
        //   注册是自助的，等于任何用户都能白拿平台 Key。服务端现只回「有无可用默认模型」。
        if (false && json?.code === 200 && json?.data?.ai_default_config && active) {
          const cfg = json.data.ai_default_config as LLMConfig
          // 只在有有效 apiKey 时才采纳
          if (cfg?.apiKey && String(cfg.apiKey).length > 5) {
            setSysDefaultLlm({
              provider: cfg.provider || 'deepseek',
              apiKey: cfg.apiKey,
              baseUrl: cfg.baseUrl || undefined,
              model: cfg.model || ''
            })
            // localStorage 没有就写入一次，用户后续修改不受影响
            if (!getLLMConfig()?.apiKey) {
              try { saveLLMConfig(cfg) } catch (e) { console.error('[style] 首次写入 LLM 配置失败:', e) }
            }
          }
        }
      } catch (_err) { console.error('[style] 解析系统默认 LLM 配置失败:', _err) }
    }
    fetchSysDefaults()
    return () => { active = false }
  }, [])

  // 合并策略：用户 localStorage 配置优先，否则使用系统级默认值
  const effectiveLlmConfig = (): LLMConfig | null => {
    const userCfg = getLLMConfig()
    if (userCfg?.apiKey && userCfg.apiKey.length > 5) return userCfg
    if (sysDefaultLlm?.apiKey) return sysDefaultLlm
    return userCfg
  }

  // 🔥 风格训练器使用 outline 任务路由（7款注册模型自动匹配）
  //     outline 任务首选 sf-glm4-9b（GLM-4-9B-0414 大纲权谋主力），
  //     回退 sf-qwen25-7b（Qwen2.5-7B-Instruct 正文主力）
  const TRAINER_PRIMARY_MODEL = 'GLM-4-9B-0414（大纲权谋主力）'

  // 7款注册模型的名称映射（model 字符串 → 友好显示名）
  const ROUTE_MODEL_DISPLAY_MAP: Record<string, string> = {
    'qwen/qwen2.5-7b-instruct': 'Qwen2.5-7B-Instruct（正文主力）',
    'qwen/qwen3-8b': 'Qwen3-8B（综合备用）',
    'thudm/glm-4-9b-0414': 'GLM-4-9B-0414（大纲权谋主力）',
    'thudm/glm-z1-9b-0414': 'GLM-Z1-9B-0414（角色推理）',
    'qwen/qwen3.5-4b': 'Qwen3.5-4B（极速轻量）',
    'tencent/hunyuan-mt-7b': 'Hunyuan-MT-7B（翻译/润色）',
    'kwai-kolors/kolors': 'Kwai-Kolors/Kolors（封面绘图）',
  }

  // 🔥 获取风格训练器实际使用的模型名称
  // 风格训练器固定走 outline 任务路由，自动匹配最适合的大模型
  const getTrainerModelName = (): string => {
    // 用户配置的模型如果匹配7款注册模型，说明用户使用了对应模型
    const cfg = effectiveLlmConfig()
    if (cfg?.model) {
      const lowerModel = cfg.model.toLowerCase().trim()
      if (ROUTE_MODEL_DISPLAY_MAP[lowerModel]) {
        return ROUTE_MODEL_DISPLAY_MAP[lowerModel]
      }
    }
    // 默认返回训练器实际使用的首选模型（outline → GLM-4-9B-0414）
    return TRAINER_PRIMARY_MODEL
  }

  // 将后端返回的 usedModel（如 THUDM/GLM-4-9B-0414）映射为友好名称
  const formatUsedModelName = (rawModel: string): string => {
    if (!rawModel) return TRAINER_PRIMARY_MODEL
    const lowerModel = rawModel.toLowerCase().trim()
    if (ROUTE_MODEL_DISPLAY_MAP[lowerModel]) {
      return ROUTE_MODEL_DISPLAY_MAP[lowerModel]
    }
    // 取最后一段作为模型名（如 GLM-4-9B-0414）
    const seg = rawModel.split('/').pop() || rawModel
    return seg
  }

  // 🔥 页面加载时获取训练器模型名称
  useEffect(() => {
    const name = getTrainerModelName()
    setTrainerModelName(name)
  }, [sysDefaultLlm])

  const categories = ['全部', '古风', '现代', '科幻', '悬疑', '玄幻', '言情', '历史']

  const safeStr = (val: unknown, fallback: string = ''): string => {
    if (val === null || val === undefined) return fallback
    if (typeof val === 'string') return val
    if (typeof val === 'number') return String(val)
    if (typeof val === 'boolean') return String(val)
    return fallback
  }

  const safeNum = (val: unknown, fallback: number = 0): number => {
    if (typeof val === 'number' && !isNaN(val)) return val
    const num = Number(val)
    return isNaN(num) ? fallback : num
  }

  const filteredStyles = extendedStyles.filter(style => {
    const matchesCategory = selectedCategory === '全部' || style.category === selectedCategory
    const matchesSearch = style.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         style.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const handleStyleClick = (styleId: string) => {
    setShowStyleDetail(styleId)
  }

  const handleStartTraining = () => {
    setIsTraining(true)
    setTrainingStep(1)
    setTrainerText('')
    setTrainerResult(null)
    setTrainerError('')
    setTrainerSaved(false)
    setTrainerStyleName('')
  }

  const handleNextStep = () => {
    if (trainingStep < 3) {
      setTrainingStep(trainingStep + 1)
    } else {
      setIsTraining(false)
      setTrainingStep(0)
    }
  }

  // 风格训练器：处理文件上传
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // 文件大小限制 5MB
    if (file.size > 5 * 1024 * 1024) {
      setTrainerError('文件过大，请上传小于 5MB 的文本文件')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '')
      setTrainerText(content)
      setTrainerError('')
    }
    reader.onerror = () => {
      setTrainerError('文件读取失败，请重试')
    }
    reader.readAsText(file, 'utf-8')
  }

  // 风格训练器：调用AI分析文本
  const handleAnalyzeText = async () => {
    if (!trainerText.trim()) {
      setTrainerError('请先输入或上传文本内容')
      return
    }
    if (trainerText.length < 500) {
      setTrainerError('文本过短，至少需要500字进行分析（建议5000字以上效果更佳）')
      return
    }
    setTrainerAnalyzing(true)
    setTrainerError('')
    setTrainerResult(null)
    setTrainingStep(2) // 切换到"分析中"步骤
    try {
      const token = localStorage.getItem('token') || ''
      const res = await fetch('/tuzhong-wenshu/api/style-trainer/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ text: trainerText }),
      })
      const data = await res.json()
      if (data.code === 200 && data.data) {
        setTrainerResult(data.data)
        setTrainerStyleName(data.data.suggestedName || '我的自定义风格')
        // 🔥 修复：使用后端返回的实际使用的模型名称（映射为友好显示名）
        if (data.data.usedModel) {
          setTrainerModelName(formatUsedModelName(data.data.usedModel))
        }
        setTrainingStep(3) // 切换到"DNA报告"步骤
      } else {
        setTrainerError(data.message || '分析失败，请重试')
        setTrainingStep(1) // 回到上传步骤
      }
    } catch (err) {
      setTrainerError('网络错误，请检查网络连接后重试')
      setTrainingStep(1)
    } finally {
      setTrainerAnalyzing(false)
    }
  }

  // 风格训练器：保存分析结果为自定义风格
  const handleSaveTrainerStyle = async () => {
    if (!trainerResult) return
    const finalName = trainerStyleName.trim() || trainerResult.suggestedName || '我的自定义风格'
    setTrainerSaving(true)
    try {
      const response = await fetch('/tuzhong-wenshu/api/styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: finalName,
          description: trainerResult.dnaReport?.overallStyle || '通过风格训练器AI分析生成的自定义风格',
          parameters: trainerResult.parameters,
        }),
      })
      if (response.ok) {
        setTrainerSaved(true)
        // 刷新用户风格列表
        try {
          const refreshResp = await fetch('/tuzhong-wenshu/api/styles')
          if (refreshResp.ok) {
            const refreshData = await refreshResp.json()
            setUserStyles(refreshData.data || [])
          }
        } catch (e) { console.error('[style] 刷新风格列表失败:', e) }
      } else {
        const errData = await response.json().catch(() => ({}))
        setTrainerError(errData.message || '保存失败，请重试')
      }
    } catch (err) {
      setTrainerError('网络错误，保存失败')
    } finally {
      setTrainerSaving(false)
    }
  }

  // 风格训练器：重置整个流程
  const handleResetTrainer = () => {
    setIsTraining(false)
    setTrainingStep(0)
    setTrainerText('')
    setTrainerResult(null)
    setTrainerError('')
    setTrainerSaved(false)
    setTrainerStyleName('')
  }

  const handleGeneratePreview = async () => {
    const llmConfig = effectiveLlmConfig()
    // 🔥 修复：不再要求浏览器持有平台 Key —— 没配自有模型时交给服务端按
    //   「用户自有模型 > 管理员共享默认」解析（/api/ai/continue 已支持），Key 不出服务端。
    setIsGeneratingPreview(true)
    setPreviewError('')
    setPreviewText('')
    try {
      const res = await fetch('/tuzhong-wenshu/api/ai/continue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: '一个少年站在悬崖边，望着远方的家族演武场，他曾经被认为是废材，但今天一切都变了。',
          // 🔥 修复：旧实现写死 fanqie-shuangwen + 写死样例，用户改任何参数点预览结果都不变
          style: (function () { try { const raw = localStorage.getItem('tuzhong-active-style-data'); if (!raw) return 'fanqie-shuangwen'; const s = JSON.parse(raw); return String((s && (s.id || s.key || s.name)) || 'fanqie-shuangwen') } catch { return 'fanqie-shuangwen' } })(),
          length: 'medium',
          ...(llmConfig?.apiKey ? { llmConfig } : {}),
        }),
      })
      if (res.ok) {
        const json = await res.json()
        if (json.error) {
          setPreviewError(`生成失败：${json.error}`)
          return
        }
        const options = json.data?.options || json.data?.content || []
        const text = Array.isArray(options) ? (options[0] || '') : (typeof options === 'string' ? options : '')
        if (text) {
          setPreviewText(text)
        } else if (json.data?.content && typeof json.data.content === 'string') {
          setPreviewText(json.data.content)
        } else {
          setPreviewError('AI返回的内容为空，请重试或更换模型')
        }
      } else {
        let errorMsg = '生成预览失败'
        try {
          const errData = await res.json()
          errorMsg = errData.error || errorMsg
        } catch (e) { console.error('[style] 解析错误响应体失败:', e) }
        setPreviewError(`${errorMsg}（HTTP ${res.status}）`)
      }
    } catch (err) {
      setPreviewError('网络连接失败，请检查网络或API地址是否正确')
    } finally {
      setIsGeneratingPreview(false)
    }
  }

  // 复制文本
  const handleCopyText = async () => {
    if (!previewText) return
    try {
      await navigator.clipboard.writeText(previewText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('复制失败:', error)
    }
  }

  // 保存为风格
  const handleSaveAsStyle = async () => {
    if (!previewText) return
    try {
      const response = await fetch('/tuzhong-wenshu/api/styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '新风格-' + new Date().toLocaleDateString(),
          description: '在风格实验室中创建的自定义风格',
          parameters: laboratoryParams,
        })
      })
      if (response.ok) {
        alert('风格保存成功！')
      }
    } catch (error) {
      console.error('保存风格失败:', error)
    }
  }

  // 编辑风格
  const handleEditStyle = (styleId: string) => {
    if (!window.confirm('确定要编辑此风格吗？编辑后将进入风格调参模式。')) return
    setEditingStyle(styleId)
  }

  const handleDeleteStyle = (styleId: string) => {
    setDeletingStyleId(styleId)
  }

  const confirmDeleteStyle = async () => {
    if (!deletingStyleId) return
    try {
      const response = await fetch(`/tuzhong-wenshu/api/styles?id=${deletingStyleId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        setUserStyles(prev => prev.filter(s => s.id !== deletingStyleId))
        setDeletingStyleId(null)
      } else {
        alert('删除失败，请重试')
      }
    } catch (error) {
      console.error('删除风格失败:', error)
      alert('删除失败，请检查网络连接')
    }
  }

  // 应用风格
  const handleApplyStyle = async (styleId: string) => {
    setApplyingStyle(styleId)
    try {
      // 查找完整风格数据
      const fullStyle = extendedStyles.find(s => s.id === styleId)
      // 保存风格ID到localStorage
      localStorage.setItem('tuzhong-active-style', styleId)
      // 同时保存完整风格参数到localStorage，供AI生成时使用
      if (fullStyle) {
        localStorage.setItem('tuzhong-active-style-data', JSON.stringify(fullStyle))
      }
      alert('风格已应用！')
    } catch (error) {
      console.error('应用风格失败:', error)
    } finally {
      setApplyingStyle(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 md:py-8">
        {/* 标签页导航 */}
        <div className="flex items-center space-x-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 mb-8">
          {[
            { id: 'market', label: '风格市场', icon: Palette },
            { id: 'my-styles', label: '我的风格', icon: Star },
            { id: 'trainer', label: '风格训练器', icon: Upload },
            { id: 'laboratory', label: '风格实验室', icon: Sparkles },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'market' | 'my-styles' | 'trainer' | 'laboratory')}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg transition-all ${
                activeTab === tab.id 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* 风格市场 */}
        {activeTab === 'market' && (
          <div>
            {/* 搜索和筛选 */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedCategory === cat 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索风格..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            {/* 风格网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredStyles.map((style) => (
                <div 
                  key={style.id}
                  onClick={() => handleStyleClick(style.id)}
                  className="bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all cursor-pointer overflow-hidden"
                >
                  <div className="h-24 bg-gradient-to-br from-blue-500 to-purple-600 relative">
                    <div className="absolute inset-0 bg-black/10"></div>
                    <div className="absolute bottom-4 left-4">
                      <span className="px-2 py-1 bg-white/20 backdrop-blur text-white text-xs rounded-full">
                        {style.category}
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="font-semibold text-gray-900 mb-2">{style.name}</h3>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-4">{style.description}</p>
                    
                    {/* 参数预览 */}
                    <div className="space-y-2">
                      {[
                        { name: '情感强度', value: safeNum(style.parameters.emotionIntensity, 50) },
                        { name: '节奏快慢', value: safeNum(style.parameters.pacing, 50) },
                        { name: '描写密度', value: safeNum(style.parameters.descriptionDensity, 50) },
                      ].map((param) => (
                        <div key={param.name} className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500 w-16">{param.name}</span>
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500"
                              style={{ width: `${Math.max(0, Math.min(100, param.value))}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-400 w-8">{Math.max(0, Math.min(100, param.value))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 我的风格 */}
        {activeTab === 'my-styles' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">我的自定义风格</h2>
              <button 
                onClick={() => setActiveTab('trainer')}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>训练新风格</span>
              </button>
            </div>

            {/* 加载状态 */}
            {isLoadingStyles && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-3 text-gray-600">加载中...</span>
              </div>
            )}

            {/* 空状态 */}
            {!isLoadingStyles && userStyles.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Star className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无自定义风格</h3>
                <p className="text-gray-600 mb-6">
                  训练你的专属写作风格，让AI更好地理解你的创作特点
                </p>
                <button 
                  onClick={() => setActiveTab('trainer')}
                  className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>开始训练</span>
                </button>
              </div>
            )}

            {/* 风格列表 */}
            {!isLoadingStyles && userStyles.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {userStyles.map((style) => (
                  <div 
                    key={style.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                        <Star className="w-6 h-6 text-purple-600" />
                      </div>
                      <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">{safeStr(style.name, '未命名风格')}</h3>
                    <p className="text-sm text-gray-600 mb-4">{safeStr(style.description, '暂无描述')}</p>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>创建于 {safeStr(style.createdAt, '未知')}</span>
                      <span>使用 {safeNum(style.usageCount, 0)} 次</span>
                    </div>
                    <div className="flex space-x-2 mt-4">
                      <button 
                        onClick={() => handleEditStyle(style.id)}
                        className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                      >
                        编辑
                      </button>
                      <button 
                        onClick={() => handleDeleteStyle(style.id)}
                        className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleApplyStyle(style.id)}
                        disabled={applyingStyle === style.id}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                      >
                        {applyingStyle === style.id ? '应用中...' : '使用'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 风格训练器（真实AI分析，接入Qwen3.6-35B-A3B模型） */}
        {activeTab === 'trainer' && (
          <div className="max-w-3xl mx-auto">
            {!isTraining ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">训练你的专属风格</h3>
                <p className="text-gray-600 mb-2">
                  上传至少 5000 字的个人作品（最低 500 字即可分析），AI 将学习你的写作风格特征，生成专属风格模型
                </p>
                <p className="text-sm text-blue-600 mb-6 flex items-center justify-center space-x-1">
                  <Sparkles className="w-4 h-4" />
                  {/* 🔥 动态显示当前配置的大模型名称 */}
                  <span>由 {trainerModelName} 大模型提供分析能力</span>
                </p>
                <button
                  onClick={handleStartTraining}
                  className="inline-flex items-center space-x-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
                >
                  <Upload className="w-5 h-5" />
                  <span>开始训练</span>
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
                {/* 步骤指示器 */}
                <div className="flex items-center justify-center mb-8">
                  {[
                    { step: 1, label: '上传文本' },
                    { step: 2, label: 'AI 分析' },
                    { step: 3, label: 'DNA 报告' },
                  ].map((item, idx) => (
                    <div key={item.step} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                          trainingStep > item.step
                            ? 'bg-green-500 text-white'
                            : trainingStep === item.step
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-500'
                        }`}>
                          {trainingStep > item.step ? <Check className="w-5 h-5" /> : item.step}
                        </div>
                        <span className={`text-xs mt-1 ${trainingStep >= item.step ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{item.label}</span>
                      </div>
                      {idx < 2 && (
                        <div className={`w-16 sm:w-24 h-1 mx-2 mb-5 transition-colors ${
                          trainingStep > item.step ? 'bg-green-500' : 'bg-gray-200'
                        }`}></div>
                      )}
                    </div>
                  ))}
                </div>

                {/* 错误提示 */}
                {trainerError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{trainerError}</p>
                  </div>
                )}

                {/* 步骤1：上传文本 */}
                {trainingStep === 1 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-4">上传作品文本</h4>
                    {/* 文件上传区 */}
                    <div
                      onClick={() => fileInputRefEl?.click()}
                      className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer mb-4"
                    >
                      <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600 mb-1">点击上传 TXT 文本文件</p>
                      <p className="text-xs text-gray-400">支持 TXT 格式，文件大小 &lt; 5MB，建议 5000 字以上</p>
                      <input
                        ref={(el) => setFileInputRefEl(el)}
                        type="file"
                        accept=".txt,text/plain"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>
                    {/* 文本输入区 */}
                    <div className="mb-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        或直接粘贴文本内容
                      </label>
                      <textarea
                        value={trainerText}
                        onChange={(e) => { setTrainerText(e.target.value); setTrainerError('') }}
                        placeholder="在此粘贴你的小说文本（至少 500 字，建议 5000 字以上）..."
                        rows={8}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y text-sm leading-relaxed"
                      />
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-400">
                          {trainerText.length === 0 ? '尚未输入文本' : `当前字数：${trainerText.length} 字` + (trainerText.length < 500 ? '（至少需要 500 字）' : trainerText.length < 5000 ? '（建议 5000 字以上效果更佳）' : ' ✓ 字数充足')}
                        </span>
                        {trainerText.length > 0 && (
                          <button
                            onClick={() => setTrainerText('')}
                            className="text-xs text-gray-400 hover:text-red-500"
                          >清空</button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 步骤2：AI分析中 */}
                {trainingStep === 2 && (
                  <div className="py-8">
                    <h4 className="font-semibold text-gray-900 mb-6 text-center">AI 正在分析你的写作风格</h4>
                    <div className="flex flex-col items-center space-y-4">
                      <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                      </div>
                      <div className="space-y-3 w-full max-w-md">
                        <div className="flex items-center space-x-3 text-green-600">
                          <Check className="w-5 h-5 flex-shrink-0" />
                          <span className="text-sm">文本解析完成（{trainerText.length} 字）</span>
                        </div>
                        <div className="flex items-center space-x-3 text-green-600">
                          <Check className="w-5 h-5 flex-shrink-0" />
                          <span className="text-sm">样本预处理完成</span>
                        </div>
                        <div className="flex items-center space-x-3 text-blue-600">
                          <RefreshCw className="w-5 h-5 flex-shrink-0 animate-spin" />
                          {/* 🔥 动态显示模型名称 */}
                          <span className="text-sm">AI 模型分析中（{trainerModelName}）...</span>
                        </div>
                        <div className="flex items-center space-x-3 text-gray-400">
                          <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0"></div>
                          <span className="text-sm">生成风格 DNA 报告</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-4">分析通常需要 30-60 秒，请耐心等待</p>
                    </div>
                  </div>
                )}

                {/* 步骤3：风格DNA报告 */}
                {trainingStep === 3 && trainerResult && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-900">风格 DNA 报告</h4>
                      {trainerResult.usedModel && (
                        <span className="text-xs text-gray-400">分析模型：{trainerResult.usedModel}</span>
                      )}
                    </div>

                    {/* 9维参数展示 */}
                    <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg">
                      <h5 className="font-medium text-gray-900 mb-3">9 维风格参数</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { key: 'formality', name: '正式度' },
                          { key: 'emotionIntensity', name: '情感强度' },
                          { key: 'descriptionDensity', name: '描写密度' },
                          { key: 'dialogueRatio', name: '对话比例' },
                          { key: 'rhetoricFrequency', name: '修辞频率' },
                          { key: 'pacing', name: '节奏快慢' },
                          { key: 'languageDensity', name: '语言密度' },
                          { key: 'eraFeel', name: '时代感' },
                          { key: 'excitementDensity', name: '爽点密度' },
                        ].map((param) => {
                          const val = safeNum(trainerResult.parameters[param.key], 50)
                          return (
                            <div key={param.key} className="flex items-center space-x-2">
                              <span className="text-xs text-gray-600 w-16 flex-shrink-0">{param.name}</span>
                              <div className="flex-1 h-2 bg-white rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                                  style={{ width: `${val}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-gray-700 w-8 text-right font-medium">{val}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* DNA报告详情 */}
                    <div className="space-y-3 mb-6">
                      {[
                        { label: '叙事节奏', value: trainerResult.dnaReport.narrativeRhythm, bg: 'bg-blue-50', title: 'text-blue-900', text: 'text-blue-700' },
                        { label: '用词习惯', value: trainerResult.dnaReport.wordHabit, bg: 'bg-purple-50', title: 'text-purple-900', text: 'text-purple-700' },
                        { label: '句式结构', value: trainerResult.dnaReport.sentenceStructure, bg: 'bg-green-50', title: 'text-green-900', text: 'text-green-700' },
                        { label: '情感表达', value: trainerResult.dnaReport.emotionExpression, bg: 'bg-pink-50', title: 'text-pink-900', text: 'text-pink-700' },
                        { label: '修辞特征', value: trainerResult.dnaReport.rhetoricFeature, bg: 'bg-yellow-50', title: 'text-yellow-900', text: 'text-yellow-700' },
                        { label: '写作优势', value: trainerResult.dnaReport.strengths, bg: 'bg-green-50', title: 'text-green-900', text: 'text-green-700' },
                        { label: '待改进', value: trainerResult.dnaReport.weaknesses, bg: 'bg-orange-50', title: 'text-orange-900', text: 'text-orange-700' },
                      ].map((item) => (
                        <div key={item.label} className={`p-3 ${item.bg} rounded-lg`}>
                          <h5 className={`text-sm font-medium ${item.title} mb-1`}>{item.label}</h5>
                          <p className={`text-sm ${item.text} leading-relaxed`}>{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* 整体风格总结 */}
                    <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
                      <h5 className="font-medium text-gray-900 mb-2">整体风格总结</h5>
                      <p className="text-sm text-gray-700 leading-relaxed">{trainerResult.dnaReport.overallStyle}</p>
                    </div>

                    {/* 保存风格 */}
                    {!trainerSaved ? (
                      <div className="pt-4 border-t border-gray-100">
                        <label className="block text-sm font-medium text-gray-700 mb-2">为你的风格命名</label>
                        <input
                          type="text"
                          value={trainerStyleName}
                          onChange={(e) => setTrainerStyleName(e.target.value)}
                          placeholder="输入风格名称（如：我的热血玄幻风）"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none mb-3"
                        />
                        <p className="text-xs text-gray-500 mb-3">
                          建议分类：{trainerResult.suggestedCategory} | 保存后可在「我的风格」中查看和使用
                        </p>
                      </div>
                    ) : (
                      <div className="pt-4 border-t border-gray-100">
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
                          <Check className="w-5 h-5 text-green-600" />
                          <p className="text-sm text-green-700">风格已保存！可在「我的风格」中查看和使用。</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex justify-between items-center mt-8 pt-4 border-t border-gray-100">
                  <button
                    onClick={handleResetTrainer}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
                  >
                    {trainerSaved ? '完成' : '取消'}
                  </button>
                  <div className="flex space-x-3">
                    {trainingStep === 1 && (
                      <button
                        onClick={handleAnalyzeText}
                        disabled={trainerAnalyzing || trainerText.length < 500}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                      >
                        {trainerAnalyzing ? (
                          <><RefreshCw className="w-4 h-4 animate-spin" /><span>分析中...</span></>
                        ) : (
                          <><Sparkles className="w-4 h-4" /><span>开始 AI 分析</span></>
                        )}
                      </button>
                    )}
                    {trainingStep === 3 && !trainerSaved && (
                      <button
                        onClick={handleSaveTrainerStyle}
                        disabled={trainerSaving}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                      >
                        {trainerSaving ? (
                          <><RefreshCw className="w-4 h-4 animate-spin" /><span>保存中...</span></>
                        ) : (
                          <><Check className="w-4 h-4" /><span>保存为我的风格</span></>
                        )}
                      </button>
                    )}
                    {trainingStep === 3 && trainerSaved && (
                      <button
                        onClick={() => setActiveTab('my-styles')}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        查看我的风格
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 风格实验室 */}
        {activeTab === 'laboratory' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 参数调节 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-6">多维风格调音台</h3>
              <div className="space-y-5">
                {[
                  { key: 'formality', name: '正式度', min: '口语化', max: '书面语' },
                  { key: 'emotionIntensity', name: '情感强度', min: '平淡', max: '浓烈' },
                  { key: 'descriptionDensity', name: '描写密度', min: '简洁', max: '细腻' },
                  { key: 'dialogueRatio', name: '对话比例', min: '少', max: '多' },
                  { key: 'rhetoricFrequency', name: '修辞频率', min: '朴素', max: '华丽' },
                  { key: 'pacing', name: '节奏快慢', min: '缓慢铺垫', max: '快速推进' },
                  { key: 'languageDensity', name: '语言密度', min: '通俗', max: '文雅' },
                  { key: 'eraFeel', name: '时代感', min: '现代', max: '古典' },
                  { key: 'excitementDensity', name: '爽点密度', min: '平淡', max: '密集' },
                ].map((param) => (
                  <div key={param.key}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{param.name}</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={laboratoryParams[param.key as keyof typeof laboratoryParams]}
                        onChange={(e) => {
                          const val = parseInt(e.target.value)
                          if (!isNaN(val)) {
                            setLaboratoryParams({
                              ...laboratoryParams,
                              [param.key]: Math.max(0, Math.min(100, val))
                            })
                          }
                        }}
                        className="w-14 px-2 py-1 text-sm text-gray-700 text-center border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={laboratoryParams[param.key as keyof typeof laboratoryParams]}
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        if (!isNaN(val)) {
                          setLaboratoryParams({
                            ...laboratoryParams,
                            [param.key]: Math.max(0, Math.min(100, val))
                          })
                        }
                      }}
                      className="style-slider"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>{param.min}</span>
                      <span>{param.max}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={handleGeneratePreview}
                disabled={isGeneratingPreview}
                className="w-full mt-6 flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isGeneratingPreview ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /><span>生成中...</span></>
                ) : (
                  <><Sparkles className="w-4 h-4" /><span>生成预览</span></>
                )}
              </button>
            </div>

            {/* 预览区域 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">实时预览</h3>
              <div className="bg-gray-50 rounded-lg p-4 min-h-[400px]">
                {previewError ? (
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-3">
                      <span className="text-red-500 text-xl">!</span>
                    </div>
                    <p className="text-red-600 text-sm text-center max-w-sm">{previewError}</p>
                    <button 
                      onClick={handleGeneratePreview}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      重新生成
                    </button>
                  </div>
                ) : previewText ? (
                  <div className="prose prose-sm max-w-none">
                    {previewText.split('\n\n').map((paragraph, index) => (
                      <p key={index} className="mb-4 text-gray-800 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <Sparkles className="w-12 h-12 mb-3" />
                    <p>调整参数并点击生成预览</p>
                  </div>
                )}
              </div>
              {previewText && (
                <div className="flex space-x-3 mt-4">
                  <button 
                    onClick={handleCopyText}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm flex items-center justify-center space-x-2"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? '已复制！' : '复制文本'}</span>
                  </button>
                  <button 
                    onClick={handleSaveAsStyle}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    保存为风格
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 风格详情弹窗 */}
      {showStyleDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            {(() => {
              const style = extendedStyles.find(s => s.id === showStyleDetail)
              if (!style) return null
              return (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                        {safeStr(style.category, '未分类')}
                      </span>
                      <h3 className="text-xl font-bold text-gray-900 mt-2">{safeStr(style.name, '未命名风格')}</h3>
                    </div>
                    <button 
                      onClick={() => setShowStyleDetail(null)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <span className="text-2xl text-gray-400">&times;</span>
                    </button>
                  </div>
                  <p className="text-gray-600 mb-6">{safeStr(style.description, '暂无描述')}</p>
                  
                  <div className="space-y-3 mb-6">
                    <h4 className="font-medium text-gray-900">风格参数</h4>
                    {Object.entries(style.parameters).map(([key, value]) => {
                      const paramLabels: Record<string, string> = {
                        formality: '正式度',
                        emotionIntensity: '情感强度',
                        descriptionDensity: '描写密度',
                        dialogueRatio: '对话比例',
                        rhetoricFrequency: '修辞频率',
                        pacing: '叙事节奏',
                        languageDensity: '语言密度',
                        eraFeel: '时代感',
                        excitementDensity: '爽点密度',
                      }
                      const numValue = Math.max(0, Math.min(100, safeNum(value, 0)))
                      return (
                        <div key={key} className="flex items-center space-x-3">
                          <span className="text-sm text-gray-500 w-20">{paramLabels[key] || key}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500"
                              style={{ width: `${numValue}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-700 w-10">{numValue}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex space-x-3">
                    <button 
                      onClick={() => setShowStyleDetail(null)}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                    <button 
                      onClick={() => {
                        handleApplyStyle(style.id)
                        setShowStyleDetail(null)
                      }}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      应用到作品
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deletingStyleId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">确认删除</h3>
            <p className="text-gray-600 mb-6">确定要删除此风格吗？删除后无法恢复。</p>
            <div className="flex space-x-3">
              <button 
                onClick={() => setDeletingStyleId(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={confirmDeleteStyle}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
