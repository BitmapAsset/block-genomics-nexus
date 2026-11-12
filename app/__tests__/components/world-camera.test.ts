/**
 * The camera settles without overshoot on slow frames: the settle step's lerp factor is capped at 1, so a frame longer
 * than a third of a second lands on the target instead of passing it. At 60 fps the factor is 0.05, as before.
 */
import fs from 'fs';
import path from 'path';

const PV = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');

/** The source of one top-level function in ParcelView, up to its closing brace at column 0. */
function fnSource(name: string): string {
  const start = PV.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  return PV.slice(start, PV.indexOf('\n}\n', start));
}

describe('CameraManager settles without overshoot', () => {
  it('the settle lerp factor is capped at 1', () => {
    expect(fnSource('CameraManager')).toMatch(/camera\.position\.lerp\(targetPos\.current,\s*Math\.min\(/);
  });
});
