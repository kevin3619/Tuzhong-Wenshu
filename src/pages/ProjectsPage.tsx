import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNovels } from '@/hooks/useNovels';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export default function ProjectsPage() {
  const { novels, loading, createNovel, deleteNovel } = useNovels();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    genre: 'fantasy',
  });

  const handleCreateNovel = async (e: React.FormEvent) => {
    e.preventDefault();
    const novel = await createNovel(formData);
    if (novel) {
      setFormData({ title: '', description: '', genre: 'fantasy' });
      setShowForm(false);
    }
  };

  const handleDeleteNovel = async (id: string) => {
    if (confirm('确定要删除这个项目吗？')) {
      await deleteNovel(id);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">我的项目</h1>
          <div>
            <span className="text-gray-600 mr-4">欢迎，{user?.username}！</span>
            <Button onClick={() => {
              localStorage.removeItem('access_token');
              localStorage.removeItem('user');
              navigate('/login');
            }}>
              登出
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <Button
          onClick={() => setShowForm(!showForm)}
          className="mb-8 bg-blue-500 hover:bg-blue-600"
        >
          + 新建项目
        </Button>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">创建新项目</h2>
            <form onSubmit={handleCreateNovel} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  项目名称
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  类型
                </label>
                <select
                  value={formData.genre}
                  onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="fantasy">奇幻</option>
                  <option value="romance">��情</option>
                  <option value="scifi">科幻</option>
                  <option value="mystery">悬疑</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="bg-blue-500 hover:bg-blue-600">
                  创建
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-gray-400 hover:bg-gray-500"
                >
                  取消
                </Button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-500">加载中...</div>
        ) : novels.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            <p className="text-lg">还没有项目，立即创建一个吧！</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {novels.map((novel) => (
              <div key={novel.id} className="bg-white rounded-lg shadow hover:shadow-lg transition p-6">
                <h3 className="text-xl font-bold mb-2 text-gray-800">{novel.title}</h3>
                <p className="text-gray-600 mb-4">{novel.description || '暂无描述'}</p>
                <div className="text-sm text-gray-500 mb-4">
                  <p>字数：{novel.word_count}</p>
                  <p>章节：{novel.chapter_count}</p>
                  <p>状态：{novel.status}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => navigate(`/editor/${novel.id}`)}
                    className="flex-1 bg-blue-500 hover:bg-blue-600"
                  >
                    编辑
                  </Button>
                  <Button
                    onClick={() => handleDeleteNovel(novel.id)}
                    className="flex-1 bg-red-500 hover:bg-red-600"
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
