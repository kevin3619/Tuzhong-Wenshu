import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { BookOpen, Sparkles, Zap } from 'lucide-react'

function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">途中文枢</h1>
          </div>
          <div className="flex gap-4">
            <Link to="/projects">
              <Button variant="outline">我的项目</Button>
            </Link>
            <Link to="/projects">
              <Button>开始写作</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h2 className="text-5xl font-bold mb-6">AI 小说写作助手</h2>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          一比一复刻妙笔生成，集成市面上所有的 AI 模型，让你的创意无限延伸。
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/projects">
            <Button size="lg" className="gap-2">
              <Sparkles className="h-5 w-5" />
              开始创作
            </Button>
          </Link>
          <Button size="lg" variant="outline">
            了解更多
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <h3 className="text-3xl font-bold text-center mb-12">核心功能</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: Sparkles,
              title: 'AI 智能续写',
              description: '基于上文内容，AI 自动生成多个续写方案供你选择',
            },
            {
              icon: BookOpen,
              title: '项目管理',
              description: '轻松管理多个创作项目，支持章节划分和版本控制',
            },
            {
              icon: Zap,
              title: '多模型聚合',
              description: '集成硅基流动、OpenAI 等多个 AI 模型，随时切换',
            },
          ].map((feature, i) => {
            const Icon = feature.icon
            return (
              <div key={i} className="border border-border rounded-lg p-6 bg-card">
                <Icon className="h-8 w-8 text-primary mb-4" />
                <h4 className="font-semibold mb-2">{feature.title}</h4>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="bg-primary/10 rounded-lg border border-primary/20 p-12 text-center">
          <h3 className="text-2xl font-bold mb-4">准备好开始了吗？</h3>
          <p className="text-muted-foreground mb-6">立即创建你的第一个项目，开启 AI 辅助创作之旅</p>
          <Link to="/projects">
            <Button size="lg">创建项目</Button>
          </Link>
        </div>
      </section>
    </div>
  )
}

export default HomePage
