/**
 * Block Genomics — Trust Score Engine Test Cases
 *
 * Comprehensive test scenarios with expected score ranges.
 * These tests verify determinism, correctness, and edge cases.
 *
 * Run: `npx tsx test-cases.ts`
 *
 * @module test-cases
 * @version 1.0.0
 */

import { TrustScoreEngine } from './trust-score.js';
import type {
  AgentData,
  BlockData,
  Claim,
  TrustScore,
  TrustScoreConfig,
  VerificationRecord,
} from './types.js';
import { ClaimType, Tier, TrustTier } from './types.js';

// =============================================================================
// FIXED TIMESTAMP FOR DETERMINISTIC TESTS
// =============================================================================

/** Fixed "now" for all tests: Feb 6, 2026 00:00:00 UTC */
const NOW = Math.floor(new Date('2026-02-06T00:00:00Z').getTime() / 1000);

/** Fixed config for all tests */
const TEST_CONFIG: Partial<TrustScoreConfig> = {
  nowTimestamp: NOW,
  currentBlockHeight: 880000,
};

// =============================================================================
// TEST FIXTURES
// =============================================================================

// --- Genesis Block (Block 0) ---
const GENESIS_BLOCK: BlockData = {
  height: 0,
  hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
  merkleRoot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
  previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
  timestamp: 1231006505, // Jan 3, 2009 18:15:05 UTC
  nonce: 2083236893,
  bits: '1d00ffff',
  difficulty: 1,
  txCount: 1,
  size: 285,
  weight: 1140,
};

// --- Early Block (Block 170 — first BTC transaction) ---
const EARLY_BLOCK: BlockData = {
  height: 170,
  hash: '00000000d1145790a8694403d4063f323d499e655c83426834d4ce2f8dd4a2ee',
  merkleRoot: '7dac2c5666815c17a3b36427de37bb9d2e2c5ccec3f8633eb91a4205cb4c10ff',
  previousHash: '000000002a22cfee1f2c846adbd12b3e183d4f97683f85dad08a79780a84bd55',
  timestamp: 1231731025, // Jan 12, 2009
  nonce: 1889418792,
  bits: '1d00ffff',
  difficulty: 1,
  txCount: 2,
  size: 490,
  weight: 1960,
};

// --- Mid-Era Block (Block 500000 — well-established) ---
const MID_BLOCK: BlockData = {
  height: 500000,
  hash: '00000000000000000024fb37364cbf81fd49cc2d51c09c75c35433c3a1945d04',
  merkleRoot: '5765c867b6992a4ec450e9c39f66bfb68f4adadb5efc7a5a1a3abcce539e01e7',
  previousHash: '0000000000000000007962066dcd6675830883516bcf40047d42740a85eb2919',
  timestamp: 1513622125, // Dec 18, 2017
  nonce: 1560058197,
  bits: '18009645',
  difficulty: 1873105475221.611,
  txCount: 2701,
  size: 1048030,
  weight: 3993402,
  totalOutputSats: 500_000_000_000n, // ~5000 BTC
};

// --- Recent Block (Block 840000 — 4th halving) ---
const HALVING_BLOCK: BlockData = {
  height: 840000,
  hash: '0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5',
  merkleRoot: 'a7c3d5e8f1b2c4d6a8e0f2a4c6e8a0b2d4f6a8c0e2a4c6e8b0d2f4a6c8e0a2',
  previousHash: '00000000000000000001b48a75d5a3077913f3f441eb7e08c13c43f768db2463',
  timestamp: 1713571767, // Apr 20, 2024
  nonce: 3218345012,
  bits: '17034219',
  difficulty: 86388558925171.02,
  txCount: 3050,
  size: 1550000,
  weight: 3998000,
  totalOutputSats: 2_000_000_000_000n, // ~20,000 BTC
};

