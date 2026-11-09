'use client';

/*
 * The world view's HUD: the view modes (Fly, Walk, Analyze), the readouts the camera measured, the tour and the
 * speed you set, Run, the block's scale and the keyboard hints. Readouts reach the DOM from a 100 ms tick through
 * refs; a tick changes no React state. Neutral surfaces only: the world view has no main action in this HUD.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Footprints, Pause, Plane, Play, ScanSearch, Zap } from 'lucide-react';
import { menuRow } from '@/components/ui/menu';
import type { ViewMode } from '../ParcelView';
import type { WorldTelemetry } from './telemetry';
import { formatDistance, formatKmh, formatMetres, rulerFor, worldScaleChip } from './scale';

export const SPEED_MIN_KMH = 20;
export const SPEED_MAX_KMH = 200;
export const SPEED_STEP_KMH = 4;
const TICK_MS = 100;

type AnalyzeMode = 'flat' | 'isometric' | 'heights' | 'dna';
const ANALYZE_ROWS: { mode: AnalyzeMode; label: string }[] = [
  { mode: 'flat', label: 'Grid' },
  { mode: 'isometric', label: 'Isometric' },
  { mode: 'heights', label: 'Heights' },
  { mode: 'dna', label: 'Genome' },
];

export interface WorldHudProps {
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  autoTour: boolean;
  onAutoTour: (on: boolean) => void;
  tourKmh: number;
  cruiseKmh: number;
  onSpeed: (kind: 'tour' | 'cruise', kmh: number) => void;
  runLocked: boolean;
  onRunLocked: (on: boolean) => void;
  telemetry: WorldTelemetry;
  /** The chain's own transaction count for real block data; null for mock or loading data. */
  parcels: number | null;
  phone: boolean;
  reducedMotion: boolean;
  tourStarted: boolean;
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cyan';
const hudBase =
  `inline-flex min-h-[48px] min-w-[48px] items-center gap-2 rounded-full border px-4 text-[14px] transition-colors duration-150 motion-reduce:transition-none ${focusRing}`;
const pressedClass = 'border-line-3 bg-surface-3 font-semibold text-text-1 ring-2 ring-text-2';
const restingClass = 'border-line-2 bg-bg-primary/95 font-medium text-text-2 hover:text-text-1';
const panelClass = 'rounded-[16px] border border-line-2 bg-bg-primary/95 backdrop-blur';
const hudButton = `${hudBase} justify-center`;

const modeButton = (pressed: boolean) => `${hudBase} justify-start ${pressed ? pressedClass : restingClass}`;

function kmhWords(kmh: number): string {
  return `${kmh} kilometres per hour`;
}

