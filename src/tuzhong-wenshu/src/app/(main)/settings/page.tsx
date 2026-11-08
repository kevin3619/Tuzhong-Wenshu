'use client'

import { useState, useEffect, useRef } from 'react'
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
import {
  applyPreferencesToLocalStorage,
  fetchServerPreferences,
  getLocalPrefsUpdatedAt,
  pushServerPreferences,
  getLocalZhuqueApiKey,
  setLocalZhuqueApiKey,
  clearLocalZhuqueApiKey,
} from '@/lib/user-preferences-client'

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
  rateLimit?: { perMinute?: number; perHour?: number; perDay?: number }
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

const PRESET_COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700' },
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-green-100 text-green-700' },
  cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-800', badge: 'bg-cyan-100 text-cyan-700' },
  teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', badge: 'bg-teal-100 text-teal-700' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700' },
}

function initPresetSelection(pool: ModelPresetItem[]): Record<string, boolean> {
  const sel: Record<string, boolean> = {}
  pool.forEach(function (p) { sel[p.id] = presetBilling(p.id) === 'free' })
  return sel
}

const SILICONFLOW_PRESET_IDS = ['sf-qwen25-7b', 'sf-glm4-9b', 'sf-glmz1-9b', 'sf-qwen3-8b', 'sf-qwen35-4b', 'sf-hunyuan-7b', 'sf-kolors']

const zhipuPresetPool: ModelPresetItem[] = modelPresetPool.filter(function (p) { return String(p.provider || '') === '智谱GLM' })

function platformPoolFor(provider: string): ModelPresetItem[] {
  // 🔥 2026-11-05 平台清理后：OpenRouter/Groq/腾讯混元/商汤/OpenVeer 已移除，仅保留硅基与智谱（走专用池）
  return []
}
function siliconflowPresetPool(): ModelPresetItem[] {
  return modelPresetPool.filter(function (p) { return SILICONFLOW_PRESET_IDS.indexOf(p.id) !== -1 })
}

// 🔥 2026-11-05 平台清理后：保留的预设全部为免费模型
function presetBilling(_id: string): 'free' | 'paid' {
  return 'free'
}

// 🔥 2026-09-24：按 billing 把预设池拆成「免费 / 收费」两组，供各导入弹窗分组勾选渲染
function splitFreePaid(pool: ModelPresetItem[]): { free: ModelPresetItem[]; paid: ModelPresetItem[] } {
  const free: ModelPresetItem[] = []
  const paid: ModelPresetItem[] = []
  pool.forEach(function (p) { if (presetBilling(p.id) === 'paid') paid.push(p); else free.push(p) })
  return { free: free, paid: paid }
}

// 🔥 2026-09-24：将每分钟/每小时/每天字符串解析为 rateLimit 对象（仅保留 >0 的字段，全空返回 undefined）
function buildRateLimit(pm?: string, ph?: string, pd?: string): { perMinute?: number; perHour?: number; perDay?: number } | undefined {
  const nPm = pm ? parseInt(pm, 10) : NaN
  const nPh = ph ? parseInt(ph, 10) : NaN
  const nPd = pd ? parseInt(pd, 10) : NaN
  const out: { perMinute?: number; perHour?: number; perDay?: number } = {}
  if (!isNaN(nPm) && nPm > 0) out.perMinute = nPm
  if (!isNaN(nPh) && nPh > 0) out.perHour = nPh
  if (!isNaN(nPd) && nPd > 0) out.perDay = nPd
  if (Object.keys(out).length === 0) return undefined
  return out
}
const allPresetModels: ModelPresetItem[] = modelPresetPool.concat(
  zhipuPresetPool
)
const freePresets: ModelPresetItem[] = allPresetModels.filter(function (p) { return presetBilling(p.id) === 'free' })
const paidPresets: ModelPresetItem[] = allPresetModels.filter(function (p) { return presetBilling(p.id) === 'paid' })

