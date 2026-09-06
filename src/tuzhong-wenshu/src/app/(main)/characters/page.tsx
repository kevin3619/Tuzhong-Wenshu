'use client'

import { useState, useEffect, useRef } from 'react'
import { getLLMConfig } from '@/lib/ai/llm'
import { 
  Users,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Edit3,
  Trash2,
  Link2,
  X,
  ChevronRight,
  BookOpen,
  Network as NetworkIcon,
  Grid,
  List,
  Sparkles,
  Save,
  User,
  ChevronDown
} from 'lucide-react'
import Link from 'next/link'

// 作品接口
interface Novel {
  id: string
  title: string
  author?: string
}

// 角色数据接口
interface Character {
  id: string
  name: string
  aliases: string[]
  gender: 'male' | 'female' | 'other'
  age: number
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor'
  appearance: string
  personality: string
  background: string
  skills: string[]
  relationships: Relationship[]
  color: string
  x?: number
  y?: number
  novelId?: string
}

interface Relationship {
  targetId: string
  type: string
  description: string
}

const roleLabels = {
  protagonist: '主角',
  antagonist: '反派',
  supporting: '配角',
  minor: '龙套'
}

const roleColors = {
  protagonist: 'bg-blue-100 text-blue-700',
  antagonist: 'bg-red-100 text-red-700',
  supporting: 'bg-green-100 text-green-700',
  minor: 'bg-gray-100 text-gray-700'
}

function safeStr(val: unknown, fallback = ''): string {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    try { return JSON.stringify(val) } catch { return fallback }
  }
  return fallback
}

function safeFirstChar(val: unknown): string {
  const s = safeStr(val, '')
  return s ? s[0] : '?'
}

function safeRole(val: unknown): keyof typeof roleLabels {
  if (typeof val === 'string' && val in roleLabels) return val as keyof typeof roleLabels
  return 'minor'
}

function safeGender(val: unknown): string {
  if (val === 'male') return '男'
  if (val === 'female') return '女'
  if (typeof val === 'string' && val) return val
  return '其他'
}

function safeAge(val: unknown): string {
  if (typeof val === 'number') return `${val}岁`
  const n = Number(val)
  return isNaN(n) ? '未知' : `${n}岁`
}

function safeArr(val: unknown): unknown[] {
  return Array.isArray(val) ? val : []
}

function safeStrArr(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.map((item: unknown) => typeof item === 'string' ? item : safeStr(item))
}

