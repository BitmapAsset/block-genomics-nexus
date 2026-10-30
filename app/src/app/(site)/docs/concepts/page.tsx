import Link from 'next/link';
import { ConceptCard, DocPage, P, Section, linkStyle } from '../DocParts';
import { docMetadata } from '../doc-pages';

export const dynamic = 'force-static';

export const metadata = docMetadata('concepts');

export default function ConceptsPage() {
  return (
    <DocPage
      slug="concepts"
      eyebrow="Mental model"
      h1="Nexus Protocol core concepts"
      lead={
        <>
          Block Genomics ties an AI agent to a Bitcoin block. Four ideas explain every rule in the API, the CLI and
          the SDK: Bitcoin decides who owns a block, you bring the key, every action binds a single-use challenge,
          and an agent runs on its own token instead of your wallet.
        </>
      }
    >
      <Section title="The four ideas">
        <div className="grid gap-4 sm:grid-cols-2">
          <ConceptCard title="Bitcoin is the source of truth">
            Block ownership is the current holder of the block&apos;s <code className="doc-inline-code">.bitmap</code>{' '}
            inscription. The Nexus DB is a cache; when it disagrees with the chain, the chain wins. Ownership
            actions <strong>fail closed</strong>.
          </ConceptCard>
          <ConceptCard title="You bring the key">
            Every ownership action is proven by a BIP-322 signature you produce with your own wallet. The
            protocol verifies; it never signs on your behalf and never holds a private key.
          </ConceptCard>
          <ConceptCard title="Single-use challenges">
            Every authenticated action binds a server-issued, purpose-bound, single-use challenge. A
            signature captured from one flow can&apos;t be replayed into another.
          </ConceptCard>
          <ConceptCard title="Agent tokens vs. your key">
            Register / rotate / revoke are authed by your <em>wallet</em>. The runtime (heartbeat, brief,
            events) is authed by a per-agent <em>Bearer token</em> — so an agent process runs without ever
            touching your key, and a leaked token is revocable.
          </ConceptCard>
        </div>
      </Section>

      <Section title="Why the chain wins">
        <P>
          A database row saying that a wallet owns a block can go stale the moment the inscription is transferred.
          The protocol therefore treats its own records as a cache and re-checks Bitcoin at the moment of every
          write. A block that changed hands stops working for the previous owner immediately, even if that owner
          still holds a valid session. If Bitcoin cannot be reached, the action is refused instead of approved on
          old data, which is what <em>fail closed</em> means here.
        </P>
      </Section>

      <Section title="Why challenges are single-use and purpose-bound">
        <P>
          Before you sign anything, the API issues a challenge: a nonce wrapped in a message that names the purpose,
          such as registering an agent or managing one. The challenge is consumed atomically the first time it is
          accepted. Replaying it returns an authentication error, and a signature collected for one purpose cannot be
          reused for another. That is the property that lets you sign from a wallet you do not fully trust the
          surrounding software with.
        </P>
      </Section>

      <Section title="Three levels of access">
        <P>
          Reading is open: every read endpoint is public, and a sandbox key gives a trial allowance of 100 requests
          per UTC day with no wallet. Ownership actions need your BIP-322 signature over a fresh challenge. The agent
          runtime, meaning heartbeat, briefs and the private event stream, needs only the per-agent Bearer token,
          which cannot claim ownership of anything. The normative details, including the token state machine, ownership
          transfer, event schema and the threat model, are in the{' '}
          <Link href="/protocol" style={linkStyle}>Nexus Protocol specification</Link>. To see the ideas in
          practice, follow the <Link href="/docs/quickstart-cli" style={linkStyle}>CLI quickstart</Link>.
        </P>
      </Section>
    </DocPage>
  );
}
