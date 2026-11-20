// POST   /api/v1/keeper/grant: write a block's one keeper grant from a signed bg-grant/1 text.
// DELETE /api/v1/keeper/grant: end it, by the granting wallet or the live holder.
//
// POST accepts only a text this server rebuilds byte for byte from the fields
// parsed out of it, signed (BIP-322) by the wallet it names, carrying an unused
// nonce issued to that wallet for `keeper`, while the live ownership gate names
// that wallet. The nonce is used before the gate, so one signed text asks the
// chain once. Only the text's fields are stored; other body keys are ignored.
//
// DELETE is a signed action (`keeper.revoke`). The granting wallet may always end
// its own grant; another wallet needs the live gate. It removes only the grant it
// read, so a grant that replaced it in between stays.
//
// Every refusal is a code and a fixed sentence (lib/keeper-grant.ts); nothing a
// caller submitted and no exception text reaches an answer or a log line.

import { NextRequest } from 'next/server';
import { success, verifyWalletSignature } from '@/lib/api-helpers';
import { MAX_SIGNATURE_CHARS } from '@/lib/bip322';
import { consumeChallenge } from '@/lib/challenges';
import { gateDenialResponse, requireLiveBlockOwner } from '@/lib/ownership-gate';
import { rateLimitDurable, clientIpFrom } from '@/lib/rate-limit-db';
import { verifySignedAction } from '@/lib/signed-action';
import {
  buildGrantMessage,
  checkClock,
  checkHeight,
  keyCheck,
  parseGrantMessage,
  GATE_RETRY_SENTENCE,
  MAX_GRANT_TEXT_CHARS,
} from '@/lib/keeper-grant';
import {
  KeeperUnavailable,
  deleteGrant,
  keeperRefusal,
  keeperUnavailableResponse,
  putGrant,
  readGrant,
} from '@/lib/keeper-store';

export async function POST(req: NextRequest) {
  try {
    const rl = await rateLimitDurable(`keeper-grant:${clientIpFrom(req)}`, 10, 600_000);
    if (!rl.allowed) return keeperRefusal('rate_limited', 429, { headers: { 'Retry-After': String(rl.retryAfterSec) } });
    let body: unknown;
    try { body = await req.json(); } catch { return keeperRefusal('bad_json', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return keeperRefusal('bad_json', 400);
    const b = body as Record<string, unknown>;

    const { message, signature } = b;
    if (typeof message !== 'string' || message.length > MAX_GRANT_TEXT_CHARS) return keeperRefusal('bad_grant_text', 400);
    if (typeof signature !== 'string' || signature.length > MAX_SIGNATURE_CHARS) return keeperRefusal('bad_signature', 401);
    const parsed = parseGrantMessage(message);
    if (!parsed) return keeperRefusal('bad_grant_text', 400);
    if (buildGrantMessage(parsed) !== message) {
      return keeperRefusal('bad_grant_text', 400);
    }
    const clock = checkClock(parsed, Date.now());
    if (clock) return keeperRefusal(clock, 400);
    if (!verifyWalletSignature(parsed.walletAddress, message, signature)) return keeperRefusal('bad_signature', 401);
    if (!(await consumeChallenge(parsed.nonce, { address: parsed.walletAddress, purpose: 'keeper' }))) {
      return keeperRefusal('nonce_used', 401);
    }
    const gate = await requireLiveBlockOwner(parsed.walletAddress, parsed.blockHeight);
    if (!gate.ok) return gateDenialResponse(gate.status === 503 ? { ...gate, reason: GATE_RETRY_SENTENCE } : gate);

    const { replaced } = await putGrant({
      blockHeight: parsed.blockHeight,
      walletAddress: parsed.walletAddress,
      agentName: parsed.agentName,
      agentKey: parsed.agentKey,
      scopes: parsed.scopes,
      message,
      signature,
      validUntil: new Date(parsed.validUntil),
    });
    return success(
      {
        blockHeight: parsed.blockHeight,
        agentName: parsed.agentName,
        keyCheck: keyCheck(parsed.agentKey),
        scopes: parsed.scopes,
        validUntil: parsed.validUntil,
        replaced,
      },
      201,
      { 'Cache-Control': 'no-store' },
    );
  } catch (e) {
    if (!(e instanceof KeeperUnavailable)) console.error('[keeper] route failed:', (e as { code?: string })?.code ?? 'unknown');
    return keeperUnavailableResponse();
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const rl = await rateLimitDurable(`keeper-revoke:${clientIpFrom(req)}`, 10, 600_000);
    if (!rl.allowed) return keeperRefusal('rate_limited', 429, { headers: { 'Retry-After': String(rl.retryAfterSec) } });
    let body: unknown;
    try { body = await req.json(); } catch { return keeperRefusal('bad_json', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return keeperRefusal('bad_json', 400);
    const b = body as Record<string, unknown>;

    const blockHeight = b.blockHeight;
    if (!checkHeight(blockHeight)) return keeperRefusal('bad_block', 400);
    const badWallet = b.walletAddress !== undefined && typeof b.walletAddress !== 'string';
    const badMessage = b.message !== undefined && (typeof b.message !== 'string' || b.message.length > MAX_GRANT_TEXT_CHARS);
    const badSignature = b.signature !== undefined && (typeof b.signature !== 'string' || b.signature.length > MAX_SIGNATURE_CHARS);
    if (badWallet || badMessage || badSignature) return keeperRefusal('bad_signature', 401);
    const walletAddress = typeof b.walletAddress === 'string' ? b.walletAddress : '';
    const message = typeof b.message === 'string' ? b.message : '';
    const signature = typeof b.signature === 'string' ? b.signature : '';

    // Before the signature, so a missing table answers 503 without using up the nonce.
    const grant = await readGrant(blockHeight);
    const auth = await verifySignedAction(walletAddress, message, signature, b, { action: 'keeper.revoke', method: 'DELETE', path: '/api/v1/keeper/grant', blockHeight, purpose: 'keeper' });
    if (!auth.ok) return keeperRefusal('bad_signature', 401, { error: auth.error });
    if (grant === null) return keeperRefusal('no_grant', 404);
    if (grant.walletAddress !== walletAddress) {
      const liveGate = await requireLiveBlockOwner(walletAddress, blockHeight);
      if (!liveGate.ok) return gateDenialResponse(liveGate.status === 503 ? { ...liveGate, reason: GATE_RETRY_SENTENCE } : liveGate);
    }
    const removed = await deleteGrant(grant);
    if (removed === 0) return keeperRefusal('grant_changed', 409);
    return success({ revoked: true, blockHeight }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    if (!(e instanceof KeeperUnavailable)) console.error('[keeper] route failed:', (e as { code?: string })?.code ?? 'unknown');
    return keeperUnavailableResponse();
  }
}
