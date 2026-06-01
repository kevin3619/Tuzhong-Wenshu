import { useState } from 'react';
import { useNovels } from '@/hooks/useNovels';
import { exportAPI } from '@/services/api';
import { Button } from '@/components/ui/button';

export default function ExportPage() {
  const { novels } = useNovels();
  const [selectedNovelId, setSelectedNovelId] = useState('');
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'txt' | 'html' | 'markdown') => {
    if (!selectedNovelId) return;

    setExporting(true);
    try {
      let response;
      const novel = novels.find(n => n.id === selectedNovelId);
      
      if (format === 'txt') {
        response = await exportAPI.exportToTxt(selectedNovelId);
      } else if (format === 'html') {
        response = await exportAPI.exportToHtml(selectedNovelId);
      } else {
        response = await exportAPI.exportToMarkdown(selectedNovelId);
      }

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${novel?.title}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.parentElement?.removeChild(link);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">导出小说</h1>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择小说
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

          <div className="space-y-3">
            <Button
              onClick={() => handleExport('txt')}
              disabled={exporting || !selectedNovelId}
              className="w-full bg-blue-500 hover:bg-blue-600"
            >
              {exporting ? '导出中...' : '导出为 TXT'}
            </Button>
            <Button
              onClick={() => handleExport('html')}
              disabled={exporting || !selectedNovelId}
              className="w-full bg-green-500 hover:bg-green-600"
            >
              {exporting ? '导出中...' : '导出为 HTML'}
            </Button>
            <Button
              onClick={() => handleExport('markdown')}
              disabled={exporting || !selectedNovelId}
              className="w-full bg-purple-500 hover:bg-purple-600"
            >
              {exporting ? '导出中...' : '导出为 Markdown'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
