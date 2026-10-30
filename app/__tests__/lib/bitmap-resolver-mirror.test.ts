/**
 * The ownership gate runs the bitmap resolver from a committed mirror
 * (src/vendor/bitmap-resolver), because the app's build context may not contain
 * packages/. This keeps the mirror byte-identical to the package, so a rule
 * change in the package cannot silently stay out of the gate.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

describe('bitmap-resolver mirror', () => {
  it('matches packages/bitmap-resolver/src', () => {
    const script = path.join(__dirname, '..', '..', 'scripts', 'sync-bitmap-resolver.mjs');
    const out = execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
    expect(out).toMatch(/mirror matches|nothing to compare/);
  });

  it('exposes the rule id the deed module reports', async () => {
    const { RULE_ID } = await import('@/vendor/bitmap-resolver');
    const { DEED_RULE_ID } = await import('@/lib/onchain/deed');
    expect(DEED_RULE_ID).toBe(RULE_ID);
    expect(RULE_ID).toMatch(/^liveoci-/);
  });
});
