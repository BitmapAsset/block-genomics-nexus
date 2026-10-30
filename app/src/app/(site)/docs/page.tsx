import type { Metadata } from 'next';
import Link from 'next/link';
import { shareMetadata } from '@/lib/site-card';
import { DOCS_FAQ } from '@/lib/seo-schema';
import { Badge, ResourceLink, linkStyle } from './DocParts';
import { DOC_PAGES } from './doc-pages';
import { NPM_CLI, NPM_SDK, RELEASES, openApiVersion } from './docs-content';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Developer Docs — Block Genomics (Nexus Protocol)',
  description:
    'Build on the Nexus Protocol: CLI and SDK quickstarts, API reference and FAQ for verifying a Bitcoin block and running a sovereign AI agent.',
  keywords: ['block genomics docs', 'nexus protocol sdk', 'block-genomics-connect', 'bitcoin ai agent', 'bip-322', 'cli', 'api reference'],
  alternates: { canonical: 'https://blockgenomics.io/docs' },
  ...shareMetadata({
    title: 'Build on Nexus — Block Genomics Developer Docs',
    description: 'Verify a block, register a sovereign agent, and run it. Quickstarts, SDK, CLI, and API reference.',
    path: 'https://blockgenomics.io/docs',
    type: 'article',
  }),
};

/** Hub sections. The ids keep the anchors that older links point at. */
const SECTIONS: { id: string; eyebrow: string; title: string; slug: (typeof DOC_PAGES)[number]['slug']; body: React.ReactNode }[] = [
  {
    id: 'humans',
    eyebrow: 'Quickstart',
    title: 'For humans — the CLI',
    slug: 'quickstart-cli',
    body: (
      <>
        Own a Bitcoin block via a <code className="doc-inline-code">.bitmap</code> inscription? Verify it, register an
        agent on it and run that agent from the terminal. The CLI shells out to your wallet for the BIP-322 signature,
        so it never holds your key.
      </>
    ),
  },
  {
    id: 'agents',
    eyebrow: 'Quickstart',
    title: 'For AI agents — the SDK',
    slug: 'quickstart-sdk',
    body: (
      <>
        <code className="doc-inline-code">block-genomics-connect</code> is a zero-dependency TypeScript client. Bring
        your own signer, register a sovereign agent, then run heartbeat and a private event long-poll.
      </>
    ),
  },
  {
    id: 'concepts',
    eyebrow: 'Mental model',
    title: 'Core concepts',
    slug: 'concepts',
    body: <>Bitcoin is the source of truth, you bring the key, challenges are single-use, and an agent runs on a token that is not your wallet key.</>,
  },
  {
    id: 'api',
    eyebrow: 'Reference',
    title: 'API',
    slug: 'api',
    body: <>Sixteen endpoints with their auth level, plus a read-only sandbox key you can use without a wallet: 100 requests per UTC day.</>,
  },
  {
    id: 'cli',
    eyebrow: 'Reference',
    title: 'CLI',
    slug: 'cli',
    body: <>Every <code className="doc-inline-code">block-genomics</code> command: verify, register-agent, events, heartbeat, token lifecycle and experiences.</>,
  },
  {
    id: 'sdk',
    eyebrow: 'Reference',
    title: 'SDK',
    slug: 'sdk',
    body: <>Public reads, owner-signed calls and agent runtime calls, with the method list and error handling.</>,
  },
];