export default function CharacterPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [novels, setNovels] = useState<Novel[]>([])
  const [selectedNovelId, setSelectedNovelId] = useState<string>('')
  const [loadingNovels, setLoadingNovels] = useState(true)
  const [loadingCharacters, setLoadingCharacters] = useState(false)
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph')
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [showCharacterModal, setShowCharacterModal] = useState(false)
  const [showRelationModal, setShowRelationModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRole, setFilterRole] = useState<string>('all')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedChar, setDraggedChar] = useState<string | null>(null)

  // 加载作品列表
  useEffect(() => {
    const fetchNovels = async () => {
      try {
        setLoadingNovels(true)
        const response = await fetch('/tuzhong-wenshu/api/novels')
        if (response.ok) {
          const data = await response.json()
          setNovels(data.data || data.novels || [])
        }
      } catch (error) {
        console.error('加载作品列表失败:', error)
      } finally {
        setLoadingNovels(false)
      }
    }
    fetchNovels()
  }, [])

  // 当选择作品后，加载该作品的角色
  useEffect(() => {
    const fetchCharacters = async () => {
      if (!selectedNovelId) {
        setCharacters([])
        return
      }

      try {
        setLoadingCharacters(true)
        const response = await fetch(`/tuzhong-wenshu/api/characters?novelId=${selectedNovelId}`)
        if (response.ok) {
          const data = await response.json()
          // 为角色添加默认位置（如果不存在）
          const charactersWithPosition = (data.data || data.characters || []).map((char: Record<string, unknown>, index: number) => ({
            ...char,
            name: safeStr(char.name, '未命名'),
            gender: safeStr(char.gender, 'other'),
            age: typeof char.age === 'number' ? char.age : 0,
            role: safeRole(char.role),
            appearance: safeStr(char.appearance, ''),
            personality: safeStr(char.personality, ''),
            background: safeStr(char.background, ''),
            relationships: (safeArr(char.relationships) as Record<string, unknown>[]).map((rel) => ({
              targetId: safeStr(rel.targetId, ''),
              type: safeStr(rel.type, ''),
              description: safeStr(rel.description, ''),
            })),
            aliases: safeStrArr(char.aliases),
            skills: safeStrArr(char.skills),
            color: safeStr(char.color, '#3B82F6'),
            x: typeof char.x === 'number' ? char.x : 300 + (index % 3) * 200,
            y: typeof char.y === 'number' ? char.y : 200 + Math.floor(index / 3) * 150
          }))
          setCharacters(charactersWithPosition)
        }
      } catch (error) {
        console.error('加载角色列表失败:', error)
        setCharacters([])
      } finally {
        setLoadingCharacters(false)
      }
    }
    fetchCharacters()
  }, [selectedNovelId])

  // 绘制关系图谱
  useEffect(() => {
    if (viewMode !== 'graph' || !canvasRef.current || characters.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 设置画布大小
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 绘制连线
    characters.forEach((char) => {
      (safeArr(char.relationships) as Relationship[]).forEach((rel) => {
        const target = characters.find((c) => c.id === rel.targetId)
        if (target && char.x && char.y && target.x && target.y) {
          ctx.beginPath()
          ctx.moveTo(char.x, char.y)
          ctx.lineTo(target.x, target.y)
          ctx.strokeStyle = '#E5E7EB'
          ctx.lineWidth = 2
          ctx.stroke()

          const midX = (char.x + target.x) / 2
          const midY = (char.y + target.y) / 2
          ctx.fillStyle = '#6B7280'
          ctx.font = '12px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(safeStr(rel.type, ''), midX, midY - 5)
        }
      })
    })

    // 绘制节点
    characters.forEach((char) => {
      if (char.x && char.y) {
        // 绘制圆形背景
        ctx.beginPath()
        ctx.arc(char.x, char.y, 30, 0, Math.PI * 2)
        ctx.fillStyle = char.color
        ctx.fill()

        // 绘制边框
        ctx.strokeStyle = selectedCharacter?.id === char.id ? '#1D4ED8' : '#FFFFFF'
        ctx.lineWidth = selectedCharacter?.id === char.id ? 4 : 3
        ctx.stroke()

        // 绘制名字
        ctx.fillStyle = '#1F2937'
        ctx.font = 'bold 14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(safeStr(char.name, '?'), char.x, char.y + 50)

        const charRole = safeRole(char.role)
        ctx.fillStyle = charRole === 'protagonist' ? '#3B82F6' : 
                       charRole === 'antagonist' ? '#EF4444' : '#10B981'
        ctx.font = '12px sans-serif'
        ctx.fillText(roleLabels[charRole], char.x, char.y + 65)
      }
    })
  }, [characters, viewMode, selectedCharacter])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // 检查是否点击了角色
    const clickedChar = characters.find((char) => {
      if (!char.x || !char.y) return false
      const distance = Math.sqrt((x - char.x) ** 2 + (y - char.y) ** 2)
      return distance <= 30
    })

    if (clickedChar) {
      setSelectedCharacter(clickedChar)
    } else {
      setSelectedCharacter(null)
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const clickedChar = characters.find((char) => {
      if (!char.x || !char.y) return false
      const distance = Math.sqrt((x - char.x) ** 2 + (y - char.y) ** 2)
      return distance <= 30
    })

    if (clickedChar) {
      setIsDragging(true)
      setDraggedChar(clickedChar.id)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !draggedChar) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setCharacters((prev) =>
      prev.map((char) =>
        char.id === draggedChar ? { ...char, x, y } : char
      )
    )
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDraggedChar(null)
  }

  const filteredCharacters = characters.filter((char) => {
    const matchesSearch = char.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = filterRole === 'all' || char.role === filterRole
    return matchesSearch && matchesRole
  })

  // 获取选中的作品名称
  const selectedNovel = novels.find(n => n.id === selectedNovelId)

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
              <span className="font-semibold text-gray-900">人物图谱</span>
            </div>
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setShowCharacterModal(true)}
                disabled={!selectedNovelId}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>添加角色</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 作品选择器 */}
        <div className="mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">选择作品：</label>
              {loadingNovels ? (
                <div className="flex items-center space-x-2 text-gray-500">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                  <span className="text-sm">加载中...</span>
                </div>
              ) : (
                <div className="relative flex-1 max-w-md">
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
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <BookOpen className="w-4 h-4" />
                  <span>当前作品：<span className="font-medium text-gray-700">{selectedNovel.title}</span></span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 未选择作品时的空状态 */}
        {!selectedNovelId && !loadingNovels && (
          <div className="bg-white rounded-xl border border-gray-200 p-12">
            <div className="flex flex-col items-center justify-center text-gray-400">
              <BookOpen className="w-20 h-20 mb-6" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">请先选择作品</h3>
              <p className="text-sm text-gray-500 mb-4">选择一个作品后，可以查看和管理该作品的角色图谱</p>
              <p className="text-xs text-gray-400">在上方下拉框中选择作品开始使用</p>
            </div>
          </div>
        )}

        {/* 加载角色中 */}
        {selectedNovelId && loadingCharacters && (
          <div className="bg-white rounded-xl border border-gray-200 p-12">
            <div className="flex flex-col items-center justify-center text-gray-400">
              <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
              <p className="text-sm">正在加载角色数据...</p>
            </div>
          </div>
        )}

        {/* 已选择作品且加载完成 */}
        {selectedNovelId && !loadingCharacters && (
          <>
            {/* 工具栏 */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                {/* 视图切换 */}
                <div className="flex items-center space-x-1 bg-white rounded-lg border border-gray-200 p-1">
                  <button
                    onClick={() => setViewMode('graph')}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-md transition-colors ${
                      viewMode === 'graph' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <NetworkIcon className="w-4 h-4" />
                    <span className="text-sm">图谱</span>
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-md transition-colors ${
                      viewMode === 'list' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <List className="w-4 h-4" />
                    <span className="text-sm">列表</span>
                  </button>
                </div>

                {/* 搜索 */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索角色..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                {/* 筛选 */}
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="all">全部角色</option>
                  <option value="protagonist">主角</option>
                  <option value="antagonist">反派</option>
                  <option value="supporting">配角</option>
                  <option value="minor">龙套</option>
                </select>
              </div>

              <div className="text-sm text-gray-500">
                共 {characters.length} 个角色
              </div>
            </div>

            {/* 角色为空时的提示 */}
            {characters.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-12 mb-6">
                <div className="flex flex-col items-center justify-center text-gray-400">
                  <Users className="w-16 h-16 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">暂无角色</h3>
                  <p className="text-sm text-gray-500 mb-4">该作品还没有添加任何角色</p>
                  <button 
                    onClick={() => setShowCharacterModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>添加第一个角色</span>
                  </button>
                </div>
              </div>
            )}

            {/* 图谱视图 */}
            {viewMode === 'graph' && characters.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 画布区域 */}
                <div className="lg:col-span-2">
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <canvas
                      ref={canvasRef}
                      className="w-full h-[600px] cursor-move"
                      onClick={handleCanvasClick}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    提示：点击角色查看详情，拖拽调整位置
                  </p>
                </div>

                {/* 详情面板 */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  {selectedCharacter ? (
                    <div>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div 
                            className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                            style={{ backgroundColor: selectedCharacter.color || '#3B82F6' }}
                          >
                            {safeFirstChar(selectedCharacter.name)}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">{safeStr(selectedCharacter.name, '未命名')}</h3>
                            <span className={`inline-block px-2 py-0.5 text-xs rounded-full mt-1 ${roleColors[safeRole(selectedCharacter.role)]}`}>
                              {roleLabels[safeRole(selectedCharacter.role)]}
                            </span>
                          </div>
                        </div>
                        <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                          <MoreVertical className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-gray-500">基本信息</label>
                          <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-400">性别:</span>
                              <span className="ml-2 text-gray-700">
                                {safeGender(selectedCharacter.gender)}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-400">年龄:</span>
                              <span className="ml-2 text-gray-700">{safeAge(selectedCharacter.age)}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="text-sm font-medium text-gray-500">外貌</label>
                          <p className="mt-1 text-sm text-gray-700">{safeStr(selectedCharacter.appearance, '暂无')}</p>
                        </div>

                        <div>
                          <label className="text-sm font-medium text-gray-500">性格</label>
                          <p className="mt-1 text-sm text-gray-700">{safeStr(selectedCharacter.personality, '暂无')}</p>
                        </div>

                        <div>
                          <label className="text-sm font-medium text-gray-500">背景</label>
                          <p className="mt-1 text-sm text-gray-700">{safeStr(selectedCharacter.background, '暂无')}</p>
                        </div>

                        <div>
                          <label className="text-sm font-medium text-gray-500">技能</label>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {safeStrArr(selectedCharacter.skills).length > 0 ? safeStrArr(selectedCharacter.skills).map((skill, index) => (
                              <span key={index} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">{skill}</span>
                            )) : <span className="text-sm text-gray-400">暂无技能</span>}
                          </div>
                        </div>

                        <div>
                          <label className="text-sm font-medium text-gray-500">关系</label>
                          <div className="mt-1 space-y-2">
                            {safeArr(selectedCharacter.relationships).length > 0 ? safeArr(selectedCharacter.relationships).map((rel, index) => {
                              const relObj = rel as Record<string, unknown>
                              const target = characters.find(c => c.id === relObj.targetId)
                              return (
                                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                  <div className="flex items-center space-x-2">
                                    <div 
                                      className="w-6 h-6 rounded-full"
                                      style={{ backgroundColor: target?.color || '#9CA3AF' }}
                                    ></div>
                                    <span className="text-sm font-medium text-gray-700">{target ? safeStr(target.name, '未知角色') : safeStr(relObj.targetId, '未知角色')}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs text-blue-600">{safeStr(relObj.type, '')}</span>
                                    <p className="text-xs text-gray-500">{safeStr(relObj.description, '')}</p>
                                  </div>
                                </div>
                              )
                            }) : <span className="text-sm text-gray-400">暂无关系</span>}
                          </div>
                          <button 
                            onClick={() => setShowRelationModal(true)}
                            className="w-full mt-2 px-3 py-2 border border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors text-sm"
                          >
                            + 添加关系
                          </button>
                        </div>
                      </div>

                      <div className="flex space-x-3 mt-6">
                        <button 
                          onClick={() => {
                            // 打开编辑弹窗：预填充当前角色数据
                            setShowCharacterModal(true)
                          }}
                          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                        >
                          编辑
                        </button>
                        <button 
                          onClick={async () => {
                            if (!selectedCharacter) return
                            const llmConfig = getLLMConfig()
                            if (!llmConfig?.apiKey) {
                              alert('请先在设置中配置AI模型')
                              return
                            }
                            try {
                              const response = await fetch('/tuzhong-wenshu/api/ai/generate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  type: 'backstory',
                                  character: selectedCharacter,
                                  llmConfig,
                                })
                              })
                              if (response.ok) {
                                const data = await response.json()
                                const backstory = safeStr(
                                  data.data?.backstory || data.data?.content || data.content || data.backstory,
                                  ''
                                )
                                setSelectedCharacter({
                                  ...selectedCharacter,
                                  background: backstory || '生成失败，请重试'
                                })
                              } else {
                                alert('生成背景故事失败，请重试')
                              }
                            } catch (error) {
                              console.error('生成背景故事失败:', error)
                              alert('生成背景故事失败，请检查网络连接')
                            }
                          }}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                          生成背景故事
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                      <User className="w-16 h-16 mb-4" />
                      <p>点击图谱中的角色查看详情</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 列表视图 */}
            {viewMode === 'list' && characters.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCharacters.map((char) => (
                  <div 
                    key={char.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: char.color || '#3B82F6' }}
                        >
                          {safeFirstChar(char.name)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{safeStr(char.name, '未命名')}</h3>
                          <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${roleColors[safeRole(char.role)]}`}>
                            {roleLabels[safeRole(char.role)]}
                          </span>
                        </div>
                      </div>
                      <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>

                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{safeStr(char.background, '暂无背景')}</p>

                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <span>{safeGender(char.gender)} · {safeAge(char.age)}</span>
                      <span>{safeArr(char.relationships).length} 个关系</span>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-4">
                      {safeStrArr(char.skills).slice(0, 3).map((skill, index) => (
                        <span 
                          key={index}
                          className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    <div className="flex space-x-2">
                      <button 
                        onClick={() => {
                          setSelectedCharacter(char)
                          setShowCharacterModal(true)
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                      >
                        编辑
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedCharacter(char)
                          setViewMode('graph')
                        }}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        查看详情
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* 添加角色弹窗 */}
      {showCharacterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">添加角色</h3>
              <button 
                onClick={() => setShowCharacterModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={async (e) => {
              e.preventDefault()
              const formData = new FormData(e.target as HTMLFormElement)
              const newCharacter = {
                name: formData.get('name'),
                role: formData.get('role'),
                gender: formData.get('gender') || 'other',
                age: Number(formData.get('age')) || 0,
                appearance: formData.get('appearance') || '',
                personality: formData.get('personality') || '',
                background: formData.get('background') || '',
                aliases: [],
                skills: [],
                relationships: [],
                color: ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'][Math.floor(Math.random() * 6)],
                novelId: selectedNovelId
              }
              
              try {
                const response = await fetch('/tuzhong-wenshu/api/characters', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newCharacter)
                })
                if (response.ok) {
                  setShowCharacterModal(false)
                  const charsResponse = await fetch(`/tuzhong-wenshu/api/characters?novelId=${selectedNovelId}`)
                  if (charsResponse.ok) {
                    const data = await charsResponse.json()
                    setCharacters(data.data || data.characters || [])
                  }
                } else {
                  alert('添加角色失败，请重试')
                }
              } catch (error) {
                console.error('添加角色失败:', error)
                alert('添加角色失败，请检查网络连接')
              }
            }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                  <input 
                    type="text" 
                    name="name"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="角色姓名"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">角色类型</label>
                  <select 
                    name="role"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="protagonist">主角</option>
                    <option value="antagonist">反派</option>
                    <option value="supporting">配角</option>
                    <option value="minor">龙套</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">性别</label>
                  <select 
                    name="gender"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">年龄</label>
                  <input 
                    type="number" 
                    name="age"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="年龄"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">外貌</label>
                <textarea 
                  name="appearance"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="描述角色的外貌特征..."
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">性格</label>
                <textarea 
                  name="personality"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="描述角色的性格特点..."
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">背景</label>
                <textarea 
                  name="background"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="描述角色的背景故事..."
                ></textarea>
              </div>

              <div className="flex space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowCharacterModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 添加关系弹窗 */}
      {showRelationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">添加关系</h3>
              <button 
                onClick={() => setShowRelationModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={async (e) => {
              e.preventDefault()
              const formData = new FormData(e.target as HTMLFormElement)
              const targetId = formData.get('targetId') as string
              const type = formData.get('type') as string
              const description = formData.get('description') as string
              
              if (!selectedCharacter || !targetId) return
              
              // 更新角色的关系列表
              const updatedCharacter = {
                ...selectedCharacter,
                relationships: [
                  ...selectedCharacter.relationships,
                  { targetId, type, description }
                ]
              }
              
              try {
                const response = await fetch('/tuzhong-wenshu/api/characters', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    novelId: selectedNovelId,
                    characterId: selectedCharacter.id,
                    ...updatedCharacter,
                  })
                })
                if (response.ok) {
                  setSelectedCharacter(updatedCharacter)
                  setShowRelationModal(false)
                  const charsResponse = await fetch(`/tuzhong-wenshu/api/characters?novelId=${selectedNovelId}`)
                  if (charsResponse.ok) {
                    const data = await charsResponse.json()
                    setCharacters(data.data || data.characters || [])
                  }
                } else {
                  alert('添加关系失败，请重试')
                }
              } catch (error) {
                console.error('添加关系失败:', error)
                alert('添加关系失败，请检查网络连接')
              }
            }}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">关联角色</label>
                <select 
                  name="targetId"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">选择角色...</option>
                  {characters.filter(c => c.id !== selectedCharacter?.id).map(char => (
                    <option key={char.id} value={char.id}>{char.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">关系类型</label>
                <select 
                  name="type"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="敌对">敌对</option>
                  <option value="友好">友好</option>
                  <option value="师徒">师徒</option>
                  <option value="爱慕">爱慕</option>
                  <option value="亲人">亲人</option>
                  <option value="利用">利用</option>
                  <option value="其他">其他</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">关系描述</label>
                <textarea 
                  name="description"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="描述两个角色之间的关系..."
                ></textarea>
              </div>

              <div className="flex space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowRelationModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
