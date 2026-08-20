# Smithery listing — submission checklist

**Status: PREPARED, NOT SUBMITTED.** Everything below is ready to execute. Submitting
creates a Smithery account under the Block Genomics name and publishes a public listing,
so it needs an explicit go-ahead first. Nothing in this document has been sent anywhere.

Target listing: the **remote** endpoint `https://blockgenomics.io/mcp` (Streamable HTTP).
The stdio npm package `block-genomics-mcp` is already in the official MCP Registry as
`io.github.BitmapAsset/block-genomics-mcp`; that listing is unaffected.

Verified against Smithery's live docs on 2026-08-10 (see [Sources](#sources)).

---

## 1. There is no `smithery.yaml`

Smithery no longer uses a repo config file. The docs index has no page for it, and
`smithery.ai/docs/config` 404s. Smithery stopped building and hosting servers from repos
(free hosting was retired 2026-01-14); the two remaining publish paths are **URL** — which
is ours — and a local MCPB bundle.

For URL publishing Smithery never touches the repository. **No repo file is required**, the
repo does not need to be public, and no GitHub App is installed.

### What we added instead

One in-repo artifact, and it is a fallback rather than a requirement:

`app/src/app/.well-known/mcp/server-card.json/route.ts`
→ `https://blockgenomics.io/.well-known/mcp/server-card.json`

Smithery scans a submitted URL to extract tools/prompts/resources for the listing page. If
that scan cannot complete (WAF, rate limit, transient 5xx) it reads a static server card at
this well-known path instead. The route generates the card from the same catalog `/mcp`
serves, so it cannot drift; `app/__tests__/lib/mcp-server-card.test.ts` fails if it does.

The shape follows [SEP-1649](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649),
so it is useful to any MCP directory, not only Smithery.

---

## 2. Cost — free

Listing a self-hosted ("external") server is free. Smithery's own hosting-change post says
you may "register an external server for free", and the free Hobby tier includes 3
namespaces. Paid plans exist for *hosting* and high RPC volume — neither applies to us,
since we host the endpoint on Vercel.

Exact free-tier RPC ceiling is **unconfirmed** — `smithery.ai/pricing` renders client-side
and could not be read. Confirm on the pricing page before submitting. Do not enter payment
details.

---

## 3. Account and auth required

| Item | Needed? | Detail |
|---|---|---|
| Smithery account | **Yes** | Sign-in is WorkOS-backed: email, Google, or GitHub. GitHub is optional, not required. |
| GitHub App / repo access | No | URL publishing never reads the repo. |
| Public repo | No | `repositoryUrl` is a metadata string only. |
| API key | Only for CLI | `smithery.ai/account/api-keys`, used as a bearer token. Not needed for the web flow. |
| Payment method | **No** | See above. |

**Decision needed before submitting:** which identity owns the account (a Block Genomics /
BitmapAsset address vs. a personal one). This becomes the public owner of the listing.

---

## 4. Listing metadata — ready to paste

| Field | Value |
|---|---|
| Qualified name | `blockgenomics/block-genomics` — namespaces are lowercase alphanumeric + hyphens, globally unique. Confirm availability at submit time; fall back to `bitmapasset/block-genomics`. |
| Display name | Block Genomics (Nexus Protocol) |
| Server URL | `https://blockgenomics.io/mcp` |
| Homepage | `https://blockgenomics.io/docs` |
| Repository | `https://github.com/BitmapAsset/block-genomics-nexus` |
| Icon | `app/public/icons/icon-512x512.png` (51 KB, well under the 1 MB cap) |
| License | **Open question** — the app is BUSL-1.1, the `block-genomics-mcp` package is MIT. The listing describes a hosted endpoint; pick deliberately. |

**Description** (mirrors the npm package, which is already registry-approved):

> MCP server for Block Genomics (Nexus Protocol). Gives any MCP-capable AI agent live access
> to verified Bitcoin blocks, on-chain ownership, agent directories, guardians, badges, and
> experiences — plus the authenticated agent runtime (heartbeat / brief / events) when an
> agent token is supplied.

