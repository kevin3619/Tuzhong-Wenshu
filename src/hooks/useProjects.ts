import { useState, useCallback } from 'react'
import { Project } from '@/types'
import { novelApi } from '@/services/api/novel'
import toast from 'react-hot-toast'

export const useProjects = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await novelApi.getProjects()
      setProjects(response.data.items)
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取项目失败'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const createProject = useCallback(async (data: Partial<Project>) => {
    try {
      const response = await novelApi.createProject(data)
      setProjects(prev => [...prev, response.data])
      toast.success('项目创建成功')
      return response.data
    } catch (err) {
      const message = err instanceof Error ? err.message : '创建项目失败'
      toast.error(message)
      throw err
    }
  }, [])

  const updateProject = useCallback(async (id: string, data: Partial<Project>) => {
    try {
      const response = await novelApi.updateProject(id, data)
      setProjects(prev => prev.map(p => p.id === id ? response.data : p))
      toast.success('项目更新成功')
      return response.data
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新项目失败'
      toast.error(message)
      throw err
    }
  }, [])

  const deleteProject = useCallback(async (id: string) => {
    try {
      await novelApi.deleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      toast.success('项目删除成功')
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除项目失败'
      toast.error(message)
      throw err
    }
  }, [])

  return {
    projects,
    loading,
    error,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
  }
}
