import { Project } from '@/types'

const STORAGE_KEY = 'tuzhong_projects'

export const projectStorage = {
  // 获取所有本地项目
  getAll: (): Project[] => {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  },

  // 获取单个项目
  get: (id: string): Project | null => {
    const projects = projectStorage.getAll()
    return projects.find(p => p.id === id) || null
  },

  // 保存项目
  save: (project: Project) => {
    const projects = projectStorage.getAll()
    const index = projects.findIndex(p => p.id === project.id)
    
    if (index >= 0) {
      projects[index] = { ...project, updatedAt: new Date() }
    } else {
      projects.push({ ...project, createdAt: new Date(), updatedAt: new Date() })
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
    return project
  },

  // 删除项目
  delete: (id: string) => {
    const projects = projectStorage.getAll()
    const filtered = projects.filter(p => p.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  },

  // 清空所有项目
  clear: () => {
    localStorage.removeItem(STORAGE_KEY)
  },
}