// --- Very Recent Block (Block 879000) ---
const RECENT_BLOCK: BlockData = {
  height: 879000,
  hash: '00000000000000000002a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e1f0a2b4c6d8',
  merkleRoot: 'b8d4f6a8c0e2a4c6e8b0d2f4a6c8e0a2b4d6f8a0c2e4a6c8e0b2d4f6a8c0e2',
  previousHash: '00000000000000000003c5d7e9f1a3b5c7d9e1f0a2b4c6d8e0f2a4b6c8d0e2f4',
  timestamp: NOW - 30 * 86400, // 30 days ago
  nonce: 987654321,
  bits: '170345ff',
  difficulty: 95000000000000,
  txCount: 4200,
  size: 1800000,
  weight: 3999000,
  totalOutputSats: 3_000_000_000_000n,
};

// --- Empty Block (only coinbase) ---
const EMPTY_BLOCK: BlockData = {
  height: 501000,
  hash: '00000000000000000045a3b5c7d9e1f0a2b4c6d8e0f1a3b5c7d9e1f0a2b4c6d8',
  merkleRoot: 'c0e2a4c6e8b0d2f4a6c8e0a2b4d6f8a0c2e4a6c8e0b2d4f6a8c0e2a4c6e8b0',
  previousHash: '00000000000000000056c7d9e1f0a2b4c6d8e0f1a3b5c7d9e1f0a2b4c6d8e0f1',
  timestamp: 1514000000,
  nonce: 1234567890,
  bits: '18009645',
  difficulty: 1873105475221.611,
  txCount: 1,
  size: 250,
  weight: 1000,
};

// --- Agent Fixtures ---

function makeAgent(overrides: Partial<AgentData> = {}): AgentData {
  return {
    id: 'bg_test_agent_001',
    name: 'TestAgent',
    blockHeight: 500000,
    blockHash: MID_BLOCK.hash,
    genome: 'a'.repeat(64),
    tier: Tier.TIER_1,
    isAI: false,
    walletAddress: 'bc1qtest...',
    verified: true,
    verifiedAt: new Date((NOW - 10 * 86400) * 1000).toISOString(),
    createdAt: new Date((NOW - 365 * 86400) * 1000).toISOString(),
    ...overrides,
  };
}

function makeVerification(
  overrides: Partial<VerificationRecord> = {},
): VerificationRecord {
  return {
    id: 'ver_test_001',
    agentId: 'bg_test_agent_001',
    signature: 'sig_test...',
    signerAddress: 'bc1qtest...',
    blockHeight: 500000,
    status: 'VERIFIED',
    createdAt: new Date((NOW - 10 * 86400) * 1000).toISOString(),
    expiresAt: new Date((NOW + 355 * 86400) * 1000).toISOString(),
    ...overrides,
  };
}

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    type: ClaimType.DOMAIN,
    value: 'example.com',
    verified: true,
    verifiedAt: new Date((NOW - 5 * 86400) * 1000).toISOString(),
    ...overrides,
  };
}

// =============================================================================
// TEST RUNNER
// =============================================================================

interface TestCase {
  name: string;
  description: string;
  agent: AgentData;
  block: BlockData;
  verifications: VerificationRecord[];
  claims: Claim[];
  expectations: {
    scoreMin: number;
    scoreMax: number;
    tier?: TrustTier;
    flagged?: boolean;
    anomalyCodes?: string[];
  };
}

