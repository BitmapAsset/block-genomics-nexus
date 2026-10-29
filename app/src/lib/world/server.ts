/**
 * `bg-world/1` on the server: the manifest read (`worldOf`) and the one write
 * handler behind `POST /api/v1/blocks/<h>/world/{place,theme,remove}`.
 *
 * NO NEW TABLE, NO NEW AUTH PATH. The manifest is folded from the block's
 * `world.*` rows in the existing `BlockEvent` store, and a write is accepted on
 * exactly the two credentials `POST /api/v1/world` accepts:
 *
 *   AGENT   `Authorization: Bearer bg_vfy_…`: a session the owner minted with a
 *           BIP-322 signature (MCP `bg_verify_submit`); the ownership gate
 *           checks the block is in its proven scope and still held on-chain.
 *   WALLET  an action-bound BIP-322 signature over this exact request (action,
 *           method, path, block, body hash), live ownership, one-time nonce.
 *
 * Everything that can be refused is refused before the nonce is consumed, so a
 * rejected placement costs a retry, never another signing round-trip. With the
 * flag off (or the migration not applied) writes answer 503 and touch nothing.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWalletSignature } from '@/lib/api-helpers';
import { consumeChallenge } from '@/lib/challenges';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { emitWorldEvent, walletProofOf } from '@/lib/block-event-emitters';
import { eventsReadable, isTableMissingError, noteEventsTableMissing, publicEvent } from '@/lib/block-events';
import { requireVerifiedBlock, gateDenialResponse, sessionTokenFromHeaders } from '@/lib/ownership-gate';
import { requireSignedBlockOwner } from '@/lib/block-write-auth';
import { looksLikeSessionToken } from '@/lib/verified-sessions';
import { enforceRateLimit, WORLD_WRITE_LIMIT } from '@/lib/api-rate-limit';
import { parseBlockHeight, INVALID_BLOCK_HEIGHT_MESSAGE } from '@/lib/block-height';
import { BlockNotFoundError, getBlockSummary, getTipHeight } from '@/lib/block-summary';
import { HEIGHT_CAP_M, parcelRectsFrom, type DistrictScale } from '@/lib/world-scale';
import { PARAMS_MAX_BYTES } from '@/lib/block-event-core';
import { foldWorld, type WorldEventRow, type WorldState } from './project';
import { onlyKeys, validatePlacement, validateTheme, type Checked } from './validate';
import {
  DEFAULT_THEME,
  MAX_PLACEMENTS,
  SCALE_MAX,
  SCALE_MIN,
  WORLD_ACTIONS,
  WORLD_EVENT_KINDS,
  WORLD_FORMAT,
  worldIntent,
  worldWritePath,
  type WorldEventKind,
  type WorldManifest,
} from './types';

/** World events read per block. Writes stop at this many, so the fold is never truncated. */
export const WORLD_EVENT_CAP = 5_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const LIMITS: WorldManifest['limits'] = {
  maxPlacements: MAX_PLACEMENTS,
  heightCapM: HEIGHT_CAP_M,
  scale: [SCALE_MIN, SCALE_MAX],
  paramsMaxBytes: PARAMS_MAX_BYTES,
};

/**
 * The block's folded world, or 'disabled' while the spine is off or the table
 * is missing, plus how many world events it holds. Other read errors throw.
 */
export async function readWorldState(block: number, db: Db = prisma): Promise<{ state: WorldState; events: number } | 'disabled'> {
  if (!eventsReadable()) return 'disabled';
  try {
    const rows: WorldEventRow[] = await db.blockEvent.findMany({
      where: { block, kind: { in: [...WORLD_EVENT_KINDS] } },
      orderBy: { id: 'asc' },
      take: WORLD_EVENT_CAP,
      select: {
        id: true, block: true, seq: true, kind: true, payload: true, ts: true,
        actorType: true, actorId: true, signerScheme: true, signerAddress: true,
      },
    });
    return { state: foldWorld(rows), events: rows.length };
  } catch (err) {
    if (isTableMissingError(err)) {
      noteEventsTableMissing();
      return 'disabled';
    }
    throw err;
  }
}

