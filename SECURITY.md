# Security Policy

Block Genomics Nexus handles Bitcoin wallet signatures, Bitmap ownership checks, and owner-authorized world mutations. Please report vulnerabilities privately.

## Reporting A Vulnerability

Email bitmapholdings@gmail.com with:

- affected component or endpoint,
- impact,
- reproduction steps,
- relevant request and response examples,
- suggested fix if known.

Do not include seed phrases, private keys, or unrelated personal data in the report. Do not open a public GitHub issue for an active vulnerability.

## Security Scope

High-priority areas include:

- wallet signature verification,
- Bitmap ownership resolution,
- world object and terrain mutation endpoints,
- authentication and challenge flows,
- database access control,
- secret handling,
- dependency vulnerabilities,
- cross-site scripting or request forgery in the Next.js app.

## Expected Controls

- Write endpoints must verify signatures and ownership.
- Mutation payloads must use allowlisted fields.
- Secrets must come from environment variables or managed secret stores.
- Local .env files and generated artifacts must remain untracked.
- Dependency updates should be tested with npm ci and npm run build in app/.

## Supported Version

The active supported version is the main branch.
