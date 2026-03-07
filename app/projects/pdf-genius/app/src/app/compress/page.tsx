'use client';
import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import ToolLayout from '@/components/ToolLayout';
import FileUploader from '@/components/FileUploader';

export default function CompressPage() {
  const [file, setFile] = useState<File | null>(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);

  const handleFile = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setOriginalSize(f.size);
    setCompressedSize(null);
    setCompressedBlob(null);
  };

  const compress = async () => {
    if (!file) return;
    setProcessing(true);
    try {
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes);

      // Strip metadata
      doc.setTitle('');
      doc.setAuthor('');
      doc.setSubject('');
      doc.setKeywords([]);
      doc.setProducer('PDF Genius');
      doc.setCreator('PDF Genius');

      const pdfBytes = await doc.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      setCompressedSize(blob.size);
      setCompressedBlob(blob);
    } catch (e) {
      alert('Error: ' + (e as Error).message);
    }
    setProcessing(false);
  };

  const download = () => {
    if (compressedBlob) saveAs(compressedBlob, 'compressed.pdf');
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <ToolLayout title="Compress PDF" description="Reduce your PDF file size by stripping metadata and optimizing structure.">
      {!file ? (
        <FileUploader accept=".pdf" onFiles={handleFile} label="Drop a PDF file here" />
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
            <p className="font-medium truncate">{file.name}</p>
            <p className="text-sm text-slate-500">Original size: {formatSize(originalSize)}</p>
          </div>

          {compressedSize !== null && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-4">
              <p className="font-medium text-green-700 dark:text-green-400">Compressed: {formatSize(compressedSize)}</p>
              <p className="text-sm text-green-600 dark:text-green-500">
                {compressedSize < originalSize
                  ? `Reduced by ${(((originalSize - compressedSize) / originalSize) * 100).toFixed(1)}%`
                  : 'File is already optimized'}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            {!compressedBlob ? (
              <button onClick={compress} disabled={processing} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl font-semibold transition">
                {processing ? 'Compressing...' : 'Compress PDF'}
              </button>
            ) : (
              <button onClick={download} className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition">
                Download Compressed PDF
              </button>
            )}
            <button onClick={() => { setFile(null); setCompressedBlob(null); setCompressedSize(null); }} className="px-4 py-3 bg-slate-200 dark:bg-slate-800 rounded-xl font-medium transition hover:bg-slate-300">
              Reset
            </button>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
