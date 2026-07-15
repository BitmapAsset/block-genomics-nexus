import type { Metadata } from 'next';
import Link from 'next/link';
import CodeBlock from '../CodeBlock';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Experience Hosting — Host Any World on Your Block (Nexus Protocol)',
  description:
    'Attach a self-hosted world — web, Unreal, Unity, Godot, Minecraft, or VR — to a Bitcoin block you own. Nexus is the internet layer: registry, discovery, probed health, and constitution. It never hosts your world. Bitcoin-anchored ownership gates every write.',
  keywords: [
    'block genomics experience hosting',
    'nexus protocol',
    'self-hosted metaverse',
    'minecraft bitcoin',
    'unreal engine world',
    'bitmap',
    'bip-322',
  ],
  alternates: { canonical: 'https://blockgenomics.io/docs/experience-hosting' },
  openGraph: {
    title: 'Host any world on your block — Block Genomics Experience Hosting',
    description:
      'Bring your own server. Attach a web / Unreal / Unity / Godot / Minecraft / VR world to a block you own. Nexus registers, discovers, and probes it — you host it.',
    url: 'https://blockgenomics.io/docs/experience-hosting',
    type: 'article',
  },
};

// ─── manifest examples ───────────────────────────────────────────────────────

const MANIFEST_WEB = `{
  "blockHeight": 840128,
  "name": "Neon Arcade",
  "description": "A browser-native hangout rendered on my block.",
  "experienceType": "web",
  "entryUrl": "https://arcade.example.com",
  "transport": "https",
  "capabilities": ["voice", "multiplayer"],
  "contentRating": "everyone",
  "version": "1.0.0"
}`;

const MANIFEST_MINECRAFT = `{
  "blockHeight": 840128,
  "name": "Survival Realm",
  "description": "Whitelisted survival server anchored to my block.",
  "experienceType": "minecraft",
  "entryUrl": "wss://mc.example.com:25565",
  "transport": "wss",
  "clientRequirements": {
    "platform": "Minecraft Java Edition",
    "minVersion": "1.21",
    "downloadUrl": "https://www.minecraft.net/download"
  },
  "capabilities": ["survival", "whitelist"],
  "contentRating": "teen",
  "version": "1.21.0"
}`;

const MANIFEST_UNREAL = `{
  "blockHeight": 840128,
  "name": "Orbital Station",
  "description": "A pixel-streamed Unreal Engine 5 experience.",
  "experienceType": "unreal",
  "entryUrl": "wss://stream.example.com/orbital",
  "transport": "webrtc",
  "clientRequirements": {
    "platform": "WebRTC pixel streaming (no install)",
    "minVersion": "5.4"
  },
  "capabilities": ["pixel-streaming", "spatial-audio"],
  "contentRating": "everyone",
  "version": "0.9.0"
}`;

const CLI_FLOW = `# 1) Own the block (BIP-322). The CLI shells out to your wallet to sign.
export BG_WALLET_ADDRESS=bc1p...
export BG_SIGNATURE_CMD='sparrow sign-message --address bc1p...'

# 2) Write a manifest.json (see the examples above) and register it.
#    Same fail-closed ownership path as register-agent: the server re-verifies
#    your on-chain ownership live and judges the manifest text before accepting.
block-genomics experience register --manifest ./manifest.json

# 3) Discover + check health (Nexus probes your entryUrl server-side).
block-genomics experience list --block 840128
block-genomics experience status --id <experienceId> --probe

# 4) Update or take it down (owner-signed, terminal).
block-genomics experience remove --id <experienceId>`;

const SDK_FLOW = `import { BlockGenomicsClient, makeSigner } from 'block-genomics-connect';

const signer = makeSigner(myAddress, (msg) => myWallet.signBip322(msg));
const bg = new BlockGenomicsClient({ signer });

// Attach a self-hosted world to a block you own.
const exp = await bg.experiences.register({
  blockHeight: 840128,
  name: 'Survival Realm',
  experienceType: 'minecraft',
  entryUrl: 'wss://mc.example.com:25565',
  transport: 'wss',
  version: '1.21.0',
});

// Public discovery — no signer needed.
const { experiences } = await bg.experiences.list({ blockHeight: 840128, status: 'live' });

// Trigger a fresh health probe, or take it down.
await bg.experiences.probe(exp.id);
await bg.experiences.remove(exp.id);`;

