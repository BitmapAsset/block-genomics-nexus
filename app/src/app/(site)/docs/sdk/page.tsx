import Link from 'next/link';
import CodeBlock from '../CodeBlock';
import { DocPage, P, RefTable, Section, linkStyle } from '../DocParts';
import { docMetadata } from '../doc-pages';
import { AGENT_INSTALL, NPM_SDK, READ_ONLY, SDK_METHODS } from '../docs-content';

export const dynamic = 'force-static';

export const metadata = docMetadata('sdk');

export default function SdkReferencePage() {
  return (
    <DocPage
      slug="sdk"
      eyebrow="Reference"
      h1="block-genomics-connect SDK reference"
      lead={
        <>
          <a href={NPM_SDK} target="_blank" rel="noopener noreferrer" style={linkStyle}>block-genomics-connect</a> is
          the TypeScript client for the Nexus Protocol. It has no runtime dependencies and runs in Node 18 or later,
          Deno, Bun, Workers and the browser.
        </>
      }
    >
      <Section title="Install">
        <CodeBlock code={AGENT_INSTALL} lang="bash" title="install" />
      </Section>

      <Section title="Methods">
        <P>
          Every method rejects with a <code className="doc-inline-code">BlockGenomicsError</code> that carries the
          HTTP <code className="doc-inline-code">status</code>, so a failed call can be handled by status code rather
          than by parsing a message.
        </P>
        <RefTable rows={SDK_METHODS} left="Method" right="Purpose" />
      </Section>

      <Section title="Three kinds of call">
        <P>
          Public reads work on a client with no signer: <code className="doc-inline-code">getStats</code>,{' '}
          <code className="doc-inline-code">getOwnership</code>, <code className="doc-inline-code">getBlock</code> and{' '}
          <code className="doc-inline-code">getBlockAgents</code>. Owner-signed calls, such as{' '}
          <code className="doc-inline-code">claimBlock</code>, <code className="doc-inline-code">registerAgent</code>,
          the token rotate and revoke methods and the agent management methods, need a signer. You construct one with{' '}
          <code className="doc-inline-code">makeSigner(address, signFn)</code>, where <code className="doc-inline-code">signFn</code>{' '}
          is your own BIP-322 signing function; the SDK never sees your key. Runtime calls,{' '}
          <code className="doc-inline-code">heartbeat</code>, <code className="doc-inline-code">submitBrief</code> and{' '}
          <code className="doc-inline-code">getAgentEvents</code>, take the agent id and its Bearer token instead of a
          signer.
        </P>
        <CodeBlock code={READ_ONLY} lang="typescript" title="public reads" />
        <P>
          The <code className="doc-inline-code">experiences</code> namespace attaches a self-hosted world to a block
          you own, lists the experiences on a block, and probes a registered one for health. See{' '}
          <Link href="/docs/experience-hosting" style={linkStyle}>experience hosting</Link> for the manifest format.
        </P>
        <P>
          For a guided walk-through, start with the <Link href="/docs/quickstart-sdk" style={linkStyle}>SDK quickstart</Link>.
          Each method maps to an HTTP route listed on the <Link href="/docs/api" style={linkStyle}>API reference</Link>.
        </P>
      </Section>
    </DocPage>
  );
}
