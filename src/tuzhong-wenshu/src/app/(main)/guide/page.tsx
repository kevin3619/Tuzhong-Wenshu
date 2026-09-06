import { Metadata } from 'next'
import { 
  BookOpen, 
  Sparkles, 
  Globe, 
  Zap, 
  Settings, 
  Target, 
  Lightbulb, 
  FileText,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  HelpCircle
} from 'lucide-react'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '使用指南 - 途中文枢',
  description: '途中文枢AI小说写作助手完整使用教程',
}

const QUICK_START_STEPS = [
  {
    step: 1,
    title: '创建作品',
    description: '点击"新建作品"，选择"AI全自动生成"模式',
    icon: <BookOpen className="w-6 h-6 text-blue-500" />,
  },
  {
    step: 2,
    title: '输入主题',
    description: '输入3-8个关键词，如：修仙 宗门 逆天改命 热血爽文',
    icon: <Lightbulb className="w-6 h-6 text-yellow-500" />,
  },
  {
    step: 3,
    title: 'AI生成设定',
    description: 'AI自动生成灵感、大纲、人物、世界观等完整设定',
    icon: <Sparkles className="w-6 h-6 text-purple-500" />,
  },
  {
    step: 4,
    title: '生成正文',
    description: '确认设定后，AI自动生成章节正文',
    icon: <FileText className="w-6 h-6 text-green-500" />,
  },
]

const FEATURES = [
  {
    title: 'AI全自动生成',
    icon: <Zap className="w-8 h-8 text-yellow-500" />,
    description: '从灵感构思到正文生成，11个步骤全流程AI辅助',
    details: [
      '灵感创作：根据关键词生成书名、一句话简介、核心卖点',
      '故事大纲：生成主线剧情、分卷规划、高潮节点',
      '世界观设定：构建完整的背景设定、规则体系',
      '人物设定：主角、反派、配角详细设定',
      '人物关系：可视化关系图谱',
      '势力设定：各方势力的背景、目标、冲突',
      '金手指设定：主角特殊能力的来源、限制、成长',
      '章节规划：自动生成章节标题和摘要',
      '正文生成：按章节生成2500-3000字正文',
    ],
  },
  {
    title: '仿写模式',
    icon: <Target className="w-8 h-8 text-pink-500" />,
    description: '拆解已有小说结构，AI按相同模式创作新作品',
    details: [
      '输入你想仿写的小说名称',
      'AI自动拆解：类型、结构、角色、卖点等',
      '基于拆解结果，创作全新的故事',
      '学习爆款小说的套路，但内容完全原创',
    ],
  },
  {
    title: 'SKILL技能系统',
    icon: <Sparkles className="w-8 h-8 text-orange-500" />,
    description: '开启不同技能，让AI按特定风格生成内容',
    details: [
      '黄金三章：强化开篇吸引力，确保前三章留住读者',
      '爽点密集：每300字一个小爽点，节奏紧凑',
      '去AI化：自动去除AI痕迹，规避平台检测',
      '情绪曲线：按番茄读者情绪曲线设计剧情',
      '伏笔大师：自动埋设伏笔，前后呼应',
      '对话优化：生成符合人物性格的对话',
    ],
  },
  {
    title: '设定中心',
    icon: <Globe className="w-8 h-8 text-cyan-500" />,
    description: '统一管理世界观、人物关系和风格设定',
    details: [
      '世界观设定：构建完整的架空世界',
      '人物图谱：可视化展示人物间的恩怨情仇',
      '风格训练：上传作品样本，AI学习你的文笔',
      '确保所有设定前后一致，防止写到后面忘记前面',
    ],
  },
]

const TIPS = [
  {
    title: '关键词技巧',
    content: '关键词越具体，AI生成越精准。建议包含：题材（穿越/重生/系统）、时代（古代/现代/末世）、核心卖点（退婚流/废材逆袭/权谋争霸）、金手指类型（空间/签到/预知未来）',
    type: 'tip',
  },
  {
    title: 'AI生成后必做',
    content: 'AI生成的是初稿，建议人工审核修改：检查人物名字是否一致、时间线是否合理、剧情逻辑是否通顺、去除不符合时代背景的词汇',
    type: 'warning',
  },
  {
    title: '提高生成质量',
    content: '在SKILL中开启"去AI化"和"黄金三章"；在设定中心训练你的写作风格；使用仿写模式学习爆款结构',
    type: 'tip',
  },
]

