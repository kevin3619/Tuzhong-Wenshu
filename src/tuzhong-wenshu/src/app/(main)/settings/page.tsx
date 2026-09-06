'use client'

import { useState, useEffect } from 'react'
import {
  Settings, Cpu, PenTool, UserCircle, Plus, X, Check, Trash2,
  Edit3, Shield, Globe, Cloud, Server, BookOpen,
  Save, ChevronRight,
  Sparkles, Zap, Moon, Wind, Search, Crown,
  ShieldAlert, AlertTriangle, ScanSearch, FileSearch, Lightbulb,
} from 'lucide-react'
import Link from 'next/link'
import UserProfileCard from '@/components/UserProfileCard'
import AIDetectionLibrary from '@/components/AIDetectionLibrary'
import { PRESET_STYLES } from '@/lib/ai-service'

interface AIModelItem {
  id: string
  name: string
  provider: string
  apiKey?: string
  baseUrl?: string
  model?: string
  presetModels?: string[]
  status: 'default' | 'active' | 'inactive'
  temperature?: number
  topP?: number
  contextWindow?: number
  maxTokens?: number
  presencePenalty?: number
  frequencyPenalty?: number
  usageTag?: string
  isAdminDefault?: boolean
  userId?: string
}

interface ModelPresetItem {
  id: string
  name: string
  description: string
  usageTag: string
  provider: string
  model: string
  temperature: number
  topP: number
  contextWindow: number
  maxTokens: number
  presencePenalty: number
  frequencyPenalty: number
  color: string
  icon: string
}

const modelPresetPool: ModelPresetItem[] = [
  {
    id: 'sf-qwen25-7b', name: '首选正文：Qwen2.5-7B',
    description: '硅基流动9B以下永久免费主力模型，中文理解强叙事流畅，番茄/起点网文风格适配度极高',
    usageTag: '正文写作', provider: '硅基流动', model: 'Qwen/Qwen2.5-7B-Instruct',
    temperature: 0.63, topP: 0.74, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.02, frequencyPenalty: 1.03, color: 'blue', icon: '🏆',
  },
  {
    id: 'sf-glm4-9b', name: '大纲权谋：GLM-4-9B-0414',
    description: '硅基流动9B永久免费模型，长文本一致性佳、逻辑推理强，权谋推演/世界观构建首选',
    usageTag: '大纲生成', provider: '硅基流动', model: 'THUDM/GLM-4-9B-0414',
    temperature: 0.40, topP: 0.60, contextWindow: 128000, maxTokens: 4000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'purple', icon: '📋',
  },
  {
    id: 'sf-glmz1-9b', name: '权谋战争：GLM-Z1-9B-0414',
    description: '硅基流动9B永久免费模型，朝堂博弈/军政谈判/大型战役智力交锋节奏把控专业',
    usageTag: '权谋战争', provider: '硅基流动', model: 'THUDM/GLM-Z1-9B-0414',
    temperature: 0.55, topP: 0.70, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.05, frequencyPenalty: 1.04, color: 'red', icon: '⚔️',
  },
  {
    id: 'sf-qwen3-8b', name: '备用正文：Qwen3-8B',
    description: '硅基流动9B以下永久免费综合备用模型，响应速度快，Qwen2.5-7B降级无缝切换',
    usageTag: '正文备用', provider: '硅基流动', model: 'Qwen/Qwen3-8B',
    temperature: 0.63, topP: 0.74, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.02, frequencyPenalty: 1.03, color: 'cyan', icon: '🔄',
  },
  {
    id: 'sf-qwen35-4b', name: '极速轻量：Qwen3.5-4B',
    description: '硅基流动4B永久免费极速模型，大纲碎片灵感快速捕捉/辅助扩写，响应毫秒级',
    usageTag: '大纲权谋备用', provider: '硅基流动', model: 'Qwen/Qwen3.5-4B',
    temperature: 0.40, topP: 0.60, contextWindow: 128000, maxTokens: 4000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'teal', icon: '🛡️',
  },
  {
    id: 'sf-hunyuan-7b', name: '翻译润色：Hunyuan-MT-7B',
    description: '硅基流动7B永久免费翻译润色专用模型，小说文本降AI/精炼表达/文风统一神器',
    usageTag: '翻译润色', provider: '硅基流动', model: 'tencent/Hunyuan-MT-7B',
    temperature: 0.5, topP: 0.7, contextWindow: 128000, maxTokens: 2000,
    presencePenalty: 0.8, frequencyPenalty: 0.8, color: 'emerald', icon: '✍️',
  },
  {
    id: 'sf-kolors', name: '封面绘图：Kwai-Kolors',
    description: '硅基流动图像生成完全免费无限制，小说封面绘图专用，768×1024番茄标准封面',
    usageTag: '封面绘图', provider: '硅基流动', model: 'Kwai-Kolors/Kolors',
    temperature: 1.0, topP: 1.0, contextWindow: 0, maxTokens: 0,
    presencePenalty: 0, frequencyPenalty: 0, color: 'green', icon: '🎨',
  },
  // 🔥 2026-09-01 第20轮：补齐第 8 个已配置硅基流动模型（非免费，按量计费，仅 bookAnalysis 每部 1 次）
  {
    id: 'sf-dsv4-flash', name: '开局分析：DeepSeek-V4-Flash',
    description: '硅基流动第8款已配置模型（按量计费非免费），推理能力强，仅用于 bookAnalysis 开局骨架分析（每部1次），其余环节一律免费模型',
    usageTag: '开局分析', provider: '硅基流动', model: 'deepseek-ai/DeepSeek-V4-Flash',
    temperature: 0.55, topP: 0.70, contextWindow: 128000, maxTokens: 4000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'blue', icon: '🚀',
  },
]

// 2026-08-10：智谱 BigModel 免费模型预设卡片（定价页显示免费）
const zhipuPresetPool: ModelPresetItem[] = [
  {
    id: 'zhipu-glm47-flash', name: '超高速正文：GLM-4.7-Flash',
    description: '智谱 BigModel 免费模型，200K 超长上下文，适合正文续写与长文本连贯生成',
    usageTag: '正文写作', provider: '智谱GLM', model: 'glm-4.7-flash',
    temperature: 0.60, topP: 0.70, contextWindow: 200000, maxTokens: 4000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'blue', icon: '⚡',
  },
  {
    id: 'zhipu-glmz1-flash', name: '推理规划：GLM-Z1-Flash',
    description: '智谱 BigModel 免费推理模型，128K 上下文，适合大纲/角色/世界观等结构化规划步',
    usageTag: '大纲生成', provider: '智谱GLM', model: 'glm-z1-flash',
    temperature: 0.55, topP: 0.65, contextWindow: 128000, maxTokens: 4000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'purple', icon: '🧠',
  },
  {
    id: 'zhipu-glm4-flash', name: '综合全能：GLM-4-Flash',
    description: '智谱 BigModel 免费语言模型，128K 上下文，响应快、中文创意稳定，可作正文主力',
    usageTag: '综合全能', provider: '智谱GLM', model: 'glm-4-flash',
    temperature: 0.63, topP: 0.74, contextWindow: 128000, maxTokens: 4000,
    presencePenalty: 1.02, frequencyPenalty: 1.03,     color: 'cyan', icon: '🎯',
  },
]

// 2026-08-30：OpenRouter 永久免费模型预设卡片（:free 档，替换已下架旧 ID 为当前可用模型）
const openrouterPresetPool: ModelPresetItem[] = [
  {
    id: 'or-minimax-m3', name: '免费主力：MiniMax-M3',
    description: 'OpenRouter 免费档，1M 上下文，实测文笔与长文本一致性最佳，正文/大纲主力',
    usageTag: '正文写作', provider: 'OpenRouter', model: 'minimax/minimax-m3:free',
    temperature: 0.63, topP: 0.74, contextWindow: 1000000, maxTokens: 4000,
    presencePenalty: 1.02, frequencyPenalty: 1.03, color: 'purple', icon: '🧠',
  },
  {
    id: 'or-minimax-m27', name: '推理副力：MiniMax-M2.7',
    description: 'OpenRouter 免费档，推理模型，质量好；需给足 maxTokens 否则思考耗尽返回空',
    usageTag: '大纲生成', provider: 'OpenRouter', model: 'minimax/minimax-m2.7:free',
    temperature: 0.55, topP: 0.70, contextWindow: 200000, maxTokens: 4000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'cyan', icon: '🔄',
  },
  {
    id: 'or-dots3', name: '长正文：Dots-3-Note-Preview',
    description: 'OpenRouter 免费档，长正文见长；偶发中英混杂，建议非正文主用',
    usageTag: '正文备用', provider: 'OpenRouter', model: 'dots-studio/dots-3-note-preview:free',
    temperature: 0.60, topP: 0.70, contextWindow: 128000, maxTokens: 4000,
    presencePenalty: 1.02, frequencyPenalty: 1.03, color: 'red', icon: '📝',
  },
  {
    id: 'or-nemotron-super', name: '推理备用：Nemotron-3-Super-120B',
    description: 'OpenRouter 免费档，120B MoE 推理，结构化规划备用，偏慢',
    usageTag: '权谋战争', provider: 'OpenRouter', model: 'nvidia/nemotron-3-super-120b-a12b:free',
    temperature: 0.55, topP: 0.70, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.05, frequencyPenalty: 1.04, color: 'blue', icon: '⚔️',
  },
  {
    id: 'or-lfm-26b', name: '极速轻量：LFM-2.5-2.6B',
    description: 'OpenRouter 免费档，2.6B 极速模型，灵感碎片/辅助扩写毫秒级',
    usageTag: '极速轻量', provider: 'OpenRouter', model: 'liquid/lfm-2.5-2.6b:free',
    temperature: 0.40, topP: 0.60, contextWindow: 32000, maxTokens: 4000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'teal', icon: '🛡️',
  },
  {
    id: 'or-nemotron-ultra', name: '长文备用：Nemotron-3-Ultra-550B',
    description: 'OpenRouter 免费档，550B MoE 大参数，长文综合强，但很慢，仅备用',
    usageTag: '正文写作', provider: 'OpenRouter', model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    temperature: 0.63, topP: 0.74, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.02, frequencyPenalty: 1.03, color: 'emerald', icon: '🏆',
  },
  {
    id: 'or-gemma4-31b', name: '备用：Gemma-4-31B',
    description: 'OpenRouter 免费档，谷歌 31B，输出稳健合规，综合生成可用',
    usageTag: '综合全能', provider: 'OpenRouter', model: 'google/gemma-4-31b-it:free',
    temperature: 0.60, topP: 0.70, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'blue', icon: '💎',
  },
  {
    id: 'or-glm52', name: '备用：GLM-5.2',
    description: 'OpenRouter 免费档，智谱 5.2，中文创意与推理均衡，正文/大纲均可（易 429）',
    usageTag: '正文写作', provider: 'OpenRouter', model: 'z-ai/glm-5.2:free',
    temperature: 0.60, topP: 0.72, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.02, frequencyPenalty: 1.03, color: 'green', icon: '✨',
  },
  {
    id: 'or-north-mini-code', name: '备用：North-Mini-Code',
    description: 'OpenRouter 免费档，轻量模型，结构化/代码向辅助，极速响应',
    usageTag: '极速轻量', provider: 'OpenRouter', model: 'cohere/north-mini-code:free',
    temperature: 0.50, topP: 0.70, contextWindow: 128000, maxTokens: 2000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'cyan', icon: '🌬️',
  },
  {
    id: 'or-gemma4-26b', name: '备用：Gemma-4-26B-A4B',
    description: 'OpenRouter 免费档，26B 稀疏 MoE，大参数综合能力，大纲/正文备用',
    usageTag: '大纲生成', provider: 'OpenRouter', model: 'google/gemma-4-26b-a4b-it:free',
    temperature: 0.50, topP: 0.70, contextWindow: 128000, maxTokens: 4000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'purple', icon: '🚀',
  },
]

// 2026-08-12：Groq 永久免费模型预设卡片（免费档有速率额度限制）
const groqPresetPool: ModelPresetItem[] = [
  {
    id: 'groq-llama-33-70b', name: '综合全能：Llama-3.3-70B',
    description: 'Groq 免费档，Meta 70B 极速推理，中文创意稳定，可作正文主力',
    usageTag: '综合全能', provider: 'Groq', model: 'llama-3.3-70b-versatile',
    temperature: 0.63, topP: 0.74, contextWindow: 128000, maxTokens: 4000,
    presencePenalty: 1.02, frequencyPenalty: 1.03, color: 'blue', icon: '🎯',
  },
  {
    id: 'groq-llama-31-8b', name: '极速：Llama-3.1-8B',
    description: 'Groq 免费档，8B 毫秒级响应，大纲碎片/灵感捕捉专用',
    usageTag: '极速轻量', provider: 'Groq', model: 'llama-3.1-8b-instant',
    temperature: 0.40, topP: 0.60, contextWindow: 128000, maxTokens: 4000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'teal', icon: '⚡',
  },
  {
    id: 'groq-ds-r1-70b', name: '强推理：DeepSeek-R1-Distill-70B',
    description: 'Groq 免费档，R1 蒸馏 70B，权谋战争/大型战役智力交锋专业',
    usageTag: '权谋战争', provider: 'Groq', model: 'deepseek-r1-distill-llama-70b',
    temperature: 0.55, topP: 0.70, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.05, frequencyPenalty: 1.04, color: 'red', icon: '⚔️',
  },
  {
    id: 'groq-ds-r1-32b', name: '推理：DeepSeek-R1-Distill-32B',
    description: 'Groq 免费档，R1 蒸馏 32B，大纲/角色/世界观等结构化规划步',
    usageTag: '大纲生成', provider: 'Groq', model: 'deepseek-r1-distill-qwen-32b',
    temperature: 0.55, topP: 0.70, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.05, frequencyPenalty: 1.04, color: 'purple', icon: '🧠',
  },
  {
    id: 'groq-qwen25-32b', name: '中文：Qwen2.5-32B',
    description: 'Groq 免费档，阿里 32B，中文理解与叙事流畅，正文续写可用',
    usageTag: '正文写作', provider: 'Groq', model: 'qwen-2.5-32b',
    temperature: 0.63, topP: 0.74, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.02, frequencyPenalty: 1.03, color: 'emerald', icon: '🏆',
  },
  {
    id: 'groq-gemma2-9b', name: '稳健：Gemma2-9B',
    description: 'Groq 免费档，谷歌 9B，输出稳健合规，轻量综合生成',
    usageTag: '综合全能', provider: 'Groq', model: 'gemma2-9b-it',
    temperature: 0.60, topP: 0.70, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'green', icon: '💎',
  },
]

// 2026-08-12：腾讯混元 永久免费模型预设卡片
const hunyuanPresetPool: ModelPresetItem[] = [
  {
    id: 'hy-lite', name: '国产免费：Hunyuan-Lite',
    description: '腾讯混元永久免费模型，国产大模型，中文创作与理解稳定，可作正文主力备选',
    usageTag: '正文写作', provider: '腾讯混元', model: 'hunyuan-lite',
    temperature: 0.63, topP: 0.74, contextWindow: 128000, maxTokens: 3000,
    presencePenalty: 1.02, frequencyPenalty: 1.03, color: 'red', icon: '🐧',
  },
]

// 🔥 2026-09-01 第20轮：商汤日日新 模型预设卡片（已配置 1 套：sensenova-6.8-flash-lite）
const sensenovaPresetPool: ModelPresetItem[] = [
  {
    id: 'st-68-flash-lite', name: '极速轻量：SenseNova-6.8-Flash-Lite',
    description: '商汤日日新免费档轻量模型，响应快、指令遵从好、结构化 JSON 输出干净，可作人物/大纲等结构化步备选',
    usageTag: '综合备用', provider: '商汤 (SenseTime)', model: 'sensenova-6.8-flash-lite',
    temperature: 0.50, topP: 0.70, contextWindow: 128000, maxTokens: 4000,
    presencePenalty: 1.00, frequencyPenalty: 1.00, color: 'emerald', icon: '🌆',
  },
]

const PRESET_COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700' },
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-green-100 text-green-700' },
  cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-800', badge: 'bg-cyan-100 text-cyan-700' },
  teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', badge: 'bg-teal-100 text-teal-700' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700' },
}

