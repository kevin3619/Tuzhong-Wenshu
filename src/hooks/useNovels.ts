import { useState, useCallback, useEffect } from 'react';
import { novelsAPI, chaptersAPI } from '@/services/api';

export const useNovels = () => {
  const [novels, setNovels] = useState<any[]>([]);
  const [currentNovel, setCurrentNovel] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNovels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await novelsAPI.list();
      setNovels(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch novels');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNovel = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await novelsAPI.get(id);
      setCurrentNovel(response.data);
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch novel');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createNovel = useCallback(async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      const response = await novelsAPI.create(data);
      setNovels([...novels, response.data]);
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create novel');
      return null;
    } finally {
      setLoading(false);
    }
  }, [novels]);

  const updateNovel = useCallback(async (id: string, data: any) => {
    setLoading(true);
    setError(null);
    try {
      const response = await novelsAPI.update(id, data);
      setNovels(novels.map(n => n.id === id ? response.data : n));
      if (currentNovel?.id === id) setCurrentNovel(response.data);
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update novel');
      return null;
    } finally {
      setLoading(false);
    }
  }, [novels, currentNovel]);

  const deleteNovel = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await novelsAPI.delete(id);
      setNovels(novels.filter(n => n.id !== id));
      if (currentNovel?.id === id) setCurrentNovel(null);
      return true;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete novel');
      return false;
    } finally {
      setLoading(false);
    }
  }, [novels, currentNovel]);

  const saveNovel = useCallback(async (id: string, content: string) => {
    try {
      const response = await novelsAPI.save(id, content);
      if (currentNovel?.id === id) setCurrentNovel(response.data);
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save novel');
      return null;
    }
  }, [currentNovel]);

  useEffect(() => {
    fetchNovels();
  }, [fetchNovels]);

  return {
    novels,
    currentNovel,
    loading,
    error,
    fetchNovels,
    fetchNovel,
    createNovel,
    updateNovel,
    deleteNovel,
    saveNovel,
  };
};
