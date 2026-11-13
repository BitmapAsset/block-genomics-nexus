/**
 * The block panel as a visitor meets it: an opaque panel on the site's tokens, a phone sheet that ends above the back
 * link and keeps a floor on a phone on its side, 44 px controls with the shared ring, and only what a visitor without a
 * wallet can read or use. Source is read here (no layout in jsdom); the browser probe measures the boxes.
 */
import fs from 'fs';
import path from 'path';

const PV = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');

const between = (a: string, b: string) => { const i = PV.indexOf(a); const j = PV.indexOf(b, i); expect(i).toBeGreaterThan(-1); expect(j).toBeGreaterThan(i); return PV.slice(i, j); };
const PICT = /\p{Extended_Pictographic}/u; const LIT = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

describe('the block panel', () => {
  it('the panel root is opaque, on tokens, and leaves the flow below md when hidden', () => {
    const r = between('{/* ═══ Right Panel ═══ */}', '{/* Panel resize controls */}');
    for (const s of ['bp-dark', 'bg-bg-primary', '${PANEL_SHEET_BELOW_MD}', '${PANEL_EDGE_MD}', "'max-md:hidden'",
      'flex-shrink-0', 'ref={panelRef}', "inert={panelSize === 'hidden'}", 'data-world-panel']) {
      expect(r).toContain(s);
    }
    expect(r).not.toContain('style=');
    expect(r).not.toMatch(LIT);
  });

  it("the sheet ends above the back link's row and keeps a floor on a phone on its side", () => {
    const s = between("const PANEL_SHEET_BELOW_MD = '", "';");
    for (const c of ['max-md:absolute', 'max-md:inset-x-0', 'max-md:bottom-[calc(72px+env(safe-area-inset-bottom))]',
      'max-md:z-30', 'max-md:!w-full', 'max-md:h-[calc(45vh-72px)]', 'max-md:landscape:min-h-[min(224px,calc(100%-136px))]',
      'max-md:rounded-t-2xl', 'max-md:border-t', 'max-md:border-line-2']) {
      expect(s).toContain(c);
    }
    for (const c of ['max-md:bottom-0', 'max-md:h-[45vh]', '100dvh']) expect(s).not.toContain(c);
    const e = between("const PANEL_EDGE_MD = '", "';");
    expect(e).toMatch(/md:border-l[ ']/);
    expect(e).toContain('md:border-line-2');
  });

  it('the header has a 44 px hide button with the shared ring and named size buttons from md up', () => {
    const h = between('{/* Panel resize controls */}', '{/* Tabs */}');
    for (const s of ['data-world-panel-head', 'aria-pressed={panelSize === s.size}', 'aria-label={`Panel width: ${s.name}`}',
      'title="Hide panel"', 'aria-label="Hide block panel"', 'ref={panelHideRef}', '<X size={18}']) {
      expect(h).toContain(s);
    }
    expect(h).toMatch(/className="[^"]*\bhidden\b[^"]*\bmd:flex\b[^"]*"/);
    expect(h.split('min-h-[44px] min-w-[44px]').length).toBe(3);
    expect(h.split('${worldRing}').length).toBe(3);
    for (const s of ['style=', 'min-h-[36px]', 'w-6 h-6', 'w-7 h-7', '▶', '▐', '◧']) expect(h).not.toContain(s);
    expect(h).not.toMatch(LIT);
  });

  it('the tabs are on tokens, 44 px, with a pressed state', () => {
    const t = between('{/* Tabs */}', "{rightTab === 'properties' ? (");
    for (const s of ['border-b border-line-2', 'aria-pressed={rightTab === tab.key}', 'min-h-[44px]', 'border-text-1 text-text-1',
      '${worldRing}']) {
      expect(t).toContain(s);
    }
    expect(t).not.toContain('style=');
    expect(t).not.toContain('#f7931a');
  });

  it('the owner row claims no check, and the fact rows print only what is known', () => {
    for (const s of ['blockOwner.verified &&', 'bp.verified ?? true', 'value={parcels.length.toLocaleString()}',
      "'\u{1F7E2} Live'", '`\u{1F441} ${realtimeViewerCount}`']) {
      expect(PV).not.toContain(s);
    }
    expect(PV).not.toMatch(/verified:\s*true\b/);
    for (const s of ['verified: bp.verified ?? false',
      "value={dataSource === 'real' && realBlock ? realBlock.txCount.toLocaleString() : NOT_FETCHED}",
      "(realBlock?.estimated ? 'Estimated' : 'Live')",
      "dataSource === 'loading' ? 'Loading…' : 'Generated sample'",
      '{realtimeViewerCount > 0 && <PropRow label="VISITORS" value={realtimeViewerCount.toLocaleString()} />}',
      'value={parcelCustomizations.size.toLocaleString()}']) {
      expect(PV).toContain(s);
    }
  });

  it("the estimated layout's button uses the shared secondary style, and no purchase is offered", () => {
    const k = PV.indexOf('onClick={retryBlockData}');
    expect(k).toBeGreaterThan(-1);
    const b = PV.slice(PV.lastIndexOf('<button', k), PV.indexOf('</button>', k));
    for (const s of ['${secondaryButton}', 'w-full', 'font-sans', '${worldRing}', 'Load real transaction data']) expect(b).toContain(s);
    expect(b).not.toContain('#f7931a');
    expect(b).not.toContain('⬇');
    expect(PV).toContain("import { secondaryButton } from '@/components/ui/button';");
    expect(PV).not.toContain('Get Tier 3 Access');
    expect(PV).not.toContain('setShowGetAccess(true)');
  });

  it("a visitor without a wallet gets one line and a way to connect instead of the holder's tools", () => {
    const v = PV.indexOf("{ownerLock === 'connect' ? (");
    const n = PV.indexOf(') : (<>', v);
    const o = PV.indexOf('Owner Actions', n);
    const p = PV.indexOf('{/* ─── Prepare for Transfer ─── */}', o);
    const e = PV.indexOf('</>)}', p);
    const l = PV.indexOf('{/* ─── Land Customization Panel ─── */}', p);
    expect(v).toBeGreaterThan(-1);
    expect(n).toBeGreaterThan(v);
    expect(o).toBeGreaterThan(n);
    expect(p).toBeGreaterThan(o);
    expect(e).toBeGreaterThan(p);
    expect(l).toBeGreaterThan(e);
    const note = PV.slice(v, n);
    for (const s of ['data-world-visitor-note', 'Owner tools open once the holder connects a wallet.', 'onClick={openWalletModal}',
      'Connect a wallet', '${secondaryButton}', 'w-full', 'font-sans', '${worldRing}']) {
      expect(note).toContain(s);
    }
    expect(note).not.toContain('style=');
    expect(note).not.toMatch(PICT);
    const m = PV.indexOf("console.log('[Estate] Manage:'");
    const g = PV.lastIndexOf("{ownerLock !== 'connect' && (", m);
    expect(g).toBeGreaterThan(-1);
    expect(m - g).toBeLessThan(120);
  });

  it('on a phone the parcel card stays away while the panel is open', () => {
    expect(PV).toContain("{hoveredParcel && viewMode !== 'dna' && !(phone && panelSize !== 'hidden') && (");
  });

  it('item 4: the count shows only when presence counts someone', () => {
    expect(PV).toContain('{realtimeViewerCount > 0 && <VisitorOverlay count={realtimeViewerCount} phone={phone} />}');
  });

  it("item 5: the scene's floating labels sit under the view's controls", () => {
    const tags = PV.match(/<Html\b[^>]*>/g) || [];
    expect(tags).toHaveLength(8);
    const labels = tags.filter((t) => !t.includes('fullscreen'));
    expect(labels).toHaveLength(7);
    for (const t of labels) expect(t).toContain('zIndexRange={[10, 0]}');
    const pinned = tags.filter((t) => t.includes('fullscreen'));
    expect(pinned).toHaveLength(1);
    expect(pinned[0]).not.toContain('zIndexRange');
  });
});
