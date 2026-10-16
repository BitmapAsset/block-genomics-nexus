# bitmap-resolver

Which inscription is the deed for `N.bitmap`, who holds it right now, and a proof bundle anyone can re-check against public sources.

- Rule id in every answer: **`liveoci-alpha@0c18b83c+bg1`**
- Zero runtime dependencies. ESM. Node >= 20 and browsers (no Node built-ins in `dist/`).
- MIT. Version 0.1.0, marked `private`: the npm name is not decided and publishing is a separate decision.

## The rule

LiveOCI alpha by bop (inscription `0c18b83ca6aa6f5653bb57dafb491ac786b7fa738b6c5190f4542d1d7f15c43ai0`), verbatim:

1. The deed is the **first** valid inscription, searching from **block N onward**.
2. Valid means the body bytes are **exactly** `N.bitmap`: no spaces, no hidden characters, no leading zeros, nothing else.
3. No delegate.
4. No content encoding (brotli/gzip): if the tag is present at all, invalid.
5. The envelope is complete (reaches `OP_ENDIF`).

Additions made explicit (the `+bg1`), each consistent with LiveOCI:

- Any content type counts (840000's deed is `text/plain`, 208's is `text/plain;charset=utf-8`).
- In-block order is Bitcoin reveal order: tx index, then input, then envelope. Never inscription number.
- Charms (`cursed`, `vindicated`, ...) are recorded and never a reason to reject. 840000's deed is `vindicated`.
- A claim revealed below block N, or naming a block above the tip, is reported with its own reason.

Any change to what the rule accepts bumps the suffix, and cached verdicts are keyed by the rule id.

**Ambiguity is not guessed.** If the first valid claim carries a caveat, the verdict is `undetermined`:

- `empty_content_encoding_tag`: tag 9 with an empty value. LiveOCI's comment says "present at all, invalid", but its code tests the decoded value, and an empty string passes.
- `unbound`: an unrecognized even tag makes ord leave the inscription without a sat (no holder). Whether a later claim then wins is an open canon question.

## Verdicts

| verdict | meaning |
|---|---|
| `canonical` | The candidate passes the rule on its own bytes, and reveal height and block hash agree across ord and Esplora. Below 942,000 first-ness is **OCI-asserted** (`firstness.method: "oci"`). The OCI calls itself "unvalidated, not a source of truth". From 942,000 it is **proven by the walk** (`"walk"`): every block from N to the claim was scanned and hash-verified. |
| `none` | 942,000 and up only: the walk reached the tip with no valid claim ("no valid claim up to block X", never "unclaimed"), or block N is not mined yet. |
| `disputed` | A valid claim earlier than the candidate was presented as a challenger. Never auto-granted. A human decides. |
| `undetermined` | A source is unreachable or disagrees, the OCI has no entry (it is not authoritative about absence), the OCI candidate fails the rule, the first claim carries a caveat, the walk hit its cap (`cursor` says where to continue), or a `deadlineMs` passed. |

The holder is reported only when ord and Esplora agree that the output is unspent and pays the address. Otherwise `holder: null` and `reason` says why. The verdict stays `canonical`, and a gate must treat a null holder as unavailable.

## Sources

| need | below 942,000 | 942,000 and up |
|---|---|---|
| candidate | OCI module `942b5886…i0` → page → sat + satIndex → ord `/r/sat/<sat>/at/<i>` | walk: ord `/r/block/<h>`, falling back to Esplora `/block/<hash>/raw` |
| validity | reveal tx from ord `/r/tx/<txid>`, parsed here. The bytes must hash to the txid. | the parsed block: header hash = the hash ord **and** Esplora report for the height; merkle root recomputed; no duplicate txids |
| reveal height | ord `/r/inscription` `height` = Esplora `/tx/<txid>` `block_height`, and block hashes agree | the scanned block's height |
| holder | ord `/r/inscription` satpoint + address, Esplora `/tx/<txid>/outspend/<vout>` unspent and the output's address | same |
| tip | ord `/r/blockheight`; Esplora tip as a sanity bound (more than 3 blocks apart → undetermined) | same |

