'use client';
import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import ToolLayout from '@/components/ToolLayout';
import FileUploader from '@/components/FileUploader';

export default function SplitPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [mode, setMode] = useState<'extract' | 'every'>('extract');
  const [pages, setPages] = useState('');
  const [everyN, setEveryN] = useState(1);
  const [processing, setProcessing] = useState(false);

  const handleFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    const bytes = await f.arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    setPageCount(doc.getPageCount());
  };

  const split = async () => {
    if (!file) return;
    setProcessing(true);
    try {
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const zip = new JSZip();

      if (mode === 'extract') {
        const indices = pages.split(',').map(s => s.trim()).flatMap(s => {
          if (s.includes('-')) {
            const [a, b] = s.split('-').map(Number);
            return Array.from({ length: b - a + 1 }, (_, i) => a + i - 1);
          }
          return [Number(s) - 1];
        }).filter(i => i >= 0 && i < doc.getPageCount());

        const newDoc = await PDFDocument.create();
        const copied = await newDoc.copyPages(doc, indices);
        copied.forEach(p => newDoc.addPage(p));
        const pdfBytes = await newDoc.save();
        saveAs(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), 'extracted.pdf');
      } else {
        const total = doc.getPageCount();
        const chunks = Math.ceil(total / everyN);
        for (let c = 0; c < chunks; c++) {
          const newDoc = await PDFDocument.create();
          const start = c * everyN;
          const end = Math.min(start + everyN, total);
          const indices = Array.from({ length: end - start }, (_, i) => start + i);
          const copied = await newDoc.copyPages(doc, indices);
          copied.forEach(p => newDoc.addPage(p));
          const pdfBytes = await newDoc.save();
          zip.file(`split_${c + 1}.pdf`, pdfBytes);
        }
        const zipBytes = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBytes, 'split_pdfs.zip');
      }
    } catch (e) {
      alert('Error: ' + (e as Error).message);
    }
    setProcessing(false);
  };

  return (
    <ToolLayout title="Split PDF" description="Extract pages or split a PDF into multiple files.">
      {!file ? (
        <FileUploader accept=".pdf" onFiles={handleFile} label="Drop a PDF file here" />
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">📄</span>
            <div className="flex-1">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-sm text-slate-500">{pageCount} pages</p>
            </div>
            <button onClick={() => { setFile(null); setPageCount(0); }} className="text-sm text-red-500 hover:text-red-600">Remove</button>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setMode('extract')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'extract' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>Extract Pages</button>
            <button onClick={() => setMode('every')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'every' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>Split Every N Pages</button>
          </div>

          {mode === 'extract' ? (
            <div>
              <label className="block text-sm font-medium mb-1">Pages (e.g. 1,3,5-8)</label>
              <input value={pages} onChange={e => setPages(e.target.value)} placeholder="1,2,5-8" className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">Split every</label>
              <input type="number" min={1} max={pageCount} value={everyN} onChange={e => setEveryN(Number(e.target.value))} className="w-24 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
              <span className="ml-2 text-sm text-slate-500">pages</span>
            </div>
          )}

          <button onClick={split} disabled={processing} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl font-semibold transition">
            {processing ? 'Processing...' : 'Split PDF'}
          </button>
        </div>
      )}
    </ToolLayout>
  );
}
