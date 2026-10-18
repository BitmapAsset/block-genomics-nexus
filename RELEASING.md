# Releasing

Three packages in this repository are published to npm by
`.github/workflows/release.yml`:

| Package | Directory |
|---|---|
| `block-genomics-connect` | `sdk/agent-connect` |
| `block-genomics-mcp` | `packages/bg-mcp` |
| `block-genomics` (the CLI) | `cli` |

Publishing happens only from GitHub Actions, through npm Trusted Publishing
(OIDC). No npm token is stored anywhere, and every published version carries
a provenance attestation linking it to the exact workflow run and commit.

## Cutting a release

1. In a pull request, bump `version` in the `package.json` (and
   `package-lock.json`) of each package you are releasing, and update its
   `CHANGELOG.md`. Merge it once CI is green.
2. Tag the merge commit on `main` and push the tag:

   ```bash
   git checkout main && git pull --ff-only
   git tag -a v1.3.0 -m "v1.3.0"
   git push origin v1.3.0
   ```

   Tags are repository-wide (`v*`) and are not tied to any one package's
   version. Pick the next unused tag; `git tag --sort=-v:refname | head` shows
   the latest (`v1.2.1` at the time of writing). The older `cli-v*` tag
   scheme is retired: `release.yml` only reacts to `v*`.
3. The workflow then:
   - refuses to run if the tagged commit is not on `main`;
   - runs the sdk, mcp and cli test suites;
   - for each package, publishes the version in its `package.json` unless
     that exact version is already on npm (so untouched packages are skipped,
     not failed);
   - once every package has published or skipped, creates a GitHub Release
     for the tag with notes generated from the merged pull requests.
4. Check: `npm view <package> version` shows the new version, and the npm
   package page shows a *Provenance* badge.

A publish leg that fails does not cancel the others, and blocks the GitHub
Release. Fix the cause, then re-run the failed jobs from the Actions tab:
already-published packages are skipped on the re-run, and an existing
Release is left untouched.

## One-time setup: npm Trusted Publisher, per package

Do this once for each of the three packages, signed in to npmjs.com as a
maintainer of the package:

1. npmjs.com → the package → **Settings** → **Trusted Publisher** →
   *Select your publisher*: **GitHub Actions**.
2. Enter exactly:

   | Field | Value |
   |---|---|
   | Organization or user | `BitmapAsset` |
   | Repository | `block-genomics-nexus` |
   | Workflow filename | `release.yml` |
   | Environment name | *(leave blank)* |
   | Allowed actions | tick **npm publish** |

   Publishers created after 3 September 2026 allow only `npm stage publish`
   by default. `release.yml` runs `npm publish`, so that box must be ticked
   or the publish fails with a 403.
3. Save. Repeat for the other two packages:
   - <https://www.npmjs.com/package/block-genomics-connect/access>
   - <https://www.npmjs.com/package/block-genomics-mcp/access>
   - <https://www.npmjs.com/package/block-genomics/access>

### Retiring token publishing

After the first release has published all three packages from Actions (each
shows the *Provenance* badge):

1. On each package: **Settings** → **Publishing access** → **Require two-factor
   authentication and disallow tokens**. Trusted publishing keeps working;
   only classic tokens stop.
2. Revoke any automation or publish tokens at npmjs.com → avatar →
   **Access Tokens** that were used for hand publishes.

From then on, a release can only come from a reviewed commit on `main`
through `release.yml`.

### Optional: maintainer approval before a version goes public

npm also supports *staged publishing*: configure the trusted publisher with
`npm stage publish` only, and change the publish step in `release.yml` to
`npm stage publish`. Each CI-built version then waits for a maintainer to
approve it with 2FA before it becomes installable. It adds a manual step to
every release, so it is not the default here.
