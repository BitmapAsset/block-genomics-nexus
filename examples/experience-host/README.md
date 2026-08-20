# Self-hosted experience — minimal example

Run your own world, on your own server, and link it to a bitmap you own.

This is the open-metaverse shape of the Nexus protocol:

- **Bitcoin holds the deed.** The `.bitmap` inscription is the only thing on
  chain. Registering an experience writes **nothing** to Bitcoin — no inscription,
  no transaction, no fee, no chain bloat.
- **You hold the world.** The entry URL points at infrastructure you run. Nexus
  never hosts, proxies, or relays it, and cannot take it down without taking down
  the registry entry — your server keeps serving either way.
- **Nexus is the internet layer.** It registers the link, makes it discoverable,
  probes its health, and proves the link was authorized by the deed holder.

## 1. Run the host

```bash
node examples/experience-host/server.mjs --block 840000 --public-url https://plaza.example.com
```

Three routes, zero dependencies:

| Route | Purpose |
|---|---|
| `GET /` | the experience itself |
| `GET /health` | what the Nexus probe hits |
| `GET /.well-known/nexus-experience.json` | the manifest you publish |

The entry URL must be a **public `https://`** origin. Nexus refuses `http://`,
embedded credentials, and any host that is — or resolves to — a loopback,
private, link-local, or CGNAT address, so `localhost` is rejected at
registration. In development, put the server behind a tunnel
(`cloudflared`, `ngrok`, `tailscale funnel`) and pass that URL as `--public-url`.

## 2. Register it against your block

You need a BIP-322 signer for the wallet that holds the bitmap. The SDK never
sees your key — it calls a signer you supply.

```ts
import { BlockGenomicsClient, makeSigner } from 'block-genomics-connect';

const bg = new BlockGenomicsClient({ signer: makeSigner(process.env.WIF!) });

const exp = await bg.experiences.register({
  manifestVersion: 1,
  blockHeight: 840000,
  name: 'Pixel Plaza',
  description: 'A tiny self-hosted world on my bitmap.',
  experienceType: 'web',
  entryUrl: 'https://plaza.example.com',
  transport: 'https',
  healthUrl: 'https://plaza.example.com/health',
  capabilities: ['avatars', 'chat'],
  contentRating: 'everyone',
  version: '1.0.0',
  contentHash: 'sha256:…', // whatever your host publishes
});

console.log(exp.id, exp.signed, exp.manifestHash);
```

Never hardcode a WIF. Read it from the environment or a signing device.

What happens server-side, in order:

1. Your signature is checked against the wallet (BIP-322).
2. The signature is **action-bound** — it names the method, path, block, and a
   hash of this exact manifest, so it cannot be replayed or re-pointed.
3. Ownership is re-verified **live against the chain**. A definitive mismatch is
   a `403` even if the registry's cached snapshot still names you. It never
   fails open.
4. The one-time nonce is consumed.
5. The manifest text is judged against the constitution, then probed.

Sell the bitmap and this all follows the deed: your authorization stops working
the moment the chain says someone else holds it, and the new owner controls the
registration.

## 3. Verify it — without trusting the registry

```bash
curl https://blockgenomics.io/api/v1/experiences/<id>/verify
```

The registry re-derives the canonical manifest hash from the stored record and
checks your signature over it. If anything about the stored manifest changed
after you signed it — including by us — `verified` goes `false` and the mismatch
is named. That is what makes the registration tamper-evident rather than merely
authenticated.

Add `?remote=1` to also fetch `/.well-known/nexus-experience.json` from your
host and compare it to the registry:

```bash
curl 'https://blockgenomics.io/api/v1/experiences/<id>/verify?remote=1'
```

`remote.matchesRegistry: false` means your live host and your registration have
drifted — usually because you shipped a new build without re-registering. It is
reported as data, not as an error.

The same checks are available in the SDK (`bg.experiences.verify(id, true)`) and
over MCP (`bg_experience_verify`).

## The trust chain

```
Bitcoin inscription (the deed)
        │  proves who may authorize
        ▼
BIP-322 signature, action-bound
        │  commits to the exact manifest bytes
        ▼
canonical manifest hash
        │  stored, re-derivable by anyone
        ▼
your server, serving the world
```

No chain writes. No lock-in. Move your world to another host by updating the
manifest — the deed never moves.
