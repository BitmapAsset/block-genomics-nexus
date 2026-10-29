# Build on your block from any agent (`bg-world/1`)

Every Bitmap block is a place: a **2.1 km × 2.1 km district** whose parcels are the block's
transactions. Any agent that speaks MCP (Claude, GPT, OpenClaw, Hermes, a game bridge, your own
script) builds on it through the same six tools, and every visitor sees the same world.

Three words carry the whole model:

- **Deed**: the first `N.bitmap` inscription for block N. Whoever holds it on Bitcoin holds the block.
- **Authority**: the owner's BIP-322 signature, registering their agent as the block's guardian.
  The owner signs once with the wallet that holds the deed (`bg_verify_start` → sign →
  `bg_verify_submit`), and the agent receives a `bg_vfy_` session token scoped to that block.
  Ownership is re-checked on Bitcoin at the moment of every write, so a sold block stops
  accepting the old owner's agent at once. An owner can also sign a single write directly.
- **Record**: the block's signed event log (`bg-event/1`). Every theme change, placement and
  removal is one hash-chained event with a public proof. The world is a view of that record,
  never a separate file.

> **Status: built, switched off.** World building rides on the block event record, which is off
> until the operator turns it on (`BG_EVENTS_ENABLED`, after the `BlockEvent` migration). Until
> then `GET /api/v1/blocks/<h>/world` answers `"enabled": false` with no placements (the scale is
> always filled), and the three write routes answer `503`. The scale tools work today.

## Scale is law

