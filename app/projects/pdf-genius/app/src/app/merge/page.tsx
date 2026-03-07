'use client';
import { useState, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import ToolLayout from '@/components/ToolLayout';
import FileUploader from '@/components/FileUploader';

export default function MergePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles.filter(f => f.type === 'application/pdf')]);
  }, []);

  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index));

  const moveFile = (from: number, to: number) => {
    setFiles(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  };

  const merge = async () => {
    if (files.length < 2) return;
    setProcessing(true);
    try {
      const merged = await PDFDocument.create();
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const doc = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      const pdfBytes = await merged.save();
      saveAs(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), 'merged.pdf');
    } catch (e) {
      alert('Error merging PDFs: ' + (e as Error).message);
    }
    setProcessing(false);
  };

  return (
    <ToolLayout title="Merge PDF" description="Combine multiple PDF files into one document. All processing happens in your browser.">
      <FileUploader accept=".pdf" multiple onFiles={addFiles} label="Drop PDF files here or click to browse" />

      {files.length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="font-semibold text-sm text-slate-600 dark:text-slate-400">{files.length} file(s) selected</h3>
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3">
              <span className="text-lg">📄</span>
              <span className="flex-1 text-sm truncate">{f.name}</span>
              <span className="text-xs text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
              <div className="flex gap-1">
                {i > 0 && <button onClick={() => moveFile(i, i - 1)} className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300">↑</button>}
                {i < files.length - 1 && <button onClick={() => moveFile(i, i + 1)} className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300">↓</button>}
                <button onClick={() => removeFile(i)} className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200">✕</button>
              </div>
            </div>
          ))}
          <button
            onClick={merge}
            disabled={processing || files.length < 2}
            className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl font-semibold transition"
          >
            {processing ? 'Merging...' : `Merge ${files.length} PDFs`}
          </button>
        </div>
      )}
    </ToolLayout>
  );
}