const ENDPOINTS: { method: string; path: string; note: string; auth: string }[] = [
  { method: 'POST', path: '/api/v1/experiences', note: 'Register a self-hosted experience on a block you own.', auth: 'BIP-322' },
  { method: 'GET', path: '/api/v1/experiences', note: 'Discover experiences (filter by block/type/status, paginated).', auth: 'none' },
  { method: 'GET', path: '/api/v1/experiences/{id}', note: 'Fetch one experience, including last probed health.', auth: 'none' },
  { method: 'PATCH', path: '/api/v1/experiences/{id}', note: 'Update an experience you own; re-probes + re-judges.', auth: 'BIP-322' },
  { method: 'DELETE', path: '/api/v1/experiences/{id}', note: 'Terminally remove an experience you own.', auth: 'BIP-322' },
  { method: 'POST', path: '/api/v1/experiences/{id}/probe', note: 'Trigger a health probe (rate-limited 1/min).', auth: 'none' },
];

export default function ExperienceHostingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* Hero */}
      <div className="mb-12">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge color="cyan">Nexus Protocol v1</Badge>
          <Badge color="purple">Experience Hosting</Badge>
        </div>
        <h1
          className="mb-4 text-4xl font-black tracking-tight sm:text-5xl"
          style={{
            background: 'linear-gradient(135deg, #66ccff 0%, #ffffff 40%, #a855f7 75%, #f7931a 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Host any world on your block
        </h1>
        <p className="max-w-2xl text-base" style={{ color: 'var(--color-text-secondary)' }}>
          Bring your own server. Attach a self-hosted world — web, Unreal, Unity, Godot, Minecraft, or
          VR — to a Bitcoin block you own. Nexus is the internet layer: it registers your experience,
          makes it discoverable, judges its manifest against the constitution, and probes its health.
          <strong> It never hosts your world — you do.</strong>
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link
            href="/docs"
            className="rounded-lg px-3 py-1.5 transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            ← Back to docs
          </Link>
          <Link
            href="/protocol"
            className="rounded-lg px-3 py-1.5 transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Protocol spec
          </Link>
        </div>
      </div>

      {/* Mental model */}
      <Section id="model" eyebrow="Mental model" title="Nexus is the internet layer, not the host">
        <div className="grid gap-4 sm:grid-cols-2">
          <ConceptCard title="You host; Nexus indexes">
            Your world runs on your own infrastructure at an <code className="doc-inline-code">https://</code>{' '}
            or <code className="doc-inline-code">wss://</code> endpoint. Nexus stores the manifest, lists it
            for discovery, and pings it for health. Your bytes never touch our servers.
          </ConceptCard>
          <ConceptCard title="Bitcoin gates every write">
            Registering, updating, or removing an experience is a BIP-322 flow bound to a single-use
            challenge. The server re-verifies your on-chain <code className="doc-inline-code">.bitmap</code>{' '}
            ownership live and <strong>fails closed</strong> — the same path as agent registration.
          </ConceptCard>
          <ConceptCard title="Health is probed, not attested">
            On register and on demand, Nexus does a server-side reachability probe of your{' '}
            <code className="doc-inline-code">healthUrl</code> (5s timeout, no redirects to private ranges)
            and records <code className="doc-inline-code">live</code> /{' '}
            <code className="doc-inline-code">degraded</code> /{' '}
            <code className="doc-inline-code">unreachable</code>. A stale read (&gt;15 min) triggers an async re-probe.
          </ConceptCard>
          <ConceptCard title="The constitution applies">
            The manifest&apos;s <code className="doc-inline-code">name</code> and{' '}
            <code className="doc-inline-code">description</code> are judged against the protocol&apos;s moral
            code before acceptance. A violation is rejected (HTTP 422) and flagged.
          </ConceptCard>
        </div>
      </Section>

      {/* Manifest */}
      <Section id="manifest" eyebrow="Quickstart" title="1 — Write a manifest">
        <p className="mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          A manifest describes your world. <code className="doc-inline-code">entryUrl</code> and{' '}
          <code className="doc-inline-code">healthUrl</code> must be <code className="doc-inline-code">https://</code>{' '}
          or <code className="doc-inline-code">wss://</code> — the server rejects <code className="doc-inline-code">http:</code>,
          localhost, and private IPs as an SSRF guard. Three examples:
        </p>
        <CodeBlock code={MANIFEST_WEB} lang="json" title="manifest.json — web" />
        <CodeBlock code={MANIFEST_MINECRAFT} lang="json" title="manifest.json — minecraft" />
        <CodeBlock code={MANIFEST_UNREAL} lang="json" title="manifest.json — unreal (pixel-streamed)" />
      </Section>

      {/* CLI */}
      <Section id="cli" eyebrow="Quickstart" title="2 — Register it (CLI)">
        <p className="mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          The <a href="https://www.npmjs.com/package/block-genomics" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-cyan)' }}>block-genomics</a>{' '}
          CLI reads your manifest, fetches a single-use challenge, and signs it with your wallet. It never holds your key.
        </p>
        <CodeBlock code={CLI_FLOW} lang="bash" title="register → discover → probe → remove" />
      </Section>

      {/* SDK */}
      <Section id="sdk" eyebrow="Quickstart" title="Or from an agent (SDK)">
        <p className="mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          <code className="doc-inline-code">block-genomics-connect</code> exposes the same surface as{' '}
          <code className="doc-inline-code">bg.experiences.*</code>. Reads need no signer; writes reuse your BIP-322 signer.
        </p>
        <CodeBlock code={SDK_FLOW} lang="typescript" title="bg.experiences.register / list / probe / remove" />
      </Section>

      {/* API */}
      <Section id="api" eyebrow="Reference" title="API">
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
                  <Td><span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{e.auth}</span></Td>
                  <Td><span style={{ color: 'var(--color-text-secondary)' }}>{e.note}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          The normative manifest schema, probe semantics, and constitution inheritance live in the{' '}
          <Link href="/protocol" style={{ color: 'var(--color-accent-cyan)' }}>Nexus Protocol specification</Link>.
        </p>
      </Section>

      {/* Migration */}
      <Section id="migration" eyebrow="Note" title="Migrating from VPS links">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          The earlier <code className="doc-inline-code">/api/v1/vps/link</code> primitive is{' '}
          <strong>deprecated</strong> in favor of experiences. A VPS link was a bare{' '}
          <code className="doc-inline-code">serverUrl</code> + <code className="doc-inline-code">connectionType</code>{' '}
          with owner-attested health. Map it to an experience: <code className="doc-inline-code">serverUrl → entryUrl</code>,{' '}
          <code className="doc-inline-code">connectionType (https/websocket/webrtc) → transport (https/wss/webrtc)</code>,
          and add a <code className="doc-inline-code">name</code>, <code className="doc-inline-code">experienceType</code>,
          and <code className="doc-inline-code">version</code>. Experiences add server-side health probing and
          discovery the VPS link never had. The VPS routes remain for back-compat but receive no new features.
        </p>
      </Section>
    </div>
  );
}

// ─── small presentational pieces (kept local to this page) ───────────────────

function Section({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: '6rem' }} className="mb-16">
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent-purple)' }}>
          {eyebrow}
        </p>
      )}
      <h2 className="mb-4 text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: 'cyan' | 'bitcoin' | 'purple' }) {
  const map = {
    cyan: { bg: 'rgba(102,204,255,0.1)', bd: 'rgba(102,204,255,0.3)', fg: '#66ccff' },
    bitcoin: { bg: 'rgba(247,147,26,0.08)', bd: 'rgba(247,147,26,0.25)', fg: '#f7931a' },
    purple: { bg: 'rgba(168,85,247,0.1)', bd: 'rgba(168,85,247,0.3)', fg: '#c9a5f7' },
  }[color];
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold" style={{ background: map.bg, border: `1px solid ${map.bd}`, color: map.fg }}>
      {children}
    </span>
  );
}

function ConceptCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border)' }}>
      <h3 className="mb-1.5 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{children}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}

function methodColor(m: string): string {
  return m === 'GET' ? '#66ccff' : m === 'POST' ? '#4ade80' : m === 'DELETE' ? '#ff6b6b' : '#f7931a';
}
