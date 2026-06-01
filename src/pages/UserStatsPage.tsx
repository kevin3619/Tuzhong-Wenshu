import { useEffect, useState } from 'react';
import { useNovels } from '@/hooks/useNovels';
import { usersAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export default function UserStatsPage() {
  const { user, logout } = useAuth();
  const { novels } = useNovels();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await usersAPI.getStats();
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">个人中心</h1>
          <Button
            onClick={logout}
            className="bg-red-500 hover:bg-red-600"
          >
            登出
          </Button>
        </div>

        {/* User Info */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">账户信息</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-gray-600 text-sm">用户名</p>
              <p className="text-lg font-bold text-gray-800">{user?.username}</p>
            </div>
            <div>
              <p className="text-gray-600 text-sm">邮箱</p>
              <p className="text-lg font-bold text-gray-800">{user?.email}</p>
            </div>
            <div>
              <p className="text-gray-600 text-sm">注册时间</p>
              <p className="text-lg font-bold text-gray-800">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Statistics */}
        {loading ? (
          <div className="text-center text-gray-500">加载中...</div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-gray-600 text-sm mb-2">小说数量</p>
              <p className="text-3xl font-bold text-blue-600">{stats.total_novels}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-gray-600 text-sm mb-2">章节总数</p>
              <p className="text-3xl font-bold text-green-600">{stats.total_chapters}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-gray-600 text-sm mb-2">字数</p>
              <p className="text-3xl font-bold text-purple-600">
                {(stats.total_words / 1000).toFixed(1)}k
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-gray-600 text-sm mb-2">人物数</p>
              <p className="text-3xl font-bold text-orange-600">
                {stats.total_characters}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-gray-600 text-sm mb-2">世界观</p>
              <p className="text-3xl font-bold text-pink-600">
                {stats.total_world_settings}
              </p>
            </div>
          </div>
        ) : null}

        {/* Recent Novels */}
        {novels.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mt-8">
            <h2 className="text-xl font-bold mb-4">最近的作品</h2>
            <div className="space-y-2">
              {novels.slice(0, 5).map((novel) => (
                <div key={novel.id} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded">
                  <div>
                    <p className="font-medium text-gray-800">{novel.title}</p>
                    <p className="text-sm text-gray-500">
                      {novel.word_count} 字 • {novel.chapter_count} 章
                    </p>
                  </div>
                  <p className="text-sm text-gray-600">
                    {new Date(novel.updated_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
