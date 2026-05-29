import { useState, useEffect } from 'react'
import { useProjects } from '@/hooks/useProjects'
import ProjectList from '@/components/Project/ProjectList'
import ProjectCreate from '@/components/Project/ProjectCreate'
import { Button } from '@/components/ui/button'
import { Plus, Loader2 } from 'lucide-react'

function ProjectsPage() {
  const { projects, loading, fetchProjects, createProject, deleteProject } = useProjects()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [])

  const handleCreate = async (data: { title: string; description: string }) => {
    try {
      setIsCreating(true)
      await createProject({
        id: Date.now().toString(),
        title: data.title,
        description: data.description,
        content: '',
        wordCount: 0,
        chapterCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      setDialogOpen(false)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="h-full flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">我的项目</h1>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          新建项目
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">还没有项目，快来创建一个吧</p>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            创建第一个项目
          </Button>
        </div>
      ) : (
        <ProjectList projects={projects} onDelete={deleteProject} />
      )}

      <ProjectCreate
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
        loading={isCreating}
      />
    </div>
  )
}

export default ProjectsPage
