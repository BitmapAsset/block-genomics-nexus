'use client';
import { useState } from 'react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import ToolLayout from '@/components/ToolLayout';
import FileUploader from '@/components/FileUploader';

export default function PdfToImagePage() {
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [quality, setQuality] = useState(0.9);
  const [processing, setProcessing] = useState(false);

  const handleFile = (files: File[]) => {
    setFile(files[0] || null);
    setImages([]);
  };

  const convert = async () => {
    if (!file) return;
    setProcessing(true);
    try {
      const { pdfjsLib } = await import('@/lib/pdf-worker');
      const bytes = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      const results: string[] = [];

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        results.push(canvas.toDataURL(`image/${format}`, quality));
      }
      setImages(results);
    } catch (e) {
      alert('Error: ' + (e as Error).message);
    }
    setProcessing(false);
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    images.forEach((img, i) => {
      const data = img.split(',')[1];
      zip.file(`page_${i + 1}.${format === 'jpeg' ? 'jpg' : 'png'}`, data, { base64: true });
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'pdf_images.zip');
  };

  return (
    <ToolLayout title="PDF to Image" description="Convert each PDF page to a high-quality image.">
      {!file ? (
        <FileUploader accept=".pdf" onFiles={handleFile} label="Drop a PDF file here" />
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 flex items-center justify-between">
            <span className="font-medium truncate">{file.name}</span>
            <button onClick={() => { setFile(null); setImages([]); }} className="text-sm text-red-500">Remove</button>
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Format</label>
              <select value={format} onChange={e => setFormat(e.target.value as 'png' | 'jpeg')} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
                <option value="png">PNG</option>
                <option value="jpeg">JPG</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Quality: {Math.round(quality * 100)}%</label>
              <input type="range" min={0.1} max={1} step={0.1} value={quality} onChange={e => setQuality(Number(e.target.value))} className="w-40" />
            </div>
          </div>

          {images.length === 0 ? (
            <button onClick={convert} disabled={processing} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl font-semibold transition">
              {processing ? 'Converting...' : 'Convert to Images'}
            </button>
          ) : (
            <>
              <button onClick={downloadAll} className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition">
                Download All as ZIP
              </button>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {images.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={img} alt={`Page ${i + 1}`} className="rounded-lg border border-slate-200 dark:border-slate-700 w-full" />
                    <button onClick={() => saveAs(img, `page_${i + 1}.${format === 'jpeg' ? 'jpg' : 'png'}`)} className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </ToolLayout>
  );
}
