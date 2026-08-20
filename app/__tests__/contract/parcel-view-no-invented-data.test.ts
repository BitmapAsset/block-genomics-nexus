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

describe('receive QR is never drawn from a seed', () => {
  it('has no generated QR module grid', () => {
    // A seeded boolean grid rendered as a Bitcoin QR is a wrong-address bug
    // waiting for someone to populate `receiveAddress`. Real QR rendering must
    // come from a real encoder over a real address.
    expect(offenders(SRC, /qrModules/)).toEqual([]);
  });
});