| Rule | Value |
|---|---|
| District | 2,100 m × 2,100 m = 4.41 km² (441 ha) per block |
| Parcels | one per transaction, in transaction order; parcel `i` = transaction `i` |
| Layout | the canonical bitmap layout (bitfeed packing: side = ⌈√(vsize / 256)⌉ cells); its `cols × rows` grid is stretched onto the square, so a cell is `2100 / cols` m east-west and `2100 / rows` m north-south |
| Coordinates | metres from the district corner where transaction 0 sits: `x_m` east, `y_m` south (the thumbnail's top-left corner and downward axis) |
| Mean lot | district area ÷ parcels (block 612,888: 1,114 parcels, ≈ 3,959 m², ≈ 63 m square) |
| Open land | the layout's empty cells (612,888: ≈ 0.35 km²); streets and commons, not buildable in v1 |
| Height cap | 300 m (flat in v1) |

Block 612,888 for reference: grid 41 × 43, a cell is 51.22 m × 48.84 m, parcel 418 is the
rectangle `x 204.88–256.10, y 586.05–634.88`.

The block page prints the scale under the map: `2.1 km × 2.1 km · 1,114 parcels · mean lot ≈ 63 m`.

## The manifest

`GET /api/v1/blocks/<h>/world` (public, CORS `*`, cached 5 s at the edge):

```json
{
  "format": "bg-world/1",
  "block": 612888,
  "enabled": true,
  "theme": "voxel",
  "scale": { "height": 612888, "edge_m": 2100, "area_m2": 4410000, "parcels": 1114,
             "mean_lot_m2": 3959, "mean_lot_edge_m": 62.9,
             "grid": { "cols": 41, "rows": 43, "cell_x_m": 51.22, "cell_y_m": 48.84 },
             "parcel_area_m2": 4057300, "open_area_m2": 352700, "height_cap_m": 300 },
  "placements": [
    { "id": "01JBZ0W3Q5V8N2K7D4R6T9X1MC", "parcel": 418, "asset": "tower",
      "x_m": 230.5, "y_m": 610.5, "rot_deg": 0, "scale": 1,
      "placedAt": "2026-10-28T09:00:00.000Z",
      "by": { "type": "owner-session", "id": "bc1p…" },
      "signer": { "scheme": "ed25519", "address": "bg-sys-…" },
      "proof": { "url": "/api/v1/blocks/612888/events/01JBZ0W3Q5V8N2K7D4R6T9X1MC/proof" } }
  ],
  "head": { "id": "01JBZ0W3Q5V8N2K7D4R6T9X1MC", "seq": 7 },
  "limits": { "maxPlacements": 200, "heightCapM": 300, "scale": [0.5, 2], "paramsMaxBytes": 1024 }
}
```

It is folded from the block's `world.theme`, `world.place` and `world.remove` events in ulid
order: the newest theme wins, a placement's id is the ulid of its `world.place` event, and a
removal takes it off the list (its event stays in the record). Unknown height: `404`.

**Themes** (`photoreal` default, `voxel`, `brick`, `toon`, `track`) are render packs, not
separate worlds: same parcels, same placements, a different look.

## Catalog v1

A placement names one asset. The box (footprint × height, metres at scale 1) is all the
validator checks; every theme draws its own model inside it.

| id | footprint (m) | height (m) | | id | footprint (m) | height (m) |
|---|---|---|---|---|---|---|
| `tower` | 30 × 30 | 180 | | `track_segment` | 60 × 14 | 2 |
| `hall` | 60 × 40 | 25 | | `cube` | 10 × 10 | 10 |
| `house` | 15 × 12 | 10 | | `dome` | 40 × 40 | 30 |
| `pavilion` | 20 × 20 | 8 | | `bridge` | 50 × 12 | 12 |
| `tree_cluster` | 20 × 20 | 18 | | `sign` | 4 × 1 | 5 |
| `plaza` | 50 × 50 | 1 | | `beacon` | 6 × 6 | 40 |

## What the validator refuses

| Code | When |
|---|---|
| `parcel_out_of_range` | `parcel` is not an integer in `0..N-1` |
| `unknown_asset` | `asset` is not a catalog v1 id |
| `outside_parcel` | the rotated footprint (box × `scale`, centred on `x_m, y_m`) leaves the parcel's rectangle |
| `too_tall` | asset height × `scale` is over 300 m (a `tower` at scale 2 is 360 m) |
| `bad_scale` / `bad_rotation` | `scale` outside 0.5–2, `rot_deg` outside [0, 360) |
| `bad_params` | `params` is not a flat object of ≤ 16 numbers, booleans or strings ≤ 64 chars, ≤ 1 KB |
| `unknown_theme` | theme outside the five above |
| `too_many_placements` (409) | the block already has 200 live placements (v1) |
| `bad_request` | a field the route does not know, or a missing coordinate |

Writes are rate-limited with the other world writes (60 per minute per caller).

## The six tools

Read tools need no credential. Write tools need `Authorization: Bearer bg_vfy_…` (the remote
endpoint `https://blockgenomics.io/mcp`, or `BG_SESSION_TOKEN` for `npx block-genomics-mcp`).

**`bg_district_scale`**: the district in metres.
```
→ bg_district_scale { "height": 612888 }
← { "height": 612888, "edge_m": 2100, "area_m2": 4410000, "parcels": 1114,
    "mean_lot_m2": 3959, "mean_lot_edge_m": 62.9, "grid": { "cols": 41, "rows": 43,
    "cell_x_m": 51.22, "cell_y_m": 48.84 }, "height_cap_m": 300, … }
```

**`bg_parcel_dimensions`**: one parcel's rectangle.
```
→ bg_parcel_dimensions { "height": 612888, "parcel": 418 }
← { "block": 612888, "index": 418, "x_m": 204.88, "y_m": 586.05,
    "w_m": 51.22, "h_m": 48.84, "area_m2": 2501.42 }
  (out of range: 404 { "code": "parcel_out_of_range" })
```

**`bg_world_get`**: the manifest.
```
→ bg_world_get { "height": 612888 }
← { "format": "bg-world/1", "enabled": true, "theme": "voxel",
    "placements": [ { "id": "01JBZ0…", "parcel": 418, "asset": "tower", … } ],
    "head": { "id": "01JBZ0…", "seq": 7 }, … }
```

**`bg_world_place`**: one placement (`rot_deg` defaults to 0, `scale` to 1).
```
→ bg_world_place { "blockHeight": 612888, "parcel": 418, "asset": "tower",
                   "x_m": 230.5, "y_m": 610.5, "params": { "color": "#f7931a" } }
← 201 { "format": "bg-world/1", "kind": "world.place", "placement": { "id": "01JBZ0…",
        "parcel": 418, "asset": "tower", …, "proof": { "url": "/api/v1/blocks/612888/events/01JBZ0…/proof" } },
        "event": { "kind": "world.place", "summary": "Placed a tower on parcel 418", … } }
```

**`bg_world_set_theme`**: the block's look.
```
→ bg_world_set_theme { "blockHeight": 612888, "theme": "voxel" }
← 201 { "format": "bg-world/1", "kind": "world.theme", "theme": "voxel",
        "event": { "summary": "World theme set to voxel", "proof": { "url": "…" }, … } }
  (unknown theme: 400 { "code": "unknown_theme" })
```

**`bg_world_remove`**: take a placement down.
```
→ bg_world_remove { "blockHeight": 612888, "placementId": "01JBZ0W3Q5V8N2K7D4R6T9X1MC" }
← 201 { "format": "bg-world/1", "kind": "world.remove", "removed": "01JBZ0W3Q5V8N2K7D4R6T9X1MC",
        "event": { "summary": "Removed a placement from the world", … } }
  (no such live placement: 404 { "code": "not_found" })
```

REST equivalents: `GET /api/v1/blocks/<h>/world/scale[?parcel=<i>]`, `GET /api/v1/blocks/<h>/world`,
`POST /api/v1/blocks/<h>/world/place | theme | remove`. A block outside the session's proven
scope, or no longer held on Bitcoin, is refused before anything is written; a session-less
caller gets `401 unverified`.

### Signing one write with the wallet instead

Without a session token, send the owner's address plus an action-bound BIP-322 signature, exactly
like `POST /api/v1/world`: get a nonce from `bg_challenge` (purpose `world`), sign
`buildActionMessage({ action: "world.place", method: "POST", path: "/api/v1/blocks/612888/world/place",
blockHeight: 612888, bodyHash, nonce, expiresAt })` where `bodyHash = hashBody(body)` over the body
without `signature` and `message`, then POST `{ ownerAddress, …fields, signature, message }`. The
body may hold only the documented fields, so the signed hash can always be rebuilt from the record.

## Verify a placement yourself

Every placement carries `proof.url`. `GET` it and check it offline with
`app/scripts/verify-event-proof.ts` (or `verifyEventProof` in `lib/block-event-core.ts`) against
`/.well-known/bg-event-keys.json`:

1. **The event** is in the block's chain: `hash` recomputes, `prev` matches the event before it
   (`GET /api/v1/blocks/<h>/events`).
2. **The signature**: `ed25519` (a session-token write, signed by the published system key) or
   `bip322` (the owner's wallet signed the write itself).
3. **The placement is what was signed.**
   - `ed25519`: the proof's `message` is the canonical payload itself, so the placement's
     fields are in it word for word.
   - `bip322`: the proof's `message` is the action message; its `Body:` line must equal
     `sha256(stableStringify({ ownerAddress: by.id, parcel, asset, x_m, y_m, rot_deg, scale, params? }))`
     built from the manifest entry (`{ ownerAddress, theme }` for a theme, `{ ownerAddress, placementId }`
     for a removal). `worldIntent()` in `app/src/lib/world/types.ts` builds it.

A row that was edited or deleted breaks every later link of the chain, so a placement that is
listed with a valid proof is one the owner's authority put there.
