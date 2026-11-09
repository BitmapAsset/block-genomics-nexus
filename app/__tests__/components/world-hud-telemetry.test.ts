/**
 * Telemetry (components/nexus/hud/telemetry): the readouts are measured from the camera's own motion, frame by
 * frame, over the real frame time; nothing echoes a setting. The source-shape half reads ParcelView.tsx with the
 * TypeScript AST (as parcel-instances.test.tsx extracts components): the controllers report through `stepMotion`,
 * and no `useFrame` callback in them calls a React state setter (a bare `setX(` call; method calls such as
 * `velocity.setLength(` are three.js, not React).
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import {
  createTelemetry, figureEightLength, figureEightPoint, groundMetresPerPx, jump, resetWalk, stepMotion,
} from '@/components/nexus/hud/telemetry';

const SRC = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');
const AST = ts.createSourceFile('ParcelView.tsx', SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function fn(name: string): ts.FunctionDeclaration {
  const found = AST.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!found) throw new Error(`${name} not found in ParcelView.tsx`);
  return found;
}

function frameBodies(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useFrame' && n.arguments[0]) {
      out.push(n.arguments[0].getText(AST));
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

const BARE_SETTER = /(?<![.\w])set[A-Z]\w*\(/;
const U = 105;

/** Moves a point at `mps` along x for `seconds` at `fps`, calling stepMotion every frame. */
function run(t: ReturnType<typeof createTelemetry>, mps: number, seconds: number, fps: number, count: boolean, from = 0) {
  let x = from;
  const dt = 1 / fps;
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    x += (mps * dt) / U;
    stepMotion(t, { xUnits: x, yUnits: 100 / U, zUnits: 0, dt, count });
  }
  return x;
}

describe('telemetry: measured, never echoed', () => {
  it('a steady 20 m/s move at 60 fps for 3 s reads 72 ± 1 km/h and 100 m altitude', () => {
    const t = createTelemetry();
    run(t, 20, 3, 60, false);
    expect(Math.abs(t.speedKmh - 72)).toBeLessThanOrEqual(1);
    expect(t.altitudeM).toBeCloseTo(100, 6);
    expect(t.distanceM).toBe(0);
  });

  it('uneven frames (a stall, then quick frames) read as the distance covered over the time taken', () => {
    const t = createTelemetry();
    let x = 0;
    stepMotion(t, { xUnits: x, yUnits: 1, zUnits: 0, dt: 1 / 60, count: false });
    // A slow device: each frame moves 1 m whatever its length (Fly caps motion per frame); one 2 s stall, then 0.05 s.
    for (let i = 0; i < 10; i++) {
      x += 1 / U; stepMotion(t, { xUnits: x, yUnits: 1, zUnits: 0, dt: 2, count: false });
      x += 1 / U; stepMotion(t, { xUnits: x, yUnits: 1, zUnits: 0, dt: 0.05, count: false });
    }
    expect(t.speedKmh).toBeCloseTo((2 / 2.05) * 3.6, 6);
  });

  it('a stop reads below 1 km/h within 3 s', () => {
    const t = createTelemetry();
    const x = run(t, 20, 3, 60, false);
    run(t, 0, 3, 60, false, x);
    expect(t.speedKmh).toBeLessThan(1);
  });

  it('a jump moves the position without distance or a speed spike', () => {
    const t = createTelemetry();
    const x = run(t, 3, 3, 60, true);
    const walked = t.distanceM;
    const before = t.speedKmh;
    jump(t, x + 5, 2);
    expect(t.xM).toBeCloseTo((x + 5) * U, 6);
    expect(t.zM).toBeCloseTo(2 * U, 6);
    stepMotion(t, { xUnits: x + 5, yUnits: 1.7 / U, zUnits: 2, dt: 1 / 60, count: true });
    expect(t.distanceM).toBe(walked);
    expect(t.speedKmh).toBeLessThanOrEqual(before);
  });

  it('walk: a 3 m/s move reads 10.8 ± 0.2 km/h and adds the distance', () => {
    const t = createTelemetry();
    run(t, 3, 3, 60, true);
    expect(Math.abs(t.speedKmh - 10.8)).toBeLessThanOrEqual(0.2);
    expect(t.distanceM).toBeGreaterThan(8.8);
    expect(t.distanceM).toBeLessThanOrEqual(9.0001);
  });

  it('dt 0 (or a non-finite input) changes nothing; resetWalk starts the distance again', () => {
    const t = createTelemetry();
    run(t, 3, 1, 60, true);
    const snap = { ...t };
    stepMotion(t, { xUnits: 50, yUnits: 1, zUnits: 50, dt: 0, count: true });
    stepMotion(t, { xUnits: Number.NaN, yUnits: 1, zUnits: 50, dt: 0.1, count: true });
    expect(t).toEqual(snap);
    resetWalk(t);
    expect(t.distanceM).toBe(0);
    expect(t.speedKmh).toBe(0);
  });

  it('ground metres per pixel: 105 m per unit × 2 × distance × tan(fov/2) / height; null when not looking down', () => {
    expect(groundMetresPerPx(1, -1, 90, 210)).toBeCloseTo(1, 10);
    expect(groundMetresPerPx(100 / U, -Math.SQRT1_2, 50, 900)).toBeCloseTo((2 * 100 * Math.SQRT2 * Math.tan((25 * Math.PI) / 180)) / 900, 10);
    expect(groundMetresPerPx(1, 0, 50, 900)).toBeNull();
    expect(groundMetresPerPx(1, -0.04, 50, 900)).toBeNull();
    expect(groundMetresPerPx(1, -0.5, 50, 0)).toBeNull();
    expect(groundMetresPerPx(Number.NaN, -0.5, 50, 900)).toBeNull();
  });

  it('the tour loop length (512 samples) matches a fine numeric reference', () => {
    const r = 20 * 0.6;
    let ref = 0;
    let [px, pz] = figureEightPoint(r, 0);
    const N = 200_000;
    for (let i = 1; i <= N; i++) {
      const [x, z] = figureEightPoint(r, (i / N) * Math.PI * 2);
      ref += Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
    }
    expect(Math.abs(figureEightLength(r, 512) - ref) / ref).toBeLessThan(1e-4);
    // ParcelView's tour path uses the same curve.
    expect(SRC).toContain('const scale = 1 / (1 + Math.sin(t) * Math.sin(t) * 0.3);');
  });
});

describe('telemetry: source shape', () => {
  it('no useFrame callback in the controllers or the mini-map calls a React state setter', () => {
    for (const name of ['FlyoverController', 'StreetWalker', 'MiniMap']) {
      const bodies = frameBodies(fn(name));
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) expect(`${name}: ${BARE_SETTER.test(body)}`).toBe(`${name}: false`);
    }
    expect(fn('MiniMap').getText(AST)).not.toMatch(/useState/);
  });

  it('both controllers report the camera through stepMotion; warps and spawns use jump', () => {
    const fly = frameBodies(fn('FlyoverController')).join('\n');
    const walk = frameBodies(fn('StreetWalker')).join('\n');
    expect(fly).toMatch(/stepMotion\(telemetry, \{[^}]*dt: delta/);
    expect(walk).toMatch(/stepMotion\(telemetry, \{[^}]*dt: delta/);
    expect(walk).toMatch(/jump\(telemetry/);
    expect(fn('StreetWalker').getText(AST)).toMatch(/resetWalk\(telemetry\)/);
  });
});
