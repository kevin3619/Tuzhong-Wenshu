import { useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { generateContent, useEditor } from '@/hooks/useEditor'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

interface TextEditorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

function TextEditor({ value, onChange, disabled = false }: TextEditorProps) {
  const { generateContent, generating } = useEditor()
  const [selectedText, setSelectedText] = useState('')

  const handleGenerate = useCallback(async () => {
    if (!selectedText) {
      toast.error('请先选择文本作为续写的上文')
      return
    }

    try {
      const result = await generateContent(
        '继续创作这个故事',
        selectedText,
        {
          model: 'Qwen/Qwen3-8B',
          temperature: 0.8,
          maxTokens: 500,
          topP: 0.95,
        }
      )
      onChange(value + result)
      toast.success('内容生成成功')
    } catch (error) {
      console.error('Generation failed:', error)
    }
  }, [selectedText, value, onChange, generateContent])

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">编辑器</h2>
        <Button
          onClick={handleGenerate}
          disabled={disabled || generating || !selectedText}
          size="sm"
          className="gap-2"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              AI 续写
            </>
          )}
        </Button>
      </div>

      <div className="flex-1 border border-border rounded-lg overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="markdown"
          value={value}
          onChange={(val) => onChange(val || '')}
          theme="vs-light"
          options={{
            minimap: { enabled: false },
            wordWrap: 'on',
            lineNumbers: 'off',
            folding: false,
            fontSize: 14,
            lineHeight: 24,
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  )
}

export default TextEditor
