import client from './client'
import { AIModel } from '@/types'
import { ApiResponse } from '@/types/api'

export const modelsApi = {
  // 获取所有可用模型
  getModels: () =>
    client.get<ApiResponse<AIModel[]>>('/models'),

  // 获取模型详情
  getModel: (id: string) =>
    client.get<ApiResponse<AIModel>>(`/models/${id}`),

  // 测试模型连接
  testModel: (id: string) =>
    client.post<ApiResponse<{ success: boolean }>>(`/models/${id}/test`, {}),

  // 获取用户配置的模型
  getUserModels: () =>
    client.get<ApiResponse<AIModel[]>>('/user/models'),

  // 设置默认模型
  setDefaultModel: (modelId: string) =>
    client.put<ApiResponse<null>>('/user/default-model', { modelId }),
}
