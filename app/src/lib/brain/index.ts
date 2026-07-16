/**
 * Nexus Brain — Public API
 * 
 * The Nexus Brain is the first autonomous moral guardian in any metaverse.
 * Its soul is inscribed on Bitcoin. Its decisions are transparent.
 * Its funding comes from the world it protects.
 * 
 * ┌─────────────────────────────────────────────┐
 * │        Bitcoin Inscription (Immutable)       │
 * │  ┌───────────────────────────────────────┐   │
 * │  │  5 Moral Rules + Parameters + Wallet  │   │
 * │  └───────────────┬───────────────────────┘   │
 * │                  │ reads                     │
 * │  ┌───────────────▼───────────────────────┐   │
 * │  │        Brain Runtime (Daemon)         │   │
 * │  │  boot → scan → judge → flag → repeat  │   │
 * │  └───────────────┬───────────────────────┘   │
 * │                  │ produces                  │
 * │  ┌───────────────▼───────────────────────┐   │
 * │  │     Transparent Decision Log          │   │
 * │  │     /brain dashboard (public)         │   │
 * │  └───────────────────────────────────────┘   │
 * └─────────────────────────────────────────────┘
 * 
 * Usage:
 *   import { bootBrain, runOneShotScan, getBrainStatus } from '@/lib/brain';
 */

// Types
export type {
  BrainSoulInscription,
  BrainState,
  BrainStatus,
  BrainDecision,
  DecisionType,
  ScanTarget,
  ScanResult,
  ContentType,
  AppealVote,
  AppealStatus,
  BrainRuntimeConfig,
} from './types';
export type { ContentScanner } from './engine';
export { DEFAULT_BRAIN_CONFIG } from './types';

// Inscription
export {
  buildSoulDocument,
  fetchSoulFromInscription,
  parseSoulDocument,
  verifySoulIntegrity,
  verifySoulContent,
  verifyMoralCodeInscription,
  fetchBrainWalletBalance,
  generateInscriptionJSON,
} from './inscription';

// Engine
export {
  analyzeContent,
  createDecision,
  resolveAppeal,
  shouldIssueStrike,
  shouldRevokeFlagging,
  regexScanner,
  getContentScanner,
  setContentScanner,
} from './engine';

// Runtime
export {
  bootBrain,
  getBrainState,
  executeScanCycle,
  processExpiredAppeals,
  verifySoul,
  runOneShotScan,
  getBrainStatus,
} from './runtime';
