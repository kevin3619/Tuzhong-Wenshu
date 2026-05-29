import { AIModel } from '@/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'

interface ModelListProps {
  models: AIModel[]
  selectedId?: string
  onSelect: (model: AIModel) => void
}

function ModelList({ models, selectedId, onSelect }: ModelListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {models.map(model => (
        <Card
          key={model.id}
          className={`p-4 cursor-pointer transition-all ${
            selectedId === model.id
              ? 'ring-2 ring-primary bg-primary/5'
              : 'hover:border-primary'
          }`}
          onClick={() => onSelect(model)}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="font-semibold">{model.name}</h3>
              <p className="text-sm text-muted-foreground">{model.provider}</p>
            </div>
            {selectedId === model.id && (
              <Check className="h-5 w-5 text-primary" />
            )}
          </div>
          <p className="text-sm mb-3">{model.description}</p>
          <div className="flex items-center gap-2">
            {model.freeQuota && (
              <Badge variant="secondary" className="bg-green-100 text-green-700 border-0">
                免费额度
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              最大 {model.maxTokens} tokens
            </span>
          </div>
        </Card>
      ))}
    </div>
  )
}

export default ModelList
