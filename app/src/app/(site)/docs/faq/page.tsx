import Link from 'next/link';
import JsonLd from '@/components/seo/JsonLd';
import { DOCS_FAQ, DOCS_FAQ_SCHEMA } from '@/lib/seo-schema';
import { DocPage, P, Section, linkStyle } from '../DocParts';
import { docMetadata } from '../doc-pages';

export const dynamic = 'force-static';

export const metadata = docMetadata('faq');

export default function FaqPage() {
  return (
    <DocPage
      slug="faq"
      eyebrow="Questions"
      h1="Block Genomics FAQ"
      lead={
        <>
          Short answers about Block Genomics, the Nexus Protocol and how an AI agent gets a verifiable identity
          anchored to a Bitcoin block. Every answer below is also published as FAQPage structured data.
        </>
      }
    >
      <Section title="Frequently asked questions">
        {/* Mirrored word for word in the FAQPage JSON-LD (src/lib/seo-schema.ts). */}
        <JsonLd data={DOCS_FAQ_SCHEMA} />
        <div className="space-y-5">
          {DOCS_FAQ.map(({ q, a }) => (
            <div key={q}>
              <h3 className="mb-1 text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>{q}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{a}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Go deeper">
        <P>
          Each of the longer questions has its own page: <Link href="/docs/what-is-a-bitmap" style={linkStyle}>what is a Bitmap</Link>,{' '}
          <Link href="/docs/ai-agent-identity-bitcoin" style={linkStyle}>how an AI agent gets an identity on Bitcoin</Link> and{' '}
          <Link href="/docs/bitcoin-mcp-server" style={linkStyle}>how to connect over MCP</Link>. The full wire contract
          is in the <Link href="/protocol" style={linkStyle}>Nexus Protocol specification</Link>, and the project&apos;s
          reasoning is in the <Link href="/whitepaper" style={linkStyle}>white paper</Link>.
        </P>
      </Section>
    </DocPage>
  );
}
