import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-helpers';
import { logActivity, logPageView, logProfileView, logSearch } from '@/lib/activity';

const ALLOWED_ACTIONS = [
  'page_view', 'profile_view', 'search', 'block_view', 'parcel_view',
  'delegation_view', 'delegation_purchase', 'delegation_list',
  'chat_message', 'estate_view', 'agent_view', 'nexus_view',
  'directory_view', 'verify_start', 'wallet_connect', 'wallet_disconnect',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, metadata, walletAddress } = body;

    if (!action || typeof action !== 'string') {
      return error('action is required', 400);
    }

    if (!ALLOWED_ACTIONS.includes(action)) {
      return error('Invalid action', 400);
    }

    // Route to specialized loggers
    if (action === 'page_view' && metadata?.path) {
      await logPageView(metadata.path, walletAddress, metadata.sessionId, metadata.referrer);
    } else if (action === 'profile_view' && metadata?.handle) {
      await logProfileView(metadata.handle, walletAddress);
    } else if (action === 'search' && metadata?.query) {
      await logSearch(metadata.query, metadata.resultsCount || 0, walletAddress);
    }

    // Always log to general activity if wallet connected
    if (walletAddress) {
      await logActivity(walletAddress, action, metadata);
    }

    return success({ logged: true });
  } catch (e: any) {
    return error(e.message, 500);
  }
}
