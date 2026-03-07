'use client';
import { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';
import FileUploader from '@/components/FileUploader';

export default function AiSummarizePage() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleFile = (files: File[]) => { setFile(files[0] || null); setSummary(''); };

  const summarize = async () => {
    if (!file) return;
    setProcessing(true);
    try {
      const { pdfjsLib } = await import('@/lib/pdf-worker');
      const bytes = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      let text = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        text += content.items.map((item: any) => item.str || '').join(' ') + '\n';
      }

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setSummary(data.summary);
    } catch (e) {
      alert('Error: ' + (e as Error).message);
    }
    setProcessing(false);
  };

  return (
    <ToolLayout title="AI Summarize PDF" description="Upload a PDF and get an AI-powered summary in seconds.">
      {!file ? (
        <FileUploader accept=".pdf" onFiles={handleFile} />
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 flex justify-between items-center">
            <span className="font-medium truncate">{file.name}</span>
            <button onClick={() => { setFile(null); setSummary(''); }} className="text-sm text-red-500">Remove</button>
          </div>

          {!summary ? (
            <button onClick={summarize} disabled={processing} className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-slate-400 disabled:to-slate-400 text-white rounded-xl font-semibold transition">
              {processing ? '🤖 Analyzing...' : '🤖 Summarize with AI'}
            </button>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><span>🤖</span> AI Summary</h3>
              <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap">{summary}</div>
            </div>
          )}
        </div>
      )}
    </ToolLayout>
  );
}
