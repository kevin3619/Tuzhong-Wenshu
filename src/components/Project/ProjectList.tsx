import { Link } from 'react-router-dom'
import { Project } from '@/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Edit2, Trash2, BookOpen } from 'lucide-react'

interface ProjectListProps {
  projects: Project[]
  onDelete: (id: string) => void
}

function ProjectList({ projects, onDelete }: ProjectListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map(project => (
        <Card key={project.id} className="p-4 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <div className="flex gap-2">
              <Link to={`/editor/${project.id}`}>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Edit2 className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                onClick={() => onDelete(project.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <h3 className="font-semibold mb-1">{project.title}</h3>
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {project.description}
          </p>

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{project.wordCount} 字</span>
            <span>{project.chapterCount} 章</span>
          </div>
        </Card>
      ))}
    </div>
  )
}

export default ProjectList
