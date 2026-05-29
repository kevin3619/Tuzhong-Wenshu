import { useState, useCallback } from 'react'
import { GenerationOptions } from '@/types'
import { novelApi } from '@/services/api/novel'
import toast from 'react-hot-toast'

export const useEditor = () => {
  const [generating, setGenerating] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])

  const generateContent = useCallback(
    async (
      prompt: string,
      context: string,
      options: GenerationOptions
    ) => {
      try {
        setGenerating(true)
        const response = await novelApi.generateContent({
          prompt,
          context,
          options,
        })
        return response.data.text
      } catch (error) {
        const message = error instanceof Error ? error.message : '生成失败'
        toast.error(message)
        throw error
      } finally {
        setGenerating(false)
      }
    },
    []
  )

  const getSuggestions = useCallback(
    async (projectId: string, text: string) => {
      try {
        const response = await novelApi.getSuggestions(projectId, text)
        setSuggestions(response.data)
        return response.data
      } catch (error) {
        console.error('Failed to get suggestions:', error)
        return []
      }
    },
    []
  )

  return {
    generating,
    suggestions,
    generateContent,
    getSuggestions,
  }
}
