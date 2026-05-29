import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Project } from '@/types'
import TextEditor from '@/components/Editor/TextEditor'
import SuggestionPanel from '@/components/Editor/SuggestionPanel'
import ModelSwitcher from '@/components/ModelSelector/ModelSwitcher'
import { useProjects } from '@/hooks/useProjects'
import { useModels } from '@/hooks/useModels'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'
import toast from 'react-hot-toast'

function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const { projects, updateProject } = useProjects()
  const { selectedModel } = useModels()
  const [project, setProject] = useState<Project | null>(null)
  const [content, setContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (id) {
      const found = projects.find(p => p.id === id)
      if (found) {
        setProject(found)
        setContent(found.content)
      }
    }
  }, [id, projects])

  const handleSave = async () => {
    if (!project) return
    try {
      setIsSaving(true)
      await updateProject(project.id, {
        ...project,
        content,
        wordCount: content.length,
      })
      toast.success('已保存')
    } catch (error) {
      console.error('Save failed:', error)
    } finally {
      setIsSaving(false)
    }
  }

  if (!project) {
    return <div className="p-4">项目加载中...</div>
  }

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{project.title}</h2>
          <p className="text-sm text-muted-foreground">{content.length} 字</p>
        </div>
        <div className="flex items-center gap-4">
          <ModelSwitcher />
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            <Save className="h-4 w-4" />
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <TextEditor value={content} onChange={setContent} />
        </div>
        <div className="hidden lg:flex w-80">
          <SuggestionPanel
            suggestions={[]}
            onSelect={(s) => setContent(content + s)}
            onRefresh={() => {}}
            selectedModel={selectedModel || undefined}
          />
        </div>
      </div>
    </div>
  )
}

export default EditorPage