function renderPresetCards(presets: ModelPresetItem[], isAdmin: boolean, aiModelBatch: AIModelItem[]) {
  return presets.map(function (preset) {
    const c = PRESET_COLOR_MAP[preset.color] || PRESET_COLOR_MAP.blue
    const presetProvider = String(preset.provider || '').trim()
    const presetModel = String(preset.model || '').trim()
    const alreadyAdded = isAdmin
      ? aiModelBatch.some(function (m) {
          const mProvider = String(m.provider || '').trim()
          const mModel = String(m.model || '').trim()
          return mModel === presetModel && (
            mProvider === presetProvider ||
            (presetProvider === '硅基流动' && (mProvider === '硅基流动' || mProvider === '硅基流动 (SiliconFlow)')) ||
            ((presetProvider === '硅基流动' || presetProvider === '硅基流动 (SiliconFlow)') && mProvider === '硅基流动')
          )
        })
      : true
      return (
      <div key={preset.id} className="bg-white rounded-xl border border-gray-200 p-4 relative shadow-sm hover:shadow-md hover:border-gray-300 transition-all h-full flex flex-col">
        {alreadyAdded ? (
          <div className="absolute top-2.5 right-2.5" title="已添加：在「已配置模型」列表中已找到对应 provider+model 的记录">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-[10px] rounded-full font-medium border border-green-100">
              <Check className="w-3 h-3" />已添加
            </span>
          </div>
        ) : (
          <div className="absolute top-2.5 right-2.5" title="未添加：点击上方「导入」按钮填入 Key 后启用">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 text-[10px] rounded-full font-medium border border-gray-100">
              <span className="w-2.5 h-2.5 rounded-full border border-gray-400 border-dashed inline-block"></span>未添加
            </span>
          </div>
        )}
        <div className="flex items-start gap-3 h-full">
          <span className="text-xl mt-0.5 shrink-0">{preset.icon}</span>
          <div className="flex-1 min-w-0 flex flex-col h-full">
            <h3 className="font-semibold text-sm text-gray-900 leading-snug pr-14">{preset.name}</h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={'px-1.5 py-0.5 text-[10px] rounded font-medium ' + c.badge}>{preset.usageTag}</span>
              <span className="text-[10px] text-gray-400 font-mono truncate max-w-[130px]" title={preset.model}>{preset.model}</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2 min-h-[2.5em] leading-[1.25em]">{preset.description}</p>
            <div className="pt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-gray-500">
              <span>温度 <b className="text-gray-700">{preset.temperature}</b></span>
              <span>TopP <b className="text-gray-700">{preset.topP}</b></span>
              <span>上下文 <b className="text-gray-700">{preset.contextWindow >= 1000000 ? preset.contextWindow / 1000000 + 'M' : preset.contextWindow / 1000 + 'K'}</b></span>
              <span>最大长度 <b className="text-gray-700">{preset.maxTokens}</b></span>
              <span>存在惩罚 <b className="text-gray-700">{preset.presencePenalty}</b></span>
              <span>频率惩罚 <b className="text-gray-700">{preset.frequencyPenalty}</b></span>
            </div>
          </div>
        </div>
      </div>
    )
  })
}

const providerIconMap: Record<string, React.ElementType> = {
  'OpenAI': Globe, 'Claude (Anthropic)': Shield, 'Google Gemini': Sparkles,
  'DeepSeek': Cpu, 'Mistral': Wind, 'Cohere': Zap, 'Perplexity': Search,
  'Groq': Zap, 'Together AI': Server, 'OpenRouter': Globe,
  '通义千问 (阿里)': Cloud, '文心一言 (百度)': Cloud, '智谱GLM': Cpu,
  '讯飞星火': Zap, '月之暗面 (Kimi)': Moon, '百川智能': Server,
  '零一万物 (Yi)': Sparkles, 'MiniMax': Cpu, '阶跃星辰 (Step)': Zap,
  '腾讯混元': Cloud, '字节豆包': Cpu, '硅基流动 (SiliconFlow)': Zap, '硅基流动': Zap,
  '商汤 (SenseTime)': Cpu,
  '302.AI': Globe, 'AiHubMix': Globe, 'ChatAnywhere': Globe, 'gpt.ge': Globe, 'CloseAI': Globe, 'VoAPI': Globe, '无问芯穹 (Infini)': Server, '自定义中转 (OpenAI兼容)': Globe,
  'Ollama (本地)': Server, 'LM Studio (本地)': Server, 'vLLM (本地)': Server,
}