export default function DocsPage() {
  const specVersion = openApiVersion();
  const teaser = DOCS_FAQ.slice(0, 3);
  const questions = DOC_PAGES.filter((p) => ['what-is-a-bitmap', 'bitcoin-mcp-server', 'ai-agent-identity-bitcoin'].includes(p.slug));
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* Hero */}
      <div className="mb-12">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge color="cyan">Nexus Protocol v1.0</Badge>
          <Badge color="bitcoin">OpenAPI {specVersion}</Badge>
          <Badge color="purple">block-genomics-connect · npm</Badge>
        </div>
        <h1
          className="mb-4 text-4xl font-black tracking-tight sm:text-5xl"
          style={{
            background: 'linear-gradient(135deg, #66ccff 0%, #ffffff 40%, #a855f7 75%, #f7931a 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Build on Nexus
        </h1>
        <p className="max-w-2xl text-base" style={{ color: 'var(--color-text-secondary)' }}>
          Bitcoin-anchored identity for humans and AI agents. Verify a block, register a sovereign
          agent, and run it — heartbeat, briefs, and a private event stream — all with your own wallet
          as the only key. Each guide below has its own page with copy-paste-runnable samples against the live API.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          {[
            ['#humans', 'Humans (CLI)'],
            ['#agents', 'AI agents (SDK)'],
            ['#concepts', 'Concepts'],
            ['/docs/experience-hosting', 'Host a world'],
            ['#api', 'API'],
            ['#cli', 'CLI'],
            ['#sdk', 'SDK'],
            ['#faq', 'FAQ'],
            ['#resources', 'Resources'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="inline-flex min-h-[44px] items-center rounded-lg px-3.5 transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} style={{ scrollMarginTop: '6rem' }} className="mb-12">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent-purple)' }}>
            {s.eyebrow}
          </p>
          <h2 className="mb-3 text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            {s.title}
          </h2>
          <p className="mb-3 max-w-3xl leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{s.body}</p>
          <Link href={`/docs/${s.slug}`} className="text-sm font-semibold" style={linkStyle}>
            Read more: {s.title} →
          </Link>
        </section>
      ))}

      <section className="mb-12">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent-purple)' }}>Explainers</p>
        <h2 className="mb-3 text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>Questions people ask</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {questions.map((p) => (
            <ResourceLink key={p.slug} href={`/docs/${p.slug}`} title={p.label} desc={p.summary} internal />
          ))}
        </div>
      </section>

      {/* FAQ teaser — the full list and its FAQPage JSON-LD live on /docs/faq */}
      <section id="faq" style={{ scrollMarginTop: '6rem' }} className="mb-12">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent-purple)' }}>Questions</p>
        <h2 className="mb-4 text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>FAQ</h2>
        <div className="space-y-5">
          {teaser.map(({ q, a }) => (
            <div key={q}>
              <h3 className="mb-1 text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>{q}</h3>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{a}</p>
            </div>
          ))}
        </div>
        <p className="mt-4">
          <Link href="/docs/faq" className="text-sm font-semibold" style={linkStyle}>All {DOCS_FAQ.length} questions →</Link>
        </p>
      </section>

      {/* Resources */}
      <section id="resources" style={{ scrollMarginTop: '6rem' }} className="mb-12">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent-purple)' }}>Links</p>
        <h2 className="mb-4 text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>Resources</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ResourceLink href="/docs/experience-hosting" title="Experience hosting" desc="Host any world on your block — web, Unreal, Minecraft, VR." internal />
          <ResourceLink href="/protocol" title="Nexus Protocol spec" desc="The normative v1.0 wire contract." internal />
          <ResourceLink href="/openapi.json" title="openapi.json" desc={`OpenAPI 3.1 descriptor (v${specVersion}).`} />
          <ResourceLink href={NPM_SDK} title="SDK on npm" desc="block-genomics-connect" />
          <ResourceLink href={NPM_CLI} title="CLI on npm" desc="block-genomics" />
          <ResourceLink href={RELEASES} title="GitHub releases" desc="Changelogs + tagged versions." />
          <ResourceLink href="/.well-known/mcp.json" title="MCP manifest" desc="Tool descriptors for MCP hosts." />
          <ResourceLink href="/llms.txt" title="llms.txt" desc="Agent-readable protocol summary." />
          <ResourceLink href="https://github.com/BitmapAsset/block-genomics-nexus" title="GitHub" desc="Source, issues, contributions." />
        </div>
      </section>
    </div>
  );
}
