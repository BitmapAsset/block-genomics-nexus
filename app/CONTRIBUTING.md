# Contributing to Block Genomics

Thanks for your interest in contributing to Block Genomics — the Bitcoin-native AI agent verification protocol.

---

## License

This app is the Nexus platform and is licensed under the
[Business Source License 1.1](LICENSE).

- **Production use:** Permitted, including self-hosting and commercial use
- **Only restriction:** Offering the platform to third parties as a competing paid hosted service
- **Change Date:** 2029-08-10, then Apache 2.0

The Nexus Protocol spec, SDK, MCP server, and CLI are MIT licensed —
see [`LICENSING.md`](../LICENSING.md).

By contributing, you agree that your contributions will be licensed under the same
terms as the component you are contributing to.

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (local or hosted — [Supabase](https://supabase.com) works well)
- A Bitcoin wallet for testing (Unisat, Xverse, or Leather)

### Setup

```bash
# Clone
git clone https://github.com/BitmapAsset/block-genomics-nexus.git
cd block-genomics-nexus

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local — at minimum set:
#   DATABASE_POSTGRES_PRISMA_URL
#   DATABASE_POSTGRES_URL_NON_POOLING
#   NEXT_PUBLIC_APP_URL=http://localhost:3000

# Set up database
npx prisma generate
npx prisma db push

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Key Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run db:generate  # Regenerate Prisma client
npm run db:push      # Push schema changes to DB
npm run db:studio    # Open Prisma Studio (DB GUI)
```

---

## Architecture Overview

```
src/
├── app/                    # Next.js App Router
│   ├── api/v1/             # 67+ API routes
│   └── (pages)/            # Frontend pages
├── components/
│   ├── nexus/              # 3D metaverse (Three.js)
│   └── auth/               # Wallet connection
├── context/                # React contexts (wallet, auth, notifications)
├── hooks/                  # Custom React hooks
├── lib/                    # Core libraries
│   ├── protocol.ts         # Protocol constants + tier system
│   ├── genome-utils.ts     # Genome generation
│   ├── blockchainApi.ts    # Bitcoin data fetching
│   ├── e2e-crypto.ts       # End-to-end encryption
│   ├── llm-proxy.ts        # LLM routing (5 providers)
│   └── brain/              # Nexus Brain moderation
├── types/                  # TypeScript types
prisma/
├── schema.prisma           # Database schema (30+ models)
└── migrations/             # Migration history
```

For full details: [Architecture Guide](docs/ARCHITECTURE.md)

---

## Development Guidelines

### Code Style

- **TypeScript** throughout — avoid `any` unless absolutely necessary
- **React** functional components with hooks
- **Tailwind CSS** for styling (dark theme only)
- **Prisma** for all database operations
- No raw SQL queries

### File Conventions

- API routes: `src/app/api/v1/<domain>/route.ts`
- Components: PascalCase (`WalletConnect.tsx`)
- Libraries: camelCase (`genome-utils.ts`)
- One component per file

### Testing Wallet Flows

When touching auth or verification:

1. Connect a real Bitcoin wallet (testnet or mainnet)
2. Test the full challenge → sign → verify flow
3. Verify BIP-322 signature validation works
4. Test with multiple wallet types (Unisat, Xverse, Leather)

---

## Security Requirements

This is a Bitcoin-native application. Security is the **#1 priority**.

### Mandatory for all write endpoints:

- BIP-322 wallet signature verification
- Challenge nonce validation (anti-replay)
- Input sanitization (`sanitizeString()` from `api-helpers.ts`)
- Field allowlisting (no raw `req.body` pass-through)
- Ownership verification before mutations

### Never do:

- Store private keys, seed phrases, or raw IP addresses
- Leak internal error details in production responses
- Weaken CORS (locked to `blockgenomics.io`)
- Skip signature verification on any write endpoint
- Pass user input directly to database queries
- Expose LLM API keys (must be encrypted with AES-256-GCM)
- Use `eval()` or dynamic code execution with user input

### Security Review Checklist

Before submitting a PR that touches API routes:

- [ ] All write endpoints verify BIP-322 signatures
- [ ] Challenge nonces are consumed after use
- [ ] User input is sanitized and length-limited
- [ ] Only allowlisted fields are accepted in request bodies
- [ ] Ownership is verified before modifying resources
- [ ] Error responses don't leak internal details
- [ ] No new `any` types in security-critical paths

---

## Commit Messages

Use clear, descriptive commit messages with a type prefix:

```
feat: add parcel rentals search
fix: BIP-322 taproot signature verification
docs: update API reference
security: sanitize LLM proxy error responses
refactor: extract wallet connection logic
perf: cache block data for 5 minutes
test: add verification flow tests
chore: update Prisma to 6.20
```

### Types

| Prefix | Usage |
|--------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `security` | Security improvement |
| `refactor` | Code change that doesn't fix a bug or add a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Tooling, dependencies, config |

---

## Pull Request Process

### Before Opening a PR

1. Create a feature branch from `main`
2. Keep the PR focused — one feature or fix per PR
3. Run `npm run build` and ensure it passes with no errors
4. Run `npm run lint` and fix any warnings
5. Test wallet flows end-to-end if touching auth/verification

### PR Description

Include:

- **What** changed and **why**
- Screenshots for UI changes
- Security considerations for API changes
- Database migration notes if schema changed

### PR Template

```markdown
## Summary

Brief description of changes.

## Changes

- Added/modified/removed X
- Updated Y to fix Z

## Security

- [ ] No new write endpoints without BIP-322 verification
- [ ] Input validation added for new fields
- [ ] No secrets or keys in committed code

## Testing

- [ ] `npm run build` passes
- [ ] Tested with wallet (specify type)
- [ ] API endpoints return expected responses
```

### Review Process

1. At least one maintainer review required
2. CI must pass (build + lint)
3. Security-sensitive changes require additional review
4. Schema changes require migration plan

---

## Database Changes

### Adding a New Model

1. Add the model to `prisma/schema.prisma`
2. Add appropriate indexes (especially for query patterns)
3. Run `npx prisma db push` to apply locally
4. Test the migration path
5. Document the model in your PR

### Guidelines

- Always add indexes on foreign keys and frequently queried columns
- Use `@default(cuid())` for string IDs
- Use `@default(now())` for timestamps
- Add `@@index` for columns used in WHERE clauses
- Prefer JSON strings (`String`) over `Json` type for structured data stored as text

---

## Adding API Endpoints

### Template

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWalletSignature, sanitizeString, isValidBitcoinAddress } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, message, ...fields } = body;

    // 1. Validate required fields
    if (!walletAddress || !signature || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 2. Validate address format
    if (!isValidBitcoinAddress(walletAddress)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    // 3. Verify BIP-322 signature
    const valid = await verifyWalletSignature(walletAddress, message, signature);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // 4. Sanitize inputs
    const sanitizedName = sanitizeString(fields.name, 100);

    // 5. Verify ownership (if applicable)
    // ...

    // 6. Perform operation
    const result = await prisma.model.create({
      data: {
        // Only allowlisted fields
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### Checklist for New Endpoints

- [ ] BIP-322 signature verification for writes
- [ ] Input validation and sanitization
- [ ] Field allowlisting (no raw body pass-through)
- [ ] Proper error codes (400/401/403/404/500)
- [ ] Error messages sanitized in production
- [ ] Added to [API Reference](docs/API.md)

---

## Reporting Security Issues

**Do NOT open a public issue for security vulnerabilities.**

Email security concerns to the maintainers directly. We take every report seriously and will respond within 48 hours.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

---

## Project Structure Quick Reference

| Area | Key Files |
|------|-----------|
| Protocol constants | `src/lib/protocol.ts` |
| Genome algorithm | `src/lib/genome-utils.ts` |
| Bitcoin data | `src/lib/blockchainApi.ts` |
| Wallet connection | `src/lib/wallet-utils.ts` |
| Auth helpers | `src/lib/api-helpers.ts` |
| Database schema | `prisma/schema.prisma` |
| Guardian config | `src/lib/guardian-templates.ts` |
| LLM routing | `src/lib/llm-proxy.ts` |
| Encryption | `src/lib/e2e-crypto.ts` |
| API routes | `src/app/api/v1/` |

---

## Questions?

- Open a [GitHub Discussion](https://github.com/BitmapAsset/block-genomics-nexus/discussions)
- Read the [Protocol Spec](PROTOCOL.md) and [API Reference](docs/API.md)
- Check the [Architecture Guide](docs/ARCHITECTURE.md)

---

*Built on Bitcoin. Verified by proof of work. Sovereign by design.*
