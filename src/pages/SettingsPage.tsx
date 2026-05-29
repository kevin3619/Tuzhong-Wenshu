import { useModels } from '@/hooks/useModels'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import ModelList from '@/components/ModelSelector/ModelList'

function SettingsPage() {
  const { models, selectedModel, setDefault } = useModels()

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">设置</h1>
        <p className="text-muted-foreground">管理你的 AI 模型和应用设置</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI 模型</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-6">选择你想使用的 AI 模型。选定的模型将在编辑器中默认使用。</p>
          <ModelList
            models={models}
            selectedId={selectedModel?.id}
            onSelect={(model) => setDefault(model.id)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API 密钥</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">配置你的 API 密钥以使用不同的模型提供者。</p>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">硅基流动 API Key</label>
              <input
                type="password"
                placeholder="输入你的硅基流动 API Key"
                className="w-full mt-2 px-3 py-2 border border-input rounded-md"
              />
            </div>
            <div>
              <label className="text-sm font-medium">OpenAI API Key</label>
              <input
                type="password"
                placeholder="输入你的 OpenAI API Key"
                className="w-full mt-2 px-3 py-2 border border-input rounded-md"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default SettingsPage