const testCases: TestCase[] = [
  // =========================================================================
  // 1. GENESIS BLOCK — Near-maximum score
  // =========================================================================
  {
    name: 'Genesis Block (Block 0) — Tier 1, Full Claims',
    description:
      'The genesis block should score near 100. Maximum age, verified ownership, ' +
      'good history. Richness and security are low (1 tx, difficulty 1) but ' +
      'age and ownership compensate.',
    agent: makeAgent({
      blockHeight: 0,
      blockHash: GENESIS_BLOCK.hash,
      tier: Tier.TIER_1,
    }),
    block: GENESIS_BLOCK,
    verifications: [
      makeVerification({ blockHeight: 0, createdAt: new Date((NOW - 10 * 86400) * 1000).toISOString() }),
      makeVerification({ id: 'ver_002', blockHeight: 0, createdAt: new Date((NOW - 100 * 86400) * 1000).toISOString() }),
      makeVerification({ id: 'ver_003', blockHeight: 0, createdAt: new Date((NOW - 200 * 86400) * 1000).toISOString() }),
    ],
    claims: [
      makeClaim({ type: ClaimType.DOMAIN, value: 'genesis.btc' }),
      makeClaim({ type: ClaimType.X_ACCOUNT, value: '@satoshi' }),
      makeClaim({ type: ClaimType.LIGHTNING_NODE, value: 'ln_genesis...' }),
      makeClaim({ type: ClaimType.PGP_KEY, value: 'pgp_genesis...' }),
      makeClaim({ type: ClaimType.GITHUB, value: 'satoshi' }),
    ],
    expectations: {
      scoreMin: 70,
      scoreMax: 100,
      flagged: false,
    },
  },

  // =========================================================================
  // 2. RECENT BLOCK — Moderate score
  // =========================================================================
  {
    name: 'Recent Block (Block 879000) — Tier 1, No Claims',
    description:
      'A very recent block has low age score but high security (modern difficulty) ' +
      'and good richness (full block). No claims reduce bonus.',
    agent: makeAgent({
      blockHeight: 879000,
      blockHash: RECENT_BLOCK.hash,
      tier: Tier.TIER_1,
      createdAt: new Date((NOW - 30 * 86400) * 1000).toISOString(),
    }),
    block: RECENT_BLOCK,
    verifications: [
      makeVerification({ blockHeight: 879000, createdAt: new Date((NOW - 5 * 86400) * 1000).toISOString() }),
    ],
    claims: [],
    expectations: {
      scoreMin: 45,
      scoreMax: 80,
    },
  },

  // =========================================================================
  // 3. HALVING BLOCK — Good score
  // =========================================================================
  {
    name: 'Halving Block (Block 840000) — Tier 1, Some Claims',
    description:
      'The 4th halving block (~2 years old by test time), high difficulty, ' +
      'full block. Should score well.',
    agent: makeAgent({
      blockHeight: 840000,
      blockHash: HALVING_BLOCK.hash,
      tier: Tier.TIER_1,
      createdAt: new Date((NOW - 600 * 86400) * 1000).toISOString(),
    }),
    block: HALVING_BLOCK,
    verifications: [
      makeVerification({ blockHeight: 840000, createdAt: new Date((NOW - 15 * 86400) * 1000).toISOString() }),
      makeVerification({ id: 'ver_halv_2', blockHeight: 840000, createdAt: new Date((NOW - 180 * 86400) * 1000).toISOString() }),
    ],
    claims: [
      makeClaim({ type: ClaimType.DOMAIN, value: 'halving.btc' }),
      makeClaim({ type: ClaimType.X_ACCOUNT, value: '@halving_owner' }),
    ],
    expectations: {
      scoreMin: 55,
      scoreMax: 90,
    },
  },

  // =========================================================================
  // 4. MANY TRANSACTIONS vs FEW
  // =========================================================================
  {
    name: 'Full Block (4200 txs) vs Empty Block (1 tx) — same agent tier',
    description:
      'The richness component should clearly differentiate between a full block and an empty block.',
    agent: makeAgent({
      blockHeight: 879000,
      blockHash: RECENT_BLOCK.hash,
    }),
    block: RECENT_BLOCK, // 4200 txs
    verifications: [makeVerification({ blockHeight: 879000 })],
    claims: [],
    expectations: {
      scoreMin: 45,
      scoreMax: 80,
    },
  },
  {
    name: 'Empty Block (1 tx) — Tier 1',
    description:
      'An empty block (only coinbase) should score lower on richness. ' +
      'Should also trigger EMPTY_BLOCK anomaly.',
    agent: makeAgent({
      blockHeight: 501000,
      blockHash: EMPTY_BLOCK.hash,
    }),
    block: EMPTY_BLOCK,
    verifications: [makeVerification({ blockHeight: 501000 })],
    claims: [],
    expectations: {
      scoreMin: 35,
      scoreMax: 70,
      anomalyCodes: ['EMPTY_BLOCK'],
    },
  },

  // =========================================================================
  // 5. TIER COMPARISON — Same block, different tiers
  // =========================================================================
  {
    name: 'Tier 1 Agent on Block 500000',
    description: 'Tier 1 gets 1.0x multiplier — full score.',
    agent: makeAgent({ tier: Tier.TIER_1 }),
    block: MID_BLOCK,
    verifications: [makeVerification()],
    claims: [makeClaim({ type: ClaimType.DOMAIN, value: 'example.com' })],
    expectations: {
      scoreMin: 60,
      scoreMax: 95,
    },
  },
  {
    name: 'Tier 2 Agent on Block 500000',
    description: 'Tier 2 gets 0.8x multiplier — reduced score.',
    agent: makeAgent({ tier: Tier.TIER_2 }),
    block: MID_BLOCK,
    verifications: [makeVerification()],
    claims: [makeClaim({ type: ClaimType.DOMAIN, value: 'example.com' })],
    expectations: {
      scoreMin: 48,
      scoreMax: 80,
    },
  },
  {
    name: 'Tier 3 Agent on Block 500000',
    description: 'Tier 3 gets 0.6x multiplier — significantly reduced.',
    agent: makeAgent({ tier: Tier.TIER_3 }),
    block: MID_BLOCK,
    verifications: [makeVerification()],
    claims: [makeClaim({ type: ClaimType.DOMAIN, value: 'example.com' })],
    expectations: {
      scoreMin: 35,
      scoreMax: 65,
    },
  },

  // =========================================================================
  // 6. MANY CLAIMS vs NONE
  // =========================================================================
  {
    name: 'Agent with Maximum Claims',
    description: 'All claim types verified — should add up to maxClaimBonus (15 points).',
    agent: makeAgent(),
    block: MID_BLOCK,
    verifications: [makeVerification()],
    claims: [
      makeClaim({ type: ClaimType.EMAIL, value: 'test@example.com' }),
      makeClaim({ type: ClaimType.DOMAIN, value: 'example.com' }),
      makeClaim({ type: ClaimType.X_ACCOUNT, value: '@test' }),
      makeClaim({ type: ClaimType.GITHUB, value: 'test' }),
      makeClaim({ type: ClaimType.NOSTR, value: 'npub1...' }),
      makeClaim({ type: ClaimType.LIGHTNING_NODE, value: 'ln_test...' }),
      makeClaim({ type: ClaimType.PGP_KEY, value: 'pgp_test...' }),
      makeClaim({ type: ClaimType.DNS_TXT, value: '_blockgenomics.example.com' }),
    ],
    expectations: {
      scoreMin: 70,
      scoreMax: 100,
    },
  },
  {
    name: 'Agent with No Claims',
    description: 'No claims — 0 bonus points. Score comes purely from on-chain data.',
    agent: makeAgent(),
    block: MID_BLOCK,
    verifications: [makeVerification()],
    claims: [],
    expectations: {
      scoreMin: 55,
      scoreMax: 85,
    },
  },

  // =========================================================================
  // 7. FRESHLY VERIFIED vs STALE
  // =========================================================================
  {
    name: 'Freshly Verified Agent (1 day ago)',
    description: 'Just verified — no time decay penalty.',
    agent: makeAgent({
      createdAt: new Date((NOW - 400 * 86400) * 1000).toISOString(),
    }),
    block: MID_BLOCK,
    verifications: [
      makeVerification({
        createdAt: new Date((NOW - 1 * 86400) * 1000).toISOString(),
      }),
    ],
    claims: [],
    expectations: {
      scoreMin: 60,
      scoreMax: 90,
    },
  },
  {
    name: 'Stale Verification (200 days ago)',
    description: 'Well past the 90-day grace period — time decay applies.',
    agent: makeAgent({
      createdAt: new Date((NOW - 400 * 86400) * 1000).toISOString(),
    }),
    block: MID_BLOCK,
    verifications: [
      makeVerification({
        createdAt: new Date((NOW - 200 * 86400) * 1000).toISOString(),
      }),
    ],
    claims: [],
    expectations: {
      scoreMin: 45,
      scoreMax: 80,
    },
  },
  {
    name: 'Very Stale Verification (500 days ago)',
    description: 'Extremely old verification — maximum decay penalty.',
    agent: makeAgent({
      createdAt: new Date((NOW - 600 * 86400) * 1000).toISOString(),
    }),
    block: MID_BLOCK,
    verifications: [
      makeVerification({
        createdAt: new Date((NOW - 500 * 86400) * 1000).toISOString(),
      }),
    ],
    claims: [],
    expectations: {
      scoreMin: 35,
      scoreMax: 70,
    },
  },

  // =========================================================================
  // 8. EDGE CASES
  // =========================================================================
  {
    name: 'No Verifications At All',
    description: 'Agent exists but has never been verified — maximum decay, low history.',
    agent: makeAgent({ verified: false, verifiedAt: undefined }),
    block: MID_BLOCK,
    verifications: [],
    claims: [],
    expectations: {
      scoreMin: 15,
      scoreMax: 55,
    },
  },
  {
    name: 'Early Block (Block 170 — First BTC Transaction)',
    description: 'Historical block with low difficulty and few txs, but maximum age.',
    agent: makeAgent({
      blockHeight: 170,
      blockHash: EARLY_BLOCK.hash,
    }),
    block: EARLY_BLOCK,
    verifications: [makeVerification({ blockHeight: 170 })],
    claims: [],
    expectations: {
      scoreMin: 45,
      scoreMax: 75,
    },
  },
  {
    name: 'Verification Burst Anomaly',
    description: '3 verifications within 1 hour — should flag VERIFICATION_BURST.',
    agent: makeAgent(),
    block: MID_BLOCK,
    verifications: [
      makeVerification({
        id: 'ver_burst_1',
        createdAt: new Date((NOW - 3600) * 1000).toISOString(),
      }),
      makeVerification({
        id: 'ver_burst_2',
        createdAt: new Date((NOW - 1800) * 1000).toISOString(),
      }),
      makeVerification({
        id: 'ver_burst_3',
        createdAt: new Date((NOW - 600) * 1000).toISOString(),
      }),
    ],
    claims: [],
    expectations: {
      scoreMin: 55,
      scoreMax: 90,
      anomalyCodes: ['VERIFICATION_BURST'],
    },
  },

  // =========================================================================
  // 9. DETERMINISM TEST
  // =========================================================================
  {
    name: 'Determinism — Identical inputs produce identical output',
    description: 'Running the same inputs through the engine twice must produce the exact same score.',
    agent: makeAgent(),
    block: MID_BLOCK,
    verifications: [makeVerification()],
    claims: [makeClaim()],
    expectations: {
      scoreMin: 60,
      scoreMax: 95,
    },
  },
];

