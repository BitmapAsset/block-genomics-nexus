'use client';
import { useState } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { saveAs } from 'file-saver';
import ToolLayout from '@/components/ToolLayout';
import FileUploader from '@/components/FileUploader';

export default function RotatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [rotations, setRotations] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);

  const handleFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    const bytes = await f.arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    const count = doc.getPageCount();
    setPageCount(count);
    setRotations(new Array(count).fill(0));
  };

  const rotatePage = (index: number) => {
    setRotations(prev => {
      const arr = [...prev];
      arr[index] = (arr[index] + 90) % 360;
      return arr;
    });
  };

  const rotateAll = (deg: number) => {
    setRotations(prev => prev.map(r => (r + deg) % 360));
  };

  const download = async () => {
    if (!file) return;
    setProcessing(true);
    try {
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      doc.getPages().forEach((page, i) => {
        if (rotations[i]) page.setRotation(degrees(rotations[i]));
      });
      const pdfBytes = await doc.save();
      saveAs(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), 'rotated.pdf');
    } catch (e) {
      alert('Error: ' + (e as Error).message);
    }
    setProcessing(false);
  };

  return (
    <ToolLayout title="Rotate PDF" description="Rotate individual pages or the entire document.">
      {!file ? (
        <FileUploader accept=".pdf" onFiles={handleFile} />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => rotateAll(90)} className="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded-lg text-sm font-medium hover:bg-slate-300">Rotate All 90°</button>
            <button onClick={() => rotateAll(180)} className="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded-lg text-sm font-medium hover:bg-slate-300">Rotate All 180°</button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {rotations.map((rot, i) => (
              <button key={i} onClick={() => rotatePage(i)} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-center hover:border-indigo-400 transition">
                <div className="text-3xl mb-1" style={{ transform: `rotate(${rot}deg)`, transition: 'transform 0.3s' }}>📄</div>
                <p className="text-xs text-slate-500">Page {i + 1}</p>
                <p className="text-xs font-medium text-indigo-600">{rot}°</p>
              </button>
            ))}
          </div>

          <button onClick={download} disabled={processing} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl font-semibold transition">
            {processing ? 'Processing...' : 'Download Rotated PDF'}
          </button>
        </div>
      )}
    </ToolLayout>
  );
}
