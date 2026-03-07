'use client';
import { useState } from 'react';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { saveAs } from 'file-saver';
import ToolLayout from '@/components/ToolLayout';
import FileUploader from '@/components/FileUploader';

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('CONFIDENTIAL');
  const [opacity, setOpacity] = useState(0.3);
  const [rotation, setRotation] = useState(45);
  const [fontSize, setFontSize] = useState(48);
  const [processing, setProcessing] = useState(false);

  const handleFile = (files: File[]) => { setFile(files[0] || null); };

  const addWatermark = async () => {
    if (!file || !text) return;
    setProcessing(true);
    try {
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();

      pages.forEach(page => {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        page.drawText(text, {
          x: (width - textWidth) / 2,
          y: height / 2,
          size: fontSize,
          font,
          color: rgb(0.5, 0.5, 0.5),
          opacity,
          rotate: degrees(rotation),
        });
      });

      const pdfBytes = await doc.save();
      saveAs(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), 'watermarked.pdf');
    } catch (e) {
      alert('Error: ' + (e as Error).message);
    }
    setProcessing(false);
  };

  return (
    <ToolLayout title="Watermark PDF" description="Add a text watermark to every page of your PDF.">
      {!file ? (
        <FileUploader accept=".pdf" onFiles={handleFile} />
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 flex justify-between items-center">
            <span className="font-medium truncate">{file.name}</span>
            <button onClick={() => setFile(null)} className="text-sm text-red-500">Remove</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Watermark Text</label>
              <input value={text} onChange={e => setText(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Font Size: {fontSize}</label>
              <input type="range" min={12} max={96} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Opacity: {Math.round(opacity * 100)}%</label>
              <input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={e => setOpacity(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rotation: {rotation}°</label>
              <input type="range" min={-180} max={180} value={rotation} onChange={e => setRotation(Number(e.target.value))} className="w-full" />
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 flex items-center justify-center min-h-[200px]">
            <span style={{ fontSize: `${Math.min(fontSize, 36)}px`, opacity, transform: `rotate(-${rotation}deg)`, color: '#888' }}>
              {text}
            </span>
          </div>

          <button onClick={addWatermark} disabled={processing} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl font-semibold transition">
            {processing ? 'Processing...' : 'Add Watermark & Download'}
          </button>
        </div>
      )}
    </ToolLayout>
  );
}
