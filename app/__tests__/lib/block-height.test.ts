/**
 * The shared block-height validator.
 *
 * Two live defects motivated it, and both are pinned here:
 *
 *   `bg_block(99999999999)` answered 500. `Block.height` is a Postgres `integer`,
 *   so an out-of-range height reached the driver and raised a range error the
 *   route reported as an internal failure. Every height-taking endpoint was one
 *   query param away from a 500.
 *
 *   `bg_ownership_verify(0)` answered 400 "positive integer required" while
 *   `bg_block(0)` answered 200 with the genesis block — the same height being
 *   valid and invalid depending on which endpoint was asked.
 */

import {
  INVALID_BLOCK_HEIGHT_MESSAGE,
  MAX_BLOCK_HEIGHT,
  isValidBlockHeight,
  parseBlockHeight,
} from '@/lib/block-height';

describe('parseBlockHeight', () => {
  it('accepts zero — genesis is a real, ownable block', () => {
    expect(parseBlockHeight('0')).toBe(0);
  });

  it('accepts ordinary and boundary heights', () => {
    expect(parseBlockHeight('840000')).toBe(840000);
    expect(parseBlockHeight(String(MAX_BLOCK_HEIGHT))).toBe(MAX_BLOCK_HEIGHT);
    expect(parseBlockHeight(' 935550 ')).toBe(935550);
  });

  it('rejects heights past the int4 column the height is stored in', () => {
    expect(parseBlockHeight('99999999999')).toBeNull();
    expect(parseBlockHeight(String(MAX_BLOCK_HEIGHT + 1))).toBeNull();
  });

  it.each([
    ['negative', '-1'],
    ['empty', ''],
    ['not a number', 'abc'],
    // parseInt would read this as 840000 and quietly serve a different block.
    ['trailing junk', '840000junk'],
    ['exponent', '9e99'],
    ['decimal', '840000.5'],
    ['plus sign', '+840000'],
    ['hex', '0x1'],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, raw) => {
    expect(parseBlockHeight(raw as string | null | undefined)).toBeNull();
  });
});

describe('isValidBlockHeight', () => {
  it('accepts zero and rejects out-of-range or non-integer values', () => {
    expect(isValidBlockHeight(0)).toBe(true);
    expect(isValidBlockHeight(840000)).toBe(true);
    expect(isValidBlockHeight(MAX_BLOCK_HEIGHT + 1)).toBe(false);
    expect(isValidBlockHeight(-1)).toBe(false);
    expect(isValidBlockHeight(1.5)).toBe(false);
    expect(isValidBlockHeight('840000')).toBe(false);
  });
});

describe('the rejection message', () => {
  it('names the accepted range instead of saying "positive integer"', () => {
    expect(INVALID_BLOCK_HEIGHT_MESSAGE).toContain('0');
    expect(INVALID_BLOCK_HEIGHT_MESSAGE).toContain(String(MAX_BLOCK_HEIGHT));
    expect(INVALID_BLOCK_HEIGHT_MESSAGE).not.toContain('positive');
  });
});