function renderPresetCards(presets: ModelPresetItem[], isAdmin: boolean, aiModelBatch: AIModelItem[], onToggle: (preset: ModelPresetItem, enable: boolean) => void) {
  return presets.map(function (preset) {
    const c = PRESET_COLOR_MAP[preset.color] || PRESET_COLOR_MAP.blue
    const provider = String(preset.provider || '').trim()
    const model = String(preset.model || '').trim()
    const enabled = aiModelBatch.some(function (m) {
      return String(m.provider || '').trim() === provider && String(m.model || '').trim() === model && m.status !== 'inactive'
    })
    return (
      <div key={preset.id} className="bg-white rounded-xl border border-gray-200 p-4 relative shadow-sm hover:shadow-md hover:border-gray-300 transition-all h-full flex flex-col">
        <label className="absolute top-2.5 right-2.5 flex items-center gap-1.5 cursor-pointer select-none" title={enabled ? '已启用（勾选生效）' : '点击勾选以启用该模型'}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={function (e) { onToggle(preset, e.target.checked) }}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span className={'text-[10px] font-medium ' + (enabled ? 'text-green-700' : 'text-gray-500')}>{enabled ? '已启用' : '未启用'}</span>
        </label>
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
  '腾讯混元': Cloud, '字节豆包': Cpu,   '硅基流动 (SiliconFlow)': Zap, '硅基流动': Zap,
  '商汤 (SenseTime)': Cpu,
  'OpenVeer': Globe,
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
  'OpenVeer': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
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
  // 🔥 2026-09-24：OpenVeer 中转平台（OpenAI 兼容，baseUrl 固定）
  'OpenVeer': { baseUrl: 'https://api.openveer.com/v1', models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'glm-4-flash', 'deepseek-reasoner', 'qwen-plus'], defaultModel: 'deepseek-v4-flash' },
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

// 分类标签由风格数据动态生成，避免出现「点了没内容」的空分类
const styleCategoryOrder = ['古风', '都市', '现代', '科幻', '悬疑', '玄幻', '奇幻', '仙侠', '历史', '言情', '爽文', '游戏', '末世', '军事', '灵异', '同人']
const styleCategories = ['全部'].concat(
  styleCategoryOrder.filter(function (cat) {
    return extendedStyles.some(function (s) { return s.category === cat })
  })
)

type TabType = 'ai-model' | 'writing-preference' | 'ai-detection' | 'account'

export default function SettingsPage() {
  const _activeTab = useState<TabType>('ai-model')
  const activeTab = _activeTab[0]
  const setActiveTab = _activeTab[1]

  // 🔥 2026-10-20：写作偏好账号级同步（localStorage + 服务端），避免换浏览器/清缓存后丢失
  const _prefsReady = useState(false)
  const prefsReady = _prefsReady[0]
  const setPrefsReady = _prefsReady[1]
  const prefsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const _writingStylePool = useState<{ id: string; name: string; description: string }[]>([])
  const writingStylePool = _writingStylePool[0]
  const setWritingStylePool = _writingStylePool[1]

  const _isAdmin = useState(false)
  const isAdmin = _isAdmin[0]
  const setIsAdmin = _isAdmin[1]

  // 🔥 2026-10-26：朱雀官方通道改造为「用户自填 Key」模式
  //   Key 保存到两处：①账号偏好（服务端 user-preferences.json，跨设备可用）；②本浏览器 localStorage
  //   （检测面板从中读取并随请求把 Key 传给后端，不存服务端环境变量）。
  const _zhuqueKeyInput = useState('')
  const zhuqueKeyInput = _zhuqueKeyInput[0]
  const setZhuqueKeyInput = _zhuqueKeyInput[1]
  const _zhuqueKeyHint = useState('')
  const zhuqueKeyHint = _zhuqueKeyHint[0]
  const setZhuqueKeyHint = _zhuqueKeyHint[1]

  function execSaveZhuqueKey() {
    const key = String(zhuqueKeyInput || '').trim()
    if (!key) { alert('请先粘贴 Makers API Key'); return }
    fetch('/tuzhong-wenshu/api/user/preferences', {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      body: JSON.stringify({ data: { zhuqueApiKey: key } }),
    }).then(function (res) { return res.json().then(function (j) { return { ok: res.ok, j: j } }) })
      .then(function (r) {
        if (!r.ok) { alert('保存失败：' + ((r.j && r.j.error) || '未知错误')); return }
        setZhuqueKeyHint('****' + key.slice(-4))
        setZhuqueKeyInput('')
        // 同步留存一份到本浏览器：写作页检测面板从这里读取，检测请求由前端把 Key 传给后端
        setLocalZhuqueApiKey(key)
        setSaveSuccess(true)
        setTimeout(function () { setSaveSuccess(false) }, 2000)
      })
      .catch(function (e) { alert('保存失败：' + String(e && e.message ? e.message : e)) })
  }

  // 🔥 2026-10-26：清除本浏览器留存的朱雀 Key（账号偏好里的 Key 仍保留，重新打开设置页会再同步回来）
  function execClearLocalZhuqueKey() {
    clearLocalZhuqueApiKey()
    setZhuqueKeyHint('')
    setSaveSuccess(true)
    setTimeout(function () { setSaveSuccess(false) }, 2000)
  }

  function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('token')
    return token ? { 'Authorization': 'Bearer ' + token } : {}
  }

  // 防抖写入服务端：输入过程中不频繁请求，停手 0.6 秒后同步
  function persistPrefsSoon(prefs: Record<string, unknown>) {
    if (prefsSaveTimer.current) clearTimeout(prefsSaveTimer.current)
    prefsSaveTimer.current = setTimeout(function () {
      pushServerPreferences(prefs)
    }, 600)
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
    } catch (_e) { console.error('[settings] 写入 tuzhong-ai-models 失败:', _e) }
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
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
      .then(function (resp) {
        // 🔥 Bug修复：401/500 时静默清空模型列表并写坏 localStorage
        if (!resp.ok || !resp.j || !Array.isArray(resp.j.data)) {
          console.warn('[settings] 拉取模型列表失败')
          safeSetAiModelBatch([]); setModelsInitDone(true); return
        }
        const backendModels = resp.j.data as AIModelItem[]
        if (typeof resp.j.isAdmin === 'boolean') setIsAdmin(resp.j.isAdmin)
        // 修复：不过滤apiKey为***的管理员共享模型，这些模型应该显示给普通用户使用
        const filtered = backendModels.filter(function(m) {
          return m.name && m.provider && m.model
        })
        safeSetAiModelBatch(filtered)
        // 🔥 Bug修复：此前写入的是 setState 前读到的旧 _aiModelBatch[0]（首轮是 []）
        localStorage.setItem('tuzhong-ai-models', JSON.stringify(filtered))
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
      .catch(function (err) { console.error('[settings] 加载写作风格池失败:', err) })
  }, [])

  const _addModelModalOpen = useState(false)
  const addModelModalOpen = _addModelModalOpen[0]
  const setAddModelModalOpen = _addModelModalOpen[1]
  const _newModelForm = useState({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' })
  const newModelForm = _newModelForm[0]
  const setNewModelForm = _newModelForm[1]

  useEffect(function () {
    const _emptyRl = { perMinute: '', perHour: '', perDay: '' }
    if (!addModelModalOpen) {
      setNewModelForm({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' })
      setNewModelRateLimit(_emptyRl)
      setEditingModelId(null)
      setLocalModelList([])
      setLocalModelErr('')
    } else if (!editingModelId) {
      setNewModelForm({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' })
      setNewModelRateLimit(_emptyRl)
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

  // 🔥 2026-10-18：按各平台公开运营口径给出差异化参考标准（可由用户在输入框自行微调）。
  //   参考：番茄/晋江对 AI 内容审核最严；起点/纵横/七猫居中；飞卢重更新节奏较宽松；
  //   朱雀＝腾讯朱雀实验室的「朱雀AI检测助手」，输出的是 AI 生成概率（%），不是平台判定线：
  //   官方 FAQ 明示存在误报可能，且未公布合格百分比阈值。行业通行参考：网文 ≤30% 为安全线（≤25% 更稳），
  //   公众号场景至少要拿到「绿标」（<50%）。番茄/七猫等按「疑似AI生成 / 低质水文」处理，不按固定百分比硬卡。
  const _platformConfigs = useState([
    {
      key: 'tomato', name: '番茄小说', icon: '🍅', aiStandard: '< 30%', color: 'red', enabled: true,
      description: '番茄小说平台AI检测：平台用「AI鉴AI」等工具做初筛，命中后按「疑似AI生成 / 低质水文」处理（无公开百分比硬门槛）',
      criteria: [
        '真实口径：番茄未公布AI率百分比红线，命中即走「疑似AI生成/低质水文」，典型后果是停止推荐、流量下滑',
        '自检线：投稿前用朱雀自检，AI生成概率 ≤30%（≤25% 更稳），越低越安全',
        '举报项：书籍举报原因里明确含「AI水文」，被举报的作品会进人工复核',
        '人工痕迹：AI文常见特征是无意义环境/心理描写、大量短句、「不是…而是…」句式、过多破折号',
        '叙事留白：段落推进要留跳跃与闲笔，通篇衔接过紧反而被判 AI']
      ,
      compliance: '内容合规：禁止低俗、色情、暴力、政治敏感、虚假宣传内容；鼓励正能量、轻松愉快的阅读体验',
      signing: '签约评估：全勤需日更≥4000字；完读率≥35%、收藏增长稳定可申约；签约后广告分成',
      traffic: '流量推荐：新文前7天有新人扶持流量；完读率越高推荐越多；热门标签更容易获得推荐',
      revenue: '收益规则：广告分成（阅读时长）+ 签约全勤 + 打赏 + 版权运营；收益与阅读时长直接挂钩'
    },
    {
      key: 'zhuque', name: '朱雀AI', icon: '🔴', aiStandard: '< 30%', color: 'rose', enabled: true,
      description: '腾讯朱雀AI检测助手：输出「AI生成概率」百分比。官方无合格线且明示存在误报，行业通行 ≤30%；本栏数值＝平台执行标准，可自行加严（如 <5%），终检判定与生成时的改写目标都按它控',
      criteria: [
        '本栏＝执行标准：填多少，平台就按多少控朱雀AI率（终检判定、生成时的改写目标都取自这里，可以比行业线更严）',
        '概率口径：朱雀给的是 AI 生成概率，不是「是否AI」的定论，官方FAQ明示存在误报可能',
        '判定维度一（困惑度）：AI倾向使用高概率词，整段困惑度偏低，易被识别',
        '判定维度二（语义连贯）：全文从开头到尾衔接过紧、无逻辑跳跃，反而更易被判 AI；人类写作天然有跳跃',
        '判定维度三（词汇分布）：与主流大模型高频词库、句式习惯接近会加权，替换特征词最见效',
        '判定维度四（结构特征）：段段推进、无闲笔无冗余、句长整齐＝结构过完美，同样触发判定',
        '参考线：网文 AI概率 ≤30%（≤25% 更稳）；公众号场景至少要「绿标」（<50%）',
        '配套指标：除AI率外还要盯同质化指数（建议<10%）与暗限流风险（建议<15%），这两项直接伤推荐'],
      compliance: '平台口径：番茄等平台按「疑似AI生成 / 低质水文」处理，命中最常见后果是停止推荐；朱雀结论只作参考、须人工复核',
      signing: '签约评估：朱雀存在误报，签约以编辑人审与合同约定为准；建议自留AI生成痕迹（大纲/对话记录/修改稿）',
      traffic: '流量推荐：命中AI初筛的作品可能停止推荐或进观察队列，完读率与内容增量仍是推荐权重的主因',
      revenue: '收益规则：订阅分成 + 广告分成 + 版权销售；优秀作品可获得平台买断机会'
    },
    {
      key: 'qidian', name: '起点中文', icon: '📖', aiStandard: '< 35%', color: 'blue', enabled: false,
      description: '起点中文网AI检测标准：官方反AI声明明确，重点查创意雷同与量产账号',
      criteria: [
        'AI率参考：≤35%（起点未公开硬门槛，但2024起官方多轮反AI整治）',
        '设定深度：世界观/金手指须有明确限制规则，反对「无代价变强」',
        '章节体量：VIP章节均2.5-3千字，开篇30章定生死，日更≥2章',
        '逻辑密度：推进靠因果链，禁用「巧合型推进」，重人物弧光',
        '句子书面度：允许文言腔/成语密度较高，这反而是起点读者偏好']
      ,
      compliance: '内容合规：禁止涉政、涉黄、暴力血腥；题材不限但需符合法律法规；历史题材需尊重历史',
      signing: '签约评估：文笔扎实，设定新颖，节奏紧凑；收藏≥10000，推荐票≥5000可申请签约',
      traffic: '流量推荐：新书期有试水推荐；分类频道推荐；月票榜、新书榜等榜单引流',
      revenue: '收益规则：VIP订阅分成（千字3分起）+ 全勤奖 + 打赏 + 版权改编（游戏、影视、漫画）'
    },
    {
      key: 'feilu', name: '飞卢小说', icon: '⚡', aiStandard: '< 40%', color: 'yellow', enabled: false,
      description: '飞卢小说网AI检测标准：重更新与爽点密度，对AI率相对宽松',
      criteria: [
        'AI率参考：≤40%（飞卢核心卡点是节奏而非文本特征）',
        '章体量：800-1400字/章，日更≥10章者有流量扶持',
        '爽点密度：每章必须≥1个即时爽点，结尾必留钩子',
        '风格特征：短句、惊叹号、直接口播式对白反而 acceptable',
        '风险点：同人设定须避开版权方雷区，敏感IP直接锁文']
      ,
      compliance: '内容合规：允许脑洞大开的设定；禁止低俗、色情、政治敏感；强调爽点密集',
      signing: '签约评估：日更8000+字，爽点密集，节奏快；收藏≥3000即可申请签约',
      traffic: '流量推荐：热门题材（同人、综漫、无限流）推荐多；更新字数越多推荐越多',
      revenue: '收益规则：订阅分成 + 广告分成 + 打赏；同人作品收益较高但版权受限'
    },
    {
      key: 'qimao', name: '七猫小说', icon: '🐱', aiStandard: '< 35%', color: 'orange', enabled: false,
      description: '七猫小说平台AI检测标准：免费阅读大盘，重点看完读率与留存',
      criteria: [
        'AI率参考：≤35%（七猫未公开明确门槛，以完读率为核心杠杆）',
        '完读优先：整体节奏必须「无废段」，每章结尾留钩子',
        '人设直给：人物标签化（毒舌/腹黑/忠犬）比复杂内心戏更有效',
        '章节体量：1200-2000字/章，日更≥2章',
        'AI特征规避：减少深修辞，多用直白短句——大盘读者讨厌拗口']
      ,
      compliance: '内容合规：禁止低俗色情、暴力血腥、政治敏感；主打免费阅读，内容需适合大众',
      signing: '签约评估：完读率≥40%，日更≥3000字；内容有趣味性和吸引力',
      traffic: '流量推荐：免费阅读模式，靠广告盈利；推荐位与完读率和留存率挂钩',
      revenue: '收益规则：广告分成 + 全勤奖 + 版权运营；免费阅读平台，收益与广告展示量相关'
    },
    {
      key: 'jinjiang', name: '晋江文学', icon: '🌸', aiStandard: '< 20%', color: 'pink', enabled: false,
      description: '晋江文学城AI检测标准：全平台最严格，明确公示反AI立场',
      criteria: [
        'AI率红线：≤20%（晋江2024公告明确禁止「AI合成文学」，审核最严）',
        '情感质感：细腻私语感、内心独白密度高——AI的「均质抒情」极易识别',
        '逐段自查：描写不能全是形容词堆叠，需具体动作/感官细节支撑',
        '章节体量：3000-5000字/章，日更≥3千字',
        '签约灵审：签约编辑会抽查「改稿痕迹」——保持个人文风格一致性']
      ,
      compliance: '内容合规：主打言情、耽美；禁止低俗色情；强调情感描写细腻；禁止抄袭',
      signing: '签约评估：文案精美，人设鲜明，情感线清晰；收藏≥3000可申请签约',
      traffic: '流量推荐：金榜、新晋榜、分类榜；话题热度影响推荐；读者互动率重要',
      revenue: '收益规则：VIP订阅分成 + 定制印刷 + 影视改编；言情题材收益较高'
    },
    {
      key: 'zongheng', name: '纵横中文', icon: '🌊', aiStandard: '< 35%', color: 'cyan', enabled: false,
      description: '纵横中文网AI检测标准：男频向，重长线存稿与设定完整性',
      criteria: [
        'AI率参考：≤35%（纵横未公开硬门槛，以签约编辑人审为主）',
        '体裁偏好：历史/玄幻/都市长篇，动辄百万字，看重大纲与存稿能力',
        '章节体量：2500-3500字/章，上架后日更≥6千字',
        '文字密度：可接受较高描写密度，但禁「分隔符式水文」',
        'AI特征规避：AI式的「每章结构雷同」是编辑人审重点']
      ,
      compliance: '内容合规：禁止涉政、涉黄、暴力；题材不限，鼓励创新；禁止抄袭',
      signing: '签约评估：字数≥50万字，节奏稳定，设定完整；收藏≥5000可申请签约',
      traffic: '流量推荐：新书推荐、分类推荐、榜单推荐；全勤更新更稳定获得推荐',
      revenue: '收益规则：订阅分成 + 全勤奖 + 版权运营；买断制为主，保底收入稳定'
    },
    {
      key: 'yuedong', name: '阅动文化', icon: '📚', aiStandard: '< 30%', color: 'green', enabled: false,
      description: '阅动文化平台AI检测标准：精品IP导向，重剧本化改编潜力',
      criteria: [
        'AI率参考：≤30%（阅动重IP孵化，文本需具备改编脚本雏形）',
        '场景可拍性：描写具体到空间/时序，避免抽象抒情——适配短剧/影视改编',
        '章节体量：2000-3000字/章，日更≥4千字',
        '人物弧光：主角每卷须有明确成长/反转变锚点',
        '风险点：题材须为可过审剧集方向，涉黑/涉鬼怪需提前规避']
      ,
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
    } catch (e) { console.error('[settings] 加载平台配置（prefs.platformConfigs）失败:', e) }

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
        } catch (_e) { console.error('[settings] 读取 tuzhong-preferences 平台配置失败:', _e) }
      }
      if (platformSource && Array.isArray(platformSource) && platformSource.length > 0) {
        const defaultCfg = _platformConfigs[0]
        const byKey: Record<string, typeof platformConfigs[number]> = {}
        platformSource.forEach(function (p) { if (p && p.key) byKey[p.key] = p })
        const merged = defaultCfg.map(function (def) {
          const s = byKey[def.key]
          if (!s) return def
          // 🔥 2026-10-20：用户只改「AI检测标准/是否启用」；平台说明文案一律以代码内置的真实口径为准
          //   （朱雀真实判定维度、番茄真实处理方式等），避免旧文案长期挂着误导用户。
          const out: Record<string, unknown> = Object.assign({}, s, def)
          out.aiStandard = (typeof s.aiStandard === 'string' && s.aiStandard.trim()) ? s.aiStandard : def.aiStandard
          out.enabled = typeof s.enabled === 'boolean' ? s.enabled : def.enabled
          out.name = (typeof s.name === 'string' && s.name) ? s.name : def.name
          return out as typeof platformConfigs[number]
        })
        // 额外添加用户新增过但默认没有的平台
        Object.keys(byKey).forEach(function (k) {
          if (!merged.find(function (m) { return m.key === k })) merged.push(byKey[k])
        })
        setPlatformConfigs(merged)
      }
    } catch (e) { console.error('[settings] 合并平台配置失败:', e) }
  }, [])

  // 🔥 2026-10-20：账号级偏好读取——服务端更新则覆盖本机；本机更新则回传服务端
  useEffect(function () {
    let cancelled = false
    ;(async function () {
      const res = await fetchServerPreferences()
      if (cancelled) return
      // 🔥 2026-10-26：朱雀 Key 用户自填模式——优先显示本浏览器留存 Key 的掩码；本机没有再看账号偏好
      const localZhuqueKey = getLocalZhuqueApiKey()
      if (localZhuqueKey) {
        setZhuqueKeyHint('****' + localZhuqueKey.slice(-4))
      } else if (res && res.hasZhuqueApiKey) {
        setZhuqueKeyHint(String((res.data && res.data.zhuqueApiKey) || ''))
      }
      if (res && res.data) {
        const localTs = getLocalPrefsUpdatedAt()
        if (res.updatedAt >= localTs) {
          const d = res.data as Record<string, any>
          if (d.writingStyle) setPickedStyle(String(d.writingStyle))
          if (d.continuationLength) setPickedLength(String(d.continuationLength))
          if (d.customLength != null && Number(d.customLength) > 0) setCustomLenInput(String(d.customLength))
          if (d.autoSaveInterval != null) setPickedInterval(String(d.autoSaveInterval))
          if (typeof d.tomatoReminder === 'boolean') setTomatoCheckFlag(d.tomatoReminder)
          if (typeof d.zhuqueReminder === 'boolean') setZhuqueCheckFlag(d.zhuqueReminder)
          if (d.shuangDensityMode) setShuangDensityMode(String(d.shuangDensityMode))
          if (d.faceSlapStyle) setFaceSlapStyle(String(d.faceSlapStyle))
          if (d.rhythmIntensity) setRhythmIntensity(String(d.rhythmIntensity))
          if (d.targetPlatform) setTargetPlatform(String(d.targetPlatform))
          if (d.mcPersonality) setMcPersonality(String(d.mcPersonality))
          if (Array.isArray(d.platformConfigs) && d.platformConfigs.length > 0) {
            const defaultCfg = _platformConfigs[0]
            const byKey: Record<string, typeof platformConfigs[number]> = {}
            d.platformConfigs.forEach(function (p: any) { if (p && p.key) byKey[p.key] = p })
            const merged = defaultCfg.map(function (def) {
              const s = byKey[def.key]
              if (!s) return def
              const out: Record<string, unknown> = Object.assign({}, s, def)
              out.aiStandard = (typeof s.aiStandard === 'string' && s.aiStandard.trim()) ? s.aiStandard : def.aiStandard
              out.enabled = typeof s.enabled === 'boolean' ? s.enabled : def.enabled
              out.name = (typeof s.name === 'string' && s.name) ? s.name : def.name
              return out as typeof platformConfigs[number]
            })
            Object.keys(byKey).forEach(function (k) {
              if (!merged.find(function (m) { return m.key === k })) merged.push(byKey[k])
            })
            setPlatformConfigs(merged)
          }
          applyPreferencesToLocalStorage(res.data, res.updatedAt)
        } else {
          try {
            const raw = localStorage.getItem('tuzhong-preferences')
            if (raw) await pushServerPreferences(JSON.parse(raw))
          } catch (_e) { /* 本机数据异常时忽略，等下一次保存 */ }
        }
      } else {
        // 服务端还没有偏好（老用户迁移）：把本机现有偏好上传一次
        try {
          const raw = localStorage.getItem('tuzhong-preferences')
          if (raw) await pushServerPreferences(JSON.parse(raw))
        } catch (_e) { /* ignore */ }
      }
      if (!cancelled) setPrefsReady(true)
    })()
    return function () { cancelled = true }
  }, [])

  // 🔥 写作偏好自动持久化：任何偏好变化自动保存到 localStorage + 服务端
  //    注意：账号级数据未读取完成前不写入，避免用初始默认值覆盖已保存的 1% 标准/风格
  useEffect(function () {
    if (!prefsReady) return
    try {
      const prefs = {
        writingStyle: pickedStyle, continuationLength: pickedLength,
        customLength: pickedLength === 'custom' ? parseInt(customLenInput) || 500 : null,
        autoSaveInterval: pickedInterval, tomatoReminder: tomatoCheckFlag, zhuqueReminder: zhuqueCheckFlag,
        platformConfigs: platformConfigs,
        shuangDensityMode: shuangDensityMode, faceSlapStyle: faceSlapStyle,
        rhythmIntensity: rhythmIntensity, targetPlatform: targetPlatform, mcPersonality: mcPersonality,
        _updatedAt: Date.now(),
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
        || writingStylePool.find(function (s) { return s.id === pickedStyle })
      if (selectedStyle) {
        localStorage.setItem('tuzhong-active-style', pickedStyle)
        localStorage.setItem('tuzhong-active-style-data', JSON.stringify(selectedStyle))
      }
      let lenValue = 1000
      if (pickedLength === 'short') lenValue = 500
      else if (pickedLength === 'long') lenValue = 2000
      else if (pickedLength === 'custom') lenValue = parseInt(customLenInput) || 500
      localStorage.setItem('tuzhong-continue-length', String(lenValue))
      persistPrefsSoon(prefs)
    } catch (_e) { console.error('[settings] 保存写作偏好失败:', _e) }
  }, [pickedStyle, pickedLength, customLenInput, pickedInterval, tomatoCheckFlag, zhuqueCheckFlag, platformConfigs, shuangDensityMode, faceSlapStyle, rhythmIntensity, targetPlatform, mcPersonality, prefsReady])

  const _styleCategory = useState('全部')
  const styleCategory = _styleCategory[0]
  const setStyleCategory = _styleCategory[1]

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
  const _sfKeyInputs = useState<string[]>([''])
  const sfKeyInputs = _sfKeyInputs[0]
  const setSfKeyInputs = _sfKeyInputs[1]
  const _sfModalOpen = useState(false)
  const sfModalOpen = _sfModalOpen[0]
  const setSfModalOpen = _sfModalOpen[1]
  // 🔥 #212（2026-09-10）模型实时健康检测：key=provider::model，值={cls,reason,latencyMs,ok}
  const _modelHealth = useState<Record<string, { cls: string, reason: string, latencyMs: number, ok: boolean }>>({})
  const modelHealth = _modelHealth[0]
  const setModelHealth = _modelHealth[1]
  const _healthChecking = useState(false)
  const healthChecking = _healthChecking[0]
  const setHealthChecking = _healthChecking[1]
  const _healthSummary = useState('')
  const healthSummary = _healthSummary[0]
  const setHealthSummary = _healthSummary[1]
  const _healthAutoDone = useState(false)
  const healthAutoDone = _healthAutoDone[0]
  const setHealthAutoDone = _healthAutoDone[1]
  // 🔥 #212b 推荐替代模型（后端探活通过的免费候选）
  const _healthRecs = useState<Array<{ provider: string, model: string, name: string, cls: string, latencyMs: number, reason: string }>>([])
  const healthRecs = _healthRecs[0]
  const setHealthRecs = _healthRecs[1]
  const _sfImportFlag = useState(false)
  const sfImportFlag = _sfImportFlag[0]
  const setSfImportFlag = _sfImportFlag[1]

  // 智谱 BigModel 一键导入状态
  const _zhipuApiKeyInput = useState('')
  const zhipuApiKeyInput = _zhipuApiKeyInput[0]
  const setZhipuApiKeyInput = _zhipuApiKeyInput[1]
  const _zhipuKeyInputs = useState<string[]>([''])
  const zhipuKeyInputs = _zhipuKeyInputs[0]
  const setZhipuKeyInputs = _zhipuKeyInputs[1]
  const _zhipuModalOpen = useState(false)
  const zhipuModalOpen = _zhipuModalOpen[0]
  const setZhipuModalOpen = _zhipuModalOpen[1]
  const _zhipuImportFlag = useState(false)
  const zhipuImportFlag = _zhipuImportFlag[0]
  const setZhipuImportFlag = _zhipuImportFlag[1]

  // 2026-08-12：OpenRouter / Groq / 腾讯混元 通用导入状态（共用一套弹窗与导入逻辑）
  const _platformApiKeyInput = useState('')
  const platformApiKeyInput = _platformApiKeyInput[0]
  const _platformRateLimit = useState({ perMinute: '', perHour: '', perDay: '' })
  const platformRateLimit = _platformRateLimit[0]
  const setPlatformRateLimit = _platformRateLimit[1]
  // 🔥 2026-09-24：单个模型「添加/编辑」弹窗的调用频率限制（字符串输入，保存时由 buildRateLimit 解析）
  const _newModelRateLimit = useState({ perMinute: '', perHour: '', perDay: '' })
  const newModelRateLimit = _newModelRateLimit[0]
  const setNewModelRateLimit = _newModelRateLimit[1]
  // 🔥 2026-09-24：导入弹窗「按模型勾选」状态（免费默认全选、收费默认不选；用户可自行勾选要导入哪些）
  const _platformSelectedPresets = useState<Record<string, boolean>>({})
  const platformSelectedPresets = _platformSelectedPresets[0]
  const setPlatformSelectedPresets = _platformSelectedPresets[1]
  const _sfSelectedPresets = useState<Record<string, boolean>>({})
  const sfSelectedPresets = _sfSelectedPresets[0]
  const setSfSelectedPresets = _sfSelectedPresets[1]
  const _zpSelectedPresets = useState<Record<string, boolean>>({})
  const zpSelectedPresets = _zpSelectedPresets[0]
  const setZpSelectedPresets = _zpSelectedPresets[1]
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
    } catch (_e) { console.error('[settings] 读取省钱模式开关失败:', _e) }
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
  // 🔥 #212（2026-09-10）实时健康检测：探活全部已配置模型，卡片挂健康徽章；已下架可一键停用
  function execHealthCheck() {
    if (healthChecking) return
    setHealthChecking(true)
    const hdrs = getAuthHeaders()
    fetch('/tuzhong-wenshu/api/settings/models/health', {
      method: 'POST',
      headers: Object.assign({}, { 'Content-Type': 'application/json' }, hdrs),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j } }) })
      .then(function (resp) {
        const data = resp.j && resp.j.data
        const list = (data && data.results) || []
        // 🔥 Bug修复：401/500 时 results 被静默清空而 summary 不变，UI 瞬间与数据不一致
        if (!resp.ok || !data) {
          setHealthSummary('检测失败（HTTP ' + resp.status + '），请重新登录后重试')
          return
        }
        const map: Record<string, { cls: string, reason: string, latencyMs: number, ok: boolean }> = {}
        for (let i = 0; i < list.length; i++) {
          const it = list[i]
          map[String(it.provider) + '::' + String(it.model)] = { cls: it.cls, reason: it.reason, latencyMs: it.latencyMs, ok: it.ok }
        }
        setModelHealth(map)
        setHealthRecs((data && data.recommendations) || [])
        const s = data && data.summary
        if (s) {
          setHealthSummary('共' + s.total + '款：可用 ' + s.ok + (s.dead ? '，已下架 ' + s.dead : '') + (s.keybad ? '，Key失效 ' + s.keybad : '') + (s.limited ? '，限流 ' + s.limited : '') + (s.other ? '，异常 ' + s.other : ''))
        }
      })
      .catch(function (err) {
        setHealthSummary('健康检测失败: ' + (err && err.message || '网络错误'))
      })
      .finally(function () { setHealthChecking(false) })
  }

  // 管理员进入设置页自动检测一次（服务端 60s 缓存，不重复打爆上游）
  useEffect(function () {
    if (isAdmin && !healthAutoDone) {
      setHealthAutoDone(true)
      execHealthCheck()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  // 一键停用已下架模型（404 实锤下架才停用；Key失效/限流不停用，等 key 充值或限流窗口过去）
  function execDisableDeadModels() {
    const deadKeys: string[] = []
    Object.keys(modelHealth).forEach(function (k) { if (modelHealth[k].cls === 'dead') deadKeys.push(k) })
    if (deadKeys.length === 0) return
    const updatedBatch = aiModelBatch.map(function (m) {
      const k = String(m.provider) + '::' + String(m.model)
      if (deadKeys.indexOf(k) !== -1 && m.status !== 'default') {
        const copy = {} as AIModelItem
        const keys = Object.keys(m) as (keyof AIModelItem)[]
        for (let i = 0; i < keys.length; i++) { (copy as unknown as Record<string, unknown>)[keys[i]] = (m as unknown as Record<string, unknown>)[keys[i]] }
        copy.status = 'inactive'
        return copy
      }
      return m
    })
    const nb = safeSetAiModelBatch(updatedBatch, true)
    syncModelsToBackend(nb)
    setTimeout(function () { alert('已停用 ' + deadKeys.length + ' 个已下架模型（可随时手动重新启用）') }, 50)
  }

  // 🔥 #212b 一键添加推荐替代模型（复用该平台已配置条目的 Key/BaseURL，探活 ok 才被推荐）
  function execAddRecommendedModel(rec: { provider: string, model: string, name: string, cls: string }) {
    if (rec.cls !== 'ok' && rec.cls !== 'limited') return
    const _k = String(rec.provider) + '::' + String(rec.model)
    if (aiModelBatch.some(function (m) { return String(m.provider) + '::' + String(m.model) === _k })) {
      setTimeout(function () { alert('该模型已存在，无需重复添加') }, 50)
      return
    }
    const src = aiModelBatch.find(function (m) { return m.provider === rec.provider && m.apiKey })
    if (!src) {
      setTimeout(function () { alert('该平台暂无已配置 Key 的模型，请先在对应平台卡片导入 API Key') }, 50)
      return
    }
    const add: AIModelItem = {
      id: 'rec-' + Date.now(), name: rec.name.split('（')[0] || rec.model, provider: rec.provider,
      apiKey: src.apiKey, baseUrl: src.baseUrl, model: rec.model,
      status: 'active', usageTag: '备用正文', isAdminDefault: true,
    }
    const nb = safeSetAiModelBatch(aiModelBatch.concat([add]), true)
    syncModelsToBackend(nb)
    setHealthRecs(healthRecs.filter(function (r) { return !(r.provider === rec.provider && r.model === rec.model) }))
    setTimeout(function () { alert('已添加替代模型：' + add.name + '（' + rec.provider + ' / ' + rec.model + '）') }, 50)
  }

  function syncModelsToBackend(modelBatch: AIModelItem[], opts?: { mode?: 'migrate' | 'full' }) {
    // 🔥 修复（P1 覆盖/误删）：此前「进入设置页」就会用本机 localStorage 覆盖服务端配置，
    //   并对「后端有、本地没有」的模型发 DELETE —— 换设备或清过缓存的用户只是打开设置页，
    //   就可能删掉另一台机器配好的模型。现拆两档：migrate 只补齐缺失项，full 才全量同步。
    const mode = opts && opts.mode === 'full' ? 'full' : 'migrate'
    const hdrs = getAuthHeaders()
    fetch('/tuzhong-wenshu/api/settings/models', { headers: hdrs })
      .then(function (r) { return r.json() })
      .then(function (resp) {
        const backendModels = (resp.data || []) as AIModelItem[]
        const backendIds = new Set(backendModels.map(function (m) { return m.id }))
        const localIds = new Set(modelBatch.map(function (m) { return m.id }))

        // 修复：跳过apiKey为***的管理员共享模型，不回写到后端（防止把***覆盖真实key）
        const upsertPromises = modelBatch.filter(function (m) {
          if (!(m.apiKey && !String(m.apiKey).includes('*'))) return false
          // migrate 模式只创建后端没有的条目，不用本机旧值覆盖服务端已有配置
          return mode === 'full' ? true : !backendIds.has(m.id)
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
            rateLimit: m.rateLimit || undefined,
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
        if (mode === 'full') backendModels.forEach(function (bm) {
          if (!localIds.has(bm.id) && !bm.isAdminDefault) {
            fetch('/tuzhong-wenshu/api/settings/models?id=' + encodeURIComponent(bm.id), {
              method: 'DELETE',
              headers: hdrs,
            })
              .catch(function (err) { console.error('[settings] 删除模型配置失败:', err) })
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
    const _rl = buildRateLimit(newModelRateLimit.perMinute, newModelRateLimit.perHour, newModelRateLimit.perDay)
    const modelItem: AIModelItem = {
      id: String(Date.now()), provider: newModelForm.provider, name: newModelForm.name,
      status: aiModelBatch.length === 0 ? 'default' : 'active',
      apiKey: newModelForm.apiKey,
      baseUrl: newModelForm.baseUrl || preset?.baseUrl || '',
      model: newModelForm.model || preset?.defaultModel || '',
      presetModels: preset?.models || [],
      rateLimit: _rl,
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
    setSfSelectedPresets(initPresetSelection(siliconflowPresetPool()))
    setSfModalOpen(true)
  }

  function execImportSiliconflow() {
    if (!siliconflowApiKeyInput.trim()) return
    setSfImportFlag(true)
    try {
      const preset = providerPresetMap['硅基流动']
      // 🔥 2026-09-24：只导入用户勾选的模型（免费默认全选、DeepSeek-V4-Flash 按量计费默认不勾）
      const allPresets = siliconflowPresetPool()
      const targetPresets = allPresets.filter(function (p) { return sfSelectedPresets[p.id] === true })
      if (targetPresets.length === 0) {
        alert('请至少勾选一个要导入的模型')
        return
      }

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
        if (existingKeys2[_k2]) {
          // 🔥 2026-11-05 修复：已存在但 status=inactive → 升级为 active；同时同步用户本次输入的 Key
          for (let _pi = 0; _pi < aiModelBatch.length; _pi++) {
            const _m = aiModelBatch[_pi]
            if (String(_m.provider || '').trim() === '硅基流动' && String(_m.model || '').trim() === String(p.model).trim()) {
              let _changed = false
              if (_m.status === 'inactive') { _m.status = 'active'; _changed = true }
              if (siliconflowApiKeyInput.trim() && String(_m.apiKey || '').trim() !== siliconflowApiKeyInput.trim()) { _m.apiKey = siliconflowApiKeyInput; _changed = true }
              break
            }
          }
          skippedNames2.push(p.name); continue
        }
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
        setTimeout(function () { alert('成功导入硅基流动 ' + newModels.length + ' 套模型（共勾选 ' + targetPresets.length + ' 套）') }, 50)
      }
    } catch (_e) {
      alert('硅基流动导入失败：' + (_e instanceof Error ? _e.message : '未知错误'))
    } finally {
      setSfImportFlag(false)
    }
  }

  function execImportZhipuPresets() {
    setZpSelectedPresets(initPresetSelection(zhipuPresetPool))
    setZhipuModalOpen(true)
  }

  function execImportZhipu() {
    if (!zhipuApiKeyInput.trim()) return
    setZhipuImportFlag(true)
    try {
      const preset = providerPresetMap['智谱GLM']
      // 🔥 2026-09-24：只导入用户勾选的模型
      const targetPresets = zhipuPresetPool.filter(function (p) { return zpSelectedPresets[p.id] === true })
      if (targetPresets.length === 0) {
        alert('请至少勾选一个要导入的模型')
        return
      }

      const existingKeys: Record<string, boolean> = {}
      for (let i = 0; i < aiModelBatch.length; i++) {
        const _m = aiModelBatch[i]
        existingKeys[String(_m.provider || '').trim() + '::' + String(_m.model || '').trim()] = true
      }

      const newModels: AIModelItem[] = []
      const skippedNames: string[] = []
      const _patchedIdx: number[] = []
      for (let t = 0; t < targetPresets.length; t++) {
        const p = targetPresets[t]
        const _k = '智谱GLM::' + String(p.model).trim()
        if (existingKeys[_k]) {
          // 🔥 2026-11-05 修复：已存在但 status=inactive → 升级为 active；同时同步用户本次输入的 Key
          for (let _pi = 0; _pi < aiModelBatch.length; _pi++) {
            const _m = aiModelBatch[_pi]
            if (String(_m.provider || '').trim() === '智谱GLM' && String(_m.model || '').trim() === String(p.model).trim()) {
              let _changed = false
              if (_m.status === 'inactive') { _m.status = 'active'; _changed = true }
              if (zhipuApiKeyInput.trim() && String(_m.apiKey || '').trim() !== zhipuApiKeyInput.trim()) { _m.apiKey = zhipuApiKeyInput; _changed = true }
              if (_changed) _patchedIdx.push(_pi)
              break
            }
          }
          skippedNames.push(p.name); continue
        }
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

      // 🔥 patched 项（status 升级/Key 同步）已在 aiModelBatch 原对象上修改，concat 后一并保存
      const allModels = safeSetAiModelBatch(aiModelBatch.concat(newModels), true)
      localStorage.setItem('tuzhong-zhipu-api-key', zhipuApiKeyInput)
      setZhipuModalOpen(false)
      setZhipuApiKeyInput('')
      syncModelsToBackend(allModels)
      if (skippedNames.length > 0) {
        setTimeout(function () { alert('以下智谱模型已存在：' + skippedNames.join('、') + (_patchedIdx.length ? '\n\n其中 ' + _patchedIdx.length + ' 套已从「未启用」升级为「已启用」并同步了本次输入的 Key' : '') + (newModels.length ? '\n\n成功新增：' + newModels.map(function(n){return n.name}).join('、') : '')) }, 50)
      } else if (newModels.length) {
        setTimeout(function () { alert('成功导入智谱 ' + newModels.length + ' 套模型（共勾选 ' + targetPresets.length + ' 套）') }, 50)
      } else {
        setTimeout(function () { alert('智谱 ' + targetPresets.length + ' 套模型均已存在，未做任何更改') }, 50)
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
      const pool = platformPoolFor(targetProvider)
      // 🔥 2026-09-24：只导入用户勾选的模型（免费默认全选、收费默认不选）
      const selectedPool = pool.filter(function (p) { return platformSelectedPresets[p.id] === true })
      if (selectedPool.length === 0) {
        alert('请至少勾选一个要导入的模型')
        return
      }
      const targetModels = selectedPool.map(function (p) { return String(p.model).trim() })
      const rl = buildRateLimit(platformRateLimit.perMinute, platformRateLimit.perHour, platformRateLimit.perDay)

      const existingSet: Record<string, boolean> = {}
      const updatedBatch = aiModelBatch.map(function (m) {
        const mp = String(m.provider || '').trim()
        const mm = String(m.model || '').trim()
        if (mp === targetProvider && targetModels.indexOf(mm) !== -1) {
          existingSet[mp + '::' + mm] = true
          return Object.assign({}, m, {
            apiKey: platformApiKeyInput,
            baseUrl: m.baseUrl || preset?.baseUrl || '',
            rateLimit: rl,
          })
        }
        return m
      })

      const missing = selectedPool.filter(function (p) { return !existingSet[targetProvider + '::' + String(p.model).trim()] })
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
          rateLimit: rl,
        }
      })

      const allModels = safeSetAiModelBatch(updatedBatch.concat(newModels), true)
      localStorage.setItem('tuzhong-' + targetProvider + '-api-key', platformApiKeyInput)
      setPlatformModalOpen(false)
      setPlatformApiKeyInput('')
      setPlatformRateLimit({ perMinute: '', perHour: '', perDay: '' })
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

  // 🔥 2026-09-21：勾选即生效 —— 切换预设模型的启用/停用（复用既有导入弹窗补齐 Key）
  function getProviderApiKey(provider: string): string {
    const target = String(provider || '').trim()
    const found = aiModelBatch.find(function (m) {
      return String(m.provider || '').trim() === target && m.apiKey && !String(m.apiKey).includes('*')
    })
    return found ? String(found.apiKey) : ''
  }

  // 🔥 2026-10-20：平台状态以“实际可用的模型”为准。
  //   服务端返回的 Key 是掩码（sk-****），旧逻辑只认明文 Key，导致已启用免费模型的平台全显示“未配置”。
  function isProviderConfigured(provider: string): boolean {
    if (getProviderApiKey(provider).trim().length > 0) return true
    const norm = function (s: string) { return String(s || '').replace(/\s*\([^)]*\)\s*/g, '').trim().toLowerCase() }
    const target = norm(provider)
    if (!target) return false
    return aiModelBatch.some(function (m) {
      const st = String(m.status || '').toLowerCase()
      if (st !== 'active' && st !== 'default') return false
      const p = norm(m.provider)
      return !!p && (p === target || p.indexOf(target) >= 0 || target.indexOf(p) >= 0)
    })
  }

  // 🔥 2026-09-24：打开第三方平台导入弹窗（平台入口按钮 / 勾选未配置 Key 的预设卡共用）
  // 初始化勾选状态（免费默认全选、收费默认不选）+ 预填该平台已有 Key（若有）
  function openPlatformImport(provider: string) {
    setPlatformSelectedPresets(initPresetSelection(platformPoolFor(provider)))
    setPlatformRateLimit({ perMinute: '', perHour: '', perDay: '' })
    setPlatformApiKeyInput(getProviderApiKey(provider) || '')
    setPlatformImportTarget(provider)
    setPlatformModalOpen(true)
  }

  // 🔥 2026-09-24：导入弹窗内「免费 / 收费」分组勾选列表（所有平台导入弹窗共用渲染器）
  function renderImportGroup(items: ModelPresetItem[], isPaid: boolean, selected: Record<string, boolean>, setSelected: (s: Record<string, boolean>) => void) {
    if (!items || items.length === 0) return null
    const allChecked = items.every(function (p) { return selected[p.id] === true })
    return (
      <div className="mb-3 last:mb-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className={'text-xs font-bold ' + (isPaid ? 'text-amber-800' : 'text-green-800')}>
            {isPaid ? '💰 收费模型（按量计费，谨慎勾选）' : '🆓 免费模型（永久免费）'}
          </span>
          <label className="flex items-center gap-1 cursor-pointer text-[10px] text-gray-500 select-none">
            <input type="checkbox" checked={allChecked} onChange={function (e) { const s = Object.assign({}, selected); items.forEach(function (p) { s[p.id] = e.target.checked }); setSelected(s) }} className="w-3 h-3 rounded border-gray-300 text-blue-600 cursor-pointer" />
            本组全选
          </label>
        </div>
        <div className={'rounded-lg border p-2 space-y-1 max-h-44 overflow-y-auto ' + (isPaid ? 'border-amber-200 bg-amber-50/60' : 'border-green-200 bg-green-50/60')}>
          {items.map(function (p) {
            const checked = selected[p.id] === true
            return (
              <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-0.5 hover:bg-white/70">
                <input type="checkbox" checked={checked} onChange={function (e) { const s = Object.assign({}, selected); s[p.id] = e.target.checked; setSelected(s) }} className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer shrink-0" />
                <span className="shrink-0">{p.icon}</span>
                <span className={'font-medium shrink-0 ' + (isPaid ? 'text-amber-800' : 'text-green-800')}>{p.name}</span>
                <span className="text-gray-400 shrink-0">—</span>
                <span className="font-mono text-xs text-gray-500 truncate" title={p.model}>{p.model}</span>
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  function togglePreset(preset: ModelPresetItem, enable: boolean) {
    const provider = String(preset.provider || '').trim()
    const model = String(preset.model || '').trim()
    const key = getProviderApiKey(provider)
    if (enable && !key) {
      // 该平台尚未配置 API Key：打开对应导入弹窗引导用户先填 Key
      if (provider === '硅基流动') { execImportSiliconflowPresets(); return }
      if (provider === '智谱GLM') { execImportZhipuPresets(); return }
      openPlatformImport(provider); return
    }
    const updated: AIModelItem[] = aiModelBatch.map(function (m) {
      const copy: AIModelItem = {} as AIModelItem
      const keys = Object.keys(m) as (keyof AIModelItem)[]
      for (let i = 0; i < keys.length; i++) { (copy as unknown as Record<string, unknown>)[keys[i]] = (m as unknown as Record<string, unknown>)[keys[i]] }
      return copy
    })
    const existingIdx = updated.findIndex(function (m) {
      return String(m.provider || '').trim() === provider && String(m.model || '').trim() === model
    })
    if (enable) {
      if (existingIdx >= 0) {
        if (updated[existingIdx].status === 'inactive') updated[existingIdx].status = 'active'
      } else {
        const presetEntry = providerPresetMap[provider]
        updated.push({
          id: 'preset-' + provider + '-' + Date.now(), name: preset.name, provider: provider,
          apiKey: key, baseUrl: presetEntry ? presetEntry.baseUrl : '', model: model, presetModels: [],
          status: 'active', temperature: preset.temperature, topP: preset.topP,
          contextWindow: preset.contextWindow, maxTokens: preset.maxTokens,
          presencePenalty: preset.presencePenalty, frequencyPenalty: preset.frequencyPenalty,
          usageTag: preset.usageTag, isAdminDefault: true,
        })
      }
    } else {
      if (existingIdx >= 0) updated[existingIdx].status = 'inactive'
    }
    // 保证至少有一个 default（若被停用，则把首个 active 设为 default）
    const hasDefault = updated.some(function (m) { return m.status === 'default' })
    const hasActive = updated.some(function (m) { return m.status === 'active' || m.status === 'default' })
    if (!hasDefault && hasActive) {
      const firstActive = updated.find(function (m) { return m.status === 'active' })
      if (firstActive) firstActive.status = 'default'
    }
    const saved = safeSetAiModelBatch(updated, true)
    const def = saved.find(function (m) { return m.status === 'default' }) || saved.find(function (m) { return m.status === 'active' })
    if (def) {
      localStorage.setItem('tuzhong-llm-config', JSON.stringify({
        provider: String(def.provider || '').replace(/\s*\([^)]*\)\s*/g, '').trim(),
        apiKey: def.apiKey, baseUrl: String(def.baseUrl || '').replace(/[`'"]/g, '').trim(),
        model: def.model, modelId: def.id,
      }))
    }
    syncModelsToBackend(saved)
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
    setNewModelRateLimit({
      perMinute: m.rateLimit && m.rateLimit.perMinute != null ? String(m.rateLimit.perMinute) : '',
      perHour: m.rateLimit && m.rateLimit.perHour != null ? String(m.rateLimit.perHour) : '',
      perDay: m.rateLimit && m.rateLimit.perDay != null ? String(m.rateLimit.perDay) : '',
    })
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
      copy.rateLimit = buildRateLimit(newModelRateLimit.perMinute, newModelRateLimit.perHour, newModelRateLimit.perDay)
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
      _updatedAt: Date.now(),
    }
    localStorage.setItem('tuzhong-preferences', JSON.stringify(prefs))
    // 🔥 2026-10-20：同步到账号级存储，换浏览器/设备登录后仍是这套偏好
    if (prefsSaveTimer.current) clearTimeout(prefsSaveTimer.current)
    pushServerPreferences(prefs)

    // 🔥 平台AI检测配置 - 独立 key 持久化（避免与其他字段混写导致修改丢失）
    try {
      localStorage.setItem('tuzhong-platform-configs', JSON.stringify(platformConfigs))
    } catch (_e) { console.error('[settings] 保存 tuzhong-platform-configs 失败:', _e) }

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
    const hdrs = getAuthHeaders()
    const p1 = fetch('/tuzhong-wenshu/api/novels', { headers: hdrs }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
    const p2 = fetch('/tuzhong-wenshu/api/characters', { headers: hdrs }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
    Promise.all([p1, p2]).then(function (results) {
      // 🔥 Bug修复：此前 401/失败时也导出一个空 novels:[] 的“成功”备份
      if (!results[0].ok || !results[1].ok || !results[1].ok) {
        alert('导出失败：服务端返回异常，请重新登录后重试')
        return
      }
      const novelData = (results[0].j.data || results[0].j.novels || [])
      const charData = (results[1].j.data || results[1].j.characters || [])
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
    }).catch(function (err) { console.error('[settings] 导出作品数据失败:', err) }).finally(function () { setExportProcessFlag(false) })
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
{/* 🔥 2026-09-24：平台一键导入入口 —— 所有平台常驻可见入口，点击打开对应导入弹窗（免费/收费分组勾选） */}
            {isAdmin && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden border-t-4 border-t-blue-500">
                <div className="flex items-center gap-2 p-6 pb-4">
                  <span className="text-2xl">🔌</span>
                  <h2 className="text-base font-bold text-gray-900">平台一键导入入口</h2>
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium">点击打开导入弹窗 · 免费/收费可分别勾选</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 px-6 pb-6">
                  {[
                    { name: '硅基流动', icon: providerIconMap['硅基流动'], action: execImportSiliconflowPresets },
                    { name: '智谱GLM', icon: providerIconMap['智谱GLM'], action: execImportZhipuPresets },
                  ].map(function (plat) {
                    const colors = providerColorMap[plat.name] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
                    const IconComp = plat.icon || Cpu
                    const configured = isProviderConfigured(plat.name)
                    return (
                      <button key={plat.name} onClick={plat.action}
                        className={'flex items-center justify-center gap-2 px-3 py-3 rounded-xl border ' + colors.bg + ' ' + colors.border + ' ' + colors.text + ' hover:shadow-md transition-all text-sm font-medium'}>
                        <IconComp className="w-4 h-4" />
                        <span>{plat.name}</span>
                        <span className={'ml-auto text-[10px] px-1.5 py-0.5 rounded-full ' + (configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>{configured ? '已配置' : '未配置'}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
            {/* 🔥 2026-09-21：免费大模型 / 收费大模型 分组 + 勾选即生效 */}
            <div className="space-y-8">
            {isAdmin && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden border-t-4 border-t-green-500">
                <div className="flex items-center gap-2 p-6 pb-4">
                  <span className="text-2xl">🆓</span>
                  <h2 className="text-base font-bold text-gray-900">免费大模型</h2>
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-green-50 text-green-700 border border-green-100 font-medium">勾选即生效 · 永久免费</span>
                </div>
                <div className="grid grid-cols-2 gap-3 flex-1 px-6 pb-6 items-stretch">
                  {renderPresetCards(freePresets, isAdmin, aiModelBatch, togglePreset)}
                </div>
              </section>
            )}
            {isAdmin && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden border-t-4 border-t-amber-500">
                <div className="flex items-center gap-2 p-6 pb-4">
                  <span className="text-2xl">💰</span>
                  <h2 className="text-base font-bold text-gray-900">收费大模型</h2>
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-medium">按量计费 · 谨慎勾选</span>
                </div>
                <div className="grid grid-cols-2 gap-3 flex-1 px-6 pb-6 items-stretch">
                  {renderPresetCards(paidPresets, isAdmin, aiModelBatch, togglePreset)}
                </div>
              </section>
            )}
            </div>

            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">已配置模型</h2>
                <p className="text-sm text-gray-500 mt-1">管理您的AI写作模型，设置默认模型用于日常写作</p>
              </div>
              <div className="flex items-center space-x-2">
                {(function () {
                  let _deadN = 0
                  Object.keys(modelHealth).forEach(function (k) { if (modelHealth[k].cls === 'dead') _deadN++ })
                  if (_deadN === 0) return null
                  return (
                    <button onClick={execDisableDeadModels}
                      className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm">
                      一键停用已下架（{_deadN}）
                    </button>
                  )
                })()}
                <button onClick={execHealthCheck} disabled={healthChecking || !isAdmin}
                  title={isAdmin ? '探活全部已配置模型（下架/Key失效/限流实时识别）' : '仅管理员可执行健康检测'}
                  className="flex items-center space-x-2 px-4 py-2 border border-blue-500 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {healthChecking ? '检测中...' : '实时健康检测'}
                </button>
                <button
                  onClick={function () { setEditingModelId(null); setNewModelForm({ provider: '', apiKey: '', name: '', baseUrl: '', model: '' }); setLocalModelList([]); setLocalModelErr(''); setAddModelModalOpen(true) }}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>添加模型</span>
                </button>
              </div>
            </div>
            {healthSummary && (
              <div className="mb-4 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                健康状态：{healthSummary}{healthChecking ? '（检测中...）' : ''}
              </div>
            )}
            {/* 🔥 #212b 推荐替代模型：发现下架/限流时给出探活通过的免费候选，一键添加 */}
            {healthRecs.length > 0 && (
              <div className="mb-4 px-4 py-3 bg-cyan-50/60 border border-cyan-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-cyan-800">💡 推荐替代模型</span>
                  <span className="text-xs text-cyan-600">已实时探活验证 · 点击「添加」即启用（自动复用该平台已配置的 Key）</span>
                </div>
                <div className="space-y-1.5">
                  {healthRecs.map(function (rec) {
                    const recOk = rec.cls === 'ok' || rec.cls === 'limited'
                    return (
                      <div key={rec.provider + '::' + rec.model} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-cyan-100 px-3 py-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 truncate max-w-[280px]" title={rec.model}>{rec.name}</span>
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-500 font-mono truncate max-w-[180px]" title={rec.model}>{rec.model}</span>
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-50 text-gray-400">{rec.provider}</span>
                            {recOk ? (
                              <span className={'px-1.5 py-0.5 text-[10px] rounded-full font-medium ' + (rec.cls === 'ok' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700')}>
                                {rec.cls === 'ok' ? '可用 ' + rec.latencyMs + 'ms' : '可用（间歇限流）'}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[10px] rounded-full font-medium bg-amber-50 text-amber-700" title={rec.reason}>需换平台 Key</span>
                            )}
                          </div>
                          {!recOk && <p className="text-[11px] text-amber-600 mt-0.5">{rec.reason}</p>}
                        </div>
                        {recOk && (
                          <button onClick={function () { execAddRecommendedModel(rec) }}
                            className="shrink-0 px-3 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-xs font-medium">
                            添加
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
                            {(function () {
                              const _h = modelHealth[String(modelItem.provider) + '::' + String(modelItem.model)]
                              if (!_h) return null
                              if (_h.cls === 'ok') return <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full font-medium" title={'健康探活通过，延迟 ' + _h.latencyMs + 'ms'}>可用 {_h.latencyMs}ms</span>
                              if (_h.cls === 'dead') return <span className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full font-medium" title="健康探活返回 404：模型已下架，建议停用或替换">已下架</span>
                              if (_h.cls === 'keybad') return <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full font-medium" title="健康探活返回 401/403：该平台 API Key 失效，请更换 Key">Key失效</span>
                              if (_h.cls === 'limited') return <span className="px-2 py-0.5 bg-orange-50 text-orange-700 text-xs rounded-full font-medium" title="健康探活返回 429：间歇限流/日限，运行时会自动冷却跳过">限流</span>
                              if (_h.cls === 'image') return <span className="px-2 py-0.5 bg-gray-50 text-gray-500 text-xs rounded-full font-medium" title="图像生成模型，不适用文本探活">图像模型</span>
                              return <span className="px-2 py-0.5 bg-gray-50 text-gray-600 text-xs rounded-full font-medium" title={_h.reason}>异常</span>
                            })()}
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
              </div>

              {/* 风格网格 - 扩大到三列布局 */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {extendedStyles.filter(function (style) {
                  return styleCategory === '全部' || style.category === styleCategory
                }).map(function (style) {
                  const isPicked = pickedStyle === style.id
                  return (
                    <div key={style.id} onClick={function () { setPickedStyle(style.id) }}
                      className={'rounded-xl border-2 transition-all cursor-pointer overflow-hidden ' + (isPicked ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:border-blue-300 hover:shadow')}>
                      <div className="h-16 bg-gradient-to-br from-blue-500 to-purple-600 relative flex items-center justify-center">
                        {/* 🔥 2026-10-18：风格名称移入标题条居中显示（原在正文区左上） */}
                        <span className="px-6 text-white font-semibold text-sm truncate max-w-full text-center">{style.name}</span>
                        <div className="absolute bottom-2 left-3">
                          <span className="px-2 py-0.5 bg-white/20 backdrop-blur text-white text-xs rounded-full">{style.category}</span>
                        </div>
                        {isPicked && <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center"><Check className="w-3.5 h-3.5 text-white" /></div>}
                      </div>
                      <div className="p-4">
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
              <p className="text-sm text-gray-500 mb-2">配置各平台的AI检测标准，开启后AI生成的内容将自动进行对应平台的检测评分</p>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">口径提示：本栏数值＝平台执行标准（填多少，生成与终检就按多少控）；平台的判定依据是<strong className="mx-1">自建的「朱雀口径标准」</strong>（困惑度 / 语义连贯 / 词汇分布 / 结构特征 四维 + 段落级判定，输出「疑似AI占比」，目标 ≤5%）。朱雀官方模型的结果<strong className="mx-1">仅作参考、不作为闸门</strong>，两者口径不同，不可互相替代。</p>

              <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-1">朱雀官方检测通道（用户自填 API Key）</h4>
                <p className="text-xs text-gray-500 mb-3">填写腾讯 EdgeOne Makers 的 API Key 后，检测面板会调用朱雀官方模型（@makers/zhuque-text）做真实 AIGC 检测：判定口径为「疑似AI占比」，目标 ≤5%。<strong>未填 Key 不报错</strong>——默认走站内AI检测（朱雀口径四维估测）。Key 保存到你的用户偏好，并在检测请求中由前端传入后端，<strong>不存服务端环境变量</strong>。</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    value={zhuqueKeyInput}
                    onChange={function (e) { setZhuqueKeyInput(e.target.value) }}
                    placeholder={zhuqueKeyHint || '粘贴 Makers API Key（如 sk-xxxx）'}
                    className="flex-1 min-w-[240px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button onClick={execSaveZhuqueKey} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-black transition-colors">保存 Key</button>
                  {zhuqueKeyHint && (
                    <button onClick={execClearLocalZhuqueKey} className="px-4 py-2 bg-white text-gray-700 text-sm rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors">本机清除</button>
                  )}
                  <span className="text-xs text-gray-500">当前状态：{zhuqueKeyHint ? ('已配置 ' + zhuqueKeyHint) : '未配置（默认站内AI检测）'}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">获取方式：腾讯云 EdgeOne 控制台 → Makers → Models → API Key → 创建（每月免费 50 万 token，够全站章节反复复检）。保存后 Key 存于账号偏好与本浏览器，写作页「番茄检测」面板将自动切换为朱雀官方检测。</p>
              </div>
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
                          {/* 🔥 2026-10-18：按平台真实运营口径的详细检测标准 */}
                          {Array.isArray((platform as Record<string, unknown>).criteria) && (
                            <div className="text-xs bg-blue-50 border border-blue-100 rounded p-2">
                              <span className="font-medium text-blue-700">🎯 平台检测维度：</span>
                              <ul className="mt-1 space-y-1">
                                {((platform as Record<string, unknown>).criteria as string[]).map(function (c, ci) {
                                  return <li key={ci} className="text-gray-600">· {c}</li>
                                })}
                              </ul>
                            </div>
                          )}
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

            {/* 🔥 2026-10-18：保存成功的页面级 Toast（应用户要求改为页面正中显示） */}
            {saveSuccess && (
              <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[999] flex items-center gap-3 px-6 py-4 bg-green-600 text-white rounded-2xl shadow-2xl" role="status">
                <Check className="w-6 h-6" />
                <div>
                  <p className="text-base font-bold">偏好设置已保存</p>
                  <p className="text-sm text-green-100 mt-0.5">已同步应用到本机，续写/生成将自动使用新偏好</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI双重判定特征库 */}
        {activeTab === 'ai-detection' && <AIDetectionLibrary />}

        {/* 账户管理 */}
        {activeTab === 'account' && (
          <UserProfileCard
            onLogout={function () {
              // 修复 Bug#1：退出必须同时清 cookie（middleware 从 cookie 读登录态）
              import('@/lib/auth-logout').then(function (m) { m.logoutAndGoHome() })
            }}
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
                  <optgroup label="中转平台·OpenVeer">
                    {['OpenVeer'].map(function (p) { return <option key={p} value={p}>{p}</option> })}
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
                <input type="password" value={newModelForm.apiKey} onChange={function (e) { setNewModelForm({ provider: newModelForm.provider, apiKey: e.target.value, name: newModelForm.name, baseUrl: newModelForm.baseUrl, model: newModelForm.model }) }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" placeholder="输入 API Key（支持多 Key：英文逗号分隔，系统自动轮询分摊配额）" autoComplete="new-password" name="model-api-key-input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL <span className="text-gray-400">(已自动填充，可修改)</span></label>
                <input type="text" value={newModelForm.baseUrl} onChange={function (e) { setNewModelForm({ provider: newModelForm.provider, apiKey: newModelForm.apiKey, name: newModelForm.name, baseUrl: e.target.value, model: newModelForm.model }) }} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" placeholder="例如：https://api.openai.com/v1" autoComplete="off" name="model-base-url" />
              </div>

              {/* 🔥 2026-09-24：单个模型的调用频率限制（可选） */}
              <div className="pt-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">调用频率限制（可选，留空表示不限制）</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-xs text-gray-500">每分钟</span>
                    <input type="number" min="0" value={newModelRateLimit.perMinute} onChange={function (e) { setNewModelRateLimit({ perMinute: e.target.value, perHour: newModelRateLimit.perHour, perDay: newModelRateLimit.perDay }) }} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="如 10" />
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">每小时</span>
                    <input type="number" min="0" value={newModelRateLimit.perHour} onChange={function (e) { setNewModelRateLimit({ perMinute: newModelRateLimit.perMinute, perHour: e.target.value, perDay: newModelRateLimit.perDay }) }} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="如 100" />
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">每天</span>
                    <input type="number" min="0" value={newModelRateLimit.perDay} onChange={function (e) { setNewModelRateLimit({ perMinute: newModelRateLimit.perMinute, perHour: newModelRateLimit.perHour, perDay: e.target.value }) }} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="如 1200" />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">仅当模型带此配置时后端才会按模型限流（默认全局按 provider 限流已关闭）。</p>
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

      {/* 一键导入硅基8套模型弹窗 */}
      {sfModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2"><span className="text-2xl">🆓</span><h3 className="text-xl font-bold text-gray-900">一键导入硅基流动8套模型</h3></div>
              <button onClick={function () { setSfModalOpen(false); setSiliconflowApiKeyInput(''); setSfKeyInputs(['']) }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-4">
              <div className="bg-teal-50 rounded-xl border border-teal-100 p-4">
                <p className="text-sm font-medium text-teal-800 mb-2">请勾选要导入的硅基流动模型：<span className="text-teal-600">免费模型已默认勾选，按量计费的 DeepSeek-V4-Flash（开局分析用）需您手动勾选。</span></p>
                {(() => {
                  const sp = splitFreePaid(siliconflowPresetPool())
                  return (<>
                    {renderImportGroup(sp.free, false, sfSelectedPresets, setSfSelectedPresets)}
                    {renderImportGroup(sp.paid, true, sfSelectedPresets, setSfSelectedPresets)}
                  </>)
                })()}
                <p className="text-xs mt-3 text-teal-600">
                  首选正文：Qwen2.5-7B｜大纲权谋：GLM-4-9B-0414｜权谋战争：GLM-Z1-9B｜备用正文：Qwen3-8B｜极速轻量：Qwen3.5-4B｜翻译润色：Hunyuan-MT-7B｜封面绘图：Kwai-Kolors（完全免费无限制）｜开局分析：DeepSeek-V4-Flash（按量计费）
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">硅基流动 API Key（可填多个，自动轮询分摊配额）<span className="text-red-500">*</span></label>
                                {(sfKeyInputs.length ? sfKeyInputs : ['']).map(function (kv: string, ki: number) {
                  return (
                    <div key={ki} className="flex gap-2 mb-2">
                      <input type="password" value={kv}
                        onChange={function (e) {
                          const arr = sfKeyInputs.length ? sfKeyInputs.slice() : ['']
                          arr[ki] = e.target.value
                          setSfKeyInputs(arr)
                          setSiliconflowApiKeyInput(arr.map(function (s: string) { return s.trim() }).filter(Boolean).join(','))
                        }}
                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        placeholder={'硅基流动 API Key #' + (ki + 1)} />
                      {sfKeyInputs.length > 1 && (
                        <button type="button" onClick={function () {
                          const arr = sfKeyInputs.slice(); arr.splice(ki, 1)
                          setSfKeyInputs(arr)
                          setSiliconflowApiKeyInput(arr.map(function (s: string) { return s.trim() }).filter(Boolean).join(','))
                        }} className="px-3 text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
                      )}
                    </div>
                  )
                })}
                {(sfKeyInputs.length ? sfKeyInputs : ['']).length < 5 && (
                  <button type="button" onClick={function () { setSfKeyInputs(sfKeyInputs.length ? sfKeyInputs.concat('') : ['', '']) }}
                    className="text-xs text-indigo-600 hover:underline mb-1">+ 添加 Key（多个 Key 自动轮询分摊配额）</button>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  还没有API Key？前往 <a href="https://cloud.siliconflow.cn" target="_blank" rel="noopener noreferrer" className="hover:underline text-teal-600">硅基流动控制台</a> 免费注册获取（9B以下模型永久免费，无需充值）
                </p>
              </div>
              <div className="flex space-x-3 pt-2">
                <button onClick={function () { setSfModalOpen(false); setSiliconflowApiKeyInput(''); setSfKeyInputs(['']) }} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
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
              <button onClick={function () { setZhipuModalOpen(false); setZhipuApiKeyInput(''); setZhipuKeyInputs(['']) }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-4">
              <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4">
                <p className="text-sm font-medium text-indigo-800 mb-2">请勾选要导入的智谱模型（以下 3 套均为永久免费，已默认勾选）：</p>
                {renderImportGroup(zhipuPresetPool, false, zpSelectedPresets, setZpSelectedPresets)}
                <p className="text-xs mt-3 text-indigo-600">
                  超高速正文：GLM-4.7-Flash（200K上下文）｜推理规划：GLM-Z1-Flash｜综合全能：GLM-4-Flash（建议正文主力）
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">智谱 BigModel API Key（可填多个，自动轮询分摊配额）<span className="text-red-500">*</span></label>
                {(zhipuKeyInputs.length ? zhipuKeyInputs : ['']).map(function (kv: string, ki: number) {
                  return (
                    <div key={ki} className="flex gap-2 mb-2">
                      <input type="password" value={kv}
                        onChange={function (e) {
                          const arr = zhipuKeyInputs.length ? zhipuKeyInputs.slice() : ['']
                          arr[ki] = e.target.value
                          setZhipuKeyInputs(arr)
                          setZhipuApiKeyInput(arr.map(function (s: string) { return s.trim() }).filter(Boolean).join(','))
                        }}
                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        placeholder={'智谱 API Key #' + (ki + 1)} />
                      {zhipuKeyInputs.length > 1 && (
                        <button type="button" onClick={function () {
                          const arr = zhipuKeyInputs.slice(); arr.splice(ki, 1)
                          setZhipuKeyInputs(arr)
                          setZhipuApiKeyInput(arr.map(function (s: string) { return s.trim() }).filter(Boolean).join(','))
                        }} className="px-3 text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
                      )}
                    </div>
                  )
                })}
                {(zhipuKeyInputs.length ? zhipuKeyInputs : ['']).length < 5 && (
                  <button type="button" onClick={function () { setZhipuKeyInputs(zhipuKeyInputs.length ? zhipuKeyInputs.concat('') : ['', '']) }}
                    className="text-xs text-indigo-600 hover:underline mb-1">+ 添加 Key（多个 Key 自动轮询分摊配额）</button>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  还没有API Key？前往 <a href="https://open.bigmodel.cn/" target="_blank" rel="noopener noreferrer" className="hover:underline text-indigo-600">智谱 BigModel 控制台</a> 免费注册获取（每个账号一套免费 Key，多账号 Key 填入后自动轮询）
                </p>
              </div>
              <div className="flex space-x-3 pt-2">
                <button onClick={function () { setZhipuModalOpen(false); setZhipuApiKeyInput(''); setZhipuKeyInputs(['']) }} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
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
              <div className="flex items-center gap-2"><span className="text-2xl">🔑</span><h3 className="text-xl font-bold text-gray-900">一键导入 {platformImportTarget} 模型</h3></div>
              <button onClick={function () { setPlatformModalOpen(false); setPlatformApiKeyInput(''); setPlatformRateLimit({ perMinute: '', perHour: '', perDay: '' }); setPlatformImportTarget(null) }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-4">
              <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
                <p className="text-sm font-medium text-amber-800 mb-2">请勾选要导入的 {platformImportTarget} 模型：<span className="text-amber-600">免费模型已默认勾选，收费模型需您手动勾选。</span></p>
                {(() => {
                  const pp = splitFreePaid(platformPoolFor(platformImportTarget))
                  return (<>
                    {renderImportGroup(pp.free, false, platformSelectedPresets, setPlatformSelectedPresets)}
                    {renderImportGroup(pp.paid, true, platformSelectedPresets, setPlatformSelectedPresets)}
                  </>)
                })()}
                {platformImportTarget === 'OpenVeer' && (
                  <div className="mt-3 pt-3 border-t border-amber-200">
                    <p className="text-xs font-medium text-amber-800 mb-2">调用次数 / 频率限制（可选，留空则不限制）</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] text-amber-700 mb-1">每分钟</label>
                        <input type="number" min="0" value={platformRateLimit.perMinute} onChange={function (e) { setPlatformRateLimit({ perMinute: e.target.value, perHour: platformRateLimit.perHour, perDay: platformRateLimit.perDay }) }} className="w-full px-2 py-1.5 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500" placeholder="如 10" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-amber-700 mb-1">每小时</label>
                        <input type="number" min="0" value={platformRateLimit.perHour} onChange={function (e) { setPlatformRateLimit({ perMinute: platformRateLimit.perMinute, perHour: e.target.value, perDay: platformRateLimit.perDay }) }} className="w-full px-2 py-1.5 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500" placeholder="如 100" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-amber-700 mb-1">每天</label>
                        <input type="number" min="0" value={platformRateLimit.perDay} onChange={function (e) { setPlatformRateLimit({ perMinute: platformRateLimit.perMinute, perHour: platformRateLimit.perHour, perDay: e.target.value }) }} className="w-full px-2 py-1.5 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500" placeholder="如 1200" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{platformImportTarget} API Key <span className="text-red-500">*</span></label>
                <input type="password" value={platformApiKeyInput} onChange={function (e) { setPlatformApiKeyInput(e.target.value) }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                  placeholder={'输入您的 ' + platformImportTarget + ' API Key（该平台所选模型共用）'} />
              </div>
              <div className="flex space-x-3 pt-2">
                <button onClick={function () { setPlatformModalOpen(false); setPlatformApiKeyInput(''); setPlatformRateLimit({ perMinute: '', perHour: '', perDay: '' }); setPlatformImportTarget(null) }} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
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