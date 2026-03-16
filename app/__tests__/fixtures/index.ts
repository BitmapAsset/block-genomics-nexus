/**
 * Test fixtures for Block Genomics test suite
 */

// ── Valid Bitcoin addresses (various formats) ──
export const VALID_ADDRESSES = {
  // Native SegWit (P2WPKH) - bc1q...
  segwit: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  // Taproot (P2TR) - bc1p...
  taproot: 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
  // Legacy (P2PKH) - 1...
  legacy: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  // P2SH (multisig) - 3...
  p2sh: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
};

// ── Invalid addresses ──
export const INVALID_ADDRESSES = [
  '',
  'not-an-address',
  '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28', // Ethereum
  'bc1invalid',
  '2N3oefVeg6stiTb5Kh3ozCRPPqRSmo', // testnet
  'bc1q', // too short
  '<script>alert("xss")</script>',
  'bc1' + 'a'.repeat(100), // too long
];

// ── Mock block data ──
export const MOCK_BLOCK_HASH = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
export const MOCK_BLOCK_HEIGHT = 840000;
export const MOCK_BLOCK_TIMESTAMP = 1713571200;

// ── Genome fixtures ──
export const MOCK_GENOME_64 = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
export const ZERO_GENOME = '0'.repeat(64);
export const MAX_GENOME = 'f'.repeat(64);

// ── Mock signatures ──
export const MOCK_SIGNATURE = 'AkgwRQIhAIsxMqGlhA1f3MkG2bLPWBk94O3k/B8k7wfm1TzxN+1GAiAoJpZ3MvLHQKhZ3e29eOV8n7R9B8k7wfm1TzxN+1G==';
export const EMPTY_SIGNATURE = '';
export const INVALID_SIGNATURE = 'not-a-valid-signature';

// ── Mock challenge data ──
export const MOCK_NONCE = 'a'.repeat(64);
export const MOCK_CHALLENGE_MESSAGE = `Block Genomics verification: ${MOCK_NONCE}`;

// ── Mock transactions ──
export const MOCK_TRANSACTIONS = [
  { index: 0, vbytes: 250 },   // coinbase
  { index: 1, vbytes: 500 },   // standard
  { index: 2, vbytes: 1200 },  // medium
  { index: 3, vbytes: 5000 },  // large
  { index: 4, vbytes: 140 },   // minimum
];

// ── Agent fixtures ──
export const MOCK_AGENT = {
  id: 'agent-test-123',
  walletAddress: VALID_ADDRESSES.segwit,
  endpointUrl: 'https://agent.example.com/api',
  blockHeight: MOCK_BLOCK_HEIGHT,
  parcelIndex: null,
  tier: 1,
  permissions: ['READ_DMS', 'SEND_DMS'],
  status: 'active' as const,
};

// ── Guardian fixtures ──
export const MOCK_GUARDIAN = {
  id: 'guardian-test-456',
  name: 'Test Guardian',
  llmProvider: 'openai',
  llmModel: 'gpt-4o-mini',
  llmApiKey: 'sk-test-key-12345',
  llmEndpoint: null,
  selfHosted: false,
  agentEndpoint: null,
};

// ── Game state fixtures ──
export const MOCK_GAME_STATE_EMPTY = {
  score: 0,
  xp: 0,
  coins: 0,
  collected: null,
  achievements: null,
  totalTimeMs: 0,
};

export const MOCK_GAME_STATE_ADVANCED = {
  score: 1500,
  xp: 600,
  coins: 120,
  collected: JSON.stringify(Array.from({ length: 15 }, (_, i) => `item-${i}`)),
  achievements: JSON.stringify(['first_collect', 'collector_10']),
  totalTimeMs: 900000, // 15 minutes
};

// ── Game element fixtures ──
export const MOCK_GAME_ELEMENTS = {
  coin: {
    id: 'elem-coin-1',
    triggerType: 'proximity',
    triggerRadius: 2,
    posX: 10,
    posY: 0,
    posZ: 10,
    triggerData: null,
    rewardType: 'points',
    rewardAmount: 10,
    rewardData: null,
  },
  chest: {
    id: 'elem-chest-1',
    triggerType: 'click',
    triggerRadius: 3,
    posX: 20,
    posY: 0,
    posZ: 20,
    triggerData: null,
    rewardType: 'item',
    rewardAmount: 1,
    rewardData: null,
  },
  scoreZone: {
    id: 'elem-score-1',
    triggerType: 'score_threshold',
    triggerRadius: 5,
    posX: 0,
    posY: 0,
    posZ: 0,
    triggerData: JSON.stringify({ scoreNeeded: 100 }),
    rewardType: 'points',
    rewardAmount: 50,
    rewardData: null,
  },
};

// ── LLM config fixtures ──
export const MOCK_LLM_CONFIG = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: 'sk-test-key',
  systemPrompt: 'You are a test assistant.',
  messages: [{ role: 'user', content: 'Hello' }],
  guardianId: 'guardian-1',
};
