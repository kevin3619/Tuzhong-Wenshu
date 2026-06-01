import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { worldSettingsAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function WorldSettingPage() {
  const { novelId } = useParams();
  const [worldSettings, setWorldSettings] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    rules: '',
    history: '',
    geography: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchWorldSettings();
  }, [novelId]);

  const fetchWorldSettings = async () => {
    setLoading(true);
    try {
      const response = await worldSettingsAPI.list(novelId);
      setWorldSettings(response.data);
    } catch (error) {
      console.error('Failed to fetch world settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await worldSettingsAPI.update(editingId, formData);
      } else {
        await worldSettingsAPI.create({
          ...formData,
          novel_id: novelId,
        });
      }
      resetForm();
      fetchWorldSettings();
    } catch (error) {
      console.error('Failed to save world setting:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个世界观设定吗？')) {
      try {
        await worldSettingsAPI.delete(id);
        fetchWorldSettings();
      } catch (error) {
        console.error('Failed to delete world setting:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      rules: '',
      history: '',
      geography: '',
    });
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (setting: any) => {
    setFormData(setting);
    setEditingId(setting.id);
    setShowForm(true);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">世界观管理</h1>

        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="mb-8 bg-blue-500 hover:bg-blue-600"
        >
          + 新增世界观设定
        </Button>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? '编辑世界观' : '新增世界观'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  世界观名称
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="不列璠帝国、一个撒津破美的圣滋的湖笑..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  世界总体描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-20"
                  placeholder="整个世界的总体描述"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  世界规则 (魔法、能力的限制等)
                </label>
                <textarea
                  value={formData.rules}
                  onChange={(e) =>
                    setFormData({ ...formData, rules: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-20"
                  placeholder="详细的世界规则"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  世界歷史
                </label>
                <textarea
                  value={formData.history}
                  onChange={(e) =>
                    setFormData({ ...formData, history: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-20"
                  placeholder="世界历史背景"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  地理信息
                </label>
                <textarea
                  value={formData.geography}
                  onChange={(e) =>
                    setFormData({ ...formData, geography: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-20"
                  placeholder="欧大陆、各个城市、地侧不寨之地等"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="flex-1 bg-blue-500 hover:bg-blue-600"
                >
                  保存
                </Button>
                <Button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-gray-400 hover:bg-gray-500"
                >
                  取消
                </Button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-500">加载中...</div>
        ) : worldSettings.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            <p>还没有世界观设定，立即新增一个！</p>
          </div>
        ) : (
          <div className="space-y-4">
            {worldSettings.map((setting) => (
              <div
                key={setting.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-gray-800">{setting.name}</h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => startEdit(setting)}
                      className="bg-blue-500 hover:bg-blue-600 text-xs"
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDelete(setting.id)}
                      className="bg-red-500 hover:bg-red-600 text-xs"
                    >
                      删除
                    </Button>
                  </div>
                </div>
                
                {setting.description && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-gray-600 mb-1">描述</p>
                    <p className="text-gray-700">{setting.description}</p>
                  </div>
                )}
                
                {setting.rules && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-gray-600 mb-1">规则</p>
                    <p className="text-gray-700 line-clamp-2">{setting.rules}</p>
                  </div>
                )}
                
                {setting.geography && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-gray-600 mb-1">地理</p>
                    <p className="text-gray-700 line-clamp-2">{setting.geography}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
