import Link from 'next/link';
import CodeBlock from '../CodeBlock';
import { DocPage, P, Section, linkStyle } from '../DocParts';
import { docMetadata } from '../doc-pages';
import { CURL_OWNER } from '../docs-content';

export const dynamic = 'force-static';

export const metadata = docMetadata('what-is-a-bitmap');

export default function WhatIsABitmapPage() {
  return (
    <DocPage
      slug="what-is-a-bitmap"
      eyebrow="Explainer"
      h1="What is a Bitmap on Bitcoin?"
      lead={
        <>
          A Bitmap is a Bitcoin block inscribed as <code className="doc-inline-code">&lt;height&gt;.bitmap</code> on
          Ordinals. Each Bitcoin block becomes a unit of digital land and identity that one wallet owns, and that
          owner can prove with a signature.
        </>
      }
    >
      <Section title="How a block becomes a Bitmap">
        <P>
          Ordinals lets people inscribe data onto individual satoshis. A Bitmap is such an inscription with a specific
          name: the number of a Bitcoin block followed by <code className="doc-inline-code">.bitmap</code>, for
          example <code className="doc-inline-code">840000.bitmap</code>. Whoever holds that inscription holds the
          Bitmap for that block. Because the claim lives on Bitcoin, ownership can change hands by moving the
          inscription, and nobody has to ask Block Genomics for permission or an account.
        </P>
      </Section>

      <Section title="What the block gives you">
        <P>
          Block Genomics treats every block as a district of 2.1 km by 2.1 km, with one parcel per transaction in the
          block, and the protocol
          exposes that scale in real metres so that builders and agents work from the same numbers. The owner can
          attach a self-hosted world to the block, register AI agents under it, and list parcels for rent. Browse
          what people have built on <Link href="/explore" style={linkStyle}>Explore</Link> or the{' '}
          <Link href="/nexus" style={linkStyle}>Nexus map</Link>.
        </P>
      </Section>

      <Section title="Proving you own one">
        <P>
          Ownership is proven, not claimed. The owner signs a single-use challenge from the Nexus API with the wallet
          that holds the inscription, using BIP-322, the Bitcoin message signing standard that also covers
          Taproot and SegWit addresses. The server verifies the signature without ever seeing a private key, and it
          re-checks the chain before every write. If the inscription has moved to another wallet, the previous owner
          loses write access immediately.
        </P>
        <P>
          Anyone can check who owns a block. Reading is public and needs no key:
        </P>
        <CodeBlock code={CURL_OWNER} lang="bash" title="who owns block 840000?" />
        <P>
          The answer compares Block Genomics&apos; stored owner with the live holder of the inscription on Bitcoin,
          and when they disagree, Bitcoin wins.
        </P>
      </Section>

      <Section title="Is this a genomics company?">
        <P>
          No. Block Genomics is a Bitcoin and AI-agent identity project. The name uses &quot;genomics&quot; as a
          metaphor: each Bitcoin block carries its own unique, verifiable DNA. To see how an agent attaches to a
          block, read <Link href="/docs/ai-agent-identity-bitcoin" style={linkStyle}>AI agent identity on Bitcoin</Link>;
          to look up a block yourself, open the <Link href="/explore" style={linkStyle}>block explorer</Link>.
        </P>
      </Section>
    </DocPage>
  );
}
