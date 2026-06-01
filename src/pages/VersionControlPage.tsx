import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { versionsAPI } from '@/services/api';
import { Button } from '@/components/ui/button';

export default function VersionControlPage() {
  const { novelId } = useParams();
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    fetchVersions();
  }, [novelId]);

  const fetchVersions = async () => {
    if (!novelId) return;
    setLoading(true);
    try {
      const response = await versionsAPI.list(novelId);
      setVersions(response.data);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedVersion) return;
    setRestoring(true);
    try {
      await versionsAPI.restore(selectedVersion.id);
      alert('版本已恢复！');
      fetchVersions();
      setSelectedVersion(null);
    } catch (error) {
      console.error('Failed to restore version:', error);
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个版本吗？')) {
      try {
        await versionsAPI.delete(id);
        fetchVersions();
        setSelectedVersion(null);
      } catch (error) {
        console.error('Failed to delete version:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">版本治理</h1>

        {loading ? (
          <div className="text-center text-gray-500">加载中...</div>
        ) : versions.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            <p>暂无版本记录</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-6">
            {/* Version List */}
            <div className="col-span-1">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold mb-4">版本一觨</h2>
                <div className="space-y-2">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      onClick={() => setSelectedVersion(version)}
                      className={`w-full text-left p-3 rounded border-2 transition ${
                        selectedVersion?.id === version.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium text-sm">v{version.version_number}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(version.created_at).toLocaleDateString()}
                      </p>
                      {version.description && (
                        <p className="text-xs text-gray-600 line-clamp-1 mt-1">
                          {version.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Version Detail */}
            <div className="col-span-2">
              {selectedVersion ? (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-800">
                        版本 {selectedVersion.version_number}
                      </h2>
                      <p className="text-gray-500 text-sm mt-1">
                        {new Date(selectedVersion.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleRestore}
                        disabled={restoring}
                        className="bg-green-500 hover:bg-green-600"
                      >
                        {restoring ? '恢复中...' : '恢复此版本'}
                      </Button>
                      <Button
                        onClick={() => handleDelete(selectedVersion.id)}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        删除
                      </Button>
                    </div>
                  </div>

                  {selectedVersion.description && (
                    <div className="mb-4 pb-4 border-b border-gray-200">
                      <p className="text-sm text-gray-600">
                        {selectedVersion.description}
                      </p>
                    </div>
                  )}

                  <div>
                    <h3 className="font-bold text-gray-800 mb-2">内容</h3>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200 max-h-96 overflow-y-auto">
                      <p className="text-gray-700 whitespace-pre-wrap text-sm">
                        {selectedVersion.content}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                  <p>选择一个版本以查看详情</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
