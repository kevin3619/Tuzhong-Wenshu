import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { chaptersAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ChapterManagementPage() {
  const { novelId } = useParams();
  const [chapters, setChapters] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    chapter_number: 1,
    title: '',
    outline: '',
    content: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchChapters();
  }, [novelId]);

  const fetchChapters = async () => {
    if (!novelId) return;
    setLoading(true);
    try {
      const response = await chaptersAPI.list(novelId);
      setChapters(response.data);
    } catch (error) {
      console.error('Failed to fetch chapters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await chaptersAPI.update(editingId, formData);
      } else {
        if (!novelId) return;
        await chaptersAPI.create(novelId, formData);
      }
      resetForm();
      fetchChapters();
    } catch (error) {
      console.error('Failed to save chapter:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这一章吗？')) {
      try {
        await chaptersAPI.delete(id);
        fetchChapters();
      } catch (error) {
        console.error('Failed to delete chapter:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      chapter_number: Math.max(...chapters.map(c => c.chapter_number), 0) + 1,
      title: '',
      outline: '',
      content: '',
    });
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (chapter: any) => {
    setFormData(chapter);
    setEditingId(chapter.id);
    setShowForm(true);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">章节管理</h1>

        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="mb-8 bg-blue-500 hover:bg-blue-600"
        >
          + 新建章节
        </Button>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? '编辑章节' : '新建章节'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    章节号
                  </label>
                  <Input
                    type="number"
                    value={formData.chapter_number}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        chapter_number: parseInt(e.target.value),
                      })
                    }
                    min="1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    章节标题
                  </label>
                  <Input
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="输入章节标题"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  章节大纲
                </label>
                <textarea
                  value={formData.outline}
                  onChange={(e) =>
                    setFormData({ ...formData, outline: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-20"
                  placeholder="用一句话汇总此章内容"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  章节内容
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg h-32"
                  placeholder="章节内容..."
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
        ) : chapters.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            <p>还没有章节，立即添加一个！</p>
          </div>
        ) : (
          <div className="space-y-4">
            {chapters.map((chapter) => (
              <div
                key={chapter.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-800">
                      第 {chapter.chapter_number} 章: {chapter.title}
                    </h3>
                    {chapter.outline && (
                      <p className="text-gray-600 text-sm mt-2">大纲: {chapter.outline}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      size="sm"
                      onClick={() => startEdit(chapter)}
                      className="bg-blue-500 hover:bg-blue-600 text-xs"
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDelete(chapter.id)}
                      className="bg-red-500 hover:bg-red-600 text-xs"
                    >
                      删除
                    </Button>
                  </div>
                </div>
                {chapter.content && (
                  <div className="bg-gray-50 p-4 rounded max-h-24 overflow-hidden">
                    <p className="text-gray-700 text-sm line-clamp-3">{chapter.content}</p>
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
