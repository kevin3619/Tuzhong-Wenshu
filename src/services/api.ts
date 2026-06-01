import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (username: string, email: string, password: string) =>
    api.post('/auth/register', { username, email, password }),
  
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  
  getCurrentUser: () => api.get('/auth/me'),
};

// Novels API
export const novelsAPI = {
  list: () => api.get('/novels'),
  
  get: (id: string) => api.get(`/novels/${id}`),
  
  create: (data: any) => api.post('/novels', data),
  
  update: (id: string, data: any) => api.put(`/novels/${id}`, data),
  
  delete: (id: string) => api.delete(`/novels/${id}`),
  
  save: (id: string, content: string) =>
    api.post(`/novels/${id}/save`, { content }),
};

// Chapters API
export const chaptersAPI = {
  list: (novelId: string) => api.get(`/chapters/novels/${novelId}`),
  
  get: (id: string) => api.get(`/chapters/${id}`),
  
  create: (novelId: string, data: any) =>
    api.post(`/chapters/novels/${novelId}`, data),
  
  update: (id: string, data: any) => api.put(`/chapters/${id}`, data),
  
  delete: (id: string) => api.delete(`/chapters/${id}`),
};

// Characters API
export const charactersAPI = {
  list: (novelId?: string) => {
    const params = novelId ? { novel_id: novelId } : {};
    return api.get('/characters', { params });
  },
  
  get: (id: string) => api.get(`/characters/${id}`),
  
  create: (data: any) => api.post('/characters', data),
  
  update: (id: string, data: any) => api.put(`/characters/${id}`, data),
  
  delete: (id: string) => api.delete(`/characters/${id}`),
};

// World Settings API
export const worldSettingsAPI = {
  list: (novelId?: string) => {
    const params = novelId ? { novel_id: novelId } : {};
    return api.get('/world-settings', { params });
  },
  
  get: (id: string) => api.get(`/world-settings/${id}`),
  
  create: (data: any) => api.post('/world-settings', data),
  
  update: (id: string, data: any) => api.put(`/world-settings/${id}`, data),
  
  delete: (id: string) => api.delete(`/world-settings/${id}`),
};

// Generation API
export const generationAPI = {
  generate: (prompt: string, context: string, options: any) =>
    api.post('/generate', { prompt, context, options }),
  
  stream: (prompt: string, context: string, options: any) =>
    api.post('/generate/stream', { prompt, context, options }),
  
  generateOutline: (novelTitle: string, novelDescription: string, chapterCount: number) =>
    api.post('/generate/outline', { novel_title: novelTitle, novel_description: novelDescription, chapter_count: chapterCount }),
  
  generateSuggestions: (context: string, novelId?: string) =>
    api.post('/generate/suggestions', { context, novel_id: novelId }),
};

// Models API
export const modelsAPI = {
  list: () => api.get('/models'),
  
  get: (id: string) => api.get(`/models/${id}`),
  
  test: (id: string) => api.post(`/models/${id}/test`),
};

// Versions API
export const versionsAPI = {
  list: (novelId: string) => api.get(`/versions/novels/${novelId}`),
  
  get: (id: string) => api.get(`/versions/${id}`),
  
  create: (novelId: string, content: string, description: string) =>
    api.post(`/versions/novels/${novelId}`, { content, description }),
  
  restore: (id: string) => api.post(`/versions/${id}/restore`),
  
  delete: (id: string) => api.delete(`/versions/${id}`),
};

// Search API
export const searchAPI = {
  search: (query: string, category?: string) =>
    api.post('/search', { query, category }),
  
  getByStatus: (status: string) =>
    api.get(`/search/novels/by-status/${status}`),
  
  getByGenre: (genre: string) =>
    api.get(`/search/novels/by-genre/${genre}`),
};

// Users API
export const usersAPI = {
  getProfile: () => api.get('/users/profile'),
  
  getStats: () => api.get('/users/stats'),
};

// Export API
export const exportAPI = {
  exportToTxt: (novelId: string, includeMetadata: boolean = true) =>
    api.post(`/export/novels/${novelId}/txt`, { include_metadata: includeMetadata }, {
      responseType: 'blob',
    }),
  
  exportToHtml: (novelId: string, includeMetadata: boolean = true) =>
    api.post(`/export/novels/${novelId}/html`, { include_metadata: includeMetadata }, {
      responseType: 'blob',
    }),
  
  exportToMarkdown: (novelId: string, includeMetadata: boolean = true) =>
    api.post(`/export/novels/${novelId}/markdown`, { include_metadata: includeMetadata }, {
      responseType: 'blob',
    }),
};

export default api;
