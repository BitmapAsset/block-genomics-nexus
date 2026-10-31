/**
 * Guardian Escalation Delivery
 * Sends escalation alerts to the guardian owner's configured channels
 * (escalateTelegram / escalateEmail). Complements the paired-agent webhook
 * push in guardian-notify.ts. Best-effort — never throws.
 *
 * Feature-flagged by env: if BG_TELEGRAM_BOT_TOKEN / RESEND_API_KEY are unset,
 * the corresponding sender logs a warning and no-ops.
 */
import prisma from '@/lib/prisma';

const EMAIL_FROM = 'alerts@blockgenomics.io';

/**
 * Send an escalation message via Telegram Bot API.
 * @param chatId - Telegram chat id or @handle stored on the guardian
 * @param text - Message body
 */
export async function sendTelegramEscalation(chatId: string, text: string): Promise<boolean> {
  const token = process.env.BG_TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[escalation-notify] BG_TELEGRAM_BOT_TOKEN not set — telegram escalation skipped');
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn('[escalation-notify] Telegram send failed:', res.status);
    return res.ok;
  } catch {
    // Delivery is best-effort — don't crash anything
    return false;
  }
}

/**
 * Send an escalation email via the Resend REST API.
 * @param to - Recipient email stored on the guardian
 * @param subject - Email subject
 * @param text - Plain-text body
 */
export async function sendEmailEscalation(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[escalation-notify] RESEND_API_KEY not set — email escalation skipped');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn('[escalation-notify] Resend send failed:', res.status);
    return res.ok;
  } catch {
    // Delivery is best-effort — don't crash anything
    return false;
  }
}

/**
 * The notice is fixed text: the block number and where to read the message.
 * Nothing a visitor wrote (message, handle, address) and nothing the owner
 * typed (the guardian name) goes into it, so the alerts address only ever
 * sends these words. The message itself is read in the guardian monitor.
 */
export function escalationNotice(blockHeight: number): { subject: string; text: string } {
  const block = Number.isSafeInteger(blockHeight) ? blockHeight : 0;
  return {
    subject: `Guardian message waiting — block #${block}`,
    text:
      `A visitor left a message for the guardian of block #${block}.\n` +
      'Read it in your guardian monitor (the guardian events of your Block Genomics agent).',
  };
}

/**
 * Tell the guardian owner's configured channels that a message waits.
 * Call this wherever an escalation GuardianEvent is recorded (callers cap it).
 */
export async function notifyEscalation(guardianId: string, blockHeight: number): Promise<void> {
  try {
    const guardian = await prisma.guardianAgent.findUnique({
      where: { id: guardianId },
      select: { escalateTelegram: true, escalateEmail: true },
    });
    if (!guardian || (!guardian.escalateTelegram && !guardian.escalateEmail)) return;

    const { subject, text } = escalationNotice(blockHeight);

    await Promise.all([
      guardian.escalateTelegram
        ? sendTelegramEscalation(guardian.escalateTelegram, text)
        : Promise.resolve(false),
      guardian.escalateEmail
        ? sendEmailEscalation(guardian.escalateEmail, subject, text)
        : Promise.resolve(false),
    ]);
  } catch (err) {
    // Best-effort — never let notification failures break the chat flow
    console.warn('[escalation-notify] Delivery error:', err);
  }
}
