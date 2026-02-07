/**
 * Genome Visualization Utilities
 *
 * Shared between block and agent profile pages.
 * Mirrors the engine's algorithms for DNA and color generation.
 */

// ─── DNA Sequence ──────────────────────────────────────────────────────────

const BASE_MAP: Record<string, string> = {
  '00': 'A',
  '01': 'T',
  '10': 'G',
  '11': 'C',
};

/**
 * Convert a 64-char hex genome to a 128-char ATGC DNA sequence.
 *
 * Algorithm: each hex char → 4 bits → 2 bases
 *   bits 00 → A, 01 → T, 10 → G, 11 → C
 *
 * 64 hex × 4 bits = 256 bits → 128 bases.
 */
export function genomeToDNA(genome: string): string {
  let dna = '';
  for (const hexChar of genome) {
    const nibble = parseInt(hexChar, 16);
    const bits = nibble.toString(2).padStart(4, '0');
    dna += BASE_MAP[bits.slice(0, 2)]!;
    dna += BASE_MAP[bits.slice(2, 4)]!;
  }
  return dna;
}

// ─── Colors ────────────────────────────────────────────────────────────────

export interface GenomeColor {
  r: number;
  g: number;
  b: number;
  hex: string;
}

/**
 * Derive 64 colors from a 64-char hex genome.
 *
 * Uses the same algorithm as the engine module:
 * - Parse hex into 32 bytes
 * - Generate 64 colors by cycling through bytes
 * - Hue from byte value, S/L vary by position
 */
export function genomeToColors(genome: string): GenomeColor[] {
  const colors: GenomeColor[] = [];
  const bytes: number[] = [];

  for (let i = 0; i < 64; i += 2) {
    bytes.push(parseInt(genome.slice(i, i + 2), 16));
  }

  for (let i = 0; i < 64; i++) {
    const byteIdx = i % 32;
    const byteVal = bytes[byteIdx]!;

    const hue = (byteVal / 255) * 360;
    const saturation = 55 + (((i * 7) % 32) / 32) * 40;   // 55–95%
    const lightness = 35 + (((i * 13) % 32) / 32) * 35;   // 35–70%

    const { r, g, b } = hslToRgb(hue, saturation, lightness);
    colors.push({ r, g, b, hex: rgbToHex(r, g, b) });
  }

  return colors;
}

/**
 * Get an HSL color string from a 2-char hex pair (for per-character coloring).
 */
export function hexPairToColor(pair: string): string {
  const val = parseInt(pair, 16);
  const hue = (val / 255) * 360;
  return `hsl(${hue}, 75%, 55%)`;
}

// ─── Formatting ────────────────────────────────────────────────────────────

/**
 * Format a Unix timestamp to human-readable date/time string.
 */
export function formatBlockTime(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Format a Unix timestamp to a relative time string (e.g., "3 hours ago").
 */
export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}

/**
 * Truncate a hex hash for display, e.g. "a1b2c3d4…e5f6g7h8"
 */
export function truncateHash(hash: string, len = 8): string {
  if (hash.length <= len * 2 + 1) return hash;
  return `${hash.slice(0, len)}…${hash.slice(-len)}`;
}

/**
 * Format byte size to human readable (KB, MB, etc.)
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format a number with commas.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Format weight units.
 */
export function formatWeight(wu: number): string {
  if (wu < 1_000_000) return `${formatNumber(wu)} WU`;
  return `${(wu / 1_000_000).toFixed(2)} MWU`;
}

/**
 * Parse genome into 8 trait segments.
 */
export function parseGenomeTraits(genome: string): Record<string, string> {
  if (genome.length !== 64) return {};
  return {
    structure:  genome.slice(0, 8),
    energy:     genome.slice(8, 16),
    complexity: genome.slice(16, 24),
    resilience: genome.slice(24, 32),
    temporal:   genome.slice(32, 40),
    network:    genome.slice(40, 48),
    entropy:    genome.slice(48, 56),
    signature:  genome.slice(56, 64),
  };
}

/**
 * Get DNA base color class.
 */
export function dnaBaseColor(base: string): string {
  switch (base) {
    case 'A': return 'text-green-400';
    case 'T': return 'text-red-400';
    case 'G': return 'text-blue-400';
    case 'C': return 'text-yellow-400';
    default:  return 'text-text-muted';
  }
}

// ─── HSL ↔ RGB ─────────────────────────────────────────────────────────────

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;

  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60)       { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else              { r1 = c; b1 = x; }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => v.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
