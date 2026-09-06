/**
 * 网文创作工作流 - 基于 netnovel-writing Skill
 * 
 * 架构:
 * - 主Agent: 协调整个创作流程，管理上下文
 * - 副Agent: 世界观设定、人物设定、细纲设定（沉淀为Skill）
 * 
 * 工作流程:
 * 1. 灵感捕捉 (idea)
 * 2. 世界观构建 (worldbuilding)
 * 3. 人物设定 (characters)
 * 4. 势力设定 (factions)
 * 5. 关系设定 (relationships)
 * 6. 金手指设定 (powerSystem)
 * 7. 大纲规划 (outline)
 * 8. 章节规划 (chapters)
 * 9. 正文创作 (writing)
 */

// ============ 步骤常量 ============
export const WORKFLOW_STEPS = {
  IDEA: 'idea',
  WORLD_BUILDING: 'worldbuilding',
  POWER_SYSTEM: 'powerSystem',
  CHARACTERS: 'characters',
  FACTIONS: 'factions',
  RELATIONSHIPS: 'relationships',
  OUTLINE: 'outline',
  CHAPTERS: 'chapters',
  WRITING: 'writing',
} as const

export type WorkflowStep = typeof WORKFLOW_STEPS[keyof typeof WORKFLOW_STEPS]

// ============ 步骤配置 ============
export const STEP_CONFIG: Record<WorkflowStep, {
  name: string
  description: string
  agent: 'main' | 'worldbuilding' | 'character' | 'outline'
  requiredPrevious: WorkflowStep[]
  outputFields: string[]
}> = {
  idea: {
    name: '灵感捕捉',
    description: '确定书名、一句话钩子、核心卖点、目标读者',
    agent: 'main',
    requiredPrevious: [],
    outputFields: ['title', 'hook', 'coreSellingPoint', 'targetAudience', 'keywords'],
  },
  worldbuilding: {
    name: '世界观构建',
    description: '构建时代背景、地理版图、历史走向、力量体系、世界规则、社会结构、科技水平',
    agent: 'worldbuilding',
    requiredPrevious: ['idea'],
    outputFields: ['era', 'geography', 'history', 'powerSystem', 'rules', 'socialStructure', 'technology'],
  },
  powerSystem: {
    name: '金手指设定',
    description: '设定主角的特殊能力、系统、传承等',
    agent: 'main',
    requiredPrevious: ['idea', 'worldbuilding'],
    outputFields: ['protagonistAbility', 'systemInfo', 'cultivationSystem'],
  },
  characters: {
    name: '人物设定',
    description: '设定主角、女主、反派、配角等角色',
    agent: 'character',
    requiredPrevious: ['idea', 'worldbuilding', 'powerSystem'],
    outputFields: ['protagonist', 'femaleLead', 'antagonist', 'supportingChars'],
  },
  factions: {
    name: '势力设定',
    description: '设定主要势力、门派、组织等',
    agent: 'main',
    requiredPrevious: ['idea', 'worldbuilding'],
    outputFields: ['factions'],
  },
  relationships: {
    name: '关系设定',
    description: '设定角色之间的关系网络',
    agent: 'character',
    requiredPrevious: ['characters', 'factions'],
    outputFields: ['relationships'],
  },
  outline: {
    name: '大纲规划',
    description: '规划主线剧情、阶段划分、关键事件',
    agent: 'outline',
    requiredPrevious: ['idea', 'worldbuilding', 'powerSystem', 'characters', 'factions', 'relationships'],
    outputFields: ['mainPlot', 'stages', 'keyEvents', 'worldBuilding'],
  },
  chapters: {
    name: '章节规划',
    description: '生成卷结构和章节规划',
    agent: 'outline',
    requiredPrevious: ['outline', 'worldbuilding', 'characters'],
    outputFields: ['volumes', 'chapters'],
  },
  writing: {
    name: '正文创作',
    description: '根据章节规划创作正文内容',
    agent: 'main',
    requiredPrevious: ['chapters'],
    outputFields: ['content'],
  },
}

// ============ Agent职责定义 ============
export const AGENT_CONFIG = {
  main: {
    name: '主创作Agent',
    responsibilities: [
      '协调整个创作流程',
      '管理创作上下文和世界观一致性',
      '处理用户交互和反馈',
      '执行正文创作任务',
    ],
    skills: ['chinese-novelist-skill', 'golden-five-chapters', 'shuangwen-continuation'],
  },
  worldbuilding: {
    name: '世界观设定Agent',
    responsibilities: [
      '构建完整的世界体系',
      '设计力量体系和升级规则',
      '规划地理版图和势力分布',
      '制定世界规则限制',
    ],
    skills: ['power-fantasy-outline', 'time-slip-world'],
  },
  character: {
    name: '人物设定Agent',
    responsibilities: [
      '设计有血有肉的角色',
      '构建角色关系网络',
      '确保角色动机合理',
      '设计角色成长弧线',
    ],
    skills: ['power-fantasy-character'],
  },
  outline: {
    name: '细纲设定Agent',
    responsibilities: [
      '将设定转化为可执行的故事线',
      '规划阶段划分和关键事件',
      '设计爽点节奏和情绪曲线',
      '生成章节规划',
    ],
    skills: ['bestseller-outline', 'emotion-curve'],
  },
}

