/** @jest-environment jsdom */
/**
 * Walk keeps its bearings: the mini-map stays pinned to the canvas whatever the camera faces; a look-drag in Walk or
 * Fly never counts as a click on a parcel (no warp, no selection), while the other views keep today's click; the scale
 * chip and the ruler live in the HUD's left column, clear of the hover card and the reaction bar at bottom-left.
 * Classes and source are read here (no layout in jsdom); the browser probe measures the boxes.
 */
import fs from 'fs';
import path from 'path';
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WorldHud, { type WorldHudProps } from '@/components/nexus/hud/WorldHud';
import { createTelemetry } from '@/components/nexus/hud/telemetry';

const PV = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');
const HUD_DIR = path.join(__dirname, '../../src/components/nexus/hud');

/** The source of one top-level function in ParcelView, up to its closing brace at column 0. */
function fnSource(name: string): string {
  const start = PV.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  return PV.slice(start, PV.indexOf('\n}\n', start));
}

/** The body of one `const name = useCallback(...)` in ParcelView, up to its dependency list. */
function callbackSource(name: string): string {
  const start = PV.indexOf(`const ${name} = useCallback(`);
  expect(start).toBeGreaterThan(-1);
  return PV.slice(start, PV.indexOf('}, [', start));
}

interface LookTrackerLike { press(x: number, y: number): void; move(x: number, y: number): void; release(): void; farthestPx(): number }

function loadClicks(): {
  isLookDrag: (viewMode: string, dragPx?: number) => boolean;
  LOOK_DRAG_PX: number;
  createLookTracker?: () => LookTrackerLike;
} {
  const file = path.join(HUD_DIR, 'clicks.ts');
  expect(fs.existsSync(file)).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/components/nexus/hud/clicks');
}

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
const topGroup = () => screen.getByRole('group', { name: 'View' }).parentElement as HTMLElement;

