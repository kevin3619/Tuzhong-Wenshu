import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '@/services/api';

export const useAuth = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const register = useCallback(async (username: string, email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authAPI.register(username, email, password);
      navigate('/login');
      return true;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authAPI.login(username, password);
      const { access_token, user } = response.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      setUser(user);
      navigate('/projects');
      return true;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/login');
  }, [navigate]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return false;

    try {
      const response = await authAPI.getCurrentUser();
      setUser(response.data);
      return true;
    } catch {
      logout();
      return false;
    }
  }, [logout]);

  return {
    user,
    loading,
    error,
    register,
    login,
    logout,
    checkAuth,
  };
};
