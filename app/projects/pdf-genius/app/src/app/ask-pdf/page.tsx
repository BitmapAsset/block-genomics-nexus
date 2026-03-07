'use client';
import { useState, useRef, useEffect } from 'react';
import ToolLayout from '@/components/ToolLayout';
import FileUploader from '@/components/FileUploader';

interface Message { role: 'user' | 'assistant'; content: string; }

export default function AskPdfPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [messages]);

  const handleFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setExtracting(true);
    try {
      const { pdfjsLib } = await import('@/lib/pdf-worker');
      const bytes = await f.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      let text = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        text += content.items.map((item: any) => item.str || '').join(' ') + '\n';
      }
      setPdfText(text);
      setMessages([{ role: 'assistant', content: `I've loaded "${f.name}" (${doc.numPages} pages). Ask me anything about it!` }]);
    } catch (e) {
      alert('Error extracting text: ' + (e as Error).message);
    }
    setExtracting(false);
  };

  const ask = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: question }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch('/api/ask-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pdfText,
          question,
          history: newMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error getting answer. Please try again.' }]);
    }
    setLoading(false);
  };

  return (
    <ToolLayout title="Ask Your PDF" description="Chat with any PDF document using AI.">
      {!file ? (
        <FileUploader accept=".pdf" onFiles={handleFile} />
      ) : extracting ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3 animate-bounce">📄</div>
          <p className="text-slate-600 dark:text-slate-400">Extracting text from PDF...</p>
        </div>
      ) : (
        <div className="flex flex-col h-[600px] bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <span>📄</span>
            <span className="text-sm font-medium truncate">{file.name}</span>
            <button onClick={() => { setFile(null); setPdfText(''); setMessages([]); }} className="ml-auto text-xs text-red-500">Close</button>
          </div>

          <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-400">
                  Thinking...
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ask()}
                placeholder="Ask a question about the PDF..."
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              />
              <button onClick={ask} disabled={loading || !input.trim()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-lg font-medium text-sm transition">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
