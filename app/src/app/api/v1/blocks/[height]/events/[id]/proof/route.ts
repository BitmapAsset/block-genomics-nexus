/**
 * GET /api/v1/blocks/<h>/events/<id>/proof
 *
 * Everything needed to re-verify one `bg-event/1` event offline: the public
 * event (with `hash` and `prev`), the exact signed message, the signature, its
 * scheme and address, the payload hash, and the system attestation over the
 * event hash. `scripts/verify-event-proof.ts` checks it with no network, given
 * the keys from /.well-known/bg-event-keys.json.
 *
 * Rows are append-only, so a proof never changes once it exists.
 */

import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { INVALID_BLOCK_HEIGHT_MESSAGE, parseBlockHeight } from '@/lib/block-height';
import { getEventProof } from '@/lib/block-events';
import { ULID_RE } from '@/lib/block-event-core';

const NOT_FOUND = { error: 'Event not found' };

export async function GET(req: NextRequest, { params }: { params: Promise<{ height: string; id: string }> }) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-blocks-events-proof' });
  if (rl.response) return rl.response;

  const { height: raw, id } = await params;
  const block = parseBlockHeight(raw);
  if (block === null) return NextResponse.json({ error: INVALID_BLOCK_HEIGHT_MESSAGE }, { status: 400 });
  if (!ULID_RE.test(id)) return NextResponse.json(NOT_FOUND, { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60' } });

  try {
    const proof = await getEventProof(block, id);
    if (proof === 'disabled') {
      return NextResponse.json({ ...NOT_FOUND, enabled: false }, { status: 404, headers: { 'Cache-Control': 'public, s-maxage=5' } });
    }
    if (!proof) return NextResponse.json(NOT_FOUND, { status: 404, headers: { 'Cache-Control': 'public, s-maxage=5' } });
    return NextResponse.json(proof, { headers: { ...rl.headers, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch (err) {
    console.error('[block event proof GET]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Proof unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
