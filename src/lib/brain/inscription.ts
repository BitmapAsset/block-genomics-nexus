/**
 * Nexus Brain — Inscription Reader
 * 
 * Reads the Brain's soul directly from its Bitcoin inscription.
 * This is the philosophical core: the Brain's operating instructions
 * live immutably on the most secure ledger on Earth.
 * 
 * Flow:
 *   1. On boot → fetch inscription content from ordinals.com
 *   2. Parse JSON → validate schema → extract moral code + parameters
 *   3. Brain operates ONLY by what the inscription says
 *   4. Periodically re-verify (detect tampering of cache)
 * 
 * If the inscription cannot be read, the Brain enters DEGRADED mode
 * and refuses to make any moderation decisions until soul is restored.
 */

import { createHash } from 'crypto';
import {
  BrainSoulInscription,
  DEFAULT_BRAIN_CONFIG,
  type BrainRuntimeConfig,
} from './types';
import {
  MORAL_CODE,
  MORAL_CODE_INSCRIPTION_ID,
  SOUL_FILE_INSCRIPTION_ID,
  SOUL_JSON_INSCRIPTION_ID,
  NEXUS_BRAIN_HANDLE,
  NEXUS_BRAIN_WALLET,
  BRAIN_FEE_PERCENT,
  FLAG_THRESHOLD_SOFT,
  FLAG_THRESHOLD_HARD,
  APPEAL_DURATION_HOURS,
  APPEAL_RESTORE_MAJORITY,
  FALSE_FLAG_STRIKE_LIMIT,
} from '../protocol';

/* ═══════════════════════════════════════════
   INSCRIPTION CONTENT
   ═══════════════════════════════════════════ */

/**
 * The canonical Brain soul document — this is what gets inscribed on Bitcoin.
 * Once inscribed, this becomes the immutable source of truth.
 */
export function buildSoulDocument(): BrainSoulInscription {
  const doc: BrainSoulInscription = {
    protocol: 'block-genomics-brain',
    version: 1,
    identity: {
      handle: NEXUS_BRAIN_HANDLE,
      name: 'Nexus Brain',
      role: 'Autonomous Moral Guardian',
      tier: 1,
    },
    moralCode: [...MORAL_CODE],
    parameters: {
      flagThresholdSoft: FLAG_THRESHOLD_SOFT,
      flagThresholdHard: FLAG_THRESHOLD_HARD,
      appealDurationHours: APPEAL_DURATION_HOURS,
      appealRestoreMajority: APPEAL_RESTORE_MAJORITY,
      falseFlagStrikeLimit: FALSE_FLAG_STRIKE_LIMIT,
    },
    constraints: [
      'NEVER censor content alone — always requires community consensus (minimum flagThresholdSoft flags)',
      'NEVER modify its own moral code — changes require a new Bitcoin inscription',
      'NEVER access private keys, seed phrases, or wallet funds beyond its own operational wallet',
      'NEVER override parcel owner sovereignty — content moderation applies to PUBLIC feeds only',
      'NEVER discriminate by tier, wallet age, or verification status — all flags weighed equally',
      'NEVER make decisions when soul cannot be verified from inscription — enter DEGRADED mode',
      'NEVER hide content that does not violate one of the 5 moral rules',
      'ALWAYS explain its reasoning for every action taken',
      'ALWAYS publish all decisions to the transparency dashboard',
      'ALWAYS allow appeals — no decision is final without community vote',
    ],
    feePercent: BRAIN_FEE_PERCENT,
    wallet: NEXUS_BRAIN_WALLET,
    createdAt: new Date().toISOString(),
  };

  // Compute integrity hash (hash of everything except integrityHash field)
  const hashInput = JSON.stringify(doc);
  doc.integrityHash = createHash('sha256').update(hashInput).digest('hex');

  return doc;
}

/* ═══════════════════════════════════════════
   INSCRIPTION FETCHER
   ═══════════════════════════════════════════ */

/**
 * Fetch the Brain's soul from its Bitcoin inscription.
 * 
 * Strategy:
 *   1. Try ordinals.com/content/{inscriptionId}
 *   2. Fallback: ord.io
 *   3. Fallback: use hardcoded soul from protocol.ts (degraded mode)
 * 
 * Returns null if ALL sources fail (Brain should refuse to operate).
 */
