/*
 * What the world camera does, measured from the camera itself. Both camera controllers call `stepMotion` at the end of
 * each active frame with the camera's position after the move and the frame's real delta; the HUD reads the object on
 * a 100 ms tick. Plain object, plain mutators: no React, no three, nothing per frame reaches React state.
 */

import { METRES_PER_UNIT } from './scale';

export interface WorldTelemetry {
  /** Horizontal ground speed, km/h, smoothed. */
  speedKmh: number;
  /** Camera height above the ground plane, m. */
  altitudeM: number;
  /** Metres walked since Walk started. */
  distanceM: number;
  /** Camera position on the ground, m from the block centre. */
  xM: number;
  zM: number;
  /** Metres of ground per screen pixel at the screen centre (the tour's ruler), or null. */
  groundMetresPerPx: number | null;
  /** The last position stepMotion saw, in world units; `primed` false until the first one. */
  lastXUnits: number;
  lastZUnits: number;
  primed: boolean;
}

/** Smoothing time constant, s: a change of speed is 86 % shown after 1 s and 99.7 % after 3 s. */
export const SPEED_SMOOTHING_S = 0.5;

export function createTelemetry(): WorldTelemetry {
  return {
    speedKmh: 0, altitudeM: 0, distanceM: 0, xM: 0, zM: 0, groundMetresPerPx: null,
    lastXUnits: 0, lastZUnits: 0, primed: false,
  };
}

const finite = (...n: number[]) => n.every(Number.isFinite);

/**
 * One frame of camera motion: speed = horizontal displacement / dt, smoothed; altitude from y; `count` adds the
 * displacement to the walked distance. dt ≤ 0 (or any non-finite input) changes nothing.
 */
export function stepMotion(
  t: WorldTelemetry,
  m: { xUnits: number; yUnits: number; zUnits: number; dt: number; count: boolean },
): void {
  if (!finite(m.xUnits, m.yUnits, m.zUnits, m.dt) || m.dt <= 0) return;
  t.altitudeM = m.yUnits * METRES_PER_UNIT;
  t.xM = m.xUnits * METRES_PER_UNIT;
  t.zM = m.zUnits * METRES_PER_UNIT;
  if (!t.primed) {
    t.lastXUnits = m.xUnits;
    t.lastZUnits = m.zUnits;
    t.primed = true;
    return;
  }
  const movedM = Math.hypot(m.xUnits - t.lastXUnits, m.zUnits - t.lastZUnits) * METRES_PER_UNIT;
  t.lastXUnits = m.xUnits;
  t.lastZUnits = m.zUnits;
  if (m.count) t.distanceM += movedM;
  const instantKmh = (movedM / m.dt) * 3.6;
  const a = 1 - Math.exp(-m.dt / SPEED_SMOOTHING_S);
  t.speedKmh += a * (instantKmh - t.speedKmh);
  if (t.speedKmh < 0.05) t.speedKmh = 0;
}

/** A warp or a teleport: the position moves, the speed and the walked distance do not. */
export function jump(t: WorldTelemetry, xUnits: number, zUnits: number): void {
  if (!finite(xUnits, zUnits)) return;
  t.lastXUnits = xUnits;
  t.lastZUnits = zUnits;
  t.xM = xUnits * METRES_PER_UNIT;
  t.zM = zUnits * METRES_PER_UNIT;
  t.primed = true;
}

/** A controller starts: the speed reads 0 until the camera moves. */
export function resetMotion(t: WorldTelemetry): void {
  t.speedKmh = 0;
  t.primed = false;
}

/** Walk starts: the walked distance starts again from 0. */
export function resetWalk(t: WorldTelemetry): void {
  resetMotion(t);
  t.distanceM = 0;
}

/**
 * Metres of ground per pixel at the screen centre for a camera at height `yUnits` looking along a direction with
 * vertical part `dirY` (negative = down), with a vertical field of view `fovDeg` over `heightPx` pixels. Null when
 * the camera does not look down (dirY ≥ −0.05) or any input is not finite or not positive where it must be.
 */
export function groundMetresPerPx(yUnits: number, dirY: number, fovDeg: number, heightPx: number): number | null {
  if (!finite(yUnits, dirY, fovDeg, heightPx)) return null;
  if (dirY >= -0.05 || yUnits <= 0 || fovDeg <= 0 || heightPx <= 0) return null;
  const distanceUnits = yUnits / -dirY;
  return (METRES_PER_UNIT * 2 * distanceUnits * Math.tan((fovDeg * Math.PI) / 360)) / heightPx;
}

/** The tour's figure-8 at parameter u (0..2π), as FlyoverController's tourPath draws it. */
export function figureEightPoint(r: number, u: number): [number, number] {
  const s = 1 / (1 + Math.sin(u) * Math.sin(u) * 0.3);
  return [r * Math.sin(u) * s, r * Math.sin(u) * Math.cos(u) * s];
}

/** The closed figure-8's length in world units, from `samples` straight segments. */
export function figureEightLength(r: number, samples = 512): number {
  let length = 0;
  let [px, pz] = figureEightPoint(r, 0);
  for (let i = 1; i <= samples; i++) {
    const [x, z] = figureEightPoint(r, (i / samples) * Math.PI * 2);
    length += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  return length;
}
