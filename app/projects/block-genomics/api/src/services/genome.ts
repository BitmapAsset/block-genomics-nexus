import type { Genome } from '../types/index.js';

/**
 * Generate a unique genome from a bitmap ID
 * TODO: Implement actual genome generation algorithm
 */
export function generateGenome(bitmapId: number): Omit<Genome, 'id' | 'registration_id' | 'generated_at'> {
  // Placeholder: deterministic mock based on bitmap ID
  const seed = bitmapId.toString(16).padStart(8, '0');
  
  return {
    bitmap_id: bitmapId,
    dna: `BG-${seed}-${'ACGT'.repeat(16)}`, // Mock DNA string
    traits: {
      strength: (bitmapId % 100) + 1,
      intelligence: ((bitmapId * 7) % 100) + 1,
      agility: ((bitmapId * 13) % 100) + 1,
      luck: ((bitmapId * 31) % 100) + 1,
      element: ['fire', 'water', 'earth', 'air'][bitmapId % 4],
    },
    rarity: calculateRarity(bitmapId),
  };
}

/**
 * Calculate rarity score (0-100)
 * TODO: Implement actual rarity calculation
 */
function calculateRarity(bitmapId: number): number {
  // Placeholder: lower bitmap IDs are rarer
  if (bitmapId < 1000) return 95 + (bitmapId % 5);
  if (bitmapId < 10000) return 80 + (bitmapId % 15);
  if (bitmapId < 100000) return 50 + (bitmapId % 30);
  return 10 + (bitmapId % 40);
}
