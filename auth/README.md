# 🔐 Block Genomics Auth — "Sign in with Block Genomics"

> **Bitcoin-native authentication for the agentic internet.**
> Like "Sign in with Google" — but sovereign, decentralized, and anchored to Bitcoin blocks.

---

## What Is This?

Block Genomics Auth (BG Auth) is an authentication protocol that lets any website, app, or service verify identity using Bitcoin block ownership. Instead of passwords, OAuth tokens from Big Tech, or centralized identity providers, BG Auth proves identity through **cryptographic genomes** — unique fingerprints derived from Bitcoin block data and verified via BIP-322 signatures.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   "Sign in with Google"  →  Google knows who you are         │
│   "Sign in with BG"      →  Bitcoin proves who you are       │
│                                                              │
│   OAuth token             →  Revocable by provider           │
│   BG token                →  Anchored to Bitcoin forever     │
│                                                              │
│   SSL certificate         →  "Is this website real?"         │
│   BG genome badge         →  "Is this agent real?"           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Why?

The internet was built without an identity layer. OAuth patched it with centralized providers. AI agents need something better:

- **No single point of failure** — No Google/Apple/Meta controlling your identity
- **Bitcoin-native trust** — Trust scores derived from on-chain block data
- **Works for AI agents** — Server-to-server auth without a browser
- **Works for humans** — Wallet-based browser flow, just like Web3 login
- **Carries trust metadata** — Tokens include trust score, tier, and genome data
- **Self-hostable** — Run your own BG Auth server, or use our hosted version

## Quick Start

### Add "Sign in with BG" to your website (5 lines of code)

```html
<script src="https://auth.blockgenomics.io/widget.js"></script>
<bg-signin
  client-id="your-client-id"
  scopes="identity trust_score"
  on-success="handleAuth"
/>
<script>
  function handleAuth(identity) {
    console.log(identity.genomeId);    // "bg_7a3fc912..."
    console.log(identity.trustScore);  // 94
    console.log(identity.tier);        // 1
  }
</script>
```

### Verify tokens server-side

```typescript
import { BGAuth } from '@blockgenomics/server-sdk';

const bg = BGAuth.init({ clientSecret: process.env.BG_SECRET });

// Express middleware
app.use('/protected', bg.middleware({ minTrustScore: 50 }));

// Manual verification
const identity = await bg.verifyToken(token);
// { genomeId, trustScore, tier, blockHeight, ... }
```

### AI agent authentication (no browser needed)

```typescript
import { BGAuth } from '@blockgenomics/client-sdk';

const bg = BGAuth.init({ clientId: 'your-client-id' });
const challenge = await bg.requestChallenge(genomeId);
const signed = await signWithBIP322(challenge.message, privateKey);
const token = await bg.submitProof(genomeId, signed);
// Agent is now authenticated
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      YOUR APPLICATION                       │
│                                                             │
│   ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│   │ Browser Flow │  │  API Flow    │  │  Widget Flow    │   │
│   │ (humans)     │  │  (AI agents) │  │  (drop-in)      │   │
│   └──────┬──────┘  └──────┬───────┘  └────────┬────────┘   │
│          │                │                    │            │
│          └────────────────┼────────────────────┘            │
│                           │                                 │
│                    ┌──────▼──────┐                           │
│                    │  Client SDK │                           │
│                    └──────┬──────┘                           │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            │ HTTPS / WebSocket
                    ┌───────▼───────┐
                    │  BG Auth      │  ← Self-hosted or
                    │  Server       │     auth.blockgenomics.io
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │  Bitcoin      │  ← BIP-322 verification
                    │  Blockchain   │     Block data, ownership
                    └───────────────┘
```

## Three Auth Flows

| Flow | For | How It Works |
|------|-----|--------------|
| **Browser Flow** | Human users | Wallet popup → BIP-322 signature → Token (like OAuth redirect) |
| **API Flow** | AI agents / servers | Challenge-response → BIP-322 proof → Token (no browser) |
| **Widget Flow** | Quick integration | Drop-in `<bg-signin>` component → Callback with identity |

## Token Contents

BG Auth tokens are JWTs carrying genome-specific claims:

```json
{
  "sub": "bg_7a3fc912a1b4e8d0",
  "genome_id": "7a3fc912a1b4e8d0f5c6b7a8e9d0c1b2",
  "block_height": 800000,
  "tier": 1,
  "trust_score": 94,
  "scopes": ["identity", "trust_score", "genome_data"],
  "iss": "https://auth.blockgenomics.io",
  "iat": 1706918400,
  "exp": 1706922000
}
```

## Scopes

| Scope | What It Reveals |
|-------|-----------------|
| `identity` | Genome ID, tier |
| `trust_score` | Current trust score (0-100) |
| `genome_data` | Full genome hash, DNA sequence |
| `block_info` | Block height, hash, timestamp |
| `trust_details` | Trust score breakdown (age, richness, security, etc.) |
| `delegations` | Delegation chain (for Tier 2/3 agents) |
| `claims` | Special block traits (mythic, epic, patoshi, etc.) |

## Comparison to Existing Auth

| Feature | OAuth 2.0 | OIDC | BG Auth |
|---------|-----------|------|---------|
| Identity source | Platform account | Platform account | Bitcoin block ownership |
| Trust model | Binary (authed/not) | Binary + claims | Graduated (0-100 score) |
| Revocable by provider | ✅ | ✅ | ❌ (sovereign) |
| Works for AI agents | Awkward | Awkward | ✅ Native |
| Self-hostable | Partially | Partially | ✅ Fully |
| Carries trust metadata | ❌ | Limited | ✅ Rich |
| Signing method | HMAC/RSA | HMAC/RSA | BIP-322 (Bitcoin-native) |

## Files in This Directory

| File | Description |
|------|-------------|
| [`PROTOCOL-SPEC.md`](./PROTOCOL-SPEC.md) | Full protocol specification |
| [`INTEGRATION-GUIDE.md`](./INTEGRATION-GUIDE.md) | Step-by-step integration guide |
| [`token-spec.ts`](./token-spec.ts) | Token format and signing specification |
| [`client-sdk.ts`](./client-sdk.ts) | Client-side SDK for integrating apps |
| [`server-sdk.ts`](./server-sdk.ts) | Server-side verification library |
| [`flows/browser-flow.ts`](./flows/browser-flow.ts) | Browser-based auth (popup/redirect) |
| [`flows/api-flow.ts`](./flows/api-flow.ts) | Server-to-server auth (AI agents) |
| [`flows/widget-flow.ts`](./flows/widget-flow.ts) | Embeddable "Sign in with BG" button |
| [`examples/nextjs-integration.ts`](./examples/nextjs-integration.ts) | Next.js integration example |
| [`examples/discord-bot.ts`](./examples/discord-bot.ts) | Discord bot with BG verification |
| [`examples/express-middleware.ts`](./examples/express-middleware.ts) | Express middleware example |

## Security Model

- **PKCE** (Proof Key for Code Exchange) for browser flows
- **BIP-322** signatures for Bitcoin-native proof of ownership
- **Nonce verification** prevents replay attacks
- **Short-lived tokens** (1 hour) with refresh capability
- **No token storage on our servers** — stateless JWT verification
- **Challenge expiration** (5 minutes) prevents pre-computation attacks
- **Genome binding** — tokens are cryptographically bound to specific genomes

## License

MIT — Block Genomics, 2026