export function disabledManifest(block: number, scale: DistrictScale | null): WorldManifest {
  return { format: WORLD_FORMAT, block, enabled: false, theme: DEFAULT_THEME, scale, placements: [], head: null, limits: LIMITS };
}

/** `bg-world/1` for one block. `scale` is passed in (it needs the block summary). */
export async function worldOf(block: number, scale: DistrictScale | null, db: Db = prisma): Promise<WorldManifest> {
  const read = await readWorldState(block, db);
  if (read === 'disabled') return disabledManifest(block, scale);
  return {
    format: WORLD_FORMAT,
    block,
    enabled: true,
    theme: read.state.theme,
    scale,
    placements: read.state.placements,
    head: read.state.head,
    limits: LIMITS,
  };
}

// ── Block lookup shared by the GET and the writes ───────────────────────

export type BlockLookup =
  | { ok: true; vsize: number[] }
  | { ok: false; status: 404 | 503; error: string };

/** The block's vsizes: 404 above the tip or unknown to mempool, 503 when unreachable. */
export async function lookupBlock(height: number): Promise<BlockLookup> {
  const tip = await getTipHeight();
  if (tip !== null && height > tip) return { ok: false, status: 404, error: 'Block not found' };
  try {
    const s = await getBlockSummary(height);
    return { ok: true, vsize: s.vsize };
  } catch (e) {
    if (e instanceof BlockNotFoundError) return { ok: false, status: 404, error: 'Block not found' };
    return { ok: false, status: 503, error: 'Block summary unavailable' };
  }
}

// ── The write ────────────────────────────────────────────────────────────

const NO_STORE = { 'Cache-Control': 'no-store' };

function refuse(c: Exclude<Checked<unknown>, { ok: true }>, status = 400): NextResponse {
  return NextResponse.json({ error: c.error, code: c.code }, { status, headers: NO_STORE });
}

/** The intent fields of each write's body (everything but `ownerAddress` and the auth envelope). */
const INTENT_KEYS: Record<WorldEventKind, string[]> = {
  'world.theme': ['theme'],
  'world.place': ['parcel', 'asset', 'x_m', 'y_m', 'rot_deg', 'scale', 'params'],
  'world.remove': ['placementId'],
};
const AUTH_KEYS = ['ownerAddress', 'signature', 'message'];