describe('the Walk mini-map stays at its place whatever the camera faces', () => {
  const src = fnSource('MiniMap');

  it('its overlay is pinned to the canvas centre, so the fullscreen box covers the canvas exactly', () => {
    expect(src).toMatch(/<Html\b[^>]*\bfullscreen\b/);
    expect(src).toMatch(/calculatePosition=\{pinToCanvas\}/);
    expect(PV).toMatch(/function pinToCanvas\([^)]*size[^)]*\)[^{]*\{\s*return \[size\.width \/ 2, size\.height \/ 2\];/);
  });

  it('it never hides itself when the world origin is behind the camera', () => {
    expect(src).toMatch(/onOcclude=\{keepShown\}/);
    expect(PV).toMatch(/(const keepShown = \(\) => \{\s*\};|function keepShown\(\)[^{]*\{\s*\})/);
  });

  it('the map is placed against the canvas box (absolute), not against the moving anchor (fixed)', () => {
    expect(src).not.toMatch(/position: 'fixed'/);
    expect(src).toMatch(/position: 'absolute',\s*bottom: '80px',\s*right: '16px',/);
  });
});

describe('a look-drag never counts as a click on a parcel, in Walk and Fly', () => {
  it('the guard: a drag over 3 px (Walk\'s own look threshold) is a look in Walk and Fly only', () => {
    const { isLookDrag, LOOK_DRAG_PX } = loadClicks();
    expect(LOOK_DRAG_PX).toBe(3);
    for (const mode of ['street', 'flyover']) {
      expect(isLookDrag(mode, 4)).toBe(true);
      expect(isLookDrag(mode, 3.5)).toBe(true);
      expect(isLookDrag(mode, 120)).toBe(true);
      expect(isLookDrag(mode, 3)).toBe(false);
      expect(isLookDrag(mode, 0)).toBe(false);
      expect(isLookDrag(mode)).toBe(false);
    }
    for (const mode of ['flat', 'isometric', 'heights', 'dna']) {
      expect(isLookDrag(mode, 0)).toBe(false);
      expect(isLookDrag(mode, 300)).toBe(false);
    }
  });

  it('one threshold: a drag that turns Walk\'s camera is never a click (same distance, same comparison)', () => {
    const { isLookDrag, LOOK_DRAG_PX } = loadClicks();
    const walk = fnSource('StreetWalker');
    // Walk's threshold is the guard's own constant, not a second literal.
    expect(walk).toMatch(/const dragThreshold = LOOK_DRAG_PX;/);
    expect(PV).toMatch(/import \{[^}]*\bLOOK_DRAG_PX\b[^}]*\} from '\.\/hud\/clicks';/);
    const walkPx = LOOK_DRAG_PX;
    // Walk turns the camera once the straight-line distance from the press passes the threshold (strictly).
    expect(walk).toMatch(/if \(Math\.sqrt\(dx \* dx \+ dy \* dy\) > dragThreshold\)/);
    const clicks = fs.readFileSync(path.join(HUD_DIR, 'clicks.ts'), 'utf8');
    expect(clicks).toMatch(/dragPx > LOOK_DRAG_PX/);
    for (const mode of ['street', 'flyover']) {
      expect(isLookDrag(mode, walkPx)).toBe(false);
      expect(isLookDrag(mode, walkPx + 0.01)).toBe(true);
    }
  });

  it('the instanced parcels pass the click\'s drag length (R3F e.delta) with the parcel', () => {
    const handler = fnSource('InstancedParcels');
    const click = handler.slice(handler.indexOf('const handleClick = useCallback('), handler.indexOf('const handleDoubleClick'));
    expect(click).toMatch(/onClick\(parcels\[id\], e\.delta\)/);
    expect(handler).toMatch(/onClick: \(p: ParcelData, dragPx\?: number\) => void;/);
  });

  it('Fly turns the view only after the pointer has gone more than LOOK_DRAG_PX from the press, as Walk does', () => {
    const fly = fnSource('FlyoverController');
    const down = fly.slice(fly.indexOf('const onMouseDown'), fly.indexOf('const onMouseUp'));
    expect(down).toMatch(/e\.clientX/);
    expect(down).toMatch(/e\.clientY/);
    const move = fly.slice(fly.indexOf('const onMouseMove'), fly.indexOf('const el = gl.domElement'));
    expect(move).toMatch(/Math\.sqrt\(dx \* dx \+ dy \* dy\) > LOOK_DRAG_PX/);
    // The threshold is checked before the view turns.
    expect(move.indexOf('> LOOK_DRAG_PX')).toBeGreaterThan(-1);
    expect(move.indexOf('> LOOK_DRAG_PX')).toBeLessThan(move.indexOf('yaw.current -='));
  });

  it('the look tracker keeps the farthest distance from the press, after the release too', () => {
    const { createLookTracker } = loadClicks();
    expect(typeof createLookTracker).toBe('function');
    const t = createLookTracker!();
    // Moves without a press count nothing.
    t.move(500, 500);
    expect(t.farthestPx()).toBe(0);
    // Out to 200 px and back to the press point: the farthest point counts, not the end point.
    t.press(100, 100);
    t.move(150, 100);
    t.move(300, 100);
    t.move(200, 100);
    t.move(100, 100);
    expect(t.farthestPx()).toBe(200);
    // The click arrives after the release: the value stays.
    t.release();
    expect(t.farthestPx()).toBe(200);
    // Moves after the release do not count.
    t.move(1000, 1000);
    expect(t.farthestPx()).toBe(200);
    // A new press starts from 0.
    t.press(10, 10);
    expect(t.farthestPx()).toBe(0);
    t.move(13, 14);
    expect(t.farthestPx()).toBe(5);
  });

  it('an out-and-back drag (end point 0 px, farthest 200 px) is a look in Walk and Fly, a click elsewhere', () => {
    const { isLookDrag } = loadClicks();
    expect(isLookDrag('street', Math.max(0, 200))).toBe(true);
    expect(isLookDrag('flyover', Math.max(0, 200))).toBe(true);
    expect(isLookDrag('street', 200)).toBe(true);
    expect(isLookDrag('flat', 200)).toBe(false);
    for (const mode of ['flat', 'isometric', 'heights', 'dna']) expect(isLookDrag(mode, 200)).toBe(false);
  });

  it('handleParcelClick judges by the larger of the click\'s delta and the farthest distance of the press', () => {
    const body = callbackSource('handleParcelClick');
    const m = body.match(/if \(isLookDrag\(viewMode, Math\.max\(dragPx \?\? 0, (\w+)\.farthestPx\(\)\)\)\) return;/);
    expect(m).not.toBeNull();
    expect(body).not.toMatch(/isLookDrag\(viewMode, dragPx\)/);
    const tracker = m![1];
    // One tracker for the life of the view.
    expect(PV).toMatch(new RegExp(`const \\[${tracker}\\] = useState\\(createLookTracker\\);`));
  });

  it('the tracker hears every pointer on the window (capture phase), and the listeners go on unmount', () => {
    const at = PV.indexOf('.press(e.clientX, e.clientY)');
    expect(at).toBeGreaterThan(-1);
    const start = PV.lastIndexOf('useEffect(', at);
    const effect = PV.slice(start, PV.indexOf('}, [', at));
    const cleanup = effect.slice(effect.indexOf('return () =>'));
    expect(effect.indexOf('return () =>')).toBeGreaterThan(-1);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      expect(effect).toMatch(new RegExp(`window\\.addEventListener\\('${type}', \\w+, true\\)`));
      expect(cleanup).toMatch(new RegExp(`window\\.removeEventListener\\('${type}', \\w+, true\\)`));
    }
    expect(effect).toMatch(/\.move\(e\.clientX, e\.clientY\)/);
    expect(effect).toMatch(/\.release\(\)/);
  });

  it('handleParcelClick returns before selecting or warping when the click was a look-drag', () => {
    const body = callbackSource('handleParcelClick');
    expect(body).toMatch(/\(p: ParcelData, dragPx\?: number\)/);
    const guard = body.search(/if \(isLookDrag\(viewMode, [^\n]*\)\) return;/);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('setSelectedParcel(p)'));
    expect(guard).toBeLessThan(body.indexOf('setStreetTeleport'));
    expect(guard).toBeLessThan(body.indexOf('setFlyTarget'));
  });

  it('nothing else changes: Walk teleports, Fly selects, the other views fly to the parcel', () => {
    const body = callbackSource('handleParcelClick');
    expect(body).toMatch(/if \(viewMode === 'street'\) setStreetTeleport\(\{ \.\.\.p \}\);/);
    expect(body).toMatch(/const target = computeFlyTarget\(p, false\);\s*setFlyTarget\(target\);/);
  });
});

