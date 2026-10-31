/**
 * @jest-environment jsdom
 *
 * The embeddable badge (`sdk/embed.js`) puts every API field into markup only
 * after escaping it: strings through esc(), numbers through a finite-number
 * check, the genome as hex only, URLs through encodeURIComponent. An agent
 * answer carrying markup in any field renders as text, never as an element or
 * attribute.
 *
 * Harness: jest + jsdom, loading the shipped file as-is.
 */

import fs from 'fs';
import path from 'path';

type Badge = { svg: (agent: Record<string, unknown>, opts?: Record<string, unknown>) => string };

const SOURCE = fs.readFileSync(path.join(__dirname, '../../../sdk/embed.js'), 'utf8');

function load(): Badge {
  new Function(SOURCE)();
  return (window as unknown as { BGB: Badge }).BGB;
}

const MARKUP = '"><img src=x onerror="window.__bgEmbedHit=1"><svg onload="window.__bgEmbedHit=1"';

const hostile = {
  id: 'agent-1',
  name: 'Agent',
  blockHeight: 840000,
  tier: MARKUP,
  trustScore: MARKUP,
  genome: MARKUP,
  trustComponents: {
    age: { score: MARKUP, max: 20 },
    richness: { score: 5, max: MARKUP },
    security: { score: 5, max: 20 },
    ownership: { score: 5, max: 20 },
    history: { score: 5, max: 20 },
  },
};

const STYLES = ['icon-only', 'minimal', 'standard', 'detailed'];

function injected(markup: string): Element[] {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return Array.from(host.querySelectorAll('img, script, foreignObject, [onerror], [onload]'));
}

describe('sdk/embed.js escapes every API field', () => {
  const bgb = load();

  it.each(STYLES)('%s: markup in tier, trustScore and genome renders as text', (style) => {
    const svg = bgb.svg(hostile, { style });
    expect(svg).not.toContain('<img');
    expect(svg).not.toContain('onerror="');
    expect(injected(svg)).toHaveLength(0);
    // Only the one outer <svg> element survives.
    const host = document.createElement('div');
    host.innerHTML = svg;
    expect(host.querySelectorAll('svg')).toHaveLength(1);
  });

  it.each(STYLES)('%s: markup in the name and in a tier label renders as text', (style) => {
    const svg = bgb.svg({ ...hostile, name: MARKUP, tier: 1, trustScore: 50, genome: 'ab'.repeat(32) }, { style });
    expect(injected(svg)).toHaveLength(0);
  });

  it('a well-formed agent still renders its numbers and genome', () => {
    const svg = bgb.svg(
      { id: 'a1', name: 'Warden', blockHeight: 840000, tier: 2, trustScore: 87, genome: 'abcdef0123456789'.repeat(4) },
      { style: 'standard' },
    );
    expect(svg).toContain('840,000');
    expect(svg).toContain('>87<');
    expect(svg).toContain('TIER 2');
    expect(svg).toContain('abcdef0123456789');
  });

  it('a non-finite trust score renders as 0', () => {
    const svg = bgb.svg({ ...hostile, trustScore: 'NaN' }, { style: 'minimal' });
    expect(svg).toContain('>0/100<');
  });
});
