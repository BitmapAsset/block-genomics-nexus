/**
 * Block Genomics — Engine
 *
 * Public API surface. Import everything from here.
 *
 * @example
 * ```ts
 * import { generateGenome, detectTraits, calculateTrustScore } from './engine';
 * ```
 *
 * @module engine
 */

// Types
export type {
  BlockData,
  Bitmap,
  BitmapResolutionResult,
  Color,
  GenomeInputs,
  GenomeResult,
  OwnershipTier,
  OwnershipVerification,
  Trait,
  TraitCategory,
  TraitDetectionResult,
  TraitRarity,
  TrustScore,
  TrustScoreBreakdown,
} from './types';

// Genome
export {
  generateGenome,
  generateDNASequence,
  genomeToColors,
  buildGenomeInputs,
  canonicalSerialise,
  GENOME_VERSION,
} from './genome';

// Traits
export { detectTraits } from './traits';

// Trust Score
export { calculateTrustScore, TRUST_SCORE_VERSION } from './trust-score';
export type { TrustScoreOptions } from './trust-score';

// Bitmap Resolver
export { resolveBitmap, verifyBitmapOwnership } from './bitmap-resolver';
