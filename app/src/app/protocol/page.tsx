import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import GithubSlugger from 'github-slugger';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Nexus Protocol v1.0 — Block Genomics',
  description:
    'The normative Nexus Protocol specification: BIP-322 identity, single-use challenges, agent API tokens, on-chain ownership with live re-verify, parcels, world action-binding, event schema, rate limits, and threat model. An open metaverse protocol anchored to Bitcoin.',
  keywords: ['nexus protocol', 'specification', 'bip-322', 'bitcoin', 'bitmap', 'ai agents', 'block genomics', 'rfc'],
  alternates: { canonical: 'https://blockgenomics.io/protocol' },
  openGraph: {
    title: 'Nexus Protocol v1.0 — normative specification',
    description: 'The open, Bitcoin-anchored metaverse protocol for humans and AI agents. Identity, ownership, agents, events, and threat model.',
    url: 'https://blockgenomics.io/protocol',
    type: 'article',
  },
};

function loadSpec(): string {
  return readFileSync(join(process.cwd(), 'src', 'content', 'nexus-protocol-v1.md'), 'utf8');
}

/**
 * `public/openapi.json` is the canonical descriptor and is committed to the repo,
 * so an unreadable or version-less file is a build-integrity failure rather than a
 * condition to paper over. This page is `force-static`, so throwing fails the
 * build -- the previous `?? '1.2.1'` fallback would instead have shipped a badge
 * four minor versions behind the descriptor the API actually serves.
 */
function loadOpenApiVersion(): string {
  const raw = readFileSync(join(process.cwd(), 'public', 'openapi.json'), 'utf8');
  const version = (JSON.parse(raw) as { info?: { version?: string } }).info?.version;
  if (!version) {
    throw new Error('public/openapi.json is missing info.version');
  }
  return version;
}

interface TocItem {
  depth: 2 | 3;
  text: string;
  id: string;
}

/**
 * Build the table of contents from the spec's h2/h3 headings. A single slugger
 * instance walked in document order reproduces exactly the ids rehype-slug
 * assigns during render (github-slugger, sequential de-duplication), so every
 * TOC link resolves to a real anchor.
 */
function buildToc(md: string): TocItem[] {
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];
  let inFence = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (!m) continue;
    const depth = m[1].length;
    const text = m[2].replace(/`/g, '');
    const id = slugger.slug(m[2]); // slug from the raw heading text, like rehype-slug
    if (depth === 2 || depth === 3) items.push({ depth: depth as 2 | 3, text, id });
  }
  return items;
}

/**
 * Version + status line pulled from the spec header, so the badge tracks the file.
 * Same reasoning as loadOpenApiVersion: a header this page cannot parse means the
 * mirror is malformed, and defaulting would render a version nobody wrote.
 */
function loadSpecMeta(md: string): { version: string; status: string } {
  const version = /\*\*Version:\*\*\s*([0-9][^\n]*)/.exec(md)?.[1]?.trim();
  const status = /\*\*Status:\*\*\s*([^\n]*)/.exec(md)?.[1]?.trim();
  if (!version || !status) {
    throw new Error('src/content/nexus-protocol-v1.md is missing its **Version:** / **Status:** header');
  }
  return { version, status };
}

export default function ProtocolPage() {
  const spec = loadSpec();
  const toc = buildToc(spec);
  const { version, status } = loadSpecMeta(spec);
  const openapiVersion = loadOpenApiVersion();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* Header */}
      <div className="mb-10">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: 'rgba(102,204,255,0.1)', border: '1px solid rgba(102,204,255,0.3)', color: '#66ccff' }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#22c55e' }} />
            Nexus Protocol v{version}
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono"
            style={{ background: 'rgba(247,147,26,0.08)', border: '1px solid rgba(247,147,26,0.25)', color: '#f7931a' }}
          >
            OpenAPI {openapiVersion}
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{status}</span>
        </div>
        <h1
          className="text-4xl sm:text-5xl font-black tracking-tight mb-4"
          style={{
            background: 'linear-gradient(135deg, #66ccff 0%, #ffffff 40%, #a855f7 75%, #f7931a 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          The Nexus Protocol
        </h1>
        <p className="max-w-2xl text-base" style={{ color: 'var(--color-text-secondary)' }}>
          The open, Bitcoin-anchored metaverse protocol — a shared, verifiable world for humans and
          autonomous AI agents. This is the normative wire contract independent clients build against.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link href="/docs" className="rounded-lg px-4 py-2 font-medium transition-all" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#c9a5f7' }}>
            Developer docs →
          </Link>
          <a href="/openapi.json" className="rounded-lg px-4 py-2 font-medium transition-all" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            openapi.json
          </a>
          <a href="https://github.com/BitmapAsset/block-genomics-nexus/blob/main/docs/protocol/NEXUS-PROTOCOL-v1.md" target="_blank" rel="noopener noreferrer" className="rounded-lg px-4 py-2 font-medium transition-all" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            Source on GitHub
          </a>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
        {/* TOC sidebar */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-muted)' }}>
              On this page
            </p>
            <ul className="space-y-1.5 text-sm">
              {toc.map((item) => (
                <li key={item.id} style={{ paddingLeft: item.depth === 3 ? '0.9rem' : 0 }}>
                  <a
                    href={`#${item.id}`}
                    className="block transition-colors hover:text-white"
                    style={{ color: item.depth === 3 ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }}
                  >
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Rendered spec */}
        <article className="doc-prose min-w-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
            {spec}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
