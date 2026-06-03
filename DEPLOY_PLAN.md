# Deployment Plan For Rewritten Public Repo

This is a preparation checklist only. Do not run push, remote ref deletion, Vercel changes, or branch-protection changes without explicit approval.

## Immutable Invariant

- The first commit must remain:
  88cab12 2026-02-07 04:33:34 -0800 Phase 2 complete - all sub-agent work
- Re-check before and after every local operation:
  git log --reverse --pretty='%h %ci %s' | head -1

## Preflight Checks

- Confirm working tree is clean:
  git status --short
- Confirm local build from the deploy root:
  cd app && npm ci && npm run build
- Confirm secret scan passes:
  gitleaks detect --source . --log-opts="--all" --redact --no-banner
- Confirm filename gate passes:
  git log --all --name-only --pretty=format: | sed '/^$/d' | rg -i '(^|/)(node_modules|\.next|dist|\.vercel)(/|$)|(^|/)\.env([^/]*$|/)|(^|/)(MEMORY|SOUL|USER|IDENTITY|HEARTBEAT|AGENTS|TOOLS)\.md$|(^|/)(secret|secrets|credential|credentials|private|token|key)(s)?(\.|/|$)' && echo "FAIL" || echo "PASS"

## GitHub Branch Protection

- Branch protection status is UNVERIFIED.
- Earlier GitHub API access returned 401, so Gary must check with authenticated GitHub access before force-pushing.
- Confirm whether main allows force pushes or temporarily relax protection with an approved, time-boxed change.
- Re-enable the intended protection immediately after the rewritten main is live.

## Vercel Ordering

1. Pause Vercel auto-deploy for the production project.
2. Change Vercel Root Directory from:
   projects/block-genomics/app
   to:
   app
3. Create a preview deployment from the rewritten tree and verify:
   - home page loads,
   - /verify loads,
   - /nexus loads,
   - /api/health returns expected JSON,
   - no missing environment-variable crash on public pages.
4. Capture the current remote main SHA as OLD_SHA immediately before pushing:
   OLD_SHA=$(git ls-remote origin refs/heads/main | awk '{print $1}')
5. Force-push only with an explicit lease:
   git push --force-with-lease=main:$OLD_SHA origin main:main
6. Re-enable production deploys.
7. Trigger or allow production deployment from rewritten main.
8. Re-check branch protection, Dependabot, and repository security settings.

## Dependabot Branches

There are 38 local Dependabot branches in this rewrite. The remote state must be checked before any deletion.

### Option A: Delete All Non-Main Dependabot Refs

Purpose: make the public repo fully clean after the rewrite. Dependabot will regenerate needed branches against the new main.

Pros:

- Avoids stale branches retaining old paths, old lockfiles, or removed history.
- Reduces public attack surface and reviewer confusion.
- Lets Dependabot recreate clean PRs against the new app root.

Cons:

- Existing Dependabot PR discussion and checks become obsolete.
- Any useful dependency patch in those branches must be regenerated or manually reapplied.
- Requires explicit remote ref deletion approval.

Prepared command shape, not to run without approval:
  git push origin --delete <dependabot-branch-name>

### Option B: Preserve Dependabot Branches

Purpose: avoid deleting remote refs until Gary reviews branch value and GitHub PR state.

Pros:

- Keeps existing PR discussion and audit trail available.
- Avoids irreversible remote ref deletion during the rewrite launch.
- Gives Gary time to inspect branch-protection and Dependabot behavior.

Cons:

- Stale branches may continue to expose old paths or old generated dependency state.
- Dependabot PRs may target obsolete directories such as projects/block-genomics/app.
- Public repository may look less clean until stale branches are closed or regenerated.

## Exact Force-Push Command

Do not run until Gary approves and OLD_SHA has been captured from the remote immediately beforehand.

  OLD_SHA=$(git ls-remote origin refs/heads/main | awk '{print $1}')
  git push --force-with-lease=main:$OLD_SHA origin main:main

## Rollback Pointers

Local backups known to exist:

- /Users/gravity/bg-nexus-backup.git
- /Users/gravity/bg-nexus-2026-06-02.bundle
- /Users/gravity/bg-nexus-2026-06-02-1831.bundle

If anything looks wrong before the remote push, stop and inspect locally. If anything looks wrong after a remote push, use the mirror or bundle only with explicit approval.