export default function WorldHud(props: WorldHudProps) {
  const {
    viewMode, onViewMode, autoTour, onAutoTour, tourKmh, cruiseKmh, onSpeed, runLocked, onRunLocked,
    telemetry, parcels, phone, reducedMotion, tourStarted,
  } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLButtonElement>(null);
  const walkRef = useRef<HTMLButtonElement>(null);
  const analyzeRef = useRef<HTMLButtonElement>(null);
  const analyzeBox = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const walkedRef = useRef<HTMLSpanElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const rulerBarRef = useRef<HTMLSpanElement>(null);
  const rulerLabelRef = useRef<HTMLSpanElement>(null);
  const hadFocus = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const speedId = useId();

  const isFly = viewMode === 'flyover';
  const isWalk = viewMode === 'street';
  const analyzeRow = ANALYZE_ROWS.find((r) => r.mode === viewMode) ?? null;
  const showTourSpeed = phone || autoTour;
  const speedValue = showTourSpeed ? tourKmh : cruiseKmh;

  // The 100 ms tick: telemetry → text and data attributes. Writes only what changed; never React state.
  useEffect(() => {
    let seen = false;
    const write = (el: HTMLElement | null, text: string) => {
      if (el && el.textContent !== text) el.textContent = text;
    };
    const attr = (name: string, n: number) => {
      const root = rootRef.current;
      const v = String(Math.round(Number.isFinite(n) ? n : 0));
      if (root && root.getAttribute(name) !== v) root.setAttribute(name, v);
    };
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!telemetry.primed && !seen) return;
      seen = true;
      write(speedRef.current, formatKmh(telemetry.speedKmh));
      write(altRef.current, formatMetres(telemetry.altitudeM));
      write(walkedRef.current, formatDistance(telemetry.distanceM));
      attr('data-speed-kmh', telemetry.speedKmh);
      attr('data-alt-m', telemetry.altitudeM);
      attr('data-distance-m', telemetry.distanceM);
      attr('data-x-m', telemetry.xM);
      attr('data-z-m', telemetry.zM);
      const box = rulerRef.current;
      if (box) {
        const ruler = rulerFor(telemetry.groundMetresPerPx);
        if (!ruler) {
          if (!box.hidden) box.hidden = true;
        } else {
          if (box.hidden) box.hidden = false;
          const bar = rulerBarRef.current;
          const width = `${ruler.px}px`;
          if (bar && bar.style.width !== width) bar.style.width = width;
          write(rulerLabelRef.current, ruler.label);
        }
      }
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [telemetry]);

  // The Analyze panel: Escape or a press outside closes it; Escape returns focus to Analyze.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      analyzeRef.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (analyzeBox.current && !analyzeBox.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [menuOpen]);

  // Focus on swap: a mode change that removed the focused control moves focus to the shown mode's button.
  useLayoutEffect(() => {
    if (!hadFocus.current || typeof document === 'undefined') return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const target = viewMode === 'flyover' ? flyRef.current : viewMode === 'street' ? walkRef.current : analyzeRef.current;
    target?.focus();
  }, [viewMode]);

  const choose = (mode: ViewMode) => {
    setMenuOpen(false);
    onViewMode(mode);
    analyzeRef.current?.focus();
  };

  const ruler = (
    <div ref={rulerRef} data-testid="world-ruler" hidden className={`${panelClass} flex items-center gap-2 rounded-full px-3 py-1.5`}>
      {/* The label first, at a fixed width, so a new bar width never moves it (no layout shift). */}
      <span ref={rulerLabelRef} className="min-w-[48px] text-right text-[12px] tabular-nums text-text-2" />
      <span ref={rulerBarRef} data-ruler-bar aria-hidden="true" className="block h-[6px] border-x-2 border-b-2 border-text-2" />
    </div>
  );

  const tourLabel = reducedMotion && !tourStarted && !autoTour
    ? 'Start the tour'
    : phone
      ? (autoTour ? 'Pause' : 'Resume')
      : 'Auto tour';

  return (
    <div
      ref={rootRef}
      data-testid="world-hud"
      className="bp-dark pointer-events-none absolute inset-0 z-30"
      onFocus={() => { hadFocus.current = true; }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && !rootRef.current?.contains(next)) hadFocus.current = false;
      }}
    >
      {/* On phones the column starts below the title's wrapped caption line, with at least 8 px between them. */}
      <div className={`pointer-events-auto absolute left-3 ${phone ? 'top-[92px]' : 'top-16'} flex w-[220px] max-w-[calc(100vw-24px)] flex-col gap-2`}>
        <div role="group" aria-label="View" className="flex flex-col gap-2">
          <button
            ref={flyRef}
            type="button"
            aria-pressed={isFly}
            onClick={() => onViewMode('flyover')}
            className={modeButton(isFly)}
          >
            <Plane size={18} strokeWidth={1.75} aria-hidden="true" />
            Fly
          </button>
          {!phone && (
            <button
              ref={walkRef}
              type="button"
              aria-pressed={isWalk}
              onClick={() => onViewMode('street')}
              className={modeButton(isWalk)}
            >
              <Footprints size={18} strokeWidth={1.75} aria-hidden="true" />
              Walk
            </button>
          )}
          <div ref={analyzeBox} className="relative">
            <button
              ref={analyzeRef}
              type="button"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((o) => !o)}
              className={`${modeButton(analyzeRow !== null)} w-full`}
            >
              <ScanSearch size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">{analyzeRow ? `Analyze · ${analyzeRow.label}` : 'Analyze'}</span>
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className="ml-auto" />
            </button>
            {/* The rows open over the HUD, out of the column's flow, so the readouts below never move. */}
            {menuOpen && (
              <div
                id={menuId}
                role="group"
                aria-label="Analyze"
                data-testid="world-analyze-menu"
                className="absolute left-0 top-full z-10 mt-2 w-full rounded-[16px] border border-line-2 bg-bg-secondary p-1.5"
              >
                {ANALYZE_ROWS.map((row) => (
                  <button
                    key={row.mode}
                    type="button"
                    aria-pressed={viewMode === row.mode}
                    onClick={() => choose(row.mode)}
                    className={`${menuRow} min-w-[44px] ${focusRing} ${viewMode === row.mode ? 'bg-surface-3 font-semibold' : ''}`}
                  >
                    {row.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {(isFly || isWalk) && (
          <div className={`${panelClass} flex flex-col gap-2 p-3`} data-testid="world-readouts">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
              <div>
                <dt className="text-text-3">Speed</dt>
                <dd className="font-mono text-[15px] text-text-1"><span ref={speedRef} data-readout="speed">0 km/h</span></dd>
              </div>
              {isFly ? (
                <div>
                  <dt className="text-text-3">Altitude</dt>
                  <dd className="font-mono text-[15px] text-text-1"><span ref={altRef} data-readout="altitude">0 m</span></dd>
                </div>
              ) : (
                <div>
                  <dt className="text-text-3">Walked</dt>
                  <dd className="font-mono text-[15px] text-text-1"><span ref={walkedRef} data-readout="walked">0 m</span></dd>
                </div>
              )}
            </dl>

            {isFly && (
              <>
                <button
                  type="button"
                  aria-pressed={autoTour}
                  onClick={() => onAutoTour(!autoTour)}
                  className={`${hudButton} ${autoTour ? pressedClass : restingClass}`}
                >
                  {autoTour ? <Pause size={16} strokeWidth={1.75} aria-hidden="true" /> : <Play size={16} strokeWidth={1.75} aria-hidden="true" />}
                  {tourLabel}
                </button>
                <label htmlFor={speedId} className="text-[13px] text-text-2">
                  {showTourSpeed ? 'Tour speed' : 'Flying speed'} · {speedValue} km/h
                </label>
                <input
                  id={speedId}
                  type="range"
                  min={SPEED_MIN_KMH}
                  max={SPEED_MAX_KMH}
                  step={SPEED_STEP_KMH}
                  value={speedValue}
                  aria-valuetext={kmhWords(speedValue)}
                  onChange={(e) => onSpeed(showTourSpeed ? 'tour' : 'cruise', Number(e.target.value))}
                  className={`min-h-[44px] min-w-[44px] w-full cursor-pointer accent-text-2 ${focusRing}`}
                />
              </>
            )}

            {isWalk && !phone && (
              <button
                type="button"
                aria-pressed={runLocked}
                onClick={() => onRunLocked(!runLocked)}
                className={`${hudButton} ${runLocked ? pressedClass : restingClass}`}
              >
                <Zap size={16} strokeWidth={1.75} aria-hidden="true" />
                Run
              </button>
            )}
          </div>
        )}

        {/* The chip and the ruler live in the HUD's own column, clear of the hover card and the reaction bar at
            bottom-left. While the tour is on, the ruler's row is reserved from the first frame, so nothing moves
            when it appears. */}
        <span data-testid="world-scale-chip" className={`${panelClass} self-start rounded-full px-3 py-1.5 text-[12px] text-text-2`}>
          {worldScaleChip(parcels)}
        </span>
        {isFly && autoTour && <div data-testid="world-ruler-slot" className="h-[32px] self-start">{ruler}</div>}
      </div>

      {!phone && ((isFly && !autoTour) || isWalk) && (
        <p
          data-testid="world-hints"
          className={`${panelClass} absolute bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-2 text-[12px] text-text-3`}
        >
          {isFly
            ? 'W A S D move · Space up · Ctrl down · Shift faster · drag to look'
            : 'W A S D walk · Shift run · drag to look'}
        </p>
      )}
    </div>
  );
}
