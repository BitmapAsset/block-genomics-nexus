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
 * Deliver an escalation to whichever channels the guardian owner configured.
 * Call this wherever an escalation GuardianEvent is recorded.
 */
export async function notifyEscalation(
  guardianId: string,
  blockHeight: number,
  message: string,
  visitor?: string
): Promise<void> {
  try {
    const guardian = await prisma.guardianAgent.findUnique({
      where: { id: guardianId },
      select: { escalateTelegram: true, escalateEmail: true, name: true },
    });
    if (!guardian || (!guardian.escalateTelegram && !guardian.escalateEmail)) return;

    const text = `🛡️ Guardian escalation — ${guardian.name} (block #${blockHeight})\nFrom: ${visitor || 'anonymous visitor'}\n\n${message}`;

    await Promise.all([
      guardian.escalateTelegram
        ? sendTelegramEscalation(guardian.escalateTelegram, text)
        : Promise.resolve(false),
      guardian.escalateEmail
        ? sendEmailEscalation(guardian.escalateEmail, `Guardian escalation — block #${blockHeight}`, text)
        : Promise.resolve(false),
    ]);
  } catch (err) {
    // Best-effort — never let notification failures break the chat flow
    console.warn('[escalation-notify] Delivery error:', err);
  }
}
