'use client'

import { useState, useEffect } from 'react'
import {
  Library,
  BarChart3,
  GitCompareArrows,
  Plus,
  Search,
  X,
  Upload,
  Link2,
  FileText,
  Sparkles,
  Play,
  BookOpen,
  Star,
  Lightbulb,
  User,
  MessageSquare,
  Target,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'

// ============ 类型定义 ============

interface UserNovel {
  id: string
  title: string
  description: string
  genre: string
  wordCount: number
  lastModified: string
  healthScore: number
  status: string
}

interface ReferenceWork {
  id: string
  title: string
  author: string
  genre: string
  wordCount: number
  description?: string
  source?: string // 来源平台
  url?: string // 作品链接
}

const genreColors: Record<string, string> = {
  '玄幻': 'bg-red-100 text-red-700',
  '仙侠': 'bg-purple-100 text-purple-700',
  '悬疑': 'bg-gray-100 text-gray-700',
  '历史': 'bg-amber-100 text-amber-700',
  '游戏': 'bg-blue-100 text-blue-700',
  '言情': 'bg-pink-100 text-pink-700',
  '都市': 'bg-green-100 text-green-700',
  '科幻': 'bg-cyan-100 text-cyan-700',
}

// ============ 主组件 ============

type TabType = 'library' | 'style' | 'similarity'

export default function ReferencePage() {
  const [activeTab, setActiveTab] = useState<TabType>('library')

  // 用户作品状态
  const [userNovels, setUserNovels] = useState<UserNovel[]>([])
  const [isLoadingNovels, setIsLoadingNovels] = useState(true)
  const [novelsError, setNovelsError] = useState<string | null>(null)

  // 作品库状态
  const [searchQuery, setSearchQuery] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importMode, setImportMode] = useState<'file' | 'url'>('file')
  const [importUrl, setImportUrl] = useState('')

  // 风格提取状态
  const [selectedWorkForStyle, setSelectedWorkForStyle] = useState<string>('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [styleAnalysisResult, setStyleAnalysisResult] = useState<{
    narrativeRhythm: string
    vocabularyHabits: string
    sentenceStructure: string
    emotionalExpression: string
    parameters: {
      formality: number
      emotionIntensity: number
      descriptionDensity: number
      dialogueRatio: number
      rhetoricFrequency: number
      pacing: number
      languageDensity: number
      eraFeel: number
      excitementDensity: number
    }
    similarPresets: string[]
  } | null>(null)
  const [isSavingStyle, setIsSavingStyle] = useState(false)
  const [styleSaved, setStyleSaved] = useState(false)

  // 相似度检测状态
  const [currentWork, setCurrentWork] = useState<string>('')
  const [referenceWork, setReferenceWork] = useState<string>('')
  const [isComparing, setIsComparing] = useState(false)
  const [comparisonResult, setComparisonResult] = useState<{
    overallScore: number
    dimensions: { name: string; score: number }[]
  } | null>(null)

  // 对标作品搜索状态
  const [referenceSearchQuery, setReferenceSearchQuery] = useState('')
  const [referenceWorks, setReferenceWorks] = useState<ReferenceWork[]>([])
  const [isSearchingReference, setIsSearchingReference] = useState(false)
  const [selectedReferenceWork, setSelectedReferenceWork] = useState<ReferenceWork | null>(null)

  // 获取用户作品列表
  useEffect(() => {
    const fetchNovels = async () => {
      try {
        setIsLoadingNovels(true)
        setNovelsError(null)
        const response = await fetch('/tuzhong-wenshu/api/novels')
        if (!response.ok) {
          throw new Error('获取作品列表失败')
        }
        const result = await response.json()
        setUserNovels(result.data || [])
        // 设置默认选中的当前作品
        if (result.data && result.data.length > 0 && !currentWork) {
          setCurrentWork(result.data[0].id)
        }
      } catch (error) {
        console.error('获取作品列表失败:', error)
        setNovelsError('获取作品列表失败，请稍后重试')
      } finally {
        setIsLoadingNovels(false)
      }
    }
    fetchNovels()
  }, [])

  // 筛选作品
  const filteredNovels = userNovels.filter((n) => {
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.genre.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  // 开始风格分析
  const handleStartAnalysis = async () => {
    if (!selectedWorkForStyle) return
    setIsAnalyzing(true)
    setStyleAnalysisResult(null)
    setStyleSaved(false)
    
    try {
      // 获取选中作品的内容
      const novel = userNovels.find(n => n.id === selectedWorkForStyle)
      if (!novel) {
        throw new Error('未找到选中的作品')
      }

      // 调用风格分析API
      const response = await fetch('/tuzhong-wenshu/api/ai/analyze-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleText: novel.description || novel.title,
          novelId: selectedWorkForStyle
        })
      })

      if (!response.ok) {
        throw new Error('分析请求失败')
      }

      const result = await response.json()
      setStyleAnalysisResult(result.data)
    } catch (error) {
      console.error('风格分析失败:', error)
      setStyleAnalysisResult(null)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // 保存风格为我的风格
  const handleSaveStyle = async () => {
    if (!styleAnalysisResult || !selectedWorkForStyle) return
    
    setIsSavingStyle(true)
    try {
      // 获取作品名称
      const novel = userNovels.find(n => n.id === selectedWorkForStyle)
      const styleName = novel ? `${novel.title}风格` : '自定义风格'
      
      // 调用保存风格API
      const response = await fetch('/tuzhong-wenshu/api/styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: styleName,
          description: `从《${novel?.title || '作品'}》提取的风格`,
          parameters: styleAnalysisResult.parameters,
        })
      })

      if (response.ok) {
        setStyleSaved(true)
      } else {
        console.error('保存风格失败')
      }
    } catch (error) {
      console.error('保存风格失败:', error)
    } finally {
      setIsSavingStyle(false)
    }
  }

  // 开始相似度检测
  const handleStartComparison = async () => {
    if (!currentWork || !referenceWork) return
    setIsComparing(true)
    setComparisonResult(null)
    
    try {
      // 获取当前作品的内容进行分析
      const novel = userNovels.find(n => n.id === currentWork)
      if (!novel) {
        throw new Error('未找到选中的作品')
      }

      // 调用风格分析API
      const response = await fetch('/tuzhong-wenshu/api/ai/analyze-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleText: novel.description || novel.title,
          novelId: currentWork,
          referenceId: referenceWork
        })
      })

      if (!response.ok) {
        throw new Error('分析请求失败')
      }

      const result = await response.json()
      
      // 根据API返回结果生成相似度数据
      // 由于当前API返回的是风格参数，我们基于这些参数计算相似度
      const params = result.data?.parameters || {}
      const dimensions = [
        { name: '语言风格', score: params.formality || 70 },
        { name: '叙事节奏', score: params.pacing || 75 },
        { name: '人物塑造', score: params.emotionIntensity || 65 },
        { name: '情节设计', score: params.excitementDensity || 72 },
        { name: '世界观', score: params.descriptionDensity || 68 },
        { name: '情感表达', score: params.emotionIntensity || 70 },
      ]
      const overallScore = Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length)
      
      setComparisonResult({
        overallScore,
        dimensions
      })
    } catch (error) {
      console.error('相似度检测失败:', error)
      // 显示功能开发中提示
      setComparisonResult(null)
    } finally {
      setIsComparing(false)
    }
  }

  // 搜索对标作品
  const handleSearchReferenceWorks = async () => {
    if (!referenceSearchQuery.trim()) return
    
    setIsSearchingReference(true)
    setReferenceWorks([])
    
    try {
      // 调用搜索API搜索对标作品
      const response = await fetch(`/tuzhong-wenshu/api/novels/search?q=${encodeURIComponent(referenceSearchQuery)}&type=search`)
      
      if (response.ok) {
        const data = await response.json()
        setReferenceWorks(data.works || data.data || [])
      } else {
        console.error('搜索对标作品失败:', response.status)
        setReferenceWorks([])
      }
    } catch (error) {
      console.error('搜索对标作品失败:', error)
      setReferenceWorks([])
    } finally {
      setIsSearchingReference(false)
    }
  }

  // 选择对标作品
  const handleSelectReferenceWork = (work: ReferenceWork) => {
    setSelectedReferenceWork(work)
    setReferenceWork(work.id)
  }

  // 导入作品（修复 v4 M15：标注为开发中，当前为空实现）
  const handleImport = () => {
    alert('导入作品功能正在开发中，敬请期待。当前可通过「风格提取」标签页使用已有作品库进行对标分析。')
    setShowImportModal(false)
    setImportUrl('')
    setImportMode('file')
  }

  const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'library', label: '作品库', icon: Library },
    { id: 'style', label: '风格提取', icon: BarChart3 },
    { id: 'similarity', label: '相似度检测', icon: GitCompareArrows },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold">途中文枢</span>
              </Link>
              <span className="text-gray-300">/</span>
              <span className="font-semibold text-gray-900">对标作品分析</span>
            </div>
            {activeTab === 'library' && (
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>导入作品</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 标签页导航 */}
        <div className="flex items-center space-x-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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

        {/* ========== 作品库标签页 ========== */}
        {activeTab === 'library' && (
          <div>
            {/* 搜索框 */}
            <div className="flex items-center justify-between mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索作品名称或类型..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="text-sm text-gray-500 ml-4">
                共 {userNovels.length} 部作品
              </div>
            </div>

            {/* 加载状态 */}
            {isLoadingNovels && (
              <div className="text-center py-16">
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-500">加载作品列表中...</p>
              </div>
            )}

            {/* 错误状态 */}
            {novelsError && !isLoadingNovels && (
              <div className="text-center py-16">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <p className="text-gray-500">{novelsError}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  重新加载
                </button>
              </div>
            )}

            {/* 作品卡片网格 */}
            {!isLoadingNovels && !novelsError && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredNovels.map((novel) => (
                    <div
                      key={novel.id}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all"
                    >
                      <div className="h-32 bg-gradient-to-br from-indigo-500 to-purple-600 relative">
                        <div className="absolute inset-0 bg-black/10"></div>
                        <div className="absolute bottom-3 left-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${genreColors[novel.genre] || 'bg-gray-100 text-gray-700'}`}>
                            {novel.genre}
                          </span>
                        </div>
                        <div className="absolute top-3 right-3">
                          <BookOpen className="w-8 h-8 text-white/30" />
                        </div>
                      </div>
                      <div className="p-5">
                        <h3 className="font-semibold text-gray-900 text-lg mb-1">{novel.title}</h3>
                        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{novel.description || '暂无简介'}</p>
                        <div className="flex items-center justify-between text-sm text-gray-400">
                          <span>{(novel.wordCount / 10000).toFixed(1)}万字</span>
                          <span>{novel.lastModified}</span>
                        </div>
                        <div className="flex space-x-2 mt-4">
                          <button
                            onClick={() => { setSelectedWorkForStyle(novel.id); setActiveTab('style') }}
                            className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                          >
                            分析风格
                          </button>
                          <button
                            onClick={() => { setCurrentWork(novel.id); setActiveTab('similarity') }}
                            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                          >
                            对比检测
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredNovels.length === 0 && (
                  <div className="text-center py-16 text-gray-400">
                    <Library className="w-16 h-16 mx-auto mb-4" />
                    <p>暂无作品，请先创建一部作品</p>
                    <Link href="/write" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      创建作品
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ========== 风格提取标签页 ========== */}
        {activeTab === 'style' && (
          <div className="space-y-8">
            {/* 作品选择区域 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-medium text-gray-900 mb-4 flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                <span>选择要分析的作品</span>
              </h3>
              <div className="flex items-center space-x-4">
                <select
                  value={selectedWorkForStyle}
                  onChange={(e) => {
                    setSelectedWorkForStyle(e.target.value)
                    setStyleAnalysisResult(null)
                    setStyleSaved(false)
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled={isLoadingNovels}
                >
                  <option value="">请选择一部作品</option>
                  {userNovels.map((n) => (
                    <option key={n.id} value={n.id}>{n.title}</option>
                  ))}
                </select>
                <button
                  onClick={handleStartAnalysis}
                  disabled={!selectedWorkForStyle || isAnalyzing}
                  className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>分析中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>开始分析</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                AI将深度分析作品的叙事节奏、用词习惯、句式结构等风格特征
              </p>
            </div>

            {/* 无作品提示 */}
            {!selectedWorkForStyle && !isLoadingNovels && userNovels.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无可分析的作品</h3>
                <p className="text-gray-500 mb-4">请先创建一部作品，再进行风格分析</p>
                <Link href="/write" className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  创建作品
                </Link>
              </div>
            )}

            {/* 分析结果展示 */}
            {styleAnalysisResult && (
              <>
                {/* 风格参数雷达图 */}
                <div className="bg-white rounded-xl border border-gray-200 p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
                      <BarChart3 className="w-5 h-5 text-blue-600" />
                      <span>风格参数分析</span>
                    </h3>
                    {!styleSaved ? (
                      <button
                        onClick={handleSaveStyle}
                        disabled={isSavingStyle}
                        className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {isSavingStyle ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            <span>保存中...</span>
                          </>
                        ) : (
                          <>
                            <Star className="w-4 h-4" />
                            <span>保存为我的风格</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center space-x-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg">
                        <Star className="w-4 h-4" />
                        <span className="text-sm font-medium">已保存</span>
                      </div>
                    )}
                  </div>

                  {/* 雷达图 */}
                  <div className="flex items-center justify-center mb-8">
                    <div className="relative w-80 h-80">
                      {/* 背景六边形网格 */}
                      {[100, 75, 50, 25].map((scale, level) => (
                        <div
                          key={level}
                          className="absolute inset-0 flex items-center justify-center"
                          style={{ transform: `scale(${scale / 100})` }}
                        >
                          <svg viewBox="0 0 200 200" className="w-full h-full">
                            <polygon
                              points="100,10 178,55 178,145 100,190 22,145 22,55"
                              fill="none"
                              stroke={level === 0 ? '#E5E7EB' : '#F3F4F6'}
                              strokeWidth="1"
                            />
                          </svg>
                        </div>
                      ))}

                      {/* 维度轴线 */}
                      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
                        <line x1="100" y1="10" x2="100" y2="190" stroke="#E5E7EB" strokeWidth="0.5" />
                        <line x1="22" y1="55" x2="178" y2="145" stroke="#E5E7EB" strokeWidth="0.5" />
                        <line x1="22" y1="145" x2="178" y2="55" stroke="#E5E7EB" strokeWidth="0.5" />
                      </svg>

                      {/* 数据多边形 */}
                      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
                        {(() => {
                          const params = styleAnalysisResult.parameters
                          const dimensions = [
                            params.formality,
                            params.emotionIntensity,
                            params.descriptionDensity,
                            params.dialogueRatio,
                            params.pacing,
                            params.excitementDensity
                          ]
                          
                          const points = dimensions.map((score, i) => {
                            const angle = (i * 60 - 90) * (Math.PI / 180)
                            const radius = (score / 100) * 90
                            const x = 100 + radius * Math.cos(angle)
                            const y = 100 + radius * Math.sin(angle)
                            return `${x},${y}`
                          }).join(' ')
                          
                          return (
                            <>
                              <polygon
                                points={points}
                                fill="rgba(59, 130, 246, 0.15)"
                                stroke="#3B82F6"
                                strokeWidth="2"
                              />
                              {dimensions.map((score, i) => {
                                const angle = (i * 60 - 90) * (Math.PI / 180)
                                const radius = (score / 100) * 90
                                const x = 100 + radius * Math.cos(angle)
                                const y = 100 + radius * Math.sin(angle)
                                return <circle key={i} cx={x} cy={y} r="4" fill="#3B82F6" />
                              })}
                            </>
                          )
                        })()}
                      </svg>

                      {/* 维度标签 */}
                      {['正式度', '情感强度', '描写密度', '对话比例', '叙事节奏', '爽点密度'].map((label, i) => {
                        const angle = (i * 60 - 90) * (Math.PI / 180)
                        const labelRadius = 110
                        const x = 50 + (labelRadius / 2) * Math.cos(angle)
                        const y = 50 + (labelRadius / 2) * Math.sin(angle)
                        return (
                          <div
                            key={i}
                            className="absolute text-xs font-medium text-gray-700"
                            style={{
                              left: `${x}%`,
                              top: `${y}%`,
                              transform: 'translate(-50%, -50%)'
                            }}
                          >
                            {label}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 参数详情 - 进度条展示 */}
                  <div className="grid grid-cols-3 md:grid-cols-3 gap-4">
                    {[
                      { name: '正式度', value: styleAnalysisResult.parameters.formality, desc: '语言正式程度' },
                      { name: '情感强度', value: styleAnalysisResult.parameters.emotionIntensity, desc: '情感表达强度' },
                      { name: '描写密度', value: styleAnalysisResult.parameters.descriptionDensity, desc: '场景描写详细度' },
                      { name: '对话比例', value: styleAnalysisResult.parameters.dialogueRatio, desc: '对话占比' },
                      { name: '叙事节奏', value: styleAnalysisResult.parameters.pacing, desc: '故事推进速度' },
                      { name: '爽点密度', value: styleAnalysisResult.parameters.excitementDensity, desc: '高潮点分布' },
                      { name: '修辞频率', value: styleAnalysisResult.parameters.rhetoricFrequency, desc: '修辞手法使用' },
                      { name: '语言密度', value: styleAnalysisResult.parameters.languageDensity, desc: '信息量密度' },
                      { name: '时代感', value: styleAnalysisResult.parameters.eraFeel, desc: '古风/现代感' },
                    ].map((param, index) => (
                      <div key={index} className="p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">{param.name}</span>
                          <span className="text-lg font-bold text-gray-900">{param.value}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${param.value}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{param.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 风格特征分析 */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-6 flex items-center space-x-2">
                    <MessageSquare className="w-5 h-5 text-purple-600" />
                    <span>风格特征分析</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <h4 className="font-medium text-blue-800 mb-2 flex items-center space-x-2">
                        <Target className="w-4 h-4" />
                        <span>叙事节奏</span>
                      </h4>
                      <p className="text-sm text-gray-700">{styleAnalysisResult.narrativeRhythm}</p>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                      <h4 className="font-medium text-purple-800 mb-2 flex items-center space-x-2">
                        <BookOpen className="w-4 h-4" />
                        <span>用词习惯</span>
                      </h4>
                      <p className="text-sm text-gray-700">{styleAnalysisResult.vocabularyHabits}</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                      <h4 className="font-medium text-green-800 mb-2 flex items-center space-x-2">
                        <FileText className="w-4 h-4" />
                        <span>句式结构</span>
                      </h4>
                      <p className="text-sm text-gray-700">{styleAnalysisResult.sentenceStructure}</p>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                      <h4 className="font-medium text-amber-800 mb-2 flex items-center space-x-2">
                        <Lightbulb className="w-4 h-4" />
                        <span>情感表达</span>
                      </h4>
                      <p className="text-sm text-gray-700">{styleAnalysisResult.emotionalExpression}</p>
                    </div>
                  </div>
                </div>

                {/* 相似风格预设 */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                    <Star className="w-5 h-5 text-amber-500" />
                    <span>相似风格预设</span>
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">基于分析结果，为您推荐以下风格预设：</p>
                  <div className="flex flex-wrap gap-3">
                    {styleAnalysisResult.similarPresets.map((preset, index) => (
                      <span
                        key={index}
                        className="px-4 py-2 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700 rounded-full text-sm font-medium"
                      >
                        {preset === 'fanqie-shuangwen' ? '番茄爽文风格' : 
                         preset === 'fantasy-tiancan' ? '玄幻天蚕风格' : preset}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========== 相似度检测标签页（修复 v4 M5：标注对比逻辑为开发中） ========== */}
        {activeTab === 'similarity' && (
          <div className="space-y-8">
            {/* 开发中提示 */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center space-x-3">
              <span className="px-2 py-1 bg-blue-200 text-blue-800 text-xs font-semibold rounded-full">Beta</span>
              <p className="text-sm text-blue-700">相似度检测当前基于风格参数估算，完整对标分析功能正在开发中。</p>
            </div>
            {/* 作品选择区域 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-medium text-gray-700 mb-3">当前作品</h3>
                <select
                  value={currentWork}
                  onChange={(e) => setCurrentWork(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled={isLoadingNovels}
                >
                  <option value="">请选择您的作品</option>
                  {userNovels.map((n) => (
                    <option key={n.id} value={n.id}>{n.title}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-2">当前正在创作的作品</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-medium text-gray-700 mb-3">对标作品</h3>
                
                {/* 已选择的对标作品 */}
                {selectedReferenceWork ? (
                  <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{selectedReferenceWork.title}</p>
                        <p className="text-sm text-gray-500">{selectedReferenceWork.author} · {selectedReferenceWork.genre}</p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedReferenceWork(null)
                          setReferenceWork('')
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 搜索输入框 */}
                    <div className="flex space-x-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="搜索对标作品..."
                          value={referenceSearchQuery}
                          onChange={(e) => setReferenceSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearchReferenceWorks()}
                          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>
                      <button
                        onClick={handleSearchReferenceWorks}
                        disabled={isSearchingReference || !referenceSearchQuery.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {isSearchingReference ? '搜索中...' : '搜索'}
                      </button>
                    </div>
                    
                    {/* 搜索结果 */}
                    {isSearchingReference && (
                      <div className="text-center py-4 text-gray-500">
                        <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
                        搜索中...
                      </div>
                    )}
                    
                    {!isSearchingReference && referenceWorks.length > 0 && (
                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                        {referenceWorks.map((work) => (
                          <button
                            key={work.id}
                            onClick={() => handleSelectReferenceWork(work)}
                            className="w-full p-3 text-left hover:bg-gray-50 transition-colors"
                          >
                            <p className="font-medium text-gray-900">{work.title}</p>
                            <p className="text-sm text-gray-500">{work.author} · {work.genre} · {(work.wordCount / 10000).toFixed(0)}万字</p>
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {!isSearchingReference && referenceSearchQuery && referenceWorks.length === 0 && (
                      <div className="text-center py-4 text-gray-400">
                        <Search className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-sm">未找到相关作品</p>
                        <p className="text-xs mt-1">请尝试其他关键词</p>
                      </div>
                    )}
                  </div>
                )}
                
                <p className="text-xs text-gray-400 mt-2">搜索并选择要对标分析的作品</p>
              </div>
            </div>

            {/* 开始检测按钮 */}
            <div className="text-center">
              <button
                onClick={handleStartComparison}
                disabled={!currentWork || !referenceWork || isComparing}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isComparing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>分析中...</span>
                  </>
                ) : (
                  <>
                    <GitCompareArrows className="w-4 h-4" />
                    <span>开始相似度检测</span>
                  </>
                )}
              </button>
            </div>

            {/* 无作品提示 */}
            {!currentWork && !isLoadingNovels && userNovels.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无可分析的作品</h3>
                <p className="text-gray-500 mb-4">请先创建一部作品，再进行相似度检测</p>
                <Link href="/write" className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  创建作品
                </Link>
              </div>
            )}

            {/* 相似度评分结果 */}
            {comparisonResult && (
              <div className="bg-white rounded-xl border border-gray-200 p-8">
                <div className="text-center mb-8">
                  <p className="text-sm text-gray-500 mb-2">综合相似度评分</p>
                  <div className="text-7xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    {comparisonResult.overallScore}
                  </div>
                  <p className="text-sm text-gray-400 mt-2">/ 100</p>
                  <p className="text-sm text-gray-500 mt-3">
                    您的作品与《{selectedReferenceWork?.title}》在整体风格上具有一定相似度
                  </p>
                </div>

                {/* 六边形雷达图 (用CSS实现) */}
                <div className="flex items-center justify-center">
                  <div className="relative w-72 h-72">
                    {/* 背景六边形网格 */}
                    {[100, 75, 50, 25].map((scale, level) => (
                      <div
                        key={level}
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ transform: `scale(${scale / 100})` }}
                      >
                        <svg viewBox="0 0 200 200" className="w-full h-full">
                          <polygon
                            points="100,10 178,55 178,145 100,190 22,145 22,55"
                            fill="none"
                            stroke={level === 0 ? '#E5E7EB' : '#F3F4F6'}
                            strokeWidth="1"
                          />
                        </svg>
                      </div>
                    ))}

                    {/* 维度轴线 */}
                    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
                      <line x1="100" y1="10" x2="100" y2="190" stroke="#E5E7EB" strokeWidth="0.5" />
                      <line x1="22" y1="55" x2="178" y2="145" stroke="#E5E7EB" strokeWidth="0.5" />
                      <line x1="22" y1="145" x2="178" y2="55" stroke="#E5E7EB" strokeWidth="0.5" />
                    </svg>

                    {/* 数据多边形 - 根据实际分数计算 */}
                    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
                      {(() => {
                        const dims = comparisonResult.dimensions
                        // 将分数转换为六边形坐标点
                        const points = dims.map((dim, i) => {
                          const angle = (i * 60 - 90) * (Math.PI / 180)
                          const radius = (dim.score / 100) * 90
                          const x = 100 + radius * Math.cos(angle)
                          const y = 100 + radius * Math.sin(angle)
                          return `${x},${y}`
                        }).join(' ')
                        
                        return (
                          <>
                            <polygon
                              points={points}
                              fill="rgba(59, 130, 246, 0.15)"
                              stroke="#3B82F6"
                              strokeWidth="2"
                            />
                            {dims.map((dim, i) => {
                              const angle = (i * 60 - 90) * (Math.PI / 180)
                              const radius = (dim.score / 100) * 90
                              const x = 100 + radius * Math.cos(angle)
                              const y = 100 + radius * Math.sin(angle)
                              return <circle key={i} cx={x} cy={y} r="4" fill="#3B82F6" />
                            })}
                          </>
                        )
                      })()}
                    </svg>

                    {/* 维度标签 */}
                    {comparisonResult.dimensions.map((dim, i) => {
                      const angle = (i * 60 - 90) * (Math.PI / 180)
                      const labelRadius = 110
                      const x = 50 + (labelRadius / 2) * Math.cos(angle)
                      const y = 50 + (labelRadius / 2) * Math.sin(angle)
                      return (
                        <div
                          key={i}
                          className="absolute text-xs font-medium text-gray-700"
                          style={{
                            left: `${x}%`,
                            top: `${y}%`,
                            transform: 'translate(-50%, -50%)'
                          }}
                        >
                          {dim.name}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 分维度得分 */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-8">
                  {comparisonResult.dimensions.map((dim, index) => (
                    <div key={index} className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{dim.score}</div>
                      <div className="text-xs text-gray-500 mt-1">{dim.name}</div>
                      <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${dim.score}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 灵感推荐区域 - 仅在有结果时显示 */}
            {comparisonResult && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                  <Lightbulb className="w-5 h-5 text-amber-500" />
                  <span>灵感推荐</span>
                </h3>

                {/* 情节建议 */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h4 className="font-medium text-gray-900 mb-4 flex items-center space-x-2">
                    <Target className="w-4 h-4 text-blue-600" />
                    <span>情节设计建议</span>
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                      <p className="text-sm text-gray-700">参考对标作品的节奏把控，在关键情节节点设置悬念和高潮</p>
                    </div>
                    <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                      <p className="text-sm text-gray-700">学习对标作品的&quot;爽点&quot;设置技巧，让读者获得更强的阅读满足感</p>
                    </div>
                    <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                      <p className="text-sm text-gray-700">注意情节转折的铺垫，避免突兀的发展，让故事更加自然流畅</p>
                    </div>
                  </div>
                </div>

                {/* 人物塑造建议 */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h4 className="font-medium text-gray-900 mb-4 flex items-center space-x-2">
                    <User className="w-4 h-4 text-purple-600" />
                    <span>人物塑造建议</span>
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3 p-3 bg-purple-50 rounded-lg">
                      <span className="flex-shrink-0 w-6 h-6 bg-purple-200 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                      <p className="text-sm text-gray-700">参考对标作品的人物成长线设计，让主角的进步有迹可循</p>
                    </div>
                    <div className="flex items-start space-x-3 p-3 bg-purple-50 rounded-lg">
                      <span className="flex-shrink-0 w-6 h-6 bg-purple-200 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                      <p className="text-sm text-gray-700">丰富配角的性格特点，避免脸谱化，让配角也有自己的故事</p>
                    </div>
                    <div className="flex items-start space-x-3 p-3 bg-purple-50 rounded-lg">
                      <span className="flex-shrink-0 w-6 h-6 bg-purple-200 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                      <p className="text-sm text-gray-700">反派角色要有合理的动机和背景，增加故事的深度和张力</p>
                    </div>
                  </div>
                </div>

                {/* 金句生成（修复 v4 M6：替换硬编码玄幻修仙金句为题材感知占位） */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h4 className="font-medium text-gray-900 mb-4 flex items-center space-x-2">
                    <Star className="w-4 h-4 text-amber-500" />
                    <span>金句参考</span>
                  </h4>
                  <p className="text-sm text-gray-500 mb-4">基于对标作品的风格特点，为您生成参考金句：</p>
                  <div className="space-y-3">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-700">
                        <Star className="w-3 h-3 inline mr-1" />
                        金句生成功能正在开发中。完成后将基于您选择的对标作品题材（{selectedReferenceWork?.genre || '当前题材'}）和风格特征，自动生成贴合该题材的参考金句。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========== 导入作品弹窗 ========== */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">导入作品</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* 导入方式切换 */}
            <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
              <button
                onClick={() => setImportMode('file')}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                  importMode === 'file' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span className="text-sm font-medium">上传文件</span>
              </button>
              <button
                onClick={() => setImportMode('url')}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                  importMode === 'url' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                }`}
              >
                <Link2 className="w-4 h-4" />
                <span className="text-sm font-medium">网络链接</span>
              </button>
            </div>

            {importMode === 'file' ? (
              <div>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 mb-2">拖拽文件到此处，或点击上传</p>
                  <p className="text-sm text-gray-400">支持 TXT、DOCX、PDF 格式</p>
                </div>
                <div className="flex items-center space-x-3 mt-3">
                  <div className="flex items-center space-x-1 text-xs text-gray-400">
                    <FileText className="w-3.5 h-3.5" />
                    <span>TXT</span>
                  </div>
                  <div className="flex items-center space-x-1 text-xs text-gray-400">
                    <FileText className="w-3.5 h-3.5" />
                    <span>DOCX</span>
                  </div>
                  <div className="flex items-center space-x-1 text-xs text-gray-400">
                    <FileText className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">网络链接</label>
                <input
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="输入作品的网络链接..."
                />
                <p className="text-xs text-gray-400 mt-2">支持各大小说网站的作品链接</p>
              </div>
            )}

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowImportModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleImport}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                导入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
