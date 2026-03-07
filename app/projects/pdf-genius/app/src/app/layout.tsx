import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PDF Genius — Free AI-Powered PDF Tools Online',
  description: 'Merge, split, compress, convert, and chat with PDFs — all free, all in your browser. Your files never leave your device.',
  openGraph: {
    title: 'PDF Genius — Free AI-Powered PDF Tools',
    description: 'Merge, split, compress, convert, and chat with PDFs — free and private.',
    type: 'website',
    url: 'https://pdfgenius.io',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen flex flex-col`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