// ============ 创作质量标准 ============
export const QUALITY_STANDARDS = {
  idea: {
    hookLength: '一句话钩子不超过50字',
    coreSellingPointUnique: '核心卖点要有差异化',
    keywordsCount: '关键词3-5个',
  },
  worldbuilding: {
    geographyCount: '至少3个重要地理区域',
    powerSystemLevels: '力量体系至少5个等级',
    rulesCount: '至少4条世界规则',
  },
  characters: {
    protagonistTraits: '主角3-5个性格关键词',
    antagonistLogic: '反派要有自己的逻辑',
    supportingCharsUnique: '配角要有独特记忆点',
  },
  outline: {
    mainPlotClarity: '主线目标明确',
    stagesCount: '至少3个阶段',
    keyEventsPerStage: '每个阶段2-3个关键事件',
  },
  chapters: {
    volumeUnique: '每卷主题独特',
    chapterSummaryLength: '每章摘要50字左右',
    shuangPointsPerChapter: '每章1-2个爽点',
    hookRequired: '每章必须有钩子',
  },
  writing: {
    wordCountPerChapter: '每章3000字左右',
    aiFree: '无AI写作痕迹',
    emotionCurve: '情绪曲线有起伏',
  },
}

// ============ 内容审核标准 ============
export const CONTENT_REVIEW = {
  sensitiveWords: [
    '政治敏感词库',
    '色情低俗词库',
    '暴力血腥词库',
  ],
  plagiarismCheck: '抄袭融梗检测',
  platformAdaptation: {
    qieqie: {
      name: '番茄小说',
      requirements: {
        openingChapters: '黄金三章强冲突',
        chapterLength: '3000字左右',
        shuangDensity: '每章1-2个爽点',
        emotionCurve: '情绪曲线起伏',
      },
    },
  },
}

// ============ 工具函数 ============
export function getNextStep(currentStep: WorkflowStep): WorkflowStep | null {
  const stepOrder: WorkflowStep[] = [
    WORKFLOW_STEPS.IDEA,
    WORKFLOW_STEPS.WORLD_BUILDING,
    WORKFLOW_STEPS.POWER_SYSTEM,
    WORKFLOW_STEPS.CHARACTERS,
    WORKFLOW_STEPS.FACTIONS,
    WORKFLOW_STEPS.RELATIONSHIPS,
    WORKFLOW_STEPS.OUTLINE,
    WORKFLOW_STEPS.CHAPTERS,
    WORKFLOW_STEPS.WRITING,
  ]
  
  const currentIndex = stepOrder.indexOf(currentStep)
  if (currentIndex === -1 || currentIndex === stepOrder.length - 1) {
    return null
  }
  return stepOrder[currentIndex + 1]
}

export function canProceedToStep(
  targetStep: WorkflowStep,
  completedSteps: WorkflowStep[]
): boolean {
  const config = STEP_CONFIG[targetStep]
  return config.requiredPrevious.every(step => completedSteps.includes(step))
}

export function getRequiredOutputs(step: WorkflowStep): string[] {
  return STEP_CONFIG[step].outputFields
}

export function validateStepOutput(
  step: WorkflowStep,
  output: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const requiredOutputs = STEP_CONFIG[step].outputFields
  
  for (const field of requiredOutputs) {
    if (!(field in output) || !output[field]) {
      errors.push(`缺少必需字段: ${field}`)
    }
  }
  
  // 额外验证
  if (step === WORKFLOW_STEPS.IDEA && typeof output.hook === 'string' && output.hook.length > 50) {
    errors.push('一句话钩子不能超过50字')
  }

  if (step === WORKFLOW_STEPS.WORLD_BUILDING) {
    if (typeof output.geography === 'string') {
      const geoCount = output.geography.split(/[，,、]/).filter(Boolean).length
      if (geoCount < 3) {
        errors.push('地理区域至少需要3个')
      }
    }
    if (output.rules && Array.isArray(output.rules) && output.rules.length < 4) {
      errors.push('世界规则至少需要4条')
    }
  }

  if (step === WORKFLOW_STEPS.CHAPTERS && Array.isArray(output.volumes)) {
    for (let i = 0; i < output.volumes.length; i++) {
      const vol = output.volumes[i] as { name?: string; summary?: string }
      if (!vol.name || vol.name.includes('待命名')) {
        errors.push(`第${i + 1}卷缺少名称`)
      }
      if (!vol.summary || vol.summary.includes('待生成')) {
        errors.push(`第${i + 1}卷缺少摘要`)
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}