const FAQ = [
  {
    q: 'AI生成的内容会重复吗？',
    a: '不会。每次生成都是基于你的关键词实时创作，即使相同关键词也会生成不同内容。',
  },
  {
    q: '生成的内容能直接发布吗？',
    a: '建议作为初稿使用。AI生成后需要人工审核修改，确保逻辑通顺、符合平台规范。',
  },
  {
    q: '仿写会抄袭吗？',
    a: '不会。仿写是学习结构（如：开篇方式、节奏把控、人物配置），内容完全原创。',
  },
  {
    q: '需要配置AI模型吗？',
    a: '普通用户无需配置。系统已内置多个大模型自动切换，你只需登录即可使用。',
  },
  {
    q: '生成的内容会被别人看到吗？',
    a: '不会。所有创作内容仅存储在你的账号下，完全私密。',
  },
]

export default function GuidePage() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* 标题 */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">途中文枢使用指南</h1>
        <p className="text-gray-600 text-lg">
          专为网文作者打造的AI写作助手，从灵感到正文，全流程辅助创作
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors"
          >
            <Sparkles className="w-5 h-5" />
            立即开始创作
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Settings className="w-5 h-5" />
            模型配置
          </Link>
        </div>
      </div>

      {/* 快速开始 */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Zap className="w-6 h-6 text-yellow-500" />
          快速开始（4步搞定）
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_START_STEPS.map((item) => (
            <div
              key={item.step}
              className="bg-white rounded-xl p-6 border border-gray-200 hover:border-purple-300 hover:shadow-lg transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">
                  {item.step}
                </div>
                {item.icon}
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-sm text-gray-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 功能详解 */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-500" />
          功能详解
        </h2>
        <div className="space-y-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="bg-white rounded-xl p-6 border border-gray-200"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gray-50 rounded-xl">
                  {feature.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 mb-4">{feature.description}</p>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {feature.details.map((detail, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-gray-700"
                      >
                        <ChevronRight className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 使用技巧 */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Lightbulb className="w-6 h-6 text-yellow-500" />
          使用技巧
        </h2>
        <div className="space-y-4">
          {TIPS.map((tip) => (
            <div
              key={tip.title}
              className={`rounded-xl p-5 ${
                tip.type === 'warning'
                  ? 'bg-amber-50 border border-amber-200'
                  : 'bg-blue-50 border border-blue-200'
              }`}
            >
              <div className="flex items-start gap-3">
                {tip.type === 'warning' ? (
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                )}
                <div>
                  <h4
                    className={`font-bold mb-1 ${
                      tip.type === 'warning' ? 'text-amber-800' : 'text-blue-800'
                    }`}
                  >
                    {tip.title}
                  </h4>
                  <p
                    className={`text-sm ${
                      tip.type === 'warning' ? 'text-amber-700' : 'text-blue-700'
                    }`}
                  >
                    {tip.content}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 常见问题 */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-green-500" />
          常见问题
        </h2>
        <div className="space-y-4">
          {FAQ.map((item, i) => (
            <div
              key={i}
              className="bg-white rounded-xl p-5 border border-gray-200"
            >
              <h4 className="font-bold text-gray-900 mb-2">Q: {item.q}</h4>
              <p className="text-gray-600 text-sm">A: {item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 底部CTA */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-4">准备好开始创作了吗？</h2>
        <p className="text-white/80 mb-6">
          点击&quot;新建作品&quot;，让AI帮你开启写作之旅
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-8 py-4 bg-white text-purple-600 rounded-xl font-bold hover:bg-gray-100 transition-colors"
        >
          <Sparkles className="w-5 h-5" />
          立即开始创作
        </Link>
      </div>

      {/* 版本信息 */}
      <div className="mt-12 text-center text-sm text-gray-400">
        <p>途中文枢 AI小说写作助手 v1.0</p>
        <p className="mt-1">有问题或建议？请联系客服</p>
      </div>
    </div>
  )
}
