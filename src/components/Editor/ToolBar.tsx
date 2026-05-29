import { Button } from '@/components/ui/button'
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
} from 'lucide-react'

interface ToolBarProps {
  onFormat: (format: string) => void
}

function ToolBar({ onFormat }: ToolBarProps) {
  const tools = [
    { icon: Bold, label: '粗体', format: 'bold' },
    { icon: Italic, label: '斜体', format: 'italic' },
    { icon: Quote, label: '引用', format: 'quote' },
    { icon: List, label: '无序列表', format: 'ul' },
    { icon: ListOrdered, label: '有序列表', format: 'ol' },
    { icon: Undo2, label: '撤销', format: 'undo' },
    { icon: Redo2, label: '重做', format: 'redo' },
  ]

  return (
    <div className="flex items-center gap-1 border-b border-border pb-2">
      {tools.map(tool => {
        const Icon = tool.icon
        return (
          <Button
            key={tool.format}
            variant="ghost"
            size="sm"
            onClick={() => onFormat(tool.format)}
            title={tool.label}
            className="w-8 h-8 p-0"
          >
            <Icon className="h-4 w-4" />
          </Button>
        )
      })}
    </div>
  )
}

export default ToolBar
