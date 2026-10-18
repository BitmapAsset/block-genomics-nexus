#!/usr/bin/env bash
# Prints `prisma migrate status` for the database in
# DATABASE_POSTGRES_URL_NON_POOLING and classifies the result, because the
# Prisma CLI exits 1 both for "migrations pending" and for "cannot connect".
#
# Run from app/. Exit codes:
#   0  database is up to date
#   10 migrations are pending (names listed, and added to the job summary)
#   1  anything else: unreachable, auth failure, failed migration, drift
#
# Usage: bash ../.github/scripts/migrate-status.sh "<label for the summary>"

set -uo pipefail

label="${1:-status}"
out="$(mktemp)"
trap 'rm -f "$out"' EXIT

npx prisma migrate status >"$out" 2>&1
code=$?
cat "$out"

summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$@" >>"$GITHUB_STEP_SUMMARY"
  fi
}

if [ "$code" -eq 0 ] && grep -q "Database schema is up to date" "$out"; then
  echo "::notice::$label: database is up to date"
  summary "### $label" "" "Database schema is up to date." ""
  exit 0
fi

if grep -q "have not yet been applied" "$out" && ! grep -qE "^Error: |failed to apply|drift" "$out"; then
  # The names follow the "have not yet been applied:" line, up to a blank line.
  pending="$(awk '/have not yet been applied/{on=1; next} on && NF==0{exit} on{print}' "$out")"
  count="$(printf '%s\n' "$pending" | grep -c .)"
  echo "::notice::$label: $count pending migration(s)"
  summary "### $label" "" "$count pending migration(s):" "" '```' "$pending" '```' ""
  exit 10
fi

echo "::error::$label: prisma migrate status failed (exit $code); see the log above"
summary "### $label" "" "prisma migrate status failed (exit $code). See the job log." ""
exit 1
