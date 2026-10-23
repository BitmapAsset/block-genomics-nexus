#!/usr/bin/env bash
# Read-only production smoke probes for blockgenomics.io.
#
# Every probe is a plain GET with no credentials, so this is safe to run
# against production at any time, from CI or from a laptop:
#
#   bash .github/scripts/prod-smoke.sh            # probes https://blockgenomics.io
#   SMOKE_BASE_URL=https://example.vercel.app bash .github/scripts/prod-smoke.sh
#
# Writes a Markdown table of results to $SMOKE_REPORT (default
# smoke-report.md) and exits 1 if any probe failed. A probe marked ⚠️ is a
# warning and does not fail the run. A probe is retried up to
# SMOKE_ATTEMPTS times, SMOKE_RETRY_DELAY seconds apart, because the
# production alias can lag the deployment_status event by a few seconds.
#
# Portable to the bash 3.2 that ships with macOS: no associative arrays.

set -uo pipefail

BASE="${SMOKE_BASE_URL:-https://blockgenomics.io}"
BASE="${BASE%/}"
REPORT="${SMOKE_REPORT:-smoke-report.md}"
ATTEMPTS="${SMOKE_ATTEMPTS:-3}"
DELAY="${SMOKE_RETRY_DELAY:-10}"
# /.well-known/mcp.json is a static file; server-card.json is generated from
# the MCP server's own tool list. Floors are the counts live on 2026-10-18.
MCP_JSON_MIN_TOOLS="${MCP_JSON_MIN_TOOLS:-24}"
MCP_CARD_MIN_TOOLS="${MCP_CARD_MIN_TOOLS:-35}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

failures=0
warnings=0
rows=""

record() { # record <probe> <expected> <observed> <ok|warn|FAIL>
  local mark="✅"
  if [ "$4" = warn ]; then
    mark="⚠️"
    warnings=$((warnings + 1))
  elif [ "$4" != ok ]; then
    mark="❌"
    failures=$((failures + 1))
  fi
  rows="${rows}| \`$1\` | $2 | $3 | $mark |
"
}

# fetch <path> <follow:0|1> -> sets CODE, CTYPE, LOCATION; body in $TMP/body
fetch() {
  local follow_flag=""
  [ "$2" = 1 ] && follow_flag="-L"
  local out
  out="$(curl -sS $follow_flag --max-time 20 \
    -A "bg-prod-smoke (+https://github.com/BitmapAsset/block-genomics-nexus)" \
    -o "$TMP/body" \
    -w '%{http_code}\t%{content_type}\t%{redirect_url}' \
    "$BASE$1" 2>"$TMP/err")" || out="000		"
  CODE="$(printf '%s' "$out" | cut -f1)"
  CTYPE="$(printf '%s' "$out" | cut -f2)"
  LOCATION="$(printf '%s' "$out" | cut -f3)"
}

# with_retries <function> <args...>: the function sets OBSERVED and returns 0 on pass.
with_retries() {
  local i=1
  while :; do
    if "$@"; then return 0; fi
    [ "$i" -ge "$ATTEMPTS" ] && return 1
    i=$((i + 1))
    sleep "$DELAY"
  done
}

check_page() { # check_page <path> [must-contain]
  fetch "$1" 1
  OBSERVED="$CODE"
  [ "$CODE" = 200 ] || return 1
  if [ -n "${2:-}" ]; then
    if grep -q "$2" "$TMP/body"; then
      OBSERVED="200, contains \"$2\""
    else
      OBSERVED="200, missing \"$2\""
      return 1
    fi
  fi
}

check_json() { # check_json <path>
  fetch "$1" 1
  OBSERVED="$CODE $CTYPE"
  [ "$CODE" = 200 ] || return 1
  case "$CTYPE" in application/json*) ;; *) return 1 ;; esac
  if ! jq -e . "$TMP/body" >/dev/null 2>&1; then
    OBSERVED="$CODE, body is not JSON"
    return 1
  fi
  OBSERVED="200 JSON"
}

check_tools() { # check_tools <path> <min>
  fetch "$1" 1
  OBSERVED="$CODE"
  [ "$CODE" = 200 ] || return 1
  local n
  n="$(jq -r '(.tools // []) | length' "$TMP/body" 2>/dev/null || echo "?")"
  OBSERVED="200, $n tools"
  case "$n" in '' | *[!0-9]*) return 1 ;; esac
  [ "$n" -ge "$2" ]
}

