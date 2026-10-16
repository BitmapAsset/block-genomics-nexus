import { NextRequest } from 'next/server';
import { success, error, verifyWalletSignature } from '@/lib/api-helpers';
import { logActivity, logPageView, logProfileView, logSearch } from '@/lib/activity';
import { verifyActionBinding, hashBody } from '@/lib/action-message';
import { consumeChallenge } from '@/lib/challenges';

const ALLOWED_ACTIONS = [
  'page_view', 'profile_view', 'search', 'block_view', 'parcel_view',
  'delegation_view', 'delegation_purchase', 'delegation_list',
  'chat_message', 'estate_view', 'agent_view', 'nexus_view',
  'directory_view', 'verify_start', 'wallet_connect', 'wallet_disconnect',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, metadata, walletAddress, signature, message } = body;

    if (!action || typeof action !== 'string') {
      return error('action is required', 400);
    }

    if (!ALLOWED_ACTIONS.includes(action)) {
      return error('Invalid action', 400);
    }

    // Every row this route writes is attributed to a wallet, and anyone could
    // write activity, page-view and profile-view rows for any wallet string
    // (bg47 E2E-07). An entry now takes that wallet's signature over the
    // canonical action message ('activity.log', Block 0, this exact body) with a
    // one-time nonce from POST /api/v1/challenge { purpose: 'activity' }.
    if (!walletAddress || typeof walletAddress !== 'string' || !signature || !message) {
      return error('walletAddress, signature and message are required', 401);
    }
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return error('Invalid signature', 401);
    }
    const binding = verifyActionBinding(message, {
      action: 'activity.log',
      method: 'POST',
      path: '/api/v1/activity',
      blockHeight: 0,
      bodyHash: await hashBody(body),
    });
    if (!binding.ok) {
      return error(binding.reason || 'Invalid authorization', 401);
    }
    if (!(await consumeChallenge(binding.nonce!, { address: walletAddress, purpose: 'activity' }))) {
      return error('Invalid or already-used challenge nonce', 401);
    }

    // Route to specialized loggers
    if (action === 'page_view' && metadata?.path) {
      await logPageView(metadata.path, walletAddress, metadata.sessionId, metadata.referrer);
    } else if (action === 'profile_view' && metadata?.handle) {
      await logProfileView(metadata.handle, walletAddress);
    } else if (action === 'search' && metadata?.query) {
      await logSearch(metadata.query, metadata.resultsCount || 0, walletAddress);
    }

    await logActivity(walletAddress, action, metadata);

    return success({ logged: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
