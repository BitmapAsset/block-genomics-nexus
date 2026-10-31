# CI/CD runbook

How code gets from a pull request to production, and the one-time settings
that the workflows in `.github/workflows/` rely on. Every setting here is
free on a public repository: GitHub-hosted runners, environments with
required reviewers, CodeQL default setup, secret scanning and Dependabot cost
nothing for public repos.

## Pipeline at a glance

| Stage | Where | Gate |
|---|---|---|
| Pull request | `ci.yml` | Required status checks on `main`, strict (branch must be up to date) |
| Preview | Vercel GitHub integration | One preview deploy per PR, URL posted on the PR |
| Merge to `main` | Branch protection | Checks green, conversations resolved, no force push, admins included |
| Production deploy | Vercel GitHub integration | Every merge to `main` deploys `app/` to blockgenomics.io |
| Post-deploy smoke | `post-deploy-smoke.yml` | 17 read-only probes; failure opens a `prod-smoke-failed` issue |
| Database migrations | `migrate-production.yml` | Manual, `main` only, approval by the `production-db` environment reviewer |
| npm releases | `release.yml` | `v*` tag; see `RELEASING.md` |

## Production database migrations

Production migrations never run automatically. A merge that adds a migration
deploys code to Vercel but leaves the database alone; someone then applies
the migration with one approved workflow run. Migrations must therefore be
backward compatible with the code that is already live (add columns and
tables first, remove them in a later release).

### One-time setup (about two minutes)

1. **Create the environment with a required reviewer and a `main`-only
   deployment policy.** Either in the UI (Settings → Environments → New
   environment → `production-db` → tick *Required reviewers*, add
   `BitmapAsset`; *Deployment branches and tags* → *Protected branches only*)
   or with one call:

   ```bash
   gh api -X PUT repos/BitmapAsset/block-genomics-nexus/environments/production-db \
     --input - <<'EOF'
   {
     "reviewers": [{ "type": "User", "id": 261056909 }],
     "prevent_self_review": false,
     "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false }
   }
   EOF
   ```

   `261056909` is the user id of `BitmapAsset` (`gh api users/BitmapAsset --jq .id`).
   `prevent_self_review` stays `false` because the repository has a single
   maintainer, who both starts and approves the run.

2. **Add the connection string as an environment secret named `DATABASE_URL`.**
   `gh` prompts for the value and never echoes it:

   ```bash
   gh secret set DATABASE_URL --env production-db --repo BitmapAsset/block-genomics-nexus
   ```

   Use the **Supabase session pooler** string: copy the exact
   `DATABASE_POSTGRES_URL_NON_POOLING` value from Vercel (port **5432**,
   user `postgres.<project-ref>`). Do not retype the host; its prefix varies
   between Supabase projects. Do not use the transaction pooler on
   port 6543 (Prisma migrate needs a session for its advisory lock), and do
   not use the direct host `db.<project-ref>.supabase.co`, which resolves to
   IPv6 only and is unreachable from GitHub-hosted runners.

3. **Verify:** `gh api repos/BitmapAsset/block-genomics-nexus/environments/production-db --jq '.protection_rules'`
   lists a `required_reviewers` rule and a `branch_policy` rule.

Do step 1 before the first run. GitHub creates a missing environment, with
no protection, the first time a job names it. The workflow's `preflight` job
guards against this: it runs outside the environment and stops the run
unless `production-db` already exists with both rules.

### Applying migrations

1. Actions → *Migrate production database* → Run workflow → branch `main`,
   mode **status**. Approve the pending deployment. The run summary lists
   every pending migration by name.
2. Read that list. `prisma migrate deploy` applies **all** pending
   migrations in order; there is no partial apply.
3. Run again with mode **deploy** and approve. The job prints status,
   applies, and prints status again; it fails unless the database ends up
   up to date.