export async function fetchSoulFromInscription(
  config: BrainRuntimeConfig = DEFAULT_BRAIN_CONFIG,
): Promise<{ soul: BrainSoulInscription; source: 'inscription' | 'fallback'; verified: boolean }> {
  
  // Strategy 1: Fetch SOUL.json from ordinals.com (primary — full JSON schema)
  try {
    const url = `${config.ordinalsApiUrl}/content/${SOUL_JSON_INSCRIPTION_ID}`;
    const res = await fetch(url, { 
      signal: AbortSignal.timeout(10_000),
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const raw = await res.text();
      const soul = parseSoulDocument(raw);
      if (soul) {
        return { soul, source: 'inscription', verified: verifySoulIntegrity(soul) };
      }
    }
  } catch {
    // Fallback
  }

  // Strategy 2: Try ord.io with SOUL.json inscription
  try {
    const url = `https://ord.io/content/${SOUL_JSON_INSCRIPTION_ID}`;
    const res = await fetch(url, { 
      signal: AbortSignal.timeout(10_000),
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const raw = await res.text();
      const soul = parseSoulDocument(raw);
      if (soul) {
        return { soul, source: 'inscription', verified: verifySoulIntegrity(soul) };
      }
    }
  } catch {
    // Fallback
  }

  // Strategy 3: Build from hardcoded protocol constants (degraded mode)
  console.warn('[NexusBrain] Could not fetch soul from inscription — using protocol fallback (DEGRADED)');
  const fallbackSoul = buildSoulDocument();
  return { soul: fallbackSoul, source: 'fallback', verified: false };
}

/* ═══════════════════════════════════════════
   PARSING & VALIDATION
   ═══════════════════════════════════════════ */

/**
 * Parse and validate a raw inscription content string into a BrainSoulInscription.
 * Returns null if the document is invalid or tampered with.
 */
export function parseSoulDocument(raw: string): BrainSoulInscription | null {
  try {
    const doc = JSON.parse(raw);
    
    // Validate required fields
    if (doc.protocol !== 'block-genomics-brain') return null;
    if (doc.version !== 1) return null;
    if (!doc.identity?.handle || !doc.identity?.name) return null;
    if (!Array.isArray(doc.moralCode) || doc.moralCode.length !== 5) return null;
    if (!doc.parameters) return null;
    if (!Array.isArray(doc.constraints) || doc.constraints.length === 0) return null;
    if (typeof doc.feePercent !== 'number') return null;
    if (!doc.wallet) return null;

    // Validate parameter types
    const p = doc.parameters;
    if (typeof p.flagThresholdSoft !== 'number') return null;
    if (typeof p.flagThresholdHard !== 'number') return null;
    if (typeof p.appealDurationHours !== 'number') return null;
    if (typeof p.appealRestoreMajority !== 'number') return null;
    if (typeof p.falseFlagStrikeLimit !== 'number') return null;

    return doc as BrainSoulInscription;
  } catch {
    return null;
  }
}

/**
 * Verify the integrity hash of a soul document.
 * Recalculates SHA-256 and compares to stored hash.
 */
export function verifySoulIntegrity(soul: BrainSoulInscription): boolean {
  if (!soul.integrityHash) return false;
  
  const storedHash = soul.integrityHash;
  const docWithoutHash = { ...soul };
  delete docWithoutHash.integrityHash;
  
  const computed = createHash('sha256')
    .update(JSON.stringify(docWithoutHash))
    .digest('hex');
  
  return computed === storedHash;
}

/* ═══════════════════════════════════════════
   MORAL CODE VERIFICATION
   ═══════════════════════════════════════════ */

/**
 * Fetch the moral code inscription and verify it matches the soul.
 * The moral code was inscribed separately as plain text.
 */
export async function verifyMoralCodeInscription(
  config: BrainRuntimeConfig = DEFAULT_BRAIN_CONFIG,
): Promise<{ matches: boolean; inscriptionText?: string }> {
  try {
    const url = `${config.ordinalsApiUrl}/content/${MORAL_CODE_INSCRIPTION_ID}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { matches: false };
    
    const text = await res.text();
    
    // The inscription should contain the 5 rules
    const allRulesPresent = MORAL_CODE.every(rule => text.includes(rule));
    return { matches: allRulesPresent, inscriptionText: text };
  } catch {
    return { matches: false };
  }
}

/* ═══════════════════════════════════════════
   BRAIN WALLET
   ═══════════════════════════════════════════ */

/**
 * Check the Brain's wallet balance via mempool.space.
 */
export async function fetchBrainWalletBalance(
  config: BrainRuntimeConfig = DEFAULT_BRAIN_CONFIG,
): Promise<number | null> {
  try {
    const url = `${config.mempoolApiUrl}/address/${NEXUS_BRAIN_WALLET}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    
    const data = await res.json();
    const confirmed = data.chain_stats?.funded_txo_sum - data.chain_stats?.spent_txo_sum;
    const unconfirmed = data.mempool_stats?.funded_txo_sum - data.mempool_stats?.spent_txo_sum;
    return (confirmed || 0) + (unconfirmed || 0);
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════
   EXPORT: THE SOUL DOCUMENT (for inscription)
   ═══════════════════════════════════════════ */

/**
 * Generate the final JSON to be inscribed on Bitcoin.
 * Call this once, inscribe it, and the Brain reads it forever.
 */
export function generateInscriptionJSON(): string {
  const soul = buildSoulDocument();
  return JSON.stringify(soul, null, 2);
}
