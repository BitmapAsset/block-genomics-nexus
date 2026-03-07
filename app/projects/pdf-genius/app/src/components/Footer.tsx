import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} PDF Genius. All tools are free.
          </div>
          <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
            <span>🔒</span>
            <span>Your files never leave your browser</span>
          </div>
          <div className="flex gap-4 text-sm text-slate-500 dark:text-slate-400">
            <Link href="/privacy" className="hover:text-indigo-600 transition">Privacy</Link>
            <Link href="/about" className="hover:text-indigo-600 transition">About</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
