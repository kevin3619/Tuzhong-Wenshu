import { AIModel } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Sparkles, RefreshCw } from 'lucide-react'

interface SuggestionPanelProps {
  suggestions: string[]
  onSelect: (suggestion: string) => void
  onRefresh: () => void
  loading?: boolean
  selectedModel?: AIModel
}

function SuggestionPanel({
  suggestions,
  onSelect,
  onRefresh,
  loading = false,
  selectedModel,
}: SuggestionPanelProps) {
  return (
    <div className="h-full flex flex-col gap-4 p-4 border-l border-border">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          AI 建议
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="w-8 h-8 p-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {selectedModel && (
        <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
          当前模型: {selectedModel.name}
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto">
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">选择文本后点击续写以获取建议</p>
        ) : (
          suggestions.map((suggestion, idx) => (
            <Card
              key={idx}
              className="p-3 cursor-pointer hover:bg-muted transition-colors"
              onClick={() => onSelect(suggestion)}
            >
              <p className="text-sm">{suggestion}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

export default SuggestionPanel