check_redirect() { # check_redirect <old-path> <new-path>
  fetch "$1" 0
  local hop_code="$CODE" hop_loc="$LOCATION"
  OBSERVED="$hop_code → ${hop_loc:-none}"
  [ "$hop_code" = 301 ] || return 1
  case "$hop_loc" in "$BASE$2" | "$2") ;; *) return 1 ;; esac
  fetch "$1" 1
  OBSERVED="$hop_code → $2 → $CODE"
  [ "$CODE" = 200 ]
}

# Chain sources behind ownership answers. An upstream outage (ord hosts
# blocked, Esplora down) is reported as a warning, not a failure: a deploy
# cannot fix a third party, and the ownership API already answers "unknown"
# rather than a false negative. A 5xx, a non-200 or a body without a chain
# state means the route itself is broken, and fails.
CHAIN_STATE=""
check_chain_health() {
  fetch /api/v1/health/chain 1
  OBSERVED="$CODE"
  [ "$CODE" = 200 ] || return 1
  CHAIN_STATE="$(jq -r '.data.chain // empty' "$TMP/body" 2>/dev/null || true)"
  case "$CHAIN_STATE" in
    ok | degraded | unavailable) OBSERVED="200, chain $CHAIN_STATE" ;;
    *) OBSERVED="200, no chain state in body"; return 1 ;;
  esac
}

probe() { # probe <label> <expected> <check...>
  local label="$1" expected="$2"
  shift 2
  OBSERVED=""
  if with_retries "$@"; then
    record "$label" "$expected" "$OBSERVED" ok
  else
    record "$label" "$expected" "$OBSERVED" FAIL
  fi
}

probe "/" "200, contains \"BLOCK GENOMICS\"" check_page / "BLOCK GENOMICS"
for p in /explore /my-bitmaps /account /block/840000; do
  probe "$p" "200" check_page "$p"
done
probe "/api/v1/stats" "200 JSON" check_json /api/v1/stats
probe "/.well-known/mcp.json" "200, ≥ $MCP_JSON_MIN_TOOLS tools" check_tools /.well-known/mcp.json "$MCP_JSON_MIN_TOOLS"
probe "/.well-known/mcp/server-card.json" "200, ≥ $MCP_CARD_MIN_TOOLS tools" check_tools /.well-known/mcp/server-card.json "$MCP_CARD_MIN_TOOLS"
probe "/explorer" "301 → /explore → 200" check_redirect /explorer /explore
probe "/leaderboard" "301 → /explore → 200" check_redirect /leaderboard /explore
probe "/portfolio" "301 → /my-bitmaps → 200" check_redirect /portfolio /my-bitmaps
probe "/profile" "301 → /my-bitmaps → 200" check_redirect /profile /my-bitmaps
probe "/verify" "301 → /my-bitmaps → 200" check_redirect /verify /my-bitmaps

OBSERVED=""
if with_retries check_chain_health; then
  if [ "$CHAIN_STATE" = ok ]; then
    record "/api/v1/health/chain" "200, chain ok (⚠️ if degraded/unavailable)" "$OBSERVED" ok
  else
    record "/api/v1/health/chain" "200, chain ok (⚠️ if degraded/unavailable)" "$OBSERVED" warn
  fi
else
  record "/api/v1/health/chain" "200, chain ok (⚠️ if degraded/unavailable)" "$OBSERVED" FAIL
fi

total=$(printf '%s' "$rows" | grep -c '^|')
{
  echo "### Production smoke: $BASE"
  echo
  echo "$((total - failures))/$total probes passed at $(date -u +%Y-%m-%dT%H:%M:%SZ)."
  if [ "$warnings" -gt 0 ]; then
    echo
    echo "⚠️ $warnings warning(s): an upstream the site depends on is degraded. Not a deploy failure."
  fi
  echo
  echo "| Probe | Expected | Observed | |"
  echo "|---|---|---|---|"
  printf '%s' "$rows"
} >"$REPORT"

cat "$REPORT"
[ "$failures" -eq 0 ]
