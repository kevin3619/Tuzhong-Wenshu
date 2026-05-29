export interface Project {
  id: string
  title: string
  description: string
  content: string
  createdAt: Date
  updatedAt: Date
  wordCount: number
  chapterCount: number
}

export interface GenerationOptions {
  model: string
  temperature: number
  maxTokens: number
  topP: number
}

export interface GenerationRequest {
  prompt: string
  context: string
  options: GenerationOptions
}

export interface GenerationResponse {
  text: string
  model: string
  tokensUsed: number
}

export interface AIModel {
  id: string
  name: string
  provider: string
  description: string
  freeQuota: boolean
  maxTokens: number
}

export interface Character {
  id: string
  name: string
  description: string
  personality: string
  background: string
}

export interface WorldSetting {
  id: string
  name: string
  description: string
  rules: string
  history: string
}

export interface Chapter {
  id: string
  number: number
  title: string
  outline: string
  wordCount: number
  status: 'draft' | 'writing' | 'completed'
}
