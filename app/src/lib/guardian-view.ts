/**
 * What a guardian answer may carry, by reader.
 *
 * A guardian row holds the owner's contact channels, prompts, memory, config,
 * endpoints and monitor pairing next to the few facts a visitor sees. Answers
 * are built from explicit field lists, never by spreading the row, so a new
 * column stays private until someone adds it here on purpose.
 *
 *   toPublicGuardian  anyone: the block page, the agent hub, MCP tools.
 *   toOwnerGuardian   the owner (a monitor token for the guardian, a bound
 *                     signed read by the wallet holding the block, or the
 *                     answer to the owner's own signed write). The LLM key is
 *                     masked and the monitor token hash is never returned.
 */

import { maskApiKey } from '@/lib/key-encryption';

type GuardianRow = Record<string, unknown>;

/** Columns anyone may read. `llmProvider` is the agent hub's capability badge. */
export const PUBLIC_GUARDIAN_FIELDS = [
  'id', 'blockHeight', 'name', 'personality', 'status', 'protocolVersion', 'selfHosted',
  'endpointVerified', 'lastHeartbeat', 'totalVisitors', 'totalMessages', 'createdAt', 'llmProvider',
] as const;

/** Columns the owner view adds. `llmApiKey` goes out masked. */
export const OWNER_GUARDIAN_FIELDS = [
  'ownerAddress', 'soulMd', 'agentMd', 'skillsMd', 'memoryMd', 'llmModel', 'llmEndpoint', 'agentEndpoint',
  'autoResponses', 'escalateTelegram', 'escalateEmail', 'autoApproveDelegationUnder', 'updatedAt', 'configJson',
  'monitorTokenCreatedAt', 'monitorPairedAt', 'monitorPairedWallet', 'monitorWebhookUrl', 'graceDeadline',
] as const;

function pick(row: GuardianRow, fields: readonly string[]): GuardianRow {
  const out: GuardianRow = {};
  for (const f of fields) if (f in row) out[f] = row[f];
  return out;
}

/** The visitor view: public columns plus whether the guardian can answer with an LLM. */
export function toPublicGuardian(row: GuardianRow): GuardianRow {
  return {
    ...pick(row, PUBLIC_GUARDIAN_FIELDS),
    llmConfigured: !!(row.llmApiKey && row.llmProvider && row.llmModel),
  };
}

/** The owner view: everything the settings panel edits, key masked, token hash as booleans. */
export function toOwnerGuardian(row: GuardianRow): GuardianRow {
  return {
    ...toPublicGuardian(row),
    ...pick(row, OWNER_GUARDIAN_FIELDS),
    llmApiKey: maskApiKey(row.llmApiKey as string),
    monitorTokenActive: !!row.monitorTokenHash,
    monitorPaired: !!row.monitorPairedAt,
  };
}
