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
| Post-deploy smoke | `post-deploy-smoke.yml` | 13 read-only probes; failure opens a `prod-smoke-failed` issue |
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

   Use the **Supabase session pooler** string (host
   `aws-0-<region>.pooler.supabase.com`, port **5432**, user
   `postgres.<project-ref>`): the same value as the Vercel variable
   `DATABASE_POSTGRES_URL_NON_POOLING`. Do not use the transaction pooler on
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