The OCI decoder is a port of the module's `fillPage()` / `getBitmapSat()` / `getBitmapSatIndex()`, quirks included. For example, pages 2 and 3 keep `slice(0, 99999)` and drop one entry. The `satIndices` table credited to @_lefrog is copied verbatim. A test checks the port against the inscribed module (46 entries, 11 page ids).

### Envelope parsing differences from LiveOCI's block parser

Envelopes are parsed the way ord does it, because the inscription id is what ord, wallets and marketplaces use. LiveOCI's block parser (`bbbb2172…i0`) differs only on non-standard envelopes:

- It numbers incomplete envelopes as if they were inscriptions.
- It skips non-push opcodes inside an envelope instead of rejecting it.
- It keeps parsing after a truncated push.
- It only reads taproot script paths that have a control block.

Where these differ, this package follows ord. Envelopes without `OP_ENDIF` are reported as ignored (`incomplete`) with an `envelope:<txid>:<input>:<offset>` id, because ord never indexed them.

## API

```ts
import { resolve, holderOf, verifyProof, RULE_ID } from 'bitmap-resolver';
import { checkInBrowser } from 'bitmap-resolver/browser';

const r = await resolve(840000, { freshness: 'auth' });
// r.verdict       'canonical' | 'none' | 'disputed' | 'undetermined'
// r.rule          'liveoci-alpha@0c18b83c+bg1'
// r.canonicalId   '05f8584c…eei0' (only when canonical); r.candidateId: what the method pointed at
// r.holder / r.satpoint / r.sat (string)
// r.firstness     { method: 'oci', ociPage, satIndex } | { method: 'walk', walkedFrom, walkedTo }
// r.ignored       [{ id, reason, revealHeight }]  known copies that do not count (exhaustive only for walked blocks)
// r.challengers   outcome per presented claim
// r.sources       [{ name: 'oci'|'ord'|'esplora'|'rblock'|'mempool-raw', verdict: 'agree'|'disagree'|'unreachable', at }]
// r.checkedAtHeight, r.reason, r.caveats, r.cursor
// r.proof         ProofBundle (below)
```

`resolve(height, opts)`

| option | default | |
|---|---|---|
| `freshness` | required | `'auth'` always asks for a live holder. `'display'` may use a 60 s cache. |
| `walkCap` | 3 | Blocks walked inline above 942,000 before answering `undetermined` with a `cursor`. |
| `challengers` | `[]` | Inscription ids presented as claims (e.g. by a wallet during verify). A valid earlier one makes the verdict `disputed`. A later one is ignored `not_first`. An invalid one is ignored with its reason. |
| `deadlineMs` | none | Answer `undetermined` after this long. The work continues and fills the stores. |
| `limiter` / `fetch` | process-wide | Share one `Limiter` per process. `fetch` gets its own reused limiter. |
| `stores` | process-wide memory | `{ immutable, ttl }`. An app supplies durable ones. |
| `origins` | ordinals.com; blockstream.info, mempool.space | `{ ord, esplora: [...] }` |
| `signal`, `now` | | Abort, and a clock for timestamps. |

`holderOf(inscriptionId, freshness, opts?)` → `{ address, satpoint } | null`. ord and Esplora must agree.

`verifyProof(bundle, opts?)` → `{ ok, diffs, holderDiffs }`. It recomputes `bundleHash` and re-checks against ord only, so it also runs in a browser:

- the reveal tx is re-fetched and re-parsed, and its bytes must hash to the txid;
- body and tags must still pass the rule for the height;
- reveal height, sat and number must match;
- walked block hashes must still be the chain's.

A moved holder is listed separately in `holderDiffs`. With `deep: true` it also re-derives OCI first-ness: it fetches and decodes the page (1–2.4 MB) and checks the sat, the satIndex and `/r/sat/<sat>/at/<i>`.

