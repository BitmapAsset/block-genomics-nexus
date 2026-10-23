/**
 * Lightning "Pay" and "Zap" stay hidden until purchase is wired (bg48 Q-06).
 *
 * The /rentals "⚡ Pay Lightning" button charged the platform's ZBD account
 * while delegation purchase is still a 503, and "⚡ Zap Sats" paid the platform,
 * not the agent owner; nothing was granted or recorded. Both buttons now render
 * only behind LIGHTNING_PAY_ENABLED, which is off unless the build sets
 * NEXT_PUBLIC_LIGHTNING_PAY_ENABLED=true.
 */

import fs from 'fs';
import path from 'path';

const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');

function flagValue(env: string | undefined): boolean {
  const saved = process.env.NEXT_PUBLIC_LIGHTNING_PAY_ENABLED;
  if (env === undefined) delete process.env.NEXT_PUBLIC_LIGHTNING_PAY_ENABLED;
  else process.env.NEXT_PUBLIC_LIGHTNING_PAY_ENABLED = env;
  let value = true;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    value = require('@/lib/lightning-pay-flag').LIGHTNING_PAY_ENABLED;
  });
  if (saved === undefined) delete process.env.NEXT_PUBLIC_LIGHTNING_PAY_ENABLED;
  else process.env.NEXT_PUBLIC_LIGHTNING_PAY_ENABLED = saved;
  return value;
}

/** True when the <button> that renders `label` is wrapped directly by `{LIGHTNING_PAY_ENABLED && (`. */
function buttonIsGated(source: string, label: string): boolean {
  const at = source.indexOf(label);
  if (at === -1) return false;
  const button = source.lastIndexOf('<button', at);
  const gate = source.lastIndexOf('{LIGHTNING_PAY_ENABLED && (', button);
  return gate !== -1 && source.slice(gate + '{LIGHTNING_PAY_ENABLED && ('.length, button).trim() === '';
}

describe('Lightning Pay / Zap UI flag', () => {
  it('is off by default and only an explicit "true" turns it on', () => {
    expect(flagValue(undefined)).toBe(false);
    expect(flagValue('1')).toBe(false);
    expect(flagValue('true')).toBe(true);
  });

  it('gates the /rentals "Pay Lightning" button', () => {
    expect(buttonIsGated(src('app/(site)/rentals/page.tsx'), '⚡ Pay Lightning')).toBe(true);
  });

  it('gates the agent profile "Zap Sats" button', () => {
    expect(buttonIsGated(src('app/(site)/agent/[handle]/agent-profile-client.tsx'), '⚡ Zap Sats')).toBe(true);
  });
});
