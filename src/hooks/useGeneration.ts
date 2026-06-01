import { useState, useCallback } from 'react';
import { generationAPI } from '@/services/api';

export const useGeneration = () => {
  const [generating, setGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (
    prompt: string,
    context: string,
    options?: any
  ) => {
    setGenerating(true);
    setError(null);
    try {
      const response = await generationAPI.generate(prompt, context, {
        model: options?.model || 'Qwen/Qwen3-8B',
        temperature: options?.temperature || 0.8,
        max_tokens: options?.max_tokens || 500,
        top_p: options?.top_p || 0.95,
      });
      setGeneratedText(response.data.text);
      return response.data.text;
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Generation failed';
      setError(errorMsg);
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  const streamGenerate = useCallback(async (
    prompt: string,
    context: string,
    onChunk: (chunk: string) => void,
    options?: any
  ) => {
    setGenerating(true);
    setError(null);
    try {
      const response = await generationAPI.stream(prompt, context, {
        model: options?.model || 'Qwen/Qwen3-8B',
        temperature: options?.temperature || 0.8,
        max_tokens: options?.max_tokens || 500,
        top_p: options?.top_p || 0.95,
      });

      const reader = response.data.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullText += chunk;
        onChunk(chunk);
      }

      setGeneratedText(fullText);
      return fullText;
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Stream generation failed';
      setError(errorMsg);
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  const generateOutline = useCallback(async (
    novelTitle: string,
    novelDescription: string,
    chapterCount: number = 10
  ) => {
    setGenerating(true);
    setError(null);
    try {
      const response = await generationAPI.generateOutline(
        novelTitle,
        novelDescription,
        chapterCount
      );
      return response.data.outline;
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Outline generation failed';
      setError(errorMsg);
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  const generateSuggestions = useCallback(async (
    context: string,
    novelId?: string
  ) => {
    setGenerating(true);
    setError(null);
    try {
      const response = await generationAPI.generateSuggestions(context, novelId);
      setSuggestions(response.data.suggestions);
      return response.data.suggestions;
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Suggestions generation failed';
      setError(errorMsg);
      return [];
    } finally {
      setGenerating(false);
    }
  }, []);

  return {
    generating,
    generatedText,
    suggestions,
    error,
    generate,
    streamGenerate,
    generateOutline,
    generateSuggestions,
  };
};
