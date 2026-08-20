import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Not found | Block Genomics',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-5">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm text-text-muted">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">
          Nothing at this address
        </h1>
        <p className="mt-3 text-sm text-text-muted">
          This page does not exist. A block URL looks like{' '}
          <span className="font-mono text-text-secondary">/block/840000</span> — a plain height, no
          decimals or letters.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/nexus"
            className="rounded-xl bg-bitcoin px-5 py-2.5 text-sm font-semibold text-black transition-all hover:brightness-110"
          >
            Open The Nexus
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-white/[0.1] px-5 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