// =============================================================================
// RUN TESTS
// =============================================================================

function runTests(): void {
  const engine = new TrustScoreEngine(TEST_CONFIG);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Block Genomics — Trust Score Engine Test Suite');
  console.log(`  Engine version: ${engine.config.nowTimestamp ? 'deterministic' : 'live'}`);
  console.log(`  Fixed timestamp: ${new Date(NOW * 1000).toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = engine.calculateScore(
      tc.agent,
      tc.block,
      tc.verifications,
      tc.claims,
    );

    const scoreOk =
      result.score >= tc.expectations.scoreMin &&
      result.score <= tc.expectations.scoreMax;

    const tierOk = tc.expectations.tier
      ? result.tier === tc.expectations.tier
      : true;

    const flaggedOk = tc.expectations.flagged !== undefined
      ? result.flagged === tc.expectations.flagged
      : true;

    const anomalyOk = tc.expectations.anomalyCodes
      ? tc.expectations.anomalyCodes.every((code) =>
          result.anomalies.some((a) => a.code === code),
        )
      : true;

    const allOk = scoreOk && tierOk && flaggedOk && anomalyOk;

    if (allOk) {
      passed++;
      console.log(`  ✅ ${tc.name}`);
    } else {
      failed++;
      console.log(`  ❌ ${tc.name}`);
    }

    console.log(`     Score: ${result.score} (expected: ${tc.expectations.scoreMin}-${tc.expectations.scoreMax})`);
    console.log(`     Tier: ${result.tier} | Multiplier: ${result.tierMultiplier}x`);
    console.log(`     Components: age=${result.components.age.raw}, richness=${result.components.richness.raw}, security=${result.components.security.raw}, ownership=${result.components.ownership.raw}, history=${result.components.history.raw}`);
    console.log(`     Raw: ${result.rawTotal} → ×${result.tierMultiplier} = ${result.multipliedTotal} → -${result.decayPenalty} decay → +${result.claimBonusTotal} claims = ${result.score}`);

    if (result.anomalies.length > 0) {
      console.log(`     Anomalies: ${result.anomalies.map((a) => `${a.code}(${a.severity})`).join(', ')}`);
    }

    if (!scoreOk) {
      console.log(`     ⚠️  Score ${result.score} outside expected range [${tc.expectations.scoreMin}, ${tc.expectations.scoreMax}]`);
    }
    if (!anomalyOk) {
      console.log(`     ⚠️  Expected anomalies: ${tc.expectations.anomalyCodes?.join(', ')}, got: ${result.anomalies.map((a) => a.code).join(', ') || 'none'}`);
    }

    console.log('');
  }

  // --- Determinism check ---
  console.log('  ───── Determinism Verification ─────');
  const deterministicAgent = makeAgent();
  const deterministicBlock = MID_BLOCK;
  const deterministicVerifications = [makeVerification()];
  const deterministicClaims = [makeClaim()];

  const run1 = engine.calculateScore(deterministicAgent, deterministicBlock, deterministicVerifications, deterministicClaims);
  const run2 = engine.calculateScore(deterministicAgent, deterministicBlock, deterministicVerifications, deterministicClaims);

  if (run1.score === run2.score &&
      run1.rawTotal === run2.rawTotal &&
      run1.multipliedTotal === run2.multipliedTotal &&
      run1.decayPenalty === run2.decayPenalty) {
    passed++;
    console.log(`  ✅ Determinism: Run 1 score = ${run1.score}, Run 2 score = ${run2.score} (identical)\n`);
  } else {
    failed++;
    console.log(`  ❌ Determinism FAILED: Run 1 = ${run1.score}, Run 2 = ${run2.score}\n`);
  }

  // --- Tier ordering check ---
  console.log('  ───── Tier Ordering Verification ─────');
  const t1 = engine.calculateScore(makeAgent({ tier: Tier.TIER_1 }), MID_BLOCK, [makeVerification()], []);
  const t2 = engine.calculateScore(makeAgent({ tier: Tier.TIER_2 }), MID_BLOCK, [makeVerification()], []);
  const t3 = engine.calculateScore(makeAgent({ tier: Tier.TIER_3 }), MID_BLOCK, [makeVerification()], []);

  if (t1.score >= t2.score && t2.score >= t3.score) {
    passed++;
    console.log(`  ✅ Tier ordering: T1(${t1.score}) ≥ T2(${t2.score}) ≥ T3(${t3.score})\n`);
  } else {
    failed++;
    console.log(`  ❌ Tier ordering FAILED: T1(${t1.score}), T2(${t2.score}), T3(${t3.score})\n`);
  }

  // --- Claim bonus effect check ---
  console.log('  ───── Claim Bonus Effect Verification ─────');
  const noClaims = engine.calculateScore(makeAgent(), MID_BLOCK, [makeVerification()], []);
  const withClaims = engine.calculateScore(makeAgent(), MID_BLOCK, [makeVerification()], [
    makeClaim({ type: ClaimType.DOMAIN, value: 'test.com' }),
    makeClaim({ type: ClaimType.X_ACCOUNT, value: '@test' }),
    makeClaim({ type: ClaimType.GITHUB, value: 'test' }),
  ]);

  if (withClaims.score >= noClaims.score) {
    passed++;
    console.log(`  ✅ Claims add value: without=${noClaims.score}, with=${withClaims.score} (+${withClaims.score - noClaims.score})\n`);
  } else {
    failed++;
    console.log(`  ❌ Claims should add value: without=${noClaims.score}, with=${withClaims.score}\n`);
  }

  // --- Summary ---
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═══════════════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run if executed directly
runTests();
