/** @jest-environment jsdom */
/**
 * The HUD keeps still: opening Analyze never moves the readouts; on phones the HUD is one full-width column at the top
 * (the View row, a two-row tour bar, the chip, the ruler slot) and desktop keeps its 220 px column; the phone chip
 * never moves when the ruler appears; and the tour keeps today's pace by default. Classes are read in jsdom (no layout
 * there); the browser probe measures the boxes.
 */
import fs from 'fs';
import path from 'path';
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WorldHud, { SPEED_MAX_KMH, SPEED_MIN_KMH, SPEED_STEP_KMH, type WorldHudProps } from '@/components/nexus/hud/WorldHud';
import { createTelemetry, figureEightLength, figureEightPoint, stepMotion } from '@/components/nexus/hud/telemetry';
import { unitsPerSecondFromKmh } from '@/components/nexus/hud/scale';

const PV = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');

function props(over: Partial<WorldHudProps> = {}): WorldHudProps {
  const t = createTelemetry();
  t.primed = true;
  return {
    viewMode: 'flyover', onViewMode: jest.fn(), autoTour: true, onAutoTour: jest.fn(), tourKmh: 56, cruiseKmh: 100,
    onSpeed: jest.fn(), runLocked: false, onRunLocked: jest.fn(), telemetry: t, parcels: 3050, phone: false,
    reducedMotion: false, tourStarted: true, ...over,
  };
}

const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);
/** The HUD's top group: the column that holds the View group and the readouts. */
const topGroup = () => screen.getByRole('group', { name: 'View' }).parentElement as HTMLElement;

describe('opening Analyze never moves the readouts', () => {
  it.each([false, true])('the rows open as an overlay out of the column\'s flow (phone %s)', (phone) => {
    render(<WorldHud {...props({ phone })} />);
    const readouts = screen.getByTestId('world-readouts');
    const before = { parent: readouts.parentElement, prev: readouts.previousElementSibling, cls: readouts.className,
      siblings: Array.from(readouts.parentElement!.children) };
    fireEvent.click(screen.getByRole('button', { name: /^Analyze/ }));
    const menu = screen.getByTestId('world-analyze-menu');
    expect(classes(menu)).toContain('absolute');
    expect(classes(menu)).toContain('top-full');
    expect(classes(menu).some((c) => /^z-/.test(c))).toBe(true);
    expect(classes(menu.parentElement)).toContain('relative');
    expect(screen.getByTestId('world-readouts')).toBe(readouts);
    expect(readouts.parentElement).toBe(before.parent);
    expect(readouts.previousElementSibling).toBe(before.prev);
    expect(readouts.className).toBe(before.cls);
    expect(Array.from(readouts.parentElement!.children)).toEqual(before.siblings);
  });
});

describe('on phones the HUD is one full-width column at the top', () => {
  const viewGroup = () => screen.getByRole('group', { name: 'View' });

  it('phones: the column spans left-3 to right-3 from top-16', () => {
    render(<WorldHud {...props({ phone: true })} />);
    const c = classes(topGroup());
    for (const k of ['top-16', 'left-3', 'right-3', 'flex-col']) expect(c).toContain(k);
    expect(c).not.toContain('w-[220px]');
    expect(c).not.toContain('top-[92px]');
  });

  it('phones: the View group is a row that ends left of the fullscreen button', () => {
    render(<WorldHud {...props({ phone: true })} />);
    expect(classes(viewGroup())).toContain('flex-row');
    expect(classes(viewGroup())).toContain('max-w-[calc(100%-77px)]');
    const box = screen.getByRole('button', { name: /^Analyze/ }).parentElement;
    expect(classes(box)).toContain('min-w-0');
    expect(classes(box)).toContain('relative');
  });

  it('phones: the tour bar has two rows, readouts and toggle, then label and range', () => {
    render(<WorldHud {...props({ phone: true })} />);
    const readouts = screen.getByTestId('world-readouts');
    expect(classes(readouts)).toContain('grid');
    expect(classes(readouts)).toContain('grid-cols-2');
    expect(Array.from(readouts.children).map((el) => el.tagName)).toEqual(['DL', 'BUTTON', 'LABEL', 'INPUT']);
    const dl = readouts.querySelector('dl');
    expect(classes(dl)).toContain('grid-cols-[76px_auto]');
    expect(classes(dl)).not.toContain('grid-cols-2');
  });

  it('phones: the Analyze rows keep a readable width', () => {
    render(<WorldHud {...props({ phone: true })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Analyze/ }));
    const menu = screen.getByTestId('world-analyze-menu');
    expect(classes(menu)).toContain('min-w-[176px]');
    expect(classes(menu)).toContain('absolute');
    expect(classes(menu)).toContain('top-full');
  });

  it('desktop keeps its column, View group, tour panel and menu', () => {
    render(<WorldHud {...props()} />);
    const c = classes(topGroup());
    for (const k of ['top-16', 'left-3', 'w-[220px]', 'max-w-[calc(100vw-24px)]']) expect(c).toContain(k);
    expect(c).not.toContain('right-3');
    expect(classes(viewGroup())).toContain('flex-col');
    expect(classes(viewGroup())).not.toContain('flex-row');
    const readouts = screen.getByTestId('world-readouts');
    expect(classes(readouts)).toContain('flex-col');
    expect(classes(readouts)).not.toContain('grid');
    expect(classes(readouts.querySelector('dl'))).toContain('grid-cols-2');
    fireEvent.click(screen.getByRole('button', { name: /^Analyze/ }));
    expect(classes(screen.getByTestId('world-analyze-menu'))).not.toContain('min-w-[176px]');
  });
});

