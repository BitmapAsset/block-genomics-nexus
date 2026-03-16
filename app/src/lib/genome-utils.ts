import { createHash, randomBytes } from 'crypto';

/**
 * Format bytes to human readable (e.g., "1.2 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

/**
 * Format block weight in weight units (WU).
 */
export function formatWeight(weight: number): string {
  if (weight >= 1000000) return `${(weight / 1000000).toFixed(2)} MWU`;
  if (weight >= 1000) return `${(weight / 1000).toFixed(1)} kWU`;
  return `${weight} WU`;
}

/**
 * Parse genome sequence into trait descriptors.
 */
export function parseGenomeTraits(genome: string): Record<string, string> {
  const traits = [
    { name: 'Entropy', offset: 0 },
    { name: 'Density', offset: 8 },
    { name: 'Symmetry', offset: 16 },
    { name: 'Complexity', offset: 24 },
    { name: 'Resonance', offset: 32 },
    { name: 'Stability', offset: 40 },
    { name: 'Volatility', offset: 48 },
    { name: 'Harmony', offset: 56 },
  ];

  const result: Record<string, string> = {};
  for (const t of traits) {
    const val = parseInt(genome.slice(t.offset, t.offset + 8), 16) / 0xffffffff;
    const pct = Math.round(val * 100);
    result[t.name] = `${pct}%`;
  }
  return result;
}

/**
 * Truncate a hash for display.
 */
export function truncateHash(hash: string, len = 8): string {
  if (hash.length <= len * 2 + 3) return hash;
  return `${hash.slice(0, len)}...${hash.slice(-len)}`;
}

/**
 * Format a number with commas.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Convert a 2-char hex pair to a CSS color.
 */
export function hexPairToColor(pair: string): string {
  const val = parseInt(pair, 16);
  const hue = (val / 255) * 360;
  return `hsl(${hue}, 80%, 55%)`;
}

/**
 * Return a Tailwind-compatible class for a DNA base color.
 */
export function dnaBaseColor(base: string): string {
  const map: Record<string, string> = {
    A: 'text-green-400',
    T: 'text-red-400',
    C: 'text-blue-400',
    G: 'text-yellow-400',
  };
  return map[base] || 'text-gray-400';
}

/**
 * Return a hex color for a DNA base.
 */
export function dnaBaseHex(base: string): string {
  const map: Record<string, string> = {
    A: '#4ade80', T: '#f87171', C: '#60a5fa', G: '#facc15',
  };
  return map[base] || '#888';
}

/**
 * Convert a genome hex sequence to a DNA base string (A/T/C/G).
 */
export function genomeToDNA(genome: string): string {
  const bases = ['A', 'T', 'C', 'G'];
  let dna = '';
  for (let i = 0; i < genome.length; i++) {
    const val = parseInt(genome[i], 16);
    dna += bases[val % 4];
  }
  return dna;
}

/**
 * Generate an array of color objects from a 64-char genome sequence.
 */
export function genomeToColors(genome: string): Array<{ hex: string }> {
  const colors: Array<{ hex: string }> = [];
  for (let i = 0; i < 64; i += 2) {
    colors.push({ hex: hexPairToColor(genome.slice(i, i + 2)) });
  }
  return colors;
}

/**
 * Format a Unix timestamp to a readable date string.
 */
export function formatBlockTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Format a Unix timestamp to relative time (e.g., "3 years ago").
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp * 1000;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Generate a deterministic genome from a block hash.
 * Same block hash always produces the same genome.
 */
export function generateGenome(blockHash: string): { sequence: string; integrity: number; complexity: number; signature: string } {
  const sequence = createHash('sha256')
    .update(`block-genomics:${blockHash}`)
    .digest('hex');

  const integrity = parseInt(sequence.slice(0, 8), 16) / 0xffffffff;
  const complexity = parseInt(sequence.slice(8, 16), 16) / 0xffffffff;
  const signature = createHash('sha256')
    .update(`sig:${sequence}`)
    .digest('hex');

  return { sequence, integrity, complexity, signature };
}

/**
 * Generate visual data (DNA strand segments) from a genome sequence.
 */
interface GenomeSegment {
  position: number;
  nucleotide: 'A' | 'T' | 'C' | 'G';
  color: string;
  strength: number;
  pair: 'A' | 'T' | 'C' | 'G';
}

export function genomeToVisual(sequence: string): GenomeSegment[] {
  const nucleotides = ['A', 'T', 'C', 'G'] as const;
  const segments = [];

  for (let i = 0; i < 64; i += 4) {
    const hex = sequence.slice(i, i + 4);
    const val = parseInt(hex, 16);
    segments.push({
      position: i / 4,
      nucleotide: nucleotides[val % 4],
      color: `#${sequence.slice(i, i + 6)}`,
      strength: (val % 100) / 100,
      pair: nucleotides[(val + 2) % 4],
    });
  }

  return segments;
}

/**
 * Generate a verification challenge nonce + message.
 */
export function createChallenge(blockHeight: number, blockHash: string): { nonce: string; timestamp: number; message: string } {
  const nonce = randomBytes(16).toString('hex');
  const timestamp = Date.now();
  const message = `Block Genomics Verification\nBlock: ${blockHeight}\nHash: ${blockHash}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

  return { nonce, timestamp, message };
}

/**
 * Calculate trust score from verification history.
 */
export function calculateTrustScore(
  totalVerifications: number,
  successfulVerifications: number,
  failedVerifications: number,
): number {
  if (totalVerifications === 0) return 0;
  const successRate = successfulVerifications / totalVerifications;
  const volumeBonus = Math.min(totalVerifications / 10, 1) * 20;
  const reliabilityScore = successRate * 80;
  return Math.round(reliabilityScore + volumeBonus);
}
