import Link from 'next/link';
import CodeBlock from '../CodeBlock';
import { Badge, DocPage, P, Section, Td, Th, linkStyle, methodColor } from '../DocParts';
import { docMetadata } from '../doc-pages';
import { CURL_CHALLENGE, CURL_RUNTIME, CURL_SANDBOX, CURL_STATS, ENDPOINTS, openApiVersion } from '../docs-content';

export const dynamic = 'force-static';

export const metadata = docMetadata('api');

export default function ApiReferencePage() {
  const specVersion = openApiVersion();
  return (
    <DocPage
      slug="api"
      eyebrow="Reference"
      h1="Bitcoin block identity API reference"
      lead={
        <>
          The Nexus Protocol API lets you read Bitcoin block ownership, request challenges, register agents and run
          them. The base URL is <code className="doc-inline-code">https://blockgenomics.io</code>. Responses are JSON
          envelopes: <code className="doc-inline-code">{'{ success, data }'}</code> on success or{' '}
          <code className="doc-inline-code">{'{ success: false, error }'}</code> on failure.
        </>
      }
    >
      <div className="mb-8 flex flex-wrap gap-2">
        <Badge color="bitcoin">OpenAPI {specVersion}</Badge>
        <Badge color="cyan">Nexus Protocol v1.0</Badge>
      </div>

      <Section title="Endpoints">
        <P>
          The machine-readable descriptor is <a href="/openapi.json" style={linkStyle}>/openapi.json</a>. The
          <em> Auth</em> column shows what each route needs: nothing, a sandbox key, a BIP-322 signature over a
          single-use challenge, or the per-agent Bearer token issued at registration.
        </P>
        <div className="my-4 overflow-x-auto rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(102,204,255,0.06)' }}>
                <Th>Method</Th><Th>Path</Th><Th>Auth</Th><Th>Description</Th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.method + e.path} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <Td><span className="font-mono text-xs" style={{ color: methodColor(e.method) }}>{e.method}</span></Td>
                  <Td><code className="doc-inline-code">{e.path}</code></Td>
                  <Td><span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{e.auth}</span></Td>
                  <Td><span style={{ color: 'var(--color-text-secondary)' }}>{e.note}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Try it without a Bitmap">
        <P>
          <strong style={{ color: 'var(--color-text-primary)' }}>No Bitmap yet?</strong> Mint a read-only sandbox key
          and start calling reads immediately: 100 requests per UTC day, no wallet, no signature. Writes stay gated
          on ownership and return a 403 with the upgrade steps.
        </P>
        <CodeBlock code={CURL_SANDBOX} lang="bash" title="sandbox: mint a key and use it" />
      </Section>

      <Section title="Challenges and public reads">
        <P>
          Every ownership action starts with a challenge bound to a purpose. Ask for one, sign the returned message
          with the wallet that holds the block, and submit the signature to the route that needs it. Protocol-wide
          counts are a plain public read.
        </P>
        <CodeBlock code={CURL_CHALLENGE} lang="bash" title="request a challenge" />
        <CodeBlock code={CURL_STATS} lang="bash" title="read stats" />
      </Section>

      <Section title="Agent runtime routes">
        <P>
          Once an agent is registered, its runtime uses the Bearer token returned at registration rather than your
          wallet key. Heartbeat asserts liveness, and the events route returns the agent&apos;s private event stream
          most-recent first.
        </P>
        <CodeBlock code={CURL_RUNTIME} lang="bash" title="runtime routes (Bearer token)" />
        <P>
          Prefer a client library? See the <Link href="/docs/sdk" style={linkStyle}>SDK reference</Link> and the{' '}
          <Link href="/docs/cli" style={linkStyle}>CLI reference</Link>; both wrap these routes. The normative wire
          contract is the <Link href="/protocol" style={linkStyle}>Nexus Protocol specification</Link>.
        </P>
      </Section>
    </DocPage>
  );
}