const providerColorMap: Record<string, { bg: string; text: string; border: string }> = {
  'OpenAI': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  'Claude (Anthropic)': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  'Google Gemini': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  'DeepSeek': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  'Mistral': { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  'Cohere': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Perplexity': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  'Groq': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'Together AI': { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  'OpenRouter': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  '通义千问 (阿里)': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  '文心一言 (百度)': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  '智谱GLM': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  '讯飞星火': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  '月之暗面 (Kimi)': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  '百川智能': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  '零一万物 (Yi)': { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200' },
  'MiniMax': { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200' },
  '阶跃星辰 (Step)': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  '腾讯混元': { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  '字节豆包': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  '硅基流动 (SiliconFlow)': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  '硅基流动': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  '商汤 (SenseTime)': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  '302.AI': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  'AiHubMix': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  'ChatAnywhere': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  'gpt.ge': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  'CloseAI': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  'VoAPI': { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  '无问芯穹 (Infini)': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  '自定义中转 (OpenAI兼容)': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  'Ollama (本地)': { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
  'LM Studio (本地)': { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
  'vLLM (本地)': { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
}

// 中转/聚合站（New-API/One-API）通用可选模型清单（各站实际型号以其后台为准，可自由增删）
const _RELAY_MODELS: string[] = ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner', 'qwen3.7-flash', 'qwen-plus', 'glm-4.6', 'kimi-latest']

const providerPresetMap: Record<string, { baseUrl: string; models: string[]; defaultModel: string }> = {
  // ===== 国际模型 =====
  'OpenAI': { baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'chatgpt-4o-latest', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o1-preview', 'o3', 'o3-mini', 'o4-mini', 'o4-mini-high'], defaultModel: 'gpt-4o-mini' },
  'Claude (Anthropic)': { baseUrl: 'https://api.anthropic.com/v1', models: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest', 'claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'], defaultModel: 'claude-sonnet-4-20250514' },
  'Google Gemini': { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'], defaultModel: 'gemini-2.5-flash' },
  'DeepSeek': { baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp'], defaultModel: 'deepseek-chat' },
  'Mistral': { baseUrl: 'https://api.mistral.ai/v1', models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'pixtral-large-latest', 'ministral-8b-latest', 'ministral-3b-latest', 'codestral-latest', 'devstral-latest', 'open-mistral-nemo', 'open-mixtral-8x22b'], defaultModel: 'mistral-large-latest' },
  'Groq': { baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'deepseek-r1-distill-llama-70b', 'qwen-qwq-32b', 'mistral-saba-24b', 'gemma2-9b-it', 'mixtral-8x7b-32768'], defaultModel: 'llama-3.3-70b-versatile' },
  'Together AI': { baseUrl: 'https://api.together.xyz/v1', models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'meta-llama/Llama-3-70b-chat-hf', 'deepseek-ai/DeepSeek-R1', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'], defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  'OpenRouter': { baseUrl: 'https://openrouter.ai/api/v1', models: ['openai/gpt-4o', 'openai/o3-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.5-pro', 'deepseek/deepseek-chat-v3-0324', 'deepseek/deepseek-r1', 'meta-llama/llama-3.3-70b-instruct', 'qwen/qwen-2.5-72b-instruct', 'mistralai/mistral-large', 'x-ai/grok-2-1212'], defaultModel: 'openai/gpt-4o' },
  'Perplexity': { baseUrl: 'https://api.perplexity.ai', models: ['sonar-pro', 'sonar', 'sonar-reasoning-pro', 'sonar-reasoning', 'sonar-deep-research'], defaultModel: 'sonar-pro' },
  'Cohere': { baseUrl: 'https://api.cohere.ai/v1', models: ['command-a-plus-07-2025', 'command-r-plus-08-2024', 'command-r-08-2024', 'command', 'command-light'], defaultModel: 'command-r-plus-08-2024' },
  // ===== 国内模型 =====
  '通义千问 (阿里)': { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-max', 'qwen-max-latest', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwen3-max', 'qwen3-235b-a22b', 'qwen2.5-72b-instruct', 'qwq-plus', 'qwq-32b'], defaultModel: 'qwen-plus' },
  '文心一言 (百度)': { baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop', models: ['ernie-4.0-8k', 'ernie-4.0-turbo-8k', 'ernie-3.5-8k', 'ernie-speed-128k', 'ernie-lite-8k', 'ernie-x1-turbo-32k'], defaultModel: 'ernie-4.0-8k' },
  '智谱GLM': { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.7-flash', 'glm-z1-flash', 'glm-z1-air', 'glm-z1', 'glm-4-plus', 'glm-4-flash', 'glm-4-air', 'glm-4-long', 'characterglm'], defaultModel: 'glm-4-flash' },
  '讯飞星火': { baseUrl: 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2', models: ['Spark-X2-Flash', 'Spark-Pro-128K-32B', 'Spark-Max', 'Spark-Lite', 'x1-flash', 'deepseek-r1', 'qwen-plus'], defaultModel: 'Spark-X2-Flash' },
  '月之暗面 (Kimi)': { baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-latest', 'kimi-thinking', 'kimi-k2-0905-preview', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'], defaultModel: 'kimi-latest' },
  '百川智能': { baseUrl: 'https://api.baichuan-ai.com/v1', models: ['Baichuan4-Turbo', 'Baichuan4-Air', 'Baichuan4', 'Baichuan3-Turbo', 'Baichuan3-Turbo-128k'], defaultModel: 'Baichuan4-Turbo' },
  '零一万物 (Yi)': { baseUrl: 'https://api.lingyiwanwu.com/v1', models: ['yi-large', 'yi-large-rag', 'yi-large-fc', 'yi-medium', 'yi-vision', 'yi-lightning'], defaultModel: 'yi-large' },
  'MiniMax': { baseUrl: 'https://api.minimax.chat/v1', models: ['MiniMax-Text-01', 'MiniMax-Character', 'abab6.5s-chat', 'abab6.5t-moe'], defaultModel: 'MiniMax-Text-01' },
  '阶跃星辰 (Step)': { baseUrl: 'https://api.stepfun.com/v1', models: ['step-2-16k', 'step-1-8k', 'step-1-32k', 'step-1-256k', 'step-1-flash', 'step-r1-v-mini'], defaultModel: 'step-2-16k' },
  '腾讯混元': { baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', models: ['hunyuan-turbo', 'hunyuan-t1-latest', 'hunyuan-pro', 'hunyuan-standard', 'hunyuan-standard-256k', 'hunyuan-lite'], defaultModel: 'hunyuan-turbo' },
  '字节豆包': { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: ['doubao-1-5-pro-32k-250115', 'doubao-1-5-pro-128k-250115', 'doubao-1-5-lite-32k-250115', 'doubao-1-5-thinking-pro', 'doubao-seed-1-6-250615', 'doubao-pro-256k'], defaultModel: 'doubao-1-5-pro-32k-250115' },
  '硅基流动 (SiliconFlow)': { baseUrl: 'https://api.siliconflow.cn/v1', models: [
    'deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-7B-Instruct', 'Qwen/Qwen3-8B',
    'THUDM/GLM-4-9B-0414', 'THUDM/GLM-Z1-9B-0414', 'Qwen/Qwen2.5-72B-Instruct', 'Qwen/QwQ-32B',
    'meta-llama/Llama-3.3-70B-Instruct', 'Pro/deepseek-ai/DeepSeek-V3',
  ], defaultModel: 'deepseek-ai/DeepSeek-V3' },
  '商汤 (SenseTime)': { baseUrl: 'https://token.sensenova.cn/v1', models: ['sensenova-6.8-flash-lite', 'sensenova-6.7-flash', 'sensenova-6.5-flash', 'sensenova-6.5-pro', 'sensenova-5.2-flash', 'sensenova-5.2-pro', 'sensenova-5', 'deepseek-r1'], defaultModel: 'sensenova-6.8-flash-lite' },
  // ===== 中转 / 聚合平台（OpenAI 兼容） =====
  '302.AI': { baseUrl: 'https://api.302.ai/v1', models: ['gpt-4o', 'gpt-4o-mini', 'claude-3-7-sonnet', 'gemini-2.0-flash', 'deepseek-chat', 'deepseek-reasoner', 'qwen2.5-72b-instruct'], defaultModel: 'gpt-4o-mini' },
  'AiHubMix': { baseUrl: 'https://aihubmix.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'gemini-2.0-flash-exp', 'deepseek-chat', 'glm-4-plus'], defaultModel: 'gpt-4o-mini' },
  'ChatAnywhere': { baseUrl: 'https://api.chatanywhere.tech/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'claude-3-5-sonnet', 'gemini-2.0-flash'], defaultModel: 'gpt-4o-mini' },
  'gpt.ge': { baseUrl: 'https://api.gpt.ge/v1', models: ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash', 'deepseek-chat'], defaultModel: 'gpt-4o-mini' },
  'CloseAI': { baseUrl: 'https://api.closeai-proxy.xyz/v1', models: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'gemini-1.5-pro'], defaultModel: 'gpt-4o-mini' },
  'VoAPI': { baseUrl: 'https://api.voapi.re/v1', models: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'gemini-2.5-pro', 'deepseek-chat'], defaultModel: 'gpt-4o-mini' },
  '无问芯穹 (Infini)': { baseUrl: 'https://cloud.infini-ai.com/maas/v1', models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct', 'THUDM/glm-4-9b-chat'], defaultModel: 'deepseek-ai/DeepSeek-V3' },
  // ----- 国内 New-API/One-API 商业中转站·生产级（有主体/可谈商务扩容；Base URL 以官网为准，需自备 key）-----
  '词元之河': { baseUrl: '', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  '词元无忧 (token5u)': { baseUrl: '', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  'DMXAPI': { baseUrl: 'https://www.dmxapi.cn/v1', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  'TokenRunning': { baseUrl: '', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  '酷站 AI (koozhan)': { baseUrl: 'https://api.koozhan.com/v1', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  '非线智能 (NoneLinear)': { baseUrl: '', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  'JellyToken 智渲云': { baseUrl: '', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  // ----- 国内 New-API/One-API 社区中转站·仅测试用（无 SLA/高峰限流/慎用生产）-----
  'PackyAPI': { baseUrl: 'https://www.packyapi.com/v1', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  '柏拉图 AI (bltcy)': { baseUrl: 'https://api.bltcy.ai/v1', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  '小爱中转 (xiaoai.plus)': { baseUrl: 'https://api.xiaoai.plus/v1', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  'Laozhang.ai': { baseUrl: 'https://api.laozhang.ai/v1', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  'Apiyi': { baseUrl: 'https://api.apiyi.com/v1', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  '88code': { baseUrl: '', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  'mnapi': { baseUrl: 'https://www.mnapi.com/v1', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  '一步 API (yibuapi)': { baseUrl: 'https://yibuapi.com/v1', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  'jiekou.ai': { baseUrl: 'https://api.jiekou.ai/v1', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  '0011.ai': { baseUrl: 'https://www.0011.ai/v1', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  'Privnode': { baseUrl: '', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  '自定义中转 (OpenAI兼容)': { baseUrl: '', models: _RELAY_MODELS, defaultModel: 'deepseek-v4-flash' },
  // ===== 本地部署 =====
  'Ollama (本地)': { baseUrl: 'http://localhost:11434/v1', models: ['qwen2.5:72b', 'qwen2.5:32b', 'qwen2.5:14b', 'qwen2.5:7b', 'llama3.1:70b', 'deepseek-r1:70b', 'deepseek-r1:7b', 'gemma2:27b'], defaultModel: 'qwen2.5:72b' },
  'LM Studio (本地)': { baseUrl: 'http://localhost:1234/v1', models: ['default'], defaultModel: 'default' },
  'vLLM (本地)': { baseUrl: 'http://localhost:8000/v1', models: ['default'], defaultModel: 'default' },
}

const autoSaveIntervalPool = [
  { id: '30s', label: '30秒', value: 30 }, { id: '1m', label: '1分钟', value: 60 },
  { id: '2m', label: '2分钟', value: 120 }, { id: '5m', label: '5分钟', value: 300 },
  { id: 'off', label: '关闭', value: 0 },
]

const continuationLengthPool = [
  { id: 'short', label: '短篇 (500字)', value: 500 }, { id: 'medium', label: '中篇 (1000字)', value: 1000 },
  { id: 'long', label: '长篇 (2000字)', value: 2000 }, { id: 'custom', label: '自定义', value: 0 },
]

// 扩展预设风格（风格工坊整合）
// 重要：直接使用 PRESET_STYLES 作为 extendedStyles 主体（不重复定义相同风格，保持单源）
const extendedStyles = PRESET_STYLES.slice()

const styleCategories = ['全部', '古风', '现代', '科幻', '悬疑', '玄幻', '言情', '历史', '仙侠', '爽文', '同人']

type TabType = 'ai-model' | 'writing-preference' | 'ai-detection' | 'account'

export default function SettingsPage() {
  const _activeTab = useState<TabType>('ai-model')
  const activeTab = _activeTab[0]
  const setActiveTab = _activeTab[1]
  const _writingStylePool = useState<{ id: string; name: string; description: string }[]>([])
  const writingStylePool = _writingStylePool[0]
  const setWritingStylePool = _writingStylePool[1]

  const _isAdmin = useState(false)
  const isAdmin = _isAdmin[0]
  const setIsAdmin = _isAdmin[1]

  function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('token')
    return token ? { 'Authorization': 'Bearer ' + token } : {}
  }

  function dedupeAndNormalizeModels(list: AIModelItem[]): AIModelItem[] {
    if (!Array.isArray(list)) return []
    const seen: Record<string, number> = {}
    const result: AIModelItem[] = []
    for (let i = 0; i < list.length; i++) {
      const m = list[i]
      if (!m || !m.provider || !m.model) continue
      const key = String(m.provider).trim() + '::' + String(m.model).trim()
      if (seen[key] !== undefined) continue
      seen[key] = result.length
      const copy = {} as AIModelItem
      const keys = Object.keys(m) as (keyof AIModelItem)[]
      for (let k = 0; k < keys.length; k++) { (copy as unknown as Record<string, unknown>)[keys[k]] = (m as unknown as Record<string, unknown>)[keys[k]] }
      if (copy.status !== 'default' && copy.status !== 'inactive') copy.status = 'active'
      result.push(copy)
    }
    let defaultsCount = 0
    for (let j = 0; j < result.length; j++) { if (result[j].status === 'default') defaultsCount++ }
    if (defaultsCount > 1) {
      let firstDefIdx = -1
      for (let x = 0; x < result.length; x++) {
        if (result[x].status === 'default') {
          if (firstDefIdx === -1) firstDefIdx = x
          else result[x].status = 'active'
        }
      }
    } else if (defaultsCount === 0 && result.length > 0) {
      result[0].status = 'default'
    }
    return result
  }

  function safeSetAiModelBatch(nextList: AIModelItem[] | ((prev: AIModelItem[]) => AIModelItem[]), silent?: boolean): AIModelItem[] {
    let resolved: AIModelItem[]
    if (typeof nextList === 'function') {
      resolved = (nextList as (prev: AIModelItem[]) => AIModelItem[])(_aiModelBatch[0])
    } else {
      resolved = nextList
    }
    const deduped = dedupeAndNormalizeModels(resolved)
    _aiModelBatch[1](deduped)
    try {
      // 修复：不过滤apiKey为***的管理员共享模型
      const isValid = deduped.every(function (m) {
        return !m || (m.name && m.apiKey && m.provider && m.model)
      })
      if (isValid) localStorage.setItem('tuzhong-ai-models', JSON.stringify(deduped))
    } catch (_e) {}
    if (!silent && Array.isArray(resolved) && resolved.length > deduped.length) {
      console.log('[模型去重] 发现重复条目，已自动合并。输入=' + resolved.length + '条，去重后=' + deduped.length + '条')
    }
    return deduped
  }

  const _aiModelBatch = useState<AIModelItem[]>([])
  const aiModelBatch = dedupeAndNormalizeModels(_aiModelBatch[0])
  const setAiModelBatch = function (nextList: AIModelItem[] | ((prev: AIModelItem[]) => AIModelItem[])) { return safeSetAiModelBatch(nextList) }
  const _modelsLoadFlag = useState(false)
  const modelsLoadFlag = _modelsLoadFlag[0]
  const _modelsInitDone = useState(false)
  const modelsInitDone = _modelsInitDone[0]
  const setModelsInitDone = _modelsInitDone[1]

  useEffect(function () {
    localStorage.removeItem('tuzhong-ai-models')
    localStorage.removeItem('tuzhong-llm-config')
    localStorage.removeItem('tuzhong-model-presets')
    const hdrs = getAuthHeaders()
    fetch('/tuzhong-wenshu/api/settings/models', { headers: hdrs })
      .then(function (r) { return r.json() })
      .then(function (resp) {
        const backendModels = (resp.data || []) as AIModelItem[]
        if (typeof resp.isAdmin === 'boolean') setIsAdmin(resp.isAdmin)
        // 修复：不过滤apiKey为***的管理员共享模型，这些模型应该显示给普通用户使用
        const filtered = backendModels.filter(function(m) {
          return m.name && m.provider && m.model
        })
        safeSetAiModelBatch(filtered)
        localStorage.setItem('tuzhong-ai-models', JSON.stringify(_aiModelBatch[0]))
      })
      .catch(function () {
        safeSetAiModelBatch([])
      })
      .finally(function () {
        setModelsInitDone(true)
      })
  }, [])

  useEffect(function () {
    if (modelsInitDone) {
      // 修复：不过滤apiKey为***的管理员共享模型
      const isValid = aiModelBatch.every(function(m) {
        return !m || (m.name && m.apiKey && m.provider && m.model)
      })
      if (isValid) {
        localStorage.setItem('tuzhong-ai-models', JSON.stringify(aiModelBatch))
      }
    }
  }, [aiModelBatch, modelsInitDone])

  // 初始加载时同步模型到后端 models.json（确保AI生成路由能读取到最新配置，仅首次）
  const _initialSyncDone = useState(false)
  useEffect(function () {
    if (modelsInitDone && aiModelBatch.length > 0 && !_initialSyncDone[0]) {
      _initialSyncDone[1](true)
      syncModelsToBackend(aiModelBatch)
    }
  }, [modelsInitDone, aiModelBatch])

  useEffect(function () {
    fetch('/tuzhong-wenshu/api/styles')
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        if (respBody.data && Array.isArray(respBody.data)) { setWritingStylePool(respBody.data) }
      })
      .catch(function () {})
  }, [])

  const _addModelModalOpen = useState(false)
  const addModelModalOpen = _addModelModalOpen[0]
  const setAddModelModalOpen = _addModelModalOpen[1]
  const _newModelForm = useState({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' })
  const newModelForm = _newModelForm[0]
  const setNewModelForm = _newModelForm[1]

  useEffect(function () {
    if (!addModelModalOpen) {
      setNewModelForm({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' })
      setEditingModelId(null)
      setLocalModelList([])
      setLocalModelErr('')
    } else if (!editingModelId) {
      setNewModelForm({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' })
    }
  }, [addModelModalOpen])

  const _localModelList = useState<{name: string; size: string}[]>([])
  const localModelList = _localModelList[0]
  const setLocalModelList = _localModelList[1]
  const _localModelLoadFlag = useState(false)
  const localModelLoadFlag = _localModelLoadFlag[0]
  const setLocalModelLoadFlag = _localModelLoadFlag[1]
  const _localModelErr = useState('')
  const localModelErr = _localModelErr[0]
  const setLocalModelErr = _localModelErr[1]

  const _pickedStyle = useState('classic')
  const pickedStyle = _pickedStyle[0]
  const setPickedStyle = _pickedStyle[1]
  const _pickedLength = useState('medium')
  const pickedLength = _pickedLength[0]
  const setPickedLength = _pickedLength[1]
  const _customLenInput = useState('')
  const customLenInput = _customLenInput[0]
  const setCustomLenInput = _customLenInput[1]
  const _pickedInterval = useState('1m')
  const pickedInterval = _pickedInterval[0]
  const setPickedInterval = _pickedInterval[1]
  const _tomatoCheckFlag = useState(true)
  const tomatoCheckFlag = _tomatoCheckFlag[0]
  const setTomatoCheckFlag = _tomatoCheckFlag[1]
  const _zhuqueCheckFlag = useState(false)
  const zhuqueCheckFlag = _zhuqueCheckFlag[0]
  const setZhuqueCheckFlag = _zhuqueCheckFlag[1]

  // ==================== 白金爆款爽文专属参数 ====================
  // 爽点密度模式
  const _shuangDensityMode = useState('platinum')
  const shuangDensityMode = _shuangDensityMode[0]
  const setShuangDensityMode = _shuangDensityMode[1]
  const shuangDensityPool = [
    { id: 'light', label: '轻松爽（每500字1爽点）', tip: '适合慢热文，爽点密度适中' },
    { id: 'standard', label: '标准爽（每400字1爽点）', tip: '普通爽文标准，每章2-3个爽点' },
    { id: 'platinum', label: '白金爆（每300字1爽点）', tip: '番茄编辑推荐，每章3-5个爽点，零尿点' },
    { id: 'feilu', label: '飞卢爆（每200字1爽点）', tip: '飞卢风，每800字一章结尾必须爽' },
  ]
  // 打脸风格
  const _faceSlapStyle = useState('quick')
  const faceSlapStyle = _faceSlapStyle[0]
  const setFaceSlapStyle = _faceSlapStyle[1]
  const faceSlapPool = [
    { id: 'quick', label: '⚡ 快速打脸', tip: '300字内完成挑衅→震惊闭环，干脆利落' },
    { id: 'reversal', label: '🔄 反转打脸', tip: '先让读者以为主角要输→突然反杀，悬念拉满' },
    { id: 'pretend', label: '😎 装逼打脸', tip: '主角风轻云淡一句金句→全场震惊，装逼范拉满' },
    { id: 'stepbystep', label: '📈 递进打脸', tip: '一层一层剥开反派的伪装，爽感层层递进' },
  ]
  // 节奏强度
  const _rhythmIntensity = useState('tomato')
  const rhythmIntensity = _rhythmIntensity[0]
  const setRhythmIntensity = _rhythmIntensity[1]
  const rhythmPool = [
    { id: 'start', label: '起点节奏', tip: '3000字/章，允许5章铺垫，重设定重逻辑' },
    { id: 'tomato', label: '番茄节奏', tip: '2000字/章，段落3行内，每300字小刺激，结尾强钩子' },
    { id: 'feilu', label: '飞卢节奏', tip: '800字/章，节奏爆炸快，每章结尾必须爽，脑洞优先' },
    { id: 'balabala', label: '综合平衡', tip: '1500字/章，兼顾节奏和设定，适合多平台发布' },
  ]
  // 目标平台
  const _targetPlatform = useState('all')
  const targetPlatform = _targetPlatform[0]
  const setTargetPlatform = _targetPlatform[1]
  const targetPlatformPool = [
    { id: 'all', label: '🌐 全平台通吃', tip: '兼顾节奏、设定、深度，所有平台都能发' },
    { id: 'fanqie', label: '🍅 番茄小说', tip: '完读率至上，广告位前不能断高潮，短段落快对话' },
    { id: 'qidian', label: '📖 起点中文', tip: '重设定重逻辑重人物，允许慢热，月票榜导向' },
    { id: 'feilu', label: '⚡ 飞卢小说', tip: '脑洞大开，同人综漫，800字/章，更新为王' },
    { id: 'qimao', label: '🐱 七猫免费', tip: '大众口味，剧情不拖沓，完读率和留存率优先' },
  ]
  // 主角人设倾向
  const _mcPersonality = useState('decisive')
  const mcPersonality = _mcPersonality[0]
  const setMcPersonality = _mcPersonality[1]
  const mcPersonalityPool = [
    { id: 'decisive', label: '⚔️ 杀伐果断', tip: '不圣母，斩草除根，该杀就杀，读者最爱' },
    { id: 'funny', label: '😂 幽默搞笑', tip: '嘴炮王者，骚话不断，打脸时顺便搞笑' },
    { id: 'calm', label: '🧊 隐忍腹黑', tip: '表面平静内心算计，后期掀桌爆杀全场' },
    { id: 'hotblood', label: '🔥 热血正义', tip: '兄弟义气，为朋友两肋插刀，燃爆全场' },
  ]

  // 平台检测配置 - 增强版，包含详细检测标准
  const _platformConfigs = useState([
    { 
      key: 'tomato', name: '番茄小说', icon: '🍅', aiStandard: '< 5%', color: 'red', enabled: true, 
      description: '番茄小说平台AI检测，要求AI检测率低于5%',
      compliance: '内容合规：禁止低俗、色情、暴力、政治敏感、虚假宣传内容；鼓励正能量、轻松愉快的阅读体验',
      signing: '签约评估：日更4000+字，完读率≥35%，收藏量≥5000，可申请签约；签约后有全勤奖',
      traffic: '流量推荐：新文前7天有新人扶持流量；完读率越高推荐越多；热门标签更容易获得推荐',
      revenue: '收益规则：广告分成（阅读时长）+ 签约全勤 + 打赏 + 版权运营；收益与阅读时长直接挂钩'
    },
    { 
      key: 'zhuque', name: '朱雀AI', icon: '🔴', aiStandard: '< 5%', color: 'rose', enabled: false, 
      description: '朱雀AI平台检测，降低被识别为AI内容的风险',
      compliance: '内容合规：严格禁止AI生成痕迹明显的内容；情节必须原创，禁止抄袭；禁止敏感题材',
      signing: '签约评估：AI检测率必须低于5%；内容原创度≥90%；有完整的故事大纲和世界观设定',
      traffic: '流量推荐：原创度越高推荐权重越大；作者互动率（回复评论）影响推荐；定期更新更稳定',
      revenue: '收益规则：订阅分成 + 广告分成 + 版权销售；优秀作品可获得平台买断机会'
    },
    { 
      key: 'qidian', name: '起点中文', icon: '📖', aiStandard: '< 10%', color: 'blue', enabled: false, 
      description: '起点中文网AI检测标准',
      compliance: '内容合规：禁止涉政、涉黄、暴力血腥；题材不限但需符合法律法规；历史题材需尊重历史',
      signing: '签约评估：文笔扎实，设定新颖，节奏紧凑；收藏≥10000，推荐票≥5000可申请签约',
      traffic: '流量推荐：新书期有试水推荐；分类频道推荐；月票榜、新书榜等榜单引流',
      revenue: '收益规则：VIP订阅分成（千字3分起）+ 全勤奖 + 打赏 + 版权改编（游戏、影视、漫画）'
    },
    { 
      key: 'feilu', name: '飞卢小说', icon: '⚡', aiStandard: '< 10%', color: 'yellow', enabled: false, 
      description: '飞卢小说网AI检测标准',
      compliance: '内容合规：允许脑洞大开的设定；禁止低俗、色情、政治敏感；强调爽点密集',
      signing: '签约评估：日更8000+字，爽点密集，节奏快；收藏≥3000即可申请签约',
      traffic: '流量推荐：热门题材（同人、综漫、无限流）推荐多；更新字数越多推荐越多',
      revenue: '收益规则：订阅分成 + 广告分成 + 打赏；同人作品收益较高但版权受限'
    },
    { 
      key: 'qimao', name: '七猫小说', icon: '🐱', aiStandard: '< 8%', color: 'orange', enabled: false, 
      description: '七猫小说平台AI检测标准',
      compliance: '内容合规：禁止低俗色情、暴力血腥、政治敏感；主打免费阅读，内容需适合大众',
      signing: '签约评估：完读率≥40%，日更≥3000字；内容有趣味性和吸引力',
      traffic: '流量推荐：免费阅读模式，靠广告盈利；推荐位与完读率和留存率挂钩',
      revenue: '收益规则：广告分成 + 全勤奖 + 版权运营；免费阅读平台，收益与广告展示量相关'
    },
    { 
      key: 'jinjiang', name: '晋江文学', icon: '🌸', aiStandard: '< 8%', color: 'pink', enabled: false, 
      description: '晋江文学城AI检测标准',
      compliance: '内容合规：主打言情、耽美；禁止低俗色情；强调情感描写细腻；禁止抄袭',
      signing: '签约评估：文案精美，人设鲜明，情感线清晰；收藏≥3000可申请签约',
      traffic: '流量推荐：金榜、新晋榜、分类榜；话题热度影响推荐；读者互动率重要',
      revenue: '收益规则：VIP订阅分成 + 定制印刷 + 影视改编；言情题材收益较高'
    },
    { 
      key: 'zongheng', name: '纵横中文', icon: '🌊', aiStandard: '< 12%', color: 'cyan', enabled: false, 
      description: '纵横中文网AI检测标准',
      compliance: '内容合规：禁止涉政、涉黄、暴力；题材不限，鼓励创新；禁止抄袭',
      signing: '签约评估：字数≥50万字，节奏稳定，设定完整；收藏≥5000可申请签约',
      traffic: '流量推荐：新书推荐、分类推荐、榜单推荐；全勤更新更稳定获得推荐',
      revenue: '收益规则：订阅分成 + 全勤奖 + 版权运营；买断制为主，保底收入稳定'
    },
    { 
      key: 'yuedong', name: '阅动文化', icon: '📚', aiStandard: '< 10%', color: 'green', enabled: false, 
      description: '阅动文化平台AI检测标准',
      compliance: '内容合规：禁止低俗、色情、暴力、政治敏感；主打精品IP孵化',
      signing: '签约评估：内容质量高，有IP改编潜力；字数≥30万字，日更≥4000字',
      traffic: '流量推荐：精品推荐位；IP孵化项目重点扶持；多平台分发引流',
      revenue: '收益规则：订阅分成 + IP改编分成（游戏、影视）+ 保底买断；精品IP收益高'
    },
  ])
  const platformConfigs = _platformConfigs[0]
  const setPlatformConfigs = _platformConfigs[1]

  // 平台配置展开状态 - 使用对象存储，避免在循环中使用useState
  const _expandedPlatforms = useState({})
  const expandedPlatforms = _expandedPlatforms[0]
  const setExpandedPlatforms = _expandedPlatforms[1]

  // 从 localStorage 加载已保存的偏好设置
  useEffect(function () {
    try {
      const saved = localStorage.getItem('tuzhong-preferences')
      if (saved) {
        const prefs = JSON.parse(saved)
        if (prefs.writingStyle) setPickedStyle(prefs.writingStyle)
        if (prefs.continuationLength) setPickedLength(prefs.continuationLength)
        // 🔥 修复：加载自定义长度输入值
        if (prefs.customLength != null && prefs.customLength > 0) {
          setCustomLenInput(String(prefs.customLength))
        }
        if (prefs.autoSaveInterval != null) setPickedInterval(String(prefs.autoSaveInterval))
        if (typeof prefs.tomatoReminder === 'boolean') setTomatoCheckFlag(prefs.tomatoReminder)
        if (typeof prefs.zhuqueReminder === 'boolean') setZhuqueCheckFlag(prefs.zhuqueReminder)
        // 加载白金爆款专属参数
        if (prefs.shuangDensityMode) setShuangDensityMode(prefs.shuangDensityMode)
        if (prefs.faceSlapStyle) setFaceSlapStyle(prefs.faceSlapStyle)
        if (prefs.rhythmIntensity) setRhythmIntensity(prefs.rhythmIntensity)
        if (prefs.targetPlatform) setTargetPlatform(prefs.targetPlatform)
        if (prefs.mcPersonality) setMcPersonality(prefs.mcPersonality)
        // 🔥 修复：加载平台配置（如果没有独立的 platform configs）
        if ((!localStorage.getItem('tuzhong-platform-configs') || localStorage.getItem('tuzhong-platform-configs') === '[]') 
            && prefs.platformConfigs && Array.isArray(prefs.platformConfigs)) {
          localStorage.setItem('tuzhong-platform-configs', JSON.stringify(prefs.platformConfigs))
        }
      }
    } catch (e) {}

    // 🔥 平台AI检测配置：使用独立 localStorage key，避免与其他偏好字段混写时丢失
    //    兼容从 prefs.platformConfigs 读取的旧数据
    try {
      const savedPlatforms = localStorage.getItem('tuzhong-platform-configs')
      let platformSource: typeof platformConfigs | null = null
      if (savedPlatforms) {
        try { platformSource = JSON.parse(savedPlatforms) } catch (_e) { platformSource = null }
      }
      if (!platformSource || !Array.isArray(platformSource) || platformSource.length === 0) {
        try {
          const pref2 = localStorage.getItem('tuzhong-preferences')
          if (pref2) {
            const p2 = JSON.parse(pref2)
            if (p2.platformConfigs && Array.isArray(p2.platformConfigs)) platformSource = p2.platformConfigs
          }
        } catch (_e) {}
      }
      if (platformSource && Array.isArray(platformSource) && platformSource.length > 0) {
        const defaultCfg = _platformConfigs[0]
        const byKey: Record<string, typeof platformConfigs[number]> = {}
        platformSource.forEach(function (p) { if (p && p.key) byKey[p.key] = p })
        const merged = defaultCfg.map(function (def) {
          const s = byKey[def.key]
          // 保留所有自定义字段（enabled/aiStandard），同时补全新增的 detail 字段（compliance/signing/traffic/revenue）
          return s ? Object.assign({}, def, s) : def
        })
        // 额外添加用户新增过但默认没有的平台
        Object.keys(byKey).forEach(function (k) {
          if (!merged.find(function (m) { return m.key === k })) merged.push(byKey[k])
        })
        setPlatformConfigs(merged)
      }
    } catch (e) {}
  }, [])

  // 🔥 写作偏好自动持久化：任何偏好变化自动保存到 localStorage + 后端
  useEffect(function () {
    try {
      const prefs = {
        writingStyle: pickedStyle, continuationLength: pickedLength,
        customLength: pickedLength === 'custom' ? parseInt(customLenInput) || 500 : null,
        autoSaveInterval: pickedInterval, tomatoReminder: tomatoCheckFlag, zhuqueReminder: zhuqueCheckFlag,
        platformConfigs: platformConfigs,
        shuangDensityMode: shuangDensityMode, faceSlapStyle: faceSlapStyle,
        rhythmIntensity: rhythmIntensity, targetPlatform: targetPlatform, mcPersonality: mcPersonality,
      }
      localStorage.setItem('tuzhong-preferences', JSON.stringify(prefs))
      // 🔥 修复：只在 platformConfigs 有实际内容时才保存独立的 key，避免覆盖已有数据
      if (platformConfigs && Array.isArray(platformConfigs) && platformConfigs.length > 0) {
        localStorage.setItem('tuzhong-platform-configs', JSON.stringify(platformConfigs))
      }
      localStorage.setItem('tuzhong-bestseller-prefs', JSON.stringify({
        shuangDensityMode: shuangDensityMode, faceSlapStyle: faceSlapStyle,
        rhythmIntensity: rhythmIntensity, targetPlatform: targetPlatform, mcPersonality: mcPersonality,
      }))
      const selectedStyle = extendedStyles.find(function (s) { return s.id === pickedStyle })
      if (selectedStyle) {
        localStorage.setItem('tuzhong-active-style', pickedStyle)
        localStorage.setItem('tuzhong-active-style-data', JSON.stringify(selectedStyle))
      }
      let lenValue = 1000
      if (pickedLength === 'short') lenValue = 500
      else if (pickedLength === 'long') lenValue = 2000
      else if (pickedLength === 'custom') lenValue = parseInt(customLenInput) || 500
      localStorage.setItem('tuzhong-continue-length', String(lenValue))
    } catch (_e) {}
  }, [pickedStyle, pickedLength, customLenInput, pickedInterval, tomatoCheckFlag, zhuqueCheckFlag, platformConfigs, shuangDensityMode, faceSlapStyle, rhythmIntensity, targetPlatform, mcPersonality])

  const _styleCategory = useState('全部')
  const styleCategory = _styleCategory[0]
  const setStyleCategory = _styleCategory[1]
  const _styleSearch = useState('')
  const styleSearch = _styleSearch[0]
  const setStyleSearch = _styleSearch[1]

  const _acctUserMsg = useState({ username: '网文小筑', email: 'writer@example.com', avatar: '' })
  const _saveSuccess = useState(false)
  const saveSuccess = _saveSuccess[0]
  const setSaveSuccess = _saveSuccess[1]
  const _exportModalOpen = useState(false)
  const exportModalOpen = _exportModalOpen[0]
  const setExportModalOpen = _exportModalOpen[1]
  const _deleteAcctModalOpen = useState(false)
  const deleteAcctModalOpen = _deleteAcctModalOpen[0]
  const setDeleteAcctModalOpen = _deleteAcctModalOpen[1]
  const _exportProcessFlag = useState(false)
  const exportProcessFlag = _exportProcessFlag[0]
  const setExportProcessFlag = _exportProcessFlag[1]
  const _deleteConfirmText = useState('')
  const deleteConfirmText = _deleteConfirmText[0]
  const setDeleteConfirmText = _deleteConfirmText[1]
  const _editingModelId = useState<string | null>(null)
  const editingModelId = _editingModelId[0]
  const setEditingModelId = _editingModelId[1]

  // 修复 v8：移除假实现的"安全设置"（2FA/设备管理），仅保留真实可用的数据导出与账户注销
  const _presetApiKeyInput = useState('')
  const presetApiKeyInput = _presetApiKeyInput[0]
  const setPresetApiKeyInput = _presetApiKeyInput[1]
  const _presetModalOpen = useState(false)
  const presetModalOpen = _presetModalOpen[0]
  const setPresetModalOpen = _presetModalOpen[1]
  const _presetImportFlag = useState(false)
  const presetImportFlag = _presetImportFlag[0]
  const setPresetImportFlag = _presetImportFlag[1]
  const _savingModeFlag = useState(false)
  const savingModeFlag = _savingModeFlag[0]
  const setSavingModeFlag = _savingModeFlag[1]
  const _siliconflowApiKeyInput = useState('')
  const siliconflowApiKeyInput = _siliconflowApiKeyInput[0]
  const setSiliconflowApiKeyInput = _siliconflowApiKeyInput[1]
  const _sfModalOpen = useState(false)
  const sfModalOpen = _sfModalOpen[0]
  const setSfModalOpen = _sfModalOpen[1]
  const _sfImportFlag = useState(false)
  const sfImportFlag = _sfImportFlag[0]
  const setSfImportFlag = _sfImportFlag[1]

  // 智谱 BigModel 一键导入状态
  const _zhipuApiKeyInput = useState('')
  const zhipuApiKeyInput = _zhipuApiKeyInput[0]
  const setZhipuApiKeyInput = _zhipuApiKeyInput[1]
  const _zhipuModalOpen = useState(false)
  const zhipuModalOpen = _zhipuModalOpen[0]
  const setZhipuModalOpen = _zhipuModalOpen[1]
  const _zhipuImportFlag = useState(false)
  const zhipuImportFlag = _zhipuImportFlag[0]
  const setZhipuImportFlag = _zhipuImportFlag[1]

  // 2026-08-12：OpenRouter / Groq / 腾讯混元 通用导入状态（共用一套弹窗与导入逻辑）
  const _platformApiKeyInput = useState('')
  const platformApiKeyInput = _platformApiKeyInput[0]
  const setPlatformApiKeyInput = _platformApiKeyInput[1]
  const _platformModalOpen = useState(false)
  const platformModalOpen = _platformModalOpen[0]
  const setPlatformModalOpen = _platformModalOpen[1]
  const _platformImportFlag = useState(false)
  const platformImportFlag = _platformImportFlag[0]
  const setPlatformImportFlag = _platformImportFlag[1]
  const _platformImportTarget = useState<string | null>(null)
  const platformImportTarget = _platformImportTarget[0]
  const setPlatformImportTarget = _platformImportTarget[1]

  // 加载省钱模式开关状态
  useEffect(function () {
    try {
      const saved = localStorage.getItem('tuzhong-cost-saving-mode')
      if (saved === 'true') setSavingModeFlag(true)
    } catch (_e) {}
  }, [])

  function pullLocalModels() {
    setLocalModelLoadFlag(true)
    setLocalModelErr('')
    fetch('/tuzhong-wenshu/api/ollama/models')
      .then(function (res) { return res.json() })
      .then(function (respBody) {
        if (respBody.success) setLocalModelList(respBody.models)
        else { setLocalModelErr(respBody.error); setLocalModelList([]) }
      })
      .catch(function () { setLocalModelErr('无法连接本地Ollama服务'); setLocalModelList([]) })
      .finally(function () { setLocalModelLoadFlag(false) })
  }

  // 同步模型配置到后端 models.json（确保AI生成路由能读取到最新配置）
  // 修复：普通用户不能误删/误改管理员共享的模型
  function syncModelsToBackend(modelBatch: AIModelItem[]) {
    const hdrs = getAuthHeaders()
    fetch('/tuzhong-wenshu/api/settings/models', { headers: hdrs })
      .then(function (r) { return r.json() })
      .then(function (resp) {
        const backendModels = (resp.data || []) as AIModelItem[]
        const backendIds = new Set(backendModels.map(function (m) { return m.id }))
        const localIds = new Set(modelBatch.map(function (m) { return m.id }))

        // 修复：跳过apiKey为***的管理员共享模型，不回写到后端（防止把***覆盖真实key）
        const upsertPromises = modelBatch.filter(function (m) {
          return m.apiKey && !String(m.apiKey).includes('*')
        }).map(function (m) {
          const exists = backendIds.has(m.id)
          const method = exists ? 'PUT' : 'POST'
          const url = '/tuzhong-wenshu/api/settings/models' + (exists ? '' : '')
          const cleanProvider = (m.provider || '').replace(/\s*\([^)]*\)\s*/g, '').trim()
          const body: Record<string, unknown> = {
            provider: cleanProvider,
            name: m.name,
            status: m.status,
            apiKey: m.apiKey || '',
            baseUrl: m.baseUrl || '',
            model: m.model || '',
            isAdminDefault: m.isAdminDefault === true,
          }
          if (exists) body.id = m.id
          return fetch(url, {
            method: method,
            headers: Object.assign({}, { 'Content-Type': 'application/json' }, hdrs),
            body: JSON.stringify(body),
          }).catch(function (err) {
            console.warn('[syncModelsToBackend] 保存失败:', m.name, err)
          })
        })

        // 修复：只删除当前用户自己创建的模型，不删除管理员共享的模型
        backendModels.forEach(function (bm) {
          if (!localIds.has(bm.id) && !bm.isAdminDefault) {
            fetch('/tuzhong-wenshu/api/settings/models?id=' + encodeURIComponent(bm.id), {
              method: 'DELETE',
              headers: hdrs,
            })
              .catch(function () {})
          }
        })

        return Promise.allSettled(upsertPromises)
      })
      .catch(function (err) {
        console.warn('[syncModelsToBackend] 获取后端模型列表失败:', err)
      })
  }

  function execAddModel() {
    if (!newModelForm.provider || !newModelForm.name.trim() || !newModelForm.apiKey.trim()) return
    const preset = providerPresetMap[newModelForm.provider]
    const modelItem: AIModelItem = {
      id: String(Date.now()), provider: newModelForm.provider, name: newModelForm.name,
      status: aiModelBatch.length === 0 ? 'default' : 'active',
      apiKey: newModelForm.apiKey,
      baseUrl: newModelForm.baseUrl || preset?.baseUrl || '',
      model: newModelForm.model || preset?.defaultModel || '',
      presetModels: preset?.models || [],
    }
    const dupKey = String(modelItem.provider).trim() + '::' + String(modelItem.model).trim()
    const existed = aiModelBatch.find(function (m) {
      return (String(m.provider).trim() + '::' + String(m.model).trim()) === dupKey
    })
    if (existed) {
      alert('该模型已存在（提供商：' + modelItem.provider + '，模型：' + modelItem.model + '），请勿重复添加。')
      return
    }
    const newBatch = aiModelBatch.concat([modelItem])
    const saved = safeSetAiModelBatch(newBatch, true)

    if (modelItem.status === 'default' || saved.find(function(m){ return m.status === 'default' })?.id === modelItem.id || saved[0]?.id === modelItem.id) {
      const def0 = saved.find(function (m) { return m.status === 'default' }) || saved[0]
      if (def0) {
        localStorage.setItem('tuzhong-llm-config', JSON.stringify({
          provider: def0.provider, apiKey: def0.apiKey,
          baseUrl: (def0.baseUrl || '').replace(/[`'"]/g, '').trim(),
          model: def0.model,
        }))
      }
    }
    syncModelsToBackend(saved)
    setNewModelForm({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' })
    setAddModelModalOpen(false)
    setLocalModelList([])
    setLocalModelErr('')
  }

  function execImportPresets() {
    if (!presetApiKeyInput.trim()) return
    setPresetImportFlag(true)

    try {
      const preset = providerPresetMap['讯飞星火']
      const xfyunPresetIds = ['xfyun-spark-max', 'xfyun-qwen', 'xfyun-glm']
      const targetPresets = modelPresetPool.filter(function (p) { return xfyunPresetIds.indexOf(p.id) !== -1 })

      const existingKeys: Record<string, boolean> = {}
      for (let z0 = 0; z0 < aiModelBatch.length; z0++) {
        const _m = aiModelBatch[z0]
        existingKeys[String(_m.provider).trim() + '::' + String(_m.model).trim()] = true
      }

      const newModels: AIModelItem[] = []
      const skippedNames: string[] = []
      for (let t0 = 0; t0 < targetPresets.length; t0++) {
        const p = targetPresets[t0]
        const _k = String(p.provider).trim() + '::' + String(p.model).trim()
        if (existingKeys[_k]) {
          skippedNames.push(p.name)
          continue
        }
        existingKeys[_k] = true
        newModels.push({
          id: 'preset-' + Date.now() + '-' + t0, name: p.name, provider: p.provider,
          apiKey: presetApiKeyInput,
          baseUrl: preset?.baseUrl || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2',
          model: p.model, presetModels: preset?.models || [],
          status: 'active' as 'default' | 'active' | 'inactive',
          temperature: p.temperature, topP: p.topP, contextWindow: p.contextWindow,
          maxTokens: p.maxTokens, presencePenalty: p.presencePenalty, frequencyPenalty: p.frequencyPenalty,
          usageTag: p.usageTag,
          isAdminDefault: true,
        })
      }

      const updatedBatch = aiModelBatch.map(function (m) {
        const copy = {} as AIModelItem
        const keys = Object.keys(m) as (keyof AIModelItem)[]
        for (let i = 0; i < keys.length; i++) { (copy as unknown as Record<string, unknown>)[keys[i]] = (m as unknown as Record<string, unknown>)[keys[i]] }
        if (copy.status === 'default') copy.status = 'active'
        return copy
      })

      if (newModels.length > 0) {
        newModels[0].status = 'default'
        for (let j = 1; j < newModels.length; j++) { newModels[j].status = 'active' }
      }

      const allModels = safeSetAiModelBatch(updatedBatch.concat(newModels), true)

      const defaultModel = allModels.find(function (m) { return m.status === 'default' }) || newModels[0] || allModels[0]
      if (defaultModel) {
        localStorage.setItem('tuzhong-llm-config', JSON.stringify({
          provider: defaultModel.provider, apiKey: defaultModel.apiKey,
          baseUrl: (defaultModel.baseUrl || '').replace(/[`'"]/g, '').trim(),
          model: defaultModel.model, temperature: defaultModel.temperature,
          topP: defaultModel.topP, maxTokens: defaultModel.maxTokens,
          presencePenalty: defaultModel.presencePenalty, frequencyPenalty: defaultModel.frequencyPenalty,
        }))
      }

      localStorage.setItem('tuzhong-model-presets', JSON.stringify({
        defaultModel: 'Spark-X2-Flash', outlineModel: 'Qwen3.6-35B-A3B', strategyModel: 'GLM-4.7-Flash',
      }))
      setPresetModalOpen(false)
      setPresetApiKeyInput('')
      if (skippedNames.length > 0) {
        setTimeout(function () { alert('以下模型已存在，自动跳过导入：' + skippedNames.join('、') + (newModels.length ? '\n\n成功新增：' + newModels.map(function(n){return n.name}).join('、') : '')) }, 50)
      }
    } finally {
      setPresetImportFlag(false)
    }
    syncModelsToBackend(safeSetAiModelBatch(_aiModelBatch[0], true))
  }

  function execImportSiliconflowPresets() {
    setSfModalOpen(true)
  }

  function execImportSiliconflow() {
    if (!siliconflowApiKeyInput.trim()) return
    setSfImportFlag(true)
    try {
      const preset = providerPresetMap['硅基流动']
      // 2026年8月：一键导入全部7套硅基流动9B及以下永久免费模型
      const sfPresetIds = ['sf-qwen25-7b', 'sf-glm4-9b', 'sf-glmz1-9b', 'sf-qwen3-8b', 'sf-qwen35-4b', 'sf-hunyuan-7b', 'sf-kolors']
      const targetPresets = modelPresetPool.filter(function (p) { return sfPresetIds.indexOf(p.id) !== -1 })

      const existingKeys2: Record<string, boolean> = {}
      for (let z1 = 0; z1 < aiModelBatch.length; z1++) {
        const _m2 = aiModelBatch[z1]
        existingKeys2[String(_m2.provider).trim() + '::' + String(_m2.model).trim()] = true
      }

      const newModels: AIModelItem[] = []
      const skippedNames2: string[] = []
      for (let t1 = 0; t1 < targetPresets.length; t1++) {
        const p = targetPresets[t1]
        const _k2 = '硅基流动::' + String(p.model).trim()
        if (existingKeys2[_k2]) { skippedNames2.push(p.name); continue }
        existingKeys2[_k2] = true
        newModels.push({
          id: 'sf-preset-' + Date.now() + '-' + t1, name: p.name, provider: '硅基流动',
          apiKey: siliconflowApiKeyInput,
          baseUrl: preset?.baseUrl || 'https://api.siliconflow.cn/v1',
          model: p.model, presetModels: preset?.models || [],
          // sf-qwen25-7b 设为默认模型
          status: (p.id === 'sf-qwen25-7b' ? 'default' : 'active') as 'default' | 'active' | 'inactive',
          temperature: p.temperature, topP: p.topP, contextWindow: p.contextWindow,
          maxTokens: p.maxTokens, presencePenalty: p.presencePenalty, frequencyPenalty: p.frequencyPenalty,
          usageTag: p.usageTag,
          isAdminDefault: true,
        })
      }

      // 如果有新默认模型，则先把所有旧默认模型改为 active
      const hasNewDefault = newModels.some(function (n) { return n.status === 'default' })
      let updatedBatch = aiModelBatch.slice()
      if (hasNewDefault) {
        updatedBatch = aiModelBatch.map(function (m) {
          const copy = {} as AIModelItem
          const keys = Object.keys(m) as (keyof AIModelItem)[]
          for (let i = 0; i < keys.length; i++) { (copy as unknown as Record<string, unknown>)[keys[i]] = (m as unknown as Record<string, unknown>)[keys[i]] }
          if (copy.status === 'default') copy.status = 'active'
          return copy
        })
      }

      const allModels = safeSetAiModelBatch(updatedBatch.concat(newModels), true)

      const def = allModels.find(function (m) { return m.status === 'default' }) || allModels[0]
      if (def) {
        localStorage.setItem('tuzhong-llm-config', JSON.stringify({
          provider: (def.provider || '').replace(/\s*\([^)]*\)\s*/g, '').trim(),
          apiKey: def.apiKey,
          baseUrl: (def.baseUrl || '').replace(/[`'"]/g, '').trim(),
          model: def.model, temperature: def.temperature,
          topP: def.topP, maxTokens: def.maxTokens,
          presencePenalty: def.presencePenalty, frequencyPenalty: def.frequencyPenalty,
          modelId: def.id,
        }))
        // 同步记录全链路路由模型
        const outline = allModels.find(function (m) { return m.model === 'THUDM/GLM-4-9B-0414' })
        const strategy = allModels.find(function (m) { return m.model === 'THUDM/GLM-Z1-9B-0414' })
        const cover = allModels.find(function (m) { return m.model === 'Kwai-Kolors/Kolors' })
        localStorage.setItem('tuzhong-model-presets', JSON.stringify({
          defaultModel: def.model,
          outlineModel: outline?.model || def.model,
          strategyModel: strategy?.model || outline?.model || def.model,
          coverModel: cover?.model || '',
        }))
      }

      localStorage.setItem('tuzhong-siliconflow-api-key', siliconflowApiKeyInput)
      setSfModalOpen(false)
      setSiliconflowApiKeyInput('')
      syncModelsToBackend(allModels)
      if (skippedNames2.length > 0) {
        setTimeout(function () { alert('以下硅基流动模型已存在，自动跳过导入：' + skippedNames2.join('、') + (newModels.length ? '\n\n成功新增：' + newModels.map(function(n){return n.name}).join('、') : '')) }, 50)
      } else if (newModels.length) {
        setTimeout(function () { alert('成功导入硅基流动全部' + newModels.length + '套永久免费模型') }, 50)
      }
    } catch (_e) {
      alert('硅基流动导入失败：' + (_e instanceof Error ? _e.message : '未知错误'))
    } finally {
      setSfImportFlag(false)
    }
  }

  function execImportZhipuPresets() {
    setZhipuModalOpen(true)
  }

  function execImportZhipu() {
    if (!zhipuApiKeyInput.trim()) return
    setZhipuImportFlag(true)
    try {
      const preset = providerPresetMap['智谱GLM']
      const targetPresets = zhipuPresetPool

      const existingKeys: Record<string, boolean> = {}
      for (let i = 0; i < aiModelBatch.length; i++) {
        const _m = aiModelBatch[i]
        existingKeys[String(_m.provider || '').trim() + '::' + String(_m.model || '').trim()] = true
      }

      const newModels: AIModelItem[] = []
      const skippedNames: string[] = []
      for (let t = 0; t < targetPresets.length; t++) {
        const p = targetPresets[t]
        const _k = '智谱GLM::' + String(p.model).trim()
        if (existingKeys[_k]) { skippedNames.push(p.name); continue }
        existingKeys[_k] = true
        newModels.push({
          id: 'zhipu-preset-' + Date.now() + '-' + t, name: p.name, provider: '智谱GLM',
          apiKey: zhipuApiKeyInput,
          baseUrl: preset?.baseUrl || 'https://open.bigmodel.cn/api/paas/v4',
          model: p.model, presetModels: preset?.models || [],
          status: 'active' as 'default' | 'active' | 'inactive',
          temperature: p.temperature, topP: p.topP, contextWindow: p.contextWindow,
          maxTokens: p.maxTokens, presencePenalty: p.presencePenalty, frequencyPenalty: p.frequencyPenalty,
          usageTag: p.usageTag,
          isAdminDefault: true,
        })
      }

      const allModels = safeSetAiModelBatch(aiModelBatch.concat(newModels), true)
      localStorage.setItem('tuzhong-zhipu-api-key', zhipuApiKeyInput)
      setZhipuModalOpen(false)
      setZhipuApiKeyInput('')
      syncModelsToBackend(allModels)
      if (skippedNames.length > 0) {
        setTimeout(function () { alert('以下智谱模型已存在，自动跳过导入：' + skippedNames.join('、') + (newModels.length ? '\n\n成功新增：' + newModels.map(function(n){return n.name}).join('、') : '')) }, 50)
      } else if (newModels.length) {
        setTimeout(function () { alert('成功导入智谱全部' + newModels.length + '套永久免费模型') }, 50)
      } else {
        setTimeout(function () { alert('智谱3套模型均已存在，未做任何更改') }, 50)
      }
    } catch (_e) {
      alert('智谱导入失败：' + (_e instanceof Error ? _e.message : '未知错误'))
    } finally {
      setZhipuImportFlag(false)
    }
  }

  // 2026-08-12：OpenRouter / Groq / 腾讯混元 通用一键导入（共用）
  // 这些平台的模型已预置在 models.json（apiKey 留空待填），导入时：
  //   ① 更新 aiModelBatch 中同 provider+model 的已有记录（填入 Key）；
  //   ② 补建 models.json 中缺失的模型条目。
  function execImportPlatformPresets() {
    if (!platformApiKeyInput.trim() || !platformImportTarget) return
    setPlatformImportFlag(true)
    try {
      const targetProvider = platformImportTarget
      const preset = providerPresetMap[targetProvider]
      const pool = targetProvider === 'OpenRouter' ? openrouterPresetPool : targetProvider === 'Groq' ? groqPresetPool : targetProvider === '商汤 (SenseTime)' ? sensenovaPresetPool : hunyuanPresetPool
      const targetModels = pool.map(function (p) { return String(p.model).trim() })

      const existingSet: Record<string, boolean> = {}
      const updatedBatch = aiModelBatch.map(function (m) {
        const mp = String(m.provider || '').trim()
        const mm = String(m.model || '').trim()
        if (mp === targetProvider && targetModels.indexOf(mm) !== -1) {
          existingSet[mp + '::' + mm] = true
          return Object.assign({}, m, {
            apiKey: platformApiKeyInput,
            baseUrl: m.baseUrl || preset?.baseUrl || '',
          })
        }
        return m
      })

      const missing = pool.filter(function (p) { return !existingSet[targetProvider + '::' + String(p.model).trim()] })
      const newModels: AIModelItem[] = missing.map(function (p, i) {
        return {
          id: 'preset-' + targetProvider + '-' + Date.now() + '-' + i, name: p.name, provider: targetProvider,
          apiKey: platformApiKeyInput,
          baseUrl: preset?.baseUrl || '',
          model: p.model, presetModels: [],
          status: 'active' as 'default' | 'active' | 'inactive',
          temperature: p.temperature, topP: p.topP, contextWindow: p.contextWindow,
          maxTokens: p.maxTokens, presencePenalty: p.presencePenalty, frequencyPenalty: p.frequencyPenalty,
          usageTag: p.usageTag,
          isAdminDefault: true,
        }
      })

      const allModels = safeSetAiModelBatch(updatedBatch.concat(newModels), true)
      localStorage.setItem('tuzhong-' + targetProvider + '-api-key', platformApiKeyInput)
      setPlatformModalOpen(false)
      setPlatformApiKeyInput('')
      setPlatformImportTarget(null)
      syncModelsToBackend(allModels)
      setTimeout(function () {
        alert('已为「' + targetProvider + '」的 ' + targetModels.length + ' 个模型填入 API Key 并启用' + (newModels.length ? ('；新增 ' + newModels.length + ' 个') : ''))
      }, 50)
    } catch (_e) {
      alert('导入失败：' + (_e instanceof Error ? _e.message : '未知错误'))
    } finally {
      setPlatformImportFlag(false)
    }
  }

  function execSetDefaultModel(modelId: string) {
    const updatedBatch = aiModelBatch.map(function (m) {
      const copy = {} as AIModelItem
      const keys = Object.keys(m) as (keyof AIModelItem)[]
      for (let i = 0; i < keys.length; i++) { (copy as unknown as Record<string, unknown>)[keys[i]] = (m as unknown as Record<string, unknown>)[keys[i]] }
      if (copy.id === modelId) copy.status = 'default'
      else if (copy.status === 'default') copy.status = 'active'
      return copy
    })
    setAiModelBatch(updatedBatch)

    const def = updatedBatch.find(function (m) { return m.status === 'default' })
    if (def) {
      // 修复：存储modelId，后端AI生成路由通过modelId从models.json读取真实apiKey
      localStorage.setItem('tuzhong-llm-config', JSON.stringify({
        provider: (def.provider || '').replace(/\s*\([^)]*\)\s*/g, '').trim(),
        apiKey: def.apiKey,
        baseUrl: (def.baseUrl || '').replace(/[`'"]/g, '').trim(),
        model: def.model,
        modelId: def.id,
      }))
    }
    syncModelsToBackend(updatedBatch)
  }

  function execDeleteModel(modelId: string) {
    const target = aiModelBatch.find(function (m) { return m.id === modelId })
    // 修复：普通用户不能删除管理员共享的模型
    if (target?.isAdminDefault && !isAdmin) {
      alert('管理员共享的模型不能删除')
      return
    }
    const remaining = aiModelBatch.filter(function (m) { return m.id !== modelId })
    setAiModelBatch(remaining)

    if (target?.status === 'default') {
      const newDef = remaining.find(function (m) { return m.status === 'default' }) || remaining[0]
      if (newDef) {
        localStorage.setItem('tuzhong-llm-config', JSON.stringify({
          provider: newDef.provider, apiKey: newDef.apiKey,
          baseUrl: (newDef.baseUrl || '').replace(/[`'"]/g, '').trim(), model: newDef.model,
        }))
      } else { localStorage.removeItem('tuzhong-llm-config') }
    }
    syncModelsToBackend(remaining)
  }

  function execEditModel(modelId: string) {
    const m = aiModelBatch.find(function (x) { return x.id === modelId })
    if (!m) return
    // 修复：普通用户不能编辑管理员共享的模型
    if (m.isAdminDefault && !isAdmin) {
      alert('管理员共享的模型不能编辑，请添加自己的模型')
      return
    }
    setNewModelForm({ provider: m.provider, apiKey: m.apiKey || '', name: m.name, baseUrl: m.baseUrl || '', model: m.model || '' })
    setEditingModelId(modelId)
    setAddModelModalOpen(true)
  }

  function execSaveEditModel() {
    if (!editingModelId || !newModelForm.provider || !newModelForm.name.trim() || !newModelForm.apiKey.trim()) return
    const updatedBatch = aiModelBatch.map(function (m) {
      if (m.id !== editingModelId) return m
      const copy = {} as AIModelItem
      const keys = Object.keys(m) as (keyof AIModelItem)[]
      for (let i = 0; i < keys.length; i++) { (copy as unknown as Record<string, unknown>)[keys[i]] = (m as unknown as Record<string, unknown>)[keys[i]] }
      copy.provider = newModelForm.provider; copy.name = newModelForm.name; copy.apiKey = newModelForm.apiKey
      copy.baseUrl = newModelForm.baseUrl || providerPresetMap[newModelForm.provider]?.baseUrl || ''
      copy.model = newModelForm.model || providerPresetMap[newModelForm.provider]?.defaultModel || ''
      return copy
    })
    setAiModelBatch(updatedBatch)

    const edited = updatedBatch.find(function (m) { return m.id === editingModelId })
    if (edited?.status === 'default') {
      localStorage.setItem('tuzhong-llm-config', JSON.stringify({
        provider: edited.provider, apiKey: edited.apiKey,
        baseUrl: (edited.baseUrl || '').replace(/[`'"]/g, '').trim(), model: edited.model,
      }))
    }
    setEditingModelId(null)
    setNewModelForm({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' })
    setAddModelModalOpen(false)
    setLocalModelList([])
    setLocalModelErr('')
    syncModelsToBackend(updatedBatch)
  }

  function execSavePrefs() {
    const prefs = {
      writingStyle: pickedStyle, continuationLength: pickedLength,
      customLength: pickedLength === 'custom' ? parseInt(customLenInput) || 500 : null,
      autoSaveInterval: pickedInterval, tomatoReminder: tomatoCheckFlag, zhuqueReminder: zhuqueCheckFlag,
      platformConfigs: platformConfigs,
      // 白金爆款爽文专属参数
      shuangDensityMode: shuangDensityMode,
      faceSlapStyle: faceSlapStyle,
      rhythmIntensity: rhythmIntensity,
      targetPlatform: targetPlatform,
      mcPersonality: mcPersonality,
    }
    localStorage.setItem('tuzhong-preferences', JSON.stringify(prefs))

    // 🔥 平台AI检测配置 - 独立 key 持久化（避免与其他字段混写导致修改丢失）
    try {
      localStorage.setItem('tuzhong-platform-configs', JSON.stringify(platformConfigs))
    } catch (_e) {}

    // 🔥 同步白金爆款参数到独立 localStorage key，供 AI 生成向导读取
    localStorage.setItem('tuzhong-bestseller-prefs', JSON.stringify({
      shuangDensityMode: shuangDensityMode,
      faceSlapStyle: faceSlapStyle,
      rhythmIntensity: rhythmIntensity,
      targetPlatform: targetPlatform,
      mcPersonality: mcPersonality,
    }))

    // 🔥 同步写作风格到 tuzhong-active-style-data，供AI生成向导（getActiveStyle）读取并应用到小说创作过程中
    const selectedStyle = extendedStyles.find(function (s) { return s.id === pickedStyle })
    if (selectedStyle) {
      localStorage.setItem('tuzhong-active-style', pickedStyle)
      localStorage.setItem('tuzhong-active-style-data', JSON.stringify(selectedStyle))
    } else {
      // 如果选中的风格不在预设列表中，尝试从后端风格池查找
      const fromPool = writingStylePool.find(function (s) { return s.id === pickedStyle })
      if (fromPool) {
        localStorage.setItem('tuzhong-active-style', pickedStyle)
        localStorage.setItem('tuzhong-active-style-data', JSON.stringify(fromPool))
      }
    }

    // 同步续写长度到 tuzhong-continue-length，供写作页面读取
    let lenValue = 1000
    if (pickedLength === 'short') lenValue = 500
    else if (pickedLength === 'long') lenValue = 2000
    else if (pickedLength === 'custom') lenValue = parseInt(customLenInput) || 500
    localStorage.setItem('tuzhong-continue-length', String(lenValue))

    setSaveSuccess(true)
    setTimeout(function () { setSaveSuccess(false) }, 2000)
  }

  function execExportData() {
    setExportProcessFlag(true)
    const p1 = fetch('/tuzhong-wenshu/api/novels').then(function (r) { return r.json() })
    const p2 = fetch('/tuzhong-wenshu/api/characters').then(function (r) { return r.json() })
    Promise.all([p1, p2]).then(function (results) {
      const novelData = (results[0].data || results[0].novels || [])
      const charData = (results[1].data || results[1].characters || [])
      const exportData = {
        exportDate: new Date().toISOString(),
        preferences: { writingStyle: pickedStyle, continuationLength: pickedLength, autoSaveInterval: pickedInterval, tomatoReminder: tomatoCheckFlag },
        novels: novelData, characters: charData,
        models: aiModelBatch.map(function (m) { const copy: Record<string, unknown> = {}; const keys = Object.keys(m) as (keyof AIModelItem)[]; for (let i = 0; i < keys.length; i++) { copy[keys[i]] = (m as unknown as Record<string, unknown>)[keys[i]] }; copy.apiKey = '***'; return copy }),
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'tuzhong-wenshu-export-' + new Date().toISOString().split('T')[0] + '.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExportModalOpen(false)
    }).catch(function () {}).finally(function () { setExportProcessFlag(false) })
  }

  function execDeleteAcct() {
    if (deleteConfirmText !== '确认注销') return
    // 修复 v8：真实调用后端 DELETE /api/auth/account 删除用户及所有关联数据（数据库级联删除）
    const token = localStorage.getItem('token') || ''
    setExportProcessFlag(true) // 复用加载状态防止重复点击
    fetch('/tuzhong-wenshu/api/auth/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ confirm: true }),
    })
      .then(function (r) { return r.json() })
      .then(function (b) {
        if (b.code === 200) {
          localStorage.clear()
          alert('账户已注销，所有数据已永久删除')
          setDeleteAcctModalOpen(false)
          window.location.href = '/tuzhong-wenshu/'
        } else {
          alert('注销失败：' + (b.message || '未知错误'))
        }
      })
      .catch(function () { alert('网络错误，请稍后重试') })
      .finally(function () { setExportProcessFlag(false) })
  }

  const tabPool: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'ai-model', label: 'AI模型配置', icon: Cpu },
    { id: 'writing-preference', label: '写作偏好', icon: PenTool },
    { id: 'ai-detection', label: 'AI双重判定特征库', icon: ShieldAlert },
    { id: 'account', label: '账户管理', icon: UserCircle },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
        <div className="flex items-center space-x-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 mb-8">
          {tabPool.map(function (tab) {
            return (
              <button
                key={tab.id}
                onClick={function () { setActiveTab(tab.id) }}
                className={'flex items-center space-x-2 px-6 py-3 rounded-lg transition-all ' +
                  (activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100')}
              >
                <tab.icon className="w-4 h-4" />
                <span className="font-medium">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* AI模型配置 */}
        {activeTab === 'ai-model' && (
          <div>
            {/* 路由卡片仅管理员可见，普通用户无需了解后台配置 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col overflow-hidden border-t-4 border-t-cyan-500">
              <div className="flex items-start justify-between gap-4 p-6 pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🎯</span>
                    <h2 className="text-base font-bold text-gray-900 truncate">硅基流动（8套）</h2>
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-cyan-50 text-cyan-700 border border-cyan-100 font-medium">8 models</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 truncate">7 款永久免费（正文/大纲/权谋/备用/润色/封面）+ DeepSeek-V4-Flash 开局分析</p>
                </div>
                <button
                  onClick={function () { execImportSiliconflowPresets() }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg text-xs font-medium transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  导入
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 flex-1 px-6 pb-6 items-stretch">
                {modelPresetPool.map(function (preset) {
                  const colorMap: Record<string, { bg: string; border: string; text: string; badge: string }> = {
                    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
                    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700' },
                    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700' },
                    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-green-100 text-green-700' },
                    cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-800', badge: 'bg-cyan-100 text-cyan-700' },
                    teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', badge: 'bg-teal-100 text-teal-700' },
                    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700' },
                  }
                  const c = colorMap[preset.color] || colorMap.blue
                  const presetProvider = String(preset.provider || '').trim()
                  const presetModel = String(preset.model || '').trim()
                  // 修复：普通用户始终看到预设模型为"已添加"状态（使用管理员配置的默认模型）
                  const alreadyAdded = isAdmin
                    ? aiModelBatch.some(function (m) {
                        const mProvider = String(m.provider || '').trim()
                        const mModel = String(m.model || '').trim()
                        return mModel === presetModel && (
                          mProvider === presetProvider ||
                          (presetProvider === '硅基流动' && (mProvider === '硅基流动' || mProvider === '硅基流动 (SiliconFlow)')) ||
                          ((presetProvider === '硅基流动' || presetProvider === '硅基流动 (SiliconFlow)') && mProvider === '硅基流动')
                        )
                      })
                    : true
                  return (
                    <div key={preset.id} className="bg-white rounded-xl border border-gray-200 p-4 relative shadow-sm hover:shadow-md hover:border-gray-300 transition-all h-full flex flex-col">
                      {alreadyAdded ? (
                        <div className="absolute top-2.5 right-2.5" title="已添加：在「已配置模型」列表中已找到对应 provider+model 的记录">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-[10px] rounded-full font-medium border border-green-100">
                            <Check className="w-3 h-3" />已添加
                          </span>
                        </div>
                      ) : (
                        <div className="absolute top-2.5 right-2.5" title="未添加：点击上方「导入」按钮填入 Key 后启用">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 text-[10px] rounded-full font-medium border border-gray-100">
                            <span className="w-2.5 h-2.5 rounded-full border border-gray-400 border-dashed inline-block"></span>未添加
                          </span>
                        </div>
                      )}
                      <div className="flex items-start gap-3 h-full">
                        <span className="text-xl mt-0.5 shrink-0">{preset.icon}</span>
                        <div className="flex-1 min-w-0 flex flex-col h-full">
                          <h3 className="font-semibold text-sm text-gray-900 leading-snug pr-14">{preset.name}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className={'px-1.5 py-0.5 text-[10px] rounded font-medium ' + c.badge}>{preset.usageTag}</span>
                            <span className="text-[10px] text-gray-400 font-mono truncate max-w-[130px]" title={preset.model}>{preset.model}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2 min-h-[2.5em] leading-[1.25em]">{preset.description}</p>
                          <div className="pt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-gray-500">
                            <span>温度 <b className="text-gray-700">{preset.temperature}</b></span>
                            <span>TopP <b className="text-gray-700">{preset.topP}</b></span>
                            <span>上下文 <b className="text-gray-700">{preset.contextWindow >= 1000000 ? preset.contextWindow / 1000000 + 'M' : preset.contextWindow / 1000 + 'K'}</b></span>
                            <span>最大长度 <b className="text-gray-700">{preset.maxTokens}</b></span>
                            <span>存在惩罚 <b className="text-gray-700">{preset.presencePenalty}</b></span>
                            <span>频率惩罚 <b className="text-gray-700">{preset.frequencyPenalty}</b></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            )}

            {/* 智谱 BigModel 免费模型卡片（仅管理员可见） */}
            {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col overflow-hidden border-t-4 border-t-indigo-500">
              <div className="flex items-start justify-between gap-4 p-6 pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🧪</span>
                    <h2 className="text-base font-bold text-gray-900 truncate">智谱 BigModel 免费（3套）</h2>
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-medium">3 models</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 truncate">GLM-4.7-Flash / GLM-Z1-Flash / GLM-4-Flash 并行备选</p>
                </div>
                <button
                  onClick={function () { execImportZhipuPresets() }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-medium transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  导入
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 flex-1 px-6 pb-6 items-stretch">
                {renderPresetCards(zhipuPresetPool, isAdmin, aiModelBatch)}
              </div>
            </div>
            )}

            {/* OpenRouter 永久免费模型卡片（仅管理员可见） */}
            {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col overflow-hidden border-t-4 border-t-orange-500">
              <div className="flex items-start justify-between gap-4 p-6 pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🌐</span>
                    <h2 className="text-base font-bold text-gray-900 truncate">OpenRouter 免费（10套）</h2>
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-orange-50 text-orange-700 border border-orange-100 font-medium">10 models</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 truncate">GPT-OSS / DeepSeek-R1-Distill / Llama / Qwen 跨厂商聚合</p>
                </div>
                <button
                  onClick={function () { setPlatformImportTarget('OpenRouter'); setPlatformModalOpen(true) }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg text-xs font-medium transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  导入
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 flex-1 px-6 pb-6 items-stretch">
                {renderPresetCards(openrouterPresetPool, isAdmin, aiModelBatch)}
              </div>
            </div>
            )}

            {/* Groq 永久免费模型卡片（仅管理员可见） */}
            {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col overflow-hidden border-t-4 border-t-lime-500">
              <div className="flex items-start justify-between gap-4 p-6 pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">⚡</span>
                    <h2 className="text-base font-bold text-gray-900 truncate">Groq 免费（6套）</h2>
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-lime-50 text-lime-700 border border-lime-100 font-medium">6 models</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 truncate">Llama / DeepSeek / Qwen / Gemma 极速推理</p>
                </div>
                <button
                  onClick={function () { setPlatformImportTarget('Groq'); setPlatformModalOpen(true) }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-lime-700 bg-lime-50 hover:bg-lime-100 border border-lime-200 rounded-lg text-xs font-medium transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  导入
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 flex-1 px-6 pb-6 items-stretch">
                {renderPresetCards(groqPresetPool, isAdmin, aiModelBatch)}
              </div>
            </div>
            )}

            {/* 腾讯混元 永久免费模型卡片（仅管理员可见） */}
            {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col overflow-hidden border-t-4 border-t-rose-500">
              <div className="flex items-start justify-between gap-4 p-6 pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🐧</span>
                    <h2 className="text-base font-bold text-gray-900 truncate">腾讯混元 免费（1套）</h2>
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-rose-50 text-rose-700 border border-rose-100 font-medium">1 model</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 truncate">hunyuan-lite 永久免费，中文创作稳定</p>
                </div>
                <button
                  onClick={function () { setPlatformImportTarget('腾讯混元'); setPlatformModalOpen(true) }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-medium transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  导入
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 flex-1 px-6 pb-6 items-stretch">
                {renderPresetCards(hunyuanPresetPool, isAdmin, aiModelBatch)}
              </div>
            </div>
            )}

            {/* 🔥 2026-09-01 第20轮：商汤日日新 模型卡片（仅管理员可见） */}
            {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col overflow-hidden border-t-4 border-t-emerald-500">
              <div className="flex items-start justify-between gap-4 p-6 pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🌆</span>
                    <h2 className="text-base font-bold text-gray-900 truncate">商汤日日新（1套）</h2>
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">1 model</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 truncate">sensenova-6.8-flash-lite，响应快、JSON 输出干净</p>
                </div>
                <button
                  onClick={function () { setPlatformImportTarget('商汤 (SenseTime)'); setPlatformModalOpen(true) }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-medium transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  导入
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 flex-1 px-6 pb-6 items-stretch">
                {renderPresetCards(sensenovaPresetPool, isAdmin, aiModelBatch)}
              </div>
            </div>
            )}
            </div>

            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">已配置模型</h2>
                <p className="text-sm text-gray-500 mt-1">管理您的AI写作模型，设置默认模型用于日常写作</p>
              </div>
              <button
                onClick={function () { setEditingModelId(null); setNewModelForm({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' }); setLocalModelList([]); setLocalModelErr(''); setAddModelModalOpen(true) }}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>添加模型</span>
              </button>
            </div>

            {/* VIP引导 */}
            <div className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-[8px] p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-[#4E5969]">免费用户可创建并完整生成第1本作品；从第2本新书起，需开通任意一档VIP会员方可继续生成。</p>
              </div>
              <Link href="/vip" className="h-9 px-4 rounded-[6px] bg-[#165DFF] text-white text-sm hover:bg-[#0F3FA8] transition-colors flex items-center gap-1.5 shrink-0 ml-4">
                <Crown className="w-4 h-4" />立即开通VIP
              </Link>
            </div>

            {(function () {
              const _order = ['硅基流动', '智谱GLM', 'OpenRouter', 'Groq', '腾讯混元']
              const _groups: Record<string, any[]> = {}
              for (let i = 0; i < aiModelBatch.length; i++) {
                const _m = aiModelBatch[i]
                const _p = _m.provider || '其他'
                ;(_groups[_p] = _groups[_p] || []).push(_m)
              }
              const _providers = Object.keys(_groups).sort(function (a, b) {
                const _ia = _order.indexOf(a); const _ib = _order.indexOf(b)
                return (_ia === -1 ? 999 : _ia) - (_ib === -1 ? 999 : _ib)
              })
              return _providers.map(function (prov) {
                const _gColors = providerColorMap[prov] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
                const _GIcon = providerIconMap[prov] || Cpu
                const _list = _groups[prov]
                return (
                  <div key={prov} className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <div className={'w-8 h-8 rounded-lg flex items-center justify-center ' + _gColors.bg}>
                        <_GIcon className={'w-4 h-4 ' + _gColors.text} />
                      </div>
                      <h3 className="text-base font-semibold text-gray-900">{prov}</h3>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">{_list.length} 个模型</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {_list.map(function (modelItem: any) {
                const colors = providerColorMap[modelItem.provider] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
                const IconComp = providerIconMap[modelItem.provider] || Cpu
                const isDefault = modelItem.status === 'default'
                const _noKey = !modelItem.apiKey
                return (
                  <div key={modelItem.id} className={'bg-white rounded-xl border-2 p-5 transition-all ' + (isDefault ? 'border-blue-400 shadow-md shadow-blue-100' : (_noKey ? 'border-amber-300 hover:border-amber-400' : 'border-gray-200 hover:border-gray-300'))}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className={'w-12 h-12 rounded-xl flex items-center justify-center ' + colors.bg}>
                          <IconComp className={'w-6 h-6 ' + colors.text} />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-semibold text-gray-900">{modelItem.name}</h3>
                            {isDefault && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">默认</span>}
                            {modelItem.usageTag && (
                              <span className={'px-2 py-0.5 text-xs rounded-full font-medium ' +
                                (modelItem.usageTag === '正文写作' ? 'bg-blue-50 text-blue-700' :
                                 modelItem.usageTag === '权谋战争' ? 'bg-red-50 text-red-700' :
                                 modelItem.usageTag === '大纲校验' ? 'bg-purple-50 text-purple-700' :
                                 modelItem.usageTag === '草稿速写' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-700')}>{modelItem.usageTag}</span>)}
                          </div>
                          <span className={'inline-block px-2 py-0.5 text-xs rounded-full mt-1 border ' + colors.bg + ' ' + colors.text + ' ' + colors.border}>{modelItem.provider}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        {!isDefault && !_noKey && (
                          <button onClick={function () { execSetDefaultModel(modelItem.id) }} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-blue-600" title="设为默认">
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={function () { execDeleteModel(modelItem.id) }} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-600" title="删除">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">API Key</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-400 font-mono tracking-wider">
                            {function () {
                              const raw = modelItem.apiKey || ''
                              if (!raw) return '（未配置）'
                              if (raw.length <= 8) return '••••••••'
                              return raw.slice(0, 3) + '••••••••••••' + raw.slice(-3)
                            }()}
                          </span>
                          {_noKey && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">待配置 Key</span>}
                          <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100" title="出于安全考虑，列表页不直接展示完整 API Key。请点击下方【编辑】按钮查看或修改">
                            🔒 安全隐藏，点「编辑」查看
                          </span>
                        </div>
                      </div>
                      {modelItem.baseUrl && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Base URL</span>
                          <span className="text-xs text-gray-600 font-mono truncate max-w-[240px]">{modelItem.baseUrl}</span>
                        </div>
                      )}
                      {modelItem.model && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">模型</span>
                          <span className="text-xs text-gray-600 font-mono truncate max-w-[240px]">{modelItem.model}</span>
                        </div>
                      )}
                      {(modelItem.temperature !== undefined || modelItem.maxTokens !== undefined) && (
                        <div className="mt-1 pt-1 border-t border-gray-50">
                          <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-xs text-gray-500">
                            {modelItem.temperature !== undefined && <span>温度: <b className="text-gray-700">{modelItem.temperature}</b></span>}
                            {modelItem.topP !== undefined && <span>Top_P: <b className="text-gray-700">{modelItem.topP}</b></span>}
                            {modelItem.maxTokens !== undefined && <span>最大长度: <b className="text-gray-700">{modelItem.maxTokens}</b></span>}
                            {modelItem.presencePenalty !== undefined && <span>存在惩罚: <b className="text-gray-700">{modelItem.presencePenalty}</b></span>}
                            {modelItem.frequencyPenalty !== undefined && <span>频率惩罚: <b className="text-gray-700">{modelItem.frequencyPenalty}</b></span>}
                            {modelItem.contextWindow !== undefined && <span>上下文: <b className="text-gray-700">{modelItem.contextWindow >= 1000000 ? modelItem.contextWindow / 1000000 + 'M' : modelItem.contextWindow / 1000 + 'K'}</b></span>}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                      <div className="flex items-center space-x-1.5">
                        <div className={'w-2 h-2 rounded-full ' + (modelItem.status !== 'inactive' ? 'bg-green-500' : 'bg-gray-300')}></div>
                        <span className="text-xs text-gray-500">{modelItem.status !== 'inactive' ? '已启用' : '未启用'}</span>
                      </div>
                      <button onClick={function () { execEditModel(modelItem.id) }} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1">
                        <Edit3 className="w-3.5 h-3.5" /><span>编辑</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    )()}

            {modelsLoadFlag && (
              <div className="text-center py-16 text-gray-400">
                <div className="w-16 h-16 mx-auto mb-4 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                <p>正在加载AI模型配置...</p>
              </div>
            )}

            {!modelsLoadFlag && aiModelBatch.length === 0 && (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto mb-6 bg-blue-50 rounded-full flex items-center justify-center">
                  <Cpu className="w-10 h-10 text-blue-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">尚未配置任何AI模型</h3>
                <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">添加您的第一个AI模型，开始使用途中文枢的智能写作功能。支持 OpenAI、Claude、DeepSeek、通义千问、智谱GLM 等 20+ 种模型。</p>
                <button onClick={function () { setEditingModelId(null); setNewModelForm({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' }); setLocalModelList([]); setLocalModelErr(''); setAddModelModalOpen(true) }} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium inline-flex items-center space-x-2">
                  <Plus className="w-4 h-4" /><span>添加第一个模型</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 写作偏好 */}
        {activeTab === 'writing-preference' && (
          <div className="space-y-8">
            {/* 默认写作风格 - 风格工坊整合 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h3 className="font-semibold text-gray-900">默认写作风格</h3>
                  <p className="text-sm text-gray-500">选择默认的写作风格，AI续写时将自动应用</p>
                </div>
              </div>

              {/* 当前选中风格提示 */}
              {pickedStyle !== 'classic' && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center space-x-3">
                  <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-blue-700">
                      已选择：{extendedStyles.find(function(s) { return s.id === pickedStyle })?.name || writingStylePool.find(function(s) { return s.id === pickedStyle })?.name || pickedStyle}
                    </span>
                    <button onClick={function () { setPickedStyle('classic') }} className="ml-3 text-xs text-blue-500 hover:text-blue-700 underline">取消选择</button>
                  </div>
                </div>
              )}

              {/* 分类筛选 */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {styleCategories.map(function (cat) {
                  return (
                    <button key={cat} onClick={function () { setStyleCategory(cat) }}
                      className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ' + (styleCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                      {cat}
                    </button>
                  )
                })}
                <div className="relative ml-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" placeholder="搜索风格..." value={styleSearch}
                    onChange={function (e) { setStyleSearch(e.target.value) }}
                    className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs w-36" />
                </div>
              </div>

              {/* 风格网格 - 扩大到三列布局 */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {extendedStyles.filter(function (style) {
                  const matchCat = styleCategory === '全部' || style.category === styleCategory
                  const matchSearch = !styleSearch || style.name.indexOf(styleSearch) >= 0 || (style.description || '').indexOf(styleSearch) >= 0
                  return matchCat && matchSearch
                }).map(function (style) {
                  const isPicked = pickedStyle === style.id
                  return (
                    <div key={style.id} onClick={function () { setPickedStyle(style.id) }}
                      className={'rounded-xl border-2 transition-all cursor-pointer overflow-hidden ' + (isPicked ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:border-blue-300 hover:shadow')}>
                      <div className="h-16 bg-gradient-to-br from-blue-500 to-purple-600 relative">
                        <div className="absolute bottom-2 left-3">
                          <span className="px-2 py-0.5 bg-white/20 backdrop-blur text-white text-xs rounded-full">{style.category}</span>
                        </div>
                        {isPicked && <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center"><Check className="w-3.5 h-3.5 text-white" /></div>}
                      </div>
                      <div className="p-4">
                        <h4 className="font-semibold text-sm text-gray-900 mb-1">{style.name}</h4>
                        <p className="text-xs text-gray-500 line-clamp-2 mb-3">{typeof style.description === 'string' ? style.description : ''}</p>
                        <div className="space-y-1.5">
                          {[
                            { name: '情感强度', value: typeof (style.parameters as Record<string, number> | undefined)?.emotionIntensity === 'number' ? (style.parameters as Record<string, number>).emotionIntensity : 50 },
                            { name: '节奏快慢', value: typeof (style.parameters as Record<string, number> | undefined)?.pacing === 'number' ? (style.parameters as Record<string, number>).pacing : 50 },
                            { name: '描写密度', value: typeof (style.parameters as Record<string, number> | undefined)?.descriptionDensity === 'number' ? (style.parameters as Record<string, number>).descriptionDensity : 50 },
                          ].map(function (param) {
                            return (
                              <div key={param.name} className="flex items-center space-x-2">
                                <span className="text-xs text-gray-400 w-14 flex-shrink-0">{param.name}</span>
                                <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: Math.max(0, Math.min(100, param.value)) + '%' }}></div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 风格实验室 - 自定义参数 */}
              <details className="mt-6 group">
                <summary className="flex items-center space-x-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer select-none">
                  <Sparkles className="w-4 h-4" />
                  <span>风格实验室 — 自定义调参</span>
                  <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                </summary>
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500 mb-4">调整以下参数创建自定义风格，参数将影响AI续写的语言特征</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { key: 'formality', label: '正式程度', tip: '越高用词越正式' },
                      { key: 'emotionIntensity', label: '情感强度', tip: '越高情感越浓烈' },
                      { key: 'descriptionDensity', label: '描写密度', tip: '越高描写越细腻' },
                      { key: 'dialogueRatio', label: '对话比例', tip: '越高对话占比越大' },
                      { key: 'rhetoricFrequency', label: '修辞频率', tip: '越高修辞手法越多' },
                      { key: 'pacing', label: '节奏快慢', tip: '越高节奏越紧凑' },
                      { key: 'languageDensity', label: '语言密度', tip: '越高信息量越大' },
                      { key: 'eraFeel', label: '时代感', tip: '越高古风越浓' },
                      { key: 'excitementDensity', label: '爽点密度', tip: '越高爽点越密集' },
                    ].map(function (param) {
                      return (
                        <div key={param.key}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-600">{param.label}</span>
                            <span className="text-xs text-blue-600 font-medium">{Math.round(typeof (extendedStyles[0]?.parameters as Record<string, number> | undefined)?.[param.key] === 'number' ? (extendedStyles[0].parameters as Record<string, number>)[param.key] : 50)}</span>
                          </div>
                          <input type="range" min={0} max={100} defaultValue={typeof (extendedStyles[0]?.parameters as Record<string, number> | undefined)?.[param.key] === 'number' ? (extendedStyles[0].parameters as Record<string, number>)[param.key] : 50}
                            className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600" />
                          <p className="text-xs text-gray-400 mt-0.5">{param.tip}</p>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">应用自定义参数</button>
                  </div>
                </div>
              </details>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-1">默认续写长度</h3>
              <p className="text-sm text-gray-500 mb-4">设置AI每次续写的默认字数</p>
              <div className="flex flex-wrap gap-3">
                {continuationLengthPool.map(function (len) {
                  return (
                    <button key={len.id} onClick={function () { setPickedLength(len.id) }}
                      className={'px-4 py-2 rounded-lg text-sm font-medium transition-colors ' + (pickedLength === len.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                      {len.label}
                    </button>
                  )
                })}
              </div>
              {pickedLength === 'custom' && (
                <div className="mt-3">
                  <input type="number" value={customLenInput} onChange={function (e) { setCustomLenInput(e.target.value) }}
                    className="w-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" placeholder="输入字数" min={100} max={10000} />
                  <span className="text-sm text-gray-500 ml-2">字</span>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-1">自动保存间隔</h3>
              <p className="text-sm text-gray-500 mb-4">设置写作时自动保存的时间间隔</p>
              <div className="flex flex-wrap gap-3">
                {autoSaveIntervalPool.map(function (interval) {
                  return (
                    <button key={interval.id} onClick={function () { setPickedInterval(interval.id) }}
                      className={'px-4 py-2 rounded-lg text-sm font-medium transition-colors ' + (pickedInterval === interval.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                      {interval.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">平台AI检测配置</h3>
              <p className="text-sm text-gray-500 mb-6">配置各平台的AI检测标准，开启后AI生成的内容将自动进行对应平台的检测评分</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                {platformConfigs.map(function (platform) {
                  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
                    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
                    rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
                    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
                    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
                    pink: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700' },
                    yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
                    cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700' },
                    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
                  }
                  const colors = colorMap[platform.color] || colorMap.blue
                  const expanded = !!(expandedPlatforms as Record<string, boolean>)[platform.key] || false
                  return (
                    <div key={platform.key} className={'rounded-lg border-2 transition-all ' + (platform.enabled ? colors.bg + ' ' + colors.border : 'bg-gray-50 border-gray-200')}>
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{platform.icon}</span>
                            <div>
                              <h4 className={'font-semibold ' + (platform.enabled ? colors.text : 'text-gray-600')}>{platform.name}</h4>
                              <p className="text-xs text-gray-500">{platform.description}</p>
                            </div>
                          </div>
                          <button onClick={function () {
                            setPlatformConfigs(platformConfigs.map(function (p) {
                              if (p.key === platform.key) return { ...p, enabled: !p.enabled }
                              return p
                            }))
                          }} className={'relative w-12 h-6 rounded-full transition-colors ' + (platform.enabled ? 'bg-blue-600' : 'bg-gray-300')}>
                            <div className={'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ' + (platform.enabled ? 'translate-x-6' : 'translate-x-0.5')}></div>
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">AI检测标准</span>
                          <input
                            type="text"
                            value={platform.aiStandard}
                            onChange={function (e) {
                              setPlatformConfigs(platformConfigs.map(function (p) {
                                if (p.key === platform.key) return { ...p, aiStandard: e.target.value }
                                return p
                              }))
                            }}
                            className={'flex-1 px-2 py-1 text-xs border rounded-md focus:ring-2 focus:ring-blue-500 ' + (platform.enabled ? 'border-gray-200' : 'border-gray-100 bg-gray-100')}
                          />
                        </div>
                        <button onClick={function () {
                          setExpandedPlatforms(Object.assign({}, expandedPlatforms, { [platform.key]: !expanded }))
                        }} className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                          <ChevronRight className={'w-3.5 h-3.5 transition-transform ' + (expanded ? 'rotate-90' : '')} />
                          <span>{expanded ? '收起详情' : '查看详细检测标准'}</span>
                        </button>
                      </div>
                      {expanded && (
                        <div className="px-4 pb-4 space-y-2 border-t border-gray-200 pt-3">
                          {platform.compliance && (
                            <div className="text-xs bg-gray-100 rounded p-2">
                              <span className="font-medium text-gray-700">📋 内容合规：</span>
                              <span className="text-gray-600">{platform.compliance.replace('内容合规：', '')}</span>
                            </div>
                          )}
                          {platform.signing && (
                            <div className="text-xs bg-gray-100 rounded p-2">
                              <span className="font-medium text-gray-700">📝 签约评估：</span>
                              <span className="text-gray-600">{platform.signing.replace('签约评估：', '')}</span>
                            </div>
                          )}
                          {platform.traffic && (
                            <div className="text-xs bg-gray-100 rounded p-2">
                              <span className="font-medium text-gray-700">🚀 流量推荐：</span>
                              <span className="text-gray-600">{platform.traffic.replace('流量推荐：', '')}</span>
                            </div>
                          )}
                          {platform.revenue && (
                            <div className="text-xs bg-gray-100 rounded p-2">
                              <span className="font-medium text-gray-700">💰 收益规则：</span>
                              <span className="text-gray-600">{platform.revenue.replace('收益规则：', '')}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ==================== 白金爆款爽文专属参数 ==================== */}
            <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 rounded-xl border-2 border-amber-300 p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-300/30 to-rose-300/30 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="w-5 h-5 text-amber-600" />
                  <h3 className="font-bold text-gray-900 text-lg">白金爆款爽文专属参数</h3>
                  <span className="px-2 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs rounded-full font-medium">PRO</span>
                </div>
                <p className="text-sm text-gray-600 mb-6">以上参数将全局生效于 AI 全自动小说创作流程（灵感→大纲→角色→章节→正文），打造番茄/起点/飞卢爆款爽文</p>

                {/* 爽点密度模式 */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-800">🎯 爽点密度模式</h4>
                      <p className="text-xs text-gray-500">控制每章爽点出现频率，直接决定完读率</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {shuangDensityPool.map(function (mode) {
                      const picked = shuangDensityMode === mode.id
                      return (
                        <div key={mode.id} onClick={function () { setShuangDensityMode(mode.id) }}
                          className={'rounded-lg border-2 p-3 cursor-pointer transition-all ' + (picked ? 'border-amber-500 bg-white shadow-md ring-2 ring-amber-200' : 'border-gray-200 bg-white/60 hover:border-amber-300 hover:shadow')}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={'text-sm font-semibold ' + (picked ? 'text-amber-700' : 'text-gray-700')}>{mode.label}</span>
                            {picked && <Check className="w-4 h-4 text-amber-600 flex-shrink-0" />}
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">{mode.tip}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 打脸风格 */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-800">🔥 打脸风格偏好</h4>
                      <p className="text-xs text-gray-500">决定主角从被嘲到震惊全场的叙事方式</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {faceSlapPool.map(function (mode) {
                      const picked = faceSlapStyle === mode.id
                      return (
                        <div key={mode.id} onClick={function () { setFaceSlapStyle(mode.id) }}
                          className={'rounded-lg border-2 p-3 cursor-pointer transition-all ' + (picked ? 'border-rose-500 bg-white shadow-md ring-2 ring-rose-200' : 'border-gray-200 bg-white/60 hover:border-rose-300 hover:shadow')}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={'text-sm font-semibold ' + (picked ? 'text-rose-700' : 'text-gray-700')}>{mode.label}</span>
                            {picked && <Check className="w-4 h-4 text-rose-600 flex-shrink-0" />}
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">{mode.tip}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 节奏强度 */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-800">⚡ 节奏强度模式</h4>
                      <p className="text-xs text-gray-500">控制章节字数、段落长短、剧情推进速度</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {rhythmPool.map(function (mode) {
                      const picked = rhythmIntensity === mode.id
                      return (
                        <div key={mode.id} onClick={function () { setRhythmIntensity(mode.id) }}
                          className={'rounded-lg border-2 p-3 cursor-pointer transition-all ' + (picked ? 'border-blue-500 bg-white shadow-md ring-2 ring-blue-200' : 'border-gray-200 bg-white/60 hover:border-blue-300 hover:shadow')}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={'text-sm font-semibold ' + (picked ? 'text-blue-700' : 'text-gray-700')}>{mode.label}</span>
                            {picked && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">{mode.tip}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 目标平台 */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-800">📱 首发目标平台</h4>
                      <p className="text-xs text-gray-500">针对平台读者口味自动调节节奏、爽点、字数</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {targetPlatformPool.map(function (mode) {
                      const picked = targetPlatform === mode.id
                      return (
                        <div key={mode.id} onClick={function () { setTargetPlatform(mode.id) }}
                          className={'rounded-lg border-2 p-3 cursor-pointer transition-all ' + (picked ? 'border-emerald-500 bg-white shadow-md ring-2 ring-emerald-200' : 'border-gray-200 bg-white/60 hover:border-emerald-300 hover:shadow')}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={'text-sm font-semibold ' + (picked ? 'text-emerald-700' : 'text-gray-700')}>{mode.label}</span>
                            {picked && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">{mode.tip}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 主角人设倾向 */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-800">🧠 主角人设倾向</h4>
                      <p className="text-xs text-gray-500">决定主角性格标签和核心行事风格，贯穿全书</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {mcPersonalityPool.map(function (mode) {
                      const picked = mcPersonality === mode.id
                      return (
                        <div key={mode.id} onClick={function () { setMcPersonality(mode.id) }}
                          className={'rounded-lg border-2 p-3 cursor-pointer transition-all ' + (picked ? 'border-violet-500 bg-white shadow-md ring-2 ring-violet-200' : 'border-gray-200 bg-white/60 hover:border-violet-300 hover:shadow')}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={'text-sm font-semibold ' + (picked ? 'text-violet-700' : 'text-gray-700')}>{mode.label}</span>
                            {picked && <Check className="w-4 h-4 text-violet-600 flex-shrink-0" />}
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">{mode.tip}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={execSavePrefs} className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <Save className="w-4 h-4" /><span>{saveSuccess ? '已保存！' : '保存偏好设置'}</span>
              </button>
            </div>
          </div>
        )}

        {/* AI双重判定特征库 */}
        {activeTab === 'ai-detection' && <AIDetectionLibrary />}

        {/* 账户管理 */}
        {activeTab === 'account' && (
          <UserProfileCard
            onLogout={function () { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/tuzhong-wenshu/login' }}
            hideLogout
            onExportClick={function () { setExportModalOpen(true) }}
            onDeleteAccountClick={function () { setDeleteAcctModalOpen(true) }}
          />
        )}
      </main>

      {/* 添加模型弹窗 */}
      {addModelModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">添加模型</h3>
              <button onClick={function () { setAddModelModalOpen(false); setEditingModelId(null); setNewModelForm({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' }); setLocalModelList([]); setLocalModelErr('') }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              {/* 修复：隐藏的 decoy input，阻止浏览器自动填充 leiyang 等账号密码到表单 */}
              <div className="hidden" aria-hidden="true">
                <input type="text" name="prevent_model_autofill_1" autoComplete="off" tabIndex={-1} />
                <input type="password" name="prevent_model_autofill_2" autoComplete="new-password" tabIndex={-1} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模型提供商</label>
                <select value={newModelForm.provider} onChange={function (e) { const p = e.target.value; const preset = providerPresetMap[p]; setNewModelForm({ provider: p, apiKey: newModelForm.apiKey, name: newModelForm.name, baseUrl: preset?.baseUrl || '', model: preset?.defaultModel || '' }) }} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
                  <option value="">请选择模型提供商</option>
                  <optgroup label="国际模型">
                    {['OpenAI', 'Claude (Anthropic)', 'Google Gemini', 'DeepSeek', 'Mistral', 'Groq', 'Together AI', 'OpenRouter', 'Perplexity', 'Cohere'].map(function (p) { return <option key={p} value={p}>{p}</option> })}
                  </optgroup>
                  <optgroup label="国内模型">
                    {['通义千问 (阿里)', '文心一言 (百度)', '智谱GLM', '讯飞星火', '月之暗面 (Kimi)', '百川智能', '零一万物 (Yi)', 'MiniMax', '阶跃星辰 (Step)', '腾讯混元', '字节豆包', '硅基流动 (SiliconFlow)', '商汤 (SenseTime)'].map(function (p) { return <option key={p} value={p}>{p}</option> })}
                  </optgroup>
                  <optgroup label="中转 / 聚合平台（国际）">
                    {['302.AI', 'AiHubMix', 'ChatAnywhere', 'gpt.ge', 'CloseAI', 'VoAPI', '无问芯穹 (Infini)'].map(function (p) { return <option key={p} value={p}>{p}</option> })}
                  </optgroup>
                  <optgroup label="国内中转站·生产级">
                    {['词元之河', '词元无忧 (token5u)', 'DMXAPI', 'TokenRunning', '酷站 AI (koozhan)', '非线智能 (NoneLinear)', 'JellyToken 智渲云'].map(function (p) { return <option key={p} value={p}>{p}</option> })}
                  </optgroup>
                  <optgroup label="国内中转站·社区(仅测试)">
                    {['PackyAPI', '柏拉图 AI (bltcy)', '小爱中转 (xiaoai.plus)', 'Laozhang.ai', 'Apiyi', '88code', 'mnapi', '一步 API (yibuapi)', 'jiekou.ai', '0011.ai', 'Privnode'].map(function (p) { return <option key={p} value={p}>{p}</option> })}
                  </optgroup>
                  <optgroup label="自定义">
                    {['自定义中转 (OpenAI兼容)'].map(function (p) { return <option key={p} value={p}>{p}</option> })}
                  </optgroup>
                  <optgroup label="本地部署">
                    {['Ollama (本地)', 'LM Studio (本地)', 'vLLM (本地)'].map(function (p) { return <option key={p} value={p}>{p}</option> })}
                  </optgroup>
                </select>
              </div>

              {providerPresetMap[newModelForm.provider] && (
                <div>
                  {newModelForm.provider === 'Ollama (本地)' ? (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-800">本地Ollama模型</span>
                        <button type="button" onClick={pullLocalModels} disabled={localModelLoadFlag} className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50">
                          {localModelLoadFlag ? '检测中...' : '刷新列表'}
                        </button>
                      </div>
                      {localModelErr && <p className="text-xs text-red-600 mb-2">{localModelErr}</p>}
                      {localModelList.length > 0 ? (
                        <div className="space-y-2">
                          <label className="block text-xs text-gray-600">从已安装的模型中选择</label>
                          <select value={newModelForm.model} onChange={function (e) { setNewModelForm({ provider: newModelForm.provider, apiKey: newModelForm.apiKey, name: newModelForm.name, baseUrl: newModelForm.baseUrl, model: e.target.value }) }} className="w-full p-2 border border-gray-300 rounded-lg text-sm">
                            <option value="">请选择模型</option>
                            {localModelList.map(function (m) { return <option key={m.name} value={m.name}>{m.name + ' (' + ((Number(m.size) || 0) / 1024 / 1024 / 1024).toFixed(1) + ' GB)'}</option> })}
                          </select>
                          <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-blue-200">
                            <p>或手动输入模型名称：</p>
                            <input type="text" value={newModelForm.model} onChange={function (e) { setNewModelForm({ provider: newModelForm.provider, apiKey: newModelForm.apiKey, name: newModelForm.name, baseUrl: newModelForm.baseUrl, model: e.target.value }) }} className="border rounded px-2 py-1 text-sm w-full mt-1" placeholder="如: qwen2.5:7b" />
                          </div>
                        </div>
                      ) : !localModelErr && (
                        <div className="text-center py-3">
                          <p className="text-xs text-gray-500 mb-2">点击&ldquo;刷新列表&rdquo;检测本地Ollama模型</p>
                          <button type="button" onClick={pullLocalModels} disabled={localModelLoadFlag} className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm">
                            {localModelLoadFlag ? '检测中...' : '检测本地Ollama模型'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">选择模型</label>
                      <select value={newModelForm.model} onChange={function (e) { setNewModelForm({ provider: newModelForm.provider, apiKey: newModelForm.apiKey, name: newModelForm.name, baseUrl: newModelForm.baseUrl, model: e.target.value }) }} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
                        {providerPresetMap[newModelForm.provider].models.map(function (m) { return <option key={m} value={m}>{m}</option> })}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">配置名称 <span className="text-gray-400">(自定义别名，方便识别)</span></label>
                <input type="text" value={newModelForm.name} onChange={function (e) { setNewModelForm({ provider: newModelForm.provider, apiKey: newModelForm.apiKey, name: e.target.value, baseUrl: newModelForm.baseUrl, model: newModelForm.model }) }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" placeholder="例如：我的GPT-4o、DeepSeek写作助手" autoComplete="off" name="model-alias-name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input type="password" value={newModelForm.apiKey} onChange={function (e) { setNewModelForm({ provider: newModelForm.provider, apiKey: e.target.value, name: newModelForm.name, baseUrl: newModelForm.baseUrl, model: newModelForm.model }) }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" placeholder="输入您的API Key" autoComplete="new-password" name="model-api-key-input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL <span className="text-gray-400">(已自动填充，可修改)</span></label>
                <input type="text" value={newModelForm.baseUrl} onChange={function (e) { setNewModelForm({ provider: newModelForm.provider, apiKey: newModelForm.apiKey, name: newModelForm.name, baseUrl: e.target.value, model: newModelForm.model }) }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" placeholder="例如：https://api.openai.com/v1" autoComplete="off" name="model-base-url" />
              </div>

              <div className="flex space-x-3 pt-4">
                <button onClick={function () { setAddModelModalOpen(false); setEditingModelId(null); setNewModelForm({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' }); setLocalModelList([]); setLocalModelErr('') }} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
                <button onClick={editingModelId ? execSaveEditModel : execAddModel} disabled={!newModelForm.provider || !newModelForm.name.trim() || (!editingModelId && !newModelForm.apiKey.trim())} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {editingModelId ? '保存' : '添加'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 数据导出弹窗 */}
      {exportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">数据导出</h3>
              <button onClick={function () { setExportModalOpen(false) }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">导出的数据将包含您的所有作品、角色信息、AI模型配置和偏好设置。</p>
              <div className="p-4 bg-blue-50 rounded-lg"><p className="text-sm text-blue-700">导出格式：JSON 文件</p><p className="text-xs text-blue-600 mt-1">文件将自动下载到您的设备</p></div>
              <div className="flex space-x-3">
                <button onClick={function () { setExportModalOpen(false) }} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
                <button onClick={execExportData} disabled={exportProcessFlag} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                  {exportProcessFlag ? '导出中...' : '开始导出'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 一键导入硅基7套永久免费弹窗 */}
      {sfModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2"><span className="text-2xl">🆓</span><h3 className="text-xl font-bold text-gray-900">一键导入硅基流动7套永久免费模型</h3></div>
              <button onClick={function () { setSfModalOpen(false); setSiliconflowApiKeyInput('') }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-4">
              <div className="bg-teal-50 rounded-xl border border-teal-100 p-4">
                <p className="text-sm font-medium text-teal-800 mb-2">将自动添加以下7套硅基流动永久免费模型（9B及以下，成本为零）：</p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {modelPresetPool.filter(function (p) { return ['sf-qwen25-7b', 'sf-glm4-9b', 'sf-glmz1-9b', 'sf-qwen3-8b', 'sf-qwen35-4b', 'sf-hunyuan-7b', 'sf-kolors'].indexOf(p.id) !== -1 }).map(function (p) {
                    return (
                      <div key={p.id} className="flex items-center gap-2 text-sm text-teal-700">
                        <span>{p.icon}</span><span className="font-medium">{p.name}</span>
                        <span className="text-teal-500">—</span>
                        <span className="font-mono text-xs">{p.model}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs mt-3 text-teal-600">
                  首选正文：Qwen2.5-7B｜大纲权谋：GLM-4-9B-0414｜权谋战争：GLM-Z1-9B｜备用正文：Qwen3-8B｜极速轻量：Qwen3.5-4B｜翻译润色：Hunyuan-MT-7B｜封面绘图：Kwai-Kolors（完全免费无限制）
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">硅基流动 API Key <span className="text-red-500">*</span></label>
                <input type="password" value={siliconflowApiKeyInput} onChange={function (e) { setSiliconflowApiKeyInput(e.target.value) }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                  placeholder="输入您的硅基流动 API Key（7套永久免费模型共用）" />
                <p className="text-xs text-gray-500 mt-1">
                  还没有API Key？前往 <a href="https://cloud.siliconflow.cn" target="_blank" rel="noopener noreferrer" className="hover:underline text-teal-600">硅基流动控制台</a> 免费注册获取（9B以下模型永久免费，无需充值）
                </p>
              </div>
              <div className="flex space-x-3 pt-2">
                <button onClick={function () { setSfModalOpen(false); setSiliconflowApiKeyInput('') }} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
                <button onClick={execImportSiliconflow} disabled={!siliconflowApiKeyInput.trim() || sfImportFlag}
                  className="flex-1 px-4 py-2.5 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700">
                  {sfImportFlag ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>导入中...</>
                  ) : (
                    <><Zap className="w-4 h-4" />一键导入</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 一键导入智谱3套永久免费弹窗 */}
      {zhipuModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2"><span className="text-2xl">🧪</span><h3 className="text-xl font-bold text-gray-900">一键导入智谱3套永久免费模型</h3></div>
              <button onClick={function () { setZhipuModalOpen(false); setZhipuApiKeyInput('') }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-4">
              <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4">
                <p className="text-sm font-medium text-indigo-800 mb-2">将自动添加以下3套智谱 BigModel 定价页显示免费模型：</p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {zhipuPresetPool.map(function (p) {
                    return (
                      <div key={p.id} className="flex items-center gap-2 text-sm text-indigo-700">
                        <span>{p.icon}</span><span className="font-medium">{p.name}</span>
                        <span className="text-indigo-500">—</span>
                        <span className="font-mono text-xs">{p.model}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs mt-3 text-indigo-600">
                  超高速正文：GLM-4.7-Flash（200K上下文）｜推理规划：GLM-Z1-Flash｜综合全能：GLM-4-Flash（建议正文主力）
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">智谱 BigModel API Key <span className="text-red-500">*</span></label>
                <input type="password" value={zhipuApiKeyInput} onChange={function (e) { setZhipuApiKeyInput(e.target.value) }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  placeholder="输入您的智谱 BigModel API Key（3套免费模型共用）" />
                <p className="text-xs text-gray-500 mt-1">
                  还没有API Key？前往 <a href="https://open.bigmodel.cn/" target="_blank" rel="noopener noreferrer" className="hover:underline text-indigo-600">智谱 BigModel 控制台</a> 免费注册获取
                </p>
              </div>
              <div className="flex space-x-3 pt-2">
                <button onClick={function () { setZhipuModalOpen(false); setZhipuApiKeyInput('') }} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
                <button onClick={execImportZhipu} disabled={!zhipuApiKeyInput.trim() || zhipuImportFlag}
                  className="flex-1 px-4 py-2.5 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700">
                  {zhipuImportFlag ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>导入中...</>
                  ) : (
                    <><Zap className="w-4 h-4" />一键导入</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 一键导入第三方平台（OpenRouter / Groq / 腾讯混元）免费模型弹窗：共用 */}
      {platformModalOpen && platformImportTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2"><span className="text-2xl">🔑</span><h3 className="text-xl font-bold text-gray-900">一键导入 {platformImportTarget} 免费模型</h3></div>
              <button onClick={function () { setPlatformModalOpen(false); setPlatformApiKeyInput(''); setPlatformImportTarget(null) }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-4">
              <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
                {platformImportTarget === 'OpenRouter' && (
                  <>
                    <p className="text-sm font-medium text-amber-800 mb-2">将自动为以下 {openrouterPresetPool.length} 个 OpenRouter 免费模型填入 Key 并启用：</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {openrouterPresetPool.map(function (p) {
                        return (
                          <div key={p.id} className="flex items-center gap-2 text-sm text-amber-700">
                            <span>{p.icon}</span><span className="font-medium">{p.name}</span>
                            <span className="text-amber-500">—</span>
                            <span className="font-mono text-xs">{p.model}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                {platformImportTarget === 'Groq' && (
                  <>
                    <p className="text-sm font-medium text-amber-800 mb-2">将自动为以下 {groqPresetPool.length} 个 Groq 免费模型填入 Key 并启用：</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {groqPresetPool.map(function (p) {
                        return (
                          <div key={p.id} className="flex items-center gap-2 text-sm text-amber-700">
                            <span>{p.icon}</span><span className="font-medium">{p.name}</span>
                            <span className="text-amber-500">—</span>
                            <span className="font-mono text-xs">{p.model}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                {platformImportTarget === '腾讯混元' && (
                  <>
                    <p className="text-sm font-medium text-amber-800 mb-2">将自动为以下 {hunyuanPresetPool.length} 个腾讯混元免费模型填入 Key 并启用：</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {hunyuanPresetPool.map(function (p) {
                        return (
                          <div key={p.id} className="flex items-center gap-2 text-sm text-amber-700">
                            <span>{p.icon}</span><span className="font-medium">{p.name}</span>
                            <span className="text-amber-500">—</span>
                            <span className="font-mono text-xs">{p.model}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                {platformImportTarget === '商汤 (SenseTime)' && (
                  <>
                    <p className="text-sm font-medium text-amber-800 mb-2">将自动为以下 {sensenovaPresetPool.length} 个商汤日日新模型填入 Key 并启用：</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {sensenovaPresetPool.map(function (p) {
                        return (
                          <div key={p.id} className="flex items-center gap-2 text-sm text-amber-700">
                            <span>{p.icon}</span><span className="font-medium">{p.name}</span>
                            <span className="text-amber-500">—</span>
                            <span className="font-mono text-xs">{p.model}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{platformImportTarget} API Key <span className="text-red-500">*</span></label>
                <input type="password" value={platformApiKeyInput} onChange={function (e) { setPlatformApiKeyInput(e.target.value) }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                  placeholder={'输入您的 ' + platformImportTarget + ' API Key（该平台免费模型共用）'} />
              </div>
              <div className="flex space-x-3 pt-2">
                <button onClick={function () { setPlatformModalOpen(false); setPlatformApiKeyInput(''); setPlatformImportTarget(null) }} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
                <button onClick={execImportPlatformPresets} disabled={!platformApiKeyInput.trim() || platformImportFlag}
                  className="flex-1 px-4 py-2.5 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700">
                  {platformImportFlag ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>导入中...</>
                  ) : (
                    <><Zap className="w-4 h-4" />一键导入</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 注销账户弹窗 */}
      {deleteAcctModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-red-600">注销账户</h3>
              <button onClick={function () { setDeleteAcctModalOpen(false); setDeleteConfirmText('') }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-700 font-medium">⚠️ 警告：此操作不可撤销</p>
                <p className="text-sm text-red-600 mt-2">注销账户将永久删除您的所有数据，包括：</p>
                <ul className="text-xs text-red-600 mt-2 space-y-1 list-disc list-inside">
                  <li>所有作品和章节内容</li><li>角色和设定数据</li><li>AI模型配置</li><li>偏好设置</li>
                </ul>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">请输入 <span className="text-red-600 font-bold">确认注销</span> 以继续</label>
                <input type="text" value={deleteConfirmText} onChange={function (e) { setDeleteConfirmText(e.target.value) }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500" placeholder="输入：确认注销" />
              </div>
              <div className="flex space-x-3">
                <button onClick={function () { setDeleteAcctModalOpen(false); setDeleteConfirmText('') }} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
                <button onClick={execDeleteAcct} disabled={deleteConfirmText !== '确认注销'} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">确认注销</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}