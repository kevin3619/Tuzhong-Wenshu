import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { sampleText } = await request.json()
  const result = {
    narrativeRhythm: '叙事节奏偏快，善于通过短句营造紧张感',
    vocabularyHabits: '偏好使用动词和形容词，语言富有画面感',
    sentenceStructure: '长短句结合得当，对话与叙述比例约为4:6',
    emotionalExpression: '情感表达直接，善于通过动作和对话传递情绪',
    parameters: { formality: 55, emotionIntensity: 75, descriptionDensity: 65, dialogueRatio: 60, rhetoricFrequency: 55, pacing: 70, languageDensity: 60, eraFeel: 50, excitementDensity: 75 },
    similarPresets: ['fanqie-shuangwen', 'fantasy-tiancan']
  }
  return NextResponse.json({ data: result })
}
