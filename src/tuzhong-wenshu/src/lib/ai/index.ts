// AI服务 - 基于PRD V2.0规范实现
// 注意：生产环境需要安装 @ai-sdk/openai, @ai-sdk/anthropic, ai

// import { openai } from '@ai-sdk/openai';
// import { anthropic } from '@ai-sdk/anthropic';
// import { createOpenAI } from '@ai-sdk/openai';
// import { generateText, streamText } from 'ai';

// 预设风格库：统一从 lib/ai-service.ts 导入，确保单源不重复、不陈旧
import { PRESET_STYLES as _SRC_STYLES } from '@/lib/ai-service';
export const PRESET_STYLES = _SRC_STYLES.slice();

// 风格参数类型
export interface StyleParameters {
  formality: number;           // 正式度 0-100
  emotionIntensity: number;    // 情感强度 0-100
  descriptionDensity: number;  // 描写密度 0-100
  dialogueRatio: number;       // 对话比例 0-100
  rhetoricFrequency: number;   // 修辞频率 0-100
  pacing: number;              // 节奏快慢 0-100
  languageDensity: number;     // 语言密度 0-100
  eraFeel: number;             // 时代感 0-100
  excitementDensity: number;   // 爽点密度 0-100
}

// AI模型配置类型
export interface AIModelConfig {
  id: string;
  userId: string;
  name: string;
  provider: 'openai' | 'claude' | 'baidu' | 'alibaba' | 'deepseek' | 'local';
  apiKey?: string;
  baseUrl?: string;
  modelName: string;
  isDefault: boolean;
}

// 续写参数
export interface ContinueWritingParams {
  context: string;
  style: {
    name: string;
    parameters: StyleParameters;
  };
  length: 'short' | 'medium' | 'long';
  characterContext?: string[];
  worldContext?: string[];
}

// 续写结果
export interface ContinueWritingResult {
  options: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// 番茄检测结果
export interface TomatoDetectResult {
  scores: {
    aiTrace: number;
    coherence: number;
    homogeneity: number;
    shadowBanRisk: number;
    excitementDensity: number;
    immersion: number;
    coldStart: number;
  };
  overallScore: number;
  issues: DetectedIssue[];
  suggestions: string[];
}

// 检测问题
export interface DetectedIssue {
  type: string;
  location: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggestedFix?: string;
}

// 改写参数
export interface RewriteParams {
  text: string;
  targetScores: Partial<TomatoDetectResult['scores']>;
  style: {
    name: string;
    parameters: StyleParameters;
  };
  preserveMeaning: boolean;
}

// 改写结果
export interface RewriteResult {
  rewrittenText: string;
  changes: TextChange[];
  newScores: TomatoDetectResult['scores'];
}

// 文本变更
export interface TextChange {
  original: string;
  modified: string;
  reason: string;
}

// 风格分析结果
export interface StyleAnalysisResult {
  narrativeRhythm: string;
  vocabularyHabits: string;
  sentenceStructure: string;
  emotionalExpression: string;
  parameters: StyleParameters;
  similarPresets: string[];
}

// AI服务已迁移到 API 路由层实现
// 相关功能请参考：
// - /api/ai-generate/route.ts (AI内容生成)
// - /api/ai/rewrite/route.ts (AI改写与去AI味)
// - /api/ai/detect/route.ts (AI检测)
