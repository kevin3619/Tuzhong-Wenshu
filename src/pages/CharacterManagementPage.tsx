import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { charactersAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CharacterManagementPage() {
  const { novelId } = useParams();
  const [characters, setCharacters] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    personality: '',
    background: '',
    role: '',
  });

  useEffect(() => {
    fetchCharacters();
  }, [novelId]);

  const fetchCharacters = async () => {
    try {
      const response = await charactersAPI.list(novelId);
      setCharacters(response.data);
    } catch (error) {
      console.error('Failed to fetch characters:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await charactersAPI.update(editingId, formData);
      } else {
        await charactersAPI.create({
          ...formData,
          novel_id: novelId,
        });
      }
      resetForm();
      fetchCharacters();
    } catch (error) {
      console.error('Failed to save character:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个人物吗？')) {
      try {
        await charactersAPI.delete(id);
        fetchCharacters();
      } catch (error) {
        console.error('Failed to delete character:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      personality: '',
      background: '',
      role: '',
    });
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (character: any) => {
    setFormData(character);
    setEditingId(character.id);
    setShowForm(true);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">人物管理</h1>

        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="mb-8 bg-blue-500 hover:bg-blue-600"
        >
          + 新增人物
        </Button>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? '编辑人物' : '新增人物'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    人物名称
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="输入人物名称"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    角色
                  </label>
                  <Input
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value })
                    }
                    placeholder="主角、配角、反派等"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  外貌描写
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-20"
                  placeholder="描写人物外貌"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  性格特点
                </label>
                <textarea
                  value={formData.personality}
                  onChange={(e) =>
                    setFormData({ ...formData, personality: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-20"
                  placeholder="描写人物性格"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  背景故事
                </label>
                <textarea
                  value={formData.background}
                  onChange={(e) =>
                    setFormData({ ...formData, background: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-20"
                  placeholder="人物的背景故事"
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {characters.map((character) => (
            <div
              key={character.id}
              className="bg-white rounded-lg shadow hover:shadow-lg transition p-6"
            >
              <h3 className="text-lg font-bold mb-2 text-gray-800">
                {character.name}
              </h3>
              {character.role && (
                <p className="text-sm text-blue-600 mb-2">角色：{character.role}</p>
              )}
              {character.description && (
                <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                  {character.description}
                </p>
              )}
              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  onClick={() => startEdit(character)}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-xs"
                >
                  编辑
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleDelete(character.id)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-xs"
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
