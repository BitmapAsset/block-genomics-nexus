/**
 * Nexus Brain — Decision Engine
 * 
 * The core intelligence of the Brain. Evaluates content against
 * the moral code loaded from Bitcoin inscription and produces
 * transparent, explainable decisions.
 * 
 * KEY PRINCIPLE: The Brain's flag counts as exactly 1 community flag.
 * It has NO special override power. Only community consensus hides content.
 * 
 * The Brain NEVER censors alone.
 */

import type {
  BrainSoulInscription,
  ScanTarget,
  ScanResult,
  BrainDecision,
  DecisionType,
  ContentType,
} from './types';

/* ═══════════════════════════════════════════
   CONTENT ANALYSIS
   ═══════════════════════════════════════════ */

/**
 * Pattern matchers for each moral rule.
 * These are conservative — designed to catch clear violations only.
 * False negatives are acceptable; false positives are not.
 * 
 * Rule 0: No exploitation of minors
 * Rule 1: No direct threats of violence
 * Rule 2: No doxxing
 * Rule 3: No fraud/scam
 * Rule 4: No impersonation
 */
const RULE_PATTERNS: Array<{
  ruleIndex: number;
  /** Keywords/phrases that trigger deeper analysis */
  triggers: RegExp[];
  /** High-confidence violation patterns */
  violations: RegExp[];
  /** Context that REDUCES violation likelihood (false positive prevention) */
  exemptions: RegExp[];
}> = [
  {
    // Rule 0: No exploitation of minors — zero tolerance
    ruleIndex: 0,
    triggers: [
      /\b(csam|cp\b|underage|minor.*exploit|child.*abuse|pedo)/i,
    ],
    violations: [
      /\b(csam|child\s*(porn|sex|abuse)|underage\s*(sex|nude|porn)|exploit.*minor|minor.*exploit)/i,
    ],
    exemptions: [
      /\b(protect|report|against|prevent|stop|law|enforcement|awareness|education)/i,
    ],
  },
  {
    // Rule 1: No direct threats of violence
    ruleIndex: 1,
    triggers: [
      /\b(kill|murder|bomb|shoot|stab|attack|assault|hurt|die)\b/i,
    ],
    violations: [
      /\b(i('ll|m going to|will)\s*(kill|murder|bomb|shoot|stab|attack)\s*(you|him|her|them))/i,
      /\b(going to\s*(die|get hurt|be killed))/i,
      /\b(put a (hit|bounty) on)/i,
      /\b(death\s*threat)/i,
    ],
    exemptions: [
      /\b(game|movie|book|fiction|story|joke|figure of speech|metaphor|bitcoin.*kill|kill.*feature)/i,
    ],
  },
  {
    // Rule 2: No doxxing
    ruleIndex: 2,
    triggers: [
      /\b(doxx?|address|phone|ssn|social security|real name|home|school|workplace)/i,
    ],
    violations: [
      /\b(here'?s?\s*(his|her|their)\s*(address|phone|number|location|school|workplace))/i,
      /\b(doxx|doxing|doxxed|doxxing)\b/i,
      /\b(lives at|home address|real identity)/i,
    ],
    exemptions: [
      /\b(bitcoin address|wallet address|inscription|block|parcel|taproot|bc1)/i,
      /\b(my own|my address|self)/i,
    ],
  },
  {
    // Rule 3: No fraud/scam content designed to steal
    ruleIndex: 3,
    triggers: [
      /\b(send|transfer|free|giveaway|double|airdrop|seed phrase|private key)/i,
    ],
    violations: [
      /\b(send\s*\d+\s*(btc|bitcoin|sats).*get\s*\d+\s*(btc|bitcoin|sats)\s*back)/i,
      /\b(double your (btc|bitcoin|sats|crypto))/i,
      /\b(enter your (seed|private key|mnemonic))/i,
      /\b(connect wallet.*claim|claim.*connect wallet)/i,
      /\b(guaranteed\s*\d+x\s*(return|profit|gains))/i,
    ],
    exemptions: [
      /\b(scam alert|warning|don'?t fall for|beware|report|fraud prevention)/i,
    ],
  },
  {
    // Rule 4: No impersonation of verified identities
    ruleIndex: 4,
    triggers: [
      /\b(i am|i'm)\s*(satoshi|elon|saylor|admin|moderator|support)/i,
    ],
    violations: [
      /\b(official\s*(support|admin|team|staff))/i,
      /\b(i('m| am)\s*(satoshi nakamoto|the real|official))/i,
      /\b(block genomics (team|support|admin|official))/i,
    ],
    exemptions: [
      /\b(parody|joke|satire|roleplay|fan|tribute)/i,
    ],
  },
];

/**
 * Analyze content against the Brain's moral code.
 * Returns a detailed scan result with reasoning.
 * 
 * The Brain is CONSERVATIVE — it only flags clear violations.
 * Ambiguous content is left for humans to flag.
 */
export function analyzeContent(
  target: ScanTarget,
  soul: BrainSoulInscription,
): ScanResult {
  const text = (target.text || '').toLowerCase();
  
  // Empty content = clean
  if (!text.trim()) {
    return { violated: false, ruleIndex: null, confidence: 1.0, reasoning: 'No text content to analyze' };
  }

  for (const rule of RULE_PATTERNS) {
    // Check if any triggers match
    const triggered = rule.triggers.some(p => p.test(text));
    if (!triggered) continue;

    // Check for exemptions first (false positive prevention)
    const exempted = rule.exemptions.some(p => p.test(text));
    
    // Check for high-confidence violations
    const violated = rule.violations.some(p => p.test(text));
    
    if (violated && !exempted) {
      return {
        violated: true,
        ruleIndex: rule.ruleIndex,
        confidence: 0.85,
        reasoning: `Content appears to violate Rule ${rule.ruleIndex}: "${soul.moralCode[rule.ruleIndex]}". Flagging for community review.`,
      };
    }
    
    if (violated && exempted) {
      return {
        violated: false,
        ruleIndex: null,
        confidence: 0.6,
        reasoning: `Trigger detected for Rule ${rule.ruleIndex} but context suggests non-violation (educational/warning/fictional context).`,
      };
    }
    
    // Triggered but no high-confidence violation pattern
    if (triggered && !violated) {
      return {
        violated: false,
        ruleIndex: null,
        confidence: 0.7,
        reasoning: `Low-confidence trigger for Rule ${rule.ruleIndex} — leaving for community judgment.`,
      };
    }
  }

  return {
    violated: false,
    ruleIndex: null,
    confidence: 0.95,
    reasoning: 'Content does not match any moral code violation patterns.',
  };
}

/* ═══════════════════════════════════════════
   DECISION BUILDER
   ═══════════════════════════════════════════ */

let decisionCounter = 0;

/**
 * Create a formal Brain decision record.
 * Every decision is logged to the transparency dashboard.
 */
export function createDecision(
  type: DecisionType,
  soul: BrainSoulInscription,
  opts: {
    contentId?: string;
    contentType?: string;
    ruleIndex?: number | null;
    reasoning: string;
  },
): BrainDecision {
  decisionCounter++;
  return {
    id: `brain-${Date.now()}-${decisionCounter}`,
    type,
    contentId: opts.contentId,
    contentType: opts.contentType,
    ruleIndex: opts.ruleIndex ?? null,
    reasoning: opts.reasoning,
    ruleText: opts.ruleIndex != null ? soul.moralCode[opts.ruleIndex] : undefined,
    timestamp: new Date(),
    soulInscriptionRef: `inscription:${soul.integrityHash || 'unverified'}`,
  };
}

/* ═══════════════════════════════════════════
   APPEAL RESOLUTION
   ═══════════════════════════════════════════ */

/**
 * Determine the outcome of an appeal based on community votes.
 * The Brain follows the inscription's parameters exactly.
 */
export function resolveAppeal(
  votesFor: number,
  votesAgainst: number,
  soul: BrainSoulInscription,
): { outcome: 'restored' | 'upheld'; reasoning: string } {
  const totalVotes = votesFor + votesAgainst;
  
  if (totalVotes === 0) {
    // No votes = content restored (benefit of the doubt)
    return {
      outcome: 'restored',
      reasoning: 'No community votes cast during appeal period — content restored (benefit of the doubt).',
    };
  }

  const restoreRatio = votesFor / totalVotes;
  const needed = soul.parameters.appealRestoreMajority;

  if (restoreRatio >= needed) {
    return {
      outcome: 'restored',
      reasoning: `Community voted to restore: ${votesFor}/${totalVotes} (${(restoreRatio * 100).toFixed(1)}%) — exceeds ${(needed * 100)}% threshold.`,
    };
  }

  return {
    outcome: 'upheld',
    reasoning: `Community voted to keep hidden: ${votesFor}/${totalVotes} (${(restoreRatio * 100).toFixed(1)}%) — below ${(needed * 100)}% threshold required for restoration.`,
  };
}

/* ═══════════════════════════════════════════
   STRIKE EVALUATION
   ═══════════════════════════════════════════ */

/**
 * Evaluate whether a flagger should receive a strike (for flagging clearly non-violating content).
 * Called when an appeal results in content being restored.
 */
export function shouldIssueStrike(
  flagReason: string | null,
  appealOutcome: 'restored' | 'upheld',
  scanResult: ScanResult,
): boolean {
  // Only issue strike if content was restored AND Brain didn't flag it either
  if (appealOutcome !== 'restored') return false;
  if (scanResult.violated) return false; // Brain agreed it was a violation
  if (scanResult.confidence < 0.8) return false; // Ambiguous — give benefit of doubt
  
  return true;
}

/**
 * Check if a flagger should have privileges revoked.
 */
export function shouldRevokeFlagging(
  currentStrikes: number,
  soul: BrainSoulInscription,
): boolean {
  return currentStrikes >= soul.parameters.falseFlagStrikeLimit;
}

/* ═══════════════════════════════════════════
   SCANNER SEAM (the one pluggable interface)
   ═══════════════════════════════════════════ */

/**
 * A ContentScanner evaluates one target against the soul's moral code and
 * returns a ScanResult. This is the SINGLE seam where a future LLM-assisted
 * scanner can plug in — the runtime, routes, and fail-closed flag-persistence
 * logic all resolve the scanner through getContentScanner() and never call a
 * concrete detector directly.
 *
 * v1 ships exactly one implementation: `regexScanner` (the conservative
 * deterministic `analyzeContent`). There are NO LLM calls today. The method
 * may return a Promise so an async (e.g. LLM) scanner can slot in later without
 * touching any call site.
 */
export interface ContentScanner {
  analyze(target: ScanTarget, soul: BrainSoulInscription): ScanResult | Promise<ScanResult>;
}

/** The default v1 scanner: conservative, deterministic regex (analyzeContent). */
export const regexScanner: ContentScanner = { analyze: analyzeContent };

let activeScanner: ContentScanner = regexScanner;

/** Resolve the active content scanner. Defaults to the regex scanner. */
export function getContentScanner(): ContentScanner {
  return activeScanner;
}

/**
 * Install a content scanner (e.g. an LLM-assisted one later). Call with no
 * argument to reset to the default regex scanner. This is the only supported
 * way to swap detection logic; while regexScanner is active, v1 semantics are
 * byte-for-byte unchanged.
 */
export function setContentScanner(scanner?: ContentScanner): void {
  activeScanner = scanner ?? regexScanner;
}
