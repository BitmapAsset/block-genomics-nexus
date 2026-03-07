import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About | PDF Genius',
  description: 'Learn about PDF Genius — free, private, AI-powered PDF tools.',
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-6">About PDF Genius</h1>
      <div className="prose dark:prose-invert max-w-none space-y-4 text-slate-600 dark:text-slate-400">
        <p>PDF Genius is a free suite of PDF tools powered by AI. Our mission is to make PDF manipulation easy, fast, and private.</p>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Why PDF Genius?</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>100% Free</strong> — No hidden fees, no limits on core tools</li>
          <li><strong>Private</strong> — Files are processed in your browser and never uploaded</li>
          <li><strong>AI-Powered</strong> — Summarize documents and chat with PDFs using AI</li>
          <li><strong>Fast</strong> — No waiting for server processing</li>
          <li><strong>No Signup</strong> — Just open and use</li>
        </ul>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Technology</h2>
        <p>Built with Next.js, pdf-lib, PDF.js, and OpenAI. Core tools run entirely client-side using WebAssembly and JavaScript.</p>
      </div>
    </div>
  );
}
