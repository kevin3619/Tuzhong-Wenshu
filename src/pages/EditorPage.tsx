import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useNovels } from '@/hooks/useNovels';
import { useGeneration } from '@/hooks/useGeneration';
import { Button } from '@/components/ui/button';
import MonacoEditor from '@monaco-editor/react';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { currentNovel, fetchNovel, updateNovel } = useNovels();
  const { generating, suggestions, generateSuggestions } = useGeneration();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      fetchNovel(id).then((novel) => {
        if (novel) setContent(novel.content);
      });
    }
  }, [id, fetchNovel]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    await updateNovel(id, { content, word_count: content.split(' ').length });
    setSaving(false);
  };

  const handleGenerateSuggestions = async () => {
    if (!id) return;
    await generateSuggestions(content, id);
  };

  const applySuggestion = (suggestion: string) => {
    setContent(content + '\n\n' + suggestion);
  };

  return (
    <div className="flex h-screen">
      {/* Editor */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white shadow p-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">{currentNovel?.title}</h1>
          <div className="flex gap-2">
            <Button
              onClick={handleGenerateSuggestions}
              disabled={generating}
              className="bg-green-500 hover:bg-green-600"
            >
              {generating ? '生成中...' : '生成续写'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-500 hover:bg-blue-600"
            >
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            height="100%"
            defaultLanguage="markdown"
            value={content}
            onChange={(value) => setContent(value || '')}
            theme="vs-light"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
            }}
          />
        </div>
      </div>

      {/* Suggestions Sidebar */}
      <div className="w-64 bg-white shadow border-l border-gray-200 p-4 overflow-y-auto">
        <h2 className="font-bold text-lg mb-4">续写建议</h2>
        {suggestions.length === 0 ? (
          <p className="text-gray-500 text-sm">点击"生成续写"获取建议</p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion, idx) => (
              <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200">
                <p className="text-sm text-gray-700 mb-2">{suggestion}</p>
                <Button
                  size="sm"
                  onClick={() => applySuggestion(suggestion)}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-xs"
                >
                  应用
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
