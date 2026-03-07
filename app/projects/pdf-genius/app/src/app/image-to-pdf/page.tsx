'use client';
import { useState, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import ToolLayout from '@/components/ToolLayout';
import FileUploader from '@/components/FileUploader';

type PageSize = 'a4' | 'letter' | 'auto';

const PAGE_SIZES = { a4: { w: 595.28, h: 841.89 }, letter: { w: 612, h: 792 } };

export default function ImageToPdfPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [processing, setProcessing] = useState(false);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles.filter(f => f.type.startsWith('image/'))]);
  }, []);

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const moveFile = (from: number, to: number) => {
    setFiles(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  };

  const convert = async () => {
    if (!files.length) return;
    setProcessing(true);
    try {
      const doc = await PDFDocument.create();
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        let img;
        if (file.type === 'image/png') {
          img = await doc.embedPng(bytes);
        } else {
          img = await doc.embedJpg(bytes);
        }
        const dims = img.scale(1);

        let pageW: number, pageH: number;
        if (pageSize === 'auto') {
          pageW = dims.width;
          pageH = dims.height;
        } else {
          const s = PAGE_SIZES[pageSize];
          pageW = s.w;
          pageH = s.h;
        }

        const page = doc.addPage([pageW, pageH]);
        const scale = Math.min(pageW / dims.width, pageH / dims.height);
        const w = dims.width * scale;
        const h = dims.height * scale;
        page.drawImage(img, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
      }
      const pdfBytes = await doc.save();
      saveAs(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), 'images.pdf');
    } catch (e) {
      alert('Error: ' + (e as Error).message);
    }
    setProcessing(false);
  };

  return (
    <ToolLayout title="Image to PDF" description="Convert multiple images to a single PDF document.">
      <FileUploader accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onFiles={addFiles} label="Drop images here" />

      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Page Size</label>
            <select value={pageSize} onChange={e => setPageSize(e.target.value as PageSize)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
              <option value="auto">Auto-fit</option>
            </select>
          </div>
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3">
              <span className="text-lg">🖼️</span>
              <span className="flex-1 text-sm truncate">{f.name}</span>
              <div className="flex gap-1">
                {i > 0 && <button onClick={() => moveFile(i, i - 1)} className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-800">↑</button>}
                {i < files.length - 1 && <button onClick={() => moveFile(i, i + 1)} className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-800">↓</button>}
                <button onClick={() => removeFile(i)} className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-600">✕</button>
              </div>
            </div>
          ))}
          <button onClick={convert} disabled={processing} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl font-semibold transition">
            {processing ? 'Converting...' : `Convert ${files.length} Image(s) to PDF`}
          </button>
        </div>
      )}
    </ToolLayout>
  );
}
