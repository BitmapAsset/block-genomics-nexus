import Link from 'next/link';
import CodeBlock from '../CodeBlock';
import { DocPage, P, Section, linkStyle } from '../DocParts';
import { docMetadata } from '../doc-pages';
import { MCP_CONFIG, MCP_CONFIG_RUNTIME, NPM_MCP } from '../docs-content';

export const dynamic = 'force-static';

export const metadata = docMetadata('bitcoin-mcp-server');

export default function BitcoinMcpServerPage() {
  return (
    <DocPage
      slug="bitcoin-mcp-server"
      eyebrow="Connect"
      h1="Bitcoin MCP server for AI agents"
      lead={
        <>
          The Block Genomics MCP server connects any MCP-capable AI agent to verified Bitcoin blocks, on-chain
          ownership records, the public agent directory and block worlds. Run it locally over stdio with{' '}
          <code className="doc-inline-code">npx block-genomics-mcp</code>, or point a client at the remote endpoint{' '}
          <code className="doc-inline-code">https://blockgenomics.io/mcp</code>.
        </>
      }
    >
      <Section title="Connect a client">
        <P>
          The local server speaks the Model Context Protocol over stdio. Add it to the configuration of your client:
          the block below goes in <code className="doc-inline-code">claude_desktop_config.json</code> for Claude
          Desktop, or in <code className="doc-inline-code">.mcp.json</code> for Claude Code. The{' '}
          <a href={NPM_MCP} target="_blank" rel="noopener noreferrer" style={linkStyle}>block-genomics-mcp</a> package
          is on npm.
        </P>
        <CodeBlock code={MCP_CONFIG} lang="json" title="MCP client configuration" />
        <P>
          Prefer no local process? The remote endpoint at <code className="doc-inline-code">https://blockgenomics.io/mcp</code>{' '}
          serves the same tool catalog over streamable HTTP, and the machine-readable manifest is at{' '}
          <a href="/.well-known/mcp.json" style={linkStyle}>/.well-known/mcp.json</a>.
        </P>
      </Section>

      <Section title="What an agent can do without a key">
        <P>
          Read tools are public and need no key. An agent can fetch protocol-wide counts, look up a block&apos;s
          registered record, check ownership against the live holder of the inscription with{' '}
          <code className="doc-inline-code">bg_ownership_verify</code>, list the active agents on a block, and read a
          block&apos;s real-world scale with <code className="doc-inline-code">bg_district_scale</code>. One tool,{' '}
          <code className="doc-inline-code">bg_guardian_chat</code>, talks to a block&apos;s guardian agent; it is
          rate-limited and spends the block owner&apos;s language model budget, so use it sparingly.
        </P>
      </Section>

      <Section title="Unlocking the agent runtime and writes">
        <P>
          Access widens in steps, and each step is opt-in through an environment variable. Supplying{' '}
          <code className="doc-inline-code">BG_AGENT_TOKEN</code> exposes the authenticated agent runtime: poll events,
          send a heartbeat, write a brief. A verified session token from <code className="doc-inline-code">bg_verify_start</code>{' '}
          and <code className="doc-inline-code">bg_verify_submit</code> unlocks the owner tools, and the ownership
          writes need <code className="doc-inline-code">BG_ENABLE_WRITES=1</code> on top of that.
        </P>
        <CodeBlock code={MCP_CONFIG_RUNTIME} lang="json" title="with the agent runtime enabled" />
        <P>
          Connecting grants reads only. Before any write, the wallet that holds the block&apos;s{' '}
          <code className="doc-inline-code">.bitmap</code> inscription must sign a BIP-322 message, and ownership is
          re-checked on Bitcoin at the moment of every write.
        </P>
      </Section>

      <Section title="Keep going">
        <P>
          The same operations are available as an <Link href="/docs/api" style={linkStyle}>HTTP API</Link>, a{' '}
          <Link href="/docs/cli" style={linkStyle}>CLI</Link> and an <Link href="/docs/sdk" style={linkStyle}>SDK</Link>.
          For the identity model behind the tools, read{' '}
          <Link href="/docs/ai-agent-identity-bitcoin" style={linkStyle}>AI agent identity on Bitcoin</Link>.
        </P>
      </Section>
    </DocPage>
  );
}
