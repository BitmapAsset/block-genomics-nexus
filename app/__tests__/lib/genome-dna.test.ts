/**
 * The browser genome must equal the server genome, byte for byte: My Bitmaps
 * reveals it right after a verification, and the server stores the same value
 * in BlockProfile.genomeHash (and the CLI prints it).
 */

import { deriveGenomeHash, parseGenomeTraits, genomeToDNA } from '@/lib/genome-utils';
import { genomeV1, genomeV1Formula, genomeBases, genomeHues, genomeTraits } from '@/lib/genome-dna';

const W = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';

describe('genomeV1', () => {
  it.each([
    [0, W],
    [720143, W],
    [840000, 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'],
    [969788, '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'],
  ])('matches the server derivation for block %i', (height, addr) => {
    expect(genomeV1(height, addr)).toBe(deriveGenomeHash(height, addr));
  });

  it('is a 0x-prefixed 64-hex value', () => {
    expect(genomeV1(1, W)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('changes with the owner: the genome is the block in this wallet', () => {
    expect(genomeV1(720143, W)).not.toBe(genomeV1(720143, 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'));
  });

  it('documents the exact input it hashes', () => {
    expect(genomeV1Formula(720143, W)).toBe(`sha256("block-genomics:genome:v1:720143:${W}")`);
  });
});

describe('DNA presentation', () => {
  const g = genomeV1(720143, W);

  it('maps 64 hex digits to 64 bases, the same way the server does', () => {
    expect(genomeBases(g)).toHaveLength(64);
    expect(genomeBases(g).join('')).toBe(genomeToDNA(g.slice(2)));
  });

  it('gives one integer hue per byte', () => {
    const hues = genomeHues(g);
    expect(hues).toHaveLength(32);
    expect(hues.every((h) => Number.isInteger(h) && h >= 0 && h <= 360)).toBe(true);
  });

  it('derives the same eight traits as the server helper', () => {
    const server = parseGenomeTraits(g.slice(2));
    const client = genomeTraits(g);
    expect(client.map((t) => t.name)).toEqual(Object.keys(server));
    for (const t of client) expect(`${t.value}%`).toBe(server[t.name]);
  });
});
