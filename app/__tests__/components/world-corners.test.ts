/**
 * The world view's corners: every control keeps its own corner on a phone, the full-screen button shows only where
 * the browser offers full screen, and the hidden block panel leaves the Tab order. Source is read here (no layout in
 * jsdom); the browser probe measures the boxes.
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

/** The title block: from its comment up to the top-right corner (the corner's own classes do not count). */
function titleSource(): string {
  const t0 = PV.indexOf('{/* Title overlay */}');
  expect(t0).toBeGreaterThan(-1);
  const t1 = PV.indexOf('{/* Top-right corner */}', t0);
  expect(t1).toBeGreaterThan(-1);
  return PV.slice(t0, t1);
}

describe('the corners of the world view', () => {
  it('the pill shows the live count, compact on phones, in tokens', () => {
    const src = fnSource('VisitorOverlay');
    for (const s of ['phone: boolean', 'data-world-pill', 'pointer-events-auto', 'bg-success', 'sr-only', 'viewing']) {
      expect(src).toContain(s);
    }
    for (const s of ['absolute', 'bp-dark', 'style=', '<style>', 'rgba(']) expect(src).not.toContain(s);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(PV).toContain('<VisitorOverlay count={realtimeViewerCount} phone={phone} />');
  });

  it('the title starts at left-3 on phones and left-16 elsewhere', () => {
    const title = titleSource();
    expect(title).toContain("${phone ? 'left-3' : 'left-16'}");
    expect(title).toContain('data-world-title');
    expect(title).not.toContain('✨');
  });

  it('the corner holds the pill, then full screen only where the browser offers it', () => {
    expect(PV).toContain(
      '<div data-world-corner className="bp-dark pointer-events-none absolute top-3 right-3 z-20 flex flex-col items-end gap-2">',
    );
    expect(PV).toContain('const [canFullscreen] = useState(() => document.fullscreenEnabled === true);');
    const c = PV.indexOf('data-world-corner');
    const v = PV.indexOf('<VisitorOverlay count=', c);
    const f = PV.indexOf('{/* Fullscreen toggle */}', v);
    const h = PV.indexOf('{/* Hover tooltip */}', f);
    expect(c).toBeGreaterThan(-1);
    expect(v).toBeGreaterThan(c);
    expect(f).toBeGreaterThan(v);
    expect(h).toBeGreaterThan(f);
    const fs2 = PV.slice(f, h);
    for (const s of [
      '{canFullscreen && (',
      'data-world-fs',
      'aria-label="Full screen"',
      'aria-pressed={isFullscreen}',
      'pointer-events-auto',
      'min-h-[44px] min-w-[44px]',
      "'Exit fullscreen (Esc)'",
      "'Fullscreen immersive mode'",
    ]) {
      expect(fs2).toContain(s);
    }
    for (const s of ['absolute', 'bp-dark', 'style=', '⛶']) expect(fs2).not.toContain(s);
  });

  it('full screen leaves with a failed scene', () => {
    expect(PV).toContain("if (scene === 'none' && document.fullscreenElement) void document.exitFullscreen?.()");
  });

  it('the panel tab sits under the corner on desktop and bottom right on phones', () => {
    const s = PV.slice(PV.indexOf('{/* ═══ Panel Toggle (when hidden) ═══ */}'), PV.indexOf('{/* ═══ Right Panel ═══ */}'));
    for (const t of [
      'aria-label="Show block panel"',
      "${phone ? 'bottom-4' : 'top-[108px]'}",
      'right-0',
      'min-h-[48px] min-w-[44px]',
      'PanelRightOpen',
      'group/tab',
      'group-hover/tab:text-text-1',
      'env(safe-area-inset-bottom',
      'ref={panelTabRef}',
    ]) {
      expect(s).toContain(t);
    }
    for (const t of ['top-16', '◀', '#f7931a']) expect(s).not.toContain(t);
    const k = s.indexOf('className={`');
    expect(k).toBeGreaterThan(-1);
    const cls = s.slice(k, s.indexOf('`}', k));
    expect(cls).not.toContain('text-text-');
  });

  it('the hidden panel is inert and focus follows it', () => {
    for (const s of [
      "inert={panelSize === 'hidden'}",
      'ref={panelRef}',
      'ref={panelHideRef}',
      'aria-label="Hide block panel"',
      'panelTabRef.current?.focus()',
      'panelHideRef.current?.focus()',
      'if (lastPanel.current === panelSize) return;',
    ]) {
      expect(PV).toContain(s);
    }
    expect(PV).not.toContain('panelSeen');
  });

  it('the parcel number has a label and a focus ring', () => {
    const at = PV.indexOf('type="number" value={parcelNavIndex}');
    expect(at).toBeGreaterThan(-1);
    const el = PV.slice(PV.lastIndexOf('<input', at), PV.indexOf('/>', at));
    expect(el).toContain('aria-label="Parcel number"');
    expect(el).toContain('${worldRing}');
    expect(el).not.toContain('outline-none');
  });

  it('on phones the reaction bar sits bottom right above the back link and the home bar, with 44 px buttons', () => {
    const src = fnSource('EmojiReactionBar');
    for (const s of [
      'phone: boolean',
      'data-world-reactions',
      "bottom: phone ? 'calc(72px + env(safe-area-inset-bottom, 0px))' : 36,",
      '...(phone ? { right: 16 } : { left: 16 }),',
      'minWidth: phone ? 44 : undefined',
      'minHeight: phone ? 44 : undefined',
    ]) {
      expect(src).toContain(s);
    }
    expect(PV).toContain('<EmojiReactionBar onReact={handleEmojiReact} phone={phone} />');
  });

  it("item 4: the title's look uses tokens", () => {
    const title = titleSource();
    for (const s of ['text-text-1', 'text-text-2', 'text-text-3', 'border-line-2', 'bg-surface-3']) expect(title).toContain(s);
    for (const s of ['style=', 'animate-pulse', '#c8a050', 'bp-dark']) expect(title).not.toContain(s);
  });
});
