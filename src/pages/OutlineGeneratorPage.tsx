import { useState } from 'react';
import { useNovels } from '@/hooks/useNovels';
import { useGeneration } from '@/hooks/useGeneration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function OutlineGeneratorPage() {
  const { novels } = useNovels();
  const { generating, generateOutline } = useGeneration();
  const [selectedNovelId, setSelectedNovelId] = useState('');
  const [chapterCount, setChapterCount] = useState(10);
  const [outline, setOutline] = useState('');

  const handleGenerate = async () => {
    const novel = novels.find(n => n.id === selectedNovelId);
    if (!novel) return;

    const generatedOutline = await generateOutline(
      novel.title,
      novel.description || '',
      chapterCount
    );
    if (generatedOutline) {
      setOutline(generatedOutline);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">大纲生成器</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">选择小说</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                小说
              </label>
              <select
                value={selectedNovelId}
                onChange={(e) => setSelectedNovelId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">选择一个小说...</option>
                {novels.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                章节数量
              </label>
              <Input
                type="number"
                value={chapterCount}
                onChange={(e) => setChapterCount(parseInt(e.target.value))}
                min="1"
                max="100"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generating || !selectedNovelId}
              className="w-full bg-blue-500 hover:bg-blue-600"
            >
              {generating ? '生成中...' : '生成大纲'}
            </Button>
          </div>
        </div>

        {outline && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">生成的大纲</h2>
            <div className="bg-gray-50 p-4 rounded border border-gray-200">
              <pre className="whitespace-pre-wrap text-sm text-gray-700">
                {outline}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
