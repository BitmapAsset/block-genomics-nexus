'use client';
import { useState } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import ToolLayout from '@/components/ToolLayout';
import FileUploader from '@/components/FileUploader';

type Position = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
type Format = 'page' | 'of' | 'plain';

export default function PageNumbersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [position, setPosition] = useState<Position>('bottom-center');
  const [format, setFormat] = useState<Format>('plain');
  const [fontSize, setFontSize] = useState(12);
  const [processing, setProcessing] = useState(false);

  const handleFile = (files: File[]) => { setFile(files[0] || null); };

  const addNumbers = async () => {
    if (!file) return;
    setProcessing(true);
    try {
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();
      const total = pages.length;

      pages.forEach((page, i) => {
        const { width, height } = page.getSize();
        const num = i + 1;
        let text = '';
        if (format === 'page') text = `Page ${num}`;
        else if (format === 'of') text = `${num}/${total}`;
        else text = `${num}`;

        const textWidth = font.widthOfTextAtSize(text, fontSize);
        let x = 0, y = 0;

        if (position.includes('left')) x = 40;
        else if (position.includes('center')) x = (width - textWidth) / 2;
        else x = width - textWidth - 40;

        if (position.includes('top')) y = height - 40;
        else y = 30;

        page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
      });

      const pdfBytes = await doc.save();
      saveAs(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), 'numbered.pdf');
    } catch (e) {
      alert('Error: ' + (e as Error).message);
    }
    setProcessing(false);
  };

  return (
    <ToolLayout title="Add Page Numbers" description="Stamp page numbers on every page of your PDF.">
      {!file ? (
        <FileUploader accept=".pdf" onFiles={handleFile} />
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 flex justify-between items-center">
            <span className="font-medium truncate">{file.name}</span>
            <button onClick={() => setFile(null)} className="text-sm text-red-500">Remove</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Position</label>
              <select value={position} onChange={e => setPosition(e.target.value as Position)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
                <option value="top-left">Top Left</option>
                <option value="top-center">Top Center</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-center">Bottom Center</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Format</label>
              <select value={format} onChange={e => setFormat(e.target.value as Format)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
                <option value="plain">1, 2, 3...</option>
                <option value="page">Page 1, Page 2...</option>
                <option value="of">1/10, 2/10...</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Font Size: {fontSize}</label>
              <input type="range" min={8} max={24} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-full" />
            </div>
          </div>

          <button onClick={addNumbers} disabled={processing} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl font-semibold transition">
            {processing ? 'Processing...' : 'Add Page Numbers'}
          </button>
        </div>
      )}
    </ToolLayout>
  );
}
