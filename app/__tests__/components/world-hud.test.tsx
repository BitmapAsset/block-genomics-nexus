/** @jest-environment jsdom */
/**
 * The world HUD (components/nexus/hud/WorldHud): Fly / Walk / Analyze, the readouts written from the telemetry
 * object on a 100 ms tick (no React commit per tick), the speed you set, Run, the scale chip and ruler, phones and
 * reduced motion. Rendered alone: the HUD needs no wallet, no three and no ParcelView.
 */
import fs from 'fs';
import path from 'path';
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import WorldHud, { type WorldHudProps } from '@/components/nexus/hud/WorldHud';
import { createTelemetry } from '@/components/nexus/hud/telemetry';
import { worldScaleChip } from '@/components/nexus/hud/scale';

const HUD_DIR = path.join(__dirname, '../../src/components/nexus/hud');

function props(over: Partial<WorldHudProps> = {}): WorldHudProps {
  const t = createTelemetry();
  t.primed = true;
  return {
    viewMode: 'flyover', onViewMode: jest.fn(), autoTour: true, onAutoTour: jest.fn(), tourKmh: 72, cruiseKmh: 100,
    onSpeed: jest.fn(), runLocked: false, onRunLocked: jest.fn(), telemetry: t, parcels: 3050, phone: false,
    reducedMotion: false, tourStarted: true, ...over,
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const hud = () => screen.getByTestId('world-hud');

describe('modes', () => {
  it('a "View" group with Fly, Walk and Analyze; Fly and Walk carry aria-pressed; Walk calls onViewMode', () => {
    const p = props();
    render(<WorldHud {...p} />);
    const group = screen.getByRole('group', { name: 'View' });
    expect(group).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fly' }).getAttribute('aria-pressed')).toBe('true');
    const walk = screen.getByRole('button', { name: 'Walk' });
    expect(walk.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(walk);
    expect(p.onViewMode).toHaveBeenCalledWith('street');
  });

  it('Analyze opens four rows with aria-pressed; Escape closes and returns focus to Analyze', () => {
    const p = props({ viewMode: 'isometric' });
    render(<WorldHud {...p} />);
    const analyze = screen.getByRole('button', { name: /^Analyze · Isometric/ });
    expect(analyze.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(analyze);
    expect(analyze.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('group', { name: 'Analyze' });
    expect(analyze.getAttribute('aria-controls')).toBe(menu.id);
    const rows = Array.from(menu.querySelectorAll('button'));
    expect(rows.map((r) => r.textContent)).toEqual(['Grid', 'Isometric', 'Heights', 'Genome']);
    expect(rows.map((r) => r.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
    expect(screen.queryByText('Flat map')).toBeNull();
    rows[2].focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Analyze' })).toBeNull();
    expect(document.activeElement).toBe(analyze);
  });

  it('a click outside closes the Analyze menu; a row calls onViewMode', () => {
    const p = props();
    render(<WorldHud {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /^Analyze/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Heights' }));
    expect(p.onViewMode).toHaveBeenCalledWith('heights');
    fireEvent.click(screen.getByRole('button', { name: /^Analyze/ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('group', { name: 'Analyze' })).toBeNull();
  });

  it('focus on swap: a chosen row moves focus to Analyze, never to <body>', () => {
    const p = props();
    const { rerender } = render(<WorldHud {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /^Analyze/ }));
    const row = screen.getByRole('button', { name: 'Grid' });
    row.focus();
    fireEvent.click(row);
    rerender(<WorldHud {...p} viewMode="flat" />);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Analyze · Grid/ }));
  });

  it('focus on swap: the focused Run button goes away with Walk, focus lands on Fly', () => {
    const p = props({ viewMode: 'street' });
    const { rerender } = render(<WorldHud {...p} />);
    screen.getByRole('button', { name: 'Run' }).focus();
    rerender(<WorldHud {...p} viewMode="flyover" />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fly' }));
  });
});

describe('the speed you set', () => {
  it('the tour on: "Tour speed · 72 km/h", 20-200 step 4, aria-valuetext; a change calls onSpeed("tour")', () => {
    const p = props();
    render(<WorldHud {...p} />);
    const range = screen.getByLabelText('Tour speed · 72 km/h') as HTMLInputElement;
    expect(range.type).toBe('range');
    expect([range.min, range.max, range.step]).toEqual(['20', '200', '4']);
    expect(range.getAttribute('aria-valuetext')).toBe('72 kilometres per hour');
    fireEvent.change(range, { target: { value: '100' } });
    expect(p.onSpeed).toHaveBeenCalledWith('tour', 100);
  });

  it('the tour off: "Flying speed · 100 km/h"; a change calls onSpeed("cruise"); hints show', () => {
    const p = props({ autoTour: false });
    render(<WorldHud {...p} />);
    const range = screen.getByLabelText('Flying speed · 100 km/h');
    fireEvent.change(range, { target: { value: '40' } });
    expect(p.onSpeed).toHaveBeenCalledWith('cruise', 40);
    expect(screen.getByTestId('world-hints').textContent).toBe('W A S D move · Space up · Ctrl down · Shift faster · drag to look');
  });

  it('the tour toggle and Run carry aria-pressed and call back', () => {
    const p = props();
    const { rerender } = render(<WorldHud {...p} />);
    const tour = screen.getByRole('button', { name: 'Auto tour' });
    expect(tour.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(tour);
    expect(p.onAutoTour).toHaveBeenCalledWith(false);
    rerender(<WorldHud {...p} viewMode="street" />);
    const run = screen.getByRole('button', { name: 'Run' });
    expect(run.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(run);
    expect(p.onRunLocked).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('world-hints').textContent).toBe('W A S D walk · Shift run · drag to look');
  });
});

describe('phones and reduced motion', () => {
  it('phones: no Walk, no hints, "Pause" / "Resume", the speed is always the tour\'s', () => {
    const p = props({ phone: true });
    const { rerender } = render(<WorldHud {...p} />);
    expect(screen.queryByRole('button', { name: 'Walk' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    rerender(<WorldHud {...p} autoTour={false} />);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.getByLabelText('Tour speed · 72 km/h')).toBeTruthy();
    expect(screen.queryByTestId('world-hints')).toBeNull();
  });

  it('reduced motion before the tour has run: "Start the tour"', () => {
    render(<WorldHud {...props({ reducedMotion: true, tourStarted: false, autoTour: false })} />);
    expect(screen.getByRole('button', { name: 'Start the tour' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('readouts', () => {
  it('the tick writes the spans and data attributes from the telemetry object, with zero React commits', () => {
    const p = props();
    let commits = 0;
    render(
      <React.Profiler id="hud" onRender={() => { commits++; }}>
        <WorldHud {...p} />
      </React.Profiler>,
    );
    const mounted = commits;
    Object.assign(p.telemetry, { speedKmh: 71.6, altitudeM: 100.2, xM: -12.4, zM: 30.6, distanceM: 0 });
    act(() => { jest.advanceTimersByTime(100); });
    expect(hud().querySelector('[data-readout="speed"]')!.textContent).toBe('72 km/h');
    expect(hud().querySelector('[data-readout="altitude"]')!.textContent).toBe('100 m');
    expect(hud().getAttribute('data-speed-kmh')).toBe('72');
    expect(hud().getAttribute('data-alt-m')).toBe('100');
    expect(hud().getAttribute('data-x-m')).toBe('-12');
    expect(hud().getAttribute('data-z-m')).toBe('31');
    act(() => { jest.advanceTimersByTime(1000); });
    expect(commits - mounted).toBe(0);
  });

  it('Walk shows Speed and Walked', () => {
    const p = props({ viewMode: 'street' });
    render(<WorldHud {...p} />);
    p.telemetry.distanceM = 1234;
    act(() => { jest.advanceTimersByTime(100); });
    expect(hud().querySelector('[data-readout="walked"]')!.textContent).toBe('1.2 km');
    expect(hud().getAttribute('data-distance-m')).toBe('1234');
    expect(hud().querySelector('[data-readout="altitude"]')).toBeNull();
  });

  it('no data attributes before the camera has reported (the ready signal)', () => {
    const p = props();
    p.telemetry.primed = false;
    render(<WorldHud {...p} />);
    act(() => { jest.advanceTimersByTime(300); });
    expect(hud().hasAttribute('data-alt-m')).toBe(false);
  });
});

describe('scale', () => {
  it('the chip: with 3,050 parcels, and the ground alone for null', () => {
    const { rerender } = render(<WorldHud {...props()} />);
    expect(screen.getByTestId('world-scale-chip').textContent).toBe(worldScaleChip(3050));
    rerender(<WorldHud {...props({ parcels: null })} />);
    expect(screen.getByTestId('world-scale-chip').textContent).toBe(worldScaleChip(null));
  });

  it('the ruler is hidden while null and shows a bar width and label for a value', () => {
    const p = props();
    render(<WorldHud {...p} />);
    act(() => { jest.advanceTimersByTime(100); });
    const ruler = screen.getByTestId('world-ruler');
    expect(ruler.hidden).toBe(true);
    p.telemetry.groundMetresPerPx = 1;
    act(() => { jest.advanceTimersByTime(100); });
    expect(ruler.hidden).toBe(false);
    expect((ruler.querySelector('[data-ruler-bar]') as HTMLElement).style.width).toBe('100px');
    expect(ruler.textContent).toBe('100 m');
  });
});

describe('a neutral HUD', () => {
  it('every control is at least 44 × 44 px', () => {
    const p = props();
    const { rerender, container } = render(<WorldHud {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /^Analyze/ }));
    const check = () => {
      for (const c of Array.from(container.querySelectorAll('button, a, input'))) {
        expect(`${c.textContent}: ${/min-h-\[(44|48)px\]/.test(c.className)}`).toBe(`${c.textContent}: true`);
        expect(`${c.textContent}: ${/min-w-\[(44|48)px\]/.test(c.className)}`).toBe(`${c.textContent}: true`);
      }
    };
    check();
    rerender(<WorldHud {...p} viewMode="street" />);
    check();
  });

  it('no emoji, no orange, no colour literal in a style prop', () => {
    const { container } = render(<WorldHud {...props({ viewMode: 'street' })} />);
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(container.innerHTML).not.toContain('bg-bitcoin');
    for (const f of fs.readdirSync(HUD_DIR).filter((n) => n.endsWith('.tsx'))) {
      const src = fs.readFileSync(path.join(HUD_DIR, f), 'utf8');
      const styles = src.match(/style=\{\{[^}]*\}\}/g) ?? [];
      for (const s of styles) expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
      expect(src).not.toMatch(/bg-bitcoin|primaryButton/);
    }
  });
});
