import { useState, useCallback, useEffect } from 'react'
import { AIModel } from '@/types'
import { modelsApi } from '@/services/api/models'

export const useModels = () => {
  const [models, setModels] = useState<AIModel[]>([])
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchModels = useCallback(async () => {
    try {
      setLoading(true)
      const response = await modelsApi.getModels()
      setModels(response.data)
      if (response.data.length > 0) {
        setSelectedModel(response.data[0])
      }
    } catch (error) {
      console.error('Failed to fetch models:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchModels()
  }, [])

  const setDefault = useCallback(async (modelId: string) => {
    try {
      await modelsApi.setDefaultModel(modelId)
      const model = models.find(m => m.id === modelId)
      if (model) setSelectedModel(model)
    } catch (error) {
      console.error('Failed to set default model:', error)
    }
  }, [models])

  return {
    models,
    selectedModel,
    loading,
    fetchModels,
    setDefault,
  }
}
