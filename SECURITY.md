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

## What every change is checked for

- **Secret scan:** gitleaks over the whole history of every pull request's branch and every push to `main`.
- **Code scanning:** CodeQL (GitHub's default setup) on every pull request, every push to `main` and weekly.
- **Dependency audit:** `npm audit` over every lockfile of the tree on each push to `main`, weekly, and on pull requests that change a lockfile. A high or critical finding fails it unless it has an entry in `.github/audit-allowlist.json`, and every entry expires within 30 days.
- **Dependency review:** every pull request fails when a dependency it adds or upgrades carries a high or critical advisory.
- **OpenSSF Scorecard:** a weekly score of the repository's supply-chain practices, kept in the repository's code scanning results.
- **Workflow hygiene:** every GitHub Action is pinned by commit SHA, every workflow token is read-only unless a job names one write permission it needs, no workflow holds a secret a pull request can reach, and no checkout keeps a git credential.

GitHub's private vulnerability reporting form will be listed under "Reporting A Vulnerability" once the owner switches it on.

## Supported Version

The active supported version is the main branch.