CLI equivalent: `gh workflow run migrate-production.yml --ref main -f mode=status`
(then approve in the UI, or with `gh api` on the run's pending deployments).

If a migration fails halfway, the job fails and the status output names the
failed migration together with Prisma's `migrate resolve` instructions.
Resolve it by hand; do not re-run `deploy` blindly.

## Turning on the Living Block event spine

The per-block signed event spine ships dark: with `BG_EVENTS_ENABLED` unset
every emitter returns before touching the database and every read answers
`{"enabled": false}`. Turn it on in this order, and do not skip ahead:

1. **Apply the migration.** `20261023180000_add_block_event` (one new table,
   two indexes, one function, two triggers; no existing table changes) goes
   through `migrate-production.yml` and the `production-db` environment
   exactly as in *Applying migrations* above: check `.protection_rules`
   (setup step 3), run mode **status**, read the list, then mode **deploy**.
2. **Set `BG_EVENT_SIGNING_KEY` before anything fetches the keys file.** A
   32-byte ed25519 seed, 64 hex characters or base64, generated locally
   (`openssl rand -hex 32`), kept in your password manager, and added to the
   **Production** environment of the **app** project only (Vercel → app →
   Settings → Environment Variables, or `vercel env add BG_EVENT_SIGNING_KEY production`).
   Never commit it. Environment changes apply from the next deployment, so
   redeploy, then check that the file lists exactly one key:
   `curl -s https://blockgenomics.io/.well-known/bg-event-keys.json | jq '.keys | length'` → `1`.
   Why first: `/.well-known/bg-event-keys.json` is edge-cached
   (`s-maxage=300, stale-while-revalidate=60`, browsers `max-age=300`), so
   an empty list fetched before the key exists can be served for minutes,
   and verifiers pin the key id they first see. Once published, the key id
   (`bg-sys-<16 hex>`) is public; rotating it later needs a key-list entry
   for the old one (see *Rotating the event signing key* below).
3. **Set `BG_EVENTS_ENABLED=true`** in the same place (Production only) and
   redeploy. Only `true` or `1` turns it on.
4. **Check `GET /api/v1/health/events`:**
   `curl -s https://blockgenomics.io/api/v1/health/events | jq .data` →
   `enabled: true`, `lost: 0`, `backoffUntil: null`. The counts are per
   server instance since its process started (each serverless instance keeps
   its own), so a fresh instance reads `emitted: 0` until it handles a
   write. `backoffUntil` set means that instance found no `BlockEvent` table:
   step 1 did not land on the database this deployment uses. A growing `lost`
   means emits are timing out behind the block lock (5 s budget); each loss
   is also one `[block-events] emit failed` line in the Vercel logs.

To turn it off again, unset `BG_EVENTS_ENABLED` (or set it to anything other
than `true` / `1`) and redeploy. Recorded events stay; the table is
append-only.

### Rotating the event signing key

Every earlier event was attested under the old key, so the old PUBLIC key
stays published, with the moment it stopped signing. Do both halves in the
same deploy:

1. Before changing the env, save the current entry of the keys file:
   `curl -s https://blockgenomics.io/.well-known/bg-event-keys.json | jq '.keys[0] | {kid, publicKey}'`.
2. In a PR, append it to `RETIRED_SYSTEM_KEYS` in
   `app/src/lib/bg-event-retired-keys.ts` as `{ kid, publicKey, retiredAt }`,
   with `retiredAt` = the ISO-8601 UTC time the new key goes live (the
   deploy time, rounded up). Public key and id only, never the seed.
3. Set the new `BG_EVENT_SIGNING_KEY` in Production (as in step 2 above),
   merge the PR, and let that deploy carry both.
4. Check: the keys file lists the new key first and the old one with
   `retiredAt` (`jq '.keys | map({kid, retiredAt})'`). A proof attested
   under the old key for an event dated before `retiredAt` still verifies
   (`app/scripts/verify-event-proof.ts`); anything dated later under the old
   key does not.

The date rule covers a planned rotation. If the old seed may have been
exposed, whoever holds it could still attest an event dated before
`retiredAt`, so leave that key out of the list instead: earlier proofs then
stop verifying, which is the honest answer, and the release note says why.

## Post-deploy smoke

`post-deploy-smoke.yml` runs when the Vercel environment **Production – app**
(the project behind blockgenomics.io) reports a successful deployment, and on
manual dispatch. It runs `.github/scripts/prod-smoke.sh`: plain GETs, no
credentials. Run it by hand at any time:

```bash
bash .github/scripts/prod-smoke.sh
```

A failure fails the run and opens one issue labelled `prod-smoke-failed`
(later failures comment on it); the next green run closes it. The workflow
never rolls back on its own.

The tool-count floors (`MCP_JSON_MIN_TOOLS`, `MCP_CARD_MIN_TOOLS`) sit at the top of
the script. Raise them when tools are added.

## Rollback

Code (Vercel, seconds): project **app** → overview → *Production Deployment*
tile → **Instant Rollback** → pick the last good deployment → confirm. Or
`vercel rollback <deployment-url>`. Hobby plans can roll back to the
immediately previous production deployment; Pro can pick any.

After a rollback Vercel turns off auto-assignment of the production domain,
so later merges to `main` build but do not go live. Once the fix is merged,
click **Undo Rollback** on the same tile and promote the fixed deployment;
that re-enables automatic production deploys.

A rollback also reverts `vercel.json` crons to the rolled-back deployment's
definition, and it does **not** revert database migrations. That is why
migrations are kept backward compatible (see above).

## Vercel crons

`app/vercel.json` schedules three crons (`/api/v1/brain/cron`,
`/api/v1/ownership/cron`, `/api/v1/heartbeat`). Vercel sends
`Authorization: Bearer $CRON_SECRET` when the project has a `CRON_SECRET`
environment variable, so that variable must exist in the Production
environment of the **app** project. Check: Vercel → app → Settings →
Environment Variables → `CRON_SECRET` (Production).

## Code scanning (CodeQL)

CodeQL runs through GitHub's **default setup**, not a workflow file: GitHub
picks the languages (JavaScript/TypeScript and GitHub Actions here), keeps
the queries current, and scans every push to `main`, every pull request, and
weekly. There is nothing to maintain. Enable it once:

```bash
gh api -X PATCH repos/BitmapAsset/block-genomics-nexus/code-scanning/default-setup \
  -f state=configured -f query_suite=default
```

Verify: `gh api repos/BitmapAsset/block-genomics-nexus/code-scanning/default-setup --jq .state`
prints `configured`, and Security → Code scanning shows the first analysis
after a few minutes. Switch `query_suite` to `extended` for more (and
noisier) queries.

Once the first analysis is in, a code-scanning merge gate can be added under
Settings → Rules → Rulesets → *Require code scanning results* (CodeQL,
alerts of severity High or higher).

## Required status checks on `main`

Branch protection requires five checks today: `sdk`, `mcp`, `cli`, `app`,
`secrets`. The other seven CI jobs (`typecheck`, `lint`, `build`,
`migrations`, `resolver`, `example`, `workflows`) run on every PR but a red
one does not block the merge button. Every job in `ci.yml` should be
required:

```bash
gh api -X PATCH repos/BitmapAsset/block-genomics-nexus/branches/main/protection/required_status_checks \
  --input - <<'EOF_JSON'
{
  "strict": true,
  "checks": [
    { "context": "sdk",        "app_id": 15368 },
    { "context": "mcp",        "app_id": 15368 },
    { "context": "resolver",   "app_id": 15368 },
    { "context": "cli",        "app_id": 15368 },
    { "context": "typecheck",  "app_id": 15368 },
    { "context": "app",        "app_id": 15368 },
    { "context": "migrations", "app_id": 15368 },
    { "context": "lint",       "app_id": 15368 },
    { "context": "example",    "app_id": 15368 },
    { "context": "build",      "app_id": 15368 },
    { "context": "secrets",    "app_id": 15368 },
    { "context": "workflows",  "app_id": 15368 }
  ]
}
EOF_JSON
```

`app_id` 15368 is GitHub Actions, so only a real Actions job can satisfy a
check; a commit status from anything else with the same name cannot.

**Apply this only after the change that adds a job name is merged and has
run green on `main`.** A required check that no workflow on a PR's branch
produces never reports, so the PR waits forever at "Expected — waiting for
status to be reported". Every open PR whose branch predates the new job
(today, all open Dependabot PRs) would be stuck until rebased, and if the
change were reverted, `main` itself would become unmergeable. Order:
merge, confirm the job ran green on `main`, then run the call above.

Verify: `gh api repos/BitmapAsset/block-genomics-nexus/branches/main/protection/required_status_checks --jq '[.checks[].context]'`.

When a job is renamed or removed in `ci.yml`, update this list in the same
change window, or merges stall.
