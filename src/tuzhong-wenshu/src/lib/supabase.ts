import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseKey)

// 数据库类型定义
export interface Novel {
  id: string
  user_id: string
  title: string
  description?: string
  cover_url?: string
  genre?: string
  status: 'writing' | 'completed' | 'paused'
  word_count: number
  created_at: string
  updated_at: string
  health_score?: number
}

export interface Chapter {
  id: string
  novel_id: string
  title: string
  content: string
  order_index: number
  word_count: number
  status: 'draft' | 'completed' | 'published'
  created_at: string
  updated_at: string
}

export interface Character {
  id: string
  novel_id: string
  name: string
  aliases?: string[]
  age?: number
  gender?: string
  appearance?: string
  personality?: string
  background?: string
  skills?: string[]
  relationships?: CharacterRelationship[]
  created_at: string
  updated_at: string
}

export interface CharacterRelationship {
  character_id: string
  relation_type: string
  description?: string
}

export interface WorldSetting {
  id: string
  novel_id: string
  category: 'geography' | 'history' | 'power_system' | 'organization' | 'custom'
  name: string
  description: string
  created_at: string
  updated_at: string
}

export interface Foreshadowing {
  id: string
  novel_id: string
  content: string
  chapter_id: string
  planned_resolve_chapter?: number
  status: 'active' | 'resolved' | 'abandoned'
  created_at: string
  resolved_at?: string
}

export interface WritingStyle {
  id: string
  user_id: string
  name: string
  description?: string
  parameters: StyleParameters
  sample_text?: string
  is_preset: boolean
  created_at: string
}

export interface StyleParameters {
  formality: number // 0-100, 口语化到书面语
  emotionIntensity: number // 0-100, 平淡到浓烈
  descriptionDensity: number // 0-100, 简洁到细腻
  dialogueRatio: number // 0-100, 少到多
  rhetoricFrequency: number // 0-100, 朴素到华丽
  pacing: number // 0-100, 缓慢到快速
  languageDensity: number // 0-100
  eraFeel: number // 0-100
  excitementDensity: number // 0-100
}

export interface AIModelConfig {
  id: string
  user_id: string
  name: string
  provider: 'openai' | 'claude' | 'baidu' | 'alibaba' | 'deepseek' | 'local'
  api_key?: string
  base_url?: string
  model_name: string
  is_default: boolean
  created_at: string
}

export interface TomatoReport {
  id: string
  chapter_id: string
  ai_trace: number
  coherence: number
  homogeneity: number
  shadow_ban_risk: number
  excitement_density: number
  immersion: number
  cold_start: number
  overall_score: number
  issues: ReportIssue[]
  created_at: string
}

export interface ReportIssue {
  type: string
  location: string
  description: string
  severity: 'low' | 'medium' | 'high'
}
