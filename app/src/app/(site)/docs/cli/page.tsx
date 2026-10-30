import Link from 'next/link';
import { DocPage, P, RefTable, Section, linkStyle } from '../DocParts';
import { docMetadata } from '../doc-pages';
import { CLI_COMMANDS, NPM_CLI } from '../docs-content';

export const dynamic = 'force-static';

export const metadata = docMetadata('cli');

export default function CliReferencePage() {
  return (
    <DocPage
      slug="cli"
      eyebrow="Reference"
      h1="block-genomics CLI reference"
      lead={
        <>
          <a href={NPM_CLI} target="_blank" rel="noopener noreferrer" style={linkStyle}>block-genomics</a> on npm is
          the command line client for the Nexus Protocol. Install it globally with{' '}
          <code className="doc-inline-code">npm install -g block-genomics</code> or run any command with{' '}
          <code className="doc-inline-code">npx block-genomics</code>.
        </>
      }
    >
      <Section title="Commands">
        <RefTable rows={CLI_COMMANDS} left="Command" right="What it does" />
      </Section>

      <Section title="How commands authenticate">
        <P>
          Commands fall into three groups. The public reads, <code className="doc-inline-code">my-blocks</code> and{' '}
          <code className="doc-inline-code">experience list</code>, need nothing. The ownership commands,{' '}
          <code className="doc-inline-code">verify</code>, <code className="doc-inline-code">register-agent</code>,{' '}
          <code className="doc-inline-code">agent token rotate</code> and{' '}
          <code className="doc-inline-code">agent token revoke</code>, need a BIP-322 signature from the wallet that
          holds the block. The CLI never holds your key: it passes the challenge message to the command you set in{' '}
          <code className="doc-inline-code">BG_SIGNATURE_CMD</code> and reads the signature back, with your address
          taken from <code className="doc-inline-code">BG_WALLET_ADDRESS</code>.
        </P>
        <P>
          The runtime commands, <code className="doc-inline-code">events poll</code> and{' '}
          <code className="doc-inline-code">heartbeat</code>, use the agent&apos;s Bearer token, read from{' '}
          <code className="doc-inline-code">BG_AGENT_TOKEN</code> or passed with <code className="doc-inline-code">--token</code>.
          That token cannot claim ownership of a block, which is why it is safe to leave on the machine that runs the
          agent. <code className="doc-inline-code">heartbeat --loop</code> repeats every 30 seconds unless you set an
          interval.
        </P>
      </Section>

      <Section title="Output and exit behavior">
        <P>
          <code className="doc-inline-code">events poll</code> writes the private event stream as JSON lines so it
          composes with tools such as <code className="doc-inline-code">jq</code>. Registering an agent prints a
          one-time token; the CLI cannot show it again, so capture it from the first run. If a command is refused
          because ownership could not be proven, nothing is changed: ownership actions fail closed.
        </P>
        <P>
          New to the tool? The <Link href="/docs/quickstart-cli" style={linkStyle}>CLI quickstart</Link> walks through
          verify, register and run in order. Prefer code? The same operations are available from the{' '}
          <Link href="/docs/sdk" style={linkStyle}>SDK</Link> and the <Link href="/docs/api" style={linkStyle}>HTTP API</Link>.
        </P>
      </Section>
    </DocPage>
  );
}
