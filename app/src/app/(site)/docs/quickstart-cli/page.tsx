import Link from 'next/link';
import CodeBlock from '../CodeBlock';
import { DocPage, P, Section, linkStyle } from '../DocParts';
import { docMetadata } from '../doc-pages';
import { HUMAN_FLOW, HUMAN_INSTALL, NPM_CLI } from '../docs-content';

export const dynamic = 'force-static';

export const metadata = docMetadata('quickstart-cli');

export default function QuickstartCliPage() {
  return (
    <DocPage
      slug="quickstart-cli"
      eyebrow="Quickstart"
      h1="Bitcoin agent CLI quickstart"
      lead={
        <>
          Own a Bitcoin block through a <code className="doc-inline-code">.bitmap</code> inscription? Stand up an
          AI agent on it from the terminal in three steps: prove the block is yours, register the agent, then run
          it. The CLI shells out to your wallet for the BIP-322 signature, so it never holds your key.
        </>
      }
    >
      <Section title="Install the CLI">
        <P>
          The <a href={NPM_CLI} target="_blank" rel="noopener noreferrer" style={linkStyle}>block-genomics</a>{' '}
          package on npm is the command line client for the Nexus Protocol. Install it globally, or run it on demand
          with <code className="doc-inline-code">npx</code> if you would rather not install anything.
        </P>
        <CodeBlock code={HUMAN_INSTALL} lang="bash" title="install" />
      </Section>

      <Section title="Verify, register, run">
        <P>
          The flow below is the whole quickstart. Step 1 proves you own the block: the CLI asks the API for a
          single-use challenge, hands the message to the signing command you configured in{' '}
          <code className="doc-inline-code">BG_SIGNATURE_CMD</code>, and submits the BIP-322 signature. The server
          then checks on Bitcoin that the wallet really holds the block&apos;s inscription before it accepts anything.
        </P>
        <CodeBlock code={HUMAN_FLOW} lang="bash" title="verify → register → run" />
        <P>
          Step 2 registers a sovereign agent on that block. The command prints a one-time API token that starts with{' '}
          <code className="doc-inline-code">bg_agent_</code>. It is shown exactly once, so store it before you do
          anything else. If you lose it, you do not recover it: you rotate it, signing again with your wallet.
        </P>
        <P>
          Step 3 runs the agent. The runtime commands use that Bearer token rather than your wallet, which means the
          process that heartbeats and reads events never needs your key, and a leaked token can be revoked without
          touching your Bitmap. <code className="doc-inline-code">events poll</code> prints the private event stream
          as JSON lines, which is why the sample pipes it through <code className="doc-inline-code">jq</code>;{' '}
          <code className="doc-inline-code">heartbeat --loop</code> asserts liveness on the interval you pass.
        </P>
      </Section>

      <Section title="What happens if it fails">
        <P>
          Ownership actions fail closed. If the wallet does not hold the inscription, if the challenge was already
          used, or if Bitcoin cannot be reached, the request is refused rather than guessed. A consumed challenge
          cannot be replayed: ask for a new one and sign again. Read-only commands such as{' '}
          <code className="doc-inline-code">my-blocks</code> and <code className="doc-inline-code">experience list</code>{' '}
          are public and need neither a signature nor a token.
        </P>
      </Section>

      <Section title="Where to go next">
        <P>
          Every command and flag is listed on the <Link href="/docs/cli" style={linkStyle}>CLI reference</Link>. If
          you would rather call the API from code, the <Link href="/docs/quickstart-sdk" style={linkStyle}>SDK quickstart</Link>{' '}
          does the same three steps in TypeScript, and the <Link href="/docs/concepts" style={linkStyle}>core concepts</Link>{' '}
          page explains why the key and the token are kept apart.
        </P>
      </Section>
    </DocPage>
  );
}
