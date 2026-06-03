# Contributing To Block Genomics Nexus

Thank you for contributing. This repository is security-sensitive because it handles Bitcoin wallet signatures, ownership checks, and world-state writes.

## License

By contributing, you agree that your contributions are licensed under the same terms as the repository. See [LICENSE](LICENSE).

## Local Setup

    cd app
    npm ci
    npm run build
    npm run dev

The app expects database and provider environment variables for full local operation. Keep local values in .env.local or another ignored environment file.

## Pull Request Standards

- Keep each pull request focused on one feature, fix, or documentation change.
- Run npm run build from app/ before opening a PR.
- Add or update tests when changing verification, ownership, API, or persistence behavior.
- Document API or SDK changes in docs/sdk/.
- Do not commit generated output, dependency directories, local environment files, private notes, or credentials.

## Security Requirements

For write endpoints and wallet flows:

- Verify wallet signatures before mutation.
- Check Bitmap block ownership before accepting owner-scoped writes.
- Use allowlisted fields for request bodies.
- Validate and bound user input.
- Avoid leaking internal errors in production responses.
- Never request or store seed phrases, private keys, or raw wallet credentials.

## Commit Messages

Use clear messages with a type prefix:

    feat: add world object search
    fix: reject unsigned terrain updates
    docs: expand SDK terrain reference
    security: enforce owner check on world writes
    chore: update lockfile audit fixes

## Reporting Vulnerabilities

Do not open a public issue for a live vulnerability. Follow [SECURITY.md](SECURITY.md).
