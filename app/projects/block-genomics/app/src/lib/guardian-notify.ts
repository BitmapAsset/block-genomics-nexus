/**
 * Guardian Activity Notification System
 * Pushes important events from Guardian → paired OpenClaw agent
 */
import prisma from '@/lib/prisma';

export type ActivityType =
  | 'visitor'           // New visitor on the block
  | 'message'           // New chat message from visitor  
  | 'delegation_request'// Someone wants delegation access
  | 'flag'              // Content flagged by Brain
  | 'stream_start'      // Someone started streaming
  | 'stream_end'        // Stream ended
  | 'world_change'      // World object placed/modified
  | 'guardian_error'     // Guardian encountered an error
  | 'summary'           // Periodic activity summary

interface ActivityEvent {
  type: ActivityType;
  guardianId: string;
  blockHeight: number;
  message: string;
  data?: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high';
}

/**
 * Push an activity event to the paired OpenClaw agent's webhook.
 * Silently fails if no webhook is configured (guardian not paired).
 */
export async function pushActivity(event: ActivityEvent): Promise<boolean> {
  try {
    const guardian = await prisma.guardianAgent.findUnique({
      where: { id: event.guardianId },
      select: { monitorWebhookUrl: true, monitorPairedAt: true, name: true },
    });

    if (!guardian?.monitorWebhookUrl || !guardian.monitorPairedAt) {
      return false; // Not paired or no webhook
    }

    const payload = {
      source: 'block-genomics',
      event: event.type,
      guardian: event.guardianId,
      guardianName: guardian.name,
      block: event.blockHeight,
      message: event.message,
      data: event.data || {},
      priority: event.priority,
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(guardian.monitorWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    return res.ok;
  } catch {
    // Webhook delivery is best-effort — don't crash anything
    return false;
  }
}

/**
 * Push activity for all common events.
 * Call these from chat routes, delegation routes, etc.
 */
export async function notifyNewVisitor(guardianId: string, blockHeight: number, visitorHandle?: string) {
  return pushActivity({
    type: 'visitor',
    guardianId,
    blockHeight,
    message: visitorHandle ? `New visitor: @${visitorHandle}` : 'New anonymous visitor',
    priority: 'low',
  });
}

export async function notifyNewMessage(guardianId: string, blockHeight: number, from: string, preview: string) {
  return pushActivity({
    type: 'message',
    guardianId,
    blockHeight,
    message: `Message from ${from}: ${preview.slice(0, 100)}`,
    data: { from, preview },
    priority: 'normal',
  });
}

export async function notifyDelegationRequest(guardianId: string, blockHeight: number, requester: string) {
  return pushActivity({
    type: 'delegation_request',
    guardianId,
    blockHeight,
    message: `Delegation request from ${requester}`,
    data: { requester },
    priority: 'high',
  });
}

export async function notifyFlag(guardianId: string, blockHeight: number, reason: string) {
  return pushActivity({
    type: 'flag',
    guardianId,
    blockHeight,
    message: `Content flagged: ${reason}`,
    data: { reason },
    priority: 'high',
  });
}