export async function handleWorldWrite(req: NextRequest, rawHeight: string, kind: WorldEventKind): Promise<NextResponse> {
  // Same bucket and ceiling as the other world writes (POST /api/v1/world).
  const rl = await enforceRateLimit(req, { bucket: 'v1-world-write', limit: WORLD_WRITE_LIMIT });
  if (rl.response) return rl.response;

  const block = parseBlockHeight(rawHeight);
  if (block === null) return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400, headers: NO_STORE });

  if (!eventsReadable()) {
    return NextResponse.json(
      { error: 'World building is not enabled yet: the block event record is off.', enabled: false },
      { status: 503, headers: NO_STORE },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400, headers: NO_STORE });
  }

  // Strict body: a signed body must be rebuildable from what the event stores.
  const keys = onlyKeys(body, [...INTENT_KEYS[kind], ...AUTH_KEYS]);
  if (!keys.ok) return refuse(keys);
  const fieldsIn: Record<string, unknown> = {};
  for (const k of INTENT_KEYS[kind]) if (body[k] !== undefined) fieldsIn[k] = body[k];

  // The block, its parcels and the current world: everything a refusal needs,
  // before any credential is spent.
  const looked = await lookupBlock(block);
  if (!looked.ok) return NextResponse.json({ error: looked.error }, { status: looked.status, headers: NO_STORE });

  let read: Awaited<ReturnType<typeof readWorldState>>;
  try {
    read = await readWorldState(block);
  } catch (err) {
    console.error('[world write] read failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'World unavailable' }, { status: 503, headers: NO_STORE });
  }
  if (read === 'disabled') {
    return NextResponse.json(
      { error: 'World building is not enabled yet: the block event record is off.', enabled: false },
      { status: 503, headers: NO_STORE },
    );
  }
  if (read.events >= WORLD_EVENT_CAP) {
    return NextResponse.json(
      { error: `This block's world history is full (${WORLD_EVENT_CAP} events, v1).`, code: 'history_full' },
      { status: 409, headers: NO_STORE },
    );
  }

  let fields: Record<string, unknown>;
  if (kind === 'world.theme') {
    const t = validateTheme(fieldsIn.theme);
    if (!t.ok) return refuse(t);
    fields = { theme: t.value };
  } else if (kind === 'world.place') {
    const p = validatePlacement(fieldsIn, { rects: parcelRectsFrom(looked.vsize), liveCount: read.state.placements.length });
    if (!p.ok) return refuse(p, p.code === 'too_many_placements' ? 409 : 400);
    fields = { ...p.value };
  } else {
    const id = fieldsIn.placementId;
    if (typeof id !== 'string' || !read.state.placements.some((x) => x.id === id)) {
      return NextResponse.json({ error: 'No live placement with that id on this block', code: 'not_found' }, { status: 404, headers: NO_STORE });
    }
    fields = { placementId: id };
  }

  // Credentials: the same two doors as POST /api/v1/world.
  let ownerAddress: string;
  let via: 'wallet' | 'session' = 'session';
  const signature = body.signature;
  const message = body.message;
  if (looksLikeSessionToken(sessionTokenFromHeaders(req.headers))) {
    const gate = await requireVerifiedBlock(req, block);
    if (!gate.ok) return gateDenialResponse(gate);
    ownerAddress = gate.walletAddress!;
  } else if (typeof signature !== 'string' || typeof message !== 'string' || !signature || !message) {
    return gateDenialResponse({
      ok: false,
      status: 401,
      code: 'unverified',
      reason:
        'Building on a block requires proof that you own it. Verify with a bg_vfy_ session token, ' +
        'or send an action-bound BIP-322 signature.',
    });
  } else {
    via = 'wallet';
    if (typeof body.ownerAddress !== 'string' || !body.ownerAddress) {
      return NextResponse.json({ error: 'ownerAddress required' }, { status: 400, headers: NO_STORE });
    }
    ownerAddress = body.ownerAddress;
    if (!verifyWalletSignature(ownerAddress, message, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401, headers: NO_STORE });
    }
    // The signed Body hash is over the canonical intent, which is exactly what
    // the event stores, so anyone can re-check the placement against the proof.
    const binding = verifyActionBinding(message, {
      action: WORLD_ACTIONS[kind].action,
      method: 'POST',
      path: worldWritePath(block, kind),
      blockHeight: block,
      bodyHash: await hashBody(worldIntent(kind, ownerAddress, fields)),
    });
    if (!binding.ok) return NextResponse.json({ error: binding.reason }, { status: 401, headers: NO_STORE });
    const owns = await requireSignedBlockOwner(ownerAddress, block);
    if (!owns.ok) return gateDenialResponse(owns);
    if (!(await consumeChallenge(binding.nonce!, { address: ownerAddress, purpose: 'world' }))) {
      return NextResponse.json({ error: 'Invalid or already-used challenge nonce' }, { status: 401, headers: NO_STORE });
    }
  }

  const row = await emitWorldEvent({
    block,
    kind,
    ownerAddress,
    via,
    fields,
    walletProof: via === 'wallet' ? walletProofOf(ownerAddress, message, signature) : null,
  });
  if (!row) {
    return NextResponse.json(
      { error: 'The world event was not recorded; nothing changed. Retry shortly.', recorded: false },
      { status: 503, headers: NO_STORE },
    );
  }

  const event = publicEvent(row);
  const result: Record<string, unknown> = { format: WORLD_FORMAT, block, kind, event };
  if (kind === 'world.place') result.placement = { id: row.id, ...fields, proof: event.proof };
  if (kind === 'world.theme') result.theme = fields.theme;
  if (kind === 'world.remove') result.removed = fields.placementId;
  return NextResponse.json(result, { status: 201, headers: { ...rl.headers, ...NO_STORE } });
}