`checkInBrowser(height, bundle, opts?)` → `{ color: 'green' | 'amber' | 'red', diffs }`. Amber means only the holder moved.

Lower-level exports: `checkClaim`, `claimedNumber`, `decodeOciPage`, `ociSat`, `ociSatIndex`, `parseBlock`, `parseTx`, `parseEnvelopes`, `scanBlockBytes`, `merkleBranch`, `rootFromBranch`, `canonicalJson`, `computeBundleHash`, `Limiter`, `OrdClient`, `EsploraClient`, `memoryStores`.

### Proof bundle `bg-bitmap-proof/1`

```jsonc
{
  "format": "bg-bitmap-proof/1",
  "rule": "liveoci-alpha@0c18b83c+bg1",
  "height": 840000,
  "verdict": "canonical",
  "canonical": { "id", "revealTxid", "vin", "envelopeIndex", "revealHeight", "bodyHex", "contentType",
                 "contentEncoding": null, "delegate": null, "number", "charms", "sat", "satIndex" },
  "firstness": { "method": "oci", "ociModule": "942b5886…i0", "ociPage": "b907b51a…i0", "walked": [] },
  "holder": { "satpoint", "outpoint", "address", "unspentPer": ["ord", "esplora"] },
  "ignored": [], "sources": [], "checkedAtHeight": 971633,
  "generatedAt": "…",
  "bundleHash": "sha256 of the canonical JSON (sorted keys) without generatedAt and bundleHash"
}
```

`canonical` and `holder` are null unless the verdict is `canonical`. No block bytes are included. For walked heights, `firstness.walked` lists every `{height, hash}` scanned.

## Politeness

ordinals.com is one public deployment with no edge cache on `/r/*`. Every `/r/block` is a `getblock` on their node. Per process and host, the limits are:

- a token bucket of 2 requests/s with a burst of 6;
- a separate `/r/block` lane: one in flight, with starts at least 5 s apart;
- single-flight per URL;
- exponential backoff with jitter on 429/5xx, honouring `Retry-After`, 3 retries.

Immutable answers are cached in the store, so each fact is fetched once per store. Cached this way:

- reveal facts and block hashes, at 6 or more confirmations;
- block scans, keyed by hash;
- decoded OCI pages.

The default stores are process-wide and in memory, and they never evict. A long-lived process should pass its own `stores`. A decoded OCI page alone is about 100,000 numbers.

Do not range-scan below 942,000 against ordinals.com. That is what the OCI is for.

## Tests

```sh
npm test               # build + offline suite (no network: global fetch is stubbed)
npm run test:live      # BITMAP_LIVE_TESTS=1: 8 heights live + a near-tip walk
npm run resolve -- 840000 969788    # live resolve + verifyProof, prints a summary
npm run record-vectors # re-record test/vectors (one polite pass, ~165 requests)
```

The offline suite covers:

- **Vectors:** the 18 heights audited on 2026-10-14 (0, 208, 95238, 275798, 433445, 528999, 563851, 612888, 614347, 640860, 718222, 718840, 720143, 738505, 745506, 745966, 840000, 935550) replay from responses recorded once through the limiter. Each must resolve `canonical` to the audited id, and its proof must verify.
- **OCI pages:** the real pages (1–2.4 MB each) are not stored. The vector keeps the page's sha256 and what it decoded to, and the test checks that against ord's own sat.
- **Parsers:** real blocks 0, 170 and 208 for header hash and merkle root, and an SPV-style vector for the 969788 tail claim (header + merkle branch).
- **Walk:** a synthetic chain, including the cap/cursor, `none`, future block, hash disagreement and bad-bytes fallback cases.
- **Challengers:** `not_first`, `bare_number`, `disputed` and `inscribed_before_block`.
- **Limiter:** timing on a virtual clock.
- **Tampering:** forged bundles (holder, body, id, rule version) are caught.