describe('the scale chip and the ruler stay clear of the hover card and the reaction bar', () => {
  it('the hover card sits right of the HUD column on desktop and from the right edge on phones, above the bottom row', () => {
    const at = PV.indexOf('{/* Hover tooltip */}\n        {hoveredParcel');
    expect(at).toBeGreaterThan(-1);
    const line = PV.slice(at, PV.indexOf('\n', PV.indexOf('<div data-world-hovercard', at)));
    expect(line).toContain("className={`absolute ${phone ? 'right-3 bottom-[calc(136px+env(safe-area-inset-bottom))]' : 'left-[256px] bottom-[124px]'} z-40 px-4 py-3 rounded-xl font-mono pointer-events-none`}");
    expect(line).not.toContain('left-16');
    expect(line).not.toContain('bottom-4');
  });

  it.each([false, true])('they sit in the HUD\'s left column, below the readouts (phone %s)', (phone) => {
    render(<WorldHud {...props({ phone })} />);
    const chip = screen.getByTestId('world-scale-chip');
    const ruler = screen.getByTestId('world-ruler');
    expect(topGroup().contains(chip)).toBe(true);
    expect(topGroup().contains(ruler)).toBe(true);
    const readouts = screen.getByTestId('world-readouts');
    expect(readouts.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No bottom-left anchoring left anywhere in the HUD.
    for (const el of Array.from(screen.getByTestId('world-hud').querySelectorAll('*'))) {
      expect(classes(el).some((c) => c.startsWith('bottom-') && classes(el).includes('left-3'))).toBe(false);
    }
  });

  it.each([false, true])('in the Analyze views the chip is in the column too (phone %s)', (phone) => {
    render(<WorldHud {...props({ phone, viewMode: 'flat' })} />);
    expect(topGroup().contains(screen.getByTestId('world-scale-chip'))).toBe(true);
  });

  it.each([false, true])('while the tour is on, the ruler\'s row is reserved before it shows (phone %s)', (phone) => {
    render(<WorldHud {...props({ phone })} />);
    const ruler = screen.getByTestId('world-ruler');
    expect(ruler.hidden).toBe(true);
    const slot = screen.getByTestId('world-ruler-slot');
    expect(classes(slot)).toContain('h-[32px]');
    expect(slot.contains(ruler)).toBe(true);
    // The fixed-width label still comes first.
    expect(classes(ruler.firstElementChild)).toContain('min-w-[48px]');
  });
});

describe('the HUD column\'s gaps pass taps to the scene', () => {
  const cases: Array<[string, Partial<WorldHudProps>, boolean]> = [
    ['Fly, tour on', { viewMode: 'flyover', autoTour: true }, false],
    ['Fly, tour off', { viewMode: 'flyover', autoTour: false }, false],
    ['Walk', { viewMode: 'street' }, false],
    ['Analyze, rows open', { viewMode: 'flat' }, true],
  ];
  for (const phone of [false, true]) {
    for (const [name, over, openMenu] of cases) {
      if (phone && over.viewMode === 'street') continue;
      it(`${name} (phone ${phone}): the column takes no taps, each control and panel takes them`, () => {
        render(<WorldHud {...props({ phone, ...over })} />);
        if (openMenu) fireEvent.click(screen.getByRole('button', { name: /Analyze/ }));
        const column = topGroup();
        expect(classes(column)).toContain('pointer-events-none');
        expect(classes(column)).not.toContain('pointer-events-auto');
        // The View group's own gaps pass taps too.
        expect(classes(screen.getByRole('group', { name: 'View' }))).not.toContain('pointer-events-auto');
        const panels = ['world-readouts', 'world-scale-chip', 'world-ruler', 'world-analyze-menu']
          .map((id) => screen.queryByTestId(id))
          .filter((el): el is HTMLElement => el !== null);
        expect(panels.length).toBeGreaterThan(0);
        for (const el of panels) expect(`${el.dataset.testid}: ${classes(el).includes('pointer-events-auto')}`).toBe(`${el.dataset.testid}: true`);
        const controls = Array.from(column.querySelectorAll('button, input'));
        expect(controls.length).toBeGreaterThan(1);
        for (const el of controls) {
          const owner = el.closest('.pointer-events-auto');
          const label = el.textContent?.trim() || el.getAttribute('type') || el.tagName;
          expect(`${label}: ${owner !== null && owner !== column && column.contains(owner)}`).toBe(`${label}: true`);
        }
      });
    }
  }
});
