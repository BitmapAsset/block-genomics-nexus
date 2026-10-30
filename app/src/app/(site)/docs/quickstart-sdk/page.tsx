import Link from 'next/link';
import CodeBlock from '../CodeBlock';
import { DocPage, P, Section, linkStyle } from '../DocParts';
import { docMetadata } from '../doc-pages';
import { AGENT_FLOW, AGENT_INSTALL, NPM_SDK, READ_ONLY, REFERENCE_AGENT } from '../docs-content';

export const dynamic = 'force-static';

export const metadata = docMetadata('quickstart-sdk');

export default function QuickstartSdkPage() {
  return (
    <DocPage
      slug="quickstart-sdk"
      eyebrow="Quickstart"
      h1="AI agent SDK quickstart for Bitcoin"
      lead={
        <>
          <a href={NPM_SDK} target="_blank" rel="noopener noreferrer" style={linkStyle}>block-genomics-connect</a>{' '}
          is a zero-dependency, isomorphic TypeScript client for the Nexus Protocol (Node 18 or later, Deno, Bun,
          Workers and the browser). Your agent brings its own signer; the SDK never sees your key.
        </>
      }
    >
      <Section title="Install">
        <P>One package, no runtime dependencies. Add it to the project that hosts your agent.</P>
        <CodeBlock code={AGENT_INSTALL} lang="bash" title="install" />
      </Section>

      <Section title="Register and run a sovereign agent">
        <P>
          The sample builds a client with a signer, registers an agent on a block you own, and then runs it.{' '}
          <code className="doc-inline-code">makeSigner</code> takes your address and a function that produces a
          BIP-322 signature for a message; where that signature comes from (a browser wallet, a hardware wallet, a
          signing service you operate) is up to you, because the protocol only verifies signatures and never signs on
          your behalf.
        </P>
        <CodeBlock code={AGENT_FLOW} lang="typescript" title="register → run a sovereign agent" />
        <P>
          Registration re-verifies ownership against Bitcoin on the server at call time and returns the agent&apos;s
          Bearer token once. Keep it somewhere secure: the heartbeat and event calls that follow use the token, not
          your wallet, so the long-running process holds nothing that could move or claim your block. The loop
          sends a heartbeat roughly every 30 seconds and long-polls the private event stream; the API returns events
          most-recent first, so the sample reverses them before it processes them in order.
        </P>
      </Section>

      <Section title="Reads need no signer">
        <P>
          Public data does not require any proof. Construct the client without a signer and you can read protocol
          stats, the authoritative on-chain owner of a block, and the public directory of active agents on it.
        </P>
        <CodeBlock code={READ_ONLY} lang="typescript" title="public reads" />
        <P>
          If you only want to try the API first, mint a read-only sandbox key; the{' '}
          <Link href="/docs/api" style={linkStyle}>API reference</Link> shows the three curl calls. Every SDK method
          rejects with a <code className="doc-inline-code">BlockGenomicsError</code> that carries the HTTP status.
        </P>
      </Section>

      <Section title="A complete template">
        <P>
          A runnable starting point covers the whole lifecycle: keypair, register, heartbeat loop, event long-poll
          and a graceful revoke on shutdown. It lives in{' '}
          <a href={REFERENCE_AGENT} target="_blank" rel="noopener noreferrer" style={linkStyle}>examples/reference-agent</a>.
          Method signatures are on the <Link href="/docs/sdk" style={linkStyle}>SDK reference</Link>.
        </P>
      </Section>
    </DocPage>
  );
}
