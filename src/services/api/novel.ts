import client from './client'
import { Project, GenerationRequest, GenerationResponse } from '@/types'
import { ApiResponse, PaginatedResponse } from '@/types/api'

export const novelApi = {
  // 获取所有项目
  getProjects: () =>
    client.get<ApiResponse<PaginatedResponse<Project>>>('/novels'),

  // 获取单个项目
  getProject: (id: string) =>
    client.get<ApiResponse<Project>>(`/novels/${id}`),

  // 创建项目
  createProject: (data: Partial<Project>) =>
    client.post<ApiResponse<Project>>('/novels', data),

  // 更新项目
  updateProject: (id: string, data: Partial<Project>) =>
    client.put<ApiResponse<Project>>(`/novels/${id}`, data),

  // 删除项目
  deleteProject: (id: string) =>
    client.delete<ApiResponse<null>>(`/novels/${id}`),

  // AI 生成内容
  generateContent: (data: GenerationRequest) =>
    client.post<ApiResponse<GenerationResponse>>('/generate', data),

  // AI 流式生成
  streamGenerate: (data: GenerationRequest) =>
    client.post('/generate/stream', data, {
      responseType: 'stream',
    }),

  // 获取续写建议
  getSuggestions: (projectId: string, text: string) =>
    client.post<ApiResponse<string[]>>(`/novels/${projectId}/suggestions`, { text }),

  // 保存项目
  saveProject: (id: string, content: string) =>
    client.put<ApiResponse<Project>>(`/novels/${id}/save`, { content }),
}
