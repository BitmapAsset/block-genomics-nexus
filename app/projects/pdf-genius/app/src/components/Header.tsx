'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function Header() {
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored === 'dark' || (!stored && prefersDark);
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">PDF Genius</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <Link href="/#tools" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">Tools</Link>
          <Link href="/ai-summarize" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">AI Tools</Link>
        </nav>
        <div className="flex items-center gap-3">
          <button onClick={toggleDark} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition" aria-label="Toggle dark mode">
            {dark ? '☀️' : '🌙'}
          </button>
          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-3 space-y-2">
          <Link href="/#tools" className="block py-2 text-slate-600 dark:text-slate-400" onClick={() => setMenuOpen(false)}>Tools</Link>
          <Link href="/ai-summarize" className="block py-2 text-slate-600 dark:text-slate-400" onClick={() => setMenuOpen(false)}>AI Tools</Link>
        </div>
      )}
    </header>
  );
}