describe('on phones the chip never moves when the ruler appears', () => {
  it('while the tour is on, the ruler\'s row is reserved at a fixed height before the ruler shows', () => {
    render(<WorldHud {...props({ phone: true })} />);
    const ruler = screen.getByTestId('world-ruler');
    expect(ruler.hidden).toBe(true);
    const slot = screen.getByTestId('world-ruler-slot');
    expect(classes(slot)).toContain('h-[32px]');
    expect(slot.contains(ruler)).toBe(true);
    expect(slot.parentElement).toBe(screen.getByTestId('world-scale-chip').parentElement);
  });

  it('with the tour off there is no reserved row and no ruler, on phones and on desktop', () => {
    const { unmount } = render(<WorldHud {...props({ phone: true, autoTour: false })} />);
    expect(screen.queryByTestId('world-ruler-slot')).toBeNull();
    unmount();
    render(<WorldHud {...props({ autoTour: false })} />);
    expect(screen.queryByTestId('world-ruler-slot')).toBeNull();
    expect(screen.queryByTestId('world-ruler')).toBeNull();
  });

  it('on desktop too, the tour reserves the ruler\'s row', () => {
    render(<WorldHud {...props()} />);
    expect(screen.getByTestId('world-ruler-slot').contains(screen.getByTestId('world-ruler'))).toBe(true);
  });
});

describe('the tour keeps today\'s pace by default', () => {
  const tourDefault = Number((PV.match(/const DEFAULT_TOUR_KMH = (\d+);/) ?? [])[1]);

  it('the tour\'s default is 56 km/h, on the control\'s 4 km/h steps; free flight stays 100', () => {
    expect(tourDefault).toBe(56);
    expect((tourDefault - SPEED_MIN_KMH) % SPEED_STEP_KMH).toBe(0);
    expect(tourDefault).toBeLessThanOrEqual(SPEED_MAX_KMH);
    expect(PV).toContain('useState(DEFAULT_TOUR_KMH)');
    expect(PV).toContain('const FLY_SPEED = 27.8 / METERS_PER_UNIT;');
    expect(PV).toContain('const DEFAULT_CRUISE_KMH = Math.round(FLY_SPEED * METERS_PER_UNIT * 3.6);');
    expect(Math.round(27.8 * 3.6)).toBe(100);
  });

  it('over one whole loop at the default, the readout averages 56 km/h (the tour\'s stepping, at 60 frames per second)', () => {
    // The tour's own stepping (FlyoverController): a 200-segment figure-8 of radius 12 units, advanced by the loop's
    // real length, the camera easing toward the point at dt x 3, telemetry stepped every frame and read every 6th.
    const r = 12;
    const segments = 200;
    const pts = Array.from({ length: segments + 1 }, (_, i) => figureEightPoint(r, (i / segments) * Math.PI * 2));
    const loop = figureEightLength(r, 512);
    const dt = 1 / 60;
    const t = createTelemetry();
    let progress = 0;
    let [x, z] = pts[0];
    const reads: number[] = [];
    const frames = Math.ceil(((loop / unitsPerSecondFromKmh(tourDefault)) + 3) / dt);
    for (let f = 0; f < frames; f++) {
      progress += (unitsPerSecondFromKmh(tourDefault) * dt) / loop * segments;
      if (progress >= segments) progress -= segments;
      const i = Math.floor(progress) % segments;
      const frac = progress - Math.floor(progress);
      const tx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * frac;
      const tz = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * frac;
      x += (tx - x) * dt * 3;
      z += (tz - z) * dt * 3;
      stepMotion(t, { xUnits: x, yUnits: 100 / 105, zUnits: z, dt, count: false });
      if (f >= 3 / dt && f % 6 === 0) reads.push(t.speedKmh);
    }
    const mean = reads.reduce((a, b) => a + b, 0) / reads.length;
    expect(Math.abs(mean - 56)).toBeLessThanOrEqual(56 * 0.02);
    expect(Math.max(...reads)).toBeGreaterThan(80); // the centre crossing is the loop's fastest stretch
    expect(Math.min(...reads)).toBeLessThan(40);
  });

  it('the label reads "Tour speed · 56 km/h" at the default', () => {
    render(<WorldHud {...props({ tourKmh: tourDefault })} />);
    const range = screen.getByLabelText('Tour speed · 56 km/h') as HTMLInputElement;
    expect(range.value).toBe('56');
    expect(range.getAttribute('aria-valuetext')).toBe('56 kilometres per hour');
  });
});
