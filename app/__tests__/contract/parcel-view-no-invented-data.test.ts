/**
 * ParcelView is the surface a visitor judges the whole protocol by: it draws a
 * real block as a real place. Three fabrication classes have shipped from this
 * one file — an invented rank, an invented visitor count, and an invented
 * ownership confirmation — and each looked real precisely because it was stable
 * across reloads. Review caught the first one; nothing caught the next two.
 *
 * These are source guards rather than unit tests because the component pulls in
 * three.js and @react-three/fiber and cannot be imported by this suite. That is
 * the same trade #136 made for canonical-facts, and it holds for the same
 * reason: the failure being guarded is textual (a seeded RNG reaching a surface
 * that claims to be real), so reading the text catches it.
 */

import fs from 'fs';
import path from 'path';

const PARCEL_VIEW = path.join(__dirname, '..', '..', 'src', 'components', 'nexus', 'ParcelView.tsx');
const SRC = fs.readFileSync(PARCEL_VIEW, 'utf8');

/**
 * Offending CODE lines, numbered — so a failure names the line instead of
 * dumping 6,000 of them. Comment lines are skipped: describing a fabrication
 * that was removed is the point of the comment, and a guard that punished the
 * explanation would push the next author to delete the history instead.
 */
function offenders(text: string, re: RegExp): string[] {
  return text
    .split('\n')
    .map((line, i) => ({ n: i + 1, line: line.trim() }))
    .filter(({ line }) => !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'))
    .filter(({ line }) => re.test(line))
    .map(({ n, line }) => `${n}: ${line}`);
}

/**
 * The real-data half of `generateParcels`, delimited by the banner comments the
 * function already carries. Guarding the whole file would be wrong — the mock
 * fallback is allowed to invent, and says so.
 */
function realBlockBranch(): string {
  const start = SRC.indexOf('═══ REAL BLOCKCHAIN DATA ═══');
  const end = SRC.indexOf('═══ MOCK FALLBACK ═══');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('real-data parcel path invents nothing', () => {
  it('draws no random numbers when a real block is present', () => {
    const branch = realBlockBranch();
    expect(offenders(branch, /\brng\s*\(/)).toEqual([]);
    expect(offenders(branch, /Math\.random/)).toEqual([]);
  });

  it('does not hardcode a block subsidy that is only true for one halving epoch', () => {
    // A fixed 3.125 renders every pre-2024 coinbase at the wrong size. The
    // subsidy is a function of height; derive it.
    expect(offenders(realBlockBranch(), /3\.125/)).toEqual([]);
  });
});

describe('ownership is never fabricated', () => {
  it('has no invented owned-block set', () => {
    expect(offenders(SRC, /mockOwnedBlocks/)).toEqual([]);
  });

  it('does not hold wallet-connected state that a timer could flip', () => {
    // The removed flow ran `setTimeout(() => setWalletConnected(true), 1500)`
    // and then rendered "✅ Wallet verified". Connection state belongs to the
    // wallet context, which reflects a real extension.
    expect(offenders(SRC, /setWalletConnected/)).toEqual([]);
  });

  it('claims verification only where a live on-chain check answered', () => {
    // /api/v1/session/verify is the one path that runs BIP-322 + a live holder
    // check. Any "verified" claim in this file must be downstream of it.
    const claims = offenders(SRC, /Wallet verified|Ownership verified|verified on-chain/i);
    if (claims.length > 0) {
      expect(SRC).toContain('/api/v1/session/verify');
    }
  });
});

describe('estates are records, not local state', () => {
  it('has no mock-estate generator left to fall back to', () => {
    expect(offenders(SRC, /generateMockEstates/)).toEqual([]);
  });

  it('does not mint estate ids in the browser', () => {
    // `estate-${blockHeight}-${Date.now()}` was the tell: an id no server had
    // ever seen, for a row that did not exist. The estate lived in a useState
    // array and was gone on reload, while the UI said "✅ Estate Created!".
    expect(offenders(SRC, /`estate-\$\{/)).toEqual([]);
  });

  it('does not label the owner "you" instead of reading who owns it', () => {
    expect(offenders(SRC, /ownerHandle:\s*'you'/)).toEqual([]);
  });

  it('reads estates from the API that gates them on live ownership', () => {
    expect(SRC).toContain('/api/v1/estates/');
    expect(SRC).toContain("fetch('/api/v1/estates'");
  });
});

describe('a ₿ figure is printed only where one is known', () => {
  it('never formats a parcel value without checking it is known', () => {
    // `fee: rng() * 50000` from blockchainApi used to arrive as a real number
    // for every transaction past the first page, and this file printed it as
    // "₿ VALUE" to six decimal places.
    const printed = offenders(SRC, /value\.toFixed\(/);
    for (const line of printed) {
      expect(line).toMatch(/valueKnown/);
    }
    expect(printed.length).toBeGreaterThan(0);
  });
});

describe('block-level facts are the chain’s or nothing', () => {
  it('does not build a block hash out of the block height', () => {
    // The HASH row rendered `0000...${(blockHeight * 7919).toString(16)}` — an
    // arithmetic function of the height, formatted to look like a truncated
    // hash. Stable across reloads, which is what sold it.
    //
    // `seededRandom(blockHeight * n)` is excluded on purpose: seeding geometry,
    // layout and colour from the height is deterministic VISUAL variation, not a
    // claim about the world. The line this guards is the one that formats such a
    // number and prints it as a fact.
    const derived = offenders(SRC, /blockHeight\s*\*\s*\d+/).filter((l) => !/seededRandom\(/.test(l));
    expect(derived).toEqual([]);
    expect(offenders(SRC, /`0{4}\.\.\./)).toEqual([]);
  });

  it('does not fall back to the mock block for hash, size, or weight', () => {
    // `realBlock?.hash ?? block.hash` looks like a null-safe default and is
    // really a fabrication: `block` is `generateBlock(height)`, whose `hash` is
    // `fakeHash(height)` and whose `size` is a seeded `rng()`. The fallback also
    // made the "no hash" branch unreachable, so the honest empty state could
    // never render.
    expect(offenders(SRC, /realBlock\?\.\w+\s*\?\?\s*block\./)).toEqual([]);
  });

  it('prints each block-stat row only when the value is present', () => {
    // Every blockStats row must carry an explicit not-fetched arm; a bare
    // `blockStats.x.toLocaleString()` means x was defaulted somewhere upstream.
    const printed = offenders(SRC, /blockStats\.\w+/);
    expect(printed.length).toBeGreaterThan(0);
    for (const line of printed) {
      expect(line).toMatch(/NOT_FETCHED|!==\s*undefined|blockStats\.hash\s*\?/);
    }
  });
});

describe('receive QR is never drawn from a seed', () => {
  it('has no generated QR module grid', () => {
    // A seeded boolean grid rendered as a Bitcoin QR is a wrong-address bug
    // waiting for someone to populate `receiveAddress`. Real QR rendering must
    // come from a real encoder over a real address.
    expect(offenders(SRC, /qrModules/)).toEqual([]);
  });
});
