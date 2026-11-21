# Promise checks

`gates/` holds checks of what the project promises, written as code. Each check reads the live
site (and, where it needs a second opinion, a public block explorer, the npm registry or the
GitHub API) and answers pass, fail or not run. The runner is meant to run once a day against
`https://blockgenomics.io` and keeps one JSON report per day.

`fail` means the site broke what the check reads. `not_run` means the check could not read it (a
source did not answer, a variable is missing, the request budget ran out); it is not a pass.

## Run it

Node 22.18 or newer runs the TypeScript files directly; there is no build step.

```sh
node gates/run.ts --out ./gates-out --commit "$(git rev-parse HEAD)"
```

| Flag | Default | Meaning |
|---|---|---|
| `--out <dir>` | `./gates-out` | where the reports are written |
| `--commit <sha>` | none | the commit of the checkout, copied into the report |

| Variable | Default | Meaning |
|---|---|---|
| `BG_GATES_BLOCKS` | `840000` | comma list of up to 3 block heights the map checks read |
| `BG_GATES_GATE_BLOCK` | none | the block that `G-OWNER-ONLY` sends its build requests for; without it that check reads `not_run` |
| `BG_GATES_PLAN_FILE` | none | a JSON file of planned checks that are not built yet (below) |

Exit code 0 once the JSON is written (whatever the checks found), 2 when it could not be written
or a flag or variable is wrong.

## What it writes

- `<out>/gates-<YYYY-MM-DD>.json` (UTC date) and `<out>/latest.json`: the report, schema
  `bg-gates/1`: `base`, `commit`, `runtime` (the Node version), `startedAt`, `finishedAt`,
  `requests`, `summary` (`total`, `pass`, `inPart`, `fail`, `notRun`, `notBuilt`,
  `securityTotal`, `securityPass`), `line`, `checks` and `security` (one row per check:
  `id`, `promise`, `status`, `reason`, `values`, `notCovered` when the check covers only part of
  its promise, and the requests it made), and `planError` when the plan file could not be used.
- `<out>/latest.txt`: the report's one line, for example
  `checks 4 of 4 green, 2 in part · security 1 of 1`.

It prints the line and one row per check (`id status reason`).

## What it never does

- It holds no secret and sends no credential: every request carries only a `user-agent` and an
  `accept` header (and a `content-type` on the build requests).
- It talks to four fixed origins only: `https://blockgenomics.io`, `https://blockstream.info`,
  `https://registry.npmjs.org` and `https://api.github.com` (read anonymously). Any other
  address is refused before a request, and redirects are never followed.
- It sends one kind of write request, from `G-OWNER-ONLY` only, to the site only, and only for
  the configured gate block: build requests with no signature or a made-up one, which the site
  must refuse. It then reads the block again to show nothing changed.
- It stops after 40 requests in a run and retries a request at most once, after a network error.
- Bitcoin addresses are replaced with `<address>` in the JSON and in every printed line.
- It calls no model and changes nothing in the repository.

## Planned checks

A team can list checks it plans to build in a file outside the repository and point
`BG_GATES_PLAN_FILE` at it:

```json
{ "notBuilt": [ { "id": "G-EXAMPLE", "group": "promise", "wave": "the change that builds it" } ] }
```

Each entry whose id has no check file becomes a row with status `not_built`, counted in the line
as "not built yet". A file that cannot be read or parsed, or an entry without `id`, `group` or
`wave`, gives a `planError` in the report and no plan rows; the run goes on.

## How a check becomes live

1. Add its file under `gates/checks/` (an object of type `Check` from `gates/lib/types.ts`), using
   only the client it is given for network access.
2. Add it to the list in `gates/checks/index.ts`.
3. Add its tests under `gates/__tests__/`, on made-up answers (`helpers.ts` has a fake `fetch`).

CI runs `npx tsc -p gates/tsconfig.json` and `npx vitest run --dir gates` in the `gates` job. The
tests make no network request. `gates/` has no linter.
