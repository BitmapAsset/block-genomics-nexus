import Link from 'next/link';
import { DocPage, P, Section, linkStyle } from '../DocParts';
import { docMetadata } from '../doc-pages';

export const dynamic = 'force-static';

export const metadata = docMetadata('ai-agent-identity-bitcoin');

export default function AiAgentIdentityBitcoinPage() {
  return (
    <DocPage
      slug="ai-agent-identity-bitcoin"
      eyebrow="Explainer"
      h1="AI agent identity on Bitcoin"
      lead={
        <>
          Block Genomics gives an AI agent a verifiable identity anchored to a Bitcoin block. The owner holds the
          block&apos;s <code className="doc-inline-code">.bitmap</code> inscription, proves it with a BIP-322 signature,
          and the agent then runs under its own revocable token. There are no accounts and no passwords.
        </>
      }
    >
      <Section title="The problem it solves">
        <P>
          An AI agent that acts for someone needs a way to say who stands behind it, and a counterparty needs a way to
          check the claim without trusting a platform&apos;s user table. Block Genomics answers with something that
          already exists and is already public: ownership of a Bitcoin block, recorded as an inscription. The agent is
          registered on that block, and anyone can look up which agents are active on it.
        </P>
      </Section>

      <Section title="How an agent gets its identity">
        <P>
          The agent&apos;s owner asks the API for a single-use challenge for the purpose of registering an agent, signs
          it with the wallet that holds the block, and submits the signature. The protocol checks the signature, checks
          on Bitcoin that the wallet still holds the inscription, consumes the challenge so it cannot be replayed, and
          returns a Bearer token once. From then on the agent proves itself with that token: heartbeat to show it is
          alive, briefs to report to its owner, and a private event stream to receive work.
        </P>
        <P>
          The owner&apos;s key and the agent&apos;s token are deliberately separate. The wallet key authorizes
          registering, rotating, revoking and updating; the token authorizes only the runtime. A leaked token can be
          revoked, which locks the runtime until the owner rotates it, and it never exposes the block.
        </P>
      </Section>

      <Section title="What anyone else can check">
        <P>
          Reading is public. A counterparty can ask who owns a block, list the active agents registered on it, and
          fetch a verification badge for a handle, wallet or block. Ownership answers are compared with the live chain,
          so a block that has been transferred does not leave a stale agent with authority: the new holder is the owner
          the moment the inscription moves.
        </P>
      </Section>

      <Section title="What this is not">
        <P>
          It is not a token, a hosted account system or a custodian. The protocol verifies signatures and never holds
          a private key; the agent brings its own signer. It is also not a genomics or biotech business. For
          the terms used here, see <Link href="/docs/what-is-a-bitmap" style={linkStyle}>what is a Bitmap</Link> and the{' '}
          <Link href="/docs/concepts" style={linkStyle}>core concepts</Link>. To register an agent yourself, follow the{' '}
          <Link href="/docs/quickstart-cli" style={linkStyle}>CLI quickstart</Link> or the{' '}
          <Link href="/docs/quickstart-sdk" style={linkStyle}>SDK quickstart</Link>, and browse existing agents in the{' '}
          <Link href="/directory" style={linkStyle}>agent directory</Link>.
        </P>
      </Section>
    </DocPage>
  );
}
