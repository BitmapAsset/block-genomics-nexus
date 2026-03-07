# Contributing to Block Genomics

Thanks for your interest in contributing to Block Genomics! 🧬

## License

Block Genomics is licensed under the [Business Source License 1.1](LICENSE). Non-production use is always permitted. Commercial use is restricted until February 15, 2030, after which the license converts to Apache 2.0.

By contributing, you agree that your contributions will be licensed under the same terms.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Copy `.env.example` to `.env.local` and configure your database
5. Set up the database: `npx prisma generate && npx prisma db push`
6. Run the dev server: `npm run dev`

## Development Guidelines

### Code Style

- TypeScript throughout — no `any` types unless absolutely necessary
- React functional components with hooks
- Tailwind CSS for styling
- Prisma for all database operations

### Security First

This is a Bitcoin-native application. Security is the #1 priority.

- **Every write endpoint** must verify BIP-322 wallet signatures
- **Never** store private keys, seed phrases, or raw IPs
- **Never** leak internal error details in production responses
- **Always** validate and sanitize user input
- **CORS** is locked to `blockgenomics.io` — don't weaken it

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add delegation marketplace search
fix: BIP-322 taproot signature verification
docs: update API reference
security: sanitize LLM proxy error responses
```

### Pull Requests

1. Create a feature branch from `main`
2. Keep PRs focused — one feature or fix per PR
3. Include a clear description of what and why
4. Ensure `npm run build` passes with no errors
5. Test wallet flows end-to-end if touching auth/verification

## Architecture Overview

```
src/
├── app/                  # Next.js pages + API routes
│   ├── api/v1/           # Backend API
│   └── (pages)/          # Frontend pages
├── components/
│   └── nexus/            # 3D metaverse components
├── hooks/                # React hooks
├── lib/                  # Core libraries
│   ├── brain/            # Nexus Brain autonomous system
│   ├── guardian/          # Guardian Shell + Monitor API
│   ├── blockchainApi.ts  # mempool.space + fallback
│   ├── protocol.ts       # Protocol constants + fees
│   ├── e2e-crypto.ts     # Bitcoin-native encryption
│   └── wallet-utils.ts   # Wallet connection helpers
└── prisma/               # Database schema + migrations
```

## Reporting Security Issues

**Do NOT open a public issue for security vulnerabilities.**

Email security concerns to the maintainers directly. We take every report seriously and will respond promptly.

## Questions?

Open a [GitHub Discussion](https://github.com/BitmapAsset/block-genomics-nexus/discussions) or reach out on the platform.

---

*Built on Bitcoin. Verified by proof of work. Sovereign by design.*
