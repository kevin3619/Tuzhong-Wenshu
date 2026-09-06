'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronRight, ChevronLeft, Sparkles, BookOpen, Settings, Zap, CheckCircle } from 'lucide-react'

interface GuideStep {
  id: string
  title: string
  description: string
  target?: string // CSS选择器，用于高亮特定元素
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  icon?: React.ReactNode
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'welcome',
    title: '欢迎使用途中文枢',
    description: '这是一款专为网文作者打造的AI写作助手。接下来用1分钟带你了解核心功能。',
    position: 'center',
    icon: <Sparkles className="w-8 h-8 text-stone-400" />,
  },
  {
    id: 'bookshelf',
    title: '作品书架',
    description: '在这里管理你的所有小说作品。点击"新建作品"开始创作，或选择已有作品继续写作。',
    target: '[data-guide="bookshelf"]',
    position: 'right',
    icon: <BookOpen className="w-6 h-6 text-stone-500" />,
  },
  {
    id: 'ai-generate',
    title: 'AI全自动生成',
    description: '输入关键词，AI帮你生成完整的小说设定：灵感、大纲、人物、世界观、章节规划...一键搞定！',
    target: '[data-guide="ai-generate"]',
    position: 'bottom',
    icon: <Zap className="w-6 h-6 text-yellow-500" />,
  },
  {
    id: 'skill',
    title: 'SKILL技能系统',
    description: '开启不同的写作技能，如"黄金三章"、"爽点密集"、"去AI化"等，让AI按你的需求生成内容。',
    target: '[data-guide="skill"]',
    position: 'right',
    icon: <Zap className="w-6 h-6 text-orange-500" />,
  },
  {
    id: 'settings',
    title: '模型配置（管理员）',
    description: '配置AI大模型API。普通用户无需关心此设置，系统会自动使用配置好的模型。',
    target: '[data-guide="settings"]',
    position: 'right',
    icon: <Settings className="w-6 h-6 text-stone-500" />,
  },
  {
    id: 'complete',
    title: '准备开始创作吧！',
    description: '点击"新建作品"→选择"AI全自动生成"，输入你的想法，让AI帮你开启写作之旅。',
    position: 'center',
    icon: <CheckCircle className="w-8 h-8 text-green-500" />,
  },
]

export function useOnboarding() {
  const [showGuide, setShowGuide] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [hasCompleted, setHasCompleted] = useState(true)

  useEffect(() => {
    // 检查是否是首次使用
    const completed = localStorage.getItem('tuzhong-onboarding-completed')
    if (!completed) {
      // 使用 microtask 避免 useEffect 中同步 setState 触发 React Compiler 警告
      queueMicrotask(() => {
        setHasCompleted(false)
        // 延迟显示，等页面加载完成
        setTimeout(() => setShowGuide(true), 1000)
      })
    }
  }, [])

  const startGuide = useCallback(() => {
    setCurrentStep(0)
    setShowGuide(true)
  }, [])

  const closeGuide = useCallback(() => {
    setShowGuide(false)
    localStorage.setItem('tuzhong-onboarding-completed', 'true')
    setHasCompleted(true)
  }, [])

  const nextStep = useCallback(() => {
    if (currentStep < GUIDE_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      closeGuide()
    }
  }, [currentStep, closeGuide])

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }, [currentStep])

  const skipGuide = useCallback(() => {
    closeGuide()
  }, [closeGuide])

  return {
    showGuide,
    currentStep,
    hasCompleted,
    currentGuideStep: GUIDE_STEPS[currentStep],
    totalSteps: GUIDE_STEPS.length,
    startGuide,
    closeGuide,
    nextStep,
    prevStep,
    skipGuide,
  }
}

interface OnboardingGuideProps {
  show: boolean
  currentStep: number
  totalSteps: number
  step: GuideStep
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
  onClose: () => void
}

export function OnboardingGuide({
  show,
  currentStep,
  totalSteps,
  step,
  onNext,
  onPrev,
  onSkip,
  onClose,
}: OnboardingGuideProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (step.target && show) {
      const element = document.querySelector(step.target)
      if (element) {
        const rect = element.getBoundingClientRect()
        // 滚动到目标元素
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // 使用 microtask 避免 useEffect 中同步 setState 触发 React Compiler 警告
        queueMicrotask(() => setTargetRect(rect))
      }
    } else {
      queueMicrotask(() => setTargetRect(null))
    }
  }, [step, show])

  if (!show) return null

  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === totalSteps - 1

  // 计算弹窗位置
  const getTooltipPosition = () => {
    if (step.position === 'center' || !targetRect) {
      return {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }
    }

    const spacing = 16
    switch (step.position) {
      case 'right':
        return {
          left: `${targetRect.right + spacing}px`,
          top: `${targetRect.top + targetRect.height / 2}px`,
          transform: 'translateY(-50%)',
        }
      case 'left':
        return {
          left: `${targetRect.left - spacing}px`,
          top: `${targetRect.top + targetRect.height / 2}px`,
          transform: 'translate(-100%, -50%)',
        }
      case 'bottom':
        return {
          left: `${targetRect.left + targetRect.width / 2}px`,
          top: `${targetRect.bottom + spacing}px`,
          transform: 'translateX(-50%)',
        }
      case 'top':
        return {
          left: `${targetRect.left + targetRect.width / 2}px`,
          top: `${targetRect.top - spacing}px`,
          transform: 'translate(-50%, -100%)',
        }
      default:
        return {
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }
    }
  }

  const tooltipStyle = getTooltipPosition()

  return (
    <div className="fixed inset-0 z-[100]">
      {/* 遮罩层 */}
      <div 
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onSkip}
      />

      {/* 高亮区域 */}
      {targetRect && (
        <div
          className="absolute border-2 border-stone-400 rounded-lg pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
          style={{
            left: targetRect.left - 4,
            top: targetRect.top - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      {/* 引导弹窗 */}
      <div
        className="absolute bg-white rounded-2xl shadow-2xl p-6 w-[360px] transition-all duration-300"
        style={tooltipStyle}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 图标 */}
        {step.icon && (
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-stone-50 rounded-full">
              {step.icon}
            </div>
          </div>
        )}

        {/* 内容 */}
        <h3 className="text-lg font-bold text-stone-900 text-center mb-2">
          {step.title}
        </h3>
        <p className="text-sm text-stone-600 text-center leading-relaxed">
          {step.description}
        </p>

        {/* 进度指示器 */}
        <div className="flex justify-center gap-1.5 mt-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentStep ? 'bg-stone-400' : 'bg-stone-200'
              }`}
            />
          ))}
        </div>

        {/* 按钮组 */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={onSkip}
            className="text-sm text-stone-400 hover:text-stone-600"
          >
            跳过引导
          </button>
          
          <div className="flex gap-2">
            {!isFirstStep && (
              <button
                onClick={onPrev}
                className="flex items-center gap-1 px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
                上一步
              </button>
            )}
            <button
              onClick={onNext}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-800 rounded-lg"
            >
              {isLastStep ? '开始创作' : '下一步'}
              {!isLastStep && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 步骤计数 */}
        <div className="text-center mt-3 text-xs text-stone-400">
          {currentStep + 1} / {totalSteps}
        </div>
      </div>
    </div>
  )
}

// 重新观看引导按钮组件
export function RestartGuideButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-50 rounded-lg transition-colors"
    >
      <Sparkles className="w-4 h-4" />
      重新观看引导
    </button>
  )
}
