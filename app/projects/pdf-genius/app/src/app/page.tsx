import Link from 'next/link';
import { tools } from '@/lib/tools';
import AdPlaceholder from '@/components/AdPlaceholder';

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4">
      {/* AdSense - Top Banner */}
      <AdPlaceholder className="mt-4" />

      {/* Hero */}
      <section className="py-20 text-center animate-fade-in">
        <h1 className="text-5xl md:text-6xl font-extrabold mb-4">
          <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Free PDF Tools</span>
          <br />
          <span className="text-slate-900 dark:text-white">Powered by AI</span>
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-8">
          Merge, split, compress, convert, and chat with your PDFs — all free, all private. Your files never leave your browser.
        </p>
        <div className="flex justify-center gap-4">
          <a href="#tools" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition shadow-lg shadow-indigo-500/25">
            Explore Tools ↓
          </a>
        </div>
      </section>

      {/* Tools Grid */}
      <section id="tools" className="pb-20">
        <h2 className="text-2xl font-bold mb-2 text-center">All Tools</h2>
        <p className="text-slate-500 dark:text-slate-400 text-center mb-10">Click any tool to get started — no signup required</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tools.map((tool, i) => (
            <Link
              key={tool.slug}
              href={`/${tool.slug}`}
              className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 hover:scale-[1.02] hover:shadow-xl transition-all duration-200"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {tool.category === 'ai' && (
                <span className="absolute top-3 right-3 text-[10px] font-bold bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-2 py-0.5 rounded-full">AI</span>
              )}
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${tool.color} flex items-center justify-center text-2xl mb-3`}>
                {tool.icon}
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{tool.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{tool.description}</p>
            </Link>
          ))}
        </div>

        {/* AdSense - Between Tools */}
        <AdPlaceholder className="mt-8" />
      </section>

      {/* Privacy Banner */}
      <section className="pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl px-6 py-3">
          <span className="text-2xl">🔒</span>
          <span className="text-green-700 dark:text-green-400 font-medium">Your files never leave your browser — 100% private</span>
        </div>
      </section>
    </div>
  );
}
