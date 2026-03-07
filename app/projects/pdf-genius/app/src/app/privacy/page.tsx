import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | PDF Genius',
  description: 'Learn how PDF Genius protects your privacy. Your files never leave your browser.',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <div className="prose dark:prose-invert max-w-none space-y-4 text-slate-600 dark:text-slate-400">
        <p><strong>Your privacy is our priority.</strong></p>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">File Processing</h2>
        <p>All core PDF tools (merge, split, compress, convert, rotate, page numbers, watermark) process files <strong>entirely in your browser</strong>. Your files are never uploaded to our servers.</p>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">AI Features</h2>
        <p>AI features (Summarize, Ask PDF) extract text from your PDF in the browser, then send only the text content to our API for processing. The original PDF file is never uploaded. Text is not stored after processing.</p>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Cookies & Analytics</h2>
        <p>We use basic analytics to improve our service. We may show ads via Google AdSense, which uses cookies. No personal data is collected beyond standard web analytics.</p>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Contact</h2>
        <p>Questions? Email us at privacy@pdfgenius.io</p>
      </div>
    </div>
  );
}
