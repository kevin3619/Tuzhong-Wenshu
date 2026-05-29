import { AIModel } from '@/types'
import { useModels } from '@/hooks/useModels'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function ModelSwitcher() {
  const { models, selectedModel, setDefault } = useModels()

  return (
    <div className="w-64">
      <Select
        value={selectedModel?.id || ''}
        onValueChange={setDefault}
      >
        <SelectTrigger>
          <SelectValue placeholder="选择 AI 模型" />
        </SelectTrigger>
        <SelectContent>
          {models.map(model => (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-2">
                <span>{model.name}</span>
                {model.freeQuota && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                    免费
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default ModelSwitcher