**Session config schema:** none. Our endpoint takes no per-user configuration — read tools
are open, and write tools read an optional `Authorization: Bearer` header off the
connection. Skip `--config-schema` entirely. The listing UI may show a cosmetic "No config
schema provided" note; that is expected and not a failure.

---

## 5. Technical requirements — already satisfied

Verified locally against a production build on 2026-08-10:

| Requirement | Status |
|---|---|
| Streamable HTTP transport | ✅ `/mcp`, stateless |
| Public HTTPS URL | ✅ `https://blockgenomics.io/mcp` |
| Anonymous `initialize` succeeds | ✅ returns `serverInfo` `block-genomics` v0.3.0, protocol `2025-06-18` |
| Anonymous `tools/list` succeeds | ✅ 35 tools, no credentials |
| `tools/list` response size | ✅ 11.6 KB — scanners are reported to truncate near 30 KB |
| CORS + `OPTIONS` preflight | ✅ `Access-Control-Allow-Origin: *`, `OPTIONS` → 204 |
| Returns 401 (never 403) when unauthenticated | ✅ not applicable — no auth is required to connect |
| Static server card fallback | ✅ `/.well-known/mcp/server-card.json`, regenerated from the catalog, matches the live list exactly |

Reproduce with:

```bash
curl -sX POST https://blockgenomics.io/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

curl -s https://blockgenomics.io/.well-known/mcp/server-card.json | head -c 400
```

### The one real risk: the scan getting blocked

Smithery scans with `User-Agent: SmitheryBot/1.0 (+https://smithery.ai)` from **Cloudflare
Workers**. Bot protection commonly rejects that, surfacing as
`Initialization failed with status 403`.

We are on Vercel, not Cloudflare, so Cloudflare Bot Fight Mode does not apply. Two things to
check if the scan fails:

1. **Vercel firewall / Attack Challenge Mode** — if enabled, add a bypass rule for the
   `SmitheryBot` user agent on `/mcp`.
2. **Our own rate limit** — `/mcp` allows 120 requests/min per IP
   (`app/src/app/mcp/route.ts`). A scan is a handful of requests and will not trip this, but
   it is the other thing that can return a non-200 to a bot.

If the scan still fails, it is not a blocker: the server card above makes Smithery skip
scanning entirely.

---

## 6. Submission steps (execute only once approved)

1. Decide the owning identity and the license value (§3, §4).
2. Confirm the free tier on `smithery.ai/pricing`. **Stop if listing an external server is
   not free.**
3. Create the account at `https://smithery.ai/login` using the agreed identity.
4. Claim the namespace — confirm `blockgenomics` is available.
5. Go to `https://smithery.ai/new`, choose the **URL** path, enter
   `https://blockgenomics.io/mcp`, complete the flow.
6. Watch the scan. On `403` / "Initialization failed", apply §5 — or rely on the server card.
7. Fill in listing metadata from §4 and upload the icon.
8. Open **Settings → Verification** and complete the official-vendor checklist, which is how
   the listing gets attributed to us rather than to a third-party mirror.
9. Confirm the public listing renders all 35 tools, then record the listing URL here.

CLI alternative to steps 5–7, if a scripted path is preferred:

```bash
npm i -g smithery@latest          # needs Node 20+
smithery auth login
smithery mcp publish "https://blockgenomics.io/mcp" -n blockgenomics/block-genomics
```

---

## Sources

All fetched 2026-08-10:

- `https://smithery.ai/docs/build/publish.md` — publish flow, requirements, scanning, static
  server card schema, 403 troubleshooting, verification
- `https://smithery.ai/docs/llms.txt` — full docs index; contains no `smithery.yaml` page
- `https://smithery.ai/docs/config` — 404, confirming the old config page is gone
- `https://smithery.ai/docs/concepts/namespaces.md` — namespace rules, 3 on the free tier
- `https://smithery.ai/docs/build/session-config.md` — config schema format (not used by us)
- `https://smithery.ai/docs/api-reference/servers/*` — listing metadata fields, icon limits
- `https://smithery.ai/blog/updates-to-our-hosting-plan` (2026-01-14) — hosting retired,
  external servers free
