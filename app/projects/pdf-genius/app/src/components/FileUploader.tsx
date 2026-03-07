'use client';
import { useCallback, useRef, useState } from 'react';

interface Props {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label?: string;
}

export default function FileUploader({ accept, multiple = false, onFiles, label }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    onFiles(files);
  }, [onFiles]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  }, [onFiles]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
        dragOver
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
          : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-900'
      }`}
    >
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} onChange={handleChange} className="hidden" />
      <div className="text-4xl mb-3">📁</div>
      <p className="text-slate-600 dark:text-slate-400 font-medium">{label || 'Drag & drop files here or click to browse'}</p>
      <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Accepts: {accept}</p>
    </div>
  );
}
